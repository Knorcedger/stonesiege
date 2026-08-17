// Terrain tiles (ART_BIBLE §3.1) + baked edge transitions (§3.2) for every
// TerrainId in packages/sim (type-only import — safe under Node type stripping).

import type { TerrainId } from '../../../packages/sim/src/types.ts';
import { Raster, diamondRow, insideDiamond } from './raster.ts';
import { PALETTE } from './palette.ts';
import type { RGB } from './palette.ts';
import { Rng } from './util.ts';
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
  { id: 'road', priority: 7, variants: 3, base: PALETTE.dirtPale },
  { id: 'farmland', priority: 6, variants: 2, base: PALETTE.dirtBase },
  { id: 'snow', priority: 5, variants: 3, base: PALETTE.highlight },
  { id: 'grass', priority: 4, variants: 4, base: PALETTE.grassBase },
  { id: 'dirt', priority: 3, variants: 3, base: PALETTE.dirtBase },
  { id: 'sand', priority: 2, variants: 3, base: PALETTE.dirtPale },
  { id: 'shallows', priority: 1, variants: 3, base: PALETTE.waterLight },
  { id: 'water', priority: 0, variants: 4, base: PALETTE.waterBase },
];

/** All (hi, lo) pairs needing baked `terr/<hi>_<lo>/<edge>` transition frames. */
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
  // sandy bottom showing through: dithered dirtPale patches
  const patches = 2 + (variant % 2);
  for (let p = 0; p < patches; p++) {
    const [cx, cy] = samplePoint(rng);
    r.ditherWhere(
      cx - 6,
      cy - 2,
      cx + 6,
      cy + 2,
      (x, y) => inTile(x, y) && Raster.inEllipse(x, y, cx, cy, 6, 2),
      PALETTE.dirtPale,
      50,
    );
  }
  speckle(r, rng, 24, [
    [PALETTE.waterBase, 70],
    [PALETTE.dirtPale, 30],
  ]);
  for (const bandY of [10, 22]) {
    const off = (variant * 3 + bandY) % 9;
    for (let x = 0; x < TILE_W; x++) {
      if ((x + off) % 9 < 3 && inTile(x, bandY)) r.set(x, bandY, PALETTE.highlight);
    }
  }
}

function roadTile(r: Raster, rng: Rng, variant: number): void {
  baseDiamond(r, PALETTE.dirtPale);
  speckle(r, rng, 40, [
    [PALETTE.dirtLight, 50],
    [PALETTE.dirtBase, 30],
    [PALETTE.stoneLight, 20],
  ]);
  // two wheel-rut lines corner-to-corner along the long (horizontal) axis
  for (const dy of [-2, 3]) {
    for (let x = 3; x < TILE_W - 3; x++) {
      const y = TILE_H / 2 + dy + ((x + variant) % 8 === 0 ? 1 : 0);
      if (inTile(x, y)) r.set(x, y, PALETTE.dirtBase);
    }
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

function edgeFrame(hi: TerrainSpec, lo: TerrainSpec, edge: Edge): Raster {
  const r = new Raster(TILE_W, TILE_H);
  const waterSide = lo.id === 'water' || lo.id === 'shallows';
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (!inTile(x, y)) continue;
      const t = edgeDepth(x, y, edge);
      if (t < 2) {
        r.set(x, y, hi.base); // band 0: solid fringe
      } else if (t < 4) {
        if (Raster.ditherOn(x, y, 50)) r.set(x, y, hi.base); // band 1: 50%
      } else if (t < 6) {
        if (Raster.ditherOn(x, y, 25)) r.set(x, y, hi.base); // band 2: 25%
      }
      // shore foam: 1px waterLight just inside the water, dither-broken every 3rd px
      if (waterSide && t >= 2 && t < 3 && (x + y) % 3 !== 0) {
        r.set(x, y, PALETTE.waterLight);
      }
    }
  }
  return r;
}

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
  for (const [hiId, loId] of edgePairs()) {
    const hi = TERRAINS.find((t) => t.id === hiId)!;
    const lo = TERRAINS.find((t) => t.id === loId)!;
    for (const edge of EDGES) {
      frames.push({
        name: `terr/${hiId}_${loId}/${edge}`,
        raster: edgeFrame(hi, lo, edge),
        anchor,
      });
    }
  }
  return frames;
}
