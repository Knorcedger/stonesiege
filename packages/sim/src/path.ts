// Tile pathfinding. One search serves a whole command group: we run a budgeted Dijkstra
// flood FROM the goal outward (8-dir, no cutting corners past blocked diagonals) until
// every requesting unit's start tile is settled, then each unit's path is read off the
// parent pointers. Searches carry over across ticks (per-tick expansion budget) and are
// processed FIFO, so a huge command never stalls the sim.

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
  for (const id of waiting) {
    s.waitingCount--;
    const m = state.motion.get(id);
    if (!m || m.groupId !== s.groupId) continue; // unit got a newer order
    const path: number[] = [];
    let t = s.parent[tile];
    while (t !== -1) { path.push(t); t = s.parent[t]; }
    m.path = path; // may be empty: already on the goal tile — walk straight to target
    m.pathIndex = 0;
  }
}

function failRemaining(state: SimState, s: GroupSearch): void {
  for (const waiting of s.waitingByTile.values()) {
    for (const id of waiting) {
      const m = state.motion.get(id);
      if (!m || m.groupId !== s.groupId) continue;
      state.motion.delete(id); // unreachable: drop the order
      const e = state.entities.get(id);
      if (e) e.activity = 'idle';
    }
  }
  s.waitingByTile.clear();
  s.waitingCount = 0;
}

/** Advance all active searches within this tick's expansion budget. */
export function tickPathfinding(state: SimState): void {
  let budget = PATH_BUDGET_PER_TICK;
  while (budget > 0 && state.pathSearches.length > 0) {
    const s = state.pathSearches[0];
    if (s.waitingCount <= 0) { state.pathSearches.shift(); continue; }
    budget = expandSearch(state, s, budget);
    if (s.waitingCount <= 0) state.pathSearches.shift();
    else if (s.open.size === 0) { failRemaining(state, s); state.pathSearches.shift(); }
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
  const goalTile = nearestWalkableTile(state, tx, ty);
  if (!goalTile) return;
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
    };
    state.motion.set(id, m);
    e.activity = 'moving';
    moving.push(id);
  }
  requestGroupPath(state, tileIndex(state.map, goalTile.x, goalTile.y), moving);
}
