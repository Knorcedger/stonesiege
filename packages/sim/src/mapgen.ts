// Practice random-map generation, AoE2 "Arabia"-style fair starts. Seeded and fully
// deterministic: players in spaced quadrants; each start gets TC + 3 villagers + scout,
// 4 sheep, a berry patch, main + secondary gold, stone (+ small secondary), nearby deer
// and two distant wolves. Rivers have broad shallows crossings; broken cliff ridges
// create defensible terrain without sealing regions. Forest blobs with clearings avoid
// start zones, extra neutral golds sit near the middle, and carve passes guarantee every
// land region, TC, and resource cluster can be reached.

import { gameData } from '@bf/data';
import type { GameMap, TerrainId } from './types';
import { inBounds, isTileWalkable, tileIndex } from './internal';
import type { SimState } from './internal';
import type { SimRng } from './rng';
import { findFreeAdjacentTile, removeEntity, spawnEntity } from './entities';

export const TERRAIN_IDS: readonly TerrainId[] = [
  'grass', 'dirt', 'sand', 'water', 'shallows', 'road', 'farmland', 'snow', 'cliff',
];
const T_GRASS = 0;
const T_DIRT = 1;
const T_SAND = 2;
const T_WATER = 3;
const T_SHALLOWS = 4;
const T_CLIFF = 8;

export function terrainPassable(terrainIndex: number): boolean {
  return terrainIndex !== T_WATER && terrainIndex !== T_CLIFF;
}

/**
 * Practice map size presets (GDD practice options): tiles per side, square maps.
 * The generator is size-agnostic — these are the supported/tested UI choices.
 */
export const MAP_SIZE_PRESETS = { small: 96, medium: 120, large: 144 } as const;
export type MapSizePreset = keyof typeof MAP_SIZE_PRESETS;

/**
 * 1 = terrain passable per tile (water and cliffs are not); blockers overlay separately.
 * Pure function of the map — snapshot restore re-derives it instead of storing it.
 * Resolves passability through terrainIds so scenario maps with custom index order work.
 */
export function buildWalkTerrain(map: GameMap): Uint8Array {
  const walk = new Uint8Array(map.width * map.height);
  const passableIndex = new Uint8Array(map.terrainIds.length);
  for (let i = 0; i < map.terrainIds.length; i++) {
    const id = map.terrainIds[i];
    passableIndex[i] = id === 'water' || id === 'cliff' ? 0 : 1;
  }
  for (let i = 0; i < walk.length; i++) walk[i] = passableIndex[map.terrain[i]] ?? 1;
  return walk;
}

export function makeEmptyMap(width: number, height: number): GameMap {
  return { width, height, terrain: new Uint8Array(width * height), terrainIds: TERRAIN_IDS };
}

/** Start-position anchors: opposite quadrants for 2, three/four quadrants for 3–4. */
function playerAnchors(rng: SimRng, w: number, h: number, count: number): Array<{ x: number; y: number }> {
  const qx0 = Math.floor(w / 4), qx1 = Math.floor((3 * w) / 4);
  const qy0 = Math.floor(h / 4), qy1 = Math.floor((3 * h) / 4);
  const quads = [
    { x: qx0, y: qy0 }, { x: qx1, y: qy1 }, // diagonal pair first (2p = opposite corners)
    { x: qx1, y: qy0 }, { x: qx0, y: qy1 },
  ];
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const q = quads[i % 4];
    out.push({
      x: Math.max(8, Math.min(w - 9, q.x + rng.nextRange(-3, 3))),
      y: Math.max(8, Math.min(h - 9, q.y + rng.nextRange(-3, 3))),
    });
  }
  return out;
}

const START_ZONE_RADIUS = 14; // forests keep out of this ring around each anchor

function tileFree(state: SimState, x: number, y: number): boolean {
  if (!isTileWalkable(state, x, y)) return false;
  const terrainId = state.map.terrainIds[state.map.terrain[tileIndex(state.map, x, y)]];
  return terrainId !== 'shallows';
}

