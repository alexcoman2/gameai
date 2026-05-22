import { Router } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import https from "https";
import { loadConfig } from "../lib/config.js";

const execAsync = promisify(exec);
const router = Router();

const GAME_PROCESS_MAP: Record<string, string> = {
  // Action / Adventure
  "witcher3.exe": "The Witcher 3: Wild Hunt",
  "cyberpunk2077.exe": "Cyberpunk 2077",
  "eldenring.exe": "Elden Ring",
  "sekiro.exe": "Sekiro: Shadows Die Twice",
  "darksouls3.exe": "Dark Souls III",
  "darksouls2.exe": "Dark Souls II",
  "darksouls.exe": "Dark Souls: Remastered",
  "demonsouls.exe": "Demon's Souls",
  "bloodborne.exe": "Bloodborne",
  "gotham.exe": "Gotham Knights",
  "batman.exe": "Batman: Arkham Knight",
  "assassinscreed.exe": "Assassin's Creed",
  "acblackflag.exe": "Assassin's Creed IV: Black Flag",
  "acodyssey.exe": "Assassin's Creed Odyssey",
  "acorigins.exe": "Assassin's Creed Origins",
  "acvalhalla.exe": "Assassin's Creed Valhalla",
  "rdr2.exe": "Red Dead Redemption 2",
  "gtav.exe": "GTA V",
  "ghostoftsushima.exe": "Ghost of Tsushima",
  "horizon.exe": "Horizon Zero Dawn",
  "horizonforbiddenwest.exe": "Horizon Forbidden West",
  "deathstranding.exe": "Death Stranding",
  "spiderman.exe": "Marvel's Spider-Man",
  "spiderman2.exe": "Marvel's Spider-Man 2",
  "godofwar.exe": "God of War",
  "godofwaragnarok.exe": "God of War Ragnarök",
  "tlou.exe": "The Last of Us Part I",
  "tloupart2.exe": "The Last of Us Part II",
  "control.exe": "Control",
  "alansake.exe": "Alan Wake",
  "alanwake2.exe": "Alan Wake 2",
  "thecallisto.exe": "The Callisto Protocol",
  "returnal.exe": "Returnal",
  "deathloop.exe": "Deathloop",
  // RPG
  "bg3.exe": "Baldur's Gate 3",
  "pathfinder.exe": "Pathfinder: Wrath of the Righteous",
  "divinity.exe": "Divinity: Original Sin 2",
  "pillarsofeternity.exe": "Pillars of Eternity",
  "tyranny.exe": "Tyranny",
  "dragonageinquisition.exe": "Dragon Age: Inquisition",
  "masseffect.exe": "Mass Effect",
  "dragonage.exe": "Dragon Age: Origins",
  "skyrim.exe": "The Elder Scrolls V: Skyrim",
  "skyrimse.exe": "Skyrim Special Edition",
  "morrowind.exe": "The Elder Scrolls III: Morrowind",
  "oblivion.exe": "The Elder Scrolls IV: Oblivion",
  "fallout4.exe": "Fallout 4",
  "falloutnv.exe": "Fallout: New Vegas",
  "fallout3.exe": "Fallout 3",
  "starfield.exe": "Starfield",
  "monster_hunter.exe": "Monster Hunter World",
  "mhrise.exe": "Monster Hunter Rise",
  "nioh2.exe": "Nioh 2",
  "niohthecomplete.exe": "Nioh: The Complete Edition",
  "wo_long.exe": "Wo Long: Fallen Dynasty",
  "strangersoftime.exe": "Lies of P",
  "liesofp.exe": "Lies of P",
  "ff7remake.exe": "Final Fantasy VII Remake",
  "ff16.exe": "Final Fantasy XVI",
  "xc3.exe": "Xenoblade Chronicles 3",
  "persona5.exe": "Persona 5 Royal",
  "persona4.exe": "Persona 4 Golden",
  "persona3.exe": "Persona 3 Reload",
  // FPS / Shooter
  "bioshock.exe": "BioShock",
  "bioshockinfinite.exe": "BioShock Infinite",
  "dishonored.exe": "Dishonored",
  "dishonored2.exe": "Dishonored 2",
  "prey.exe": "Prey",
  "doom.exe": "DOOM",
  "doomethernal.exe": "DOOM Eternal",
  "wolfenstein.exe": "Wolfenstein: The New Order",
  "wolf2.exe": "Wolfenstein II: The New Colossus",
  "metro.exe": "Metro Exodus",
  "farcry5.exe": "Far Cry 5",
  "farcry6.exe": "Far Cry 6",
  "callofduty.exe": "Call of Duty: Modern Warfare",
  "halflife2.exe": "Half-Life 2",
  "hl2.exe": "Half-Life 2",
  "alyx.exe": "Half-Life: Alyx",
  "outriders.exe": "Outriders",
  // Horror / Survival
  "re2.exe": "Resident Evil 2",
  "re3.exe": "Resident Evil 3",
  "re4.exe": "Resident Evil 4",
  "re7.exe": "Resident Evil 7",
  "re8.exe": "Resident Evil Village",
  "re4remake.exe": "Resident Evil 4 Remake",
  "deadspace.exe": "Dead Space",
  "deadspace2.exe": "Dead Space 2",
  "deadspaceds.exe": "Dead Space (2023)",
  "outlast.exe": "Outlast",
  "ageofcalamity.exe": "Hyrule Warriors: Age of Calamity",
  // Adventure / Puzzle
  "portal2.exe": "Portal 2",
  "thelast.exe": "The Last Guardian",
  "journey.exe": "Journey",
  "gorogoa.exe": "Gorogoa",
  "tunic.exe": "Tunic",
  "returnobsidian.exe": "Return to Monkey Island",
  // Platformers
  "celeste.exe": "Celeste",
  "hollowknight.exe": "Hollow Knight",
  "silksong.exe": "Hollow Knight: Silksong",
  "cuphead.exe": "Cuphead",
  "shovelknight.exe": "Shovel Knight",
  "rainworld.exe": "Rain World",
  "ori.exe": "Ori and the Will of the Wisps",
  "hades.exe": "Hades",
  "hades2.exe": "Hades II",
  "supergiant.exe": "Pyre",
  "transistor.exe": "Transistor",
  "bastion.exe": "Bastion",
  // Strategy
  "civilization6.exe": "Civilization VI",
  "civ6.exe": "Civilization VI",
  "civilization5.exe": "Civilization V",
  "xcom2.exe": "XCOM 2",
  "stellaris.exe": "Stellaris",
  "frostpunk.exe": "Frostpunk",
  "frostpunk2.exe": "Frostpunk 2",
  "ageofempires4.exe": "Age of Empires IV",
  // Open world / Sandbox
  "minecraft.exe": "Minecraft",
  "terraria.exe": "Terraria",
  "stardew.exe": "Stardew Valley",
  "stardewvalley.exe": "Stardew Valley",
  "no_mans_sky.exe": "No Man's Sky",
  "subnautica.exe": "Subnautica",
  "subnauticabelow.exe": "Subnautica: Below Zero",
  "theforest.exe": "The Forest",
  "sonsoftheforest.exe": "Sons of the Forest",
  "grounded.exe": "Grounded",
  "valheim.exe": "Valheim",
  "dinkumgame.exe": "Dinkum",
  // Indie
  "disco.exe": "Disco Elysium",
  "firewatch.exe": "Firewatch",
  "oxenfree.exe": "Oxenfree",
  "nightinthewoods.exe": "Night in the Woods",
  "undertale.exe": "Undertale",
  "deltarune.exe": "Deltarune",
  "spiritfarer.exe": "Spiritfarer",
  "databreachchronicles.exe": "Norco",
  "a_plague_tale.exe": "A Plague Tale: Innocence",
  "aplaguetale2.exe": "A Plague Tale: Requiem",
  // Racing / Sports
  "forza5.exe": "Forza Horizon 5",
  "forza4.exe": "Forza Horizon 4",
  "forzamotorsport.exe": "Forza Motorsport",
  "nfsheat.exe": "Need for Speed Heat",
};

