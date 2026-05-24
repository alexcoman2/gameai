import fs from "fs";
import path from "path";
import os from "os";

export interface AppConfig {
  steamApiKey: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".gaming-companion");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  steamApiKey: "",
};

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      // Old config files may still carry screenshotInterval/autoCapture
      // from before watch mode replaced the polling loop — they are
      // ignored here. The next saveConfig() rewrites the file without
      // them, so the cruft self-cleans on first settings save.
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        steamApiKey:
          typeof parsed.steamApiKey === "string"
            ? parsed.steamApiKey
            : DEFAULT_CONFIG.steamApiKey,
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
    steamApiKey:
      updates.steamApiKey !== undefined
        ? updates.steamApiKey
        : current.steamApiKey,
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
