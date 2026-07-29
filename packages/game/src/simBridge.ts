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

/** Monotonic seed counter: each Practice click gets a fresh (but reproducible) map. */
let seedCounter = 1;

/** Default 2-player practice setup: human (blue, Scots) vs idle bot (red, English). */
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
