/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Exported so that app.ts
 * (clerkMiddleware callback) and this proxy middleware agree on which
 * hostname is canonical — otherwise multi-domain/custom-domain flows
 * break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) || "";
        const proxyOrigin = `${protocol}://${host}`;
        const proxyUrl = `${proxyOrigin}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        // Clerk Production keys validate that the incoming Origin header
        // matches (or is a subdomain of) the proxy URL. When the request
        // comes from a desktop client (e.g. Electron at 127.0.0.1), the
        // browser-supplied Origin won't match. Rewrite Origin and Referer
        // to the proxy's own origin so FAPI accepts the call.
        proxyReq.setHeader("Origin", proxyOrigin);
        proxyReq.setHeader("Referer", `${proxyOrigin}/`);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
      proxyRes: (proxyRes, req) => {
        // We rewrote the upstream Origin to satisfy Clerk's same-origin
        // check, so FAPI's CORS response headers come back addressed to
        // the proxy domain — which the browser will reject as a mismatch
        // against its own (different) Origin. Rewrite the CORS headers
        // back to the original client Origin so the browser accepts them.
        const clientOrigin = req.headers["origin"];
        if (clientOrigin) {
          proxyRes.headers["access-control-allow-origin"] = clientOrigin;
          proxyRes.headers["access-control-allow-credentials"] = "true";
          const vary = proxyRes.headers["vary"];
          const varyStr = Array.isArray(vary) ? vary.join(", ") : vary || "";
          if (!/\borigin\b/i.test(varyStr)) {
            proxyRes.headers["vary"] = varyStr
              ? `${varyStr}, Origin`
              : "Origin";
          }
        }

        // Clerk's FAPI sets cookies with `Domain=clerk.<…>` and
        // `Domain=.<something>.clerk.dev`. The browser sees the response
        // coming back from our proxy host (e.g. game-companion-ai.replit.app)
        // and REJECTS those cookies as a domain mismatch — so the
        // `__client` and `__session` cookies never get stored, and the
        // user is signed out the moment the Clerk JWT expires (or the app
        // is relaunched). Strip the Domain attribute so the browser scopes
        // each cookie to the proxy host instead.
        const setCookie = proxyRes.headers["set-cookie"];
        if (setCookie && Array.isArray(setCookie)) {
          proxyRes.headers["set-cookie"] = setCookie.map((c) =>
            c.replace(/;\s*Domain=[^;]+/gi, ""),
          );
        }
      },
    },
  }) as RequestHandler;
}

/**
 * Passthrough variant mounted by the LOCAL api-server when running inside
 * the Electron desktop app (IS_PROXY). The local server has no Clerk
 * secret key — the real `clerkProxyMiddleware` above lives on the hosted
 * deployment. This middleware simply reverse-proxies the local
 * `/api/__clerk/*` path to the hosted server's `/api/__clerk/*` path,
 * preserving the URL prefix.
 *
 * The purpose is to make clerk-js's XHRs first-party from the renderer's
 * perspective. clerk-js running at http://127.0.0.1:8765 calls
 * `/api/__clerk/v1/*` on its own origin — the browser includes the local
 * Clerk cookies automatically (no SameSite or third-party-cookie issues).
 * This local proxy forwards request + cookies to the hosted proxy, which
 * authenticates against Clerk FAPI with the secret key. Set-Cookie
 * responses flow back through local → browser and land first-party on
 * 127.0.0.1, completing the loop without ever needing the renderer to
 * make a cross-site call.
 *
 * Without this, clerk-js was hitting `https://game-companion-ai.replit
 * .app/api/__clerk/v1/client` cross-site from 127.0.0.1, the browser
 * stripped the `SameSite=Lax` Clerk cookies from the request, FAPI
 * returned "signed out", and the page rendered signed-out even though
 * the cookie mirror had successfully populated 127.0.0.1's cookie jar.
 */
export function clerkProxyPassthroughMiddleware(): RequestHandler {
  const hostedUrl =
    process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (!hostedUrl) {
    // No upstream configured (e.g. dev mode without UNSTUCK_API_URL) — fall
    // through so the request 404s instead of hanging.
    return (_req, _res, next) => next();
  }
  const hostedRoot = hostedUrl.replace(/\/$/, "");
  return createProxyMiddleware({
    target: hostedUrl,
    changeOrigin: true,
    // Follow upstream redirects server-side. The hosted /api/__clerk
    // endpoint returns a 307 for unversioned clerk-js URLs (e.g. the
    // initial `.../clerk-js@6/...` request redirects to the pinned
    // `.../clerk-js@6.12.0/...` URL). If we forward the 307 to the
    // browser, the renderer makes a second request and the response
    // chain becomes ambiguous (and historically got cached as HTML).
    // With followRedirects: true the proxy walks the chain itself and
    // returns a single 200 + the real JS body to the browser. No
    // Location header to rewrite, no second round-trip, no cache
    // poisoning surface.
    followRedirects: true,
    // No pathRewrite — hosted server expects the same /api/__clerk/*
    // prefix, so just forward the path as-is.
    on: {
      proxyReq: (proxyReq) => {
        // Defensive cache-poisoning guard. Earlier versions of this
        // proxy returned an HTML 307 body for the unversioned
        // clerk.browser.js URL; the browser cached that bad body, and
        // on every subsequent launch its conditional re-validation
        // (If-None-Match / If-Modified-Since) won a 304 and the
        // poisoned body kept being served. Stripping the conditional
        // headers here forces the upstream to send the full current
        // body every time, so a fixed upstream immediately overwrites
        // any stale cached entry.
        proxyReq.removeHeader("if-none-match");
        proxyReq.removeHeader("if-modified-since");
        proxyReq.removeHeader("if-none-range");
      },
      proxyRes: (proxyRes) => {
        // Belt-and-suspenders: even with followRedirects: true above,
        // if any 3xx ever slips through, rewrite hosted-origin Location
        // headers to local-relative so the browser stays on 127.0.0.1
        // and the chain remains first-party / same-origin.
        const loc = proxyRes.headers["location"];
        if (typeof loc === "string" && loc.startsWith(hostedRoot)) {
          proxyRes.headers["location"] = loc.slice(hostedRoot.length);
        }
        // Force no-store on every /api/__clerk response. The browser
        // disk cache was the root cause of the v2.0.20→v2.0.22 stuck-
        // state: a bad response got cached, conditional revalidation
        // kept the bad body alive across versions, and the server-side
        // fix never had a chance to land. Disallowing caching of this
        // path eliminates the entire class of failure. clerk-js bundles
        // are tiny and the local proxy is on loopback, so the perf
        // cost is negligible.
        proxyRes.headers["cache-control"] = "no-store";
        delete proxyRes.headers["etag"];
        delete proxyRes.headers["last-modified"];
        // Defensive: hosted proxy already strips Domain from Set-Cookie,
        // but if anything slips through, scope it to the local host so
        // the browser actually stores it on 127.0.0.1.
        const setCookie = proxyRes.headers["set-cookie"];
        if (setCookie && Array.isArray(setCookie)) {
          proxyRes.headers["set-cookie"] = setCookie.map((c) =>
            c.replace(/;\s*Domain=[^;]+/gi, ""),
          );
        }
      },
    },
  }) as RequestHandler;
}
