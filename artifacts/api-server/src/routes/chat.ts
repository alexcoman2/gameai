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

const MAX_HISTORY_TURNS = 40;

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
    watchLog: reqWatchLog,
  } = req.body as {
    message: string;
    gameName?: string | null;
    includeScreenshot?: boolean;
    imageData?: string | null;
    sessionId?: string | null;
    history?: HistoryEntry[] | null;
    watchLog?: { time: string; note: string }[] | null;
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
        body: JSON.stringify({ message, gameName, imageData, history: historyEntries, watchLog: reqWatchLog }),
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
    ? `The player is currently in: ${gameName}.`
    : "No game is currently detected — the player may be at a menu or launcher.";

  const historyLength = conversationHistory.length / 2;
  const sessionContext = historyLength > 0
    ? `You have been assisting this player for ${Math.round(historyLength)} exchange${historyLength !== 1 ? "s" : ""} this session. Use the full conversation history to maintain continuity — remember what problems they've encountered, what strategies were tried, what areas they've explored, and what help you've already given.`
    : `This is the start of a new session with this player.`;

  const watchLogSection = reqWatchLog && reqWatchLog.length > 0
    ? `\nWATCH LOG — you have ${reqWatchLog.length} passive screen observation${reqWatchLog.length !== 1 ? "s" : ""} recorded by NEXUS_LINK while the player was playing (newest last):\n${reqWatchLog.map(e => `  [${e.time}] ${e.note}`).join("\n")}\nThis IS your log. Use it to understand what has been happening between messages. When the player asks about your logs, reference these entries directly.\n`
    : "\nWATCH LOG — no observations recorded yet this session. Watch Mode is currently off or hasn't fired yet. If the player asks about your logs, explain that NEXUS_LINK's Watch Mode passively records screen observations every 20 seconds when enabled, and they can turn it on using the Watch button in the toolbar to start building a log.\n";

  const systemPrompt = `You are NEXUS_LINK AI CORE — an expert gaming co-pilot embedded as a desktop overlay. You operate as a persistent, session-aware companion throughout the player's entire gameplay session.

GAME: ${gameContext}

SESSION MEMORY: ${sessionContext}
${watchLogSection}
SCREENSHOT: When a screenshot is attached to the current message, it is a real-time capture of the player's screen taken by the NEXUS_LINK app. Always describe what you see before giving advice. Never claim you cannot see screenshots — if one is attached, you are seeing it.

YOUR ROLE:
- Maintain a running mental model of the player's progress, current situation, and past interactions this session
- Reference earlier conversation context naturally ("Earlier you mentioned...", "Since you already tried X...")
- When asked "what's going on" or "what should I do", synthesize the watch log AND conversation history to give a grounded answer
- Help with stuck moments, boss fights, puzzles, quests, builds, and mechanics
- Be spoiler-aware — warn before story spoilers and check if the player wants them
- Be concise and actionable — bullet points and numbered steps for instructions

LOCATION AWARENESS — IMPORTANT:
- When asked where the player is, describe ONLY what the watch log or attached screenshot literally shows (architecture, environment type, enemies, HUD details)
- DO NOT guess or infer a specific named in-game location from your training knowledge alone — you will often be wrong
- Only state a named location (e.g. "Undead Burg", "Firelink Shrine", "Anor Londo") if: (a) it is explicitly visible as text on screen in a screenshot, OR (b) the player has told you where they are in this conversation
- If asked "where am I?" and no location name is on screen, describe the environment from the watch log and say you can see the visual setting but cannot confirm the exact area name without a screenshot showing the location text

You are not a one-shot Q&A bot. You are a co-pilot who has been watching and helping throughout this session.`;

  try {
    const userContent: Anthropic.MessageParam["content"] = [];

    // Resolve screenshot (local state only used in non-stateless dev mode)
    let imageBase64: string | null = null;
    let chatMediaType: "image/png" | "image/jpeg" = "image/png";
    if (reqImageData) {
      const mimeMatch = reqImageData.match(/^data:(image\/\w+);base64,/);
      chatMediaType = mimeMatch?.[1] === "image/jpeg" ? "image/jpeg" : "image/png";
      imageBase64 = reqImageData.replace(/^data:image\/\w+;base64,/, "");
    } else if (!stateless && includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) {
        const mimeMatch = latest.imageData.match(/^data:(image\/\w+);base64,/);
        chatMediaType = mimeMatch?.[1] === "image/jpeg" ? "image/jpeg" : "image/png";
        imageBase64 = latest.imageData.replace(/^data:image\/\w+;base64,/, "");
      }
    }

    if (imageBase64) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: chatMediaType,
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
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
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