/** Collect `count` free tiles clustered around (cx, cy), spiraling outward. */
function clusterTiles(state: SimState, cx: number, cy: number, count: number): Array<{ x: number; y: number }> | null {
  const out: Array<{ x: number; y: number }> = [];
  for (let r = 0; r <= 3 && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy++) {
      for (let dx = -r; dx <= r && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inBounds(state.map, x, y) || !tileFree(state, x, y)) continue;
        if (out.some((t) => t.x === x && t.y === y)) continue;
        out.push({ x, y });
      }
    }
  }
  return out.length >= count ? out : null;
}

/**
 * Find a cluster center in ring [minR, maxR] around (ax, ay) with room for `count`
 * tiles. Widens the ring if the terrain is crowded, and falls back to a deterministic
 * outward spiral from the anchor if random sampling never lands — a start is never
 * silently missing a resource cluster on a pathological seed.
 */
function placeCluster(
  state: SimState, rng: SimRng, ax: number, ay: number,
  minR: number, maxR: number, count: number, defId: string,
): Array<{ x: number; y: number }> {
  const spawnAll = (tiles: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
    for (const t of tiles) spawnEntity(state, { defId, player: 0, tileX: t.x, tileY: t.y });
    return tiles;
  };
  for (let widen = 0; widen < 5; widen++) {
    const lo = minR, hi = maxR + widen * 3;
    for (let attempt = 0; attempt < 60; attempt++) {
      const dx = rng.nextRange(-hi, hi), dy = rng.nextRange(-hi, hi);
      const d2 = dx * dx + dy * dy;
      if (d2 < lo * lo || d2 > hi * hi) continue;
      const cx = ax + dx, cy = ay + dy;
      if (cx < 2 || cy < 2 || cx >= state.map.width - 2 || cy >= state.map.height - 2) continue;
      const tiles = clusterTiles(state, cx, cy, count);
      if (!tiles) continue;
      return spawnAll(tiles);
    }
  }
  // Deterministic spiral fallback (no rng draws): first ring-ordered center with room.
  const spiralMax = Math.max(state.map.width, state.map.height);
  for (let r = Math.min(minR, spiralMax); r <= spiralMax; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = ax + dx, cy = ay + dy;
        if (cx < 2 || cy < 2 || cx >= state.map.width - 2 || cy >= state.map.height - 2) continue;
        const tiles = clusterTiles(state, cx, cy, count);
        if (tiles) return spawnAll(tiles);
      }
    }
  }
  return []; // only possible when the whole map has no open ground for the cluster
}

/** Non-blocking gaia units (sheep/deer/wolves) scattered in a ring. */
function placeAnimals(
  state: SimState, rng: SimRng, ax: number, ay: number,
  minR: number, maxR: number, count: number, defId: string,
): void {
  let placed = 0;
  for (let attempt = 0; attempt < 80 && placed < count; attempt++) {
    const dx = rng.nextRange(-maxR, maxR), dy = rng.nextRange(-maxR, maxR);
    const d2 = dx * dx + dy * dy;
    if (d2 < minR * minR || d2 > maxR * maxR) continue;
    const x = ax + dx, y = ay + dy;
    if (!inBounds(state.map, x, y) || !tileFree(state, x, y)) continue;
    spawnEntity(state, { defId, player: 0, tileX: x, tileY: y });
    placed++;
  }
}

function paintDirtPatches(state: SimState, rng: SimRng): void {
  const { width, height, terrain } = state.map;
  const patches = Math.max(6, Math.floor((width * height) / 1200));
  for (let i = 0; i < patches; i++) {
    const cx = rng.nextInt(width), cy = rng.nextInt(height);
    const r = rng.nextRange(2, 5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inBounds(state.map, x, y)) continue;
        if (rng.chance(3, 4)) terrain[y * width + x] = T_DIRT;
      }
    }
  }
}

