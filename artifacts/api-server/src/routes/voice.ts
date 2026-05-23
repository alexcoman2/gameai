import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { IS_HOSTED } from "../lib/server-mode.js";
import { logger } from "../lib/logger.js";

const router = Router();

const protect = IS_HOSTED ? [requireAuth] : [];

// Speech-to-text via OpenAI Whisper.
//
// Wire format is JSON-with-base64 (matching how chat.ts ships screenshots):
//   POST /api/voice/transcribe
//   { audio: "<base64>", mimeType: "audio/webm", language?: "en" }
//   → { text: "transcribed string" }
//
// In proxy mode (Electron app) the local server forwards the JSON straight
// to the hosted deployment. In hosted mode we reconstruct multipart form
// data and POST to OpenAI. This keeps the OpenAI key off the desktop and
// lets us enforce the same Clerk auth / usage tracking as other routes.

router.post("/voice/transcribe", ...protect, async (req, res) => {
  const { audio, mimeType, language } = req.body as {
    audio?: string;
    mimeType?: string;
    language?: string;
  };

  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio (base64) is required" });
    return;
  }

  // ── PROXY MODE ────────────────────────────────────────────────────────────
  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    try {
      const authHeader = req.headers.authorization;
      const upstream = await fetch(`${hostedUrl}/api/voice/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ audio, mimeType, language }),
      });
      const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `Failed to reach transcription service: ${msg}` });
    }
    return;
  }

  // ── HOSTED MODE ───────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Transcription is not configured on the server." });
    return;
  }

  try {
    // Decode the base64 payload into a Buffer, then wrap in a Blob so we can
    // POST multipart/form-data to OpenAI without a third-party form library.
    const cleaned = audio.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(cleaned, "base64");
    if (bytes.length === 0) {
      res.status(400).json({ error: "audio is empty" });
      return;
    }
    if (bytes.length > 25 * 1024 * 1024) {
      // OpenAI Whisper hard cap is 25 MB.
      res.status(413).json({ error: "audio exceeds 25 MB Whisper limit" });
      return;
    }

    const inferredMime = mimeType && mimeType.startsWith("audio/") ? mimeType : "audio/webm";
    // OpenAI infers format from the filename extension, so name it accordingly.
    const ext = inferredMime.includes("mp4")
      ? "mp4"
      : inferredMime.includes("ogg")
      ? "ogg"
      : inferredMime.includes("mpeg") || inferredMime.includes("mp3")
      ? "mp3"
      : inferredMime.includes("wav")
      ? "wav"
      : "webm";

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: inferredMime }), `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("response_format", "json");
    if (language) form.append("language", language);

    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      logger.error({ status: upstream.status, body: errText.slice(0, 500) }, "Whisper request failed");
      res.status(502).json({ error: "Transcription failed", detail: errText.slice(0, 300) });
      return;
    }

    const data = (await upstream.json()) as { text?: string };
    res.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    logger.error({ err }, "Failed to transcribe audio");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Transcription error: ${msg}` });
  }
});

export default router;
