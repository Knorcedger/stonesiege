// HUD chrome (ART_BIBLE §8.1): wood panel + parchment 9-slices, command-card
// buttons, health bar, selection rings per footprint, minimap frame, rally flag.

import { Raster } from './raster.ts';
import { PALETTE, PLAYER_RAMPS, hexToRgb } from './palette.ts';
import type { FrameDef } from './atlas.ts';

export interface UiResult {
  frames: FrameDef[];
  nineSlice: Record<string, [number, number, number, number]>;
}

const PANEL_INSET = 8;
const PARCH_INSET = 4;

function woodPanel(w: number, h: number): Raster {
  const r = new Raster(w, h);
  r.fillRect(0, 0, w, h, PALETTE.uiWoodDark);
  // plank lines every 12px
  for (let y = 12; y < h - 3; y += 12) r.fillRect(3, y, w - 6, 1, PALETTE.uiWoodBase);
  // border: outline outermost, then goldDark, then uiWoodLight bevel
  strokeRect(r, 0, 0, w, h, PALETTE.outline);
  strokeRect(r, 1, 1, w - 2, h - 2, PALETTE.goldDark);
  strokeRect(r, 2, 2, w - 4, h - 4, PALETTE.uiWoodLight);
  // 3×3 gold rivet dots in the corners
  for (const [cx, cy] of [
    [4, 4],
    [w - 7, 4],
    [4, h - 7],
    [w - 7, h - 7],
  ] as const) {
    r.fillRect(cx, cy, 3, 3, PALETTE.goldDark);
    r.set(cx + 1, cy + 1, PALETTE.goldBase);
    r.set(cx, cy, PALETTE.goldShine);
  }
  return r;
}

function parchment(w: number, h: number): Raster {
  const r = new Raster(w, h);
  r.fillRect(0, 0, w, h, PALETTE.parchBase);
  strokeRect(r, 0, 0, w, h, PALETTE.parchDark);
  // top-left inner bevel
  r.fillRect(1, 1, w - 2, 1, PALETTE.parchLight);
  r.fillRect(1, 1, 1, h - 2, PALETTE.parchLight);
  return r;
}

function strokeRect(r: Raster, x: number, y: number, w: number, h: number, c: readonly [number, number, number]): void {
  r.fillRect(x, y, w, 1, c);
  r.fillRect(x, y + h - 1, w, 1, c);
  r.fillRect(x, y, 1, h, c);
  r.fillRect(x + w - 1, y, 1, h, c);
}

/** Cut a full image into the 9 slice sub-frames (tl t tr l c r bl b br). */
function slice9(base: Raster, prefix: string, inset: number, frames: FrameDef[]): void {
  const w = base.width;
  const h = base.height;
  const xs = [0, inset, w - inset];
  const ws = [inset, w - 2 * inset, inset];
  const ys = [0, inset, h - inset];
  const hs = [inset, h - 2 * inset, inset];
  const names = [
    ['tl', 't', 'tr'],
    ['l', 'c', 'r'],
    ['bl', 'b', 'br'],
  ];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const part = new Raster(ws[col], hs[row]);
      for (let y = 0; y < hs[row]; y++) {
        for (let x = 0; x < ws[col]; x++) {
          const [r, g, b, a] = base.get(xs[col] + x, ys[row] + y);
          part.set(x, y, [r, g, b], a);
        }
      }
      frames.push({ name: `${prefix}/${names[row][col]}`, raster: part, anchor: { x: 0, y: 0 } });
    }
  }
}

