// Tile pathfinding. One search serves a whole command group: we run a budgeted Dijkstra
// flood FROM the goal outward (8-dir, no cutting corners past blocked diagonals) until
// every requesting unit's start tile is settled, then each unit's path is read off the
// parent pointers. Searches carry over across ticks (per-tick expansion budget) and are
// processed FIFO, so a huge command never stalls the sim.
//
// Unreachable goals are never a silent no-op (AoE2 behavior): when the flood exhausts
// with units still waiting, rerouteRemaining walks them to the reachable tile closest
// to the goal instead of dropping the order.

import type { EntityId } from './types';
import { FP } from './types';
import { isTileWalkable, tileIndex } from './internal';
import type { Motion, SimState } from './internal';

/** Shared node-expansion budget per tick across all active searches. */
export const PATH_BUDGET_PER_TICK = 4000;

const COST_STRAIGHT = 10;
const COST_DIAGONAL = 14;

/** Binary min-heap over (cost, tile), deterministic tie-break on tile index. */
class MinHeap {
  private cost: number[] = [];
  private tile: number[] = [];

  get size(): number { return this.cost.length; }

  push(c: number, t: number): void {
    const cost = this.cost, tile = this.tile;
    let i = cost.length;
    cost.push(c); tile.push(t);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cost[p] < cost[i] || (cost[p] === cost[i] && tile[p] <= tile[i])) break;
      [cost[p], cost[i]] = [cost[i], cost[p]];
      [tile[p], tile[i]] = [tile[i], tile[p]];
      i = p;
    }
  }

  pop(): number {
    const cost = this.cost, tile = this.tile;
    const top = tile[0];
    const lastC = cost.pop()!, lastT = tile.pop()!;
    if (cost.length > 0) {
      cost[0] = lastC; tile[0] = lastT;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < cost.length && (cost[l] < cost[m] || (cost[l] === cost[m] && tile[l] < tile[m]))) m = l;
        if (r < cost.length && (cost[r] < cost[m] || (cost[r] === cost[m] && tile[r] < tile[m]))) m = r;
        if (m === i) break;
        [cost[m], cost[i]] = [cost[i], cost[m]];
        [tile[m], tile[i]] = [tile[i], tile[m]];
        i = m;
      }
    }
    return top;
  }

  /** Verbatim heap layout for snapshots (restore preserves pop order exactly). */
  snapshot(): { heapCost: number[]; heapTile: number[] } {
    return { heapCost: [...this.cost], heapTile: [...this.tile] };
  }

  static restore(heapCost: readonly number[], heapTile: readonly number[]): MinHeap {
    const h = new MinHeap();
    h.cost = [...heapCost];
    h.tile = [...heapTile];
    return h;
  }
}

export interface GroupSearch {
  groupId: number;
  goal: number; // tile index
  dist: Int32Array; // -1 = unseen; else best known cost
  settled: Uint8Array;
  parent: Int32Array; // step toward goal
  open: MinHeap;
  /** start tile -> unit ids still waiting on this search */
  waitingByTile: Map<number, EntityId[]>;
  waitingCount: number;
}

/**
 * JSON-safe snapshot of one in-flight group search. The internals (dist/settled/parent/
 * heap) are captured VERBATIM rather than re-derived: a partially expanded search saw
 * the blocker grid as it was on EARLIER ticks (buildings placed / trees felled since
 * then would make a from-scratch re-expansion diverge), so exact restore is the only
 * provably desync-free option. serialize.ts RLE-compresses the big arrays.
 */
export interface GroupSearchSnapshot {
  groupId: number;
  goal: number;
  dist: number[];
  settled: number[];
  parent: number[];
  heapCost: number[];
  heapTile: number[];
  /** [start tile, waiting unit ids][] in insertion order. */
  waiting: Array<[number, EntityId[]]>;
}

export function snapshotSearches(state: SimState): GroupSearchSnapshot[] {
  return state.pathSearches.map((s) => ({
    groupId: s.groupId,
    goal: s.goal,
    dist: Array.from(s.dist),
    settled: Array.from(s.settled),
    parent: Array.from(s.parent),
    ...s.open.snapshot(),
    waiting: [...s.waitingByTile].map(([tile, ids]) => [tile, [...ids]] as [number, EntityId[]]),
  }));
}

