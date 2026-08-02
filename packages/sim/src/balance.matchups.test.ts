// Balance-critic matchup harness (opt-in via BF_BALANCE=1, like BF_LADDER).
//
// Runs equal-COST army fights on open ground (both sides attack-move into each other,
// no micro) and asserts the AoE2 counter web holds:
//   - pikemen cost-beat knights
//   - skirmishers cost-beat archers
//   - knights cost-beat an archer+militia mix
//   - mangonels cost-beat massed foot archers
//   - rams shrug arrows (arrow hits tick for 1; a ram razes a building under fire)
//   - champions cost-beat pikemen
// Also proves both civs' signature passives actually apply through resolveUnitStats:
// Scots infantry +15% speed from Feudal (and not in Dark), Scots lumberjacks +15%,
// English foot-archer +1 range in Castle / +2 in Imperial (incl. Longbowman),
// English archery −10% cost from Feudal, English shepherd/hunt +25%.
//
// Run: BF_BALANCE=1 npx vitest run packages/sim/src/balance.matchups.test.ts

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { FP } from './types';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { completeResearch } from './research';
import { resolveUnitStats } from './stats';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

type Army = Array<{ defId: string; count: number }>;

function armyCost(army: Army): number {
  let total = 0;
  for (const { defId, count } of army) {
    const c = gameData.units[defId]!.cost;
    total += ((c.food ?? 0) + (c.wood ?? 0) + (c.gold ?? 0) + (c.stone ?? 0)) * count;
  }
  return total;
}

interface FightResult {
  aAlive: number;
  bAlive: number;
  aHpLeft: number;
  bHpLeft: number;
  ticks: number;
}

/**
 * Equal-cost open-field fight. Armies deploy in columns ~14 tiles apart on bare
 * grass, both sides attack-move at the enemy line, sim runs until one side is
 * wiped (or the tick cap). Dark Age both civs => no combat-relevant civ bonus.
 */
function fight(seed: number, a: Army, b: Army, cap = 24000): FightResult {
  const entities: Parameters<typeof scenarioConfig>[2] = [];
  const place = (army: Army, playerId: number, x0: number): void => {
    let i = 0;
    for (const { defId, count } of army) {
      for (let n = 0; n < count; n++, i++) {
        entities.push({
          defId, player: playerId,
          tileX: x0 + (i % 2 === 0 ? 0 : playerId === P1 ? -1 : 1),
          tileY: 8 + Math.floor(i / 2) * 2,
        });
      }
    }
  };
  place(a, P1, 16);
  place(b, P2, 30);
  const game = createGame(scenarioConfig(seed, grassMap(48, 48), entities,
    [player(), player({ civ: 'english' })]));

  const unitsOf = (p: number): number[] => {
    const ids: number[] = [];
    for (const e of game.state.entities.values()) {
      if (e.player === p && e.kind === 'unit' && e.hp > 0 && e.activity !== 'dying') ids.push(e.id);
    }
    return ids;
  };
  const hpOf = (p: number): number => {
    let hp = 0;
    for (const e of game.state.entities.values()) {
      if (e.player === p && e.kind === 'unit' && e.hp > 0 && e.activity !== 'dying') hp += e.hp;
    }
    return hp;
  };

  game.advance([
    { kind: 'attackMove', player: P1, units: unitsOf(P1), x: 31 * FP, y: 12 * FP },
    { kind: 'attackMove', player: P2, units: unitsOf(P2), x: 15 * FP, y: 12 * FP },
  ]);
  let t = 0;
  for (; t < cap; t++) {
    game.advance([]);
    if (t % 20 === 0 && (unitsOf(P1).length === 0 || unitsOf(P2).length === 0)) break;
  }
  return { aAlive: unitsOf(P1).length, bAlive: unitsOf(P2).length, aHpLeft: hpOf(P1), bHpLeft: hpOf(P2), ticks: t };
}

/** Run the same matchup on 3 seeds; the expected winner must take every seed. */
function bestOf3(a: Army, b: Army, expectWinner: 'a' | 'b', label: string): void {
  const costA = armyCost(a), costB = armyCost(b);
  expect(Math.abs(costA - costB) / Math.max(costA, costB), `${label}: cost parity ${costA} vs ${costB}`)
    .toBeLessThan(0.06);
  const outcomes: string[] = [];
  let wins = 0;
  for (const seed of [7101, 7102, 7103]) {
    const r = fight(seed, a, b);
    const winner = r.aAlive > 0 && r.bAlive === 0 ? 'a' : r.bAlive > 0 && r.aAlive === 0 ? 'b' : 'draw';
    if (winner === expectWinner) wins++;
    outcomes.push(`seed ${seed}: winner=${winner} aAlive=${r.aAlive}(${r.aHpLeft}hp) bAlive=${r.bAlive}(${r.bHpLeft}hp) t=${r.ticks}`);
  }
  expect(wins, `${label} [cost ${costA} vs ${costB}] — ${outcomes.join('; ')}`).toBe(3);
}

