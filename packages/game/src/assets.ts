// Atlas loading + frame resolution (docs/ASSET_CONTRACT.md).
// - Loads the 6 atlases from /assets/ by their exact names.
// - Player colors: 'runtime-swap' — reads the legacy
//   meta.bannerfall.maskPalette/playerRamps schema and
//   builds per-color recolored canvases at match load for the colors in the match.
//   (If an atlas declares strategy 'baked' with @p<idx> frames, those are used instead.)
// - Hero accents: an optional second palette swap layered on the player color, so a
//   campaign hero aliasing a rank-and-file rig wears his own cloth (see frames.ts).
// - resolveFrame(name, playerColor, accent) is THE sprite-frame lookup used everywhere: it
//   remaps mirrored dirs 5-7 to 3/2/1 (+mirrored flag), falls back to procedural mock
//   frames when an atlas is missing (assetgen runs in parallel), and returns a magenta
//   placeholder + console.warn for genuinely unknown frames. It never throws.

import { Rectangle, Texture, TextureSource } from 'pixi.js';
import { gameData } from '@bf/data';
import { openArtworkStore, type ArtworkStore } from './artworkStore';
import { resolveFrameName, bakedColorName } from './frames';
import {
  applyEntityPalette, containsMask, hexToRgb, FALLBACK_PLAYER_RAMPS, FALLBACK_MASK_PALETTE,
  GAIA_NEUTRAL_COLOR, GAIA_NEUTRAL_RAMP, type ColorAccent, type Rgb,
} from './recolor';
import { makeMockFrame } from './dev/mockAtlas';
import type { ArtworkMode } from './developerTools';

/** Dev builds run extra pixel asserts (mask colors must never reach the screen). */
const DEV_ASSERTS = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

export const ATLAS_NAMES = ['terrain', 'units', 'buildings', 'objects', 'ui', 'icons'] as const;
export type AtlasName = (typeof ATLAS_NAMES)[number];

/**
 * Per-file deadline. It only means anything because HD transfers are bounded
 * below: a file that spends the window queued behind 35 others has not been
 * given 30s to load, it has been given none.
 */
const ATLAS_LOAD_TIMEOUT_MS = 30_000;
const HD_MANIFEST_TIMEOUT_MS = 8_000;
/** One retry: a cold load that lost a file to a stall should not lose the match. */
const ATLAS_LOAD_ATTEMPTS = 2;
/**
 * Simultaneous HD atlas transfers. The set is ~41 MB across 36 files, so
 * starting them all at once put every deadline in a race against the whole
 * queue rather than against its own bytes, and a first-time visitor on an
 * ordinary connection lost most of the set (see issue #132).
 */
export const HD_LOAD_CONCURRENCY = 4;

export interface AssetLoadProgress {
  completed: number;
  total: number;
  fallback: number;
}

export interface AssetLoadOptions {
  onProgress?(progress: AssetLoadProgress): void;
  /** Developer comparison mode. Standard skips optional HD discovery and overrides. */
  artworkMode?: ArtworkMode;
  /** Aborting HD work makes normal startup fail coherently; standard mode does not load it. */
  optionalSignal?: AbortSignal;
}

export function shouldLoadHdArtwork(mode: ArtworkMode | undefined): boolean {
  return mode !== 'standard';
}

interface AtlasFrameData {
  frame: { x: number; y: number; w: number; h: number };
  anchor?: { x: number; y: number };
}

