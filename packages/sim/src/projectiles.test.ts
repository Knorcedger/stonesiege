// Projectile hit resolution vs MOVING targets (the AoE2 model, AOE2_REFERENCE §3):
//   - arrows and other single-target shots connect whenever the fire-time accuracy
//     roll passes, wherever the target stands at impact tick — a unit strafing (or
//     charging the shooter) still lands ~accuracy% of shots on it;
//   - ONLY the mangonel-line splash resolves at the frozen impact point, so moving
//     targets genuinely dodge it (the classic mangonel-dodge micro) — until
//     Ballistics leads the target and the shot connects again.

import { describe, expect, it } from 'vitest';
import type { EntityId, Game, SimEvent } from './types';
import { FP } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

interface Timed { tick: number; ev: SimEvent }

type Fired = Extract<SimEvent, { kind: 'projectileFired' }>;
type Impact = Extract<SimEvent, { kind: 'attackImpact' }>;

/**
 * Keep `runnerId` strafing between two y-waypoints at full speed forever: re-issues a
 * move order every 8 ticks (which also clears any retaliation engagement) and tops its
 * HP back up so it never dies. Returns all events, timed.
 */
function runWithStrafer(
  game: Game, ticks: number, runnerId: EntityId, runnerPlayer: number,
  x: number, yA: number, yB: number,
): Timed[] {
  const state = game.state as SimState;
  const evs: Timed[] = [];
  let destY = yB;
  for (let t = 0; t < ticks; t++) {
    const runner = state.entities.get(runnerId);
    if (!runner) break;
    runner.hp = runner.maxHp; // test-side top-up: the target must survive the run
    const cmds = [];
    if (game.state.tick % 8 === 0) {
      if (runner.tileY >= Math.max(yA, yB) - 1) destY = Math.min(yA, yB);
      else if (runner.tileY <= Math.min(yA, yB) + 1) destY = Math.max(yA, yB);
      cmds.push({
        kind: 'move' as const, player: runnerPlayer, units: [runnerId],
        x: x * FP + FP / 2, y: destY * FP + FP / 2,
      });
    }
    const tick = game.state.tick;
    for (const ev of game.advance(cmds)) evs.push({ tick, ev });
  }
  return evs;
}

describe('arrows vs moving targets (accuracy roll decides, not the frozen point)', () => {
  it('3 archers land ~accuracy% of shots on a militia strafing at 0.9 t/s', () => {
    const game = createGame(scenarioConfig(71, grassMap(30, 30), [
      { defId: 'archer', player: P1, tileX: 10, tileY: 11, ref: 'a1' },
      { defId: 'archer', player: P1, tileX: 10, tileY: 13, ref: 'a2' },
      { defId: 'archer', player: P1, tileX: 10, tileY: 15, ref: 'a3' },
      { defId: 'militia', player: P2, tileX: 14, tileY: 9, ref: 'm' },
    ], [player(), player({ civ: 'english' })]));
    const mid = game.state.refs.get('m')!;
    const archers = new Set(['a1', 'a2', 'a3'].map((r) => game.state.refs.get(r)!));
    const evs: Timed[] = [];
    for (const ev of game.advance([{ kind: 'attack', player: P1, units: [...archers], targetId: mid }])) {
      evs.push({ tick: 0, ev }); // arrows fired on the order tick count too
    }

    // strafe perpendicular to the archers: at ranges 3.5-5 tiles the flight is long
    // enough that 0.9 t/s displaces the militia well past the old 0.375-tile window
    evs.push(...runWithStrafer(game, 800, mid, P2, 14, 9, 17));

    let firedTotal = 0;
    let firedHit = 0;
    let landed = 0;
    for (const { ev } of evs) {
      if (ev.kind === 'projectileFired' && archers.has(ev.fromId) && (ev as Fired).targetId === mid) {
        firedTotal++;
        if ((ev as Fired).hit) firedHit++;
      }
      if (ev.kind === 'attackImpact' && (ev as Impact).targetId === mid && !(ev as Impact).melee) landed++;
    }

    expect(firedTotal).toBeGreaterThan(40); // enough samples over 40 s
    // the accuracy roll itself (archer accuracy 80) — binomial noise allowed
    expect(firedHit / firedTotal).toBeGreaterThan(0.65);
    expect(firedHit / firedTotal).toBeLessThan(0.93);
    // EVERY passed roll connects (minus arrows still in flight at cutoff)
    expect(landed).toBeLessThanOrEqual(firedHit);
    expect(landed).toBeGreaterThanOrEqual(firedHit - 5);
    // the reviewer's headline number: effective land rate ~ listed accuracy
    expect(landed / firedTotal).toBeGreaterThan(0.65);
  });
});

describe('mangonel splash keeps the frozen-impact-point dodge', () => {
  it('a knight strafing at 1.35 t/s dodges every pre-Ballistics mangonel shot', () => {
    const game = createGame(scenarioConfig(72, grassMap(30, 30), [
      { defId: 'mangonel', player: P1, tileX: 10, tileY: 13, ref: 'mg' },
      { defId: 'knight', player: P2, tileX: 15, tileY: 4, ref: 'k' },
    ], [player(), player({ civ: 'english' })]));
    const mg = game.state.refs.get('mg')!;
    const kid = game.state.refs.get('k')!;
    game.advance([{ kind: 'attack', player: P1, units: [mg], targetId: kid }]);

    const evs = runWithStrafer(game, 1600, kid, P2, 15, 4, 22);

    const fired = evs.filter(({ ev }) => ev.kind === 'projectileFired' && (ev as Fired).fromId === mg);
    const hitsOnKnight = evs.filter(({ ev }) =>
      ev.kind === 'attackImpact' && (ev as Impact).targetId === kid);
    expect(fired.length).toBeGreaterThanOrEqual(3); // it did keep shooting
    // flight ≥ 0.9 s at min range → the knight is ≥ 1.2 tiles from the frozen point
    // at impact, outside the 1-tile splash: every shot whiffs (mangonel-dodge micro)
    expect(hitsOnKnight).toHaveLength(0);
  });

  it('with Ballistics the mangonel leads the strafing knight and connects', () => {
    const game = createGame(scenarioConfig(73, grassMap(30, 30), [
      { defId: 'mangonel', player: P1, tileX: 10, tileY: 13, ref: 'mg' },
      { defId: 'knight', player: P2, tileX: 15, tileY: 4, ref: 'k' },
    ], [player(), player({ civ: 'english' })]));
    const mg = game.state.refs.get('mg')!;
    const kid = game.state.refs.get('k')!;
    (game.state as SimState).ballistics[P1] = true;
    game.advance([{ kind: 'attack', player: P1, units: [mg], targetId: kid }]);

    const evs = runWithStrafer(game, 1600, kid, P2, 15, 4, 22);

    const hitsOnKnight = evs.filter(({ ev }) =>
      ev.kind === 'attackImpact' && (ev as Impact).targetId === kid);
    expect(hitsOnKnight.length).toBeGreaterThanOrEqual(1);
  });
});