/** One edge-to-edge meandering river with three wide, permanently open fords. */
function paintRiver(state: SimState, rng: SimRng): void {
  const { width, height, terrain } = state.map;
  const vertical = rng.chance(1, 2);
  const length = vertical ? height : width;
  const breadth = vertical ? width : height;
  const centers = new Int16Array(length);
  const minCenter = Math.floor((breadth * 2) / 5);
  const maxCenter = Math.floor((breadth * 3) / 5);
  let center = rng.nextRange(minCenter, maxCenter);
  let drift = rng.nextRange(-1, 1);

  const indexAt = (along: number, across: number): number =>
    vertical ? along * width + across : across * width + along;

  for (let along = 0; along < length; along++) {
    if (along % 5 === 0) {
      drift = Math.max(-1, Math.min(1, drift + rng.nextRange(-1, 1)));
      if (drift === 0 && rng.chance(1, 3)) drift = rng.chance(1, 2) ? -1 : 1;
    }
    center = Math.max(minCenter, Math.min(maxCenter, center + drift));
    if (center === minCenter) drift = 1;
    else if (center === maxCenter) drift = -1;
    centers[along] = center;

    // Sand banks make the river readable; the three inner tiles are deep water.
    for (let across = center - 3; across <= center + 3; across++) {
      if (across < 0 || across >= breadth) continue;
      terrain[indexAt(along, across)] = Math.abs(across - center) <= 1 ? T_WATER : T_SAND;
    }
  }

  // A three-tile-wide ford at each quarter keeps both banks strategically connected.
  for (const fraction of [1, 2, 3]) {
    const ford = Math.floor((length * fraction) / 4);
    for (let along = Math.max(0, ford - 1); along <= Math.min(length - 1, ford + 1); along++) {
      const centerAtFord = centers[along];
      for (let across = centerAtFord - 2; across <= centerAtFord + 2; across++) {
        if (across < 0 || across >= breadth) continue;
        const index = indexAt(along, across);
        if (terrain[index] === T_WATER || terrain[index] === T_SAND) terrain[index] = T_SHALLOWS;
      }
    }
  }
}

function nearAnchor(
  anchors: Array<{ x: number; y: number }>, x: number, y: number, radius: number,
): boolean {
  return anchors.some((a) => {
    const dx = x - a.x, dy = y - a.y;
    return dx * dx + dy * dy < radius * radius;
  });
}

/** Broken 2–3-tile-thick ridges: every ridge has a deliberate pass and open ends. */
function paintCliffs(
  state: SimState, rng: SimRng, anchors: Array<{ x: number; y: number }>,
): void {
  const { width, height, terrain } = state.map;
  const ridgeCount = Math.max(2, Math.floor((width * height) / 4200));
  const directions = [
    { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 },
  ] as const;

  for (let ridge = 0; ridge < ridgeCount; ridge++) {
    const direction = directions[rng.nextInt(directions.length)];
    const perpendicular = { x: -direction.y, y: direction.x };
    const length = rng.nextRange(16, 28);
    let cx = rng.nextRange(12, width - 13);
    let cy = rng.nextRange(12, height - 13);
    for (let attempt = 0; attempt < 20 && nearAnchor(anchors, cx, cy, START_ZONE_RADIUS); attempt++) {
      cx = rng.nextRange(12, width - 13);
      cy = rng.nextRange(12, height - 13);
    }
    const gap = rng.nextRange(-3, 3);
    let bend = 0;

    for (let step = -(length >> 1); step <= (length >> 1); step++) {
      if (Math.abs(step - gap) <= 1) continue; // at least a three-tile pass
      if ((step + length) % 6 === 0) bend = Math.max(-2, Math.min(2, bend + rng.nextRange(-1, 1)));
      const baseX = cx + direction.x * step + perpendicular.x * bend;
      const baseY = cy + direction.y * step + perpendicular.y * bend;
      for (let thickness = -1; thickness <= 1; thickness++) {
        const x = baseX + perpendicular.x * thickness;
        const y = baseY + perpendicular.y * thickness;
        if (x < 4 || y < 4 || x >= width - 4 || y >= height - 4) continue;
        if (nearAnchor(anchors, x, y, START_ZONE_RADIUS - 2)) continue;
        const index = y * width + x;
        if (terrain[index] === T_WATER || terrain[index] === T_SHALLOWS) continue;
        terrain[index] = T_CLIFF;
      }
    }
  }
}

function terrainTilePassable(map: GameMap, index: number): boolean {
  const id = map.terrainIds[map.terrain[index]];
  return id !== 'water' && id !== 'cliff';
}

