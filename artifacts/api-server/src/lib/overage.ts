import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  usageRecordsTable,
  overageChargesTable,
  type PlanTier,
} from "@workspace/db";
import { PLAN_CONFIGS } from "./plans.js";
import { getPaddle } from "./paddle.js";
import { logger } from "./logger.js";

/**
 * Computes raw usage totals for one billing period [periodStart, periodEnd).
 */
async function periodTotals(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ chats: number; watchSeconds: number }> {
  const rows = await db
    .select({
      kind: usageRecordsTable.kind,
      countAll: sql<number>`count(*)::int`,
      sumWatch: sql<number>`coalesce(sum(${usageRecordsTable.watchSeconds}),0)::int`,
    })
    .from(usageRecordsTable)
    .where(
      and(
        eq(usageRecordsTable.userId, userId),
        gte(usageRecordsTable.createdAt, periodStart),
        lt(usageRecordsTable.createdAt, periodEnd),
      ),
    )
    .groupBy(usageRecordsTable.kind);

  let chats = 0;
  let watchSeconds = 0;
  for (const r of rows) {
    if (r.kind === "chat") chats = Number(r.countAll);
    if (r.kind === "watch") watchSeconds = Number(r.sumWatch);
  }
  return { chats, watchSeconds };
}

export type OverageCalc = {
  plan: PlanTier;
  chatsOver: number;
  watchSecondsOver: number;
  /** Total amount to charge, in cents (rounded to the cent). */
  amountCents: number;
};

/**
 * Pure overage math for a given plan tier and period totals. Exposed so tests
 * (and the future "show overage in upgrade page" UI) can call it directly.
 */
export function calcOverage(
  plan: PlanTier,
  totals: { chats: number; watchSeconds: number },
): OverageCalc {
  const cfg = PLAN_CONFIGS[plan];
  if (!cfg.allowsOverage) {
    return { plan, chatsOver: 0, watchSecondsOver: 0, amountCents: 0 };
  }
  const chatsOver = Math.max(0, totals.chats - cfg.monthlyChats);
  const watchSecondsOver = Math.max(0, totals.watchSeconds - cfg.monthlyWatchSeconds);
  const microcents =
    chatsOver * cfg.overageChatMicrocents +
    watchSecondsOver * cfg.overageWatchSecMicrocents;
  // microcents -> cents (1 cent = 10_000 microcents). Round to the cent so
  // Paddle gets a clean integer charge.
  const amountCents = Math.round(microcents / 10_000);
  return { plan, chatsOver, watchSecondsOver, amountCents };
}

/**
 * Threshold below which we don't bother creating a Paddle transaction.
 * Paddle charges processing fees per-transaction, and a charge under 50¢
 * would lose money. Sub-threshold overage is recorded as `skipped` and
 * forgiven this period.
 */
const MIN_CHARGE_CENTS = 50;

/**
 * Called from the Paddle subscription.updated webhook handler when we detect
 * a billing-period rollover. Computes the previous period's overage, records
 * an audit row, and (if PADDLE_OVERAGE_PRODUCT_ID is configured) creates a
 * one-off Paddle transaction billing the user for it.
 *
 * Idempotency: the caller is responsible for checking `overageBilledThrough`
 * before invoking — but as a second line of defence this function also writes
 * to the `overage_charges` audit table with a (userId, periodStart) lookup
 * pattern available for future dedupe.
 */
