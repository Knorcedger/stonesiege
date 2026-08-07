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
}

const BASE: Record<BotDifficulty, Tuning> = {
  easy: {
    interval: 60, batchCap: 4, villagerTarget: 14, ageUpVillagers: 14, farmTarget: 4, maxAge: 'feudal',
    research: false, counters: 0, openingArmy: 8, attackArmy: 8, regroupArmy: 3, waveReissue: 600,
    waveCooldown: 1200, raidEco: false, constantPressure: false, counterattackOnly: false,
    neverAttack: false, towers: false, walls: false, stoneMiners: 0, secondTc: false,
    market: false, monks: false, siege: false, multiFront: false, resignEarly: true,
    maxFoundations: 2, barracksAt: 9, minArmyBeforeAgeUp: 0, armyCap: 12, trainCooldown: 600,
    darkMilitia: 3,
  },
  standard: {
    // ageUpVillagers 14 (was 15): with dark-age militia capped, the feudal climb is
    // bank-limited — the extra dark villagers pushed standard BEHIND easy to Feudal.
    // villagerTarget 22 (was 18): real practice games run popCap 100, and an 18-vil
    // economy could not sustain wave replacement — hour-long attrition stalemates
    // (AOE2_REFERENCE: ~25-30 villagers by Castle is the human norm).
    interval: 30, batchCap: 8, villagerTarget: 22, ageUpVillagers: 14, farmTarget: 8, maxAge: 'castle',
    research: true, counters: 1, openingArmy: 12, attackArmy: 12, regroupArmy: 4, waveReissue: 600,
    waveCooldown: 1200, raidEco: false, constantPressure: false, counterattackOnly: false,
    // towers: cheap standing defense — banking an age-up through harassment is
    // impossible when every raid must be answered with freshly-paid soldiers
    neverAttack: false, towers: true, walls: false, stoneMiners: 1, secondTc: false,
    market: false, monks: false, siege: true, multiFront: false, resignEarly: false,
    maxFoundations: 2, barracksAt: 9, minArmyBeforeAgeUp: 0, armyCap: 999, trainCooldown: 0,
    darkMilitia: 2,
  },
  // hard tops out at Castle: there is no Imperial building script yet, so saving for
  // Imperial would deadlock the army economy behind the age-up piggy bank
  hard: {
    // ageUpVillagers 12 (was 16, then 14): the boom ceiling (villagerTarget) is
    // untouched — this only starts the Feudal bank earlier. Together with
    // darkMilitia 0 and no dark gold miners (economy skips them when no dark
    // militia will spend the gold), every dark-age hand gathers the Feudal bank:
    // hard is the FASTEST up, not the slowest. (At 14 hard still trailed easy to
    // Feudal by ~3 minutes on the same map — headless seed-12 measurement.)
    // Hard used to out-boom Standard but wait for a 16-unit ball before its
    // first attack (25:42 in the seed-12 idle-player probe). A human could boom
    // untouched and meet that single late army fully prepared. A four-unit opening raid,
    // tighter regrouping, and persistent pressure make its tempo challenging;
    // its superior economy/counters still scale those attacks into the late game.
    interval: 14, batchCap: 12, villagerTarget: 28, ageUpVillagers: 12, farmTarget: 9, maxAge: 'castle',
    research: true, counters: 2, openingArmy: 4, attackArmy: 10, regroupArmy: 4, waveReissue: 300,
    waveCooldown: 300, raidEco: false, constantPressure: true, counterattackOnly: false,
    neverAttack: false, towers: true, walls: false, stoneMiners: 1, secondTc: true,
    market: true, monks: true, siege: true, multiFront: true, resignEarly: false,
    // Field the first pressure wave before opening the Castle-Age piggy bank;
    // otherwise the bank freezes military production from Feudal until ~25 min.
    maxFoundations: 3, barracksAt: 9, minArmyBeforeAgeUp: 4, armyCap: 999, trainCooldown: 0,
    darkMilitia: 0,
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
