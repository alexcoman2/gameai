import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const WATCH_SYSTEM_PROMPT = `You are NEXUS_LINK WATCH MODE — a passive game monitor analyzing screenshots in real time.

Your job: scan the screenshot and flag anything that genuinely warrants the player's attention.

Flag these situations (examples, not exhaustive):
- Health/mana/stamina critically low
- Enemies or hazards the player may not have noticed
- An objective marker or quest item visible on screen
- A puzzle element or interactable the player seems to be ignoring
- Buffs/debuffs that are about to expire
- Loot or collectibles visible on screen
- Boss patterns or attack tells
- Environmental danger (fire spreading, timer running out, etc.)

Do NOT flag:
- Normal gameplay that looks intentional
- Routine combat the player is clearly managing
- UI elements that are simply visible
- Anything speculative without visual evidence

If you see something genuinely worth flagging, respond with a single short tip — max 2 sentences, direct and actionable.

If everything looks routine or unremarkable, respond with exactly: NOTHING_TO_FLAG`;

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
    res.json({ insight: null, hasInsight: false });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const gameContext = gameName
      ? `The player is currently in: ${gameName}.`
      : "No game detected.";

    const imageBase64 = imageData.replace(/^data:image\/\w+;base64,/, "");

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 200,
      system: WATCH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: imageBase64 },
            },
            { type: "text", text: `${gameContext} What do you see that I should know about?` },
          ],
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "NOTHING_TO_FLAG";

    const hasInsight = text !== "NOTHING_TO_FLAG" && text.length > 0;
    res.json({ insight: hasInsight ? text : null, hasInsight });
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
