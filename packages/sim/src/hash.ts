// Fast structural hash over the deterministic state (entities + stockpiles + tick) for
// determinism tests and desync detection. FNV/imul mixing over integers only.

import { AGES } from './types';
import type { Entity, GameState } from './types';
import type { SimState } from './internal';

const defIdHashes = new Map<string, number>();

function hashString(s: string): number {
  let cached = defIdHashes.get(s);
  if (cached !== undefined) return cached;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  cached = h >>> 0;
  defIdHashes.set(s, cached);
  return cached;
}

const ACTIVITY_INDEX: Record<string, number> = {
  idle: 0, moving: 1, attacking: 2, gathering: 3, building: 4, repairing: 5,
  carrying: 6, dying: 7, garrisoned: 8, healing: 9, converting: 10, fleeing: 11,
};

const INTENT_INDEX: Record<string, number> = {
  attackMove: 1, attackTarget: 2, gather: 3, build: 4, repair: 5,
};

const RESOURCE_INDEX: Record<string, number> = { food: 0, wood: 1, gold: 2, stone: 3 };

function mix(h: number, v: number): number {
  return Math.imul(h ^ (v | 0), 0x01000193);
}

function mixEntity(h: number, e: Entity): number {
  h = mix(h, e.id);
  h = mix(h, hashString(e.defId));
  h = mix(h, e.player);
  h = mix(h, e.x);
  h = mix(h, e.y);
  h = mix(h, e.tileX);
  h = mix(h, e.tileY);
  h = mix(h, e.facing);
  h = mix(h, e.hp);
  h = mix(h, ACTIVITY_INDEX[e.activity] ?? 0);
  if (e.buildProgress !== undefined) h = mix(h, e.buildProgress);
  if (e.amountLeft !== undefined) h = mix(h, e.amountLeft);
  if (e.stump) h = mix(h, 1);
  if (e.packed !== undefined) h = mix(h, e.packed ? 3 : 2);
  if (e.targetId !== undefined) h = mix(h, e.targetId);
  if (e.carrying !== undefined) {
    h = mix(h, RESOURCE_INDEX[e.carrying.type] ?? 0);
    h = mix(h, e.carrying.amount);
  }
  if (e.garrisonedIn !== undefined) h = mix(h, e.garrisonedIn);
  if (e.sheltering) h = mix(h, 13);
  if (e.garrison !== undefined) {
    h = mix(h, e.garrison.length);
    for (const id of e.garrison) h = mix(h, id);
  }
  if (e.intent !== undefined) {
    h = mix(h, INTENT_INDEX[e.intent.kind] ?? 0);
    if (e.intent.kind === 'attackMove') { h = mix(h, e.intent.x); h = mix(h, e.intent.y); }
    else h = mix(h, e.intent.targetId);
  }
  if (e.trainQueue !== undefined) {
    h = mix(h, e.trainQueue.length);
    for (const item of e.trainQueue) {
      h = mix(h, hashString(item.defId));
      h = mix(h, item.ticksLeft);
      h = mix(h, item.started ? 1 : 0);
    }
  }
  if (e.rally !== undefined) {
    h = mix(h, e.rally.x);
    h = mix(h, e.rally.y);
    h = mix(h, e.rally.targetId ?? -1);
  }
  return h;
}

export function hashState(state: GameState): number {
  // internal combat/market/wonder state is mixed in when present (createGame's state);
  // plain GameState snapshots (mocks/replays) hash the public surface only
  const s = state as GameState & Partial<Pick<SimState,
    'marketRates' | 'wonders' | 'monks' | 'projectiles' | 'corpses' | 'packTransitions'>>;
  let h = 0x811c9dc5;
  h = mix(h, state.tick);
  h = mix(h, state.finished ? 1 : 0);
  for (const p of state.players) {
    h = mix(h, p.id);
    h = mix(h, p.stockpile.food);
    h = mix(h, p.stockpile.wood);
    h = mix(h, p.stockpile.gold);
    h = mix(h, p.stockpile.stone);
    h = mix(h, p.pop);
    h = mix(h, p.popCap);
    h = mix(h, AGES.indexOf(p.age));
    h = mix(h, p.defeated ? 1 : 0);
    h = mix(h, p.autoReseed ? 1 : 0);
    h = mix(h, p.researchedTechs.length);
  }
  for (const e of state.entities.values()) h = mixEntity(h, e);
  if (s.marketRates) {
    h = mix(h, s.marketRates.food);
    h = mix(h, s.marketRates.wood);
    h = mix(h, s.marketRates.stone);
  }
  if (s.wonders) {
    for (const [id, w] of s.wonders) {
      h = mix(h, id);
      h = mix(h, w.player);
      h = mix(h, w.ticksLeft);
    }
  }
  if (s.monks) {
    for (const [id, m] of s.monks) {
      h = mix(h, id);
      h = mix(h, m.faith);
      h = mix(h, m.channelTicks);
    }
  }
  if (s.projectiles) {
    h = mix(h, s.projectiles.length);
    for (const p of s.projectiles) {
      h = mix(h, p.x);
      h = mix(h, p.y);
      h = mix(h, p.impactTick);
      h = mix(h, p.hit ? 1 : 0);
    }
  }
  if (s.corpses) {
    for (const [id, t] of s.corpses) {
      h = mix(h, id);
      h = mix(h, t);
    }
  }
  if (s.packTransitions) {
    for (const [id, tr] of s.packTransitions) {
      h = mix(h, id);
      h = mix(h, tr.ticksLeft);
      h = mix(h, tr.toPacked ? 1 : 0);
    }
  }
  return h >>> 0;
}
