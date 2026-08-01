// Villager flee (GDD combat rules): villagers never auto-engage. When one takes damage
// it runs for the nearest own completed defensive building (TC / tower / castle — any
// building def with garrison room AND its own attack) and garrisons there. With nowhere
// to go it simply keeps its task. The interrupted task is remembered: a flee-garrisoned
// villager is marked `sheltering` (HUD: idle-villager badge) and ungarrison restores its
// pre-flee intent (garrison.ts — the AoE2 return-to-work bell). Only the garrison ENTRY
// lives here; the full garrison system (ungarrison, extra arrows, healing) is garrison.ts.

import { gameData } from '@bf/data';
import { FP, GAIA } from './types';
import type { Entity } from './types';
import { adjacentToFootprint } from './internal';
import type { SimState } from './internal';
import { fogOnDeath } from './fog';
import { orderMove } from './path';

/** Give up fleeing after this many failed approaches (then just stand and cope). */
const FLEE_RETRIES = 4;

function garrisonRoom(state: SimState, b: Entity): number {
  if (b.kind !== 'building' || b.hp <= 0) return 0;
  if ((b.buildProgress ?? 1000) < 1000) return 0;
  const def = gameData.buildings[b.defId];
  // "TC/tower" per GDD == defensive buildings: garrison capacity + an attack of their own
  if (!def?.garrisonCapacity || !def.attacks || def.attacks.length === 0) return 0;
  return def.garrisonCapacity - (b.garrison?.length ?? 0);
}

/**
 * Damage hook for villagers (called by whatever dealt the hit — wolves today, the
 * combat system in a later wave). Non-villagers ignore it; villagers with no reachable
 * garrison keep their task, per the GDD.
 */
export function onUnitDamaged(state: SimState, victim: Entity): void {
  if (victim.kind !== 'unit' || victim.hp <= 0 || victim.player <= GAIA) return;
  if (victim.garrisonedIn !== undefined) return;
  if (!gameData.units[victim.defId]?.gather) return; // villagers only
  if (state.fleeing.has(victim.id)) return; // already running

  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of state.entities.values()) {
    if (b.player !== victim.player || garrisonRoom(state, b) <= 0) continue;
    const dx = b.x - victim.x, dy = b.y - victim.y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = b; }
  }
  if (!best) return; // no shelter: keep the current task (GDD)

  const savedIntent = victim.intent; // remembered for the return-to-work bell
  victim.intent = undefined; // abandon gather/build task
  state.gather.delete(victim.id);
  state.buildRetries.delete(victim.id);
  state.fleeing.set(victim.id, { buildingId: best.id, retries: 0, savedIntent });
  orderMove(state, [victim.id], best.x, best.y);
  victim.activity = 'fleeing';
}

/** Put a unit inside a building (shared with the future full garrison system). */
export function garrisonUnit(state: SimState, unit: Entity, building: Entity): void {
  state.motion.delete(unit.id);
  unit.garrisonedIn = building.id;
  (building.garrison ??= []).push(unit.id);
  unit.activity = 'garrisoned';
  // hidden inside: no soft-body presence, no own LOS stamp (the building sees for it)
  unit.x = building.x;
  unit.y = building.y;
  unit.tileX = Math.floor(building.x / FP);
  unit.tileY = Math.floor(building.y / FP);
  state.unitsGrid.remove(unit.id);
  fogOnDeath(state, unit); // stamp removal only — the unit itself lives on
}

/** Per-tick: fleeing villagers garrison on arrival, re-approach, or give up. */
export function tickFlee(state: SimState): void {
  for (const [id, f] of state.fleeing) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0 || e.garrisonedIn !== undefined) {
      state.fleeing.delete(id);
      continue;
    }
    const b = state.entities.get(f.buildingId);
    if (!b || garrisonRoom(state, b) <= 0) {
      // shelter destroyed or filled up mid-run: stop fleeing, stand
      state.fleeing.delete(id);
      if (e.activity === 'fleeing') e.activity = 'idle';
      continue;
    }
    const size = gameData.buildings[b.defId]?.size ?? 1;
    if (adjacentToFootprint(e, b.tileX, b.tileY, size)) {
      garrisonUnit(state, e, b);
      // sheltering (flee-garrisoned, not an explicit order): the HUD surfaces these in
      // the idle-villager badge, and ungarrison restores the interrupted task
      e.sheltering = true;
      if (f.savedIntent) state.shelterIntents.set(id, f.savedIntent);
      state.fleeing.delete(id);
      continue;
    }
    if (!state.motion.has(id)) {
      if (f.retries >= FLEE_RETRIES) {
        state.fleeing.delete(id);
        if (e.activity === 'fleeing') e.activity = 'idle';
        continue;
      }
      f.retries++;
      orderMove(state, [id], b.x, b.y);
      e.activity = 'fleeing';
    }
  }
}