/**
 * Processes that are definitely NOT games. Checked case-insensitively against
 * the full process name (including .exe suffix where present).
 */
const NON_GAME_PROCESSES = new Set([
  // Windows system / infrastructure
  "system", "system idle process", "registry", "smss.exe", "csrss.exe",
  "wininit.exe", "winlogon.exe", "lsass.exe", "lsaiso.exe", "services.exe",
  "svchost.exe", "dwm.exe", "explorer.exe", "taskmgr.exe", "taskhost.exe",
  "taskhostw.exe", "conhost.exe", "condrv.exe", "audiodg.exe", "spoolsv.exe",
  "wuauclt.exe", "wermgr.exe", "searchindexer.exe", "searchhost.exe",
  "fontdrvhost.exe", "sihost.exe", "ctfmon.exe", "runtimebroker.exe",
  "shellexperiencehost.exe", "startmenuexperiencehost.exe", "textinputhost.exe",
  "securityhealthservice.exe", "securityhealthsystray.exe",
  "msiexec.exe", "mscorsvw.exe", "ngen.exe", "compattelrunner.exe",
  "backgroundtaskhost.exe", "backgroundtransferhost.exe",
  "useroobebroker.exe", "settingshandler.exe",
  // Game launchers / overlay (not games themselves)
  "steam.exe", "steamwebhelper.exe", "gameoverlayui.exe", "steamservice.exe",
  "epicgameslauncher.exe", "easyanticheat.exe", "easyanticheat_eosinstaller.exe",
  "gog galaxy.exe", "gogalaxy.exe", "ubisoft connect.exe", "ubisoftconnect.exe",
  "uplaywebcore.exe", "battle.net.exe", "battlenet.exe", "blizzard update agent.exe",
  "origin.exe", "easanticheat.exe", "anticheatsdk.exe",
  "bethesdanetlauncher.exe", "playnite.exe",
  // Anti-cheat / overlays
  "nvcontainer.exe", "nvspcap64.dll", "nvsphelper64.exe", "nvidia share.exe",
  "nvidiadisplaycontainer.exe", "nvtelemetrycontainer.exe",
  "discord.exe", "discordptb.exe", "discordcanary.exe",
  "obs64.exe", "obs32.exe", "obs.exe",
  "xboxapp.exe", "xboxgamebar.exe", "xboxgamebarwidgets.exe",
  "gamebar.exe", "gamebarftserver.exe",
  "reshade.exe",
  // Runtimes / tooling
  "node.exe", "node", "python.exe", "python3.exe", "python",
  "java.exe", "javaw.exe", "dotnet.exe",
  "code.exe", "devenv.exe", "rider64.exe",
  "powershell.exe", "cmd.exe", "wsl.exe", "bash.exe",
  // Browsers
  "chrome.exe", "msedge.exe", "firefox.exe", "opera.exe", "brave.exe",
  "iexplore.exe", "safari.exe",
  // Common productivity
  "outlook.exe", "winword.exe", "excel.exe", "powerpnt.exe",
  "slack.exe", "teams.exe", "zoom.exe", "skype.exe",
  "spotify.exe", "itunes.exe", "vlc.exe",
  "7zfm.exe", "winrar.exe", "winzip.exe",
  // Antivirus / security
  "msmpeng.exe", "nissrv.exe", "msseces.exe", "avp.exe", "avgui.exe",
  "bdagent.exe", "ekrn.exe",
]);

