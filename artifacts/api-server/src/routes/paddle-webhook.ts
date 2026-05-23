import type { Request, Response } from "express";
import { EventName } from "@paddle/paddle-node-sdk";
import { eq } from "drizzle-orm";
import { db, usersTable, type PlanTier } from "@workspace/db";
import { getPaddle, PRICE_TO_TIER } from "../lib/paddle.js";
import { logger } from "../lib/logger.js";

const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

// Mounted in app.ts BEFORE express.json() so req.body is a raw Buffer.
// Paddle's signature verification requires the unmodified request body.
export async function paddleWebhookHandler(req: Request, res: Response) {
  if (!webhookSecret) {
    logger.error("PADDLE_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const signature = req.header("paddle-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing paddle-signature header" });
    return;
  }

  const rawBody = req.body instanceof Buffer
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";

  if (!rawBody) {
    res.status(400).json({ error: "Empty body" });
    return;
  }

  let event;
  try {
    event = await getPaddle().webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (e) {
    logger.warn({ err: e }, "Paddle webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (!event) {
    res.status(400).json({ error: "Unrecognised event" });
    return;
  }

  try {
    await handleEvent(event);
    res.json({ received: true });
  } catch (e) {
    logger.error({ err: e, eventType: event.eventType }, "Paddle webhook handler failed");
    // 500 so Paddle retries. Handlers are idempotent (each event sets absolute
    // subscription state via UPDATE — safe to reprocess).
    res.status(500).json({ error: "handler failed" });
  }
}

type PaddleEvent = Awaited<ReturnType<ReturnType<typeof getPaddle>["webhooks"]["unmarshal"]>>;

async function handleEvent(event: NonNullable<PaddleEvent>) {
  logger.info({ eventType: event.eventType }, "Paddle webhook received");

  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionResumed:
      await upsertSubscription(event.data);
      return;
    case EventName.SubscriptionCanceled:
    case EventName.SubscriptionPaused:
      await downgradeSubscription(event.data);
      return;
    default:
      logger.debug({ eventType: event.eventType }, "Paddle event ignored");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertSubscription(data: any) {
  const userId: string | undefined = data?.customData?.userId;
  if (!userId) {
    logger.warn({ subscriptionId: data?.id }, "Subscription event missing customData.userId");
    return;
  }
  const firstItem = data?.items?.[0];
  const priceId: string | undefined = firstItem?.price?.id ?? firstItem?.priceId;
  const tier: PlanTier = priceId ? (PRICE_TO_TIER[priceId] ?? "free") : "free";
  if (priceId && !PRICE_TO_TIER[priceId]) {
    logger.warn({ priceId, userId }, "Unknown Paddle price ID — defaulting to free");
  }

  await db
    .update(usersTable)
    .set({
      plan: tier,
      billingProvider: "paddle",
      billingCustomerId: data?.customerId ?? null,
      billingSubscriptionId: data?.id ?? null,
      subscriptionStatus: data?.status ?? null,
      subscriptionCurrentPeriodEnd: data?.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
  logger.info({ userId, tier, status: data?.status }, "User subscription updated");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downgradeSubscription(data: any) {
  const userId: string | undefined = data?.customData?.userId;
  if (!userId) {
    logger.warn({ subscriptionId: data?.id }, "Subscription cancel event missing customData.userId");
    return;
  }
  await db
    .update(usersTable)
    .set({
      plan: "free",
      subscriptionStatus: data?.status ?? "canceled",
      subscriptionCurrentPeriodEnd: data?.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
  logger.info({ userId, status: data?.status }, "User subscription downgraded");
}
