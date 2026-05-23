import { initializePaddle, type Paddle } from "@paddle/paddle-js";

type PaddleConfig = {
  clientToken: string | null;
  environment: "sandbox" | "production";
  prices: { pro: string | null; elite: string | null };
};

let _paddle: Paddle | null = null;
let _config: PaddleConfig | null = null;
let _loadPromise: Promise<Paddle | null> | null = null;

async function fetchConfig(): Promise<PaddleConfig> {
  if (_config) return _config;
  const res = await fetch("/api/billing/config");
  if (!res.ok) throw new Error(`Failed to fetch billing config: ${res.status}`);
  _config = (await res.json()) as PaddleConfig;
  return _config;
}

export async function getPaddleConfig(): Promise<PaddleConfig> {
  return fetchConfig();
}

export async function loadPaddle(): Promise<Paddle | null> {
  if (_paddle) return _paddle;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const cfg = await fetchConfig();
    if (!cfg.clientToken) {
      console.error("PADDLE_CLIENT_TOKEN not configured on server");
      return null;
    }
    const paddle = await initializePaddle({
      environment: cfg.environment,
      token: cfg.clientToken,
    });
    _paddle = paddle ?? null;
    return _paddle;
  })();
  return _loadPromise;
}

export async function openCheckout(opts: {
  tier: "pro" | "elite";
}): Promise<void> {
  const paddle = await loadPaddle();
  if (!paddle) {
    throw new Error("Paddle.js failed to initialize");
  }

  // Server creates the transaction and binds customData.userId from the
  // authenticated session — the browser never supplies the user identity.
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: opts.tier }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to start checkout (HTTP ${res.status})`);
  }
  const { transactionId, email } = (await res.json()) as {
    transactionId: string;
    email: string | null;
  };

  paddle.Checkout.open({
    transactionId,
    customer: email ? { email } : undefined,
    settings: {
      displayMode: "overlay",
      theme: "dark",
      successUrl: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/upgrade?success=1`,
    },
  });
}
