// Building sprites (`bld/<defId>/<state>`), ART_BIBLE §5.
// Footprints are READ FROM DATA (buildings[id].size — data is source of truth).
// States: done (+ per-age variants for townCenter/house only), construct0..2
// (shared scaffold kit sized to the footprint), rubble. Farm is exempt (the
// renderer uses obj/farm/* per contract). Walls/gates ship as solid standalone
// single-tile pieces — the §10.3 piece-set naming remains an open contract
// delta; coordinate with the renderer before adding oriented variants.
// Player color: banners/trim/door cloth in the magenta mask ramp (runtime-swap).

import { buildings } from '../../../packages/data/src/buildings.ts';
import { Raster, insideDiamond } from './raster.ts';
import { PALETTE, MASK } from './palette.ts';
import type { RGB } from './palette.ts';
import { Rng } from './util.ts';
import { stripMask } from './rig.ts';
import type { FrameDef } from './atlas.ts';

const P = PALETTE;
const M = MASK;

export interface BuildingsResult {
  frames: FrameDef[];
  impactFrames: Record<string, number>;
}

const AGES = ['dark', 'feudal', 'castle', 'imperial'] as const;
type Age = (typeof AGES)[number];
const ageIdx = (a: Age): number => AGES.indexOf(a);

// ---------------------------------------------------------------- canvas + ground

const HEAD = 16; // headroom above the tallest feature (banner poles)

interface Canvas {
  r: Raster;
  W: number;
  H: number;
  fpH: number;
  cx: number;
  /** screen y of the footprint diamond's center. */
  cy: number;
  /** screen y of the diamond's top tip. */
  ty: number;
  anchor: { x: number; y: number };
}

function mkCanvas(size: number, elev: number): Canvas {
  const W = size * 64;
  const fpH = size * 32;
  const H = fpH + elev + HEAD;
  const r = new Raster(W, H);
  const ty = H - fpH;
  return { r, W, H, fpH, cx: W / 2, cy: ty + fpH / 2, ty, anchor: { x: W / 2, y: ty + fpH / 2 } };
}

const inFp = (c: Canvas, x: number, y: number): boolean => insideDiamond(x, y - c.ty, c.W, c.fpH);

/** Building drop shadow: the footprint diamond extended 4px to the SE, black@88. */
function fpShadow(c: Canvas): void {
  for (let y = 0; y < c.fpH; y++) {
    for (let x = 0; x < c.W; x++) {
      if (!insideDiamond(x, y, c.W, c.fpH)) continue;
      const tx = x + 3;
      const tyy = y + c.ty + 2;
      if (c.r.alphaAt(tx, tyy) === 0) c.r.set(tx, tyy, [0, 0, 0], 88);
    }
  }
}

/** Packed-earth yard over the footprint with a dithered edge into the terrain. */
function yard(c: Canvas, seed: string, fill: RGB = P.dirtBase): void {
  const rng = new Rng(seed);
  for (let y = 0; y < c.fpH; y++) {
    for (let x = 0; x < c.W; x++) {
      if (!insideDiamond(x, y, c.W, c.fpH)) continue;
      const edge = !insideDiamond(x, y, c.W, c.fpH) ? 0 : edgeDepth(x, y, c.W, c.fpH);
      if (edge < 3 && !Raster.ditherOn(x, y, edge < 2 ? 25 : 50)) continue;
      c.r.set(x, y + c.ty, fill);
    }
  }
  for (let i = 0; i < c.W; i++) {
    const x = rng.int(4, c.W - 5);
    const y = rng.int(1, c.fpH - 2);
    if (!insideDiamond(x, y, c.W, c.fpH) || edgeDepth(x, y, c.W, c.fpH) < 3) continue;
    if (c.r.alphaAt(x, y + c.ty) === 255) {
      c.r.set(x, y + c.ty, rng.chance(0.5) ? P.dirtDark : P.dirtLight);
    }
  }
}

/** Rough distance (px) from a diamond-interior point to the diamond edge. */
function edgeDepth(x: number, y: number, w: number, h: number): number {
  let d = 0;
  while (d < 6 && insideDiamond(x - d, y, w, h) && insideDiamond(x + d, y, w, h)
    && insideDiamond(x, y - Math.ceil(d / 2), w, h) && insideDiamond(x, y + Math.ceil(d / 2), w, h)) d++;
  return d;
}

// ---------------------------------------------------------------- structure box

type Pt = readonly [number, number];

interface Struct {
  /** bottom diamond corners (N top, E right, S bottom, W left). */
  N: Pt; E: Pt; S: Pt; W: Pt;
  /** wall-top corners. */
  Nt: Pt; Et: Pt; St: Pt; Wt: Pt;
  cx: number;
  cy: number;
  H: number;
}

/**
 * A wall box whose footprint is a sub-diamond of the tile grid: center (cx,cy),
 * half-extents ta/tb in TILES along the two iso axes, wall height H px.
 */
function struct(cx: number, cy: number, ta: number, tb: number, H: number): Struct {
  const Ax = 32 * ta;
  const Ay = 16 * ta;
  const Bx = -32 * tb;
  const By = 16 * tb;
  const S: Pt = [cx + Ax + Bx, cy + Ay + By];
  const N: Pt = [cx - Ax - Bx, cy - Ay - By];
  const E: Pt = [cx + Ax - Bx, cy + Ay - By];
  const W: Pt = [cx - Ax + Bx, cy - Ay + By];
  const up = (p: Pt): Pt => [p[0], p[1] - H];
  return { N, E, S, W, Nt: up(N), Et: up(E), St: up(S), Wt: up(W), cx, cy, H };
}

type WallStyle = 'log' | 'timber' | 'stone' | 'dressed' | 'plank' | 'wattle';

const wallTones: Record<WallStyle, { lit: RGB; base: RGB; dark: RGB }> = {
  log: { lit: P.woodLight, base: P.woodBase, dark: P.woodDark },
  timber: { lit: P.woodPale, base: P.woodPale, dark: P.woodDark },
  stone: { lit: P.stoneLight, base: P.stoneBase, dark: P.stoneDark },
  dressed: { lit: P.stonePale, base: P.stoneLight, dark: P.stoneDark },
  plank: { lit: P.woodLight, base: P.woodBase, dark: P.woodDark },
  wattle: { lit: P.woodPale, base: P.woodPale, dark: P.clothDark },
};

function quad(r: Raster, pts: Pt[], c: RGB): void {
  r.fillPoly(pts, c);
}

/** Paint the two camera-facing wall planes with per-style detail. */
function drawWalls(r: Raster, s: Struct, style: WallStyle, seed: string): void {
  const t = wallTones[style];
  // SW plane (screen-left) lit, SE plane base
  const sw: Pt[] = [s.W, s.S, s.St, s.Wt];
  const se: Pt[] = [s.S, s.E, s.Et, s.St];
  quad(r, sw, t.lit);
  quad(r, se, t.base);
  detailWall(r, s.W, s.S, s.H, style, t, true, seed + ':sw');
  detailWall(r, s.S, s.E, s.H, style, t, false, seed + ':se');
  // under-eave shadow row at the wall top
  line2(r, s.Wt, s.St, t.dark);
  line2(r, s.St, s.Et, t.dark);
}

function line2(r: Raster, a: Pt, b: Pt, c: RGB): void {
  r.line(a[0], a[1], b[0], b[1], c);
}

/** Style detail on one wall plane spanning bottom edge a→b, height H. */
function detailWall(
  r: Raster,
  a: Pt,
  b: Pt,
  H: number,
  style: WallStyle,
  t: { lit: RGB; base: RGB; dark: RGB },
  litSide: boolean,
  seed: string,
): void {
  const rng = new Rng(seed);
  const len = Math.max(Math.abs(b[0] - a[0]), 4);
  const at = (f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  if (style === 'log') {
    // vertical log columns: dark gap every 4px of run
    for (let i = 4; i < len; i += 4) {
      const [x, y] = at(i / len);
      r.line(x, y - 1, x, y - H + 1, t.dark);
      if (rng.chance(0.3)) r.set(Math.round(x), Math.round(y - H + 2 + rng.int(0, 3)), P.clothDark);
    }
  } else if (style === 'timber') {
    // posts + beam + X braces over daub
    for (let i = 0; i <= len; i += 10) {
      const [x, y] = at(Math.min(1, i / len));
      r.line(x, y, x, y - H + 1, P.woodDark);
    }
    const [mx0, my0] = at(0.02);
    const [mx1, my1] = at(0.98);
    r.line(mx0, my0 - Math.round(H / 2), mx1, my1 - Math.round(H / 2), P.woodDark);
    for (let i = 0; i + 10 <= len; i += 20) {
      const [x0, y0] = at(i / len);
      const [x1, y1] = at((i + 10) / len);
      r.line(x0, y0 - 2, x1, y1 - H + 3, P.woodDark);
    }
  } else if (style === 'stone' || style === 'dressed') {
    const course = style === 'stone' ? 4 : 6;
    for (let row = course; row < H - 1; row += course) {
      const [x0, y0] = at(0.02);
      const [x1, y1] = at(0.98);
      r.line(x0, y0 - row, x1, y1 - row, t.dark);
      // staggered vertical joints
      const off = (row / course) % 2 === 0 ? 0 : 3;
      for (let i = 6 + off; i < len - 2; i += 7) {
        const [jx, jy] = at(i / len);
        r.line(jx, jy - row, jx, jy - row + Math.min(course - 1, 2), t.dark);
      }
    }
    if (litSide) {
      // quoin column on the screen-left corner
      r.line(a[0], a[1] - 1, a[0], a[1] - H + 1, style === 'dressed' ? P.stonePale : P.stoneLight);
    }
  } else if (style === 'plank') {
    for (let row = 3; row < H - 1; row += 3) {
      const [x0, y0] = at(0.02);
      const [x1, y1] = at(0.98);
      r.line(x0, y0 - row, x1, y1 - row, row % 9 === 0 ? t.lit : t.dark);
    }
  } else if (style === 'wattle') {
    for (let i = 2; i < len - 1; i += 2) {
      for (let row = 2; row < H - 1; row += 2) {
        if ((i / 2 + row / 2) % 2 === 0) continue;
        const [x, y] = at(i / len);
        r.set(Math.round(x), Math.round(y - row), P.clothDark);
      }
    }
  }
}

interface RoofRamp { lit: RGB; base: RGB; dark: RGB }
const THATCH: RoofRamp = { lit: P.thatchLight, base: P.thatchBase, dark: P.thatchDark };
const SLATE: RoofRamp = { lit: P.slateLight, base: P.slateBase, dark: P.slateDark };
const SHINGLE: RoofRamp = { lit: P.woodLight, base: P.woodBase, dark: P.woodDark };

function roofFor(age: Age, military = false): RoofRamp {
  if (age === 'dark') return THATCH;
  if (age === 'feudal') return military ? SHINGLE : THATCH;
  return SLATE;
}

function wallFor(age: Age): WallStyle {
  return age === 'dark' ? 'log' : age === 'feudal' ? 'timber' : age === 'castle' ? 'stone' : 'dressed';
}

/**
 * Hip/gable roof over a struct: ridge along the A axis (N→...E edge midline),
 * raised RH above the wall top. inset 0 = gable, ~0.4 = hipped.
 */
function drawRoof(r: Raster, s: Struct, RH: number, ramp: RoofRamp, inset = 0.35): void {
  const mid = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  // ridge endpoints between the Nt–Et and Wt–St edge midpoints, pulled inward
  const r1 = mid(mid(s.Nt, s.Et, 0.5), mid(s.Wt, s.St, 0.5), inset * 0.5);
  const r2 = mid(mid(s.Wt, s.St, 0.5), mid(s.Nt, s.Et, 0.5), inset * 0.5);
  const R1: Pt = [r1[0], r1[1] - RH];
  const R2: Pt = [r2[0], r2[1] - RH];
  // far plane (NE-facing) then near plane (SW-facing, lit)
  quad(r, [s.Nt, s.Et, R1, R2], ramp.base);
  quad(r, [s.Wt, s.St, R1, R2], ramp.lit);
  // gable/hip end triangles
  quad(r, [s.St, s.Et, R1], ramp.base);
  quad(r, [s.Wt, s.Nt, R2], ramp.dark);
  // eave dither on the near plane + ridge line
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const e = mid(s.Wt, s.St, i / steps);
    const q2 = mid(R2, R1, i / steps);
    const p1 = mid(e, q2, 0.12);
    const p2 = mid(e, q2, 0.24);
    if (Raster.ditherOn(i, 0, 50)) r.set(Math.round(p1[0]), Math.round(p1[1]), ramp.dark);
    if (Raster.ditherOn(i, 1, 50)) r.set(Math.round(p2[0]), Math.round(p2[1]), ramp.base);
  }
  line2(r, R1, R2, ramp.lit);
}