/**
 * Normalize a process name into a human-readable search query by stripping
 * the .exe suffix and replacing separators with spaces.
 */
function processToSearchQuery(proc: string): string {
  return proc
    .replace(/\.exe$/i, "")
    .replace(/[_\-]+/g, " ")
    .trim();
}

/**
 * Fetch JSON from a URL using the built-in https module (no third-party deps).
 */
function fetchJson<T>(url: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

interface SteamStoreSearchItem {
  id: number;
  name: string;
}
interface SteamStoreSearchResult {
  total: number;
  items: SteamStoreSearchItem[];
}

interface SteamAppListEntry {
  appid: number;
  name: string;
}
interface SteamAppListResult {
  applist: { apps: SteamAppListEntry[] };
}

/**
 * Simple token-based similarity: returns a value between 0 and 1.
 * Higher = closer match.
 */
function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const s2 = b.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  const tokens1 = s1.split(/\s+/);
  const tokens2 = s2.split(/\s+/);
  const set2 = new Set(tokens2);
  const matches = tokens1.filter((t) => t.length > 1 && set2.has(t)).length;
  return (2 * matches) / (tokens1.length + tokens2.length);
}

// In-memory cache for Steam store search results (keyed by query, expires after 10 min)
const steamSearchCache = new Map<string, { result: string | null; expiry: number }>();
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

