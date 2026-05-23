/**
 * Production smoke test.
 *
 * Hits the public surface of game-companion-ai.replit.app and fails loudly
 * if anything regresses. Safe to run unauthenticated — only touches
 * endpoints that are public by design (health, billing config, marketing
 * pages, legal pages).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts smoke
 *   BASE_URL=https://staging.example smoke
 */

const BASE = (process.env.BASE_URL ?? "https://game-companion-ai.replit.app").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

type Check = {
  name: string;
  path: string;
  expect?: number | number[];
  contains?: string;
  json?: (body: unknown) => string | null;
};

// The frontend is a client-rendered SPA, so all marketing/legal routes
// serve the same HTML shell — we can only assert the shell loaded, not
// route-specific content. Route correctness is covered by the e2e tests.
const SPA_SHELL_MARKER = "<title>Unstuck";

const checks: Check[] = [
  { name: "health", path: "/api/healthz", expect: 200, contains: "ok" },
  {
    name: "billing config has Paddle client token + live price IDs",
    path: "/api/billing/config",
    expect: 200,
    json: (body) => {
      const b = body as { clientToken?: unknown; environment?: unknown; prices?: { pro?: unknown; elite?: unknown } } | null;
      if (!b || typeof b !== "object") return "not an object";
      if (typeof b.clientToken !== "string" || !b.clientToken) return "missing clientToken";
      if (b.environment !== "production") return `environment is "${String(b.environment)}", expected "production"`;
      if (typeof b.prices?.pro !== "string" || !b.prices.pro.startsWith("pri_")) return "missing prices.pro";
      if (typeof b.prices?.elite !== "string" || !b.prices.elite.startsWith("pri_")) return "missing prices.elite";
      return null;
    },
  },
  { name: "SPA shell at /", path: "/", expect: 200, contains: SPA_SHELL_MARKER },
  { name: "SPA shell at /pricing", path: "/pricing", expect: 200, contains: SPA_SHELL_MARKER },
  { name: "SPA shell at /legal/terms", path: "/legal/terms", expect: 200, contains: SPA_SHELL_MARKER },
  { name: "SPA shell at /legal/privacy", path: "/legal/privacy", expect: 200, contains: SPA_SHELL_MARKER },
  { name: "SPA shell at /legal/refund", path: "/legal/refund", expect: 200, contains: SPA_SHELL_MARKER },
  // Auth-gated routes must respond with 401 — proves the route exists.
  { name: "/api/me requires auth", path: "/api/me", expect: 401 },
  { name: "/api/admin/usage requires auth", path: "/api/admin/usage", expect: 401 },
  { name: "/api/billing/usage requires auth", path: "/api/billing/usage", expect: 401 },
];

async function run(check: Check): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${check.path}`, { signal: ctl.signal, redirect: "manual" });
    const expected = check.expect == null ? [200] : Array.isArray(check.expect) ? check.expect : [check.expect];
    if (!expected.includes(res.status)) {
      return { ok: false, reason: `status ${res.status}, expected ${expected.join("|")}` };
    }
    if (check.contains || check.json) {
      const text = await res.text();
      if (check.contains && !text.includes(check.contains)) {
        return { ok: false, reason: `body missing "${check.contains}"` };
      }
      if (check.json) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, reason: "body is not valid JSON" };
        }
        const err = check.json(parsed);
        if (err) return { ok: false, reason: err };
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  console.log(`Smoke testing ${BASE}\n`);
  const results = await Promise.all(checks.map(async (c) => ({ check: c, result: await run(c) })));
  let failed = 0;
  for (const { check, result } of results) {
    if (result.ok) {
      console.log(`  PASS  ${check.name}  (${check.path})`);
    } else {
      failed++;
      console.log(`  FAIL  ${check.name}  (${check.path})  -> ${result.reason}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
