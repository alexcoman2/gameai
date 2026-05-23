import { and, eq, desc } from "drizzle-orm";
import { db, gameProfilesTable, type GameProfile } from "@workspace/db";
import { logger } from "./logger.js";

// ── Key normalization ────────────────────────────────────────────────────────
// "Elden Ring", "elden ring", " Elden  Ring " all collapse to the same key
// so the profile follows the player even when the detected game name has
// trailing whitespace, casing differences, or punctuation drift.
export function normalizeGameKey(gameName: string | null | undefined): string | null {
  if (!gameName) return null;
  const k = gameName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return k.length === 0 ? null : k;
}

// ── Deep merge ───────────────────────────────────────────────────────────────
// Claude sends partial updates; we merge into the existing JSON object. A
// caller can clear a field by sending `null` explicitly (we delete the key).
// Arrays are *replaced* not concatenated — predictable semantics beat clever
// dedupe, and Claude knows how to send a full list when it intends to.
type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMergeProfile(base: Json, patch: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete out[k];
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeProfile(out[k] as Json, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Storage ──────────────────────────────────────────────────────────────────

export async function getProfile(
  userId: string,
  gameKey: string,
): Promise<Json | null> {
  try {
    const rows = await db
      .select()
      .from(gameProfilesTable)
      .where(and(eq(gameProfilesTable.userId, userId), eq(gameProfilesTable.gameKey, gameKey)))
      .limit(1);
    return rows[0]?.profile ?? null;
  } catch (err) {
    logger.warn({ err, userId, gameKey }, "getProfile failed");
    return null;
  }
}

export async function listProfiles(userId: string): Promise<GameProfile[]> {
  try {
    return await db
      .select()
      .from(gameProfilesTable)
      .where(eq(gameProfilesTable.userId, userId))
      .orderBy(desc(gameProfilesTable.updatedAt));
  } catch (err) {
    logger.warn({ err, userId }, "listProfiles failed");
    return [];
  }
}

export async function upsertProfile(
  userId: string,
  gameKey: string,
  patch: Json,
  options: { displayGameName?: string | null; replace?: boolean } = {},
): Promise<Json> {
  const existing = (await getProfile(userId, gameKey)) ?? {};
  const merged = options.replace ? patch : deepMergeProfile(existing, patch);
  // Always stamp the human-readable display name so callers (UI, prompt
  // injection) can render "Elden Ring" instead of the normalized key.
  if (options.displayGameName && !merged.gameName) {
    merged.gameName = options.displayGameName;
  }
  try {
    await db
      .insert(gameProfilesTable)
      .values({ userId, gameKey, profile: merged })
      .onConflictDoUpdate({
        target: [gameProfilesTable.userId, gameProfilesTable.gameKey],
        set: { profile: merged, updatedAt: new Date() },
      });
    return merged;
  } catch (err) {
    logger.warn({ err, userId, gameKey }, "upsertProfile failed");
    return existing;
  }
}

export async function deleteProfile(userId: string, gameKey: string): Promise<boolean> {
  try {
    await db
      .delete(gameProfilesTable)
      .where(and(eq(gameProfilesTable.userId, userId), eq(gameProfilesTable.gameKey, gameKey)));
    return true;
  } catch (err) {
    logger.warn({ err, userId, gameKey }, "deleteProfile failed");
    return false;
  }
}

// ── Prompt formatting ────────────────────────────────────────────────────────
// Render the profile as a compact YAML-ish block. JSON.stringify(indent: 2)
// works but burns tokens on braces/quotes; this format is easier for the
// model to scan and matches how the rest of the system prompt reads.
export function formatProfileForPrompt(profile: Json): string {
  const render = (val: unknown, depth: number): string => {
    const pad = "  ".repeat(depth);
    if (val === null || val === undefined) return "—";
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return "[]";
      return "\n" + val.map((v) => `${pad}- ${render(v, depth + 1).trimStart()}`).join("\n");
    }
    if (isPlainObject(val)) {
      const entries = Object.entries(val);
      if (entries.length === 0) return "{}";
      return "\n" + entries.map(([k, v]) => `${pad}${k}: ${render(v, depth + 1)}`).join("\n");
    }
    return String(val);
  };
  const entries = Object.entries(profile);
  if (entries.length === 0) return "(empty)";
  return entries.map(([k, v]) => `${k}: ${render(v, 1)}`).join("\n");
}
