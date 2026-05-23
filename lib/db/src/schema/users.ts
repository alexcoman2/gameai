import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const PLAN_TIERS = ["free", "pro", "elite"] as const;
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
  subscriptionCurrentPeriodEnd: timestamp("subscription_current_period_end"),
  totalLifetimeCostCents: integer("total_lifetime_cost_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
