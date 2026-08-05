// Isometric camera: world<->screen transforms (ASSET_CONTRACT geometry), pan inertia,
// integer zoom steps 1x/2x/3x, map-bounds clamping. Pure module — no DOM, no Pixi
// (game.ts applies the transform to the Pixi container).

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = 32;
export const HALF_H = 16;

export const ZOOM_STEPS = [1, 2, 3] as const;

export interface Vec2 { x: number; y: number }

/** Tile-corner space -> world px (zoom-1 screen space). sx=(x-y)*32, sy=(x+y)*16. */
export function tileToWorld(tx: number, ty: number): Vec2 {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

/** World px -> tile-corner space (fractional). Exact inverse of tileToWorld. */
export function worldToTile(wx: number, wy: number): Vec2 {
  return { x: wx / TILE_W + wy / TILE_H, y: wy / TILE_H - wx / TILE_W };
}

export interface CameraTransform { zoom: number; x: number; y: number }

const INERTIA_DAMPING = 0.0025; // exponential decay factor per ms
const INERTIA_MIN_SPEED = 0.02; // px/ms below which inertia stops

export class Camera {
  /** World-space point at the viewport center. */
  x = 0;
  y = 0;
  zoom: number = 1;
  viewW = 800;
  viewH = 600;

  private velX = 0; // world px per ms (inertia)
  private velY = 0;
  private minX = 0;
  private maxX = 0;
  private minY = 0;
  private maxY = 0;

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  /** Clamp bounds from map size in tiles (iso diamond bounding box). */
  setMapBounds(widthTiles: number, heightTiles: number): void {
    this.minX = -heightTiles * HALF_W;
    this.maxX = widthTiles * HALF_W;
    this.minY = 0;
    this.maxY = (widthTiles + heightTiles) * HALF_H;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToTile(sx: number, sy: number): Vec2 {
    const w = this.screenToWorld(sx, sy);
    return worldToTile(w.x, w.y);
  }

  /** Pan by a screen-space delta (drag follows the finger 1:1). Kills inertia. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.velX = 0;
    this.velY = 0;
    this.clamp();
  }

  /** Continuous pan in screen px/ms (keyboard arrows). */
  panVelocity(dxScreenPerMs: number, dyScreenPerMs: number, dtMs: number): void {
    this.panBy(-dxScreenPerMs * dtMs, -dyScreenPerMs * dtMs);
  }

  /** Give the camera a fling velocity (screen px/ms at release). */
  fling(vxScreenPerMs: number, vyScreenPerMs: number): void {
    this.velX = -vxScreenPerMs / this.zoom;
    this.velY = -vyScreenPerMs / this.zoom;
  }

  stopInertia(): void {
    this.velX = 0;
    this.velY = 0;
  }

  centerOnTile(tx: number, ty: number): void {
    const w = tileToWorld(tx, ty);
    this.x = w.x;
    this.y = w.y;
    this.stopInertia();
    this.clamp();
  }

  /** Step zoom by +-1 keeping the world point under (anchorSx, anchorSy) fixed. */
  zoomStep(delta: number, anchorSx?: number, anchorSy?: number): boolean {
    const idx = ZOOM_STEPS.indexOf(this.zoom as 1 | 2 | 3);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + delta))];
    // A wheel still emits events after reaching a limit. Make those events a
    // strict camera no-op so no anchor/clamp/transform work can cause a flash.
    if (next === this.zoom) return false;
    const ax = anchorSx ?? this.viewW / 2;
    const ay = anchorSy ?? this.viewH / 2;
    const before = this.screenToWorld(ax, ay);
    this.zoom = next;
    const after = this.screenToWorld(ax, ay);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
    return true;
  }

  /** Advance inertia; call once per frame with elapsed ms. */
  update(dtMs: number): void {
    if (this.velX !== 0 || this.velY !== 0) {
      this.x += this.velX * dtMs;
      this.y += this.velY * dtMs;
      const decay = Math.exp(-INERTIA_DAMPING * dtMs);
      this.velX *= decay;
      this.velY *= decay;
      if (Math.hypot(this.velX, this.velY) < INERTIA_MIN_SPEED) this.stopInertia();
      this.clamp();
    }
  }

  /** Transform for the world container: position = view/2 - cam*zoom (integer-snapped for crisp NN). */
  getTransform(): CameraTransform {
    return {
      zoom: this.zoom,
      x: Math.round(this.viewW / 2 - this.x * this.zoom),
      y: Math.round(this.viewH / 2 - this.y * this.zoom),
    };
  }

  /** Visible world-space rect {x0,y0,x1,y1} (for chunk culling). */
  getWorldView(): { x0: number; y0: number; x1: number; y1: number } {
    const hw = this.viewW / 2 / this.zoom;
    const hh = this.viewH / 2 / this.zoom;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }

  private clamp(): void {
    if (this.maxX < this.minX) return; // bounds unset
    this.x = Math.min(this.maxX, Math.max(this.minX, this.x));
    this.y = Math.min(this.maxY, Math.max(this.minY, this.y));
  }
}
