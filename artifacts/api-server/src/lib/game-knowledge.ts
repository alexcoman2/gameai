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
  // ── Singleplayer: open-world / action-adventure ─────────────────────────
  {
    id: "red-dead-redemption-2",
    displayName: "Red Dead Redemption 2",
    genre: "Open-world Action",
    tagline: "Chapter timing, honor system, missables, hunting perfects.",
    patterns: [/red dead redemption\s*2/i, /\brdr\s*2\b/i],
    knowledge: {
      wikiDomains: ["reddead.fandom.com"],
      specialistPrompt: `RED DEAD REDEMPTION 2 EXPERT MODE: Know all chapters & their point-of-no-return, honor system thresholds, missable side quests (Strangers, gunslingers, dinosaur bones, dreamcatchers), legendary animal locations, perfect pelt requirements (weapon by animal class), camp upgrade priority, weapon degradation, Dutch's gang decisions. Spoiler-aware about Arthur's arc.`,
    },
  },
  {
    id: "gta-v",
    displayName: "Grand Theft Auto V",
    genre: "Open-world Action",
    tagline: "Heist setup choices, stock market, 100% checklist.",
    patterns: [/\bgta\s*5\b/i, /\bgta\s*v\b/i, /grand theft auto\s*v/i],
    knowledge: {
      wikiDomains: ["gta.fandom.com"],
      specialistPrompt: `GTA V EXPERT MODE: Know all heists (setup crew choices, optimal Lester stock-market plays before/after Hotel Assassination etc.), Strangers & Freaks completion, 100% checklist, three-protagonist swapping, ending choices (A/B/C). Treat GTA Online separately if asked.`,
    },
  },
  {
    id: "god-of-war",
    displayName: "God of War (2018) / Ragnarök",
    genre: "Action-Adventure",
    tagline: "Realms, armor sets, runic attacks, valkyrie strategies.",
    patterns: [/god of war/i, /\bgow\s*r?\b/i],
    knowledge: {
      wikiDomains: ["godofwar.fandom.com"],
      specialistPrompt: `GOD OF WAR (2018 / RAGNARÖK) EXPERT MODE: Know all 9 realms, armor sets & enchantments, runic attack tiers, Spartan Rage builds, Atreus arrow synergies (Ragnarök), valkyrie/berserker boss patterns, Niflheim/Muspelheim challenges, post-game collectibles, Give Me God of War difficulty tips. Spoiler-aware re: Kratos/Atreus arc.`,
    },
  },
  {
    id: "spider-man",
    displayName: "Marvel's Spider-Man / Miles Morales / Spider-Man 2",
    genre: "Action-Adventure",
    tagline: "Suit powers, gadget combos, crime tokens, NG+ unlocks.",
    patterns: [/spider-?man/i],
    knowledge: {
      wikiDomains: ["spiderman.fandom.com"],
      specialistPrompt: `SPIDER-MAN (Insomniac) EXPERT MODE: Know suits and suit powers, gadget upgrade priority, skill trees (Innovator/Defender/Webslinger and Venom/Symbiote for SM2), token types (Crime/Research/Backpack/Landmark/Base), Taskmaster/Black Cat/EMF challenges, NG+ unlocks, photo-mode collectibles. For SM2, know Peter/Miles switching and symbiote arc.`,
    },
  },
  {
    id: "horizon",
    displayName: "Horizon Zero Dawn / Forbidden West",
    genre: "Open-world Action RPG",
    tagline: "Machine weaknesses, override sites, valor surge builds.",
    patterns: [/horizon\s*(zero dawn|forbidden west)/i, /\bhzd\b/i, /\bhfw\b/i],
    knowledge: {
      wikiDomains: ["horizon.fandom.com"],
      specialistPrompt: `HORIZON EXPERT MODE: Know all machines with elemental/component weaknesses, override locations (Cauldrons), weapon coil/weave stats, skill trees (HFW: Warrior/Hunter/Survivor/Trapper/Infiltrator/Machine Master), Valor Surge picks, Hunting Grounds challenges, NG+ legendary gear paths.`,
    },
  },
  {
    id: "ghost-of-tsushima",
    displayName: "Ghost of Tsushima",
    genre: "Open-world Action",
    tagline: "Stances by enemy, charms, mythic tales, duels.",
    patterns: [/ghost of tsushima/i],
    knowledge: {
      wikiDomains: ["ghostoftsushima.fandom.com"],
      specialistPrompt: `GHOST OF TSUSHIMA EXPERT MODE: Know all 4 stances and which enemy archetypes they counter (Stone/Water/Wind/Moon → Swordsman/Shield/Spear/Brute), charm slot priorities, Mythic Tale unlocks (ghost weapons/armor), duel patterns, Iki Island additions, Legends mode separately if asked.`,
    },
  },
  {
    id: "last-of-us",
    displayName: "The Last of Us Part I & Part II",
    genre: "Action-Adventure",
    tagline: "Crafting priorities, encounter routes, collectibles, grounded tips.",
    patterns: [/last of us/i, /\btlou\s*[12]?\b/i],
    knowledge: {
      wikiDomains: ["thelastofus.fandom.com"],
      specialistPrompt: `THE LAST OF US EXPERT MODE: Know encounter layouts & stealth routes, crafting recipe priorities, weapon upgrade paths, supplement/training-manual locations, artifact/firefly-pendant/coin collectibles, grounded/permadeath strategy. Spoiler-aware about Joel/Ellie/Abby arcs.`,
    },
  },
  {
    id: "death-stranding",
    displayName: "Death Stranding / Director's Cut",
    genre: "Open-world Action",
    tagline: "Cargo balance, route building, BT/MULE strategy, social structures.",
    patterns: [/death stranding/i],
    knowledge: {
      wikiDomains: ["deathstranding.fandom.com"],
      specialistPrompt: `DEATH STRANDING EXPERT MODE: Know cargo weight/balance mechanics, vehicle vs. exoskeleton tradeoffs, BT encounter strategy (hold breath, blood grenades, hematic ammo), MULE/Terrorist outposts, social-strand structures (zip-lines, bridges, generators) and material costs, prepper connection bonuses, premium delivery S-rank tips, Director's Cut additions.`,
    },
  },
  {
    id: "hogwarts-legacy",
    displayName: "Hogwarts Legacy",
    genre: "Open-world RPG",
    tagline: "Spell loadouts, talent picks, room of requirement, Merlin trials.",
    patterns: [/hogwarts legacy/i],
    knowledge: {
      wikiDomains: ["harrypotter.fandom.com", "hogwartslegacy.wiki.fextralife.com"],
      specialistPrompt: `HOGWARTS LEGACY EXPERT MODE: Know spell combos (control/damage/force), the 4-slot loadout system, talent priorities, gear traits & transmog, Room of Requirement upgrades, beast care, Merlin trial solutions by region, missable side quests, house-specific quest differences.`,
    },
  },
  // ── Singleplayer: action / souls-likes (non-FromSoft) ───────────────────
  {
    id: "lies-of-p",
    displayName: "Lies of P",
    genre: "Soulslike",
    tagline: "Legion arms, weapon assembly, P-organ, boss parry timings.",
    patterns: [/lies of p/i],
    knowledge: {
      wikiDomains: ["liesofp.wiki.fextralife.com"],
      specialistPrompt: `LIES OF P EXPERT MODE: Know Legion Arms (upgrade paths), weapon assembly (blade + handle scaling combos), P-organ upgrade priority, Fable Arts, perfect-guard timing per boss, Hotel Krat NPC questlines, ending requirements (Free from the Puppet String / Real Boy / Rise of P), DLC if relevant.`,
    },
  },
  {
    id: "nioh",
    displayName: "Nioh / Nioh 2",
    genre: "Soulslike",
    tagline: "Stance switching, ki-pulse, yokai abilities, soul matching.",
    patterns: [/nioh\s*2?/i],
    knowledge: {
      wikiDomains: ["nioh.fandom.com", "nioh2.wiki.fextralife.com"],
      specialistPrompt: `NIOH EXPERT MODE: Know all weapon types & stance switching (high/mid/low), Ki Pulse timing & flux skills, yokai abilities/burst counters (Nioh 2), set bonuses & soul matching, prestige/Onmyo/Ninjutsu builds, Way of Wise/Nioh difficulty progression, Underworld/Abyss endgame.`,
    },
  },
  {
    id: "wo-long",
    displayName: "Wo Long: Fallen Dynasty",
    genre: "Soulslike",
    tagline: "Deflect timing, five-phase wizardry, morale ranks, divine beasts.",
    patterns: [/wo long/i],
    knowledge: {
      wikiDomains: ["wolong.wiki.fextralife.com"],
      specialistPrompt: `WO LONG EXPERT MODE: Know deflect (martial arts) timing, the five-phase virtues system (Metal/Wood/Water/Fire/Earth), morale/fortitude rank scaling, wizardry spells per phase, divine beast partners, fatal strike fundamentals, NG+ difficulty additions.`,
    },
  },
  {
    id: "black-myth-wukong",
    displayName: "Black Myth: Wukong",
    genre: "Action RPG",
    tagline: "Stances, spells, transformations, secret bosses, NG+.",
    patterns: [/black myth/i, /wukong/i],
    knowledge: {
      wikiDomains: ["blackmythwukong.wiki.fextralife.com"],
      specialistPrompt: `BLACK MYTH: WUKONG EXPERT MODE: Know Smash/Pillar/Thrust stance trees, the four spells (Immobilize, Cloud Step, Pluck of Many, Rock Solid), transformations & spirits, vessel upgrades, gourd/medicine crafting, secret bosses (Erlang, Kang-Jin Loong, Yellowbrow secret variant), true ending requirements, Chapter 6 mysteries.`,
    },
  },
  {
    id: "dragons-dogma-2",
    displayName: "Dragon's Dogma 2",
    genre: "Action RPG",
    tagline: "Vocations, pawn inclinations, augments, Unmoored World.",
    patterns: [/dragon'?s dogma\s*2?/i, /\bdd\s*2\b/i],
    knowledge: {
      wikiDomains: ["dragonsdogma.fandom.com"],
      specialistPrompt: `DRAGON'S DOGMA 2 EXPERT MODE: Know all vocations (incl. Mystic Spearhand, Magick Archer, Trickster, Warfarer), vocation maister quest locations, pawn inclinations & specializations, augment priorities (mules), Brine mechanics, Dragonsplague, Unmoored World true ending steps.`,
    },
  },
  // ── Singleplayer: horror / survival ─────────────────────────────────────
  {
    id: "resident-evil-modern",
    displayName: "Resident Evil 2/3/4 Remake & Village",
    genre: "Survival Horror",
    tagline: "Treasure routes, weapon upgrades, S-rank runs, charm/recipe bonuses.",
    patterns: [/resident evil/i, /\bre\s*[2-8](\s*remake)?\b/i, /\bresi\b/i, /\bbiohazard\b/i],
    knowledge: {
      wikiDomains: ["residentevil.fandom.com"],
      specialistPrompt: `RESIDENT EVIL EXPERT MODE: Know treasure/combination routes (RE4R), Mercenaries unlock requirements, weapon upgrade prioritization (exclusive perks), S+ run constraints (no item box / time limits), Charlie doll & Mr. Raccoon collectibles (RE2R/RE3R), Duke menu in Village (filter+coffin synergies). Spoiler-aware re: each game's plot.`,
    },
  },
  {
    id: "silent-hill-2-remake",
    displayName: "Silent Hill 2 (Remake)",
    genre: "Survival Horror",
    tagline: "Ending triggers, puzzle difficulties, weapons, glimpses of the past.",
    patterns: [/silent hill/i, /\bsh\s*2\b/i],
    knowledge: {
      wikiDomains: ["silenthill.fandom.com"],
      specialistPrompt: `SILENT HILL 2 REMAKE EXPERT MODE: Know all endings (Leave/In Water/Maria/Rebirth/Stillness/Dog) and the specific triggers per playthrough, puzzle difficulty differences, weapon/item locations, Glimpses of the Past collectibles, NG+ rewards. Spoiler-aware re: James/Mary.`,
    },
  },
  {
    id: "dead-space-remake",
    displayName: "Dead Space (Remake) / Dead Space 2",
    genre: "Survival Horror",
    tagline: "Necromorph dismemberment, weapon upgrades, marker fragments.",
    patterns: [/dead space/i],
    knowledge: {
      wikiDomains: ["deadspace.fandom.com"],
      specialistPrompt: `DEAD SPACE EXPERT MODE: Know necromorph types and limb dismemberment priority per type, weapon upgrade nodes (Plasma Cutter mains, Pulse Rifle, Line Gun, Force Gun), suit upgrades & RIG progression, peng treasure, master override / secret ending requirements (Marker fragment locations in Remake). Impossible-mode run guidance.`,
    },
  },
  {
    id: "alan-wake-2",
    displayName: "Alan Wake 2 / Alan Wake",
    genre: "Psychological Horror",
    tagline: "Light/dark combat, Mind Place clues, Plot Boards, Cult of the Tree.",
    patterns: [/alan wake/i],
    knowledge: {
      wikiDomains: ["alanwake.fandom.com"],
      specialistPrompt: `ALAN WAKE EXPERT MODE: Know flashlight-burn → fire combat loop, Saga's Mind Place (case board + profiling) and Alan's Writing Room (Plot Echoes/Boards), Cult Stash codes, Nursery Rhyme charms, Words of Power, FBC Casefile, ending hierarchy. Spoiler-aware re: the Dark Place loop.`,
    },
  },
  {
    id: "control",
    displayName: "Control",
    genre: "Action-Adventure",
    tagline: "Service weapon forms, ability mods, Bureau alerts, AWE/Foundation.",
    patterns: [/^control\.exe$|\bcontrol\s+(remedy|game)\b|control:?\s*(ultimate edition)/i],
    knowledge: {
      wikiDomains: ["control.fandom.com"],
      specialistPrompt: `CONTROL EXPERT MODE: Know Service Weapon forms (Grip/Shatter/Spin/Pierce/Charge), ability tree priority (Launch/Shield/Evade/Levitate/Seize), mod rarities & rerolling at the Workshop, Bureau Alert farming for legendaries, AWE & The Foundation DLC questlines, Ahti's mop quest, Astral Plane challenges.`,
    },
  },
  {
    id: "returnal",
    displayName: "Returnal",
    genre: "Roguelike Shooter",
    tagline: "Weapon traits, parasites, malfunctions, biome bosses.",
    patterns: [/returnal/i],
    knowledge: {
      wikiDomains: ["returnal.fandom.com"],
      specialistPrompt: `RETURNAL EXPERT MODE: Know weapon traits to chase per archetype, weapon proficiency scaling, parasite cost/benefit decisions, malfunction triggers and how to clear them, artifact priorities, biome boss patterns (Phrike → Hyperion → Ophion), Tower of Sisyphus scoring, House sequence interpretation.`,
    },
  },
  // ── Singleplayer: FPS / shooter campaigns ───────────────────────────────
  {
    id: "doom-modern",
    displayName: "DOOM (2016) / Eternal / The Dark Ages",
    genre: "FPS",
    tagline: "Glory Kill loop, weapon mods, rune picks, Slayer Gates.",
    patterns: [/^doom(\s*(2016|eternal|the dark ages))?$|doometernal/i],
    knowledge: {
      wikiDomains: ["doom.fandom.com"],
      specialistPrompt: `DOOM (modern) EXPERT MODE: Know weapon-mod priority, demon-specific weakpoints (Eternal: Marauder counter, Archvile priority, Cyber-Mancubus fuel tanks), rune/equipment loadouts, Slayer Gate strategies, Master Levels, Ultra-Nightmare run tips. Treat 2016, Eternal, and The Dark Ages distinctly when asked.`,
    },
  },
  {
    id: "half-life",
    displayName: "Half-Life 2 / Episodes / Alyx",
    genre: "FPS",
    tagline: "Chapter routes, gravity gun tricks, hidden ammo, Alyx upgrades.",
    patterns: [/half-?life/i, /\bhl\s*2\b/i],
    knowledge: {
      wikiDomains: ["half-life.fandom.com"],
      specialistPrompt: `HALF-LIFE EXPERT MODE: Know chapter sequencing, optimal weapon usage per encounter (gravity gun tricks, sniper antlion soldiers), achievement hunts (One Free Bullet, Zombie Chopper), Episode 1/2 strider strategies. For Half-Life: Alyx, know weapon upgrades & resin locations.`,
    },
  },
  {
    id: "metro",
    displayName: "Metro 2033 / Last Light / Exodus",
    genre: "FPS",
    tagline: "Moral choices for good endings, weapon mods, filter timing.",
    patterns: [/metro\s*(2033|last light|exodus)/i, /\bmetroexodus\b/i],
    knowledge: {
      wikiDomains: ["metrovideogame.fandom.com"],
      specialistPrompt: `METRO EXPERT MODE: Know moral-point triggers for good endings (eavesdropping, sparing enemies, hidden interactions, Exodus companion deaths), weapon attachment priorities, filter/medkit economy, hidden diaries, DLC ordering (Two Colonels, Sam's Story).`,
    },
  },
  {
    id: "bioshock",
    displayName: "BioShock / BioShock Infinite",
    genre: "FPS",
    tagline: "Plasmid combos, Vigor builds, audio diary routes, ending splits.",
    patterns: [/bioshock/i],
    knowledge: {
      wikiDomains: ["bioshock.fandom.com"],
      specialistPrompt: `BIOSHOCK EXPERT MODE: Know plasmid/vigor combos (Electro Bolt → wrench, Shock Jockey → pistol), Adam farming (Little Sister harvest vs rescue tradeoff, tonic rewards), audio-diary collectibles, gene-tonic priorities, Infinite gear builds & 1999 Mode requirements.`,
    },
  },
  // ── Singleplayer: JRPGs / Japanese RPGs ─────────────────────────────────
  {
    id: "persona-5",
    displayName: "Persona 5 Royal",
    genre: "JRPG",
    tagline: "Confidant ranks, palace deadlines, fusion math, third semester.",
    patterns: [/persona\s*5/i, /\bp5r?\b/i],
    knowledge: {
      wikiDomains: ["megamitensei.fandom.com"],
      specialistPrompt: `PERSONA 5 ROYAL EXPERT MODE: Know confidant rank-up requirements & calendar planning, palace deadlines, will seed locations, optimal persona fusion recipes (incl. Pickpocket Genie / Yoshitsune / Alice / Satanael), Royal-exclusive content (Kichijoji, Jose, Showtimes, Third Semester triggers), max-social-stat path.`,
    },
  },
  {
    id: "persona-3-reload",
    displayName: "Persona 3 Reload",
    genre: "JRPG",
    tagline: "Tartarus blocks, social link order, Theurgy, max-link path.",
    patterns: [/persona\s*3/i, /\bp3r\b/i],
    knowledge: {
      wikiDomains: ["megamitensei.fandom.com"],
      specialistPrompt: `PERSONA 3 RELOAD EXPERT MODE: Know Tartarus block structure & full-moon boss timing, social-link calendar, optimal stat path (Academics/Charm/Courage), Theurgy gauge management, Linked Episodes, Monad Doors, Elizabeth/Margaret request list, true-ending requirements.`,
    },
  },
  {
    id: "metaphor-refantazio",
    displayName: "Metaphor: ReFantazio",
    genre: "JRPG",
    tagline: "Archetype tree, follower bonds, dungeon deadlines, synthesis skills.",
    patterns: [/metaphor/i, /refantazio/i],
    knowledge: {
      wikiDomains: ["metaphor.fandom.com", "megamitensei.fandom.com"],
      specialistPrompt: `METAPHOR: REFANTAZIO EXPERT MODE: Know archetype tree (lineage prerequisites for Royal/Elite/Prince classes), follower bond requirements, calendar deadlines, MAG economy, synthesis skill inheritance, recommended party comps per Major Arcana boss, true-ending path.`,
    },
  },
  {
    id: "ff7-remake-rebirth",
    displayName: "Final Fantasy VII Remake / Rebirth",
    genre: "Action JRPG",
    tagline: "Materia loadouts, weapon skills, party synergies, mini-games.",
    patterns: [/final fantasy\s*(7|vii)/i, /\bff\s*7\b/i, /ff7.*(remake|rebirth)/i],
    knowledge: {
      wikiDomains: ["finalfantasy.fandom.com"],
      specialistPrompt: `FF7 REMAKE / REBIRTH EXPERT MODE: Know materia builds (Magnify+Heal, Elemental+Ifrit, Steadfast Block timing), weapon skill SP priority, summon timing, party folio/skill point allocation (Rebirth), Synergy Skills/Abilities, world intel completion, mini-games (Queen's Blood, Chocobo races, Cactuar Rush), Hard Mode strategy. Spoiler-aware re: changes from OG.`,
    },
  },
  {
    id: "ff16",
    displayName: "Final Fantasy XVI",
    genre: "Action RPG",
    tagline: "Eikon ability rotations, accessories, hunt board, chronolith.",
    patterns: [/final fantasy\s*(16|xvi)/i, /\bff\s*16\b/i],
    knowledge: {
      wikiDomains: ["finalfantasy.fandom.com"],
      specialistPrompt: `FF16 EXPERT MODE: Know Eikon ability cooldowns and optimal rotation slots (Phoenix Shift/Heatwave/Will-o-the-Wykes/Lightning Rod/Diamond Dust/Gigaflare), accessory crafting tiers, Hunt Board mark order/rewards, Chronolith Trial best builds, Final Fantasy mode (NG+) tips, DLC questlines (Echoes of the Fallen, The Rising Tide).`,
    },
  },
  {
    id: "yakuza-like-a-dragon",
    displayName: "Yakuza / Like a Dragon series",
    genre: "Action RPG / Brawler",
    tagline: "Substory chains, business mini-games, job classes, sotenbori.",
    patterns: [/yakuza/i, /like a dragon/i, /ryu ga gotoku/i, /\brgg\b/i],
    knowledge: {
      wikiDomains: ["yakuza.fandom.com"],
      specialistPrompt: `YAKUZA / LIKE A DRAGON EXPERT MODE: Know main entries' combat (brawler styles for Kiryu / Job system for Ichiban — Hero/Bodyguard/Breakdancer/Gangster/etc.), substory chains, completion-list secrets, Kamurocho/Sotenbori/Yokohama business mini-games, recommended job synergies (LAD7/8), recipe locations, true-final-boss / premium adventure tips. Disambiguate which game when asked.`,
    },
  },
  // ── Singleplayer: CRPGs / story RPGs (additions) ────────────────────────
  {
    id: "pillars-of-eternity",
    displayName: "Pillars of Eternity 1 & 2: Deadfire",
    genre: "CRPG",
    tagline: "Class kits, Watcher abilities, ship combat, reputations.",
    patterns: [/pillars of eternity/i, /\bpoe2\b/i, /deadfire/i],
    knowledge: {
      wikiDomains: ["pillarsofeternity.fandom.com"],
      specialistPrompt: `PILLARS OF ETERNITY EXPERT MODE: Know all classes & multiclass combos (PoE2), key talents/abilities by class, Watcher dialogue checks, ship combat & crew management (Deadfire), faction reputations & endings, megabosses (Hauani O Whe, Belranga, Sigilmaster Auranic, Dorudugan, Ymir). Pen/Armor math is critical — call it out.`,
    },
  },
  {
    id: "tyranny",
    displayName: "Tyranny",
    genre: "CRPG",
    tagline: "Conquest choices, faction paths, spell crafting, reputations.",
    patterns: [/tyranny/i],
    knowledge: {
      wikiDomains: ["tyranny.fandom.com"],
      specialistPrompt: `TYRANNY EXPERT MODE: Know Conquest opening choices and downstream effects, faction allegiance paths (Disfavored/Scarlet Chorus/Anarchist/Rebels), spell-crafting accents & expressions, companion loyalty/fear, edicts. Spoiler-aware about Kyros and the four paths.`,
    },
  },
  {
    id: "kingdom-come-deliverance",
    displayName: "Kingdom Come: Deliverance / KCD2",
    genre: "Open-world RPG",
    tagline: "Combat masterstrokes, perks, alchemy, save schnapps economy.",
    patterns: [/kingdom come/i, /\bkcd\s*2?\b/i, /deliverance/i],
    knowledge: {
      wikiDomains: ["kingdomcomedeliverance.fandom.com"],
      specialistPrompt: `KINGDOM COME EXPERT MODE: Know combat masterstrokes & perfect block timing, perk picks per skill (Bard, Headcracker, Mule), alchemy recipes (Aqua Vitalis, Lazarus, Savior Schnapps), reputation by region, side quest timing (missables), main quest pacing. Era-accurate vocabulary preferred.`,
    },
  },
  {
    id: "mass-effect",
    displayName: "Mass Effect Legendary Edition",
    genre: "Action RPG",
    tagline: "Class powers, paragon/renegade, squad picks, ending readiness.",
    patterns: [/mass effect/i, /\bme\s*[123]\b/i, /\bmele\b/i],
    knowledge: {
      wikiDomains: ["masseffect.fandom.com"],
      specialistPrompt: `MASS EFFECT EXPERT MODE: Know class power builds across ME1/2/3, paragon/renegade thresholds for key dialogue checks, loyalty mission triggers (Suicide Mission survival math in ME2), war-asset / EMS thresholds for ME3 endings, romance flag chains, scanning/mining priority. Disambiguate which game when answering.`,
    },
  },
  {
    id: "dragon-age",
    displayName: "Dragon Age: Origins / Inquisition / Veilguard",
    genre: "Action RPG",
    tagline: "Specializations, party synergy, world state, war table.",
    patterns: [/dragon age/i, /veilguard/i],
    knowledge: {
      wikiDomains: ["dragonage.fandom.com"],
      specialistPrompt: `DRAGON AGE EXPERT MODE: Know specializations per game, party-composition synergies (tank/CC/burst), keep/world-state imports, Inquisition war-table chains, Trespasser implications, Veilguard companion specs & approval. Disambiguate which entry when asked.`,
    },
  },
  // ── Singleplayer: indie / story / puzzle ────────────────────────────────
  {
    id: "outer-wilds",
    displayName: "Outer Wilds",
    genre: "Puzzle Adventure",
    tagline: "Loop knowledge, ship log gaps, Echoes of the Eye.",
    patterns: [/outer wilds/i],
    knowledge: {
      wikiDomains: ["outerwilds.fandom.com"],
      specialistPrompt: `OUTER WILDS EXPERT MODE: SPOILER-AWARE — ask before revealing late-loop discoveries. Know quantum mechanics, Nomai language conventions, Brittle Hollow / Hourglass Twins / Dark Bramble routing, Ash Twin Project, Echoes of the Eye stealth sections (artifact use), endgame requirements. Default to hint-style guidance unless user explicitly wants spoilers.`,
    },
  },
  {
    id: "disco-elysium",
    displayName: "Disco Elysium",
    genre: "CRPG",
    tagline: "Skill checks, thought cabinet, political vision quests, ideologies.",
    patterns: [/disco elysium/i],
    knowledge: {
      wikiDomains: ["discoelysium.fandom.com"],
      specialistPrompt: `DISCO ELYSIUM EXPERT MODE: Know all 24 skills & their voice flavor, white-vs-red check distinctions, Thought Cabinet effects (which to internalize/forget), political vision quest unlocks (Communist/Fascist/Moralist/Ultraliberal), Final Cut additions, key missable lore (Dolores Dei, the Pale, Insulindian Phasmid). Spoiler-aware.`,
    },
  },
  {
    id: "tunic",
    displayName: "Tunic",
    genre: "Adventure",
    tagline: "Manual page logic, hidden language, secret-treasure puzzles.",
    patterns: [/tunic/i],
    knowledge: {
      wikiDomains: ["tunic.fandom.com"],
      specialistPrompt: `TUNIC EXPERT MODE: SPOILER-AWARE — the entire game is about discovery. Know manual page hints, golden-path puzzle structure, true-ending requirements (Holy Cross sequences, 12 fairies, mountain door), hidden language decoding. Default to hint-style guidance unless user explicitly asks for direct solutions.`,
    },
  },
  {
    id: "slay-the-spire",
    displayName: "Slay the Spire",
    genre: "Roguelike Deckbuilder",
    tagline: "Deck archetypes per class, relic synergies, Ascension 20 tips.",
    patterns: [/slay the spire/i, /\bsts\b/i],
    knowledge: {
      wikiDomains: ["slay-the-spire.fandom.com"],
      specialistPrompt: `SLAY THE SPIRE EXPERT MODE: Know archetypes per class (Ironclad: Strength/Barricade/Corruption; Silent: Poison/Shiv/Discard; Defect: Frost/Lightning/Claw; Watcher: Calm/Wrath/Retain), key relics, Act 4 (Heart) preparation, Ascension 20 deck-building rules of thumb, event picks, neow bonus tradeoffs.`,
    },
  },
  {
    id: "vampire-survivors",
    displayName: "Vampire Survivors",
    genre: "Auto-shooter Roguelike",
    tagline: "Weapon evolutions, arcanas, secret unlocks, DLC characters.",
    patterns: [/vampire survivors/i],
    knowledge: {
      wikiDomains: ["vampire-survivors.fandom.com"],
      specialistPrompt: `VAMPIRE SURVIVORS EXPERT MODE: Know weapon + passive evolution pairs, Arcana effects, secret character & relic unlocks, hidden stages (Boss Rash, Eudaimonia M.), DLC content (Tides of the Foscari, Emergency Meeting, Operation Guns, Ode to Castlevania). Always specify the level/condition for unlocks.`,
    },
  },
  {
    id: "subnautica",
    displayName: "Subnautica / Below Zero",
    genre: "Survival Adventure",
    tagline: "Biome progression, blueprint sources, leviathan avoidance.",
    patterns: [/subnautica/i],
    knowledge: {
      wikiDomains: ["subnautica.fandom.com"],
      specialistPrompt: `SUBNAUTICA EXPERT MODE: Know biome progression order, key blueprint fragment sources (Seamoth/Prawn/Cyclops modules, Mobile Vehicle Bay, Modification Station), leviathan locations & avoidance routes (Reaper, Ghost, Sea Dragon, Chelicerate for Below Zero), cure ingredients (Enzyme 42), Architect tech in Below Zero. Spoiler-aware about late-game story.`,
    },
  },
  {
    id: "satisfactory",
    displayName: "Satisfactory",
    genre: "Automation",
    tagline: "Tier unlocks, manifolds vs. balancers, train signals, power planning.",
    patterns: [/satisfactory/i],
    knowledge: {
      wikiDomains: ["satisfactory.wiki.gg"],
      specialistPrompt: `SATISFACTORY EXPERT MODE: Know tier/milestone unlock order, manifold vs. load-balancer tradeoffs, train signal rules, power planning per phase (biomass → coal → fuel → nuclear), recommended Awesome Sink coupon priorities, Hard Drive alternate recipes worth chasing, 1.0/Ficsmas content.`,
    },
  },
  {
    id: "no-mans-sky",
    displayName: "No Man's Sky",
    genre: "Open-world Survival",
    tagline: "Expedition objectives, S-class hunting, freighter/Sentinel builds.",
    patterns: [/no man'?s sky/i, /\bnms\b/i],
    knowledge: {
      wikiDomains: ["nomanssky.fandom.com"],
      specialistPrompt: `NO MAN'S SKY EXPERT MODE: Know current Expedition objectives & rewards (always web-search for active one), S-class ship/multitool hunting (system economy/wealth tags, salvaged frigate modules), freighter base layout, Sentinel ship/multitool grind, living ship questline, exocraft tech, settlements, derelict freighter routes, Atlas/Artemis story gates.`,
    },
  },
  // ── Singleplayer: strategy / grand strategy / sims ──────────────────────
  {
    id: "xcom-2",
    displayName: "XCOM 2 / War of the Chosen",
    genre: "Turn-based Strategy",
    tagline: "Class builds, dark events, Chosen weaknesses, Avenger doctrine.",
    patterns: [/xcom/i, /\bwotc\b/i],
    knowledge: {
      wikiDomains: ["xcom.fandom.com"],
      specialistPrompt: `XCOM 2 / WOTC EXPERT MODE: Know all classes (incl. Reaper/Skirmisher/Templar) & optimal perk picks, dark event priority, Chosen weaknesses & strengths, Avatar project timer management, Avenger room build order, ambush/overwatch mechanics, Legendary Ironman tips, factional covert ops planning.`,
    },
  },
  {
    id: "total-war-warhammer",
    displayName: "Total War: Warhammer III",
    genre: "Grand Strategy / RTS",
    tagline: "Faction mechanics, lord builds, RoR units, IE campaign maps.",
    patterns: [/total war.*warhammer/i, /\btww\s*3?\b/i],
    knowledge: {
      wikiDomains: ["totalwarwarhammer.fandom.com"],
      specialistPrompt: `TOTAL WAR: WARHAMMER III EXPERT MODE: Know each faction's unique campaign mechanic (Chaos undivided souls, Cathay harmony, Kislev devotion, Norsca raiding, etc.), lord skill builds, Regiments of Renown picks, Immortal Empires & Realms of Chaos differences, Legendary difficulty AI behavior, current DLC factions.`,
    },
  },
  {
    id: "crusader-kings-3",
    displayName: "Crusader Kings III",
    genre: "Grand Strategy",
    tagline: "Lifestyles, hooks, schemes, succession laws, current DLC.",
    patterns: [/crusader kings/i, /\bck\s*3\b/i],
    knowledge: {
      wikiDomains: ["ck3.paradoxwikis.com"],
      specialistPrompt: `CRUSADER KINGS III EXPERT MODE: Know lifestyle trees & perk synergies, hook acquisition, scheme math (intrigue/learning bonuses), succession laws, men-at-arms composition vs. terrain, holy-war/great-holy-war mechanics, current DLC content (Tours & Tournaments, Roads to Power, etc.), legacy dynasty min-max paths.`,
    },
  },
  {
    id: "europa-universalis-4",
    displayName: "Europa Universalis IV",
    genre: "Grand Strategy",
    tagline: "Idea groups, monarch points, mission trees, coalition handling.",
    patterns: [/europa universalis/i, /\beu\s*4\b/i],
    knowledge: {
      wikiDomains: ["eu4.paradoxwikis.com"],
      specialistPrompt: `EUROPA UNIVERSALIS IV EXPERT MODE: Know idea group order by playstyle (Diplomatic/Religious/Economic etc.), monarch-point sinks, mission-tree timing for top nations (Ottomans, France, Castile, Ming, England, Brandenburg-Prussia), coalition aggressive-expansion math, institution spawn manipulation, current DLC content.`,
    },
  },
  {
    id: "frostpunk",
    displayName: "Frostpunk / Frostpunk 2",
    genre: "City Builder Survival",
    tagline: "Law tree priority, scenario victory paths, heat/coal economy.",
    patterns: [/frostpunk/i],
    knowledge: {
      wikiDomains: ["frostpunk.fandom.com"],
      specialistPrompt: `FROSTPUNK EXPERT MODE: Know scenario victory paths (New Home, The Arks, A New Home: Refugees, On the Edge, The Last Autumn), Order vs. Faith law trees, heat/coal/steam-hub economy, automaton priorities, frostlands expedition rewards. For Frostpunk 2, know council factions & 5-year zeitgeist mechanics.`,
    },
  },
  {
    id: "cities-skylines",
    displayName: "Cities: Skylines / II",
    genre: "City Builder",
    tagline: "Traffic routing, district policies, milestone unlock plans.",
    patterns: [/cities.*skylines/i, /\bcs\s*2\b/i],
    knowledge: {
      wikiDomains: ["skylines.paradoxwikis.com"],
      specialistPrompt: `CITIES: SKYLINES EXPERT MODE: Know traffic routing best practices (one-way arterials, roundabouts, transit redundancy), district policies & tax stacking, education/health pyramid sizing, industrial specializations vs. office demand, public-transit modal share targets. CS2: economy & service simulation differences from CS1.`,
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