/** Rebuild state.pathSearches from snapshots (waitingCount is the sum of waiting lists). */
export function restoreSearches(state: SimState, snaps: GroupSearchSnapshot[]): void {
  state.pathSearches = snaps.map((snap) => {
    const search: GroupSearch = {
      groupId: snap.groupId,
      goal: snap.goal,
      dist: Int32Array.from(snap.dist),
      settled: Uint8Array.from(snap.settled),
      parent: Int32Array.from(snap.parent),
      open: MinHeap.restore(snap.heapCost, snap.heapTile),
      waitingByTile: new Map(snap.waiting.map(([tile, ids]) => [tile, [...ids]])),
      waitingCount: 0,
    };
    for (const ids of search.waitingByTile.values()) search.waitingCount += ids.length;
    return search;
  });
}

/** Nearest walkable tile to (tx, ty), spiraling outward. null if none within maxR. */
export function nearestWalkableTile(
  state: SimState, tx: number, ty: number, maxR = 8,
): { x: number; y: number } | null {
  if (isTileWalkable(state, tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isTileWalkable(state, tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
      }
    }
  }
  return null;
}

/** Create a search serving `unitIds` toward `goal` (tile index). Registers motions as pending. */
export function requestGroupPath(state: SimState, goal: number, unitIds: EntityId[]): void {
  const n = state.map.width * state.map.height;
  const search: GroupSearch = {
    groupId: state.nextGroupId++,
    goal,
    dist: new Int32Array(n).fill(-1),
    settled: new Uint8Array(n),
    parent: new Int32Array(n).fill(-1),
    open: new MinHeap(),
    waitingByTile: new Map(),
    waitingCount: 0,
  };
  search.dist[goal] = 0;
  search.open.push(0, goal);
  for (const id of unitIds) {
    const e = state.entities.get(id);
    const m = state.motion.get(id);
    if (!e || !m) continue;
    m.groupId = search.groupId;
    m.path = null;
    m.pathIndex = 0;
    const start = tileIndex(state.map, e.tileX, e.tileY);
    let arr = search.waitingByTile.get(start);
    if (!arr) { arr = []; search.waitingByTile.set(start, arr); }
    arr.push(id);
    search.waitingCount++;
  }
  if (search.waitingCount > 0) state.pathSearches.push(search);
}

function serveTile(state: SimState, s: GroupSearch, tile: number): void {
  const waiting = s.waitingByTile.get(tile);
  if (!waiting) return;
  s.waitingByTile.delete(tile);
  const rawPath: number[] = [];
  let t = s.parent[tile];
  while (t !== -1) { rawPath.push(t); t = s.parent[t]; }
  const path = smoothTilePath(state, tile, rawPath);
  for (const id of waiting) {
    s.waitingCount--;
    const m = state.motion.get(id);
    if (!m || m.groupId !== s.groupId) continue; // unit got a newer order
    m.path = [...path]; // may be empty: already on the goal tile — walk straight to target
    m.pathIndex = 0;
  }
}

/** True when a center-to-center segment crosses only walkable tiles and safe corners. */
function clearTileLine(state: SimState, from: number, to: number): boolean {
  const width = state.map.width;
  let x = from % width, y = (from / width) | 0;
  const tx = to % width, ty = (to / width) | 0;
  const dx = Math.abs(tx - x), dy = Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let err = dx - dy;
  while (x !== tx || y !== ty) {
    const e2 = err * 2;
    let nx = x, ny = y;
    if (e2 > -dy) { err -= dy; nx += sx; }
    if (e2 < dx) { err += dx; ny += sy; }
    if (nx !== x && ny !== y
      && (!isTileWalkable(state, nx, y) || !isTileWalkable(state, x, ny))) return false;
    if (!isTileWalkable(state, nx, ny)) return false;
    x = nx; y = ny;
  }
  return true;
}

/**
 * Remove unnecessary grid-center bends from a valid path. The Dijkstra route is
 * octile-shortest, but its deterministic tie-break can group all horizontal steps
 * before all diagonal steps, making cavalry draw a sharp L on open ground. Greedy
 * line-of-sight compression preserves obstacle/corner safety while producing the
 * straight route the player intended.
 */
function smoothTilePath(state: SimState, start: number, raw: readonly number[]): number[] {
  if (raw.length <= 1) return [...raw];
  const out: number[] = [];
  let anchor = start;
  let firstCandidate = 0;
  while (firstCandidate < raw.length) {
    let chosen = firstCandidate;
    for (let i = raw.length - 1; i > firstCandidate; i--) {
      if (clearTileLine(state, anchor, raw[i])) { chosen = i; break; }
    }
    out.push(raw[chosen]);
    anchor = raw[chosen];
    firstCandidate = chosen + 1;
  }
  return out;
}

