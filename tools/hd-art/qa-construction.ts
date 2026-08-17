// Visual QA for the shipping HD building lifecycle.
// Run: node tools/hd-art/qa-construction.ts
// Writes: .qa/art/hd-building-construction.png

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { buildings } from '../../packages/data/src/buildings.ts';
import { drawText } from '../assetgen/src/font.ts';
import { PALETTE } from '../assetgen/src/palette.ts';
import { writePng } from '../assetgen/src/png.ts';
import { Raster } from '../assetgen/src/raster.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HD = join(ROOT, 'apps/web/public/assets/hd');
const OUT = join(ROOT, '.qa/art/hd-building-construction.png');
const manifest = JSON.parse(readFileSync(join(HD, 'manifest.json'), 'utf8')) as {
  atlases: string[];
};

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
}

interface FrameSource {
  frame: AtlasFrame;
  image: string;
}

const frameSources = new Map<string, FrameSource>();
for (const file of manifest.atlases) {
  const atlas = JSON.parse(readFileSync(join(HD, file), 'utf8')) as {
    frames: Record<string, AtlasFrame>;
    meta: { image: string };
  };
  for (const [name, frame] of Object.entries(atlas.frames)) {
    frameSources.set(name, { frame, image: atlas.meta.image });
  }
}

const pngs = new Map<string, PNG>();
function frameRaster(name: string): Raster {
  const source = frameSources.get(name);
  if (!source) throw new Error(`missing HD frame: ${name}`);
  let png = pngs.get(source.image);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(HD, source.image)));
    pngs.set(source.image, png);
  }
  const box = source.frame.frame;
  const raster = new Raster(box.w, box.h);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const i = ((box.y + y) * png.width + box.x + x) * 4;
      const a = png.data[i + 3];
      if (a > 0) raster.set(x, y, [png.data[i], png.data[i + 1], png.data[i + 2]], a);
    }
  }
  return raster;
}

function fit(source: Raster, width: number, height: number): Raster {
  const scale = Math.min(width / source.width, height / source.height, 1);
  const outW = Math.max(1, Math.round(source.width * scale));
  const outH = Math.max(1, Math.round(source.height * scale));
  const out = new Raster(outW, outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(source.width - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(source.height - 1, Math.floor((y + 0.5) / scale));
      const [r, g, b, a] = source.get(sx, sy);
      if (a > 0) out.set(x, y, [r, g, b], a);
    }
  }
  return out;
}

const ids = Object.keys(buildings).sort();
const stages = ['construct0', 'construct1', 'construct2', 'done'] as const;
const CELL_W = 224;
const CELL_H = 170;
const LABEL_H = 12;
const HEADER_H = 16;
const sheet = new Raster(CELL_W * stages.length, HEADER_H + ids.length * (CELL_H + LABEL_H));
sheet.fill(PALETTE.grassBase);

stages.forEach((stage, column) => {
  drawText(sheet, column * CELL_W + 4, 5, stage, PALETTE.highlight, CELL_W - 8);
});

ids.forEach((id, row) => {
  const y = HEADER_H + row * (CELL_H + LABEL_H);
  stages.forEach((stage, column) => {
    const done = id === 'house'
      ? 'bld/house/dark/done'
      : id === 'townCenter'
        ? 'bld/townCenter/castle/done'
      : `bld/${id}/done`;
    const name = id === 'farm'
      ? stage === 'done' ? 'obj/farm/3' : 'obj/farm/0'
      : stage === 'done' ? done : `bld/${id}/${stage}`;
    const source = frameRaster(name);
    if (id === 'farm' && stage !== 'done') {
      const opacity = stage === 'construct0' ? 0.35 : stage === 'construct1' ? 0.57 : 0.78;
      for (let py = 0; py < source.height; py++) {
        for (let px = 0; px < source.width; px++) {
          const [r, g, b, a] = source.get(px, py);
          if (a > 0) source.set(px, py, [r, g, b], Math.round(a * opacity));
        }
      }
    }
    const sprite = fit(source, CELL_W - 8, CELL_H - 8);
    const x = column * CELL_W + Math.round((CELL_W - sprite.width) / 2);
    sheet.blit(sprite, x, y + CELL_H - sprite.height - 3);
    if (column > 0) sheet.fillRect(column * CELL_W, y, 1, CELL_H, PALETTE.grassShadow);
  });
  drawText(sheet, 4, y + CELL_H + 2, id, PALETTE.outline, CELL_W - 8);
  sheet.fillRect(0, y + CELL_H + LABEL_H - 1, sheet.width, 1, PALETTE.grassShadow);
});

mkdirSync(dirname(OUT), { recursive: true });
writePng(OUT, sheet);
console.log(`wrote ${OUT}`);