type RoofTex = 'thatch' | 'shingle' | 'slate';

/**
 * §7.13 hipped roof over a struct: ridge along the A iso axis; only the two
 * camera-facing planes carry detail — screen-left trapezoid = light tone,
 * screen-right hip triangle = base tone with the 2-row 50% eave dither; 1px
 * light ridge line; 1px dark hip seams; per-material row texture. Returns the
 * ridge endpoints so callers can seat banners/trim at the apex.
 */
function hippedRoof(
  r: Raster,
  s: Struct,
  RH: number,
  ramp: RoofRamp,
  tex: RoofTex,
  ridgeInset = 0.32,
): { r1: Pt; r2: Pt } {
  const lp = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const e1 = lp(s.Wt, s.Nt, 0.5); // upper-left eave midpoint
  const e2 = lp(s.St, s.Et, 0.5); // lower-right eave midpoint
  const m1 = lp(e1, e2, ridgeInset);
  const m2 = lp(e2, e1, ridgeInset);
  const r1: Pt = [m1[0], m1[1] - RH]; // high (upper-left) ridge end
  const r2: Pt = [m2[0], m2[1] - RH];
  // Far planes only when the roof is shallow enough that the far slope crests
  // above the ridge on screen (ridge below the N wall-top corner). On steep
  // roofs the back faces point away from the camera — painting their screen
  // quads would smear phantom dark slopes above the hip seams.
  if (r1[1] > s.Nt[1]) {
    r.fillPoly([s.Wt, s.Nt, r1], ramp.dark);
    r.fillPoly([s.Nt, s.Et, r2, r1], ramp.dark);
  }
  // …then the two camera-facing planes
  r.fillPoly([s.Wt, s.St, r2, r1], ramp.lit); // screen-left trapezoid
  r.fillPoly([s.St, s.Et, r2], ramp.base); // screen-right hip end
  // row texture parallel to the eave on both camera planes
  const texPlane = (a0: Pt, a1: Pt, b0: Pt, b1: Pt, lit: boolean): void => {
    const vspan = Math.max(
      4,
      Math.round(Math.max(Math.abs(b0[1] - a0[1]), Math.abs(b1[1] - a1[1]))),
    );
    // §5.3/§7.13 light-vs-base split: the lit plane keeps its light fill with
    // SPARSE base-tone rows; the base plane gets denser dark rows. Equal-density
    // texture on both planes averaged their values together at 1×.
    const spacing = tex === 'slate' ? (lit ? 6 : 4) : tex === 'shingle' ? (lit ? 4 : 3) : 3;
    const len = Math.max(8, Math.round(Math.abs(a1[0] - a0[0]) + Math.abs(a1[1] - a0[1])));
    for (let k = 1; k * spacing < vspan - 1; k++) {
      const v = (k * spacing) / vspan;
      for (let i = 0; i <= len; i++) {
        const u = i / len;
        const e = lp(a0, a1, u);
        const g = lp(b0, b1, u);
        const x = Math.round(e[0] + (g[0] - e[0]) * v);
        const y = Math.round(e[1] + (g[1] - e[1]) * v);
        if (r.alphaAt(x, y) !== 255) continue;
        if (tex === 'thatch') {
          // combed straw: dashed rows, one ramp step off the plane fill
          // (sparser dashes on the lit plane so it stays clearly lighter)
          if ((i + k * 3) % (lit ? 8 : 5) < 2) r.set(x, y, lit ? ramp.base : ramp.dark);
        } else if (tex === 'shingle') {
          // §5.1: shingle rows, lighter course every 3rd row
          const c: RGB = k % 3 === 0 ? (lit ? P.woodPale : ramp.lit) : lit ? ramp.base : ramp.dark;
          r.set(x, y, c);
        } else {
          r.set(x, y, lit ? ramp.base : ramp.dark);
        }
      }
    }
    // 2-row 50% eave dither (dark tone) on the screen-right plane (§5.3);
    // thatch also gets a ragged ±1px eave fringe on both planes (§5.1)
    for (let i = 0; i <= len; i++) {
      const u = i / len;
      const e = lp(a0, a1, u);
      if (!lit) {
        const g = lp(b0, b1, u);
        for (const dv of [1, 2]) {
          const x = Math.round(e[0] + ((g[0] - e[0]) * dv) / vspan);
          const y = Math.round(e[1] + ((g[1] - e[1]) * dv) / vspan);
          if (Raster.ditherOn(i, dv, 50) && r.alphaAt(x, y) === 255) r.set(x, y, ramp.dark);
        }
      }
      if (tex === 'thatch') {
        // §5.1 ragged eave: straw tufts overhang 1px below the eave on
        // alternating runs, with a dark notch bitten into the eave between
        if (i % 4 < 2) r.set(Math.round(e[0]), Math.round(e[1]) + 1, lit ? ramp.lit : ramp.base);
        else if (i % 4 === 2) r.set(Math.round(e[0]), Math.round(e[1]), ramp.dark);
      }
    }
  };
  texPlane(s.Wt, s.St, r1, r2, true);
  texPlane(s.St, s.Et, r2, r2, false);
  // hip seams: 1px dark diagonals from the ridge ends to the eave corners
  line2(r, r1, s.Wt, ramp.dark);
  line2(r, r2, s.St, ramp.dark);
  line2(r, r2, s.Et, ramp.dark);
  // ridge line in the light tone
  line2(r, r1, r2, ramp.lit);
  return { r1, r2 };
}

/** Cone roof (§7.14): stacked 1px ellipse rows shrinking to an apex. */
function cone(r: Raster, cx: number, baseY: number, rx: number, h: number, ramp: RoofRamp): void {
  for (let i = 0; i <= h; i++) {
    const rr = Math.max(0, Math.round((rx * (h - i)) / h));
    const y = baseY - i;
    for (let x = cx - rr; x <= cx + rr; x++) {
      const f = rr === 0 ? 0.5 : (x - (cx - rr)) / (2 * rr);
      r.set(x, y, f < 0.33 ? ramp.lit : f > 0.72 ? ramp.dark : ramp.base);
    }
  }
  r.set(cx, baseY - h, ramp.lit);
}

// ---------------------------------------------------------------- props

/**
 * Masked trim band along a line (heraldic painted band / cloth trim). Only
 * recolors interior opaque pixels so the outline pass never eats the mask.
 */
function maskBand(r: Raster, a: Pt, b: Pt, rows: number, dy = 0): void {
  const steps = Math.max(2, Math.round(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(a[0] + ((b[0] - a[0]) * i) / steps);
    const y = Math.round(a[1] + ((b[1] - a[1]) * i) / steps) + dy;
    for (let row = 0; row < rows; row++) {
      if (r.alphaAt(x, y + row) === 255) {
        r.set(x, y + row, i < steps / 3 ? M.light : i > (2 * steps) / 3 ? M.dark : M.mid);
      }
    }
  }
}

function bannerPole(r: Raster, x: number, y: number, h: number, fw = 7, fh = 5): void {
  r.fillRect(x, y - h, 1, h, P.woodDark);
  r.set(x, y - h, P.goldShine);
  for (let fy = 0; fy < fh; fy++) {
    for (let fx = 1; fx <= fw; fx++) {
      const c: RGB = fy === 0 ? M.light : fx > fw - 2 || fy === fh - 1 ? M.dark : M.mid;
      r.set(x + fx, y - h + 1 + fy, c);
    }
  }
}

function pennant(r: Raster, x: number, y: number, h: number): void {
  r.fillRect(x, y - h, 1, h, P.woodDark);
  r.set(x + 1, y - h, M.light);
  r.set(x + 2, y - h, M.mid);
  r.set(x + 1, y - h + 1, M.mid);
  r.set(x + 2, y - h + 1, M.dark);
}

/**
 * §5.3 house player color: a 3×3 masked pennant on a short gable pole. The
 * flag is authored PRE-OUTLINED (1px `outline` border around the masked core):
 * an unbordered 3×3 flag poking into open sky lost all but 2 px to the §7.2
 * outline pass, leaving the house team-unreadable at 1× (r3-08/r3-14).
 * Light+mid tones dominate the core so the color reads at 1×.
 */
function gablePennant(r: Raster, x: number, y: number, h: number): void {
  r.fillRect(x, y - h, 1, h, P.woodDark);
  r.fillRect(x + 1, y - h - 1, 5, 5, P.outline);
  for (let fy = 0; fy < 3; fy++) {
    for (let fx = 0; fx < 3; fx++) {
      const c: RGB =
        fy === 0 ? (fx < 2 ? M.light : M.mid)
        : fy === 1 ? (fx === 0 ? M.light : M.mid)
        : fx === 2 ? M.dark : M.mid;
      r.set(x + 2 + fx, y - h + fy, c);
    }
  }
}

function doorCloth(r: Raster, x: number, y: number, w: number, h: number): void {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const c: RGB = yy === 0 ? M.light : xx >= w - 1 || yy >= h - 1 ? M.dark : M.mid;
      r.set(x + xx, y + yy, c);
    }
  }
}

function darkDoor(r: Raster, x: number, y: number, w: number, h: number, arch = false): void {
  r.fillRect(x, y, w, h, P.outline);
  if (arch) {
    r.set(x, y, P.stoneLight);
    r.set(x + w - 1, y, P.stoneLight);
    for (let i = 0; i < w; i++) r.set(x + i, y - 1, P.stoneLight);
  }
}

function windowSlit(r: Raster, x: number, y: number): void {
  r.fillRect(x, y, 1, 3, P.outline);
}