function button(state: 'idle' | 'pressed' | 'disabled' | 'active'): Raster {
  const r = new Raster(44, 44);
  const fill = state === 'disabled' ? PALETTE.uiWoodDark : PALETTE.uiWoodBase;
  r.fillRect(0, 0, 44, 44, fill);
  // faint plank hint
  r.fillRect(2, 21, 40, 1, state === 'disabled' ? PALETTE.uiWoodDark : PALETTE.uiWoodDark);
  const border =
    state === 'pressed' ? PALETTE.goldBase :
    state === 'active' ? PALETTE.goldShine :
    state === 'disabled' ? PALETTE.uiWoodBase : PALETTE.goldDark;
  strokeRect(r, 0, 0, 44, 44, PALETTE.outline);
  strokeRect(r, 1, 1, 42, 42, border);
  if (state === 'pressed') {
    // top+left inner rows darkened
    r.fillRect(2, 2, 40, 1, PALETTE.outline);
    r.fillRect(2, 2, 1, 40, PALETTE.outline);
  }
  if (state === 'active') {
    // 4 corner ticks
    for (const [x, y, dx, dy] of [
      [3, 3, 1, 1],
      [40, 3, -1, 1],
      [3, 40, 1, -1],
      [40, 40, -1, -1],
    ] as const) {
      r.fillRect(x, y, dx * 3 === 3 ? 3 : 1, 1, PALETTE.goldShine);
      if (dx < 0) r.fillRect(x - 2, y, 3, 1, PALETTE.goldShine);
      r.fillRect(x, dy > 0 ? y : y - 2, 1, 3, PALETTE.goldShine);
    }
  }
  return r;
}

function healthBg(): Raster {
  const r = new Raster(26, 4);
  r.fillRect(0, 0, 26, 4, PALETTE.uiWoodDark);
  strokeRect(r, 0, 0, 26, 4, PALETTE.outline);
  return r;
}

/** Stretchable 2×2 fill segment: highlight top row + color (renderer scales horizontally). */
function healthFill(color: readonly [number, number, number]): Raster {
  const r = new Raster(2, 2);
  r.fillRect(0, 0, 2, 1, PALETTE.highlight);
  r.fillRect(0, 1, 2, 1, color);
  return r;
}

/** Building selection ring: 1px highlight diamond + 1px outline diamond 1px below. */
function footprintRing(size: number): Raster {
  const w = size * 64;
  const h = size * 32;
  const r = new Raster(w, h + 2);
  const pts: Array<readonly [number, number]> = [
    [w / 2, 0],
    [w - 1, h / 2],
    [w / 2, h - 1],
    [0, h / 2],
  ];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    r.line(x0, y0 + 2, x1, y1 + 2, PALETTE.outline); // depth ring below
    r.line(x0, y0 + 1, x1, y1 + 1, PALETTE.highlight);
  }
  return r;
}

/** Unit selection ring: highlight ellipse with an outline ellipse offset +1y beneath. */
function unitRing(rx: number, ry: number): Raster {
  const r = new Raster(rx * 2 + 2, ry * 2 + 4);
  const cx = rx + 1;
  const cy = ry + 1;
  ellipseOutline(r, cx, cy + 1, rx, ry, PALETTE.outline);
  ellipseOutline(r, cx, cy, rx, ry, PALETTE.highlight);
  return r;
}

function ellipseOutline(r: Raster, cx: number, cy: number, rx: number, ry: number, c: readonly [number, number, number]): void {
  let prev: [number, number] | null = null;
  for (let y = cy - ry; y <= cy + ry; y++) {
    const t = (y - cy) / ry;
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
    if (prev !== null) {
      // connect rows so the ring has no gaps
      for (let x = Math.min(prev[0], cx - hw); x <= Math.max(prev[0], cx - hw); x++) r.set(x, y, c);
      for (let x = Math.min(prev[1], cx + hw); x <= Math.max(prev[1], cx + hw); x++) r.set(x, y, c);
    } else {
      for (let x = cx - hw; x <= cx + hw; x++) r.set(x, y, c);
    }
    prev = [cx - hw, cx + hw];
    if (y === cy + ry) for (let x = cx - hw; x <= cx + hw; x++) r.set(x, y, c);
  }
}

