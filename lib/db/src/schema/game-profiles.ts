import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

// Per-user, per-game memory profile. Claude maintains this autonomously
// via the `remember` tool — anything the player shares that's worth
// carrying across sessions (build, class, level, current location, beaten
// bosses, goals, preferences) ends up here as a freeform JSON object that
// gets injected back into the system prompt on subsequent turns whenever
// the same game is detected.
//
// We deliberately do NOT impose a schema on `profile`. Each game tracks
// different things — a Soulslike profile cares about build/class/bosses,
// a roguelike cares about current run and unlocks, a competitive shooter
// cares about main agent / sensitivity. Letting Claude shape the object
// per-game is the whole point.
export const gameProfilesTable = pgTable(
  "game_profiles",
  {
    userId: text("user_id").notNull(),
    // Normalized game name — lowercased + collapsed whitespace. Distinct
    // from the display name (which we preserve inside `profile.gameName`)
    // so "Elden Ring", "elden ring", and " Elden  Ring " all hit the
    // same row.
    gameKey: text("game_key").notNull(),
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userGameIdx: uniqueIndex("game_profiles_user_game_idx").on(t.userId, t.gameKey),
  }),
);

export type GameProfile = typeof gameProfilesTable.$inferSelect;
export type InsertGameProfile = typeof gameProfilesTable.$inferInsert;
