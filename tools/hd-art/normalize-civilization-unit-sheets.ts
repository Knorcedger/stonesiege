// Normalize generated civilization-unit sheets into an exact, leak-free 6x5
// grid. Image generation can visually arrange 30 subjects correctly while
// allowing a hoof, axe, or lance to cross the mathematical cell boundary. The
// HD atlas cutter cannot distinguish that fragment from the intended subject,
// so isolate the 30 dominant connected figures first and repack them with a
// stable foot anchor and explicit padding.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dirname, '../..');
const unitDir = join(root, 'art/hd/frames/units');
const SHEETS = ['housecarl', 'chevalier', 'mangudai', 'cataphract', 'mamluk'] as const;
const COLUMNS = 6;
const ROWS = 5;
const CELL = 272;
const EDGE_ALPHA = 48;
const EDGE_RADIUS = 3;
const BOTTOM_PAD = 6;

interface Component {
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

function components(png: PNG): Component[] {
  const seen = new Uint8Array(png.width * png.height);
  const found: Component[] = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || png.data[start * 4 + 3] < EDGE_ALPHA) continue;
    const pixels: number[] = [];
    const queue = [start];
    let minX = png.width;
    let minY = png.height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      const x = index % png.width;
      const y = Math.floor(index / png.width);
      pixels.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nextX = x + ox;
          const nextY = y + oy;
          if (nextX < 0 || nextY < 0 || nextX >= png.width || nextY >= png.height) continue;
          const next = nextY * png.width + nextX;
          if (seen[next] || png.data[next * 4 + 3] < EDGE_ALPHA) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (pixels.length < 100) continue;
    found.push({
      pixels,
      minX,
      minY,
      maxX,
      maxY,
      centerX: sumX / pixels.length,
      centerY: sumY / pixels.length,
    });
  }
  return found;
}

function normalize(source: PNG, sourceName: string): PNG {
  const subjects = components(source)
    .sort((a, b) => b.pixels.length - a.pixels.length)
    .slice(0, COLUMNS * ROWS)
    .sort((a, b) => a.centerY - b.centerY);
  if (subjects.length !== COLUMNS * ROWS) {
    throw new Error(`${sourceName} must contain 30 isolated figures, found ${subjects.length}`);
  }

  const ordered = Array.from({ length: ROWS }, (_, row) => subjects
    .slice(row * COLUMNS, (row + 1) * COLUMNS)
    .sort((a, b) => a.centerX - b.centerX));
  const out = new PNG({ width: COLUMNS * CELL, height: ROWS * CELL });

  ordered.forEach((row, rowIndex) => row.forEach((subject, columnIndex) => {
    const sourceWidth = subject.maxX - subject.minX + 1;
    const sourceHeight = subject.maxY - subject.minY + 1;
    if (sourceWidth + EDGE_RADIUS * 2 > CELL || sourceHeight + EDGE_RADIUS * 2 + BOTTOM_PAD > CELL) {
      throw new Error(`${sourceName} subject ${columnIndex},${rowIndex} exceeds ${CELL}px cell`);
    }

    const expandedMinX = Math.max(0, subject.minX - EDGE_RADIUS);
    const expandedMinY = Math.max(0, subject.minY - EDGE_RADIUS);
    const expandedMaxX = Math.min(source.width - 1, subject.maxX + EDGE_RADIUS);
    const expandedMaxY = Math.min(source.height - 1, subject.maxY + EDGE_RADIUS);
    const localWidth = expandedMaxX - expandedMinX + 1;
    const localHeight = expandedMaxY - expandedMinY + 1;
    const matte = new Uint8Array(localWidth * localHeight);
    for (const index of subject.pixels) {
      const sourceX = index % source.width;
      const sourceY = Math.floor(index / source.width);
      for (let oy = -EDGE_RADIUS; oy <= EDGE_RADIUS; oy++) {
        for (let ox = -EDGE_RADIUS; ox <= EDGE_RADIUS; ox++) {
          const localX = sourceX + ox - expandedMinX;
          const localY = sourceY + oy - expandedMinY;
          if (localX < 0 || localY < 0 || localX >= localWidth || localY >= localHeight) continue;
          matte[localY * localWidth + localX] = 1;
        }
      }
    }

    const outputLeft = columnIndex * CELL + Math.floor((CELL - localWidth) / 2);
    const outputTop = rowIndex * CELL + CELL - BOTTOM_PAD - localHeight;
    for (let y = 0; y < localHeight; y++) {
      for (let x = 0; x < localWidth; x++) {
        if (!matte[y * localWidth + x]) continue;
        const sourceIndex = ((expandedMinY + y) * source.width + expandedMinX + x) * 4;
        if (source.data[sourceIndex + 3] === 0) continue;
        const outputIndex = ((outputTop + y) * out.width + outputLeft + x) * 4;
        out.data[outputIndex] = source.data[sourceIndex];
        out.data[outputIndex + 1] = source.data[sourceIndex + 1];
        out.data[outputIndex + 2] = source.data[sourceIndex + 2];
        out.data[outputIndex + 3] = source.data[sourceIndex + 3];
      }
    }
  }));

  return out;
}

for (const unit of SHEETS) {
  const file = `${unit}-walk-grid-cutout-v1.png`;
  const path = join(unitDir, file);
  const source = PNG.sync.read(readFileSync(path));
  const out = normalize(source, file);
  writeFileSync(path, PNG.sync.write(out));
  console.log(`normalized 30 isolated ${unit} poses into a ${COLUMNS}x${ROWS} grid`);
}