function litWindow(r: Raster, x: number, y: number, glaze = false): void {
  r.fillRect(x, y, 2, 3, glaze ? P.waterLight : P.thatchLight);
  r.set(x, y + 2, glaze ? P.waterBase : P.thatchBase);
}

// ---------------------------------------------------------------- recipes

type Recipe = (c: Canvas, age: Age, banner: boolean) => void;

function rTownCenter(c: Canvas, age: Age, banner: boolean): void {
  const idx = ageIdx(age);
  const stone = idx >= 2;
  // §5.1 crescendo: Dark = thatch, Feudal = wood shingle, Castle+ = slate
  const roof: RoofRamp = age === 'dark' ? THATCH : age === 'feudal' ? SHINGLE : SLATE;
  const tex: RoofTex = age === 'dark' ? 'thatch' : age === 'feudal' ? 'shingle' : 'slate';
  yard(c, `tc:${age}`, P.dirtLight);
  // raised 6px platform (stone from castle age, log crib before) — §5.3
  const plat = struct(c.cx, c.cy, 1.75, 1.75, 6);
  drawWalls(c.r, plat, age === 'castle' ? 'stone' : age === 'imperial' ? 'dressed' : 'log', `tc:p:${age}`);
  // platform top: packed-earth deck; Imperial upgrades to stonePale flagstones
  const deckC: RGB = age === 'imperial' ? P.stonePale : P.dirtPale;
  quad(c.r, [plat.Nt, plat.Et, plat.St, plat.Wt], deckC);
  for (let i = 0; i < 84; i++) {
    const rng = new Rng(`tc:fl:${age}:${i}`);
    const fx = c.cx + rng.int(-106, 106);
    const fy = c.cy - 6 + rng.int(-50, 50);
    const [pr, pg, pb, pa] = c.r.get(fx, fy);
    if (pa === 255 && pr === deckC[0] && pg === deckC[1] && pb === deckC[2]) {
      c.r.set(
        fx,
        fy,
        age === 'imperial'
          ? rng.chance(0.5) ? P.stoneLight : P.stoneDark
          : rng.chance(0.5) ? P.dirtLight : P.parchDark,
      );
    }
  }
  // front steps at the S corner
  for (let i = 0; i < 3; i++) {
    const y = plat.S[1] - i * 2 - 1;
    c.r.fillRect(
      Math.round(plat.S[0]) - 6 + i, y - 1, 12 - 2 * i,
      2,
      age === 'imperial' ? P.stonePale : stone ? P.stoneLight : P.woodPale,
    );
  }
  // Great hall at the §5.3 H budget: 26px walls + 34px hipped roof over the
  // 6px platform. Raw px, the same convention every other recipe uses for its
  // H table row — the old 44/58 superstructure read as an oversized circus
  // tent over a black void (r3-02/r3-14/r3-15).
  const hallCy = c.cy - 10;
  const wallH = 26;
  const hall = struct(c.cx, hallCy, 1.15, 1.15, wallH);
  // both camera-facing faces carry the §5.1 age wall grammar (Dark: log
  // verticals + lashings; Feudal: timber frame; Castle: coursed stone piers;
  // Imperial: dressed stone) — no more untextured woodBase band
  drawWalls(c.r, hall, wallFor(age), `tc:hall:${age}`);
  // open-sided great-hall read: a wide doorway at the S corner showing a lit
  // dirtPale interior floor strip under interior shadow
  const ox = Math.round(hall.S[0]);
  const oy = Math.round(hall.S[1]);
  c.r.fillRect(ox - 6, oy - 14, 13, 14, P.uiWoodDark);
  for (let yy = oy - 3; yy <= oy - 1; yy++) {
    for (let xx = ox - 6; xx <= ox + 6; xx++) c.r.set(xx, yy, P.dirtPale);
  }
  c.r.set(ox - 3, oy - 2, P.dirtLight);
  c.r.set(ox + 2, oy - 3, P.dirtLight);
  c.r.set(ox + 4, oy - 1, P.parchDark);
  // corner posts/piers overlap the wall corners up to the eave
  const postC: RGB = age === 'imperial' ? P.stonePale : stone ? P.stoneBase : P.woodBase;
  const postLit: RGB = age === 'imperial' ? P.stonePale : stone ? P.stoneLight : P.woodLight;
  for (const p of [hall.W, hall.S, hall.E]) {
    c.r.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - wallH, 3, wallH, postC);
    c.r.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - wallH, 1, wallH, postLit);
    if (age === 'dark') {
      // rope lashings at the log joints
      c.r.set(Math.round(p[0]), Math.round(p[1]) - 18, P.clothDark);
      c.r.set(Math.round(p[0]) + 1, Math.round(p[1]) - 17, P.clothDark);
    }
  }
  // the big hipped roof — the defining mass (§7.13): 34px rise, ridgeInset
  // 0.18 keeps a long readable light ridge with 1px dark hip seams (the old
  // 0.3 inset on a 58px rise collapsed to a near-point apex)
  const ridge = hippedRoof(c.r, hall, 34, roof, tex, 0.18);
  const apex: Pt = [(ridge.r1[0] + ridge.r2[0]) / 2, (ridge.r1[1] + ridge.r2[1]) / 2];
  if (age === 'imperial') {
    // gold ridge trim + goldShine finials at both ridge ends
    line2(c.r, [ridge.r1[0], ridge.r1[1] + 1], [ridge.r2[0], ridge.r2[1] + 1], P.goldBase);
    c.r.set(Math.round(ridge.r1[0]), Math.round(ridge.r1[1]) - 1, P.goldShine);
    c.r.set(Math.round(ridge.r2[0]), Math.round(ridge.r2[1]) - 1, P.goldShine);
    // glazed gable window in a pale surround on the SE hip plane
    const gx = Math.round((hall.St[0] + hall.Et[0] + 2 * ridge.r2[0]) / 4);
    const gy = Math.round((hall.St[1] + hall.Et[1] + 2 * ridge.r2[1]) / 4);
    c.r.fillRect(gx - 2, gy - 3, 6, 6, P.stonePale);
    litWindow(c.r, gx, gy - 2, true);
    // dashed gold trim on the platform cornice (§5.1 parapet trim, no banding)
    for (const [a, b] of [[plat.Wt, plat.St], [plat.St, plat.Et]] as const) {
      const steps = Math.round(Math.abs(b[0] - a[0]));
      for (let i = 0; i < steps; i += 5) {
        const x = Math.round(a[0] + ((b[0] - a[0]) * i) / steps);
        const y = Math.round(a[1] + ((b[1] - a[1]) * i) / steps);
        c.r.set(x, y, P.goldBase);
        c.r.set(x + 1, y, P.goldBase);
      }
    }
  }
  // side lean-to annex against the hall's SE face, drawn AFTER the main roof
  // so the intersection resolves cleanly (annex reads in front)
  const annex = struct(c.cx + 62, c.cy + 8, 0.5, 0.42, 10);
  drawWalls(c.r, annex, wallFor(age), `tc:a:${age}`);
  drawRoof(c.r, annex, 6, roof, 0.1);
  // door cloth hanging in the S doorway (§5.3 player-color placement)
  doorCloth(c.r, ox - 2, oy - 13, 5, 6);
  if (banner) {
    // §5.3: tall banner pole seated at the RIDGE MIDPOINT (the midpoint of
    // r1–r2 lies on the ridge line) — flag + door cloth are the ONLY
    // player-color carriers (no trim stripes; see COVERAGE_OVERRIDES)
    bannerPole(c.r, Math.round(apex[0]), Math.round(apex[1]), 12, 8, 6);
  }
}

function rHouse(c: Canvas, age: Age, banner: boolean): void {
  const rng = new Rng(`house:${age}`);
  // NO dirt apron in done states — dirt footprints belong to construct0 only
  // (§8.4: the apron corrupted the green placement-preview read).
  if (age === 'dark') {
    // §5.3: oval wattle hut + conical thatch filling the 2x2 diamond
    // (12px wall / 14px roof, drum wide enough to own its footprint)
    const hx = c.cx;
    const hy = c.cy + 10; // wall base center
    const WR = 29; // wall radius
    // drum wall: bottom bulge + cylinder band + top ellipse
    c.r.fillEllipse(hx, hy, WR, 11, P.woodPale);
    c.r.fillRect(hx - WR, hy - 12, WR * 2 + 1, 13, P.woodPale);
    c.r.fillEllipse(hx, hy - 12, WR, 9, P.woodPale);
    // screen-right shade + clothDark wattle weave (§5.1); left stays lit
    for (let y = hy - 20; y <= hy + 11; y++) {
      for (let x = hx - WR; x <= hx + WR; x++) {
        if (c.r.alphaAt(x, y) !== 255) continue;
        if (x > hx + WR - 6) c.r.set(x, y, P.woodLight);
        else if (x >= hx - WR + 5 && (x + 2 * y) % 5 === 0) c.r.set(x, y, P.clothDark);
      }
    }
    // conical thatch roof with comb rows, 2-row eave dither + ragged eave
    const RR = 33;
    const RH = 14;
    const by = hy - 13;
    for (let i = 0; i <= RH; i++) {
      const rr = Math.max(1, Math.round((RR * (RH - i)) / RH));
      const y = by - i;
      for (let x = hx - rr; x <= hx + rr; x++) {
        const f = (x - (hx - rr)) / (2 * rr);
        let col: RGB = f < 0.33 ? P.thatchLight : f > 0.72 ? P.thatchDark : P.thatchBase;
        if (i % 3 === 1 && (x - hx + i * 2) % 5 < 2) col = f < 0.4 ? P.thatchBase : P.thatchDark;
        if (i <= 1 && Raster.ditherOn(x, y, 50)) col = P.thatchDark;
        c.r.set(x, y, col);
      }
    }
    c.r.set(hx, by - RH, P.thatchLight); // apex
    for (let x = hx - RR; x <= hx + RR; x++) {
      if ((x - hx + 40) % 4 < 2 && c.r.alphaAt(x, by + 1) === 255) c.r.set(x, by + 1, P.thatchDark); // ragged eave
    }
    darkDoor(c.r, hx - 2, hy + 2, 5, 8);
    // undyed hide door flap (§5.1 dark age) — player color lives ONLY in the
    // gable pennant (§5.3), never in stripes or door cloth on houses
    c.r.fillRect(hx - 2, hy + 2, 5, 5, P.clothBase);
    c.r.fillRect(hx + 1, hy + 2, 1, 5, P.clothDark);
    c.r.set(hx - 2, hy + 2, P.clothLight);
    if (banner) gablePennant(c.r, hx, by - RH + 1, 6);
    return;
  }
  const wall = wallFor(age);
  const s = struct(c.cx, c.cy, 0.85, 0.72, age === 'imperial' ? 14 : 12);
  drawWalls(c.r, s, wall, `house:${age}`);
  if (age === 'castle') {
    // jettied timber upper floor over the stone ground floor
    const upper = struct(c.cx, c.cy - 7, 0.9, 0.77, 6);
    drawWalls(c.r, upper, 'timber', `house:up:${age}`);
  }
  drawRoof(c.r, s, age === 'feudal' ? 12 : 10, roofFor(age), age === 'imperial' ? 0.15 : 0.05);
  if (age === 'imperial') {
    // chimney — anchored to the back eave line at its x so it never floats
    const chx = Math.round(s.Nt[0]) + 8;
    const edgeY =
      s.Nt[1] + ((s.Et[1] - s.Nt[1]) * (chx - s.Nt[0])) / Math.max(1, s.Et[0] - s.Nt[0]);
    const chy = Math.round(edgeY) + 5; // base sunk 5px into the roof plane
    c.r.fillRect(chx, chy - 12, 3, 12, P.stoneBase);
    c.r.fillRect(chx, chy - 12, 1, 12, P.stoneLight);
    c.r.fillRect(chx - 1, chy - 13, 5, 1, P.stoneLight);
    litWindow(c.r, Math.round(s.S[0]) + 4, Math.round(s.S[1]) - 8, true);
  }
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 6, 4, 6, age !== 'feudal');
  const wx = Math.round((s.S[0] + s.E[0]) / 2);
  c.r.fillRect(wx, Math.round((s.S[1] + s.E[1]) / 2) - 8, 2, 3, P.woodDark); // shutter
  if (banner) {
    // §5.3: the 3×3 gable pennant is the house's ONLY player-color carrier
    const gy = Math.round((s.Nt[1] + s.St[1]) / 2) - (age === 'feudal' ? 11 : 9);
    gablePennant(c.r, Math.round((s.Nt[0] + s.St[0]) / 2) + rng.int(-2, 2), gy, 7);
  }
}

