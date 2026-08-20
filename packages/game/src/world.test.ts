import { describe, expect, it } from 'vitest';
import { FP, type Entity, type GameMap, type GameState, type PlayerId } from '@bf/sim/types';
import { tileToWorld } from './camera';
import {
  advanceGateOpenProgress, buildingHpBarWidth, defaultRallyTilePoint, entityPickDistance,
  mirroredWallIds, ownedResearchProgress, resourceFrameName, wallCornerJoins,
  rallyFlagWorldPoint, shouldFadeForUnit,
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

describe('rallyFlagWorldPoint', () => {
  const state = (entities: Entity[]): GameState => ({
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    players: [],
  } as unknown as GameState);

  it('resolves default, custom-ground, and live-target destinations', () => {
    const barracks = resource({
      id: 20, kind: 'building', defId: 'barracks', player: HUMAN,
      tileX: 10, tileY: 20, x: 11.5 * FP, y: 21.5 * FP, buildProgress: 1000,
    });
    expect(rallyFlagWorldPoint(state([barracks]), barracks))
      .toEqual(tileToWorld(11.5, 23.5));

    barracks.rally = { x: 20 * FP, y: 18 * FP };
    expect(rallyFlagWorldPoint(state([barracks]), barracks))
      .toEqual(tileToWorld(20, 18));

    const target = resource({ id: 21, x: 27 * FP, y: 12 * FP, tileX: 27, tileY: 12 });
    barracks.rally = { x: 1, y: 1, targetId: target.id };
    expect(rallyFlagWorldPoint(state([barracks, target]), barracks))
      .toEqual(tileToWorld(27, 12));
  });

  it('does not produce rally markers for non-production structures', () => {
    const house = resource({ kind: 'building', defId: 'house', player: HUMAN, buildProgress: 1000 });
    expect(rallyFlagWorldPoint(state([house]), house)).toBeNull();
  });
});

describe('shouldFadeForUnit', () => {
  const occluder = { left: 100, right: 180, top: 70, bottom: 150 };

  it('fades when visible unit artwork overlaps behind an obstacle', () => {
    const unit = { left: 125, right: 145, top: 80, bottom: 135 };
    expect(shouldFadeForUnit(occluder, 150, unit, 134)).toBe(true);
  });

  it('does not fade for a unit in front of or beside the obstacle', () => {
    const overlap = { left: 125, right: 145, top: 80, bottom: 135 };
    const beside = { left: 181, right: 205, top: 80, bottom: 135 };
    expect(shouldFadeForUnit(occluder, 150, overlap, 151)).toBe(false);
    expect(shouldFadeForUnit(occluder, 150, beside, 134)).toBe(false);
  });

  it('requires actual vertical artwork overlap', () => {
    const above = { left: 125, right: 145, top: 20, bottom: 69 };
    expect(shouldFadeForUnit(occluder, 150, above, 68)).toBe(false);
  });
});

describe('buildingHpBarWidth', () => {
  it('uses half of the previous near-full-footprint width', () => {
    expect(buildingHpBarWidth(4)).toBe(124); // old Town Center bar: 248px
    expect(buildingHpBarWidth(3)).toBe(92); // old Barracks/Farm bar: 184px
  });
});

describe('mirroredWallIds', () => {
  const wall = (id: number, tileX: number, tileY: number, defId = 'stoneWall'): Entity =>
    resource({ id, kind: 'building', defId, player: HUMAN, tileX, tileY, hp: 1800, maxHp: 1800 });

  it('mirrors perpendicular wall runs while leaving the primary axis and L-corners stable', () => {
    const walls = [
      wall(1, 4, 4), wall(2, 5, 4), wall(3, 6, 4),
      wall(4, 4, 5), wall(5, 4, 6), wall(6, 4, 7, 'gate'),
    ];
    expect([...mirroredWallIds(walls)].sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect(wallCornerJoins(walls).get(1)).toEqual({ xDir: 1, yDir: 1 });
  });

  it('describes all four corner directions without treating a T-junction as a corner', () => {
    const walls = [
      wall(1, 5, 5), wall(2, 6, 5), wall(3, 5, 6),
      wall(4, 10, 10), wall(5, 9, 10), wall(6, 10, 9),
      wall(7, 15, 15), wall(8, 16, 15), wall(9, 15, 14),
      wall(10, 20, 20), wall(11, 19, 20), wall(12, 20, 21),
      wall(13, 30, 30), wall(14, 29, 30), wall(15, 31, 30), wall(16, 30, 31),
    ];
    const corners = wallCornerJoins(walls);
    expect(corners.get(1)).toEqual({ xDir: 1, yDir: 1 });
    expect(corners.get(4)).toEqual({ xDir: -1, yDir: -1 });
    expect(corners.get(7)).toEqual({ xDir: 1, yDir: -1 });
    expect(corners.get(10)).toEqual({ xDir: -1, yDir: 1 });
    expect(corners.has(13)).toBe(false);
  });
});

describe('advanceGateOpenProgress', () => {
  it('opens and closes smoothly while clamping at both endpoints', () => {
    expect(advanceGateOpenProgress(0, true, 1)).toBeGreaterThan(0);
    expect(advanceGateOpenProgress(0.5, true, 999)).toBe(1);
    expect(advanceGateOpenProgress(0.5, false, 999)).toBe(0);
    expect(advanceGateOpenProgress(0.5, false, -1)).toBe(0.5);
  });
});