// In-memory cache for the full Steam app list (fetched at most once per 6 hours)
let steamAppListCache: SteamAppListEntry[] | null = null;
let steamAppListFetchedAt = 0;
const STEAM_APP_LIST_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Look up a process name via Steam.
 *
 * Strategy:
 *  1. If the user has a Steam API key, scan the cached full app list
 *     (refreshed every 6 h) — requires score ≥ 0.6 to accept.
 *  2. Otherwise query the public Steam store search endpoint — requires
 *     score ≥ 0.6 to accept as medium confidence.
 *
 * Returns null rather than exposing low-quality guesses to avoid false positives.
 * Results are cached per query for 10 minutes to avoid redundant network calls.
 */
async function lookupOnSteam(
  processName: string,
  steamApiKey: string
): Promise<string | null> {
  const query = processToSearchQuery(processName);
  if (query.length < 3) return null;

  const cached = steamSearchCache.get(query);
  if (cached && Date.now() < cached.expiry) return cached.result;

  let gameName: string | null = null;

  try {
    if (steamApiKey) {
      gameName = await lookupInSteamAppList(query, steamApiKey);
    }

    if (!gameName) {
      const encoded = encodeURIComponent(query);
      const url = `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=english&cc=US`;
      const result = await fetchJson<SteamStoreSearchResult>(url, 4000);

      if (result.items && result.items.length > 0) {
        const best = result.items[0];
        if (similarity(query, best.name) >= 0.6) {
          gameName = best.name;
        }
      }
    }
  } catch {
    // Network unavailable — silently fall through
  }

  steamSearchCache.set(query, { result: gameName, expiry: Date.now() + SEARCH_CACHE_TTL_MS });
  return gameName;
}

async function lookupInSteamAppList(
  query: string,
  apiKey: string
): Promise<string | null> {
  const now = Date.now();
  if (!steamAppListCache || now - steamAppListFetchedAt > STEAM_APP_LIST_TTL_MS) {
    try {
      const url = `https://api.steampowered.com/ISteamApps/GetAppList/v2/?key=${encodeURIComponent(apiKey)}`;
      const result = await fetchJson<SteamAppListResult>(url, 5000);
      steamAppListCache = result?.applist?.apps ?? [];
      steamAppListFetchedAt = now;
    } catch {
      return null;
    }
  }

  if (!steamAppListCache || steamAppListCache.length === 0) return null;

  let bestScore = 0;
  let bestName = "";

  for (const app of steamAppListCache) {
    if (!app.name) continue;
    const score = similarity(query, app.name);
    if (score > bestScore) {
      bestScore = score;
      bestName = app.name;
      if (score === 1) break;
    }
  }

  return bestScore >= 0.6 ? bestName : null;
}

