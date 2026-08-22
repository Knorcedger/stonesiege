// Chunked terrain layer: 16x16-tile chunks baked to RenderTextures, with
// per-tile variants and baked edge-transition frames per ASSET_CONTRACT §naming
// (`terr/<hi>_<lo>/<edge>/<variant>`). Only dirty chunks rebake; offscreen chunks
// are LRU-evicted to bound GPU memory.
//
// Two presentation-only rules run on top of the sim terrain (the sim map, the
// minimap and pathing never see them): road borders weather into dirt so a track
// does not draw a ruler-straight line across the field, and a shallows band that
// spans a channel draws as `ford` — the road bed under the water — so a player
// following a road to a river can see where it is crossable.

import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { GameMap } from '@bf/sim/types';
import { HALF_H, HALF_W } from './camera';
import type { GameAssets } from './assets';

export const CHUNK_TILES = 16;
const MAX_BAKED_CHUNKS = 30;

/**
 * Terrain priority (high bleeds over low) — ART_BIBLE §3.2 order, extended with
 * the sim-only terrains exactly as the generated terrain.json transition pairs
 * imply: cliff > road > farmland > (forest) > snow > grass > dirt > sand > shallows > water.
 */
const TERRAIN_PRIORITY: Record<string, number> = {
  cliff: 9, road: 8, farmland: 7, forest: 6, snow: 5,
  grass: 4, dirt: 3, sand: 2, shallows: 1, water: 0,
};

/** Wet terrain: the material a crossing has to span. */
const WET_TERRAIN = new Set(['water', 'shallows']);

/** Terrains that creep back over the edge of a road they border (ART_BIBLE §3.2). */
const VERGE_TERRAINS = new Set(['grass', 'dirt', 'sand', 'snow']);

/** How far along each axis a road's run direction is measured. */
const ROAD_RUN_REACH = 3;

/** Surface variants per road joint (`terr/road-<axis>/<in><out>/<v>`). */
const ROAD_JOINT_VARIANTS = 3;

/** Track offsets a road may cross a tile edge at (indices into the baked art). */
const ROAD_JOINT_OFFSETS = 3;

/** Stable per-tile hash — the same tile always weathers (or does not) the same way. */
function tileHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Tiles of every `shallows` region that spans a water channel — a ford.
 *
 * A crossing is a shallows region with dry land reachable on both sides of one
 * axis and water on both sides of the other: exactly the shape of a shallow bar
 * carrying a route from bank to bank. A shallows fringe along a shore touches
 * land on one side only and is left as ordinary shallow water.
 *
 * Pure function of the map, exported for tests; the renderer computes it once.
 */
export function fordTiles(map: GameMap): Set<number> {
  const idOf = (x: number, y: number): string | null => (
    x < 0 || y < 0 || x >= map.width || y >= map.height
      ? null
      : map.terrainIds[map.terrain[y * map.width + x]] ?? null
  );
  const fords = new Set<number>();
  const seen = new Uint8Array(map.width * map.height);
  for (let y0 = 0; y0 < map.height; y0++) {
    for (let x0 = 0; x0 < map.width; x0++) {
      const start = y0 * map.width + x0;
      if (seen[start] || idOf(x0, y0) !== 'shallows') continue;
      const region: number[] = [];
      const queue = [start];
      seen[start] = 1;
      const land = { west: false, east: false, north: false, south: false };
      const water = { west: false, east: false, north: false, south: false };
      for (let i = 0; i < queue.length; i++) {
        const tile = queue[i];
        region.push(tile);
        const x = tile % map.width;
        const y = (tile / map.width) | 0;
        for (const [dx, dy, side] of [
          [-1, 0, 'west'], [1, 0, 'east'], [0, -1, 'north'], [0, 1, 'south'],
        ] as Array<[number, number, 'west' | 'east' | 'north' | 'south']>) {
          const neighbor = idOf(x + dx, y + dy);
          if (neighbor === null) continue;
          if (neighbor === 'shallows') {
            const next = (y + dy) * map.width + (x + dx);
            if (!seen[next]) { seen[next] = 1; queue.push(next); }
          } else if (neighbor === 'water') water[side] = true;
          else land[side] = true;
        }
      }
      const spansX = land.west && land.east && water.north && water.south;
      const spansY = land.north && land.south && water.west && water.east;
      if (spansX || spansY) for (const tile of region) fords.add(tile);
    }
  }
  return fords;
}

