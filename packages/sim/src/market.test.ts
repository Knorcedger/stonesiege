// Market: single GLOBAL drifting rate shared by all players (±2 per 100-lot), 30% fee
// on both sides, floor/ceiling clamps, market-building requirement, exact gold math
// from AOE2_REFERENCE §8 (start rates: food 100, wood 100, stone 130).

import { describe, expect, it } from 'vitest';
import type { SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

function build(seed: number, withMarkets = true) {
  return createGame(scenarioConfig(seed, grassMap(30, 30), [
    ...(withMarkets ? [
      { defId: 'market', player: P1, tileX: 5, tileY: 5 },
      { defId: 'market', player: P2, tileX: 15, tileY: 5 },
    ] : []),
  ], [player(), player({ civ: 'english' })]));
}

describe('market trading', () => {
  it('sell 100 wood → +70 gold at rate 100; the GLOBAL rate drops to 98 for everyone', () => {
    const game = build(401);
    const evs: SimEvent[] = game.advance([{ kind: 'marketTrade', player: P1, sell: 'wood', buy: 'gold', amount: 100 }]);
    const p1 = game.state.players[P1];
    expect(p1.stockpile.wood).toBe(100); // 200 − 100
    expect(p1.stockpile.gold).toBe(170); // 100 + 100×0.7
    expect(evs).toContainEqual({
      kind: 'marketTraded', player: P1, resource: 'wood', direction: 'sell',
      amount: 100, gold: 70, rate: 98,
    });

    // the drifted rate is shared: P2 sells the SAME resource at 98 → 68 gold
    game.advance([{ kind: 'marketTrade', player: P2, sell: 'wood', buy: 'gold', amount: 100 }]);
    expect(game.state.players[P2].stockpile.gold).toBe(168); // 100 + floor(98×0.7)
    expect((game.state as unknown as SimState).marketRates.wood).toBe(96);
  });

  it('buy 100 food costs rate×1.3 and pushes the rate up (unaffordable buys drop)', () => {
    const game = build(402);
    // starting gold is 100; buying 100 food costs 130 → the whole lot is dropped
    game.advance([{ kind: 'marketTrade', player: P1, sell: 'gold', buy: 'food', amount: 100 }]);
    const p1 = game.state.players[P1];
    expect(p1.stockpile.gold).toBe(100);
    expect(p1.stockpile.food).toBe(200);

    // stone starts at 130: selling nets floor(130×0.7)=91
    game.advance([{ kind: 'marketTrade', player: P1, sell: 'stone', buy: 'gold', amount: 100 }]);
    expect(p1.stockpile.gold).toBe(191);
    // now buying food (rate 100 → cost 130) works
    game.advance([{ kind: 'marketTrade', player: P1, sell: 'gold', buy: 'food', amount: 100 }]);
    expect(p1.stockpile.gold).toBe(61);
    expect(p1.stockpile.food).toBe(300);
    expect((game.state as unknown as SimState).marketRates.food).toBe(102);
  });

  it('multi-lot trades process per 100 and stop when unaffordable', () => {
    const game = createGame(scenarioConfig(403, grassMap(30, 30), [
      { defId: 'market', player: P1, tileX: 5, tileY: 5 },
    ], [player({ startingResources: { food: 0, wood: 250, gold: 0, stone: 0 } })]));
    const evs = game.advance([{ kind: 'marketTrade', player: P1, sell: 'wood', buy: 'gold', amount: 300 }]);
    const p1 = game.state.players[P1];
    expect(p1.stockpile.wood).toBe(50); // only 2 full lots existed
    expect(p1.stockpile.gold).toBe(70 + 68); // rate 100 then 98
    expect(evs).toContainEqual({
      kind: 'marketTraded', player: P1, resource: 'wood', direction: 'sell',
      amount: 200, gold: 138, rate: 96,
    });
  });

  it('rates clamp at the floor of 20 (mass dumping cannot go lower)', () => {
    const game = createGame(scenarioConfig(404, grassMap(30, 30), [
      { defId: 'market', player: P1, tileX: 5, tileY: 5 },
    ], [player({ startingResources: { food: 0, wood: 20000, gold: 0, stone: 0 } })]));
    game.advance([{ kind: 'marketTrade', player: P1, sell: 'wood', buy: 'gold', amount: 20000 }]);
    expect((game.state as unknown as SimState).marketRates.wood).toBe(20);
    expect(game.state.players[P1].stockpile.wood).toBe(0);
  });

  it('requires an own completed market building', () => {
    const game = build(405, false);
    const evs = game.advance([{ kind: 'marketTrade', player: P1, sell: 'wood', buy: 'gold', amount: 100 }]);
    expect(game.state.players[P1].stockpile.wood).toBe(200); // untouched
    expect(game.state.players[P1].stockpile.gold).toBe(100);
    expect(evs.filter((e) => e.kind === 'marketTraded')).toHaveLength(0);
  });

  it('gold is always the medium: food↔wood direct trades are dropped', () => {
    const game = build(406);
    game.advance([{ kind: 'marketTrade', player: P1, sell: 'food', buy: 'wood', amount: 100 }]);
    expect(game.state.players[P1].stockpile.food).toBe(200);
    expect(game.state.players[P1].stockpile.wood).toBe(200);
  });
});