/** 4-way flood: stricter than movement, so diagonal corner contact cannot fake access. */
function floodTerrain(map: GameMap, start: number): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  const queue = [start];
  seen[start] = 1;
  while (queue.length > 0) {
    const index = queue.pop()!;
    const x = index % map.width, y = (index / map.width) | 0;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const next = ny * map.width + nx;
      if (!seen[next] && terrainTilePassable(map, next)) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Public invariant used by tests and future map generators. */
export function allPassableTerrainConnected(map: GameMap): boolean {
  let start = -1;
  for (let i = 0; i < map.terrain.length; i++) {
    if (terrainTilePassable(map, i)) { start = i; break; }
  }
  if (start < 0) return true;
  const seen = floodTerrain(map, start);
  for (let i = 0; i < map.terrain.length; i++) {
    if (terrainTilePassable(map, i) && !seen[i]) return false;
  }
  return true;
}

/** Convert a narrow blocked route into grass (cliff) or shallows (water). */
function carveTerrainCorridor(state: SimState, from: number, to: number): void {
  const { map } = state;
  let x = from % map.width, y = (from / map.width) | 0;
  const x1 = to % map.width, y1 = (to / map.width) | 0;
  const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y);
  const stepX = x < x1 ? 1 : -1, stepY = y < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const index = ny * map.width + nx;
        if (map.terrain[index] === T_WATER) map.terrain[index] = T_SHALLOWS;
        else if (map.terrain[index] === T_CLIFF) map.terrain[index] = T_GRASS;
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += stepX; }
    if (e2 < dx) { err += dx; y += stepY; }
  }
}

/** Repair any land pocket by cutting a pass or adding a ford to the main component. */
function ensureTerrainConnectivity(state: SimState): void {
  const { map } = state;
  for (let pass = 0; pass < 64; pass++) {
    let start = -1;
    for (let i = 0; i < map.terrain.length; i++) {
      if (terrainTilePassable(map, i)) { start = i; break; }
    }
    if (start < 0) break;
    const seen = floodTerrain(map, start);
    let pocket = -1;
    for (let i = 0; i < map.terrain.length; i++) {
      if (terrainTilePassable(map, i) && !seen[i]) { pocket = i; break; }
    }
    if (pocket < 0) {
      state.walkTerrain = buildWalkTerrain(map);
      return;
    }

    const px = pocket % map.width, py = (pocket / map.width) | 0;
    let nearest = start, nearestD = Infinity;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i]) continue;
      const dx = (i % map.width) - px, dy = ((i / map.width) | 0) - py;
      const distance = dx * dx + dy * dy;
      if (distance < nearestD) { nearestD = distance; nearest = i; }
    }
    carveTerrainCorridor(state, pocket, nearest);
  }
  state.walkTerrain = buildWalkTerrain(map);
  if (!allPassableTerrainConnected(map)) throw new Error('mapgen failed to connect every land region');
}

function growForests(state: SimState, rng: SimRng, anchors: Array<{ x: number; y: number }>): void {
  const { width, height } = state.map;
  const nearStart = (x: number, y: number): boolean =>
    anchors.some((a) => {
      const dx = x - a.x, dy = y - a.y;
      return dx * dx + dy * dy < START_ZONE_RADIUS * START_ZONE_RADIUS;
    });

  // border belt (with random gaps — natural clearings at the map edge)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge > 2) continue;
      if (nearStart(x, y)) continue;
      if (!tileFree(state, x, y)) continue;
      if (rng.chance(edge === 0 ? 9 : 6, 10)) {
        spawnEntity(state, { defId: 'tree', player: 0, tileX: x, tileY: y });
      }
    }
  }

  // interior blobs
  const blobs = Math.max(10, Math.floor((width * height) / 500));
  for (let i = 0; i < blobs; i++) {
    const cx = rng.nextRange(4, width - 5), cy = rng.nextRange(4, height - 5);
    if (nearStart(cx, cy)) continue;
    const r = rng.nextRange(2, 5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inBounds(state.map, x, y) || nearStart(x, y) || !tileFree(state, x, y)) continue;
        if (rng.chance(4, 5)) spawnEntity(state, { defId: 'tree', player: 0, tileX: x, tileY: y });
      }
    }
  }
}

