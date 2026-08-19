import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import {
  PRACTICE_MAP_VALIDATION_PROFILE,
  validateMap,
} from './mapValidation';
import type { GameMap, ScenarioStart } from './types';
import {
  grassMap, player, practiceConfig, scenarioConfig,
} from './testutil';

function issueCodes(game: ReturnType<typeof createGame>): string[] {
  return validateMap(game).issues.map((issue) => issue.code);
}

function setTerrain(map: GameMap, x: number, y: number, terrainIndex: number): void {
  map.terrain[y * map.width + x] = terrainIndex;
}

describe('map validation reports', () => {
  it('accepts a generated Practice map and is byte-stable without mutating the game', () => {
    const game = createGame(practiceConfig(4242, [
      player({ name: 'North', color: 0 }),
      player({ name: 'South', civ: 'english', color: 1 }),
      player({ name: 'East', civ: 'vikings', color: 2 }),
    ], 96));
    const before = JSON.stringify(game.serialize());

    const first = validateMap(game);
    const second = validateMap(game);

    expect(first.valid, first.issues.map((issue) => issue.message).join('\n')).toBe(true);
    expect(first.schemaVersion).toBe(1);
    expect(first.profile.id).toBe('practice-land-v1');
    expect(first.map.movementComponentCount).toBe(1);
    expect(first.players).toHaveLength(3);
    for (const report of first.players) {
      expect(report.startDefId).toBe('townCenter');
      expect(report.movementComponentId).toBe(first.map.mainMovementComponentId);
      expect(report.buildablePlacements).toBeGreaterThanOrEqual(
        PRACTICE_MAP_VALIDATION_PROFILE.minimumBuildablePlacements,
      );
      for (const resource of ['food', 'wood', 'gold', 'stone'] as const) {
        expect(report.resources[resource].reachableNodes, `${report.playerId} ${resource}`)
          .toBeGreaterThanOrEqual(
            PRACTICE_MAP_VALIDATION_PROFILE.minimumReachableResourceNodes[resource],
          );
      }
    }
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(game.serialize())).toBe(before);
  });

  it('keeps forests and river-adjacent mine clusters reachable on reported seeds', () => {
    for (const testCase of [{ seed: 5, players: 4 }, { seed: 6, players: 2 }]) {
      const players = Array.from({ length: testCase.players }, (_, index) => player({
        name: `P${index + 1}`,
        civ: index % 2 === 0 ? 'scots' : 'english',
        color: index,
      }));
      const game = createGame(practiceConfig(testCase.seed, players, 96));

      const report = validateMap(game);
      expect(
        report.issues.filter((issue) => issue.code === 'SEALED_RESOURCE_CLUSTER'),
        `seed ${testCase.seed}, ${testCase.players} players`,
      ).toEqual([]);
    }
  });

  it('reports unsafe starts that are closer than the selected profile permits', () => {
    const game = createGame(scenarioConfig(1, grassMap(48, 48), [
      { defId: 'townCenter', player: 1, tileX: 6, tileY: 18 },
      { defId: 'townCenter', player: 2, tileX: 20, tileY: 18 },
    ], [player(), player({ civ: 'english', color: 1 })]));

    expect(issueCodes(game)).toContain('STARTS_TOO_CLOSE');
  });

  it('reports a start with no walkable access beside its footprint', () => {
    const entities: ScenarioStart['entities'] = [
      { defId: 'townCenter', player: 1, tileX: 10, tileY: 10 },
    ];
    for (let y = 9; y <= 14; y++) {
      for (let x = 9; x <= 14; x++) {
        const insideTownCenter = x >= 10 && x <= 13 && y >= 10 && y <= 13;
        if (!insideTownCenter) entities.push({ defId: 'tree', player: 0, tileX: x, tileY: y });
      }
    }
    const game = createGame(scenarioConfig(6, grassMap(32, 32), entities, [player()]));

    expect(issueCodes(game)).toContain('START_NO_ACCESS');
  });

  it('reports disconnected passable terrain and a start outside the main component', () => {
    const map = grassMap(48, 32);
    for (let y = 0; y < map.height; y++) setTerrain(map, 24, y, 3); // deep water wall
    const game = createGame(scenarioConfig(2, map, [
      { defId: 'townCenter', player: 1, tileX: 6, tileY: 12 },
      { defId: 'townCenter', player: 2, tileX: 35, tileY: 12 },
    ], [player(), player({ civ: 'english', color: 1 })]));

    const codes = issueCodes(game);
    expect(codes).toContain('DISCONNECTED_MOVEMENT_REGION');
    expect(codes).toContain('START_OUTSIDE_MAIN_COMPONENT');
  });

  it('reports a nearby resource cluster sealed behind blockers', () => {
    const entities: ScenarioStart['entities'] = [
      { defId: 'townCenter', player: 1, tileX: 4, tileY: 18 },
      { defId: 'goldMine', player: 0, tileX: 20, tileY: 20 },
    ];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx !== 0 || dy !== 0) {
          entities.push({ defId: 'tree', player: 0, tileX: 20 + dx, tileY: 20 + dy });
        }
      }
    }
    const game = createGame(scenarioConfig(3, grassMap(48, 48), entities, [player()]));

    const sealedGold = validateMap(game).issues.find(
      (issue) => issue.code === 'SEALED_RESOURCE_CLUSTER' && issue.resource === 'gold',
    );
    expect(sealedGold).toMatchObject({ playerId: 1, x: 20, y: 20 });
  });

  it('reports insufficient construction room around a cramped start', () => {
    const entities: ScenarioStart['entities'] = [
      { defId: 'townCenter', player: 1, tileX: 8, tileY: 8 },
    ];
    for (let y = 0; y <= 26; y++) {
      for (let x = 0; x <= 26; x++) {
        const insideTownCenter = x >= 8 && x <= 11 && y >= 8 && y <= 11;
        const accessCorridor = y === 10 && x >= 12;
        if (!insideTownCenter && !accessCorridor) {
          entities.push({ defId: 'tree', player: 0, tileX: x, tileY: y });
        }
      }
    }
    const game = createGame(scenarioConfig(4, grassMap(48, 48), entities, [player()]));

    expect(issueCodes(game)).toContain('START_BUILDABLE_SPACE_LOW');
  });

  it('reports a strategic crossing narrower than the profile minimum', () => {
    const map = grassMap(64, 40);
    for (let y = 0; y < map.height; y++) {
      for (let x = 30; x <= 32; x++) setTerrain(map, x, y, 3); // deep water
    }
    for (let x = 30; x <= 32; x++) setTerrain(map, x, 20, 4); // one-tile-wide ford
    const game = createGame(scenarioConfig(5, map, [
      { defId: 'townCenter', player: 1, tileX: 7, tileY: 17 },
      { defId: 'townCenter', player: 2, tileX: 49, tileY: 17 },
    ], [player(), player({ civ: 'english', color: 1 })]));

    const report = validateMap(game);
    expect(report.map.movementComponentCount).toBe(1);
    expect(report.strategicCrossings).toContainEqual(expect.objectContaining({
      minimumWidth: 1,
      containsShallows: true,
      separatesLargeRegions: true,
    }));
    expect(report.issues.map((issue) => issue.code)).toContain('NARROW_STRATEGIC_CROSSING');
  });
});
