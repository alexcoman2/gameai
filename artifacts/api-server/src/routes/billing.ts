import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getPaddle, paddleEnvironment, priceIdForTier } from "../lib/paddle.js";
import {
  createSubscription as paypalCreateSubscription,
  getSubscription as paypalGetSubscription,
  cancelSubscription as paypalCancelSubscription,
  planIdForTier as paypalPlanIdForTier,
  PLAN_TO_TIER as PAYPAL_PLAN_TO_TIER,
  paypalEnvironment,
  isPaypalConfigured,
  isActiveSubscriptionStatus as isActivePaypalStatus,
} from "../lib/paypal.js";
import { logger } from "../lib/logger.js";
import { IS_PROXY } from "../lib/server-mode.js";
import { getUsageSnapshot } from "../lib/usage.js";
import type { PlanTier } from "@workspace/db";

const router: IRouter = Router();

// Pull the most informative string out of whatever the Paddle SDK throws.
// Their ApiError carries `code`, `detail`, plus a `.errors` array — none
// of which JSON-stringify cleanly, so error.message ends up as "[object
// Object]" in the log without this helper.
function extractPaddleErrorDetail(e: unknown): string {
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : undefined;
    const detail = typeof obj.detail === "string" ? obj.detail : undefined;
    const message = typeof obj.message === "string" ? obj.message : undefined;
    const status = typeof obj.status === "number" ? obj.status : undefined;
    const errs = Array.isArray(obj.errors)
      ? (obj.errors as Array<Record<string, unknown>>)
          .map((er) => {
            const f = typeof er.field === "string" ? er.field : undefined;
            const m = typeof er.message === "string" ? er.message : undefined;
            return f && m ? `${f}: ${m}` : m ?? "";
          })
          .filter(Boolean)
          .join("; ")
      : "";
    const parts = [
      status ? `HTTP ${status}` : undefined,
      code,
      detail ?? message,
      errs || undefined,
    ].filter(Boolean) as string[];
    if (parts.length) return parts.join(" — ");
  }
  return e instanceof Error ? e.message : "Unknown error";
}

// In proxy mode, forward billing calls to the hosted Replit server (which has
// Paddle creds + Clerk auth). In hosted/dev mode, handle them locally.
const HOSTED_URL = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
const protect = IS_PROXY ? [] : [requireAuth];

async function proxyToHosted(
  req: Request,
  res: Response,
  path: string,
): Promise<void> {
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
    res.status(502).json({ error: `Failed to reach billing service: ${msg}` });
  }
}

// Public config — exposes the client-side token and price IDs to the browser.
// Not authenticated: client needs it before sign-in to render the pricing page.
router.get("/billing/config", async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/config");
    return;
  }
  res.json({
    clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null,
    environment: paddleEnvironment,
    prices: {
      pro: process.env.PADDLE_PRO_PRICE_ID ?? null,
      pro_plus: process.env.PADDLE_PRO_PLUS_PRICE_ID ?? null,
      elite: process.env.PADDLE_ELITE_PRICE_ID ?? null,
    },
    paypal: {
      enabled:
        isPaypalConfigured() &&
        !!process.env.PAYPAL_PRO_PLAN_ID &&
        !!process.env.PAYPAL_PRO_PLUS_PLAN_ID &&
        !!process.env.PAYPAL_ELITE_PLAN_ID,
      environment: paypalEnvironment,
    },
  });
});

// Current user's billing status — used by client to render "current plan" badges.
router.get("/billing/status", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/status");
    return;
  }
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // "active" here means we still need to talk to the processor to wind
  // it down — i.e. the user can still meaningfully click "Cancel". Once
  // the webhook flips status to canceled/expired we surface that and
  // hide the cancel button on the client.
  const isSubscriptionActive =
    !!user.billingSubscriptionId &&
    user.subscriptionStatus !== null &&
    !["canceled", "cancelled", "expired", "deleted"].includes(
      (user.subscriptionStatus ?? "").toLowerCase(),
    );
  res.json({
    plan: user.plan,
    billingProvider: user.billingProvider,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    hasSubscription: !!user.billingSubscriptionId,
    isSubscriptionActive,
  });
});

// Current user's usage snapshot — plan allowance + this-month + today totals
// + projected overage. Powers the self-serve usage dashboard so users can see
// exactly where they are vs. their limits.
router.get("/billing/usage", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/usage");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  try {
    const snapshot = await getUsageSnapshot(userId, email);
    res.json(snapshot);
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to build usage snapshot");
    res.status(500).json({ error: "Failed to load usage" });
  }
});