function rMill(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'mill');
  // stout log crib base, front-center
  const s = struct(c.cx - 4, c.cy + 4, 0.62, 0.56, 12);
  drawWalls(c.r, s, 'log', 'mill');
  quad(c.r, [s.Nt, s.Et, s.St, s.Wt], P.woodBase);
  // tapered wooden tower rising from the crib
  const tcx = Math.round(s.cx);
  const ty0 = Math.round((s.Nt[1] + s.St[1]) / 2) + 2;
  const towerH = 24;
  for (let i = 0; i < towerH; i++) {
    const rr = 11 - Math.round((i * 4) / towerH);
    const y = ty0 - i;
    for (let x = tcx - rr; x <= tcx + rr; x++) {
      c.r.set(x, y, x < tcx - rr + 3 ? P.woodLight : x > tcx + rr - 3 ? P.woodDark : P.woodBase);
    }
    if (i % 4 === 2) {
      for (let x = tcx - rr + 3; x <= tcx + rr - 3; x += 4) c.r.set(x, y, P.woodDark);
    }
  }
  cone(c.r, tcx, ty0 - towerH, 10, 8, THATCH);
  // diagonal 4-blade sail cross (X) on the SW face — the skyline identity
  const hub: Pt = [tcx - 7, ty0 - towerH + 3];
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const len = 14;
    // 3-cell-wide sail: cloth panel between the blade spar and its edge line
    for (let i = 3; i <= len - 2; i++) {
      const bx = hub[0] + dx * i;
      const by = hub[1] + dy * i;
      const stripe = i % 4 < 2;
      c.r.set(bx - dx, by, stripe ? M.mid : P.parchLight);
      c.r.set(bx - dx * 2, by, stripe ? M.dark : P.parchBase);
      c.r.set(bx - dx, by + dy, stripe ? M.mid : P.parchBase);
    }
    c.r.line(hub[0], hub[1], hub[0] + dx * len, hub[1] + dy * len, P.woodDark);
  }
  c.r.fillRect(hub[0] - 1, hub[1] - 1, 2, 2, P.goldDark);
  // door + grain sacks
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 6, 4, 6);
  c.r.fillEllipse(Math.round(s.S[0]) + 7, Math.round(s.S[1]) - 2, 2, 2, P.clothBase);
  c.r.fillEllipse(Math.round(s.S[0]) + 10, Math.round(s.S[1]) - 1, 2, 2, P.clothLight);
  c.r.set(Math.round(s.S[0]) + 7, Math.round(s.S[1]) - 3, P.thatchLight);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 2, 2);
    maskBand(c.r, [tcx - 8, ty0 - towerH + 9], [tcx + 8, ty0 - towerH + 9], 2);
  }
}

function rLumberCamp(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'lumber');
  // open lean-to: four posts + single-pitch shingle roof
  const s = struct(c.cx - 8, c.cy - 4, 0.7, 0.55, 9);
  for (const p of [s.N, s.E, s.W, s.S]) {
    c.r.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 10, 3, 10, P.woodBase);
    c.r.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 10, 1, 10, P.woodLight);
  }
  // big horizontal log stack in the open yard (pale cut ends face camera)
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      const lx = c.cx + 4 + i * 3 + row * 2;
      const ly = c.cy + 16 - row * 4;
      c.r.fillRect(lx, ly - 3, 24, 4, P.woodBase);
      c.r.fillRect(lx, ly - 3, 24, 1, P.woodLight);
      c.r.fillEllipse(lx + 24, ly - 1, 2, 2, P.woodPale);
      c.r.set(lx + 24, ly - 1, P.woodDark);
    }
  }
  // a couple of logs waiting under the roof
  c.r.fillRect(Math.round(s.cx) - 12, Math.round(s.cy) + 2, 18, 3, P.woodBase);
  c.r.fillEllipse(Math.round(s.cx) + 6, Math.round(s.cy) + 3, 2, 1, P.woodPale);
  // single-pitch shingle roof: high on the N side, low on the S
  quad(c.r, [
    [s.Wt[0] - 2, s.Wt[1] - 4], [s.Nt[0] + 2, s.Nt[1] - 6],
    [s.Et[0] + 2, s.Et[1] - 2], [s.St[0] + 2, s.St[1]],
  ], P.woodBase);
  // plank rows on the roof
  for (const f of [0.3, 0.6]) {
    c.r.line(
      s.Wt[0] - 2 + (s.Nt[0] - s.Wt[0]) * f, s.Wt[1] - 4 + (s.Nt[1] - 2 - s.Wt[1]) * f,
      s.St[0] + 2 + (s.Et[0] - s.St[0]) * f, s.St[1] + (s.Et[1] - 2 - s.St[1]) * f,
      P.woodDark,
    );
  }
  quad(c.r, [
    [s.Wt[0] - 2, s.Wt[1] - 4], [s.St[0] + 2, s.St[1]],
    [s.St[0], s.St[1] + 1], [s.Wt[0] - 4, s.Wt[1] - 3],
  ], P.woodLight);
  if (banner) {
    // masked cloth trim along the front roof edge only
    maskBand(c.r, [s.Wt[0] - 1, s.Wt[1] - 2], [s.St[0] + 1, s.St[1] + 1], 2, -1);
  }
  // sawhorse + leaned axe outside
  const shx = c.cx - 30;
  const shy = c.cy + 6;
  c.r.line(shx - 4, shy, shx + 4, shy - 1, P.woodPale);
  c.r.line(shx - 3, shy + 4, shx - 1, shy, P.woodDark);
  c.r.line(shx + 3, shy + 4, shx + 1, shy, P.woodDark);
  c.r.line(shx + 8, shy + 3, shx + 10, shy - 3, P.woodBase);
  c.r.fillRect(shx + 9, shy - 5, 2, 2, P.metalBase);
  // stump with a stuck axe
  c.r.fillEllipse(c.cx - 34, c.cy + 6, 3, 2, P.woodPale);
  c.r.set(c.cx - 34, c.cy + 4, P.metalBase);
}

function rMiningCamp(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'mining');
  // dark pit mouth
  c.r.fillEllipse(c.cx - 8, c.cy + 4, 7, 3, P.outline);
  c.r.fillEllipse(c.cx - 8, c.cy + 3, 7, 2, P.stoneDark);
  c.r.fillEllipse(c.cx - 8, c.cy + 4, 5, 2, P.outline);
  // timber A-frame headframe over the pit
  const apex: Pt = [c.cx - 8, c.cy - 20];
  c.r.line(c.cx - 18, c.cy + 6, apex[0], apex[1], P.woodBase);
  c.r.line(c.cx - 17, c.cy + 6, apex[0] + 1, apex[1], P.woodDark);
  c.r.line(c.cx + 2, c.cy + 6, apex[0], apex[1], P.woodBase);
  c.r.line(c.cx + 3, c.cy + 6, apex[0] + 1, apex[1], P.woodDark);
  c.r.line(c.cx - 14, c.cy - 6, c.cx - 2, c.cy - 6, P.woodDark); // crossbar
  // pulley rope into the pit
  c.r.line(apex[0], apex[1] + 1, apex[0], c.cy + 2, P.clothDark);
  // shed hut at the back-right
  const s = struct(c.cx + 16, c.cy - 4, 0.5, 0.42, 7);
  drawWalls(c.r, s, 'plank', 'mining');
  drawRoof(c.r, s, 5, SHINGLE, 0.1);
  // ore cart with fleck load
  const cartX = c.cx + 6;
  const cartY = c.cy + 12;
  c.r.fillRect(cartX - 4, cartY - 5, 9, 4, P.woodDark);
  c.r.fillRect(cartX - 3, cartY - 6, 7, 2, P.stoneBase);
  c.r.set(cartX - 2, cartY - 6, P.goldBase);
  c.r.set(cartX + 1, cartY - 7, P.goldShine);
  c.r.set(cartX + 2, cartY - 6, P.stoneLight);
  c.r.fillEllipse(cartX - 2, cartY, 2, 2, P.woodBase);
  c.r.fillEllipse(cartX + 3, cartY, 2, 2, P.woodBase);
  // crate + pick
  c.r.fillRect(c.cx - 24, c.cy + 8, 5, 4, P.woodPale);
  c.r.line(c.cx + 16, c.cy + 10, c.cx + 20, c.cy + 6, P.woodBase);
  c.r.set(c.cx + 20, c.cy + 5, P.metalBase);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 2, -2);
    maskBand(c.r, s.St, s.Et, 2, -2);
    maskBand(c.r, [c.cx - 15, c.cy + 3], [c.cx + 1, c.cy + 3], 1);
    pennant(c.r, apex[0], apex[1] + 1, 5);
  }
}

function rBarracks(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'barracks');
  // dark-age long-hall: ridge NW–SE
  const s = struct(c.cx - 6, c.cy - 4, 1.05, 0.75, 14);
  drawWalls(c.r, s, 'log', 'barracks');
  drawRoof(c.r, s, 16, THATCH, 0.12);
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 8, 5, 8);
  if (banner) {
    doorCloth(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 8, 5, 5);
    maskBand(c.r, s.Wt, s.St, 2, -3);
  }
  // shield rack on the SW wall: 3 masked round shields
  for (let i = 0; i < 3; i++) {
    const fx = 0.25 + i * 0.25;
    const sx = Math.round(s.W[0] + (s.S[0] - s.W[0]) * fx);
    const sy = Math.round(s.W[1] + (s.S[1] - s.W[1]) * fx) - 8;
    c.r.fillEllipse(sx, sy, 2, 2, M.mid);
    c.r.set(sx - 1, sy - 1, M.light);
    c.r.set(sx + 1, sy + 1, M.dark);
    c.r.set(sx, sy, P.metalDark);
  }
  // spear rack + training post in the yard corner
  const px = c.cx + 42;
  const py = c.cy + 10;
  for (let i = 0; i < 3; i++) {
    c.r.line(px + i * 3, py, px + i * 3 + 2, py - 12, P.woodPale);
    c.r.set(px + i * 3 + 2, py - 13, P.metalLight);
  }
  c.r.fillRect(px - 10, py - 8, 2, 10, P.woodBase);
  c.r.set(px - 10, py - 9, P.woodDark);
}

