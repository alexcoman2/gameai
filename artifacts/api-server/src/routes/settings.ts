import { Router } from "express";
import { loadConfig, saveConfig } from "../lib/config.js";
import {
  startAutoCapture,
  stopAutoCapture,
} from "../lib/screenshot-state.js";

const router = Router();

router.get("/settings", (_req, res) => {
  const config = loadConfig();
  res.json({
    screenshotInterval: config.screenshotInterval,
    autoCapture: config.autoCapture,
    hasSteamApiKey: config.steamApiKey.length > 0,
  });
});

router.post("/settings", (req, res) => {
  const { screenshotInterval, autoCapture, steamApiKey } = req.body as {
    screenshotInterval?: number | null;
    autoCapture?: boolean | null;
    steamApiKey?: string | null;
  };

  const updates: Parameters<typeof saveConfig>[0] = {};

  if (typeof screenshotInterval === "number") {
    updates.screenshotInterval = screenshotInterval;
  }
  if (typeof autoCapture === "boolean") {
    updates.autoCapture = autoCapture;
  }
  if (typeof steamApiKey === "string") {
    updates.steamApiKey = steamApiKey;
  }

  const saved = saveConfig(updates);

  if (saved.autoCapture) {
    startAutoCapture(saved.screenshotInterval);
  } else {
    stopAutoCapture();
  }

  res.json({
    screenshotInterval: saved.screenshotInterval,
    autoCapture: saved.autoCapture,
    hasSteamApiKey: saved.steamApiKey.length > 0,
  });
});

export default router;