// Creates a Paddle transaction server-side so customData.userId is bound by
// trusted code (never the browser). The client opens Inline Checkout with the
// returned transactionId — it cannot tamper the subscription's userId binding.
router.post("/billing/checkout", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/checkout");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail;
  const tier = req.body?.tier as "pro" | "pro_plus" | "elite" | undefined;
  if (tier !== "pro" && tier !== "pro_plus" && tier !== "elite") {
    res.status(400).json({ error: "tier must be 'pro', 'pro_plus', or 'elite'" });
    return;
  }

  // Admin accounts already bypass usage caps — block them from creating real
  // Paddle transactions so we don't accidentally charge ourselves. Admins can
  // opt INTO a real checkout for end-to-end testing by sending `adminTest:true`
  // in the body (they're prompted on the client first).
  const adminRows = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const adminTest = req.body?.adminTest === true;
  if (adminRows[0]?.isAdmin && !adminTest) {
    res.status(403).json({ error: "Admin accounts cannot purchase subscriptions." });
    return;
  }
  if (adminRows[0]?.isAdmin && adminTest) {
    logger.warn({ userId, tier }, "ADMIN TEST CHECKOUT — real Paddle transaction will be created");
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    res.status(500).json({ error: `No price configured for ${tier} tier` });
    return;
  }

  try {
    const paddle = getPaddle();
    const tx = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customData: { userId },
      ...(email ? { customerEmail: email } : {}),
    } as Parameters<typeof paddle.transactions.create>[0]);
    res.json({ transactionId: tx.id, email });
  } catch (e) {
    // Surface the actual Paddle SDK error to the client (admin-test-mode
    // shows it in a toast) so failures don't manifest as a generic
    // "Failed to start checkout" with no diagnostic info. The Paddle
    // SDK error is also pulled into the server log with full context.
    const detail = extractPaddleErrorDetail(e);
    logger.error({ err: e, detail, userId, tier, priceId }, "Failed to create Paddle transaction");
    res.status(500).json({
      error: `Failed to start checkout: ${detail}`,
    });
  }
});

