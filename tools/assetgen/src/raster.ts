// RGBA pixel buffer + the ART_BIBLE §7 primitive set: px/rect/ellipse/poly/line,
// 2-tone ordered dither, 1px inside-outline trace, drop-shadow ellipse, hflip,
// alpha blit. All integer coordinates; alpha is 0 or 255 except the black@88 shadow.

import type { RGB } from './palette.ts';
import { PALETTE, SHADOW_RGBA } from './palette.ts';

export type DitherLevel = 50 | 25;

export class Raster {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, row-major

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  clone(): Raster {
    const r = new Raster(this.width, this.height);
    r.data.set(this.data);
    return r;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // NOTE: all pixel accessors round their coordinates — callers may pass
  // fractional values from iso-axis projections (fractional typed-array
  // indices would silently no-op). Rounding integers is a no-op, so
  // integer-authored art is unaffected.
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inBounds(x, y)) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = (Math.round(y) * this.width + Math.round(x)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alphaAt(x: number, y: number): number {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inBounds(x, y)) return 0;
    return this.data[(y * this.width + x) * 4 + 3];
  }

  clear(x: number, y: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inBounds(x, y)) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = this.data[i + 1] = this.data[i + 2] = this.data[i + 3] = 0;
  }

  fill(c: RGB, a = 255): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.set(x, y, c, a);
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
  }

  /** Filled ellipse, scanline rasterized. */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = (y - cy) / ry;
      const d = 1 - t * t;
      if (d < 0) continue;
      const hw = rx * Math.sqrt(d);
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) this.set(x, y, c, a);
    }
  }

  /** Membership test matching fillEllipse coverage. */
  static inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
    const t = (y - cy) / ry;
    const d = 1 - t * t;
    if (d < 0) return false;
    const hw = rx * Math.sqrt(d);
    return x >= Math.round(cx - hw) && x <= Math.round(cx + hw);
  }

  /** Filled polygon (even-odd scanline). Points are [x, y] pairs. */
  fillPoly(points: ReadonlyArray<readonly [number, number]>, c: RGB, a = 255): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of points) {
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if (y0 === y1) continue;
        const [ax, ay, bx, by] = y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0];
        if (y + 0.5 >= ay && y + 0.5 < by) xs.push(ax + ((y + 0.5 - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c, a);
      }
      // guarantee at least 1px on degenerate rows so thin polys don't vanish
      if (xs.length >= 2 && Math.round(xs[0]) === Math.round(xs[xs.length - 1])) {
        this.set(Math.round(xs[0]), y, c, a);
      }
    }
  }

  /** Bresenham line, 1px. Endpoints are rounded — fractional inputs would never terminate. */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 255): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, c, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Ordered-dither position test (ART_BIBLE §7.4). */
  static ditherOn(x: number, y: number, level: DitherLevel): boolean {
    return level === 50 ? ((x + y) & 1) === 0 : x % 2 === 0 && y % 2 === 0;
  }

  /** 2-tone ordered dither fill over a rect: cA at dither-on positions, cB elsewhere. */
  ditherFillRect(x: number, y: number, w: number, h: number, cA: RGB, cB: RGB, level: DitherLevel): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.set(xx, yy, Raster.ditherOn(xx, yy, level) ? cA : cB);
      }
    }
  }

  /** Paint c at dither-on positions where pred(x, y) holds (existing pixels elsewhere untouched). */
  ditherWhere(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    pred: (x: number, y: number) => boolean,
    c: RGB,
    level: DitherLevel,
  ): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Raster.ditherOn(x, y, level) && pred(x, y)) this.set(x, y, c);
      }
    }
  }

  /** Paint c wherever pred holds (full coverage helper for shading regions). */
  paintWhere(pred: (x: number, y: number) => boolean, c: RGB): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (pred(x, y)) this.set(x, y, c);
      }
    }
  }

  /**
   * ART_BIBLE §7.2 outline pass: every fully-opaque pixel with ≥1 4-neighbor of
   * alpha < 255 (shadow counts as transparent) is recolored to `outline`.
   * Shadow pixels themselves are never touched.
   */
  outlinePass(c: RGB = PALETTE.outline): void {
    const src = this.clone();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (src.alphaAt(x, y) !== 255) continue;
        if (
          src.alphaAt(x - 1, y) < 255 ||
          src.alphaAt(x + 1, y) < 255 ||
          src.alphaAt(x, y - 1) < 255 ||
          src.alphaAt(x, y + 1) < 255
        ) {
          this.set(x, y, c);
        }
      }
    }
  }

  /** Drop-shadow ellipse: black at alpha 88, painted only over fully transparent pixels. */
  dropShadow(cx: number, cy: number, rx: number, ry: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const t = (y - cy) / ry;
      const d = 1 - t * t;
      if (d < 0) continue;
      const hw = rx * Math.sqrt(d);
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        if (this.alphaAt(x, y) === 0) {
          this.set(x, y, [SHADOW_RGBA[0], SHADOW_RGBA[1], SHADOW_RGBA[2]], SHADOW_RGBA[3]);
        }
      }
    }
  }

  /** Horizontal mirror → new Raster (used by the renderer convention docs; and QA sheets). */
  hflip(): Raster {
    const out = new Raster(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        const j = (y * this.width + (this.width - 1 - x)) * 4;
        out.data[j] = this.data[i];
        out.data[j + 1] = this.data[i + 1];
        out.data[j + 2] = this.data[i + 2];
        out.data[j + 3] = this.data[i + 3];
      }
    }
    return out;
  }

  /** src-over alpha blit of src at (dx, dy). Integer compositing. */
  blit(src: Raster, dx: number, dy: number): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const sa = src.data[si + 3];
        if (sa === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (!this.inBounds(tx, ty)) continue;
        const di = (ty * this.width + tx) * 4;
        if (sa === 255) {
          this.data[di] = src.data[si];
          this.data[di + 1] = src.data[si + 1];
          this.data[di + 2] = src.data[si + 2];
          this.data[di + 3] = 255;
        } else {
          const da = this.data[di + 3];
          const outA = sa + Math.round((da * (255 - sa)) / 255);
          if (outA === 0) continue;
          for (let ch = 0; ch < 3; ch++) {
            const sc = src.data[si + ch];
            const dc = this.data[di + ch];
            this.data[di + ch] = Math.round(
              (sc * sa + Math.round((dc * da * (255 - sa)) / 255)) / outA,
            );
          }
          this.data[di + 3] = outA;
        }
      }
    }
  }

  /** Copy-blit (no blending) — used by the atlas packer so shadow alpha stays exact. */
  copyInto(dst: Raster, dx: number, dy: number): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const si = (y * this.width + x) * 4;
        if (this.data[si + 3] === 0) continue;
        const di = ((dy + y) * dst.width + (dx + x)) * 4;
        dst.data[di] = this.data[si];
        dst.data[di + 1] = this.data[si + 1];
        dst.data[di + 2] = this.data[si + 2];
        dst.data[di + 3] = this.data[si + 3];
      }
    }
  }

  /** Nearest-neighbor integer upscale (contact sheets). */
  scale(factor: number): Raster {
    const out = new Raster(this.width * factor, this.height * factor);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const si = ((y / factor | 0) * this.width + (x / factor | 0)) * 4;
        const di = (y * out.width + x) * 4;
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    }
    return out;
  }

  countOpaque(): number {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i] === 255) n++;
    return n;
  }
}

/**
 * Scanline extent of a 2:1 iso diamond of size w×h (w = 2h) at row y:
 * returns [x0, x1) or null when the row is outside. Exact 64×32 coverage.
 */
export function diamondRow(y: number, w: number, h: number): [number, number] | null {
  if (y < 0 || y >= h) return null;
  const r = y < h / 2 ? y : h - 1 - y;
  const halfW = w / h; // px gained per row (2 for 2:1 diamonds)
  const x0 = w / 2 - halfW * (r + 1);
  return [Math.round(x0), Math.round(w - x0)];
}

export function insideDiamond(x: number, y: number, w: number, h: number): boolean {
  const row = diamondRow(y, w, h);
  return row !== null && x >= row[0] && x < row[1];
}
