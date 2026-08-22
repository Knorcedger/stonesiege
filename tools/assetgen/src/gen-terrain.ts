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

/** Transition variants per (hi, lo, edge) — a single frame would repeat its wobble on every tile. */
export const EDGE_VARIANTS = 2;

/** All (hi, lo) pairs needing baked `terr/<hi>_<lo>/<edge>/<variant>` transition frames. */
export function edgePairs(): Array<[TerrainId, TerrainId]> {
  const pairs: Array<[TerrainId, TerrainId]> = [];
  for (const hi of TERRAINS) {
    for (const lo of TERRAINS) {
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
 * An ancient track, not a paved lane: earth churned into uneven damp and dry
 * patches, wheel ruts that wander and fade out, loose stones, shallow potholes,
 * and weeds holding wherever the traffic thinned. Straight, evenly toned ruts on
 * one flat fill are what made the old tile read as laid yesterday by machines.
 */
function roadTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.dirtLight);

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
      (x, y) => inTile(x, y) && Raster.inEllipse(x, y, cx, cy, rx, ry),
      p % 2 === 0 ? PALETTE.dirtPale : PALETTE.dirtBase,
      p % 2 === 0 ? 50 : 25,
    );
  }

  speckle(r, rng, 46, [
    [PALETTE.dirtBase, 40],
    [PALETTE.dirtPale, 30],
    [PALETTE.dirtDark, 20],
    [PALETTE.stoneLight, 10],
  ]);

  // Two wheel ruts along the long axis that drift, thin, and break.
  for (const lane of [-3, 2]) {
    let drift = 0;
    for (let x = 3; x < TILE_W - 3; x++) {
      if ((x + variant) % 7 === 0) drift = Math.max(-2, Math.min(2, drift + rng.int(-1, 1)));
      if (rng.chance(0.24)) continue;
      const y = Math.round(TILE_H / 2 + lane + drift);
      if (inTile(x, y)) r.set(x, y, PALETTE.dirtDark);
      if (rng.chance(0.3) && inTile(x, y - 1)) r.set(x, y - 1, PALETTE.dirtBase);
    }
  }

  const stones = rng.int(3, 5);
  for (let i = 0; i < stones; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.stoneLight);
    if (inTile(x + 1, y)) r.set(x + 1, y, PALETTE.stoneBase);
    if (inTile(x, y + 1)) r.set(x, y + 1, PALETTE.dirtDark);
  }

  const holes = 1 + (variant % 2);
  for (let i = 0; i < holes; i++) {
    const [cx, cy] = samplePoint(rng);
    const rx = rng.int(3, 5);
    const ry = rng.int(1, 2);
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (!inTile(x, y) || !Raster.inEllipse(x, y, cx, cy, rx, ry)) continue;
        const rim = !Raster.inEllipse(x, y, cx, cy, rx - 1, ry - 0.5);
        if (rim && !Raster.ditherOn(x, y, 50)) continue;
        r.set(x, y, rim ? PALETTE.dirtBase : PALETTE.dirtDark);
      }
    }
  }

  // Weeds take the crown and the verges wherever the wheels stopped running.
  const weeds = rng.int(5, 8);
  for (let i = 0; i < weeds; i++) {
    const [x, y] = samplePoint(rng);
    r.set(x, y, PALETTE.grassDark);
    if (rng.chance(0.5) && inTile(x, y - 1)) r.set(x, y - 1, PALETTE.grassBase);
    if (rng.chance(0.4) && inTile(x + 1, y)) r.set(x + 1, y, PALETTE.grassDark);
  }
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
