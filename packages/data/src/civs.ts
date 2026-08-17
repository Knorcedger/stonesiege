// Civilization identities. Shared production lines keep the simulation compact,
// while unitNames, passive bonuses, tech-tree cuts and Castle units make each army
// play and read differently. Historical roles are broad medieval archetypes rather
// than claims that one fixed roster covered every century of a civilization.

import type { CivDef } from './schema';

export const civs: Record<string, CivDef> = {
  scots: {
    id: 'scots', name: 'Scots',
    description:
      'Hardened clansmen of the glens. Their foot soldiers cover ground faster than any ' +
      'other army, their lumberjacks strip forests at speed, and their siege trains come ' +
      'cheap. Unique unit: the Highland Raider, a swift sword-and-targe infantryman.',
    bonuses: [
      // Infantry move 15% faster once armies take the field (analog: +15% from Feudal Age).
      { effect: { kind: 'statMult', stat: 'speed', percent: 15, targetClasses: ['infantry'] }, fromAge: 'feudal' },
      // Lumberjacks work 15% faster.
      { effect: { kind: 'gatherMult', task: 'wood', percent: 15 } },
      // Siege workshop units cost 15% less (GDD: "cheap siege").
      { effect: { kind: 'costMult', percent: -15, targetClasses: ['siege'] } },
    ],
    uniqueUnit: 'highlandRaider',
    eliteUniqueTech: 'eliteHighlandRaiderUpgrade',
    uniqueTechs: ['schiltron', 'highlandFury'],
    // Tech-tree cuts (mirrors the AoE2 analog's misses relevant to our roster):
    // no Paladin — the infantry/siege civ tops out at Cavalier, like its analog.
    disabled: [
      'arbalester', 'arbalesterUpgrade',
      'bracer',
      'paladin', 'paladinUpgrade',
      'plateBardingArmor',
      'twoManSaw',
      'cropRotation',
      'architecture',
      'blockPrinting',
    ],
  },

  english: {
    id: 'english', name: 'English',
    description:
      'A kingdom built on wool and the warbow. Levied archers are cheap to raise and, as ' +
      'the ages turn, loose their shafts farther than any rival. Shepherds tend flocks with ' +
      'famous efficiency. Unique unit: the Longbowman, a foot archer of exceptional reach.',
    bonuses: [
      // Archery units cost 10% less once ranges open.
      { effect: { kind: 'costMult', percent: -10, targetClasses: ['archer'] }, fromAge: 'feudal' },
      // Foot archers gain +1 range in the Castle Age and +1 more in the Imperial Age.
      { effect: { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer'] }, fromAge: 'castle' },
      { effect: { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer'] }, fromAge: 'imperial' },
      // Shepherds work 25% faster (herding/hunting share the 'hunt' gather task in v1).
      { effect: { kind: 'gatherMult', task: 'hunt', percent: 25 } },
    ],
    uniqueUnit: 'longbowman',
    eliteUniqueTech: 'eliteLongbowmanUpgrade',
    uniqueTechs: ['yeomanLevy', 'ludgar'],
    // English keep Crop Rotation (farming kingdom; the AoE2 analog has it too).
    disabled: [
      'paladin', 'paladinUpgrade',
      'siegeRam', 'siegeRamUpgrade',
    ],
  },

  norse: {
    id: 'norse', name: 'Vikings',
    description:
      'Seaborne raiders and shield-wall infantry. Norse foot soldiers are tougher and ' +
      'cheaper to field, while fast lumber work feeds an aggressive early economy. ' +
      'Unique unit: the Housecarl, an armoured lord’s retainer built to break archers.',
    bonuses: [
      { effect: { kind: 'statMult', stat: 'hp', percent: 15, targetClasses: ['infantry'] }, fromAge: 'feudal' },
      { effect: { kind: 'costMult', percent: -10, targetClasses: ['infantry'] }, fromAge: 'feudal' },
      { effect: { kind: 'gatherMult', task: 'wood', percent: 10 } },
    ],
    uniqueUnit: 'housecarl',
    eliteUniqueTech: 'eliteHousecarlUpgrade',
    uniqueTechs: ['shieldWall', 'jarlsLevy'],
    unitNames: {
      militia: 'Bondi', manAtArms: 'Hirdman', longswordsman: 'Veteran Hirdman', champion: 'Hersir',
      spearman: 'Leidang Spearman', pikeman: 'Veteran Spearman',
      scout: 'Norse Scout', lightCavalry: 'Mounted Raider', knight: 'Jarl’s Rider', cavalier: 'Jarl’s Guard',
    },
    disabled: [
      'arbalester', 'arbalesterUpgrade',
      'paladin', 'paladinUpgrade', 'plateBardingArmor',
      'siegeRam', 'siegeRamUpgrade',
    ],
  },

  french: {
    id: 'french', name: 'French',
    description:
      'Feudal levies anchored by elite armoured horsemen. French cavalry is tougher and ' +
      'less expensive from the Castle Age onward, supported by productive farms. ' +
      'Unique unit: the Chevalier, a devastating heavy shock cavalryman.',
    bonuses: [
      { effect: { kind: 'statMult', stat: 'hp', percent: 20, targetClasses: ['cavalry'] }, fromAge: 'castle' },
      { effect: { kind: 'costMult', percent: -10, targetClasses: ['cavalry'] }, fromAge: 'castle' },
      { effect: { kind: 'gatherMult', task: 'farm', percent: 10 } },
    ],
    uniqueUnit: 'chevalier',
    eliteUniqueTech: 'eliteChevalierUpgrade',
    uniqueTechs: ['oriflamme', 'compagniesOrdonnance'],
    unitNames: {
      militia: 'Feudal Levy', manAtArms: 'Sergeant-at-Arms', longswordsman: 'Armoured Sergeant', champion: 'Royal Sergeant',
      scout: 'Mounted Sergeant', lightCavalry: 'Hobelar', knight: 'Mounted Man-at-Arms', cavalier: 'Banneret', paladin: 'Royal Gendarme',
      archer: 'Archer', crossbowman: 'Arbalétrier', arbalester: 'Veteran Arbalétrier',
    },
    disabled: ['siegeRam', 'siegeRamUpgrade', 'onager', 'onagerUpgrade'],
  },

  mongols: {
    id: 'mongols', name: 'Mongols',
    description:
      'A steppe army built around remounts, scouting and composite bows. Mongol cavalry ' +
      'moves faster, hunters gather quickly, and siege crews assemble engines at speed. ' +
      'Unique unit: the Kheshig Horse Archer, an elite mounted retainer.',
    bonuses: [
      { effect: { kind: 'statMult', stat: 'speed', percent: 10, targetClasses: ['cavalry'] } },
      { effect: { kind: 'gatherMult', task: 'hunt', percent: 30 } },
      { effect: { kind: 'statMult', stat: 'trainTime', percent: -20, targetClasses: ['siege'] }, fromAge: 'castle' },
    ],
    uniqueUnit: 'mangudai',
    eliteUniqueTech: 'eliteMangudaiUpgrade',
    uniqueTechs: ['nomadRemounts', 'steppeTactics'],
    unitNames: {
      militia: 'Camp Warrior', manAtArms: 'Tribal Warrior', longswordsman: 'Armoured Warrior', champion: 'Khan’s Guard',
      archer: 'Steppe Bowman', crossbowman: 'Composite Bowman', skirmisher: 'Mounted Host Skirmisher',
      scout: 'Nökör Scout', lightCavalry: 'Steppe Rider', knight: 'Keshig Lancer', cavalier: 'Veteran Keshig',
    },
    disabled: [
      'arbalester', 'arbalesterUpgrade',
      'champion', 'championUpgrade',
      'paladin', 'paladinUpgrade', 'plateBardingArmor',
      'architecture',
    ],
  },

  byzantines: {
    id: 'byzantines', name: 'Byzantines',
    description:
      'A disciplined imperial army with deep defences and affordable counter-troops. ' +
      'Byzantine fortifications endure longer and their cavalry carries heavier armour. ' +
      'Unique unit: the Cataphract, an armoured horseman trained to smash infantry.',
    bonuses: [
      { effect: { kind: 'statMult', stat: 'hp', percent: 15, targetClasses: ['building'] } },
      { effect: { kind: 'costMult', percent: -20, targetIds: ['spearman', 'pikeman', 'skirmisher', 'eliteSkirmisher'] } },
      { effect: { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['cavalry'] }, fromAge: 'castle' },
    ],
    uniqueUnit: 'cataphract',
    eliteUniqueTech: 'eliteCataphractUpgrade',
    uniqueTechs: ['themeSystem', 'lamellarBarding'],
    unitNames: {
      militia: 'Akritai', manAtArms: 'Skoutatos', longswordsman: 'Veteran Skoutatos', champion: 'Varangian Guardsman',
      spearman: 'Kontaratos', pikeman: 'Veteran Kontaratos', archer: 'Toxotes', crossbowman: 'Tzakon',
      scout: 'Prodromos', lightCavalry: 'Trapezites', knight: 'Kavallarios', cavalier: 'Armoured Kavallarios',
    },
    disabled: ['paladin', 'paladinUpgrade', 'siegeRam', 'siegeRamUpgrade'],
  },

  saracens: {
    id: 'saracens', name: 'Saracens',
    description:
      'Mobile armies of the medieval Islamic world, sustained by trade, gold and expert ' +
      'horsemanship. Their cavalry strikes harder as the ages advance. Unique unit: the ' +
      'Mamluk, a professional elite cavalry soldier trained in bow, lance and sword.',
    bonuses: [
      { effect: { kind: 'gatherMult', task: 'gold', percent: 10 } },
      { effect: { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['cavalry'] }, fromAge: 'castle' },
      { effect: { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['cavalry'] }, fromAge: 'imperial' },
      { effect: { kind: 'statMult', stat: 'speed', percent: 5, targetClasses: ['cavalry'] } },
    ],
    uniqueUnit: 'mamluk',
    eliteUniqueTech: 'eliteMamlukUpgrade',
    uniqueTechs: ['furusiyya', 'desertLogistics'],
    unitNames: {
      militia: 'Town Levy', manAtArms: 'Jund Infantry', longswordsman: 'Ghulam Guardsman', champion: 'Amir’s Guard',
      spearman: 'Haras Spearman', pikeman: 'Veteran Haras', archer: 'Arab Archer', crossbowman: 'Composite Bowman',
      scout: 'Faris Scout', lightCavalry: 'Bedouin Rider', knight: 'Ghulam Cavalry', cavalier: 'Veteran Ghulam',
    },
    disabled: ['paladin', 'paladinUpgrade', 'siegeRam', 'siegeRamUpgrade', 'twoManSaw'],
  },
};