function rArcheryRange(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'range');
  // timber shed at the back
  const s = struct(c.cx - 22, c.cy - 12, 0.62, 0.5, 10);
  drawWalls(c.r, s, 'timber', 'range');
  drawRoof(c.r, s, 8, THATCH, 0.15);
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 6, 4, 6);
  if (banner) {
    // awning stripe over the shed door
    const ax = Math.round(s.S[0]) - 4;
    const ay = Math.round(s.S[1]) - 8;
    for (let i = 0; i < 8; i++) {
      c.r.set(ax + i, ay + (i % 2), i % 3 === 0 ? M.light : i % 3 === 1 ? M.mid : M.dark);
      c.r.set(ax + i, ay + 1 + (i % 2), i % 2 === 0 ? M.mid : M.dark);
    }
    maskBand(c.r, s.Wt, s.St, 2, -3);
    maskBand(c.r, s.St, s.Et, 2, -3);
  }
  // low fence along the SE edge of the yard
  for (let i = 0; i < 5; i++) {
    const fx = c.cx + 8 + i * 9;
    const fy = c.cy + 18 - i * 4;
    c.r.fillRect(fx, fy - 4, 1, 5, P.woodDark);
    c.r.line(fx, fy - 3, fx + 8, fy - 3 - 4, P.woodBase);
  }
  // target butt — the identity feature
  const tx = c.cx + 26;
  const ty2 = c.cy - 2;
  c.r.fillEllipse(tx, ty2, 6, 6, P.thatchBase);
  c.r.fillEllipse(tx, ty2, 6, 6, P.thatchBase);
  for (let y = ty2 - 6; y <= ty2 + 6; y++) {
    for (let x = tx - 6; x <= tx + 6; x++) {
      if (c.r.alphaAt(x, y) === 255 && Raster.inEllipse(x, y, tx, ty2, 6, 6) && !Raster.inEllipse(x, y, tx, ty2, 4, 4)) {
        if ((x + y) % 2 === 0) c.r.set(x, y, P.thatchDark);
      }
    }
  }
  // highlight ring + red bullseye
  for (let a = 0; a < 16; a++) {
    const x = Math.round(tx + 4 * Math.cos((a * Math.PI) / 8));
    const y = Math.round(ty2 + 4 * Math.sin((a * Math.PI) / 8));
    c.r.set(x, y, P.highlight);
  }
  c.r.fillRect(tx - 1, ty2 - 1, 2, 2, P.berryRed);
  c.r.fillRect(tx - 2, ty2 + 6, 5, 1, P.woodDark); // stand
  // 3 arrows stuck in the ground
  for (const [axr, ayr] of [[tx - 14, ty2 + 12], [tx - 10, ty2 + 15], [tx - 18, ty2 + 15]] as const) {
    c.r.line(axr, ayr, axr + 2, ayr - 5, P.woodPale);
    c.r.set(axr + 2, ayr - 6, P.clothLight);
  }
}

function rStable(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'stable');
  // wide gable barn
  const s = struct(c.cx - 10, c.cy - 4, 1.0, 0.72, 12);
  drawWalls(c.r, s, 'timber', 'stable');
  drawRoof(c.r, s, 14, THATCH, 0.08);
  // big open door: dark interior + hay
  const dx = Math.round(s.S[0]);
  const dy = Math.round(s.S[1]);
  darkDoor(c.r, dx - 4, dy - 9, 8, 9);
  c.r.fillRect(dx - 3, dy - 3, 3, 2, P.thatchLight);
  // horseshoe over the door
  c.r.set(dx - 1, dy - 11, P.metalLight);
  c.r.set(dx, dy - 12, P.metalLight);
  c.r.set(dx + 1, dy - 11, P.metalLight);
  // corral fence on the right tiles
  for (let i = 0; i < 4; i++) {
    const fx = c.cx + 20 + i * 10;
    const fy = c.cy + 2 + i * 5;
    c.r.fillRect(fx, fy - 5, 1, 6, P.woodDark);
    c.r.line(fx, fy - 4, fx + 9, fy - 4 + 5, P.woodBase);
    c.r.line(fx, fy - 2, fx + 9, fy - 2 + 5, P.woodBase);
  }
  // water trough
  c.r.fillRect(c.cx + 24, c.cy - 4, 8, 3, P.woodDark);
  c.r.fillRect(c.cx + 25, c.cy - 4, 6, 1, P.waterBase);
  c.r.set(c.cx + 26, c.cy - 4, P.waterLight);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 2, -3);
    maskBand(c.r, s.St, s.Et, 2, -3);
    pennant(c.r, Math.round((s.Nt[0] + s.St[0]) / 2), Math.round((s.Nt[1] + s.St[1]) / 2) - 13, 7);
  }
}

function rBlacksmith(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'smith');
  // open-front forge
  const s = struct(c.cx - 4, c.cy - 4, 0.85, 0.68, 12);
  drawWalls(c.r, s, 'timber', 'smith');
  // open front: carve a big dark opening in the SE wall
  const ox = Math.round((s.S[0] + s.E[0]) / 2) - 4;
  const oy = Math.round((s.S[1] + s.E[1]) / 2);
  c.r.fillRect(ox - 2, oy - 9, 9, 9, P.outline);
  c.r.fillRect(ox - 1, oy - 4, 2, 2, P.berryRed); // forge glow inside
  c.r.set(ox, oy - 5, P.goldShine);
  drawRoof(c.r, s, 12, SHINGLE, 0.12);
  // stone chimney with embers, rising through the left roof plane
  const chx = Math.round((s.Wt[0] + s.Nt[0]) / 2) + 6;
  const chy = Math.round((s.Wt[1] + s.Nt[1]) / 2) - 8;
  c.r.fillRect(chx, chy - 8, 4, 12, P.stoneBase);
  c.r.fillRect(chx, chy - 8, 1, 12, P.stoneLight);
  c.r.fillRect(chx - 1, chy - 9, 6, 1, P.stoneLight);
  c.r.set(chx + 1, chy - 10, P.berryRed);
  c.r.set(chx + 2, chy - 10, P.goldShine);
  c.r.set(chx + 1, chy - 11, P.berryRed);
  // anvil outside on a stump
  const avx = c.cx + 24;
  const avy = c.cy + 10;
  c.r.fillRect(avx - 1, avy - 2, 6, 2, P.metalDark);
  c.r.set(avx + 5, avy - 2, P.metalBase);
  c.r.fillRect(avx, avy, 3, 2, P.woodBase);
  // wall-hung tools
  c.r.line(ox + 8, oy - 8, ox + 8, oy - 5, P.metalBase);
  c.r.line(ox + 10, oy - 8, ox + 10, oy - 6, P.woodPale);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 2, -3);
    maskBand(c.r, s.St, s.Et, 2, -3);
  }
}

function rMarket(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'market');
  // timber-frame trading hall
  const s = struct(c.cx - 14, c.cy - 10, 1.1, 0.8, 16);
  drawWalls(c.r, s, 'timber', 'market');
  drawRoof(c.r, s, 12, SHINGLE, 0.2);
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 7, 5, 7);
  // two cloth awning stalls in the yard
  const stall = (sx: number, sy: number, masked: boolean): void => {
    for (const px of [sx - 6, sx + 6]) {
      c.r.fillRect(px, sy - 8, 1, 9, P.woodDark);
    }
    c.r.fillRect(sx - 6, sy - 2, 13, 3, P.woodPale); // counter
    for (let i = 0; i < 13; i++) {
      const canopyY = sy - 9 + (i % 2);
      const stripe = Math.floor(i / 2) % 2 === 0;
      c.r.set(sx - 6 + i, canopyY, masked ? (stripe ? M.light : M.mid) : stripe ? P.parchLight : P.parchBase);
      c.r.set(sx - 6 + i, canopyY + 1, masked ? (stripe ? M.mid : M.dark) : stripe ? P.parchBase : P.parchDark);
    }
    c.r.fillRect(sx - 3, sy - 5, 2, 2, P.goldBase);
    c.r.set(sx + 2, sy - 5, P.berryRed);
  };
  stall(c.cx + 26, c.cy + 4, banner);
  stall(c.cx + 6, c.cy + 20, false);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 3, -4);
    maskBand(c.r, s.St, s.Et, 2, -4);
  }
  // barrels + coin chest
  c.r.fillRect(c.cx - 34, c.cy + 12, 4, 5, P.woodBase);
  c.r.fillRect(c.cx - 34, c.cy + 13, 4, 1, P.woodDark);
  c.r.fillRect(c.cx - 28, c.cy + 14, 4, 4, P.woodBase);
  c.r.fillRect(c.cx - 20, c.cy + 16, 5, 3, P.woodDark);
  c.r.set(c.cx - 18, c.cy + 15, P.goldShine);
  c.r.set(c.cx - 17, c.cy + 16, P.goldBase);
}

function rSiegeWorkshop(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'siege');
  // wide open-front stone shed
  const s = struct(c.cx - 10, c.cy - 8, 1.25, 0.8, 14);
  drawWalls(c.r, s, 'stone', 'siege');
  // wide arch opening on the SE face
  const ox = Math.round((s.S[0] + s.E[0]) / 2) - 6;
  const oy = Math.round((s.S[1] + s.E[1]) / 2) - 1;
  c.r.fillRect(ox - 3, oy - 10, 13, 10, P.outline);
  for (let i = -3; i <= 9; i++) c.r.set(ox + i, oy - 11, P.stoneLight);
  drawRoof(c.r, s, 8, SLATE, 0.2);
  // giant spare wheel leaning on the wall
  const wx = Math.round(s.W[0]) + 8;
  const wy = Math.round(s.W[1]) + 2;
  for (let a = 0; a < 28; a++) {
    const x = Math.round(wx + 9 * Math.cos((a * Math.PI) / 14));
    const y = Math.round(wy + 9 * Math.sin((a * Math.PI) / 14));
    c.r.set(x, y, P.woodDark);
  }
  c.r.line(wx - 6, wy - 6, wx + 6, wy + 6, P.woodDark);
  c.r.line(wx - 6, wy + 6, wx + 6, wy - 6, P.woodDark);
  c.r.line(wx - 8, wy, wx + 8, wy, P.woodDark);
  // timber crane arm over a half-built ram frame
  const cx2 = c.cx + 30;
  const cy2 = c.cy + 6;
  c.r.fillRect(cx2, cy2 - 22, 2, 22, P.woodBase);
  c.r.line(cx2 + 1, cy2 - 22, cx2 + 14, cy2 - 14, P.woodBase);
  c.r.line(cx2 + 14, cy2 - 14, cx2 + 14, cy2 - 8, P.clothDark);
  // half-built ram frame: skeleton box
  c.r.fillRect(cx2 + 6, cy2 - 6, 16, 2, P.woodPale);
  c.r.fillRect(cx2 + 8, cy2 - 10, 2, 6, P.woodBase);
  c.r.fillRect(cx2 + 18, cy2 - 10, 2, 6, P.woodBase);
  c.r.fillEllipse(cx2 + 9, cy2 - 2, 2, 2, P.woodDark);
  c.r.fillEllipse(cx2 + 19, cy2 - 2, 2, 2, P.woodDark);
  if (banner) {
    maskBand(c.r, s.Wt, s.St, 3, -3);
    maskBand(c.r, s.St, s.Et, 2, -3);
    pennant(c.r, cx2 + 14, cy2 - 15, 6);
  }
}

