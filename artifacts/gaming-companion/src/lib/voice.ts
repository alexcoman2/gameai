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

// Currently-playing OpenAI TTS audio + the AbortController for its in-flight
// fetch. Kept module-scoped so cancelSpeech() and successive speak() calls
// can interrupt whichever path is active without React having to thread refs.
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let currentFetchAbort: AbortController | null = null;

function stopCurrentAudio(): void {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try { URL.revokeObjectURL(currentAudioUrl); } catch { /* ignore */ }
    currentAudioUrl = null;
  }
  if (currentFetchAbort) {
    try { currentFetchAbort.abort(); } catch { /* ignore */ }
    currentFetchAbort = null;
  }
}

export function cancelSpeech(): void {
  stopCurrentAudio();
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

function speakBrowserFallback(clean: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
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

// OpenAI TTS via /api/voice/speak. Falls back to browser SpeechSynthesis if
// the fetch fails (offline, key not configured, network blip) so the user
// always gets some audio rather than silence.
//
// Race semantics: every call gets its own AbortController. We keep
// `currentFetchAbort` pointed at it for the WHOLE lifecycle (not just the
// fetch). That way cancelSpeech() — fired either by the user or by a newer
// speak() call — both aborts the in-flight fetch AND signals via the
// abort.signal that any subsequent `audio.play()` rejection should be
// treated as a deliberate interruption, not a fetch failure. Without this,
// pausing the audio mid-play would reject play(), the catch would run with
// signal.aborted=false, and speakBrowserFallback would fire stale text on
// top of the new speech.
export function speak(text: string): void {
  if (typeof window === "undefined") return;
  const clean = stripMarkdown(text);
  if (!clean) return;

  // Cancel anything currently speaking — both the OpenAI audio path and
  // any leftover browser synthesis queue.
  cancelSpeech();

  const abort = new AbortController();
  currentFetchAbort = abort;
  let myAudio: HTMLAudioElement | null = null;
  let myUrl: string | null = null;

  void (async () => {
    try {
      const res = await authFetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      const blob = await res.blob();
      if (abort.signal.aborted) return;

      myUrl = URL.createObjectURL(blob);
      myAudio = new Audio(myUrl);
      myAudio.onended = () => {
        if (currentAudio === myAudio) stopCurrentAudio();
      };
      myAudio.onerror = () => {
        if (currentAudio === myAudio) stopCurrentAudio();
      };
      currentAudio = myAudio;
      currentAudioUrl = myUrl;
      // Note: do NOT null currentFetchAbort here — keep it pointing at
      // our abort so a later cancelSpeech() can flip signal.aborted=true
      // and the play() rejection below knows it was deliberately cancelled.
      await myAudio.play();
    } catch {
      // Two failure modes:
      //   a) signal aborted → user/another speak() cancelled us; do nothing.
      //   b) genuine fetch/play error → fall back to browser TTS, but only
      //      if we're still the active speaker (no newer speak() has run).
      if (abort.signal.aborted) return;
      if (currentAudio !== null && currentAudio !== myAudio) return;
      // Clean up our refs/url before falling back so we don't leak.
      if (myUrl) {
        try { URL.revokeObjectURL(myUrl); } catch { /* ignore */ }
      }
      if (currentAudio === myAudio) currentAudio = null;
      if (currentAudioUrl === myUrl) currentAudioUrl = null;
      if (currentFetchAbort === abort) currentFetchAbort = null;
      speakBrowserFallback(clean);
    }
  })();
}

// ── Whisper hallucination filter ────────────────────────────────────────────
//
// Whisper-1 has well-known "silent input" hallucinations — when the recording
// is silence, breath, keyboard clicks, or background hum, it returns one of a
// small set of canned phrases (mostly YouTube-trained artifacts). We filter
// those so the user doesn't get "Thank you" pasted into their composer every
// time they tap the mic and don't speak.

const WHISPER_HALLUCINATIONS = new Set(
  [
    "you",
    "thank you",
    "thank you.",
    "thanks",
    "thanks.",
    "thanks for watching",
    "thanks for watching!",
    "thanks for watching.",
    "thank you for watching",
    "thank you for watching.",
    "thank you for watching!",
    "thank you so much",
    "thank you so much for watching",
    "bye",
    "bye.",
    "bye!",
    "okay",
    "okay.",
    "ok",
    "ok.",
    "uh",
    "um",
    "hmm",
    ".",
    "..",
    "...",
    "!",
    "?",
  ].map((s) => s.toLowerCase())
);

export function isLikelyHallucination(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (WHISPER_HALLUCINATIONS.has(t)) return true;
  // Strip surrounding punctuation and retry.
  const stripped = t.replace(/^[\s.,!?]+|[\s.,!?]+$/g, "");
  if (!stripped) return true;
  if (WHISPER_HALLUCINATIONS.has(stripped)) return true;
  return false;
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