/**
 * The goal flood exhausted with units still waiting: the goal sits in a region the
 * units cannot reach (e.g. a sealed forest pocket). AoE2 walks units to the closest
 * reachable point instead of ignoring the order, so: BFS from the waiting units' start
 * tiles over passable terrain, pick the reached tile closest to the goal (deterministic
 * tie-break on tile index), and issue a fresh group search toward it.
 *
 * The BFS runs synchronously (outside the per-tick budget): it only fires on the rare
 * unreachable order, is bounded by map area, and is plain array work — far cheaper per
 * tile than heap-based Dijkstra expansion.
 *
 * Termination: the fallback goal is reachable from at least one waiting unit's start,
 * so the follow-up search always serves that unit's whole connected component; any
 * units in other components fail again with a strictly smaller waiting set.
 */
function rerouteRemaining(state: SimState, s: GroupSearch): void {
  const { width, height } = state.map;
  const walk = state.walkTerrain, blockers = state.blockers;
  const passable = (t: number): boolean => walk[t] === 1 && blockers[t] === 0;

  // Collect still-waiting units. A unit standing ON a blocked tile can never be served
  // by the tile flood (only passable tiles are settled) — drop those orders as before.
  const units: EntityId[] = [];
  const seeds: number[] = [];
  for (const [tile, waiting] of s.waitingByTile) {
    const ok = passable(tile);
    let live = 0;
    for (const id of waiting) {
      const m = state.motion.get(id);
      if (!m || m.groupId !== s.groupId) continue; // unit got a newer order
      if (ok) { units.push(id); live++; continue; }
      state.motion.delete(id);
      const e = state.entities.get(id);
      if (e) e.activity = 'idle';
    }
    if (ok && live > 0) seeds.push(tile);
  }
  s.waitingByTile.clear();
  s.waitingCount = 0;
  if (units.length === 0) return;

  // Multi-source 4-dir BFS (4-connectivity equals the flood's no-corner-cut 8-dir
  // connectivity) tracking the reached tile closest to the goal.
  const gx = s.goal % width, gy = (s.goal / width) | 0;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  let bestTile = -1, bestD2 = -1;
  const consider = (t: number): void => {
    const dx = (t % width) - gx, dy = ((t / width) | 0) - gy;
    const d2 = dx * dx + dy * dy;
    if (bestTile === -1 || d2 < bestD2 || (d2 === bestD2 && t < bestTile)) { bestD2 = d2; bestTile = t; }
  };
  for (const t of seeds) {
    if (visited[t]) continue;
    visited[t] = 1; queue.push(t); consider(t);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const t = queue[qi];
    const tx = t % width, ty = (t / width) | 0;
    if (tx > 0 && !visited[t - 1] && passable(t - 1)) { visited[t - 1] = 1; queue.push(t - 1); consider(t - 1); }
    if (tx < width - 1 && !visited[t + 1] && passable(t + 1)) { visited[t + 1] = 1; queue.push(t + 1); consider(t + 1); }
    if (ty > 0 && !visited[t - width] && passable(t - width)) { visited[t - width] = 1; queue.push(t - width); consider(t - width); }
    if (ty < height - 1 && !visited[t + width] && passable(t + width)) { visited[t + width] = 1; queue.push(t + width); consider(t + width); }
  }

  // Retarget the survivors at the fallback tile's center and search toward it.
  const cx = (bestTile % width) * FP + FP / 2;
  const cy = ((bestTile / width) | 0) * FP + FP / 2;
  for (const id of units) {
    const m = state.motion.get(id);
    if (m) { m.targetX = cx; m.targetY = cy; }
  }
  requestGroupPath(state, bestTile, units);
}

/** Advance all active searches within this tick's expansion budget. */
export function tickPathfinding(state: SimState): void {
  let budget = PATH_BUDGET_PER_TICK;
  while (budget > 0 && state.pathSearches.length > 0) {
    const s = state.pathSearches[0];
    if (s.waitingCount <= 0) { state.pathSearches.shift(); continue; }
    budget = expandSearch(state, s, budget);
    if (s.waitingCount <= 0) state.pathSearches.shift();
    else if (s.open.size === 0) { rerouteRemaining(state, s); state.pathSearches.shift(); }
  }
}

