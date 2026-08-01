// Internal (non-public) sim state shared by the system modules. Everything here is part
// of the deterministic state: integers only, insertion-ordered Maps, no wall clock.

import { gameData } from '@bf/data';
import type { ClassValue, GatherTask } from '@bf/data';
import { FP } from './types';
import type { Entity, EntityId, Fixed, GameMap, PlayerId, PlayerState, Stockpile } from './types';
import type { SimRng } from './rng';
import type { SpatialGrid } from './spatial';
import type { PlayerModifierTable, ResolvedBuildingStats, ResolvedUnitStats } from './stats';
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

/** Per-villager gathering bookkeeping (exists while the unit has a gather intent). */
export interface GatherInfo {
  /** Scaled extraction accumulator: RES_SCALE * TICKS_PER_SECOND per whole resource. */
  acc: number;
  /** Failed approach attempts since the last successful arrival. */
  retries: number;
  /** Walking a full (or final) load to the drop-off instead of working the node. */
  depositing: boolean;
  /** Chosen drop-off building; revalidated every tick. */
  dropoffId?: EntityId;
  /** Hunters: next tick this villager may strike a live animal. */
  nextAttackTick: number;
  /** Task + last known target tile (auto-continue retargets near the depleted node). */
  task: GatherTask | null;
  lastX: number;
  lastY: number;
  /** Deposit what is carried, then go idle (nothing left to retarget). */
  finishAfterDeposit: boolean;
}

/** A villager running for a garrison after taking damage (GDD villager-flee rule). */
export interface FleeState {
  buildingId: EntityId;
  retries: number;
}

/** Under-repair building: scaled HP accumulator + scaled resource debt (cost trickle). */
export interface RepairSite {
  acc: number;
  debt: Stockpile; // scaled by REPAIR_SCALE; whole units are deducted as debt crosses it
}

/** A unit's live engagement (explicit attack order or auto-acquired target). */
export interface CombatInfo {
  targetId: EntityId;
  /** Auto-acquired (LOS scan / retaliation): leash + return-to-anchor rules apply. */
  auto: boolean;
  nextAttackTick: number;
  /** Where the unit stood when it auto-acquired — it returns here after disengaging. */
  anchorX: Fixed;
  anchorY: Fixed;
}

/** An in-flight projectile. Damage payload frozen at fire time (attacker may die). */
export interface Projectile {
  attackerId: EntityId;
  player: PlayerId;
  targetId: EntityId;
  /** Impact point (fixed-point). Aim was rolled/led at fire time; flight is fixed. */
  x: Fixed;
  y: Fixed;
  impactTick: number;
  /** Accuracy roll at fire time (a miss lands at a scatter point — may graze someone). */
  hit: boolean;
  /** Splash radius in fixed units (mangonel line); 0 = single target. */
  splashFp: number;
  /** Resolved attack entries at fire time (tech bonuses included). */
  attacks: ClassValue[];
}

/** Per-monk faith + current channel (heal or convert). */
export interface MonkInfo {
  faith: number; // 0..100
  faithAcc: number; // scaled regen accumulator (RES_SCALE * TICKS_PER_SECOND per point)
  convertTargetId?: EntityId;
  /** Ticks spent channeling IN RANGE on the current conversion target. */
  channelTicks: number;
  healTargetId?: EntityId;
  /** True while the heal target came from an explicit command (monk will chase). */
  healExplicit: boolean;
  healAcc: number; // scaled HP accumulator
}

/** A unit walking to a garrison target (explicit garrison command). */
export interface GarrisonWalk {
  targetId: EntityId;
  retries: number;
}

/** Trebuchet fold/unfold in progress. */
export interface PackTransition {
  ticksLeft: number;
  toPacked: boolean;
}

/** A completed Wonder counting down to victory (GDD optional wonder win). */
export interface WonderTimer {
  player: PlayerId;
  ticksLeft: number;
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
  /** resolveBuildingStats cache, same keying/invalidations. */
  buildingStatsCache: Map<string, ResolvedBuildingStats>;
  /** Gathering state per villager (exists while the unit has a gather intent). */
  gather: Map<EntityId, GatherInfo>;
  /** Villagers fleeing to garrison after taking damage (GDD combat rules). */
  fleeing: Map<EntityId, FleeState>;
  /** Gaia-animal (wolf) attack cooldowns: next allowed strike tick. */
  animalCd: Map<EntityId, number>;
  /** Carcass rot accumulators (scaled like GatherInfo.acc). */
  decayAcc: Map<EntityId, number>;
  /** Buildings under repair (HP accumulator + cost-trickle debt). */
  repairs: Map<EntityId, RepairSite>;

