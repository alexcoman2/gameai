import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  usageRecordsTable,
  overageChargesTable,
  gameProfilesTable,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getOrCreateUser } from "../lib/usage.js";
import { getPaddle } from "../lib/paddle.js";
import { cancelSubscription as paypalCancelSubscription } from "../lib/paypal.js";
import { logger } from "../lib/logger.js";
import { IS_PROXY } from "../lib/server-mode.js";

const router: IRouter = Router();

const HOSTED_URL = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
const protect = IS_PROXY ? [] : [requireAuth];

async function proxyToHosted(req: Request, res: Response, path: string): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const init: RequestInit = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body ?? {});
    }
    const upstream = await fetch(`${HOSTED_URL}${path}`, init);
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    res.status(502).json({ error: `Failed to reach me service: ${msg}` });
  }
}

// Minimal "who am I" — gives the frontend just enough to conditionally
// render admin-only UI without shipping the admin email list in the bundle.
router.get("/me", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/me");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const user = await getOrCreateUser(userId, email);
    res.json({
      id: user.id,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
    });
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to load /me");
    res.status(500).json({ error: "Failed to load user" });
  }
});

// Self-serve account deletion. GDPR/CCPA-friendly: best-effort cancels any
// active paid subscription with the relevant processor, wipes the user's
// rows from our database (usage records, overage charges, game profiles,
// users), and then deletes the Clerk user so the email can be re-used and
// no auth identity remains. Returns 200 on success; the client signs out
// immediately afterwards.
router.delete("/me", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/me");
    return;
  }
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const user = rows[0];

    // Best-effort cancel of any active subscription — we still proceed
    // with deletion even if cancel fails, but log loudly so we can
    // reconcile manually. (A leftover active sub would keep billing
    // a non-existent account.)
    if (user?.billingSubscriptionId) {
      try {
        if (user.billingProvider === "paypal") {
          await paypalCancelSubscription(
            user.billingSubscriptionId,
            "User deleted their Unstuck account",
          );
        } else if (user.billingProvider === "paddle") {
          const paddle = getPaddle();
          await paddle.subscriptions.cancel(user.billingSubscriptionId, {
            effectiveFrom: "immediately",
          });
        }
      } catch (e) {
        logger.error(
          { err: e, userId, provider: user.billingProvider, subId: user.billingSubscriptionId },
          "Failed to cancel subscription during account deletion — proceeding with delete anyway",
        );
      }
    }

    // Delete the Clerk identity FIRST. This is the only step that, if
    // it fails silently, would leave the user able to sign back in and
    // (via getOrCreateUser) immediately re-materialize their row — a
    // privacy-compliance break. Failing here is the only correct
    // failure mode: nothing else has been wiped yet, so the user's
    // data is still intact and they can retry.
    try {
      await clerkClient.users.deleteUser(userId);
    } catch (e) {
      logger.error({ err: e, userId }, "Clerk deleteUser failed — aborting account deletion");
      res.status(502).json({
        error:
          "We couldn't fully delete your account right now. Nothing was removed — please try again or email support.",
      });
      return;
    }

    // Clerk is gone — from the user's perspective they are now deleted
    // (no auth identity, can't sign in). Best-effort wipe DB rows. If
    // any of these fail we log loudly for manual cleanup but still
    // return success: the identity is irreversibly gone and the
    // remaining rows are orphans, not active user data.
    try {
      await db.delete(usageRecordsTable).where(eq(usageRecordsTable.userId, userId));
      await db.delete(overageChargesTable).where(eq(overageChargesTable.userId, userId));
      await db.delete(gameProfilesTable).where(eq(gameProfilesTable.userId, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    } catch (e) {
      logger.error(
        { err: e, userId },
        "DB wipe failed after Clerk deletion — orphan rows need manual cleanup",
      );
      // Intentionally still return ok — identity is deleted.
    }

    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e, userId }, "Account deletion failed");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
