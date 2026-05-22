import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const OBSERVE_SYSTEM_PROMPT = `You are a game state recorder embedded in a gaming assistant app. Your only job is to describe what you see in the screenshot in 1-2 sentences — factual, specific, no advice.

Include: current location or area (if identifiable), what the player appears to be doing, health/stamina/mana if visible, any enemies or NPCs present, any notable UI elements (quest markers, timers, low resources).

Examples of good observations:
- "Player is in a dark cave area with ~40% health, facing two skeleton archers near a locked gate."
- "Inventory screen open showing 3 empty slots; player appears to be managing equipment."
- "Cutscene playing — no gameplay visible."
- "Player is running through a forest area at full health, no enemies visible."

Be factual and brief. No tips, no warnings, no suggestions. Just describe what you see.`;

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
    res.json({ observation: null });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const gameContext = gameName
      ? `Game: ${gameName}.`
      : "Game unknown.";

    const imageBase64 = imageData.replace(/^data:image\/\w+;base64,/, "");

    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 120,
      system: OBSERVE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: imageBase64 },
            },
            { type: "text", text: `${gameContext} Describe what you see.` },
          ],
        },
      ],
    });

    const observation =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : null;

    res.json({ observation });
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
