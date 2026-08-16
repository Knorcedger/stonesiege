// createGame + the tick pipeline. Both map modes: seeded 'practice-random' generation and
// pre-resolved ScenarioStart. advance() applies commands, runs production, pathfinding,
// movement (with local avoidance), then the conquest elimination check, and returns the
// tick's events. createGameFromSnapshot resumes a Game.serialize() snapshot
// byte-identically (state restore lives in serialize.ts; both paths share finalizeGame).

import { gameData } from '@bf/data';
import { AGES, GAIA } from './types';
import type {
  Command, Game, GameConfig, GameMap, GameSnapshot, GameState, PlayerState, ScenarioStart,
  SimEvent, Stockpile,
} from './types';
import { SimRng } from './rng';
import { isTileWalkable, isTileWalkableForPlayer } from './internal';
import type { SimState, VisionGroup } from './internal';
import { SpatialGrid } from './spatial';
import { spawnEntity } from './entities';
import { buildModifierTable } from './stats';
import { revealAll } from './fog';
import { buildWalkTerrain, generatePracticeMap, makeEmptyMap } from './mapgen';
import { restoreSimState, serializeSimState } from './serialize';
import { applyCommands, checkEliminations } from './commands';
import { tickProduction } from './production';
import { tickPathfinding } from './path';
import { tickMovement } from './movement';
import {
  buildingFootprintOverlaps, buildAgeIndex, hasBuildPrereqs, rivalUnitOnFootprint, tickConstruction,
} from './construction';
import { rebuildModifiers } from './research';
import { tickRepair } from './repair';
import { tickGathering } from './gather';
import { tickAnimals } from './animals';
import { tickFlee } from './flee';
import { tickCombat } from './combat';
import { tickProjectiles } from './projectiles';
import { tickMonks } from './monks';
import { tickGarrison } from './garrison';
import { tickWonders } from './victory';
import { MARKET_START_RATES } from './market';
import { makeSimOps } from './ops';
import { hashState } from './hash';

/** AoE2 standard starting kit (see docs/AOE2_REFERENCE.md). */
const DEFAULT_STOCKPILE: Stockpile = { food: 200, wood: 200, gold: 100, stone: 200 };

/** AGE_CHAIN_TECHS[i] advances INTO AGES[i + 1] (castleAge requiresTech feudalAge, ...). */
const AGE_CHAIN_TECHS = ['feudalAge', 'castleAge', 'imperialAge'] as const;

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
      // A provided startingResources IS the complete kit (missing types = 0):
      // scenarios author exact stockpiles ("resources: {}" = destitute), so the
      // default kit must not bleed through. Absent = AoE2 standard start.
      stockpile: setup.startingResources !== undefined
        ? { food: 0, wood: 0, gold: 0, stone: 0, ...setup.startingResources }
        : { ...DEFAULT_STOCKPILE },
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
    conquest: !scenario, // practice = conquest; campaign defeat comes from triggers (GDD)
    popCapLimit: config.popCap,
    ...(config.maxAge !== undefined ? { maxAgeLimit: config.maxAge } : {}),
    walkTerrain: buildWalkTerrain(map),
    blockers: new Uint16Array(map.width * map.height),
    gatesByTile: new Map(),
    unitsGrid: new SpatialGrid(),
    motion: new Map(),
    pathSearches: [],
    nextGroupId: 1,
    visionGroupOf,
    vision,
    visionStamps: new Map(),
    foundations: new Map(),
    buildRetries: new Map(),
    modifiers: players.map((p) => buildModifierTable(p.setup.civ, p.age)),
    statsCache: new Map(),
    buildingStatsCache: new Map(),
    gather: new Map(),
    fleeing: new Map(),
    shelterIntents: new Map(),
    animalCd: new Map(),
    decayAcc: new Map(),
    repairs: new Map(),
    combat: new Map(),
    projectiles: [],
    buildingCd: new Map(),
    monks: new Map(),
    garrisoning: new Map(),
    healAcc: new Map(),
    corpses: new Map(),
    packTransitions: new Map(),
    marketRates: { ...MARKET_START_RATES },
    wonders: new Map(),
    alertNext: players.map(() => 0),
    ballistics: players.map(() => false),
    enabledUnits: players.map(() => new Set<string>()),
    enabledBuildings: players.map(() => new Set<string>()),
  };

  // A startingAge above Dark implies the age-chain techs below it were "already
  // researched": seed them (WITHOUT re-running effects — the age is already set) so
  // the next age-up stays reachable (castleAge requiresTech feudalAge, and so on).
  for (const p of players) {
    if (p.id === GAIA) continue;
    const ageIdx = AGES.indexOf(p.age);
    if (ageIdx <= 0) continue;
    for (let i = 0; i < ageIdx && i < AGE_CHAIN_TECHS.length; i++) {
      const techId = AGE_CHAIN_TECHS[i];
      if (gameData.techs[techId] && !p.researchedTechs.includes(techId)) {
        p.researchedTechs.push(techId);
      }
    }
    rebuildModifiers(state, p.id); // age techs carry no passives today; rebuild anyway
  }

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

  return finalizeGame(state);
}

