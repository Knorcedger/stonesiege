// Atlas loading + frame resolution (docs/ASSET_CONTRACT.md).
// - Loads the 6 atlases from /assets/ by their exact names.
// - Player colors: 'runtime-swap' — reads meta.bannerfall.maskPalette/playerRamps and
//   builds per-color recolored canvases at match load for the colors in the match.
//   (If an atlas declares strategy 'baked' with @p<idx> frames, those are used instead.)
// - resolveFrame(name, playerColor) is THE sprite-frame lookup used everywhere: it
//   remaps mirrored dirs 5-7 to 3/2/1 (+mirrored flag), falls back to procedural mock
//   frames when an atlas is missing (assetgen runs in parallel), and returns a magenta
//   placeholder + console.warn for genuinely unknown frames. It never throws.

import { Rectangle, Texture, TextureSource } from 'pixi.js';
import { gameData } from '@bf/data';
import { resolveFrameName, bakedColorName } from './frames';
import {
  swapPalette, containsMask, hexToRgb, FALLBACK_PLAYER_RAMPS, FALLBACK_MASK_PALETTE,
  GAIA_NEUTRAL_COLOR, GAIA_NEUTRAL_RAMP, type Rgb,
} from './recolor';
import { makeMockFrame } from './dev/mockAtlas';

/** Dev builds run extra pixel asserts (mask colors must never reach the screen). */
const DEV_ASSERTS = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

export const ATLAS_NAMES = ['terrain', 'units', 'buildings', 'objects', 'ui', 'icons'] as const;
export type AtlasName = (typeof ATLAS_NAMES)[number];

interface AtlasFrameData {
  frame: { x: number; y: number; w: number; h: number };
  anchor?: { x: number; y: number };
}

interface BannerfallMeta {
  playerColorStrategy?: string;
  maskPalette?: string[];
  /** Either [light,mid,dark][] hex tuples or assetgen's {name,light,mid,dark}[] records. */
  playerRamps?: Array<string[] | { light: string; mid: string; dark: string }>;
  impactFrame?: unknown;
}

function parseRamp(entry: string[] | { light: string; mid: string; dark: string }): Rgb[] {
  if (Array.isArray(entry)) return entry.map(hexToRgb);
  return [hexToRgb(entry.light), hexToRgb(entry.mid), hexToRgb(entry.dark)];
}

interface AtlasJson {
  frames: Record<string, AtlasFrameData>;
  meta?: { image?: string; bannerfall?: BannerfallMeta };
}

interface Atlas {
  name: AtlasName;
  missing: boolean;
  image: HTMLImageElement | null;
  frames: Map<string, Texture>;
  frameData: Map<string, AtlasFrameData>;
  colorFrames: Map<number, Map<string, Texture>>;
  strategy: 'runtime-swap' | 'baked' | null;
  maskPalette: Rgb[] | null;
  playerRamps: Rgb[][] | null;
}

export interface ResolvedFrame {
  texture: Texture;
  mirrored: boolean;
  anchorX: number;
  anchorY: number;
}

function atlasNameFor(frame: string): AtlasName | null {
  if (frame.startsWith('terr/')) return 'terrain';
  if (frame.startsWith('unit/')) return 'units';
  if (frame.startsWith('bld/')) return 'buildings';
  if (frame.startsWith('obj/')) return 'objects';
  if (frame.startsWith('ui/')) return 'ui';
  if (frame.startsWith('icon/')) return 'icons';
  return null;
}

function makePlaceholderTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FF00FF';
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(0.5, 0.5, 31, 31);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(32, 32); ctx.moveTo(32, 0); ctx.lineTo(0, 32);
  ctx.stroke();
  return Texture.from(c);
}

export class GameAssets {
  private atlases = new Map<AtlasName, Atlas>();
  private placeholder: Texture | null = null;
  private warned = new Set<string>();
  private mockCache = new Map<string, ResolvedFrame>();
  private iconCache = new Map<string, HTMLCanvasElement>();
  matchColors: number[] = [];

