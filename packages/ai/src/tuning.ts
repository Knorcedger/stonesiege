// Difficulty × profile tuning matrix. A Tuning is pure data — the managers read it
// every decision pass, so applyAiProfile can swap it mid-match without other state.

import type { AgeId } from '@bf/sim/types';
import type { AiProfile, BotDifficulty } from './types';

export interface Tuning {
  /** Ticks between decision batches — the APM throttle (20 ticks = 1 s). */
  interval: number;
  /** Max commands per decision batch (keeps the bot's hands human). */
  batchCap: number;
  /** Boom ceiling: the TC keeps training villagers toward this all game. */
  villagerTarget: number;
  /**
   * Age-up trigger: saving starts once peak villagers reach THIS early count.
   * Decoupled from villagerTarget — the boom continues during and after the climb
   * (gating the age-up on the full boom target made hard the SLOWEST to Feudal).
   */
  ageUpVillagers: number;
  /** Feudal boom pause: upper tiers stop adding workers briefly to fund their opening army. */
  feudalVillagerTarget: number;
  farmTarget: number;
  maxAge: AgeId;
  /** Eco/blacksmith/line-upgrade research on. */
  research: boolean;
  /** 0 = no counters (easy), 1 = counter only strong skews, 2 = full counter comps. */
  counters: 0 | 1 | 2;
  /** Smaller first-wave threshold; normally equal to attackArmy, lower on Hard. */
  openingArmy: number;
  /** Military size that launches an attack wave. */
  attackArmy: number;
  /** A wave collapses (retreat + regroup) below this. */
  regroupArmy: number;
  /** Re-issue wave orders every N ticks (fresh troops join, next objective picked). */
  waveReissue: number;
  /** Ticks to wait after a collapsed wave before massing again (0 = none). */
  waveCooldown: number;
  /** Raider: waves hunt villagers and eco buildings first. */
  raidEco: boolean;
  /** Aggressive: no cooldown, low threshold, always another wave. */
  constantPressure: boolean;
  /** Defender: only attacks inside the window after repelling a raid. */
  counterattackOnly: boolean;
  /** Passive: never launches waves (still defends; attackNow overrides). */
  neverAttack: boolean;
  towers: boolean;
  walls: boolean;
  /** Villagers on stone once Feudal (towers/walls/2nd TC need it). */
  stoneMiners: number;
  secondTc: boolean;
  market: boolean;
  monks: boolean;
  siege: boolean;
  multiFront: boolean;
  /** GDD: easy bots resign when hopeless instead of dragging the game out. */
  resignEarly: boolean;
  maxFoundations: number;
  /** Barracks goes up at this villager count (raider drops it for the early rush). */
  barracksAt: number;
  /**
   * Age-up saving waits until this many military have existed. Dark Age ignores
   * this unless raidEco is enabled (raiders rush before Feudal); normal Hard
   * uses it to field a Feudal pressure wave before banking for Castle.
   */
  minArmyBeforeAgeUp: number;
  /**
   * Dark-age militia cap for non-rush profiles (threat at the base overrides it).
   * Dark militia are a TAX on the Feudal bank: hard trains NONE (its tempo edge —
   * hard must be the FASTEST up the ages), standard a token pair, easy a beatable
   * trio. Raiders (raidEco) rush by design and ignore the cap entirely.
   */
  darkMilitia: number;
  /** Stop training units once this many are alive (easy fields small, beatable armies). */
  armyCap: number;
  /** Min ticks between army unit trainings (easy trickles; 0 = production-limited). */
  trainCooldown: number;
  /** Per-unit safety buffers; upper tiers spend leaner to turn income into pressure. */
  unitFoodBuffer: number;
  unitWoodBuffer: number;
  unitGoldBuffer: number;
}

