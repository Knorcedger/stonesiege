// Match-summary derivation for the victory/defeat screens (pure).

import { describe, expect, it } from 'vitest';
import type { Entity, EntityId, GameState, SimEvent } from '@bf/sim/types';
import {
  deriveMatchSummary, emptyTallies, formatMatchTime, isMatchTallies,
  recordDeath, recordMatchEvent, recordPopulation,
} from './summary';

describe('formatMatchTime', () => {
  it('formats ticks (20/s) as M:SS and H:MM:SS', () => {
    expect(formatMatchTime(0)).toBe('0:00');
    expect(formatMatchTime(20 * 65)).toBe('1:05');
    expect(formatMatchTime(20 * 600)).toBe('10:00');
    expect(formatMatchTime(20 * 3700)).toBe('1:01:40');
  });
});

describe('recordDeath', () => {
  it('splits own losses vs kills credited to the human, units vs buildings', () => {
    const t = emptyTallies();
    recordDeath(t, { defId: 'militia', player: 1, killer: 2 }, 1); // own unit lost
    recordDeath(t, { defId: 'house', player: 1 }, 1); // own building lost (deleted)
    recordDeath(t, { defId: 'archer', player: 2, killer: 1 }, 1); // kill
    recordDeath(t, { defId: 'barracks', player: 2, killer: 1 }, 1); // razing
    recordDeath(t, { defId: 'archer', player: 2, killer: 2 }, 1); // not ours — ignored
    recordDeath(t, { defId: 'tree', player: 0 }, 1); // gaia — ignored
    expect(t).toMatchObject({ unitsLost: 1, buildingsLost: 1, unitsKilled: 1, buildingsRazed: 1 });
  });
});

describe('match statistics', () => {
  it('tracks gathered resources, production, construction, and peak population', () => {
    const t = emptyTallies(4);
    const events: SimEvent[] = [
      { kind: 'resourceDropped', player: 1, type: 'food', amount: 10 },
      { kind: 'resourceDropped', player: 1, type: 'wood', amount: 7 },
      { kind: 'resourceDropped', player: 1, type: 'gold', amount: 5 },
      { kind: 'resourceDropped', player: 1, type: 'stone', amount: 3 },
      { kind: 'resourceDropped', player: 2, type: 'food', amount: 99 },
      { kind: 'unitTrained', id: 20 as EntityId, defId: 'villager', player: 1, buildingId: 2 as EntityId },
      { kind: 'buildingComplete', id: 21 as EntityId, defId: 'house', player: 1 },
      { kind: 'buildingComplete', id: 22 as EntityId, defId: 'house', player: 2 },
    ];
    for (const event of events) recordMatchEvent(t, event, 1);
    recordPopulation(t, 11);
    recordPopulation(t, 8);

    expect(t).toMatchObject({
      foodGathered: 10, woodGathered: 7, goldGathered: 5, stoneGathered: 3,
      unitsTrained: 1, buildingsBuilt: 1, peakPopulation: 11,
    });
    expect(isMatchTallies(t)).toBe(true);
    expect(isMatchTallies({ ...t, foodGathered: -1 })).toBe(false);
  });
});

describe('deriveMatchSummary', () => {
  it('counts standing units/buildings for the player and formats the clock', () => {
    let id = 1;
    const ent = (partial: Partial<Entity>): Entity => ({
      id: (id++) as EntityId, kind: 'unit', defId: 'militia', player: 1,
      x: 0, y: 0, tileX: 0, tileY: 0, facing: 0, hp: 40, maxHp: 40, activity: 'idle',
      ...partial,
    } as Entity);
    const entities = new Map<EntityId, Entity>();
    for (const e of [
      ent({}), ent({ defId: 'villager' }),
      ent({ kind: 'building', defId: 'townCenter' }),
      ent({ activity: 'dying' }), // dying units don't count as standing
      ent({ player: 2 }), // enemy
      ent({ kind: 'resource', defId: 'tree', player: 0 }),
    ]) entities.set(e.id, e);
    const state = {
      tick: 20 * 90,
      entities,
      players: [
        null,
        { age: 'feudal', researchedTechs: ['loom', 'feudalAge'] },
      ],
    } as unknown as GameState;
    const s = deriveMatchSummary(state, 1, emptyTallies());
    expect(s.timeText).toBe('1:30');
    expect(s.unitsAlive).toBe(2);
    expect(s.buildingsAlive).toBe(1);
    expect(s.age).toBe('feudal');
    expect(s.techsResearched).toBe(2);
  });
});
