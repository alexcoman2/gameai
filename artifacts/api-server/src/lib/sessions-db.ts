// DB-backed equivalent of sessions-store.ts. Same shape, but scoped by
// Clerk userId and persisted to Postgres instead of the local fs. Used
// by the hosted api-server; the local Electron proxy forwards session
// reads/writes through to the hosted server rather than calling this
// module directly.
import {
  db,
  chatSessionsTable,
  chatMessagesTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  screenshot: string | null;
};

export type SessionMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  gameContext: string | null;
  // Kept in the shape for wire compatibility with the old fs store; the
  // hosted DB has no per-session disk usage so this is always 0.
  diskUsageBytes: number;
};

const MAX_SCREENSHOTS_PER_SESSION = 10;
export const MAX_SESSION_MESSAGE_PAIRS = 50;

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export async function listSessions(userId: string): Promise<SessionMeta[]> {
  const rows = await db
    .select()
    .from(chatSessionsTable)
    .where(eq(chatSessionsTable.userId, userId))
    .orderBy(desc(chatSessionsTable.updatedAt));
  if (rows.length === 0) return [];
  const counts = new Map<string, number>(
    (
      await db
        .select({
          sessionId: chatMessagesTable.sessionId,
          c: sql<number>`count(*)::int`,
        })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.userId, userId))
        .groupBy(chatMessagesTable.sessionId)
    ).map((r) => [r.sessionId, r.c]),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    messageCount: Math.floor((counts.get(r.id) ?? 0) / 2),
    gameContext: r.gameContext,
    diskUsageBytes: 0,
  }));
}

export async function createSession(
  userId: string,
  name: string,
): Promise<SessionMeta> {
  const id = randomUUID();
  const trimmed = name.trim() || `Session ${new Date().toLocaleDateString()}`;
  const [row] = await db
    .insert(chatSessionsTable)
    .values({ id, userId, name: trimmed })
    .returning();
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: 0,
    gameContext: row.gameContext,
    diskUsageBytes: 0,
  };
}

async function getSessionRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(chatSessionsTable)
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function getSession(
  userId: string,
  id: string,
): Promise<SessionMeta | null> {
  const row = await getSessionRow(userId, id);
  if (!row) return null;
  const [c] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, id));
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: Math.floor((c?.c ?? 0) / 2),
    gameContext: row.gameContext,
    diskUsageBytes: 0,
  };
}

export async function updateSession(
  userId: string,
  id: string,
  updates: {
    name?: string;
    gameContext?: string | null;
    touchUpdatedAt?: boolean;
  },
): Promise<SessionMeta | null> {
  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.gameContext !== undefined) set.gameContext = updates.gameContext;
  if (updates.touchUpdatedAt) set.updatedAt = new Date();
  if (Object.keys(set).length === 0) return getSession(userId, id);
  const result = await db
    .update(chatSessionsTable)
    .set(set)
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    )
    .returning({ id: chatSessionsTable.id });
  if (result.length === 0) return null;
  return getSession(userId, id);
}

export async function deleteSession(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .delete(chatSessionsTable)
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    )
    .returning({ id: chatSessionsTable.id });
  return result.length > 0;
}

export async function loadSessionHistory(
  userId: string,
  id: string,
): Promise<ConversationMessage[]> {
  const [row] = await db
    .select({ historyJson: chatSessionsTable.historyJson })
    .from(chatSessionsTable)
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    )
    .limit(1);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.historyJson);
    if (Array.isArray(parsed)) return parsed as ConversationMessage[];
  } catch {
    // fall through to empty
  }
  return [];
}

export async function saveSessionHistory(
  userId: string,
  id: string,
  history: ConversationMessage[],
): Promise<void> {
  await db
    .update(chatSessionsTable)
    .set({
      historyJson: JSON.stringify(history),
      updatedAt: new Date(),
    })
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    );
}

