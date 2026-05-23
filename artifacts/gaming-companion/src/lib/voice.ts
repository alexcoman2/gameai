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

// localStorage key for hands-free voice-chat mode: once the user enables
// it, the mic re-arms automatically after each assistant reply finishes
// speaking, so a session is one continuous voice conversation instead of
// tap-to-talk. Persists across reloads/window restarts.
export const HANDS_FREE_LS_KEY = "unstuck:voice:handsfree";

export function isHandsFreeEnabled(): boolean {
  try {
    return localStorage.getItem(HANDS_FREE_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHandsFreeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(HANDS_FREE_LS_KEY, "1");
    else localStorage.removeItem(HANDS_FREE_LS_KEY);
  } catch {
    // ignore
  }
}

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
// The active streaming speaker — set by createSentenceSpeaker(), cleared by
// cancelSpeech(). When the user fires a new query or toggles TTS off mid-reply,
// cancelSpeech() needs to abort both any one-shot speak() AND the streaming
// pipeline (which has its own queue of in-flight TTS fetches).
let currentSpeaker: SentenceSpeaker | null = null;

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
  if (currentSpeaker) {
    try { currentSpeaker.cancel(); } catch { /* ignore */ }
    currentSpeaker = null;
  }
  stopCurrentAudio();
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore
  }
}

// Browser autoplay policy: HTMLAudioElement.play() rejects with NotAllowedError
// unless the document has a recent "user activation" (click/keypress within the
// last few seconds). Voice replies arrive AFTER a multi-second streaming chat
// response, by which point the user's mic click has long since expired — so
// even though the TTS blob downloads fine, .play() silently rejects and no
// sound comes out. Same restriction applies to window.speechSynthesis fallback.
//
// The fix: on every user gesture (mic toggle, send, TTS toggle), play a tiny
// silent clip. Once ANY play() resolves under user activation, Chrome marks
// the document as "audio-unlocked" for the rest of the session and subsequent
// play() calls from timers/promises succeed.
//
// We use a tiny inline WAV (44-byte silent header, no samples) instead of a
// network fetch so it can't fail offline. Also separately unlock SpeechSynthesis
// by speaking an empty utterance, which counts as user-gestured for that API.
let audioPrimed = false;
export function primeTtsPlayback(): void {
  if (audioPrimed) return;
  if (typeof window === "undefined") return;
  try {
    const a = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
    );
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        audioPrimed = true;
        try { a.pause(); } catch { /* ignore */ }
      }).catch(() => { /* autoplay still blocked; try again next gesture */ });
    } else {
      audioPrimed = true;
    }
  } catch {
    // ignore
  }
  try {
    if ("speechSynthesis" in window) {
      // Empty utterance: unlocks the API without making noise.
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
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

// Custom event dispatched when BOTH playback paths (OpenAI Audio + browser
// SpeechSynthesis) are silenced by the autoplay policy. Pages listen for
// this and surface a toast telling the user to click anywhere to unlock
// voice replies. This is the only user-visible signal we can give —
// otherwise the failure is invisible (just console.warn).
export const VOICE_BLOCKED_EVENT = "unstuck:voice:blocked";

// Dispatched when the server refuses /api/voice/speak (plan gate, daily cap,
// upstream OpenAI failure, etc.). Detail carries the human-readable reason
// from the server so the page can toast it verbatim instead of guessing
// "blocked by browser".
export const VOICE_ERROR_EVENT = "unstuck:voice:error";

function dispatchBlocked(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(VOICE_BLOCKED_EVENT));
  } catch { /* ignore */ }
}

function dispatchError(reason: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(VOICE_ERROR_EVENT, { detail: reason }));
  } catch { /* ignore */ }
}

function speakBrowserFallback(clean: string): void {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) {
    // No fallback available at all — signal blocked so the page can toast.
    dispatchBlocked();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;

    // Detect silent SpeechSynthesis failure: if onstart never fires within
    // 800ms of speak(), the browser has silently dropped the utterance
    // (typical autoplay block). Surface that as a blocked event so we don't
    // leave the user wondering why nothing happened.
    let started = false;
    utter.onstart = () => {
      started = true;
    };
    window.speechSynthesis.speak(utter);
    setTimeout(() => {
      if (!started) dispatchBlocked();
    }, 800);
  } catch {
    dispatchBlocked();
  }
}