function expandSearch(state: SimState, s: GroupSearch, budget: number): number {
  const { width, height } = state.map;
  const walk = state.walkTerrain, blockers = state.blockers;
  const open = s.open, dist = s.dist, settled = s.settled, parent = s.parent;

  const passable = (t: number): boolean => walk[t] === 1 && blockers[t] === 0;

  while (budget > 0 && open.size > 0 && s.waitingCount > 0) {
    const t = open.pop();
    if (settled[t]) continue;
    settled[t] = 1;
    budget--;
    serveTile(state, s, t);
    if (s.waitingCount <= 0) break;

    const tx = t % width, ty = (t / width) | 0;
    const base = dist[t];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nt = ny * width + nx;
        if (settled[nt] || !passable(nt)) continue;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting: both orthogonal neighbors must be open
          if (!passable(ty * width + nx) || !passable(ny * width + tx)) continue;
        }
        const cost = base + (dx !== 0 && dy !== 0 ? COST_DIAGONAL : COST_STRAIGHT);
        if (dist[nt] === -1 || cost < dist[nt]) {
          dist[nt] = cost;
          parent[nt] = t;
          open.push(cost, nt);
        }
      }
    }
  }
  return budget;
}

/**
 * Order a set of units to walk to a fixed-point destination. Shared entry point for
 * move / attack-move / rally walks. Remaps a blocked click to the nearest walkable tile.
 */
export function orderMove(state: SimState, unitIds: EntityId[], x: number, y: number): void {
  if (unitIds.length === 0) return;
  const tx = Math.floor(x / FP), ty = Math.floor(y / FP);
  // widen the spiral for clicks deep inside blocked areas (mid-lake, forest heart) so
  // the order is never a silent no-op; unreachable goals then reroute via the search
  const goalTile = nearestWalkableTile(state, tx, ty)
    ?? nearestWalkableTile(state, tx, ty, Math.max(state.map.width, state.map.height));
  if (!goalTile) return; // map has no walkable tile at all
  const remapped = goalTile.x !== tx || goalTile.y !== ty;
  const targetX = remapped ? goalTile.x * FP + FP / 2 : x;
  const targetY = remapped ? goalTile.y * FP + FP / 2 : y;

  const moving: EntityId[] = [];
  for (const id of unitIds) {
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit') continue;
    const m: Motion = {
      targetX, targetY, path: null, pathIndex: 0,
      groupId: -1, stuckTicks: 0, repaths: 0,
      lastX: e.x, lastY: e.y,
    };
    state.motion.set(id, m);
    e.activity = 'moving';
    moving.push(id);
  }
  requestGroupPath(state, tileIndex(state.map, goalTile.x, goalTile.y), moving);
}

/** One unit's assigned destination inside a formation. */
export interface UnitMoveTarget { id: EntityId; x: number; y: number }

/**
 * Order units to distinct destinations, sharing searches whenever slots land on
 * the same tile. This is the formation equivalent of orderMove: every slot is
 * independently remapped off blocked terrain, so an arrangement cannot strand
 * a flank inside a building or lake.
 */
export function orderMoveToTargets(state: SimState, targets: readonly UnitMoveTarget[]): void {
  const groups = new Map<number, EntityId[]>();
  for (const target of targets) {
    const e = state.entities.get(target.id);
    if (!e || e.kind !== 'unit') continue;
    const tx = Math.floor(target.x / FP), ty = Math.floor(target.y / FP);
    const goalTile = nearestWalkableTile(state, tx, ty)
      ?? nearestWalkableTile(state, tx, ty, Math.max(state.map.width, state.map.height));
    if (!goalTile) continue;
    const remapped = goalTile.x !== tx || goalTile.y !== ty;
    const targetX = remapped ? goalTile.x * FP + FP / 2 : target.x;
    const targetY = remapped ? goalTile.y * FP + FP / 2 : target.y;
    state.motion.set(target.id, {
      targetX, targetY, path: null, pathIndex: 0,
      groupId: -1, stuckTicks: 0, repaths: 0,
      lastX: e.x, lastY: e.y,
    });
    e.activity = 'moving';
    const goal = tileIndex(state.map, goalTile.x, goalTile.y);
    const ids = groups.get(goal);
    if (ids) ids.push(target.id);
    else groups.set(goal, [target.id]);
  }
  for (const [goal, ids] of groups) requestGroupPath(state, goal, ids);
}
