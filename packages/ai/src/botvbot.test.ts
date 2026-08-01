// Headless bot-vs-bot full game: two standard bots on a practice map must run the
// entire loop — boom, feudal at a sane time, army production, offense — and the
// match must END in a conquest victory for someone within 90 sim-minutes.
// (64×64 / popCap 60 keeps the runtime sane; calibrated: seed 11 ends ~tick 45k.)

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig, PlayerId, SimEvent } from '@bf/sim/types';
import { createBot } from './index';

const NINETY_MIN = 108000; // 90 sim-minutes at 20 ticks/s

const config = (): GameConfig => ({
  seed: 11,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'A', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 60,
});

describe('standard vs standard (full game)', () => {
  it('booms, reaches feudal on time, raises an army, and someone wins inside 90 minutes', { timeout: 240000 }, async () => {
    const game = createGame(config());
    const a = createBot(game, 1, { difficulty: 'standard', seed: 1 });
    const b = createBot(game, 2, { difficulty: 'standard', seed: 2 });

    const feudalAt: Partial<Record<PlayerId, number>> = {};
    const militaryTrained: Record<PlayerId, number> = { 1: 0, 2: 0 };
    let winners: PlayerId[] = [];
    let events: SimEvent[] = [];
    let t = 0;
    for (; t < NINETY_MIN && !game.state.finished; t++) {
      // yield to the event loop so the vitest worker can answer RPC heartbeats
      // (a minutes-long fully-synchronous loop starves them into false errors)
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance([...a.tick(events), ...b.tick(events)]);
      for (const ev of events) {
        if (ev.kind === 'ageAdvanced' && ev.age === 'feudal') feudalAt[ev.player] = t;
        if (ev.kind === 'unitTrained' && ev.defId !== 'villager') militaryTrained[ev.player]++;
        if (ev.kind === 'victory') winners = ev.winners;
      }
    }

    // the match ends decisively inside 90 sim-minutes
    expect(game.state.finished).toBe(true);
    expect(winners.length).toBe(1);
    // both bots reach Feudal at a sane time (well under 25 sim-minutes)
    expect(feudalAt[1]).toBeDefined();
    expect(feudalAt[2]).toBeDefined();
    expect(feudalAt[1]!).toBeLessThan(30000);
    expect(feudalAt[2]!).toBeLessThan(30000);
    // the winner raised a real army along the way
    expect(militaryTrained[winners[0]]).toBeGreaterThanOrEqual(8);
    // the loser is actually defeated, the winner is not
    const loser = winners[0] === 1 ? 2 : 1;
    expect(game.state.players[loser].defeated).toBe(true);
    expect(game.state.players[winners[0]].defeated).toBe(false);
  });
});
