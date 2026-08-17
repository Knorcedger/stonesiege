// v1 technology tree. Costs, research times, and effect magnitudes mirror AoE2 DE
// (verified against the aoe2techtree.net database, July 2026). All prose original.
// Effect target semantics: targetClasses/targetIds select which OWN defs receive the
// effect (union when both present); omitted targets = applies to all own units.

import type { TechDef } from './schema';

export const techs: Record<string, TechDef> = {
  // ------------------------------------------------------------- age advances
  feudalAge: {
    id: 'feudalAge', name: 'Feudal Age', age: 'dark',
    researchedAt: ['townCenter'], cost: { food: 500 }, researchTime: 130,
    effects: [{ kind: 'ageUp', to: 'feudal' }],
    requiresBuildingsOfCurrentAge: 2,
    icon: 'icon/tech/feudalAge',
  },
  castleAge: {
    id: 'castleAge', name: 'Castle Age', age: 'feudal',
    researchedAt: ['townCenter'], cost: { food: 800, gold: 200 }, researchTime: 160,
    effects: [{ kind: 'ageUp', to: 'castle' }],
    requiresTech: 'feudalAge',
    requiresBuildingsOfCurrentAge: 2,
    icon: 'icon/tech/castleAge',
  },
  imperialAge: {
    id: 'imperialAge', name: 'Imperial Age', age: 'castle',
    researchedAt: ['townCenter'], cost: { food: 1000, gold: 800 }, researchTime: 190,
    effects: [{ kind: 'ageUp', to: 'imperial' }],
    requiresTech: 'castleAge',
    requiresBuildingsOfCurrentAge: 2,
    icon: 'icon/tech/imperialAge',
  },

  // ------------------------------------------------------- town center economy
  loom: {
    id: 'loom', name: 'Loom', age: 'dark',
    researchedAt: ['townCenter'], cost: { gold: 50 }, researchTime: 25,
    effects: [
      { kind: 'statAdd', stat: 'hp', amount: 15, targetIds: ['villager'] },
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetIds: ['villager'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 2, targetIds: ['villager'] },
    ],
    icon: 'icon/tech/loom',
  },
  wheelbarrow: {
    id: 'wheelbarrow', name: 'Wheelbarrow', age: 'feudal',
    researchedAt: ['townCenter'], cost: { food: 175, wood: 50 }, researchTime: 75,
    effects: [
      { kind: 'statMult', stat: 'speed', percent: 10, targetIds: ['villager'] },
      { kind: 'statMult', stat: 'carryCapacity', percent: 25, targetIds: ['villager'] },
    ],
    icon: 'icon/tech/wheelbarrow',
  },
  handCart: {
    id: 'handCart', name: 'Hand Cart', age: 'castle',
    researchedAt: ['townCenter'], cost: { food: 300, wood: 200 }, researchTime: 55,
    effects: [
      { kind: 'statMult', stat: 'speed', percent: 10, targetIds: ['villager'] },
      { kind: 'statMult', stat: 'carryCapacity', percent: 50, targetIds: ['villager'] },
    ],
    requiresTech: 'wheelbarrow',
    icon: 'icon/tech/handCart',
  },

  // ----------------------------------------------------------- lumber camp
  doubleBitAxe: {
    id: 'doubleBitAxe', name: 'Double-Bit Axe', age: 'feudal',
    researchedAt: ['lumberCamp'], cost: { food: 100, wood: 50 }, researchTime: 25,
    effects: [{ kind: 'gatherMult', task: 'wood', percent: 20 }],
    icon: 'icon/tech/doubleBitAxe',
  },
  bowSaw: {
    id: 'bowSaw', name: 'Bow Saw', age: 'castle',
    researchedAt: ['lumberCamp'], cost: { food: 150, wood: 100 }, researchTime: 50,
    effects: [{ kind: 'gatherMult', task: 'wood', percent: 20 }],
    requiresTech: 'doubleBitAxe',
    icon: 'icon/tech/bowSaw',
  },
  twoManSaw: {
    id: 'twoManSaw', name: 'Two-Man Saw', age: 'imperial',
    researchedAt: ['lumberCamp'], cost: { food: 300, wood: 200 }, researchTime: 100,
    effects: [{ kind: 'gatherMult', task: 'wood', percent: 10 }],
    requiresTech: 'bowSaw',
    icon: 'icon/tech/twoManSaw',
  },

  // ----------------------------------------------------------- mining camp
  goldMining: {
    id: 'goldMining', name: 'Gold Mining', age: 'feudal',
    researchedAt: ['miningCamp'], cost: { food: 100, wood: 75 }, researchTime: 30,
    effects: [{ kind: 'gatherMult', task: 'gold', percent: 15 }],
    icon: 'icon/tech/goldMining',
  },
  goldShaftMining: {
    id: 'goldShaftMining', name: 'Gold Shaft Mining', age: 'castle',
    researchedAt: ['miningCamp'], cost: { food: 175, wood: 75 }, researchTime: 75,
    effects: [{ kind: 'gatherMult', task: 'gold', percent: 15 }],
    requiresTech: 'goldMining',
    icon: 'icon/tech/goldShaftMining',
  },
  stoneMining: {
    id: 'stoneMining', name: 'Stone Mining', age: 'feudal',
    researchedAt: ['miningCamp'], cost: { food: 100, wood: 75 }, researchTime: 30,
    effects: [{ kind: 'gatherMult', task: 'stone', percent: 15 }],
    icon: 'icon/tech/stoneMining',
  },
  stoneShaftMining: {
    id: 'stoneShaftMining', name: 'Stone Shaft Mining', age: 'castle',
    researchedAt: ['miningCamp'], cost: { food: 175, wood: 75 }, researchTime: 75,
    effects: [{ kind: 'gatherMult', task: 'stone', percent: 15 }],
    requiresTech: 'stoneMining',
    icon: 'icon/tech/stoneShaftMining',
  },

  // ------------------------------------------------------------------ mill
  horseCollar: {
    id: 'horseCollar', name: 'Horse Collar', age: 'feudal',
    researchedAt: ['mill'], cost: { food: 75, wood: 75 }, researchTime: 20,
    effects: [{ kind: 'statAdd', stat: 'farmFood', amount: 75, targetIds: ['farm'] }],
    icon: 'icon/tech/horseCollar',
  },
  heavyPlow: {
    id: 'heavyPlow', name: 'Heavy Plow', age: 'castle',
    researchedAt: ['mill'], cost: { food: 125, wood: 125 }, researchTime: 40,
    effects: [{ kind: 'statAdd', stat: 'farmFood', amount: 125, targetIds: ['farm'] }],
    requiresTech: 'horseCollar',
    icon: 'icon/tech/heavyPlow',
  },
  cropRotation: {
    id: 'cropRotation', name: 'Crop Rotation', age: 'imperial',
    researchedAt: ['mill'], cost: { food: 250, wood: 250 }, researchTime: 70,
    effects: [{ kind: 'statAdd', stat: 'farmFood', amount: 175, targetIds: ['farm'] }],
    requiresTech: 'heavyPlow',
    icon: 'icon/tech/cropRotation',
  },

  // ------------------------------------------------- blacksmith: melee attack
  forging: {
    id: 'forging', name: 'Forging', age: 'feudal',
    researchedAt: ['blacksmith'], cost: { food: 150 }, researchTime: 50,
    effects: [{ kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['infantry', 'cavalry'] }],
    icon: 'icon/tech/forging',
  },
  ironCasting: {
    id: 'ironCasting', name: 'Iron Casting', age: 'castle',
    researchedAt: ['blacksmith'], cost: { food: 220, gold: 120 }, researchTime: 75,
    effects: [{ kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['infantry', 'cavalry'] }],
    requiresTech: 'forging',
    icon: 'icon/tech/ironCasting',
  },
  blastFurnace: {
    id: 'blastFurnace', name: 'Blast Furnace', age: 'imperial',
    researchedAt: ['blacksmith'], cost: { food: 275, gold: 225 }, researchTime: 100,
    effects: [{ kind: 'statAdd', stat: 'attack', amount: 2, targetClasses: ['infantry', 'cavalry'] }],
    requiresTech: 'ironCasting',
    icon: 'icon/tech/blastFurnace',
  },

  // ----------------------------------------------- blacksmith: infantry armor
  scaleMailArmor: {
    id: 'scaleMailArmor', name: 'Scale Mail Armor', age: 'feudal',
    researchedAt: ['blacksmith'], cost: { food: 100 }, researchTime: 40,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['infantry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['infantry'] },
    ],
    icon: 'icon/tech/scaleMailArmor',
  },
  chainMailArmor: {
    id: 'chainMailArmor', name: 'Chain Mail Armor', age: 'castle',
    researchedAt: ['blacksmith'], cost: { food: 200, gold: 100 }, researchTime: 55,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['infantry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['infantry'] },
    ],
    requiresTech: 'scaleMailArmor',
    icon: 'icon/tech/chainMailArmor',
  },
  plateMailArmor: {
    id: 'plateMailArmor', name: 'Plate Mail Armor', age: 'imperial',
    researchedAt: ['blacksmith'], cost: { food: 300, gold: 150 }, researchTime: 70,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['infantry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 2, targetClasses: ['infantry'] },
    ],
    requiresTech: 'chainMailArmor',
    icon: 'icon/tech/plateMailArmor',
  },

  // ------------------------------------------------ blacksmith: cavalry armor
  scaleBardingArmor: {
    id: 'scaleBardingArmor', name: 'Scale Barding Armor', age: 'feudal',
    researchedAt: ['blacksmith'], cost: { food: 150 }, researchTime: 45,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['cavalry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['cavalry'] },
    ],
    icon: 'icon/tech/scaleBardingArmor',
  },
  chainBardingArmor: {
    id: 'chainBardingArmor', name: 'Chain Barding Armor', age: 'castle',
    researchedAt: ['blacksmith'], cost: { food: 250, gold: 150 }, researchTime: 60,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['cavalry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['cavalry'] },
    ],
    requiresTech: 'scaleBardingArmor',
    icon: 'icon/tech/chainBardingArmor',
  },
  plateBardingArmor: {
    id: 'plateBardingArmor', name: 'Plate Barding Armor', age: 'imperial',
    researchedAt: ['blacksmith'], cost: { food: 350, gold: 200 }, researchTime: 75,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['cavalry'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 2, targetClasses: ['cavalry'] },
    ],
    requiresTech: 'chainBardingArmor',
    icon: 'icon/tech/plateBardingArmor',
  },

  // ------------------------------------------------ blacksmith: archer attack
  fletching: {
    id: 'fletching', name: 'Fletching', age: 'feudal',
    researchedAt: ['blacksmith'], cost: { food: 100, gold: 50 }, researchTime: 30,
    effects: [
      { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'los', amount: 1, targetClasses: ['archer'] },
    ],
    icon: 'icon/tech/fletching',
  },
  bodkinArrow: {
    id: 'bodkinArrow', name: 'Bodkin Arrow', age: 'castle',
    researchedAt: ['blacksmith'], cost: { food: 200, gold: 100 }, researchTime: 35,
    effects: [
      { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'los', amount: 1, targetClasses: ['archer'] },
    ],
    requiresTech: 'fletching',
    icon: 'icon/tech/bodkinArrow',
  },
  bracer: {
    id: 'bracer', name: 'Bracer', age: 'imperial',
    researchedAt: ['blacksmith'], cost: { food: 300, gold: 200 }, researchTime: 40,
    effects: [
      { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter'] },
      { kind: 'statAdd', stat: 'los', amount: 1, targetClasses: ['archer'] },
    ],
    requiresTech: 'bodkinArrow',
    icon: 'icon/tech/bracer',
  },

  // ------------------------------------------------- blacksmith: archer armor
  paddedArcherArmor: {
    id: 'paddedArcherArmor', name: 'Padded Archer Armor', age: 'feudal',
    researchedAt: ['blacksmith'], cost: { food: 100 }, researchTime: 40,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['archer'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['archer'] },
    ],
    icon: 'icon/tech/paddedArcherArmor',
  },
  leatherArcherArmor: {
    id: 'leatherArcherArmor', name: 'Leather Archer Armor', age: 'castle',
    researchedAt: ['blacksmith'], cost: { food: 150, gold: 150 }, researchTime: 55,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['archer'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['archer'] },
    ],
    requiresTech: 'paddedArcherArmor',
    icon: 'icon/tech/leatherArcherArmor',
  },
  ringArcherArmor: {
    id: 'ringArcherArmor', name: 'Ring Archer Armor', age: 'imperial',
    researchedAt: ['blacksmith'], cost: { food: 250, gold: 250 }, researchTime: 70,
    effects: [
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['archer'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 2, targetClasses: ['archer'] },
    ],
    requiresTech: 'leatherArcherArmor',
    icon: 'icon/tech/ringArcherArmor',
  },

  // ------------------------------------------------------------- university
  ballistics: {
    id: 'ballistics', name: 'Ballistics', age: 'castle',
    researchedAt: ['university'], cost: { wood: 300, gold: 175 }, researchTime: 60,
    effects: [{ kind: 'ballistics' }],
    icon: 'icon/tech/ballistics',
  },
  masonry: {
    id: 'masonry', name: 'Masonry', age: 'castle',
    researchedAt: ['university'], cost: { food: 150, wood: 175 }, researchTime: 50,
    effects: [
      { kind: 'statMult', stat: 'hp', percent: 10, targetClasses: ['building'] },
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['building'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['building'] },
    ],
    icon: 'icon/tech/masonry',
  },
  architecture: {
    id: 'architecture', name: 'Architecture', age: 'imperial',
    researchedAt: ['university'], cost: { food: 300, wood: 200 }, researchTime: 70,
    effects: [
      { kind: 'statMult', stat: 'hp', percent: 10, targetClasses: ['building'] },
      { kind: 'statAdd', stat: 'armorMelee', amount: 1, targetClasses: ['building'] },
      { kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['building'] },
    ],
    requiresTech: 'masonry',
    icon: 'icon/tech/architecture',
  },
  murderHoles: {
    id: 'murderHoles', name: 'Murder Holes', age: 'castle',
    researchedAt: ['university'], cost: { food: 200, stone: 100 }, researchTime: 35,
    effects: [{ kind: 'statAdd', stat: 'minRange', amount: -1, targetClasses: ['wallOrTower', 'castle'] }],
    icon: 'icon/tech/murderHoles',
  },
  chemistry: {
    id: 'chemistry', name: 'Chemistry', age: 'imperial',
    researchedAt: ['university'], cost: { food: 300, gold: 200 }, researchTime: 100,
    effects: [
      { kind: 'statAdd', stat: 'attack', amount: 1, targetClasses: ['archer', 'wallOrTower', 'castle'], targetIds: ['townCenter', 'trebuchet'] },
    ],
    icon: 'icon/tech/chemistry',
  },
  siegeEngineers: {
    id: 'siegeEngineers', name: 'Siege Engineers', age: 'imperial',
    researchedAt: ['university'], cost: { food: 500, wood: 600 }, researchTime: 45,
    effects: [
      { kind: 'statAdd', stat: 'range', amount: 1, targetIds: ['mangonel', 'onager', 'trebuchet'] },
      { kind: 'bonusDamage', vs: 'building', amount: 30, targetClasses: ['ram'] }, // ~+20% vs buildings
      { kind: 'bonusDamage', vs: 'building', amount: 8, targetIds: ['mangonel', 'onager'] },
      { kind: 'bonusDamage', vs: 'building', amount: 50, targetIds: ['trebuchet'] },
    ],
    icon: 'icon/tech/siegeEngineers',
  },
  guardTowerUpgrade: {
    id: 'guardTowerUpgrade', name: 'Guard Tower', age: 'castle',
    researchedAt: ['university'], cost: { food: 100, wood: 250 }, researchTime: 30,
    effects: [{ kind: 'upgradeUnit', from: 'watchTower', to: 'guardTower' }],
    icon: 'icon/tech/guardTowerUpgrade',
  },
  keepUpgrade: {
    id: 'keepUpgrade', name: 'Keep', age: 'imperial',
    researchedAt: ['university'], cost: { food: 500, wood: 350 }, researchTime: 75,
    effects: [{ kind: 'upgradeUnit', from: 'guardTower', to: 'keep' }],
    requiresTech: 'guardTowerUpgrade',
    icon: 'icon/tech/keepUpgrade',
  },

  // -------------------------------------------------------------- monastery
  sanctity: {
    id: 'sanctity', name: 'Sanctity', age: 'castle',
    researchedAt: ['monastery'], cost: { gold: 175 }, researchTime: 60,
    effects: [{ kind: 'statAdd', stat: 'hp', amount: 15, targetIds: ['monk'] }],
    icon: 'icon/tech/sanctity',
  },
  fervor: {
    id: 'fervor', name: 'Fervor', age: 'castle',
    researchedAt: ['monastery'], cost: { gold: 140 }, researchTime: 50,
    effects: [{ kind: 'statMult', stat: 'speed', percent: 15, targetIds: ['monk'] }],
    icon: 'icon/tech/fervor',
  },
  blockPrinting: {
    id: 'blockPrinting', name: 'Block Printing', age: 'castle',
    researchedAt: ['monastery'], cost: { gold: 200 }, researchTime: 55,
    effects: [{ kind: 'statAdd', stat: 'range', amount: 3, targetIds: ['monk'] }],
    icon: 'icon/tech/blockPrinting',
  },
  faith: {
    id: 'faith', name: 'Faith', age: 'imperial',
    researchedAt: ['monastery'], cost: { food: 550, gold: 750 }, researchTime: 60,
    effects: [{ kind: 'statAdd', stat: 'conversionResist', amount: 50 }], // all own units
    icon: 'icon/tech/faith',
  },

  // ------------------------------------------------ barracks line upgrades
  manAtArmsUpgrade: {
    id: 'manAtArmsUpgrade', name: 'Man-at-Arms', age: 'feudal',
    researchedAt: ['barracks'], cost: { food: 100, gold: 40 }, researchTime: 40,
    effects: [{ kind: 'upgradeUnit', from: 'militia', to: 'manAtArms' }],
    icon: 'icon/tech/manAtArmsUpgrade',
  },
  longswordsmanUpgrade: {
    id: 'longswordsmanUpgrade', name: 'Longswordsman', age: 'castle',
    researchedAt: ['barracks'], cost: { food: 150, gold: 65 }, researchTime: 40,
    effects: [{ kind: 'upgradeUnit', from: 'manAtArms', to: 'longswordsman' }],
    requiresTech: 'manAtArmsUpgrade',
    icon: 'icon/tech/longswordsmanUpgrade',
  },
  championUpgrade: {
    // Priced above AoE2's bare Champion upgrade (650F 350G): StoneSiege's 4-tier militia
    // line skips Two-Handed Swordsman, so this absorbs roughly half of that skipped cost.
    id: 'championUpgrade', name: 'Champion', age: 'imperial',
    researchedAt: ['barracks'], cost: { food: 750, gold: 400 }, researchTime: 70,
    effects: [{ kind: 'upgradeUnit', from: 'longswordsman', to: 'champion' }],
    requiresTech: 'longswordsmanUpgrade',
    icon: 'icon/tech/championUpgrade',
  },
  pikemanUpgrade: {
    id: 'pikemanUpgrade', name: 'Pikeman', age: 'castle',
    researchedAt: ['barracks'], cost: { food: 160, gold: 90 }, researchTime: 35,
    effects: [{ kind: 'upgradeUnit', from: 'spearman', to: 'pikeman' }],
    icon: 'icon/tech/pikemanUpgrade',
  },

  // -------------------------------------------- archery range line upgrades
  crossbowmanUpgrade: {
    id: 'crossbowmanUpgrade', name: 'Crossbowman', age: 'castle',
    researchedAt: ['archeryRange'], cost: { food: 175, gold: 100 }, researchTime: 35,
    effects: [{ kind: 'upgradeUnit', from: 'archer', to: 'crossbowman' }],
    icon: 'icon/tech/crossbowmanUpgrade',
  },
  arbalesterUpgrade: {
    id: 'arbalesterUpgrade', name: 'Arbalester', age: 'imperial',
    researchedAt: ['archeryRange'], cost: { food: 450, gold: 350 }, researchTime: 50,
    effects: [{ kind: 'upgradeUnit', from: 'crossbowman', to: 'arbalester' }],
    requiresTech: 'crossbowmanUpgrade',
    icon: 'icon/tech/arbalesterUpgrade',
  },
  eliteSkirmisherUpgrade: {
    id: 'eliteSkirmisherUpgrade', name: 'Elite Skirmisher', age: 'imperial', // as in AoE2
    researchedAt: ['archeryRange'], cost: { wood: 230, gold: 130 }, researchTime: 50,
    effects: [{ kind: 'upgradeUnit', from: 'skirmisher', to: 'eliteSkirmisher' }],
    icon: 'icon/tech/eliteSkirmisherUpgrade',
  },

  // ----------------------------------------------------- stable line upgrades
  lightCavalryUpgrade: {
    id: 'lightCavalryUpgrade', name: 'Light Cavalry', age: 'castle',
    researchedAt: ['stable'], cost: { food: 150, gold: 50 }, researchTime: 45,
    effects: [{ kind: 'upgradeUnit', from: 'scout', to: 'lightCavalry' }],
    icon: 'icon/tech/lightCavalryUpgrade',
  },
  cavalierUpgrade: {
    id: 'cavalierUpgrade', name: 'Cavalier', age: 'imperial',
    researchedAt: ['stable'], cost: { food: 300, gold: 300 }, researchTime: 80,
    effects: [{ kind: 'upgradeUnit', from: 'knight', to: 'cavalier' }],
    icon: 'icon/tech/cavalierUpgrade',
  },
  paladinUpgrade: {
    id: 'paladinUpgrade', name: 'Paladin', age: 'imperial',
    researchedAt: ['stable'], cost: { food: 1300, gold: 750 }, researchTime: 170,
    effects: [{ kind: 'upgradeUnit', from: 'cavalier', to: 'paladin' }],
    requiresTech: 'cavalierUpgrade',
    icon: 'icon/tech/paladinUpgrade',
  },

  // --------------------------------------------- siege workshop line upgrades
  cappedRamUpgrade: {
    id: 'cappedRamUpgrade', name: 'Capped Ram', age: 'imperial',
    researchedAt: ['siegeWorkshop'], cost: { food: 300 }, researchTime: 50,
    effects: [{ kind: 'upgradeUnit', from: 'batteringRam', to: 'cappedRam' }],
    icon: 'icon/tech/cappedRamUpgrade',
  },
  siegeRamUpgrade: {
    id: 'siegeRamUpgrade', name: 'Siege Ram', age: 'imperial',
    researchedAt: ['siegeWorkshop'], cost: { food: 1000 }, researchTime: 75,
    effects: [{ kind: 'upgradeUnit', from: 'cappedRam', to: 'siegeRam' }],
    requiresTech: 'cappedRamUpgrade',
    icon: 'icon/tech/siegeRamUpgrade',
  },
  onagerUpgrade: {
    id: 'onagerUpgrade', name: 'Onager', age: 'imperial',
    researchedAt: ['siegeWorkshop'], cost: { food: 800, gold: 500 }, researchTime: 75,
    effects: [{ kind: 'upgradeUnit', from: 'mangonel', to: 'onager' }],
    icon: 'icon/tech/onagerUpgrade',
  },

  // ---------------------------------------------- Scots unique techs (castle)
  schiltron: {
    id: 'schiltron', name: 'Schiltron', age: 'castle',
    researchedAt: ['castle'], cost: { food: 300, gold: 200 }, researchTime: 45,
    effects: [{ kind: 'bonusDamage', vs: 'cavalry', amount: 4, targetClasses: ['spearman'] }],
    unique: true,
    icon: 'icon/tech/schiltron',
  },
  highlandFury: {
    id: 'highlandFury', name: 'Highland Fury', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 750, gold: 450 }, researchTime: 50,
    effects: [{ kind: 'statMult', stat: 'hp', percent: 40, targetClasses: ['siege'] }],
    unique: true,
    icon: 'icon/tech/highlandFury',
  },

  // --------------------------------------------- English unique techs (castle)
  yeomanLevy: {
    id: 'yeomanLevy', name: 'Yeoman Levy', age: 'castle',
    researchedAt: ['castle'], cost: { wood: 750, gold: 450 }, researchTime: 60,
    effects: [
      { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer'] },
      { kind: 'statAdd', stat: 'attack', amount: 2, targetClasses: ['wallOrTower'] },
    ],
    unique: true,
    icon: 'icon/tech/yeomanLevy',
  },
  ludgar: {
    // Named for the great engine hauled to the siege of Stirling: never misses.
    id: 'ludgar', name: 'Ludgar', age: 'imperial',
    researchedAt: ['castle'], cost: { wood: 800, gold: 400 }, researchTime: 60,
    effects: [{ kind: 'statAdd', stat: 'accuracy', amount: 85, targetIds: ['trebuchet'] }],
    unique: true,
    icon: 'icon/tech/ludgar',
  },

  // ----------------------------------------------- Norse unique techs (castle)
  shieldWall: {
    id: 'shieldWall', name: 'Shield Wall', age: 'castle',
    researchedAt: ['castle'], cost: { food: 350, gold: 200 }, researchTime: 45,
    effects: [{ kind: 'statAdd', stat: 'armorPierce', amount: 1, targetClasses: ['infantry'] }],
    unique: true,
    icon: 'icon/tech/chainMailArmor',
  },
  jarlsLevy: {
    id: 'jarlsLevy', name: 'Jarl’s Levy', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 650, gold: 450 }, researchTime: 55,
    effects: [{ kind: 'statMult', stat: 'trainTime', percent: -25, targetClasses: ['infantry'] }],
    unique: true,
    icon: 'icon/tech/championUpgrade',
  },

  // ---------------------------------------------- French unique techs (castle)
  oriflamme: {
    id: 'oriflamme', name: 'Oriflamme', age: 'castle',
    researchedAt: ['castle'], cost: { food: 450, gold: 300 }, researchTime: 45,
    effects: [{ kind: 'statAdd', stat: 'attack', amount: 2, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/ironCasting',
  },
  compagniesOrdonnance: {
    id: 'compagniesOrdonnance', name: 'Compagnies d’Ordonnance', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 800, gold: 600 }, researchTime: 60,
    effects: [{ kind: 'statMult', stat: 'trainTime', percent: -25, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/cavalierUpgrade',
  },

  // ---------------------------------------------- Mongol unique techs (castle)
  nomadRemounts: {
    id: 'nomadRemounts', name: 'Nomad Remounts', age: 'castle',
    researchedAt: ['castle'], cost: { food: 400, gold: 250 }, researchTime: 45,
    effects: [{ kind: 'statMult', stat: 'hp', percent: 15, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/lightCavalryUpgrade',
  },
  steppeTactics: {
    id: 'steppeTactics', name: 'Steppe Tactics', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 700, gold: 550 }, researchTime: 60,
    effects: [{ kind: 'statMult', stat: 'rof', percent: -20, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/bracer',
  },

  // ------------------------------------------- Byzantine unique techs (castle)
  themeSystem: {
    id: 'themeSystem', name: 'Theme System', age: 'castle',
    researchedAt: ['castle'], cost: { food: 350, gold: 250 }, researchTime: 45,
    effects: [{
      kind: 'costMult', percent: -15,
      targetIds: ['spearman', 'pikeman', 'skirmisher', 'eliteSkirmisher'],
    }],
    unique: true,
    icon: 'icon/tech/pikemanUpgrade',
  },
  lamellarBarding: {
    id: 'lamellarBarding', name: 'Lamellar Barding', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 700, gold: 500 }, researchTime: 60,
    effects: [{ kind: 'statAdd', stat: 'armorPierce', amount: 2, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/plateBardingArmor',
  },

  // --------------------------------------------- Saracen unique techs (castle)
  furusiyya: {
    id: 'furusiyya', name: 'Furusiyya', age: 'castle',
    researchedAt: ['castle'], cost: { food: 450, gold: 300 }, researchTime: 45,
    effects: [{ kind: 'statMult', stat: 'hp', percent: 20, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/chainBardingArmor',
  },
  desertLogistics: {
    id: 'desertLogistics', name: 'Desert Logistics', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 700, gold: 450 }, researchTime: 55,
    effects: [{ kind: 'costMult', percent: -15, targetClasses: ['cavalry'] }],
    unique: true,
    icon: 'icon/tech/cavalierUpgrade',
  },

  // -------------------------------------------------- elite unique upgrades
  eliteHighlandRaiderUpgrade: {
    id: 'eliteHighlandRaiderUpgrade', name: 'Elite Highland Raider', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 1000, gold: 800 }, researchTime: 45,
    effects: [{ kind: 'upgradeUnit', from: 'highlandRaider', to: 'eliteHighlandRaider' }],
    unique: true,
    icon: 'icon/tech/eliteHighlandRaiderUpgrade',
  },
  eliteLongbowmanUpgrade: {
    id: 'eliteLongbowmanUpgrade', name: 'Elite Longbowman', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 850, gold: 850 }, researchTime: 60,
    effects: [{ kind: 'upgradeUnit', from: 'longbowman', to: 'eliteLongbowman' }],
    unique: true,
    icon: 'icon/tech/eliteLongbowmanUpgrade',
  },
  eliteHousecarlUpgrade: {
    id: 'eliteHousecarlUpgrade', name: 'Elite Housecarl', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 900, gold: 700 }, researchTime: 50,
    effects: [{ kind: 'upgradeUnit', from: 'housecarl', to: 'eliteHousecarl' }],
    unique: true,
    icon: 'icon/tech/championUpgrade',
  },
  eliteChevalierUpgrade: {
    id: 'eliteChevalierUpgrade', name: 'Elite Chevalier', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 1100, gold: 900 }, researchTime: 70,
    effects: [{ kind: 'upgradeUnit', from: 'chevalier', to: 'eliteChevalier' }],
    unique: true,
    icon: 'icon/tech/paladinUpgrade',
  },
  eliteMangudaiUpgrade: {
    id: 'eliteMangudaiUpgrade', name: 'Elite Kheshig Horse Archer', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 900, gold: 700 }, researchTime: 60,
    effects: [{ kind: 'upgradeUnit', from: 'mangudai', to: 'eliteMangudai' }],
    unique: true,
    icon: 'icon/tech/eliteSkirmisherUpgrade',
  },
  eliteCataphractUpgrade: {
    id: 'eliteCataphractUpgrade', name: 'Elite Cataphract', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 1100, gold: 800 }, researchTime: 65,
    effects: [{ kind: 'upgradeUnit', from: 'cataphract', to: 'eliteCataphract' }],
    unique: true,
    icon: 'icon/tech/cavalierUpgrade',
  },
  eliteMamlukUpgrade: {
    id: 'eliteMamlukUpgrade', name: 'Elite Mamluk', age: 'imperial',
    researchedAt: ['castle'], cost: { food: 950, gold: 750 }, researchTime: 60,
    effects: [{ kind: 'upgradeUnit', from: 'mamluk', to: 'eliteMamluk' }],
    unique: true,
    icon: 'icon/tech/cavalierUpgrade',
  },
};
