import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const PLAN_TIERS = ["free", "pro", "pro_plus", "elite"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  plan: text("plan").$type<PlanTier>().notNull().default("free"),
  // Provider-agnostic billing fields. We're starting with Paddle but may
  // swap providers — keep column names neutral so a future swap is just a
  // config change, not a schema migration.
  billingProvider: text("billing_provider").$type<"paddle" | "stripe" | null>(),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  subscriptionCurrentPeriodStart: timestamp("subscription_current_period_start"),
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  // Tracks the end-of-period date we've already processed for overage
  // billing. Guards against double-charging on Paddle webhook retries —
  // if a SubscriptionUpdated event arrives whose previous period start
  // matches this value, we skip the overage calculation.
  overageBilledThrough: timestamp("overage_billed_through"),
  totalLifetimeCostCents: integer("total_lifetime_cost_cents").notNull().default(0),
  // Owner / staff accounts: bypass all usage caps and billing. Synced
  // from the ADMIN_EMAILS env var on every getOrCreateUser call so a
  // single env change promotes / demotes admins without manual SQL.
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
