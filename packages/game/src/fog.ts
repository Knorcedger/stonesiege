// Fog-of-war overlay: a low-res (1 px per tile) canvas texture mapped onto the
// iso plane with a linear matrix transform — a tile-space pixel square lands
// exactly on the tile's screen diamond. Updated only when the visibility grid
// changes. ART_BIBLE §8.4: unexplored = solid black, explored = 45% black,
// visible = clear.

import { Matrix, Sprite, Texture } from 'pixi.js';
import type { GameMap } from '@bf/sim/types';
import { HALF_H, HALF_W } from './camera';

const EXPLORED_ALPHA = Math.round(255 * 0.45);

/**
 * Visibility level of a tile for the fog owner: 0 unexplored, 1 explored, 2
 * visible. Off-map reads as unexplored; a match with no fog grid reads as fully
 * visible. Shared by every layer that must not draw what the player cannot see.
 */
export function tileVisibility(
  visibility: Uint8Array | null,
  map: GameMap,
  tx: number,
  ty: number,
): number {
  if (!visibility) return 2;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 0;
  return visibility[ty * map.width + tx];
}

export class FogLayer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private texture: Texture;
  private lastVis: Uint8Array | null = null;

  constructor(map: GameMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = map.width;
    this.canvas.height = map.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.imageData = this.ctx.createImageData(map.width, map.height);
    // start fully black (unexplored)
    for (let i = 0; i < this.imageData.data.length; i += 4) this.imageData.data[i + 3] = 255;
    this.ctx.putImageData(this.imageData, 0, 0);

    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'linear'; // soft fog edges
    this.sprite = new Sprite(this.texture);
    // tile-space -> world px: (tx,ty) -> ((tx-ty)*32, (tx+ty)*16)
    this.sprite.setFromMatrix(new Matrix(HALF_W, HALF_H, -HALF_W, HALF_H, 0, 0));
  }

  /** The tile-space fog canvas (reused by the minimap). */
  get fogCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Redraw if the visibility grid changed. Returns true when it did. */
  update(visibility: Uint8Array): boolean {
    if (this.lastVis && bytesEqual(this.lastVis, visibility)) return false;
    this.lastVis = Uint8Array.from(visibility);
    const data = this.imageData.data;
    for (let i = 0; i < visibility.length; i++) {
      const v = visibility[i];
      data[i * 4 + 3] = v === 2 ? 0 : v === 1 ? EXPLORED_ALPHA : 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
    return true;
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
