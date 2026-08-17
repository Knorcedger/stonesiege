// Split authored 4x2 direction renders into the five directions stored by
// StoneSiege's atlas contract (S, SW, W, NW, N). Runtime mirroring supplies
// NE, E, and SE exactly as it does for the mechanical sprites.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dirname, '../..');

interface DirectionSheet {
  source: string;
  output: string;
  keepLargestComponent?: boolean;
}

const SHEETS: readonly DirectionSheet[] = [
  { source: 'villager-directions-cutout-v2.png', output: 'villager-dir-{dir}-cutout-v2.png' },
  { source: 'villager-gather-directions-cutout-v3.png', output: 'villager-gather-dir-{dir}-cutout-v3.png' },
  { source: 'villager-carry-directions-cutout-v3.png', output: 'villager-carry-dir-{dir}-cutout-v3.png' },
  { source: 'villager-attack-directions-cutout-v3.png', output: 'villager-attack-dir-{dir}-cutout-v3.png' },
  { source: 'villager-downed-directions-cutout-v3.png', output: 'villager-downed-dir-{dir}-cutout-v3.png' },
  { source: 'scout-directions-cutout-v3.png', output: 'scout-dir-{dir}-cutout-v3.png' },
  { source: 'sheep-directions-cutout-v3.png', output: 'sheep-dir-{dir}-cutout-v3.png' },
  { source: 'deer-directions-cutout-v1.png', output: 'deer-dir-{dir}-cutout-v1.png' },
  {
    source: 'wolf-directions-cutout-v1.png',
    output: 'wolf-dir-{dir}-cutout-v1.png',
    keepLargestComponent: true,
  },
];

function clearMinorComponents(png: PNG): void {
  const seen = new Uint8Array(png.width * png.height);
  const components: number[][] = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || png.data[start * 4 + 3] < 8) continue;
    const component: number[] = [];
    const queue = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      component.push(index);
      const x = index % png.width;
      const y = Math.floor(index / png.width);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          const next = ny * png.width + nx;
          if (seen[next] || png.data[next * 4 + 3] < 8) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  if (components.length <= 1) return;
  components.sort((a, b) => b.length - a.length);
  for (const component of components.slice(1)) {
    for (const index of component) png.data.fill(0, index * 4, index * 4 + 4);
  }
}

// Contract dirs 0..4 = S, SW, W, NW, N. Although the source prompts used
// compass labels, the rendered people/animals follow camera-facing sprite
// convention: top row S/SW/W/NW and bottom row N/NE/E/SE. Keeping the visual
// convention here is critical—using the prompt labels made every unit travel
// exactly backwards.
const CELLS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]];

for (const sheet of SHEETS) {
  const sourcePath = join(root, 'art/hd/frames/units', sheet.source);
  const source = PNG.sync.read(readFileSync(sourcePath));
  if (source.width % 4 !== 0 || source.height % 2 !== 0) {
    throw new Error(`${sheet.source} must be a 4x2 grid, got ${source.width}x${source.height}`);
  }

  const cellWidth = source.width / 4;
  const cellHeight = source.height / 2;
  for (let dir = 0; dir < CELLS.length; dir++) {
    const [cellX, cellY] = CELLS[dir];
    const out = new PNG({ width: cellWidth, height: cellHeight });
    for (let y = 0; y < cellHeight; y++) {
      for (let x = 0; x < cellWidth; x++) {
        const sourceIndex = ((cellY * cellHeight + y) * source.width + cellX * cellWidth + x) * 4;
        const outputIndex = (y * cellWidth + x) * 4;
        out.data[outputIndex] = source.data[sourceIndex];
        out.data[outputIndex + 1] = source.data[sourceIndex + 1];
        out.data[outputIndex + 2] = source.data[sourceIndex + 2];
        out.data[outputIndex + 3] = source.data[sourceIndex + 3];
      }
    }
    if (sheet.keepLargestComponent) clearMinorComponents(out);
    const outputName = sheet.output.replace('{dir}', String(dir));
    writeFileSync(join(root, 'art/hd/frames/units', outputName), PNG.sync.write(out));
  }
  console.log(`wrote five direction cutouts from ${sheet.source}`);
}
