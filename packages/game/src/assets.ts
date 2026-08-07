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
  meta?: { image?: string; scale?: number; bannerfall?: BannerfallMeta };
}

interface Atlas {
  name: string;
  missing: boolean;
  /** Source pixels per world pixel. HD atlases use 2; legacy pixel atlases use 1. */
  density: number;
  image: HTMLImageElement | null;
  frames: Map<string, Texture>;
  frameData: Map<string, AtlasFrameData>;
  strategy: 'runtime-swap' | 'baked' | null;
  maskPalette: Rgb[] | null;
  playerRamps: Rgb[][] | null;
}

export interface ResolvedFrame {
  texture: Texture;
  mirrored: boolean;
  anchorX: number;
  anchorY: number;
  /** Multiply the source texture by this value to preserve world-space size. */
  renderScale: number;
}

interface HdManifest { atlases?: string[]; frameCount?: number }

interface ColorPage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  source: TextureSource;
  cursorX: number;
  cursorY: number;
  shelfH: number;
}

const COLOR_PAGE_SIZE = 1024;
const COLOR_PAGE_PAD = 1;

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
  /** Optional frame-by-frame HD replacements, loaded from /assets/hd/manifest.json. */
  private hdFrames = new Map<string, Atlas>();
  private placeholder: Texture | null = null;
  private warned = new Set<string>();
  private mockCache = new Map<string, ResolvedFrame>();
  private iconCache = new Map<string, HTMLCanvasElement>();
  /** Requested player variants are packed lazily instead of cloning every 2x sheet per player. */
  private colorCache = new Map<string, Texture>();
  private colorPages = new Map<string, ColorPage[]>();
  matchColors: number[] = [];

  async load(): Promise<void> {
    // Crisp nearest-neighbor everywhere (pixel art at integer zooms).
    TextureSource.defaultOptions.scaleMode = 'nearest';
    await Promise.all(ATLAS_NAMES.map(async (name) => {
      this.atlases.set(name, await loadAtlas(name));
    }));
    await this.loadHdOverrides();
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

  /** Record participating colors; runtime swaps are created lazily per visible frame. */
  prepareMatchColors(colors: number[]): void {
    this.matchColors = [...colors];
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
    return { texture: this.placeholder, mirrored: false, anchorX: 0.5, anchorY: 0.5, renderScale: 1 };
  }

  /** Like resolveFrame but returns null for missing frames (optional decor: transitions, age variants). */
  tryResolve(name: string, playerColor?: number): ResolvedFrame | null {
    const { name: phys, mirrored } = resolveFrameName(name);
    const atlasName = atlasNameFor(phys);
    if (!atlasName) return null;
    const atlas = this.hdFrames.get(phys) ?? this.atlases.get(atlasName);
    if (!atlas) return null;

    if (!atlas.missing) {
      let tex: Texture | undefined;
      if (playerColor !== undefined && atlas.strategy === 'baked') {
        tex = atlas.frames.get(bakedColorName(phys, playerColor));
      }
      if (!tex && playerColor !== undefined && atlas.strategy === 'runtime-swap') {
        tex = this.playerColoredTexture(atlas, phys, playerColor);
      }
      tex ??= atlas.frames.get(phys);
      if (tex) {
        const a = defaultAnchorFor(phys, tex);
        return { texture: tex, mirrored, anchorX: a.x, anchorY: a.y, renderScale: 1 / atlas.density };
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
      renderScale: 1,
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
    const atlas = this.hdFrames.get(phys) ?? (atlasName ? this.atlases.get(atlasName) : undefined);
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
    const atlas = this.hdFrames.get(name) ?? this.atlases.get('icons');
    ctx.imageSmoothingEnabled = (atlas?.density ?? 1) > 1;
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
    for (const atlas of this.allAtlases()) {
      const ramp = atlas.playerRamps?.[colorIdx];
      if (ramp) {
        return [rgbCss(ramp[0]), rgbCss(ramp[1]), rgbCss(ramp[2])] as [string, string, string];
      }
    }
    const fb = FALLBACK_PLAYER_RAMPS[colorIdx] ?? FALLBACK_PLAYER_RAMPS[6];
    return [...fb];
  }

  private allAtlases(): Atlas[] {
    return [...this.atlases.values(), ...new Set(this.hdFrames.values())];
  }

  private playerColoredTexture(atlas: Atlas, frameName: string, color: number): Texture | undefined {
    const key = `${atlas.name}|${frameName}|${color}`;
    const cached = this.colorCache.get(key);
    if (cached) return cached;
    const fd = atlas.frameData.get(frameName);
    const plain = atlas.frames.get(frameName);
    if (!fd || !plain || !atlas.image || !atlas.maskPalette) return plain;

    const { x, y, w, h } = fd.frame;
    const scratch = document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    const scratchCtx = scratch.getContext('2d')!;
    scratchCtx.drawImage(atlas.image, x, y, w, h, 0, 0, w, h);
    const pixels = scratchCtx.getImageData(0, 0, w, h);
    // Terrain, UI, and many world frames contain no ownership pixels. Reuse
    // their plain atlas texture without allocating player-specific storage.
    if (!containsMask(pixels.data, atlas.maskPalette)) {
      this.colorCache.set(key, plain);
      return plain;
    }

    const ramps = atlas.playerRamps ?? FALLBACK_PLAYER_RAMPS.map((r) => r.map(hexToRgb));
    const ramp = color === GAIA_NEUTRAL_COLOR
      ? GAIA_NEUTRAL_RAMP.map(hexToRgb)
      : ramps[color] ?? ramps[0];
    if (!ramp) return plain;
    swapPalette(pixels.data, atlas.maskPalette, ramp);
    if (DEV_ASSERTS && containsMask(pixels.data, atlas.maskPalette)) {
      console.error(`[assets] ${atlas.name}:${frameName} retained raw player-mask pixels`);
    }

    const placed = this.placeColorFrame(color, atlas.density, pixels);
    const texture = new Texture({
      source: placed.page.source,
      frame: new Rectangle(placed.x, placed.y, w, h),
      defaultAnchor: fd.anchor,
    });
    this.colorCache.set(key, texture);
    return texture;
  }

  private placeColorFrame(
    color: number,
    density: number,
    pixels: ImageData,
  ): { page: ColorPage; x: number; y: number } {
    if (pixels.width + COLOR_PAGE_PAD * 2 > COLOR_PAGE_SIZE || pixels.height + COLOR_PAGE_PAD * 2 > COLOR_PAGE_SIZE) {
      throw new Error(`player-colored frame ${pixels.width}x${pixels.height} exceeds ${COLOR_PAGE_SIZE}px page`);
    }
    const key = `${color}@${density}`;
    const pages = this.colorPages.get(key) ?? [];
    let page = pages[pages.length - 1];
    if (!page) {
      page = this.createColorPage(density);
      pages.push(page);
      this.colorPages.set(key, pages);
    }
    if (page.cursorX + pixels.width + COLOR_PAGE_PAD > COLOR_PAGE_SIZE) {
      page.cursorX = COLOR_PAGE_PAD;
      page.cursorY += page.shelfH + COLOR_PAGE_PAD;
      page.shelfH = 0;
    }
    if (page.cursorY + pixels.height + COLOR_PAGE_PAD > COLOR_PAGE_SIZE) {
      page = this.createColorPage(density);
      pages.push(page);
    }
    const x = page.cursorX;
    const y = page.cursorY;
    page.ctx.putImageData(pixels, x, y);
    page.source.update();
    page.cursorX += pixels.width + COLOR_PAGE_PAD;
    page.shelfH = Math.max(page.shelfH, pixels.height);
    return { page, x, y };
  }

  private createColorPage(density: number): ColorPage {
    const canvas = document.createElement('canvas');
    canvas.width = COLOR_PAGE_SIZE;
    canvas.height = COLOR_PAGE_SIZE;
    const source = Texture.from(canvas).source;
    source.scaleMode = density > 1 ? 'linear' : 'nearest';
    return {
      canvas,
      ctx: canvas.getContext('2d')!,
      source,
      cursorX: COLOR_PAGE_PAD,
      cursorY: COLOR_PAGE_PAD,
      shelfH: 0,
    };
  }

  private async loadHdOverrides(): Promise<void> {
    try {
      const response = await fetch('assets/hd/manifest.json');
      if (!response.ok) return;
      const manifest = await response.json() as HdManifest;
      const files = manifest.atlases ?? [];
      const loaded = await Promise.all(files.map((file) => loadAtlasFile(
        `assets/hd/${file}`,
        'assets/hd/',
        file.replace(/\.json$/i, ''),
      )));
      // Promise.all preserves manifest order, so intentional later overrides
      // (the hand-finished Town Center) remain authoritative.
      for (const atlas of loaded) {
        if (atlas.missing) continue;
        for (const frameName of atlas.frameData.keys()) this.hdFrames.set(frameName, atlas);
      }
      if (manifest.frameCount !== undefined && this.hdFrames.size !== manifest.frameCount) {
        console.warn(`[assets] HD manifest loaded ${this.hdFrames.size}/${manifest.frameCount} frames; missing frames use fallback art`);
      }
    } catch {
      // HD replacements are optional; the complete deterministic fallback stays loadable.
    }
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
  return loadAtlasFile(`assets/${name}.json`, 'assets/', name);
}

async function loadAtlasFile(jsonUrl: string, imageBase: string, fallbackName = jsonUrl): Promise<Atlas> {
  const atlas: Atlas = {
    name: fallbackName,
    missing: true,
    density: 1,
    image: null,
    frames: new Map(),
    frameData: new Map(),
    strategy: null,
    maskPalette: null,
    playerRamps: null,
  };
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as AtlasJson;
    if (!json || typeof json !== 'object' || !json.frames) throw new Error('bad atlas json');
    // A 0-frame atlas is an assetgen stub: treat as missing so mock frames kick in.
    if (Object.keys(json.frames).length === 0) throw new Error('empty atlas (stub)');
    const image = new Image();
    image.src = `${imageBase}${json.meta?.image ?? `${fallbackName}.png`}`;
    await image.decode();

    const source = Texture.from(image).source;
    atlas.density = Math.max(1, json.meta?.scale ?? 1);
    source.scaleMode = atlas.density > 1 ? 'linear' : 'nearest';
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
