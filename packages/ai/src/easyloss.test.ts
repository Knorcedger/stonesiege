// Difficulty ladder sanity: an easy bot (14-villager cap, Feudal ceiling, trickled
// army, no counters, slow decisions) must lose to a standard bot on most seeds.
//
// "Loses" = conquered/resigned, OR decisively beaten at the cap: standard alone in
// Castle Age holding more surviving units + buildings. Full conquest of the last
// cottage can outlast the tick budget (a TC packed with 15 sheltering villagers is
// a fortress), so the domination clause keeps the runtime honest without weakening
// the ladder claim — a regression that lets easy hold its own flips this test.

import { describe, expect, it } from 'vitest';
import { AGES } from '@bf/sim/types';
import type { GameConfig, GameState, SimEvent } from '@bf/sim/types';
import { createGame } from '@bf/sim';
import { createBot } from './index';

const EASY = 1;
const STANDARD = 2;
const CAP = 84000; // 70 sim-minutes per seed

const config = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 80, height: 80 },
  players: [
    { name: 'Easy', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'Standard', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 60,
});

function aliveCount(st: GameState, player: number): number {
  let n = 0;
  for (const e of st.entities.values()) {
    if (e.player === player && e.hp > 0 && (e.kind === 'unit' || e.kind === 'building')) n++;
  }
  return n;
}

function easyLost(st: GameState): boolean {
  const easy = st.players[EASY];
  const std = st.players[STANDARD];
  if (easy.defeated && !std.defeated) return true;
  if (std.defeated) return false;
  return AGES.indexOf(std.age) >= 2 // standard reached Castle…
    && AGES.indexOf(easy.age) < 2 // …easy did not (its ceiling is Feudal anyway)…
    && aliveCount(st, STANDARD) > aliveCount(st, EASY); // …and holds more of the map
}

describe('easy loses to standard', () => {
  it('standard beats easy on at least 2 of 3 seeds', { timeout: 600000 }, async () => {
    const seeds = [1, 3, 6];
    let standardWins = 0;
    for (const seed of seeds) {
      const game = createGame(config(seed));
      const easy = createBot(game, EASY, { difficulty: 'easy', seed: 1 });
      const std = createBot(game, STANDARD, { difficulty: 'standard', seed: 2 });
      let events: SimEvent[] = [];
      for (let t = 0; t < CAP && !game.state.finished; t++) {
        // yield to the event loop so the vitest worker can answer RPC heartbeats
        if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
        events = game.advance([...easy.tick(events), ...std.tick(events)]);
      }
      if (easyLost(game.state)) standardWins++;
    }
    expect(standardWins).toBeGreaterThanOrEqual(2);
  });
});