/** Terrain id at a tile, or null off the map. */
function terrainIdAt(map: GameMap, x: number, y: number): string | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.terrainIds[map.terrain[y * map.width + x]] ?? null;
}

/**
 * The frame family a tile is DRAWN with, given the map and its ford tiles.
 *
 * Two presentation-only rules, both pure functions of the map so every client
 * draws the same field:
 *
 * - a ford replaces the shallows it crosses (see `fordTiles`);
 * - a road draws with the family for the axis it runs along, so its crown, cart
 *   ruts and verges are continuous from tile to tile. The oriented art is laid
 *   out on the line joining the two edge midpoints the road passes through, and
 *   the next tile along the road sits exactly on that line, so the track threads
 *   through instead of restarting inside every diamond. A crossroads, a corner or
 *   a widening where neither axis wins keeps the scuffed junction tile.
 *
 * Everything else draws as the terrain the map authored.
 */
export function displayTerrainId(
  map: GameMap, x: number, y: number, fords: ReadonlySet<number>,
): string | null {
  const terrain = terrainIdAt(map, x, y);
  if (terrain === 'shallows') return fords.has(y * map.width + x) ? 'ford' : terrain;
  if (terrain !== 'road') return terrain;
  const road = (dx: number, dy: number): boolean => terrainIdAt(map, x + dx, y + dy) === 'road';
  const throughX = road(-1, 0) && road(1, 0);
  const throughY = road(0, -1) && road(0, 1);
  if (throughX !== throughY) return throughX ? 'road-x' : 'road-y';
  if (!throughX) {
    // A stub, a bend or a lone tile. One axis only still runs — that is a road
    // ending at a ford or a gate, and its ruts should reach the last tile — but
    // a bend, a crossroads and an island all take the scuffed junction tile.
    const hasX = road(-1, 0) || road(1, 0);
    const hasY = road(0, -1) || road(0, 1);
    if (hasX && !hasY) return 'road-x';
    if (hasY && !hasX) return 'road-y';
    return terrain;
  }
  // Through on both axes: a wide road, or a genuine crossroads. Whichever axis
  // the road runs further along wins; a true crossroads ties and stays a junction.
  let alongX = 0;
  let alongY = 0;
  for (let step = 1; step <= ROAD_RUN_REACH; step++) {
    if (road(-step, 0)) alongX++;
    if (road(step, 0)) alongX++;
    if (road(0, -step)) alongY++;
    if (road(0, step)) alongY++;
  }
  if (alongX > alongY) return 'road-x';
  if (alongY > alongX) return 'road-y';
  return terrain;
}

/**
 * Where the track crosses the edge INTO this tile, as an index into the baked
 * road offsets. Derived from the tile's own coordinates, so the neighbour along
 * the road computes the same value for the edge they share: the exit offset of
 * one tile is the entry offset of the next, and the road meanders across the grid
 * as one continuous line instead of a ruled one.
 */
function roadOffsetAt(x: number, y: number): number {
  return tileHash(x, y, 7) % ROAD_JOINT_OFFSETS;
}

/**
 * Frame name (without the `terr/` prefix) for a road tile drawn along one axis:
 * `road-<axis>/<entry><exit>/<variant>`.
 */
export function roadFrameName(x: number, y: number, family: 'road-x' | 'road-y'): string {
  const axis = family === 'road-x' ? [1, 0] : [0, 1];
  const entry = roadOffsetAt(x, y);
  const exit = roadOffsetAt(x + axis[0], y + axis[1]);
  return `${family}/${entry}${exit}/${tileHash(x, y, 3) % ROAD_JOINT_VARIANTS}`;
}

/**
 * Which verge depth an edge of a road tile gets: the side the track meanders away
 * from is reclaimed deeper, so the bare earth is a ribbon that follows the road
 * instead of a band of fixed width. Edges that are not a road's flank (and tiles
 * with no run direction) fall back to a stable per-tile pick.
 */
