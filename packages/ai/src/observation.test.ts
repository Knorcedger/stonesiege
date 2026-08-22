import { describe, expect, it } from 'vitest';
import {
  FP, GAIA, type Entity, type EntityId, type GameState, type PlayerId,
} from '@bf/sim/types';
import { createObservedMap } from './observedMap';
import { GaiaResourceMemory } from './resourceMemory';

const BOT = 1 as PlayerId;

function state(entities: Entity[], visibility: Uint8Array): GameState {
  return {
    map: {
      width: 8,
      height: 8,
      terrain: new Uint8Array(64),
      terrainIds: ['grass'],
    },
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    players: [
      { setup: { team: 0 } },
      { setup: { team: 1 }, visibility },
      { setup: { team: 2 }, visibility: new Uint8Array(64) },
    ],
  } as unknown as GameState;
}

function resource(patch: Partial<Entity> = {}): Entity {
  return {
    id: 10 as EntityId,
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

describe('fog-honest AI observations', () => {
  it('retains the last-seen resource amount until the tile is observed again', () => {
    const visibility = new Uint8Array(64);
    visibility[4 * 8 + 4] = 2;
    const gold = resource();
    const memory = new GaiaResourceMemory();
    memory.beginPass();
    memory.note(gold, visibility, 8, 10);
    memory.sweep(visibility, 8);

    visibility[4 * 8 + 4] = 1;
    gold.amountLeft = 25;
    memory.beginPass();
    memory.note(gold, visibility, 8, 20);
    memory.sweep(visibility, 8);
    expect(memory.entities()[0].amountLeft).toBe(800);

    visibility[4 * 8 + 4] = 2;
    memory.beginPass();
    memory.note(gold, visibility, 8, 30);
    memory.sweep(visibility, 8);
    expect(memory.entities()[0].amountLeft).toBe(25);
  });

  it('does not let an unobserved hostile building change placement queries', () => {
    const visibility = new Uint8Array(64);
    const hiddenHouse = {
      id: 20 as EntityId,
      kind: 'building',
      defId: 'house',
      player: 2 as PlayerId,
      x: 4 * FP,
      y: 4 * FP,
      tileX: 3,
      tileY: 3,
      facing: 0,
      hp: 550,
      maxHp: 550,
      activity: 'idle',
      buildProgress: 1000,
    } as Entity;
    const without = createObservedMap(state([], visibility), BOT, [], [], []);
    const withHidden = createObservedMap(state([hiddenHouse], visibility), BOT, [], [], []);

    expect(withHidden.canPlace('house', 3, 3)).toBe(without.canPlace('house', 3, 3));
    expect(withHidden.canPlace('house', 3, 3)).toBe(true);
  });

  it('uses a remembered resource as occupancy without reading its hidden live state', () => {
    const visibility = new Uint8Array(64);
    visibility[4 * 8 + 4] = 1;
    const gold = resource({ amountLeft: 0 });
    const observed = createObservedMap(state([gold], visibility), BOT, [], [], [{
      id: gold.id,
      defId: gold.defId,
      tileX: gold.tileX,
      tileY: gold.tileY,
      amountLeft: 800,
      tick: 5,
    }]);

    expect(observed.isWalkable(4, 4)).toBe(false);
  });
});
