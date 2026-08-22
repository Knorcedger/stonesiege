// Terrain tiles (ART_BIBLE §3.1) + baked edge transitions (§3.2) for every
// TerrainId in packages/sim (type-only import — safe under Node type stripping),
// plus the presentation-only `ford` tile the renderer swaps in where a shallows
// band crosses a river (§3.3) so a crossing reads as wadeable at a glance.

import type { TerrainId } from '../../../packages/sim/src/types.ts';
import { Raster, diamondRow, insideDiamond } from './raster.ts';
import { PALETTE } from './palette.ts';
import type { RGB } from './palette.ts';
import { Rng, hashString } from './util.ts';
import type { FrameDef } from './atlas.ts';

export const TILE_W = 64;
export const TILE_H = 32;

export interface TerrainSpec {
  id: TerrainId;
  /** higher paints over lower (ART_BIBLE §3.2 extended to the sim terrain set) */
  priority: number;
  variants: number;
  base: RGB;
}

/** Priority order: cliff > road > farmland > snow > grass > dirt > sand > shallows > water. */
export const TERRAINS: readonly TerrainSpec[] = [
  { id: 'cliff', priority: 8, variants: 3, base: PALETTE.stoneDark },
  // Roads are packed earth, a full ramp step darker than `sand` — a track worn
  // into the ground must not read as the same material as a river bank.
  { id: 'road', priority: 7, variants: 4, base: PALETTE.dirtLight },
  { id: 'farmland', priority: 6, variants: 2, base: PALETTE.dirtBase },
  { id: 'snow', priority: 5, variants: 3, base: PALETTE.highlight },
  { id: 'grass', priority: 4, variants: 4, base: PALETTE.grassBase },
  { id: 'dirt', priority: 3, variants: 3, base: PALETTE.dirtBase },
  { id: 'sand', priority: 2, variants: 3, base: PALETTE.dirtPale },
  { id: 'shallows', priority: 1, variants: 3, base: PALETTE.waterLight },
  { id: 'water', priority: 0, variants: 4, base: PALETTE.waterBase },
];

/**
 * Presentation-only tiles: no sim TerrainId, drawn by the renderer in place of the
 * sim terrain it decorates. `ford` replaces `shallows` on a crossing that spans a
 * channel — the stony causeway under the water is what makes a ford readable.
 */
export const PRESENTATION_TILES = [
  { id: 'ford', variants: 4 },
] as const;

/**
 * Road tiles are drawn per run direction and per joint, `terr/road-<axis>/<in><out>/<v>`.
 *
 * A road runs along one map axis, entering and leaving its tile at the midpoints
 * of two opposite edges. `in` and `out` index ROAD_OFFSETS: how far the track sits
 * off that midpoint where it crosses into the neighbouring tile. The renderer
 * derives both ends from the tiles themselves, so a tile's exit offset is its
 * neighbour's entry offset and the track wanders across the tile grid as one
 * continuous, meandering line — the last thing that still made a road read as
 * ruled with a straightedge.
 */
export const ROAD_AXES = ['x', 'y'] as const;
export type RoadAxis = (typeof ROAD_AXES)[number];
/** Track offset at a tile edge, in screen px across the road. */
export const ROAD_OFFSETS = [-4.5, 0, 4.5] as const;
/** Surface variants per joint; the last one is a stretch the traffic has abandoned. */
export const ROAD_JOINT_VARIANTS = 3;

/**
 * Bends (`terr/road-bend/<corner>/<arms>/<v>`): a road turning between the two
 * edges the corner names — `nw` west, `se` east, `ne` north, `sw` south — entering
 * and leaving at the edge midpoints, where a straight tile's track meets it.
 *
 * `arms` is what lies beyond each of those edges: `s` a straight run, `b` another
 * bend. The curve leaves each end along the tangent that arm wants, which is the
 * whole trick. A lone corner (`ss`) turns on a quarter arc, tangent to the two
 * straight runs. A road authored as a curve, though, steps between the axes a tile
 * at a time, and every one of those steps is a bend: drawn as arcs they bulge
 * alternately left and right and the road reads as a sawtooth, so a bend between
 * two bends (`bb`) draws the straight chord between its edge midpoints instead —
 * and a run of them is one straight diagonal on screen. Mixed arms (`sb`, `bs`)
 * ease from one into the other.
 */
/**
 * Fill wedges (`terr/road-fill/<edge>/<v>`): the half of a tile facing a road tile
 * next to it, in bare packed earth. A road wider than one tile is a row of
 * ribbons with the ground showing between them; each tile fills the half facing
 * its neighbour, so the lanes merge into one band while the band's outer edge
 * keeps the ribbon's frayed silhouette.
 */
export const ROAD_FILL_VARIANTS = 2;

export const ROAD_BENDS = ['nwne', 'nwsw', 'sene', 'sesw'] as const;
export type RoadBend = (typeof ROAD_BENDS)[number];
/** Arm pairs, in the corner's own edge order: straight/straight … bend/bend. */
export const ROAD_BEND_ARMS = ['ss', 'sb', 'bs', 'bb'] as const;
export const ROAD_BEND_VARIANTS = 2;