export async function billPeriodOverage(args: {
  userId: string;
  plan: PlanTier;
  customerId: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<void> {
  const { userId, plan, customerId, periodStart, periodEnd } = args;
  const totals = await periodTotals(userId, periodStart, periodEnd);
  const calc = calcOverage(plan, totals);

  if (calc.chatsOver === 0 && calc.watchSecondsOver === 0) {
    logger.info({ userId, periodStart, periodEnd }, "No overage for period");
    return;
  }

  const productId = process.env.PADDLE_OVERAGE_PRODUCT_ID;
  const willCharge = calc.amountCents >= MIN_CHARGE_CENTS && !!productId && !!customerId;
  const initialStatus = willCharge ? "pending" : "skipped";
  const skipReason = !customerId
    ? "no Paddle customer on file"
    : !productId
      ? "PADDLE_OVERAGE_PRODUCT_ID not configured"
      : `amount below MIN_CHARGE_CENTS=${MIN_CHARGE_CENTS}`;

  // Idempotency gate: the (user_id, period_start) UNIQUE index guarantees
  // only one insert wins. Concurrent Paddle webhook retries that race past
  // the `overageBilledThrough` check above will all collide here, and only
  // the first one gets a row id back to proceed with the Paddle charge.
  const inserted = await db
    .insert(overageChargesTable)
    .values({
      userId,
      plan,
      periodStart,
      periodEnd,
      chatsOver: calc.chatsOver,
      watchSecondsOver: calc.watchSecondsOver,
      amountCents: calc.amountCents,
      status: initialStatus,
      error: willCharge ? null : skipReason,
    })
    .onConflictDoNothing({ target: [overageChargesTable.userId, overageChargesTable.periodStart] })
    .returning({ id: overageChargesTable.id });

  if (inserted.length === 0) {
    logger.info(
      { userId, periodStart, periodEnd },
      "Overage already recorded for this period — skipping (idempotency)",
    );
    return;
  }
  const chargeId = inserted[0].id;

  if (!willCharge) {
    logger.warn(
      { userId, plan, calc, reason: skipReason },
      "Overage recorded but not charged",
    );
    return;
  }

  // Charge via Paddle one-off transaction with a non-catalog price tied to
  // the user's existing overage product.
  try {
    const description = formatOverageDescription(calc, periodStart, periodEnd);
    const paddle = getPaddle();
    const tx = await paddle.transactions.create({
      customerId: customerId!,
      collectionMode: "automatic",
      items: [
        {
          price: {
            productId: productId!,
            description,
            name: description,
            unitPrice: {
              amount: String(calc.amountCents),
              currencyCode: "USD",
            },
            quantity: { minimum: 1, maximum: 1 },
            taxMode: "account_setting",
          },
          quantity: 1,
        },
      ],
      customData: { userId, kind: "overage", periodStart: periodStart.toISOString() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await db
      .update(overageChargesTable)
      .set({ status: "charged", paddleTransactionId: tx.id })
      .where(eq(overageChargesTable.id, chargeId));
    logger.info({ userId, chargeId, transactionId: tx.id, amountCents: calc.amountCents }, "Overage charged");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(overageChargesTable)
      .set({ status: "failed", error: msg })
      .where(eq(overageChargesTable.id, chargeId));
    logger.error({ err: e, userId, chargeId }, "Failed to create overage transaction");
    throw e;
  }
}

function formatOverageDescription(calc: OverageCalc, start: Date, end: Date): string {
  const parts: string[] = [];
  if (calc.chatsOver > 0) parts.push(`${calc.chatsOver} extra chats`);
  if (calc.watchSecondsOver > 0) {
    const mins = Math.ceil(calc.watchSecondsOver / 60);
    parts.push(`${mins} extra Watch minutes`);
  }
  const range = `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`;
  return `Unstuck usage overage (${parts.join(", ")}) for ${range}`;
}

/**
 * Detects a billing-period rollover and triggers overage billing for the
 * just-completed period. Idempotent: a second call with the same dates is a
 * no-op because `overageBilledThrough` is updated atomically with the charge.
 *
 * Returns true if billing was triggered, false if not (no rollover, first
 * subscription event, or already billed).
 */
export async function maybeBillOverageOnRollover(args: {
  userId: string;
  plan: PlanTier;
  customerId: string | null;
  storedPeriodStart: Date | null;
  storedOverageBilledThrough: Date | null;
  newPeriodStart: Date | null;
}): Promise<boolean> {
  const { userId, plan, customerId, storedPeriodStart, storedOverageBilledThrough, newPeriodStart } = args;

  if (!storedPeriodStart || !newPeriodStart) return false;
  if (storedPeriodStart.getTime() === newPeriodStart.getTime()) return false;
  if (storedOverageBilledThrough && storedOverageBilledThrough.getTime() >= newPeriodStart.getTime()) {
    return false; // Already billed for this rollover.
  }

  await billPeriodOverage({
    userId,
    plan,
    customerId,
    periodStart: storedPeriodStart,
    periodEnd: newPeriodStart,
  });

  await db
    .update(usersTable)
    .set({ overageBilledThrough: newPeriodStart })
    .where(eq(usersTable.id, userId));
  return true;
}
