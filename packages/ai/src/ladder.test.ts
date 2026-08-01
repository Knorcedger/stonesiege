// Difficulty-ladder winrate harness (slow; opt-in via BF_LADDER=1).
//
// Proves the ladder is real above easy: hard must beat standard by CONQUEST on at
// least 4 of 5 fresh (non-calibrated) seeds inside 90 sim-minutes each. Pre-fix,
// hard won 0 of 3 sampled seeds (all 70-minute draws) — difficulty selection above
// easy was cosmetic. Kept out of the default run because five full bot-vs-bot
// matches take minutes; run with `BF_LADDER=1 npx vitest run packages/ai/src/ladder.test.ts`
// after any change to tuning.ts, snapshot.ts planning, or military wave logic.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig, PlayerId, SimEvent } from '@bf/sim/types';
import { createBot } from './index';

const NINETY_MIN = 108000;
const SEEDS = [5, 9, 13, 17, 21];
const HARD = 1;

const config = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'Hard', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'Standard', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 60,
});

describe.runIf(process.env.BF_LADDER)('difficulty ladder: hard vs standard', () => {
  it('hard conquers standard on at least 4 of 5 fresh seeds', { timeout: 1800000 }, async () => {
    const results: string[] = [];
    let hardWins = 0;
    for (const seed of SEEDS) {
      const game = createGame(config(seed));
      const hard = createBot(game, HARD, { difficulty: 'hard', seed });
      const std = createBot(game, 2, { difficulty: 'standard', seed: seed + 100 });
      let events: SimEvent[] = [];
      let winners: PlayerId[] = [];
      for (let t = 0; t < NINETY_MIN && !game.state.finished; t++) {
        // yield to the event loop so the vitest worker can answer RPC heartbeats
        if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
        events = game.advance([...hard.tick(events), ...std.tick(events)]);
        for (const ev of events) if (ev.kind === 'victory') winners = ev.winners;
      }
      const won = winners.length === 1 && winners[0] === HARD;
      if (won) hardWins++;
      results.push(`seed ${seed}: ${won ? `hard wins at ${(game.state.tick / 1200).toFixed(1)}min` : winners.length === 1 ? 'STANDARD wins' : 'DRAW'}`);
    }
    expect(hardWins, results.join('; ')).toBeGreaterThanOrEqual(4);
  });
});
