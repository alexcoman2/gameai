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

// Simple text-only wire format for passing history to the hosted server
type HistoryEntry = { role: "user" | "assistant"; content: string };

let globalHistory: ConversationMessage[] = loadHistory();

// ── Helpers ──────────────────────────────────────────────────────────────────

function toHistoryEntries(history: ConversationMessage[]): HistoryEntry[] {
  return history.map((msg) => {
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      const block = (msg.content as Array<{ type: string; text?: string }>).find(
        (b) => b.type === "text"
      );
      text = block?.text ?? "";
    }
    return { role: msg.role, content: text };
  });
}

function fromHistoryEntries(entries: HistoryEntry[]): ConversationMessage[] {
  return entries.map((e) => ({
    role: e.role,
    content:
      e.role === "user"
        ? ([{ type: "text", text: e.content }] as Anthropic.MessageParam["content"])
        : e.content,
  }));
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.post("/chat/clear", async (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  const hostedUrl = process.env.NEXUS_LINK_API_URL;

  if (hostedUrl) {
    // Proxy mode: clear local state only — hosted server is stateless, nothing to clear there
    if (sessionId) {
      // session clear is handled by the dedicated /sessions/:id/clear endpoint
    } else {
      globalHistory = [];
      clearHistory();
    }
  } else {
    // Direct mode
    if (sessionId) {
      // Handled by sessions route
    } else {
      globalHistory = [];
      clearHistory();
    }
  }

  res.json({ ok: true });
});

router.post("/chat/message", async (req, res) => {
  const {
    message,
    gameName,
    includeScreenshot,
    imageData: reqImageData,
    sessionId,
    history: reqHistory,
  } = req.body as {
    message: string;
    gameName?: string | null;
    includeScreenshot?: boolean;
    imageData?: string | null;
    sessionId?: string | null;
    history?: HistoryEntry[] | null;
  };

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // ── PROXY MODE ──────────────────────────────────────────────────────────────
  // Local Electron server. Loads history from disk, attaches screenshot, then
  // forwards everything to the stateless hosted server. Persists the result.
  const hostedUrl = process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    // Resolve screenshot
    let imageData: string | null = reqImageData ?? null;
    if (!imageData && includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) {
        imageData = latest.imageData;
      }
    }

    // Load conversation history from local disk
    const useSession = sessionId ? getSession(sessionId) !== null : false;
    const localHistory: ConversationMessage[] = useSession
      ? loadSessionHistory(sessionId!)
      : globalHistory;
    const historyEntries = toHistoryEntries(localHistory);

    try {
      const upstream = await fetch(`${hostedUrl}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, gameName, imageData, history: historyEntries }),
      });

      const data = (await upstream.json()) as Record<string, unknown>;

      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }

      const reply = data.reply as string;
      const updatedHistoryRaw = data.updatedHistory as HistoryEntry[] | undefined;

      if (reply && updatedHistoryRaw) {
        const updatedHistory = fromHistoryEntries(updatedHistoryRaw);

        // Persist updated history locally
        if (useSession) {
          saveSessionHistory(sessionId!, updatedHistory);

          const now = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const messageCount = Math.floor(updatedHistory.length / 2);
          const userMsgId = `${Date.now()}-user`;
          const assistantMsgId = `${Date.now() + 1}-assistant`;

          let screenshotRef: string | null = null;
          if (imageData) {
            const clean = imageData.replace(/^data:image\/\w+;base64,/, "");
            saveScreenshotFile(sessionId!, userMsgId, clean);
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
          globalHistory = updatedHistory;
          saveHistory(updatedHistory);
        }
      }

      // Return just the chat response fields (strip updatedHistory from client response)
      res.json({
        reply: data.reply,
        model: data.model,
        tokensUsed: data.tokensUsed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      res.status(502).json({ error: `Failed to reach AI service: ${msg}` });
    }
    return;
  }

  // ── DIRECT MODE ─────────────────────────────────────────────────────────────
  // Running on the hosted Replit server (or local dev without NEXUS_LINK_API_URL).
  // When `history` is provided in the request, operate statelessly — call Claude
  // and return updatedHistory without touching the disk.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "AI service is not configured on the server." });
    return;
  }

  // Stateless mode: history provided by the caller (proxy or external client)
  const stateless = Array.isArray(reqHistory);

  const useSession = !stateless && sessionId ? getSession(sessionId) !== null : false;

  let conversationHistory: ConversationMessage[] = stateless
    ? fromHistoryEntries(reqHistory!)
    : useSession
    ? loadSessionHistory(sessionId!)
    : globalHistory;

  const client = new Anthropic({ apiKey });

  const gameContext = gameName
    ? `The user is currently playing: ${gameName}.`
    : "No game is currently detected.";

  const screenshotContext = imageBase64
    ? `A screenshot of the user's game screen has been automatically captured and attached to this message by the NEXUS_LINK desktop application. Analyze it carefully to give precise, contextual advice based on exactly what you see on screen.`
    : `No screenshot is attached to this message.`;

  const systemPrompt = `You are NEXUS_LINK AI CORE — an expert gaming assistant embedded in a desktop overlay app. You have direct access to the user's game screen through automatic screenshot capture.

${gameContext}

Screenshot status: ${screenshotContext}

Your role:
- Help players who are stuck on puzzles, boss fights, quests, or any gameplay challenge
- Provide tips, strategies, and walkthroughs when asked
- Answer questions about game mechanics, lore, items, and characters
- Be spoiler-conscious: warn before revealing major story spoilers and ask if the user wants them
- Be concise but thorough — gamers want actionable advice, not essays
- When a screenshot is attached, ALWAYS describe what you see on screen first, then give advice based on it
- Never claim you cannot see screenshots — when one is attached to this message, you are seeing a real-time capture of the user's game

Keep responses focused and practical. Format answers with bullet points or numbered steps when giving instructions.`;

  try {
    const userContent: Anthropic.MessageParam["content"] = [];

    // Resolve screenshot (local state only used in non-stateless dev mode)
    let imageBase64: string | null = null;
    if (reqImageData) {
      imageBase64 = reqImageData.replace(/^data:image\/\w+;base64,/, "");
    } else if (!stateless && includeScreenshot) {
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

    userContent.push({ type: "text", text: message.trim() });

    const allMessages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((e) => ({ role: e.role, content: e.content })),
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

    // Build updated history (text-only for user turns)
    const userTextOnly: Anthropic.MessageParam["content"] = [
      { type: "text", text: message.trim() },
    ];
    conversationHistory = [
      ...conversationHistory,
      { role: "user", content: userTextOnly },
      { role: "assistant", content: reply },
    ];

    if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
      conversationHistory = conversationHistory.slice(
        conversationHistory.length - MAX_HISTORY_TURNS * 2
      );
    }

    if (stateless) {
      // Stateless: return updated history to the caller — no disk writes
      res.json({
        reply,
        model: response.model,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        updatedHistory: toHistoryEntries(conversationHistory),
      });
      return;
    }

    // Legacy / dev mode: persist to disk as before
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
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `AI request failed: ${msg}` });
  }
});

export default router;
