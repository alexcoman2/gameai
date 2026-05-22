import fs from "fs";
import path from "path";
import os from "os";
import Anthropic from "@anthropic-ai/sdk";

type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

const DATA_DIR = path.join(os.homedir(), ".gaming-companion");
const HISTORY_FILE = path.join(DATA_DIR, "conversation-history.json");

export function loadHistory(): ConversationMessage[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as ConversationMessage[];
      }
    }
  } catch {
    // Fall through to empty history on any read/parse error
  }
  return [];
}

export function saveHistory(history: ConversationMessage[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  } catch {
    // Silently ignore write failures (e.g., read-only filesystem)
  }
}

export function clearHistory(): void {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  } catch {
    // Silently ignore failures
  }
}
