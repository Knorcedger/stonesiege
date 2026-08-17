import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

const ROOT = join(import.meta.dirname, '../..');
const HD = join(ROOT, 'apps/web/public/assets/hd');
const BASE = join(ROOT, 'apps/web/public/assets');
const manifest = JSON.parse(readFileSync(join(HD, 'manifest.json'), 'utf8'));
let atlasCache: Array<{ file: string; atlas: any }> | undefined;
const pngCache = new Map<string, PNG>();

function hdAtlases(): Array<{ file: string; atlas: any }> {
  return atlasCache ??= manifest.atlases.map((file: string) => ({
    file,
    atlas: JSON.parse(readFileSync(join(HD, file), 'utf8')),
  }));
}

function framePixelsHash(name: string): string {
  const match = hdAtlases().find(({ atlas }) => atlas.frames[name]);
  if (!match) throw new Error(`missing HD frame ${name}`);
  const frame = match.atlas.frames[name].frame;
  const image = match.atlas.meta.image as string;
  let png = pngCache.get(image);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(HD, image)));
    pngCache.set(image, png);
  }
  const hash = createHash('sha256');
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    const start = (y * png.width + frame.x) * 4;
    hash.update(png.data.subarray(start, start + frame.w * 4));
  }
  return hash.digest('hex');
}