function minimapFrame(): Raster {
  const size = 128;
  const r = new Raster(size, size);
  // wood border ring, center transparent (renderer draws the rotated-diamond map)
  const b = 8;
  r.fillRect(0, 0, size, b, PALETTE.uiWoodDark);
  r.fillRect(0, size - b, size, b, PALETTE.uiWoodDark);
  r.fillRect(0, 0, b, size, PALETTE.uiWoodDark);
  r.fillRect(size - b, 0, b, size, PALETTE.uiWoodDark);
  strokeRect(r, 0, 0, size, size, PALETTE.outline);
  strokeRect(r, 1, 1, size - 2, size - 2, PALETTE.goldDark);
  strokeRect(r, b - 1, b - 1, size - 2 * (b - 1), size - 2 * (b - 1), PALETTE.uiWoodLight);
  // gold corner caps
  for (const [cx, cy] of [
    [2, 2],
    [size - 7, 2],
    [2, size - 7],
    [size - 7, size - 7],
  ] as const) {
    r.fillRect(cx, cy, 5, 5, PALETTE.goldDark);
    r.fillRect(cx + 1, cy + 1, 3, 3, PALETTE.goldBase);
    r.set(cx + 1, cy + 1, PALETTE.goldShine);
  }
  return r;
}

function rallyFlag(): Raster {
  const r = new Raster(16, 24);
  r.dropShadow(6, 22, 4, 2);
  r.fillRect(5, 4, 1, 18, PALETTE.woodBase);
  r.set(5, 4, PALETTE.woodPale);
  // waving highlight-cloth flag
  r.fillPoly(
    [
      [6, 4],
      [14, 6],
      [12, 8],
      [14, 10],
      [6, 12],
    ],
    PALETTE.highlight,
  );
  r.fillRect(6, 11, 7, 1, PALETTE.parchDark);
  r.outlinePass();
  return r;
}

export function genUi(): UiResult {
  const frames: FrameDef[] = [];
  const nineSlice: Record<string, [number, number, number, number]> = {
    'ui/panel': [PANEL_INSET, PANEL_INSET, PANEL_INSET, PANEL_INSET],
    'ui/parchment': [PARCH_INSET, PARCH_INSET, PARCH_INSET, PARCH_INSET],
    'ui/minimap/frame': [10, 10, 10, 10],
  };

  const panel = woodPanel(48, 48);
  frames.push({ name: 'ui/panel', raster: panel, anchor: { x: 0, y: 0 } });
  slice9(panel, 'ui/panel', PANEL_INSET, frames);

  const parch = parchment(32, 32);
  frames.push({ name: 'ui/parchment', raster: parch, anchor: { x: 0, y: 0 } });
  slice9(parch, 'ui/parchment', PARCH_INSET, frames);

  for (const state of ['idle', 'pressed', 'disabled', 'active'] as const) {
    frames.push({ name: `ui/btn/${state}`, raster: button(state), anchor: { x: 0, y: 0 } });
  }

  // fills reuse the green/yellow/red player-ramp mids (ART_BIBLE §8.1)
  frames.push({ name: 'ui/hp/bg', raster: healthBg(), anchor: { x: 0, y: 0 } });
  frames.push({ name: 'ui/hp/green', raster: healthFill(hexToRgb(PLAYER_RAMPS[2].mid)), anchor: { x: 0, y: 0 } });
  frames.push({ name: 'ui/hp/yellow', raster: healthFill(hexToRgb(PLAYER_RAMPS[3].mid)), anchor: { x: 0, y: 0 } });
  frames.push({ name: 'ui/hp/red', raster: healthFill(hexToRgb(PLAYER_RAMPS[1].mid)), anchor: { x: 0, y: 0 } });

  for (let size = 1; size <= 5; size++) {
    const ring = footprintRing(size);
    frames.push({
      name: `ui/ring/${size}`,
      raster: ring,
      anchor: { x: ring.width / 2, y: ring.height / 2 },
    });
  }
  for (const [label, rx, ry] of [
    ['s', 10, 4],
    ['m', 13, 5],
    ['l', 18, 7],
  ] as const) {
    const ring = unitRing(rx, ry);
    frames.push({
      name: `ui/ring/unit/${label}`,
      raster: ring,
      anchor: { x: ring.width / 2, y: ring.height / 2 },
    });
  }

  frames.push({ name: 'ui/minimap/frame', raster: minimapFrame(), anchor: { x: 0, y: 0 } });
  frames.push({ name: 'ui/rally', raster: rallyFlag(), anchor: { x: 6, y: 22 } });

  return { frames, nineSlice };
}
