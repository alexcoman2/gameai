import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  screenshot: string | null;
};

export type SessionMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  gameContext: string | null;
};

const DATA_DIR = path.join(os.homedir(), ".gaming-companion");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const INDEX_FILE = path.join(SESSIONS_DIR, "index.json");

const MAX_SCREENSHOTS_PER_SESSION = 10;

function getScreenshotsDir(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, "screenshots");
}

export function saveScreenshotFile(sessionId: string, messageId: string, base64Data: string): void {
  try {
    const dir = getScreenshotsDir(sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const file = path.join(dir, `${messageId}.png`);
    fs.writeFileSync(file, Buffer.from(clean, "base64"));

    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);

    if (files.length > MAX_SCREENSHOTS_PER_SESSION) {
      const toDelete = files.slice(0, files.length - MAX_SCREENSHOTS_PER_SESSION);
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(dir, f.name)); } catch {}
      }
    }
  } catch {}
}

function loadScreenshotFile(sessionId: string, messageId: string): string | null {
  try {
    const file = path.join(getScreenshotsDir(sessionId), `${messageId}.png`);
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file);
      return `data:image/png;base64,${data.toString("base64")}`;
    }
  } catch {}
  return null;
}

function ensureDirs(sessionId?: string): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  if (sessionId) {
    const dir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function saveIndex(sessions: SessionMeta[]): void {
  ensureDirs();
  try {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(sessions, null, 2), "utf-8");
  } catch {}
}

export function listSessions(): SessionMeta[] {
  try {
    ensureDirs();
    if (fs.existsSync(INDEX_FILE)) {
      const raw = fs.readFileSync(INDEX_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SessionMeta[];
    }
  } catch {}
  return [];
}

export function createSession(name: string): SessionMeta {
  const id = randomUUID();
  const now = new Date().toISOString();
  const session: SessionMeta = {
    id,
    name: name.trim() || `Session ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    gameContext: null,
  };
  ensureDirs(id);
  const sessions = listSessions();
  sessions.unshift(session);
  saveIndex(sessions);
  return session;
}

export function getSession(id: string): SessionMeta | null {
  return listSessions().find((s) => s.id === id) ?? null;
}

export function updateSession(
  id: string,
  updates: Partial<Pick<SessionMeta, "name" | "updatedAt" | "messageCount" | "gameContext">>
): SessionMeta | null {
  const sessions = listSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  sessions[idx] = { ...sessions[idx], ...updates };
  saveIndex(sessions);
  return sessions[idx];
}

export function deleteSession(id: string): boolean {
  const sessions = listSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  saveIndex(sessions);
  const dir = path.join(SESSIONS_DIR, id);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  } catch {}
  return true;
}

export function loadSessionHistory(sessionId: string): ConversationMessage[] {
  try {
    const file = path.join(SESSIONS_DIR, sessionId, "history.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ConversationMessage[];
    }
  } catch {}
  return [];
}

export function saveSessionHistory(
  sessionId: string,
  history: ConversationMessage[]
): void {
  try {
    ensureDirs(sessionId);
    const file = path.join(SESSIONS_DIR, sessionId, "history.json");
    fs.writeFileSync(file, JSON.stringify(history, null, 2), "utf-8");
  } catch {}
}

function loadSessionMessagesRaw(sessionId: string): DisplayMessage[] {
  try {
    const file = path.join(SESSIONS_DIR, sessionId, "messages.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DisplayMessage[];
    }
  } catch {}
  return [];
}

export function loadSessionMessages(sessionId: string): DisplayMessage[] {
  return loadSessionMessagesRaw(sessionId).map((msg) => {
    if (msg.screenshot && msg.screenshot.startsWith("file:")) {
      const msgId = msg.screenshot.slice(5);
      return { ...msg, screenshot: loadScreenshotFile(sessionId, msgId) };
    }
    return msg;
  });
}

export function saveSessionMessages(
  sessionId: string,
  messages: DisplayMessage[]
): void {
  try {
    ensureDirs(sessionId);
    const file = path.join(SESSIONS_DIR, sessionId, "messages.json");
    fs.writeFileSync(file, JSON.stringify(messages, null, 2), "utf-8");
  } catch {}
}

export function appendSessionMessages(
  sessionId: string,
  newMessages: DisplayMessage[]
): void {
  const existing = loadSessionMessagesRaw(sessionId);
  saveSessionMessages(sessionId, [...existing, ...newMessages]);
}

function removeScreenshotsDir(sessionId: string): void {
  const dir = getScreenshotsDir(sessionId);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  } catch {}
}

export function clearSession(sessionId: string): void {
  const histFile = path.join(SESSIONS_DIR, sessionId, "history.json");
  const msgsFile = path.join(SESSIONS_DIR, sessionId, "messages.json");
  try {
    if (fs.existsSync(histFile)) fs.unlinkSync(histFile);
  } catch {}
  try {
    if (fs.existsSync(msgsFile)) fs.unlinkSync(msgsFile);
  } catch {}
  removeScreenshotsDir(sessionId);
  updateSession(sessionId, { messageCount: 0, updatedAt: new Date().toISOString() });
}
