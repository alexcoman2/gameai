import type { PlanTier } from "@workspace/db";

export type PlanConfig = {
  /** Display price in USD (informational; the actual charge is Paddle's). */
  monthlyPriceUsd: number;
  monthlyChats: number;
  monthlyWatchSeconds: number;
  allowsWatch: boolean;
  /** Whether voice mode (Whisper STT + OpenAI TTS) is enabled for this tier. */
  allowsVoice: boolean;
  /** Per-chat overage rate, in microcents (1 cent = 10_000 microcents). */
  overageChatMicrocents: number;
  /** Per-second-of-watch overage rate, in microcents. */
  overageWatchSecMicrocents: number;
  /** Whether overage is billed at all (false = hard block when allowance hit). */
  allowsOverage: boolean;
};

// Option A pricing — aggressive conversion + new Pro+ middle tier.
//
//   Free   $0      — 40 chats + 60 min watch, no voice, hard-blocked.
//   Pro    $19/mo  — 150 chats + 3h watch + voice. Overage: $0.04/chat, $0.15/min watch.
//   Pro+   $39/mo  — 400 chats + 8h watch + voice. Overage: $0.04/chat, $0.12/min watch.
//   Elite  $99/mo  — 1500 chats + 25h watch + voice. Overage: $0.03/chat, $0.10/min watch.
//
// Overage microcents math (μc = microcents, 1 cent = 10_000 μc):
//   $0.15/min watch = $9/hr  = (9  * 100 * 10_000) / 3600 = 2_500   μc/sec
//   $0.12/min watch = $7.2/hr = (7.2 * 100 * 10_000) / 3600 = 2_000 μc/sec
//   $0.10/min watch = $6/hr  = (6  * 100 * 10_000) / 3600 ≈ 1_667   μc/sec (ceil)
//   $0.04/chat = 4 cents = 40_000 μc
//   $0.03/chat = 3 cents = 30_000 μc

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    monthlyPriceUsd: 0,
    monthlyChats: 40,
    monthlyWatchSeconds: 60 * 60,
    allowsWatch: true,
    allowsVoice: false,
    overageChatMicrocents: 0,
    overageWatchSecMicrocents: 0,
    allowsOverage: false,
  },
  pro: {
    monthlyPriceUsd: 19,
    monthlyChats: 150,
    monthlyWatchSeconds: 3 * 60 * 60,
    allowsWatch: true,
    allowsVoice: true,
    overageChatMicrocents: 40_000,
    overageWatchSecMicrocents: 2_500,
    allowsOverage: true,
  },
  pro_plus: {
    monthlyPriceUsd: 39,
    monthlyChats: 400,
    monthlyWatchSeconds: 8 * 60 * 60,
    allowsWatch: true,
    allowsVoice: true,
    overageChatMicrocents: 40_000,
    overageWatchSecMicrocents: 2_000,
    allowsOverage: true,
  },
  elite: {
    monthlyPriceUsd: 99,
    monthlyChats: 1500,
    monthlyWatchSeconds: 25 * 60 * 60,
    allowsWatch: true,
    allowsVoice: true,
    overageChatMicrocents: 30_000,
    // ceil so we never undercharge — Math.round would round 1_666.67 down.
    overageWatchSecMicrocents: Math.ceil((6 * 100 * 10_000) / 3600),
    allowsOverage: true,
  },
};

/** Per-user-per-day fuse: blocks all usage once their cost-to-us hits $5/day. */
export const DAILY_HARD_CAP_CENTS = 500;

/** Rough cost estimates used only for upfront cap decisions (real cost recorded after API call). */
export const ESTIMATED_CHAT_COST_MICROCENTS = 15_000;
export const ESTIMATED_WATCH_OBSERVATION_COST_MICROCENTS = 167;

// Voice mode cost rates (OpenAI list pricing, May 2025):
//   Whisper STT:        $0.006/min = $0.0001/sec → 100 microcents/sec
//   gpt-4o-mini-tts:    ~$15/1M input chars      → 15  microcents/char
// Cost is recorded against the "voice_stt" / "voice_tts" usage kinds so it
// rolls into the daily $5 fuse but does NOT count against the chat allowance
// (voice is a paid feature on top of the chat that triggered it).
export const VOICE_STT_MICROCENTS_PER_SECOND = 100;
export const VOICE_TTS_MICROCENTS_PER_CHAR = 15;
