// Idle-unit badge + control-group chip helpers (GDD Mobile UX HUD spec).

import { describe, expect, it } from 'vitest';
import { FP, GAIA, type Entity, type EntityId, type GameState, type PlayerId } from '@bf/sim/types';
import { centroidTile, idleUnits, isIdleOwnUnit, liveGroupIds, sameIdSet } from './selectionTools';

const HUMAN = 1 as PlayerId;

let nextId = 1;
function ent(partial: Partial<Entity>): Entity {
  return {
    id: (nextId++) as EntityId,
    kind: 'unit',
    defId: 'villager',
    player: HUMAN,
    x: 0, y: 0, tileX: 0, tileY: 0,
    facing: 0,
    hp: 25, maxHp: 25,
    activity: 'idle',
    ...partial,
  } as Entity;
}

function stateWith(entities: Entity[]): GameState {
  const map = new Map<EntityId, Entity>();
  for (const e of entities) map.set(e.id, e);
  return { entities: map } as unknown as GameState;
}

describe('isIdleOwnUnit', () => {
  it('accepts an own standing unit and rejects everything else', () => {
    expect(isIdleOwnUnit(ent({}), HUMAN)).toBe(true);
    expect(isIdleOwnUnit(ent({ activity: 'moving' }), HUMAN)).toBe(false);
    expect(isIdleOwnUnit(ent({ activity: 'gathering' }), HUMAN)).toBe(false);
    expect(isIdleOwnUnit(ent({ player: 2 as PlayerId }), HUMAN)).toBe(false);
    expect(isIdleOwnUnit(ent({ player: GAIA }), GAIA)).toBe(false);
    expect(isIdleOwnUnit(ent({ kind: 'building', defId: 'house' }), HUMAN)).toBe(false);
    expect(isIdleOwnUnit(ent({ hp: 0 }), HUMAN)).toBe(false);
    expect(isIdleOwnUnit(ent({ garrisonedIn: 99 as EntityId }), HUMAN)).toBe(false);
  });
});

describe('idleUnits', () => {
  it('splits villagers from military and keeps stable order', () => {
    const v1 = ent({});
    const m1 = ent({ defId: 'militia' });
    const v2 = ent({});
    const busy = ent({ activity: 'moving' });
    const st = stateWith([v1, m1, v2, busy]);
    expect(idleUnits(st, HUMAN, 'villager').map((e) => e.id)).toEqual([v1.id, v2.id]);
    expect(idleUnits(st, HUMAN, 'military').map((e) => e.id)).toEqual([m1.id]);
  });
});

describe('liveGroupIds', () => {
  it('drops dead, dying, and despawned members but keeps order', () => {
    const a = ent({});
    const b = ent({ hp: 0 });
    const c = ent({ activity: 'dying' });
    const d = ent({ defId: 'militia' });
    const st = stateWith([a, b, c, d]);
    const gone = 12345 as EntityId;
    expect(liveGroupIds(st, [a.id, b.id, gone, c.id, d.id])).toEqual([a.id, d.id]);
  });
});

describe('sameIdSet', () => {
  it('is order-insensitive and length-strict', () => {
    const ids = [1, 2, 3] as unknown as EntityId[];
    expect(sameIdSet(ids, [3, 1, 2] as unknown as EntityId[])).toBe(true);
    expect(sameIdSet(ids, [1, 2] as unknown as EntityId[])).toBe(false);
    expect(sameIdSet(ids, [1, 2, 4] as unknown as EntityId[])).toBe(false);
    expect(sameIdSet([], [])).toBe(true);
  });
});

describe('centroidTile', () => {
  it('averages fixed-point positions into float tiles', () => {
    const a = ent({ x: 2 * FP, y: 4 * FP });
    const b = ent({ x: 4 * FP, y: 8 * FP });
    expect(centroidTile([a, b], FP)).toEqual({ x: 3, y: 6 });
    expect(centroidTile([], FP)).toBeNull();
  });
});
