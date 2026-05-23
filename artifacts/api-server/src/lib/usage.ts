import { db, usersTable, usageRecordsTable, type User, type PlanTier } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { PLAN_CONFIGS, DAILY_HARD_CAP_CENTS } from "./plans.js";

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;
  const needle = email.trim().toLowerCase();
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

export async function getOrCreateUser(userId: string, email?: string | null): Promise<User> {
  const shouldBeAdmin = isAdminEmail(email);
  // Race-safe upsert — concurrent first-time requests for a new user could
  // otherwise both insert and one would crash with unique-constraint error.
  await db
    .insert(usersTable)
    .values({ id: userId, email: email ?? null, plan: "free", isAdmin: shouldBeAdmin })
    .onConflictDoNothing({ target: usersTable.id });
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = rows[0];
  // Reconcile admin status against the env var on every load so adding /
  // removing an email from ADMIN_EMAILS takes effect on the user's next
  // request — no manual SQL, no restart required.
  if (user && user.isAdmin !== shouldBeAdmin) {
    await db
      .update(usersTable)
      .set({ isAdmin: shouldBeAdmin, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    user.isAdmin = shouldBeAdmin;
  }
  return user;
}

type Period = { since: Date; label: string };

function monthStart(): Period {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { since, label: "this month" };
}

function dayStart(): Period {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { since, label: "today" };
}

type UsageTotals = {
  chats: number;
  watchSeconds: number;
  costMicrocents: number;
};

async function totalsFor(userId: string, since: Date): Promise<UsageTotals> {
  const rows = await db
    .select({
      kind: usageRecordsTable.kind,
      countAll: sql<number>`count(*)::int`,
      sumWatch: sql<number>`coalesce(sum(${usageRecordsTable.watchSeconds}),0)::int`,
      sumCost: sql<number>`coalesce(sum(${usageRecordsTable.costMicrocents}),0)::bigint`,
    })
    .from(usageRecordsTable)
    .where(and(eq(usageRecordsTable.userId, userId), gte(usageRecordsTable.createdAt, since)))
    .groupBy(usageRecordsTable.kind);

  let chats = 0;
  let watchSeconds = 0;
  let costMicrocents = 0;
  for (const r of rows) {
    if (r.kind === "chat") chats = Number(r.countAll);
    if (r.kind === "watch") watchSeconds = Number(r.sumWatch);
    costMicrocents += Number(r.sumCost);
  }
  return { chats, watchSeconds, costMicrocents };
}

export type CapCheck = {
  allowed: boolean;
  reason?: string;
  plan: PlanTier;
  monthly: UsageTotals;
  daily: UsageTotals;
};

export async function checkUsageCap(
  userId: string,
  kind: "chat" | "watch",
  email?: string | null,
): Promise<CapCheck> {
  const user = await getOrCreateUser(userId, email);
  const plan = user.plan;
  const cfg = PLAN_CONFIGS[plan];
  const month = monthStart();
  const day = dayStart();
  const [monthly, daily] = await Promise.all([
    totalsFor(userId, month.since),
    totalsFor(userId, day.since),
  ]);

  // Admin bypass — owner / staff accounts skip every cap (plan allowance,
  // daily $5 cost fuse, 5x hard ceiling, Watch-Mode gating). Usage is
  // still recorded so we can see real cost in the analytics, but nothing
  // will ever block them.
  if (user.isAdmin) {
    return { allowed: true, plan, monthly, daily };
  }

  if (daily.costMicrocents / 10_000 >= DAILY_HARD_CAP_CENTS) {
    return {
      allowed: false,
      reason: `Daily spend safety cap reached ($${(DAILY_HARD_CAP_CENTS / 100).toFixed(2)}). Resets at 00:00 UTC.`,
      plan,
      monthly,
      daily,
    };
  }

  if (kind === "watch" && !cfg.allowsWatch) {
    return {
      allowed: false,
      reason: `Watch Mode requires a Pro or Elite subscription. Upgrade to enable continuous screen observation.`,
      plan,
      monthly,
      daily,
    };
  }

  // No-overage plans (currently free): hard-block at the allowance.
  if (!cfg.allowsOverage && kind === "chat" && monthly.chats >= cfg.monthlyChats) {
    return {
      allowed: false,
      reason: `Free plan limit reached (${cfg.monthlyChats} chats / month). Upgrade to Pro for more.`,
      plan,
      monthly,
      daily,
    };
  }
  if (!cfg.allowsOverage && kind === "watch" && monthly.watchSeconds >= cfg.monthlyWatchSeconds) {
    const mins = Math.round(cfg.monthlyWatchSeconds / 60);
    return {
      allowed: false,
      reason: `Free Watch trial used (${mins} min / month). Upgrade to Pro for ongoing Watch Mode.`,
      plan,
      monthly,
      daily,
    };
  }

  // Metered plans: allowance + overage, with 5x hard ceiling + daily $5 fuse.
  if (cfg.allowsOverage && kind === "chat") {
    const hardCeiling = cfg.monthlyChats * 5;
    if (monthly.chats >= hardCeiling) {
      return {
        allowed: false,
        reason: `Monthly chat ceiling reached (${hardCeiling}). Contact support if you need more.`,
        plan,
        monthly,
        daily,
      };
    }
  }
  if (cfg.allowsOverage && kind === "watch") {
    const hardCeiling = cfg.monthlyWatchSeconds * 5;
    if (monthly.watchSeconds >= hardCeiling) {
      return {
        allowed: false,
        reason: `Monthly watch ceiling reached. Contact support if you need more.`,
        plan,
        monthly,
        daily,
      };
    }
  }

  return { allowed: true, plan, monthly, daily };
}

export type UsageSnapshot = {
  plan: PlanTier;
  isAdmin: boolean;
  allowance: {
    monthlyChats: number;
    monthlyWatchSeconds: number;
    allowsWatch: boolean;
    allowsOverage: boolean;
    overageChatMicrocents: number;
    overageWatchSecMicrocents: number;
  };
  monthly: UsageTotals;
  daily: UsageTotals;
  dailyHardCapCents: number;
  estimatedOverageMicrocents: {
    chat: number;
    watch: number;
    total: number;
  };
  periodStart: string;
};

export async function getUsageSnapshot(
  userId: string,
  email?: string | null,
): Promise<UsageSnapshot> {
  const user = await getOrCreateUser(userId, email);
  const cfg = PLAN_CONFIGS[user.plan];
  const month = monthStart();
  const day = dayStart();
  const [monthly, daily] = await Promise.all([
    totalsFor(userId, month.since),
    totalsFor(userId, day.since),
  ]);

  const chatOver = cfg.allowsOverage
    ? Math.max(0, monthly.chats - cfg.monthlyChats) * cfg.overageChatMicrocents
    : 0;
  const watchOver = cfg.allowsOverage
    ? Math.max(0, monthly.watchSeconds - cfg.monthlyWatchSeconds) *
      cfg.overageWatchSecMicrocents
    : 0;

  return {
    plan: user.plan,
    isAdmin: user.isAdmin,
    allowance: {
      monthlyChats: cfg.monthlyChats,
      monthlyWatchSeconds: cfg.monthlyWatchSeconds,
      allowsWatch: cfg.allowsWatch,
      allowsOverage: cfg.allowsOverage,
      overageChatMicrocents: cfg.overageChatMicrocents,
      overageWatchSecMicrocents: cfg.overageWatchSecMicrocents,
    },
    monthly,
    daily,
    dailyHardCapCents: DAILY_HARD_CAP_CENTS,
    estimatedOverageMicrocents: {
      chat: chatOver,
      watch: watchOver,
      total: chatOver + watchOver,
    },
    periodStart: month.since.toISOString(),
  };
}

export async function recordUsage(
  userId: string,
  kind: "chat" | "watch",
  costMicrocents: number,
  watchSeconds: number = 0,
): Promise<void> {
  await db.insert(usageRecordsTable).values({
    userId,
    kind,
    costMicrocents,
    watchSeconds,
  });
  await db
    .update(usersTable)
    .set({
      totalLifetimeCostCents: sql`${usersTable.totalLifetimeCostCents} + ${Math.round(costMicrocents / 10_000)}`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
}

export type AnthropicCostInputs = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  model: "opus" | "sonnet" | "haiku";
};

// Per 1M tokens, in USD. Sonnet 4.5 real Anthropic list pricing:
// $3 input / $15 output / $3.75 cache write / $0.30 cache read.
const PRICING = {
  opus: { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  sonnet: { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export function calcAnthropicCostMicrocents(c: AnthropicCostInputs): number {
  const p = PRICING[c.model];
  const dollars =
    ((c.inputTokens ?? 0) * p.in +
      (c.outputTokens ?? 0) * p.out +
      (c.cacheCreationInputTokens ?? 0) * p.cacheWrite +
      (c.cacheReadInputTokens ?? 0) * p.cacheRead) /
    1_000_000;
  return Math.round(dollars * 100 * 10_000);
}
