import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { authFetch } from "@/lib/auth-fetch";
import {
  Loader2, Send, X, Maximize2, Camera, CameraOff,
  Mic, MicOff, Volume2, VolumeX,
} from "lucide-react";
import {
  createVoiceRecorder, speak, cancelSpeech,
  isTtsEnabled, setTtsEnabled,
} from "@/lib/voice";
import { readWatchState } from "@/lib/watch-state";

type ElectronAPI = {
  captureScreenshot?: () => Promise<string>;
  overlayHide?: () => Promise<boolean>;
  overlayOpenMain?: () => Promise<boolean>;
  overlayGetHotkey?: () => Promise<string | null>;
  onOverlayShown?: (cb: () => void) => () => void;
};

function getElectronAPI(): ElectronAPI | null {
  const w = window as unknown as { electronAPI?: ElectronAPI };
  return w.electronAPI ?? null;
}

type Turn = {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  screenshot?: string | null;
};

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Shared with chat-context. Lets the overlay write into the same session the
// main window is currently viewing, so overlay chats show up in the chat list.
const ACTIVE_SESSION_LS_KEY = "unstuck:activeSessionId";

async function resolveOverlaySessionId(): Promise<string | null> {
  // Always re-resolve against the server's session list. Reading localStorage
  // alone is racy: at app startup the overlay window can render before the
  // main window has selected its active session and written it to LS, so the
  // overlay used to create its own "Overlay" session and the two windows
  // ended up pointing at different sessions for the rest of the run.
  //
  // Strategy: ask the server which sessions exist, validate the LS pick
  // against that list, and otherwise pick the most-recently-updated one.
  // Only create a brand-new session when the user truly has none yet.
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(ACTIVE_SESSION_LS_KEY);
  } catch {
    // ignore
  }

  try {
    const res = await authFetch("/api/sessions");
    if (res.ok) {
      const sessions = (await res.json()) as { id: string; updatedAt?: string }[];
      if (Array.isArray(sessions) && sessions.length > 0) {
        // If LS points at a real session, keep it (matches the main window).
        if (preferred && sessions.some((s) => s.id === preferred)) {
          return preferred;
        }
        // Otherwise sync to whichever session was most recently touched —
        // that's almost certainly the one the main window is showing.
        const newest = [...sessions].sort((a, b) =>
          (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
        )[0];
        if (newest?.id) {
          try {
            localStorage.setItem(ACTIVE_SESSION_LS_KEY, newest.id);
          } catch {
            // ignore
          }
          return newest.id;
        }
      }
    }
  } catch {
    // ignore — fall through to create
  }

  // No sessions exist yet. Create one so overlay-only usage still persists
  // to the chat list (instead of an orphan globalHistory).
  try {
    const res = await authFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Overlay" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    if (data.id) {
      try {
        localStorage.setItem(ACTIVE_SESSION_LS_KEY, data.id);
      } catch {
        // ignore
      }
      return data.id;
    }
  } catch {
    // ignore
  }
  return null;
}

