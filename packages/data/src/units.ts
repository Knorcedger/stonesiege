// v1 unit roster. Balance reference: Age of Empires II Definitive Edition (stats verified
// against the aoe2techtree.net database, July 2026). All names/prose original.
// Attack arrays: base 'melee' OR 'pierce' entry FIRST, then bonus-vs-class entries.

import type { UnitDef } from './schema';

export const units: Record<string, UnitDef> = {
  // ---------------------------------------------------------------- economy
  villager: {
    id: 'villager', name: 'Villager', age: 'dark',
    trainedAt: ['townCenter'], cost: { food: 50 }, trainTime: 25,
    hp: 25,
    attacks: [
      { cls: 'melee', amount: 3 },
      { cls: 'building', amount: 3 },
      { cls: 'wallOrTower', amount: 6 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 2, speed: 0.8, los: 4,
    classes: ['villager'],
    // farm 0.32 is the walk-inclusive effective AoE2 rate: Bannerfall applies gather rates
    // directly (no farm work-rate cap mechanic), so AoE2's capped 0.40 would over-collect.
    gather: { forage: 0.31, hunt: 0.41, farm: 0.32, wood: 0.39, gold: 0.38, stone: 0.36 },
    buildRate: 1,
    // GDD: villagers carry ~10; hunters carry more (35, as in AoE2). Sheep share the
    // 'hunt' task in v1, so shepherds get the larger carry too — accepted simplification.
    carryCapacity: { forage: 10, hunt: 35, farm: 10, wood: 10, gold: 10, stone: 10 },
    icon: 'icon/villager',
  },

  // ------------------------------------------------- barracks: militia line
  militia: {
    id: 'militia', name: 'Militia', age: 'dark',
    trainedAt: ['barracks'], cost: { food: 50, gold: 20 }, trainTime: 21,
    hp: 40,
    attacks: [{ cls: 'melee', amount: 4 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 0.9, los: 4,
    classes: ['infantry'],
    icon: 'icon/militia',
  },
  manAtArms: {
    id: 'manAtArms', name: 'Man-at-Arms', age: 'feudal',
    trainedAt: ['barracks'], cost: { food: 50, gold: 20 }, trainTime: 21,
    hp: 45,
    attacks: [{ cls: 'melee', amount: 6 }, { cls: 'building', amount: 2 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 0.96, los: 4,
    classes: ['infantry'],
    requiresTech: 'manAtArmsUpgrade',
    icon: 'icon/manAtArms',
  },
  longswordsman: {
    id: 'longswordsman', name: 'Longswordsman', age: 'castle',
    trainedAt: ['barracks'], cost: { food: 50, gold: 20 }, trainTime: 21,
    hp: 60,
    attacks: [{ cls: 'melee', amount: 9 }, { cls: 'building', amount: 3 }],
    armor: [{ cls: 'melee', amount: 1 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 0.96, los: 4,
    classes: ['infantry'],
    requiresTech: 'longswordsmanUpgrade',
    icon: 'icon/longswordsman',
  },
  champion: {
    id: 'champion', name: 'Champion', age: 'imperial',
    trainedAt: ['barracks'], cost: { food: 50, gold: 20 }, trainTime: 21,
    hp: 70,
    attacks: [{ cls: 'melee', amount: 14 }, { cls: 'building', amount: 4 }],
    armor: [{ cls: 'melee', amount: 1 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 0.96, los: 5,
    classes: ['infantry'],
    requiresTech: 'championUpgrade',
    icon: 'icon/champion',
  },

  // --------------------------------------------------- barracks: spear line
  spearman: {
    id: 'spearman', name: 'Spearman', age: 'feudal',
    trainedAt: ['barracks'], cost: { food: 35, wood: 25 }, trainTime: 22,
    hp: 45,
    attacks: [
      { cls: 'melee', amount: 3 },
      { cls: 'cavalry', amount: 15 },
      { cls: 'building', amount: 1 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 3, speed: 1.0, los: 4,
    classes: ['infantry', 'spearman'],
    icon: 'icon/spearman',
  },
  pikeman: {
    id: 'pikeman', name: 'Pikeman', age: 'castle',
    trainedAt: ['barracks'], cost: { food: 35, wood: 25 }, trainTime: 22,
    hp: 55,
    attacks: [
      { cls: 'melee', amount: 4 },
      { cls: 'cavalry', amount: 22 },
      { cls: 'building', amount: 1 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 3, speed: 1.0, los: 4,
    classes: ['infantry', 'spearman'],
    requiresTech: 'pikemanUpgrade',
    icon: 'icon/pikeman',
  },

  // --------------------------------------------- archery range: archer line
  archer: {
    id: 'archer', name: 'Archer', age: 'feudal',
    trainedAt: ['archeryRange'], cost: { wood: 25, gold: 45 }, trainTime: 35,
    hp: 30,
    attacks: [{ cls: 'pierce', amount: 4 }, { cls: 'spearman', amount: 3 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 4, rof: 2, projectileSpeed: 7, accuracy: 80, speed: 0.96, los: 6,
    classes: ['archer'],
    icon: 'icon/archer',
  },
  crossbowman: {
    id: 'crossbowman', name: 'Crossbowman', age: 'castle',
    trainedAt: ['archeryRange'], cost: { wood: 25, gold: 45 }, trainTime: 27,
    hp: 35,
    attacks: [{ cls: 'pierce', amount: 5 }, { cls: 'spearman', amount: 3 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 5, rof: 2, projectileSpeed: 7, accuracy: 85, speed: 0.96, los: 7,
    classes: ['archer'],
    requiresTech: 'crossbowmanUpgrade',
    icon: 'icon/crossbowman',
  },
  arbalester: {
    id: 'arbalester', name: 'Arbalester', age: 'imperial',
    trainedAt: ['archeryRange'], cost: { wood: 25, gold: 45 }, trainTime: 27,
    hp: 40,
    attacks: [{ cls: 'pierce', amount: 6 }, { cls: 'spearman', amount: 3 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 5, rof: 2, projectileSpeed: 7, accuracy: 90, speed: 0.96, los: 7,
    classes: ['archer'],
    requiresTech: 'arbalesterUpgrade',
    icon: 'icon/arbalester',
  },

  // ----------------------------------------- archery range: skirmisher line
  skirmisher: {
    id: 'skirmisher', name: 'Skirmisher', age: 'feudal',
    trainedAt: ['archeryRange'], cost: { food: 25, wood: 35 }, trainTime: 26,
    hp: 30,
    attacks: [
      { cls: 'pierce', amount: 2 },
      { cls: 'archer', amount: 3 },
      { cls: 'spearman', amount: 3 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 3 }],
    range: 4, minRange: 1, rof: 3, projectileSpeed: 7, accuracy: 90, speed: 0.96, los: 6,
    classes: ['archer'],
    icon: 'icon/skirmisher',
  },
  eliteSkirmisher: {
    id: 'eliteSkirmisher', name: 'Elite Skirmisher', age: 'imperial', // Imperial upgrade, as in AoE2
    trainedAt: ['archeryRange'], cost: { food: 25, wood: 35 }, trainTime: 22,
    hp: 35,
    attacks: [
      { cls: 'pierce', amount: 3 },
      { cls: 'archer', amount: 4 },
      { cls: 'spearman', amount: 4 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 4 }],
    range: 5, minRange: 1, rof: 3, projectileSpeed: 7, accuracy: 90, speed: 0.96, los: 7,
    classes: ['archer'],
    requiresTech: 'eliteSkirmisherUpgrade',
    icon: 'icon/eliteSkirmisher',
  },

  // ------------------------------------------------------ stable: scout line
  scout: {
    id: 'scout', name: 'Scout', age: 'feudal',
    trainedAt: ['stable'], cost: { food: 80 }, trainTime: 30,
    hp: 45,
    // Feudal-gated, so AoE2's automatic Feudal upgrades (+2 attack, speed 1.2 -> 1.55)
    // are baked into the base stats. Light Cavalry then drops to 1.5, as in AoE2.
    attacks: [{ cls: 'melee', amount: 5 }, { cls: 'monk', amount: 6 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 2 }],
    range: 0, rof: 2, speed: 1.55, los: 6, // AoE2 scales scout LOS by age; we use a flat mid value
    classes: ['cavalry'],
    conversionResist: 30, // scout line shrugs off monks (AoE2 +8 min/+10 max rolls), Faith scale
    icon: 'icon/scout',
  },
  lightCavalry: {
    id: 'lightCavalry', name: 'Light Cavalry', age: 'castle',
    trainedAt: ['stable'], cost: { food: 80 }, trainTime: 30,
    hp: 60,
    attacks: [{ cls: 'melee', amount: 7 }, { cls: 'monk', amount: 10 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 2 }],
    range: 0, rof: 2, speed: 1.5, los: 8,
    classes: ['cavalry'],
    conversionResist: 30,
    requiresTech: 'lightCavalryUpgrade',
    icon: 'icon/lightCavalry',
  },

  // ----------------------------------------------------- stable: knight line
  knight: {
    id: 'knight', name: 'Knight', age: 'castle',
    trainedAt: ['stable'], cost: { food: 60, gold: 75 }, trainTime: 30,
    hp: 100,
    attacks: [{ cls: 'melee', amount: 10 }],
    armor: [{ cls: 'melee', amount: 2 }, { cls: 'pierce', amount: 2 }],
    range: 0, rof: 1.8, speed: 1.35, los: 4,
    classes: ['cavalry'],
    icon: 'icon/knight',
  },
  cavalier: {
    id: 'cavalier', name: 'Cavalier', age: 'imperial',
    trainedAt: ['stable'], cost: { food: 60, gold: 75 }, trainTime: 30,
    hp: 120,
    attacks: [{ cls: 'melee', amount: 12 }],
    armor: [{ cls: 'melee', amount: 2 }, { cls: 'pierce', amount: 2 }],
    range: 0, rof: 1.8, speed: 1.35, los: 4,
    classes: ['cavalry'],
    requiresTech: 'cavalierUpgrade',
    icon: 'icon/cavalier',
  },
  paladin: {
    id: 'paladin', name: 'Paladin', age: 'imperial',
    trainedAt: ['stable'], cost: { food: 60, gold: 75 }, trainTime: 30,
    hp: 160,
    attacks: [{ cls: 'melee', amount: 14 }],
    armor: [{ cls: 'melee', amount: 2 }, { cls: 'pierce', amount: 3 }],
    range: 0, rof: 1.9, speed: 1.35, los: 5,
    classes: ['cavalry'],
    requiresTech: 'paladinUpgrade',
    icon: 'icon/paladin',
  },

  // ------------------------------------------------- siege workshop: rams
  batteringRam: {
    id: 'batteringRam', name: 'Battering Ram', age: 'castle',
    trainedAt: ['siegeWorkshop'], cost: { wood: 160, gold: 75 }, trainTime: 36,
    hp: 175,
    attacks: [
      { cls: 'melee', amount: 2 },
      { cls: 'building', amount: 150 },
      { cls: 'siege', amount: 40 },
    ],
    armor: [{ cls: 'melee', amount: -3 }, { cls: 'pierce', amount: 180 }, { cls: 'ram', amount: 0 }],
    range: 0, rof: 5, speed: 0.6, los: 3,
    classes: ['siege', 'ram'],
    garrisonCapacity: 6, // all rams hold 6 in the current AoE2 DE patch era this pack tracks
    icon: 'icon/batteringRam',
  },
  cappedRam: {
    id: 'cappedRam', name: 'Capped Ram', age: 'imperial',
    trainedAt: ['siegeWorkshop'], cost: { wood: 160, gold: 75 }, trainTime: 36,
    hp: 200,
    attacks: [
      { cls: 'melee', amount: 3 },
      { cls: 'building', amount: 160 },
      { cls: 'siege', amount: 50 },
    ],
    armor: [{ cls: 'melee', amount: -2 }, { cls: 'pierce', amount: 190 }, { cls: 'ram', amount: 1 }],
    range: 0, rof: 5, speed: 0.6, los: 3,
    classes: ['siege', 'ram'],
    garrisonCapacity: 6,
    requiresTech: 'cappedRamUpgrade',
    icon: 'icon/cappedRam',
  },
  siegeRam: {
    id: 'siegeRam', name: 'Siege Ram', age: 'imperial',
    trainedAt: ['siegeWorkshop'], cost: { wood: 160, gold: 75 }, trainTime: 36,
    hp: 270,
    attacks: [
      { cls: 'melee', amount: 4 },
      { cls: 'building', amount: 200 },
      { cls: 'siege', amount: 65 },
    ],
    armor: [{ cls: 'melee', amount: -1 }, { cls: 'pierce', amount: 195 }, { cls: 'ram', amount: 2 }],
    range: 0, rof: 5, speed: 0.6, los: 3,
    classes: ['siege', 'ram'],
    garrisonCapacity: 6,
    requiresTech: 'siegeRamUpgrade',
    icon: 'icon/siegeRam',
  },

  // -------------------------------------------- siege workshop: mangonels
  mangonel: {
    id: 'mangonel', name: 'Mangonel', age: 'castle',
    trainedAt: ['siegeWorkshop'], cost: { wood: 160, gold: 135 }, trainTime: 46,
    hp: 50,
    attacks: [
      { cls: 'melee', amount: 40 },
      { cls: 'building', amount: 35 },
      { cls: 'siege', amount: 12 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 6 }],
    range: 7, minRange: 3, rof: 6, projectileSpeed: 4, accuracy: 100, areaRadius: 1,
    speed: 0.6, los: 9,
    classes: ['siege'],
    icon: 'icon/mangonel',
  },
  onager: {
    id: 'onager', name: 'Onager', age: 'imperial',
    trainedAt: ['siegeWorkshop'], cost: { wood: 160, gold: 135 }, trainTime: 46,
    hp: 60,
    attacks: [
      { cls: 'melee', amount: 50 },
      { cls: 'building', amount: 45 },
      { cls: 'siege', amount: 12 },
    ],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 7 }],
    range: 8, minRange: 3, rof: 6, projectileSpeed: 4, accuracy: 100, areaRadius: 1.25,
    speed: 0.6, los: 10,
    classes: ['siege'],
    requiresTech: 'onagerUpgrade',
    icon: 'icon/onager',
  },

  // ------------------------------------------------------ castle: trebuchet
  trebuchet: {
    id: 'trebuchet', name: 'Trebuchet', age: 'imperial',
    trainedAt: ['castle'], cost: { wood: 200, gold: 200 }, trainTime: 50,
    hp: 150,
    attacks: [{ cls: 'pierce', amount: 200 }, { cls: 'building', amount: 250 }],
    armor: [{ cls: 'melee', amount: 1 }, { cls: 'pierce', amount: 150 }],
    range: 16, minRange: 4, rof: 10, projectileSpeed: 4, accuracy: 15,
    speed: 0.8, los: 19,
    classes: ['siege'],
    pack: {
      packTime: 10, unpackTime: 10,
      // Packed/moving trebs lose the huge pierce armor: arrows and raids can snipe them
      // in transit, as in AoE2.
      packedArmor: [{ cls: 'melee', amount: 2 }, { cls: 'pierce', amount: 8 }],
    },
    icon: 'icon/trebuchet',
  },

  // ---------------------------------------------------------------- monastery
  monk: {
    id: 'monk', name: 'Monk', age: 'castle',
    trainedAt: ['monastery'], cost: { gold: 100 }, trainTime: 51,
    hp: 30,
    attacks: [], // monks never fight; they heal and convert
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 9, rof: 2, speed: 0.7, los: 11,
    classes: ['monk'],
    heals: true, converts: true,
    icon: 'icon/monk',
  },

  // ------------------------------------------- unique: Scots Highland Raider
  // Modeled on the closest AoE2 analog (Celts' fast castle infantry).
  highlandRaider: {
    id: 'highlandRaider', name: 'Highland Raider', age: 'castle',
    trainedAt: ['castle'], cost: { food: 70, gold: 25 }, trainTime: 10,
    hp: 70,
    attacks: [{ cls: 'melee', amount: 11 }, { cls: 'building', amount: 2 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 1.17, los: 3, // Scots infantry-speed bonus stacks on top
    classes: ['infantry', 'uniqueUnit'],
    icon: 'icon/highlandRaider',
  },
  eliteHighlandRaider: {
    id: 'eliteHighlandRaider', name: 'Elite Highland Raider', age: 'imperial',
    trainedAt: ['castle'], cost: { food: 70, gold: 25 }, trainTime: 10,
    hp: 85,
    attacks: [{ cls: 'melee', amount: 15 }, { cls: 'building', amount: 3 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 1.17, los: 5,
    classes: ['infantry', 'uniqueUnit'],
    requiresTech: 'eliteHighlandRaiderUpgrade',
    icon: 'icon/eliteHighlandRaider',
  },

  // ------------------------------------------------ unique: English Longbowman
  longbowman: {
    id: 'longbowman', name: 'Longbowman', age: 'castle',
    trainedAt: ['castle'], cost: { wood: 35, gold: 40 }, trainTime: 18,
    hp: 35,
    attacks: [{ cls: 'pierce', amount: 6 }, { cls: 'spearman', amount: 2 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 5, rof: 2, projectileSpeed: 7, accuracy: 70, speed: 0.96, los: 7,
    classes: ['archer', 'uniqueUnit'],
    icon: 'icon/longbowman',
  },
  eliteLongbowman: {
    id: 'eliteLongbowman', name: 'Elite Longbowman', age: 'imperial',
    trainedAt: ['castle'], cost: { wood: 35, gold: 40 }, trainTime: 18,
    hp: 40,
    attacks: [{ cls: 'pierce', amount: 7 }, { cls: 'spearman', amount: 2 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 1 }],
    range: 6, rof: 2, projectileSpeed: 7, accuracy: 80, speed: 0.96, los: 8,
    classes: ['archer', 'uniqueUnit'],
    requiresTech: 'eliteLongbowmanUpgrade',
    icon: 'icon/eliteLongbowman',
  },

  // ---------------------------------------------------------------- gaia
  sheep: {
    id: 'sheep', name: 'Sheep', age: 'dark',
    trainedAt: [], cost: {}, trainTime: 0,
    hp: 7,
    attacks: [],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 2, speed: 0.8, los: 2,
    classes: [],
    foodAmount: 100, huntable: true, herdable: true,
    icon: 'icon/sheep',
  },
  deer: {
    id: 'deer', name: 'Deer', age: 'dark',
    trainedAt: [], cost: {}, trainTime: 0,
    hp: 5,
    attacks: [],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 2, speed: 1.2, los: 3, // flees hunters
    classes: [],
    foodAmount: 140, huntable: true,
    icon: 'icon/deer',
  },
  wolf: {
    id: 'wolf', name: 'Wolf', age: 'dark',
    trainedAt: [], cost: {}, trainTime: 0,
    hp: 25,
    attacks: [{ cls: 'melee', amount: 3 }],
    armor: [{ cls: 'melee', amount: 0 }, { cls: 'pierce', amount: 0 }],
    range: 0, rof: 2, speed: 1.2, los: 5, // hostile: attacks units that stray close
    classes: [],
    icon: 'icon/wolf',
  },
};
