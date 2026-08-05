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
/** A local raid alarm covers the whole settlement around the struck entity. */
export const RAID_SHELTER_RADIUS_TILES = 12;

function garrisonRoom(state: SimState, b: Entity): number {
  if (b.kind !== 'building' || b.hp <= 0) return 0;
  if ((b.buildProgress ?? 1000) < 1000) return 0;
  const def = gameData.buildings[b.defId];
  // "TC/tower" per GDD == defensive buildings: garrison capacity + an attack of their own
  if (!def?.garrisonCapacity || !def.attacks || def.attacks.length === 0) return 0;
  return def.garrisonCapacity - (b.garrison?.length ?? 0);
}

/** Room still available after accounting for villagers already running there. */
function unreservedGarrisonRoom(state: SimState, b: Entity): number {
  let reserved = 0;
  for (const f of state.fleeing.values()) if (f.buildingId === b.id) reserved++;
  return garrisonRoom(state, b) - reserved;
}

function nearestShelterWithRoom(state: SimState, villager: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of state.entities.values()) {
    if (b.player !== villager.player || unreservedGarrisonRoom(state, b) <= 0) continue;
    const dx = b.x - villager.x, dy = b.y - villager.y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = b; }
  }
  return best;
}

function beginFlee(state: SimState, villager: Entity, shelter: Entity): void {
  const savedIntent = villager.intent;
  villager.intent = undefined;
  state.gather.delete(villager.id);
  state.buildRetries.delete(villager.id);
  state.fleeing.set(villager.id, { buildingId: shelter.id, retries: 0, savedIntent });
  orderMove(state, [villager.id], shelter.x, shelter.y);
  villager.activity = 'fleeing';
}

/**
 * Damage hook for villagers (called by whatever dealt the hit — wolves today, the
 * combat system in a later wave). Non-villagers ignore it; villagers with no reachable
 * garrison keep their task, per the GDD.
 */
export function onUnitDamaged(state: SimState, victim: Entity, alarmNearby = true): void {
  if (victim.kind !== 'unit' || victim.hp <= 0 || victim.player <= GAIA) return;
  if (victim.garrisonedIn !== undefined) return;
  if (!gameData.units[victim.defId]?.gather) return; // villagers only
  // Treat the hit as a local alarm, not something only the struck worker can
  // perceive. Twelve tiles is roughly four times the old apparent working-side
  // range and comfortably reaches villagers on the opposite side of a 4x4 TC.
  const radius = RAID_SHELTER_RADIUS_TILES * FP;
  const candidates = [...state.entities.values()]
    .filter((e) => e.kind === 'unit' && e.player === victim.player && e.hp > 0
      && e.garrisonedIn === undefined && !state.fleeing.has(e.id) && !state.garrisoning.has(e.id)
      && !!gameData.units[e.defId]?.gather
      && (alarmNearby || e.id === victim.id)
      && (e.x - victim.x) ** 2 + (e.y - victim.y) ** 2 <= radius * radius)
    .sort((a, b) => {
      // The worker actually under fire gets first claim on shelter capacity.
      if (a.id === victim.id) return -1;
      if (b.id === victim.id) return 1;
      const ad = (a.x - victim.x) ** 2 + (a.y - victim.y) ** 2;
      const bd = (b.x - victim.x) ** 2 + (b.y - victim.y) ** 2;
      return ad - bd || a.id - b.id;
    });

  for (const villager of candidates) {
    const shelter = nearestShelterWithRoom(state, villager);
    if (!shelter) break; // no shelter: remaining villagers keep their jobs (GDD)
    beginFlee(state, villager, shelter);
  }
}

/** Put a unit inside a building (shared with the future full garrison system). */
export function garrisonUnit(state: SimState, unit: Entity, building: Entity): void {
  state.motion.delete(unit.id);
  unit.targetId = undefined;
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
      state.motion.delete(id);
      e.targetId = undefined;
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
        e.targetId = undefined;
        if (e.activity === 'fleeing') e.activity = 'idle';
        continue;
      }
      f.retries++;
      orderMove(state, [id], b.x, b.y);
      e.activity = 'fleeing';
    }
  }
}
