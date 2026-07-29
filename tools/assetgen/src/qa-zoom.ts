// Dev QA helper: render selected frames at an integer zoom onto grass for
// close inspection. Usage:
//   node tools/assetgen/src/qa-zoom.ts '<frame-name-regex>' [zoom] [outName]
// Writes .qa/art/zoom[-outName].png

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { genUnits } from './gen-units.ts';
import { genBuildings } from './gen-buildings.ts';
import { genObjects } from './gen-objects.ts';
import { composeSheet } from './contact.ts';
import { writePng } from './png.ts';
import { PALETTE } from './palette.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const re = new RegExp(process.argv[2] ?? 'unit/villager/idle');
const zoom = Number(process.argv[3] ?? 3);
const out = process.argv[4] ? `zoom-${process.argv[4]}.png` : 'zoom.png';

const all = [...genUnits().frames, ...genBuildings().frames, ...genObjects().frames];
const picked = all.filter((f) => re.test(f.name));
if (picked.length === 0) {
  console.error('no frames matched', re);
  process.exit(1);
}
console.log(`${picked.length} frames matched`);
const sheet = composeSheet(picked, PALETTE.grassBase, Math.max(320, Math.min(1024, Math.ceil(2048 / zoom))));
writePng(join(ROOT, '.qa/art', out), sheet.scale(zoom));
console.log('wrote .qa/art/' + out);