const BASE: Record<BotDifficulty, Tuning> = {
  beginner: {
    interval: 90, batchCap: 3, villagerTarget: 12, ageUpVillagers: 10, feudalVillagerTarget: 12, farmTarget: 3, maxAge: 'feudal',
    research: false, counters: 0, openingArmy: 10, attackArmy: 10, regroupArmy: 2, waveReissue: 900,
    waveCooldown: 1800, raidEco: false, constantPressure: false, counterattackOnly: false,
    neverAttack: false, towers: false, walls: false, stoneMiners: 0, secondTc: false,
    market: false, monks: false, siege: false, multiFront: false, resignEarly: true,
    maxFoundations: 1, barracksAt: 10, minArmyBeforeAgeUp: 0, armyCap: 8, trainCooldown: 900,
    darkMilitia: 2, unitFoodBuffer: 60, unitWoodBuffer: 90, unitGoldBuffer: 30,
  },
  easy: {
    interval: 60, batchCap: 4, villagerTarget: 14, ageUpVillagers: 14, feudalVillagerTarget: 14, farmTarget: 4, maxAge: 'feudal',
    research: false, counters: 0, openingArmy: 8, attackArmy: 8, regroupArmy: 3, waveReissue: 600,
    waveCooldown: 1200, raidEco: false, constantPressure: false, counterattackOnly: false,
    neverAttack: false, towers: false, walls: false, stoneMiners: 0, secondTc: false,
    market: false, monks: false, siege: false, multiFront: false, resignEarly: true,
    maxFoundations: 2, barracksAt: 9, minArmyBeforeAgeUp: 0, armyCap: 12, trainCooldown: 600,
    darkMilitia: 3, unitFoodBuffer: 40, unitWoodBuffer: 60, unitGoldBuffer: 20,
  },
  standard: {
    // ageUpVillagers 14 (was 15): with dark-age militia capped, the feudal climb is
    // bank-limited — the extra dark villagers pushed standard BEHIND easy to Feudal.
    // villagerTarget 22 (was 18): real practice games run popCap 100, and an 18-vil
    // economy could not sustain wave replacement — hour-long attrition stalemates
    // (AOE2_REFERENCE: ~25-30 villagers by Castle is the human norm).
    interval: 30, batchCap: 8, villagerTarget: 22, ageUpVillagers: 14, feudalVillagerTarget: 22, farmTarget: 8, maxAge: 'castle',
    research: true, counters: 1, openingArmy: 12, attackArmy: 12, regroupArmy: 4, waveReissue: 600,
    waveCooldown: 1200, raidEco: false, constantPressure: false, counterattackOnly: false,
    // towers: cheap standing defense — banking an age-up through harassment is
    // impossible when every raid must be answered with freshly-paid soldiers
    neverAttack: false, towers: true, walls: false, stoneMiners: 1, secondTc: false,
    market: false, monks: false, siege: true, multiFront: false, resignEarly: false,
    maxFoundations: 2, barracksAt: 9, minArmyBeforeAgeUp: 0, armyCap: 999, trainCooldown: 0,
    darkMilitia: 2, unitFoodBuffer: 40, unitWoodBuffer: 60, unitGoldBuffer: 20,
  },
  // The former three-choice Hard preset is now Medium. Keeping these exact values
  // makes the user's assessment concrete and gives the new upper tiers room to grow.
  medium: {
    interval: 14, batchCap: 12, villagerTarget: 28, ageUpVillagers: 12, feudalVillagerTarget: 24, farmTarget: 9, maxAge: 'castle',
    research: true, counters: 2, openingArmy: 4, attackArmy: 10, regroupArmy: 4, waveReissue: 300,
    waveCooldown: 300, raidEco: false, constantPressure: true, counterattackOnly: false,
    neverAttack: false, towers: true, walls: false, stoneMiners: 1, secondTc: true,
    market: true, monks: true, siege: true, multiFront: true, resignEarly: false,
    // Field the first pressure wave before opening the Castle-Age piggy bank;
    // otherwise the bank freezes military production from Feudal until ~25 min.
    maxFoundations: 3, barracksAt: 9, minArmyBeforeAgeUp: 4, armyCap: 999, trainCooldown: 0,
    darkMilitia: 0, unitFoodBuffer: 40, unitWoodBuffer: 60, unitGoldBuffer: 20,
  },
  // Upper tiers remain Castle-capped until the Imperial build script exists, but
  // scale real controller skill: reaction rate, parallel actions, economy size,
  // opening timing, reinforcement cadence, production, counters, siege and flanks.
  hard: {
    interval: 10, batchCap: 16, villagerTarget: 32, ageUpVillagers: 12, feudalVillagerTarget: 18, farmTarget: 11, maxAge: 'castle',
    research: true, counters: 2, openingArmy: 2, attackArmy: 10, regroupArmy: 2, waveReissue: 240,
    waveCooldown: 120, raidEco: false, constantPressure: true, counterattackOnly: false,
    neverAttack: false, towers: true, walls: false, stoneMiners: 2, secondTc: true,
    market: true, monks: true, siege: true, multiFront: true, resignEarly: false,
    maxFoundations: 4, barracksAt: 8, minArmyBeforeAgeUp: 2, armyCap: 999, trainCooldown: 0,
    darkMilitia: 0, unitFoodBuffer: 10, unitWoodBuffer: 20, unitGoldBuffer: 0,
  },
  expert: {
    interval: 6, batchCap: 24, villagerTarget: 36, ageUpVillagers: 11, feudalVillagerTarget: 17, farmTarget: 13, maxAge: 'castle',
    research: true, counters: 2, openingArmy: 2, attackArmy: 12, regroupArmy: 2, waveReissue: 180,
    waveCooldown: 0, raidEco: false, constantPressure: true, counterattackOnly: false,
    neverAttack: false, towers: true, walls: false, stoneMiners: 2, secondTc: true,
    market: true, monks: true, siege: true, multiFront: true, resignEarly: false,
    maxFoundations: 5, barracksAt: 7, minArmyBeforeAgeUp: 2, armyCap: 999, trainCooldown: 0,
    darkMilitia: 0, unitFoodBuffer: 5, unitWoodBuffer: 10, unitGoldBuffer: 0,
  },
  hardcore: {
    interval: 3, batchCap: 36, villagerTarget: 40, ageUpVillagers: 10, feudalVillagerTarget: 16, farmTarget: 15, maxAge: 'castle',
    research: true, counters: 2, openingArmy: 3, attackArmy: 14, regroupArmy: 3, waveReissue: 120,
    waveCooldown: 0, raidEco: false, constantPressure: true, counterattackOnly: false,
    neverAttack: false, towers: true, walls: false, stoneMiners: 3, secondTc: true,
    market: true, monks: true, siege: true, multiFront: true, resignEarly: false,
    maxFoundations: 6, barracksAt: 6, minArmyBeforeAgeUp: 2, armyCap: 999, trainCooldown: 0,
    darkMilitia: 0, unitFoodBuffer: 0, unitWoodBuffer: 0, unitGoldBuffer: 0,
  },
};

