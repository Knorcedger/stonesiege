import { describe, expect, it } from 'vitest';
import { FP, type Entity } from '@bf/sim/types';
import { tileToWorld } from './camera';
import { entityPickDistance, resourceFrameName } from './world';

const resource = (patch: Partial<Entity> = {}): Entity => ({
  id: 7,
  kind: 'resource',
  defId: 'tree',
  player: 0,
  x: 0,
  y: 0,
  tileX: 0,
  tileY: 0,
  facing: 0,
  hp: 20,
  maxHp: 20,
  activity: 'idle',
  amountLeft: 100,
  resourceType: 'wood',
  ...patch,
});

describe('resourceFrameName', () => {
  it('replaces every depleted tree variant with the stump frame', () => {
    expect(resourceFrameName(resource())).toMatch(/^obj\/tree\/[0-2]$/);
    expect(resourceFrameName(resource({ stump: true, amountLeft: 0 }))).toBe('obj/stump');
  });
});

describe('entityPickDistance', () => {
  it('lets a direct click select a villager standing on a farm', () => {
    const farm = resource({
      kind: 'building', defId: 'farm', player: 1,
      x: 11.5 * FP, y: 10.5 * FP, tileX: 10, tileY: 9,
      hp: 480, maxHp: 480, buildProgress: 1000, amountLeft: 175,
    });
    const villager = resource({
      kind: 'unit', defId: 'villager', player: 1,
      x: 11.5 * FP, y: 10.5 * FP, tileX: 11, tileY: 10,
      hp: 25, maxHp: 25, amountLeft: undefined, resourceType: undefined,
    });
    const feet = tileToWorld(villager.x / FP, villager.y / FP);
    const bodyY = feet.y - 12;

    expect(entityPickDistance(villager, feet.x, bodyY))
      .toBeLessThan(entityPickDistance(farm, feet.x, bodyY));
    expect(entityPickDistance(farm, feet.x, bodyY)).toBe(1);
  });
});
