// Internal (non-public) sim state shared by the system modules. Everything here is part
// of the deterministic state: integers only, insertion-ordered Maps, no wall clock.

import type { Entity, EntityId, Fixed, GameMap, PlayerState, Stockpile } from './types';
import type { SimRng } from './rng';
import type { SpatialGrid } from './spatial';
import type { PlayerModifierTable, ResolvedUnitStats } from './stats';
import type { GroupSearch } from './path';

/** Per-unit movement state (exists only while the unit has an active move order). */
export interface Motion {
  /** Final destination (exact fixed-point coords, not tile center). */
  targetX: Fixed;
  targetY: Fixed;
  /** Tile-index waypoints (current -> goal). null = waiting for the pathfinder. */
  path: number[] | null;
  pathIndex: number;
  /** Path search group serving this unit (stale searches check this before serving). */
  groupId: number;
  stuckTicks: number;
  repaths: number;
}

/** Last fog stamp applied for an entity (needed to remove it on move/death). */
export interface VisionStamp {
  group: number; // index into SimState.vision
  cx: number;
  cy: number;
  r: number;
}

/** An under-construction building: scaled progress accumulator + what was paid (refunds). */
export interface FoundationSite {
  acc: number; // scaled builder-tick accumulator (integer)
  accNeeded: number; // 3 * buildTimeTicks * RATE_SCALE
  paid: Stockpile;
}

/** Shared-vision group (a team, or a solo player). Allied players point at the same arrays. */
export interface VisionGroup {
  counts: Uint16Array; // live LOS stamp counts per tile
  visibility: Uint8Array; // 0 unexplored / 1 explored / 2 visible (shared into PlayerState)
}

export interface SimState {
  // --- public GameState surface (structurally compatible) ---
  tick: number;
  map: GameMap;
  entities: Map<EntityId, Entity>;
  players: PlayerState[];
  refs: Map<string, EntityId>;
  finished: boolean;

  // --- internal ---
  rng: SimRng;
  nextId: number;
  /** Conquest elimination active (practice games; campaign defeat comes from triggers). */
  conquest: boolean;
  /** Hard pop ceiling from GameConfig. */
  popCapLimit: number;
  /** 1 = terrain passable (water is not), per tile. */
  walkTerrain: Uint8Array;
  /** Count of blocking occupants (buildings/resource objects) per tile. */
  blockers: Uint16Array;
  /** Spatial hash over units (soft obstacles) for range queries + local avoidance. */
  unitsGrid: SpatialGrid;
  motion: Map<EntityId, Motion>;
  /** Active per-command-group path searches, FIFO. */
  pathSearches: GroupSearch[];
  nextGroupId: number;
  /** Player id -> vision group index; vision groups own the visibility arrays. */
  visionGroupOf: number[];
  vision: VisionGroup[];
  visionStamps: Map<EntityId, VisionStamp>;
  /** Under-construction buildings by entity id (progress accumulator + paid cost). */
  foundations: Map<EntityId, FoundationSite>;
  /** Builder re-approach attempts (units with a build intent that failed to arrive). */
  buildRetries: Map<EntityId, number>;
  /** Per-player stat modifier tables (built from civ bonuses; techs extend them in wave 2). */
  modifiers: PlayerModifierTable[];
  /** resolveUnitStats cache, keyed `${player}:${defId}`; cleared when modifiers change. */
  statsCache: Map<string, ResolvedUnitStats>;
}

export const tileIndex = (map: GameMap, x: number, y: number): number => y * map.width + x;

export const inBounds = (map: GameMap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.width && y < map.height;

export function isTileWalkable(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state.map, x, y)) return false;
  const i = y * state.map.width + x;
  return state.walkTerrain[i] === 1 && state.blockers[i] === 0;
}

/** Integer sqrt of a non-negative int (Math.sqrt is IEEE-exact; floor keeps it integral). */
export const isqrt = (v: number): number => Math.floor(Math.sqrt(v));

/**
 * Facing octant from a tile-space delta. Screen mapping (see ASSET_CONTRACT.md):
 * 0 = S (toward camera), clockwise. In tile space: S=(+1,+1), SW=(0,+1), W=(-1,+1),
 * NW=(-1,0), N=(-1,-1), NE=(0,-1), E=(+1,-1), SE=(+1,0).
 */
export function facingFromDelta(dx: number, dy: number): number {
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  if (sx === 1 && sy === 1) return 0;
  if (sx === 0 && sy === 1) return 1;
  if (sx === -1 && sy === 1) return 2;
  if (sx === -1 && sy === 0) return 3;
  if (sx === -1 && sy === -1) return 4;
  if (sx === 0 && sy === -1) return 5;
  if (sx === 1 && sy === -1) return 6;
  if (sx === 1 && sy === 0) return 7;
  return 0;
}