// ── Streaming sentence speaker ──────────────────────────────────────────────
//
// The chat reply streams in over a few seconds. If we wait for it to finish
// before calling /api/voice/speak, the user hears nothing for 4-5s. Instead,
// we split the streaming text into sentences and fire one TTS request per
// sentence the moment each one is complete. Audio blobs are queued and
// played in order, so playback can begin ~1s after the FIRST sentence is
// generated instead of ~1s after the LAST one.
//
// Race ordering: TTS requests fire in parallel but may resolve out of order.
// Each request is keyed by its sentence index; the player drains the queue
// strictly in index order, awaiting whichever fetch hasn't resolved yet.

export type SentenceSpeaker = {
  feed: (chunk: string) => void;
  end: () => void;
  cancel: () => void;
};

export type SentenceSpeakerOptions = {
  // Fired exactly once after end() has been called AND the last queued
  // audio clip has finished playing (or the speaker fell back to browser
  // SpeechSynthesis, in which case it fires immediately after end()).
  // Used by hands-free mode to re-arm the mic only after the assistant
  // has actually finished talking.
  onAllDone?: () => void;
};

// Minimum sentence length to bother sending to TTS. Filters out fragments
// like "OK." or stray punctuation that would just add overhead.
const MIN_SENTENCE_CHARS = 4;

