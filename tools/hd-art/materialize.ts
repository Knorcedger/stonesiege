// Deterministic 2x material renderer for the complete legacy frame contract.
// It keeps authored silhouettes/poses while replacing palette blocks, dither,
// black outlines, and hard pixel corners with sampled physical materials,
// natural edge shading, and sub-pixel antialiasing.

import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { FrameDef } from '../assetgen/src/atlas.ts';
import { PALETTE, isMaskColor, type RGB } from '../assetgen/src/palette.ts';
import { Raster } from '../assetgen/src/raster.ts';

export const HD_DENSITY = 2;

type Material = 'thatch' | 'timber' | 'wattle' | 'stone' | 'earth' | 'grass' | 'iron' | 'cloth' | 'water';

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  mean: readonly [number, number, number];
}

const CELL_INDEX: Record<Exclude<Material, 'water'>, number> = {
  thatch: 0,
  timber: 1,
  wattle: 2,
  stone: 3,
  earth: 4,
  grass: 5,
  iron: 6,
  cloth: 7,
};

function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function paletteKeys(colors: readonly RGB[]): Set<number> {
  return new Set(colors.map((c) => rgbKey(c[0], c[1], c[2])));
}

const GROUPS: Array<[Material, Set<number>]> = [
  ['thatch', paletteKeys([PALETTE.thatchDark, PALETTE.thatchBase, PALETTE.thatchLight])],
  ['timber', paletteKeys([PALETTE.woodDark, PALETTE.woodBase, PALETTE.woodLight, PALETTE.uiWoodDark, PALETTE.uiWoodBase, PALETTE.uiWoodLight])],
  ['wattle', paletteKeys([PALETTE.woodPale, PALETTE.skinShadow, PALETTE.skinBase, PALETTE.skinLight])],
  ['stone', paletteKeys([PALETTE.stoneDark, PALETTE.stoneBase, PALETTE.stoneLight, PALETTE.stonePale, PALETTE.slateDark, PALETTE.slateBase, PALETTE.slateLight])],
  ['earth', paletteKeys([PALETTE.dirtDark, PALETTE.dirtBase, PALETTE.dirtLight, PALETTE.dirtPale, PALETTE.parchDark, PALETTE.parchBase, PALETTE.parchLight])],
  ['grass', paletteKeys([PALETTE.grassShadow, PALETTE.grassDark, PALETTE.grassBase, PALETTE.grassLight, PALETTE.leafShadow, PALETTE.leafDark, PALETTE.leafBase, PALETTE.leafLight])],
  ['iron', paletteKeys([PALETTE.metalDark, PALETTE.metalBase, PALETTE.metalLight, PALETTE.goldDark, PALETTE.goldBase, PALETTE.goldShine])],
  ['cloth', paletteKeys([PALETTE.clothDark, PALETTE.clothBase, PALETTE.clothLight, PALETTE.highlight, PALETTE.berryRed])],
  ['water', paletteKeys([PALETTE.waterDeep, PALETTE.waterBase, PALETTE.waterLight])],
];

const OUTLINE_KEY = rgbKey(PALETTE.outline[0], PALETTE.outline[1], PALETTE.outline[2]);

function materialFor(r: number, g: number, b: number): Material | null {
  const key = rgbKey(r, g, b);
  for (const [material, keys] of GROUPS) if (keys.has(key)) return material;
  return null;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MaterialLibrary {
  readonly png: PNG;
  private cells = new Map<Exclude<Material, 'water'>, Cell>();

  constructor(path: string) {
    this.png = PNG.sync.read(readFileSync(path));
    const cellW = Math.floor(this.png.width / 4);
    const cellH = Math.floor(this.png.height / 2);
    for (const [material, index] of Object.entries(CELL_INDEX) as Array<[Exclude<Material, 'water'>, number]>) {
      const x = (index % 4) * cellW;
      const y = Math.floor(index / 4) * cellH;
      // Ignore the outer pixels where neighboring generated swatches can blend.
      const inset = 8;
      const cell = { x: x + inset, y: y + inset, w: cellW - inset * 2, h: cellH - inset * 2 };
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let yy = cell.y; yy < cell.y + cell.h; yy += 4) {
        for (let xx = cell.x; xx < cell.x + cell.w; xx += 4) {
          const i = (yy * this.png.width + xx) * 4;
          rr += this.png.data[i]; gg += this.png.data[i + 1]; bb += this.png.data[i + 2]; n++;
        }
      }
      this.cells.set(material, { ...cell, mean: [rr / n, gg / n, bb / n] });
    }
  }

  sample(material: Exclude<Material, 'water'>, x: number, y: number, seed: number): readonly [number, number, number, Cell] {
    const cell = this.cells.get(material)!;
    // Per-frame offsets avoid an obvious shared texture origin. Prime steps
    // prevent short repeating bands within narrow unit sprites.
    const sx = cell.x + ((x * 3 + (seed & 1023)) % cell.w);
    const sy = cell.y + ((y * 3 + ((seed >>> 10) & 1023)) % cell.h);
    const i = (sy * this.png.width + sx) * 4;
    return [this.png.data[i], this.png.data[i + 1], this.png.data[i + 2], cell];
  }
}

