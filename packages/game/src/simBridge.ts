// ALL sim construction goes through here. The renderer codes strictly against
// the @bf/sim types (packages/sim/src/types.ts); while the real engine lands in
// parallel this bridge serves the dev mock.
//
// INTEGRATOR: flip USE_MOCK to false to run the real @bf/sim engine (already
// imported below). Nothing else in @bf/game needs to change.

import type { Game, GameConfig } from '@bf/sim/types';
import { createGame as createRealGame } from '@bf/sim';
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
 * Per-launch random base + per-click monotonic bump: every Practice match gets a
 * fresh random map (GDD random-map skirmish). A fixed `= 1` initializer reset on
 * every page load, so the first match after each app launch always replayed seed
 * 1 — the same map, sheep, and wolf every session. Wall clock is fine HERE (the
 * determinism rules bind packages/sim only) because the chosen seed is recorded
 * in GameConfig and persisted with the match snapshot, so resume and replay
 * still reproduce the exact same game.
 */
let seedCounter = (Date.now() % 2147483647) + 1;

/**
 * Default 2-player practice setup: human (blue, Scots) vs a bot (red, English).
 * The bot controller itself (difficulty, scripts) is created in game.ts via
 * @bf/ai createBot — the sim config only marks the seat as non-human.
 */
export function practiceConfig(): GameConfig {
  return {
    seed: seedCounter++, // renderer-side seed pick; the sim itself stays deterministic per seed
    map: { type: 'practice-random', width: 120, height: 120 },
    players: [
      { name: 'You', civ: 'scots', team: 0, isHuman: true, color: 0 },
      { name: 'Opponent', civ: 'english', team: 0, isHuman: false, color: 1 },
    ],
    popCap: 100,
  };
}