describe.runIf(process.env.BF_BALANCE)('counter web: equal-cost open-field fights', () => {
  it('pikemen (9 × 60r) cost-beat knights (4 × 135r)', { timeout: 120000 }, () => {
    bestOf3([{ defId: 'pikeman', count: 9 }], [{ defId: 'knight', count: 4 }], 'a', 'pikes > knights');
  });

  it('skirmishers (7 × 60r) cost-beat archers (6 × 70r)', { timeout: 120000 }, () => {
    bestOf3([{ defId: 'skirmisher', count: 7 }], [{ defId: 'archer', count: 6 }], 'a', 'skirms > archers');
  });

  it('knights (8 × 135r) cost-beat archers+militia (8 × 70r + 7 × 70r)', { timeout: 120000 }, () => {
    bestOf3(
      [{ defId: 'knight', count: 8 }],
      [{ defId: 'archer', count: 8 }, { defId: 'militia', count: 7 }],
      'a', 'knights > archers+militia',
    );
  });

  it('mangonels (4 × 295r) cost-beat massed foot archers (17 × 70r)', { timeout: 120000 }, () => {
    bestOf3([{ defId: 'mangonel', count: 4 }], [{ defId: 'archer', count: 17 }], 'a', 'mangos > massed archers');
  });

  it('champions (6 × 70r) cost-beat pikemen (7 × 60r)', { timeout: 120000 }, () => {
    bestOf3([{ defId: 'champion', count: 6 }], [{ defId: 'pikeman', count: 7 }], 'a', 'champs > pikes');
  });

  it('rams shrug arrows: every archer hit ticks for 1; ram razes a barracks under fire', { timeout: 60000 }, () => {
    const game = createGame(scenarioConfig(7110, grassMap(48, 48), [
      { defId: 'batteringRam', player: P1, tileX: 10, tileY: 12, ref: 'ram' },
      { defId: 'barracks', player: P2, tileX: 20, tileY: 11, ref: 'rax' },
      { defId: 'archer', player: P2, tileX: 17, tileY: 9 },
      { defId: 'archer', player: P2, tileX: 17, tileY: 11 },
      { defId: 'archer', player: P2, tileX: 17, tileY: 13 },
      { defId: 'archer', player: P2, tileX: 17, tileY: 15 },
    ], [player(), player({ civ: 'english' })]));
    const ram = game.state.refs.get('ram')!;
    const rax = game.state.refs.get('rax')!;
    game.advance([{ kind: 'attack', player: P1, units: [ram], targetId: rax }]);
    const evs: SimEvent[] = [];
    let raxDead = false;
    for (let t = 0; t < 3000 && !raxDead; t++) {
      for (const ev of game.advance([])) {
        evs.push(ev);
        if (ev.kind === 'entityDied' && ev.id === rax) raxDead = true;
      }
    }
    // arrows tick for exactly 1 (pierce 4 vs pierce armor 180 → min-1 clamp)
    const arrowHits = evs.filter((e): e is Extract<SimEvent, { kind: 'attackImpact' }> =>
      e.kind === 'attackImpact' && e.targetId === ram && !e.melee);
    expect(arrowHits.length).toBeGreaterThan(10);
    for (const h of arrowHits) expect(h.damage).toBe(1);
    // the ram wins the exchange outright
    expect(raxDead, 'barracks should fall to the ram inside 2.5 sim-minutes').toBe(true);
    expect(game.state.entities.get(ram)!.hp).toBeGreaterThan(0);
  });
});

describe.runIf(process.env.BF_BALANCE)('civ passives actually apply (stats layer)', () => {
  it('Scots: infantry +15% speed gates on Feudal; lumberjacks +15% always', () => {
    const game = createGame(scenarioConfig(7201, grassMap(20, 20), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5 },
    ], [player({ civ: 'scots' })]));
    const state = game.state as unknown as SimState;

    // Dark Age: no infantry speed bonus yet; wood bonus is unconditional
    expect(resolveUnitStats(state, P1, 'militia').speed).toBeCloseTo(0.9, 6);
    expect(resolveUnitStats(state, P1, 'villager').gather.wood).toBeCloseTo(0.39 * 1.15, 6);

    // Feudal Age: +15% infantry speed lands (and reaches the Highland Raider)
    completeResearch(state, P1, 'feudalAge', []);
    expect(resolveUnitStats(state, P1, 'militia').speed).toBeCloseTo(0.9 * 1.15, 6);
    expect(resolveUnitStats(state, P1, 'spearman').speed).toBeCloseTo(1.0 * 1.15, 6);
    expect(resolveUnitStats(state, P1, 'highlandRaider').speed).toBeCloseTo(1.17 * 1.15, 6);
    // cavalry and siege NOT affected
    expect(resolveUnitStats(state, P1, 'knight').speed).toBeCloseTo(1.35, 6);
    expect(resolveUnitStats(state, P1, 'batteringRam').speed).toBeCloseTo(0.6, 6);
  });

  it('English: foot-archer +1 range Castle / +2 Imperial (incl. Longbowman), −10% archery cost from Feudal, hunt +25%', () => {
    const game = createGame(scenarioConfig(7202, grassMap(20, 20), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5 },
    ], [player({ civ: 'english' })]));
    const state = game.state as unknown as SimState;

    // Dark Age: base ranges and costs, hunt bonus unconditional
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(4);
    expect(resolveUnitStats(state, P1, 'archer').cost.wood).toBe(25);
    expect(resolveUnitStats(state, P1, 'villager').gather.hunt).toBeCloseTo(0.41 * 1.25, 6);

    completeResearch(state, P1, 'feudalAge', []);
    const feudalArcher = resolveUnitStats(state, P1, 'archer');
    expect(feudalArcher.range).toBe(4); // range bonus is Castle+
    expect(feudalArcher.cost.wood + feudalArcher.cost.gold).toBeLessThan(70); // −10% archery cost

    completeResearch(state, P1, 'castleAge', []);
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(5); // +1
    expect(resolveUnitStats(state, P1, 'longbowman').range).toBe(6); // 5 base +1
    expect(resolveUnitStats(state, P1, 'skirmisher').range).toBe(5); // skirms are 'archer' class too

    completeResearch(state, P1, 'imperialAge', []);
    expect(resolveUnitStats(state, P1, 'archer').range).toBe(6); // +2 total
    expect(resolveUnitStats(state, P1, 'longbowman').range).toBe(7);
  });
});
