// Monks: idle auto-heal in range, explicit conversion inside the min/max window
// (seeded + statistically across seeds), damage NOT interrupting, conversion resist
// widening the window, breaks on target death, faith drain + recharge, converted
// units switching player with hp preserved.

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import { TICKS_PER_SECOND } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

interface Timed { tick: number; ev: SimEvent }

function run(game: Game, ticks: number, out?: Timed[]): void {
  for (let t = 0; t < ticks; t++) {
    const tick = game.state.tick;
    for (const ev of game.advance([])) out?.push({ tick, ev });
  }
}

describe('healing', () => {
  it('an idle monk auto-heals the nearest wounded friendly in range (~1.5 HP/s)', () => {
    const game = createGame(scenarioConfig(301, grassMap(30, 30), [
      { defId: 'monk', player: P1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: P1, tileX: 12, tileY: 10, ref: 'm', hp: 20 },
    ], [player()]));
    const m = game.state.refs.get('m')!;
    run(game, 200); // 10 s → +15 HP
    const militia = game.state.entities.get(m)!;
    expect(militia.hp).toBeGreaterThanOrEqual(33);
    expect(militia.hp).toBeLessThanOrEqual(36);
    run(game, 200);
    expect(game.state.entities.get(m)!.hp).toBe(40); // healed to full, then stops
  });
});

function convertGame(seed: number, targetDef: string, targetX: number): Game {
  return createGame(scenarioConfig(seed, grassMap(30, 30), [
    { defId: 'monk', player: P1, tileX: 10, tileY: 10, ref: 'monk' },
    { defId: targetDef, player: P2, tileX: targetX, tileY: 10, ref: 'target' },
  ], [player(), player({ civ: 'english' })]));
}

/** Ticks from the convert order to conversionComplete (−1 = never). */
function conversionTick(game: Game, maxTicks: number): number {
  const monk = game.state.refs.get('monk')!;
  const target = game.state.refs.get('target')!;
  game.advance([{ kind: 'convert', player: P1, units: [monk], targetId: target }]);
  for (let t = 1; t <= maxTicks; t++) {
    for (const ev of game.advance([])) {
      if (ev.kind === 'conversionComplete') return t;
    }
  }
  return -1;
}

describe('conversion', () => {
  it('lands inside the 4–10 s window, transfers the unit with hp preserved', () => {
    // target 7 tiles out: inside conversion range 9, outside militia LOS 4 (no fight)
    const game = convertGame(302, 'militia', 17);
    const t = conversionTick(game, 300);
    // channel starts on the command tick itself → measured ticks are window − 1
    expect(t).toBeGreaterThanOrEqual(4 * TICKS_PER_SECOND - 1);
    expect(t).toBeLessThanOrEqual(10 * TICKS_PER_SECOND);
    const target = game.state.entities.get(game.state.refs.get('target')!)!;
    expect(target.player).toBe(P1); // switched sides
    expect(target.hp).toBe(40); // hp preserved
    expect(game.state.players[P1].pop).toBe(2); // monk + convert
    expect(game.state.players[P2].pop).toBe(0);
    // faith spent on success, then recharges at 1.6/s (~62 s to full)
    const state = game.state as unknown as SimState;
    const monkId = game.state.refs.get('monk')!;
    expect(state.monks.get(monkId)!.faith).toBe(0);
    run(game, 65 * TICKS_PER_SECOND);
    expect(state.monks.get(monkId)!.faith).toBe(100);
  });

  it('is deterministic per seed but varies across seeds, always inside the window', () => {
    const ticks = [311, 312, 313, 314].map((seed) => conversionTick(convertGame(seed, 'militia', 17), 300));
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(4 * TICKS_PER_SECOND - 1);
      expect(t).toBeLessThanOrEqual(10 * TICKS_PER_SECOND);
    }
    expect(new Set(ticks).size).toBeGreaterThan(1); // the roll actually rolls
    // deterministic: the same seed converts on the same tick
    expect(conversionTick(convertGame(311, 'militia', 17), 300)).toBe(ticks[0]);
  });

  it('damage does NOT interrupt: a militia beating on the monk still gets converted', () => {
    // 4 tiles: the militia auto-engages the monk and lands hits during the channel
    const game = convertGame(303, 'militia', 14);
    const t = conversionTick(game, 300);
    expect(t).toBeGreaterThan(0);
    const monk = game.state.entities.get(game.state.refs.get('monk')!)!;
    expect(monk.hp).toBeLessThan(30); // it took real damage mid-channel
    expect(game.state.entities.get(game.state.refs.get('target')!)!.player).toBe(P1);
  });

  it('conversionResist (scout line) widens the window to 7–13 s', () => {
    const game = convertGame(304, 'scout', 18); // outside scout LOS 6: no monk-slaying
    const t = conversionTick(game, 400);
    expect(t).toBeGreaterThanOrEqual(7 * TICKS_PER_SECOND - 1);
    expect(t).toBeLessThanOrEqual(13 * TICKS_PER_SECOND);
  });

  it('breaks when the target dies mid-channel', () => {
    const game = convertGame(305, 'militia', 17);
    const monk = game.state.refs.get('monk')!;
    const target = game.state.refs.get('target')!;
    game.advance([{ kind: 'convert', player: P1, units: [monk], targetId: target }]);
    run(game, 40); // inside the pre-minimum silence
    const evs: Timed[] = [];
    const tick = game.state.tick;
    for (const ev of game.advance([{ kind: 'deleteEntity', player: P2, entityId: target }])) {
      evs.push({ tick, ev });
    }
    run(game, 300, evs);
    expect(evs.some((e) => e.ev.kind === 'conversionComplete')).toBe(false);
    const state = game.state as unknown as SimState;
    expect(state.monks.get(monk)!.convertTargetId).toBeUndefined();
    expect(state.monks.get(monk)!.faith).toBe(100); // faith only drains on success
  });
});
