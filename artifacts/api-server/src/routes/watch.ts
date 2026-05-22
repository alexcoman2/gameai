import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const OBSERVE_SYSTEM_PROMPT = `You are a game state recorder embedded in a gaming assistant overlay app. The screenshot may show a game in the background with a dark semi-transparent overlay panel (the gaming assistant UI) covering part of the screen — this is normal and expected. Analyze what is visible and respond with ONLY valid JSON — no markdown, no code fences, no explanation.

Return exactly this format:
{
  "gameName": "<the specific game being played, or null if you cannot identify it>",
  "observation": "<2-3 sentence factual description of what you literally see>"
}

For gameName: identify the game from ANY visible portion — HUD elements, skill bars, health globes, minimap, art style, characters, game world, or any text. Be specific — "Diablo IV" not "an ARPG", "Dark Souls Remastered" not "a Soulslike". If a game hint is provided and you can see ANY game-like content consistent with it, confirm that name. Only return null if you see absolutely no game content.

For observation: describe ONLY what you can literally see in this specific screenshot. Be precise about visual details:
- Environment: architecture style, materials (stone/wood/metal), lighting (torch-lit/sunlit/dark), colours, structures visible
- Characters: player position, what they are doing (standing/fighting/exploring), enemy types and positions if visible
- HUD: health/stamina/mana bars and approximate levels, souls/currency count, equipped weapon, active effects
- DO NOT guess or assume the location name from memory — only name a location if you can read it on screen as text. Instead describe what the environment looks like (e.g. "a crumbling stone cathedral with tall stained-glass windows and a fog gate ahead" not "Anor Londo"). If you see a bonfire, name it only if its label is visible on screen.
- If no game is visible, briefly describe what IS on screen. No tips, no advice — only describe what you see.`;

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

    // Strip markdown code fences the model sometimes adds despite instructions
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    try {
      const parsed = JSON.parse(cleaned) as { observation?: string | null; gameName?: string | null };
      console.log(`[watch] parsed => gameName="${parsed.gameName}" observation="${parsed.observation?.slice(0, 80)}"`);
      res.json({
        observation: parsed.observation ?? null,
        gameName: parsed.gameName ?? null,
      });
    } catch {
      // Still not valid JSON — use as raw observation
      console.log(`[watch] non-JSON response, using as raw observation`);
      res.json({ observation: cleaned, gameName: null });
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