/** Transition variants per (hi, lo, edge) — a single frame would repeat its wobble on every tile. */
export const EDGE_VARIANTS = 2;

/**
 * All (hi, lo) pairs needing baked `terr/<hi>_<lo>/<edge>/<variant>` transition
 * frames. `road` takes no part: it is drawn as a ribbon over the ground it was
 * worn into (§3.3), so a road tile blends with its neighbours as that ground.
 */
export function edgePairs(): Array<[TerrainId, TerrainId]> {
  const pairs: Array<[TerrainId, TerrainId]> = [];
  for (const hi of TERRAINS) {
    for (const lo of TERRAINS) {
      if (hi.id === 'road' || lo.id === 'road') continue;
      if (hi.priority > lo.priority) pairs.push([hi.id, lo.id]);
    }
  }
  return pairs;
}

export const EDGES = ['nw', 'ne', 'sw', 'se'] as const;
export type Edge = (typeof EDGES)[number];

function inTile(x: number, y: number): boolean {
  return insideDiamond(x, y, TILE_W, TILE_H);
}

/** Rejection-sample a point inside the diamond (1px margin). */
function samplePoint(rng: Rng): [number, number] {
  for (;;) {
    const x = rng.int(1, TILE_W - 2);
    const y = rng.int(1, TILE_H - 2);
    if (inTile(x, y) && inTile(x - 1, y) && inTile(x + 1, y)) return [x, y];
  }
}

function baseDiamond(r: Raster, c: RGB): void {
  for (let y = 0; y < TILE_H; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) r.set(x, y, c);
  }
}

function speckle(r: Raster, rng: Rng, count: number, weighted: Array<[RGB, number]>): void {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  for (let i = 0; i < count; i++) {
    const [x, y] = samplePoint(rng);
    let roll = rng.next() * total;
    for (const [c, w] of weighted) {
      roll -= w;
      if (roll <= 0) {
        r.set(x, y, c);
        break;
      }
    }
  }
}

function grassTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.grassBase);
  speckle(r, rng, 70, [
    [PALETTE.grassLight, 60],
    [PALETTE.grassDark, 40],
  ]);
  const dashes = rng.int(4, 6);
  for (let i = 0; i < dashes; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.grassDark);
    if (inTile(x + 1, y)) r.set(x + 1, y, PALETTE.grassDark);
  }
  if (variant === 2) {
    for (let t = 0; t < 2; t++) {
      const [x, y] = samplePoint(rng);
      // 3px "Ʌ" tuft: light over dark
      r.set(x, y, PALETTE.grassDark);
      r.set(x - 1, y - 1, PALETTE.grassLight);
      r.set(x + 1, y - 1, PALETTE.grassLight);
      r.set(x, y - 1, PALETTE.grassLight);
    }
  }
  if (variant === 3) {
    const [cx, cy] = [rng.int(20, 44), rng.int(10, 22)];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!inTile(x, y)) continue;
        const edge = Math.abs(dx) === 2 || Math.abs(dy) === 1;
        if (!edge || Raster.ditherOn(x, y, 50)) r.set(x, y, PALETTE.dirtLight);
      }
    }
  }
}

function dirtTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.dirtBase);
  speckle(r, rng, 50, [
    [PALETTE.dirtDark, 50],
    [PALETTE.dirtLight, 30],
    [PALETTE.dirtPale, 20],
  ]);
  const pebbles = rng.int(3, 5);
  for (let i = 0; i < pebbles; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.dirtDark);
    if (inTile(x + 1, y)) r.set(x + 1, y, PALETTE.dirtDark);
    if (inTile(x, y - 1)) r.set(x, y - 1, PALETTE.dirtLight);
  }
  if (variant === 2) {
    let [x, y] = samplePoint(rng);
    const steps = rng.int(6, 10);
    for (let i = 0; i < steps; i++) {
      if (inTile(x, y)) r.set(x, y, PALETTE.dirtDark);
      x += rng.int(0, 1) ? 1 : 0;
      y += rng.int(-1, 1) >= 0 ? 0 : 1;
      x += 1;
    }
  }
}

function waterTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.waterBase);
  // 3 shimmer bands, dash 4 gap 6, x-offset shifts +2 per variant
  for (const bandY of [8, 16, 24]) {
    const off = (variant * 2 + bandY) % 10;
    for (let x = 0; x < TILE_W; x++) {
      if ((x + off) % 10 < 4 && inTile(x, bandY)) r.set(x, bandY, PALETTE.waterLight);
    }
  }
  for (let i = 0; i < 10; i++) {
    const [x, y] = samplePoint(rng);
    if (y > TILE_H / 2) r.set(x, y, PALETTE.waterDeep);
  }
  const sparkles = rng.int(1, 2);
  for (let i = 0; i < sparkles; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.highlight);
  }
}

function shallowsTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.waterLight);
  // Shin-deep water reads as wadeable only if the bed is plainly visible through
  // it — broad sand and gravel patches, not a few flecks.
  const patches = 3 + (variant % 2);
  for (let p = 0; p < patches; p++) {
    const [cx, cy] = samplePoint(rng);
    const rx = rng.int(6, 11);
    const ry = rng.int(2, 4);
    r.ditherWhere(
      cx - rx,
      cy - ry,
      cx + rx,
      cy + ry,
      (x, y) => inTile(x, y) && Raster.inEllipse(x, y, cx, cy, rx, ry),
      p % 2 === 0 ? PALETTE.dirtPale : PALETTE.dirtLight,
      p % 2 === 0 ? 50 : 25,
    );
  }
  speckle(r, rng, 24, [
    [PALETTE.waterBase, 55],
    [PALETTE.dirtPale, 30],
    [PALETTE.stoneLight, 15],
  ]);
  // A stone or two standing proud of the surface, with a ripple collar.
  const stones = rng.int(1, 2);
  for (let i = 0; i < stones; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.stoneLight);
    if (inTile(x + 1, y)) r.set(x + 1, y, PALETTE.stoneBase);
    if (inTile(x - 1, y)) r.set(x - 1, y, PALETTE.highlight);
  }
  for (const bandY of [10, 22]) {
    const off = (variant * 3 + bandY) % 9;
    for (let x = 0; x < TILE_W; x++) {
      if ((x + off) % 9 < 3 && inTile(x, bandY)) r.set(x, bandY, PALETTE.highlight);
    }
  }
}

/**
 * A ford (presentation-only, §3.3): the road bed carried on under shin-deep
 * water. The water tone stays on top so the tile still reads as river, while the
 * continuous gravel causeway and the stepping stones standing out of it say
 * plainly that this is where a column crosses.
 */
function fordTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.waterLight);
  const seed = hashString(`terr/ford/${variant}`);
  // Gravel bars lying on the bed, placed on smooth noise and drawn in the road's
  // own earth tones: the track reads as continuing under the water instead of
  // stopping at the bank. Water still covers most of the tile, so the crossing
  // never reads as dry ground in the middle of a river.
  for (let y = 0; y < TILE_H; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) {
      const stretch = 6 + variant; // each variant lays its bars at its own scale
      const bar = valueNoise(seed, x / stretch + y / 3.5) * 0.62
        + valueNoise(seed ^ 0x1f3d5b, x / 3 - y / 2.2) * 0.38;
      const grain = pixelHash(seed, x, y);
      if (bar > 0.16) r.set(x, y, grain > 0.4 ? PALETTE.dirtPale : PALETTE.dirtLight);
      else if (bar > -0.08 && grain > 0.62) r.set(x, y, PALETTE.dirtLight);
    }
  }
  speckle(r, rng, 26, [
    [PALETTE.waterBase, 45],
    [PALETTE.dirtPale, 30],
    [PALETTE.stoneLight, 25],
  ]);
  // Stepping stones: pale crown, wet shadow under, broken ripple upstream.
  const stones = 4 + (variant % 2);
  for (let i = 0; i < stones; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.stonePale);
    if (inTile(x + 1, y)) r.set(x + 1, y, PALETTE.stoneLight);
    if (inTile(x - 1, y)) r.set(x - 1, y, PALETTE.stoneBase);
    if (inTile(x, y + 1)) r.set(x, y + 1, PALETTE.waterBase);
    if (inTile(x - 2, y)) r.set(x - 2, y, PALETTE.highlight);
  }
  // Current breaking over the shallow bed.
  for (const bandY of [7, 15, 23]) {
    const off = (variant * 4 + bandY) % 7;
    for (let x = 0; x < TILE_W; x++) {
      if ((x + off) % 7 < 2 && inTile(x, bandY)) r.set(x, bandY, PALETTE.highlight);
    }
  }
}

/**
 * Shared surface of every road frame: packed earth, never one flat tone —
 * uneven damp and dry patches, grit, loose stones, shallow potholes. Painted only
 * where the tile is already road (the band laid down by `roadBand`), so the
 * texture never spills past the ribbon's own edge.
 */
