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
        // matches (or is a subdomain of) the proxy URL. A normal browser
        // request is already first-party on the proxy host, so its Origin
        // matches and we must leave it untouched — this is the canonical
        // behavior that makes web sign-in work in production.
        //
        // The ONLY exception is a desktop client: clerk-js running inside
        // Electron at http://127.0.0.1:<port> forwards its requests through
        // the local passthrough to this hosted proxy, carrying an Origin/
        // Referer of 127.0.0.1/localhost which FAPI would reject. For those
        // (and only those) requests, rewrite Origin/Referer to the proxy's
        // own origin. We check BOTH headers because some clerk-js calls
        // (e.g. GET /v1/client) omit Origin but still send a localhost
        // Referer. We deliberately do NOT touch normal browser or
        // top-level-navigation requests, keeping this middleware canonical
        // for the web flow.
        const isLocalDesktopUrl = (value: unknown): boolean =>
          typeof value === "string" &&
          /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(
            value,
          );
        if (
          isLocalDesktopUrl(req.headers["origin"]) ||
          isLocalDesktopUrl(req.headers["referer"])
        ) {
          proxyReq.setHeader("Origin", proxyOrigin);
          proxyReq.setHeader("Referer", `${proxyOrigin}/`);
        }

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
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
  const hostedHost = new URL(hostedUrl).host;

  // Hand-rolled fetch-based reverse proxy.
  //
  // Why not http-proxy-middleware: v4 is a from-scratch rewrite that
  // silently ignores the `followRedirects` option. The hosted
  // /api/__clerk/.../clerk-js@6/... endpoint returns a 307 redirect to
  // the pinned `.../clerk-js@6.12.0/...` URL. v4 forwarded the 307
  // (content-length: 0) straight to the browser; the renderer parsed
  // the empty/HTML body as JS and threw "Unexpected token <",
  // permanently breaking clerk-js initialization. v2.0.22 and v2.0.23
  // both failed on this.
  //
  // Native fetch follows redirects by default (redirect: "follow"), so
  // the browser only ever sees a single 200 + the real JS body. No
  // ambiguous redirect chain, no cache-poisoning surface, no opaque
  // proxy-library behavior.
  return async (req, res, next) => {
    try {
      // Reconstruct the upstream URL. req.originalUrl includes the
      // /api/__clerk prefix and any query string, which is exactly
      // what the hosted server expects.
      const upstreamUrl = `${hostedRoot}${req.originalUrl}`;

      // Forward request headers, dropping ones that don't transfer:
      // - host: set to the hosted host (changeOrigin)
      // - content-length: fetch will recompute
      // - connection / keep-alive / transfer-encoding: hop-by-hop
      // - if-none-match / if-modified-since: avoid 304 cache poisoning
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        const lower = name.toLowerCase();
        if (
          lower === "host" ||
          lower === "content-length" ||
          lower === "connection" ||
          lower === "keep-alive" ||
          lower === "transfer-encoding" ||
          lower === "upgrade" ||
          lower === "if-none-match" ||
          lower === "if-modified-since" ||
          lower === "if-none-range"
        ) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const v of value) headers.append(name, v);
        } else {
          headers.set(name, value);
        }
      }
      headers.set("host", hostedHost);

      // Body: only for methods that have one. Express has not yet
      // parsed JSON for this path (clerk proxy is mounted before
      // express.json), so req is a raw Readable stream.
      const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
      const init: RequestInit = {
        method: req.method,
        headers,
        redirect: "follow",
      };
      if (hasBody) {
        // Buffer the body. Clerk requests are small (cookies + tiny
        // JSON payloads); streaming isn't worth the complexity.
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        init.body = Buffer.concat(chunks);
        // Node fetch requires duplex: 'half' when sending a body that
        // isn't a string/Buffer/etc., but Buffer is fine and doesn't
        // need it.
      }

      const upstreamRes = await fetch(upstreamUrl, init);

      // Copy response headers, dropping hop-by-hop / encoding ones
      // (fetch already decoded the body, so content-encoding /
      // content-length from upstream would lie). Force no-store on
      // every response to make stale-cache poisoning impossible.
      const setCookies: string[] = [];
      upstreamRes.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (
          lower === "content-encoding" ||
          lower === "content-length" ||
          lower === "transfer-encoding" ||
          lower === "connection" ||
          lower === "keep-alive" ||
          lower === "etag" ||
          lower === "last-modified" ||
          lower === "cache-control"
        ) {
          return;
        }
        if (lower === "set-cookie") {
          // Headers.forEach folds set-cookie into a single comma-
          // joined string, which is wrong for cookies. Use getSetCookie
          // below instead.
          return;
        }
        res.setHeader(name, value);
      });
      // getSetCookie returns each Set-Cookie value as a separate entry
      // (Node 20+). Strip Domain= so cookies land on 127.0.0.1.
      const rawSetCookies =
        typeof upstreamRes.headers.getSetCookie === "function"
          ? upstreamRes.headers.getSetCookie()
          : [];
      for (const cookie of rawSetCookies) {
        setCookies.push(cookie.replace(/;\s*Domain=[^;]+/gi, ""));
      }
      if (setCookies.length > 0) {
        res.setHeader("set-cookie", setCookies);
      }
      res.setHeader("cache-control", "no-store");

      res.status(upstreamRes.status);

      // Stream body to the client. fetch's body is a web ReadableStream;
      // for small Clerk payloads buffering is simplest and safest.
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      res.end(buf);
    } catch (err) {
      // Pass to express error handler so a bad proxy hop doesn't hang
      // the renderer forever.
      next(err);
    }
  };
}
