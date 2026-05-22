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
    hasApiKey: Boolean(config.apiKey),
    screenshotInterval: config.screenshotInterval,
    autoCapture: config.autoCapture,
  });
});

router.post("/settings", (req, res) => {
  const { apiKey, screenshotInterval, autoCapture } = req.body as {
    apiKey?: string | null;
    screenshotInterval?: number | null;
    autoCapture?: boolean | null;
  };

  const updates: Parameters<typeof saveConfig>[0] = {};

  if (apiKey !== undefined) {
    updates.apiKey = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null;
  }
  if (typeof screenshotInterval === "number") {
    updates.screenshotInterval = screenshotInterval;
  }
  if (typeof autoCapture === "boolean") {
    updates.autoCapture = autoCapture;
  }

  const saved = saveConfig(updates);

  if (saved.autoCapture) {
    startAutoCapture(saved.screenshotInterval);
  } else {
    stopAutoCapture();
  }

  res.json({
    hasApiKey: Boolean(saved.apiKey),
    screenshotInterval: saved.screenshotInterval,
    autoCapture: saved.autoCapture,
  });
});

export default router;