/** BFS reachability over walkable tiles from one seed tile. */
function floodReach(state: SimState, sx: number, sy: number): Uint8Array {
  const { width, height } = state.map;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [tileIndex(state.map, sx, sy)];
  seen[queue[0]] = 1;
  while (queue.length > 0) {
    const t = queue.pop()!;
    const tx = t % width, ty = (t / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tx + dx, y = ty + dy;
        if (!isTileWalkable(state, x, y)) continue;
        const nt = y * width + x;
        if (!seen[nt]) { seen[nt] = 1; queue.push(nt); }
      }
    }
  }
  return seen;
}

/** Clear trees along a corridor between two points (Bresenham, radius 1). */
function carveCorridor(state: SimState, x0: number, y0: number, x1: number, y1: number): void {
  const treesAt = new Map<number, number>(); // tile -> entity id
  for (const e of state.entities.values()) {
    if (e.kind === 'resource' && e.defId === 'tree') {
      treesAt.set(tileIndex(state.map, e.tileX, e.tileY), e.id);
    }
  }
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1, stepY = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const id = treesAt.get(tileIndex(state.map, x + ox, y + oy));
        if (id !== undefined && inBounds(state.map, x + ox, y + oy)) removeEntity(state, id);
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += stepX; }
    if (e2 < dx) { err += dx; y += stepY; }
  }
}

/** Nearest reached walkable tile to (x, y) — the shortest corridor target. */
function nearestReachedTile(
  state: SimState, reach: Uint8Array, x: number, y: number,
): { x: number; y: number } | null {
  const { width } = state.map;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < reach.length; i++) {
    if (!reach[i]) continue;
    const dx = (i % width) - x, dy = ((i / width) | 0) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best < 0 ? null : { x: best % width, y: (best / width) | 0 };
}

/**
 * Guarantee every gate (TC access tiles + resource-cluster harvest tiles) can reach
 * gates[0], clearing tree corridors as needed. Each unreached gate carves toward the
 * nearest already-reached tile, so successive passes converge even when a straight
 * line to gates[0] would cross unremovable blockers (mines, TCs).
 */
function ensureReachability(state: SimState, gates: Array<{ x: number; y: number }>): void {
  for (let pass = 0; pass < 8; pass++) {
    const reach = floodReach(state, gates[0].x, gates[0].y);
    let allReached = true;
    for (let i = 1; i < gates.length; i++) {
      if (!reach[tileIndex(state.map, gates[i].x, gates[i].y)]) {
        allReached = false;
        const target = nearestReachedTile(state, reach, gates[i].x, gates[i].y) ?? gates[0];
        carveCorridor(state, gates[i].x, gates[i].y, target.x, target.y);
      }
    }
    if (allReached) return;
  }
}

/**
 * A walkable tile adjacent to some tile of the cluster (the harvest access point).
 * If forest growth sealed the cluster completely, fells one adjacent tree to open one.
 */
function clusterGate(
  state: SimState, tiles: Array<{ x: number; y: number }>,
): { x: number; y: number } | null {
  for (const t of tiles) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (isTileWalkable(state, t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
      }
    }
  }
  for (const t of tiles) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = t.x + dx, y = t.y + dy;
        if (!inBounds(state.map, x, y)) continue;
        for (const e of state.entities.values()) {
          if (e.kind === 'resource' && e.defId === 'tree' && e.tileX === x && e.tileY === y) {
            removeEntity(state, e.id);
            return { x, y };
          }
        }
      }
    }
  }
  return null; // cluster ringed entirely by other resources/buildings (not seen in practice)
}

