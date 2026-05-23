import { Router, type IRouter } from "express";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";
import { db, usersTable, usageRecordsTable, paddleEventsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getOrCreateUser } from "../lib/usage.js";
import { DAILY_HARD_CAP_CENTS } from "../lib/plans.js";
import { logger } from "../lib/logger.js";
import { IS_PROXY } from "../lib/server-mode.js";
import { setupProductsAndPlans, isPaypalConfigured } from "../lib/paypal.js";

const router: IRouter = Router();

const HOSTED_URL = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
const protect = IS_PROXY ? [] : [requireAuth];

function monthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStartUTC(offsetDays = 0): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offsetDays),
  );
}

// In proxy mode, forward to the hosted server which has the real DB.
async function proxyToHosted(
  req: import("express").Request,
  res: import("express").Response,
  path: string,
): Promise<void> {
  try {
    // In IS_PROXY (Electron) mode, the renderer authenticates via Clerk
    // *cookies* (the local clerk passthrough mirrors the hosted Clerk
    // session into 127.0.0.1's cookie jar). Forwarding only the
    // Authorization header sends an anonymous request upstream — hosted
    // requireAuth then either 401s or, for handlers that dereference
    // userId, 500s. Forward the Cookie header (and Authorization if
    // present) so the hosted server sees the same authenticated session
    // the renderer has.
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;
    const upstream = await fetch(`${HOSTED_URL}${path}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(502).json({ error: `Failed to reach admin service: ${msg}` });
  }
}

router.get("/admin/usage", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/admin/usage");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const me = await getOrCreateUser(userId, email);
    if (!me.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const monthSince = monthStartUTC();
    const todaySince = dayStartUTC(0);
    const series14Since = dayStartUTC(13); // 14 days inclusive
    const fuseMicrocents = DAILY_HARD_CAP_CENTS * 10_000;

    // 14-day cost+activity series, grouped by UTC day.
    const dailyRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${usageRecordsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        costMicrocents: sql<string>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
        chats: sql<number>`sum(case when ${usageRecordsTable.kind} = 'chat' then 1 else 0 end)::int`,
        watchSeconds: sql<number>`coalesce(sum(${usageRecordsTable.watchSeconds}),0)::int`,
        distinctUsers: sql<number>`count(distinct ${usageRecordsTable.userId})::int`,
      })
      .from(usageRecordsTable)
      .where(gte(usageRecordsTable.createdAt, series14Since))
      .groupBy(sql`date_trunc('day', ${usageRecordsTable.createdAt} at time zone 'UTC')`)
      .orderBy(sql`date_trunc('day', ${usageRecordsTable.createdAt} at time zone 'UTC')`);

    // Per (day, user) costs over the same 14 days, so we can count for each
    // day how many users individually crossed the $5 per-user fuse — the
    // global daily-cost total is a *different* quantity than the per-user
    // cap and must not be conflated when coloring the chart.
    const perUserPerDayRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${usageRecordsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        userId: usageRecordsTable.userId,
        cost: sql<string>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
      })
      .from(usageRecordsTable)
      .where(gte(usageRecordsTable.createdAt, series14Since))
      .groupBy(
        sql`date_trunc('day', ${usageRecordsTable.createdAt} at time zone 'UTC')`,
        usageRecordsTable.userId,
      );
    const overFuseByDay = new Map<string, number>();
    for (const r of perUserPerDayRows) {
      if (Number(r.cost) >= fuseMicrocents) {
        overFuseByDay.set(r.day, (overFuseByDay.get(r.day) ?? 0) + 1);
      }
    }

    // Pad gaps so the client always gets exactly 14 entries.
    const seriesMap = new Map(dailyRows.map((r) => [r.day, r]));
    const daily: Array<{
      day: string;
      costMicrocents: number;
      chats: number;
      watchSeconds: number;
      distinctUsers: number;
      usersOverFuse: number;
    }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = dayStartUTC(i);
      const key = d.toISOString().slice(0, 10);
      const found = seriesMap.get(key);
      daily.push({
        day: key,
        costMicrocents: Number(found?.costMicrocents ?? 0),
        chats: Number(found?.chats ?? 0),
        watchSeconds: Number(found?.watchSeconds ?? 0),
        distinctUsers: Number(found?.distinctUsers ?? 0),
        usersOverFuse: overFuseByDay.get(key) ?? 0,
      });
    }

    // Today aggregates + users-over-fuse count.
    const todayPerUser = await db
      .select({
        userId: usageRecordsTable.userId,
        cost: sql<string>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
      })
      .from(usageRecordsTable)
      .where(gte(usageRecordsTable.createdAt, todaySince))
      .groupBy(usageRecordsTable.userId);

    let usersOverFuseToday = 0;
    let totalCostTodayMicrocents = 0;
    const todayCostByUser = new Map<string, number>();
    for (const r of todayPerUser) {
      const c = Number(r.cost);
      totalCostTodayMicrocents += c;
      todayCostByUser.set(r.userId, c);
      if (c >= fuseMicrocents) usersOverFuseToday += 1;
    }

    // Per-user month leaderboard: only users with any usage this month.
    // Ordered by cost desc, capped at 100.
    const monthPerUser = await db
      .select({
        userId: usageRecordsTable.userId,
        chats: sql<number>`sum(case when ${usageRecordsTable.kind} = 'chat' then 1 else 0 end)::int`,
        watchSeconds: sql<number>`coalesce(sum(${usageRecordsTable.watchSeconds}),0)::int`,
        cost: sql<string>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
      })
      .from(usageRecordsTable)
      .where(gte(usageRecordsTable.createdAt, monthSince))
      .groupBy(usageRecordsTable.userId)
      .orderBy(desc(sql`coalesce(sum(${usageRecordsTable.costMicrocents}),0)`))
      .limit(100);

    // Resolve user metadata (email/plan/isAdmin) for the leaderboard.
    const ids = monthPerUser.map((r) => r.userId);
    // NOTE: previously used `sql\`${usersTable.id} = ANY(${ids})\``, which
    // made Drizzle bind the JS array as a single text param. node-postgres
    // then tried to parse that string as a Postgres array literal and
    // failed with `malformed array literal: "user_..."`, 500ing every
    // call to /admin/usage. `inArray` expands the array into one bound
    // parameter per element, which is what we want here.
    const userRows = ids.length
      ? await db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            plan: usersTable.plan,
            isAdmin: usersTable.isAdmin,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, ids))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const perUser = monthPerUser.map((r) => {
      const u = userById.get(r.userId);
      return {
        userId: r.userId,
        email: u?.email ?? null,
        plan: u?.plan ?? "free",
        isAdmin: u?.isAdmin ?? false,
        monthChats: Number(r.chats),
        monthWatchSeconds: Number(r.watchSeconds),
        monthCostMicrocents: Number(r.cost),
        todayCostMicrocents: todayCostByUser.get(r.userId) ?? 0,
      };
    });

    // Top-line month totals (derived from leaderboard sum is wrong if >100
    // users exist; query separately so we report the true global total).
    const [monthTotalsRow] = await db
      .select({
        cost: sql<string>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
        chats: sql<number>`sum(case when ${usageRecordsTable.kind} = 'chat' then 1 else 0 end)::int`,
        watchSeconds: sql<number>`coalesce(sum(${usageRecordsTable.watchSeconds}),0)::int`,
        distinctUsers: sql<number>`count(distinct ${usageRecordsTable.userId})::int`,
      })
      .from(usageRecordsTable)
      .where(gte(usageRecordsTable.createdAt, monthSince));

    // Subscriber breakdown (independent of recent activity).
    const subscriberRows = await db
      .select({
        plan: usersTable.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(usersTable)
      .groupBy(usersTable.plan);
    const subscribers = { free: 0, pro: 0, pro_plus: 0, elite: 0 };
    for (const r of subscriberRows) {
      if (
        r.plan === "free" ||
        r.plan === "pro" ||
        r.plan === "pro_plus" ||
        r.plan === "elite"
      ) {
        subscribers[r.plan] = Number(r.count);
      }
    }

    res.json({
      generatedAt: new Date().toISOString(),
      dailyHardCapCents: DAILY_HARD_CAP_CENTS,
      today: {
        totalCostMicrocents: totalCostTodayMicrocents,
        distinctUsers: todayPerUser.length,
        usersOverFuse: usersOverFuseToday,
      },
      month: {
        totalCostMicrocents: Number(monthTotalsRow?.cost ?? 0),
        chats: Number(monthTotalsRow?.chats ?? 0),
        watchSeconds: Number(monthTotalsRow?.watchSeconds ?? 0),
        distinctUsers: Number(monthTotalsRow?.distinctUsers ?? 0),
        periodStart: monthSince.toISOString(),
      },
      subscribers,
      daily,
      perUser,
    });
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to build admin usage snapshot");
    res.status(500).json({ error: "Failed to load admin usage" });
  }
});