function rMonastery(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'monastery');
  // tall narrow nave
  const s = struct(c.cx - 4, c.cy - 2, 0.95, 0.6, 20);
  drawWalls(c.r, s, 'stone', 'mon');
  drawRoof(c.r, s, 16, SLATE, 0.05);
  // round sunburst window on the SE wall
  const wx = Math.round((s.S[0] + s.E[0]) / 2);
  const wy = Math.round((s.S[1] + s.E[1]) / 2) - 12;
  c.r.fillEllipse(wx, wy, 3, 3, P.goldShine);
  c.r.set(wx, wy, P.goldBase);
  for (const [dx2, dy2] of [[-4, 0], [4, 0], [0, -4], [0, 4]] as const) c.r.set(wx + dx2, wy + dy2, P.goldBase);
  // arched door
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 7, 4, 7, true);
  if (banner) doorCloth(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 7, 4, 4);
  // bell tower at the W corner
  const bx = Math.round(s.W[0]) + 4;
  const bw = 8;
  const towerTop = c.ty + 6;
  c.r.fillRect(bx, towerTop, bw, Math.round(s.W[1]) - towerTop - 2, P.stoneBase);
  c.r.fillRect(bx, towerTop, 2, Math.round(s.W[1]) - towerTop - 2, P.stoneLight);
  for (let row = towerTop + 4; row < s.W[1] - 4; row += 4) c.r.fillRect(bx + 1, row, bw - 2, 1, P.stoneDark);
  // bell opening
  c.r.fillRect(bx + 2, towerTop + 3, 4, 5, P.outline);
  c.r.fillRect(bx + 3, towerTop + 4, 2, 3, P.goldBase);
  c.r.set(bx + 3, towerTop + 4, P.goldShine);
  cone(c.r, bx + bw / 2, towerTop, 6, 6, SLATE);
  // walled herb garden strip
  for (let i = 0; i < 3; i++) {
    c.r.fillRect(c.cx + 22 + i * 7, c.cy + 12 + i * 3, 6, 2, P.leafBase);
    c.r.set(c.cx + 23 + i * 7, c.cy + 12 + i * 3, P.leafLight);
  }
}

function rUniversity(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'univ', P.dirtLight);
  // two-story scholars' hall
  const s = struct(c.cx - 6, c.cy - 6, 1.2, 0.85, 22);
  drawWalls(c.r, s, 'stone', 'univ');
  drawRoof(c.r, s, 14, SLATE, 0.25);
  // three lit arched windows on the SE face
  for (let i = 0; i < 3; i++) {
    const f = 0.25 + i * 0.25;
    const wx = Math.round(s.S[0] + (s.E[0] - s.S[0]) * f);
    const wy = Math.round(s.S[1] + (s.E[1] - s.S[1]) * f) - 13;
    litWindow(c.r, wx, wy);
    c.r.set(wx, wy - 1, P.stoneLight);
    c.r.set(wx + 1, wy - 1, P.stoneLight);
  }
  darkDoor(c.r, Math.round(s.S[0]) - 2, Math.round(s.S[1]) - 8, 5, 8, true);
  // brass armillary sphere on a rooftop post
  const apx = Math.round((s.Nt[0] + s.St[0]) / 2);
  const apy = Math.round((s.Nt[1] + s.St[1]) / 2) - 14;
  c.r.fillRect(apx, apy - 4, 1, 5, P.woodDark);
  for (let a = 0; a < 12; a++) {
    const x = Math.round(apx + 4 * Math.cos((a * Math.PI) / 6));
    const y = Math.round(apy - 7 + 3 * Math.sin((a * Math.PI) / 6));
    c.r.set(x, y, P.goldBase);
  }
  c.r.fillEllipse(apx, apy - 7, 1, 3, P.goldBase);
  c.r.set(apx, apy - 9, P.goldShine);
  if (banner) {
    // heraldic plaque beside the door + painted eave band
    const px = Math.round(s.S[0]) + 5;
    const py = Math.round(s.S[1]) - 9;
    doorCloth(c.r, px, py, 3, 4);
    maskBand(c.r, s.Wt, s.St, 3, -4);
    maskBand(c.r, s.St, s.Et, 2, -4);
  }
}

function towerRecipe(tier: 0 | 1 | 2): Recipe {
  return (c, _age, banner) => {
    const height = 40 + tier * 8;
    const baseY = c.cy + 6;
    const topY = baseY - height;
    const dressed = tier === 2;
    // battered base: radius shrinks as it rises
    for (let y = topY; y <= baseY; y++) {
      const f = (y - topY) / height;
      const rr = Math.round(9 + f * f * 6);
      for (let x = c.cx - rr; x <= c.cx + rr; x++) {
        const c2: RGB = x < c.cx - rr + 3 ? (dressed ? P.stonePale : P.stoneLight)
          : x > c.cx + rr - 3 ? P.stoneDark : dressed ? P.stoneLight : P.stoneBase;
        c.r.set(x, y, c2);
      }
      if ((y - topY) % 4 === 0) {
        for (let x = c.cx - rr + 2; x <= c.cx + rr - 2; x += 5) c.r.set(x, y, P.stoneDark);
      }
    }
    // timber hoarding ring under the crown
    for (let x = c.cx - 10; x <= c.cx + 10; x++) {
      c.r.set(x, topY + 6, P.woodBase);
      if (x % 3 === 0) c.r.set(x, topY + 7, P.woodDark);
    }
    if (tier >= 1) {
      // machicolation row
      for (let x = c.cx - 10; x <= c.cx + 10; x += 2) c.r.set(x, topY + 5, P.outline);
    }
    // crenellated crown
    for (let x = c.cx - 10; x <= c.cx + 10; x++) {
      c.r.set(x, topY + 1, dressed ? P.stonePale : P.stoneLight);
      c.r.set(x, topY, dressed ? P.stonePale : P.stoneLight);
    }
    for (let x = c.cx - 10; x <= c.cx + 10; x += 4) {
      c.r.fillRect(x, topY - 2, 2, 2, dressed ? P.stonePale : P.stoneLight);
    }
    if (dressed) {
      for (let x = c.cx - 9; x <= c.cx + 9; x += 2) c.r.set(x, topY + 2, P.goldBase);
    }
    // arrow slits
    windowSlit(c.r, c.cx - 2, topY + 12);
    windowSlit(c.r, c.cx + 3, topY + 22);
    windowSlit(c.r, c.cx - 3, topY + 30);
    if (banner) {
      maskBand(c.r, [c.cx - 9, topY + 9], [c.cx + 9, topY + 9], 2);
      pennant(c.r, c.cx, topY - 2, 6);
    }
  };
}

function rStoneWall(c: Canvas, _age: Age, _banner: boolean): void {
  // full-tile curtain: walls rise from the whole diamond so adjacent pieces abut
  const H = 12;
  const s = struct(c.cx, c.cy, 0.48, 0.48, H);
  drawWalls(c.r, s, 'stone', 'wall');
  // walkway top
  quad(c.r, [s.Nt, s.Et, s.St, s.Wt], P.stoneLight);
  for (let y = 0; y < c.fpH; y++) {
    for (let x = 0; x < c.W; x++) {
      if (insideDiamond(x, y, c.W, c.fpH) && c.r.alphaAt(x, y + c.ty - H) === 255 && (x + y) % 7 === 0) {
        c.r.set(x, y + c.ty - H, P.stoneBase);
      }
    }
  }
  // crenellation along the two camera-facing top edges
  const cren = (a: Pt, b: Pt): void => {
    for (let i = 0; i <= 8; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / 8);
      const y = Math.round(a[1] + ((b[1] - a[1]) * i) / 8);
      if (i % 2 === 0) c.r.fillRect(x - 1, y - 3, 2, 3, P.stoneLight);
    }
  };
  cren(s.Wt, s.St);
  cren(s.St, s.Et);
}

function rGate(c: Canvas, _age: Age, banner: boolean): void {
  const H = 15;
  // flanking posts hugging the W and E tile corners
  for (const side of [-1, 1] as const) {
    const px = c.cx + side * 26;
    const py = c.cy + 2;
    for (let y = py - 20; y <= py; y++) {
      const rr = y > py - 3 ? 4 : 3;
      for (let x = px - rr; x <= px + rr; x++) {
        c.r.set(x, y, x < px - rr + 2 ? P.stoneLight : x > px + rr - 2 ? P.stoneDark : P.stoneBase);
      }
    }
    c.r.fillRect(px - 4, py - 22, 9, 2, P.stoneLight);
    for (let x = px - 4; x <= px + 4; x += 3) c.r.fillRect(x, py - 24, 2, 2, P.stoneLight);
    if (banner) bannerPole(c.r, px, py - 24 - 1, 5, 5, 4);
  }
  // arch spanning the wall line
  const archY = c.cy - H;
  for (let x = c.cx - 22; x <= c.cx + 22; x++) {
    const dip = Math.round(4 * Math.abs(x - c.cx) / 22);
    c.r.fillRect(x, archY - 4 + dip, 1, 4, P.stoneBase);
    c.r.set(x, archY - 4 + dip, P.stoneLight);
  }
  // portcullis lattice in the opening
  for (let x = c.cx - 10; x <= c.cx + 10; x += 3) {
    c.r.line(x, archY + 2, x, c.cy + 4, P.metalDark);
  }
  for (let y = archY + 3; y <= c.cy + 3; y += 3) {
    c.r.line(c.cx - 10, y, c.cx + 10, y, P.metalDark);
  }
}