function sourcePixel(raster: Raster, x: number, y: number): readonly [number, number, number, number] {
  if (!raster.inBounds(x, y)) return [0, 0, 0, 0];
  return raster.get(x, y);
}

function isOutlinePixel(pixel: readonly [number, number, number, number]): boolean {
  return pixel[3] > 0 && rgbKey(pixel[0], pixel[1], pixel[2]) === OUTLINE_KEY;
}

/** Replace the legacy black contour by a darkened nearby material color. */
function naturalOutline(raster: Raster, x: number, y: number): readonly [number, number, number] {
  for (let radius = 1; radius <= 3; radius++) {
    for (let yy = y - radius; yy <= y + radius; yy++) {
      for (let xx = x - radius; xx <= x + radius; xx++) {
        const p = sourcePixel(raster, xx, yy);
        if (p[3] === 0 || isOutlinePixel(p) || isMaskColor(p[0], p[1], p[2])) continue;
        return [clamp(p[0] * 0.48), clamp(p[1] * 0.48), clamp(p[2] * 0.48)];
      }
    }
  }
  return PALETTE.outline;
}

/** Smooth same-material dither while retaining authored face/value boundaries. */
function smoothBase(raster: Raster, x: number, y: number, material: Material | null): readonly [number, number, number] {
  const center = sourcePixel(raster, x, y);
  if (!material || material === 'water') return [center[0], center[1], center[2]];
  let rr = center[0] * 4, gg = center[1] * 4, bb = center[2] * 4, weight = 4;
  for (let yy = y - 1; yy <= y + 1; yy++) {
    for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx === x && yy === y) continue;
      const p = sourcePixel(raster, xx, yy);
      if (p[3] !== 255 || materialFor(p[0], p[1], p[2]) !== material) continue;
      rr += p[0]; gg += p[1]; bb += p[2]; weight++;
    }
  }
  return [rr / weight, gg / weight, bb / weight];
}

function familyStrength(name: string): number {
  if (name.startsWith('bld/')) return 0.58;
  if (name.startsWith('terr/')) return 0.48;
  if (name.startsWith('obj/')) return 0.46;
  if (name.startsWith('unit/')) return 0.58;
  if (name.startsWith('ui/')) return 0.28;
  return 0.32;
}

interface CoverageSample { sx: number; sy: number; alpha: number }

/** Bilinear coverage reconstructs a smooth contour from the authored 1x mask. */
function coverageSample(raster: Raster, ox: number, oy: number): CoverageSample {
  const fx = (ox + 0.5) / HD_DENSITY - 0.5;
  const fy = (oy + 0.5) / HD_DENSITY - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const samples = [
    { sx: x0, sy: y0, weight: (1 - tx) * (1 - ty) },
    { sx: x0 + 1, sy: y0, weight: tx * (1 - ty) },
    { sx: x0, sy: y0 + 1, weight: (1 - tx) * ty },
    { sx: x0 + 1, sy: y0 + 1, weight: tx * ty },
  ];
  let alpha = 0;
  let chosen = samples[0];
  let chosenScore = -1;
  for (const sample of samples) {
    const pa = sourcePixel(raster, sample.sx, sample.sy)[3];
    alpha += pa * sample.weight;
    const score = pa > 0 ? sample.weight * pa : -1;
    if (score > chosenScore) {
      chosen = sample;
      chosenScore = score;
    }
  }
  return { sx: chosen.sx, sy: chosen.sy, alpha: clamp(alpha) };
}

