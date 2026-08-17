// Shared helpers for sim tests (not shipped to the game).

import type { Entity, GameConfig, GameMap, PlayerSetup, ScenarioStart, TerrainId } from './types';

export const TEST_TERRAIN_IDS: readonly TerrainId[] = [
  'grass', 'dirt', 'sand', 'water', 'shallows', 'road', 'farmland', 'snow', 'cliff',
];

export function grassMap(width: number, height: number): GameMap {
  return { width, height, terrain: new Uint8Array(width * height), terrainIds: TEST_TERRAIN_IDS };
}

export function player(overrides: Partial<PlayerSetup> = {}): PlayerSetup {
  return {
    name: 'P', civ: 'scots', team: 0, isHuman: false, color: 0, ...overrides,
  };
}

export function scenarioConfig(
  seed: number,
  map: GameMap,
  entities: ScenarioStart['entities'],
  players: PlayerSetup[],
  popCap = 200,
): GameConfig {
  return { seed, map: { type: 'scenario', map, entities }, players, popCap };
}

export function practiceConfig(seed: number, players: PlayerSetup[], size = 120, popCap = 100): GameConfig {
  return { seed, map: { type: 'practice-random', width: size, height: size }, players, popCap };
}

export function entitiesOf(
  entities: ReadonlyMap<number, Entity>, playerId: number, defId?: string,
): Entity[] {
  const out: Entity[] = [];
  for (const e of entities.values()) {
    if (e.player !== playerId) continue;
    if (defId !== undefined && e.defId !== defId) continue;
    out.push(e);
  }
  return out;
}

export function tileDist(a: { tileX: number; tileY: number }, b: { tileX: number; tileY: number }): number {
  return Math.max(Math.abs(a.tileX - b.tileX), Math.abs(a.tileY - b.tileY));
}