function rCastle(c: Canvas, _age: Age, banner: boolean): void {
  const towers: Array<readonly [number, number]> = [
    [c.cx, c.ty + 6],           // N
    [c.cx - 54, c.cy - 2],      // W
    [c.cx + 54, c.cy - 2],      // E
    [c.cx, c.cy + 26],          // S
  ];
  const towerH = 34;
  const drum = (tx: number, baseY: number, behind: boolean): void => {
    const topY = baseY - towerH;
    for (let y = topY; y <= baseY; y++) {
      const f = (y - topY) / towerH;
      const rr = Math.round(7 + f * f * 3);
      for (let x = tx - rr; x <= tx + rr; x++) {
        c.r.set(x, y, x < tx - rr + 2 ? P.stoneLight : x > tx + rr - 2 ? P.stoneDark : P.stoneBase);
      }
      if ((y - topY) % 4 === 2) for (let x = tx - rr + 2; x <= tx + rr - 2; x += 5) c.r.set(x, y, P.stoneDark);
    }
    windowSlit(c.r, tx - 1, topY + 10);
    windowSlit(c.r, tx + 2, topY + 18);
    cone(c.r, tx, topY, 9, 9, SLATE);
    if (banner && !behind) pennant(c.r, tx, topY - 9, 5);
  };
  // curtain walls between the towers (draw before the front towers)
  const wallH = 22;
  const curtain = (a: Pt, b: Pt, lit: boolean): void => {
    quad(c.r, [[a[0], a[1]], [b[0], b[1]], [b[0], b[1] - wallH], [a[0], a[1] - wallH]], lit ? P.stoneLight : P.stoneBase);
    const steps = Math.max(6, Math.round(Math.abs(b[0] - a[0]) / 4));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / steps);
      const y = Math.round(a[1] + ((b[1] - a[1]) * i) / steps);
      if (i % 2 === 0) c.r.fillRect(x, y - wallH - 2, 2, 2, lit ? P.stoneLight : P.stoneBase);
      if (i % 3 === 0) c.r.fillRect(x, y - wallH + 4, 1, 2, P.stoneDark);
    }
  };
  // back walls + back towers first
  curtain([towers[1][0], towers[1][1] - 8], [towers[0][0], towers[0][1] + 2], true);
  curtain([towers[0][0], towers[0][1] + 2], [towers[2][0], towers[2][1] - 8], false);
  drum(towers[0][0], towers[0][1], true);
  // central keep
  const keep = struct(c.cx, c.cy - 4, 1.05, 1.05, 30);
  drawWalls(c.r, keep, 'stone', 'castle:keep');
  // battered plinth
  for (let i = 0; i < 4; i++) {
    line2(c.r, [keep.W[0] - i, keep.W[1] + i], [keep.S[0] - i * 0, keep.S[1] + i], P.stoneDark);
    line2(c.r, [keep.S[0], keep.S[1] + i], [keep.E[0] + i, keep.E[1] + i], P.stoneDark);
  }
  // keep crenellation + arrow slits
  const crenAlong = (a: Pt, b: Pt, litC: RGB): void => {
    for (let i = 0; i <= 10; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / 10);
      const y = Math.round(a[1] + ((b[1] - a[1]) * i) / 10);
      if (i % 2 === 0) c.r.fillRect(x - 1, y - 3, 2, 3, litC);
    }
  };
  crenAlong(keep.Wt, keep.St, P.stoneLight);
  crenAlong(keep.St, keep.Et, P.stoneBase);
  crenAlong(keep.Nt, keep.Et, P.stoneBase);
  crenAlong(keep.Wt, keep.Nt, P.stoneLight);
  windowSlit(c.r, Math.round((keep.W[0] + keep.S[0]) / 2), Math.round((keep.W[1] + keep.S[1]) / 2) - 18);
  windowSlit(c.r, Math.round((keep.S[0] + keep.E[0]) / 2) + 4, Math.round((keep.S[1] + keep.E[1]) / 2) - 16);
  darkDoor(c.r, Math.round(keep.S[0]) - 2, Math.round(keep.S[1]) - 8, 5, 8, true);
  if (banner) doorCloth(c.r, Math.round(keep.S[0]) - 2, Math.round(keep.S[1]) - 8, 5, 5);
  // front walls + front/side towers
  curtain([towers[1][0], towers[1][1] - 4], [towers[3][0], towers[3][1] - 2], true);
  curtain([towers[3][0], towers[3][1] - 2], [towers[2][0], towers[2][1] - 4], false);
  drum(towers[1][0], towers[1][1], false);
  drum(towers[2][0], towers[2][1], false);
  drum(towers[3][0], towers[3][1], false);
  if (banner) {
    maskBand(c.r, keep.Wt, keep.St, 2, 3);
    maskBand(c.r, keep.St, keep.Et, 2, 3);
    for (const [tx, tby] of [towers[1], towers[2], towers[3]]) {
      maskBand(c.r, [tx - 7, tby - towerH + 12], [tx + 7, tby - towerH + 12], 2);
    }
    // big keep banner
    bannerPole(c.r, c.cx, Math.round(keep.Nt[1]) - 4, 12, 8, 6);
  }
}

function rWonder(c: Canvas, _age: Age, banner: boolean): void {
  yard(c, 'wonder', P.dirtPale);
  // great plinth
  const plinth = struct(c.cx, c.cy, 1.75, 1.75, 8);
  drawWalls(c.r, plinth, 'dressed', 'wonder:plinth');
  quad(c.r, [plinth.Nt, plinth.Et, plinth.St, plinth.Wt], P.stonePale);
  // three stacked shrinking octagonal tiers
  const tiers: Array<{ hw: number; h: number; baseY: number }> = [
    { hw: 44, h: 22, baseY: Math.round(plinth.Nt[1] + c.fpH / 2 - 8) },
    { hw: 32, h: 18, baseY: 0 },
    { hw: 20, h: 14, baseY: 0 },
  ];
  let base = c.cy - 8;
  for (let t = 0; t < 3; t++) {
    const { hw, h } = tiers[t];
    const hh = Math.round(hw / 2.4);
    // visible faces of the octagon: draw as a flattened box with cut corners
    const pts: Pt[] = [
      [c.cx - hw, base - hh / 2],
      [c.cx - hw / 2, base + hh / 2],
      [c.cx + hw / 2, base + hh / 2],
      [c.cx + hw, base - hh / 2],
    ];
    // faces (from left): lit, front, base
    quad(c.r, [pts[0], pts[1], [pts[1][0], pts[1][1] - h], [pts[0][0], pts[0][1] - h]], P.stonePale);
    quad(c.r, [pts[1], pts[2], [pts[2][0], pts[2][1] - h], [pts[1][0], pts[1][1] - h]], P.stoneLight);
    quad(c.r, [pts[2], pts[3], [pts[3][0], pts[3][1] - h], [pts[2][0], pts[2][1] - h]], P.stoneBase);
    // coursing
    for (let row = 5; row < h; row += 6) {
      c.r.line(pts[0][0] + 1, pts[0][1] - row, pts[1][0], pts[1][1] - row, P.stoneDark);
      c.r.line(pts[1][0], pts[1][1] - row, pts[2][0] - 1, pts[2][1] - row, P.stoneDark);
      c.r.line(pts[2][0], pts[2][1] - row, pts[3][0] - 1, pts[3][1] - row, P.stoneDark);
    }
    // gold trim line on the cornice
    c.r.line(pts[0][0], pts[0][1] - h, pts[1][0], pts[1][1] - h - 1, P.goldBase);
    c.r.line(pts[1][0], pts[1][1] - h - 1, pts[2][0], pts[2][1] - h - 1, P.goldShine);
    c.r.line(pts[2][0], pts[2][1] - h - 1, pts[3][0], pts[3][1] - h, P.goldBase);
    // cap ellipse for the next tier to sit on
    c.r.fillEllipse(c.cx, base - h - hh / 4, hw - 2, hh / 2, P.stonePale);
    base = base - h - Math.round(hh / 3);
  }
  // buttress struts from the plinth to the tier-1 cornice
  for (const side of [-1, 1] as const) {
    const x0 = c.cx + side * 56;
    const y0 = Math.round(plinth.W[1]) - 2;
    const x1 = c.cx + side * 40;
    const y1 = c.cy - 28;
    c.r.fillPoly([
      [x0 - 1, y0], [x0 + 2, y0], [x1 + 2, y1], [x1 - 1, y1],
    ], P.stonePale);
    c.r.line(x0, y0 + 1, x1, y1 + 1, P.stoneDark);
  }
  // spire crowned with gold
  const spireBase = base + 2;
  for (let i = 0; i < 20; i++) {
    const rr = Math.max(0, Math.round(6 * (1 - i / 20)));
    for (let x = c.cx - rr; x <= c.cx + rr; x++) {
      const lit = x < c.cx - rr / 2;
      c.r.set(x, spireBase - i, Raster.ditherOn(x, spireBase - i, 50) ? P.goldShine : lit ? P.stonePale : P.goldBase);
    }
  }
  c.r.set(c.cx, spireBase - 20, P.goldShine);
  c.r.set(c.cx, spireBase - 21, P.highlight);
  if (banner) {
    // heraldic bands below the tier cornices + 4 compass banners
    maskBand(c.r, [c.cx - 40, c.cy - 26], [c.cx + 40, c.cy - 26], 3);
    maskBand(c.r, [c.cx - 28, c.cy - 46], [c.cx + 28, c.cy - 46], 2);
    maskBand(c.r, [c.cx - 17, c.cy - 64], [c.cx + 17, c.cy - 64], 2);
    bannerPole(c.r, c.cx - 52, c.cy - 26, 10, 6, 5);
    bannerPole(c.r, c.cx + 44, c.cy - 26, 10, 6, 5);
    bannerPole(c.r, c.cx - 4, c.cy - 44, 10, 6, 5);
    bannerPole(c.r, c.cx - 4, c.cy + 6, 10, 6, 5);
  }
}

// registry: elevation px above the footprint + recipe
const RECIPES: Record<string, { elev: number; recipe: Recipe }> = {
  townCenter: { elev: 40, recipe: rTownCenter },
  house: { elev: 30, recipe: rHouse },
  mill: { elev: 46, recipe: rMill },
  lumberCamp: { elev: 20, recipe: rLumberCamp },
  miningCamp: { elev: 26, recipe: rMiningCamp },
  barracks: { elev: 34, recipe: rBarracks },
  archeryRange: { elev: 22, recipe: rArcheryRange },
  stable: { elev: 30, recipe: rStable },
  blacksmith: { elev: 34, recipe: rBlacksmith },
  market: { elev: 32, recipe: rMarket },
  siegeWorkshop: { elev: 26, recipe: rSiegeWorkshop },
  monastery: { elev: 54, recipe: rMonastery },
  university: { elev: 48, recipe: rUniversity },
  watchTower: { elev: 54, recipe: towerRecipe(0) },
  guardTower: { elev: 62, recipe: towerRecipe(1) },
  keep: { elev: 70, recipe: towerRecipe(2) },
  stoneWall: { elev: 18, recipe: rStoneWall },
  gate: { elev: 28, recipe: rGate },
  castle: { elev: 76, recipe: rCastle },
  wonder: { elev: 94, recipe: rWonder },
};

// ---------------------------------------------------------------- shared states

/** Primary material for scaffold shells + rubble, by building. */
function primaryMat(id: string): { base: RGB; dark: RGB; style: WallStyle } {
  const b = buildings[id];
  const stoneAlways = ['watchTower', 'guardTower', 'keep', 'stoneWall', 'gate', 'castle', 'wonder'];
  if (stoneAlways.includes(id)) {
    return id === 'wonder' || id === 'keep'
      ? { base: P.stonePale, dark: P.stoneDark, style: 'dressed' }
      : { base: P.stoneBase, dark: P.stoneDark, style: 'stone' };
  }
  const age = b.age as Age;
  if (age === 'castle' || age === 'imperial') return { base: P.stoneBase, dark: P.stoneDark, style: 'stone' };
  return { base: P.woodBase, dark: P.woodDark, style: age === 'dark' ? 'log' : 'timber' };
}

