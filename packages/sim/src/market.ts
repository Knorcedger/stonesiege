// Market (GDD Resources & Economy + AOE2_REFERENCE §8). ONE global exchange rate per
// commodity (gold per 100 units) shared by every player in the match. Trades run in
// 100-unit lots; each lot pays a 30% fee (sell nets rate×0.7, buy costs rate×1.3) and
// drifts the rate by ±2 (selling down, buying up), clamped to [20, 9999]. Gold is
// always the medium — you never trade food↔wood directly. Requires an own completed
// Market building.

import { gameData } from '@bf/data';
import type { Command, ResourceType, SimEvent } from './types';
import type { SimState } from './internal';

export const MARKET_LOT = 100;
export const MARKET_START_RATES = { food: 100, wood: 100, stone: 130 } as const;
const RATE_DRIFT = 2;
const RATE_FLOOR = 20;
const RATE_CEIL = 9999;
/** Fee: sell nets 70%, buy pays 130% of the rate. */
const SELL_NUM = 70;
const BUY_NUM = 130;

type TradeCmd = Extract<Command, { kind: 'marketTrade' }>;

type Commodity = 'food' | 'wood' | 'stone';

const isCommodity = (r: ResourceType): r is Commodity => r === 'food' || r === 'wood' || r === 'stone';

function hasMarket(state: SimState, player: number): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.player !== player || e.hp <= 0) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    if (gameData.buildings[e.defId]?.id === 'market') return true;
  }
  return false;
}

export function handleMarketTrade(state: SimState, cmd: TradeCmd, events: SimEvent[]): void {
  if (cmd.sell === cmd.buy) return;
  const selling = cmd.buy === 'gold'; // selling a commodity FOR gold
  const buying = cmd.sell === 'gold'; // buying a commodity WITH gold
  if (!selling && !buying) return; // gold is always the medium
  const res = selling ? cmd.sell : cmd.buy;
  if (!isCommodity(res)) return;
  const lots = Math.floor(cmd.amount / MARKET_LOT);
  if (lots <= 0) return;
  if (!hasMarket(state, cmd.player)) return;

  const p = state.players[cmd.player];
  const stock = p.stockpile;
  let traded = 0;
  let goldMoved = 0;
  for (let i = 0; i < lots; i++) {
    const rate = state.marketRates[res];
    if (selling) {
      if (stock[res] < MARKET_LOT) break;
      stock[res] -= MARKET_LOT;
      const gold = Math.floor((rate * SELL_NUM) / 100);
      stock.gold += gold;
      goldMoved += gold;
      state.marketRates[res] = Math.max(RATE_FLOOR, rate - RATE_DRIFT);
    } else {
      const cost = Math.floor((rate * BUY_NUM) / 100);
      if (stock.gold < cost) break;
      stock.gold -= cost;
      stock[res] += MARKET_LOT;
      goldMoved += cost;
      state.marketRates[res] = Math.min(RATE_CEIL, rate + RATE_DRIFT);
    }
    traded += MARKET_LOT;
  }
  if (traded === 0) return;
  events.push({
    kind: 'marketTraded', player: cmd.player, resource: res,
    direction: selling ? 'sell' : 'buy', amount: traded, gold: goldMoved,
    rate: state.marketRates[res],
  });
}
