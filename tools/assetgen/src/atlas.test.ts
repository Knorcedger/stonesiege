// Completeness test for the emitted atlases (runs under vitest, which resolves
// the @bf/* aliases). Requirements are DERIVED from gameData + the generator's
// own terrain table — keep it mechanical; if data grows, the test grows.
//
// Stage-2 arming: the unit/building sprite requirements switch on automatically
// as soon as the respective atlas contains any `unit/` / `bld/` frame. Until
// then only the atlases' existence + icons are enforced for those defs.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameData } from '@bf/data';
import { TERRAINS, edgePairs, EDGES } from './gen-terrain.ts';
import { CMD_VERBS } from './gen-icons.ts';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/public/assets');

interface AtlasJson {
  frames: Record<string, { frame: { w: number; h: number }; anchor: { x: number; y: number } }>;
  meta: {
    scale: number;
    image: string;
    bannerfall: {
      playerColorStrategy: string;
      maskPalette: string[];
      playerRamps: Array<{ name: string }>;
      impactFrame: Record<string, number>;
    };
  };
}

function load(name: string): AtlasJson {
  return JSON.parse(readFileSync(join(ASSETS, `${name}.json`), 'utf8')) as AtlasJson;
}

const terrain = load('terrain');
const objects = load('objects');
const units = load('units');
const buildings = load('buildings');
const ui = load('ui');
const icons = load('icons');

function expectFrames(atlas: AtlasJson, names: string[]): void {
  const missing = names.filter((n) => !(n in atlas.frames));
  expect(missing, `missing frames: ${missing.slice(0, 20).join(', ')}`).toEqual([]);
}

// Sprite-aliased defs (campaign heroes: sprite = an existing rig like 'champion')
// render through that rig's frames and by design have none of their own.
const gaiaAnimals = Object.values(gameData.units)
  .filter((u) => u.trainedAt.length === 0 && u.sprite === undefined);
const trainableUnits = Object.values(gameData.units)
  .filter((u) => u.trainedAt.length > 0 && u.sprite === undefined);

describe('atlas meta (ASSET_CONTRACT)', () => {
  it('declares runtime-swap + palettes in every atlas', () => {
    for (const atlas of [terrain, objects, units, buildings, ui, icons]) {
      expect(atlas.meta.scale).toBe(1);
      expect(atlas.meta.bannerfall.playerColorStrategy).toBe('runtime-swap');
      expect(atlas.meta.bannerfall.maskPalette).toEqual(['#ff00ff', '#cc00cc', '#990099']);
      expect(atlas.meta.bannerfall.playerRamps).toHaveLength(8);
      expect(atlas.meta.bannerfall.impactFrame).toBeTypeOf('object');
    }
  });
});

describe('terrain atlas', () => {
  it('has 2–4 variants for every sim TerrainId', () => {
    const wanted: string[] = [];
    for (const spec of TERRAINS) {
      expect(spec.variants).toBeGreaterThanOrEqual(2);
      expect(spec.variants).toBeLessThanOrEqual(4);
      for (let v = 0; v < spec.variants; v++) wanted.push(`terr/${spec.id}/${v}`);
    }
    expectFrames(terrain, wanted);
  });

  it('covers every TerrainId from the sim', () => {
    // TerrainId is a type — enumerate via the generator table and cross-check a
    // frame exists per id; the table itself is typed against TerrainId.
    const ids = TERRAINS.map((t) => t.id).sort();
    expect(ids).toEqual(['dirt', 'farmland', 'grass', 'road', 'sand', 'shallows', 'snow', 'water']);
  });

  it('has all 4 edge-transition frames for every priority pair', () => {
    const wanted: string[] = [];
    for (const [hi, lo] of edgePairs()) {
      for (const edge of EDGES) wanted.push(`terr/${hi}_${lo}/${edge}`);
    }
    expect(wanted.length).toBe(28 * 4);
    expectFrames(terrain, wanted);
  });

  it('tiles are exactly 64×32', () => {
    for (const spec of TERRAINS) {
      const f = terrain.frames[`terr/${spec.id}/0`];
      expect(f.frame.w).toBe(64);
      expect(f.frame.h).toBe(32);
    }
  });
});

