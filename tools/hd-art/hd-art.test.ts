import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { buildings } from '../../packages/data/src/buildings.ts';

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

function baselineFrameNames(): Set<string> {
  const names = new Set<string>();
  for (const family of ['terrain', 'objects', 'units', 'buildings', 'ui', 'icons']) {
    const atlas = JSON.parse(readFileSync(join(BASE, `${family}.json`), 'utf8'));
    for (const name of Object.keys(atlas.frames)) names.add(name);
  }
  return names;
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

function frameVisibleBounds(name: string): {
  left: number; top: number; right: number; width: number; height: number; bottom: number;
} {
  const match = hdAtlases().find(({ atlas }) => atlas.frames[name]);
  if (!match) throw new Error(`missing HD frame ${name}`);
  const frame = match.atlas.frames[name].frame;
  const image = match.atlas.meta.image as string;
  let png = pngCache.get(image);
  if (!png) {
    png = PNG.sync.read(readFileSync(join(HD, image)));
    pngCache.set(image, png);
  }
  let left = frame.w;
  let top = frame.h;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      if (png.data[((frame.y + y) * png.width + frame.x + x) * 4 + 3] < 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`empty HD frame ${name}`);
  return { left, top, right, width: right - left + 1, height: bottom - top + 1, bottom };
}

describe('complete HD art override contract', () => {
  it('covers every shipping frame exactly once at 2x', () => {
    const baseNames = baselineFrameNames();
    expect(manifest.bespokeFrames).toBeGreaterThanOrEqual(90);
    expect(manifest.convertedFrames + manifest.bespokeFrames).toBe(baseNames.size);
    expect(manifest.frameCount).toBe(baseNames.size);

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

    expect([...hdNames].sort()).toEqual([...baseNames].sort());
  });

  it('ships dedicated directional rigs and icons for every civilization unique unit', () => {
    const names = new Set(hdAtlases().flatMap(({ atlas }) => Object.keys(atlas.frames)));
    for (const [id, walkFrames, eliteId] of [
      ['housecarl', 6, 'eliteHousecarl'],
      ['chevalier', 8, 'eliteChevalier'],
      ['mangudai', 8, 'eliteMangudai'],
      ['cataphract', 8, 'eliteCataphract'],
      ['mamluk', 8, 'eliteMamluk'],
    ] as const) {
      for (let direction = 0; direction < 5; direction++) {
        for (let frame = 0; frame < walkFrames; frame++) {
          expect(names.has(`unit/${id}/walk/${direction}/${frame}`)).toBe(true);
        }
      }
      for (const iconId of [id, eliteId]) {
        expect(names.has(`icon/${iconId}`)).toBe(true);
        expect(names.has(`icon/${iconId}/gray`)).toBe(true);
      }
    }
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

  it('centers gold and stone piles on their logical resource origin', () => {
    const frames = Object.assign({}, ...hdAtlases().map(({ atlas }) => atlas.frames));
    for (const name of ['obj/gold/0', 'obj/gold/1', 'obj/stone/0', 'obj/stone/1']) {
      const visible = frameVisibleBounds(name);
      const frame = frames[name];
      const visibleCenter = (visible.left + visible.right) / 2;
      expect(Math.abs(visibleCenter - frame.frame.w / 2), `${name} horizontal center`)
        .toBeLessThanOrEqual(1);
    }
  });

  it('uses the approved final canvas and anchor for every construction stage', () => {
    for (const id of Object.keys(buildings).filter((buildingId) => buildingId !== 'farm')) {
      const doneName = id === 'house'
        ? 'bld/house/dark/done'
        : id === 'townCenter'
          ? 'bld/townCenter/castle/done'
          : `bld/${id}/done`;
      const doneMatch = hdAtlases().find(({ atlas }) => atlas.frames[doneName]);
      expect(doneMatch, doneName).toBeDefined();
      const done = doneMatch!.atlas.frames[doneName];
      const hashes = [framePixelsHash(doneName)];

      for (const stage of [0, 1, 2]) {
        const name = `bld/${id}/construct${stage}`;
        const match = hdAtlases().find(({ atlas }) => atlas.frames[name]);
        expect(match, name).toBeDefined();
        expect(match!.file.startsWith('hero-redrawn-'), `${name} must be a bespoke override`).toBe(true);
        const frame = match!.atlas.frames[name];
        expect(frame.frame.w, `${name} width`).toBe(done.frame.w);
        expect(frame.frame.h, `${name} height`).toBe(done.frame.h);
        expect(frame.anchor, `${name} anchor`).toEqual(done.anchor);
        hashes.push(framePixelsHash(name));
      }
      expect(new Set(hashes).size, `${id} lifecycle stages must be visually distinct`).toBe(4);
    }
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

  it('keeps rear-facing villagers and sheep at the same grounded visual scale', () => {
    for (const sprite of ['unit/villager', 'obj/sheep'] as const) {
      const front = frameVisibleBounds(`${sprite}/idle/0/0`);
      const rear = frameVisibleBounds(`${sprite}/idle/4/0`);
      expect(rear.height, `${sprite} rear height`).toBeGreaterThanOrEqual(front.height * 0.94);
      expect(rear.height, `${sprite} rear height`).toBeLessThanOrEqual(front.height * 1.06);
    }
  });

  it('shows a distinct, grounded four-frame villager gather cycle', () => {
    const frames = Object.assign({}, ...hdAtlases().map(({ atlas }) => atlas.frames));
    for (let dir = 0; dir < 5; dir++) {
      const names = Array.from({ length: 4 }, (_, frame) => `unit/villager/gather/${dir}/${frame}`);
      expect(new Set(names.map(framePixelsHash)).size, `gather direction ${dir}`).toBe(4);
      for (const name of names) {
        const visible = frameVisibleBounds(name);
        const anchorY = frames[name].anchor.y * frames[name].frame.h;
        expect(Math.abs(visible.bottom - anchorY), `${name} feet`).toBeLessThanOrEqual(3);
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

  it('keeps every troop and sheep walk cycle at a stable scale and ground line', () => {
    const atlasEntries = hdAtlases().flatMap(({ atlas }) =>
      Object.entries(atlas.frames).map(([name, frame]) => ({ name, frame: frame as any })));
    const groups = new Map<string, Array<{ name: string; frame: any }>>();
    for (const entry of atlasEntries) {
      const match = entry.name.match(/^(unit\/[^/]+|obj\/sheep)\/walk\/([0-4])\/(\d+)$/);
      if (!match) continue;
      const key = `${match[1]}/${match[2]}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    expect(groups.size).toBeGreaterThan(20);
    for (const [groupName, entries] of groups) {
      entries.sort((a, b) => Number(a.name.split('/').at(-1)) - Number(b.name.split('/').at(-1)));
      const first = entries[0].frame;
      const heights: number[] = [];
      for (const { name, frame } of entries) {
        expect(frame.frame.w, `${name} canvas width`).toBe(first.frame.w);
        expect(frame.frame.h, `${name} canvas height`).toBe(first.frame.h);
        expect(frame.anchor, `${name} anchor`).toEqual(first.anchor);
        const visible = frameVisibleBounds(name);
        heights.push(visible.height);
        const anchorY = Math.round(frame.anchor.y * frame.frame.h);
        expect(Math.abs(visible.bottom - anchorY), `${name} ground contact`).toBeLessThanOrEqual(2);
      }
      const heightRatio = Math.max(...heights) / Math.min(...heights);
      expect(heightRatio, `${groupName} apparent scale`).toBeLessThanOrEqual(1.15);
    }
  });

  it('keeps every looping cycle horizontally registered instead of sliding and snapping', () => {
    // The authored movement sheets are walk-ACROSS strips. Registering a pose on
    // its source cell preserved that translation, so a cycle drifted sideways
    // and teleported back at its loop point every 0.6s of playback. Poses must
    // register on the subject, which is what the correctly authored sheets do.
    const atlasEntries = hdAtlases().flatMap(({ atlas }) =>
      Object.entries(atlas.frames).map(([name, frame]) => ({ name, frame: frame as any })));
    const groups = new Map<string, Array<{ name: string; index: number }>>();
    for (const entry of atlasEntries) {
      const match = entry.name.match(
        /^((?:unit|obj)\/[^/]+)\/(walk|chop|farm|forage|mine|build|gather|carry)\/([0-4])\/(\d+)$/,
      );
      if (!match) continue;
      const key = `${match[1]}/${match[2]}/${match[3]}`;
      const group = groups.get(key) ?? [];
      group.push({ name: entry.name, index: Number(match[4]) });
      groups.set(key, group);
    }

    expect(groups.size).toBeGreaterThan(200);
    for (const [groupName, entries] of groups) {
      if (entries.length < 2) continue;
      entries.sort((a, b) => a.index - b.index);
      const centers = entries.map(({ name }) => {
        const visible = frameVisibleBounds(name);
        return (visible.left + visible.right) / 2;
      });
      // Travel across the whole cycle: the subject must stay put inside its own
      // canvas, because the simulation — not the sprite — moves the unit. The
      // budget leaves room for authored body sway (the deer and wolf cycles
      // rock ~3.5px either side of center) while still catching the 15-42px
      // sheet translation this test exists to prevent.
      const travel = Math.max(...centers) - Math.min(...centers);
      expect(travel, `${groupName} horizontal travel`).toBeLessThanOrEqual(8);

      // No sawtooth: returning to frame 0 must not cost more than the largest
      // step taken inside the cycle.
      const steps = centers.map((c, i) => Math.abs(centers[(i + 1) % centers.length] - c));
      const wrap = steps[steps.length - 1];
      const inCycle = Math.max(...steps.slice(0, -1));
      expect(wrap, `${groupName} loop-point snap`).toBeLessThanOrEqual(Math.max(inCycle, 2));
    }
  });

  it('registers idle, walk, and attack of a unit on the same body center', () => {
    // Mixed registration made a unit jump sideways the moment it stopped
    // walking or started swinging.
    for (const id of ['villager', 'militia', 'archer', 'monk', 'knight', 'skirmisher'] as const) {
      for (let dir = 0; dir < 5; dir++) {
        const center = (name: string): number => {
          const visible = frameVisibleBounds(name);
          return (visible.left + visible.right) / 2;
        };
        const idle = center(`unit/${id}/idle/${dir}/0`);
        expect(Math.abs(center(`unit/${id}/walk/${dir}/0`) - idle), `${id} dir ${dir} idle vs walk`)
          .toBeLessThanOrEqual(4);
        expect(Math.abs(center(`unit/${id}/attack/${dir}/0`) - idle), `${id} dir ${dir} idle vs attack`)
          .toBeLessThanOrEqual(6);
      }
    }
  });
});
