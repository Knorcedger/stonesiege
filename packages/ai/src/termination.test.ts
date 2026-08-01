// NON-CALIBRATED-SEED termination: matches on fresh seeds must END by conquest.
//
// Pre-fix, ALL seven fresh-seed headless matchups hit the 70-sim-minute cap with no
// winner (armies deadlocked at their staging tiles re-issuing the same failed
// orders; the age-up piggy bank froze all military production). botvbot.test.ts only
// proved its calibrated seed 11, and easyloss.test.ts passed via domination scoring
// — no test forced a decisive conquest off the calibrated path. These two matchups
// (hard-vs-easy seed 4, standard-vs-easy seed 7) were 70-minute draws before the
// fix; both must now produce a conquest inside 90 sim-minutes.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig, PlayerId, SimEvent } from '@bf/sim/types';
import { createBot } from './index';
import type { BotDifficulty } from './index';

const NINETY_MIN = 108000;

const config = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'A', civ: 'scots', team: 0, isHuman: false, color: 0 },
    { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 60,
});

async function playOut(seed: number, d1: BotDifficulty, d2: BotDifficulty): Promise<{
  finished: boolean; winners: PlayerId[]; tick: number;
}> {
  const game = createGame(config(seed));
  const a = createBot(game, 1, { difficulty: d1, seed });
  const b = createBot(game, 2, { difficulty: d2, seed: seed + 100 });
  let events: SimEvent[] = [];
  let winners: PlayerId[] = [];
  for (let t = 0; t < NINETY_MIN && !game.state.finished; t++) {
    // yield to the event loop so the vitest worker can answer RPC heartbeats
    if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
    events = game.advance([...a.tick(events), ...b.tick(events)]);
    for (const ev of events) if (ev.kind === 'victory') winners = ev.winners;
  }
  return { finished: game.state.finished, winners, tick: game.state.tick };
}

describe('fresh-seed matches terminate by conquest', () => {
  it('hard conquers easy on seed 4 inside 90 sim-minutes', { timeout: 300000 }, async () => {
    const r = await playOut(4, 'hard', 'easy');
    expect(r.finished, `no winner by tick ${r.tick}`).toBe(true);
    expect(r.winners).toEqual([1]);
  });

  it('standard conquers easy on seed 7 inside 90 sim-minutes', { timeout: 300000 }, async () => {
    const r = await playOut(7, 'standard', 'easy');
    expect(r.finished, `no winner by tick ${r.tick}`).toBe(true);
    expect(r.winners).toEqual([1]);
  });

  // MIRROR termination: two equal standards must still produce a conquest — pre-fix
  // the wave-launch threshold had no time decay, so a bot whose army oscillated just
  // below attackArmy never attacked again even holding rams, and this seed drew at
  // the 90-minute cap with both armies parked 90-100% idle at their staging points.
  it('standard conquers standard on seed 42 inside 90 sim-minutes', { timeout: 300000 }, async () => {
    const r = await playOut(42, 'standard', 'standard');
    expect(r.finished, `no winner by tick ${r.tick}`).toBe(true);
    expect(r.winners.length).toBe(1);
  });

  it('standard conquers easy on seed 19 inside 90 sim-minutes', { timeout: 300000 }, async () => {
    // pre-fix: standard hovered 2-14 mostly-idle military for 60 minutes, stuck in
    // Feudal, and never razed easy's TC — a 90-minute draw
    const r = await playOut(19, 'standard', 'easy');
    expect(r.finished, `no winner by tick ${r.tick}`).toBe(true);
    expect(r.winners).toEqual([1]);
  });

  // Round-3 regression: this mirror drew at the 90-minute cap — the loser floated
  // 800-1076 food for 30+ minutes with gold pinned at 180-190 (the threat guard
  // zeroed the gold floor every pass so archers spent every coin above ~45, keeping
  // Castle permanently 10% away), while the winner's reinforcements trickled solo
  // into the garrisoned TC's arrows. With the guard latch, the nearly-banked
  // reserve, squad reinforcement, and the strict resign, it ends in ~53 minutes.
  it('standard conquers standard on seed 36 inside 90 sim-minutes', { timeout: 300000 }, async () => {
    const r = await playOut(36, 'standard', 'standard');
    expect(r.finished, `no winner by tick ${r.tick}`).toBe(true);
    expect(r.winners.length).toBe(1);
  });
});

describe('pressured bots still climb ages', () => {
  // Pre-fix, the skeleton-guard exemption re-evaluated the LIVE army count forever:
  // whenever the standing army dipped under 5 the age-bank food floor collapsed and
  // every surplus went into replacement militia that died to the next raid — the
  // seed-3 loser stayed DARK AGE for its entire 79-minute game with 1400+ wood
  // floating. The exemption now latches off after 8 lifetime military trainings.
  it('both standards reach Feudal on seed 3', { timeout: 300000 }, async () => {
    const game = createGame(config(3));
    const a = createBot(game, 1, { difficulty: 'standard', seed: 3 });
    const b = createBot(game, 2, { difficulty: 'standard', seed: 103 });
    const feudal = new Set<PlayerId>();
    let events: SimEvent[] = [];
    for (let t = 0; t < 54000 && feudal.size < 2 && !game.state.finished; t++) { // 45 sim-min
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance([...a.tick(events), ...b.tick(events)]);
      for (const ev of events) {
        if (ev.kind === 'ageAdvanced' && ev.age === 'feudal') feudal.add(ev.player);
      }
    }
    expect([...feudal].sort(), 'both players must reach Feudal').toEqual([1, 2]);
  });
});
