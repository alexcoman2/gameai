import fs from "fs";
import path from "path";
import os from "os";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

type ConversationMessage = {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
};

const DATA_DIR = path.join(os.homedir(), ".gaming-companion");
const HISTORY_FILE = path.join(DATA_DIR, "conversation-history.json");

const MAX_HISTORY_BYTES = 512 * 1024;

export function loadHistory(): ConversationMessage[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as ConversationMessage[];
      }
    }
  } catch (err) {
    logger.warn(
      { err, file: HISTORY_FILE },
      "Failed to read conversation history file; starting with empty history"
    );
  }
  return [];
}

export function saveHistory(history: ConversationMessage[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let trimmed = [...history];
    let serialized = JSON.stringify(trimmed, null, 2);

    while (
      Buffer.byteLength(serialized, "utf-8") > MAX_HISTORY_BYTES &&
      trimmed.length > 0
    ) {
      trimmed = trimmed.slice(1);
      serialized = JSON.stringify(trimmed, null, 2);
    }

    fs.writeFileSync(HISTORY_FILE, serialized, "utf-8");
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
