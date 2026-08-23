// Chunked terrain layer: 16x16-tile chunks baked to RenderTextures, with
// per-tile variants and baked edge-transition frames per ASSET_CONTRACT §naming
// (`terr/<hi>_<lo>/<edge>/<variant>`). Only dirty chunks rebake; offscreen chunks
// are LRU-evicted to bound GPU memory.
//
// Two presentation-only rules run on top of the sim terrain (the sim map, the
// minimap and pathing never see them): a road is drawn as a ribbon lying on the
// ground around it, picked per run direction and joint so the track threads and
// meanders from tile to tile, and a shallows band carrying a route across a
// channel draws as `ford` — a stony bed under the water — so a player following a
// road to a river can see where it is crossable.

import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { GameMap } from '@bf/sim/types';
import { HALF_H, HALF_W } from './camera';
import type { GameAssets } from './assets';

export const CHUNK_TILES = 16;
const MAX_BAKED_CHUNKS = 30;

/**
 * Terrain priority (high bleeds over low) — ART_BIBLE §3.2 order, extended with
 * the sim-only terrains exactly as the generated terrain.json transition pairs
 * imply: cliff > farmland > (forest) > snow > grass > dirt > sand > shallows > water.
 * `road` is absent on purpose: it lies on its ground and blends as that ground.
 */
const TERRAIN_PRIORITY: Record<string, number> = {
  cliff: 9, farmland: 7, forest: 6, snow: 5,
  grass: 4, dirt: 3, sand: 2, shallows: 1, water: 0,
};

/** Distinct salts per edge: 'ne'/'se' and 'sw'/'nw' share both of their letters. */
const EDGE_SALT: Record<string, number> = { ne: 11, se: 23, sw: 37, nw: 53 };

/** The four edges of a tile, as [dx, dy, edge] toward the neighbour across each. */
const TILE_EDGES: ReadonlyArray<readonly [number, number, string]> = [
  [0, -1, 'ne'], [1, 0, 'se'], [0, 1, 'sw'], [-1, 0, 'nw'],
];

/** What a road ribbon may be drawn over — the ground the track was worn into. */
const ROAD_GROUND = ['grass', 'dirt', 'sand', 'snow', 'farmland'];

/** How far to look for that ground before calling a road tile a bridge deck. */
const ROAD_GROUND_REACH = 4;

/** How far along each axis a road's run direction is measured. */
const ROAD_RUN_REACH = 3;

/** Surface variants per road joint (`terr/road-<axis>/<in><out>/<v>`). */
const ROAD_JOINT_VARIANTS = 3;

/** Track offsets a road may cross a tile edge at (indices into the baked art). */
const ROAD_JOINT_OFFSETS = 3;

/** Surface variants per bend corner (`terr/road-bend/<corner>/<arms>/<v>`). */
const ROAD_BEND_VARIANTS = 2;

/** Variants of the half-tile fill wedge (`terr/road-fill/<edge>/<v>`). */
const ROAD_FILL_VARIANTS = 2;

/** Stable per-tile hash — the same tile always weathers (or does not) the same way. */
function tileHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(salt + 1, 83492791)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** How far a ford may reach through shallows before it stops being a crossing. */
const FORD_REACH = 32;

/**
 * Tiles of every `shallows` band that carries a route across a water channel — a
 * ford — as a Set of tile indices.
 *
 * Decided per tile, and both halves of the test matter. ACROSS the crossing, the
 * first thing that is not shallows must be water on BOTH sides: that is what makes
 * it a channel rather than a shore, and it is what rejects the rim of a lake or an
 * island, which has land on its outer side all the way round. ALONG the crossing,
 * one side must reach dry land through shallows: that is the bank you are wading
 * to. A shallows lane running down the middle of a channel reaches neither bank
 * and stays ordinary shallow water.
 *
 * Pure function of the map, exported for tests; the renderer computes it once.
 */