  async load(): Promise<void> {
    // Crisp nearest-neighbor everywhere (pixel art at integer zooms).
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await Promise.all(ATLAS_NAMES.map(async (name) => {
      this.atlases.set(name, await loadAtlas(name));
    }));
    const missing = ATLAS_NAMES.filter((n) => this.atlases.get(n)!.missing);
    if (missing.length > 0) {
      console.warn(
        `[assets] Missing atlases (${missing.join(', ')}) — using procedural mock frames. ` +
        'Run `npm run assets` once tools/assetgen lands.',
      );
    }
  }

  /** True if every atlas loaded from disk (no mock frames in play). */
  get allAtlasesPresent(): boolean {
    return ATLAS_NAMES.every((n) => !this.atlases.get(n)?.missing);
  }

  /**
   * Build per-player-color texture copies (runtime-swap) for the colors in this
   * match. Cheap no-op for atlases without a mask palette or with baked frames.
   */
  prepareMatchColors(colors: number[]): void {
    this.matchColors = [...colors];
    for (const atlas of this.atlases.values()) {
      if (atlas.missing || !atlas.image || !atlas.maskPalette || atlas.strategy === 'baked') continue;
      const ramps = atlas.playerRamps ?? FALLBACK_PLAYER_RAMPS.map((r) => r.map(hexToRgb));
      const base = document.createElement('canvas');
      base.width = atlas.image.naturalWidth;
      base.height = atlas.image.naturalHeight;
      const bctx = base.getContext('2d')!;
      bctx.drawImage(atlas.image, 0, 0);
      const baseData = bctx.getImageData(0, 0, base.width, base.height);
      // gaia sprites with a mask band (sheep ownership mark) swap to neutral gray
      for (const color of [...colors, GAIA_NEUTRAL_COLOR]) {
        if (atlas.colorFrames.has(color)) continue;
        const ramp = color === GAIA_NEUTRAL_COLOR
          ? GAIA_NEUTRAL_RAMP.map(hexToRgb)
          : ramps[color] ?? ramps[0];
        if (!ramp) continue;
        const copy = new ImageData(new Uint8ClampedArray(baseData.data), baseData.width, baseData.height);
        swapPalette(copy.data, atlas.maskPalette, ramp);
        // Dev assert (ASSET_CONTRACT): after the swap NO mask pixel may survive —
        // any hit means raw magenta would render in-game (the sheep-collar bug).
        if (DEV_ASSERTS && containsMask(copy.data, atlas.maskPalette)) {
          console.error(
            `[assets] ${atlas.name}: mask colors survived the ` +
            `${color === GAIA_NEUTRAL_COLOR ? 'gaia-neutral' : `player ${color}`} palette swap — ` +
            'raw magenta would reach the screen',
          );
        }
        const cnv = document.createElement('canvas');
        cnv.width = base.width;
        cnv.height = base.height;
        cnv.getContext('2d')!.putImageData(copy, 0, 0);
        const source = Texture.from(cnv).source;
        const frames = new Map<string, Texture>();
        for (const [fname, fd] of atlas.frameData) {
          frames.set(fname, new Texture({
            source,
            frame: new Rectangle(fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h),
            defaultAnchor: fd.anchor,
          }));
        }
        atlas.colorFrames.set(color, frames);
      }
    }
  }

  /**
   * The single sprite-frame resolver. Handles mirrored dirs 5-7, player-color
   * variants, mock fallback and the magenta placeholder. Never throws.
   */
  resolveFrame(name: string, playerColor?: number): ResolvedFrame {
    const hit = this.tryResolve(name, playerColor);
    if (hit) return hit;
    if (!this.warned.has(name)) {
      this.warned.add(name);
      console.warn(`[assets] Missing frame: ${name} — using placeholder`);
    }
    this.placeholder ??= makePlaceholderTexture();
    return { texture: this.placeholder, mirrored: false, anchorX: 0.5, anchorY: 0.5 };
  }

