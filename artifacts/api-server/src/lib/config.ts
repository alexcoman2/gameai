import fs from "fs";
import path from "path";
import os from "os";

export interface AppConfig {
  apiKey: string | null;
  screenshotInterval: number;
  autoCapture: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".gaming-companion");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  apiKey: null,
  screenshotInterval: 30,
  autoCapture: true,
};

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        apiKey: parsed.apiKey ?? null,
        screenshotInterval:
          typeof parsed.screenshotInterval === "number"
            ? Math.max(10, Math.min(300, parsed.screenshotInterval))
            : DEFAULT_CONFIG.screenshotInterval,
        autoCapture:
          typeof parsed.autoCapture === "boolean"
            ? parsed.autoCapture
            : DEFAULT_CONFIG.autoCapture,
      };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const next: AppConfig = {
    apiKey: updates.apiKey !== undefined ? updates.apiKey : current.apiKey,
    screenshotInterval:
      updates.screenshotInterval !== undefined
        ? Math.max(10, Math.min(300, updates.screenshotInterval))
        : current.screenshotInterval,
    autoCapture:
      updates.autoCapture !== undefined
        ? updates.autoCapture
        : current.autoCapture,
  };

  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf-8");
  } catch {
    // Silently ignore write failures (e.g., read-only filesystem)
  }

  return next;
}