export async function loadSessionMessages(
  userId: string,
  id: string,
): Promise<DisplayMessage[]> {
  const exists = await getSessionRow(userId, id);
  if (!exists) return [];
  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, id))
    .orderBy(chatMessagesTable.createdAt);
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    timestamp: fmtTime(r.createdAt),
    screenshot: r.screenshot,
  }));
}

export async function appendSessionMessages(
  userId: string,
  sessionId: string,
  messages: DisplayMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  // Verify ownership before inserting — guards against a crafted body
  // sending another user's sessionId. Hosted routes already require
  // auth + match userId, but defense in depth is cheap here.
  const session = await getSessionRow(userId, sessionId);
  if (!session) return;

  await db.insert(chatMessagesTable).values(
    messages.map((m) => ({
      id: m.id,
      sessionId,
      userId,
      role: m.role,
      content: m.content,
      screenshot: m.screenshot ?? null,
    })),
  );

  // Cap screenshots: keep only the most recent N with non-null screenshot
  // per session. Older ones get nulled out so the table stays bounded
  // even for users with long chat histories.
  const withShots = await db
    .select({ id: chatMessagesTable.id })
    .from(chatMessagesTable)
    .where(
      and(
        eq(chatMessagesTable.sessionId, sessionId),
        sql`${chatMessagesTable.screenshot} IS NOT NULL`,
      ),
    )
    .orderBy(desc(chatMessagesTable.createdAt));
  if (withShots.length > MAX_SCREENSHOTS_PER_SESSION) {
    const toNull = withShots
      .slice(MAX_SCREENSHOTS_PER_SESSION)
      .map((r) => r.id);
    if (toNull.length > 0) {
      await db
        .update(chatMessagesTable)
        .set({ screenshot: null })
        .where(inArray(chatMessagesTable.id, toNull));
    }
  }

  // Cap total messages: keep only the most recent MAX_SESSION_MESSAGE_PAIRS*2.
  const all = await db
    .select({ id: chatMessagesTable.id })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, sessionId))
    .orderBy(desc(chatMessagesTable.createdAt));
  const max = MAX_SESSION_MESSAGE_PAIRS * 2;
  if (all.length > max) {
    const toDelete = all.slice(max).map((r) => r.id);
    if (toDelete.length > 0) {
      await db
        .delete(chatMessagesTable)
        .where(inArray(chatMessagesTable.id, toDelete));
    }
  }
}

export async function clearSession(
  userId: string,
  id: string,
): Promise<void> {
  const exists = await getSessionRow(userId, id);
  if (!exists) return;
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.sessionId, id));
  await db
    .update(chatSessionsTable)
    .set({ historyJson: "[]", updatedAt: new Date() })
    .where(
      and(eq(chatSessionsTable.id, id), eq(chatSessionsTable.userId, userId)),
    );
}

// One-shot: persist a completed chat turn (user message + assistant
// reply + updated history) atomically from the caller's POV. Wraps the
// 3 underlying writes used by every /chat/message branch.
export async function persistChatTurn(args: {
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantReply: string;
  imageDataUrl: string | null;
  history: ConversationMessage[];
  gameName: string | null | undefined;
}): Promise<void> {
  await saveSessionHistory(args.userId, args.sessionId, args.history);
  const userMsgId = `${Date.now()}-user`;
  const assistantMsgId = `${Date.now() + 1}-assistant`;
  const now = fmtTime(new Date());
  await appendSessionMessages(args.userId, args.sessionId, [
    {
      id: userMsgId,
      role: "user",
      content: args.userMessage,
      timestamp: now,
      screenshot: args.imageDataUrl ?? null,
    },
    {
      id: assistantMsgId,
      role: "assistant",
      content: args.assistantReply,
      timestamp: now,
      screenshot: null,
    },
  ]);
  if (args.gameName !== undefined) {
    await updateSession(args.userId, args.sessionId, {
      gameContext: args.gameName,
      touchUpdatedAt: true,
    });
  }
}
