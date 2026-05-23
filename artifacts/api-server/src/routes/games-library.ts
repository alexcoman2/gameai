import { Router } from "express";
import { listSupportedGames } from "../lib/game-knowledge.js";

const router = Router();

/**
 * Public catalog of games Unstuck has specialist proficiency for.
 * Each entry has a stable id, display name, genre, one-line tagline, and
 * the authoritative wiki domains used to ground web-search results.
 */
router.get("/games/library", (_req, res) => {
  const games = listSupportedGames().sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  res.json({
    count: games.length,
    games,
  });
});

export default router;
