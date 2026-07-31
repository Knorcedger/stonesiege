// Pure market math for the HUD panel (DOM-free, unit-tested).
//
// GDD: the Market is a lossy converter — one global exchange rate per resource,
// shifted by every trade, with a ~30% fee so buying always costs more than
// selling returns. The wave-2 sim owns the moving global rate; until GameState
// exposes it, the HUD quotes from these AoE2-style base rates and labels them
// as estimates. INTEGRATOR: when the sim exposes live rates, thread them into
// goldFromSelling/goldToBuy in place of BASE_GOLD_PER_100.

export type TradeResource = 'food' | 'wood' | 'stone';
export const TRADE_RESOURCES: readonly TradeResource[] = ['food', 'wood', 'stone'];

/** Fee on every transaction (GDD "~30%"). */
export const MARKET_FEE_PERCENT = 30;

/** Base gold value of 100 units of each resource (AoE2 reference: stone is dearer). */
export const BASE_GOLD_PER_100: Readonly<Record<TradeResource, number>> = {
  food: 100,
  wood: 100,
  stone: 130,
};

/** Gold received for selling `amount` of a resource (fee already deducted, floored). */
export function goldFromSelling(res: TradeResource, amount = 100): number {
  const value = (BASE_GOLD_PER_100[res] * amount) / 100;
  return Math.floor((value * (100 - MARKET_FEE_PERCENT)) / 100);
}

/** Gold paid to buy `amount` of a resource (fee added on top, ceiled). */
export function goldToBuy(res: TradeResource, amount = 100): number {
  const value = (BASE_GOLD_PER_100[res] * amount) / 100;
  return Math.ceil((value * (100 + MARKET_FEE_PERCENT)) / 100);
}
