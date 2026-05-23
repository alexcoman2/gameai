import { pgTable, text, timestamp, integer, serial, uniqueIndex } from "drizzle-orm/pg-core";

export const OVERAGE_STATUS = ["pending", "charged", "failed", "skipped"] as const;
export type OverageStatus = (typeof OVERAGE_STATUS)[number];

/**
 * Audit log of period-end overage calculations and the Paddle charge attempts
 * that resulted. One row per (user, billing period). `status`:
 *   - pending:  computed but no charge attempted yet
 *   - charged:  Paddle transaction created successfully (paddleTransactionId set)
 *   - failed:   Paddle rejected the charge (error column has details)
 *   - skipped:  overage was zero, or PADDLE_OVERAGE_PRODUCT_ID is unconfigured
 */
export const overageChargesTable = pgTable(
  "overage_charges",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    plan: text("plan").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    chatsOver: integer("chats_over").notNull().default(0),
    watchSecondsOver: integer("watch_seconds_over").notNull().default(0),
    amountCents: integer("amount_cents").notNull().default(0),
    currencyCode: text("currency_code").notNull().default("USD"),
    paddleTransactionId: text("paddle_transaction_id"),
    status: text("status").$type<OverageStatus>().notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // UNIQUE — the period-end overage billing path inserts with
    // ON CONFLICT DO NOTHING and uses the conflict as the idempotency
    // gate against Paddle webhook retries firing concurrent rollovers.
    userPeriodIdx: uniqueIndex("overage_user_period_idx").on(t.userId, t.periodStart),
  }),
);

export type OverageCharge = typeof overageChargesTable.$inferSelect;
export type InsertOverageCharge = typeof overageChargesTable.$inferInsert;