export function fordTiles(map: GameMap): Set<number> {
  const idOf = (x: number, y: number): string | null => (
    x < 0 || y < 0 || x >= map.width || y >= map.height
      ? null
      : map.terrainIds[map.terrain[y * map.width + x]] ?? null
  );
  /** First terrain that is not shallows in one direction, within reach. */
  const beyond = (x: number, y: number, dx: number, dy: number): string | null => {
    for (let step = 1; step <= FORD_REACH; step++) {
      const terrain = idOf(x + dx * step, y + dy * step);
      if (terrain !== 'shallows') return terrain;
    }
    return null;
  };
  const isLand = (terrain: string | null): boolean => terrain !== null && terrain !== 'water';

  const fords = new Set<number>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (idOf(x, y) !== 'shallows') continue;
      for (const [ax, ay] of [[1, 0], [0, 1]] as const) {
        const acrossOne = beyond(x, y, ay, ax);
        const acrossTwo = beyond(x, y, -ay, -ax);
        if (acrossOne !== 'water' || acrossTwo !== 'water') continue;
        if (!isLand(beyond(x, y, ax, ay)) && !isLand(beyond(x, y, -ax, -ay))) continue;
        fords.add(y * map.width + x);
        break;
      }
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
 * - a ford replaces the shallows carrying a crossing (see `fordTiles`);
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
    const west = road(-1, 0);
    const east = road(1, 0);
    const north = road(0, -1);
    const south = road(0, 1);
    // Exactly one neighbour per axis: the road turns here, and it turns on an arc.
    if ((west !== east) && (north !== south)) return 'road-bend';
    // One axis only still runs — a road ending at a ford or a gate, whose ruts
    // should reach its last tile. A lone tile keeps the scuffed junction tile.
    if (west || east) return 'road-x';
    if (north || south) return 'road-y';
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
 * Where the track crosses one tile edge, as an index into the baked road offsets.
 *
 * The edge is named by the tile on its far side, so both tiles sharing it compute
 * the same value: one tile's exit offset IS its neighbour's entry offset, and the
 * road meanders across the grid as one continuous line instead of a ruled one.
 * Bends and junctions always take the middle offset — their art crosses at the
 * edge midpoint — so a straight run meeting one lines up with it.
 */
function roadEdgeOffset(map: GameMap, x: number, y: number, dx: number, dy: number, fords: ReadonlySet<number>): number {
  const middle = (ROAD_JOINT_OFFSETS - 1) / 2;
  const straight = (tx: number, ty: number): boolean => {
    const family = displayTerrainId(map, tx, ty, fords);
    return family === 'road-x' || family === 'road-y';
  };
  if (!straight(x, y) || !straight(x + dx, y + dy)) return middle;
  const key = dx + dy > 0 ? [x + dx, y + dy] : [x, y];
  return tileHash(key[0], key[1], 7) % ROAD_JOINT_OFFSETS;
}

/**
 * Frame name (without the `terr/` prefix) for a road tile: a straight run carries
 * the joint it crosses each edge at, `road-<axis>/<entry><exit>/<variant>`; a bend
 * carries the two edges it turns between, `road-bend/<corner>/<variant>`.
 */
export function roadFrameName(
  map: GameMap, x: number, y: number, family: string, fords: ReadonlySet<number>,
): string {
  if (family === 'road-bend') {
    const road = (dx: number, dy: number): boolean => terrainIdAt(map, x + dx, y + dy) === 'road';
    const alongX = road(-1, 0) ? -1 : 1;
    const alongY = road(0, -1) ? -1 : 1;
    const corner = `${alongX < 0 ? 'nw' : 'se'}${alongY < 0 ? 'ne' : 'sw'}`;
    // What lies beyond each arm decides the tangent the curve leaves on: another
    // bend hands the track over mid-turn (draw the chord, so a staircase is one
    // straight diagonal), a straight run hands it over on its own axis.
    const arm = (dx: number, dy: number): string => (
      displayTerrainId(map, x + dx, y + dy, fords) === 'road-bend' ? 'b' : 's'
    );
    const arms = `${arm(alongX, 0)}${arm(0, alongY)}`;
    return `road-bend/${corner}/${arms}/${tileHash(x, y, 5) % ROAD_BEND_VARIANTS}`;
  }
  const [dx, dy] = family === 'road-x' ? [1, 0] : [0, 1];
  const entry = roadEdgeOffset(map, x, y, -dx, -dy, fords);
  const exit = roadEdgeOffset(map, x, y, dx, dy, fords);
  return `${family}/${entry}${exit}/${tileHash(x, y, 3) % ROAD_JOINT_VARIANTS}`;
}

/**
 * The edges a road tile's own track crosses — where the road comes in and goes
 * out. Everything else is the road's WIDTH: that is where a fill wedge belongs.
 */
export function roadGateEdges(map: GameMap, x: number, y: number, family: string): readonly string[] {
  if (family === 'road-x') return ['nw', 'se'];
  if (family === 'road-y') return ['ne', 'sw'];
  if (family === 'road-bend') {
    const road = (dx: number, dy: number): boolean => terrainIdAt(map, x + dx, y + dy) === 'road';
    return [road(-1, 0) ? 'nw' : 'se', road(0, -1) ? 'ne' : 'sw'];
  }
  return []; // a crossroads has no single run: every road neighbour widens it
}

/**
 * The ground a road tile's ribbon is drawn over: the nearest ordinary land
 * terrain around it, so a track worn across a meadow lies on grass and one across
 * a snowfield lies on snow. Roads are ribbons on the ground, not tile-shaped
 * patches — that is what lets a road stepping between the tile axes read as one
 * diagonal instead of a staircase of tile-sized jogs.
 *
 * `null` out in open water: that is an authored bridge or causeway, and it gets a
 * solid deck instead of a ribbon lying on ground that is not there.
 */
export function roadGroundId(map: GameMap, x: number, y: number): string | null {
  // Nearest first, and an edge neighbour before a corner one: a tile bedded on
  // the meadow it runs through must not pick up the marsh off its shoulder.
  for (let reach = 1; reach <= ROAD_GROUND_REACH * 2; reach++) {
    for (let dy = -ROAD_GROUND_REACH; dy <= ROAD_GROUND_REACH; dy++) {
      for (let dx = -ROAD_GROUND_REACH; dx <= ROAD_GROUND_REACH; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== reach) continue;
        const terrain = terrainIdAt(map, x + dx, y + dy);
        if (terrain !== null && ROAD_GROUND.includes(terrain)) return terrain;
      }
    }
  }
  return null;
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

  /** The ground tile a road ribbon is drawn over, or null over open water. */
  private groundFrame(x: number, y: number) {
    const ground = roadGroundId(this.map, x, y);
    if (ground === null) return null;
    const variants = this.variantCount(ground);
    const variant = variants > 0 ? ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % variants : 0;
    return this.assets.resolveFrame(`terr/${ground}/${variant}`);
  }

  /** One half-tile of bare road earth, toward `edge`. */
  private fillFrame(x: number, y: number, edge: string) {
    return this.assets.tryResolve(
      `terr/road-fill/${edge}/${tileHash(x, y, EDGE_SALT[edge] ?? 0) % ROAD_FILL_VARIANTS}`,
    );
  }

  /**
   * The tile's own frame: a road resolves to its run direction and joint so the
   * track threads through and meanders; everything else picks a variant by tile
   * coordinate. Anything the atlas is missing falls back to the plain tile.
   */
  private tileFrame(x: number, y: number, family: string) {
    if (family === 'road-x' || family === 'road-y' || family === 'road-bend') {
      const road = this.assets.tryResolve(`terr/${roadFrameName(this.map, x, y, family, this.fords)}`);
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
    // A road no longer transitions at all: it lies ON its ground, so the tile
    // blends with its neighbours exactly as that ground does. A bridge deck has
    // no ground and blends with nothing — its edge over the water is the deck's.
    if (terrain !== null && terrain.startsWith('road')) return roadGroundId(this.map, x, y);
    return terrain;
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
    return this.assets.tryResolve(`${prefix}/${tileHash(tileX, tileY, EDGE_SALT[edge] ?? 0) % count}`);
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

        // A road is a ribbon lying on the ground: paint the ground first, then
        // the track over it, so its silhouette is the track and not the diamond.
        // Where the road is wider than one tile, the half facing each road
        // neighbour is filled in, so the lanes merge into one band and only the
        // band's outer edge keeps the ribbon's frayed silhouette.
        if (terr.startsWith('road')) {
          const ground = this.groundFrame(tx, ty);
          if (ground) {
            const gspr = new Sprite(ground.texture);
            gspr.anchor.set(ground.anchorX, ground.anchorY);
            gspr.scale.set(ground.renderScale);
            gspr.position.set(lx, ly);
            temp.addChild(gspr);
          }
          // Fill the half of the tile facing each road neighbour ACROSS the road,
          // so a road wider than one tile is one band. Never along the run: those
          // two halves are the whole diamond, and filling them would put every
          // straight tile back to a tile-shaped patch. Out over open water there
          // is no ground to lie on, so fill every half and deck the bridge.
          const gates = roadGateEdges(this.map, tx, ty, terr);
          for (const [nx, ny, edge] of TILE_EDGES) {
            if (ground !== null
              && (gates.includes(edge) || this.terrainAt(tx + nx, ty + ny) !== 'road')) continue;
            const fill = this.fillFrame(tx, ty, edge);
            if (!fill) continue;
            const fspr = new Sprite(fill.texture);
            fspr.anchor.set(fill.anchorX, fill.anchorY);
            fspr.scale.set(fill.renderScale);
            fspr.position.set(lx, ly);
            temp.addChild(fspr);
          }
        }

        const frame = this.tileFrame(tx, ty, terr);
        const spr = new Sprite(frame.texture);
        spr.anchor.set(frame.anchorX, frame.anchorY);
        spr.scale.set(frame.renderScale);
        spr.position.set(lx, ly);
        temp.addChild(spr);

        // Edge transitions: higher-priority neighbors bleed a fringe into this tile.
        const myTerr = this.transitionTerrainAt(tx, ty) ?? terr;
        const myPrio = TERRAIN_PRIORITY[myTerr] ?? 1;
        for (const [dx, dy, edge] of TILE_EDGES) {
          const nTerr = this.transitionTerrainAt(tx + dx, ty + dy);
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