function construct0(size: number): { raster: Raster; anchor: { x: number; y: number } } {
  const c = mkCanvas(size, 10);
  const rng = new Rng(`c0:${size}`);
  yard(c, `c0:${size}`);
  fpShadow(c);
  // corner stakes
  const stakes: Array<readonly [number, number]> = [
    [c.cx, c.ty + 2], [c.cx - c.W / 2 + 6, c.cy], [c.cx + c.W / 2 - 6, c.cy], [c.cx, c.ty + c.fpH - 3],
  ];
  for (const [sx, sy] of stakes) {
    c.r.fillRect(Math.round(sx), Math.round(sy) - 4, 1, 4, P.woodBase);
    c.r.set(Math.round(sx), Math.round(sy) - 4, P.woodPale);
  }
  // plank piles
  for (let i = 0, n = Math.min(3, 1 + size); i < n; i++) {
    const px = c.cx + rng.int(-c.W / 4, c.W / 4);
    const py = c.cy + rng.int(-c.fpH / 4, c.fpH / 4);
    c.r.fillRect(px, py - 2, 8, 2, P.woodPale);
    c.r.fillRect(px + 1, py - 4, 8, 2, P.woodPale);
    c.r.fillRect(px, py - 2, 8, 1, P.woodLight);
  }
  // one sack
  c.r.fillEllipse(c.cx + rng.int(-8, 8), c.cy + c.fpH / 4, 3, 2, P.clothDark);
  c.r.outlinePass();
  return { raster: c.r, anchor: c.anchor };
}

function construct1(id: string, size: number): { raster: Raster; anchor: { x: number; y: number } } {
  const { elev } = RECIPES[id];
  const wallH = Math.max(6, Math.round(elev * 0.4 * 0.5));
  const c = mkCanvas(size, Math.round(elev * 0.55));
  yard(c, `c1:${id}`);
  fpShadow(c);
  const mat = primaryMat(id);
  // interior wall mass rising to ~40%
  const shell = struct(c.cx, c.cy, size * 0.38, size * 0.34, wallH);
  drawWalls(c.r, shell, mat.style, `c1:${id}`);
  quad(c.r, [shell.Nt, shell.Et, shell.St, shell.Wt], mat.dark);
  // plank piles + material stock inside the site
  c.r.fillRect(c.cx - c.W / 4, c.cy + c.fpH / 4 - 2, 9, 2, P.woodPale);
  c.r.fillRect(c.cx - c.W / 4 + 1, c.cy + c.fpH / 4 - 4, 9, 2, P.woodPale);
  c.r.fillRect(c.cx + c.W / 5, c.cy + c.fpH / 5, 4, 3, mat.base);
  // perimeter scaffold at half final height — 2px poles so they survive outline
  const scafH = Math.max(10, Math.round(elev * 0.5));
  const ring = struct(c.cx, c.cy, size * 0.42, size * 0.38, scafH);
  for (const edge of [[ring.W, ring.S], [ring.S, ring.E]] as const) {
    const [a, b] = edge;
    const len = Math.abs(b[0] - a[0]);
    const poles = Math.max(2, Math.round(len / 14));
    for (let i = 0; i <= poles; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / poles);
      const y = Math.round(a[1] + ((b[1] - a[1]) * i) / poles);
      c.r.fillRect(x, y - scafH, 2, scafH, P.woodBase);
      c.r.fillRect(x, y - scafH, 1, scafH, P.woodLight);
    }
    // walkways + X braces
    for (const f of [0.55, 1]) {
      line2(c.r, [a[0], a[1] - scafH * f], [b[0], b[1] - scafH * f], P.woodPale);
      line2(c.r, [a[0], a[1] - scafH * f + 1], [b[0], b[1] - scafH * f + 1], P.woodDark);
    }
    line2(c.r, [a[0], a[1] - 2], [b[0], b[1] - scafH + 2], P.woodDark);
  }
  c.r.outlinePass();
  return { raster: c.r, anchor: c.anchor };
}

function construct2(id: string, size: number, done: Raster, anchor: { x: number; y: number }): Raster {
  const r = done.clone();
  // cut the top ~30% of the elevation (roof top third missing)
  let top = r.height;
  for (let y = 0; y < r.height && top === r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.alphaAt(x, y) === 255) { top = y; break; }
    }
  }
  const fpTop = r.height - size * 32;
  const cut = top + Math.max(2, Math.round((fpTop - top) * 0.3));
  for (let y = 0; y < cut; y++) for (let x = 0; x < r.width; x++) r.clear(x, y);
  // exposed rafters along the cut edge
  for (let x = 4; x < r.width - 4; x++) {
    if (r.alphaAt(x, cut) === 255 && x % 3 !== 0) r.set(x, cut, P.woodDark);
    if (r.alphaAt(x, cut + 1) === 255 && x % 5 === 0) r.set(x, cut + 1, P.woodDark);
  }
  // one scaffold face remaining on the right side
  const sx = Math.round(r.width * 0.7);
  const sy = r.height - size * 16;
  const scafH = Math.round((r.height - (r.height - size * 32)) * 0.0) + Math.max(10, Math.round((sy - cut) * 0.8));
  for (const px of [sx, sx + 10, sx + 20]) {
    if (px < r.width - 2) r.fillRect(px, sy - scafH, 1, scafH, P.woodBase);
  }
  r.line(sx, sy - Math.round(scafH / 2), Math.min(sx + 20, r.width - 3), sy - Math.round(scafH / 2) + 5, P.woodLight);
  r.line(sx, sy - scafH, Math.min(sx + 20, r.width - 3), sy - scafH + 5, P.woodLight);
  r.outlinePass();
  return r;
}

function rubble(id: string, size: number): { raster: Raster; anchor: { x: number; y: number } } {
  const { elev } = RECIPES[id];
  const h = Math.max(6, Math.round(elev * 0.3));
  const c = mkCanvas(size, h + 4);
  const rng = new Rng(`rubble:${id}`);
  const mat = primaryMat(id);
  const light: RGB = mat.style === 'stone' ? P.stoneLight : mat.style === 'dressed' ? P.stonePale : P.woodPale;
  // dust skirt dithered into the terrain, hugging the mound only
  for (let y = 0; y < c.fpH; y++) {
    for (let x = 0; x < c.W; x++) {
      if (!insideDiamond(x, y, c.W, c.fpH)) continue;
      const dx = (x - c.W / 2) / (c.W / 2);
      const dy = (y - c.fpH / 2) / (c.fpH / 2);
      const rr = dx * dx + dy * dy;
      if (rr > 0.55) continue;
      if (Raster.ditherOn(x, y, rr > 0.3 ? 25 : 50)) c.r.set(x, y + c.ty, P.dirtLight);
    }
  }
  // irregular collapsed mound (~60% of the footprint)
  const pts: Pt[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rr = (0.35 + rng.next() * 0.22) * (c.W / 2);
    pts.push([c.cx + Math.cos(ang) * rr, c.cy + (Math.sin(ang) * rr) / 2.2]);
  }
  quad(c.r, pts, mat.dark);
  // raised top face in the base tone, dithered into the dark sides
  const inner = pts.map(([x, y]) => [c.cx + (x - c.cx) * 0.62, c.cy + (y - c.cy) * 0.62 - h] as Pt);
  for (let i = 0; i < n; i++) {
    quad(c.r, [pts[i], pts[(i + 1) % n], inner[(i + 1) % n], inner[i]], mat.dark);
  }
  quad(c.r, inner as Pt[], mat.base);
  for (let y = c.cy - h - c.fpH / 4; y < c.cy + c.fpH / 4; y++) {
    for (let x = c.cx - c.W / 3; x < c.cx + c.W / 3; x++) {
      if (c.r.alphaAt(x, y) === 255 && Raster.ditherOn(x, y, 25)) c.r.set(x, y, mat.dark);
    }
  }
  // block/beam chunks with lit top-left pixels
  for (let i = 0, nn = 5 + size * 2; i < nn; i++) {
    const x = c.cx + rng.int(-c.W / 4, c.W / 4);
    const y = c.cy + rng.int(-c.fpH / 6, c.fpH / 5) - rng.int(0, h);
    c.r.fillRect(x, y, 3, 2, mat.base);
    c.r.set(x, y, light);
  }
  // two protruding tilted beams
  c.r.line(c.cx - 8, c.cy - h + 2, c.cx - 16, c.cy - h - 8, P.woodDark);
  c.r.line(c.cx - 7, c.cy - h + 2, c.cx - 15, c.cy - h - 8, P.woodBase);
  c.r.line(c.cx + 10, c.cy - h + 3, c.cx + 20, c.cy - h - 6, P.woodDark);
  c.r.line(c.cx + 10, c.cy - h + 4, c.cx + 20, c.cy - h - 5, P.woodBase);
  c.r.outlinePass();
  return { raster: c.r, anchor: c.anchor };
}

// ---------------------------------------------------------------- entry

export function genBuildings(): BuildingsResult {
  const frames: FrameDef[] = [];
  const impactFrames: Record<string, number> = {};

  for (const b of Object.values(buildings)) {
    if (b.id === 'farm') continue; // contract: renderer uses obj/farm/*
    const spec = RECIPES[b.id];
    if (!spec) throw new Error(`no building recipe for ${b.id}`);
    const size = b.size;

    const drawDone = (age: Age, banner: boolean): { raster: Raster; anchor: { x: number; y: number } } => {
      const c = mkCanvas(size, spec.elev);
      fpShadow(c);
      spec.recipe(c, age, banner);
      c.r.outlinePass();
      return { raster: c.r, anchor: c.anchor };
    };

    const perAge = b.id === 'townCenter' || b.id === 'house';
    if (perAge) {
      for (const age of AGES) {
        const d = drawDone(age, true);
        frames.push({ name: `bld/${b.id}/${age}/done`, raster: d.raster, anchor: d.anchor });
      }
    } else {
      const d = drawDone(b.age as Age, true);
      frames.push({ name: `bld/${b.id}/done`, raster: d.raster, anchor: d.anchor });
    }

    // scaffold states use the unlock-age look, bannerless + mask-free
    // (a partial building has no owner colors yet; the §9.4 bands bind only
    // frames that carry mask pixels)
    const c0 = construct0(size);
    frames.push({ name: `bld/${b.id}/construct0`, raster: c0.raster, anchor: c0.anchor });
    const c1 = construct1(b.id, size);
    frames.push({ name: `bld/${b.id}/construct1`, raster: c1.raster, anchor: c1.anchor });
    const doneForC2 = drawDone(b.age as Age, false);
    const c2 = construct2(b.id, size, doneForC2.raster, doneForC2.anchor);
    stripMask(c2);
    frames.push({ name: `bld/${b.id}/construct2`, raster: c2, anchor: doneForC2.anchor });
    const rb = rubble(b.id, size);
    frames.push({ name: `bld/${b.id}/rubble`, raster: rb.raster, anchor: rb.anchor });
  }

  return { frames, impactFrames };
}