/** Generate the practice map into a freshly initialized SimState (players already set up). */
export function generatePracticeMap(state: SimState, rng: SimRng): void {
  const { width, height } = state.map;
  const playerCount = state.players.length - 1; // minus gaia

  paintDirtPatches(state, rng.fork(101));

  const anchors = playerAnchors(rng.fork(102), width, height, playerCount);
  paintRiver(state, rng.fork(105));
  paintCliffs(state, rng.fork(106), anchors);
  ensureTerrainConnectivity(state);

  // player starts BEFORE forests so start layouts never fight the treeline
  const resourceClusters: Array<Array<{ x: number; y: number }>> = [];
  const addCluster = (tiles: Array<{ x: number; y: number }>): void => {
    if (tiles.length > 0) resourceClusters.push(tiles);
  };
  const tcDefSize = gameData.buildings.townCenter.size;
  for (let p = 1; p <= playerCount; p++) {
    const a = anchors[p - 1];
    const rp = rng.fork(200 + p);
    const tcX = Math.max(2, Math.min(width - tcDefSize - 2, a.x - (tcDefSize >> 1)));
    const tcY = Math.max(2, Math.min(height - tcDefSize - 2, a.y - (tcDefSize >> 1)));
    spawnEntity(state, { defId: 'townCenter', player: p, tileX: tcX, tileY: tcY });

    // 3 villagers south of the TC, scout to the east
    for (let i = 0; i < 3; i++) {
      const direct = { x: tcX + i + 1, y: tcY + tcDefSize };
      const spot = tileFree(state, direct.x, direct.y)
        ? direct
        : findFreeAdjacentTile(state, tcX, tcY, tcDefSize) ?? direct;
      spawnEntity(state, { defId: 'villager', player: p, tileX: spot.x, tileY: spot.y });
    }
    const scoutSpot = findFreeAdjacentTile(state, tcX + tcDefSize, tcY, 1) ?? { x: tcX + tcDefSize + 1, y: tcY };
    spawnEntity(state, { defId: 'scout', player: p, tileX: scoutSpot.x, tileY: scoutSpot.y });

    addCluster(placeCluster(state, rp, a.x, a.y, 6, 9, 5 + rp.nextInt(2), 'berryBush')); // 5–6 berries
    addCluster(placeCluster(state, rp, a.x, a.y, 9, 13, 6 + rp.nextInt(2), 'goldMine')); // 6–7 main gold
    addCluster(placeCluster(state, rp, a.x, a.y, 14, 19, 4, 'goldMine')); // secondary gold
    addCluster(placeCluster(state, rp, a.x, a.y, 10, 15, 4 + rp.nextInt(2), 'stoneMine')); // 4–5 stone
    addCluster(placeCluster(state, rp, a.x, a.y, 16, 21, 3, 'stoneMine')); // small secondary stone
  }

  // neutral extra golds near the middle
  const midRng = rng.fork(103);
  const mx = width >> 1, my = height >> 1;
  addCluster(placeCluster(state, midRng, mx, my, 2, 10, 4, 'goldMine'));
  addCluster(placeCluster(state, midRng, mx, my, 4, 14, 4, 'goldMine'));

  growForests(state, rng.fork(104), anchors);

  // animals AFTER forests (they don't block tiles, so trees must not grow over them)
  for (let p = 1; p <= playerCount; p++) {
    const a = anchors[p - 1];
    const ra = rng.fork(300 + p);
    placeAnimals(state, ra, a.x, a.y, 4, 8, 4, 'sheep'); // 4 sheep nearby
    placeAnimals(state, ra, a.x, a.y, 11, 16, 3, 'deer'); // scattered deer
    placeAnimals(state, ra, a.x, a.y, 22, 30, 2, 'wolf'); // 2 distant wolves
  }

  // gates: a free tile beside each TC plus one harvest tile per resource cluster
  // (players' berries/gold/stone AND the mid golds), then guarantee mutual reachability —
  // forests must never wall off one player's resources while the opponent's stay open
  const gates: Array<{ x: number; y: number }> = [];
  for (const e of state.entities.values()) {
    if (e.kind === 'building' && e.defId === 'townCenter') {
      const gate = findFreeAdjacentTile(state, e.tileX, e.tileY, tcDefSize, 6);
      if (gate) gates.push(gate);
    }
  }
  for (const tiles of resourceClusters) {
    const gate = clusterGate(state, tiles);
    if (gate) gates.push(gate);
  }
  if (gates.length > 1) ensureReachability(state, gates);
}
