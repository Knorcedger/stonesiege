// Practice random-map generation, AoE2 "Arabia"-style fair starts. Seeded and fully
// deterministic: players in spaced quadrants; each start gets TC + 3 villagers + scout,
// 4 sheep, a berry patch, main + secondary gold, stone (+ small secondary), nearby deer
// and two distant wolves. Forest blobs with clearings avoid start zones, extra neutral
// golds sit near the middle, and a carve pass guarantees every TC AND every resource
// cluster (players' + mid golds) can be reached — forests never wall anything off.

import { gameData } from '@bf/data';
import type { GameMap, TerrainId } from './types';
import { inBounds, isTileWalkable, tileIndex } from './internal';
import type { SimState } from './internal';
import type { SimRng } from './rng';
import { findFreeAdjacentTile, removeEntity, spawnEntity } from './entities';

export const TERRAIN_IDS: readonly TerrainId[] = [
  'grass', 'dirt', 'sand', 'water', 'shallows', 'road', 'farmland', 'snow',
];
const T_GRASS = 0;
const T_DIRT = 1;
const T_WATER = 3;

export function terrainPassable(terrainIndex: number): boolean {
  return terrainIndex !== T_WATER;
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
  return isTileWalkable(state, x, y);
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
