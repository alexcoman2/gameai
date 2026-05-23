import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, paddleEventsTable, type PlanTier, type PaddleEventStatus } from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  PLAN_TO_TIER,
  getSubscription,
  verifyWebhookSignature,
  isActiveSubscriptionStatus,
  isTerminalSubscriptionStatus,
} from "../lib/paypal.js";

// We reuse the paddle_events audit table for PayPal too — same shape
// (event id, type, subscription id, status, http status), and keeping
// both providers in one table makes the admin "billing events" view
// trivial.
async function recordEvent(row: {
  eventType?: string | null;
  eventId?: string | null;
  subscriptionId?: string | null;
  userId?: string | null;
  status: PaddleEventStatus;
  httpStatus: number;
  error?: string | null;
}): Promise<void> {
  try {
    await db.insert(paddleEventsTable).values({
      eventType: row.eventType ?? null,
      eventId: row.eventId ?? null,
      subscriptionId: row.subscriptionId ?? null,
      userId: row.userId ?? null,
      status: row.status,
      httpStatus: row.httpStatus,
      error: row.error ?? null,
    });
  } catch (e) {
    logger.warn({ err: e }, "Failed to write paypal webhook audit row");
  }
}

// Mounted in app.ts BEFORE express.json() so req.body is a raw Buffer.
// PayPal verifies the signature against the unmodified body via the
// notifications/verify-webhook-signature endpoint.
export async function paypalWebhookHandler(req: Request, res: Response) {
  const rawBody = req.body instanceof Buffer
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";
  if (!rawBody) {
    await recordEvent({ status: "rejected", httpStatus: 400, error: "Empty body" });
    res.status(400).json({ error: "Empty body" });
    return;
  }

  const ok = await verifyWebhookSignature({
    headers: req.headers as Record<string, string | string[] | undefined>,
    rawBody,
  });
  if (!ok) {
    await recordEvent({ status: "rejected", httpStatus: 400, error: "Signature verification failed" });
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    await recordEvent({ status: "rejected", httpStatus: 400, error: "Invalid JSON" });
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const resource = (event.resource ?? {}) as {
    id?: string;
    custom_id?: string;
    plan_id?: string;
    status?: string;
    billing_info?: { next_billing_time?: string };
  };
  const meta = {
    eventType: event.event_type ?? null,
    eventId: event.id ?? null,
    subscriptionId: resource.id ?? null,
    userId: resource.custom_id ?? null,
  };

  // Idempotency: PayPal retries webhooks on non-200 responses. If we've
  // already processed this event_id, ack with 200 and skip the handler
  // so we don't re-run side effects (esp. status transitions that could
  // race the confirm endpoint).
  if (event.id) {
    const existing = await db
      .select({ id: paddleEventsTable.id })
      .from(paddleEventsTable)
      .where(
        and(
          eq(paddleEventsTable.eventId, event.id),
          eq(paddleEventsTable.status, "processed"),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      logger.info({ eventId: event.id }, "PayPal webhook already processed — skipping");
      res.json({ received: true, duplicate: true });
      return;
    }
  }

  try {
    await handleEvent(event.event_type ?? "", resource);
    await recordEvent({ ...meta, status: "processed", httpStatus: 200 });
    res.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "handler failed";
    logger.error({ err: e, eventType: event.event_type }, "PayPal webhook handler failed");
    await recordEvent({ ...meta, status: "failed", httpStatus: 500, error: msg });
    res.status(500).json({ error: "handler failed" });
  }
}

type WebhookResource = {
  id?: string;
  custom_id?: string;
  plan_id?: string;
  status?: string;
  billing_info?: { next_billing_time?: string };
};

async function handleEvent(eventType: string, resource: WebhookResource): Promise<void> {
  logger.info({ eventType, subscriptionId: resource.id }, "PayPal webhook received");

  // We deliberately only handle BILLING.SUBSCRIPTION.* events. PAYMENT.SALE.*
  // resources carry a sale/capture id in resource.id and the subscription id
  // in billing_agreement_id, which we'd have to special-case to avoid 404ing
  // GET /v1/billing/subscriptions/<sale_id>. The subscription lifecycle
  // events already cover every state transition we care about (activation,
  // renewal updates, cancel, suspend, expire), so we skip sale events to
  // keep the reconciliation path single-shape and correct.
  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED":
    case "BILLING.SUBSCRIPTION.UPDATED":
    case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.SUSPENDED":
    case "BILLING.SUBSCRIPTION.EXPIRED":
    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      await reconcileSubscription(resource);
      return;
    default:
      logger.debug({ eventType }, "PayPal event ignored");
  }
}

// Single reconciliation path used by every subscription-lifecycle event.
// Always fetches the canonical subscription state from PayPal (the
// webhook resource can be stale) and lets the *current status* dictate
// the plan transition. This is the only place webhook code touches
// users.plan, so confirm vs webhook ordering can't disagree.
async function reconcileSubscription(resource: WebhookResource): Promise<void> {
  const subscriptionId = resource.id;
  if (!subscriptionId) return;
  const sub = await getSubscription(subscriptionId).catch(() => null);
  if (!sub) {
    logger.warn({ subscriptionId }, "PayPal subscription not found during reconciliation");
    return;
  }
  const userId = sub.custom_id ?? resource.custom_id;
  if (!userId) {
    logger.warn({ subscriptionId }, "PayPal subscription missing custom_id (userId)");
    return;
  }

  const known = PLAN_TO_TIER[sub.plan_id];
  if (!known && isActiveSubscriptionStatus(sub.status)) {
    logger.warn({ planId: sub.plan_id, userId }, "Unknown PayPal plan_id on active subscription");
  }

  const tier: PlanTier = isActiveSubscriptionStatus(sub.status)
    ? (known ?? "free")
    : "free";

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
  logger.info(
    { userId, tier, status: sub.status, terminal: isTerminalSubscriptionStatus(sub.status) },
    "PayPal user subscription reconciled",
  );
}