export function createSentenceSpeaker(opts: SentenceSpeakerOptions = {}): SentenceSpeaker {
  // Tear down any prior speaker / one-shot speak() / browser synthesis so we
  // don't end up with two speakers fighting over the same audio element.
  cancelSpeech();

  let buffer = "";
  let nextIndex = 0;
  let playIndex = 0;
  const pending = new Map<number, Promise<Blob | null>>();
  let endedFeeding = false;
  let cancelled = false;
  let playing = false;
  let playerAudio: HTMLAudioElement | null = null;
  let playerUrl: string | null = null;
  let fellBackToBrowserTts = false;
  const abort = new AbortController();

  const fetchSentence = async (text: string): Promise<Blob | null> => {
    try {
      const res = await authFetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return null;
      if (!res.ok) {
        let serverReason = `TTS HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) serverReason = errJson.error;
        } catch { /* not JSON */ }
        // 4xx = deliberate refusal (plan gate, cap). Surface once and stop.
        if (res.status >= 400 && res.status < 500) {
          dispatchError(serverReason);
          cancelled = true;
          abort.abort();
        } else {
          // 5xx = transient. Fall back to browser TTS for the REST of the
          // reply so the user still hears something instead of partial audio.
          if (!fellBackToBrowserTts) {
            fellBackToBrowserTts = true;
            speakBrowserFallback(text);
          }
        }
        return null;
      }
      const blob = await res.blob();
      if (blob.size === 0) return null;
      return blob;
    } catch (err) {
      if (abort.signal.aborted) return null;
      // Network error → fall back to browser TTS once.
      if (!fellBackToBrowserTts) {
        fellBackToBrowserTts = true;
        // eslint-disable-next-line no-console
        console.warn("[voice] streaming TTS fetch failed; falling back to browser:", err);
        speakBrowserFallback(text);
      }
      return null;
    }
  };

  let allDoneFired = false;
  const fireAllDoneIfReady = () => {
    if (allDoneFired) return;
    if (!endedFeeding) return;
    if (playIndex < nextIndex) return;
    if (cancelled) return;
    allDoneFired = true;
    try { opts.onAllDone?.(); } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[voice] onAllDone handler threw:", e);
    }
  };

  const playNext = async (): Promise<void> => {
    if (cancelled || playing) return;
    if (playIndex >= nextIndex) {
      if (endedFeeding) {
        // eslint-disable-next-line no-console
        console.info("[voice] streaming TTS playback complete");
        fireAllDoneIfReady();
      }
      return;
    }
    playing = true;
    try {
      while (!cancelled && playIndex < nextIndex) {
        const p = pending.get(playIndex);
        if (!p) { playIndex++; continue; }
        const blob = await p;
        pending.delete(playIndex);
        playIndex++;
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        playerAudio = audio;
        playerUrl = url;
        await new Promise<void>((resolve) => {
          audio.onended = () => {
            try { URL.revokeObjectURL(url); } catch { /* ignore */ }
            if (playerAudio === audio) { playerAudio = null; playerUrl = null; }
            resolve();
          };
          audio.onerror = () => {
            try { URL.revokeObjectURL(url); } catch { /* ignore */ }
            if (playerAudio === audio) { playerAudio = null; playerUrl = null; }
            resolve();
          };
          void audio.play().then(
            () => {
              // eslint-disable-next-line no-console
              if (playIndex === 1) console.info("[voice] streaming TTS playback started");
            },
            (playErr) => {
              // Autoplay rejection. Try one re-prime + retry; if that also
              // fails, dispatch the blocked event AND fall back to browser
              // speech-synthesis (which sometimes works when HTMLAudio
              // doesn't, and at least makes a sound). Matches the one-shot
              // speak() path so failures aren't silent.
              audioPrimed = false;
              primeTtsPlayback();
              void audio.play().catch(() => {
                // eslint-disable-next-line no-console
                console.warn("[voice] streaming TTS play() rejected; falling back:", playErr);
                try { URL.revokeObjectURL(url); } catch { /* ignore */ }
                if (playerAudio === audio) { playerAudio = null; playerUrl = null; }
                if (!fellBackToBrowserTts) {
                  fellBackToBrowserTts = true;
                  dispatchBlocked();
                  // Best-effort: speak the remaining buffer via browser TTS
                  // so the user at least hears the rest of the reply.
                  const tail = stripMarkdown(buffer);
                  if (tail) speakBrowserFallback(tail);
                }
                resolve();
              });
            },
          );
        });
      }
    } finally {
      playing = false;
      // Drain finished — check whether the speaker is fully done so
      // hands-free callers can re-arm the mic immediately.
      fireAllDoneIfReady();
    }
  };

  // Sentence-boundary regex: end of sentence is .!? optionally followed by
  // closing quote/bracket, then whitespace or end-of-string. We require the
  // trailing whitespace so we don't split on decimal points ("3.5 damage")
  // or abbreviations mid-token.
  const SENTENCE_END = /[.!?]+["')\]]*(?:\s|$)/g;

  const drainSentences = (final: boolean) => {
    let lastIdx = 0;
    SENTENCE_END.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENTENCE_END.exec(buffer)) !== null) {
      const end = m.index + m[0].length;
      const raw = buffer.slice(lastIdx, end);
      lastIdx = end;
      const clean = stripMarkdown(raw);
      if (clean.length < MIN_SENTENCE_CHARS) continue;
      const idx = nextIndex++;
      pending.set(idx, fetchSentence(clean));
      void playNext();
    }
    buffer = buffer.slice(lastIdx);
    if (final) {
      const tail = stripMarkdown(buffer);
      if (tail.length >= MIN_SENTENCE_CHARS) {
        const idx = nextIndex++;
        pending.set(idx, fetchSentence(tail));
        void playNext();
      }
      buffer = "";
    }
  };

  const speaker: SentenceSpeaker = {
    feed(chunk: string) {
      if (cancelled) return;
      buffer += chunk;
      drainSentences(false);
    },
    end() {
      if (cancelled) return;
      endedFeeding = true;
      drainSentences(true);
      void playNext();
      // If end() was called with zero sentences ever queued (very short
      // reply, all under MIN_SENTENCE_CHARS), playNext bails immediately
      // and fireAllDoneIfReady inside it short-circuits because the
      // finally-block hasn't reached yet. Fire here so hands-free still
      // re-arms in that edge case.
      fireAllDoneIfReady();
    },
    cancel() {
      cancelled = true;
      try { abort.abort(); } catch { /* ignore */ }
      if (playerAudio) {
        try { playerAudio.pause(); } catch { /* ignore */ }
        playerAudio = null;
      }
      if (playerUrl) {
        try { URL.revokeObjectURL(playerUrl); } catch { /* ignore */ }
        playerUrl = null;
      }
      pending.clear();
    },
  };

  currentSpeaker = speaker;
  return speaker;
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
      // eslint-disable-next-line no-console
      console.info("[voice] speak() requesting TTS,", clean.length, "chars");
      const res = await authFetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;

      if (!res.ok) {
        // Try to extract the server's reason so we can show it verbatim.
        // /api/voice/speak returns JSON {error: "..."} on error paths even
        // though success returns binary audio.
        let serverReason = `TTS HTTP ${res.status}`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson?.error) serverReason = errJson.error;
        } catch { /* response wasn't JSON */ }
        // eslint-disable-next-line no-console
        console.warn("[voice] /api/voice/speak failed:", res.status, serverReason);
        // 4xx = server deliberately refused (plan gate, cap, bad input).
        // No point in falling back to browser TTS — surface the reason.
        // 5xx / network = transient; fall back so the user still hears something.
        if (res.status >= 400 && res.status < 500) {
          dispatchError(serverReason);
          return;
        }
        throw new Error(serverReason);
      }
      const blob = await res.blob();
      if (abort.signal.aborted) return;
      if (blob.size === 0) {
        // eslint-disable-next-line no-console
        console.warn("[voice] /api/voice/speak returned empty body");
        dispatchError("Voice service returned no audio. Please try again.");
        return;
      }

      myUrl = URL.createObjectURL(blob);
      myAudio = new Audio(myUrl);
      myAudio.onended = () => {
        if (currentAudio === myAudio) stopCurrentAudio();
      };
      myAudio.onerror = () => {
        // Decode / network error on the blob URL after play() resolved.
        // Surface it to the console (silent failure was the bug we just
        // fixed) and fall back to browser TTS so the user still hears the
        // reply.
        if (currentAudio !== myAudio) return;
        // eslint-disable-next-line no-console
        console.warn("[voice] OpenAI TTS audio element errored; falling back to browser speechSynthesis");
        stopCurrentAudio();
        speakBrowserFallback(clean);
      };
      currentAudio = myAudio;
      currentAudioUrl = myUrl;
      // Note: do NOT null currentFetchAbort here — keep it pointing at
      // our abort so a later cancelSpeech() can flip signal.aborted=true
      // and the play() rejection below knows it was deliberately cancelled.
      try {
        await myAudio.play();
        // eslint-disable-next-line no-console
        console.info("[voice] TTS playback started");
      } catch (playErr) {
        if (abort.signal.aborted) return;
        // A newer speak() may have taken over the globals between the
        // initial rejection and now. If so, do nothing — touching
        // stopCurrentAudio() / speakBrowserFallback() would cancel the
        // newer speech and replay our stale text on top of it.
        if (currentAudio !== myAudio) return;
        // Most common cause: autoplay policy. Re-prime and retry once.
        // primeTtsPlayback is fire-and-forget, but on a real user gesture
        // the silent-clip play() typically resolves synchronously enough
        // that the retry has a meaningful chance of succeeding.
        // eslint-disable-next-line no-console
        console.warn("[voice] audio.play() rejected, retrying after re-prime:", playErr);
        audioPrimed = false;
        primeTtsPlayback();
        try {
          await myAudio.play();
          // eslint-disable-next-line no-console
          console.info("[voice] TTS playback started after re-prime");
        } catch (retryErr) {
          if (abort.signal.aborted) return;
          if (currentAudio !== myAudio) return;
          // eslint-disable-next-line no-console
          console.warn("[voice] retry play() also rejected; falling back to browser TTS:", retryErr);
          stopCurrentAudio();
          speakBrowserFallback(clean);
        }
      }
    } catch (err) {
      // Two failure modes:
      //   a) signal aborted → user/another speak() cancelled us; do nothing.
      //   b) genuine fetch/play error → fall back to browser TTS, but only
      //      if we're still the active speaker (no newer speak() has run).
      if (abort.signal.aborted) return;
      if (currentAudio !== null && currentAudio !== myAudio) return;
      // eslint-disable-next-line no-console
      console.warn("[voice] OpenAI TTS failed, falling back to browser speechSynthesis:", err);
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

export interface VadOptions {
  // Fired once when sustained silence is detected after speech, OR when
  // the user never speaks at all within initialSilenceMs of starting.
  onAutoStop: (reason: "silence-after-speech" | "no-speech") => void;
  // ms of continuous silence AFTER first detected speech before auto-stop.
  // Default 1400ms — long enough to ride out "uhh" pauses, short enough
  // to feel snappy.
  silenceMs?: number;
  // ms to wait for ANY speech before giving up. Default 6000ms.
  initialSilenceMs?: number;
  // RMS threshold for "is this speech". Default 0.015. Mic preamp varies
  // wildly, so this is a compromise; could be made adaptive later.
  thresholdRms?: number;
}

export interface VoiceRecorder {
  start: (vad?: VadOptions) => Promise<void>;
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

  // VAD plumbing. Stays null when VAD isn't requested.
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let vadTimer: ReturnType<typeof setInterval> | null = null;
  let vadFired = false;

  // Memoized in-flight stopAndTranscribe promise. Both the user clicking
  // stop AND VAD firing can race to call stopAndTranscribe() in the same
  // ~80ms window. Without this guard the second call would call
  // recorder.stop() twice (InvalidStateError) and overwrite recorder.onstop,
  // leaving the first promise hung forever. Re-entrant callers await the
  // same promise instead.
  let stopPromise: Promise<string> | null = null;

  const stopVad = () => {
    if (vadTimer) {
      clearInterval(vadTimer);
      vadTimer = null;
    }
    if (analyser) {
      try { analyser.disconnect(); } catch { /* ignore */ }
      analyser = null;
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => { /* ignore */ });
      audioCtx = null;
    }
    vadFired = false;
  };

  const cleanup = () => {
    stopVad();
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    recorder = null;
    chunks = [];
  };

  return {
    getState: () => state,

    async start(vad?: VadOptions) {
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

      if (vad) {
        // setInterval (not rAF) so VAD keeps running when the overlay
        // window is occluded by a fullscreen game — rAF throttles to 0
        // on hidden windows and the auto-stop would never fire.
        const silenceMs = vad.silenceMs ?? 1400;
        const initialSilenceMs = vad.initialSilenceMs ?? 6000;
        const thresholdRms = vad.thresholdRms ?? 0.015;
        const startedAt = Date.now();
        let lastVoiceAt = 0;
        let hasSpokenYet = false;

        try {
          const Ctor =
            (window.AudioContext as typeof AudioContext | undefined) ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!Ctor) return; // VAD unsupported, recorder still works
          audioCtx = new Ctor();
          const src = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.4;
          src.connect(analyser);
          const buf = new Float32Array(analyser.fftSize);

          vadTimer = setInterval(() => {
            // Latch + state check: never fire after manual stop has begun
            // (state flipped to "transcribing" or "idle") or after VAD
            // already fired once for this session.
            if (vadFired || !analyser || state !== "recording") return;
            analyser.getFloatTimeDomainData(buf);
            // RMS of the time-domain samples.
            let sumSq = 0;
            for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
            const rms = Math.sqrt(sumSq / buf.length);
            const now = Date.now();

            if (rms > thresholdRms) {
              hasSpokenYet = true;
              lastVoiceAt = now;
              return;
            }
            if (hasSpokenYet) {
              if (now - lastVoiceAt > silenceMs) {
                vadFired = true;
                stopVad();
                vad.onAutoStop("silence-after-speech");
              }
            } else if (now - startedAt > initialSilenceMs) {
              vadFired = true;
              stopVad();
              vad.onAutoStop("no-speech");
            }
          }, 80);
        } catch {
          // VAD setup failed (no AudioContext, blocked, etc.) — degrade
          // gracefully: recording still works, user just has to stop
          // manually. Don't surface this as an error.
          stopVad();
        }
      }
    },

    async stopAndTranscribe() {
      // Re-entrant call (user click + VAD fire interleaved). Hand back the
      // same promise; never call recorder.stop() twice.
      if (stopPromise) return stopPromise;
      if (state !== "recording" || !recorder) {
        cleanup();
        state = "idle";
        return "";
      }

      // Stop VAD immediately so its interval can't fire onAutoStop again
      // mid-teardown. (Defense in depth — VAD also self-latches via vadFired.)
      stopVad();

      const localRecorder = recorder;
      stopPromise = (async () => {
        try {
          // Wait for the recorder to flush its final dataavailable event.
          // 2s timeout fallback: if stop() throws because the recorder is
          // already inactive (browser tore it down on stream end, etc.),
          // onstop will never fire and we'd hang forever. The chunks we
          // already have are still valid; better to transcribe a slightly
          // short clip than to leave the UI stuck on TRANSCRIBING.
          const stopped = new Promise<void>((resolve) => {
            localRecorder.onstop = () => resolve();
            setTimeout(resolve, 2000);
          });
          try { localRecorder.stop(); } catch { /* already stopped */ }
          await stopped;

          const blob = new Blob(chunks, { type: mimeType });
          cleanup();
          state = "transcribing";

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
          stopPromise = null;
        }
      })();

      return stopPromise;
    },

    cancel() {
      // If a stop is already in flight, just let it finish — calling
      // recorder.stop() again would throw InvalidStateError. The caller
      // discards the resulting transcript anyway.
      if (stopPromise) {
        return;
      }
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
