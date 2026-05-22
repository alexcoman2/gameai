import { Router } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

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

async function getRunningProcesses(): Promise<string[]> {
  try {
    const platform = os.platform();
    let output: string;

    if (platform === "win32") {
      const { stdout } = await execAsync("tasklist /fo csv /nh", {
        timeout: 5000,
      });
      output = stdout;
      return output
        .split("\n")
        .map((line) => {
          const parts = line.split(",");
          return parts[0]?.replace(/"/g, "").trim().toLowerCase() ?? "";
        })
        .filter(Boolean);
    } else if (platform === "linux") {
      const { stdout } = await execAsync("ps -eo comm --no-headers", {
        timeout: 5000,
      });
      return stdout
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean);
    } else {
      const { stdout } = await execAsync("ps -eo comm", { timeout: 5000 });
      return stdout
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean);
    }
  } catch {
    return [];
  }
}

router.get("/game/detect", async (_req, res) => {
  const processes = await getRunningProcesses();

  let matchedGame: string | null = null;
  let matchedProcess: string | null = null;
  let confidence: "high" | "medium" | "low" | "none" = "none";

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

  res.json({
    detected: matchedGame !== null,
    gameName: matchedGame,
    processName: matchedProcess,
    confidence,
  });
});

export default router;
