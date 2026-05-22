import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getLatestScreenshot } from "../lib/screenshot-state.js";

const router = Router();

const MAX_HISTORY_TURNS = 20;

type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

let conversationHistory: ConversationMessage[] = [];

router.post("/chat/clear", (_req, res) => {
  conversationHistory = [];
  res.json({ ok: true });
});

router.post("/chat/message", async (req, res) => {
  const { message, gameName, includeScreenshot } = req.body as {
    message: string;
    gameName?: string | null;
    includeScreenshot?: boolean;
  };

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI service is not configured on the server." });
    return;
  }

  const client = new Anthropic({ apiKey });

  const gameContext = gameName
    ? `The user is currently playing: ${gameName}.`
    : "No game is currently detected.";

  const systemPrompt = `You are an expert AI gaming assistant helping a player with their single-player game.

${gameContext}

Your role:
- Help players who are stuck on puzzles, boss fights, quests, or any gameplay challenge
- Provide tips, strategies, and walkthroughs when asked
- Answer questions about game mechanics, lore, items, and characters
- Be spoiler-conscious: warn before revealing major story spoilers and ask if the user wants them
- Be concise but thorough — gamers want actionable advice, not essays
- If you can see a screenshot, use it to give more precise, contextual advice
- If no game is detected but the user mentions one, help them with that game

Keep responses focused and practical. Format answers with bullet points or numbered steps when giving instructions.`;

  try {
    const userContent: Anthropic.MessageParam["content"] = [];

    if (includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) {
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: latest.imageData,
          },
        });
      }
    }

    userContent.push({
      type: "text",
      text: message.trim(),
    });

    const historyMessages: Anthropic.MessageParam[] = conversationHistory.map(
      (entry) => ({
        role: entry.role,
        content: entry.content,
      })
    );

    const allMessages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: "user", content: userContent },
    ];

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: allMessages,
    });

    const replyBlock = response.content[0];
    const reply =
      replyBlock && replyBlock.type === "text"
        ? replyBlock.text
        : "No response generated.";

    const userTextOnly: Anthropic.MessageParam["content"] = [
      { type: "text", text: message.trim() },
    ];
    conversationHistory.push({ role: "user", content: userTextOnly });
    conversationHistory.push({ role: "assistant", content: reply });

    if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
      conversationHistory = conversationHistory.slice(
        conversationHistory.length - MAX_HISTORY_TURNS * 2
      );
    }

    res.json({
      reply,
      model: response.model,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      if (err.status === 401) {
        res.status(400).json({
          error: "Invalid Claude API key. Please check your settings.",
        });
        return;
      }
      res
        .status(500)
        .json({ error: `Claude API error: ${err.message}` });
      return;
    }
    const message_err = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `AI request failed: ${message_err}` });
  }
});

export default router;
