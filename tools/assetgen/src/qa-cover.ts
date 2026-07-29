// Dev diagnostic: print mask-coverage stats per defId (min/max % across frames
// that carry mask pixels) so §9.4 bands can be tuned in one pass.
// Run: node tools/assetgen/src/qa-cover.ts [units|buildings]

import { genUnits } from './gen-units.ts';
import { genBuildings } from './gen-buildings.ts';
import { isMaskColor } from './palette.ts';
import type { FrameDef } from './atlas.ts';

const which = process.argv[2] ?? 'units';
const frames: FrameDef[] = which === 'buildings' ? genBuildings().frames : genUnits().frames;

interface Stat { min: number; max: number; minName: string; maxName: string; n: number; zero: number }
const stats = new Map<string, Stat>();

for (const f of frames) {
  const r = f.raster;
  let opaque = 0;
  let mask = 0;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const [pr, pg, pb, pa] = r.get(x, y);
      if (pa !== 255) continue;
      opaque++;
      if (isMaskColor(pr, pg, pb)) mask++;
    }
  }
  const defId = f.name.split('/')[1] ?? '';
  const s = stats.get(defId) ?? { min: 1, max: 0, minName: '', maxName: '', n: 0, zero: 0 };
  if (mask === 0 || opaque === 0) {
    s.zero++;
  } else {
    const frac = mask / opaque;
    if (frac < s.min) { s.min = frac; s.minName = f.name; }
    if (frac > s.max) { s.max = frac; s.maxName = f.name; }
  }
  s.n++;
  stats.set(defId, s);
}

for (const [id, s] of stats) {
  console.log(
    `${id.padEnd(20)} frames=${String(s.n).padStart(4)} nomask=${String(s.zero).padStart(4)} ` +
    (s.maxName ? `min=${(s.min * 100).toFixed(1)}% (${s.minName})  max=${(s.max * 100).toFixed(1)}% (${s.maxName})` : ''),
  );
}
