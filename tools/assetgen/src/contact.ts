// QA contact sheets: labeled frame grids on the game's grass background,
// composed at 1× and 2× for the ART_BIBLE §9 eyeball checks; plus the
// contract-mandated apps/web/public/assets/contact-sheet.png (checkerboard +
// §9.5 backdrop strips + 1-bit silhouette lineup).

import { Raster } from './raster.ts';
import { PALETTE } from './palette.ts';
import type { RGB } from './palette.ts';
import { drawText } from './font.ts';
import type { FrameDef } from './atlas.ts';

const LABEL_H = 7;
const PAD = 2;

/** Row-packed sheet: frames sorted by height, labeled, on a solid background. */
export function composeSheet(frames: FrameDef[], bg: RGB, sheetW = 1024): Raster {
  const sorted = [...frames].sort(
    (a, b) => b.raster.height - a.raster.height || (a.name < b.name ? -1 : 1),
  );
  // first pass: measure
  const cells: Array<{ f: FrameDef; x: number; y: number }> = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  for (const f of sorted) {
    const w = Math.max(f.raster.width, 18) + PAD;
    if (x + w > sheetW) {
      x = PAD;
      y += rowH + LABEL_H + PAD;
      rowH = 0;
    }
    cells.push({ f, x, y });
    x += w;
    rowH = Math.max(rowH, f.raster.height);
  }
  const sheet = new Raster(sheetW, y + rowH + LABEL_H + PAD);
  sheet.fill(bg);
  let curRowY = -1;
  let curRowH = 0;
  for (const c of cells) {
    if (c.y !== curRowY) {
      curRowY = c.y;
      curRowH = 0;
      for (const c2 of cells) if (c2.y === c.y) curRowH = Math.max(curRowH, c2.f.raster.height);
    }
    // bottom-align sprites within the row (feet lines match)
    sheet.blit(c.f.raster, c.x, c.y + curRowH - c.f.raster.height);
    drawText(sheet, c.x, c.y + curRowH + 1, shortLabel(c.f.name), PALETTE.outline, Math.max(c.f.raster.width, 18));
  }
  return sheet;
}

function shortLabel(name: string): string {
  return name.replace(/^(terr|obj|unit|bld|icon|ui)\//, '').replace(/\//g, '.');
}

function checkerboard(w: number, h: number): Raster {
  const r = new Raster(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      r.set(x, y, ((x >> 3) + (y >> 3)) % 2 === 0 ? PALETTE.stoneLight : PALETTE.stoneBase);
    }
  }
  return r;
}

/** The §9 contact sheet: checkerboard grid + 4 backdrop strips + silhouette lineup. */
export function composeMasterSheet(
  all: FrameDef[],
  strips: FrameDef[],
  silhouettes: FrameDef[],
): Raster {
  const W = 1024;
  const grid = composeSheet(all, PALETTE.grassBase, W);
  const board = checkerboard(W, grid.height);
  board.blit(grid.scale(1), 0, 0); // grass-backed grid over checker margin
  const parts: Raster[] = [board];

  // §9.5 backdrop strips
  const stripColors: Array<[string, RGB]> = [
    ['grass', PALETTE.grassBase],
    ['dirt', PALETTE.dirtBase],
    ['forest floor', PALETTE.grassShadow],
    ['road', PALETTE.dirtPale],
  ];
  for (const [label, c] of stripColors) {
    const maxH = Math.max(12, ...strips.map((f) => f.raster.height));
    const strip = new Raster(W, maxH + LABEL_H + PAD * 2);
    strip.fill(c);
    let x = 40;
    for (const f of strips) {
      strip.blit(f.raster, x, PAD + maxH - f.raster.height);
      x += f.raster.width + 6;
      if (x > W - 48) break;
    }
    drawText(strip, 2, 2, label, PALETTE.highlight);
    parts.push(strip);
  }

  // 1-bit silhouette lineup (§9.3)
  {
    const maxH = Math.max(12, ...silhouettes.map((f) => f.raster.height));
    const strip = new Raster(W, maxH + LABEL_H + PAD * 2);
    strip.fill(PALETTE.highlight);
    let x = 40;
    for (const f of silhouettes) {
      const sil = new Raster(f.raster.width, f.raster.height);
      for (let y = 0; y < f.raster.height; y++) {
        for (let xx = 0; xx < f.raster.width; xx++) {
          if (f.raster.alphaAt(xx, y) === 255) sil.set(xx, y, PALETTE.outline);
        }
      }
      strip.blit(sil, x, PAD + maxH - sil.height);
      x += sil.width + 6;
      if (x > W - 48) break;
    }
    drawText(strip, 2, 2, 'silhouettes', PALETTE.outline);
    parts.push(strip);
  }

  const total = parts.reduce((s, p) => s + p.height + 2, 0);
  const sheet = new Raster(W, total);
  let y = 0;
  for (const p of parts) {
    sheet.blit(p, 0, y);
    y += p.height + 2;
  }
  return sheet;
}
