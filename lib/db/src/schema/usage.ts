import { pgTable, text, timestamp, integer, serial, index } from "drizzle-orm/pg-core";

export const usageRecordsTable = pgTable(
  "usage_records",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<"chat" | "watch">().notNull(),
    costMicrocents: integer("cost_microcents").notNull(),
    watchSeconds: integer("watch_seconds").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userTimeIdx: index("usage_user_time_idx").on(t.userId, t.createdAt),
  }),
);

export type UsageRecord = typeof usageRecordsTable.$inferSelect;