function packedEarth(r: Raster, rng: Rng, variant: number): void {
  const onRoad = (x: number, y: number): boolean => r.alphaAt(x, y) > 0;

  const patches = 4 + (variant % 2);
  for (let p = 0; p < patches; p++) {
    const [cx, cy] = samplePoint(rng);
    const rx = rng.int(7, 14);
    const ry = rng.int(2, 5);
    r.ditherWhere(
      cx - rx,
      cy - ry,
      cx + rx,
      cy + ry,
      (x, y) => onRoad(x, y) && Raster.inEllipse(x, y, cx, cy, rx, ry),
      p % 2 === 0 ? PALETTE.dirtPale : PALETTE.dirtBase,
      p % 2 === 0 ? 50 : 25,
    );
  }

  for (let i = 0; i < 40; i++) {
    const [x, y] = samplePoint(rng);
    if (!onRoad(x, y)) continue;
    const roll = rng.next() * 100;
    r.set(x, y, roll < 34 ? PALETTE.dirtBase
      : roll < 74 ? PALETTE.dirtPale
        : roll < 96 ? PALETTE.dirtDark : PALETTE.stoneBase);
  }

  const stones = rng.int(1, 3);
  for (let i = 0; i < stones; i++) {
    const [x, y] = samplePoint(rng);
    if (!onRoad(x, y)) continue;
    r.set(x, y, PALETTE.stoneBase);
    if (onRoad(x + 1, y)) r.set(x + 1, y, PALETTE.dirtDark);
  }

  const holes = 1 + (variant % 2);
  for (let i = 0; i < holes; i++) {
    const [cx, cy] = samplePoint(rng);
    const rx = rng.int(3, 5);
    const ry = rng.int(1, 2);
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (!onRoad(x, y) || !Raster.inEllipse(x, y, cx, cy, rx, ry)) continue;
        const rim = !Raster.inEllipse(x, y, cx, cy, rx - 1, ry - 0.5);
        if (rim && !Raster.ditherOn(x, y, 50)) continue;
        r.set(x, y, rim ? PALETTE.dirtBase : PALETTE.dirtDark);
      }
    }
  }
}

/**
 * Lay the road ribbon itself: every pixel within a noisy half-width of the track
 * centre, and NOTHING outside it.
 *
 * Road frames are transparent past their own edge and the renderer draws them
 * over the surrounding terrain, so a road is a ribbon lying on the ground rather
 * than a row of tile-shaped patches. That is what lets a road that steps between
 * the tile axes read as one continuous diagonal instead of a staircase: the
 * ribbon crosses the tile corner to corner, and its silhouette is the track, not
 * the diamond.
 */
function roadBand(
  r: Raster, seed: number, distance: (x: number, y: number) => number, variant: number,
): void {
  const overgrown = variant === ROAD_JOINT_VARIANTS - 1;
  for (let y = 0; y < TILE_H; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) {
      const [a, b] = tileSquare(x, y);
      const d = distance(x, y);
      const grain = pixelHash(seed, x, y);
      // The ribbon's own edge wanders and frays; no two stretches are the same width.
      const halfWidth = 12.5
        + valueNoise(seed ^ 0x51ed, (a + b) / 5.5) * 2.6
        + valueNoise(seed ^ 0x2c9, (a - b) / 2.4) * 0.9;
      const edge = Math.abs(d) - halfWidth;
      if (edge > 0) continue;
      if (edge > -2.6 && grain > 0.82 + edge * 0.3) continue; // frayed, dithered rim
      const crown = Math.abs(d) < 5.5;
      r.set(x, y, crown && grain > (overgrown ? 0.62 : 0.26) ? PALETTE.dirtPale
        : Math.abs(d) > 9.5 && grain > 0.45 ? PALETTE.dirtBase : PALETTE.dirtLight);
      if (Math.abs(d) > 12 && grain > 0.72) r.set(x, y, PALETTE.dirtDark);
    }
  }
}

/**
 * Distance across a road running along one map axis, in screen pixels, measured
 * from the line joining the two edge midpoints the road passes through: 0 on the
 * crown, ±16 at the tile's far corners.
 *
 * Both lines are continuous across tiles by construction — the neighbour tile
 * along the road is drawn at (±32, +16), which maps the same line onto itself —
 * so ruts, crown and verges thread from tile to tile instead of restarting.
 */
function acrossRoad(x: number, y: number, axis: 'x' | 'y'): number {
  return axis === 'x' ? y - x / 2 : y + x / 2 - 32;
}

/** Weeds and stray tufts, denser toward the untravelled margins of the tile. */
function roadWeeds(r: Raster, rng: Rng, count: number, margin: (x: number, y: number) => number): void {
  const onRoad = (x: number, y: number): boolean => r.alphaAt(x, y) > 0;
  for (let i = 0; i < count; i++) {
    const [x, y] = samplePoint(rng);
    if (!onRoad(x, y) || rng.next() > margin(x, y)) continue;
    r.set(x, y, PALETTE.grassDark);
    if (rng.chance(0.55) && onRoad(x, y - 1)) r.set(x, y - 1, PALETTE.grassBase);
    if (rng.chance(0.4) && onRoad(x + 1, y)) r.set(x + 1, y, PALETTE.grassDark);
    if (rng.chance(0.25) && onRoad(x - 1, y)) r.set(x - 1, y, PALETTE.grassShadow);
  }
}

/**
 * A road running along one map axis: a crown polished pale by traffic, two cart
 * ruts either side of it that wander and break, damp shoulders, and weeds
 * thickening toward the margins. The last variant is a stretch the traffic has
 * nearly abandoned — grass has taken most of it back and only a thread of rut is
 * left.
 *
 * The whole surface is a function of the across-road distance from a centre line
 * that slides from `inOffset` at the entry edge midpoint to `outOffset` at the
 * exit one. Both ends are shared with the neighbouring tile, so a run of these
 * tiles draws ONE continuous track that meanders across the grid — neither of
 * which the old per-tile dashes could do, and the reason a road used to read as
 * churned mud ruled along a straightedge.
 */
