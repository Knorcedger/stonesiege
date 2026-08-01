// Scripted-wave persistence regression (wallace-3 "Stirling Bridge" stall).
//
// Pre-fix failure mode: after an aiAttackNow pulse, wave units that could not
// immediately path across the 2-wide bridge dropped to idle on the SOUTH bank for
// minutes, wounded survivors retreated back over the bridge, and — because the
// forced target area was consumed after one order — the free-play explore sweep
// scattered 4-5 units to the map's mirrored corner (13-15,99) where they idled
// beside the decorative castle forever, stalling the annihilation victory.
//
// This test runs the REAL wallace-3 map + the real bot: spawn wave A south of the
// bridge, pulse attackNow at the north bridgehead, and require EVERY wave unit to
// be north of the Forth (y < 56) — or dead — within a bounded tick budget, with
// nobody wandering into the south-west corner.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { SimEvent } from '@bf/sim/types';
import { campaignGameData, loadScenario, wallace3, wallace4 } from '@bf/scenarios';
import { attackNow, createBot } from './index';

const ENGLISH = 2;
/** Wave A of wallace-3 t04: 8 men-at-arms + 4 archers on the south causeway. */
const WAVE_SPAWNS: Array<{ defId: string; x: number; y: number }> = [
  { defId: 'manAtArms', x: 54, y: 72 }, { defId: 'manAtArms', x: 55, y: 72 },
  { defId: 'manAtArms', x: 56, y: 72 }, { defId: 'manAtArms', x: 57, y: 72 },
  { defId: 'manAtArms', x: 60, y: 72 }, { defId: 'manAtArms', x: 61, y: 72 },
  { defId: 'manAtArms', x: 54, y: 73 }, { defId: 'manAtArms', x: 55, y: 73 },
  { defId: 'archer', x: 60, y: 73 }, { defId: 'archer', x: 61, y: 73 },
  { defId: 'archer', x: 54, y: 74 }, { defId: 'archer', x: 55, y: 74 },
];
/** t04's pulse: the north bridgehead. */
const TARGET_AREA = { x: 54, y: 44, w: 10, h: 8 };
/** Vanguard crosses in ~1 min; 5 sim-minutes covers the whole 2-wide bridge queue. */
const BUDGET_TICKS = 6000;

describe('wallace-3 scripted wave persistence', () => {
  it('every wave unit crosses the bridge (y < 56) and none scatters to the SW corner', { timeout: 240000 }, async () => {
    const { start, meta } = loadScenario(wallace3, campaignGameData);
    const game = createGame({
      seed: 1297, map: start, players: meta.playerSetups, popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const bot = createBot(game, ENGLISH, { profile: 'passive', difficulty: 'standard', seed: 7 });

    const waveIds = game.ops!.spawn(WAVE_SPAWNS.map((s) => ({
      defId: s.defId, player: ENGLISH, tileX: s.x, tileY: s.y,
    })));
    expect(waveIds).toHaveLength(WAVE_SPAWNS.length);
    attackNow(bot, TARGET_AREA);

    let events: SimEvent[] = [];
    const allAcross = (): boolean => waveIds.every((id) => {
      const e = game.state.entities.get(id);
      return !e || e.hp <= 0 || e.tileY < 56;
    });
    let t = 0;
    for (; t < BUDGET_TICKS && !allAcross(); t++) {
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance(bot.tick(events));
    }

    const stranded = waveIds
      .map((id) => game.state.entities.get(id))
      .filter((e) => e !== undefined && e.hp > 0 && e.tileY >= 56)
      .map((e) => `${e!.defId}@(${e!.tileX},${e!.tileY})`);
    expect(stranded, `units still south of the Forth after ${t} ticks`).toEqual([]);

    // keep pressing: nobody drifts to the explore sweep's mirrored corners
    let alive = 0;
    for (const id of waveIds) {
      const e = game.state.entities.get(id);
      if (!e || e.hp <= 0) continue;
      alive++;
      expect(e.tileX, `${e.defId}#${id} wandered to the west edge`).toBeGreaterThan(30);
      expect(e.tileY, `${e.defId}#${id} wandered to the south edge`).toBeLessThan(60);
    }
    // nothing contests the bridgehead in this setup — the wave must ARRIVE, not die
    expect(alive).toBeGreaterThanOrEqual(10);
  });

  it('wallace-4 relief column crosses the map toward the player plateau (or dies trying)', { timeout: 240000 }, async () => {
    // t06-relief-1: knights + crossbows enter at the E edge (124-127,68-70) and pulse
    // at the NW player plateau {10,12,26,22} — a ~110-tile march over a road bridge.
    // Regression: pre-fix these columns stalled at the first choke and idled.
    const { start, meta } = loadScenario(wallace4, campaignGameData);
    const game = createGame({
      seed: 1298, map: start, players: meta.playerSetups, popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const bot = createBot(game, 3, { profile: 'passive', difficulty: 'standard', seed: 9 });
    const relief = game.ops!.spawn([
      ...[[124, 68], [125, 68], [126, 68], [127, 68], [124, 69], [125, 69]]
        .map(([x, y]) => ({ defId: 'knight', player: 3, tileX: x, tileY: y })),
      ...[[126, 69], [127, 69], [124, 70], [125, 70]]
        .map(([x, y]) => ({ defId: 'crossbowman', player: 3, tileX: x, tileY: y })),
    ]);
    attackNow(bot, { x: 10, y: 12, w: 26, h: 22 });

    let events: SimEvent[] = [];
    const cx = 23; // area center
    const cy = 23;
    const done = (): boolean => relief.every((id) => {
      const e = game.state.entities.get(id);
      return !e || e.hp <= 0
        || Math.max(Math.abs(e.tileX - cx), Math.abs(e.tileY - cy)) <= 30;
    });
    for (let t = 0; t < 12000 && !done(); t++) {
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance(bot.tick(events));
    }
    const stragglers = relief
      .map((id) => game.state.entities.get(id))
      .filter((e) => e !== undefined && e.hp > 0
        && Math.max(Math.abs(e.tileX - cx), Math.abs(e.tileY - cy)) > 30)
      .map((e) => `${e!.defId}@(${e!.tileX},${e!.tileY})`);
    expect(stragglers, 'relief units that never approached the plateau').toEqual([]);
  });
});
