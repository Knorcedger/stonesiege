// Entity creation/removal with all side effects kept consistent: insertion-ordered store,
// walkability blockers (buildings + resource objects block tiles; units never do),
// spatial grid membership (units), fog stamps, and population bookkeeping.

import { gameData } from '@bf/data';
import { FP, GAIA } from './types';
import type { Entity, EntityId, EntityKind } from './types';
import { inBounds, tileIndex } from './internal';
import type { SimState } from './internal';
import { fogOnDeath, fogOnSpawn } from './fog';
import { resolveUnitStats } from './stats';

export function defKind(defId: string): EntityKind | null {
  if (gameData.units[defId]) return 'unit';
  if (gameData.buildings[defId]) return 'building';
  if (gameData.resources[defId]) return 'resource';
  return null;
}

export function footprintSize(e: Entity): number {
  if (e.kind === 'building') return gameData.buildings[e.defId]?.size ?? 1;
  if (e.kind === 'resource') return 1;
  return 0; // units don't block tiles
}

function addBlockers(state: SimState, e: Entity, delta: number): void {
  const size = footprintSize(e);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = e.tileX + dx, y = e.tileY + dy;
      if (inBounds(state.map, x, y)) state.blockers[tileIndex(state.map, x, y)] += delta;
    }
  }
}

export interface SpawnInit {
  defId: string;
  player: number;
  tileX: number;
  tileY: number;
  hp?: number;
  facing?: number;
  amountLeft?: number;
  ref?: string;
  /** Trained units already reserved pop at train start; pass false for them. */
  countsPop?: boolean;
}

export function spawnEntity(state: SimState, init: SpawnInit): Entity | null {
  const kind = defKind(init.defId);
  if (!kind) return null;
  const id = state.nextId++;

  let e: Entity;
  if (kind === 'unit') {
    const stats = init.player === GAIA
      ? { hp: gameData.units[init.defId].hp, pop: gameData.units[init.defId].pop ?? 1 }
      : resolveUnitStats(state, init.player, init.defId);
    const maxHp = stats.hp;
    e = {
      id, kind, defId: init.defId, player: init.player,
      x: init.tileX * FP + FP / 2, y: init.tileY * FP + FP / 2,
      tileX: init.tileX, tileY: init.tileY,
      facing: init.facing ?? 0,
      hp: init.hp ?? maxHp, maxHp,
      activity: 'idle',
    };
    if (init.player !== GAIA) {
      const player = state.players[init.player];
      if (player && init.countsPop !== false) player.pop += stats.pop;
    }
  } else if (kind === 'building') {
    const def = gameData.buildings[init.defId];
    e = {
      id, kind, defId: init.defId, player: init.player,
      x: init.tileX * FP + (def.size * FP) / 2, y: init.tileY * FP + (def.size * FP) / 2,
      tileX: init.tileX, tileY: init.tileY,
      facing: init.facing ?? 0,
      hp: init.hp ?? def.hp, maxHp: def.hp,
      activity: 'idle',
      buildProgress: 1000, // wave 1: all placed buildings are complete
    };
    if (def.trains && def.trains.length > 0) e.trainQueue = [];
  } else {
    const def = gameData.resources[init.defId];
    e = {
      id, kind, defId: init.defId, player: init.player,
      x: init.tileX * FP + FP / 2, y: init.tileY * FP + FP / 2,
      tileX: init.tileX, tileY: init.tileY,
      facing: init.facing ?? 0,
      hp: init.hp ?? def.hp ?? 0, maxHp: def.hp ?? 0,
      activity: 'idle',
      amountLeft: init.amountLeft ?? def.amount,
      resourceType: def.resourceType,
    };
  }

  state.entities.set(id, e);
  addBlockers(state, e, 1);
  if (kind === 'unit') state.unitsGrid.insert(id, e.x, e.y);
  fogOnSpawn(state, e);
  if (kind === 'building') recomputePopCap(state, init.player);
  if (init.ref) state.refs.set(init.ref, id);
  return e;
}

/** Remove an entity and unwind every side effect. Does NOT emit events (caller's job). */
export function removeEntity(state: SimState, id: EntityId): void {
  const e = state.entities.get(id);
  if (!e) return;
  addBlockers(state, e, -1);
  if (e.kind === 'unit') {
    state.unitsGrid.remove(id);
    state.motion.delete(id);
    if (e.player !== GAIA) {
      const player = state.players[e.player];
      const def = gameData.units[e.defId];
      if (player && def) player.pop -= def.pop ?? 1;
    }
  }
  fogOnDeath(state, e);
  state.entities.delete(id);
  if (e.kind === 'building' && e.player !== GAIA) recomputePopCap(state, e.player);
}

export function recomputePopCap(state: SimState, playerId: number): void {
  const player = state.players[playerId];
  if (!player || playerId === GAIA) return;
  let provided = 0;
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.player !== playerId) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    provided += gameData.buildings[e.defId]?.popProvided ?? 0;
  }
  player.popCap = Math.min(provided, state.popCapLimit);
}

/** First free (walkable) tile adjacent to a footprint, scanning outward ring by ring. */
export function findFreeAdjacentTile(
  state: SimState, tileX: number, tileY: number, size: number, maxRing = 4,
): { x: number; y: number } | null {
  for (let ring = 1; ring <= maxRing; ring++) {
    const x0 = tileX - ring, y0 = tileY - ring;
    const x1 = tileX + size - 1 + ring, y1 = tileY + size - 1 + ring;
    // south edge first (units emerge toward the camera), then east, north, west
    for (let x = x0; x <= x1; x++) if (isFree(state, x, y1)) return { x, y: y1 };
    for (let y = y1 - 1; y >= y0; y--) if (isFree(state, x1, y)) return { x: x1, y };
    for (let x = x1 - 1; x >= x0; x--) if (isFree(state, x, y0)) return { x, y: y0 };
    for (let y = y0 + 1; y <= y1 - 1; y++) if (isFree(state, x0, y)) return { x: x0, y };
  }
  return null;
}

function isFree(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y)) return false;
  const i = tileIndex(state.map, x, y);
  return state.walkTerrain[i] === 1 && state.blockers[i] === 0;
}
