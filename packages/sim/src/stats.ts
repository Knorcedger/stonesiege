// Per-player stat resolution. Base defs from @bf/data are NEVER mutated; every stat read
// goes through resolveUnitStats, which merges the base def with the player's modifier
// table. Wave 1 populates the table from civ passive bonuses (age-gated); wave-2 tech
// effects append to the same structure.

import { gameData } from '@bf/data';
import type { ArmorClass, BuildingDef, ClassValue, GatherTask, StatKey, UnitDef } from '@bf/data';
import { AGES, FP, TICKS_PER_SECOND } from './types';
import type { AgeId, Stockpile } from './types';
import type { SimState } from './internal';

export interface StatAddMod {
  stat: StatKey; amount: number; targetClasses?: ArmorClass[]; targetIds?: string[];
}
export interface StatMultMod {
  stat: StatKey; percent: number; targetClasses?: ArmorClass[]; targetIds?: string[];
}
export interface GatherMultMod { task: GatherTask; percent: number }
export interface CostMultMod { percent: number; targetClasses?: ArmorClass[]; targetIds?: string[] }
export interface BonusDamageMod {
  vs: ArmorClass; amount: number; targetClasses?: ArmorClass[]; targetIds?: string[];
}

/** Mutable per-player modifier table. Tech effects (wave 2) push into these arrays. */
export interface PlayerModifierTable {
  statAdd: StatAddMod[];
  statMult: StatMultMod[];
  gatherMult: GatherMultMod[];
  costMult: CostMultMod[];
  bonusDamage: BonusDamageMod[];
}

export interface ResolvedUnitStats {
  defId: string;
  hp: number;
  /** Tiles/second after modifiers (reference value; sim consumes speedFp). */
  speed: number;
  /** Fixed-point units moved per tick (integer). */
  speedFp: number;
  los: number; // tiles, integer
  range: number;
  trainTimeTicks: number;
  pop: number;
  cost: Stockpile; // integers, after cost modifiers
  gather: Partial<Record<GatherTask, number>>; // resource/second after gather modifiers
  /** Carry capacity per task (integers, after carryCapacity modifiers — Wheelbarrow line). */
  carry: Partial<Record<GatherTask, number>>;
  // --- combat (wave 2b) ---
  /** Attack entries after tech mods: base melee/pierce first, then bonus-vs-class. */
  attacks: ClassValue[];
  /** Armor entries after tech mods (melee + pierce + class armors). */
  armor: ClassValue[];
  rofTicks: number;
  accuracy: number; // 0..100 after mods (melee = 100)
  minRange: number; // tiles after mods (Murder Holes can shrink it), >= 0
  conversionResist: number; // 0..100 after mods (Faith)
  /** Fixed units the projectile travels per tick (0 = melee). */
  projectileSpeedFpPerTick: number;
  /** Splash radius in fixed units (0 = none). */
  areaRadiusFp: number;
}

/** Per-player resolved stats for buildings that fight or get fought (armor/attack techs). */
export interface ResolvedBuildingStats {
  defId: string;
  hp: number;
  attacks: ClassValue[];
  armor: ClassValue[];
  range: number;
  minRange: number;
  rofTicks: number;
  los: number;
  arrowsBase: number;
  arrowsPerGarrison: number;
  arrowsMax: number;
  projectileSpeedFpPerTick: number;
}

const emptyTable = (): PlayerModifierTable =>
  ({ statAdd: [], statMult: [], gatherMult: [], costMult: [], bonusDamage: [] });

const ageIndex = (age: AgeId): number => AGES.indexOf(age);

/**
 * Build a player's modifier table from their civ's passive bonuses, honoring fromAge
 * gates against the player's current age. Called at game start and again on age-up
 * (wave 2), then extended by tech effects.
 */
export function buildModifierTable(civId: string, currentAge: AgeId): PlayerModifierTable {
  const table = emptyTable();
  const civ = gameData.civs[civId];
  if (!civ) return table;
  const ageIdx = ageIndex(currentAge);
  for (const bonus of civ.bonuses) {
    if (bonus.fromAge !== undefined && ageIndex(bonus.fromAge) > ageIdx) continue;
    const e = bonus.effect;
    switch (e.kind) {
      case 'statAdd':
        table.statAdd.push({ stat: e.stat, amount: e.amount, targetClasses: e.targetClasses, targetIds: e.targetIds });
        break;
      case 'statMult':
        table.statMult.push({ stat: e.stat, percent: e.percent, targetClasses: e.targetClasses, targetIds: e.targetIds });
        break;
      case 'gatherMult':
        table.gatherMult.push({ task: e.task, percent: e.percent });
        break;
      case 'costMult':
        table.costMult.push({ percent: e.percent, targetClasses: e.targetClasses, targetIds: e.targetIds });
        break;
      case 'bonusDamage':
        table.bonusDamage.push({ vs: e.vs, amount: e.amount, targetClasses: e.targetClasses, targetIds: e.targetIds });
        break;
      default:
        break; // enable/upgrade/age/ballistics effects are handled by the tech engine
    }
  }
  return table;
}

