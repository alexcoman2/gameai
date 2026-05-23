import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/requireAuth.js";
import { checkUsageCap, recordUsage, calcAnthropicCostMicrocents } from "../lib/usage.js";
import { IS_HOSTED } from "../lib/server-mode.js";

const router = Router();

const protect = IS_HOSTED ? [requireAuth] : [];
const WATCH_INTERVAL_SECONDS = 5;

const OBSERVE_SYSTEM_PROMPT = `You are a game state recorder embedded in a gaming assistant overlay app. The screenshot may show a game in the background with a dark semi-transparent overlay panel (the gaming assistant UI) covering part of the screen — this is normal and expected. Analyze what is visible and respond with ONLY valid JSON — no markdown, no code fences, no explanation.

Return exactly this format:
{
  "gameName": "<the specific game being played, or null if you cannot identify it>",
  "observation": "<1-2 sentence factual description of what you literally see>",
  "event": "<one of: exploring | combat | boss | menu | inventory | dialogue | cutscene | loading | death | item_pickup | level_up | other | not_gaming>",
  "confidence": <number 0.0-1.0 reflecting how certain you are about the observation>,
  "visibleText": "<exact text visible on screen (item names, location labels, dialogue, HUD numbers, quest text), concatenated with semicolons; empty string if no readable text>"
}

For gameName: identify the game from ANY visible portion — HUD, skill bars, health globes, minimap, art style, characters, world, or text. Be specific — "Diablo IV" not "an ARPG", "Dark Souls Remastered" not "a Soulslike". If a game hint is provided and you see consistent content, confirm it. Only return null if you see absolutely no game content.

For observation: describe ONLY what you literally see. Keep to 1-2 sentences max — prefer specific visual details over generic ones.
- DO NOT guess location names from memory — only name a location if you can READ it on screen. Describe what the environment looks like instead (e.g. "crumbling stone cathedral with stained-glass windows and a fog gate" not "Anor Londo").
- Include HUD state: health/stamina/mana levels, currency, equipped weapon, active effects — only if visible.

For event: classify what the player is doing right now. "boss" only if a boss healthbar is visible or you see a large named enemy. "combat" for regular enemy fights. "menu"/"inventory"/"dialogue"/"cutscene" when those UIs dominate the screen. "death" when a "You Died"-style screen is shown. "not_gaming" when no game content is visible.

For confidence: 0.9+ = clear and certain; 0.6-0.8 = mostly sure but some ambiguity; below 0.6 = guessing. Use low confidence honestly — downstream filtering depends on this.

For visibleText: transcribe text VERBATIM from the screen. Item names, location labels at top of screen, dialogue, quest objectives, HUD numbers (e.g. "HP 245/300; Souls 2840"). This is ground truth — do not paraphrase.`;

router.post("/chat/watch", ...protect, async (req, res) => {
  const { imageData, gameName } = req.body as {
    imageData?: string | null;
    gameName?: string | null;
  };

  // Usage cap check (hosted mode only)
  if (IS_HOSTED && req.userId) {
    const cap = await checkUsageCap(req.userId, "watch", req.userEmail);
    if (!cap.allowed) {
      res.status(402).json({ error: cap.reason, plan: cap.plan, usage: cap.monthly });
      return;
    }
  }

  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    try {
      const authHeader = req.headers.authorization;
      const upstream = await fetch(`${hostedUrl}/api/chat/watch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ imageData, gameName }),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `Failed to reach AI service: ${msg}` });
    }
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI service is not configured." });
    return;
  }

  if (!imageData) {
    res.json({ observation: null, gameName: null });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const gameContext = gameName
      ? `The user believes they are playing: ${gameName}. Confirm or correct this in the gameName field.`
      : "Game is unknown — identify it if possible.";

    // Extract the real media type from the data URL before stripping the prefix.
    const mimeMatch = imageData.match(/^data:(image\/\w+);base64,/);
    const declaredType = mimeMatch?.[1] ?? "image/png";
    const rawBase64 = imageData.replace(/^data:image\/\w+;base64,/, "");

    // Anthropic hard limit is 5 MB decoded. Compress to JPEG if needed.
    // Uses a dynamic import so sharp's native binaries are optional — the
    // Electron bundled server never reaches this path (it proxies to hosted),
    // but if it does, missing sharp is caught gracefully.
    const MAX_BYTES = 4_500_000;
    let imageBase64 = rawBase64;
    let mediaType: "image/png" | "image/jpeg" = declaredType === "image/jpeg" ? "image/jpeg" : "image/png";
    if (Buffer.byteLength(rawBase64, "base64") > MAX_BYTES) {
      try {
        const sharp = (await import("sharp")).default;
        const compressed = await sharp(Buffer.from(rawBase64, "base64"))
          .resize({ width: 1280, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        imageBase64 = compressed.toString("base64");
        mediaType = "image/jpeg";
      } catch {
        // sharp not available in this environment — send as-is
      }
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: OBSERVE_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text: `${gameContext} Respond with JSON only.` },
          ],
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;

    // Record usage (hosted mode only)
    if (IS_HOSTED && req.userId) {
      const cost = calcAnthropicCostMicrocents({
        model: "haiku",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens,
        cacheCreationInputTokens: (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens,
      });
      await recordUsage(req.userId, "watch", cost, WATCH_INTERVAL_SECONDS);
    }

    console.log(`[watch] raw model output: ${raw}`);

    if (!raw) {
      res.json({ observation: null, gameName: null });
      return;
    }

    // Strip markdown code fences the model sometimes adds despite instructions
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const parsed = JSON.parse(cleaned) as {
        observation?: string | null;
        gameName?: string | null;
        event?: string | null;
        confidence?: number | null;
        visibleText?: string | null;
      };
      console.log(`[watch] parsed => game="${parsed.gameName}" event="${parsed.event}" conf=${parsed.confidence} obs="${parsed.observation?.slice(0, 60)}"`);
      res.json({
        observation: parsed.observation ?? null,
        gameName: parsed.gameName ?? null,
        event: parsed.event ?? null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        visibleText: parsed.visibleText ?? null,
      });
    } catch {
      // Still not valid JSON — use as raw observation
      console.log(`[watch] non-JSON response, using as raw observation`);
      res.json({ observation: cleaned, gameName: null, event: null, confidence: null, visibleText: null });
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`[watch] Anthropic API error status=${err.status} message=${err.message}`);
      res.status(500).json({ error: `Claude API error: ${err.message}` });
      return;
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[watch] unexpected error: ${msg}`);
    res.status(500).json({ error: `Watch request failed: ${msg}` });
  }
});

export default router;
