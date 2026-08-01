// Fidelity-critic round-3 invariants against docs/AOE2_REFERENCE.md:
// age-up must preserve researched tech modifiers while activating age-gated civ
// bonuses (§6/§10 — rebuildModifiers), garrison healing rates (§5: 0.1 HP/s in
// TC/towers, 0.2 in castles, nothing heals inside rams), and faith being spent on
// success rather than upfront (§7 — a 0-faith monk can immediately convert again).

import { describe, expect, it } from 'vitest';
import type { Game } from './types';
import { TICKS_PER_SECOND } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { resolveUnitStats } from './stats';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

function run(game: Game, ticks: number): void {
  for (let t = 0; t < ticks; t++) game.advance([]);
}

/** Advance until an event kind fires; returns ticks waited (−1 = never). */
function runUntil(game: Game, kind: string, maxTicks: number): number {
  for (let t = 1; t <= maxTicks; t++) {
    for (const ev of game.advance([])) if (ev.kind === kind) return t;
  }
  return -1;
}

describe('age-up rebuild keeps tech modifiers and adds age-gated civ bonuses (§6/§10)', () => {
  it('english archer range: 4 → 5 (Fletching) → 6 after Castle age-up (civ +1 stacks, tech kept)', () => {
    const game = createGame(scenarioConfig(601, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 4, tileY: 4, ref: 'tc' },
      { defId: 'mill', player: P1, tileX: 10, tileY: 4 },
      { defId: 'barracks', player: P1, tileX: 13, tileY: 4 },
      { defId: 'blacksmith', player: P1, tileX: 17, tileY: 4, ref: 'smith' },
      { defId: 'market', player: P1, tileX: 21, tileY: 4 },
    ], [player({ civ: 'english', startingResources: { food: 2000, wood: 500, gold: 500, stone: 0 } })]));
    const state = game.state as unknown as SimState;
    const tc = game.state.refs.get('tc')!;
    const smith = game.state.refs.get('smith')!;

    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'feudalAge' }]);
    run(game, 130 * TICKS_PER_SECOND + 5);
    expect(game.state.players[P1].age).toBe('feudal');
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(4); // english range bonus is Castle-gated

    game.advance([{ kind: 'research', player: P1, buildingId: smith, techId: 'fletching' }]);
    run(game, 30 * TICKS_PER_SECOND + 5);
    expect(game.state.players[P1].researchedTechs).toContain('fletching');
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(5); // base 4 + Fletching

    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'castleAge' }]);
    run(game, 160 * TICKS_PER_SECOND + 5);
    expect(game.state.players[P1].age).toBe('castle');
    // rebuildModifiers must KEEP Fletching (+1) and ACTIVATE the fromAge civ bonus (+1)
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(6);
  });
});

describe('garrison healing rates (§5: TC 0.1 HP/s, castle 0.2 HP/s, rams none)', () => {
  it('over 20 s a garrisoned villager gains exactly +2 HP in a TC and +4 in a castle; ram passengers none', () => {
    const game = createGame(scenarioConfig(602, grassMap(40, 40), [
      { defId: 'townCenter', player: P1, tileX: 4, tileY: 4, ref: 'tc' },
      { defId: 'castle', player: P1, tileX: 14, tileY: 4, ref: 'castle' },
      { defId: 'batteringRam', player: P1, tileX: 24, tileY: 6, ref: 'ram' },
      { defId: 'villager', player: P1, tileX: 8, tileY: 5, ref: 'vTc', hp: 10 },
      { defId: 'villager', player: P1, tileX: 18, tileY: 5, ref: 'vCastle', hp: 10 },
      { defId: 'militia', player: P1, tileX: 25, tileY: 6, ref: 'mRam', hp: 10 },
    ], [player()]));
    const ref = (r: string) => game.state.refs.get(r)!;
    game.advance([
      { kind: 'garrison', player: P1, units: [ref('vTc')], targetId: ref('tc') },
      { kind: 'garrison', player: P1, units: [ref('vCastle')], targetId: ref('castle') },
      { kind: 'garrison', player: P1, units: [ref('mRam')], targetId: ref('ram') },
    ]);
    run(game, 20); // all three stand adjacent: entry is immediate-ish
    const vTc = game.state.entities.get(ref('vTc'))!;
    const vCastle = game.state.entities.get(ref('vCastle'))!;
    const mRam = game.state.entities.get(ref('mRam'))!;
    expect(vTc.garrisonedIn).toBeDefined();
    expect(vCastle.garrisonedIn).toBeDefined();
    expect(mRam.garrisonedIn).toBeDefined();

    const base = { tc: vTc.hp, castle: vCastle.hp, ram: mRam.hp };
    run(game, 20 * TICKS_PER_SECOND); // exactly 20 s garrisoned
    expect(vTc.hp - base.tc).toBe(2); // 0.1 HP/s
    expect(vCastle.hp - base.castle).toBe(4); // 0.2 HP/s
    expect(mRam.hp - base.ram).toBe(0); // nothing heals inside rams
  });
});

describe('faith is spent on success, not upfront (§7)', () => {
  it('a monk at 0 faith immediately converts a second target inside the normal window', () => {
    const game = createGame(scenarioConfig(603, grassMap(30, 30), [
      { defId: 'monk', player: P1, tileX: 10, tileY: 10, ref: 'monk' },
      { defId: 'militia', player: P2, tileX: 17, tileY: 10, ref: 'a' }, // in range 9, outside militia LOS
      { defId: 'militia', player: P2, tileX: 10, tileY: 17, ref: 'b' }, // far from `a` — no post-convert brawl
    ], [player(), player({ civ: 'english' })]));
    const state = game.state as unknown as SimState;
    const monk = game.state.refs.get('monk')!;
    const a = game.state.refs.get('a')!;
    const b = game.state.refs.get('b')!;

    game.advance([{ kind: 'convert', player: P1, units: [monk], targetId: a }]);
    expect(runUntil(game, 'conversionComplete', 10 * TICKS_PER_SECOND + 10)).toBeGreaterThan(0);
    expect(game.state.entities.get(a)!.player).toBe(P1);
    expect(state.monks.get(monk)!.faith).toBe(0); // drained by the success

    // faith is NOT a precondition: the drained monk starts (and lands) another conversion
    game.advance([{ kind: 'convert', player: P1, units: [monk], targetId: b }]);
    const t = runUntil(game, 'conversionComplete', 10 * TICKS_PER_SECOND + 10);
    expect(t).toBeGreaterThanOrEqual(4 * TICKS_PER_SECOND - 1); // still respects the min window
    expect(game.state.entities.get(b)!.player).toBe(P1);
  });
});