function frameMaskPixelCount(name: string): number {
  const match = hdAtlases().find(({ atlas }) => atlas.frames[name]);
  if (!match) throw new Error(`missing HD frame ${name}`);
  const frame = match.atlas.frames[name].frame;
  const image = match.atlas.meta.image as string;
  let png = pngCache.get(image);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(HD, image)));
    pngCache.set(image, png);
  }
  const mask = new Set(['255,0,255', '204,0,204', '153,0,153']);
  let count = 0;
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] > 0 && mask.has(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`)) count++;
    }
  }
  return count;
}

describe('complete HD art override contract', () => {
  it('covers every one of the 3,908 shipping frames exactly once at 2x', () => {
    expect(manifest.bespokeFrames).toBeGreaterThanOrEqual(90);
    expect(manifest.convertedFrames + manifest.bespokeFrames).toBe(3908);
    expect(manifest.frameCount).toBe(3908);

    const hdNames = new Set<string>();
    for (const { atlas } of hdAtlases()) {
      expect(atlas.meta.scale).toBe(2);
      expect(atlas.meta.bannerfall.artStyle).toBe('pre-rendered-3d');
      expect(atlas.meta.size.w).toBeLessThanOrEqual(2048);
      expect(atlas.meta.size.h).toBeLessThanOrEqual(2048);
      for (const name of Object.keys(atlas.frames)) {
        expect(hdNames.has(name), `duplicate HD frame ${name}`).toBe(false);
        hdNames.add(name);
      }
    }

    const baseNames = new Set<string>();
    for (const family of ['terrain', 'objects', 'units', 'buildings', 'ui', 'icons']) {
      const atlas = JSON.parse(readFileSync(join(BASE, `${family}.json`), 'utf8'));
      for (const name of Object.keys(atlas.frames)) baseNames.add(name);
    }
    expect([...hdNames].sort()).toEqual([...baseNames].sort());
  });

  it('keeps the gatehouse present while splitting its door into a moving layer', () => {
    const openHash = framePixelsHash('bld/gate/open');
    const doorHash = framePixelsHash('bld/gate/door');
    expect(openHash).not.toBe(framePixelsHash('bld/gate/done'));
    expect(doorHash).not.toBe(openHash);
  });

  it('ships the approved padded Town Center with an exact runtime color mask', () => {
    const hero = hdAtlases().find(({ atlas }) => atlas.frames['bld/townCenter/dark/done'])!.atlas;
    const frame = hero.frames['bld/townCenter/dark/done'];
    expect(frame.frame.w).toBe(576);
    expect(frame.frame.h).toBe(416);
    expect(frame.anchor).toEqual({ x: 0.5, y: 0.6418 });

    const png = PNG.sync.read(readFileSync(join(HD, hero.meta.image)));
    const mask = new Set(['255,0,255', '204,0,204', '153,0,153']);
    let maskPixels = 0;
    for (let y = frame.frame.y; y < frame.frame.y + frame.frame.h; y++) {
      for (let x = frame.frame.x; x < frame.frame.x + frame.frame.w; x++) {
        const i = (y * png.width + x) * 4;
        if (mask.has(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`)) maskPixels++;
      }
    }
    expect(png.data[3]).toBe(0);
    expect(png.data[(png.width - 1) * 4 + 3]).toBe(0);
    expect(png.data[((png.height - 1) * png.width) * 4 + 3]).toBe(0);
    expect(png.data[(png.height * png.width - 1) * 4 + 3]).toBe(0);
    expect(maskPixels).toBeGreaterThan(250);
  });

  it('anchors upgraded world art to its visible ground footprint', () => {
    const frames = Object.assign({}, ...hdAtlases().map(({ atlas }) => atlas.frames));
    expect(frames['bld/house/dark/done'].anchor).toEqual({ x: 0.5, y: 0.6591 });
    expect(frames['bld/barracks/done'].anchor).toEqual({ x: 0.5, y: 0.6199 });
    expect(frames['obj/farm/3'].anchor).toEqual({ x: 0.5, y: 0.399 });
    expect(frames['obj/tree/0'].anchor).toEqual({ x: 0.5, y: 0.9688 });
    expect(frames['obj/berries'].anchor).toEqual({ x: 0.5, y: 0.9063 });
  });

  it('does not stamp legacy player-color bars onto buildings or resources', () => {
    for (const name of ['bld/house/dark/done', 'bld/mill/done', 'obj/tree/0', 'obj/berries', 'obj/gold/0']) {
      expect(frameMaskPixelCount(name), name).toBe(0);
    }
    expect(frameMaskPixelCount('unit/scout/walk/2/0')).toBeGreaterThan(0);
  });

  it('ships real, distinct walk-cycle poses in every authored direction', () => {
    for (let dir = 0; dir < 5; dir++) {
      for (const [sprite, count] of [['unit/villager', 6], ['unit/scout', 8], ['obj/sheep', 4]] as const) {
        const hashes = Array.from({ length: count }, (_, frame) => framePixelsHash(`${sprite}/walk/${dir}/${frame}`));
        expect(new Set(hashes).size, `${sprite} direction ${dir}`).toBe(count);
      }
    }
  });

  it('upgrades every trainable combat family with team-readable authored movement', () => {
    const authoredUnits = [
      'militia', 'manAtArms', 'longswordsman', 'champion',
      'spearman', 'pikeman',
      'archer', 'longbowman', 'eliteLongbowman',
      'crossbowman', 'arbalester',
      'skirmisher', 'eliteSkirmisher',
      'lightCavalry', 'knight', 'cavalier', 'paladin',
      'monk', 'highlandRaider', 'eliteHighlandRaider',
      'batteringRam', 'cappedRam', 'siegeRam',
      'mangonel', 'onager', 'trebuchet',
    ] as const;

    for (const id of authoredUnits) {
      for (let dir = 0; dir < 5; dir++) {
        const hashes = Array.from(
          { length: 6 },
          (_, frame) => framePixelsHash(`unit/${id}/walk/${dir}/${frame}`),
        );
        expect(new Set(hashes).size, `${id} direction ${dir}`).toBe(6);
        expect(frameMaskPixelCount(`unit/${id}/idle/${dir}/0`), `${id} team mask`).toBeGreaterThan(0);
      }
    }
  });

  it('uses authored action and grounded death motion for every combat family', () => {
    const combatUnits = [
      'scout', 'lightCavalry',
      'militia', 'manAtArms', 'longswordsman', 'champion',
      'spearman', 'pikeman',
      'archer', 'longbowman', 'eliteLongbowman',
      'crossbowman', 'arbalester',
      'skirmisher', 'eliteSkirmisher',
      'highlandRaider', 'eliteHighlandRaider',
      'knight', 'cavalier', 'paladin',
      'monk', 'batteringRam', 'cappedRam', 'siegeRam',
      'mangonel', 'onager', 'trebuchet',
    ] as const;

    for (const id of combatUnits) {
      for (let dir = 0; dir < 5; dir++) {
        const attacks = Array.from({ length: 5 }, (_, frame) => framePixelsHash(`unit/${id}/attack/${dir}/${frame}`));
        const deaths = Array.from({ length: 5 }, (_, frame) => framePixelsHash(`unit/${id}/die/${dir}/${frame}`));
        const decay = Array.from({ length: 3 }, (_, frame) => framePixelsHash(`unit/${id}/decay/${dir}/${frame}`));
        expect(new Set(attacks).size, `${id} attack direction ${dir}`).toBeGreaterThanOrEqual(4);
        expect(new Set(deaths).size, `${id} death direction ${dir}`).toBe(5);
        expect(new Set(decay).size, `${id} decay direction ${dir}`).toBe(3);
        expect(frameMaskPixelCount(`unit/${id}/attack/${dir}/2`), `${id} attack team mask`).toBeGreaterThan(0);
      }
    }
  });

  it('ships authored sheep, deer, and wolf motion in every direction', () => {
    for (const id of ['sheep', 'deer', 'wolf'] as const) {
      const directionHashes = Array.from({ length: 5 }, (_, dir) => framePixelsHash(`obj/${id}/idle/${dir}/0`));
      expect(new Set(directionHashes).size, `${id} authored directions`).toBe(5);
      for (let dir = 0; dir < 5; dir++) {
        const walk = Array.from({ length: 4 }, (_, frame) => framePixelsHash(`obj/${id}/walk/${dir}/${frame}`));
        const death = Array.from({ length: 3 }, (_, frame) => framePixelsHash(`obj/${id}/die/${dir}/${frame}`));
        const decay = Array.from({ length: 2 }, (_, frame) => framePixelsHash(`obj/${id}/decay/${dir}/${frame}`));
        expect(new Set(walk).size, `${id} walk direction ${dir}`).toBe(4);
        expect(new Set(death).size, `${id} death direction ${dir}`).toBe(3);
        expect(new Set(decay).size, `${id} decay direction ${dir}`).toBe(2);
      }
    }
  });

  it('derives all world-entity icons from authored renders', () => {
    for (const id of ['militia', 'pikeman', 'archer', 'knight', 'trebuchet', 'deer', 'wolf', 'tree', 'berryBush', 'goldMine', 'stoneMine']) {
      expect(framePixelsHash(`icon/${id}`)).not.toBe(framePixelsHash(`icon/${id}/gray`));
    }
  });
});