describe('objects atlas', () => {
  it('has trees, stump, mines, berries, farm stages', () => {
    expectFrames(objects, [
      'obj/tree/0', 'obj/tree/1', 'obj/tree/2', 'obj/stump',
      'obj/gold/0', 'obj/gold/1', 'obj/stone/0', 'obj/stone/1',
      'obj/berries',
      'obj/farm/0', 'obj/farm/1', 'obj/farm/2', 'obj/farm/3', 'obj/farm/4',
    ]);
  });

  it('has full reduced anim sets for every gaia animal in gameData', () => {
    expect(gaiaAnimals.length).toBeGreaterThan(0);
    const wanted: string[] = [];
    for (const animal of gaiaAnimals) {
      const anims: Array<[string, number]> = [
        ['idle', 2], ['walk', 4], ['die', 3], ['decay', 2],
      ];
      if (animal.attacks.length > 0) anims.push(['attack', 4]);
      for (const [anim, count] of anims) {
        for (let dir = 0; dir <= 4; dir++) {
          for (let f = 0; f < count; f++) wanted.push(`obj/${animal.id}/${anim}/${dir}/${f}`);
        }
      }
    }
    expectFrames(objects, wanted);
  });

  it('marks the impact frame for every obj attack anim', () => {
    for (const animal of gaiaAnimals) {
      if (animal.attacks.length === 0) continue;
      expect(objects.meta.bannerfall.impactFrame[`obj/${animal.id}/attack`]).toBeTypeOf('number');
    }
  });
});

describe('icons atlas', () => {
  it('has an icon + gray companion for every unit, building and resource def', () => {
    const wanted: string[] = [];
    for (const def of [
      ...Object.values(gameData.units),
      ...Object.values(gameData.buildings),
      ...Object.values(gameData.resources),
    ]) {
      wanted.push(def.icon, `${def.icon}/gray`);
    }
    expectFrames(icons, wanted);
  });

  it('has an icon + gray companion for every tech', () => {
    const wanted: string[] = [];
    for (const def of Object.values(gameData.techs)) wanted.push(def.icon, `${def.icon}/gray`);
    expectFrames(icons, wanted);
  });

  it('has resource-type and command-verb icons + gray companions', () => {
    const wanted: string[] = [];
    for (const res of ['food', 'wood', 'gold', 'stone']) wanted.push(`icon/res/${res}`, `icon/res/${res}/gray`);
    for (const verb of CMD_VERBS) wanted.push(`icon/cmd/${verb}`, `icon/cmd/${verb}/gray`);
    expect(CMD_VERBS).toContain('attackMove'); // contract's verb list is baked into CMD_VERBS
    expect(CMD_VERBS.length).toBe(11);
    expectFrames(icons, wanted);
  });

  it('icons are 40×40', () => {
    for (const [name, f] of Object.entries(icons.frames)) {
      expect(f.frame.w, name).toBe(40);
      expect(f.frame.h, name).toBe(40);
    }
  });
});

describe('ui atlas', () => {
  it('has panel + parchment 9-slices, buttons, hp bar, rings, minimap, rally', () => {
    const slices = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
    expectFrames(ui, [
      'ui/panel',
      ...slices.map((s) => `ui/panel/${s}`),
      'ui/parchment',
      ...slices.map((s) => `ui/parchment/${s}`),
      'ui/btn/idle', 'ui/btn/pressed', 'ui/btn/disabled', 'ui/btn/active',
      'ui/hp/bg', 'ui/hp/green', 'ui/hp/yellow', 'ui/hp/red',
      'ui/ring/1', 'ui/ring/2', 'ui/ring/3', 'ui/ring/4', 'ui/ring/5',
      'ui/ring/unit/s', 'ui/ring/unit/m', 'ui/ring/unit/l',
      'ui/minimap/frame', 'ui/rally',
    ]);
  });

  it('selection rings match their footprint diamonds', () => {
    for (let size = 1; size <= 5; size++) {
      const f = ui.frames[`ui/ring/${size}`];
      expect(f.frame.w).toBe(size * 64);
      expect(f.frame.h).toBe(size * 32 + 2);
    }
  });
});

// ---------------------------------------------------------------- stage 2 (arming)