export function tuningFor(difficulty: BotDifficulty, profile: AiProfile): Tuning {
  const t: Tuning = { ...BASE[difficulty] };
  switch (profile) {
    case 'passive':
      t.neverAttack = true;
      break;
    case 'defender':
      t.counterattackOnly = true;
      t.towers = true;
      t.walls = true;
      t.stoneMiners = Math.max(2, t.stoneMiners);
      break;
    case 'raider':
      // early small waves at the enemy economy: rush posture — a lean villager
      // line, barracks first, and NO age-saving until the raid party exists
      // (the feudal piggy bank otherwise freezes militia until it's far too late)
      t.attackArmy = Math.max(4, Math.floor(t.attackArmy / 3));
      t.openingArmy = t.attackArmy;
      t.regroupArmy = 2;
      t.raidEco = true;
      t.waveReissue = 400;
      t.waveCooldown = Math.min(t.waveCooldown, 600);
      t.barracksAt = 5; // drush posture: barracks before the 6th villager (~7-8 min raid)
      t.villagerTarget = Math.min(t.villagerTarget, 16);
      t.ageUpVillagers = Math.min(t.ageUpVillagers, 14);
      t.minArmyBeforeAgeUp = t.attackArmy;
      break;
    case 'aggressive':
      // constant pressure: smaller waves, no pause between them
      t.attackArmy = Math.max(5, Math.floor(t.attackArmy / 2));
      t.openingArmy = Math.min(t.openingArmy, t.attackArmy);
      t.regroupArmy = 2;
      t.constantPressure = true;
      t.waveCooldown = 0;
      break;
    case 'standard':
      break;
  }
  return t;
}
