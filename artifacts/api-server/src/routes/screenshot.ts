import { Router } from "express";
import {
  getLatestScreenshot,
  setLatestScreenshot,
} from "../lib/screenshot-state.js";

const router = Router();

router.post("/screenshot/capture", async (_req, res) => {
  try {
    const screenshot = await import("screenshot-desktop");
    const imgBuffer = await screenshot.default();
    const base64 = imgBuffer.toString("base64");
    const timestamp = new Date().toISOString();
    setLatestScreenshot(base64, timestamp);
    res.json({
      imageData: base64,
      capturedAt: timestamp,
      available: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to capture screenshot: ${message}` });
  }
});

router.get("/screenshot/latest", (_req, res) => {
  const latest = getLatestScreenshot();
  res.json(latest);
});

export default router;
