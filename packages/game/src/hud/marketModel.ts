// Pure market math for the HUD panel (DOM-free, unit-tested).
//
// GDD: the Market is a lossy converter — one global exchange rate per resource,
// shifted by every trade, with a ~30% fee so buying always costs more than
// selling returns. The sim owns the moving global rate (GameState.marketRates);
// the HUD threads it into every quote so the numbers shown are EXACTLY what the
// marketTrade command will move (same floor rounding as packages/sim/market.ts).
// BASE_GOLD_PER_100 is only the fallback for states without marketRates (mock sim).

export type TradeResource = 'food' | 'wood' | 'stone';
export const TRADE_RESOURCES: readonly TradeResource[] = ['food', 'wood', 'stone'];

/** Fee on every transaction (GDD "~30%"). */
export const MARKET_FEE_PERCENT = 30;

/** Live global rates (gold per 100) as exposed by GameState.marketRates. */
export type MarketRates = Readonly<Record<TradeResource, number>>;

/** Fallback gold value of 100 units of each resource (sim start rates; stone is dearer). */
export const BASE_GOLD_PER_100: MarketRates = {
  food: 100,
  wood: 100,
  stone: 130,
};

/** Gold received for selling `amount` of a resource (fee already deducted, floored). */
export function goldFromSelling(res: TradeResource, amount = 100, rates: MarketRates = BASE_GOLD_PER_100): number {
  const value = (rates[res] * amount) / 100;
  return Math.floor((value * (100 - MARKET_FEE_PERCENT)) / 100);
}

/** Gold paid to buy `amount` of a resource (fee added, floored — matches the sim's charge). */
export function goldToBuy(res: TradeResource, amount = 100, rates: MarketRates = BASE_GOLD_PER_100): number {
  const value = (rates[res] * amount) / 100;
  return Math.floor((value * (100 + MARKET_FEE_PERCENT)) / 100);
}

/** Trades happen in ×100 lots (GDD market panel). */
export const TRADE_LOT = 100;

export interface MarketRowModel {
  res: TradeResource;
  /** Gold received selling one lot / paid buying one lot (fee included). */
  sellGold: number;
  buyGold: number;
  sellEnabled: boolean;
  buyEnabled: boolean;
  sellReason?: string;
  buyReason?: string;
}

/**
 * One row per tradable resource for the market panel. `pendingReason` is set
 * while the marketTrade command is wave-2-pending in the sim (buttons render
 * disabled with that reason rather than confirming an order that gets dropped).
 */
export function marketPanelRows(
  stockpile: Partial<Record<TradeResource | 'gold', number>>,
  pendingReason: string | null,
  rates: MarketRates = BASE_GOLD_PER_100,
): MarketRowModel[] {
  return TRADE_RESOURCES.map((res) => {
    const sellGold = goldFromSelling(res, TRADE_LOT, rates);
    const buyGold = goldToBuy(res, TRADE_LOT, rates);
    const canSell = (stockpile[res] ?? 0) >= TRADE_LOT;
    const canBuy = (stockpile.gold ?? 0) >= buyGold;
    return {
      res,
      sellGold,
      buyGold,
      sellEnabled: !pendingReason && canSell,
      buyEnabled: !pendingReason && canBuy,
      sellReason: pendingReason ?? (canSell ? undefined : `need ${TRADE_LOT} ${res}`),
      buyReason: pendingReason ?? (canBuy ? undefined : `need ${buyGold} gold`),
    };
  });
}
