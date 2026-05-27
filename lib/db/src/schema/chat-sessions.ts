import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user chat sessions, replacing the per-machine filesystem store in
// artifacts/api-server/src/lib/sessions-store.ts. The old store wrote to
// ~/.gaming-companion/sessions/ on the user's disk, which meant signing
// in with a different account on the same Windows machine showed the
// previous account's history — and on the hosted web server it would
// have leaked all users' chats into a single shared dir.
export const chatSessionsTable = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gameContext: text("game_context"),
    // Compact JSON form of the LLM conversation history
    // (ConversationMessage[] from sessions-db.ts). Stored alongside the
    // display messages because the LLM history is structured (content
    // blocks, image refs) while display messages are flat strings —
    // keeping both avoids re-deriving one from the other every turn.
    historyJson: text("history_json").notNull().default("[]"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("chat_sessions_user_idx").on(t.userId, t.updatedAt),
  }),
);

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessionsTable.id, { onDelete: "cascade" }),
    // Denormalized for fast scoped reads and so an orphaned message
    // (shouldn't happen with the cascade above, but defense-in-depth)
    // can still be attributed to a user.
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    // Inline base64 data URL of any attached screenshot. Capped per
    // session in appendSessionMessages — older messages get this nulled
    // out so a long history doesn't bloat storage.
    screenshot: text("screenshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("chat_messages_session_idx").on(t.sessionId, t.createdAt),
    userIdx: index("chat_messages_user_idx").on(t.userId),
  }),
);

export type ChatSession = typeof chatSessionsTable.$inferSelect;
export type InsertChatSession = typeof chatSessionsTable.$inferInsert;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type InsertChatMessage = typeof chatMessagesTable.$inferInsert;