  // --- combat / tech / endgame (wave 2b) ---
  /** Live engagements per unit (explicit orders + auto-acquired targets). */
  combat: Map<EntityId, CombatInfo>;
  /** In-flight projectiles, fire order (deterministic). */
  projectiles: Projectile[];
  /** Defensive-building RoF cooldowns: next tick the building may fire. */
  buildingCd: Map<EntityId, number>;
  /** Monk faith + channel state (lazy, per living monk). */
  monks: Map<EntityId, MonkInfo>;
  /** Units walking to garrison after an explicit garrison command. */
  garrisoning: Map<EntityId, GarrisonWalk>;
  /** Garrison-healing accumulators per garrisoned unit (scaled). */
  healAcc: Map<EntityId, number>;
  /** Military corpses: ticks until the body is cleaned up (renderer plays 'dying'). */
  corpses: Map<EntityId, number>;
  /** Trebuchet pack/unpack transitions in progress. */
  packTransitions: Map<EntityId, PackTransition>;
  /** GDD market: ONE global drifting rate per commodity (gold per 100), shared by all. */
  marketRates: { food: number; wood: number; stone: number };
  /** Completed wonders counting down, by entity id. */
  wonders: Map<EntityId, WonderTimer>;
  /** Per-player earliest tick the next underAttack alert may fire (throttle). */
  alertNext: number[];
  /** Per-player Ballistics flag (projectiles lead moving targets). */
  ballistics: boolean[];
  /** Per-player extra unit/building defs force-enabled by enableUnit/enableBuilding effects. */
  enabledUnits: Array<Set<string>>;
  enabledBuildings: Array<Set<string>>;
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

/** Soft-body radius of a unit in fixed units (matches movement separation). */
export const UNIT_RADIUS_FP = 64;

/** Distance (fixed units) from a point to a size×size tile footprint's rectangle. */
export function distToFootprintFp(px: Fixed, py: Fixed, tileX: number, tileY: number, size: number): number {
  const dx = Math.max(tileX * FP - px, 0, px - (tileX + size) * FP);
  const dy = Math.max(tileY * FP - py, 0, py - (tileY + size) * FP);
  return isqrt(dx * dx + dy * dy);
}

/**
 * Combat range between an attacker (unit or building) and a target: edge-to-edge in
 * fixed units — collision radii for units, footprint rectangles for buildings.
 */
export function effDistFp(state: SimState, from: Entity, target: Entity): number {
  const fromSize = from.kind === 'building' ? footSize(from) : 0;
  if (target.kind === 'building' || target.kind === 'resource') {
    const size = target.kind === 'building' ? footSize(target) : 1;
    if (fromSize > 0) {
      // building vs building (rare): center-to-rect minus half own footprint
      const d = distToFootprintFp(from.x, from.y, target.tileX, target.tileY, size);
      return Math.max(0, d - (fromSize * FP) / 2);
    }
    return Math.max(0, distToFootprintFp(from.x, from.y, target.tileX, target.tileY, size) - UNIT_RADIUS_FP);
  }
  const dx = from.x - target.x, dy = from.y - target.y;
  const d = isqrt(dx * dx + dy * dy);
  if (fromSize > 0) return Math.max(0, d - (fromSize * FP) / 2 - UNIT_RADIUS_FP);
  return Math.max(0, d - 2 * UNIT_RADIUS_FP);
}

/** Footprint size for range math (mirrors entities.footprintSize for buildings). */
const footSize = (e: Entity): number => gameData.buildings[e.defId]?.size ?? 1;

/** Unit stands in the 1-tile ring around (or on) a size×size footprint at (tileX, tileY). */
export function adjacentToFootprint(
  e: { tileX: number; tileY: number }, tileX: number, tileY: number, size: number,
): boolean {
  return e.tileX >= tileX - 1 && e.tileX <= tileX + size &&
    e.tileY >= tileY - 1 && e.tileY <= tileY + size;
}

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