/** Units are authored at only 13–45 logical pixels wide. A small sub-pixel
 * expansion keeps limbs and weapons substantial after the hard black contour
 * is removed, while preserving the original frame and anchor contract. */
function unitCoverageSample(raster: Raster, ox: number, oy: number): CoverageSample {
  let best = coverageSample(raster, ox, oy);
  for (const [dx, dy] of [[-0.65, 0], [0.65, 0], [0, -0.65], [0, 0.65]] as const) {
    const sample = coverageSample(raster, ox + dx, oy + dy);
    if (sample.alpha > best.alpha) best = sample;
  }
  return best;
}

export function materializeFrame(frame: FrameDef, materials: MaterialLibrary): FrameDef {
  const src = frame.raster;
  const out = new Raster(src.width * HD_DENSITY, src.height * HD_DENSITY);
  const seed = hash(frame.name);
  const strength = familyStrength(frame.name);
  const keepHardOutline = frame.name.startsWith('ui/');
  const isUnit = frame.name.startsWith('unit/');

  for (let oy = 0; oy < out.height; oy++) {
    for (let ox = 0; ox < out.width; ox++) {
      const coverage = isUnit ? unitCoverageSample(src, ox, oy) : coverageSample(src, ox, oy);
      const { sx, sy } = coverage;
      const source = sourcePixel(src, sx, sy);
      let [r, g, b] = source;
      const a = coverage.alpha;
      if (a === 0 || source[3] === 0) continue;

      // Runtime player colors remain exact and are never textured.
      if (isMaskColor(r, g, b)) {
        out.set(ox, oy, [r, g, b], a);
        continue;
      }
      // Preserve the generator's soft contact shadows, with gentler HD edges.
      if (source[3] < 255) {
        out.set(ox, oy, [r, g, b], a);
        continue;
      }

      if (!keepHardOutline && isOutlinePixel(source)) {
        [r, g, b] = naturalOutline(src, sx, sy);
      } else {
        const material = materialFor(r, g, b);
        const base = smoothBase(src, sx, sy, material);
        r = base[0]; g = base[1]; b = base[2];
        if (material && material !== 'water') {
          const [tr, tg, tb, cell] = materials.sample(material, ox, oy, seed);
          r += (tr - cell.mean[0]) * strength;
          g += (tg - cell.mean[1]) * strength;
          b += (tb - cell.mean[2]) * strength;
        } else if (material === 'water') {
          const wave = Math.sin((ox + oy * 2 + (seed & 31)) * 0.55) * 5;
          r += wave * 0.3; g += wave * 0.7; b += wave;
        }
      }

      // A tiny embossed response gives every authored plane the same upper-left
      // light without repainting animation silhouettes or changing poses.
      const microLight = (ox & 1) === 0 && (oy & 1) === 0 ? 3 : (ox & 1) === 1 && (oy & 1) === 1 ? -3 : 0;
      const topOpen = sourcePixel(src, sx, sy - 1)[3] === 0;
      const leftOpen = sourcePixel(src, sx - 1, sy)[3] === 0;
      const bottomOpen = sourcePixel(src, sx, sy + 1)[3] === 0;
      const rightOpen = sourcePixel(src, sx + 1, sy)[3] === 0;
      const rim = (topOpen ? 5 : 0) + (leftOpen ? 3 : 0) - (bottomOpen ? 4 : 0) - (rightOpen ? 2 : 0);
      const unitVolume = isUnit
        ? Math.sin(Math.PI * Math.max(0, Math.min(1, ox / Math.max(1, out.width - 1)))) * 7 - 2
        : 0;
      out.set(ox, oy, [
        clamp(r + microLight + rim + unitVolume),
        clamp(g + microLight + rim + unitVolume),
        clamp(b + microLight + rim + unitVolume),
      ], a);
    }
  }

  const anchor = frame.anchor
    ? { x: frame.anchor.x * HD_DENSITY, y: frame.anchor.y * HD_DENSITY }
    : undefined;
  return { name: frame.name, raster: out, ...(anchor ? { anchor } : {}) };
}
