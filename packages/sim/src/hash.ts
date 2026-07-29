// Fast structural hash over the deterministic state (entities + stockpiles + tick) for
// determinism tests and desync detection. FNV/imul mixing over integers only.

import { AGES } from './types';
import type { Entity, GameState } from './types';

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
  if (e.targetId !== undefined) h = mix(h, e.targetId);
  if (e.intent !== undefined) {
    h = mix(h, e.intent.kind === 'attackMove' ? 1 : e.intent.kind === 'attackTarget' ? 2 : 3);
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
    h = mix(h, p.researchedTechs.length);
  }
  for (const e of state.entities.values()) h = mixEntity(h, e);
  return h >>> 0;
}
