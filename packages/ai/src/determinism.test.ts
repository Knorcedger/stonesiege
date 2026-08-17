// Bot determinism: the bot is a pure function of sim state + its own seeded SimRng.
// Two identical games driven by identically-seeded bots must produce the identical
// command stream (hashed tick by tick) and identical sim states.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { Command, GameConfig, SimEvent } from '@bf/sim/types';
import type { AiProfile } from './index';
import { BOT_DIFFICULTIES, createBot } from './index';

const config = (): GameConfig => ({
  seed: 17,
  map: { type: 'practice-random', width: 96, height: 96 },
  players: [
    { name: 'A', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 100,
});

/** FNV-1a over the JSON of each command batch — order and content sensitive. */
function hashCommands(h: number, cmds: Command[]): number {
  const s = JSON.stringify(cmds);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

describe('bot determinism', () => {
  it('same seeds produce identical command streams and identical sim states', { timeout: 60000 }, () => {
    const mk = (): { hash: number; game: ReturnType<typeof createGame> } => {
      const game = createGame(config());
      // asymmetric pairing exercises rng, counters, and raid pathways
      const a = createBot(game, 1, { difficulty: 'hard', profile: 'raider', seed: 5 });
      const b = createBot(game, 2, { difficulty: 'standard', profile: 'defender', seed: 9 });
      let h = 2166136261 >>> 0;
      let events: SimEvent[] = [];
      for (let t = 0; t < 4000 && !game.state.finished; t++) {
        const batch = [...a.tick(events), ...b.tick(events)];
        h = hashCommands(h, batch);
        events = game.advance(batch);
      }
      return { hash: h, game };
    };
    const r1 = mk();
    const r2 = mk();
    expect(r2.hash).toBe(r1.hash);
    expect(r2.game.hash()).toBe(r1.game.hash());
    expect(r1.hash).not.toBe(2166136261 >>> 0); // the bots actually issued commands
  });

  it('every profile × difficulty constructs and plays without desync', { timeout: 60000 }, () => {
    const profiles: AiProfile[] = ['passive', 'defender', 'raider', 'standard', 'aggressive'];
    for (const profile of profiles) {
      for (const difficulty of BOT_DIFFICULTIES) {
        const g1 = createGame(config());
        const g2 = createGame(config());
        const b1 = createBot(g1, 2, { profile, difficulty, seed: 3 });
        const b2 = createBot(g2, 2, { profile, difficulty, seed: 3 });
        for (let t = 0; t < 300; t++) {
          const c1 = b1.tick();
          const c2 = b2.tick();
          expect(c2).toEqual(c1); // same state, same decisions — no hidden randomness
          g1.advance(c1);
          g2.advance(c2);
        }
        expect(g2.hash()).toBe(g1.hash());
      }
    }
  });

  it('legacy difficulty-string signature still works (packages/game callers)', () => {
    const game = createGame(config());
    const bot = createBot(game, 2, 'easy');
    expect(bot.difficulty).toBe('easy');
    expect(bot.profile).toBe('standard');
    for (let t = 0; t < 130; t++) game.advance(bot.tick());
    expect(game.state.players[2].defeated).toBe(false);
  });
});
