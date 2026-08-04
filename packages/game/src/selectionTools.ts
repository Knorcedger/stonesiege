// Pure selection helpers for the idle-unit buttons (GDD Mobile UX: idle-villager /
// idle-military top-bar badges) and control-group chips (saved-selection chips).
// No DOM/Pixi so the behavior is unit-testable.

import { GAIA, type Entity, type EntityId, type GameState, type PlayerId } from '@bf/sim/types';
import { gameData } from '@bf/data';

export type IdleCategory = 'villager' | 'military';

/** Public presentation marker for a villager currently answering a Town Bell. */
export function isTownBellSeeking(
  e: Entity,
  player: PlayerId,
  buildingId: EntityId,
): boolean {
  return e.kind === 'unit'
    && e.player === player
    && e.hp > 0
    && e.garrisonedIn === undefined
    && gameData.units[e.defId]?.gather !== undefined
    && e.activity === 'fleeing'
    && e.targetId === buildingId;
}

/**
 * A unit counts as idle when it stands with no activity (GDD: the `.` hotkey set).
 * SHELTERING units (villagers auto-garrisoned by the flee reflex) also count: they are
 * workforce parked in a TC/tower, and without this the badge hides a raid burying the
 * economy — cycling to one centers the camera on its shelter, whose ungarrison button
 * is the return-to-work bell. Explicitly garrisoned units are excluded (deliberate).
 * Herdables/huntables (captured sheep) are food, not workers or soldiers — they
 * never appear in either idle badge or its camera cycle.
 */
export function isIdleOwnUnit(e: Entity, player: PlayerId): boolean {
  const def = gameData.units[e.defId];
  return (
    e.kind === 'unit' &&
    e.player === player &&
    e.player !== GAIA &&
    e.hp > 0 &&
    (e.sheltering === true || (e.activity === 'idle' && e.garrisonedIn === undefined)) &&
    !(def?.herdable || def?.huntable)
  );
}

/** Idle own units of one category, in stable entity-map insertion order. */
export function idleUnits(state: GameState, player: PlayerId, cat: IdleCategory): Entity[] {
  const out: Entity[] = [];
  for (const e of state.entities.values()) {
    if (!isIdleOwnUnit(e, player)) continue;
    const isVillager = e.defId === 'villager';
    if ((cat === 'villager') === isVillager) out.push(e);
  }
  return out;
}

/** Filter a saved control group down to its still-living members (order kept). */
export function liveGroupIds(state: GameState, ids: EntityId[]): EntityId[] {
  const out: EntityId[] = [];
  for (const id of ids) {
    const e = state.entities.get(id);
    if (e && e.hp > 0 && e.activity !== 'dying') out.push(id);
  }
  return out;
}

/** True when both id lists contain exactly the same ids (order-insensitive). */
export function sameIdSet(a: EntityId[], b: EntityId[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== b.length) {
    // duplicate-safe: compare multiset sizes via unique sets both ways
    return new Set(b).size === set.size && b.every((id) => set.has(id));
  }
  return b.every((id) => set.has(id));
}

/** Average position of a group in float tiles (camera center target). */
export function centroidTile(entities: Entity[], fpScale: number): { x: number; y: number } | null {
  if (entities.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const e of entities) {
    sx += e.x;
    sy += e.y;
  }
  return { x: sx / entities.length / fpScale, y: sy / entities.length / fpScale };
}
