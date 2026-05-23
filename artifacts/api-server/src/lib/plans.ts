import type { PlanTier } from "@workspace/db";

export type PlanConfig = {
  /** Display price in USD (informational; the actual charge is Paddle's). */
  monthlyPriceUsd: number;
  monthlyChats: number;
  monthlyWatchSeconds: number;
  allowsWatch: boolean;
  /** Per-chat overage rate, in microcents (1 cent = 10_000 microcents). */
  overageChatMicrocents: number;
  /** Per-second-of-watch overage rate, in microcents. */
  overageWatchSecMicrocents: number;
  /** Whether overage is billed at all (false = hard block when allowance hit). */
  allowsOverage: boolean;
};

// Option A pricing (credits + metered overage):
//   Free  $0      — 30 min watch + 25 chats (trial; hard-blocked after).
//   Pro   $29/mo  — 2h watch + 200 chats, then $0.20/min watch & $0.05/chat.
//   Elite $99/mo  — 8h watch + 750 chats, then $0.15/min watch & $0.04/chat.
//
// Overage microcents math:
//   $0.20/min watch = $12/hr = (12 * 100 cents * 10_000 μc) / 3600 sec ≈ 3_333 μc/sec
//   $0.15/min watch = $9/hr  = (9  * 100 cents * 10_000 μc) / 3600 sec = 2_500 μc/sec
//   $0.05/chat = 5 cents = 50_000 μc
//   $0.04/chat = 4 cents = 40_000 μc

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    monthlyPriceUsd: 0,
    monthlyChats: 25,
    monthlyWatchSeconds: 30 * 60,
    allowsWatch: true,
    overageChatMicrocents: 0,
    overageWatchSecMicrocents: 0,
    allowsOverage: false,
  },
  pro: {
    monthlyPriceUsd: 29,
    monthlyChats: 200,
    monthlyWatchSeconds: 2 * 60 * 60,
    allowsWatch: true,
    overageChatMicrocents: 50_000,
    // ceil so we never undercharge — Math.round → 3_333 μc/sec was ≈$0.19998/min
    overageWatchSecMicrocents: Math.ceil((12 * 100 * 10_000) / 3600),
    allowsOverage: true,
  },
  elite: {
    monthlyPriceUsd: 99,
    monthlyChats: 750,
    monthlyWatchSeconds: 8 * 60 * 60,
    allowsWatch: true,
    overageChatMicrocents: 40_000,
    overageWatchSecMicrocents: Math.round((9 * 100 * 10_000) / 3600),
    allowsOverage: true,
  },
};

/** Per-user-per-day fuse: blocks all usage once their cost-to-us hits $5/day. */
export const DAILY_HARD_CAP_CENTS = 500;

/** Rough cost estimates used only for upfront cap decisions (real cost recorded after API call). */
export const ESTIMATED_CHAT_COST_MICROCENTS = 4_000;
export const ESTIMATED_WATCH_OBSERVATION_COST_MICROCENTS = 167;