export function vergeVariantIndex(
  x: number, y: number, edge: string, family: string | null, count: number,
): number {
  if (count <= 1) return 0;
  if (family === 'road-x' || family === 'road-y') {
    const step = family === 'road-x' ? [1, 0] : [0, 1];
    const swing = roadOffsetAt(x, y) + roadOffsetAt(x + step[0], y + step[1]) - (ROAD_JOINT_OFFSETS - 1);
    const near = family === 'road-x' ? 'ne' : 'nw';
    const far = family === 'road-x' ? 'sw' : 'se';
    if (edge === near || edge === far) {
      const away = edge === near ? swing > 0 : swing < 0;
      if (swing !== 0) return away ? count - 1 : 0;
      return Math.floor((count - 1) / 2);
    }
  }
  return tileHash(x, y, edge.charCodeAt(1)) % count;
}

/**
 * The neighbour terrain creeping over this tile's edge, per edge, or null.
 *
 * Edge transitions only run high priority into low, so a road — the second
 * highest terrain there is — would otherwise be the one thing in the game with
 * an edge nothing encroaches on. Grass, dirt, sand and snow bite back into a
 * road's margin, and the two interlock instead of meeting on a ruled line.
 */
export function vergeTerrainId(map: GameMap, x: number, y: number, edgeX: number, edgeY: number): string | null {
  if (terrainIdAt(map, x, y) !== 'road') return null;
  const neighbor = terrainIdAt(map, x + edgeX, y + edgeY);
  return neighbor !== null && VERGE_TERRAINS.has(neighbor) ? neighbor : null;
}

interface Chunk {
  cx: number;
  cy: number;
  rt: RenderTexture;
  sprite: Sprite;
  lastUsed: number;
}

function chunkKey(cx: number, cy: number): number {
  return cy * 1024 + cx;
}

export class TerrainLayer {
  readonly container = new Container();
  private chunks = new Map<number, Chunk>();
  private dirty = new Set<number>();
  private frame = 0;
  private variantCounts = new Map<string, number>();
  private chunksX: number;
  private chunksY: number;
  private fords: Set<number>;

  constructor(
    private renderer: Renderer,
    private assets: GameAssets,
    private map: GameMap,
  ) {
    this.chunksX = Math.ceil(map.width / CHUNK_TILES);
    this.chunksY = Math.ceil(map.height / CHUNK_TILES);
    this.fords = fordTiles(map);
  }

