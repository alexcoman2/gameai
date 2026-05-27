// Sessions API — chat session CRUD + message reads.
//
// Three deployment modes (see lib/server-mode.ts):
//
//   HOSTED  — public Replit server. Sessions are persisted in Postgres,
//             scoped by Clerk userId. Auth is required on every call.
//   PROXY   — local Electron-bundled api-server. Forwards every request
//             upstream to the hosted server so persistence stays on the
//             account, not the machine. The user's Authorization header
//             is relayed so the hosted server can scope by userId.
//   DEV     — Replit workspace dev. Falls back to the legacy fs-backed
//             store so engineers can iterate without auth/DB plumbing.
import { Router, type Request, type Response } from "express";
import {
  listSessions as listSessionsFs,
  createSession as createSessionFs,
  getSession as getSessionFs,
  updateSession as updateSessionFs,
  deleteSession as deleteSessionFs,
  loadSessionMessages as loadSessionMessagesFs,
  clearSession as clearSessionFs,
} from "../lib/sessions-store.js";
import {
  listSessions as listSessionsDb,
  createSession as createSessionDb,
  getSession as getSessionDb,
  updateSession as updateSessionDb,
  deleteSession as deleteSessionDb,
  loadSessionMessages as loadSessionMessagesDb,
  clearSession as clearSessionDb,
} from "../lib/sessions-db.js";
import { IS_HOSTED, IS_PROXY } from "../lib/server-mode.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

const protect = IS_HOSTED ? [requireAuth] : [];

// ── Proxy mode — pass-through to hosted ──────────────────────────────────────
async function forwardToHosted(
  req: Request,
  res: Response,
  init?: { method?: string; body?: unknown },
): Promise<void> {
  const hostedUrl =
    process.env.UNSTUCK_API_URL ?? process.env.NEXUS_LINK_API_URL;
  if (!hostedUrl) {
    res
      .status(500)
      .json({ error: "Proxy mode is misconfigured: no UNSTUCK_API_URL." });
    return;
  }
  const authHeader = req.headers.authorization;
  try {
    const upstream = await fetch(`${hostedUrl}${req.originalUrl}`, {
      method: init?.method ?? req.method,
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body:
        init?.body !== undefined
          ? JSON.stringify(init.body)
          : req.method === "GET" || req.method === "HEAD"
            ? undefined
            : JSON.stringify(req.body ?? {}),
    });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const data = await upstream.json().catch(() => ({}));
      res.json(data);
    } else {
      const text = await upstream.text().catch(() => "");
      res.send(text);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `Failed to reach sessions service: ${msg}` });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.get("/sessions", ...protect, async (req, res) => {
  if (IS_PROXY) return forwardToHosted(req, res);
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(await listSessionsDb(req.userId));
    return;
  }
  // dev
  res.json(listSessionsFs());
});

router.post("/sessions", ...protect, async (req, res) => {
  const { name } = req.body as { name?: string };
  const fallback = `Session ${new Date().toLocaleDateString()}`;
  if (IS_PROXY) return forwardToHosted(req, res, { body: { name } });
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const session = await createSessionDb(req.userId, name || fallback);
    res.json(session);
    return;
  }
  res.json(createSessionFs(name || fallback));
});

router.get("/sessions/:sessionId/messages", ...protect, async (req, res) => {
  const { sessionId } = req.params as { sessionId: string };
  if (IS_PROXY) return forwardToHosted(req, res);
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const session = await getSessionDb(req.userId, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const messages = await loadSessionMessagesDb(req.userId, sessionId);
    res.json({ id: sessionId, messages });
    return;
  }
  const session = getSessionFs(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ id: sessionId, messages: loadSessionMessagesFs(sessionId) });
});

router.patch("/sessions/:sessionId", ...protect, async (req, res) => {
  const { sessionId } = req.params as { sessionId: string };
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (IS_PROXY)
    return forwardToHosted(req, res, { body: { name: name.trim() } });
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const updated = await updateSessionDb(req.userId, sessionId, {
      name: name.trim(),
    });
    if (!updated) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(updated);
    return;
  }
  const updated = updateSessionFs(sessionId, { name: name.trim() });
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(updated);
});

router.delete("/sessions/:sessionId", ...protect, async (req, res) => {
  const { sessionId } = req.params as { sessionId: string };
  if (IS_PROXY) return forwardToHosted(req, res);
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const ok = await deleteSessionDb(req.userId, sessionId);
    if (!ok) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ ok: true });
    return;
  }
  const ok = deleteSessionFs(sessionId);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/sessions/:sessionId/clear", ...protect, async (req, res) => {
  const { sessionId } = req.params as { sessionId: string };
  if (IS_PROXY) return forwardToHosted(req, res);
  if (IS_HOSTED) {
    if (!req.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const session = await getSessionDb(req.userId, sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await clearSessionDb(req.userId, sessionId);
    res.json({ ok: true });
    return;
  }
  const session = getSessionFs(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  clearSessionFs(sessionId);
  res.json({ ok: true });
});

export default router;
