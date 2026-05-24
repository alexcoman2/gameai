import { logger } from "./logger.js";

// Minimal PayPal REST client. We don't pull in @paypal/payouts-sdk or any
// SDK because (a) PayPal's official Node SDK is deprecated for new work
// and (b) the few endpoints we touch (OAuth, subscriptions, webhook
// signature verification, plan/product creation) are trivial fetch calls.

type Env = "sandbox" | "live";

function detectEnvironment(): Env {
  const raw = process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase();
  if (raw === "live" || raw === "production") return "live";
  return "sandbox";
}

export const paypalEnvironment: Env = detectEnvironment();

export const paypalBaseUrl =
  paypalEnvironment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID?.trim() || undefined;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim() || undefined;

export type PaidTier = "pro" | "pro_plus" | "elite";

export function planIdForTier(tier: PaidTier): string | null {
  if (tier === "pro") return process.env.PAYPAL_PRO_PLAN_ID ?? null;
  if (tier === "pro_plus") return process.env.PAYPAL_PRO_PLUS_PLAN_ID ?? null;
  return process.env.PAYPAL_ELITE_PLAN_ID ?? null;
}

export const PLAN_TO_TIER: Record<string, PaidTier> = {
  ...(process.env.PAYPAL_PRO_PLAN_ID
    ? { [process.env.PAYPAL_PRO_PLAN_ID]: "pro" as const }
    : {}),
  ...(process.env.PAYPAL_PRO_PLUS_PLAN_ID
    ? { [process.env.PAYPAL_PRO_PLUS_PLAN_ID]: "pro_plus" as const }
    : {}),
  ...(process.env.PAYPAL_ELITE_PLAN_ID
    ? { [process.env.PAYPAL_ELITE_PLAN_ID]: "elite" as const }
    : {}),
};

// Cached OAuth bearer token. PayPal tokens last ~9 hours; we refresh a
// minute before expiry. Stored module-scope so concurrent requests share
// a single fetch when the cache is cold.
type CachedToken = { token: string; expiresAt: number };
let _token: CachedToken | null = null;
let _tokenPromise: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  if (!clientId || !clientSecret) {
    throw new Error(
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set — PayPal billing endpoints cannot be used.",
    );
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth failed: HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return data.access_token + "|" + String(Date.now() + (data.expires_in - 60) * 1000);
}

export async function getAccessToken(): Promise<string> {
  if (_token && _token.expiresAt > Date.now()) return _token.token;
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = (async () => {
    const packed = await fetchToken();
    const [token, expiresAtStr] = packed.split("|");
    _token = { token, expiresAt: Number(expiresAtStr) };
    return token;
  })();
  try {
    return await _tokenPromise;
  } finally {
    _tokenPromise = null;
  }
}