/** Anything with an id + armor-class memberships (unit or building defs). */
interface Targetable { id: string; classes: ArmorClass[] }

function matches(def: Targetable, targetClasses?: ArmorClass[], targetIds?: string[]): boolean {
  if (!targetClasses && !targetIds) return true;
  if (targetIds && targetIds.includes(def.id)) return true;
  if (targetClasses) {
    for (const c of targetClasses) if (def.classes.includes(c)) return true;
  }
  return false;
}

function applyStat(table: PlayerModifierTable, def: Targetable, stat: StatKey, base: number): number {
  let v = base;
  for (const m of table.statAdd) {
    if (m.stat === stat && matches(def, m.targetClasses, m.targetIds)) v += m.amount;
  }
  for (const m of table.statMult) {
    if (m.stat === stat && matches(def, m.targetClasses, m.targetIds)) v = (v * (100 + m.percent)) / 100;
  }
  return v;
}

/** Copy of `attacks` with 'attack' statAdds on the base entry + bonusDamage entries merged. */
function resolveAttacks(table: PlayerModifierTable, def: Targetable, attacks: ClassValue[]): ClassValue[] {
  const out = attacks.map((a) => ({ cls: a.cls, amount: a.amount }));
  if (out.length > 0 && (out[0].cls === 'melee' || out[0].cls === 'pierce')) {
    out[0].amount = Math.round(applyStat(table, def, 'attack', out[0].amount));
  }
  for (const m of table.bonusDamage) {
    if (!matches(def, m.targetClasses, m.targetIds)) continue;
    const entry = out.find((a) => a.cls === m.vs);
    if (entry) entry.amount += m.amount;
    else out.push({ cls: m.vs, amount: m.amount });
  }
  return out;
}

/** Copy of `armor` with armorMelee/armorPierce statAdds folded onto the base entries. */
function resolveArmor(table: PlayerModifierTable, def: Targetable, armor: ClassValue[]): ClassValue[] {
  const out = armor.map((a) => ({ cls: a.cls, amount: a.amount }));
  for (const a of out) {
    if (a.cls === 'melee') a.amount = Math.round(applyStat(table, def, 'armorMelee', a.amount));
    else if (a.cls === 'pierce') a.amount = Math.round(applyStat(table, def, 'armorPierce', a.amount));
  }
  return out;
}

const clampPct = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

const projFpPerTick = (tilesPerSecond: number | undefined): number =>
  tilesPerSecond ? Math.max(1, Math.round(tilesPerSecond * FP / TICKS_PER_SECOND)) : 0;

