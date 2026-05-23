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
