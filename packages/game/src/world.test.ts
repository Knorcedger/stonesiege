import { describe, expect, it } from 'vitest';
import type { Entity } from '@bf/sim/types';
import { resourceFrameName } from './world';

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
