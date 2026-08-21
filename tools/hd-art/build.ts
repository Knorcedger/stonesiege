// Complete 2x HD atlas build. Every baseline contract frame is materialized and
// packed into optional chunked sheets; the approved Town Center render remains
// a bespoke final override for its logical frame name.

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { buildings as buildingDefs } from '../../packages/data/src/buildings.ts';
import { buildAtlas, defaultStoneSiegeMeta, type FrameDef } from '../assetgen/src/atlas.ts';
import { genBuildings } from '../assetgen/src/gen-buildings.ts';
import { genIcons } from '../assetgen/src/gen-icons.ts';
import { genObjects } from '../assetgen/src/gen-objects.ts';
import { genTerrain } from '../assetgen/src/gen-terrain.ts';
import { genUi } from '../assetgen/src/gen-ui.ts';
import { genUnits } from '../assetgen/src/gen-units.ts';
import { PALETTE } from '../assetgen/src/palette.ts';
import { Raster } from '../assetgen/src/raster.ts';
import { alphaBounds, type AlphaBounds } from './alpha-bounds.ts';
import { shouldMirrorDirectionSheetCell } from './direction-sheet-layout.ts';
import { HD_DENSITY, MaterialLibrary, materializeFrame } from './materialize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HERO_SOURCE = join(ROOT, 'art/hd/frames/town-center-dark-neutral.png');
const MATERIAL_SOURCE = join(ROOT, 'art/hd/materials/material-atlas.png');
const OUT = join(ROOT, 'apps/web/public/assets/hd');
const MAX_ATLAS = 2048;
const HERO_FRAME = 'bld/townCenter/dark/done';
const cutoutSourceCache = new Map<string, PNG>();

async function writeLosslessWebp(path: string, raster: Raster): Promise<void> {
  await sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .webp({ lossless: true, effort: 6 })
    .toFile(path);
}

interface CutoutSpec {
  source: string;
  frames: readonly string[];
  fitWidth?: number;
  fitHeight?: number;
  bottom?: number;
  grayscale?: boolean;
  /** Cap scale for multi-pose sheets so raised tools do not shrink the body. */
  maxScale?: number;
  /** Crop one pose from a regular source-sheet grid before fitting it. */
  cell?: {
    columns: number;
    rows: number;
    column: number;
    row: number;
  };
  /** Keep every pose in a visual family on the same animation canvas. */
  stableSize?: readonly [number, number];
  /** Fit an animation family once so individual poses cannot pulse in size. */
  scaleGroup?: string;
  /** Ignore disconnected sheet bleed when measuring and cropping this pose. */
  dominantComponent?: boolean;
  /** Ignore generator haze below this alpha while fitting a cutout. */
  alphaThreshold?: number;
  /** Convert authored blue cloth to the runtime team ramp, with a sash fallback. */
  teamColor?: 'blue' | 'sash';
  /** Add authored-raster motion without falling back to the legacy pixel rig. */
  pose?: {
    kind: 'attack' | 'die' | 'stride' | 'gather';
    progress: number;
    direction: number;
    /** Mirror rotation derived from a source cell that the slicer flips horizontally. */
    sourceMirrored?: boolean;
  };
}

const AUTHORED_DIRECTIONS = [0, 1, 2, 3, 4] as const;

interface WalkGridOptions {
  stableSize: readonly [number, number];
  fitWidth?: number;
  fitHeight?: number;
  bottom?: number;
  teamColor?: 'blue' | 'sash';
  walkFrames?: number;
}

/** Map a 6x5 authored movement sheet over every animation in a visual family. */
function walkGridCutouts(
  source: string,
  ids: readonly string[],
  options: WalkGridOptions,
): CutoutSpec[] {
  const sourceFrames = 6;
  const walkFrames = options.walkFrames ?? sourceFrames;
  const common = {
    source,
    fitWidth: options.fitWidth ?? 0.96,
    fitHeight: options.fitHeight ?? 0.96,
    bottom: options.bottom ?? 0.97,
    stableSize: options.stableSize,
    teamColor: options.teamColor ?? 'blue',
    // Every pose in the family is cropped from the same grid sheet, so every
    // pose has to ignore the neighbouring cell's bleed when it measures its own
    // bounds. Measuring only `walk` this way left `idle` fitted around a
    // sliver of the next pose, which pushed the standing body up to 24px off
    // its own canvas center and made units hop sideways the moment they stopped.
    dominantComponent: true,
  } as const;
  const deathSize: readonly [number, number] = [
    Math.max(options.stableSize[0], options.stableSize[1] * 2),
    options.stableSize[1],
  ];

  return ids.flatMap((id) => AUTHORED_DIRECTIONS.flatMap((dir) => {
    const cell = (column: number) => ({
      columns: sourceFrames,
      rows: AUTHORED_DIRECTIONS.length,
      column: column % sourceFrames,
      row: dir,
    });
    return [
      {
        ...common,
        frames: [`unit/${id}/idle/${dir}/0`, `unit/${id}/idle/${dir}/1`],
        cell: cell(0),
      },
      ...Array.from({ length: walkFrames }, (_, frame): CutoutSpec => ({
        ...common,
        frames: [`unit/${id}/walk/${dir}/${frame}`],
        cell: cell(frame),
        scaleGroup: `walk:${source}:${dir}`,
      })),
      ...Array.from({ length: 5 }, (_, frame): CutoutSpec => ({
        ...common,
        frames: [`unit/${id}/attack/${dir}/${frame}`],
        cell: cell([0, 1, 3, 2, 0][frame]),
        pose: {
          kind: 'attack',
          progress: [0, 0.34, 1, 0.58, 0][frame],
          direction: dir,
        },
      })),
      ...Array.from({ length: 5 }, (_, frame): CutoutSpec => ({
        ...common,
        stableSize: deathSize,
        frames: [`unit/${id}/die/${dir}/${frame}`],
        cell: cell(Math.min(frame, sourceFrames - 1)),
        pose: { kind: 'die', progress: frame / 4, direction: dir },
      })),
      ...Array.from({ length: 3 }, (_, frame): CutoutSpec => ({
        ...common,
        stableSize: deathSize,
        frames: [`unit/${id}/decay/${dir}/${frame}`],
        cell: cell(sourceFrames - 1),
        pose: { kind: 'die', progress: 1, direction: dir },
      })),
    ];
  }));
}