interface StoneSiegeMeta {
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
  meta?: { image?: string; scale?: number; bannerfall?: StoneSiegeMeta };
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

export interface HdManifest {
  atlases?: string[];
  frameCount?: number;
  /** Per-file content hashes stamped by tools/hd-art — the persistent cache keys. */
  assetHashes?: Record<string, string>;
}

export function parseHdManifest(value: unknown): HdManifest {
  if (!value || typeof value !== 'object') return { atlases: [] };
  const manifest = value as Record<string, unknown>;
  const atlases = Array.isArray(manifest.atlases)
    ? manifest.atlases.filter((file): file is string => (
      typeof file === 'string'
      && /^[a-z0-9][a-z0-9._-]*\.json$/i.test(file)
    ))
    : [];
  const frameCount = typeof manifest.frameCount === 'number'
    && Number.isInteger(manifest.frameCount)
    && manifest.frameCount >= 0
    ? manifest.frameCount
    : undefined;
  const assetHashes: Record<string, string> = {};
  if (manifest.assetHashes && typeof manifest.assetHashes === 'object') {
    for (const [file, hash] of Object.entries(manifest.assetHashes)) {
      if (
        /^[a-z0-9][a-z0-9._-]*$/i.test(file)
        && typeof hash === 'string'
        && /^[0-9a-f]{8,64}$/i.test(hash)
      ) {
        assetHashes[file] = hash.toLowerCase();
      }
    }
  }
  return {
    atlases,
    ...(frameCount !== undefined ? { frameCount } : {}),
    ...(Object.keys(assetHashes).length > 0 ? { assetHashes } : {}),
  };
}

/**
 * Normal play must never combine HD and pixel-source frames inside one
 * animation. The baseline atlases remain available for the explicit developer
 * comparison mode, but an incomplete HD set is a recoverable startup failure.
 */
export function assertCompleteHdArtwork(
  mode: ArtworkMode | undefined,
  manifest: HdManifest,
  loadedFrameCount: number,
): void {
  if (!shouldLoadHdArtwork(mode)) return;
  const expectedFrameCount = manifest.frameCount;
  if (!manifest.atlases?.length || expectedFrameCount === undefined || expectedFrameCount <= 0) {
    throw new Error('Loading battlefield artwork failed because the HD manifest was unavailable.');
  }
  if (loadedFrameCount !== expectedFrameCount) {
    throw new Error(
      `Loading battlefield artwork failed because only ${loadedFrameCount} of `
      + `${expectedFrameCount} HD frames loaded.`,
    );
  }
}

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

