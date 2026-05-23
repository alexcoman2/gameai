type GameKnowledge = {
  wikiDomains: string[];
  specialistPrompt: string;
};

type GameMatcher = {
  patterns: RegExp[];
  knowledge: GameKnowledge;
};

const GAME_REGISTRY: GameMatcher[] = [
  {
    patterns: [
      /dark souls/i,
      /demon'?s souls/i,
      /elden ring/i,
      /bloodborne/i,
      /sekiro/i,
      /\bds[123]\b/i,
    ],
    knowledge: {
      wikiDomains: ["fextralife.com", "soulsplanner.com"],
      specialistPrompt: `SOULSBORNE EXPERT MODE: Use canonical area names (Firelink Shrine, Anor Londo, Lordran, Lothric, etc.) only when confirmed from screenshot or context. Know boss movesets, parry/dodge timings, weapon scaling (Str/Dex/Int/Fai), upgrade paths, covenant rewards, NPC questlines, illusory walls. Reference specific item names (Estus Flask, Humanity, Souls of [Boss]). Soulsborne players value precise tactical info — exact iframes, dead-angle attacks, optimal weapon arts, hyper-armor breakpoints.`,
    },
  },
  {
    patterns: [/diablo\s*iv/i, /diablo\s*4/i, /\bd4\b/i],
    knowledge: {
      wikiDomains: ["maxroll.gg", "icy-veins.com", "d4builds.gg"],
      specialistPrompt: `DIABLO IV EXPERT MODE: Know all 5 classes (Barbarian, Druid, Necromancer, Rogue, Sorcerer, Spiritborn), Paragon boards, Glyphs, Aspects, Uniques, Mythic Uniques, Tempering/Masterworking. Know current season meta (always check via web search for the latest season). Know endgame: Pit, Infernal Hordes, Helltides, Whispers, Boss Ladder (Lord Zir, Beast in the Ice, Andariel, Duriel, Uber Lilith), Tormented bosses, Echo of Andariel. Use specific affix/aspect names, not generic descriptions.`,
    },
  },
  {
    patterns: [/diablo\s*iii/i, /diablo\s*3/i, /\bd3\b/i],
    knowledge: {
      wikiDomains: ["icy-veins.com", "maxroll.gg"],
      specialistPrompt: `DIABLO III EXPERT MODE: Know all 7 classes, Greater Rifts, Paragon, Kanai's Cube, set bonuses, current season theme. Always web-search for current season's best builds.`,
    },
  },
  {
    patterns: [/path of exile/i, /\bpoe\b/i],
    knowledge: {
      wikiDomains: ["poewiki.net", "poe.ninja", "pathofexile.fandom.com"],
      specialistPrompt: `PATH OF EXILE EXPERT MODE: Know passive tree, ascendancies, all skill gems & support gems, currency tiers, league mechanics, Atlas tree, Maven/Sirus/Uber bosses. Use poe.ninja terminology. Always web-search for current league.`,
    },
  },
  {
    patterns: [/world of warcraft/i, /\bwow\b/i],
    knowledge: {
      wikiDomains: ["wowhead.com", "icy-veins.com", "raider.io"],
      specialistPrompt: `WORLD OF WARCRAFT EXPERT MODE: Know all classes/specs, current expansion content, M+ dungeons, raid bosses, profession recipes, talent trees. Always web-search for current patch tier lists.`,
    },
  },
  {
    patterns: [/league of legends/i, /\blol\b/i],
    knowledge: {
      wikiDomains: ["mobalytics.gg", "u.gg", "op.gg", "leagueoflegends.fandom.com"],
      specialistPrompt: `LEAGUE OF LEGENDS EXPERT MODE: Know all 160+ champions, ability cooldowns/scaling, current patch meta, rune setups, item builds, jungle pathing, lane matchups, objective control (drakes, herald, baron). Always web-search for current patch tier lists.`,
    },
  },
  {
    patterns: [/helldivers/i],
    knowledge: {
      wikiDomains: ["helldivers.wiki.gg", "helldivers.fandom.com"],
      specialistPrompt: `HELLDIVERS 2 EXPERT MODE: Know all stratagems (cooldowns, uses), enemy factions (Terminids, Automatons, Illuminate), armor passives, weapons by tier, current Major Order, planet effects.`,
    },
  },
  {
    patterns: [/monster hunter/i, /\bmh\s?(world|rise|wilds)\b/i, /\bmhw\b/i, /\bmhr\b/i],
    knowledge: {
      wikiDomains: ["monsterhunter.fandom.com", "fextralife.com"],
      specialistPrompt: `MONSTER HUNTER EXPERT MODE: Know all 14 weapon types, monster weaknesses/breaks/parts, status build-up, decorations, skill stacking, optimal armor sets by element/status, hunt timings, charged blade phial economy, longsword spirit gauge management.`,
    },
  },
  {
    patterns: [/cyberpunk/i, /\bcp2077\b/i],
    knowledge: {
      wikiDomains: ["cyberpunk.fandom.com", "fextralife.com"],
      specialistPrompt: `CYBERPUNK 2077 EXPERT MODE: Know all 5 attribute trees post-2.0 rework, cyberware tiers/slots, quickhacks, iconic weapon locations, side gig timing for Phantom Liberty access, ending requirements, lifepath choices.`,
    },
  },
  {
    patterns: [/baldur'?s gate\s*3/i, /\bbg3\b/i],
    knowledge: {
      wikiDomains: ["bg3.wiki", "baldursgate3.wiki.fextralife.com"],
      specialistPrompt: `BALDUR'S GATE 3 EXPERT MODE: Know D&D 5e rules, all 12 classes + subclasses, multiclass synergies, spell slots, action economy, companion quests/approval, all 3 acts including hidden encounters, ending variations. Use canonical D&D terminology (advantage, concentration, AC, DC).`,
    },
  },
  {
    patterns: [/counter-?strike/i, /\bcs2\b/i, /\bcsgo\b/i],
    knowledge: {
      wikiDomains: ["liquipedia.net", "csstats.gg"],
      specialistPrompt: `COUNTER-STRIKE EXPERT MODE: Know all maps, common smokes/flashes/molotovs (utility lineups), economy management, weapon spray patterns (AK-47, M4, AWP), site executes, default setups, pistol round strats.`,
    },
  },
  {
    patterns: [/valorant/i],
    knowledge: {
      wikiDomains: ["mobalytics.gg", "valorant.fandom.com"],
      specialistPrompt: `VALORANT EXPERT MODE: Know all agents (abilities/cooldowns/ult points), all maps with callouts, weapon economy, lineup/setup guides, default executes per map per agent.`,
    },
  },
];

export function getGameKnowledge(gameName: string | null | undefined): GameKnowledge | null {
  if (!gameName) return null;
  const match = GAME_REGISTRY.find((m) => m.patterns.some((p) => p.test(gameName)));
  return match ? match.knowledge : null;
}

export function buildSpecialistAddendum(gameName: string | null | undefined): string {
  const k = getGameKnowledge(gameName);
  if (!k) return "";
  return `\n\nSPECIALIST KNOWLEDGE — ${gameName}:\n${k.specialistPrompt}\nWhen using web_search for this game, prefer these authoritative wikis: ${k.wikiDomains.join(", ")}.`;
}

export function getPreferredWikiDomains(gameName: string | null | undefined): string[] {
  const k = getGameKnowledge(gameName);
  return k?.wikiDomains ?? [];
}