// Returns the Paddle customer portal URL so the user can manage their
// subscription (change card, cancel, etc.) outside our app.
router.post("/billing/portal", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/portal");
    return;
  }
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user?.billingCustomerId) {
    res.status(400).json({ error: "No Paddle customer on file. Subscribe first." });
    return;
  }
  try {
    const paddle = getPaddle();
    const session = await paddle.customerPortalSessions.create(
      user.billingCustomerId,
      user.billingSubscriptionId ? [user.billingSubscriptionId] : [],
    );
    res.json({ url: session.urls.general.overview });
  } catch (e) {
    logger.error({ err: e, userId }, "Failed to create Paddle portal session");
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

// ── PayPal: create subscription (redirect flow) ────────────────────────────
// Returns the PayPal approval URL. The browser navigates to it; PayPal
// collects payment; PayPal redirects to the return_url we pass, which
// hits /upgrade?paypal=success&subscription_id=I-..., where the client
// then POSTs /billing/paypal/confirm so the user sees an instant plan
// update (webhook is a backup, not the primary path).
router.post("/billing/paypal/create-subscription", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/paypal/create-subscription");
    return;
  }
  const userId = req.userId!;
  const email = req.userEmail ?? null;
  const tier = req.body?.tier as "pro" | "pro_plus" | "elite" | undefined;
  if (tier !== "pro" && tier !== "pro_plus" && tier !== "elite") {
    res.status(400).json({ error: "tier must be 'pro', 'pro_plus', or 'elite'" });
    return;
  }

  // Block admin checkouts (same posture as Paddle). Admins may opt in via
  // `adminTest:true` for end-to-end testing.
  const adminRows = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const adminTest = req.body?.adminTest === true;
  if (adminRows[0]?.isAdmin && !adminTest) {
    res.status(403).json({ error: "Admin accounts cannot purchase subscriptions." });
    return;
  }
  if (adminRows[0]?.isAdmin && adminTest) {
    logger.warn({ userId, tier }, "ADMIN TEST CHECKOUT — real PayPal subscription will be created");
  }

  const planId = paypalPlanIdForTier(tier);
  if (!planId) {
    res.status(500).json({ error: `No PayPal plan configured for ${tier} tier` });
    return;
  }

  // Build absolute return/cancel URLs from the request's own origin so we
  // work in dev (localhost), Electron proxy, and the public deployment
  // without a hard-coded env var.
  const origin =
    req.get("origin") ??
    (process.env.UNSTUCK_PUBLIC_HOSTNAME
      ? `https://${process.env.UNSTUCK_PUBLIC_HOSTNAME}`
      : `${req.protocol}://${req.get("host")}`);
  const returnUrl = `${origin}/upgrade?paypal=success`;
  const cancelUrl = `${origin}/upgrade?paypal=cancel`;

  try {
    const sub = await paypalCreateSubscription({
      planId,
      userId,
      email,
      returnUrl,
      cancelUrl,
    });
    res.json({ subscriptionId: sub.id, approveUrl: sub.approveUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error({ err: e, userId, tier }, "Failed to create PayPal subscription");
    res.status(500).json({ error: msg });
  }
});

// Called by the client immediately after PayPal redirects the user back
// to /upgrade?paypal=success&subscription_id=…. Fetches the canonical
// subscription state from PayPal, verifies custom_id matches the
// authenticated user (defense against URL-tampering), and updates the
// users row. Idempotent — webhook can also fire and run the same UPDATE.
router.post("/billing/paypal/confirm", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/paypal/confirm");
    return;
  }
  const userId = req.userId!;
  const subscriptionId = req.body?.subscriptionId as string | undefined;
  if (!subscriptionId) {
    res.status(400).json({ error: "subscriptionId required" });
    return;
  }

  try {
    const sub = await paypalGetSubscription(subscriptionId);
    if (sub.custom_id !== userId) {
      logger.warn(
        { subscriptionId, expectedUserId: userId, actualCustomId: sub.custom_id },
        "PayPal confirm: custom_id mismatch — refusing to bind subscription",
      );
      res.status(403).json({ error: "Subscription does not belong to this user" });
      return;
    }
    // Entitlement gate: only ACTIVE/APPROVED grant the paid plan. If the
    // subscription is in any other state (CANCELLED, SUSPENDED, EXPIRED,
    // APPROVAL_PENDING), don't flip the user to paid — for terminal
    // states we explicitly downgrade so a replay-of-confirm after a
    // cancel can't restore paid access. APPROVAL_PENDING means the user
    // hasn't actually completed PayPal's approval flow yet (e.g. they
    // tampered with the redirect URL), so we leave them on free.
    const knownTier = PAYPAL_PLAN_TO_TIER[sub.plan_id] ?? "free";
    const active = isActivePaypalStatus(sub.status);
    const tier: PlanTier = active ? knownTier : "free";
    const periodEnd = sub.billing_info?.next_billing_time
      ? new Date(sub.billing_info.next_billing_time)
      : null;
    await db
      .update(usersTable)
      .set({
        plan: tier,
        billingProvider: "paypal",
        billingCustomerId: sub.subscriber?.payer_id ?? null,
        billingSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        subscriptionCurrentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
    res.json({ plan: tier, status: sub.status, active });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error({ err: e, userId, subscriptionId }, "PayPal confirm failed");
    res.status(500).json({ error: msg });
  }
});

// Cancel a PayPal subscription. Used by the Manage Billing button when
// the user is on PayPal instead of Paddle (PayPal has no first-party
// customer portal we can redirect to, so we cancel server-side here and
// then they re-subscribe if they want a different tier).
router.post("/billing/paypal/cancel", ...protect, async (req, res) => {
  if (IS_PROXY) {
    await proxyToHosted(req, res, "/api/billing/paypal/cancel");
    return;
  }
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user?.billingSubscriptionId || user.billingProvider !== "paypal") {
    res.status(400).json({ error: "No active PayPal subscription on file." });
    return;
  }
  // Helper to mark the user cancelled locally. We do this whether
  // PayPal accepted the cancel OR returned "already cancelled / not
  // found" — both mean "this subscription will not bill again", which
  // is exactly the state we want to reflect.
  const markCancelledLocally = async (newStatus: string) => {
    await db
      .update(usersTable)
      .set({
        // Note: we keep `plan` as-is so the user retains paid access
        // until subscriptionCurrentPeriodEnd. The status flip is what
        // hides the cancel button and stops future renewals.
        subscriptionStatus: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  };

  try {
    await paypalCancelSubscription(user.billingSubscriptionId, "User requested cancel via app");
    await markCancelledLocally("canceled");
    res.json({ ok: true });
  } catch (e) {
    const err = e as Error & {
      paypalStatus?: number;
      paypalName?: string;
      paypalMessage?: string;
    };
    // PayPal-side "subscription doesn't exist / already cancelled /
    // already expired" — from the user's perspective there is nothing
    // to cancel and the desired end state is reached. Clean up locally
    // and return success so the UI flips to "canceled" instead of
    // dumping a scary error toast.
    const benignNames = new Set([
      "RESOURCE_NOT_FOUND",
      "INVALID_RESOURCE_ID",
      "SUBSCRIPTION_STATUS_INVALID",
    ]);
    const benignByStatus = err.paypalStatus === 404;
    const benignByName = !!err.paypalName && benignNames.has(err.paypalName);
    // "INVALID_REQUEST" on the cancel endpoint typically means the
    // subscription is already in a terminal state — PayPal will not let
    // you cancel a CANCELLED/EXPIRED sub. Treat as benign.
    const benignInvalidRequest =
      err.paypalName === "INVALID_REQUEST" &&
      /cancel|status|terminal|already/i.test(err.paypalMessage ?? "");

    if (benignByStatus || benignByName || benignInvalidRequest) {
      logger.warn(
        { userId, paypalName: err.paypalName, paypalStatus: err.paypalStatus },
        "PayPal cancel: subscription already gone — cleaning up locally",
      );
      await markCancelledLocally("canceled");
      res.json({ ok: true, alreadyCancelled: true });
      return;
    }

    logger.error(
      { err: e, userId, paypalName: err.paypalName, paypalStatus: err.paypalStatus },
      "PayPal cancel failed",
    );
    // User-facing message: friendly text + the PayPal message if any,
    // but NEVER the raw response body, debug_id, links, or stack.
    const friendly =
      err.paypalMessage ??
      "We couldn't cancel your subscription right now. Please try again or cancel from your PayPal account.";
    res.status(502).json({ error: friendly });
  }
});

export default router;
