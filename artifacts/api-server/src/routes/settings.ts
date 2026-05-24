import { Router } from "express";
import { loadConfig, saveConfig } from "../lib/config.js";

const router = Router();

router.get("/settings", (_req, res) => {
  const config = loadConfig();
  res.json({
    hasSteamApiKey: config.steamApiKey.length > 0,
  });
});

router.post("/settings", (req, res) => {
  const { steamApiKey } = req.body as {
    steamApiKey?: string | null;
  };

  const updates: Parameters<typeof saveConfig>[0] = {};

  if (typeof steamApiKey === "string") {
    updates.steamApiKey = steamApiKey;
  }

  const saved = saveConfig(updates);

  res.json({
    hasSteamApiKey: saved.steamApiKey.length > 0,
  });
});

export default router;
