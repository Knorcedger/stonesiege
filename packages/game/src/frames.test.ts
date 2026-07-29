import { describe, expect, it } from 'vitest';
import {
  animForActivity, animFrameIndex, bakedColorName, facingFromDelta, resolveFrameName,
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
    expect(animForActivity('carrying', true)).toBe('carry');
    expect(animForActivity('dying', false)).toBe('die');
    expect(animForActivity('idle', false)).toBe('idle');
  });

  it('loops looping anims and clamps die', () => {
    expect(animFrameIndex('walk', 0, 6)).toBe(0);
    expect(animFrameIndex('walk', 10, 6)).toBe((10 * 10) % 6);
    expect(animFrameIndex('die', 100, 5)).toBe(4);
    expect(animFrameIndex('idle', 5, 1)).toBe(0);
  });
});
