// Difficulty-ladder winrate harness (slow; opt-in via BF_LADDER=1).
//
// Proves the expanded ladder is real: Hardcore must beat Medium (the former Hard)
// by CONQUEST on at least 80% of fresh seeds inside 90 sim-minutes each. Kept out
// of the default run because five full bot-vs-bot matches take minutes; run with
// `BF_LADDER=1 npx vitest run packages/ai/src/ladder.test.ts`
// after any change to tuning.ts, snapshot.ts planning, or military wave logic.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig, PlayerId, SimEvent } from '@bf/sim/types';
import { createBot } from './index';

const NINETY_MIN = 108000;
const SEEDS = process.env.BF_LADDER_SEEDS
  ? process.env.BF_LADDER_SEEDS.split(',').map(Number)
  : [5, 9, 13, 17, 21];
const REQUIRED_WINS = Math.max(1, Math.ceil(SEEDS.length * 0.8));
const HARDCORE = 1;

const config = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'Hardcore', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'Medium', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 60,
});

describe.runIf(process.env.BF_LADDER)('difficulty ladder: Hardcore vs Medium', () => {
  it('Hardcore conquers Medium on at least 80% of fresh seeds', { timeout: 1800000 }, async () => {
    const results: string[] = [];
    let hardcoreWins = 0;
    for (const seed of SEEDS) {
      const game = createGame(config(seed));
      const hardcore = createBot(game, HARDCORE, { difficulty: 'hardcore', seed });
      const medium = createBot(game, 2, { difficulty: 'medium', seed: seed + 100 });
      let events: SimEvent[] = [];
      let winners: PlayerId[] = [];
      for (let t = 0; t < NINETY_MIN && !game.state.finished; t++) {
        // yield to the event loop so the vitest worker can answer RPC heartbeats
        if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
        events = game.advance([...hardcore.tick(events), ...medium.tick(events)]);
        for (const ev of events) if (ev.kind === 'victory') winners = ev.winners;
      }
      const won = winners.length === 1 && winners[0] === HARDCORE;
      if (won) hardcoreWins++;
      results.push(`seed ${seed}: ${won ? `Hardcore wins at ${(game.state.tick / 1200).toFixed(1)}min` : winners.length === 1 ? 'MEDIUM wins' : 'DRAW'}`);
    }
    expect(hardcoreWins, results.join('; ')).toBeGreaterThanOrEqual(REQUIRED_WINS);
  });
});
