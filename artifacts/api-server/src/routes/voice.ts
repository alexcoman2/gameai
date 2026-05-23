import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { IS_HOSTED } from "../lib/server-mode.js";
import { logger } from "../lib/logger.js";
import { getOrCreateUser, recordUsage } from "../lib/usage.js";
import {
  PLAN_CONFIGS,
  VOICE_STT_MICROCENTS_PER_SECOND,
  VOICE_TTS_MICROCENTS_PER_CHAR,
} from "../lib/plans.js";

const router = Router();

const protect = IS_HOSTED ? [requireAuth] : [];

// Voice is a paid feature — gate on hosted mode where Clerk auth is enforced
// and we have a real userId. Returns 403 if the user's plan does not include
// voice; the client surfaces this as an upgrade prompt.
async function ensureVoiceAllowed(
  userId: string,
  email: string | null | undefined,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const user = await getOrCreateUser(userId, email);
  if (user.isAdmin) return { ok: true };
  const cfg = PLAN_CONFIGS[user.plan];
  if (!cfg.allowsVoice) {
    return {
      ok: false,
      status: 403,
      error: "Voice mode requires a Pro, Pro+, or Elite subscription. Upgrade to enable voice.",
    };
  }
  return { ok: true };
}

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
      const cookieHeader = req.headers.cookie;
      const upstream = await fetch(`${hostedUrl}/api/voice/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
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
    // verbose_json includes a `duration` field (seconds) we use to bill STT
    // at OpenAI's per-second rate. Falls back to a zero-cost record if absent.
    form.append("response_format", "verbose_json");
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

    const data = (await upstream.json()) as { text?: string; duration?: number };
    const durationSec = typeof data.duration === "number" && isFinite(data.duration)
      ? Math.max(0, data.duration)
      : 0;

    // Bill the call. Round up to the nearest second so a 0.3s ping still costs
    // something (matches OpenAI's own billing granularity).
    if (req.userId && durationSec > 0) {
      const cost = Math.ceil(durationSec) * VOICE_STT_MICROCENTS_PER_SECOND;
      try {
        await recordUsage(req.userId, "voice_stt", cost, 0);
      } catch (e) {
        logger.error({ err: e, userId: req.userId }, "Failed to record voice_stt usage");
      }
    }

    res.json({ text: (data.text ?? "").trim() });
  } catch (err) {
    logger.error({ err }, "Failed to transcribe audio");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Transcription error: ${msg}` });
  }
});

// Text-to-speech via OpenAI gpt-4o-mini-tts.
//
//   POST /api/voice/speak
//   { text: "...", voice?: "alloy"|"echo"|"fable"|"onyx"|"nova"|"shimmer",
//     format?: "mp3"|"opus"|"aac"|"flac" }
//   → audio/mpeg bytes (or whichever format requested)
//
// Proxy mode forwards binary straight from hosted. Hosted mode calls OpenAI
// and streams the audio back. Same auth + usage gating as /transcribe.

const ALLOWED_VOICES = new Set([
  "alloy", "echo", "fable", "onyx", "nova", "shimmer",
]);
const ALLOWED_FORMATS = new Set(["mp3", "opus", "aac", "flac"]);
// Cap incoming text. OpenAI's hard cap is 4096 chars; we mirror that.
const MAX_TTS_CHARS = 4096;

router.post("/voice/speak", ...protect, async (req, res) => {
  const { text, voice, format } = req.body as {
    text?: string;
    voice?: string;
    format?: string;
  };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const trimmed = text.slice(0, MAX_TTS_CHARS);
  const chosenVoice = voice && ALLOWED_VOICES.has(voice) ? voice : "nova";
  const chosenFormat = format && ALLOWED_FORMATS.has(format) ? format : "mp3";
  const contentType =
    chosenFormat === "mp3" ? "audio/mpeg"
    : chosenFormat === "opus" ? "audio/ogg"
    : chosenFormat === "aac" ? "audio/aac"
    : "audio/flac";

  // ── PROXY MODE ────────────────────────────────────────────────────────────
  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    try {
      const authHeader = req.headers.authorization;
      const cookieHeader = req.headers.cookie;
      const upstream = await fetch(`${hostedUrl}/api/voice/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({ text: trimmed, voice: chosenVoice, format: chosenFormat }),
      });
      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        res.status(upstream.status).type("application/json").send(
          errText || JSON.stringify({ error: "Upstream TTS failed" })
        );
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", upstream.headers.get("Content-Type") || contentType);
      res.send(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `Failed to reach TTS service: ${msg}` });
    }
    return;
  }

  // ── HOSTED MODE ───────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "TTS is not configured on the server." });
    return;
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        input: trimmed,
        voice: chosenVoice,
        response_format: chosenFormat,
      }),
    });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      logger.error({ status: upstream.status, body: errText.slice(0, 500) }, "TTS request failed");
      res.status(502).json({ error: "TTS failed", detail: errText.slice(0, 300) });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());

    // Bill the call. Charge per character of input text (matches OpenAI's
    // gpt-4o-mini-tts pricing model). Non-fatal — never let a usage write
    // failure block the audio response.
    if (req.userId) {
      const cost = trimmed.length * VOICE_TTS_MICROCENTS_PER_CHAR;
      try {
        await recordUsage(req.userId, "voice_tts", cost, 0);
      } catch (e) {
        logger.error({ err: e, userId: req.userId }, "Failed to record voice_tts usage");
      }
    }

    res.setHeader("Content-Type", contentType);
    res.send(buf);
  } catch (err) {
    logger.error({ err }, "Failed to synthesize speech");
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `TTS error: ${msg}` });
  }
});

export default router;
