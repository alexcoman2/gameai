import { Router } from "express";
import {
  listSessions,
  createSession,
  getSession,
  updateSession,
  deleteSession,
  loadSessionMessages,
  clearSession,
} from "../lib/sessions-store.js";

const router = Router();

router.get("/sessions", (_req, res) => {
  res.json(listSessions());
});

router.post("/sessions", (req, res) => {
  const { name } = req.body as { name?: string };
  const session = createSession(name || `Session ${new Date().toLocaleDateString()}`);
  res.json(session);
});

router.get("/sessions/:sessionId/messages", (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const messages = loadSessionMessages(sessionId);
  res.json({ id: sessionId, messages });
});

router.patch("/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const updated = updateSession(sessionId, { name: name.trim() });
  if (!updated) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(updated);
});

router.delete("/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const ok = deleteSession(sessionId);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/sessions/:sessionId/clear", (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  clearSession(sessionId);
  res.json({ ok: true });
});

export default router;
