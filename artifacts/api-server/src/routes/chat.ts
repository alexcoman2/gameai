import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getLatestScreenshot } from "../lib/screenshot-state.js";
import { buildSpecialistAddendum, getPreferredWikiDomains } from "../lib/game-knowledge.js";
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
import { requireAuth } from "../middlewares/requireAuth.js";
import { checkUsageCap, recordUsage, calcAnthropicCostMicrocents } from "../lib/usage.js";

const router = Router();

// Explicit deployment mode flag — fail-safe defaults to "hosted" (protected).
// Set AUTH_MODE=proxy on the local Electron-bundled server only, where requests
// are trusted (single-user local machine) and forwarded to the hosted backend
// which performs the real auth check.
const AUTH_MODE = (process.env.AUTH_MODE ?? "hosted") as "hosted" | "proxy";
const IS_HOSTED = AUTH_MODE === "hosted";
const protect = IS_HOSTED ? [requireAuth] : [];

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
  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;

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

router.post("/chat/message", ...protect, async (req, res) => {
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
    watchLog?: { time: string; note: string; event?: string | null; confidence?: number | null; visibleText?: string | null }[] | null;
  };

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Usage cap check (hosted mode only)
  if (IS_HOSTED && req.userId) {
    const cap = await checkUsageCap(req.userId, "chat", req.userEmail);
    if (!cap.allowed) {
      res.status(402).json({ error: cap.reason, plan: cap.plan, usage: cap.monthly });
      return;
    }
  }

  // ── PROXY MODE ──────────────────────────────────────────────────────────────
  // Local Electron server. Loads history from disk, attaches screenshot, then
  // forwards everything to the stateless hosted server. Persists the result.
  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
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
  // Running on the hosted Replit server (or local dev without UNSTUCK_API_URL).
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

  // Filter out very low confidence observations to keep context clean
  const usableLog = (reqWatchLog ?? []).filter(
    (e) => typeof e.confidence !== "number" || e.confidence >= 0.5
  );
  const watchLogSection = usableLog.length > 0
    ? `\nWATCH LOG — ${usableLog.length} passive screen observation${usableLog.length !== 1 ? "s" : ""} recorded by Unstuck while the player was playing (newest last):\n${usableLog.map(e => {
        const tag = e.event ? `[${e.event}] ` : "";
        const txt = e.visibleText ? ` — text: "${e.visibleText}"` : "";
        return `  [${e.time}] ${tag}${e.note}${txt}`;
      }).join("\n")}\nThis IS your log. Use it to understand what has been happening between messages. Bracketed tags ([combat], [boss], [menu], etc.) indicate the event type. "text:" fields are verbatim transcriptions of on-screen text — treat them as ground truth.\n`
    : "\nWATCH LOG — no observations recorded yet this session. Watch Mode is currently off or hasn't fired yet. If the player asks about your logs, explain that Unstuck's Watch Mode passively records screen observations every 5 seconds when enabled, and they can turn it on using the Watch button in the toolbar to start building a log.\n";

  const specialistKnowledge = buildSpecialistAddendum(gameName);

  const systemPrompt = `You are UNSTUCK — a master-level gaming expert and co-pilot embedded as a desktop overlay. Your job is to get the player unstuck: when they're lost, blocked on a boss, unsure what build or gear to use, don't know where to go next, or can't figure out a mechanic, you give them the clearest, most actionable answer in seconds. You have encyclopaedic, pro-player knowledge of every game you know: every area, every enemy, every boss pattern, every hidden item, every shortcut, every optimal route, every build, every exploit. You have mentally completed these games dozens of times and know them better than most players ever will.

GAME: ${gameContext}

SESSION MEMORY: ${sessionContext}
${watchLogSection}
SCREENSHOT: When a screenshot is attached, it is a real-time capture of the player's screen. Use it to identify exactly where the player is and what situation they are in — then immediately apply your expert game knowledge to that situation. Do not just describe the screenshot; use it as your context signal to give targeted expert advice. Never claim you cannot see screenshots — if one is attached, you are seeing it.

HOW YOU GIVE ADVICE:
- Lead with expert knowledge, not description. Apply your pro-level game knowledge directly to the situation.
- Match your reply length to the question. Short tactical questions ("where do I go?", "how do I beat this?") get one or two sentences. Big questions ("compare endgame builds for my class") get a real breakdown. Default toward brevity.
- No preamble, no restating the question, no closing summaries. Just answer.
- Default to plain prose. Only use bullet lists or headers when actually enumerating multiple distinct items (e.g. comparing builds, listing steps). Never format a short answer as a list.
- Don't volunteer extras unless they're genuinely critical — e.g. the player is walking into something that will wipe their progress or lock them out of content. Skip lore asides, fun facts, "btw" tips, and "you might also want to know" tangents. If the player wants more, they'll ask.
- Reference earlier conversation naturally when relevant ("You already tried that — switch to [X]"), but don't recap the session unprompted.
- When a player asks "what should I do?" or "where should I go?", give one concrete optimal answer grounded in your game knowledge — not a menu of options.

SPOILERS: Warn before revealing story spoilers and check if the player wants them. Gameplay spoilers (enemy locations, shortcuts, item locations) are fair game — that's what the player is here for.

RESOURCE AWARENESS: Factor the player's current state from the watch log into your advice — health, stamina, currency, ammo, cooldowns, or whatever resource matters in this game. If they're in a risky state (low health, about to lose progress, insufficient resources for the next challenge), flag it and advise accordingly before they walk into trouble.${specialistKnowledge}`;


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

    // Web search tool — Claude calls this autonomously when it needs fresh info
    const exaApiKey = process.env.EXA_API_KEY;
    const tools: Anthropic.Tool[] = exaApiKey ? [
      {
        name: "web_search",
        description: "Search the web for up-to-date gaming information: patch notes, balance changes, current meta builds, tier lists, wiki lookups, community discoveries, or anything that may have changed since your training cutoff. Use this whenever the player asks about recent updates, current season content, or anything you're uncertain is still accurate.",
        input_schema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Search query. Be specific — include game name, patch/season if relevant (e.g. 'Dark Souls Remastered best early game weapons 2024', 'Diablo IV season 8 best build necromancer').",
            },
          },
          required: ["query"],
        },
      },
    ] : [];

    // Agentic loop: Claude may call web_search one or more times before replying
    const loopMessages = [...allMessages];
    const cachedSystem = [
      { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
    ];
    let response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      system: cachedSystem,
      messages: loopMessages,
      ...(tools.length > 0 ? { tools, tool_choice: { type: "auto" } } : {}),
    });

    while (response.stop_reason === "tool_use") {
      const toolUseBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!toolUseBlock) break;

      loopMessages.push({ role: "assistant", content: response.content });

      let toolResult = "";
      if (toolUseBlock.name === "web_search" && exaApiKey) {
        try {
          const input = toolUseBlock.input as { query: string };
          const preferredDomains = getPreferredWikiDomains(gameName);
          console.log(`[chat] web_search: "${input.query}"${preferredDomains.length ? ` [biased: ${preferredDomains.join(",")}]` : ""}`);
          const searchRes = await fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": exaApiKey,
            },
            body: JSON.stringify({
              query: input.query,
              numResults: 5,
              contents: { text: { maxCharacters: 800 } },
              ...(preferredDomains.length > 0 ? { includeDomains: preferredDomains } : {}),
            }),
          });
          if (searchRes.ok) {
            const data = await searchRes.json() as { results?: Array<{ title?: string; url?: string; text?: string }> };
            const results = data.results ?? [];
            toolResult = results.map((r, i) =>
              `[${i + 1}] ${r.title ?? "No title"}\n${r.url ?? ""}\n${r.text ?? ""}`.trim()
            ).join("\n\n");
            if (!toolResult) toolResult = "No results found.";
          } else {
            toolResult = `Search failed: HTTP ${searchRes.status}`;
          }
        } catch (e) {
          toolResult = `Search error: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        toolResult = "Tool not available.";
      }

      loopMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: toolResult }],
      });

      response = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 2048,
        system: cachedSystem,
        messages: loopMessages,
        tools,
        tool_choice: { type: "auto" },
      });
    }

    const replyBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const reply = replyBlock ? replyBlock.text : "No response generated.";

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

    // Record usage (hosted mode only)
    if (IS_HOSTED && req.userId) {
      const cost = calcAnthropicCostMicrocents({
        model: "opus",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens,
        cacheCreationInputTokens: (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens,
      });
      await recordUsage(req.userId, "chat", cost, 0);
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
