// ALL sim construction goes through here. The renderer codes strictly against
// the @bf/sim types (packages/sim/src/types.ts); while the real engine lands in
// parallel this bridge serves the dev mock.
//
// INTEGRATOR: flip USE_MOCK to false to run the real @bf/sim engine (already
// imported below). Nothing else in @bf/game needs to change.

import type { Game, GameConfig, GameSnapshot, PlayerSetup } from '@bf/sim/types';
import { createGame as createRealGame, createGameFromSnapshot } from '@bf/sim';
import type { BotDifficulty } from '@bf/ai';
import { campaignGameData, loadScenario, scenariosById, type ScenarioMeta } from '@bf/scenarios';
import { createMockGame } from './dev/mockSim';

export const USE_MOCK = false;

export function createGame(config: GameConfig): Game {
  if (USE_MOCK) {
    console.warn('[simBridge] USE_MOCK = true — running the dev mock sim, not @bf/sim.');
    return createMockGame(config);
  }
  return createRealGame(config);
}

/**
 * Fast-path resume: rebuild a game from a persisted game.serialize() blob.
 * Null for anything the sim rejects (schema mismatch, corrupt JSON, mock
 * blobs) — callers fall back to command-log replay.
 */
export function gameFromSerialized(blob: unknown): Game | null {
  if (USE_MOCK || blob === undefined || blob === null || typeof blob !== 'object') return null;
  try {
    return createGameFromSnapshot(blob as GameSnapshot);
  } catch {
    return null;
  }
}

/**
 * Per-launch random base + per-click monotonic bump: every Practice match gets a
 * fresh random map (GDD random-map skirmish). A fixed `= 1` initializer reset on
 * every page load, so the first match after each app launch always replayed seed
 * 1 — the same map, sheep, and wolf every session. Wall clock is fine HERE (the
 * determinism rules bind packages/sim only) because the chosen seed is recorded
 * in GameConfig and persisted with the match snapshot, so resume and replay
 * still reproduce the exact same game.
 */
let seedCounter = (Date.now() % 2147483647) + 1;

export function nextSeed(): number {
  return seedCounter++;
}

// ------------------------------------------------------------------ practice

export type PracticeMapSize = 'small' | 'medium' | 'large';

/** Tiles per side (GDD: 96–144 square maps). */
export const MAP_SIZE_TILES: Record<PracticeMapSize, number> = {
  small: 96,
  medium: 120,
  large: 144,
};

export interface PracticeSetup {
  mapSize: PracticeMapSize;
  /** 1..3 opponents, each with its own difficulty. */
  opponents: BotDifficulty[];
  /** Human civ id (@bf/data civs). */
  civ: string;
  /** Human player color index 0..7. */
  color: number;
}

export const DEFAULT_PRACTICE_SETUP: PracticeSetup = {
  mapSize: 'medium',
  opponents: ['standard'],
  civ: 'scots',
  color: 0,
};

const BOT_NAMES = ['Opponent', 'Second Foe', 'Third Foe'];

/**
 * Build the GameConfig for a practice skirmish: the human seat plus one bot
 * seat per opponent (all FFA). Bot civs alternate against the human pick;
 * bot colors take the lowest indexes the human left free.
 */
export function practiceConfig(setup: PracticeSetup = DEFAULT_PRACTICE_SETUP, seed = nextSeed()): GameConfig {
  const civIds = Object.keys(campaignGameData.civs);
  const botCivs = civIds.filter((c) => c !== setup.civ);
  if (botCivs.length === 0) botCivs.push(setup.civ);
  let colorCursor = 0;
  const nextColor = (): number => {
    while (colorCursor === setup.color) colorCursor++;
    return colorCursor++;
  };
  const players: PlayerSetup[] = [
    { name: 'You', civ: setup.civ, team: 0, isHuman: true, color: setup.color },
    ...setup.opponents.map((_, i) => ({
      name: BOT_NAMES[i] ?? `Foe ${i + 1}`,
      civ: botCivs[i % botCivs.length],
      team: 0,
      isHuman: false,
      color: nextColor(),
    })),
  ];
  const side = MAP_SIZE_TILES[setup.mapSize];
  return {
    seed,
    map: { type: 'practice-random', width: side, height: side },
    players,
    popCap: 100,
  };
}

// ------------------------------------------------------------------ scenario

export interface ScenarioGameSetup {
  config: GameConfig;
  meta: ScenarioMeta;
}

/**
 * Resolve an authored campaign scenario into a sim GameConfig (+ host meta).
 * Throws for unknown ids or validation failures — callers surface the error.
 * Campaign hero defs (heroWallace & co.) are canonical @bf/data units now, so
 * the sim spawns them natively; campaignGameData's placeholder merge is inert.
 */
export function scenarioConfig(scenarioId: string, seed = nextSeed()): ScenarioGameSetup {
  const def = scenariosById[scenarioId];
  if (!def) throw new Error(`unknown scenario '${scenarioId}'`);
  const { start, meta } = loadScenario(def, campaignGameData);
  return {
    config: {
      seed, map: start, players: meta.playerSetups, popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    },
    meta,
  };
}
