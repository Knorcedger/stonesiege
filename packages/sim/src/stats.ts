// Per-player stat resolution. Base defs from @bf/data are NEVER mutated; every stat read
// goes through resolveUnitStats, which merges the base def with the player's modifier
// table. Wave 1 populates the table from civ passive bonuses (age-gated); wave-2 tech
// effects append to the same structure.

import { gameData } from '@bf/data';
import type { ArmorClass, GatherTask, StatKey, UnitDef } from '@bf/data';
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

/** Mutable per-player modifier table. Tech effects (wave 2) push into these arrays. */
export interface PlayerModifierTable {
  statAdd: StatAddMod[];
  statMult: StatMultMod[];
  gatherMult: GatherMultMod[];
  costMult: CostMultMod[];
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
}

const emptyTable = (): PlayerModifierTable =>
  ({ statAdd: [], statMult: [], gatherMult: [], costMult: [] });

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
      default:
        break; // enable/upgrade/age effects are tech-driven (wave 2)
    }
  }
  return table;
}

function matches(def: UnitDef, targetClasses?: ArmorClass[], targetIds?: string[]): boolean {
  if (!targetClasses && !targetIds) return true;
  if (targetIds && targetIds.includes(def.id)) return true;
  if (targetClasses) {
    for (const c of targetClasses) if (def.classes.includes(c)) return true;
  }
  return false;
}

function applyStat(table: PlayerModifierTable, def: UnitDef, stat: StatKey, base: number): number {
  let v = base;
  for (const m of table.statAdd) {
    if (m.stat === stat && matches(def, m.targetClasses, m.targetIds)) v += m.amount;
  }
  for (const m of table.statMult) {
    if (m.stat === stat && matches(def, m.targetClasses, m.targetIds)) v = (v * (100 + m.percent)) / 100;
  }
  return v;
}

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
  if (def.gather) {
    for (const task of Object.keys(def.gather) as GatherTask[]) {
      let rate = def.gather[task] ?? 0;
      for (const m of table.gatherMult) {
        if (m.task === task) rate = (rate * (100 + m.percent)) / 100;
      }
      gather[task] = rate;
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
  };
  state.statsCache.set(key, resolved);
  return resolved;
}

/** Invalidate the stats cache for one player (call after modifying their table). */
export function invalidateStats(state: SimState, player: number): void {
  const prefix = `${player}:`;
  for (const key of [...state.statsCache.keys()]) {
    if (key.startsWith(prefix)) state.statsCache.delete(key);
  }
}
