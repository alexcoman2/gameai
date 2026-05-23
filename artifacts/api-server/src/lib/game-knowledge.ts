type GameKnowledge = {
  wikiDomains: string[];
  specialistPrompt: string;
};

export type SupportedGame = {
  id: string;
  displayName: string;
  genre: string;
  tagline: string;
  patterns: RegExp[];
  knowledge: GameKnowledge;
};

const GAME_REGISTRY: SupportedGame[] = [
  // ── Soulsborne ──────────────────────────────────────────────────────────
  {
    id: "soulsborne",
    displayName: "Soulsborne (Dark Souls, Elden Ring, Sekiro, Bloodborne)",
    genre: "Action RPG",
    tagline: "Boss movesets, parry timings, weapon scaling, illusory walls.",
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
  // ── ARPGs ───────────────────────────────────────────────────────────────
  {
    id: "diablo-4",
    displayName: "Diablo IV",
    genre: "ARPG",
    tagline: "Season meta, Paragon boards, Aspects, Pit & Uber bosses.",
    patterns: [/diablo\s*iv/i, /diablo\s*4/i, /\bd4\b/i],
    knowledge: {
      wikiDomains: ["maxroll.gg", "icy-veins.com", "d4builds.gg"],
      specialistPrompt: `DIABLO IV EXPERT MODE: Know all classes (Barbarian, Druid, Necromancer, Rogue, Sorcerer, Spiritborn), Paragon boards, Glyphs, Aspects, Uniques, Mythic Uniques, Tempering/Masterworking. Always web-search for the latest season. Endgame: Pit, Infernal Hordes, Helltides, Whispers, Boss Ladder (Lord Zir, Beast in the Ice, Andariel, Duriel, Uber Lilith), Tormented bosses, Echo of Andariel. Use specific affix/aspect names, not generic descriptions.`,
    },
  },
  {
    id: "diablo-3",
    displayName: "Diablo III",
    genre: "ARPG",
    tagline: "Greater Rifts, Kanai's Cube, current season builds.",
    patterns: [/diablo\s*iii/i, /diablo\s*3/i, /\bd3\b/i],
    knowledge: {
      wikiDomains: ["icy-veins.com", "maxroll.gg"],
      specialistPrompt: `DIABLO III EXPERT MODE: Know all 7 classes, Greater Rifts, Paragon, Kanai's Cube, set bonuses, current season theme. Always web-search for current season's best builds.`,
    },
  },
  {
    id: "path-of-exile",
    displayName: "Path of Exile / PoE 2",
    genre: "ARPG",
    tagline: "Passive tree, ascendancies, league mechanics, Atlas progression.",
    patterns: [/path of exile/i, /\bpoe\s*2?\b/i],
    knowledge: {
      wikiDomains: ["poewiki.net", "poe.ninja", "pathofexile.fandom.com"],
      specialistPrompt: `PATH OF EXILE EXPERT MODE: Know passive tree, ascendancies, all skill gems & support gems, currency tiers, league mechanics, Atlas tree, Maven/Sirus/Uber bosses. Use poe.ninja terminology. Always web-search for current league. For PoE 2, know the new skill-gem socket system and Act 1–3 campaign structure.`,
    },
  },
  {
    id: "last-epoch",
    displayName: "Last Epoch",
    genre: "ARPG",
    tagline: "Mastery classes, Monolith timelines, Crafting affixes.",
    patterns: [/last epoch/i],
    knowledge: {
      wikiDomains: ["lastepochtools.com", "maxroll.gg"],
      specialistPrompt: `LAST EPOCH EXPERT MODE: Know base classes & masteries (Sentinel/Mage/Primalist/Acolyte/Rogue), the Monolith of Fate system, Echoes, Blessings, the Forge crafting system (Tier 5, Rune of Shattering, Glyphs), Idol slots. Always web-search for current cycle meta.`,
    },
  },
  {
    id: "grim-dawn",
    displayName: "Grim Dawn",
    genre: "ARPG",
    tagline: "Dual masteries, Devotion shrines, Crucible & Shattered Realm.",
    patterns: [/grim dawn/i],
    knowledge: {
      wikiDomains: ["grimdawn.fandom.com", "grimtools.com"],
      specialistPrompt: `GRIM DAWN EXPERT MODE: Know dual-mastery class combos, the Devotion constellation system, faction reputations, Crucible/Shattered Realm endgame, Forgotten Gods/Ashes of Malmouth content.`,
    },
  },
  // ── Open-world RPG / Action ─────────────────────────────────────────────
  {
    id: "cyberpunk-2077",
    displayName: "Cyberpunk 2077",
    genre: "Open-world RPG",
    tagline: "2.0 perks, cyberware tiers, iconic weapons, Phantom Liberty.",
    patterns: [/cyberpunk/i, /\bcp2077\b/i],
    knowledge: {
      wikiDomains: ["cyberpunk.fandom.com", "fextralife.com"],
      specialistPrompt: `CYBERPUNK 2077 EXPERT MODE: Know all 5 attribute trees post-2.0 rework, cyberware tiers/slots, quickhacks, iconic weapon locations, side gig timing for Phantom Liberty access, ending requirements, lifepath choices.`,
    },
  },
  {
    id: "witcher-3",
    displayName: "The Witcher 3: Wild Hunt",
    genre: "Open-world RPG",
    tagline: "Signs, alchemy, Witcher gear sets, Gwent, hidden quests.",
    patterns: [/witcher\s*3/i, /wild hunt/i],
    knowledge: {
      wikiDomains: ["witcher.fandom.com", "fextralife.com"],
      specialistPrompt: `WITCHER 3 EXPERT MODE: Know all 5 signs (Igni, Aard, Quen, Yrden, Axii) and their alt-mode mutations, alchemy (decoctions, mutagens, oils), Witcher gear sets (Cat/Bear/Wolf/Griffin/Manticore), Gwent, B&W mutations, missable quests (Bloody Baron timing).`,
    },
  },
  {
    id: "skyrim",
    displayName: "The Elder Scrolls V: Skyrim",
    genre: "Open-world RPG",
    tagline: "Shouts, smithing/enchanting loops, Daedric quests.",
    patterns: [/skyrim/i, /\btes\s*5\b/i],
    knowledge: {
      wikiDomains: ["en.uesp.net", "elderscrolls.fandom.com"],
      specialistPrompt: `SKYRIM EXPERT MODE: Know perk trees, smithing/enchanting/alchemy loop, Shouts and word-wall locations, all factions (Companions, College, Thieves' Guild, Dark Brotherhood), Daedric quests, Dawnguard/Dragonborn DLC. Aware of common Special Edition / Anniversary mod patterns.`,
    },
  },
  {
    id: "starfield",
    displayName: "Starfield",
    genre: "Open-world RPG",
    tagline: "Ship building, outposts, faction questlines, NG+.",
    patterns: [/starfield/i],
    knowledge: {
      wikiDomains: ["starfieldwiki.net", "en.uesp.net"],
      specialistPrompt: `STARFIELD EXPERT MODE: Know skill trees & rank-up challenges, ship-builder modules and reactor/grav-drive limits, outpost resource chains, faction quests (UC Vanguard, Crimson Fleet, Freestar, Ryujin), Temple/Powers system, NG+ variants.`,
    },
  },
  {
    id: "baldurs-gate-3",
    displayName: "Baldur's Gate 3",
    genre: "CRPG",
    tagline: "5e rules, multiclass synergies, companion approval, all 3 acts.",
    patterns: [/baldur'?s gate\s*3/i, /\bbg3\b/i],
    knowledge: {
      wikiDomains: ["bg3.wiki", "baldursgate3.wiki.fextralife.com"],
      specialistPrompt: `BALDUR'S GATE 3 EXPERT MODE: Know D&D 5e rules, all 12 classes + subclasses, multiclass synergies, spell slots, action economy, companion quests/approval, all 3 acts including hidden encounters, ending variations. Use canonical D&D terminology (advantage, concentration, AC, DC).`,
    },
  },
  {
    id: "pathfinder-wotr",
    displayName: "Pathfinder: Wrath of the Righteous",
    genre: "CRPG",
    tagline: "Mythic paths, crusade mode, Pathfinder 1e build math.",
    patterns: [/pathfinder/i, /wrath of the righteous/i, /\bwotr\b/i],
    knowledge: {
      wikiDomains: ["pathfinderwrathoftherighteous.wiki.fextralife.com"],
      specialistPrompt: `PATHFINDER WOTR EXPERT MODE: Know Pathfinder 1e rules, all classes & archetypes, the 10 mythic paths (Angel, Demon, Lich, Trickster, Azata, Aeon, Gold Dragon, Swarm, Devil, Legend), crusade mode, companion builds, BAB/CMD/AC math.`,
    },
  },
  {
    id: "divinity-os2",
    displayName: "Divinity: Original Sin 2",
    genre: "CRPG",
    tagline: "Surface combat, source skills, origin tags, four-element synergy.",
    patterns: [/divinity.*original sin/i, /\bdos\s*2\b/i],
    knowledge: {
      wikiDomains: ["divinityoriginalsin2.wiki.fextralife.com"],
      specialistPrompt: `DIVINITY OS2 EXPERT MODE: Know elemental surfaces & status interactions, source skills, all schools (Pyro/Hydro/Aero/Geo/Necro/Polymorph/Summon/Scoundrel/Huntsman/Warfare), origin character tags, Lone Wolf scaling, armor system (physical/magic separation).`,
    },
  },
  // ── MMOs ───────────────────────────────────────────────────────────────
  {
    id: "wow",
    displayName: "World of Warcraft",
    genre: "MMORPG",
    tagline: "Current patch specs, M+ pulls, raid bosses, profession recipes.",
    patterns: [/world of warcraft/i, /\bwow\b/i],
    knowledge: {
      wikiDomains: ["wowhead.com", "icy-veins.com", "raider.io"],
      specialistPrompt: `WORLD OF WARCRAFT EXPERT MODE: Know all classes/specs, current expansion content, M+ dungeons, raid bosses, profession recipes, talent trees. Always web-search for current patch tier lists.`,
    },
  },
  {
    id: "ffxiv",
    displayName: "Final Fantasy XIV",
    genre: "MMORPG",
    tagline: "Job rotations, savage raids, role actions, MSQ gates.",
    patterns: [/final fantasy xiv/i, /\bffxiv\b/i, /\bff14\b/i],
    knowledge: {
      wikiDomains: ["thebalanceffxiv.com", "ffxiv.consolegameswiki.com"],
      specialistPrompt: `FFXIV EXPERT MODE: Know all jobs and their opener/2-minute burst windows, role actions, current Savage/Ultimate raid tier, Tomestone gear cap, Mentor/Roulette structure, MSQ expansion gates, gathering/crafting macros. Defer to The Balance for current rotations.`,
    },
  },
  {
    id: "osrs",
    displayName: "Old School RuneScape",
    genre: "MMORPG",
    tagline: "Skill methods, quest reqs, GE flips, raids 1–3.",
    patterns: [/runescape/i, /\bosrs\b/i],
    knowledge: {
      wikiDomains: ["oldschool.runescape.wiki"],
      specialistPrompt: `OSRS EXPERT MODE: Know skill XP/hr methods, quest requirements & rewards, slayer task strategies, Theatre/Tombs/Chambers of Xeric mechanics, GE flipping, bossing setups. The OSRS Wiki is canonical.`,
    },
  },
  // ── Looter shooters & live-service FPS ──────────────────────────────────
  {
    id: "helldivers-2",
    displayName: "Helldivers 2",
    genre: "Co-op Shooter",
    tagline: "Stratagems, faction weakpoints, Major Order, armor passives.",
    patterns: [/helldivers/i],
    knowledge: {
      wikiDomains: ["helldivers.wiki.gg", "helldivers.fandom.com"],
      specialistPrompt: `HELLDIVERS 2 EXPERT MODE: Know all stratagems (cooldowns, uses), enemy factions (Terminids, Automatons, Illuminate), armor passives, weapons by tier, current Major Order, planet effects.`,
    },
  },
  {
    id: "destiny-2",
    displayName: "Destiny 2",
    genre: "Looter Shooter",
    tagline: "Subclass 3.0 builds, raid encounters, exotic quests, Trials.",
    patterns: [/destiny\s*2/i],
    knowledge: {
      wikiDomains: ["light.gg", "todayindestiny.com", "raid.report"],
      specialistPrompt: `DESTINY 2 EXPERT MODE: Know all 3 classes & subclasses (Arc/Solar/Void/Stasis/Strand/Prismatic), current season artifact mods, raid encounters (callouts, mechanics), exotic missions, Trials/IB meta. Always web-search for current season.`,
    },
  },
  {
    id: "warframe",
    displayName: "Warframe",
    genre: "Looter Shooter",
    tagline: "Warframe abilities, modding, primes, void fissures.",
    patterns: [/warframe/i],
    knowledge: {
      wikiDomains: ["warframe.fandom.com", "overframe.gg"],
      specialistPrompt: `WARFRAME EXPERT MODE: Know warframe kits, modding (Galvanized, Arcanes, Helminth subsumes), prime farming (relic refinement, void fissures), open-world bounties (Cetus, Fortuna, Deimos), Steel Path, current Tennocon/update content.`,
    },
  },
  {
    id: "the-finals",
    displayName: "The Finals",
    genre: "Competitive FPS",
    tagline: "Class loadouts, contestant gadgets, cashout strategy.",
    patterns: [/the finals/i],
    knowledge: {
      wikiDomains: ["thefinals.wiki.gg"],
      specialistPrompt: `THE FINALS EXPERT MODE: Know Light/Medium/Heavy class kits, weapons, gadgets, specializations (Cloak, Heal Beam, Mesh Shield, Goo Gun, etc.), map destructibility, cashout/vault strategy, ranked tournament format.`,
    },
  },
  // ── Competitive ─────────────────────────────────────────────────────────
  {
    id: "league-of-legends",
    displayName: "League of Legends",
    genre: "MOBA",
    tagline: "160+ champion kits, runes, jungle pathing, lane matchups.",
    patterns: [/league of legends/i, /\blol\b/i],
    knowledge: {
      wikiDomains: ["mobalytics.gg", "u.gg", "op.gg", "leagueoflegends.fandom.com"],
      specialistPrompt: `LEAGUE OF LEGENDS EXPERT MODE: Know all 160+ champions, ability cooldowns/scaling, current patch meta, rune setups, item builds, jungle pathing, lane matchups, objective control (drakes, herald, baron). Always web-search for current patch tier lists.`,
    },
  },
  {
    id: "dota-2",
    displayName: "Dota 2",
    genre: "MOBA",
    tagline: "Hero matchups, item timings, neutral items, rune control.",
    patterns: [/dota\s*2/i, /\bdota\b/i],
    knowledge: {
      wikiDomains: ["liquipedia.net", "dota2.fandom.com", "dotabuff.com"],
      specialistPrompt: `DOTA 2 EXPERT MODE: Know all heroes, ability scaling, talent trees, neutral items by tier, rune timings (bounty, wisdom, power), item builds, lane matchups, roshan/aegis cycles. Always web-search for current patch.`,
    },
  },
  {
    id: "counter-strike",
    displayName: "Counter-Strike 2 / CS:GO",
    genre: "Tactical Shooter",
    tagline: "Lineups, spray patterns, default setups, economy.",
    patterns: [/counter-?strike/i, /\bcs\s*2\b/i, /\bcsgo\b/i],
    knowledge: {
      wikiDomains: ["liquipedia.net", "csstats.gg"],
      specialistPrompt: `COUNTER-STRIKE EXPERT MODE: Know all maps, common smokes/flashes/molotovs (utility lineups), economy management, weapon spray patterns (AK-47, M4, AWP), site executes, default setups, pistol round strats.`,
    },
  },
  {
    id: "valorant",
    displayName: "Valorant",
    genre: "Tactical Shooter",
    tagline: "Agent abilities, map callouts, util lineups, economy.",
    patterns: [/valorant/i],
    knowledge: {
      wikiDomains: ["mobalytics.gg", "valorant.fandom.com"],
      specialistPrompt: `VALORANT EXPERT MODE: Know all agents (abilities/cooldowns/ult points), all maps with callouts, weapon economy, lineup/setup guides, default executes per map per agent.`,
    },
  },
  {
    id: "apex-legends",
    displayName: "Apex Legends",
    genre: "Battle Royale",
    tagline: "Legend abilities, weapon meta, rotation theory, ring timings.",
    patterns: [/apex legends/i, /\bapex\b/i],
    knowledge: {
      wikiDomains: ["apexlegends.fandom.com", "apexlegendsstatus.com"],
      specialistPrompt: `APEX LEGENDS EXPERT MODE: Know all Legends (passive/tactical/ult/perks), current weapon meta, attachment priority, rotation theory, ring timings/damage, ranked split structure.`,
    },
  },
  {
    id: "fortnite",
    displayName: "Fortnite",
    genre: "Battle Royale",
    tagline: "Current season meta, POIs, mythic items, build/no-build.",
    patterns: [/fortnite/i],
    knowledge: {
      wikiDomains: ["fortnite.fandom.com"],
      specialistPrompt: `FORTNITE EXPERT MODE: Know current chapter/season map POIs, mythic items & bosses, weapon tier, vehicle meta, build vs no-build differences, ranked/competitive rules. Always web-search for current season.`,
    },
  },
  {
    id: "overwatch-2",
    displayName: "Overwatch 2",
    genre: "Hero Shooter",
    tagline: "Hero matchups, role passives, ult economy, current patch.",
    patterns: [/overwatch\s*2?/i],
    knowledge: {
      wikiDomains: ["overwatch.fandom.com", "liquipedia.net"],
      specialistPrompt: `OVERWATCH 2 EXPERT MODE: Know all heroes (DPS/Tank/Support), role passives, current patch balance changes, map types (escort/hybrid/push/control/flashpoint/clash), ult economy & counters.`,
    },
  },
  {
    id: "marvel-rivals",
    displayName: "Marvel Rivals",
    genre: "Hero Shooter",
    tagline: "Hero abilities, team-up synergies, map objectives.",
    patterns: [/marvel rivals/i],
    knowledge: {
      wikiDomains: ["marvelrivals.wiki.gg"],
      specialistPrompt: `MARVEL RIVALS EXPERT MODE: Know all heroes (Vanguard/Duelist/Strategist), team-up abilities & required combos, current season balance, map modes & objectives, environmental destruction interactions.`,
    },
  },
  {
    id: "rocket-league",
    displayName: "Rocket League",
    genre: "Sports",
    tagline: "Mechanics, rotation, boost management, ranked playlists.",
    patterns: [/rocket league/i],
    knowledge: {
      wikiDomains: ["liquipedia.net", "rocketleague.fandom.com"],
      specialistPrompt: `ROCKET LEAGUE EXPERT MODE: Know mechanics (flip resets, double commits, ceiling shots), rotation principles, boost management, kickoff theory, ranked playlist structure (1v1/2v2/3v3).`,
    },
  },
  // ── Monster hunting / action ────────────────────────────────────────────
  {
    id: "monster-hunter",
    displayName: "Monster Hunter (World / Rise / Wilds)",
    genre: "Action RPG",
    tagline: "14 weapons, monster weaknesses, decoration skill stacking.",
    patterns: [/monster hunter/i, /\bmh\s?(world|rise|wilds)\b/i, /\bmhw\b/i, /\bmhr\b/i],
    knowledge: {
      wikiDomains: ["monsterhunter.fandom.com", "fextralife.com"],
      specialistPrompt: `MONSTER HUNTER EXPERT MODE: Know all 14 weapon types, monster weaknesses/breaks/parts, status build-up, decorations, skill stacking, optimal armor sets by element/status, hunt timings, charged blade phial economy, longsword spirit gauge management.`,
    },
  },
  // ── Gacha ───────────────────────────────────────────────────────────────
  {
    id: "genshin-impact",
    displayName: "Genshin Impact",
    genre: "Gacha RPG",
    tagline: "Character kits, reaction triangles, artifact stats, Abyss/IT.",
    patterns: [/genshin/i],
    knowledge: {
      wikiDomains: ["genshin-impact.fandom.com", "keqingmains.com"],
      specialistPrompt: `GENSHIN IMPACT EXPERT MODE: Know all characters (constellations/talents), element reactions (Vape/Melt/Hyperbloom/Aggravate/etc.), artifact sets & substat priority, weapon refinements, Spiral Abyss/Imaginarium Theater rotations, current Archon Quest progression.`,
    },
  },
  {
    id: "honkai-star-rail",
    displayName: "Honkai: Star Rail",
    genre: "Gacha RPG",
    tagline: "Light cones, relic 2pc/4pc, MOC/PF/AS rotations.",
    patterns: [/honkai.*star rail/i, /\bhsr\b/i, /star rail/i],
    knowledge: {
      wikiDomains: ["honkai-star-rail.fandom.com", "prydwen.gg"],
      specialistPrompt: `HONKAI STAR RAIL EXPERT MODE: Know all characters (eidolons/traces), Paths, Light Cones, Relic & Planar Ornament sets, weakness break mechanics, Memory of Chaos / Pure Fiction / Apocalyptic Shadow rotations, current banner.`,
    },
  },
  {
    id: "zenless-zone-zero",
    displayName: "Zenless Zone Zero",
    genre: "Gacha Action",
    tagline: "Agent factions, chain attacks, disk drives, Shiyu Defense.",
    patterns: [/zenless zone zero/i, /\bzzz\b/i],
    knowledge: {
      wikiDomains: ["zenless-zone-zero.fandom.com", "prydwen.gg"],
      specialistPrompt: `ZENLESS ZONE ZERO EXPERT MODE: Know all agents, factions, chain attack & quick assist mechanics, W-Engines, Drive Discs (2/4pc), Bangboos, Shiyu Defense/Deadly Assault rotations.`,
    },
  },
  // ── Strategy & sim ──────────────────────────────────────────────────────
  {
    id: "civilization-6",
    displayName: "Civilization VI",
    genre: "4X Strategy",
    tagline: "Civ uniques, district adjacencies, victory paths.",
    patterns: [/civilization\s*(vi|6)/i, /\bciv\s*6\b/i],
    knowledge: {
      wikiDomains: ["civilization.fandom.com"],
      specialistPrompt: `CIVILIZATION VI EXPERT MODE: Know all civs/leaders, unique units & buildings, district adjacency bonuses, government cards, religion beliefs, wonder timings, victory conditions (Science/Culture/Domination/Religious/Diplomatic), Gathering Storm/R&F mechanics.`,
    },
  },
  {
    id: "stellaris",
    displayName: "Stellaris",
    genre: "4X Grand Strategy",
    tagline: "Origins, traditions, ascension paths, crisis prep.",
    patterns: [/stellaris/i],
    knowledge: {
      wikiDomains: ["stellaris.paradoxwikis.com"],
      specialistPrompt: `STELLARIS EXPERT MODE: Know origins, ethics/civics combinations, tradition trees, ascension paths (Synth/Bio/Psi/Cyber/Genesis), megastructures, crisis types (Unbidden/Scourge/Contingency/Cetana), federation types, current DLC mechanics.`,
    },
  },
  {
    id: "factorio",
    displayName: "Factorio",
    genre: "Automation",
    tagline: "Belt/bus design, biter defense, Space Age planets.",
    patterns: [/factorio/i],
    knowledge: {
      wikiDomains: ["wiki.factorio.com"],
      specialistPrompt: `FACTORIO EXPERT MODE: Know belt throughput numbers, main bus design, beacon/module ratios, oil cracking ratios, train signal rules, biter evolution, Space Age planet uniqueness (Vulcanus/Fulgora/Gleba/Aquilo), quality system.`,
    },
  },
  {
    id: "rimworld",
    displayName: "RimWorld",
    genre: "Colony Sim",
    tagline: "Pawn skills, killbox design, raid points, Ideoligion.",
    patterns: [/rimworld/i],
    knowledge: {
      wikiDomains: ["rimworldwiki.com"],
      specialistPrompt: `RIMWORLD EXPERT MODE: Know pawn skills & passions, raid points formula, killbox/funnel design, mood/break thresholds, Ideoligion precepts, Royalty psycasts, Biotech genes, Anomaly entities.`,
    },
  },
  // ── Indies & long-tail ──────────────────────────────────────────────────
  {
    id: "hades",
    displayName: "Hades / Hades II",
    genre: "Roguelike",
    tagline: "Boon synergies, weapon aspects, heat modifiers.",
    patterns: [/hades/i],
    knowledge: {
      wikiDomains: ["hades.fandom.com"],
      specialistPrompt: `HADES EXPERT MODE: Know all weapons & aspects, Olympian boons & duo boons, hammer upgrades, Pact of Punishment heat options, Mirror of Night upgrades, heat-25 strategies, Hades II Arcana cards & Hex powers.`,
    },
  },
  {
    id: "hollow-knight",
    displayName: "Hollow Knight / Silksong",
    genre: "Metroidvania",
    tagline: "Charm builds, boss patterns, hidden rooms, Pantheon order.",
    patterns: [/hollow knight/i, /silksong/i],
    knowledge: {
      wikiDomains: ["hollowknight.fandom.com"],
      specialistPrompt: `HOLLOW KNIGHT EXPERT MODE: Know charm notch builds, boss patterns (NKG, PV, Absolute Radiance), Pantheon order, hidden areas (Path of Pain, White Palace, Godhome), Grimm Troupe. For Silksong, know Hornet's tools, area unlocks, current patch differences.`,
    },
  },
  {
    id: "stardew-valley",
    displayName: "Stardew Valley",
    genre: "Farming Sim",
    tagline: "Seasonal crops, heart events, Community Center, 1.6 content.",
    patterns: [/stardew/i],
    knowledge: {
      wikiDomains: ["stardewvalleywiki.com"],
      specialistPrompt: `STARDEW VALLEY EXPERT MODE: Know crop profit by season, sprinkler/keg loops, heart events & marriage requirements, Community Center bundles, Mines/Skull Cavern strategy, fishing tiers, 1.6 additions (Meadowlands, Mastery Cave).`,
    },
  },
  {
    id: "minecraft",
    displayName: "Minecraft",
    genre: "Sandbox",
    tagline: "Redstone, raids, Nether/End progression, enchant routes.",
    patterns: [/minecraft/i],
    knowledge: {
      wikiDomains: ["minecraft.wiki"],
      specialistPrompt: `MINECRAFT EXPERT MODE: Know enchantment paths (Mending, Looting III, Sharpness V), Nether/End progression, raid mechanics, villager trading halls, redstone basics (pistons, comparators, observers), mob farms, current snapshot/version differences (Java vs Bedrock).`,
    },
  },
  {
    id: "terraria",
    displayName: "Terraria",
    genre: "Sandbox",
    tagline: "Boss order, biome chest weapons, class builds, Moon Lord prep.",
    patterns: [/terraria/i],
    knowledge: {
      wikiDomains: ["terraria.fandom.com", "terraria.wiki.gg"],
      specialistPrompt: `TERRARIA EXPERT MODE: Know boss progression order (EoC→EoW/BoC→Skeletron→WoF→Mech bosses→Plantera→Golem→Cultist→Lunar Pillars→Moon Lord), class builds (Melee/Ranger/Mage/Summoner), biome chest weapons, accessory reforges, expert/master differences.`,
    },
  },
  {
    id: "balatro",
    displayName: "Balatro",
    genre: "Roguelike Deckbuilder",
    tagline: "Joker synergies, deck archetypes, ante scaling.",
    patterns: [/balatro/i],
    knowledge: {
      wikiDomains: ["balatrogame.fandom.com"],
      specialistPrompt: `BALATRO EXPERT MODE: Know Joker effects (especially Blueprint/Brainstorm/DNA/Burnt Joker), Tarot/Planet/Spectral interactions, deck modifiers, stake difficulties, hand-type scoring math (chips × mult), Ante scaling and Boss Blind mechanics.`,
    },
  },
];

const SUPPORTED_BY_ID: Map<string, SupportedGame> = new Map(
  GAME_REGISTRY.map((g) => [g.id, g]),
);

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

// ── Public catalog API ──────────────────────────────────────────────────
export type SupportedGameSummary = {
  id: string;
  displayName: string;
  genre: string;
  tagline: string;
  wikiDomains: string[];
};

export function listSupportedGames(): SupportedGameSummary[] {
  return GAME_REGISTRY.map(({ id, displayName, genre, tagline, knowledge }) => ({
    id,
    displayName,
    genre,
    tagline,
    wikiDomains: knowledge.wikiDomains,
  }));
}

export function getSupportedGameById(id: string): SupportedGameSummary | null {
  const g = SUPPORTED_BY_ID.get(id);
  if (!g) return null;
  const { displayName, genre, tagline, knowledge } = g;
  return { id: g.id, displayName, genre, tagline, wikiDomains: knowledge.wikiDomains };
}

export function isSupportedGame(gameName: string | null | undefined): boolean {
  return getGameKnowledge(gameName) !== null;
}
