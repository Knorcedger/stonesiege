// Perf smoke: 120×120 map, 100 units commanded across the map. Timing is measured
// entirely OUTSIDE the sim (performance.now around advance) — the sim itself never
// touches wall-clock time, so measurement cannot affect determinism.

import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { fp } from './types';
import type { ScenarioStart } from './types';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

describe('performance smoke', () => {
  it('averages <= 4ms per tick over 500 ticks with 100 units crossing a 120x120 map', () => {
    const map = grassMap(120, 120);
    const entities: ScenarioStart['entities'] = [];
    // a forest ridge in the middle so the pathfinder has real work (gap at the south)
    for (let y = 10; y < 100; y++) {
      entities.push({ defId: 'tree', player: 0, tileX: 60, tileY: y });
      entities.push({ defId: 'tree', player: 0, tileX: 61, tileY: y });
    }
    for (let i = 0; i < 100; i++) {
      entities.push({ defId: 'militia', player: 1, tileX: 4 + (i % 10), tileY: 40 + Math.floor(i / 10) });
    }
    const game = createGame(scenarioConfig(21, map, entities, [player()]));
    const ids = entitiesOf(game.state.entities, 1, 'militia').map((e) => e.id);
    expect(ids).toHaveLength(100);

    game.advance([{ kind: 'move', player: 1, units: ids, x: fp(112), y: fp(60) }]);

    let total = 0;
    for (let t = 0; t < 500; t++) {
      const start = performance.now();
      game.advance([]);
      total += performance.now() - start;
    }
    const avg = total / 500;
    // eslint-disable-next-line no-console
    console.log(`perf smoke: avg tick ${avg.toFixed(3)}ms over 500 ticks`);
    expect(avg).toBeLessThanOrEqual(4);

    // sanity: the horde is actually marching (militia cover ~22 tiles in 500 ticks)
    const units = entitiesOf(game.state.entities, 1, 'militia');
    const moved = units.filter((u) => u.tileX > 20).length;
    expect(moved).toBeGreaterThan(50);
  });
});