/**
 * Resume a game from a Game.serialize() snapshot. The restored game continues
 * byte-identically to the original run (proved by serialize.test.ts: 500 post-resume
 * ticks hash equal every 100). Rejects snapshots with a mismatched schemaVersion.
 */
export function createGameFromSnapshot(snapshot: GameSnapshot): Game {
  return finalizeGame(restoreSimState(snapshot));
}

/** Wrap a fully initialized SimState in the public Game surface (tick pipeline + ops). */
function finalizeGame(state: SimState): Game {
  const advance = (commands: Command[]): SimEvent[] => {
    if (state.finished) return [];
    const events: SimEvent[] = [];
    applyCommands(state, commands, events);
    if (!state.finished) { // a resign in this batch may have ended the game: freeze the terminal state
      tickProduction(state, events); // shared queue: training + research completion
      tickPathfinding(state);
      tickMovement(state);
      tickCombat(state, events); // after movement: engage/fire from post-move positions
      tickProjectiles(state, events); // in-flight shots land
      tickMonks(state, events); // heal channels + conversions
      tickConstruction(state, events); // after movement so same-tick arrivals start building
      tickRepair(state, events);
      tickGathering(state, events); // same-tick arrivals start gathering too
      tickAnimals(state, events); // wander / wolf aggro / sheep claiming / carcass rot
      tickGarrison(state, events); // explicit garrison entries + garrison healing
      tickFlee(state); // damaged villagers reach + enter garrisons
      tickWonders(state, events); // wonder countdown / victory
      checkEliminations(state, events); // GDD conquest elimination — after all removals this tick
    }
    state.tick++;
    return events;
  };

  return {
    get state(): GameState { return state; },
    advance,
    hash: () => hashState(state),
    serialize: () => serializeSimState(state),
    ops: makeSimOps(state),
    canPlace: (player, defId, tileX, tileY) => {
      const def = gameData.buildings[defId];
      if (!def) return false;
      if (player <= GAIA || player >= state.players.length) return false;
      // construction age gate (TC: castle age per GDD, even though the def is 'dark');
      // an enableBuilding effect overrides age/civ/prereq gates (hasBuildPrereqs)
      const enabled = state.enabledBuildings[player]?.has(defId) === true;
      if (!enabled && buildAgeIndex(def) > AGES.indexOf(state.players[player].age)) return false;
      // prerequisite buildings/techs (Farm needs a Mill, Stable a Barracks, ...)
      if (!hasBuildPrereqs(state, player, def)) return false;
      for (let dy = 0; dy < def.size; dy++) {
        for (let dx = 0; dx < def.size; dx++) {
          const x = tileX + dx, y = tileY + dy;
          if (!isTileWalkable(state, x, y)) return false;
        }
      }
      // rival units on the footprint block placement (own + Gaia units are nudged off)
      if (rivalUnitOnFootprint(state, player, tileX, tileY, def.size)) return false;
      if (buildingFootprintOverlaps(state, tileX, tileY, def.size)) return false;
      return true;
    },
    isWalkable: (tileX, tileY, player) => player === undefined
      ? isTileWalkable(state, tileX, tileY)
      : isTileWalkableForPlayer(state, tileX, tileY, player),
  };
}