/** Resolve a unit def's wave-1 stats for a player (cached until modifiers change). */
export function resolveUnitStats(state: SimState, player: number, defId: string): ResolvedUnitStats {
  const key = `${player}:${defId}`;
  const cached = state.statsCache.get(key);
  if (cached) return cached;

  const def = gameData.units[defId];
  if (!def) throw new Error(`resolveUnitStats: unknown unit def '${defId}'`);
  const table = state.modifiers[player] ?? emptyTable();

  const speed = applyStat(table, def, 'speed', def.speed);
  const cost: Stockpile = { food: 0, wood: 0, gold: 0, stone: 0 };
  let costScale = 100;
  for (const m of table.costMult) {
    if (matches(def, m.targetClasses, m.targetIds)) costScale = (costScale * (100 + m.percent)) / 100;
  }
  cost.food = Math.round((def.cost.food ?? 0) * costScale / 100);
  cost.wood = Math.round((def.cost.wood ?? 0) * costScale / 100);
  cost.gold = Math.round((def.cost.gold ?? 0) * costScale / 100);
  cost.stone = Math.round((def.cost.stone ?? 0) * costScale / 100);

  const gather: Partial<Record<GatherTask, number>> = {};
  const carry: Partial<Record<GatherTask, number>> = {};
  if (def.gather) {
    for (const task of Object.keys(def.gather) as GatherTask[]) {
      let rate = def.gather[task] ?? 0;
      for (const m of table.gatherMult) {
        if (m.task === task) rate = (rate * (100 + m.percent)) / 100;
      }
      gather[task] = rate;
      const baseCarry = typeof def.carryCapacity === 'number'
        ? def.carryCapacity
        : def.carryCapacity?.[task];
      if (baseCarry !== undefined) {
        carry[task] = Math.max(1, Math.round(applyStat(table, def, 'carryCapacity', baseCarry)));
      }
    }
  }

  const resolved: ResolvedUnitStats = {
    defId,
    hp: Math.round(applyStat(table, def, 'hp', def.hp)),
    speed,
    speedFp: Math.max(1, Math.round(speed * FP / TICKS_PER_SECOND)),
    los: Math.max(0, Math.round(applyStat(table, def, 'los', def.los))),
    range: applyStat(table, def, 'range', def.range),
    trainTimeTicks: Math.max(1, Math.round(applyStat(table, def, 'trainTime', def.trainTime) * TICKS_PER_SECOND)),
    pop: def.pop ?? 1,
    cost,
    gather,
    carry,
    attacks: resolveAttacks(table, def, def.attacks),
    armor: resolveArmor(table, def, def.armor),
    rofTicks: Math.max(1, Math.round(applyStat(table, def, 'rof', def.rof) * TICKS_PER_SECOND)),
    accuracy: clampPct(applyStat(table, def, 'accuracy', def.accuracy ?? 100)),
    minRange: Math.max(0, Math.round(applyStat(table, def, 'minRange', def.minRange ?? 0))),
    conversionResist: clampPct(applyStat(table, def, 'conversionResist', def.conversionResist ?? 0)),
    projectileSpeedFpPerTick: projFpPerTick(def.projectileSpeed),
    areaRadiusFp: def.areaRadius ? Math.round(def.areaRadius * FP) : 0,
  };
  state.statsCache.set(key, resolved);
  return resolved;
}

/** Resolve a building def's combat-relevant stats for a player (cached like units). */
export function resolveBuildingStats(state: SimState, player: number, defId: string): ResolvedBuildingStats {
  const key = `${player}:${defId}`;
  const cached = state.buildingStatsCache.get(key);
  if (cached) return cached;

  const def = gameData.buildings[defId];
  if (!def) throw new Error(`resolveBuildingStats: unknown building def '${defId}'`);
  const table = state.modifiers[player] ?? emptyTable();

  const resolved: ResolvedBuildingStats = {
    defId,
    hp: Math.max(1, Math.round(applyStat(table, def, 'hp', def.hp))),
    attacks: resolveAttacks(table, def, def.attacks ?? []),
    armor: resolveArmor(table, def, def.armor),
    range: applyStat(table, def, 'range', def.range ?? 0),
    minRange: Math.max(0, Math.round(applyStat(table, def, 'minRange', def.minRange ?? 0))),
    rofTicks: Math.max(1, Math.round(applyStat(table, def, 'rof', def.rof ?? 1) * TICKS_PER_SECOND)),
    los: Math.max(0, Math.round(applyStat(table, def, 'los', def.los ?? def.range ?? 4))),
    arrowsBase: def.arrowsBase ?? 1,
    arrowsPerGarrison: def.arrowsPerGarrison ?? 0,
    arrowsMax: def.arrowsMax ?? def.arrowsBase ?? 1,
    projectileSpeedFpPerTick: projFpPerTick(def.projectileSpeed),
  };
  state.buildingStatsCache.set(key, resolved);
  return resolved;
}

/**
 * Total food a farm provides for this player: base def.providesFood plus 'farmFood'
 * modifiers (Horse Collar line techs push these in wave 2). Buildings have no armor
 * classes, so only untargeted farmFood modifiers apply.
 */
export function resolveFarmFood(state: SimState, player: number, def: BuildingDef): number {
  let v = def.providesFood ?? 0;
  const table = state.modifiers[player];
  if (!table) return Math.max(0, Math.round(v));
  for (const m of table.statAdd) {
    if (m.stat === 'farmFood' && !m.targetClasses && !m.targetIds) v += m.amount;
  }
  for (const m of table.statMult) {
    if (m.stat === 'farmFood' && !m.targetClasses && !m.targetIds) v = (v * (100 + m.percent)) / 100;
  }
  return Math.max(0, Math.round(v));
}

/** Invalidate the stats caches for one player (call after modifying their table). */
export function invalidateStats(state: SimState, player: number): void {
  const prefix = `${player}:`;
  for (const key of [...state.statsCache.keys()]) {
    if (key.startsWith(prefix)) state.statsCache.delete(key);
  }
  for (const key of [...state.buildingStatsCache.keys()]) {
    if (key.startsWith(prefix)) state.buildingStatsCache.delete(key);
  }
}
