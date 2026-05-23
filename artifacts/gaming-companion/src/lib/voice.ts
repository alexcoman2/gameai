// Voice helpers — shared between the overlay and the main window.
//
// Speech-in: MediaRecorder → base64 → POST /api/voice/transcribe (Whisper).
// Speech-out: browser SpeechSynthesis (free, offline, no key required).
//
// We intentionally do NOT use the Web Speech Recognition API: in packaged
// Electron it silently fails because it routes audio to Google's servers
// without a key.

import { authFetch } from "@/lib/auth-fetch";

// localStorage key for the "speak replies aloud" toggle. Shared across
// overlay + main window since they share origin.
export const TTS_ENABLED_LS_KEY = "unstuck:voice:tts";

export function isTtsEnabled(): boolean {
  try {
    return localStorage.getItem(TTS_ENABLED_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTtsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(TTS_ENABLED_LS_KEY, "1");
    else localStorage.removeItem(TTS_ENABLED_LS_KEY);
  } catch {
    // ignore
  }
}

export function cancelSpeech(): void {
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore
  }
}

// Strip markdown so the TTS engine doesn't read aloud asterisks, backticks,
// and bracketed URLs. Keep the actual words.
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = stripMarkdown(text);
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

// ── Recording ───────────────────────────────────────────────────────────────

export type RecorderState = "idle" | "recording" | "transcribing";

export interface VoiceRecorder {
  start: () => Promise<void>;
  stopAndTranscribe: () => Promise<string>;
  cancel: () => void;
  getState: () => RecorderState;
}

function pickMimeType(): string {
  // MediaRecorder support varies; Whisper accepts all of these.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read blob"));
        return;
      }
      // Strip "data:audio/webm;base64," prefix to keep payload compact.
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

export function createVoiceRecorder(): VoiceRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mimeType = "audio/webm";
  let state: RecorderState = "idle";

  const cleanup = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    recorder = null;
    chunks = [];
  };

  return {
    getState: () => state,

    async start() {
      if (state !== "idle") return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, { mimeType });
      chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      state = "recording";
    },

    async stopAndTranscribe() {
      if (state !== "recording" || !recorder) {
        cleanup();
        state = "idle";
        return "";
      }

      // Wait for the recorder to flush its final dataavailable event.
      const stopped = new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
      });
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      cleanup();
      state = "transcribing";

      try {
        if (blob.size === 0) {
          state = "idle";
          return "";
        }
        const base64 = await blobToBase64(blob);
        const res = await authFetch("/api/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, mimeType }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || `Transcription failed (${res.status})`);
        }
        const data = (await res.json()) as { text?: string };
        return (data.text ?? "").trim();
      } finally {
        state = "idle";
      }
    },

    cancel() {
      if (recorder && state === "recording") {
        try {
          recorder.onstop = null;
          recorder.stop();
        } catch {
          // ignore
        }
      }
      cleanup();
      state = "idle";
    },
  };
}
