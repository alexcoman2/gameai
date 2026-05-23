import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getPaddle, paddleEnvironment, priceIdForTier } from "../lib/paddle.js";
import { logger } from "../lib/logger.js";
import { IS_PROXY } from "../lib/server-mode.js";
import { getUsageSnapshot } from "../lib/usage.js";

const router: IRouter = Router();

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
  res.json({
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    hasSubscription: !!user.billingSubscriptionId,
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
  // Paddle transactions so we don't accidentally charge ourselves.
  const adminRows = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (adminRows[0]?.isAdmin) {
    res.status(403).json({ error: "Admin accounts cannot purchase subscriptions." });
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

export default router;