router.get("/admin/webhook-health", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/admin/webhook-health");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const me = await getOrCreateUser(userId, email);
    if (!me.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    const recent = await db
      .select({
        id: paddleEventsTable.id,
        eventType: paddleEventsTable.eventType,
        eventId: paddleEventsTable.eventId,
        subscriptionId: paddleEventsTable.subscriptionId,
        userId: paddleEventsTable.userId,
        status: paddleEventsTable.status,
        httpStatus: paddleEventsTable.httpStatus,
        error: paddleEventsTable.error,
        createdAt: paddleEventsTable.createdAt,
      })
      .from(paddleEventsTable)
      .orderBy(desc(paddleEventsTable.createdAt))
      .limit(25);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const counts24h = await db
      .select({
        status: paddleEventsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(paddleEventsTable)
      .where(gte(paddleEventsTable.createdAt, since24h))
      .groupBy(paddleEventsTable.status);

    const totals = { received: 0, processed: 0, rejected: 0, failed: 0 };
    for (const r of counts24h) {
      if (r.status in totals) totals[r.status as keyof typeof totals] = Number(r.count);
    }

    const [lastSuccess] = await db
      .select({ createdAt: paddleEventsTable.createdAt })
      .from(paddleEventsTable)
      .where(eq(paddleEventsTable.status, "processed"))
      .orderBy(desc(paddleEventsTable.createdAt))
      .limit(1);

    const [lastFailure] = await db
      .select({ createdAt: paddleEventsTable.createdAt, error: paddleEventsTable.error })
      .from(paddleEventsTable)
      .where(sql`${paddleEventsTable.status} in ('failed','rejected')`)
      .orderBy(desc(paddleEventsTable.createdAt))
      .limit(1);

    res.json({
      generatedAt: new Date().toISOString(),
      counts24h: totals,
      lastSuccessAt: lastSuccess?.createdAt?.toISOString() ?? null,
      lastFailure: lastFailure
        ? {
            at: lastFailure.createdAt.toISOString(),
            error: lastFailure.error,
          }
        : null,
      recent: recent.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to build webhook health snapshot");
    res.status(500).json({ error: "Failed to load webhook health" });
  }
});

// One-shot PayPal setup. Admin hits this once after providing
// PAYPAL_CLIENT_ID/SECRET, gets back the product + 3 plan IDs, then
// pastes them into Replit Secrets as PAYPAL_PRO_PLAN_ID etc and
// restarts. We don't store the IDs server-side — they live in secrets
// alongside the Paddle price IDs for symmetry.
router.post("/admin/paypal/setup-plans", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/admin/paypal/setup-plans");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const me = await getOrCreateUser(userId, email);
    if (!me.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    if (!isPaypalConfigured()) {
      res.status(400).json({ error: "PayPal credentials not configured" });
      return;
    }
    const result = await setupProductsAndPlans();
    logger.info({ result }, "PayPal product + plans created");
    res.json({
      ...result,
      next: "Paste these into Replit Secrets as PAYPAL_PRO_PLAN_ID, PAYPAL_PRO_PLUS_PLAN_ID, PAYPAL_ELITE_PLAN_ID, then restart the server.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error({ err: e, userId }, "PayPal setup failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