async function getRunningProcesses(): Promise<string[]> {
  try {
    const platform = os.platform();

    if (platform === "win32") {
      const { stdout } = await execAsync("tasklist /fo csv /nh", { timeout: 5000 });
      return stdout
        .split("\n")
        .map((line) => {
          const parts = line.split(",");
          return parts[0]?.replace(/"/g, "").trim().toLowerCase() ?? "";
        })
        .filter(Boolean);
    } else if (platform === "linux") {
      const { stdout } = await execAsync("ps -eo comm --no-headers", { timeout: 5000 });
      return stdout.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
    } else {
      const { stdout } = await execAsync("ps -eo comm", { timeout: 5000 });
      return stdout.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    return [];
  }
}

/**
 * Decide whether a process name is a plausible game candidate worth sending to
 * the Steam API.  We are conservative here to avoid false positives:
 *  - Must end in .exe (Windows executable)
 *  - Must NOT be in the non-game skip list
 *  - Name portion (sans .exe) must be at least 4 characters
 */
function isGameCandidate(proc: string): boolean {
  if (!proc.endsWith(".exe")) return false;
  if (NON_GAME_PROCESSES.has(proc)) return false;
  const base = proc.replace(/\.exe$/i, "");
  return base.length >= 4;
}

router.get("/game/detect", async (_req, res) => {
  const processes = await getRunningProcesses();
  const config = loadConfig();

  let matchedGame: string | null = null;
  let matchedProcess: string | null = null;
  let confidence: "high" | "medium" | "low" | "none" = "none";

  // Pass 1: exact match against the local lookup table (high confidence)
  for (const proc of processes) {
    const normalized = proc.toLowerCase().replace(/\s+/g, "");
    const gameKey = Object.keys(GAME_PROCESS_MAP).find(
      (key) => normalized === key || proc === key
    );
    if (gameKey) {
      matchedGame = GAME_PROCESS_MAP[gameKey] ?? null;
      matchedProcess = proc;
      confidence = "high";
      break;
    }
  }

  // Pass 2: partial / substring match against the local lookup table (medium confidence)
  if (!matchedGame) {
    for (const proc of processes) {
      const normalized = proc.toLowerCase();
      for (const [key, game] of Object.entries(GAME_PROCESS_MAP)) {
        const keyBase = key.replace(".exe", "").toLowerCase();
        if (normalized.includes(keyBase) && keyBase.length > 4) {
          matchedGame = game;
          matchedProcess = proc;
          confidence = "medium";
          break;
        }
      }
      if (matchedGame) break;
    }
  }

  // Pass 3: Steam API lookup for plausible game candidates not found locally.
  // Restricted to:
  //   - Windows .exe processes only (explicit game binaries)
  //   - A conservative skip list of known non-game processes
  //   - At most MAX_STEAM_CANDIDATES checked to bound latency
  //   - An overall wall-clock budget (PASS3_BUDGET_MS) to keep the endpoint responsive
  //   - Only accepts matches with similarity ≥ 0.6 (medium confidence)
  if (!matchedGame) {
    const MAX_STEAM_CANDIDATES = 8;
    const PASS3_BUDGET_MS = 6000;
    const pass3Start = Date.now();

    const candidates = processes
      .filter(isGameCandidate)
      .slice(0, MAX_STEAM_CANDIDATES);

    for (const proc of candidates) {
      if (Date.now() - pass3Start > PASS3_BUDGET_MS) break;

      const gameName = await lookupOnSteam(proc, config.steamApiKey);
      if (gameName) {
        matchedGame = gameName;
        matchedProcess = proc;
        confidence = "medium";
        break;
      }
    }
  }

  res.json({
    detected: matchedGame !== null,
    gameName: matchedGame,
    processName: matchedProcess,
    confidence,
  });
});

export default router;