  /** Like resolveFrame but returns null for missing frames (optional decor: transitions, age variants). */
  tryResolve(name: string, playerColor?: number): ResolvedFrame | null {
    const { name: phys, mirrored } = resolveFrameName(name);
    const atlasName = atlasNameFor(phys);
    if (!atlasName) return null;
    const atlas = this.atlases.get(atlasName);
    if (!atlas) return null;

    if (!atlas.missing) {
      let tex: Texture | undefined;
      if (playerColor !== undefined && atlas.strategy === 'baked') {
        tex = atlas.frames.get(bakedColorName(phys, playerColor));
      }
      if (!tex && playerColor !== undefined) {
        tex = atlas.colorFrames.get(playerColor)?.get(phys);
        // Dev assert: a masked runtime-swap atlas serving the PLAIN frame for a
        // color request means the swap was never prepared for this color — the
        // frame's mask band would render as raw magenta.
        if (
          DEV_ASSERTS && !tex && atlas.maskPalette && atlas.strategy !== 'baked' &&
          !atlas.colorFrames.has(playerColor) && atlas.frames.has(phys)
        ) {
          const warnKey = `swap-missing:${atlas.name}:${playerColor}`;
          if (!this.warned.has(warnKey)) {
            this.warned.add(warnKey);
            console.error(
              `[assets] ${atlas.name}: no palette-swapped copy for color ${playerColor} ` +
              `(frame ${phys}) — serving the raw mask frame. Was prepareMatchColors called?`,
            );
          }
        }
      }
      tex ??= atlas.frames.get(phys);
      if (tex) {
        const a = defaultAnchorFor(phys, tex);
        return { texture: tex, mirrored, anchorX: a.x, anchorY: a.y };
      }
      return null;
    }

    // Atlas missing: procedural mock frame (dev), cached per name+color.
    const key = `${phys}@${playerColor ?? 'n'}`;
    const cached = this.mockCache.get(key);
    if (cached) return { ...cached, mirrored };
    const mock = makeMockFrame(phys, playerColor);
    if (!mock) return null;
    const resolved: ResolvedFrame = {
      texture: Texture.from(mock.canvas),
      mirrored: false,
      anchorX: mock.anchorX,
      anchorY: mock.anchorY,
    };
    this.mockCache.set(key, resolved);
    return { ...resolved, mirrored };
  }

  /** Number of frames present for an animated prefix like `unit/militia/walk/0`. */
  frameCount(prefix: string, max = 16): number {
    let i = 0;
    while (i < max && this.tryResolve(`${prefix}/${i}`)) i++;
    return i;
  }

  private contentTopCache = new Map<string, number>();

  /**
   * First non-transparent row of a frame, in px from the frame rect's top
   * (0 when unknown/mock). Atlas frames carry transparent headroom, so HUD
   * overlays (building health bars) must anchor to pixels, not the rect.
   * Alpha is identical across color swaps — cached per physical frame name.
   */
  contentTopPx(name: string): number {
    const { name: phys } = resolveFrameName(name);
    const cached = this.contentTopCache.get(phys);
    if (cached !== undefined) return cached;
    let top = 0;
    const atlasName = atlasNameFor(phys);
    const atlas = atlasName ? this.atlases.get(atlasName) : undefined;
    const fd = atlas?.frameData.get(phys);
    if (atlas && !atlas.missing && atlas.image && fd) {
      const { x, y, w, h } = fd.frame;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(atlas.image, x, y, w, h, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      scan: for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          if (data[(row * w + col) * 4 + 3] !== 0) {
            top = row;
            break scan;
          }
        }
      }
    }
    this.contentTopCache.set(phys, top);
    return top;
  }

  /**
   * A 40x40 canvas for a HUD icon frame (DOM command card). Uses the icons atlas
   * subregion, mock icons when the atlas is missing, magenta placeholder otherwise.
   * Always returns a FRESH element (a canvas can only live in one DOM slot).
   */
  getIconCanvas(name: string): HTMLCanvasElement {
    const cached = this.iconCache.get(name);
    if (cached) {
      const copy = document.createElement('canvas');
      copy.width = cached.width;
      copy.height = cached.height;
      copy.getContext('2d')!.drawImage(cached, 0, 0);
      return copy;
    }
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const atlas = this.atlases.get('icons');
    let drawn = false;
    if (atlas && !atlas.missing && atlas.image) {
      const fd = atlas.frameData.get(name);
      if (fd) {
        ctx.drawImage(atlas.image, fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h, 0, 0, 40, 40);
        drawn = true;
      }
    } else {
      const mock = makeMockFrame(name);
      if (mock) {
        ctx.drawImage(mock.canvas, 0, 0, 40, 40);
        drawn = true;
      }
    }
    if (!drawn) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`[assets] Missing icon frame: ${name} — using placeholder`);
      }
      ctx.fillStyle = '#FF00FF';
      ctx.fillRect(0, 0, 40, 40);
    }
    this.iconCache.set(name, c);
    return c;
  }

  /** Player ramp [light, mid, dark] as CSS hex, from atlas meta when available. */
  getPlayerRampCss(colorIdx: number): [string, string, string] {
    for (const atlas of this.atlases.values()) {
      const ramp = atlas.playerRamps?.[colorIdx];
      if (ramp) {
        return [rgbCss(ramp[0]), rgbCss(ramp[1]), rgbCss(ramp[2])] as [string, string, string];
      }
    }
    const fb = FALLBACK_PLAYER_RAMPS[colorIdx] ?? FALLBACK_PLAYER_RAMPS[6];
    return [...fb];
  }
}

