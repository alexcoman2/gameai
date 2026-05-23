import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getPaddle, paddleEnvironment, priceIdForTier } from "../lib/paddle.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Public config — exposes the client-side token and price IDs to the browser.
// Not authenticated: client needs it before sign-in to render the pricing page.
router.get("/billing/config", (_req, res) => {
  res.json({
    clientToken: process.env.PADDLE_CLIENT_TOKEN ?? null,
    environment: paddleEnvironment,
    prices: {
      pro: process.env.PADDLE_PRO_PRICE_ID ?? null,
      elite: process.env.PADDLE_ELITE_PRICE_ID ?? null,
    },
  });
});

// Current user's billing status — used by client to render "current plan" badges.
router.get("/billing/status", requireAuth, async (req, res) => {
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
  res.json({
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    hasSubscription: !!user.billingSubscriptionId,
  });
});

// Creates a Paddle transaction server-side so customData.userId is bound by
// trusted code (never the browser). The client opens Inline Checkout with the
// returned transactionId — it cannot tamper the subscription's userId binding.
router.post("/billing/checkout", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const email = req.userEmail;
  const tier = req.body?.tier as "pro" | "elite" | undefined;
  if (tier !== "pro" && tier !== "elite") {
    res.status(400).json({ error: "tier must be 'pro' or 'elite'" });
    return;
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
    logger.error({ err: e, userId, tier }, "Failed to create Paddle transaction");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

// Returns the Paddle customer portal URL so the user can manage their
// subscription (change card, cancel, etc.) outside our app.
router.post("/billing/portal", requireAuth, async (req, res) => {
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

export default router;
