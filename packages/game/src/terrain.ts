// Chunked terrain layer: 16x16-tile chunks baked to RenderTextures, with
// per-tile variants and baked edge-transition frames per ASSET_CONTRACT §naming
// (`terr/<hi>_<lo>/<edge>`). Only dirty chunks rebake; offscreen chunks are
// LRU-evicted to bound GPU memory.

import { Container, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import type { GameMap } from '@bf/sim/types';
import { HALF_H, HALF_W } from './camera';
import type { GameAssets } from './assets';

export const CHUNK_TILES = 16;
const MAX_BAKED_CHUNKS = 30;

/**
 * Terrain priority (high bleeds over low) — ART_BIBLE §3.2 order, extended with
 * the sim-only terrains exactly as the generated terrain.json transition pairs
 * imply: cliff > road > farmland > (forest) > snow > grass > dirt > sand > shallows > water.
 */
const TERRAIN_PRIORITY: Record<string, number> = {
  cliff: 9, road: 8, farmland: 7, forest: 6, snow: 5,
  grass: 4, dirt: 3, sand: 2, shallows: 1, water: 0,
};

interface Chunk {
  cx: number;
  cy: number;
  rt: RenderTexture;
  sprite: Sprite;
  lastUsed: number;
}

function chunkKey(cx: number, cy: number): number {
  return cy * 1024 + cx;
}

export class TerrainLayer {
  readonly container = new Container();
  private chunks = new Map<number, Chunk>();
  private dirty = new Set<number>();
  private frame = 0;
  private variantCounts = new Map<string, number>();
  private chunksX: number;
  private chunksY: number;

  constructor(
    private renderer: Renderer,
    private assets: GameAssets,
    private map: GameMap,
  ) {
    this.chunksX = Math.ceil(map.width / CHUNK_TILES);
    this.chunksY = Math.ceil(map.height / CHUNK_TILES);
  }

  /** Mark a tile's chunk (and boundary neighbors) for rebake. */
  markTileDirty(tileX: number, tileY: number): void {
    const cx = Math.floor(tileX / CHUNK_TILES);
    const cy = Math.floor(tileY / CHUNK_TILES);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < this.chunksX && ny < this.chunksY) {
          // Only boundary tiles affect neighbors, but rebake is cheap and rare.
          if (dx === 0 && dy === 0) this.dirty.add(chunkKey(nx, ny));
          else if (
            tileX % CHUNK_TILES === (dx === 1 ? CHUNK_TILES - 1 : dx === -1 ? 0 : tileX % CHUNK_TILES) &&
            tileY % CHUNK_TILES === (dy === 1 ? CHUNK_TILES - 1 : dy === -1 ? 0 : tileY % CHUNK_TILES)
          ) {
            this.dirty.add(chunkKey(nx, ny));
          }
        }
      }
    }
  }

  /** Ensure chunks intersecting the world-view rect exist/are fresh; cull + evict others. */
  update(view: { x0: number; y0: number; x1: number; y1: number }): void {
    this.frame++;
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const b = this.chunkBounds(cx, cy);
        const visible = b.x1 >= view.x0 && b.x0 <= view.x1 && b.y1 >= view.y0 && b.y0 <= view.y1;
        const key = chunkKey(cx, cy);
        let chunk = this.chunks.get(key);
        if (visible) {
          if (!chunk) {
            chunk = this.createChunk(cx, cy);
            this.chunks.set(key, chunk);
            this.bakeChunk(chunk);
          } else if (this.dirty.has(key)) {
            this.bakeChunk(chunk);
          }
          this.dirty.delete(key);
          chunk.sprite.visible = true;
          chunk.lastUsed = this.frame;
        } else if (chunk) {
          chunk.sprite.visible = false;
        }
      }
    }
    // LRU eviction
    if (this.chunks.size > MAX_BAKED_CHUNKS) {
      const sorted = [...this.chunks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      while (this.chunks.size > MAX_BAKED_CHUNKS) {
        const [key, chunk] = sorted.shift()!;
        if (chunk.lastUsed === this.frame) break; // everything left is visible
        this.container.removeChild(chunk.sprite);
        chunk.sprite.destroy();
        chunk.rt.destroy(true);
        this.chunks.delete(key);
      }
    }
  }

  destroy(): void {
    for (const chunk of this.chunks.values()) {
      chunk.sprite.destroy();
      chunk.rt.destroy(true);
    }
    this.chunks.clear();
    this.container.destroy({ children: true });
  }

  private chunkBounds(cx: number, cy: number): { x0: number; y0: number; x1: number; y1: number } {
    const x0t = cx * CHUNK_TILES;
    const y0t = cy * CHUNK_TILES;
    const x1t = Math.min(this.map.width, x0t + CHUNK_TILES);
    const y1t = Math.min(this.map.height, y0t + CHUNK_TILES);
    return {
      x0: (x0t - y1t) * HALF_W,
      y0: (x0t + y0t) * HALF_H,
      x1: (x1t - y0t) * HALF_W,
      y1: (x1t + y1t) * HALF_H,
    };
  }

  private createChunk(cx: number, cy: number): Chunk {
    const b = this.chunkBounds(cx, cy);
    // Terrain is baked at 2x so HD material detail survives the chunk cache and
    // remains visible at camera zoom 2/3 instead of being flattened to 1x first.
    const rt = RenderTexture.create({
      width: Math.ceil(b.x1 - b.x0),
      height: Math.ceil(b.y1 - b.y0),
      resolution: 2,
    });
    rt.source.scaleMode = 'linear';
    const sprite = new Sprite(rt);
    sprite.position.set(b.x0, b.y0);
    this.container.addChild(sprite);
    return { cx, cy, rt, sprite, lastUsed: this.frame };
  }

  private terrainAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return null;
    return this.map.terrainIds[this.map.terrain[y * this.map.width + x]] ?? null;
  }

  private variantCount(terrainId: string): number {
    let n = this.variantCounts.get(terrainId);
    if (n === undefined) {
      n = 0;
      while (n < 8 && this.assets.tryResolve(`terr/${terrainId}/${n}`)) n++;
      this.variantCounts.set(terrainId, n);
    }
    return n;
  }

  private bakeChunk(chunk: Chunk): void {
    const b = this.chunkBounds(chunk.cx, chunk.cy);
    const temp = new Container();
    const x0t = chunk.cx * CHUNK_TILES;
    const y0t = chunk.cy * CHUNK_TILES;
    const x1t = Math.min(this.map.width, x0t + CHUNK_TILES);
    const y1t = Math.min(this.map.height, y0t + CHUNK_TILES);

    for (let ty = y0t; ty < y1t; ty++) {
      for (let tx = x0t; tx < x1t; tx++) {
        const terr = this.terrainAt(tx, ty);
        if (!terr) continue;
        // tile diamond center in world coords, then chunk-local
        const cxw = (tx - ty) * HALF_W;
        const cyw = (tx + ty + 1) * HALF_H;
        const lx = cxw - b.x0;
        const ly = cyw - b.y0;

        const variants = this.variantCount(terr);
        const variant = variants > 0 ? (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) >>> 0 : 0;
        const frame = this.assets.resolveFrame(`terr/${terr}/${variants > 0 ? variant % variants : 0}`);
        const spr = new Sprite(frame.texture);
        spr.anchor.set(frame.anchorX, frame.anchorY);
        spr.scale.set(frame.renderScale);
        spr.position.set(lx, ly);
        temp.addChild(spr);

        // Edge transitions: higher-priority neighbors bleed a fringe into this tile.
        const myPrio = TERRAIN_PRIORITY[terr] ?? 1;
        const neighbors: Array<[number, number, string]> = [
          [tx, ty - 1, 'ne'],
          [tx + 1, ty, 'se'],
          [tx, ty + 1, 'sw'],
          [tx - 1, ty, 'nw'],
        ];
        for (const [nx, ny, edge] of neighbors) {
          const nTerr = this.terrainAt(nx, ny);
          if (!nTerr || nTerr === terr) continue;
          if ((TERRAIN_PRIORITY[nTerr] ?? 1) <= myPrio) continue;
          const trans = this.assets.tryResolve(`terr/${nTerr}_${terr}/${edge}`);
          if (!trans) continue;
          const tspr = new Sprite(trans.texture);
          tspr.anchor.set(trans.anchorX, trans.anchorY);
          tspr.scale.set(trans.renderScale);
          tspr.position.set(lx, ly);
          temp.addChild(tspr);
        }
      }
    }

    this.renderer.render({ container: temp, target: chunk.rt, clear: true });
    temp.destroy({ children: true, texture: false });
  }
}