  /** Mark a tile's chunk (and boundary neighbors) for rebake. */
  markTileDirty(tileX: number, tileY: number): void {
    const cx = Math.floor(tileX / CHUNK_TILES);
    const cy = Math.floor(tileY / CHUNK_TILES);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < this.chunksX && ny < this.chunksY) {
          // Only boundary tiles affect neighbors, but rebake is cheap and rare.
          if (dx === 0 && dy === 0) this.dirty.add(chunkKey(nx, ny));
          else if (
            tileX % CHUNK_TILES === (dx === 1 ? CHUNK_TILES - 1 : dx === -1 ? 0 : tileX % CHUNK_TILES) &&
            tileY % CHUNK_TILES === (dy === 1 ? CHUNK_TILES - 1 : dy === -1 ? 0 : tileY % CHUNK_TILES)
          ) {
            this.dirty.add(chunkKey(nx, ny));
          }
        }
      }
    }
  }

  /** Ensure chunks intersecting the world-view rect exist/are fresh; cull + evict others. */
  update(view: { x0: number; y0: number; x1: number; y1: number }): void {
    this.frame++;
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const b = this.chunkBounds(cx, cy);
        const visible = b.x1 >= view.x0 && b.x0 <= view.x1 && b.y1 >= view.y0 && b.y0 <= view.y1;
        const key = chunkKey(cx, cy);
        let chunk = this.chunks.get(key);
        if (visible) {
          if (!chunk) {
            chunk = this.createChunk(cx, cy);
            this.chunks.set(key, chunk);
            this.bakeChunk(chunk);
          } else if (this.dirty.has(key)) {
            this.bakeChunk(chunk);
          }
          this.dirty.delete(key);
          chunk.sprite.visible = true;
          chunk.lastUsed = this.frame;
        } else if (chunk) {
          chunk.sprite.visible = false;
        }
      }
    }
    // LRU eviction
    if (this.chunks.size > MAX_BAKED_CHUNKS) {
      const sorted = [...this.chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      while (this.chunks.size > MAX_BAKED_CHUNKS) {
        const [key, chunk] = sorted.shift()!;
        if (chunk.lastUsed === this.frame) break; // everything left is visible
        this.container.removeChild(chunk.sprite);
        chunk.sprite.destroy();
        chunk.rt.destroy(true);
        this.chunks.delete(key);
      }
    }
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) {
      chunk.sprite.destroy();
      chunk.rt.destroy(true);
    }
    this.chunks.clear();
    this.container.destroy({ children: true });
  }

  private chunkBounds(cx: number, cy: number): { x0: number; y0: number; x1: number; y1: number } {
    const x0t = cx * CHUNK_TILES;
    const y0t = cy * CHUNK_TILES;
    const x1t = Math.min(this.map.width, x0t + CHUNK_TILES);
    const y1t = Math.min(this.map.height, y0t + CHUNK_TILES);
    return {
      x0: (x0t - y1t) * HALF_W,
      y0: (x0t + y0t) * HALF_H,
      x1: (x1t - y0t) * HALF_W,
      y1: (x1t + y1t) * HALF_H,
    };
  }

  private createChunk(cx: number, cy: number): Chunk {
    const b = this.chunkBounds(cx, cy);
    // Terrain is baked at 2x so HD material detail survives the chunk cache and
    // remains visible at camera zoom 2/3 instead of being flattened to 1x first.
    const rt = RenderTexture.create({
      width: Math.ceil(b.x1 - b.x0),
      height: Math.ceil(b.y1 - b.y0),
      resolution: 2,
    });
    rt.source.scaleMode = 'linear';
    const sprite = new Sprite(rt);
    sprite.position.set(b.x0, b.y0);
    this.container.addChild(sprite);
    return { cx, cy, rt, sprite, lastUsed: this.frame };
  }

  private terrainAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.map.terrainIds[this.map.terrain[y * this.map.width + x]] ?? null;
  }

  /**
   * Display family for a tile, with an atlas fallback: an atlas that ships
   * without the ford tile (the dev mock, an older build) keeps drawing shallow
   * water. Road families fall back inside `tileFrame`, which knows the joint.
   */
  private displayTerrainAt(x: number, y: number): string | null {
    const terrain = displayTerrainId(this.map, x, y, this.fords);
    if (terrain === 'ford' && this.variantCount('ford') === 0) return 'shallows';
    return terrain;
  }

  /**
   * The tile's own frame: a road resolves to its run direction and joint so the
   * track threads through and meanders; everything else picks a variant by tile
   * coordinate. Anything the atlas is missing falls back to the plain tile.
   */
  private tileFrame(x: number, y: number, family: string) {
    if (family === 'road-x' || family === 'road-y') {
      const road = this.assets.tryResolve(`terr/${roadFrameName(x, y, family)}`);
      if (road) return road;
      family = 'road';
    }
    const variants = this.variantCount(family);
    const variant = variants > 0 ? ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % variants : 0;
    return this.assets.resolveFrame(`terr/${family}/${variant}`);
  }

  /**
   * Frame family used for edge transitions and priority: the presentation
   * families bleed exactly like the sim terrain they stand in for.
   */
  private transitionTerrainAt(x: number, y: number): string | null {
    const terrain = this.displayTerrainAt(x, y);
    if (terrain === 'ford') return 'shallows';
    if (terrain === 'road-x' || terrain === 'road-y') return 'road';
    return terrain;
  }

  /** One `terr/verge/<lo>/<edge>/<variant>` frame, or null when nothing creeps here. */
  private vergeFrame(x: number, y: number, edgeX: number, edgeY: number, edge: string, family: string | null) {
    const lo = vergeTerrainId(this.map, x, y, edgeX, edgeY);
    if (lo === null) return null;
    const prefix = `terr/verge/${lo}/${edge}`;
    let count = this.variantCounts.get(prefix);
    if (count === undefined) {
      count = 0;
      while (count < 8 && this.assets.tryResolve(`${prefix}/${count}`)) count++;
      this.variantCounts.set(prefix, count);
    }
    if (count === 0) return null;
    return this.assets.tryResolve(`${prefix}/${vergeVariantIndex(x, y, edge, family, count)}`);
  }

  /**
   * Baked fringe of `hi` over `lo` along one edge, picking a variant per tile so
   * the same wobble never repeats down a whole shoreline. Atlases without
   * variants (the dev mock, older builds) fall back to the unnumbered frame.
   */
  private transitionFrame(hi: string, lo: string, edge: string, tileX: number, tileY: number) {
    const prefix = `terr/${hi}_${lo}/${edge}`;
    let count = this.variantCounts.get(prefix);
    if (count === undefined) {
      count = 0;
      while (count < 8 && this.assets.tryResolve(`${prefix}/${count}`)) count++;
      this.variantCounts.set(prefix, count);
    }
    if (count === 0) return this.assets.tryResolve(prefix);
    return this.assets.tryResolve(`${prefix}/${tileHash(tileX, tileY, edge.charCodeAt(0)) % count}`);
  }

  private variantCount(terrainId: string): number {
    let n = this.variantCounts.get(terrainId);
    if (n === undefined) {
      n = 0;
      while (n < 8 && this.assets.tryResolve(`terr/${terrainId}/${n}`)) n++;
      this.variantCounts.set(terrainId, n);
    }
    return n;
  }

  private bakeChunk(chunk: Chunk): void {
    const b = this.chunkBounds(chunk.cx, chunk.cy);
    const temp = new Container();
    const x0t = chunk.cx * CHUNK_TILES;
    const y0t = chunk.cy * CHUNK_TILES;
    const x1t = Math.min(this.map.width, x0t + CHUNK_TILES);
    const y1t = Math.min(this.map.height, y0t + CHUNK_TILES);

    for (let ty = y0t; ty < y1t; ty++) {
      for (let tx = x0t; tx < x1t; tx++) {
        const terr = this.displayTerrainAt(tx, ty);
        if (!terr) continue;
        // tile diamond center in world coords, then chunk-local
        const cxw = (tx - ty) * HALF_W;
        const cyw = (tx + ty + 1) * HALF_H;
        const lx = cxw - b.x0;
        const ly = cyw - b.y0;

        const frame = this.tileFrame(tx, ty, terr);
        const spr = new Sprite(frame.texture);
        spr.anchor.set(frame.anchorX, frame.anchorY);
        spr.scale.set(frame.renderScale);
        spr.position.set(lx, ly);
        temp.addChild(spr);

        // Verges creep back over a road's own margin (nothing else outranks it).
        for (const [nx, ny, edge] of [
          [0, -1, 'ne'], [1, 0, 'se'], [0, 1, 'sw'], [-1, 0, 'nw'],
        ] as Array<[number, number, string]>) {
          const verge = this.vergeFrame(tx, ty, nx, ny, edge, terr);
          if (!verge) continue;
          const vspr = new Sprite(verge.texture);
          vspr.anchor.set(verge.anchorX, verge.anchorY);
          vspr.scale.set(verge.renderScale);
          vspr.position.set(lx, ly);
          temp.addChild(vspr);
        }

        // Edge transitions: higher-priority neighbors bleed a fringe into this tile.
        const myTerr = this.transitionTerrainAt(tx, ty) ?? terr;
        const myPrio = TERRAIN_PRIORITY[myTerr] ?? 1;
        const neighbors: Array<[number, number, string]> = [
          [tx, ty - 1, 'ne'],
          [tx + 1, ty, 'se'],
          [tx, ty + 1, 'sw'],
          [tx - 1, ty, 'nw'],
        ];
        for (const [nx, ny, edge] of neighbors) {
          const nTerr = this.transitionTerrainAt(nx, ny);
          if (!nTerr || nTerr === myTerr) continue;
          if ((TERRAIN_PRIORITY[nTerr] ?? 1) <= myPrio) continue;
          const trans = this.transitionFrame(nTerr, myTerr, edge, tx, ty);
          if (!trans) continue;
          const tspr = new Sprite(trans.texture);
          tspr.anchor.set(trans.anchorX, trans.anchorY);
          tspr.scale.set(trans.renderScale);
          tspr.position.set(lx, ly);
          temp.addChild(tspr);
        }
      }
    }

    this.renderer.render({ container: temp, target: chunk.rt, clear: true });
    temp.destroy({ children: true, texture: false });
  }
}
