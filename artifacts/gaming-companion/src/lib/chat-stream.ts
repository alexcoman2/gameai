import { authFetch } from "./auth-fetch";

export interface StreamChatPayload {
  message: string;
  gameName?: string | null;
  imageData?: string | null;
  includeScreenshot?: boolean;
  sessionId?: string | null;
  watchLog?: unknown[];
  watchMode?: boolean;
}

export interface StreamChatCallbacks {
  onStatus?: (phase: string) => void;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface StreamChatResult {
  reply: string;
  model?: string;
  tokensUsed?: number;
}

export class StreamChatError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function streamChatMessage(
  payload: StreamChatPayload,
  callbacks: StreamChatCallbacks = {},
): Promise<StreamChatResult> {
  const res = await authFetch("/api/chat/message/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    signal: callbacks.signal,
  });

  if (!res.ok || !res.body) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { error?: string };
        if (data.error) errMsg = data.error;
      } else {
        const text = await res.text();
        if (text) errMsg = text;
      }
    } catch {
      // keep default
    }
    throw new StreamChatError(errMsg, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let curEvent = "";
  let curData = "";
  let accumulated = "";
  let finalReply = "";
  let finalModel: string | undefined;
  let finalTokens: number | undefined;
  let errored: string | null = null;

  const flushEvent = () => {
    if (!curEvent) {
      curData = "";
      return;
    }
    const data = curData;
    curEvent = curEvent === "" ? "" : curEvent;
    if (data) {
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (curEvent === "delta") {
          const t = parsed.text;
          if (typeof t === "string") {
            accumulated += t;
            callbacks.onDelta?.(t);
          }
        } else if (curEvent === "status") {
          const phase = parsed.phase;
          if (typeof phase === "string") callbacks.onStatus?.(phase);
        } else if (curEvent === "done") {
          if (typeof parsed.reply === "string") finalReply = parsed.reply;
          if (typeof parsed.model === "string") finalModel = parsed.model;
          if (typeof parsed.tokensUsed === "number") finalTokens = parsed.tokensUsed;
        } else if (curEvent === "error") {
          if (typeof parsed.error === "string") errored = parsed.error;
        }
      } catch {
        // ignore parse error
      }
    }
    curEvent = "";
    curData = "";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
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
  // Always flush any pending event — server may end without a terminal
  // blank line even though the last data line ended with \n.
  if (buf.length > 0) {
    const trailing = buf.replace(/\r$/, "");
    if (trailing.startsWith("event: ")) curEvent = trailing.slice(7).trim();
    else if (trailing.startsWith("data: ")) curData += (curData ? "\n" : "") + trailing.slice(6);
  }
  flushEvent();

  if (errored) throw new StreamChatError(errored, 500);

  return {
    reply: finalReply || accumulated,
    model: finalModel,
    tokensUsed: finalTokens,
  };
}
