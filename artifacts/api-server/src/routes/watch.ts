import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const router = Router();

const OBSERVE_SYSTEM_PROMPT = `You are a game state recorder embedded in a gaming assistant overlay app. The screenshot may show a game in the background with a dark semi-transparent overlay panel (the gaming assistant UI) covering part of the screen — this is normal and expected. Analyze what is visible and respond with ONLY valid JSON — no markdown, no code fences, no explanation.

Return exactly this format:
{
  "gameName": "<the specific game being played, or null if you cannot identify it>",
  "observation": "<1-2 sentence factual description of what you see>"
}

For gameName: identify the game from ANY visible portion — HUD elements, skill bars, health globes, minimap, art style, characters, game world, or any text. Be specific — "Diablo IV" not "an ARPG", "Elden Ring" not "a Soulslike". If a game hint is provided and you can see ANY game-like content consistent with it, confirm that name. Only return null if you see absolutely no game content (e.g. only desktop, browser, or the overlay itself with no game behind it).

For observation: ALWAYS provide a value — never return null. Focus on the game content visible behind the overlay. Describe: current location/area, what the player is doing, health/resources if visible, enemies or NPCs, notable UI state. If no game is visible at all, briefly describe what IS on screen. No tips, no advice — only describe what you see.`;

router.post("/chat/watch", async (req, res) => {
  const { imageData, gameName } = req.body as {
    imageData?: string | null;
    gameName?: string | null;
  };

  const hostedUrl = process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    try {
      const upstream = await fetch(`${hostedUrl}/api/chat/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    const rawBase64 = imageData.replace(/^data:image\/\w+;base64,/, "");

    // Anthropic hard limit is 5 MB decoded. Compress to JPEG if needed.
    const MAX_BYTES = 4_500_000;
    let imageBase64 = rawBase64;
    let mediaType: "image/png" | "image/jpeg" = "image/png";
    if (Buffer.byteLength(rawBase64, "base64") > MAX_BYTES) {
      const compressed = await sharp(Buffer.from(rawBase64, "base64"))
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      imageBase64 = compressed.toString("base64");
      mediaType = "image/jpeg";
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: OBSERVE_SYSTEM_PROMPT,
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

    console.log(`[watch] raw model output: ${raw}`);

    if (!raw) {
      res.json({ observation: null, gameName: null });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { observation?: string | null; gameName?: string | null };
      console.log(`[watch] parsed => gameName="${parsed.gameName}" observation="${parsed.observation?.slice(0, 80)}"`);
      res.json({
        observation: parsed.observation ?? null,
        gameName: parsed.gameName ?? null,
      });
    } catch {
      // Model returned non-JSON — treat the whole text as an observation, no game name
      console.log(`[watch] non-JSON response, using as raw observation`);
      res.json({ observation: raw, gameName: null });
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      res.status(500).json({ error: `Claude API error: ${err.message}` });
      return;
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Watch request failed: ${msg}` });
  }
});

export default router;
