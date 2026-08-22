import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import {
  ANIM_FPS, animForActivity, animFrameIndex, bakedColorName, buildingArtScale,
  buildingFrameChoice, buildingSpriteScale, facingFromDelta, villagerWorkAnim,
  placementGhostFrames, resolveFrameName, unitRig,
} from './frames';

describe('resolveFrameName (mirrored dirs per ASSET_CONTRACT)', () => {
  it('passes through authored dirs 0-4', () => {
    for (const dir of [0, 1, 2, 3, 4]) {
      const r = resolveFrameName(`unit/militia/walk/${dir}/2`);
      expect(r).toEqual({ name: `unit/militia/walk/${dir}/2`, mirrored: false });
    }
  });

  it('mirrors 5->3, 6->2, 7->1', () => {
    expect(resolveFrameName('unit/militia/walk/5/2')).toEqual({ name: 'unit/militia/walk/3/2', mirrored: true });
    expect(resolveFrameName('unit/militia/walk/6/0')).toEqual({ name: 'unit/militia/walk/2/0', mirrored: true });
    expect(resolveFrameName('unit/villager/attack/7/4')).toEqual({ name: 'unit/villager/attack/1/4', mirrored: true });
  });

  it('mirrors obj/ animals the same way', () => {
    expect(resolveFrameName('obj/sheep/walk/6/1')).toEqual({ name: 'obj/sheep/walk/2/1', mirrored: true });
  });

  it('never mirrors terrain, buildings, icons, or 8-rotation projectiles', () => {
    for (const name of ['terr/grass/0', 'bld/townCenter/dark/done', 'icon/villager', 'obj/proj/arrow/6', 'ui/hp']) {
      expect(resolveFrameName(name)).toEqual({ name, mirrored: false });
    }
  });
});

describe('bakedColorName', () => {
  it('inserts the @p token after the defId segment', () => {
    expect(bakedColorName('unit/villager/walk/0/0', 2)).toBe('unit/villager@p2/walk/0/0');
    expect(bakedColorName('obj/sheep/idle/0/0', 7)).toBe('obj/sheep@p7/idle/0/0');
  });
});

describe('unitRig (civilization unique units)', () => {
  it('keeps every civilization unique unit on its dedicated runtime rig', () => {
    for (const id of ['housecarl', 'chevalier', 'mangudai', 'cataphract', 'mamluk']) {
      expect(unitRig(id)).toEqual({ spriteId: id, prefix: 'unit' });
      expect(gameData.units[id].icon).toBe(`icon/${id}`);
    }
  });

  it('reuses each civilization rig for its elite without reusing its icon', () => {
    for (const [eliteId, baseId] of [
      ['eliteHousecarl', 'housecarl'],
      ['eliteChevalier', 'chevalier'],
      ['eliteMangudai', 'mangudai'],
      ['eliteCataphract', 'cataphract'],
      ['eliteMamluk', 'mamluk'],
    ]) {
      expect(unitRig(eliteId)).toEqual({ spriteId: baseId, prefix: 'unit' });
      expect(gameData.units[eliteId].icon).toBe(`icon/${eliteId}`);
    }
  });
});

describe('placementGhostFrames (building placement ghost)', () => {
  it('ordinary buildings try the per-age variant, then the plain done frame', () => {
    expect(placementGhostFrames('house', 'feudal')).toEqual(['bld/house/feudal/done', 'bld/house/done']);
    expect(placementGhostFrames('barracks', 'dark')).toEqual(['bld/barracks/dark/done', 'bld/barracks/done']);
  });

  it('farms preview the mature field — they have NO bld/ frames (ASSET_CONTRACT)', () => {
    // regression: resolving bld/farm/done drew the magenta missing-frame box on
    // every farm placement (the most-placed building in the game)
    expect(placementGhostFrames('farm', 'dark')).toEqual(['obj/farm/2']);
    // rule is providesFood-driven, mirroring sim farms.ts, not a defId string match
    for (const def of Object.values(gameData.buildings)) {
      const frames = placementGhostFrames(def.id, 'castle');
      if (def.providesFood !== undefined) expect(frames).toEqual(['obj/farm/2']);
      else expect(frames[0].startsWith('bld/')).toBe(true);
    }
  });
});

describe('buildingSpriteScale (one art scale for every drawn bld/ frame)', () => {
  // Regression: the fog-remembered ghost and the placement preview each scaled by
  // frame.renderScale alone, so a scouted watch tower redrew at 1/2.55 of the size
  // of the live tower — a doll house sitting in the fog.
  const FORTIFICATIONS = ['stoneWall', 'gate', 'watchTower', 'guardTower', 'keep'];

  it('scales fortification art up to building scale', () => {
    for (const defId of FORTIFICATIONS) {
      const art = buildingArtScale(defId);
      expect(art.x).toBeGreaterThan(1);
      expect(art.y).toBeGreaterThan(1);
      expect(buildingSpriteScale(defId, 0.5, false)).toEqual({ x: 0.5 * art.x, y: 0.5 * art.y });
    }
  });

  it('leaves every other building — and every unit frame — at the atlas density scale', () => {
    for (const def of Object.values(gameData.buildings)) {
      if (FORTIFICATIONS.includes(def.id)) continue;
      expect(buildingSpriteScale(def.id, 0.5, false)).toEqual({ x: 0.5, y: 0.5 });
    }
    expect(buildingSpriteScale('villager', 0.25, false)).toEqual({ x: 0.25, y: 0.25 });
  });

  it('flips only x when mirrored, keeping the drawn size identical', () => {
    const plain = buildingSpriteScale('stoneWall', 0.5, false);
    const mirrored = buildingSpriteScale('stoneWall', 0.5, true);
    expect(mirrored.x).toBe(-plain.x);
    expect(mirrored.y).toBe(plain.y);
  });

  it('never mutates the shared no-scale record', () => {
    buildingSpriteScale('house', 2, true);
    expect(buildingArtScale('house')).toEqual({ x: 1, y: 1 });
  });
});