export default function OverlayPage() {
  const electronAPI = getElectronAPI();
  const { isLoaded, isSignedIn } = useAuth();
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsOn, setTtsOn] = useState(isTtsEnabled());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null);

  // Resolve the actual registered hotkey label to show in the empty state.
  useEffect(() => {
    void electronAPI?.overlayGetHotkey?.().then((h) => setHotkey(h));
  }, [electronAPI]);

  // Auto-focus the input each time the overlay is shown via hotkey.
  useEffect(() => {
    inputRef.current?.focus();
    if (!electronAPI?.onOverlayShown) return;
    const off = electronAPI.onOverlayShown(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return off;
  }, [electronAPI]);

  // Esc hides the overlay; never quits.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void electronAPI?.overlayHide?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [electronAPI]);

  // Scroll to bottom on new turn.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns, sending]);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sending) return;

    let screenshot: string | null = null;
    if (attachScreenshot && electronAPI?.captureScreenshot) {
      try {
        screenshot = await electronAPI.captureScreenshot();
      } catch {
        screenshot = null;
      }
    }

    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
      screenshot,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setSending(true);

    try {
      const sessionId = await resolveOverlaySessionId();
      const watchState = readWatchState();
      const res = await authFetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(screenshot ? { imageData: screenshot } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(watchState.log.length > 0 ? { watchLog: watchState.log } : {}),
          watchMode: watchState.mode,
        }),
      });

      if (res.status === 401) {
        setTurns((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "error",
            content: "Sign in via the main window to use the overlay.",
          },
        ]);
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!res.ok) {
        setTurns((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "error",
            content: data.error || `Request failed (${res.status})`,
          },
        ]);
        return;
      }

      const reply = data.reply || "(empty response)";
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: reply,
        },
      ]);
      if (ttsOn && data.reply) speak(data.reply);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "error",
          content:
            err instanceof Error ? err.message : "Network error reaching server.",
        },
      ]);
    } finally {
      setSending(false);
      // Re-focus for the next quick question.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const toggleMic = async () => {
    if (isTranscribing) return;
    if (isRecording) {
      try {
        setIsRecording(false);
        setIsTranscribing(true);
        const text = await recorderRef.current!.stopAndTranscribe();
        if (text) {
          setInput((prev) => (prev ? `${prev} ${text}` : text));
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      } catch (err) {
        setTurns((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "error",
            content:
              err instanceof Error ? err.message : "Microphone or transcription error.",
          },
        ]);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }
    try {
      recorderRef.current = createVoiceRecorder();
      await recorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "error",
          content: err instanceof Error ? err.message : "Could not access microphone.",
        },
      ]);
    }
  };

  const toggleTts = () => {
    const next = !ttsOn;
    setTtsOn(next);
    setTtsEnabled(next);
    if (!next) cancelSpeech();
  };

  const hotkeyLabel = hotkey
    ? hotkey.replace("Control", "Ctrl").replace(/\+/g, " + ")
    : null;

  return (
    <div className="h-screen w-screen p-0 m-0 overflow-hidden bg-transparent font-mono text-foreground">
      <div
        className="flex h-full w-full flex-col border border-primary/40"
        style={{
          // Solid translucent fill — NOT backdrop-blur. Backdrop blur on a
          // transparent Electron window is the main reason the overlay
          // used to jitter while dragging or typing (Chromium repaints the
          // blur each frame). A flat rgba background is GPU-cheap and
          // looks just as polished. Alpha is intentionally low so the
          // user can see their game through it.
          backgroundColor: "rgba(8, 14, 11, 0.55)",
          WebkitUserSelect: "none",
          // Promote to its own compositor layer so dragging the window
          // doesn't force the renderer to repaint the entire surface.
          transform: "translateZ(0)",
        }}
      >
        {/* Drag handle / header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-primary/25"
          style={{
            backgroundColor: "rgba(8, 14, 11, 0.45)",
            WebkitAppRegion: "drag",
          } as React.CSSProperties}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-primary">
              UNSTUCK · OVERLAY
            </span>
          </div>
          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={toggleTts}
              title={ttsOn ? "Voice replies ON — click to mute" : "Voice replies OFF — click to enable"}
              className={`h-6 w-6 flex items-center justify-center transition ${
                ttsOn
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
              }`}
            >
              {ttsOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => void electronAPI?.overlayOpenMain?.()}
              title="Open main window"
              className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => void electronAPI?.overlayHide?.()}
              title="Hide (Esc)"
              className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
          style={{ WebkitUserSelect: "text" } as React.CSSProperties}
        >
          {turns.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground gap-2 px-4">
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary/70">
                Ask anything
              </div>
              <div className="text-xs leading-relaxed">
                Type a question. Your current screen is attached automatically so
                Unstuck can see what you see.
              </div>
              {hotkeyLabel && (
                <div className="mt-2 text-[10px] text-muted-foreground/70">
                  Toggle overlay with{" "}
                  <span className="px-1.5 py-0.5 border border-primary/30 text-primary/90">
                    {hotkeyLabel}
                  </span>
                </div>
              )}
              {isLoaded && !isSignedIn && (
                <div className="mt-3 text-[10px] text-amber-400/90 border border-amber-400/30 px-2 py-1">
                  Sign in via the main window to enable chat.
                </div>
              )}
            </div>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              className={`text-xs leading-relaxed whitespace-pre-wrap ${
                turn.role === "user"
                  ? "text-foreground/90"
                  : turn.role === "assistant"
                  ? "text-primary/95"
                  : "text-destructive"
              }`}
            >
              <div
                className={`text-[9px] uppercase tracking-[0.2em] mb-1 ${
                  turn.role === "user"
                    ? "text-muted-foreground"
                    : turn.role === "assistant"
                    ? "text-primary/70"
                    : "text-destructive/70"
                }`}
              >
                {turn.role === "user"
                  ? "YOU"
                  : turn.role === "assistant"
                  ? "UNSTUCK"
                  : "ERROR"}
              </div>
              <div>{turn.content}</div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-primary/70">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>thinking…</span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          className="border-t border-primary/25 p-2"
          style={{ backgroundColor: "rgba(8, 14, 11, 0.45)" }}
        >
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setAttachScreenshot((v) => !v)}
              title={
                attachScreenshot
                  ? "Screenshot will be attached"
                  : "Screenshot disabled"
              }
              className={`h-8 w-8 flex-shrink-0 flex items-center justify-center border transition ${
                attachScreenshot
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {attachScreenshot ? (
                <Camera className="w-3.5 h-3.5" />
              ) : (
                <CameraOff className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={isTranscribing || (isLoaded && !isSignedIn)}
              title={isRecording ? "Stop & transcribe" : "Speak"}
              className={`h-8 w-8 flex-shrink-0 flex items-center justify-center border transition ${
                isRecording
                  ? "border-destructive/60 text-destructive bg-destructive/10 animate-pulse"
                  : "border-border text-muted-foreground hover:text-foreground"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isLoaded && !isSignedIn
                  ? "Sign in via main window…"
                  : isRecording
                  ? "Listening…"
                  : isTranscribing
                  ? "Transcribing…"
                  : "What do I do? (Enter to send)"
              }
              rows={2}
              disabled={(isLoaded && !isSignedIn) || isRecording || isTranscribing}
              className="flex-1 resize-none border border-border focus:border-primary/60 focus:outline-none text-xs px-2 py-1.5 placeholder:text-muted-foreground/50"
              style={{
                backgroundColor: "rgba(8, 14, 11, 0.6)",
                WebkitUserSelect: "text",
              } as React.CSSProperties}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Keeps the named import shape consistent with other pages.
export { OverlayPage };
// basePath is imported for parity with other pages even if unused here today.
void basePath;
