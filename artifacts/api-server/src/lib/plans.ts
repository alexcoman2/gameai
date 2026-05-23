import type { PlanTier } from "@workspace/db";

export type PlanConfig = {
  monthlyChats: number;
  monthlyWatchSeconds: number;
  allowsWatch: boolean;
  overageChatMicrocents: number;
  overageWatchSecMicrocents: number;
};

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: {
    monthlyChats: 25,
    monthlyWatchSeconds: 0,
    allowsWatch: false,
    overageChatMicrocents: 0,
    overageWatchSecMicrocents: 0,
  },
  pro: {
    monthlyChats: 200,
    monthlyWatchSeconds: 5 * 60 * 60,
    allowsWatch: true,
    overageChatMicrocents: 8_000,
    overageWatchSecMicrocents: Math.round((2 * 100 * 10_000) / 3600),
  },
  elite: {
    monthlyChats: 500,
    monthlyWatchSeconds: 15 * 60 * 60,
    allowsWatch: true,
    overageChatMicrocents: 6_000,
    overageWatchSecMicrocents: Math.round((1.5 * 100 * 10_000) / 3600),
  },
};

export const DAILY_HARD_CAP_CENTS = 500;

export const ESTIMATED_CHAT_COST_MICROCENTS = 4_000;
export const ESTIMATED_WATCH_OBSERVATION_COST_MICROCENTS = 167;
