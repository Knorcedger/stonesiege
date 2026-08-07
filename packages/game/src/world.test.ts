import { describe, expect, it } from 'vitest';
import { FP, type Entity, type GameMap, type PlayerId } from '@bf/sim/types';
import { tileToWorld } from './camera';
import {
  buildingHpBarWidth, defaultRallyTilePoint, entityPickDistance,
  ownedResearchProgress, resourceFrameName,
} from './world';

const HUMAN = 1 as PlayerId;
const ENEMY = 2 as PlayerId;

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

  it('uses terrain and coarse map regions to create recognizable forest variety', () => {
    const map: GameMap = {
      width: 24, height: 24,
      terrain: new Uint8Array(24 * 24),
      terrainIds: ['grass', 'snow', 'dirt'],
    };
    map.terrain[3 * map.width + 3] = 1;
    map.terrain[4 * map.width + 4] = 2;
    expect(resourceFrameName(resource({ tileX: 3, tileY: 3 }), map)).toBe('obj/tree/1');
    expect(resourceFrameName(resource({ tileX: 4, tileY: 4 }), map)).toBe('obj/tree/2');
    const regions = new Set([
      resourceFrameName(resource({ tileX: 1, tileY: 1 }), map),
      resourceFrameName(resource({ tileX: 9, tileY: 1 }), map),
      resourceFrameName(resource({ tileX: 17, tileY: 17 }), map),
    ]);
    expect(regions.size).toBeGreaterThan(1);
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

describe('ownedResearchProgress', () => {
  const researching = resource({
    kind: 'building', defId: 'townCenter', player: HUMAN,
    hp: 2400, maxHp: 2400,
    research: { techId: 'feudalAge', ticksLeft: 75, totalTicks: 100 },
  });

  it('returns active progress only to the building owner', () => {
    expect(ownedResearchProgress(researching, HUMAN)).toBe(0.25);
    expect(ownedResearchProgress(researching, ENEMY)).toBeNull();
  });

  it('does not expose a bar for units or idle buildings', () => {
    expect(ownedResearchProgress(resource({ ...researching, kind: 'unit' }), HUMAN)).toBeNull();
    expect(ownedResearchProgress(resource({ ...researching, research: undefined }), HUMAN)).toBeNull();
  });
});

describe('defaultRallyTilePoint', () => {
  it('puts a selected Barracks flag beyond the center of its south edge', () => {
    const barracks = resource({ kind: 'building', defId: 'barracks', tileX: 10, tileY: 20 });
    expect(defaultRallyTilePoint(barracks)).toEqual([11.5, 23.5]);
  });
});

describe('buildingHpBarWidth', () => {
  it('uses half of the previous near-full-footprint width', () => {
    expect(buildingHpBarWidth(4)).toBe(124); // old Town Center bar: 248px
    expect(buildingHpBarWidth(3)).toBe(92); // old Barracks/Farm bar: 184px
  });
});
