// Gaia animal behavior (mapgen wildlife brought to life):
//   - light idle wander for sheep/deer/wolves via SimRng (never Math.random)
//   - sheep are herdable: any player unit with the sheep inside its LOS claims an
//     UNCLAIMED (Gaia) sheep — walk near and it changes owner; claimed sheep stay put
//   - wolves aggro: nearest player unit inside wolf LOS gets chased and bitten
//   - dead huntables are carcasses: they rot at the def decayRate until eaten or gone

import { gameData } from '@bf/data';
import type { UnitDef } from '@bf/data';
import { FP, GAIA, TICKS_PER_SECOND } from './types';
import type { Entity, EntityId, SimEvent } from './types';
import { facingFromDelta, isTileWalkable } from './internal';
import type { SimState } from './internal';
import { resolveUnitStats } from './stats';
import { fogOnSpawn } from './fog';
import { orderMove } from './path';
import { applyHit, meleeDamage } from './damage';
import { ACC_PER_UNIT, RES_SCALE, depleteResource } from './gather';

/** ~once per 8 s per idle animal (1/160 per tick at 20 t/s). */
const WANDER_ODDS_DEN = 160;
/** Max stroll distance in tiles per wander. */
const WANDER_RANGE = 2;
/** Wolves bite within 1.5 tiles. */
const WOLF_BITE_RANGE = FP + FP / 2;
/** Wolves give up the chase past LOS × this. */
const WOLF_LEASH_MULT = 2;
/** Sheep-claim scan radius (coarse query; actual gate is each unit's LOS). */
const CLAIM_QUERY_TILES = 8;

const queryBuf: EntityId[] = [];

function dist2(a: Entity, b: Entity): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Occasional short stroll for an idle animal (deterministic SimRng draws). */
function wander(state: SimState, e: Entity): void {
  if (state.motion.has(e.id) || e.activity !== 'idle') return;
  if (!state.rng.chance(1, WANDER_ODDS_DEN)) return;
  const dx = state.rng.nextRange(-WANDER_RANGE, WANDER_RANGE);
  const dy = state.rng.nextRange(-WANDER_RANGE, WANDER_RANGE);
  if (dx === 0 && dy === 0) return;
  const tx = e.tileX + dx, ty = e.tileY + dy;
  if (!isTileWalkable(state, tx, ty)) return;
  orderMove(state, [e.id], tx * FP + FP / 2, ty * FP + FP / 2);
}

/** Unclaimed (Gaia) sheep: the nearest player unit whose LOS covers it takes ownership. */
function tryClaim(state: SimState, sheep: Entity): void {
  state.unitsGrid.queryCircle(sheep.x, sheep.y, CLAIM_QUERY_TILES * FP, queryBuf);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of queryBuf) {
    const u = state.entities.get(id);
    if (!u || u.kind !== 'unit' || u.player === GAIA || u.hp <= 0) continue;
    if (u.garrisonedIn !== undefined || !gameData.units[u.defId]) continue;
    const dd = dist2(sheep, u);
    const losFp = resolveUnitStats(state, u.player, u.defId).los * FP;
    if (dd > losFp * losFp) continue;
    if (dd < bestD) { bestD = dd; best = u; } // queryCircle is id-sorted: ties keep lowest id
  }
  if (!best) return;
  sheep.player = best.player;
  fogOnSpawn(state, sheep); // claimed herdables scout for their new owner
}

/** Carcass rot: amountLeft trickles away at decayRate; empty carcasses vanish. */
function rot(state: SimState, e: Entity, def: UnitDef, events: SimEvent[]): void {
  if ((e.amountLeft ?? 0) <= 0 || !def.decayRate) return;
  let acc = (state.decayAcc.get(e.id) ?? 0) + Math.round(def.decayRate * RES_SCALE);
  while (acc >= ACC_PER_UNIT && (e.amountLeft ?? 0) > 0) {
    acc -= ACC_PER_UNIT;
    e.amountLeft = (e.amountLeft ?? 0) - 1;
  }
  if ((e.amountLeft ?? 0) <= 0) {
    state.decayAcc.delete(e.id);
    depleteResource(state, e, events); // removes the carcass + resourceDepleted
    return;
  }
  state.decayAcc.set(e.id, acc);
}

/** Wolves chase and bite the nearest player unit inside LOS; otherwise they wander. */
function wolfBehavior(state: SimState, wolf: Entity, def: UnitDef, events: SimEvent[]): void {
  const losFp = resolveUnitStats(state, GAIA, wolf.defId).los * FP;
  const validPrey = (u: Entity | undefined): u is Entity =>
    !!u && u.kind === 'unit' && u.hp > 0 && u.player !== GAIA && u.garrisonedIn === undefined;

  let prey = wolf.targetId !== undefined ? state.entities.get(wolf.targetId) : undefined;
  if (!validPrey(prey) || dist2(wolf, prey) > losFp * WOLF_LEASH_MULT * (losFp * WOLF_LEASH_MULT)) {
    prey = undefined;
  }
  if (!prey) {
    state.unitsGrid.queryCircle(wolf.x, wolf.y, losFp, queryBuf);
    let bestD = Infinity;
    for (const id of queryBuf) {
      const u = state.entities.get(id);
      if (!validPrey(u)) continue;
      const dd = dist2(wolf, u);
      if (dd > losFp * losFp) continue;
      if (dd < bestD) { bestD = dd; prey = u; }
    }
  }
  wolf.targetId = prey?.id;
  if (!prey) {
    if (wolf.activity === 'attacking') wolf.activity = 'idle';
    wander(state, wolf);
    return;
  }
  if (dist2(wolf, prey) <= WOLF_BITE_RANGE * WOLF_BITE_RANGE) {
    state.motion.delete(wolf.id);
    wolf.activity = 'attacking';
    wolf.facing = facingFromDelta(prey.x - wolf.x, prey.y - wolf.y);
    const next = state.animalCd.get(wolf.id) ?? 0;
    if (state.tick >= next) {
      state.animalCd.set(wolf.id, state.tick + Math.max(1, Math.round(def.rof * TICKS_PER_SECOND)));
      applyHit(state, wolf, prey, meleeDamage(def, gameData.units[prey.defId]), events);
    }
    return;
  }
  // chase: (re)aim whenever the walk target went stale
  const m = state.motion.get(wolf.id);
  if (!m || (m.targetX - prey.x) ** 2 + (m.targetY - prey.y) ** 2 > FP * FP) {
    orderMove(state, [wolf.id], prey.x, prey.y);
  }
}

/** Per-tick Gaia pass: rot carcasses, claim sheep, run wolves, wander the rest. */
export function tickAnimals(state: SimState, events: SimEvent[]): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit') continue;
    const def = gameData.units[e.defId];
    if (!def) continue;
    if (e.hp <= 0) { rot(state, e, def, events); continue; } // carcass
    if (e.player === GAIA && def.herdable) {
      tryClaim(state, e); // may change owner — claimed sheep stop wandering below
    }
    if (e.player !== GAIA) continue;
    if (def.attacks.length > 0) { wolfBehavior(state, e, def, events); continue; }
    wander(state, e);
  }
}
