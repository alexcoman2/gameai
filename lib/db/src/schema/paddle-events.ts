import { pgTable, text, timestamp, serial, integer, index } from "drizzle-orm/pg-core";

export const PADDLE_EVENT_STATUS = ["received", "processed", "rejected", "failed"] as const;
export type PaddleEventStatus = (typeof PADDLE_EVENT_STATUS)[number];

/**
 * Audit log of every Paddle webhook delivery the API server saw. Lets the
 * admin dashboard answer "is Paddle still talking to us?" and "what was the
 * last error?" without trawling structured logs.
 *
 *   - received:  signature verified, handler not yet finished
 *   - processed: handler completed successfully (200 returned)
 *   - rejected:  bad signature / missing header / unrecognised payload
 *                (we returned 4xx; Paddle will NOT retry)
 *   - failed:    handler threw (we returned 5xx; Paddle WILL retry)
 */
export const paddleEventsTable = pgTable(
  "paddle_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type"),
    eventId: text("event_id"),
    subscriptionId: text("subscription_id"),
    userId: text("user_id"),
    status: text("status").$type<PaddleEventStatus>().notNull(),
    httpStatus: integer("http_status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("paddle_events_created_at_idx").on(t.createdAt),
  }),
);

export type PaddleEvent = typeof paddleEventsTable.$inferSelect;
export type InsertPaddleEvent = typeof paddleEventsTable.$inferInsert;
