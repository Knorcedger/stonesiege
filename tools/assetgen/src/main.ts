// Assetgen orchestrator: generate all atlases → apps/web/public/assets/, run the
// automated ART_BIBLE §9 post-pass checks, and emit QA contact sheets.
// Run: `npm run assets` (plain Node, TS type stripping — erasable syntax only).

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtlas, defaultBannerfallMeta } from './atlas.ts';
import type { FrameDef } from './atlas.ts';
import { writePng } from './png.ts';
import { genTerrain } from './gen-terrain.ts';
import { genObjects } from './gen-objects.ts';
import { genUnits } from './gen-units.ts';
import { genBuildings } from './gen-buildings.ts';
import { genUi } from './gen-ui.ts';
import { genIcons } from './gen-icons.ts';
import { checkPalette, checkMaskCoverage, checkContrast } from './checks.ts';
import { composeSheet, composeMasterSheet } from './contact.ts';
import { PALETTE } from './palette.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'apps/web/public/assets');
const QA = join(ROOT, '.qa/art');

function emit(name: string, frames: FrameDef[], impactFrames: Record<string, number>, nineSlice?: Record<string, [number, number, number, number]>): void {
  const atlas = buildAtlas(frames, `${name}.png`, defaultBannerfallMeta({ impactFrame: impactFrames, ...(nineSlice ? { nineSlice } : {}) }));
  writePng(join(OUT, `${name}.png`), atlas.image);
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(atlas.json, null, 1) + '\n');
  console.log(
    `  ${name.padEnd(9)} ${String(frames.length).padStart(4)} frames  ${atlas.image.width}x${atlas.image.height}`,
  );
}

function qaSheets(name: string, frames: FrameDef[]): void {
  const s1 = composeSheet(frames, PALETTE.grassBase);
  writePng(join(QA, `${name}-1x.png`), s1);
  writePng(join(QA, `${name}-2x.png`), s1.scale(2));
}

const t0 = Date.now();
mkdirSync(OUT, { recursive: true });
mkdirSync(QA, { recursive: true });
console.log('bannerfall assetgen');

// ---- generate
const terrain = genTerrain();
const objects = genObjects();
const units = genUnits();
const buildings = genBuildings();
const ui = genUi();
const icons = genIcons();

// ---- automated checks (§9 ⚙ items) — fail loudly before writing anything
checkPalette(terrain, 'terrain', false);
checkPalette(objects.frames, 'objects', true);
checkPalette(units.frames, 'units', true);
checkPalette(buildings.frames, 'buildings', true);
checkPalette(ui.frames, 'ui', false);
checkPalette(icons, 'icons', false); // mask colors BANNED in icons
checkMaskCoverage(objects.frames, 'objects');
checkMaskCoverage(units.frames, 'units');
checkMaskCoverage(buildings.frames, 'buildings');
checkContrast(
  objects.frames.filter((f) => /^obj\/(sheep|deer|wolf)\/(idle|walk|attack)\//.test(f.name)),
  'objects',
);
checkContrast(
  units.frames.filter((f) => /^unit\/[^/]+\/(idle|walk)\//.test(f.name)),
  'units',
);

// ---- write atlases
emit('terrain', terrain, {});
emit('objects', objects.frames, objects.impactFrames);
emit('units', units.frames, units.impactFrames);
emit('buildings', buildings.frames, buildings.impactFrames);
emit('ui', ui.frames, {}, ui.nineSlice);
emit('icons', icons, {});

// ---- QA contact sheets (.qa/art) + contract-mandated master sheet
qaSheets('terrain', terrain);
qaSheets('objects', objects.frames);
qaSheets('ui', ui.frames);
qaSheets('icons', icons.filter((f) => !f.name.endsWith('/gray')));
qaSheets('icons-gray', icons.filter((f) => f.name.endsWith('/gray')));
// units: key poses per unit (all dirs of idle/walk0/attack-impact/die) at 1×/2×
qaSheets('units', units.frames.filter((f) =>
  /^unit\/[^/]+\/(idle\/\d\/0|walk\/\d\/0|attack\/\d\/2|die\/[02]\/[24]|gather\/\d\/2|carry\/\d\/0|decay\/0\/\d)$/.test(f.name)));
qaSheets('units-anim', units.frames.filter((f) => /^unit\/[^/]+\/(walk|attack)\/1\//.test(f.name)));
qaSheets('buildings', buildings.frames);

const stripFrames = [
  ...objects.frames.filter((f) => /^obj\/(sheep|deer|wolf)\/walk\/[12]\/0$/.test(f.name)),
  ...units.frames.filter((f) => /^unit\/[^/]+\/walk\/1\/0$/.test(f.name)),
];
const silhouettes = [
  ...objects.frames.filter((f) => /^obj\/(sheep|deer|wolf)\/(idle|walk)\/2\/0$/.test(f.name)),
  ...units.frames.filter((f) => /^unit\/[^/]+\/idle\/2\/0$/.test(f.name)),
];
writePng(
  join(OUT, 'contact-sheet.png'),
  composeMasterSheet(
    [...terrain, ...objects.frames, ...buildings.frames, ...ui.frames, ...icons.filter((f) => !f.name.endsWith('/gray'))],
    stripFrames,
    silhouettes,
  ),
);

console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT}`);
