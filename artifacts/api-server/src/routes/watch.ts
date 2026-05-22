import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const OBSERVE_SYSTEM_PROMPT = `You are a game state recorder embedded in a gaming assistant app. Analyze the screenshot and respond with ONLY valid JSON — no markdown, no code fences, no explanation.

Return exactly this format:
{
  "gameName": "<the specific game being played, or null if you cannot identify it>",
  "observation": "<1-2 sentence factual description of what you see>"
}

For gameName: identify the game from the HUD, UI elements, art style, characters, or any visible text. Be specific — "Hades II" not "a roguelike", "Elden Ring" not "a Soulslike". Return null if you genuinely cannot identify it. Do NOT guess if unsure.

For observation: ALWAYS provide a value — never return null. If gameplay is active, describe: current location/area, what the player is doing, health/stamina/mana if visible, enemies or NPCs, notable UI state. If no game is visible, briefly describe what IS on screen (e.g. "Desktop visible with no active game", "Game launcher open", "System menu or Task Manager open"). No tips, no advice — only describe what you see.`;

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

    const imageBase64 = imageData.replace(/^data:image\/\w+;base64,/, "");

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
              source: { type: "base64", media_type: "image/png", data: imageBase64 },
            },
            { type: "text", text: `${gameContext} Respond with JSON only.` },
          ],
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;

    if (!raw) {
      res.json({ observation: null, gameName: null });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { observation?: string | null; gameName?: string | null };
      res.json({
        observation: parsed.observation ?? null,
        gameName: parsed.gameName ?? null,
      });
    } catch {
      // Model returned non-JSON — treat the whole text as an observation, no game name
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
