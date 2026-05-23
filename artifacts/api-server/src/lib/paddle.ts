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

/**
 * Startup sanity check for the Paddle billing wiring.
 *
 * In live mode it's catastrophic to ship with a missing webhook secret,
 * with sandbox price IDs (every checkout would 404), or with missing
 * price IDs at all. We can't tell sandbox from live price IDs by string
 * pattern — they're both `pri_01…` — so we ask Paddle directly: if a
 * price ID doesn't exist in the catalog the configured API key points
 * at, the SDK throws and we log a LOUD error.
 *
 * Non-blocking: we kick off the network probes async so a flaky Paddle
 * API can't keep the server from booting. Failures are surfaced via
 * the logger, where they'll show up in deployment logs the first time
 * an operator looks.
 */
export function validatePaddleConfig(): void {
  const isLive = paddleEnvironment === Environment.production;
  const proId = process.env.PADDLE_PRO_PRICE_ID;
  const eliteId = process.env.PADDLE_ELITE_PRICE_ID;
  const overageProductId = process.env.PADDLE_OVERAGE_PRODUCT_ID;
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  logger.info(
    {
      environment: isLive ? "production" : "sandbox",
      hasApiKey: !!apiKey,
      hasWebhookSecret: !!webhookSecret,
      hasProPriceId: !!proId,
      hasElitePriceId: !!eliteId,
      hasOverageProductId: !!overageProductId,
    },
    "Paddle configuration"
  );

  if (!isLive) return;

  // Hard requirements for live mode.
  if (!webhookSecret) {
    logger.error(
      "PADDLE_API_KEY is live but PADDLE_WEBHOOK_SECRET is unset. " +
        "Subscription events will be rejected as unsigned and users " +
        "will be stuck on the free plan after paying."
    );
  }
  if (!proId) {
    logger.error(
      "PADDLE_API_KEY is live but PADDLE_PRO_PRICE_ID is unset. " +
        "Pro checkouts will fail."
    );
  }
  if (!eliteId) {
    logger.error(
      "PADDLE_API_KEY is live but PADDLE_ELITE_PRICE_ID is unset. " +
        "Elite checkouts will fail."
    );
  }
  if (!overageProductId) {
    logger.warn(
      "PADDLE_API_KEY is live but PADDLE_OVERAGE_PRODUCT_ID is unset. " +
        "Period-end overage charges will be skipped — silent revenue leak."
    );
  }

  // Async price-existence probe. We can't tell a sandbox price ID from a
  // live one by pattern, but the live API will 404 on a sandbox ID.
  if (!apiKey) return;
  const paddle = getPaddle();
  const probe = async (tier: "pro" | "elite", priceId: string | undefined) => {
    if (!priceId) return;
    try {
      const price = await paddle.prices.get(priceId);
      logger.info(
        { tier, priceId, productId: price.productId },
        "Paddle price OK"
      );
    } catch (err) {
      logger.error(
        { tier, priceId, err: (err as Error).message },
        `PADDLE_${tier.toUpperCase()}_PRICE_ID does not exist in the live ` +
          `Paddle catalog. This is almost certainly a sandbox ID left over ` +
          `from testing — checkouts for this tier will fail.`
      );
    }
  };
  void probe("pro", proId);
  void probe("elite", eliteId);
}
