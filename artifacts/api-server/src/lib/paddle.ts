import { Paddle, Environment, LogLevel } from "@paddle/paddle-node-sdk";
import { logger } from "./logger.js";

const apiKey = process.env.PADDLE_API_KEY;

// Paddle keys are prefixed: pdl_sdbx_* for sandbox, pdl_live_* for production.
// Auto-detect so we don't need a separate PADDLE_ENVIRONMENT env var.
function detectEnvironment(): Environment {
  if (!apiKey) return Environment.sandbox;
  return apiKey.startsWith("pdl_live_")
    ? Environment.production
    : Environment.sandbox;
}

export const paddleEnvironment = detectEnvironment();

let _paddle: Paddle | null = null;
export function getPaddle(): Paddle {
  if (_paddle) return _paddle;
  if (!apiKey) {
    throw new Error(
      "PADDLE_API_KEY is not set — billing endpoints cannot be used.",
    );
  }
  _paddle = new Paddle(apiKey, {
    environment: paddleEnvironment,
    logLevel: LogLevel.warn,
  });
  logger.info(
    { environment: paddleEnvironment },
    "Paddle SDK initialized",
  );
  return _paddle;
}

export const PRICE_TO_TIER: Record<string, "pro" | "elite"> = {
  ...(process.env.PADDLE_PRO_PRICE_ID
    ? { [process.env.PADDLE_PRO_PRICE_ID]: "pro" as const }
    : {}),
  ...(process.env.PADDLE_ELITE_PRICE_ID
    ? { [process.env.PADDLE_ELITE_PRICE_ID]: "elite" as const }
    : {}),
};

export function priceIdForTier(tier: "pro" | "elite"): string | null {
  if (tier === "pro") return process.env.PADDLE_PRO_PRICE_ID ?? null;
  return process.env.PADDLE_ELITE_PRICE_ID ?? null;
}
