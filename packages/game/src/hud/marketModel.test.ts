// Market math + panel rows (GDD: lossy converter, ~30% fee both ways).

import { describe, expect, it } from 'vitest';
import { goldFromSelling, goldToBuy, marketPanelRows, TRADE_LOT } from './marketModel';

describe('market math', () => {
  it('selling returns less than buying costs (the fee bites both ways)', () => {
    for (const res of ['food', 'wood', 'stone'] as const) {
      expect(goldFromSelling(res)).toBeLessThan(goldToBuy(res));
    }
    expect(goldFromSelling('food')).toBe(70);
    expect(goldToBuy('food')).toBe(130);
    // stone is dearer
    expect(goldFromSelling('stone')).toBe(91);
    expect(goldToBuy('stone')).toBe(169);
  });

  it('live GameState.marketRates thread into quotes with the sim exact floor rounding', () => {
    // sim math: sell nets floor(rate*70/100), buy costs floor(rate*130/100) per lot
    const rates = { food: 87, wood: 113, stone: 145 } as const;
    expect(goldFromSelling('food', TRADE_LOT, rates)).toBe(Math.floor((87 * 70) / 100)); // 60
    expect(goldToBuy('food', TRADE_LOT, rates)).toBe(Math.floor((87 * 130) / 100)); // 113, not ceil 114
    expect(goldToBuy('wood', TRADE_LOT, rates)).toBe(Math.floor((113 * 130) / 100)); // 146
    const rows = marketPanelRows({ food: 100, gold: 113 }, null, rates);
    const food = rows.find((r) => r.res === 'food')!;
    expect(food.sellGold).toBe(60);
    expect(food.buyGold).toBe(113);
    expect(food.buyEnabled).toBe(true); // exactly affordable at the sim's floored charge
  });
});

describe('marketPanelRows', () => {
  it('sell needs a full lot of the resource; buy needs the gold', () => {
    const rows = marketPanelRows({ food: 150, wood: 20, stone: 0, gold: 135 }, null);
    const food = rows.find((r) => r.res === 'food')!;
    expect(food.sellEnabled).toBe(true);
    expect(food.buyEnabled).toBe(true); // 135g >= 130g
    const wood = rows.find((r) => r.res === 'wood')!;
    expect(wood.sellEnabled).toBe(false);
    expect(wood.sellReason).toBe(`need ${TRADE_LOT} wood`);
    const stone = rows.find((r) => r.res === 'stone')!;
    expect(stone.buyEnabled).toBe(false); // 169g > 135g
    expect(stone.buyReason).toContain('gold');
  });

  it('a pending reason disables every button with that reason', () => {
    for (const row of marketPanelRows({ food: 999, wood: 999, stone: 999, gold: 999 }, 'trading arrives with the wave-2 sim')) {
      expect(row.sellEnabled).toBe(false);
      expect(row.buyEnabled).toBe(false);
      expect(row.sellReason).toContain('wave-2');
      expect(row.buyReason).toContain('wave-2');
    }
  });
});