const unitsArmed = Object.keys(units.frames).some((n) => n.startsWith('unit/'));
const buildingsArmed = Object.keys(buildings.frames).some((n) => n.startsWith('bld/'));

describe.runIf(unitsArmed)('units atlas (stage 2, armed)', () => {
  it('stays within the contract GPU budget (single 2048×2048 texture)', () => {
    const meta = units.meta as unknown as { size: { w: number; h: number } };
    expect(meta.size.w).toBeLessThanOrEqual(2048);
    expect(meta.size.h).toBeLessThanOrEqual(2048);
  });

  it('anchors every frame inside its rect (feet anchor in the lower half)', () => {
    for (const [name, f] of Object.entries(units.frames)) {
      expect(f.anchor.x, name).toBeGreaterThanOrEqual(0);
      expect(f.anchor.x, name).toBeLessThanOrEqual(1);
      expect(f.anchor.y, name).toBeGreaterThanOrEqual(0);
      expect(f.anchor.y, name).toBeLessThanOrEqual(1.05); // feet sit at/near the frame bottom
      if (/\/(idle|walk)\//.test(name)) {
        expect(f.anchor.y, `${name} feet anchor`).toBeGreaterThan(0.5);
      }
    }
  });

  it('impact frames index into the 5-frame attack anim', () => {
    for (const [key, idx] of Object.entries(units.meta.bannerfall.impactFrame)) {
      expect(idx, key).toBeGreaterThanOrEqual(0);
      expect(idx, key).toBeLessThan(5);
    }
  });

  it('has full anim sets for every trainable unit in gameData', () => {
    const wanted: string[] = [];
    for (const u of trainableUnits) {
      const cavalry = u.classes.includes('cavalry');
      const anims: Array<[string, number]> = [
        ['idle', 2],
        ['walk', cavalry ? 8 : 6],
        ['die', 5],
        ['decay', 3],
      ];
      if (u.attacks.length > 0 || u.converts) anims.push(['attack', 5]);
      if (u.gather) anims.push(['gather', 4], ['carry', 6]);
      for (const [anim, count] of anims) {
        for (let dir = 0; dir <= 4; dir++) {
          for (let f = 0; f < count; f++) wanted.push(`unit/${u.id}/${anim}/${dir}/${f}`);
        }
      }
    }
    expectFrames(units, wanted);
  });

  it('marks the impact frame for every unit attack anim', () => {
    for (const u of trainableUnits) {
      if (u.attacks.length === 0 && !u.converts) continue;
      expect(units.meta.bannerfall.impactFrame[`unit/${u.id}/attack`]).toBeTypeOf('number');
    }
  });
});

describe.runIf(buildingsArmed)('buildings atlas (stage 2, armed)', () => {
  it('stays within a single 2048×2048 texture', () => {
    const meta = buildings.meta as unknown as { size: { w: number; h: number } };
    expect(meta.size.w).toBeLessThanOrEqual(2048);
    expect(meta.size.h).toBeLessThanOrEqual(2048);
  });

  it('has done/construct/rubble states for every building (farm exempt)', () => {
    const wanted: string[] = [];
    const AGES = ['dark', 'feudal', 'castle', 'imperial'];
    for (const b of Object.values(gameData.buildings)) {
      if (b.id === 'farm') continue; // contract: farm has no construct/rubble states
      if (b.id === 'townCenter' || b.id === 'house') {
        for (const age of AGES) wanted.push(`bld/${b.id}/${age}/done`);
      } else {
        wanted.push(`bld/${b.id}/done`);
      }
      wanted.push(`bld/${b.id}/construct0`, `bld/${b.id}/construct1`, `bld/${b.id}/construct2`, `bld/${b.id}/rubble`);
    }
    expectFrames(buildings, wanted);
  });
});

describe.runIf(!unitsArmed)('units atlas (stage 2 pending)', () => {
  it('is an empty, loadable atlas awaiting stage 2', () => {
    expect(Object.keys(units.frames)).toHaveLength(0);
  });
});

describe.runIf(!buildingsArmed)('buildings atlas (stage 2 pending)', () => {
  it('is an empty, loadable atlas awaiting stage 2', () => {
    expect(Object.keys(buildings.frames)).toHaveLength(0);
  });
});