function orientedRoadTile(
  r: Raster, rng: Rng, variant: number, axis: RoadAxis, inOffset: number, outOffset: number,
): void {
  const seed = hashString(`terr/road-${axis}/${inOffset}${outOffset}/${variant}`);
  const overgrown = variant === ROAD_JOINT_VARIANTS - 1;
  const enter = ROAD_OFFSETS[inOffset];
  const leave = ROAD_OFFSETS[outOffset];

  /** Centre of the track at a point `along` the tile (-16 entry .. +16 exit). */
  const centre = (along: number): number => {
    const t = Math.max(0, Math.min(1, (along + 16) / 32));
    return enter + (leave - enter) * t * t * (3 - 2 * t);
  };
  const distance = (x: number, y: number): number => acrossRoad(x, y, axis) - centre(x - 32);

  roadBand(r, seed, distance, variant);
  packedEarth(r, rng, variant);

  // Two cart ruts, each wandering about its own lane on top of the track's own
  // meander. Their wander tapers to zero at both edge midpoints, so the rut
  // leaving one tile is the rut entering the next.
  for (const lane of [-6, 4.5]) {
    for (let step = 0; step <= 68; step++) {
      const along = step / 2 - 17;
      const taper = Math.max(0, 1 - Math.abs(along) / 17);
      const wander = valueNoise(seed ^ (lane < 0 ? 0x11 : 0x77), along / 4.5) * 2.6 * taper;
      const d = centre(along) + lane + wander;
      const x = 32 + along;
      const y = axis === 'x' ? x / 2 + d : 32 - x / 2 + d;
      if (r.alphaAt(x, y) === 0) continue;
      const grain = pixelHash(seed ^ 0x2f, step, Math.round(d * 4));
      if (grain < (overgrown ? 0.62 : 0.3)) continue; // the rut thins out and picks up again
      r.set(x, y, PALETTE.dirtDark);
      if (grain > 0.82 && r.alphaAt(x, y - 1) > 0) r.set(x, y - 1, PALETTE.dirtBase);
      if (grain > 0.94 && r.alphaAt(x + 1, y) > 0) r.set(x + 1, y, PALETTE.dirtDark);
    }
  }

  roadWeeds(r, rng, overgrown ? 32 : 11, (x, y) => {
    const d = Math.abs(distance(x, y));
    if (overgrown) return d < 5 ? 0.35 : 0.9;
    return d < 6 ? 0.08 : d < 11 ? 0.3 : 0.62;
  });
}

/** Bare packed earth over the half of the tile facing one edge. */
function roadFillFrame(edge: Edge, variant: number): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const seed = hashString(`terr/road-fill/${edge}/${variant}`);
  for (let y = 0; y < TILE_H; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) {
      // A half-pixel past the centre line, so two opposite wedges leave no seam.
      if (edgeDepth(x, y, edge) > 16.5) continue;
      const grain = pixelHash(seed, x, y);
      r.set(x, y, grain > 0.72 ? PALETTE.dirtBase
        : grain > 0.34 ? PALETTE.dirtLight
          : grain > 0.06 ? PALETTE.dirtPale : PALETTE.dirtDark);
    }
  }
  return r;
}

/**
 * Tile-square coordinates: the isometric diamond mapped to the square [-16, 16]²
 * where a road along x is the line a = 0, a road along y is b = 0, and the four
 * edge midpoints a track can cross at are (0, ∓16) and (∓16, 0). Every road
 * feature is placed by distance in this space, so straights and bends share one
 * cross-section and meet without a seam.
 */
function tileSquare(x: number, y: number): [number, number] {
  return [y - x / 2, y + x / 2 - 32];
}

/** Tile-square coordinates back to tile pixels. */
function tilePixel(a: number, b: number): [number, number] {
  return [b - a + 32, (a + b + 32) / 2];
}

/** Edge midpoint and the inward axis tangent a straight run arrives on, per edge. */
const EDGE_GATES: Record<string, { point: [number, number]; inward: [number, number] }> = {
  nw: { point: [0, -16], inward: [0, 1] },
  se: { point: [0, 16], inward: [0, -1] },
  ne: { point: [-16, 0], inward: [1, 0] },
  sw: { point: [16, 0], inward: [-1, 0] },
};

/** Quarter-circle Bezier handle for a radius-16 turn. */
const BEND_HANDLE = 16 * 0.5523;

interface CurveSample { a: number; b: number; ta: number; tb: number }

