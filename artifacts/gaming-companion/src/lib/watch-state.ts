// Cross-window watch state.
//
// Watch Mode runs in the main window's React tree (the only place that owns
// the capture loop). The overlay window is a separate renderer process, so
// it cannot read that state directly. We mirror it to localStorage — both
// windows share the same origin (127.0.0.1:8765) so localStorage is shared
// — and the overlay reads it when assembling each chat request.
//
// Without this, every overlay chat had no `watchLog` / `watchMode` in its
// body and the server prompt fell through to "Watch Mode is OFF, no
// observations" — which is exactly what the model started telling users.

export const WATCH_STATE_LS_KEY = "unstuck:watch:state";

export type WatchLogEntry = {
  time: string;
  note: string;
  event?: string | null;
  confidence?: number | null;
  visibleText?: string | null;
};

export type WatchState = {
  mode: boolean;
  log: WatchLogEntry[];
  updatedAt: number;
};

// If the main window's watch loop hasn't written in this long, treat the
// mirrored "mode = true" as stale (e.g. user closed the main window).
// Observations themselves stay valid — they are timestamped historical
// facts about what was on screen.
const STALE_MODE_MS = 60_000;

export function publishWatchState(mode: boolean, log: WatchLogEntry[]): void {
  try {
    const state: WatchState = { mode, log, updatedAt: Date.now() };
    localStorage.setItem(WATCH_STATE_LS_KEY, JSON.stringify(state));
  } catch {
    // ignore — localStorage may be full or disabled
  }
}

export function readWatchState(): WatchState {
  try {
    const raw = localStorage.getItem(WATCH_STATE_LS_KEY);
    if (!raw) return { mode: false, log: [], updatedAt: 0 };
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    const mode =
      parsed.mode === true &&
      typeof parsed.updatedAt === "number" &&
      Date.now() - parsed.updatedAt < STALE_MODE_MS;
    const log = Array.isArray(parsed.log) ? (parsed.log as WatchLogEntry[]) : [];
    return { mode, log, updatedAt: parsed.updatedAt ?? 0 };
  } catch {
    return { mode: false, log: [], updatedAt: 0 };
  }
}
