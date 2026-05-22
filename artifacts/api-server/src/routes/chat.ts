import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getLatestScreenshot } from "../lib/screenshot-state.js";
import {
  loadHistory,
  saveHistory,
  clearHistory,
} from "../lib/conversation-history.js";
import {
  getSession,
  loadSessionHistory,
  saveSessionHistory,
  appendSessionMessages,
  updateSession,
  saveScreenshotFile,
} from "../lib/sessions-store.js";

const router = Router();

const MAX_HISTORY_TURNS = 20;

type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

let globalHistory: ConversationMessage[] = loadHistory();

router.post("/chat/clear", async (_req, res) => {
  globalHistory = [];
  clearHistory();

  const hostedUrl = process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    try {
      await fetch(`${hostedUrl}/api/chat/clear`, { method: "POST" });
    } catch {
      // best-effort — clear local state regardless
    }
  }

  res.json({ ok: true });
});

router.post("/chat/message", async (req, res) => {
  const { message, gameName, includeScreenshot, imageData: reqImageData, sessionId } =
    req.body as {
      message: string;
      gameName?: string | null;
      includeScreenshot?: boolean;
      imageData?: string | null;
      sessionId?: string | null;
    };

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // ── PROXY MODE ─────────────────────────────────────────────────────────────
  // When NEXUS_LINK_API_URL is set (Electron packaged build) this server has no
  // API key. It grabs the local screenshot and forwards the request to the
  // hosted server which holds the key.
  const hostedUrl = process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    let imageData: string | null = reqImageData ?? null;

    if (!imageData && includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) {
        imageData = latest.imageData;
      }
    }

    try {
      const upstream = await fetch(`${hostedUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, gameName, imageData }),
      });

      const data = await upstream.json() as Record<string, unknown>;
      res.status(upstream.status).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `Failed to reach AI service: ${msg}` });
    }
    return;
  }

  // ── DIRECT MODE ────────────────────────────────────────────────────────────
  // Running on the hosted Replit server — API key is available here.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res
      .status(500)
      .json({ error: "AI service is not configured on the server." });
    return;
  }

  const useSession = sessionId ? getSession(sessionId) !== null : false;

  let conversationHistory: ConversationMessage[] = useSession
    ? loadSessionHistory(sessionId!)
    : globalHistory;

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

    // Accept imageData from the request body (sent by proxy) or from local state
    let imageBase64: string | null = null;
    if (reqImageData) {
      // Strip data URL prefix if present
      imageBase64 = reqImageData.replace(/^data:image\/\w+;base64,/, "");
    } else if (includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) {
        imageBase64 = latest.imageData;
      }
    }

    if (imageBase64) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: imageBase64,
        },
      });
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

    if (useSession) {
      saveSessionHistory(sessionId!, conversationHistory);

      const now = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const messageCount = Math.floor(conversationHistory.length / 2);
      const userMsgId = `${Date.now()}-user`;
      const assistantMsgId = `${Date.now() + 1}-assistant`;

      let screenshotRef: string | null = null;
      if (imageBase64) {
        saveScreenshotFile(sessionId!, userMsgId, imageBase64);
        screenshotRef = `file:${userMsgId}`;
      }

      appendSessionMessages(sessionId!, [
        {
          id: userMsgId,
          role: "user",
          content: message.trim(),
          timestamp: now,
          screenshot: screenshotRef,
        },
        {
          id: assistantMsgId,
          role: "assistant",
          content: reply,
          timestamp: now,
          screenshot: null,
        },
      ]);
      updateSession(sessionId!, {
        updatedAt: new Date().toISOString(),
        messageCount,
        gameContext: gameName ?? null,
      });
    } else {
      globalHistory = conversationHistory;
      saveHistory(conversationHistory);
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
          error: "Invalid Claude API key. Please check server configuration.",
        });
        return;
      }
      res.status(500).json({ error: `Claude API error: ${err.message}` });
      return;
    }
    const message_err = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `AI request failed: ${message_err}` });
  }
});

export default router;
