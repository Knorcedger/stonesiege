// Difficulty tempo regression: hard's dark age must be FAST (tuning.ts intent:
// "hard is the FASTEST up"). Pre-fix, hard reached Feudal in 15.1-18.0 sim-minutes
// — the slowest player in 3 of its 4 headless matches, behind easy's consistent
// 10.6-11.0 on the same maps — because dark militia + dark gold miners taxed the
// Feudal bank and the bank-stall valve let militia burn it back down every cycle.
// With darkMilitia 0, no dark gold miners, ageUpVillagers 12, and the valve
// suppressed in the dark age, hard now clicks Feudal at 10.4-11.5 solo. The bound
// leaves ~2 minutes of headroom so honest tuning drift doesn't flake, while the
// pre-fix behavior fails by minutes.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig, SimEvent } from '@bf/sim/types';
import { createBot } from './index';

const config = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'Idle', civ: 'scots', team: 0, isHuman: true, color: 0 },
    { name: 'Bot', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 100,
});

async function feudalTick(seed: number): Promise<number> {
  const game = createGame(config(seed));
  const bot = createBot(game, 2, { difficulty: 'hard', seed });
  let events: SimEvent[] = [];
  for (let t = 0; t < 20000; t++) {
    if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
    events = game.advance(bot.tick(events));
    for (const ev of events) {
      if (ev.kind === 'ageAdvanced' && ev.player === 2 && ev.age === 'feudal') return t;
    }
  }
  return -1;
}

describe('hard dark-age tempo', () => {
  it('hard reaches Feudal inside 13.5 sim-minutes on two fresh solo seeds', { timeout: 300000 }, async () => {
    for (const seed of [12, 23]) {
      const at = await feudalTick(seed);
      expect(at, `seed ${seed}: hard never reached Feudal in the window`).toBeGreaterThan(0);
      expect(at, `seed ${seed}: hard too slow to Feudal (${(at / 1200).toFixed(1)} min)`).toBeLessThan(16200);
    }
  });
});