function iconCutouts(
  source: string,
  ids: readonly string[],
  fitWidth = 0.86,
  fitHeight = 0.86,
  cell?: CutoutSpec['cell'],
): CutoutSpec[] {
  return ids.flatMap((id) => [
    { source, frames: [`icon/${id}`], fitWidth, fitHeight, bottom: 0.92, ...(cell ? { cell } : {}) },
    {
      source,
      frames: [`icon/${id}/gray`],
      fitWidth,
      fitHeight,
      bottom: 0.92,
      grayscale: true,
      ...(cell ? { cell } : {}),
    },
  ]);
}

interface AnimalCutoutOptions {
  stableSize: readonly [number, number];
  walkFrames?: number;
  attackFrames?: number;
  fitWidth?: number;
  fitHeight?: number;
  bottom?: number;
}

/** Build a complete animal animation family from consistent authored directions. */
function animalDirectionCutouts(
  id: string,
  sourcePattern: string,
  options: AnimalCutoutOptions,
): CutoutSpec[] {
  const walkFrames = options.walkFrames ?? 4;
  const attackFrames = options.attackFrames ?? 0;
  const deathSize: readonly [number, number] = [
    Math.max(options.stableSize[0], options.stableSize[1] * 2),
    options.stableSize[1],
  ];
  return AUTHORED_DIRECTIONS.flatMap((dir) => {
    const common = {
      source: sourcePattern.replace('{dir}', String(dir)),
      fitWidth: options.fitWidth ?? 0.94,
      fitHeight: options.fitHeight ?? 0.92,
      bottom: options.bottom ?? 0.94,
      stableSize: options.stableSize,
    } as const;
    return [
      { ...common, frames: [`obj/${id}/idle/${dir}/0`, `obj/${id}/idle/${dir}/1`] },
      ...Array.from({ length: walkFrames }, (_, frame): CutoutSpec => ({
        ...common,
        frames: [`obj/${id}/walk/${dir}/${frame}`],
        pose: { kind: 'stride', progress: frame / walkFrames, direction: dir },
      })),
      ...Array.from({ length: attackFrames }, (_, frame): CutoutSpec => ({
        ...common,
        frames: [`obj/${id}/attack/${dir}/${frame}`],
        pose: {
          kind: 'attack',
          progress: [0, 0.52, 1, 0.22][frame] ?? 0,
          direction: dir,
        },
      })),
      ...Array.from({ length: 3 }, (_, frame): CutoutSpec => ({
        ...common,
        stableSize: deathSize,
        frames: [`obj/${id}/die/${dir}/${frame}`],
        pose: { kind: 'die', progress: frame / 2, direction: dir },
      })),
      ...Array.from({ length: 2 }, (_, frame): CutoutSpec => ({
        ...common,
        stableSize: deathSize,
        frames: [`obj/${id}/decay/${dir}/${frame}`],
        pose: { kind: 'die', progress: 1, direction: dir },
      })),
    ];
  });
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
    source: 'art/hd/frames/objects/tree-stump-cutout-v1.png',
    frames: ['obj/stump'],
    fitWidth: 0.98,
    fitHeight: 0.92,
    bottom: 0.94,
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
    alphaThreshold: 16,
  },
  {
    source: 'art/hd/frames/objects/stone-cutout-v2.png',
    frames: ['obj/stone/0', 'obj/stone/1'],
    fitWidth: 0.96,
    fitHeight: 0.92,
    bottom: 0.92,
    alphaThreshold: 16,
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
        maxScale: 0.3,
        dominantComponent: true,
      })))),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 6 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/villager-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`unit/villager/walk/${dir}/${frame}`],
      fitWidth: 0.92,
      fitHeight: 0.96,
      bottom: 0.97,
      stableSize: [52, 64],
      scaleGroup: `walk:villager:${dir}`,
      dominantComponent: true,
    }))),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    [0, 0.42, 1, 0.38].map((progress, frame): CutoutSpec => ({
      source: `art/hd/frames/units/villager-gather-dir-${dir}-cutout-v3.png`,
      frames: [`unit/villager/gather/${dir}/${frame}`],
      fitWidth: 0.92,
      fitHeight: 0.96,
      bottom: 0.97,
      pose: {
        kind: 'gather', progress, direction: dir,
        sourceMirrored: shouldMirrorDirectionSheetCell(
          'villager-gather-directions-cutout-v3.png', dir,
        ),
      },
    }))),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-carry-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 6 }, (_, frame) => `unit/villager/carry/${dir}/${frame}`),
    fitWidth: 0.92,
    fitHeight: 0.96,
    bottom: 0.97,
    dominantComponent: true,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/villager-attack-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 5 }, (_, frame) => `unit/villager/attack/${dir}/${frame}`),
    fitWidth: 0.94,
    fitHeight: 0.97,
    bottom: 0.97,
    // The rear-facing render carries a matte fringe of alpha <= 32 running out
    // to x=0. It is invisible once resampled but it dragged the measured bounds
    // across half the canvas, so the pose was fitted too small and sat 10px off
    // the body center that idle and walk use. Bounds are stable from 32 up.
    alphaThreshold: 32,
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
    alphaThreshold: 32,
  })),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/scout-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 2 }, (_, frame) => `unit/scout/idle/${dir}/${frame}`),
    fitWidth: 0.96,
    fitHeight: 0.96,
    bottom: 0.97,
    dominantComponent: true,
  })),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 8 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`unit/scout/walk/${dir}/${frame}`],
      fitWidth: 0.96,
      fitHeight: 0.96,
      bottom: 0.97,
      stableSize: [68, 80],
      scaleGroup: `walk:scout:${dir}`,
      dominantComponent: true,
    }))),
  ...(['scout', 'lightCavalry'] as const).flatMap((id) =>
    AUTHORED_DIRECTIONS.flatMap((dir) => [
      ...Array.from({ length: 5 }, (_, frame): CutoutSpec => ({
        source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-${frame % 4}-cutout-v4.png`,
        frames: [`unit/${id}/attack/${dir}/${frame}`],
        fitWidth: 0.96,
        fitHeight: 0.96,
        bottom: 0.97,
        stableSize: [68, 80],
        teamColor: 'blue',
        pose: {
          kind: 'attack',
          progress: [0, 0.34, 1, 0.58, 0][frame],
          direction: dir,
        },
      })),
      ...Array.from({ length: 5 }, (_, frame): CutoutSpec => ({
        source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-${Math.min(frame, 4)}-cutout-v4.png`,
        frames: [`unit/${id}/die/${dir}/${frame}`],
        fitWidth: 0.96,
        fitHeight: 0.96,
        bottom: 0.97,
        stableSize: [160, 80],
        teamColor: 'blue',
        pose: { kind: 'die', progress: frame / 4, direction: dir },
      })),
      ...Array.from({ length: 3 }, (_, frame): CutoutSpec => ({
        source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-4-cutout-v4.png`,
        frames: [`unit/${id}/decay/${dir}/${frame}`],
        fitWidth: 0.96,
        fitHeight: 0.96,
        bottom: 0.97,
        stableSize: [160, 80],
        teamColor: 'blue',
        pose: { kind: 'die', progress: 1, direction: dir },
      })),
    ])),
  ...([0, 1, 2, 3, 4] as const).map((dir): CutoutSpec => ({
    source: `art/hd/frames/units/scout-dir-${dir}-cutout-v3.png`,
    frames: Array.from({ length: 2 }, (_, frame) => `unit/lightCavalry/idle/${dir}/${frame}`),
    fitWidth: 0.96,
    fitHeight: 0.96,
    bottom: 0.97,
    stableSize: [68, 80],
    teamColor: 'blue',
    dominantComponent: true,
  })),
  ...([0, 1, 2, 3, 4] as const).flatMap((dir) =>
    Array.from({ length: 8 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/scout-walk-dir-${dir}-frame-${frame}-cutout-v4.png`,
      frames: [`unit/lightCavalry/walk/${dir}/${frame}`],
      fitWidth: 0.96,
      fitHeight: 0.96,
      bottom: 0.97,
      stableSize: [68, 80],
      teamColor: 'blue',
      scaleGroup: `walk:scout:${dir}`,
      dominantComponent: true,
    }))),
  ...walkGridCutouts(
    'art/hd/frames/units/champion-walk-grid-cutout-v1.png',
    ['militia', 'manAtArms', 'longswordsman', 'champion'],
    { stableSize: [84, 88] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/pikeman-walk-grid-cutout-v1.png',
    ['spearman', 'pikeman'],
    { stableSize: [104, 90] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/longbowman-walk-grid-cutout-v1.png',
    ['archer', 'longbowman', 'eliteLongbowman'],
    { stableSize: [104, 90] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/crossbowman-walk-grid-cutout-v1.png',
    ['crossbowman', 'arbalester'],
    { stableSize: [92, 90] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/skirmisher-walk-grid-cutout-v1.png',
    ['skirmisher', 'eliteSkirmisher'],
    { stableSize: [104, 90] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/highland-raider-walk-grid-cutout-v1.png',
    ['highlandRaider', 'eliteHighlandRaider'],
    { stableSize: [104, 96] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/housecarl-walk-grid-cutout-v1.png',
    ['housecarl'],
    { stableSize: [104, 96] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/chevalier-walk-grid-cutout-v1.png',
    ['chevalier'],
    { stableSize: [128, 112], walkFrames: 8 },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/mangudai-walk-grid-cutout-v1.png',
    ['mangudai'],
    { stableSize: [128, 112], walkFrames: 8 },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/cataphract-walk-grid-cutout-v1.png',
    ['cataphract'],
    { stableSize: [132, 116], walkFrames: 8 },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/mamluk-walk-grid-cutout-v1.png',
    ['mamluk'],
    { stableSize: [128, 112], walkFrames: 8 },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/paladin-walk-grid-cutout-v1.png',
    ['knight', 'cavalier', 'paladin'],
    { stableSize: [120, 104], walkFrames: 8 },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/monk-walk-grid-cutout-v1.png',
    ['monk'],
    { stableSize: [84, 90], teamColor: 'sash' },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/siege-ram-roll-grid-cutout-v1.png',
    ['batteringRam', 'cappedRam', 'siegeRam'],
    { stableSize: [144, 112] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/onager-roll-grid-cutout-v1.png',
    ['mangonel', 'onager'],
    { stableSize: [144, 112] },
  ),
  ...walkGridCutouts(
    'art/hd/frames/units/trebuchet-roll-grid-cutout-v1.png',
    ['trebuchet'],
    { stableSize: [160, 128] },
  ),
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
      stableSize: [64, 64],
      scaleGroup: `walk:sheep:${dir}`,
      dominantComponent: true,
    }))),
  ...AUTHORED_DIRECTIONS.flatMap((dir) => [
    ...Array.from({ length: 3 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/sheep-dir-${dir}-cutout-v3.png`,
      frames: [`obj/sheep/die/${dir}/${frame}`],
      fitWidth: 0.94,
      fitHeight: 0.9,
      bottom: 0.94,
      stableSize: [128, 64],
      pose: { kind: 'die', progress: frame / 2, direction: dir },
    })),
    ...Array.from({ length: 2 }, (_, frame): CutoutSpec => ({
      source: `art/hd/frames/units/sheep-dir-${dir}-cutout-v3.png`,
      frames: [`obj/sheep/decay/${dir}/${frame}`],
      fitWidth: 0.94,
      fitHeight: 0.9,
      bottom: 0.94,
      stableSize: [128, 64],
      pose: { kind: 'die', progress: 1, direction: dir },
    })),
  ]),
  ...animalDirectionCutouts(
    'deer',
    'art/hd/frames/units/deer-dir-{dir}-cutout-v1.png',
    { stableSize: [80, 80], fitWidth: 0.96, fitHeight: 0.96 },
  ),
  ...animalDirectionCutouts(
    'wolf',
    'art/hd/frames/units/wolf-dir-{dir}-cutout-v1.png',
    { stableSize: [76, 68], attackFrames: 4, fitWidth: 0.96, fitHeight: 0.94 },
  ),

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
  ...iconCutouts('art/hd/frames/units/scout-dir-0-cutout-v3.png', ['scout', 'lightCavalry', 'heroFraser'], 0.9, 0.86),
  ...iconCutouts(
    'art/hd/frames/units/champion-walk-grid-cutout-v1.png',
    ['militia', 'manAtArms', 'longswordsman', 'champion', 'heroWallace', 'heroGraham', 'heroHeselrig', 'heroCressingham'],
    0.82,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/pikeman-walk-grid-cutout-v1.png',
    ['spearman', 'pikeman'],
    0.88,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/longbowman-walk-grid-cutout-v1.png',
    ['archer', 'longbowman', 'eliteLongbowman'],
    0.88,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/crossbowman-walk-grid-cutout-v1.png',
    ['crossbowman', 'arbalester'],
    0.86,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/skirmisher-walk-grid-cutout-v1.png',
    ['skirmisher', 'eliteSkirmisher'],
    0.88,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/highland-raider-walk-grid-cutout-v1.png',
    ['highlandRaider', 'eliteHighlandRaider'],
    0.88,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/housecarl-walk-grid-cutout-v1.png',
    ['housecarl', 'eliteHousecarl'],
    0.88,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/chevalier-walk-grid-cutout-v1.png',
    ['chevalier', 'eliteChevalier'],
    0.94,
    0.86,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/mangudai-walk-grid-cutout-v1.png',
    ['mangudai', 'eliteMangudai'],
    0.94,
    0.86,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/cataphract-walk-grid-cutout-v1.png',
    ['cataphract', 'eliteCataphract'],
    0.94,
    0.86,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/mamluk-walk-grid-cutout-v1.png',
    ['mamluk', 'eliteMamluk'],
    0.94,
    0.86,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/paladin-walk-grid-cutout-v1.png',
    ['knight', 'cavalier', 'paladin', 'heroMoray', 'heroWarenne', 'heroEdward', 'heroValence'],
    0.94,
    0.86,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/monk-walk-grid-cutout-v1.png',
    ['monk'],
    0.82,
    0.9,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/siege-ram-roll-grid-cutout-v1.png',
    ['batteringRam', 'cappedRam', 'siegeRam'],
    0.94,
    0.82,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/onager-roll-grid-cutout-v1.png',
    ['mangonel', 'onager'],
    0.94,
    0.82,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts(
    'art/hd/frames/units/trebuchet-roll-grid-cutout-v1.png',
    ['trebuchet'],
    0.94,
    0.82,
    { columns: 6, rows: 5, column: 0, row: 0 },
  ),
  ...iconCutouts('art/hd/frames/units/sheep-dir-0-cutout-v3.png', ['sheep'], 0.88, 0.78),
  ...iconCutouts('art/hd/frames/units/deer-dir-0-cutout-v1.png', ['deer'], 0.88, 0.86),
  ...iconCutouts('art/hd/frames/units/wolf-dir-0-cutout-v1.png', ['wolf'], 0.88, 0.84),
  ...iconCutouts('art/hd/frames/objects/tree-oak-cutout-v3.png', ['tree'], 0.9, 0.9),
  ...iconCutouts('art/hd/frames/objects/berries-cutout-v2.png', ['berryBush'], 0.9, 0.78),
  ...iconCutouts('art/hd/frames/objects/gold-cutout-v2.png', ['goldMine'], 0.9, 0.8),
  ...iconCutouts('art/hd/frames/objects/stone-cutout-v2.png', ['stoneMine'], 0.9, 0.8),
];

interface ConstructionCutout {
  name: string;
  stage: 0 | 1 | 2;
}

const CONSTRUCTION_CUTOUTS: ConstructionCutout[] = [];
const constructionPrefixes = new Set<string>();

function constructionPrefixForDone(name: string): string {
  let prefix = name.slice(0, -'/done'.length);
  if (prefix.startsWith('bld/house/') || prefix.startsWith('bld/townCenter/')) {
    prefix = prefix.replace(/\/(dark|feudal|castle|imperial)$/, '');
  }
  return prefix;
}

for (const spec of CUTOUT_SPECS) {
  for (const name of spec.frames) {
    if (!name.startsWith('bld/') || !name.endsWith('/done')) continue;
    const prefix = constructionPrefixForDone(name);
    if (constructionPrefixes.has(prefix)) continue;
    constructionPrefixes.add(prefix);
    for (const stage of [0, 1, 2] as const) {
      CONSTRUCTION_CUTOUTS.push({ name: `${prefix}/construct${stage}`, stage });
    }
  }
}

const GATE_LAYER_NAMES = ['bld/gate/open', 'bld/gate/door'] as const;

const BESPOKE_FRAMES = new Set([
  HERO_FRAME,
  ...CUTOUT_SPECS.flatMap((spec) => spec.frames),
  ...CONSTRUCTION_CUTOUTS.map((entry) => entry.name),
  ...GATE_LAYER_NAMES,
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

function cellBounds(png: PNG, spec: CutoutSpec): AlphaBounds {
  if (!spec.cell) return { left: 0, top: 0, right: png.width - 1, bottom: png.height - 1 };
  const { columns, rows, column, row } = spec.cell;
  if (columns < 1 || rows < 1 || column < 0 || column >= columns || row < 0 || row >= rows) {
    throw new Error(`invalid ${columns}x${rows} grid cell ${column},${row} for ${spec.source}`);
  }
  return {
    left: Math.round((column * png.width) / columns),
    top: Math.round((row * png.height) / rows),
    right: Math.round(((column + 1) * png.width) / columns) - 1,
    bottom: Math.round(((row + 1) * png.height) / rows) - 1,
  };
}

/** Bounds of the main connected silhouette inside one animation-sheet cell. */
function dominantAlphaBounds(png: PNG, region: AlphaBounds, threshold = 8): AlphaBounds {
  const width = region.right - region.left + 1;
  const height = region.bottom - region.top + 1;
  const seen = new Uint8Array(width * height);
  let bestSize = 0;
  let best: AlphaBounds | null = null;

  for (let start = 0; start < seen.length; start++) {
    if (seen[start]) continue;
    const startX = start % width;
    const startY = Math.floor(start / width);
    if (png.data[((region.top + startY) * png.width + region.left + startX) * 4 + 3] < threshold) {
      seen[start] = 1;
      continue;
    }
    const queue = [start];
    seen[start] = 1;
    let size = 0;
    let left = startX;
    let right = startX;
    let top = startY;
    let bottom = startY;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      size++;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next]) continue;
          if (png.data[((region.top + ny) * png.width + region.left + nx) * 4 + 3] < threshold) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = {
        left: region.left + left,
        right: region.left + right,
        top: region.top + top,
        bottom: region.top + bottom,
      };
    }
  }
  if (!best) throw new Error('generated cutout contains no visible component');
  return best;
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

function bilinearRasterPixel(raster: Raster, x: number, y: number): readonly [number, number, number, number] {
  if (x < -1 || y < -1 || x > raster.width || y > raster.height) return [0, 0, 0, 0];
  const x0 = Math.max(0, Math.min(raster.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(raster.height - 1, Math.floor(y)));
  const x1 = Math.min(raster.width - 1, x0 + 1);
  const y1 = Math.min(raster.height - 1, y0 + 1);
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
    const [r, g, b, a8] = raster.get(sx, sy);
    const a = a8 / 255;
    alpha += a * weight;
    pr += r * a * weight;
    pg += g * a * weight;
    pb += b * a * weight;
  }
  if (alpha <= 0.0001) return [0, 0, 0, 0];
  return [
    Math.round(pr / alpha),
    Math.round(pg / alpha),
    Math.round(pb / alpha),
    Math.round(alpha * 255),
  ];
}

/** Preserve premium source pixels while adding readable attack, gait, and fall silhouettes. */
function transformCutoutPose(
  source: Raster,
  pose: NonNullable<CutoutSpec['pose']>,
  groundY: number,
): Raster {
  const output = new Raster(source.width, source.height);
  const pivotX = source.width / 2;
  const pivotY = groundY;
  const directionVectors: ReadonlyArray<readonly [number, number]> = [
    [0, 1], [-0.72, 0.5], [-1, 0], [-0.72, -0.5], [0, -1],
  ];
  const [vx, vy] = directionVectors[pose.direction] ?? [0, 1];
  let offsetX = 0;
  let offsetY = 0;
  let angle = 0;
  let scaleX = 1;
  let scaleY = 1;

  if (pose.kind === 'attack') {
    offsetX = vx * pose.progress * 7;
    offsetY = vy * pose.progress * 3 - pose.progress * 2;
    angle = -vx * pose.progress * 0.055;
  } else if (pose.kind === 'stride') {
    const gait = Math.cos(pose.progress * Math.PI * 2);
    const stride = Math.sin(pose.progress * Math.PI * 2);
    scaleX = 1 + gait * 0.035;
    scaleY = 1 - gait * 0.025;
    offsetX = stride * 1.25;
    offsetY = -Math.abs(stride) * 1.5;
    angle = stride * 0.025;
  } else if (pose.kind === 'gather') {
    // Rock the approved worker/tool silhouette around grounded feet. The full
    // downstroke is intentionally pronounced at game scale, where a static
    // high-detail pose otherwise reads as an idle villager.
    const authoredSwingSign = pose.direction <= 2 ? -1 : 1;
    const swingSign = pose.sourceMirrored ? -authoredSwingSign : authoredSwingSign;
    angle = swingSign * pose.progress * 0.085;
    scaleX = 1 + pose.progress * 0.025;
    scaleY = 1 - pose.progress * 0.055;
    offsetX = vx * pose.progress * 2;
    offsetY = vy * pose.progress - pose.progress * 2.5;
  } else {
    const fallSign = pose.direction <= 2 ? -1 : 1;
    angle = fallSign * pose.progress * Math.PI * 0.4;
    scaleY = 1 - pose.progress * 0.16;
    offsetY = pose.progress * 1.5;
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const dx = x - pivotX - offsetX;
      const dy = y - pivotY - offsetY;
      // Inverse of scale-then-rotate around the unit's grounded anchor.
      const rx = dx * cos + dy * sin;
      const ry = -dx * sin + dy * cos;
      const sx = pivotX + rx / scaleX;
      const sy = pivotY + ry / scaleY;
      const [r, g, b, a] = bilinearRasterPixel(source, sx, sy);
      if (a > 0) output.set(x, y, [r, g, b], a);
    }
  }
  return output;
}

function restoreExactTeamMask(raster: Raster): void {
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      const [r, g, b, a] = raster.get(x, y);
      if (a < 12 || r < 72 || b < 72 || g > 72 || Math.abs(r - b) > 80) continue;
      const brightness = Math.max(r, b);
      const mask = brightness >= 176
        ? [255, 0, 255] as const
        : brightness >= 112
          ? [204, 0, 204] as const
          : [153, 0, 153] as const;
      raster.set(x, y, mask, a);
    }
  }
}

interface CutoutMetrics {
  png: PNG;
  bounds: AlphaBounds;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  fittedScale: number;
  authoredVillager: boolean;
  authoredScout: boolean;
}

const cutoutMetricsCache = new WeakMap<CutoutSpec, Map<string, CutoutMetrics>>();

/** Geometry shared by the family-scale pass and final cutout rasterization. */
function cutoutMetrics(spec: CutoutSpec, name: string, base: FrameDef): CutoutMetrics {
  const cached = cutoutMetricsCache.get(spec)?.get(name);
  if (cached) return cached;
  let png = cutoutSourceCache.get(spec.source);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(ROOT, spec.source)));
    cutoutSourceCache.set(spec.source, png);
  }
  const region = cellBounds(png, spec);
  const bounds = spec.dominantComponent
    ? dominantAlphaBounds(png, region, spec.alphaThreshold)
    : alphaBounds(png, region, spec.alphaThreshold);
  const sourceWidth = bounds.right - bounds.left + 1;
  const sourceHeight = bounds.bottom - bounds.top + 1;
  const authoredVillager = name.startsWith('unit/villager/');
  const authoredScout = name.startsWith('unit/scout/');
  const authoredTree = name.startsWith('obj/tree/');
  const stableUnitSize: readonly [number, number] | null = spec.stableSize ?? (authoredVillager
    ? /\/(chop|farm|forage|mine|build)\//.test(name)
      ? [64, 80]
      : name.includes('/attack/')
      ? [52, 82]
      : name.includes('/die/') || name.includes('/decay/')
        ? [72, 52]
        : [52, 64]
    : authoredScout
      ? [68, 80]
      : null);
  const width = stableUnitSize?.[0] ?? (authoredTree ? 144 : base.raster.width * HD_DENSITY);
  const height = stableUnitSize?.[1] ?? (authoredTree ? 192 : base.raster.height * HD_DENSITY);
  const fittedScale = Math.min(
    (width * (spec.fitWidth ?? 0.94)) / sourceWidth,
    (height * (spec.fitHeight ?? 0.92)) / sourceHeight,
    spec.maxScale ?? Number.POSITIVE_INFINITY,
  );
  const metrics = {
    png, bounds, sourceWidth, sourceHeight, width, height, fittedScale,
    authoredVillager, authoredScout,
  };
  let byName = cutoutMetricsCache.get(spec);
  if (!byName) {
    byName = new Map();
    cutoutMetricsCache.set(spec, byName);
  }
  byName.set(name, metrics);
  return metrics;
}

/** Fit an authored transparent render into the exact mechanical frame contract. */
function cutoutFrame(spec: CutoutSpec, name: string, base: FrameDef, sharedScale?: number): FrameDef {
  const {
    png, bounds, sourceWidth, sourceHeight, width, height, fittedScale,
    authoredVillager, authoredScout,
  } = cutoutMetrics(spec, name, base);
  // A grouped walk cycle uses its most restrictive pose for every frame. This
  // preserves authored proportions instead of independently zooming each pose
  // until it touches the canvas bounds.
  const scale = sharedScale ?? fittedScale;
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  // Horizontal registration is always relative to the subject, never to the
  // source cell. The authored movement sheets are walk-ACROSS strips: the figure
  // translates from cell to cell, so registering on the cell center baked that
  // translation into the atlas and every walk cycle slid sideways and snapped
  // back at its loop point (monk 42px, skirmisher 33px, militia 15px of travel
  // at 2x density). Correctly authored sheets — chevalier, mamluk, mangudai,
  // cataphract, housecarl — already hold their subject bounding box steady to
  // ~1px per cycle, so subject centering IS the authored convention and leaves
  // those families untouched. It also keeps idle/walk/attack/die on one
  // convention, so a unit no longer jumps sideways when it stops or swings.
  const dx = Math.round((width - drawWidth) / 2);
  const motionFrame = name.match(/\/(walk|gather|carry|attack)\/\d\/(\d+)$/);
  const motionCycle = motionFrame?.[1] === 'attack'
    ? [0, -1, -2, -1, 0]
    : motionFrame?.[1] === 'gather'
      ? [0, -2, -1, 1]
      // Authored walk sources already contain their gait. A second generated
      // bob made the grounded anchor jump even after the source pose was stable.
      : motionFrame?.[1] === 'walk'
        ? [0]
        : [0, -1, -2, -1, 0, 1, 1, 0];
  const motionBob = motionFrame ? motionCycle[Number(motionFrame[2]) % motionCycle.length] : 0;
  const bottom = Math.round(height * (spec.bottom ?? 0.95)) + motionBob;
  const dy = bottom - drawHeight;
  let raster = new Raster(width, height);
  let authoredMaskPixels = 0;
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
      if (spec.teamColor === 'blue' && a > 8 && b > 55 && b - r > 18 && b - g > 6) {
        const brightness = Math.max(r, g, b);
        [r, g, b] = brightness >= 176
          ? [255, 0, 255]
          : brightness >= 96
            ? [204, 0, 204]
            : [153, 0, 153];
        authoredMaskPixels++;
      }
      a = Math.round(a * frameOpacity);
      if (a > 0) raster.set(dx + x, dy + y, [r, g, b], a);
    }
  }
  const needsAuthoredSash = spec.teamColor === 'sash'
    || (spec.teamColor === 'blue' && authoredMaskPixels < 8);
  if (needsAuthoredSash) {
    const sashY = Math.round(dy + drawHeight * 0.52);
    const sashHalfWidth = Math.max(2, Math.round(drawWidth * 0.2));
    const sashCenter = Math.round(dx + drawWidth / 2);
    for (let y = sashY; y < sashY + 3; y++) {
      for (let x = sashCenter - sashHalfWidth; x <= sashCenter + sashHalfWidth; x++) {
        const [, , , a] = raster.get(x, y);
        if (a > 24) raster.set(x, y, y === sashY ? [255, 0, 255] : [204, 0, 204], a);
      }
    }
  } else if (authoredVillager) {
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
  if (spec.pose) {
    raster = transformCutoutPose(raster, spec.pose, bottom);
    if (spec.teamColor) restoreExactTeamMask(raster);
  }
  const buildingMatch = name.match(/^bld\/([^/]+)\//);
  const buildingSize = buildingMatch ? buildingDefs[buildingMatch[1]]?.size : undefined;
  const farmSize = name.startsWith('obj/farm/') ? buildingDefs.farm?.size : undefined;
  const groundedObject = name.startsWith('obj/tree/')
    || name === 'obj/stump'
    || name === 'obj/berries'
    || name.startsWith('obj/gold/')
    || name.startsWith('obj/stone/')
    || name.startsWith('obj/sheep/')
    || name.startsWith('obj/deer/')
    || name.startsWith('obj/wolf/');
  const footprintSize = buildingSize ?? farmSize;
  const anchor = spec.stableSize || authoredVillager || authoredScout || groundedObject
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

/**
 * Split the approved gate render into a permanent stone gatehouse and a moving
 * wooden door. The source artwork is kept pixel-identical outside the arched
 * opening; when the door layer is at y=0 the two layers reproduce `done`.
 */
function gateLayerFrames(closed: FrameDef): FrameDef[] {
  const open = closed.raster.clone();
  const door = new Raster(open.width, open.height);
  const cx = Math.round(open.width / 2);
  const halfWidth = Math.max(5, Math.round(open.width * 0.066));
  const top = Math.round(open.height * 0.61);
  const archCy = top + halfWidth;
  const bottom = Math.round(open.height * 0.86);

  for (let y = top; y <= bottom; y++) {
    for (let x = cx - halfWidth; x <= cx + halfWidth; x++) {
      const dx = x - cx;
      const inArch = y >= archCy || dx * dx + (y - archCy) * (y - archCy) <= halfWidth * halfWidth;
      if (!inArch || open.alphaAt(x, y) === 0) continue;
      const [r, g, b, a] = open.get(x, y);
      door.set(x, y, [r, g, b], a);
      open.clear(x, y);
    }
  }

  return [
    { name: GATE_LAYER_NAMES[0], raster: open, anchor: closed.anchor },
    { name: GATE_LAYER_NAMES[1], raster: door, anchor: closed.anchor },
  ];
}

function rasterAlphaBounds(raster: Raster): { top: number; bottom: number } {
  let top = raster.height;
  let bottom = -1;
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (raster.alphaAt(x, y) === 0) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return bottom >= 0 ? { top, bottom } : { top: 0, bottom: 0 };
}

function blitAtSharedAnchor(target: FrameDef, overlay: FrameDef): void {
  const targetAnchor = target.anchor ?? { x: target.raster.width / 2, y: target.raster.height / 2 };
  const overlayAnchor = overlay.anchor ?? { x: overlay.raster.width / 2, y: overlay.raster.height / 2 };
  target.raster.blit(
    overlay.raster,
    Math.round(targetAnchor.x - overlayAnchor.x),
    Math.round(targetAnchor.y - overlayAnchor.y),
  );
}

function scaffoldLine(
  raster: Raster,
  x0: number, y0: number, x1: number, y1: number,
): void {
  raster.line(x0, y0, x1, y1, PALETTE.woodDark);
  raster.line(x0 + 1, y0, x1 + 1, y1, PALETTE.woodBase);
  raster.line(x0 + 2, y0, x1 + 2, y1, PALETTE.woodLight);
}

/** HD scaffold built around the approved final footprint, never old geometry. */
function addConstructionScaffold(frame: FrameDef, size: number, stage: 1 | 2): void {
  const anchor = frame.anchor ?? { x: frame.raster.width / 2, y: frame.raster.height / 2 };
  const bounds = rasterAlphaBounds(frame.raster);
  const halfW = Math.min(frame.raster.width * 0.44, size * 58);
  const halfH = Math.min(frame.raster.height * 0.2, size * 27);
  const structureH = Math.max(28, anchor.y - bounds.top);
  const scaffoldH = Math.round(structureH * (stage === 1 ? 0.58 : 0.84));
  const left: readonly [number, number] = [Math.round(anchor.x - halfW), Math.round(anchor.y)];
  const south: readonly [number, number] = [Math.round(anchor.x), Math.round(anchor.y + halfH)];
  const right: readonly [number, number] = [Math.round(anchor.x + halfW), Math.round(anchor.y)];
  const faces = stage === 1 ? [[left, south], [south, right]] as const : [[south, right]] as const;

  for (const [start, end] of faces) {
    const poles: Array<readonly [number, number]> = [
      start,
      [Math.round((start[0] + end[0]) / 2), Math.round((start[1] + end[1]) / 2)],
      end,
    ];
    for (const [x, y] of poles) scaffoldLine(frame.raster, x, y, x, y - scaffoldH);
    for (const level of [0.48, 0.96]) {
      scaffoldLine(
        frame.raster,
        start[0], Math.round(start[1] - scaffoldH * level),
        end[0], Math.round(end[1] - scaffoldH * level),
      );
    }
    scaffoldLine(
      frame.raster,
      start[0], start[1] - 3,
      end[0], end[1] - scaffoldH + 3,
    );
  }
}

function constructionFrame(
  entry: ConstructionCutout,
  done: FrameDef,
  foundationBase: FrameDef,
  materials: MaterialLibrary,
): FrameDef {
  // Every stage uses the exact approved done canvas + anchor, eliminating the
  // scale/position jump and the legacy procedural silhouette at construct2.
  const frame: FrameDef = {
    name: entry.name,
    raster: new Raster(done.raster.width, done.raster.height),
    anchor: done.anchor,
  };
  const foundation = materializeFrame(foundationBase, materials);
  blitAtSharedAnchor(frame, foundation);

  if (entry.stage > 0) {
    const revealed = done.raster.clone();
    const bounds = rasterAlphaBounds(revealed);
    const fraction = entry.stage === 1 ? 0.42 : 0.78;
    const revealTop = Math.round(bounds.bottom - (bounds.bottom - bounds.top + 1) * fraction);
    for (let y = 0; y < revealTop; y++) {
      for (let x = 0; x < revealed.width; x++) revealed.clear(x, y);
    }
    frame.raster.blit(revealed, 0, 0);
    const id = entry.name.split('/')[1];
    addConstructionScaffold(frame, buildingDefs[id]?.size ?? 1, entry.stage === 1 ? 1 : 2);
  }
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

async function emitFamily(
  family: string,
  sourceFrames: FrameDef[],
  materials: MaterialLibrary,
  manifest: string[],
  emittedNames: Set<string>,
  impactFrame: Record<string, number> = {},
  nineSlice?: Record<string, [number, number, number, number]>,
): Promise<number> {
  const frames = sourceFrames
    .filter((f) => !BESPOKE_FRAMES.has(f.name))
    .map((f) => materializeFrame(f, materials));
  if (frames.length === 0) return 0;
  const scaledNineSlice = nineSlice
    ? Object.fromEntries(Object.entries(nineSlice).map(([name, inset]) =>
      [name, inset.map((n) => n * HD_DENSITY) as [number, number, number, number]]))
    : undefined;
  const groups = atlasGroups(frames);
  for (const [index, group] of groups.entries()) {
    const stem = `${family}-${index}`;
    const imageName = `${stem}.webp`;
    const jsonName = `${stem}.json`;
    const meta = defaultStoneSiegeMeta({
      impactFrame,
      ...(scaledNineSlice ? { nineSlice: scaledNineSlice } : {}),
    });
    const atlas = buildAtlas(group, imageName, meta, MAX_ATLAS);
    atlas.json.meta.scale = HD_DENSITY;
    (atlas.json.meta.bannerfall as Record<string, unknown>).artStyle = 'pre-rendered-3d';
    await writeLosslessWebp(join(OUT, imageName), atlas.image);
    writeFileSync(join(OUT, jsonName), `${JSON.stringify(atlas.json, null, 1)}\n`);
    manifest.push(jsonName);
    for (const frame of group) {
      if (emittedNames.has(frame.name)) throw new Error(`duplicate HD frame: ${frame.name}`);
      emittedNames.add(frame.name);
    }
    console.log(`  ${stem.padEnd(14)} ${String(group.length).padStart(4)} frames  ${atlas.image.width}x${atlas.image.height}`);
  }
  return frames.length;
}

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(OUT)) {
  if (/^(terrain|objects|units|buildings|ui|icons|hero)-.*\.(png|webp|json)$/.test(file) || file === 'manifest.json') {
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
converted += await emitFamily('terrain', terrain, materials, manifest, emittedNames);
const objects = genObjects();
converted += await emitFamily('objects', objects.frames, materials, manifest, emittedNames, objects.impactFrames);
const units = genUnits();
converted += await emitFamily('units', units.frames, materials, manifest, emittedNames, units.impactFrames);
const buildings = genBuildings();
converted += await emitFamily('buildings', buildings.frames, materials, manifest, emittedNames, buildings.impactFrames);
const ui = genUi();
converted += await emitFamily('ui', ui.frames, materials, manifest, emittedNames, {}, ui.nineSlice);
const icons = genIcons();
converted += await emitFamily('icons', icons, materials, manifest, emittedNames);

// Last manifest entries contain the genuinely redrawn art. All other frames
// retain the systemic material renderer until their authored replacement lands.
const hero = heroFrame();
const sourceByName = new Map(
  [...terrain, ...objects.frames, ...units.frames, ...buildings.frames, ...ui.frames, ...icons]
    .map((frame) => [frame.name, frame] as const),
);
const cutoutEntries = CUTOUT_SPECS.flatMap((spec) => spec.frames.map((name) => {
  const base = sourceByName.get(name);
  if (!base) throw new Error(`missing mechanical source frame for cutout ${name}`);
  return { spec, name, base };
}));
const scaleByGroup = new Map<string, number>();
for (const { spec, name, base } of cutoutEntries) {
  if (!spec.scaleGroup) continue;
  const fitted = cutoutMetrics(spec, name, base).fittedScale;
  scaleByGroup.set(spec.scaleGroup, Math.min(scaleByGroup.get(spec.scaleGroup) ?? fitted, fitted));
}
const cutouts = cutoutEntries.map(({ spec, name, base }) =>
  cutoutFrame(spec, name, base, spec.scaleGroup ? scaleByGroup.get(spec.scaleGroup) : undefined));
const doneCutoutByConstructionPrefix = new Map<string, FrameDef>();
for (const frame of cutouts) {
  if (!frame.name.startsWith('bld/') || !frame.name.endsWith('/done')) continue;
  const prefix = constructionPrefixForDone(frame.name);
  // Extra Town Centers unlock in Castle Age, so their non-age-specific
  // construction lifecycle must lead into the Castle model rather than briefly
  // showing the Feudal architecture. Houses intentionally use their Dark source.
  const preferred = prefix === 'bld/townCenter'
    ? 'bld/townCenter/castle/done'
    : prefix === 'bld/house'
      ? 'bld/house/dark/done'
      : null;
  if (!doneCutoutByConstructionPrefix.has(prefix) || frame.name === preferred) {
    doneCutoutByConstructionPrefix.set(prefix, frame);
  }
}
const gateClosed = cutouts.find((frame) => frame.name === 'bld/gate/done');
if (!gateClosed) throw new Error('missing approved closed gate cutout');
const gateLayers = gateLayerFrames(gateClosed);
const constructions = CONSTRUCTION_CUTOUTS.map((entry) => {
  const prefix = entry.name.replace(/\/construct[0-2]$/, '');
  const done = doneCutoutByConstructionPrefix.get(prefix);
  if (!done) throw new Error(`missing approved done frame for construction ${entry.name}`);
  const foundation = sourceByName.get(`${prefix}/construct0`);
  if (!foundation) throw new Error(`missing mechanical foundation for construction ${entry.name}`);
  return constructionFrame(entry, done, foundation, materials);
});
const bespokeFrames = [hero.frame, ...cutouts, ...gateLayers, ...constructions];
const bespokeGroups = atlasGroups(bespokeFrames);
for (const [index, group] of bespokeGroups.entries()) {
  const stem = `hero-redrawn-${index}`;
  const imageName = `${stem}.webp`;
  const jsonName = `${stem}.json`;
  const heroAtlas = buildAtlas(group, imageName, defaultStoneSiegeMeta(), MAX_ATLAS);
  heroAtlas.json.meta.scale = HD_DENSITY;
  (heroAtlas.json.meta.bannerfall as Record<string, unknown>).artStyle = 'pre-rendered-3d';
  await writeLosslessWebp(join(OUT, imageName), heroAtlas.image);
  writeFileSync(join(OUT, jsonName), `${JSON.stringify(heroAtlas.json, null, 1)}\n`);
  manifest.push(jsonName);
  console.log(`  ${stem.padEnd(14)} ${String(group.length).padStart(4)} frames  ${heroAtlas.image.width}x${heroAtlas.image.height}`);
}
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
