// Split 5-direction × 4-phase generated villager work sheets into one
// transparent source per runtime atlas frame. The generated columns are
// S,SE,E,NE,N, while the runtime contract authors S,SW,W,NW,N. Columns 1..3
// are therefore mirrored as they are extracted. A small inset removes
// generator-added grid gutters.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dirname, '../..');
const unitDir = join(root, 'art/hd/frames/units');
const WORK_ANIMS = ['chop', 'farm', 'forage', 'mine', 'build'] as const;
const COLS = 5;
const ROWS = 4;
const X_INSET = 14;
// Image generation keeps the requested four phases but does not guarantee
// mathematically equal row heights. These cuts sit in the transparent gaps,
// keeping raised tools and boots in the same frame instead of splitting them
// across adjacent phases.
const ROW_CUTS: Record<(typeof WORK_ANIMS)[number], readonly [number, number, number, number, number]> = {
  chop: [0, 280, 541, 766, 1024],
  farm: [0, 331, 574, 748, 1024],
  forage: [0, 276, 517, 755, 1024],
  mine: [0, 323, 563, 776, 1024],
  build: [0, 304, 549, 750, 1024],
};

for (const anim of WORK_ANIMS) {
  const source = PNG.sync.read(readFileSync(join(unitDir, `villager-${anim}-sheet-cutout-v5.png`)));
  for (let dir = 0; dir < COLS; dir++) {
    for (let frame = 0; frame < ROWS; frame++) {
      const rawLeft = Math.round((dir * source.width) / COLS);
      const rawRight = Math.round(((dir + 1) * source.width) / COLS);
      const cuts = ROW_CUTS[anim];
      const rawTop = Math.round((cuts[frame] * source.height) / 1024);
      const rawBottom = Math.round((cuts[frame + 1] * source.height) / 1024);
      const left = rawLeft + X_INSET;
      const right = rawRight - X_INSET;
      const top = rawTop;
      const bottom = rawBottom;
      const out = new PNG({ width: right - left, height: bottom - top });
      const mirrorForRuntime = dir > 0 && dir < 4;
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const sourceX = mirrorForRuntime ? right - 1 - (x - left) : x;
          const sourceIndex = (y * source.width + sourceX) * 4;
          const outputIndex = ((y - top) * out.width + x - left) * 4;
          out.data[outputIndex] = source.data[sourceIndex];
          out.data[outputIndex + 1] = source.data[sourceIndex + 1];
          out.data[outputIndex + 2] = source.data[sourceIndex + 2];
          const r = source.data[sourceIndex];
          const g = source.data[sourceIndex + 1];
          const b = source.data[sourceIndex + 2];
          // Some generated grids contain white separator pixels or slightly
          // shifted magenta that the soft chroma matte leaves at low alpha.
          // Neither color occurs in the undyed villager source (the player sash
          // is authored later), so discard them before alpha-bounds fitting.
          const gridWhite = r > 242 && g > 242 && b > 242;
          const chromaResidual = r > 145 && b > 145 && g + 55 < r && g + 55 < b;
          const sourceAlpha = source.data[sourceIndex + 3];
          out.data[outputIndex + 3] = gridWhite || chromaResidual || sourceAlpha < 64 ? 0 : sourceAlpha;
        }
      }
      writeFileSync(
        join(unitDir, `villager-${anim}-dir-${dir}-frame-${frame}-cutout-v5.png`),
        PNG.sync.write(out),
      );
    }
  }
  console.log(`wrote ${COLS * ROWS} villager ${anim} frames`);
}