// Generic authenticated request helper. Returns parsed JSON or throws.
// On 401, invalidates the token cache and retries once with a fresh one
// (covers tokens revoked server-side or our clock drifting past expiry).
export async function paypalFetch<T = unknown>(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
): Promise<T> {
  async function once(token: string): Promise<Response> {
    return fetch(`${paypalBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  let token = await getAccessToken();
  let res = await once(token);
  if (res.status === 401) {
    _token = null;
    token = await getAccessToken();
    res = await once(token);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Best-effort parse — PayPal returns a JSON envelope with `name`,
    // `message`, `debug_id`, `details[]`. Surface it as structured
    // fields on the thrown Error so callers can branch on `name`
    // (e.g. RESOURCE_NOT_FOUND, INVALID_REQUEST) without string-
    // matching the raw payload.
    let parsed: { name?: string; message?: string; debug_id?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON — keep parsed null
    }
    const err = new Error(
      `PayPal ${init.method ?? "GET"} ${path} failed: HTTP ${res.status} ${parsed?.message ?? text}`,
    ) as Error & {
      paypalStatus?: number;
      paypalName?: string;
      paypalMessage?: string;
      paypalDebugId?: string;
    };
    err.paypalStatus = res.status;
    err.paypalName = parsed?.name;
    err.paypalMessage = parsed?.message;
    err.paypalDebugId = parsed?.debug_id;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Status taxonomy for entitlement decisions. Keep one source of truth so
// the webhook handler and the confirm endpoint cannot disagree.
const ACTIVE_STATUSES = new Set(["ACTIVE", "APPROVED"]);
const TERMINAL_STATUSES = new Set([
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
]);

export function isActiveSubscriptionStatus(status: string | undefined | null): boolean {
  return !!status && ACTIVE_STATUSES.has(status.toUpperCase());
}

export function isTerminalSubscriptionStatus(status: string | undefined | null): boolean {
  return !!status && TERMINAL_STATUSES.has(status.toUpperCase());
}

// ── Subscription creation ────────────────────────────────────────────────────

export type CreateSubscriptionResult = {
  id: string;
  status: string;
  approveUrl: string;
};

export async function createSubscription(opts: {
  planId: string;
  userId: string;
  email?: string | null;
  returnUrl: string;
  cancelUrl: string;
  brandName?: string;
}): Promise<CreateSubscriptionResult> {
  const body = {
    plan_id: opts.planId,
    custom_id: opts.userId,
    ...(opts.email ? { subscriber: { email_address: opts.email } } : {}),
    application_context: {
      brand_name: opts.brandName ?? "Unstuck",
      user_action: "SUBSCRIBE_NOW" as const,
      shipping_preference: "NO_SHIPPING" as const,
      return_url: opts.returnUrl,
      cancel_url: opts.cancelUrl,
    },
  };
  const res = await paypalFetch<{
    id: string;
    status: string;
    links: Array<{ rel: string; href: string; method: string }>;
  }>("/v1/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const approve = res.links.find((l) => l.rel === "approve");
  if (!approve) {
    throw new Error("PayPal subscription creation did not return an approve link");
  }
  return { id: res.id, status: res.status, approveUrl: approve.href };
}

export type SubscriptionDetail = {
  id: string;
  status: string; // APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
  plan_id: string;
  custom_id?: string;
  subscriber?: { email_address?: string; payer_id?: string };
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
    last_payment?: { time?: string };
    cycle_executions?: Array<{ tenure_type: string; sequence: number }>;
  };
};

export async function getSubscription(id: string): Promise<SubscriptionDetail> {
  return paypalFetch<SubscriptionDetail>(`/v1/billing/subscriptions/${id}`);
}

export async function cancelSubscription(id: string, reason: string): Promise<void> {
  await paypalFetch(`/v1/billing/subscriptions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ── Webhook signature verification ────────────────────────────────────────────

export async function verifyWebhookSignature(opts: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    logger.warn("PAYPAL_WEBHOOK_ID not set — webhook signatures cannot be verified");
    return false;
  }

  function pick(name: string): string {
    const v = opts.headers[name] ?? opts.headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0] ?? "";
    return (v as string | undefined) ?? "";
  }

  const payload = {
    transmission_id: pick("paypal-transmission-id"),
    transmission_time: pick("paypal-transmission-time"),
    cert_url: pick("paypal-cert-url"),
    auth_algo: pick("paypal-auth-algo"),
    transmission_sig: pick("paypal-transmission-sig"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(opts.rawBody),
  };

  try {
    const res = await paypalFetch<{ verification_status: "SUCCESS" | "FAILURE" }>(
      "/v1/notifications/verify-webhook-signature",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return res.verification_status === "SUCCESS";
  } catch (e) {
    logger.warn({ err: e }, "PayPal webhook verification call failed");
    return false;
  }
}

// ── One-time setup: create product + 3 plans ─────────────────────────────────

export type SetupResult = {
  productId: string;
  plans: { pro: string; pro_plus: string; elite: string };
};

export async function setupProductsAndPlans(): Promise<SetupResult> {
  const product = await paypalFetch<{ id: string }>("/v1/catalogs/products", {
    method: "POST",
    headers: { "PayPal-Request-Id": `unstuck-product-${Date.now()}` },
    body: JSON.stringify({
      name: "Unstuck Subscription",
      description: "AI gaming assistant subscription",
      type: "SERVICE",
      category: "SOFTWARE",
    }),
  });

  async function makePlan(name: string, priceUsd: string): Promise<string> {
    const plan = await paypalFetch<{ id: string }>("/v1/billing/plans", {
      method: "POST",
      headers: { "PayPal-Request-Id": `unstuck-plan-${name.replace(/\W+/g, "")}-${Date.now()}` },
      body: JSON.stringify({
        product_id: product.id,
        name,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: { interval_unit: "MONTH", interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0, // 0 = infinite
            pricing_scheme: {
              fixed_price: { value: priceUsd, currency_code: "USD" },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee: { value: "0", currency_code: "USD" },
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3,
        },
      }),
    });
    return plan.id;
  }

  const pro = await makePlan("Unstuck Pro", "19.00");
  const pro_plus = await makePlan("Unstuck Pro+", "39.00");
  const elite = await makePlan("Unstuck Elite", "99.00");

  return { productId: product.id, plans: { pro, pro_plus, elite } };
}

// ── Startup config check ─────────────────────────────────────────────────────

export function validatePaypalConfig(): void {
  const fp = clientId ? `${clientId.slice(0, 4)}…${clientId.slice(-2)} (len ${clientId.length})` : "none";
  logger.info(
    {
      environment: paypalEnvironment,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdFingerprint: fp,
      hasWebhookId: !!process.env.PAYPAL_WEBHOOK_ID,
      hasProPlanId: !!process.env.PAYPAL_PRO_PLAN_ID,
      hasProPlusPlanId: !!process.env.PAYPAL_PRO_PLUS_PLAN_ID,
      hasElitePlanId: !!process.env.PAYPAL_ELITE_PLAN_ID,
    },
    "PayPal configuration",
  );

  if (!clientId || !clientSecret) return;

  if (!process.env.PAYPAL_PRO_PLAN_ID || !process.env.PAYPAL_PRO_PLUS_PLAN_ID || !process.env.PAYPAL_ELITE_PLAN_ID) {
    logger.warn(
      "PayPal credentials set but plan IDs missing. POST /api/admin/paypal/setup-plans (as admin) to create them, then paste the returned IDs as PAYPAL_PRO_PLAN_ID / PAYPAL_PRO_PLUS_PLAN_ID / PAYPAL_ELITE_PLAN_ID secrets.",
    );
  }

  if (!process.env.PAYPAL_WEBHOOK_ID) {
    logger.warn(
      "PAYPAL_WEBHOOK_ID is unset. Webhooks will fail signature verification. Create a webhook in PayPal Developer Dashboard pointing at https://<host>/api/webhooks/paypal subscribed to BILLING.SUBSCRIPTION.* events, then paste its Webhook ID as PAYPAL_WEBHOOK_ID.",
    );
  }
}

export function isPaypalConfigured(): boolean {
  return !!clientId && !!clientSecret;
}
