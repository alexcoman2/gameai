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
import { IS_HOSTED } from "../lib/server-mode.js";

const router = Router();

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
    watchMode: reqWatchMode,
  } = req.body as {
    message: string;
    gameName?: string | null;
    includeScreenshot?: boolean;
    imageData?: string | null;
    sessionId?: string | null;
    history?: HistoryEntry[] | null;
    watchLog?: { time: string; note: string; event?: string | null; confidence?: number | null; visibleText?: string | null }[] | null;
    watchMode?: boolean | null;
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
      const authHeader = req.headers.authorization;
      const upstream = await fetch(`${hostedUrl}/api/chat/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ message, gameName, imageData, history: historyEntries, watchLog: reqWatchLog, watchMode: reqWatchMode }),
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

  // Keep almost everything — the previous 0.5 cutoff silently dropped a
  // huge fraction of observations (the observe prompt itself calls 0.6-0.8
  // "mostly sure but some ambiguity"), which left the model with an empty
  // log even while watch was actively running. Only filter out the
  // genuinely-no-signal cases.
  const usableLog = (reqWatchLog ?? []).filter(
    (e) => typeof e.confidence !== "number" || e.confidence >= 0.25
  );
  const watchModeOn = reqWatchMode === true;
  const watchLogSection = usableLog.length > 0
    ? `\nWATCH LOG — Watch Mode is ON. ${usableLog.length} passive screen observation${usableLog.length !== 1 ? "s" : ""} recorded by Unstuck while the player was playing (newest last):\n${usableLog.map(e => {
        const tag = e.event ? `[${e.event}] ` : "";
        const txt = e.visibleText ? ` — text: "${e.visibleText}"` : "";
        return `  [${e.time}] ${tag}${e.note}${txt}`;
      }).join("\n")}\nThis IS your log. Use it to understand what has been happening between messages. Bracketed tags ([combat], [boss], [menu], etc.) indicate the event type. "text:" fields are verbatim transcriptions of on-screen text — treat them as ground truth.\n`
    : watchModeOn
    ? `\nWATCH LOG — Watch Mode is ON and actively running, but no observations have been captured yet (it samples every ~5 seconds, or low-confidence frames are filtered out). If the player asks whether Watch Mode is on, confirm that it is — observations will start appearing shortly.\n`
    : `\nWATCH LOG — Watch Mode is currently OFF. If the player asks about your logs, explain that Unstuck's Watch Mode passively records screen observations every 5 seconds when enabled, and they can turn it on using the Watch button in the toolbar to start building a log.\n`;

  const specialistKnowledge = buildSpecialistAddendum(gameName);

  const systemPrompt = `You are UNSTUCK — a knowledgeable gaming co-pilot embedded as a desktop overlay. Your job is to get the player unstuck when they're lost, blocked on a boss, unsure what build to use, or can't figure out a mechanic. You know a lot about most games, but you do not know everything, and you do not pretend to.

GAME: ${gameContext}

SESSION MEMORY: ${sessionContext} The conversation history above this prompt is real — it contains every prior turn this session, including any screenshots the player attached. Reference it actively. If the player asks "what was I doing earlier?", "what did you suggest for the boss?", or anything that refers back, ANSWER from history — do not say you have no memory of the session.
${watchLogSection}
USING YOUR CONTEXT — you have four sources of grounded information beyond the player's current question: (1) conversation history, (2) the WATCH LOG above, (3) any attached screenshot for visual context, and (4) the SCREEN-TEXT EXTRACTION block injected at the end of the user message for any NAMED entities visible right now. Use history and the watch log for "what's been happening?" type questions. Use the screenshot for visual context (what's on screen, what the player is doing right now). Use SCREEN-TEXT EXTRACTION as the only source for naming things in the current frame. Treat an empty watch log as "I haven't been recording recently" — not as "nothing has happened."

SCREENSHOT: When a screenshot is attached, it is a real-time capture of the player's screen. A separate extraction pass will inject a "[UNSTUCK SCREEN-TEXT EXTRACTION]" block into the user message listing every text string that is literally legible in the frame. That extraction is the ONLY authoritative source you have for naming things in the current frame.

NAMING RULE — HARD RULE, NO EXCEPTIONS:
- A zone, area, boss, item, NPC, quest, or location may only be NAMED in your reply if its name appears verbatim in: (a) the SCREEN-TEXT EXTRACTION block, (b) the WATCH LOG's "text:" fields, or (c) something the player typed in chat history.
- If a name is not in any of those sources, you do NOT know it from this screenshot. Say so plainly: "I don't see a zone name on screen — could be a few places. Open the map / look at the next bonfire / tell me where you are and I can be specific." Then ask one short clarifier.
- Visual style is NEVER a basis for naming. Stone catacombs, Nordic ruins, snowy mountains, neon cyberpunk alleys — every one of these is reused across dozens of zones and dozens of games. "Looks like" is not knowing.
- This rule overrides any urge to be helpful by guessing. A confident wrong name is the single worst failure mode. "I don't know which zone but here's what I can tell you about the situation" is correct.

YOU CAN STILL HELP WITHOUT NAMES: You can describe what's visible, give tactical advice on what's happening ("that enemy with the red bar telegraphs a sweep — roll through it"), suggest general strategies, and use the watch log + history for context. The naming rule restricts NAMING, not engagement.

OTHER CALIBRATION:
- For time-sensitive info (current meta, latest patch, season builds), prefer web_search over training-cutoff memory.
- For build/stat numerics you're unsure about, say so and offer to search.
- Never claim you cannot see screenshots — if one is attached, you are seeing it.

HOW YOU GIVE ADVICE:
- Lead with the answer when you have one. When you don't have one, lead with what you can actually tell from the screen + your uncertainty, then give the best guess you can defend.
- Match your reply length to the question. Short tactical questions get one or two sentences. Big questions ("compare endgame builds for my class") get a real breakdown. Default toward brevity.
- No preamble, no restating the question, no closing summaries.
- Default to plain prose. Only use bullet lists or headers when actually enumerating multiple distinct items. Never format a short answer as a list.
- Don't volunteer extras unless they're genuinely critical (the player is about to lose progress, miss a permanently-missable item, etc.). Skip lore asides, fun facts, and tangents.
- Reference earlier conversation naturally when relevant, but don't recap the session unprompted.

SPOILERS: Warn before revealing story spoilers and check if the player wants them. Gameplay spoilers (enemy locations, shortcuts, item locations) are fair game — that's what the player is here for.

RESOURCE AWARENESS: Factor the player's current state from the watch log into your advice — health, stamina, currency, ammo, cooldowns, or whatever resource matters in this game. If they're in a risky state, flag it before they walk into trouble.${specialistKnowledge}`;


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

    // ── Screen-text preflight ──────────────────────────────────────────────
    // Vision models are confident hallucinators when asked "what zone is
    // this?" from a screenshot of reused art (Nordic ruins, catacombs,
    // generic stone hallways). The fix isn't more prompt nagging — it's
    // forcing the model to first commit to "what is literally readable on
    // screen" before it commits to "what this is." We do a cheap, focused
    // haiku call that just extracts on-screen text, then inject the
    // result as a separate authoritative section in the main prompt. The
    // main model can name the zone IFF the name appears in the extracted
    // text; otherwise it must admit it doesn't know.
    // Model for the screen-text preflight. Sonnet is the sweet spot:
    // - haiku-4-5 drops characters on small HUD text (zone labels in
    //   corners, item tooltips), which is exactly the text the main
    //   model is allowed to use for naming. Bad OCR → empty extraction
    //   → main model has to refuse to name something the player can
    //   clearly see.
    // - sonnet-4-5 has materially better small-text OCR with ~+$0.02
    //   cost per chat-with-screenshot and ~1-2s added latency.
    // - opus-4-7 is overkill: OCR is a perception task, opus's
    //   advantage is reasoning. Same vision encoder, ~5x sonnet cost,
    //   ~2x sonnet latency. Not worth it.
    // Flip this constant to swap models — no other code change needed.
    const SCREEN_TEXT_MODEL = "claude-sonnet-4-5";

    let extractedScreenText = "";
    if (imageBase64) {
      try {
        const extractResp = await client.messages.create({
          model: SCREEN_TEXT_MODEL,
          max_tokens: 400,
          system: `You extract on-screen text from gaming screenshots. Output ONLY text that is literally readable in the image — zone names on signs/bonfires/loading screens, HUD labels (HP/MP/stamina numbers, currency, level, area name in corners), quest log titles and step text, item/spell/skill names with tooltips, menu/inventory entries, NPC names above dialog boxes, subtitle text, mission objectives, map labels, button prompts.\n\nRules:\n- Verbatim only. Do not paraphrase. Do not infer.\n- Do NOT describe visuals (architecture, characters, lighting, what the player is doing).\n- Do NOT name the zone/boss/game based on what it "looks like." Names only if they appear as text on screen.\n- If nothing is readable, output exactly: NO_READABLE_TEXT\n- Format: one item per line, prefixed with its location, e.g.\n  HUD-top-left: "Limgrave"\n  Bonfire: "Site of Grace - Stranded Graveyard"\n  Item tooltip: "Lordsworn's Greatsword +3"\n  Subtitle: "..."\nKeep it tight — only the actual text strings.`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: chatMediaType, data: imageBase64 } },
              { type: "text", text: "Extract all readable on-screen text." },
            ],
          }],
        });
        const textBlock = extractResp.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        extractedScreenText = textBlock?.text.trim() ?? "";
        console.log(`[chat] screen-text extracted: ${extractedScreenText.length} chars`);
      } catch (e) {
        console.warn("[chat] screen-text preflight failed:", e instanceof Error ? e.message : e);
        extractedScreenText = "";
      }
    }

    // Inject the extracted text as a high-priority, late-bound user message
    // (NOT in the cached system prompt — it changes every turn and would
    // bust the prompt cache). Place it right before the player's question
    // so the model reads it last.
    if (extractedScreenText && extractedScreenText !== "NO_READABLE_TEXT") {
      userContent.splice(userContent.length - 1, 0, {
        type: "text",
        text: `[UNSTUCK SCREEN-TEXT EXTRACTION — verbatim text legible in the attached screenshot, extracted by a separate vision pass. This is the ONLY authoritative source for named entities (zones, bosses, items, NPCs) in the current frame. If a name does not appear here, you do not know it from this screenshot — say so and ask the player to confirm, do not guess from visuals.]\n${extractedScreenText}`,
      });
    } else if (imageBase64) {
      userContent.splice(userContent.length - 1, 0, {
        type: "text",
        text: `[UNSTUCK SCREEN-TEXT EXTRACTION: NO_READABLE_TEXT was detected in the attached screenshot. This means there are no zone names, HUD labels, item names, or other text strings legible in the current frame. You CANNOT name the zone, boss, item, or location from this screenshot alone. If the player asks "where am I?" or similar, say plainly that you don't see any on-screen text confirming the location and ask them to open the map, pause menu, or move to a sign/bonfire. Do NOT guess based on visual style — Nordic ruins, catacombs, stone hallways, and generic fantasy environments are reused across many zones and many games.]`,
      });
    }

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
    // Sonnet-4-5 by default — roughly 3x faster than Opus-4-7 end-to-end
    // (5–6s vs 12–15s for a 2048-token reply) with a small quality drop
    // that's invisible on the lookup-style questions that dominate gaming
    // chat ("where do I go after X", "best early weapon", patch notes).
    // Opus stays the cost-tier label since it's the most expensive model
    // we'd ever bill against and acts as a safe upper bound. If we later
    // add an "Opus mode" toggle, flip this constant in one place.
    const CHAT_MODEL = "claude-sonnet-4-5";
    let response = await client.messages.create({
      model: CHAT_MODEL,
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
        model: CHAT_MODEL,
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
        model: "sonnet",
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

// ── Streaming endpoint ──────────────────────────────────────────────────────
// SSE-based streaming version of /chat/message. Emits:
//   event: status  data: {"phase": "searching" | "thinking"}
//   event: delta   data: {"text": "..."}
//   event: done    data: {"reply", "model", "tokensUsed", "updatedHistory"?}
//   event: error   data: {"error": "..."}
// The existing /chat/message route stays as-is — generated API client uses it.
router.post("/chat/message/stream", ...protect, async (req, res) => {
  const {
    message,
    gameName,
    includeScreenshot,
    imageData: reqImageData,
    sessionId,
    history: reqHistory,
    watchLog: reqWatchLog,
    watchMode: reqWatchMode,
  } = req.body as {
    message: string;
    gameName?: string | null;
    includeScreenshot?: boolean;
    imageData?: string | null;
    sessionId?: string | null;
    history?: HistoryEntry[] | null;
    watchLog?: { time: string; note: string; event?: string | null; confidence?: number | null; visibleText?: string | null }[] | null;
    watchMode?: boolean | null;
  };

  if (!message || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (IS_HOSTED && req.userId) {
    const cap = await checkUsageCap(req.userId, "chat", req.userEmail);
    if (!cap.allowed) {
      res.status(402).json({ error: cap.reason, plan: cap.plan, usage: cap.monthly });
      return;
    }
  }

  // Set up SSE response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // ── PROXY MODE — pipe upstream SSE through ──────────────────────────────
  const hostedUrl = process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (hostedUrl) {
    let imageData: string | null = reqImageData ?? null;
    if (!imageData && includeScreenshot) {
      const latest = getLatestScreenshot();
      if (latest.available && latest.imageData) imageData = latest.imageData;
    }
    const useSession = sessionId ? getSession(sessionId) !== null : false;
    const localHistory: ConversationMessage[] = useSession
      ? loadSessionHistory(sessionId!)
      : globalHistory;
    const historyEntries = toHistoryEntries(localHistory);

    let accumulated = "";
    let finalReply = "";
    let finalUpdatedHistory: HistoryEntry[] | undefined;

    try {
      const authHeader = req.headers.authorization;
      const upstream = await fetch(`${hostedUrl}/api/chat/message/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify({ message, gameName, imageData, history: historyEntries, watchLog: reqWatchLog, watchMode: reqWatchMode }),
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => "Upstream error");
        send("error", { error: errText });
        res.end();
        return;
      }

      // Parse SSE line-by-line from upstream so we can capture the final
      // payload (we need updatedHistory to persist locally) while forwarding
      // every event byte-for-byte to the renderer.
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let curEvent = "";
      let curData = "";

      const flushEvent = () => {
        if (curEvent === "delta" && curData) {
          try {
            const d = JSON.parse(curData) as { text?: string };
            if (d.text) accumulated += d.text;
          } catch { /* noop */ }
        } else if (curEvent === "done" && curData) {
          try {
            const d = JSON.parse(curData) as { reply?: string; updatedHistory?: HistoryEntry[] };
            if (d.reply) finalReply = d.reply;
            if (d.updatedHistory) finalUpdatedHistory = d.updatedHistory;
          } catch { /* noop */ }
        }
        curEvent = "";
        curData = "";
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk); // forward raw bytes immediately
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).replace(/\r$/, "");
          buf = buf.slice(idx + 1);
          if (line === "") {
            flushEvent();
          } else if (line.startsWith("event: ")) {
            curEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            curData += (curData ? "\n" : "") + line.slice(6);
          }
        }
      }
      // Always attempt a final flush — the upstream may end without a
      // terminal blank line but with pending event/data accumulated.
      if (buf.length > 0) {
        // process any remaining lines (no trailing newline)
        const trailing = buf.replace(/\r$/, "");
        if (trailing.startsWith("event: ")) curEvent = trailing.slice(7).trim();
        else if (trailing.startsWith("data: ")) curData += (curData ? "\n" : "") + trailing.slice(6);
        buf = "";
      }
      flushEvent();

      // Persist updated history locally
      const reply = finalReply || accumulated;
      if (reply && finalUpdatedHistory) {
        const updatedHistory = fromHistoryEntries(finalUpdatedHistory);
        if (useSession) {
          saveSessionHistory(sessionId!, updatedHistory);
          const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
            { id: userMsgId, role: "user", content: message.trim(), timestamp: now, screenshot: screenshotRef },
            { id: assistantMsgId, role: "assistant", content: reply, timestamp: now, screenshot: null },
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

      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      send("error", { error: `Failed to reach AI service: ${msg}` });
      res.end();
    }
    return;
  }

  // ── DIRECT MODE — stream from Anthropic ─────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    send("error", { error: "AI service is not configured on the server." });
    res.end();
    return;
  }

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

  const usableLog = (reqWatchLog ?? []).filter(
    (e) => typeof e.confidence !== "number" || e.confidence >= 0.25
  );
  const watchModeOn = reqWatchMode === true;
  const watchLogSection = usableLog.length > 0
    ? `\nWATCH LOG — Watch Mode is ON. ${usableLog.length} passive screen observation${usableLog.length !== 1 ? "s" : ""} recorded by Unstuck while the player was playing (newest last):\n${usableLog.map(e => {
        const tag = e.event ? `[${e.event}] ` : "";
        const txt = e.visibleText ? ` — text: "${e.visibleText}"` : "";
        return `  [${e.time}] ${tag}${e.note}${txt}`;
      }).join("\n")}\nThis IS your log. Use it to understand what has been happening between messages. Bracketed tags ([combat], [boss], [menu], etc.) indicate the event type. "text:" fields are verbatim transcriptions of on-screen text — treat them as ground truth.\n`
    : watchModeOn
    ? `\nWATCH LOG — Watch Mode is ON and actively running, but no observations have been captured yet (it samples every ~5 seconds, or low-confidence frames are filtered out). If the player asks whether Watch Mode is on, confirm that it is — observations will start appearing shortly.\n`
    : `\nWATCH LOG — Watch Mode is currently OFF. If the player asks about your logs, explain that Unstuck's Watch Mode passively records screen observations every 5 seconds when enabled, and they can turn it on using the Watch button in the toolbar to start building a log.\n`;

  const specialistKnowledge = buildSpecialistAddendum(gameName);

  const systemPrompt = `You are UNSTUCK — a knowledgeable gaming co-pilot embedded as a desktop overlay. Your job is to get the player unstuck when they're lost, blocked on a boss, unsure what build to use, or can't figure out a mechanic. You know a lot about most games, but you do not know everything, and you do not pretend to.

GAME: ${gameContext}

SESSION MEMORY: ${sessionContext} The conversation history above this prompt is real — it contains every prior turn this session, including any screenshots the player attached. Reference it actively. If the player asks "what was I doing earlier?", "what did you suggest for the boss?", or anything that refers back, ANSWER from history — do not say you have no memory of the session.
${watchLogSection}
USING YOUR CONTEXT — you have four sources of grounded information beyond the player's current question: (1) conversation history, (2) the WATCH LOG above, (3) any attached screenshot for visual context, and (4) the SCREEN-TEXT EXTRACTION block injected at the end of the user message for any NAMED entities visible right now. Use history and the watch log for "what's been happening?" type questions. Use the screenshot for visual context (what's on screen, what the player is doing right now). Use SCREEN-TEXT EXTRACTION as the only source for naming things in the current frame. Treat an empty watch log as "I haven't been recording recently" — not as "nothing has happened."

SCREENSHOT: When a screenshot is attached, it is a real-time capture of the player's screen. A separate extraction pass will inject a "[UNSTUCK SCREEN-TEXT EXTRACTION]" block into the user message listing every text string that is literally legible in the frame. That extraction is the ONLY authoritative source you have for naming things in the current frame.

NAMING RULE — HARD RULE, NO EXCEPTIONS:
- A zone, area, boss, item, NPC, quest, or location may only be NAMED in your reply if its name appears verbatim in: (a) the SCREEN-TEXT EXTRACTION block, (b) the WATCH LOG's "text:" fields, or (c) something the player typed in chat history.
- If a name is not in any of those sources, you do NOT know it from this screenshot. Say so plainly: "I don't see a zone name on screen — could be a few places. Open the map / look at the next bonfire / tell me where you are and I can be specific." Then ask one short clarifier.
- Visual style is NEVER a basis for naming. Stone catacombs, Nordic ruins, snowy mountains, neon cyberpunk alleys — every one of these is reused across dozens of zones and dozens of games. "Looks like" is not knowing.
- This rule overrides any urge to be helpful by guessing. A confident wrong name is the single worst failure mode. "I don't know which zone but here's what I can tell you about the situation" is correct.

YOU CAN STILL HELP WITHOUT NAMES: You can describe what's visible, give tactical advice on what's happening ("that enemy with the red bar telegraphs a sweep — roll through it"), suggest general strategies, and use the watch log + history for context. The naming rule restricts NAMING, not engagement.

OTHER CALIBRATION:
- For time-sensitive info (current meta, latest patch, season builds), prefer web_search over training-cutoff memory.
- For build/stat numerics you're unsure about, say so and offer to search.
- Never claim you cannot see screenshots — if one is attached, you are seeing it.

HOW YOU GIVE ADVICE:
- Lead with the answer when you have one. When you don't have one, lead with what you can actually tell from the screen + your uncertainty, then give the best guess you can defend.
- Match your reply length to the question. Short tactical questions get one or two sentences. Big questions ("compare endgame builds for my class") get a real breakdown. Default toward brevity.
- No preamble, no restating the question, no closing summaries.
- Default to plain prose. Only use bullet lists or headers when actually enumerating multiple distinct items. Never format a short answer as a list.
- Don't volunteer extras unless they're genuinely critical (the player is about to lose progress, miss a permanently-missable item, etc.). Skip lore asides, fun facts, and tangents.
- Reference earlier conversation naturally when relevant, but don't recap the session unprompted.

SPOILERS: Warn before revealing story spoilers and check if the player wants them. Gameplay spoilers (enemy locations, shortcuts, item locations) are fair game — that's what the player is here for.

RESOURCE AWARENESS: Factor the player's current state from the watch log into your advice — health, stamina, currency, ammo, cooldowns, or whatever resource matters in this game. If they're in a risky state, flag it before they walk into trouble.${specialistKnowledge}`;

  try {
    const userContent: Anthropic.MessageParam["content"] = [];
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
        source: { type: "base64", media_type: chatMediaType, data: imageBase64 },
      });
    }
    userContent.push({ type: "text", text: message.trim() });

    // Screen-text preflight (same as /chat/message)
    const SCREEN_TEXT_MODEL = "claude-sonnet-4-5";
    let extractedScreenText = "";
    if (imageBase64) {
      send("status", { phase: "reading_screen" });
      try {
        const extractResp = await client.messages.create({
          model: SCREEN_TEXT_MODEL,
          max_tokens: 400,
          system: `You extract on-screen text from gaming screenshots. Output ONLY text that is literally readable in the image — zone names on signs/bonfires/loading screens, HUD labels (HP/MP/stamina numbers, currency, level, area name in corners), quest log titles and step text, item/spell/skill names with tooltips, menu/inventory entries, NPC names above dialog boxes, subtitle text, mission objectives, map labels, button prompts.\n\nRules:\n- Verbatim only. Do not paraphrase. Do not infer.\n- Do NOT describe visuals (architecture, characters, lighting, what the player is doing).\n- Do NOT name the zone/boss/game based on what it "looks like." Names only if they appear as text on screen.\n- If nothing is readable, output exactly: NO_READABLE_TEXT\n- Format: one item per line, prefixed with its location, e.g.\n  HUD-top-left: "Limgrave"\n  Bonfire: "Site of Grace - Stranded Graveyard"\n  Item tooltip: "Lordsworn's Greatsword +3"\n  Subtitle: "..."\nKeep it tight — only the actual text strings.`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: chatMediaType, data: imageBase64 } },
              { type: "text", text: "Extract all readable on-screen text." },
            ],
          }],
        });
        const textBlock = extractResp.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        extractedScreenText = textBlock?.text.trim() ?? "";
      } catch (e) {
        console.warn("[chat/stream] screen-text preflight failed:", e instanceof Error ? e.message : e);
      }
    }

    if (extractedScreenText && extractedScreenText !== "NO_READABLE_TEXT") {
      userContent.splice(userContent.length - 1, 0, {
        type: "text",
        text: `[UNSTUCK SCREEN-TEXT EXTRACTION — verbatim text legible in the attached screenshot, extracted by a separate vision pass. This is the ONLY authoritative source for named entities (zones, bosses, items, NPCs) in the current frame. If a name does not appear here, you do not know it from this screenshot — say so and ask the player to confirm, do not guess from visuals.]\n${extractedScreenText}`,
      });
    } else if (imageBase64) {
      userContent.splice(userContent.length - 1, 0, {
        type: "text",
        text: `[UNSTUCK SCREEN-TEXT EXTRACTION: NO_READABLE_TEXT was detected in the attached screenshot. This means there are no zone names, HUD labels, item names, or other text strings legible in the current frame. You CANNOT name the zone, boss, item, or location from this screenshot alone. If the player asks "where am I?" or similar, say plainly that you don't see any on-screen text confirming the location and ask them to open the map, pause menu, or move to a sign/bonfire. Do NOT guess based on visual style — Nordic ruins, catacombs, stone hallways, and generic fantasy environments are reused across many zones and many games.]`,
      });
    }

    const exaApiKey = process.env.EXA_API_KEY;
    const tools: Anthropic.Tool[] = exaApiKey ? [{
      name: "web_search",
      description: "Search the web for up-to-date gaming information: patch notes, balance changes, current meta builds, tier lists, wiki lookups, community discoveries, or anything that may have changed since your training cutoff. Use this whenever the player asks about recent updates, current season content, or anything you're uncertain is still accurate.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query. Be specific — include game name, patch/season if relevant." },
        },
        required: ["query"],
      },
    }] : [];

    const loopMessages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((e) => ({ role: e.role, content: e.content })),
      { role: "user", content: userContent },
    ];
    const cachedSystem = [
      { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
    ];
    const CHAT_MODEL = "claude-sonnet-4-5";

    let finalAnswerText = "";
    let allStreamedText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheRead = 0;
    let totalCacheCreation = 0;
    let lastModel = CHAT_MODEL;

    // Agentic loop with streaming on each turn. We emit deltas from every
    // iteration (so the user sees Claude's preamble like "let me search…"
    // instead of staring at a blank bubble), but only commit the FINAL
    // non-tool-use iteration's text to the saved reply/history — matches
    // the non-streaming /chat/message route, where only the last text
    // block becomes the persisted reply.
    for (let iter = 0; iter < 6; iter++) {
      let iterText = "";
      const stream = client.messages.stream({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: cachedSystem,
        messages: loopMessages,
        ...(tools.length > 0 ? { tools, tool_choice: { type: "auto" } } : {}),
      });

      stream.on("text", (chunk: string) => {
        iterText += chunk;
        allStreamedText += chunk;
        send("delta", { text: chunk });
      });

      const finalMsg = await stream.finalMessage();
      lastModel = finalMsg.model;
      totalInputTokens += finalMsg.usage.input_tokens;
      totalOutputTokens += finalMsg.usage.output_tokens;
      const u = finalMsg.usage as { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
      totalCacheRead += u.cache_read_input_tokens ?? 0;
      totalCacheCreation += u.cache_creation_input_tokens ?? 0;

      if (finalMsg.stop_reason !== "tool_use") {
        finalAnswerText = iterText;
        break;
      }

      const toolUseBlock = finalMsg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (!toolUseBlock) break;

      loopMessages.push({ role: "assistant", content: finalMsg.content });

      let toolResult = "";
      if (toolUseBlock.name === "web_search" && exaApiKey) {
        send("status", { phase: "searching" });
        try {
          const input = toolUseBlock.input as { query: string };
          const preferredDomains = getPreferredWikiDomains(gameName);
          console.log(`[chat/stream] web_search: "${input.query}"${preferredDomains.length ? ` [biased: ${preferredDomains.join(",")}]` : ""}`);
          const searchRes = await fetch("https://api.exa.ai/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": exaApiKey },
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
    }

    const reply = finalAnswerText || allStreamedText || "No response generated.";

    const userTextOnly: Anthropic.MessageParam["content"] = [{ type: "text", text: message.trim() }];
    conversationHistory = [
      ...conversationHistory,
      { role: "user", content: userTextOnly },
      { role: "assistant", content: reply },
    ];
    if (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - MAX_HISTORY_TURNS * 2);
    }

    if (IS_HOSTED && req.userId) {
      const cost = calcAnthropicCostMicrocents({
        model: "sonnet",
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadInputTokens: totalCacheRead,
        cacheCreationInputTokens: totalCacheCreation,
      });
      await recordUsage(req.userId, "chat", cost, 0);
    }

    if (stateless) {
      send("done", {
        reply,
        model: lastModel,
        tokensUsed: totalInputTokens + totalOutputTokens,
        updatedHistory: toHistoryEntries(conversationHistory),
      });
      res.end();
      return;
    }

    if (useSession) {
      saveSessionHistory(sessionId!, conversationHistory);
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const messageCount = Math.floor(conversationHistory.length / 2);
      const userMsgId = `${Date.now()}-user`;
      const assistantMsgId = `${Date.now() + 1}-assistant`;
      let screenshotRef: string | null = null;
      if (imageBase64) {
        saveScreenshotFile(sessionId!, userMsgId, imageBase64);
        screenshotRef = `file:${userMsgId}`;
      }
      appendSessionMessages(sessionId!, [
        { id: userMsgId, role: "user", content: message.trim(), timestamp: now, screenshot: screenshotRef },
        { id: assistantMsgId, role: "assistant", content: reply, timestamp: now, screenshot: null },
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

    send("done", {
      reply,
      model: lastModel,
      tokensUsed: totalInputTokens + totalOutputTokens,
    });
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof Anthropic.APIError && err.status === 401) {
      send("error", { error: "Invalid Claude API key. Please check server configuration." });
    } else {
      send("error", { error: `AI request failed: ${msg}` });
    }
    res.end();
  }
});

export default router;