describe('buildingFrameChoice (shared by the live sprite and the fog ghost)', () => {
  it('walks the three construct stages before the done frame', () => {
    expect(buildingFrameChoice('watchTower', 0, 'feudal').candidates).toEqual(['bld/watchTower/construct0']);
    expect(buildingFrameChoice('watchTower', 333, 'feudal').candidates).toEqual(['bld/watchTower/construct0']);
    expect(buildingFrameChoice('watchTower', 334, 'feudal').candidates).toEqual(['bld/watchTower/construct1']);
    expect(buildingFrameChoice('watchTower', 666, 'feudal').candidates).toEqual(['bld/watchTower/construct1']);
    expect(buildingFrameChoice('watchTower', 667, 'feudal').candidates).toEqual(['bld/watchTower/construct2']);
    expect(buildingFrameChoice('watchTower', 1000, 'feudal').candidates)
      .toEqual(['bld/watchTower/feudal/done', 'bld/watchTower/done']);
  });

  it('tries the per-age variant first and always keeps a resolvable fallback last', () => {
    for (const age of ['dark', 'feudal', 'castle', 'imperial']) {
      const { candidates } = buildingFrameChoice('townCenter', 1000, age);
      expect(candidates[0]).toBe(`bld/townCenter/${age}/done`);
      expect(candidates[candidates.length - 1]).toBe('bld/townCenter/done');
    }
  });

  it('draws farms as obj/farm/<stage>, exhausted plots included', () => {
    expect(buildingFrameChoice('farm', 1000, 'dark', 120).candidates).toEqual(['obj/farm/3']);
    expect(buildingFrameChoice('farm', 1000, 'dark', 0).candidates).toEqual(['obj/farm/4']);
    const seeded = buildingFrameChoice('farm', 500, 'dark');
    expect(seeded.candidates).toEqual(['obj/farm/0']);
    expect(seeded.alpha).toBeCloseTo(0.675);
    expect(buildingFrameChoice('farm', 1000, 'dark').alpha).toBe(1);
  });
});

describe('facingFromDelta (0 = S toward camera, clockwise)', () => {
  it('maps tile-space deltas to screen dirs', () => {
    expect(facingFromDelta(1, 1)).toBe(0); // screen down = S
    expect(facingFromDelta(0, 1)).toBe(1); // SW
    expect(facingFromDelta(-1, 1)).toBe(2); // W
    expect(facingFromDelta(-1, 0)).toBe(3); // NW
    expect(facingFromDelta(-1, -1)).toBe(4); // N
    expect(facingFromDelta(0, -1)).toBe(5); // NE
    expect(facingFromDelta(1, -1)).toBe(6); // E
    expect(facingFromDelta(1, 0)).toBe(7); // SE
  });

  it('returns the fallback for zero vectors', () => {
    expect(facingFromDelta(0, 0, 3)).toBe(3);
  });
});

describe('anim helpers', () => {
  it('maps activities to contract anims', () => {
    expect(animForActivity('moving', false)).toBe('walk');
    expect(animForActivity('gathering', true)).toBe('gather');
    expect(animForActivity('gathering', false)).toBe('attack');
    expect(animForActivity('carrying', true)).toBe('walk');
    expect(animForActivity('dying', false)).toBe('die');
    expect(animForActivity('idle', false)).toBe('idle');
    expect(villagerWorkAnim('gathering', 'tree')).toBe('chop');
    expect(villagerWorkAnim('gathering', 'farm')).toBe('farm');
    expect(villagerWorkAnim('gathering', 'berryBush')).toBe('forage');
    expect(villagerWorkAnim('gathering', 'stoneMine')).toBe('mine');
    expect(villagerWorkAnim('repairing', 'townCenter')).toBe('build');
  });

  it('loops looping anims and clamps die', () => {
    expect(animFrameIndex('walk', 0, 6)).toBe(0);
    expect(animFrameIndex('walk', 10, 6)).toBe((10 * 10) % 6);
    expect(animFrameIndex('die', 100, 5)).toBe(4);
    expect(animFrameIndex('idle', 5, 1)).toBe(0);
  });

  it('never returns a negative frame for a negative animation age', () => {
    // Regression: with the sim tick frozen at game end, the interpolated clock
    // could run slightly backward — frame index must clamp to 0, not -1.
    expect(animFrameIndex('walk', -0.001, 6)).toBe(0);
    expect(animFrameIndex('attack', -3, 5)).toBe(0);
    expect(animFrameIndex('die', -1, 5)).toBe(0);
  });

  it('settles a farmer into the crouched work pose instead of bobbing upright', () => {
    expect(animFrameIndex('farm', 0, 4)).toBe(0);
    expect(animFrameIndex('farm', 0.2, 4)).toBe(1);
    expect(animFrameIndex('farm', 0.4, 4)).toBe(2);
    expect(animFrameIndex('farm', 30, 4)).toBe(2);
  });

  it('paces berry foraging with readable contact and recovery holds', () => {
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6]
      .map((seconds) => animFrameIndex('forage', seconds, 4));
    expect(frames).toEqual([0, 1, 2, 2, 2, 3, 0, 0, 0]);
  });

  it('paces tool work below combat speed and holds its impact frame', () => {
    const frames = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]
      .map((seconds) => animFrameIndex('mine', seconds, 4));
    expect(frames).toEqual([0, 1, 2, 2, 3, 0, 0]);
    expect(ANIM_FPS.mine).toBeLessThan(ANIM_FPS.attack);
  });
});
