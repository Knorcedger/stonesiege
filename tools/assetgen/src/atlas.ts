// Shelf-packer → single PNG + Pixi spritesheet JSON (meta.scale = 1) with
// per-frame anchors and legacy meta.bannerfall fields (ASSET_CONTRACT). The
// schema key stays stable so existing authored atlases remain compatible.

import { Raster } from './raster.ts';
import { nextPow2 } from './util.ts';
import { MASK_HEX, PLAYER_RAMPS } from './palette.ts';
import type { PlayerRamp } from './palette.ts';

export interface FrameDef {
  name: string;
  raster: Raster;
  /** Anchor in frame pixel coords; written normalized to the atlas JSON. */
  anchor?: { x: number; y: number };
}

export interface StoneSiegeMeta {
  playerColorStrategy: 'runtime-swap';
  maskPalette: readonly string[];
  playerRamps: readonly PlayerRamp[];
  /** '<framePrefix>/attack' → impact frame index (ART_BIBLE §6.1). */
  impactFrame: Record<string, number>;
  /** Optional per-frame 9-slice insets [left, top, right, bottom] (ui atlas). */
  nineSlice?: Record<string, [number, number, number, number]>;
}

export interface AtlasResult {
  image: Raster;
  json: {
    frames: Record<string, unknown>;
    meta: Record<string, unknown>;
  };
}

export function defaultStoneSiegeMeta(
  extra?: Partial<StoneSiegeMeta>,
): StoneSiegeMeta {
  return {
    playerColorStrategy: 'runtime-swap',
    maskPalette: MASK_HEX,
    playerRamps: PLAYER_RAMPS,
    impactFrame: {},
    ...extra,
  };
}

const PAD = 1;

/**
 * Pack frames into one texture (≤ maxWidth wide). Deterministic: pack order is
 * height-desc then name-asc; JSON frame keys are emitted in name order.
 */
export function buildAtlas(
  frames: FrameDef[],
  imageName: string,
  bannerfall: StoneSiegeMeta,
  maxWidth = 2048,
): AtlasResult {
  const seen = new Set<string>();
  for (const f of frames) {
    if (seen.has(f.name)) throw new Error(`duplicate frame name: ${f.name}`);
    seen.add(f.name);
  }

  const order = [...frames].sort(
    (a, b) => b.raster.height - a.raster.height || (a.name < b.name ? -1 : 1),
  );

  let maxFrameW = 16;
  let totalArea = 0;
  for (const f of order) {
    maxFrameW = Math.max(maxFrameW, f.raster.width + PAD * 2);
    totalArea += (f.raster.width + PAD) * (f.raster.height + PAD);
  }
  const width = Math.min(
    maxWidth,
    Math.max(nextPow2(maxFrameW), nextPow2(Math.ceil(Math.sqrt(totalArea * 1.1)))),
  );

  // shelf pack
  const placed = new Map<string, { x: number; y: number }>();
  let shelfY = PAD;
  let shelfH = 0;
  let cursorX = PAD;
  for (const f of order) {
    const w = f.raster.width;
    const h = f.raster.height;
    if (cursorX + w + PAD > width) {
      shelfY += shelfH + PAD;
      shelfH = 0;
      cursorX = PAD;
    }
    placed.set(f.name, { x: cursorX, y: shelfY });
    cursorX += w + PAD;
    shelfH = Math.max(shelfH, h);
  }
  const height = shelfY + shelfH + PAD;
  if (height > 2048) throw new Error(`${imageName}: packed height ${height} exceeds 2048`);

  const image = new Raster(width, height);
  for (const f of order) {
    const p = placed.get(f.name)!;
    f.raster.copyInto(image, p.x, p.y);
  }

  const jsonFrames: Record<string, unknown> = {};
  for (const f of [...frames].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = placed.get(f.name)!;
    const w = f.raster.width;
    const h = f.raster.height;
    const anchor = f.anchor ?? { x: w / 2, y: h / 2 };
    jsonFrames[f.name] = {
      frame: { x: p.x, y: p.y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      anchor: {
        x: Math.round((anchor.x / w) * 10000) / 10000,
        y: Math.round((anchor.y / h) * 10000) / 10000,
      },
    };
  }

  return {
    image,
    json: {
      frames: jsonFrames,
      meta: {
        app: 'stonesiege-assetgen',
        version: '1.0',
        image: imageName,
        format: 'RGBA8888',
        size: { w: width, h: height },
        scale: 1,
        bannerfall,
      },
    },
  };
}