function rgbCss(rgb: Rgb): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function defaultAnchorFor(name: string, tex: Texture): { x: number; y: number } {
  const da = tex.defaultAnchor;
  if (da && (da.x !== 0 || da.y !== 0)) return { x: da.x, y: da.y };
  if (name.startsWith('terr/')) return { x: 0.5, y: 0.5 };
  if (name.startsWith('bld/')) {
    const defId = name.split('/')[1]?.split('@')[0];
    const def = defId ? gameData.buildings[defId] : undefined;
    if (def && tex.height > 0) {
      return { x: 0.5, y: (tex.height - def.size * 16) / tex.height };
    }
    return { x: 0.5, y: 0.75 };
  }
  if (name.startsWith('unit/') || name.startsWith('obj/')) return { x: 0.5, y: 0.9 };
  return { x: 0, y: 0 };
}

async function loadAtlas(name: AtlasName): Promise<Atlas> {
  const atlas: Atlas = {
    name,
    missing: true,
    image: null,
    frames: new Map(),
    frameData: new Map(),
    colorFrames: new Map(),
    strategy: null,
    maskPalette: null,
    playerRamps: null,
  };
  try {
    const res = await fetch(`assets/${name}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as AtlasJson;
    if (!json || typeof json !== 'object' || !json.frames) throw new Error('bad atlas json');
    // A 0-frame atlas is an assetgen stub: treat as missing so mock frames kick in.
    if (Object.keys(json.frames).length === 0) throw new Error('empty atlas (stub)');
    const image = new Image();
    image.src = `assets/${json.meta?.image ?? `${name}.png`}`;
    await image.decode();

    const source = Texture.from(image).source;
    source.scaleMode = 'nearest';
    for (const [fname, fd] of Object.entries(json.frames)) {
      atlas.frameData.set(fname, fd);
      atlas.frames.set(fname, new Texture({
        source,
        frame: new Rectangle(fd.frame.x, fd.frame.y, fd.frame.w, fd.frame.h),
        defaultAnchor: fd.anchor,
      }));
    }
    const bf = json.meta?.bannerfall;
    if (bf) {
      atlas.strategy = bf.playerColorStrategy === 'baked' ? 'baked' : bf.playerColorStrategy === 'runtime-swap' ? 'runtime-swap' : null;
      if (bf.maskPalette) atlas.maskPalette = bf.maskPalette.map(hexToRgb);
      if (bf.playerRamps) atlas.playerRamps = bf.playerRamps.map(parseRamp);
    }
    // Masked atlases with no declared strategy default to runtime-swap (contract).
    if (!atlas.strategy && atlas.maskPalette) atlas.strategy = 'runtime-swap';
    if (atlas.strategy === 'runtime-swap' && !atlas.maskPalette) {
      atlas.maskPalette = FALLBACK_MASK_PALETTE.map(hexToRgb);
    }
    atlas.image = image;
    atlas.missing = false;
  } catch {
    // Missing/broken atlas: mock-frame mode (warned collectively in load()).
  }
  return atlas;
}

export async function loadAssets(): Promise<GameAssets> {
  const assets = new GameAssets();
  await assets.load();
  return assets;
}
