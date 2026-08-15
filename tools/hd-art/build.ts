// Complete 2x HD atlas build. Every baseline contract frame is materialized and
// packed into optional chunked sheets; the approved Town Center render remains
// a bespoke final override for its logical frame name.

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { buildings as buildingDefs } from '../../packages/data/src/buildings.ts';
import { buildAtlas, defaultStoneSiegeMeta, type FrameDef } from '../assetgen/src/atlas.ts';
import { genBuildings } from '../assetgen/src/gen-buildings.ts';
import { genIcons } from '../assetgen/src/gen-icons.ts';
import { genObjects } from '../assetgen/src/gen-objects.ts';
import { genTerrain } from '../assetgen/src/gen-terrain.ts';
import { genUi } from '../assetgen/src/gen-ui.ts';
import { genUnits } from '../assetgen/src/gen-units.ts';
import { writePng } from '../assetgen/src/png.ts';
import { Raster } from '../assetgen/src/raster.ts';
import { HD_DENSITY, MaterialLibrary, materializeFrame } from './materialize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HERO_SOURCE = join(ROOT, 'art/hd/frames/town-center-dark-neutral.png');
const MATERIAL_SOURCE = join(ROOT, 'art/hd/materials/material-atlas.png');
const OUT = join(ROOT, 'apps/web/public/assets/hd');
const MAX_ATLAS = 2048;
const HERO_FRAME = 'bld/townCenter/dark/done';

interface CutoutSpec {
  source: string;
  frames: readonly string[];
  fitWidth?: number;
  fitHeight?: number;
  bottom?: number;
  grayscale?: boolean;
  /** Keep the generator sheet's cell center stable across animation poses. */
  preserveSourceCenter?: boolean;
  /** Cap scale for multi-pose sheets so raised tools do not shrink the body. */
  maxScale?: number;
}

function iconCutouts(
  source: string,
  ids: readonly string[],
  fitWidth = 0.86,
  fitHeight = 0.86,
): CutoutSpec[] {
  return ids.flatMap((id) => [
    { source, frames: [`icon/${id}`], fitWidth, fitHeight, bottom: 0.92 },
    { source, frames: [`icon/${id}/gray`], fitWidth, fitHeight, bottom: 0.92, grayscale: true },
  ]);
}