/** Cubic Bezier through the two edge gates, sampled with unit tangents. */
function bendCurve(bend: RoadBend, arms: string, count: number): CurveSample[] {
  const first = EDGE_GATES[bend.slice(0, 2)];
  const second = EDGE_GATES[bend.slice(2)];
  const chordA = second.point[0] - first.point[0];
  const chordB = second.point[1] - first.point[1];
  const chordLength = Math.hypot(chordA, chordB) || 1;
  const chord: [number, number] = [chordA / chordLength, chordB / chordLength];
  // A bend arm hands the track over mid-turn, so the curve must leave along the
  // chord to stay straight through a staircase; a straight arm hands it over on
  // its own axis.
  const out = arms[0] === 'b' ? chord : first.inward;
  const incoming = arms[1] === 'b' ? chord : ([-second.inward[0], -second.inward[1]] as [number, number]);
  const handle = BEND_HANDLE;
  const p0 = first.point;
  const p3 = second.point;
  const p1: [number, number] = [p0[0] + out[0] * handle, p0[1] + out[1] * handle];
  const p2: [number, number] = [p3[0] - incoming[0] * handle, p3[1] - incoming[1] * handle];

  const samples: CurveSample[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    const a = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const b = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    const da = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const db = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
    const length = Math.hypot(da, db) || 1;
    samples.push({ a, b, ta: da / length, tb: db / length });
  }
  return samples;
}

/** Signed distance from a point to the sampled curve, positive to its left. */
function curveDistance(samples: CurveSample[], a: number, b: number): number {
  let best = Infinity;
  let sign = 1;
  for (const s of samples) {
    const distance = Math.hypot(a - s.a, b - s.b);
    if (distance >= best) continue;
    best = distance;
    sign = s.ta * (b - s.b) - s.tb * (a - s.a) < 0 ? -1 : 1;
  }
  return best * sign;
}

/**
 * A road turning through a tile: the same crown, ruts, shoulders and weeds as a
 * straight run, laid around a curve instead of a line, so a turn flows rather
 * than stopping at a right angle.
 */
function bendRoadTile(r: Raster, rng: Rng, variant: number, bend: RoadBend, arms: string): void {
  const seed = hashString(`terr/road-bend/${bend}/${arms}/${variant}`);
  const samples = bendCurve(bend, arms, 48);
  const distance = (x: number, y: number): number => {
    const [a, b] = tileSquare(x, y);
    return curveDistance(samples, a, b);
  };

  roadBand(r, seed, distance, variant);
  packedEarth(r, rng, variant);

  // Ruts ride the curve, wandering about their lane; the wander tapers to zero at
  // both gates, where the neighbouring tile's track comes in.
  for (const lane of [-6, 4.5]) {
    const steps = samples.length * 2;
    for (let step = 0; step < steps; step++) {
      const t = step / (steps - 1);
      const sample = samples[Math.min(samples.length - 1, Math.round(t * (samples.length - 1)))];
      const wander = valueNoise(seed ^ (lane < 0 ? 0x11 : 0x77), t * 6) * 2.4 * Math.sin(Math.PI * t);
      const offset = lane + wander;
      const [px, py] = tilePixel(sample.a - sample.tb * offset, sample.b + sample.ta * offset);
      if (r.alphaAt(px, py) === 0) continue;
      const grain = pixelHash(seed ^ 0x2f, step, Math.round(offset * 4));
      if (grain < 0.3) continue;
      r.set(px, py, PALETTE.dirtDark);
      if (grain > 0.82 && r.alphaAt(px, py - 1) > 0) r.set(px, py - 1, PALETTE.dirtBase);
      if (grain > 0.94 && r.alphaAt(px + 1, py) > 0) r.set(px + 1, py, PALETTE.dirtDark);
    }
  }

  roadWeeds(r, rng, 11, (x, y) => {
    const d = Math.abs(distance(x, y));
    return d < 6 ? 0.08 : d < 11 ? 0.3 : 0.62;
  });
}

/**
 * The junction tile: a crossroads, a bend the road widens into, or a lone tile.
 * A scuffed patch reaching every edge midpoint, so whatever meets it joins on.
 */
function roadTile(r: Raster, rng: Rng, variant: number): void {
  const seed = hashString(`terr/road/${variant}`);
  roadBand(r, seed, (x, y) => {
    const [a, b] = tileSquare(x, y);
    return Math.hypot(a, b) - 5;
  }, variant);
  packedEarth(r, rng, variant);
  for (const axis of ['x', 'y'] as const) {
    for (let step = 0; step <= 34; step++) {
      const along = step - 17;
      const x = 32 + along;
      const y = axis === 'x' ? x / 2 : 32 - x / 2;
      for (const lane of [-6, 4.5]) {
        const py = y + lane;
        if (r.alphaAt(x, py) === 0) continue;
        if (pixelHash(seed ^ (axis === 'x' ? 0x5 : 0xb), step, lane) < 0.45) continue;
        r.set(x, py, PALETTE.dirtBase);
      }
    }
  }
  roadWeeds(r, rng, 10, () => 0.5);
}

function farmlandTile(r: Raster, _rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.dirtBase);
  // plow rows parallel to the NW edge: s = x + 2y is constant along that edge
  for (let y = 0; y < TILE_H; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) {
      const s = (x + 2 * y + variant * 4) % 8;
      if (s === 0) r.set(x, y, PALETTE.dirtDark);
      else if (s === 1) r.set(x, y, PALETTE.dirtLight);
    }
  }
}

function sandTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.dirtPale);
  speckle(r, rng, 40, [
    [PALETTE.dirtLight, 45],
    [PALETTE.thatchLight, 30],
    [PALETTE.dirtBase, 25],
  ]);
  // wind-ripple dashes
  const ripples = 2 + (variant % 2);
  for (let i = 0; i < ripples; i++) {
    const [x, y] = samplePoint(rng);
    for (let d = 0; d < 4; d++) {
      if (inTile(x + d, y)) r.set(x + d, y, PALETTE.dirtLight);
    }
  }
}

function snowTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.highlight);
  speckle(r, rng, 46, [
    [PALETTE.stonePale, 55],
    [PALETTE.parchLight, 30],
    [PALETTE.stoneLight, 15],
  ]);
  const drifts = 2 + (variant % 2);
  for (let i = 0; i < drifts; i++) {
    const [x, y] = samplePoint(rng);
    for (let d = 0; d < 3; d++) {
      if (inTile(x + d, y)) r.set(x + d, y, PALETTE.stonePale);
    }
  }
}

/** Raised, broken stone shelf. Dark lower strata make the blocked tile read as height. */
function cliffTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.stoneDark);
  for (let y = 2; y < TILE_H - 1; y++) {
    const row = diamondRow(y, TILE_W, TILE_H);
    if (!row) continue;
    for (let x = row[0]; x < row[1]; x++) {
      const upperFace = y < 16 + (((x + variant * 5) % 13) === 0 ? 1 : 0);
      if (upperFace) r.set(x, y, y < 9 ? PALETTE.stoneLight : PALETTE.stoneBase);
      else if ((y + variant) % 5 === 0 && (x + y) % 4 !== 0) r.set(x, y, PALETTE.slateDark);
    }
  }

  // Layer seams and short diagonal cracks keep repeated ridge tiles organic.
  for (const seamY of [16, 22, 27]) {
    const offset = (variant * 7 + seamY) % 11;
    for (let x = 2; x < TILE_W - 2; x++) {
      if ((x + offset) % 11 < 7 && inTile(x, seamY)) r.set(x, seamY, PALETTE.outline);
    }
  }
  const cracks = 3 + variant;
  for (let i = 0; i < cracks; i++) {
    let [x, y] = samplePoint(rng);
    y = Math.max(8, Math.min(25, y));
    for (let step = 0; step < 4; step++) {
      if (inTile(x, y)) r.set(x, y, PALETTE.stoneDark);
      x += step % 2 === 0 ? 1 : -1;
      y += 1;
    }
  }
  speckle(r, rng, 18, [
    [PALETTE.stonePale, 25],
    [PALETTE.stoneLight, 35],
    [PALETTE.slateDark, 40],
  ]);
}

const TILE_PAINTERS: Record<TerrainId, (r: Raster, rng: Rng, variant: number) => void> = {
  grass: grassTile,
  dirt: dirtTile,
  sand: sandTile,
  water: waterTile,
  shallows: shallowsTile,
  road: roadTile,
  farmland: farmlandTile,
  snow: snowTile,
  cliff: cliffTile,
};

/**
 * Half-plane "distance from edge" for the 64×32 diamond: linear ramp that is
 * ~16 on the named edge and decreases inward. Fringe depth t = 16 - f.
 */
function edgeDepth(x: number, y: number, edge: Edge): number {
  const dx = x - (TILE_W - 1) / 2;
  const dy = y - (TILE_H - 1) / 2;
  let f: number;
  if (edge === 'nw') f = -dx / 2 - dy;
  else if (edge === 'ne') f = dx / 2 - dy;
  else if (edge === 'sw') f = -dx / 2 + dy;
  else f = dx / 2 + dy;
  return 16 - f;
}

/**
 * Coordinate running ALONG the named edge, roughly -16 at one tile corner to +16
 * at the other. It is the half-plane ramp of the neighbouring edge, which is
 * perpendicular in the isometric skew — the boundary wobble is a function of it.
 */
function edgeAlong(x: number, y: number, edge: Edge): number {
  const dx = x - (TILE_W - 1) / 2;
  const dy = y - (TILE_H - 1) / 2;
  if (edge === 'nw') return dx / 2 - dy;
  if (edge === 'ne') return -dx / 2 - dy;
  if (edge === 'sw') return dx / 2 + dy;
  return -dx / 2 + dy;
}

/** Smooth deterministic 1-D value noise in [-1, 1]. */
function valueNoise(seed: number, u: number): number {
  const at = (n: number): number => {
    let h = (Math.imul(n | 0, 0x27d4eb2d) ^ seed) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    return (h >>> 0) / 0x7fffffff - 1;
  };
  const i = Math.floor(u);
  const f = u - i;
  const a = at(i);
  const b = at(i + 1);
  return a + (b - a) * f * f * (3 - 2 * f);
}

