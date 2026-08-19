// Split generated movement-cycle sheets into one transparent source per atlas
// frame. Generated image dimensions are not guaranteed to divide evenly by
// the requested grid, so cell boundaries are rounded independently.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { clearMinorAlphaComponents } from './alpha-components.ts';

const root = join(import.meta.dirname, '../..');
const unitDir = join(root, 'art/hd/frames/units');

interface AnimationSheet {
  kind: 'villager' | 'scout' | 'sheep';
  columns: number;
  rows: number;
  frameCount: number;
}

const SHEETS: readonly AnimationSheet[] = [
  { kind: 'villager', columns: 3, rows: 2, frameCount: 6 },
  { kind: 'scout', columns: 4, rows: 2, frameCount: 8 },
  { kind: 'sheep', columns: 2, rows: 2, frameCount: 4 },
];

for (const sheet of SHEETS) {
  for (let dir = 0; dir < 5; dir++) {
    const sourceName = `${sheet.kind}-walk-dir-${dir}-sheet-v4.png`;
    const source = PNG.sync.read(readFileSync(join(unitDir, sourceName)));
    for (let frame = 0; frame < sheet.frameCount; frame++) {
      const cellX = frame % sheet.columns;
      const cellY = Math.floor(frame / sheet.columns);
      const left = Math.round((cellX * source.width) / sheet.columns);
      const right = Math.round(((cellX + 1) * source.width) / sheet.columns);
      const top = Math.round((cellY * source.height) / sheet.rows);
      const bottom = Math.round(((cellY + 1) * source.height) / sheet.rows);
      const out = new PNG({ width: right - left, height: bottom - top });
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const sourceIndex = (y * source.width + x) * 4;
          const outputIndex = ((y - top) * out.width + x - left) * 4;
          out.data[outputIndex] = source.data[sourceIndex];
          out.data[outputIndex + 1] = source.data[sourceIndex + 1];
          out.data[outputIndex + 2] = source.data[sourceIndex + 2];
          out.data[outputIndex + 3] = source.data[sourceIndex + 3];
        }
      }
      if (sheet.kind !== 'scout') clearMinorAlphaComponents(out);
      const outputName = `${sheet.kind}-walk-dir-${dir}-frame-${frame}-cutout-v4.png`;
      writeFileSync(join(unitDir, outputName), PNG.sync.write(out));
    }
    console.log(`wrote ${sheet.frameCount} ${sheet.kind} walk frames for dir ${dir}`);
  }
}
