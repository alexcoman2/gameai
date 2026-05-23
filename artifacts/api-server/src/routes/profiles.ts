import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { IS_HOSTED } from "../lib/server-mode.js";
import {
  listProfiles,
  getProfile,
  deleteProfile,
  normalizeGameKey,
} from "../lib/game-profile.js";

const router = Router();

// Game profile management — hosted-only (profiles live in the hosted DB; the
// local Electron proxy server has no DB and forwards UI calls through the
// existing /api proxy path).
const protect = IS_HOSTED ? [requireAuth] : [];

router.get("/profiles", ...protect, async (req, res) => {
  if (!IS_HOSTED || !req.userId) {
    res.json({ profiles: [] });
    return;
  }
  const rows = await listProfiles(req.userId);
  res.json({
    profiles: rows.map((r) => ({
      gameKey: r.gameKey,
      profile: r.profile,
      updatedAt: r.updatedAt,
    })),
  });
});

router.get("/profiles/:gameKey", ...protect, async (req, res) => {
  if (!IS_HOSTED || !req.userId) {
    res.json({ profile: null });
    return;
  }
  const raw = req.params.gameKey;
  const key = normalizeGameKey(typeof raw === "string" ? raw : null);
  if (!key) {
    res.status(400).json({ error: "invalid gameKey" });
    return;
  }
  const profile = await getProfile(req.userId, key);
  res.json({ profile });
});

router.delete("/profiles/:gameKey", ...protect, async (req, res) => {
  if (!IS_HOSTED || !req.userId) {
    res.json({ ok: true });
    return;
  }
  const raw = req.params.gameKey;
  const key = normalizeGameKey(typeof raw === "string" ? raw : null);
  if (!key) {
    res.status(400).json({ error: "invalid gameKey" });
    return;
  }
  await deleteProfile(req.userId, key);
  res.json({ ok: true });
});

export default router;
