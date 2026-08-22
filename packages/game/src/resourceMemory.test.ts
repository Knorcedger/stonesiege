import { describe, expect, it } from 'vitest';
import {
  FP, GAIA, type Entity, type EntityId, type GameState, type PlayerId,
} from '@bf/sim/types';
import { canonicalResourceMemorySnapshot, PlayerResourceMemory } from './resourceMemory';

const HUMAN = 1 as PlayerId;

function resource(patch: Partial<Entity> = {}): Entity {
  return {
    id: 7 as EntityId,
    kind: 'resource',
    defId: 'goldMine',
    player: GAIA,
    x: 4 * FP + FP / 2,
    y: 4 * FP + FP / 2,
    tileX: 4,
    tileY: 4,
    facing: 0,
    hp: 1,
    maxHp: 1,
    activity: 'idle',
    amountLeft: 800,
    resourceType: 'gold',
    ...patch,
  };
}

function makeState(entity: Entity, visibility: Uint8Array): GameState {
  return {
    map: { width: 8, height: 8 },
    entities: new Map([[entity.id, entity]]),
    players: [null, { visibility }],
  } as unknown as GameState;
}

describe('PlayerResourceMemory', () => {
  it('keeps hidden depletion and removal at their last-seen state', () => {
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const memory = new PlayerResourceMemory(HUMAN);
    memory.refresh(state);

    visibility[gold.tileY * 8 + gold.tileX] = 1;
    gold.amountLeft = 25;
    expect(memory.entityFor(state, gold)?.amountLeft).toBe(800);

    (state.entities as Map<EntityId, Entity>).delete(gold.id);
    memory.refresh(state);
    expect(memory.hiddenMissing(state)).toHaveLength(1);
    expect(memory.hiddenMissing(state)[0].amountLeft).toBe(800);

    visibility[gold.tileY * 8 + gold.tileX] = 2;
    memory.refresh(state);
    expect(memory.hiddenMissing(state)).toEqual([]);
  });

  it('round-trips hidden observations without reseeding them from live truth', () => {
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const original = new PlayerResourceMemory(HUMAN);
    original.refresh(state);
    visibility[gold.tileY * 8 + gold.tileX] = 1;
    gold.amountLeft = 10;

    const restored = new PlayerResourceMemory(HUMAN);
    expect(restored.restore(JSON.parse(JSON.stringify(original.snapshot())), state)).toBe(true);
    expect(restored.entityFor(state, gold)?.amountLeft).toBe(800);
  });

  it('rejects duplicate and malformed persisted entries', () => {
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const memory = new PlayerResourceMemory(HUMAN);
    memory.refresh(state);
    const snapshot = memory.snapshot();

    expect(canonicalResourceMemorySnapshot({
      ...snapshot,
      resources: [snapshot.resources[0], snapshot.resources[0]],
    })).toBeNull();
    expect(canonicalResourceMemorySnapshot({ ...snapshot, player: 0 })).toBeNull();
  });
});

describe('PlayerResourceMemory refresh cost', () => {
  it('keeps the stored record for an unchanged resource and replaces a changed one', () => {
    // Refresh runs for every resource on the map on every sim tick, so an
    // unchanged tree must not mint a new observation object each time.
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const memory = new PlayerResourceMemory(HUMAN);

    memory.refresh(state);
    const first = memory.snapshot().resources[0];
    memory.refresh(state);
    expect(memory.snapshot().resources[0]).toEqual(first);

    gold.amountLeft = 500;
    memory.refresh(state);
    expect(memory.snapshot().resources[0].amountLeft).toBe(500);
  });

  it('reuses one projection per observation but re-projects after a change', () => {
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const memory = new PlayerResourceMemory(HUMAN);
    memory.refresh(state);

    visibility[gold.tileY * 8 + gold.tileX] = 1;
    const a = memory.entityFor(state, gold);
    const b = memory.entityFor(state, gold);
    expect(a).toBe(b); // same object: no per-frame allocation for fogged scenery

    visibility[gold.tileY * 8 + gold.tileX] = 2;
    gold.amountLeft = 42;
    memory.refresh(state);
    visibility[gold.tileY * 8 + gold.tileX] = 1;
    const c = memory.entityFor(state, gold);
    expect(c).not.toBe(a);
    expect(c?.amountLeft).toBe(42);
  });

  it('forgets projections for resources it stops remembering', () => {
    const visibility = new Uint8Array(64).fill(2);
    const gold = resource();
    const state = makeState(gold, visibility);
    const memory = new PlayerResourceMemory(HUMAN);
    memory.refresh(state);

    // Mined out in full view: the memory drops it and reports nothing hidden.
    (state.entities as Map<EntityId, Entity>).delete(gold.id);
    memory.refresh(state);
    expect(memory.hiddenMissing(state)).toEqual([]);
    expect(memory.snapshot().resources).toEqual([]);
  });
});