/** Per-pixel hash in [0, 1) — the fine grain that keeps a boundary from looking cut. */
function pixelHash(seed: number, x: number, y: number): number {
  let h = (Math.imul(x + 1, 0x85ebca6b) ^ Math.imul(y + 1, 0xc2b2ae35) ^ seed) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * One baked fringe of `hi` bleeding into a `lo` tile along one edge (§3.2).
 *
 * The boundary is not the straight three-band ramp it used to be: it wanders on
 * smooth noise, is eaten into by per-pixel grain, and throws scattered outliers
 * beyond the fringe, so a road or a shoreline never draws a ruler-straight line.
 * The wobble tapers to zero at the two tile corners, so neighbouring tiles still
 * meet exactly — the boundary wanders, it never tears.
 */
function edgeFrame(hi: TerrainSpec, lo: TerrainSpec, edge: Edge, variant: number): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const waterSide = lo.id === 'water' || lo.id === 'shallows';
  const seed = hashString(`terr/${hi.id}_${lo.id}/${edge}/${variant}`);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (!inTile(x, y)) continue;
      const t = edgeDepth(x, y, edge);
      const along = edgeAlong(x, y, edge);
      const taper = Math.max(0, 1 - Math.abs(along) / 16);
      const wobble = taper * (
        valueNoise(seed, along / 5) * 2.6 + valueNoise(seed ^ 0x5bd1e995, along / 1.9) * 1.1
      );
      const grain = pixelHash(seed, x, y);
      const solid = 2 + wobble + grain * 0.9; // band 0: solid fringe
      const half = 4.2 + wobble * 1.2 + grain * 1.2; // band 1: 50%
      const quarter = 6.4 + wobble * 1.4 + grain * 1.5; // band 2: 25%
      if (t < solid) r.set(x, y, hi.base);
      else if (t < half) {
        if (Raster.ditherOn(x, y, 50)) r.set(x, y, hi.base);
      } else if (t < quarter) {
        if (Raster.ditherOn(x, y, 25)) r.set(x, y, hi.base);
      } else if (t < quarter + 3.5 && grain > 0.94) {
        r.set(x, y, hi.base); // stray earth/stone scattered past the fringe
      }
      // shore foam: 1px waterLight just inside the water, following the wobble
      if (waterSide && t >= solid && t < solid + 1.3 && (x + y) % 3 !== 0) {
        r.set(x, y, PALETTE.waterLight);
      }
    }
  }
  return r;
}

const PRESENTATION_PAINTERS: Record<string, (r: Raster, rng: Rng, variant: number) => void> = {
  ford: fordTile,
};

export function genTerrain(): FrameDef[] {
  const frames: FrameDef[] = [];
  const anchor = { x: TILE_W / 2, y: TILE_H / 2 };
  for (const spec of TERRAINS) {
    for (let v = 0; v < spec.variants; v++) {
      const r = new Raster(TILE_W, TILE_H);
      TILE_PAINTERS[spec.id](r, new Rng(`terr/${spec.id}/${v}`), v);
      frames.push({ name: `terr/${spec.id}/${v}`, raster: r, anchor });
    }
  }
  for (const spec of PRESENTATION_TILES) {
    for (let v = 0; v < spec.variants; v++) {
      const r = new Raster(TILE_W, TILE_H);
      PRESENTATION_PAINTERS[spec.id](r, new Rng(`terr/${spec.id}/${v}`), v);
      frames.push({ name: `terr/${spec.id}/${v}`, raster: r, anchor });
    }
  }
  for (const edge of EDGES) {
    for (let v = 0; v < ROAD_FILL_VARIANTS; v++) {
      frames.push({ name: `terr/road-fill/${edge}/${v}`, raster: roadFillFrame(edge, v), anchor });
    }
  }
  for (const bend of ROAD_BENDS) {
    for (const arms of ROAD_BEND_ARMS) {
      for (let v = 0; v < ROAD_BEND_VARIANTS; v++) {
        const raster = new Raster(TILE_W, TILE_H);
        const name = `terr/road-bend/${bend}/${arms}/${v}`;
        bendRoadTile(raster, new Rng(name), v, bend, arms);
        frames.push({ name, raster, anchor });
      }
    }
  }
  for (const axis of ROAD_AXES) {
    for (let inOffset = 0; inOffset < ROAD_OFFSETS.length; inOffset++) {
      for (let outOffset = 0; outOffset < ROAD_OFFSETS.length; outOffset++) {
        for (let v = 0; v < ROAD_JOINT_VARIANTS; v++) {
          const raster = new Raster(TILE_W, TILE_H);
          const name = `terr/road-${axis}/${inOffset}${outOffset}/${v}`;
          orientedRoadTile(raster, new Rng(name), v, axis, inOffset, outOffset);
          frames.push({ name, raster, anchor });
        }
      }
    }
  }
  for (const [hiId, loId] of edgePairs()) {
    const hi = TERRAINS.find((t) => t.id === hiId)!;
    const lo = TERRAINS.find((t) => t.id === loId)!;
    for (const edge of EDGES) {
      for (let v = 0; v < EDGE_VARIANTS; v++) {
        frames.push({
          name: `terr/${hiId}_${loId}/${edge}/${v}`,
          raster: edgeFrame(hi, lo, edge, v),
          anchor,
        });
      }
    }
  }
  return frames;
}
