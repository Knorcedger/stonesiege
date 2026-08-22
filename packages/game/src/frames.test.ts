import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import {
  ANIM_FPS, animForActivity, animFrameIndex, bakedColorName, facingFromDelta, villagerWorkAnim,
  placementGhostFrames, resolveFrameName, unitRig,
  heroAccentFor, heroDrawScale, heroTintFor, isHeroUnit, HERO_DRAW_SCALE,
} from './frames';
import { hexToRgb, UNIT_CLOTH_RAMP, UNIT_METAL_RAMP } from './recolor';

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

describe('hero art (campaign protagonists share a rank-and-file rig)', () => {
  it('knows a hero from the soldiers he fights beside', () => {
    expect(isHeroUnit('heroWallace')).toBe(true);
    expect(isHeroUnit('heroEdward')).toBe(true);
    expect(isHeroUnit('militia')).toBe(false);
    expect(isHeroUnit('champion')).toBe(false);
    expect(isHeroUnit('nosuchunit')).toBe(false);
  });

  it('accents a hero onto both outfit ramps of the rig he aliases', () => {
    const wallace = heroAccentFor('heroWallace');
    expect(wallace).toBeDefined();
    expect(wallace!.id).toBe('heroWallace');
    // Cloth AND metal: a militia rig is all tunic, a champion rig is all harness and
    // carries no cloth pixel at all, so aiming at one family only would miss half the
    // roster (packages/game/src/heroArt.test.ts measures this against the real atlas).
    expect(wallace!.from).toEqual([...UNIT_CLOTH_RAMP, ...UNIT_METAL_RAMP].map(hexToRgb));
    expect(wallace!.to).toHaveLength(wallace!.from.length);
    expect(wallace!.to).not.toEqual(wallace!.from);
    // Both families land on the same hero ramp, light→light and dark→dark.
    expect(wallace!.to.slice(0, 3)).toEqual(wallace!.to.slice(3));
  });

  it('gives Wallace a different tunic from the militia rig he renders as', () => {
    expect(unitRig('heroWallace').spriteId).toBe('champion');
    expect(heroAccentFor('champion')).toBeUndefined();
    expect(heroAccentFor('militia')).toBeUndefined();
  });

  it('tints a hero with a lifted version of his own hue', () => {
    const wallace = heroTintFor('heroWallace')!;
    expect(wallace).toBeDefined();
    const [r, g, b] = [(wallace >> 16) & 0xff, (wallace >> 8) & 0xff, wallace & 0xff];
    // Normalised to a fixed peak: a raw mid/dark tone would smother the sprite.
    expect(Math.max(r, g, b)).toBe(0xe8);
    // Water blue: the hue of the authored ramp survives the lift.
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(heroTintFor('militia')).toBeUndefined();
    expect(heroTintFor('champion')).toBeUndefined();
  });

  it('keeps every hero tint bright enough to read as dye, not soot', () => {
    for (const u of Object.values(gameData.units).filter((d) => d.hero)) {
      const tint = heroTintFor(u.id)!;
      const channels = [(tint >> 16) & 0xff, (tint >> 8) & 0xff, tint & 0xff];
      expect(Math.max(...channels), u.id).toBe(0xe8);
      // A grey tint multiplies to a dimmer copy of the same unit — no accent at all.
      expect(Math.max(...channels) - Math.min(...channels), `${u.id} saturation`)
        .toBeGreaterThan(40);
    }
  });

  it('draws heroes a step larger than the rank and file', () => {
    expect(heroDrawScale('heroWallace')).toBe(HERO_DRAW_SCALE);
    expect(HERO_DRAW_SCALE).toBeGreaterThan(1);
    expect(HERO_DRAW_SCALE).toBeLessThan(1.3); // must still sit on its tile
    expect(heroDrawScale('militia')).toBe(1);
  });
});
