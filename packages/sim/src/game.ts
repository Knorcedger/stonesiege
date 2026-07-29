// createGame + the tick pipeline. Both map modes: seeded 'practice-random' generation and
// pre-resolved ScenarioStart. advance() applies commands, runs production, pathfinding,
// movement (with local avoidance) and returns the tick's events.

import { gameData } from '@bf/data';
import { GAIA } from './types';
import type {
  Command, Game, GameConfig, GameMap, GameState, PlayerState, ScenarioStart, SimEvent, Stockpile,
} from './types';
import { SimRng } from './rng';
import { isTileWalkable } from './internal';
import type { SimState, VisionGroup } from './internal';
import { SpatialGrid } from './spatial';
import { spawnEntity } from './entities';
import { buildModifierTable } from './stats';
import { revealAll } from './fog';
import { generatePracticeMap, makeEmptyMap } from './mapgen';
import { applyCommands } from './commands';
import { tickProduction } from './production';
import { tickPathfinding } from './path';
import { tickMovement } from './movement';
import { hashState } from './hash';

/** AoE2 standard starting kit (see docs/AOE2_REFERENCE.md). */
const DEFAULT_STOCKPILE: Stockpile = { food: 200, wood: 200, gold: 100, stone: 200 };

function buildWalkTerrain(map: GameMap): Uint8Array {
  const walk = new Uint8Array(map.width * map.height);
  // resolve passability through terrainIds so scenario maps with custom index order work
  const passableIndex = new Uint8Array(map.terrainIds.length);
  for (let i = 0; i < map.terrainIds.length; i++) {
    passableIndex[i] = map.terrainIds[i] === 'water' ? 0 : 1;
  }
  for (let i = 0; i < walk.length; i++) walk[i] = passableIndex[map.terrain[i]] ?? 1;
  return walk;
}

function makePlayers(config: GameConfig, map: GameMap): { players: PlayerState[]; vision: VisionGroup[]; visionGroupOf: number[] } {
  const tiles = map.width * map.height;
  const players: PlayerState[] = [];
  const vision: VisionGroup[] = [];
  const visionGroupOf: number[] = [];
  const teamGroup = new Map<number, number>();

  // Gaia: inert player with a dark, never-updated visibility grid
  players.push({
    id: GAIA,
    setup: { name: 'Gaia', civ: 'gaia', team: 0, isHuman: false, color: 0 },
    stockpile: { food: 0, wood: 0, gold: 0, stone: 0 },
    age: 'dark', pop: 0, popCap: 0, researchedTechs: [], defeated: false,
    visibility: new Uint8Array(tiles),
  });
  visionGroupOf.push(-1);

  config.players.forEach((setup, i) => {
    const id = i + 1;
    let group: number;
    if (setup.team > 0 && teamGroup.has(setup.team)) {
      group = teamGroup.get(setup.team)!; // allies share vision arrays
    } else {
      group = vision.length;
      vision.push({ counts: new Uint16Array(tiles), visibility: new Uint8Array(tiles) });
      if (setup.team > 0) teamGroup.set(setup.team, group);
    }
    visionGroupOf.push(group);
    players.push({
      id,
      setup,
      stockpile: { ...DEFAULT_STOCKPILE, ...setup.startingResources },
      age: setup.startingAge ?? 'dark',
      pop: 0,
      popCap: 0,
      researchedTechs: [],
      defeated: false,
      visibility: vision[group].visibility,
    });
  });
  return { players, vision, visionGroupOf };
}

export function createGame(config: GameConfig): Game {
  const rng = new SimRng(config.seed);
  const mapCfg = config.map;
  const scenario: ScenarioStart | null = mapCfg.type === 'scenario' ? mapCfg : null;
  const map: GameMap = mapCfg.type === 'scenario' ? mapCfg.map : makeEmptyMap(mapCfg.width, mapCfg.height);

  const { players, vision, visionGroupOf } = makePlayers(config, map);

  const state: SimState = {
    tick: 0,
    map,
    entities: new Map(),
    players,
    refs: new Map(),
    finished: false,
    rng,
    nextId: 1,
    popCapLimit: config.popCap,
    walkTerrain: buildWalkTerrain(map),
    blockers: new Uint16Array(map.width * map.height),
    unitsGrid: new SpatialGrid(),
    motion: new Map(),
    pathSearches: [],
    nextGroupId: 1,
    visionGroupOf,
    vision,
    visionStamps: new Map(),
    modifiers: players.map((p) => buildModifierTable(p.setup.civ, p.age)),
    statsCache: new Map(),
  };

  if (scenario) {
    for (const init of scenario.entities) {
      spawnEntity(state, {
        defId: init.defId, player: init.player, tileX: init.tileX, tileY: init.tileY,
        hp: init.hp, facing: init.facing, amountLeft: init.amountLeft, ref: init.ref,
      });
    }
    if (scenario.revealAll) revealAll(state);
  } else {
    generatePracticeMap(state, rng.fork(1));
  }

  const advance = (commands: Command[]): SimEvent[] => {
    if (state.finished) return [];
    const events: SimEvent[] = [];
    applyCommands(state, commands, events);
    tickProduction(state, events);
    tickPathfinding(state);
    tickMovement(state);
    state.tick++;
    return events;
  };

  return {
    get state(): GameState { return state; },
    advance,
    hash: () => hashState(state),
    canPlace: (player, defId, tileX, tileY) => {
      const def = gameData.buildings[defId];
      if (!def) return false;
      if (player <= GAIA || player >= state.players.length) return false;
      for (let dy = 0; dy < def.size; dy++) {
        for (let dx = 0; dx < def.size; dx++) {
          const x = tileX + dx, y = tileY + dy;
          if (!isTileWalkable(state, x, y)) return false;
        }
      }
      return true;
    },
    isWalkable: (tileX, tileY) => isTileWalkable(state, tileX, tileY),
  };
}