const CUTOUT_SPECS: readonly CutoutSpec[] = [
  {
    source: 'art/hd/frames/buildings/house-dark-cutout-v2.png',
    frames: [
      'bld/house/dark/done',
      'bld/house/feudal/done',
      'bld/house/castle/done',
      'bld/house/imperial/done',
    ],
    fitWidth: 0.92,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/barracks-cutout-v2.png',
    frames: ['bld/barracks/done'],
    fitWidth: 0.96,
    fitHeight: 0.92,
  },
  {
    source: 'art/hd/frames/buildings/mill-cutout-v2.png',
    frames: ['bld/mill/done'],
    fitWidth: 0.96,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/lumber-camp-cutout-v2.png',
    frames: ['bld/lumberCamp/done'],
    fitWidth: 0.96,
    fitHeight: 0.9,
  },
  {
    source: 'art/hd/frames/buildings/archery-range-cutout-v2.png',
    frames: ['bld/archeryRange/done'],
    fitWidth: 0.97,
    fitHeight: 0.92,
  },
  {
    source: 'art/hd/frames/buildings/blacksmith-cutout-v2.png',
    frames: ['bld/blacksmith/done'],
    fitWidth: 0.95,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/stable-cutout-v2.png',
    frames: ['bld/stable/done'],
    fitWidth: 0.97,
    fitHeight: 0.92,
  },
  {
    source: 'art/hd/frames/buildings/mining-camp-cutout-v2.png',
    frames: ['bld/miningCamp/done'],
    fitWidth: 0.95,
    fitHeight: 0.91,
  },
  {
    source: 'art/hd/frames/buildings/market-cutout-v2.png',
    frames: ['bld/market/done'],
    fitWidth: 0.97,
    fitHeight: 0.93,
  },
  {
    source: 'art/hd/frames/buildings/siege-workshop-cutout-v2.png',
    frames: ['bld/siegeWorkshop/done'],
    fitWidth: 0.97,
    fitHeight: 0.92,
  },
  {
    source: 'art/hd/frames/buildings/monastery-cutout-v2.png',
    frames: ['bld/monastery/done'],
    fitWidth: 0.95,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/university-cutout-v2.png',
    frames: ['bld/university/done'],
    fitWidth: 0.96,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/castle-cutout-v2.png',
    frames: ['bld/castle/done'],
    fitWidth: 0.98,
    fitHeight: 0.95,
  },
  {
    source: 'art/hd/frames/buildings/tower-cutout-v2.png',
    frames: ['bld/watchTower/done', 'bld/guardTower/done', 'bld/keep/done'],
    fitWidth: 0.92,
    fitHeight: 0.96,
  },
  {
    source: 'art/hd/frames/buildings/gate-cutout-v2.png',
    frames: ['bld/gate/done'],
    fitWidth: 0.98,
    fitHeight: 0.88,
  },
  {
    source: 'art/hd/frames/buildings/stone-wall-cutout-v2.png',
    frames: ['bld/stoneWall/done'],
    fitWidth: 0.98,
    fitHeight: 0.84,
  },
  {
    source: 'art/hd/frames/buildings/town-center-feudal-cutout-v2.png',
    frames: ['bld/townCenter/feudal/done'],
    fitWidth: 0.97,
    fitHeight: 0.94,
  },
  {
    source: 'art/hd/frames/buildings/town-center-castle-cutout-v2.png',
    frames: ['bld/townCenter/castle/done'],
    fitWidth: 0.98,
    fitHeight: 0.95,
  },
  {
    source: 'art/hd/frames/buildings/town-center-imperial-cutout-v2.png',
    frames: ['bld/townCenter/imperial/done'],
    fitWidth: 0.98,
    fitHeight: 0.95,
  },
  {
    source: 'art/hd/frames/buildings/wonder-cutout-v2.png',
    frames: ['bld/wonder/done'],
    fitWidth: 0.98,
    fitHeight: 0.97,
  },
  {
    source: 'art/hd/frames/buildings/farm-cutout-v2.png',
    frames: ['obj/farm/0', 'obj/farm/1', 'obj/farm/2', 'obj/farm/3', 'obj/farm/4'],
    fitWidth: 0.98,
    fitHeight: 0.88,
    bottom: 0.86,
  },
  {
    source: 'art/hd/frames/objects/tree-oak-cutout-v3.png',
    frames: ['obj/tree/0'],
    fitWidth: 0.98,
    fitHeight: 0.98,
    bottom: 0.97,
  },
  {
    source: 'art/hd/frames/objects/tree-pine-cutout-v3.png',
    frames: ['obj/tree/1'],
    fitWidth: 0.98,
    fitHeight: 0.98,
    bottom: 0.97,
  },
  {
    source: 'art/hd/frames/objects/tree-birch-cutout-v3.png',
    frames: ['obj/tree/2'],
    fitWidth: 0.98,
    fitHeight: 0.98,
    bottom: 0.97,
  },
  {
    source: 'art/hd/frames/objects/berries-cutout-v2.png',
    frames: ['obj/berries'],
    fitWidth: 0.98,
    fitHeight: 0.9,
    bottom: 0.9,
  },
  {
    source: 'art/hd/frames/objects/gold-cutout-v2.png',
    frames: ['obj/gold/0', 'obj/gold/1'],
    fitWidth: 0.96,
    fitHeight: 0.92,
    bottom: 0.92,
  },
  {
    source: 'art/hd/frames/objects/stone-cutout-v2.png',
    frames: ['obj/stone/0', 'obj/stone/1'],
    fitWidth: 0.96,
    fitHeight: 0.92,
    bottom: 0.92,
  },
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-dir-${dir}-cutout-v2.png`,
    frames: Array.from({ length: 2 }, (_, frame) => `unit/villager/idle/${dir}/${frame}`),
    fitWidth: 0.92,
    fitHeight: 0.96,
    bottom: 0.97,
  })),
  ...(['chop', 'farm', 'forage', 'mine', 'build'] as const).flatMap((anim) =>
    ([0, 1, 2, 3, 4] as const).flatMap((dir) =>
      Array.from({ length: 4 }, (_, frame): CutoutSpec => ({
        source: `art/hd/frames/units/villager-${anim}-dir-${dir}-frame-${frame}-cutout-v5.png`,
        frames: [`unit/villager/${anim}/${dir}/${frame}`],
        fitWidth: 0.94,
        fitHeight: 0.97,
        bottom: 0.97,
        preserveSourceCenter: true,
        maxScale: 0.3,
      })))),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 6 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/villager-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`unit/villager/walk/${dir}/${frame}`],
      fitWidth: 0.92,
      fitHeight: 0.96,
      bottom: 0.97,
    }))),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-gather-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 4 }, (_, frame) => `unit/villager/gather/${dir}/${frame}`),
    fitWidth: 0.92,
    fitHeight: 0.96,
    bottom: 0.97,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-carry-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 6 }, (_, frame) => `unit/villager/carry/${dir}/${frame}`),
    fitWidth: 0.92,
    fitHeight: 0.96,
    bottom: 0.97,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-attack-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 5 }, (_, frame) => `unit/villager/attack/${dir}/${frame}`),
    fitWidth: 0.94,
    fitHeight: 0.97,
    bottom: 0.97,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-downed-dir-${dir}-cutout-v3.png`,
    frames: [
      ...Array.from({ length: 5 }, (_, frame) => `unit/villager/die/${dir}/${frame}`),
      ...Array.from({ length: 3 }, (_, frame) => `unit/villager/decay/${dir}/${frame}`),
    ],
    fitWidth: 0.94,
    fitHeight: 0.8,
    bottom: 0.97,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/scout-dir-${dir}-cutout-v3.png`,
    frames: [
      ...Array.from({ length: 2 }, (_, frame) => `unit/scout/idle/${dir}/${frame}`),
      ...Array.from({ length: 5 }, (_, frame) => `unit/scout/attack/${dir}/${frame}`),
    ],
    fitWidth: 0.96,
    fitHeight: 0.96,
    bottom: 0.97,
  })),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 8 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`unit/scout/walk/${dir}/${frame}`],
      fitWidth: 0.96,
      fitHeight: 0.96,
      bottom: 0.97,
    }))),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/sheep-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 2 }, (_, frame) => `obj/sheep/idle/${dir}/${frame}`),
    fitWidth: 0.94,
    fitHeight: 0.9,
    bottom: 0.94,
  })),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 4 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/sheep-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`obj/sheep/walk/${dir}/${frame}`],
      fitWidth: 0.94,
      fitHeight: 0.9,
      bottom: 0.94,
    }))),

  // Keep HUD and quick-navigation art in the same visual language as the
  // world by deriving icon mini-renders from the approved cutouts.
  ...iconCutouts('art/hd/frames/town-center-dark-neutral.png', ['townCenter'], 0.92, 0.84),
  ...iconCutouts('art/hd/frames/buildings/house-dark-cutout-v2.png', ['house']),
  ...iconCutouts('art/hd/frames/buildings/mill-cutout-v2.png', ['mill']),
  ...iconCutouts('art/hd/frames/buildings/lumber-camp-cutout-v2.png', ['lumberCamp']),
  ...iconCutouts('art/hd/frames/buildings/mining-camp-cutout-v2.png', ['miningCamp']),
  ...iconCutouts('art/hd/frames/buildings/farm-cutout-v2.png', ['farm'], 0.92, 0.78),
  ...iconCutouts('art/hd/frames/buildings/barracks-cutout-v2.png', ['barracks']),
  ...iconCutouts('art/hd/frames/buildings/archery-range-cutout-v2.png', ['archeryRange']),
  ...iconCutouts('art/hd/frames/buildings/stable-cutout-v2.png', ['stable']),
  ...iconCutouts('art/hd/frames/buildings/siege-workshop-cutout-v2.png', ['siegeWorkshop']),
  ...iconCutouts('art/hd/frames/buildings/blacksmith-cutout-v2.png', ['blacksmith']),
  ...iconCutouts('art/hd/frames/buildings/market-cutout-v2.png', ['market']),
  ...iconCutouts('art/hd/frames/buildings/monastery-cutout-v2.png', ['monastery']),
  ...iconCutouts('art/hd/frames/buildings/university-cutout-v2.png', ['university']),
  ...iconCutouts('art/hd/frames/buildings/tower-cutout-v2.png', ['watchTower', 'guardTower', 'keep']),
  ...iconCutouts('art/hd/frames/buildings/stone-wall-cutout-v2.png', ['stoneWall'], 0.9, 0.7),
  ...iconCutouts('art/hd/frames/buildings/gate-cutout-v2.png', ['gate'], 0.92, 0.76),
  ...iconCutouts('art/hd/frames/buildings/castle-cutout-v2.png', ['castle']),
  ...iconCutouts('art/hd/frames/buildings/wonder-cutout-v2.png', ['wonder']),
  ...iconCutouts('art/hd/frames/units/villager-dir-0-cutout-v2.png', ['villager'], 0.72, 0.9),
  ...iconCutouts('art/hd/frames/units/scout-dir-0-cutout-v3.png', ['scout'], 0.9, 0.86),
  ...iconCutouts('art/hd/frames/units/sheep-dir-0-cutout-v3.png', ['sheep'], 0.88, 0.78),
];

interface ConstructionCutout {
  spec: CutoutSpec;
  name: string;
  stage: 0 | 1 | 2;
}

const CONSTRUCTION_CUTOUTS: ConstructionCutout[] = [];
const constructionPrefixes = new Set<string>();
for (const spec of CUTOUT_SPECS) {
  for (const name of spec.frames) {
    if (!name.startsWith('bld/') || !name.endsWith('/done')) continue;
    let prefix = name.slice(0, -'/done'.length);
    if (prefix.startsWith('bld/house/') || prefix.startsWith('bld/townCenter/')) {
      prefix = prefix.replace(/\/(dark|feudal|castle|imperial)$/, '');
    }
    if (constructionPrefixes.has(prefix)) continue;
    constructionPrefixes.add(prefix);
    for (const stage of [0, 1, 2] as const) {
      CONSTRUCTION_CUTOUTS.push({ spec, name: `${prefix}/construct${stage}`, stage });
    }
  }
}

const BESPOKE_FRAMES = new Set([
  HERO_FRAME,
  ...CUTOUT_SPECS.flatMap((spec) => spec.frames),
  ...CONSTRUCTION_CUTOUTS.map((entry) => entry.name),
]);

type Point = readonly [number, number];

// Generated architecture stays neutral. Only pixels inside these authored cloth
// silhouettes are converted to the exact runtime player-color mask ramp.
const HERO_CLOTH: ReadonlyArray<ReadonlyArray<Point>> = [
  [[320, 37], [337, 38], [348, 43], [339, 46], [347, 53], [320, 50]],
  [[276, 252], [294, 252], [294, 278], [285, 288], [276, 278]],
];

function insidePoly(x: number, y: number, poly: ReadonlyArray<Point>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function heroFrame(): { frame: FrameDef; masked: number } {
  const png = PNG.sync.read(readFileSync(HERO_SOURCE));
  if (png.width !== 576 || png.height !== 416) {
    throw new Error(`town-center source must be 576x416, got ${png.width}x${png.height}`);
  }
  const ramps = [[255, 0, 255], [204, 0, 204], [153, 0, 153]] as const;
  let masked = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (!HERO_CLOTH.some((poly) => insidePoly(x + 0.5, y + 0.5, poly))) continue;
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] === 0) continue;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const luminance = (r * 3 + g * 6 + b) / 10;
      if (spread > 58 || luminance < 28) continue;
      const ramp = ramps[luminance >= 172 ? 0 : luminance >= 105 ? 1 : 2];
      png.data[i] = ramp[0]; png.data[i + 1] = ramp[1]; png.data[i + 2] = ramp[2];
      masked++;
    }
  }
  if (masked < 250) throw new Error(`player cloth mask unexpectedly small (${masked}px)`);
  const raster = new Raster(png.width, png.height);
  raster.data.set(png.data);
  // The entity origin is the center of the Town Center's 4x4 ground diamond,
  // not the bottom of the render. Keeping that contract makes the selection
  // diamond, hit target, health bar, and sprite share one physical footprint.
  return { frame: { name: HERO_FRAME, raster, anchor: { x: 288, y: 267 } }, masked };
}

interface AlphaBounds { left: number; top: number; right: number; bottom: number }

function alphaBounds(png: PNG): AlphaBounds {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] < 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('generated cutout contains no visible pixels');
  return { left, top, right, bottom };
}

function bilinearPixel(png: PNG, x: number, y: number): readonly [number, number, number, number] {
  const x0 = Math.max(0, Math.min(png.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(png.height - 1, Math.floor(y)));
  const x1 = Math.min(png.width - 1, x0 + 1);
  const y1 = Math.min(png.height - 1, y0 + 1);
  const tx = x - Math.floor(x);
  const ty = y - Math.floor(y);
  const weights = [
    [(1 - tx) * (1 - ty), x0, y0],
    [tx * (1 - ty), x1, y0],
    [(1 - tx) * ty, x0, y1],
    [tx * ty, x1, y1],
  ] as const;
  let alpha = 0;
  let pr = 0;
  let pg = 0;
  let pb = 0;
  for (const [weight, sx, sy] of weights) {
    const i = (sy * png.width + sx) * 4;
    const a = png.data[i + 3] / 255;
    alpha += a * weight;
    pr += png.data[i] * a * weight;
    pg += png.data[i + 1] * a * weight;
    pb += png.data[i + 2] * a * weight;
  }
  if (alpha <= 0.0001) return [0, 0, 0, 0];
  return [
    Math.round(pr / alpha),
    Math.round(pg / alpha),
    Math.round(pb / alpha),
    Math.round(alpha * 255),
  ];
}

/** Fit an authored transparent render into the exact mechanical frame contract. */
function cutoutFrame(spec: CutoutSpec, name: string, base: FrameDef): FrameDef {
  const png = PNG.sync.read(readFileSync(join(ROOT, spec.source)));
  const bounds = alphaBounds(png);
  const sourceWidth = bounds.right - bounds.left + 1;
  const sourceHeight = bounds.bottom - bounds.top + 1;
  // Mechanical source animations are aggressively trimmed per pose. Authored
  // renders need a stable live-unit canvas or carry/gather frames visibly
  // shrink compared with idle frames.
  const authoredVillager = name.startsWith('unit/villager/');
  const authoredScout = name.startsWith('unit/scout/');
  const authoredTree = name.startsWith('obj/tree/');
  const stableUnitSize: readonly [number, number] | null = authoredVillager
    ? /\/(chop|farm|forage|mine|build)\//.test(name)
      ? [64, 80]
      : name.includes('/attack/')
      ? [52, 82]
      : name.includes('/die/') || name.includes('/decay/')
        ? [72, 52]
        : [52, 64]
    : name.startsWith('unit/scout/')
      ? [68, 80]
      : null;
  const width = stableUnitSize?.[0] ?? (authoredTree ? 144 : base.raster.width * HD_DENSITY);
  const height = stableUnitSize?.[1] ?? (authoredTree ? 192 : base.raster.height * HD_DENSITY);
  const fittedScale = Math.min(
    (width * (spec.fitWidth ?? 0.94)) / sourceWidth,
    (height * (spec.fitHeight ?? 0.92)) / sourceHeight,
  );
  const scale = Math.min(fittedScale, spec.maxScale ?? Number.POSITIVE_INFINITY);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const centeredDx = Math.round((width - drawWidth) / 2);
  const registeredDx = Math.round(width / 2 - (png.width / 2 - bounds.left) * scale);
  const dx = spec.preserveSourceCenter
    ? Math.max(0, Math.min(width - drawWidth, registeredDx))
    : centeredDx;
  const motionFrame = name.match(/\/(walk|gather|carry|attack)\/\d\/(\d+)$/);
  const motionCycle = motionFrame?.[1] === 'attack'
    ? [0, -1, -2, -1, 0]
    : motionFrame?.[1] === 'gather'
      ? [0, -2, -1, 1]
      : [0, -1, -2, -1, 0, 1, 1, 0];
  const motionBob = motionFrame ? motionCycle[Number(motionFrame[2]) % motionCycle.length] : 0;
  const bottom = Math.round(height * (spec.bottom ?? 0.95)) + motionBob;
  const dy = bottom - drawHeight;
  const raster = new Raster(width, height);
  const decayFrame = name.match(/\/decay\/\d\/(\d+)$/);
  const frameOpacity = decayFrame ? [0.76, 0.52, 0.3][Number(decayFrame[1])] ?? 0.3 : 1;
  for (let y = 0; y < drawHeight; y++) {
    for (let x = 0; x < drawWidth; x++) {
      const sx = bounds.left + ((x + 0.5) / drawWidth) * sourceWidth - 0.5;
      const sy = bounds.top + ((y + 0.5) / drawHeight) * sourceHeight - 0.5;
      let [r, g, b, a] = bilinearPixel(png, sx, sy);
      if (spec.grayscale) {
        const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
        r = luma;
        g = luma;
        b = luma;
      }
      a = Math.round(a * frameOpacity);
      if (a > 0) raster.set(dx + x, dy + y, [r, g, b], a);
    }
  }
  if (authoredVillager) {
    // A stable generated sash follows the resized body. Reusing the aggressively
    // trimmed mechanical mask put detached blue pixels beside wider carry poses.
    const sashY = Math.round(dy + drawHeight * (name.includes('/attack/') ? 0.6 : 0.52));
    const sashHalfWidth = Math.max(2, Math.round(drawWidth * 0.28));
    const sashCenter = Math.round(dx + drawWidth / 2);
    for (let y = sashY; y < sashY + 3; y++) {
      for (let x = sashCenter - sashHalfWidth; x <= sashCenter + sashHalfWidth; x++) {
        const [, , , a] = raster.get(x, y);
        if (a > 24) raster.set(x, y, y === sashY ? [255, 0, 255] : [204, 0, 204], a);
      }
    }
  } else if (authoredScout) {
    // Paint a compact team-color cloth onto the current horse pose. Reusing the
    // old frame coordinates put the cloth beside the newly rendered horse,
    // especially when it faced north or west.
    const clothY = Math.round(dy + drawHeight * 0.64);
    const clothHalfWidth = Math.max(3, Math.round(drawWidth * 0.2));
    const clothCenter = Math.round(dx + drawWidth / 2);
    for (let y = clothY; y < clothY + 5; y++) {
      for (let x = clothCenter - clothHalfWidth; x <= clothCenter + clothHalfWidth; x++) {
        const [, , , a] = raster.get(x, y);
        if (a > 24) {
          raster.set(x, y, y < clothY + 2 ? [255, 0, 255] : [204, 0, 204], a);
        }
      }
    }
  }
  const buildingMatch = name.match(/^bld\/([^/]+)\//);
  const buildingSize = buildingMatch ? buildingDefs[buildingMatch[1]]?.size : undefined;
  const farmSize = name.startsWith('obj/farm/') ? buildingDefs.farm?.size : undefined;
  const groundedObject = name.startsWith('obj/tree/')
    || name === 'obj/berries'
    || name.startsWith('obj/gold/')
    || name.startsWith('obj/stone/')
    || name.startsWith('obj/sheep/');
  const footprintSize = buildingSize ?? farmSize;
  const anchor = stableUnitSize || groundedObject
    ? { x: Math.round(width / 2), y: bottom }
    : footprintSize !== undefined
      ? {
          x: Math.round(width / 2),
          // A size-N isometric footprint reaches N half-tile heights south of
          // its center. The authored cutout's bottom is that south point.
          y: bottom - footprintSize * 16 * HD_DENSITY,
        }
      : base.anchor
        ? { x: base.anchor.x * HD_DENSITY, y: base.anchor.y * HD_DENSITY }
        : undefined;
  return { name, raster, ...(anchor ? { anchor } : {}) };
}

function constructionFrame(
  entry: ConstructionCutout,
  base: FrameDef,
  materials: MaterialLibrary,
): FrameDef {
  const frame = cutoutFrame(entry.spec, entry.name, base);
  const revealTop = Math.round(frame.raster.height * ([0.78, 0.5, 0.23][entry.stage]));
  for (let y = 0; y < revealTop; y++) {
    for (let x = 0; x < frame.raster.width; x++) frame.raster.clear(x, y);
  }
  // Retain authored stage-specific scaffolding and foundations over the new
  // render so construction remains mechanically legible and visibly advances.
  frame.raster.blit(materializeFrame(base, materials).raster, 0, 0);
  return frame;
}

function splitByArea(frames: FrameDef[]): [FrameDef[], FrameDef[]] {
  const sorted = [...frames].sort((a, b) =>
    b.raster.width * b.raster.height - a.raster.width * a.raster.height ||
    (a.name < b.name ? -1 : 1));
  const left: FrameDef[] = [];
  const right: FrameDef[] = [];
  let leftArea = 0;
  let rightArea = 0;
  for (const frame of sorted) {
    const area = frame.raster.width * frame.raster.height;
    if (leftArea <= rightArea) { left.push(frame); leftArea += area; }
    else { right.push(frame); rightArea += area; }
  }
  return [left, right];
}

/** Recursively split only when the deterministic shelf pack exceeds 2048px. */
function atlasGroups(frames: FrameDef[]): FrameDef[][] {
  try {
    buildAtlas(frames, 'probe.png', defaultStoneSiegeMeta(), MAX_ATLAS);
    return [frames];
  } catch (error) {
    if (frames.length <= 1 || !String(error).includes('exceeds 2048')) throw error;
    const [left, right] = splitByArea(frames);
    return [...atlasGroups(left), ...atlasGroups(right)];
  }
}

function emitFamily(
  family: string,
  sourceFrames: FrameDef[],
  materials: MaterialLibrary,
  manifest: string[],
  emittedNames: Set<string>,
  impactFrame: Record<string, number> = {},
  nineSlice?: Record<string, [number, number, number, number]>,
): number {
  const frames = sourceFrames
    .filter((f) => !BESPOKE_FRAMES.has(f.name))
    .map((f) => materializeFrame(f, materials));
  const scaledNineSlice = nineSlice
    ? Object.fromEntries(Object.entries(nineSlice).map(([name, inset]) =>
      [name, inset.map((n) => n * HD_DENSITY) as [number, number, number, number]]))
    : undefined;
  const groups = atlasGroups(frames);
  groups.forEach((group, index) => {
    const stem = `${family}-${index}`;
    const imageName = `${stem}.png`;
    const jsonName = `${stem}.json`;
    const meta = defaultStoneSiegeMeta({
      impactFrame,
      ...(scaledNineSlice ? { nineSlice: scaledNineSlice } : {}),
    });
    const atlas = buildAtlas(group, imageName, meta, MAX_ATLAS);
    atlas.json.meta.scale = HD_DENSITY;
    (atlas.json.meta.bannerfall as Record<string, unknown>).artStyle = 'pre-rendered-3d';
    writePng(join(OUT, imageName), atlas.image);
    writeFileSync(join(OUT, jsonName), `${JSON.stringify(atlas.json, null, 1)}\n`);
    manifest.push(jsonName);
    for (const frame of group) {
      if (emittedNames.has(frame.name)) throw new Error(`duplicate HD frame: ${frame.name}`);
      emittedNames.add(frame.name);
    }
    console.log(`  ${stem.padEnd(14)} ${String(group.length).padStart(4)} frames  ${atlas.image.width}x${atlas.image.height}`);
  });
  return frames.length;
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) {
  if (/^(terrain|objects|units|buildings|ui|icons|hero)-.*\.(png|json)$/.test(file) || file === 'manifest.json') {
    unlinkSync(join(OUT, file));
  }
}

console.log('stonesiege HD material build');
const t0 = Date.now();
const materials = new MaterialLibrary(MATERIAL_SOURCE);
const manifest: string[] = [];
const emittedNames = new Set<string>();
let converted = 0;

const terrain = genTerrain();
converted += emitFamily('terrain', terrain, materials, manifest, emittedNames);
const objects = genObjects();
converted += emitFamily('objects', objects.frames, materials, manifest, emittedNames, objects.impactFrames);
const units = genUnits();
converted += emitFamily('units', units.frames, materials, manifest, emittedNames, units.impactFrames);
const buildings = genBuildings();
converted += emitFamily('buildings', buildings.frames, materials, manifest, emittedNames, buildings.impactFrames);
const ui = genUi();
converted += emitFamily('ui', ui.frames, materials, manifest, emittedNames, {}, ui.nineSlice);
const icons = genIcons();
converted += emitFamily('icons', icons, materials, manifest, emittedNames);

// Last manifest entries contain the genuinely redrawn art. All other frames
// retain the systemic material renderer until their authored replacement lands.
const hero = heroFrame();
const sourceByName = new Map(
  [...terrain, ...objects.frames, ...units.frames, ...buildings.frames, ...ui.frames, ...icons]
    .map((frame) => [frame.name, frame] as const),
);
const cutouts = CUTOUT_SPECS.flatMap((spec) => spec.frames.map((name) => {
  const base = sourceByName.get(name);
  if (!base) throw new Error(`missing mechanical source frame for cutout ${name}`);
  return cutoutFrame(spec, name, base);
}));
const constructions = CONSTRUCTION_CUTOUTS.map((entry) => {
  const base = sourceByName.get(entry.name);
  if (!base) throw new Error(`missing mechanical source frame for construction ${entry.name}`);
  return constructionFrame(entry, base, materials);
});
const bespokeFrames = [hero.frame, ...cutouts, ...constructions];
const bespokeGroups = atlasGroups(bespokeFrames);
bespokeGroups.forEach((group, index) => {
  const stem = `hero-redrawn-${index}`;
  const imageName = `${stem}.png`;
  const jsonName = `${stem}.json`;
  const heroAtlas = buildAtlas(group, imageName, defaultStoneSiegeMeta(), MAX_ATLAS);
  heroAtlas.json.meta.scale = HD_DENSITY;
  (heroAtlas.json.meta.bannerfall as Record<string, unknown>).artStyle = 'pre-rendered-3d';
  writePng(join(OUT, imageName), heroAtlas.image);
  writeFileSync(join(OUT, jsonName), `${JSON.stringify(heroAtlas.json, null, 1)}\n`);
  manifest.push(jsonName);
  console.log(`  ${stem.padEnd(14)} ${String(group.length).padStart(4)} frames  ${heroAtlas.image.width}x${heroAtlas.image.height}`);
});
for (const frame of bespokeFrames) {
  if (emittedNames.has(frame.name)) throw new Error(`duplicate HD frame: ${frame.name}`);
  emittedNames.add(frame.name);
}

const expected = terrain.length + objects.frames.length + units.frames.length + buildings.frames.length + ui.frames.length + icons.length;
if (emittedNames.size !== expected) {
  throw new Error(`HD contract incomplete: emitted ${emittedNames.size}/${expected} unique frames`);
}
if (converted !== expected - bespokeFrames.length) {
  throw new Error(`systemic conversion count ${converted} does not equal remaining ${expected - bespokeFrames.length}`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
  version: 1,
  density: HD_DENSITY,
  style: 'pre-rendered-3d',
  frameCount: emittedNames.size,
  convertedFrames: converted,
  bespokeFrames: bespokeFrames.length,
  atlases: manifest,
}, null, 1)}\n`);
console.log(`done: ${converted} systemic + ${bespokeFrames.length} redrawn = ${emittedNames.size} frames, ${manifest.length} atlases, ${hero.masked}px hero mask, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