  async load(options: AssetLoadOptions = {}): Promise<void> {
    // Crisp nearest-neighbor everywhere (pixel art at integer zooms).
    TextureSource.defaultOptions.scaleMode = 'nearest';
    const wantHd = shouldLoadHdArtwork(options.artworkMode);
    const store = wantHd ? await openArtworkStore() : null;
    const hdManifest = wantHd ? await loadHdManifest(store) : { atlases: [] };
    const hdFiles = hdManifest.atlases ?? [];
    let progress: AssetLoadProgress = {
      completed: 0,
      total: ATLAS_NAMES.length + hdFiles.length,
      fallback: 0,
    };
    options.onProgress?.(progress);
    const settled = (usedFallback: boolean): void => {
      progress = settleAssetPack(progress, usedFallback);
      options.onProgress?.(progress);
    };

    // Start the complete base art first so the browser gives it the first
    // network slots. It remains the explicit developer comparison set.
    const baseLoad = Promise.all(ATLAS_NAMES.map(async (name) => {
      const atlas = await loadAtlas(name);
      this.atlases.set(name, atlas);
      settled(atlas.missing);
    }));
    const hdLoad = this.loadHdOverrides(hdFiles, hdManifest.assetHashes, store, options.optionalSignal, settled);
    await Promise.all([baseLoad, hdLoad]);
    assertCompleteHdArtwork(options.artworkMode, hdManifest, this.hdFrames.size);
    // Only a proven-complete boot may garbage-collect the store: after a
    // partial or aborted load the untouched entries may be the very set the
    // next boot needs. Not awaited — deletions can trail the match starting.
    if (store) void store.prune();
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
  resolveFrame(name: string, playerColor?: number, accent?: ColorAccent): ResolvedFrame {
    const hit = this.tryResolve(name, playerColor, accent);
    if (hit) return hit;
    if (!this.warned.has(name)) {
      this.warned.add(name);
      console.warn(`[assets] Missing frame: ${name} — using placeholder`);
    }
    this.placeholder ??= makePlaceholderTexture();
    return { texture: this.placeholder, mirrored: false, anchorX: 0.5, anchorY: 0.5, renderScale: 1 };
  }

  /** Like resolveFrame but returns null for missing frames (optional decor: transitions, age variants). */
  tryResolve(name: string, playerColor?: number, accent?: ColorAccent): ResolvedFrame | null {
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
      if (!tex && (playerColor !== undefined || accent) && atlas.strategy === 'runtime-swap') {
        tex = this.playerColoredTexture(atlas, phys, playerColor, accent);
      }
      tex ??= atlas.frames.get(phys);
      if (tex) {
        const a = defaultAnchorFor(phys, tex);
        return { texture: tex, mirrored, anchorX: a.x, anchorY: a.y, renderScale: 1 / atlas.density };
      }
      return null;
    }

    // Atlas missing: procedural mock frame (dev), cached per name+color.
    const key = `${phys}@${playerColor ?? 'n'}@${accent?.id ?? ''}`;
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

  private playerColoredTexture(
    atlas: Atlas,
    frameName: string,
    color: number | undefined,
    accent?: ColorAccent,
  ): Texture | undefined {
    const key = `${atlas.name}|${frameName}|${color ?? 'n'}|${accent?.id ?? ''}`;
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

    const ramps = atlas.playerRamps ?? FALLBACK_PLAYER_RAMPS.map((r) => r.map(hexToRgb));
    const ramp = color === undefined
      ? undefined
      : color === GAIA_NEUTRAL_COLOR
        ? GAIA_NEUTRAL_RAMP.map(hexToRgb)
        : ramps[color] ?? ramps[0];
    // Terrain, UI, and many world frames carry neither ownership nor accent pixels.
    // Reuse their plain atlas texture without allocating a per-variant copy.
    if (!applyEntityPalette(pixels.data, atlas.maskPalette, ramp, accent)) {
      this.colorCache.set(key, plain);
      return plain;
    }
    if (DEV_ASSERTS && ramp && containsMask(pixels.data, atlas.maskPalette)) {
      console.error(`[assets] ${atlas.name}:${frameName} retained raw player-mask pixels`);
    }

    const placed = this.placeColorFrame(`${color ?? 'n'}|${accent?.id ?? ''}`, atlas.density, pixels);
    const texture = new Texture({
      source: placed.page.source,
      frame: new Rectangle(placed.x, placed.y, w, h),
      defaultAnchor: fd.anchor,
    });
    this.colorCache.set(key, texture);
    return texture;
  }

  private placeColorFrame(
    variant: string,
    density: number,
    pixels: ImageData,
  ): { page: ColorPage; x: number; y: number } {
    if (pixels.width + COLOR_PAGE_PAD * 2 > COLOR_PAGE_SIZE || pixels.height + COLOR_PAGE_PAD * 2 > COLOR_PAGE_SIZE) {
      throw new Error(`player-colored frame ${pixels.width}x${pixels.height} exceeds ${COLOR_PAGE_SIZE}px page`);
    }
    const key = `${variant}@${density}`;
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

  private async loadHdOverrides(
    files: string[],
    hashes: Record<string, string> | undefined,
    store: ArtworkStore | null,
    signal: AbortSignal | undefined,
    onSettled: (usedFallback: boolean) => void,
  ): Promise<void> {
    if (files.length === 0 || signal?.aborted) return;
    // Bounded lanes, NOT Promise.all: every file used to start at once and race
    // one deadline against the whole 41 MB queue, so a cold cache lost most of
    // the set and the match refused to start (issue #132).
    const loaded = await mapWithConcurrency(files, HD_LOAD_CONCURRENCY, async (file) => {
      const atlas = await loadAtlasFile(
        `assets/hd/${file}`,
        'assets/hd/',
        file.replace(/\.json$/i, ''),
        signal,
        { store, hashes },
      );
      if (!signal?.aborted) onSettled(atlas.missing);
      return atlas;
    });
    // An aborted request must not let late HD work mutate the resolved set.
    // The completeness assertion in load() rejects the resulting partial set.
    if (signal?.aborted) return;
    // Promise.all preserves manifest order, so intentional later overrides
    // (the hand-finished Town Center) remain authoritative.
    for (const atlas of loaded) {
      if (atlas.missing) continue;
      for (const frameName of atlas.frameData.keys()) this.hdFrames.set(frameName, atlas);
    }
  }
}

export function settleAssetPack(
  progress: AssetLoadProgress,
  usedFallback: boolean,
): AssetLoadProgress {
  const canSettle = progress.completed < progress.total;
  return {
    completed: Math.min(progress.total, progress.completed + 1),
    total: progress.total,
    fallback: Math.min(
      progress.total,
      progress.fallback + (usedFallback && canSettle ? 1 : 0),
    ),
  };
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

function scopedAbortSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const onParentAbort = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Artwork pack timed out.')), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

/**
 * Run `work` over `items`, at most `limit` at a time, preserving input order in
 * the results. Workers pull from a shared cursor, so a slow item delays only
 * itself and one lane rather than stalling a whole batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const lanes = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  await Promise.all(Array.from({ length: lanes }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await work(items[index]!, index);
    }
  }));
  return results;
}

/** Run one abort-aware asset operation with a deadline and a safe fallback. */
export async function boundedAssetLoad<T>(
  start: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  timeoutMs: number,
  parentSignal?: AbortSignal,
  attempts = 1,
): Promise<T> {
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    // A caller that gave up (or a torn-down match) must not be retried into.
    if (parentSignal?.aborted) return fallback;
    const scoped = scopedAbortSignal(parentSignal, timeoutMs);
    try {
      return await start(scoped.signal);
    } catch {
      // Fall through: each attempt gets its own full deadline.
    } finally {
      scoped.dispose();
    }
  }
  return fallback;
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    const cleanup = (): void => {
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onLoad = (): void => {
      cleanup();
      resolve(image);
    };
    const onError = (): void => {
      cleanup();
      reject(new Error(`Could not load ${url}`));
    };
    const onAbort = (): void => {
      cleanup();
      image.removeAttribute('src');
      reject(signal.reason instanceof Error ? signal.reason : new Error(`Loading ${url} was cancelled.`));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

const HD_MANIFEST_URL = 'assets/hd/manifest.json';

/**
 * The manifest is the version anchor of the whole cached HD set, so it must
 * never itself be served stale: 'no-cache' forces a conditional revalidation
 * even under permissive hosting headers. Exported for tests.
 */
export async function loadHdManifest(store: ArtworkStore | null): Promise<HdManifest> {
  return boundedAssetLoad(async (signal) => {
    try {
      const response = await fetch(HD_MANIFEST_URL, { signal, cache: 'no-cache' });
      // Only a definitive "not here" may erase the cached set and report no
      // HD art. Any other failed status (5xx, 429) is a host hiccup: treat it
      // like a network failure so a complete cached set can still boot.
      if (response.status === 404 || response.status === 410) {
        await store?.clear(signal);
        return { atlases: [] };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const copy = response.clone();
      const manifest = parseHdManifest(await response.json() as unknown);
      // Written through only once the body proved to be JSON, so a corrupt
      // transfer can never become the offline fallback.
      await store?.writeThrough(HD_MANIFEST_URL, copy, signal);
      return manifest;
    } catch (error) {
      // Revalidation failed (offline, flaky link): the last stored manifest
      // still names a complete cached set, so the match can boot from it.
      const cached = await store?.readFallback(HD_MANIFEST_URL, signal);
      if (!cached) throw error;
      return parseHdManifest(await cached.json() as unknown);
    }
  }, { atlases: [] }, HD_MANIFEST_TIMEOUT_MS);
}

interface AtlasCacheSource {
  store: ArtworkStore | null;
  hashes?: Record<string, string>;
}

function pinnedHash(
  file: string,
  cached: AtlasCacheSource | undefined,
): { store: ArtworkStore; hash: string } | null {
  const hash = cached?.hashes?.[file];
  return cached?.store && hash ? { store: cached.store, hash } : null;
}

async function fetchAtlasResource(
  url: string,
  file: string,
  cached: AtlasCacheSource | undefined,
  signal: AbortSignal,
): Promise<Response> {
  const pin = pinnedHash(file, cached);
  return pin ? pin.store.fetchVersioned(url, pin.hash, signal) : fetch(url, { signal });
}

async function loadAtlasImage(
  url: string,
  file: string,
  cached: AtlasCacheSource | undefined,
  signal: AbortSignal,
): Promise<HTMLImageElement> {
  const pin = pinnedHash(file, cached);
  if (!pin) return loadImage(url, signal);
  const response = await pin.store.fetchVersioned(url, pin.hash, signal);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  // Decode through the same <img> path as the uncached route so texture
  // memory behavior is identical; only the bytes' origin differs.
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    return await loadImage(objectUrl, signal);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadAtlasFile(
  jsonUrl: string,
  imageBase: string,
  fallbackName = jsonUrl,
  parentSignal?: AbortSignal,
  cached?: AtlasCacheSource,
): Promise<Atlas> {
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
  return boundedAssetLoad(async (signal) => {
    const jsonFile = jsonUrl.slice(jsonUrl.lastIndexOf('/') + 1);
    const res = await fetchAtlasResource(jsonUrl, jsonFile, cached, signal);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as AtlasJson;
    if (!json || typeof json !== 'object' || !json.frames) throw new Error('bad atlas json');
    // A 0-frame atlas is an assetgen stub: treat as missing so mock frames kick in.
    if (Object.keys(json.frames).length === 0) throw new Error('empty atlas (stub)');
    const imageFile = json.meta?.image ?? `${fallbackName}.png`;
    const image = await loadAtlasImage(`${imageBase}${imageFile}`, imageFile, cached, signal);

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
    return atlas;
  }, atlas, ATLAS_LOAD_TIMEOUT_MS, parentSignal, ATLAS_LOAD_ATTEMPTS);
}

export async function loadAssets(options: AssetLoadOptions = {}): Promise<GameAssets> {
  const assets = new GameAssets();
  await assets.load(options);
  return assets;
}
