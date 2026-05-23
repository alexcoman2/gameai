/**
 * Single source of truth for which deployment mode this api-server instance
 * is running in. Three modes:
 *
 *   - "hosted": the public Replit deployment. Has Anthropic/Exa/Paddle/Clerk
 *     credentials. Enforces Clerk auth on every protected route. Per-machine
 *     local routes (sessions, screenshot, settings, game detection, chat
 *     clear) are disabled because they expose shared per-process state that
 *     would be visible to all users.
 *
 *   - "proxy": the local Electron-bundled instance running on the user's
 *     desktop. Trusts the single local user. Forwards AI/billing calls to
 *     the hosted server (which performs the real auth check). Enables the
 *     per-machine local routes.
 *
 *   - "dev": Replit workspace dev environment. Same route set as "proxy"
 *     so engineers can exercise local routes during development, but no
 *     UNSTUCK_API_URL is set so AI calls run direct against Anthropic.
 */
export type ServerMode = "hosted" | "proxy" | "dev";

function detect(): ServerMode {
  if (process.env.AUTH_MODE === "proxy") return "proxy";
  if (process.env.UNSTUCK_API_URL || process.env.NEXUS_LINK_API_URL) return "proxy";
  if (process.env.NODE_ENV !== "production") return "dev";
  return "hosted";
}

export const SERVER_MODE: ServerMode = detect();
export const IS_HOSTED = SERVER_MODE === "hosted";
export const IS_PROXY = SERVER_MODE === "proxy";
export const IS_LOCAL_ROUTES_ENABLED = SERVER_MODE !== "hosted";
