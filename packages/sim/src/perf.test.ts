// Perf smoke: 120×120 map with 100 units, and the practice-options ceiling — 144×144
// with 320 marching units plus a 60-defender brawl at the destination. Timing is
// measured entirely OUTSIDE the sim (performance.now around advance) — the sim itself
// never touches wall-clock time, so measurement cannot affect determinism.

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

  it('holds the tick budget with 380 units on a 144x144 map (march + funnel + brawl, calibration-normalized)', () => {
    const makeGame = () => {
      const size = 144;
      const map = grassMap(size, size);
      const entities: ScenarioStart['entities'] = [];
      // forest ridge with a narrow gap at the horde's latitude: 320 units funnel through
      // 9 tiles of clearance — pathfinding + separation at their ugliest
      for (let y = 8; y < 136; y++) {
        if (y >= 58 && y <= 66) continue; // the gap
        entities.push({ defId: 'tree', player: 0, tileX: 72, tileY: y });
        entities.push({ defId: 'tree', player: 0, tileX: 73, tileY: y });
      }
      // 320 attackers in a 20×16 block west of the ridge
      for (let i = 0; i < 320; i++) {
        entities.push({ defId: 'militia', player: 1, tileX: 44 + (i % 20), tileY: 48 + Math.floor(i / 20) });
      }
      // 60 defenders holding the destination — the march ends in a full auto-engage brawl
      for (let i = 0; i < 60; i++) {
        entities.push({ defId: 'militia', player: 2, tileX: 84 + (i % 10), tileY: 56 + Math.floor(i / 10) });
      }
      return createGame(scenarioConfig(22, map, entities, [player(), player({ civ: 'english' })], 500));
    };

    // A single cold V8/GC sample varied by >2x on the same machine and made this
    // smoke flaky. Median-of-three still catches a sustained regression while
    // rejecting one runtime spike.
    const cpuSamples: number[] = [];
    const wallSamples: number[] = [];
    let game = makeGame();
    for (let sample = 0; sample < 3; sample++) {
      if (sample > 0) game = makeGame();
      const ids = entitiesOf(game.state.entities, 1, 'militia').map((e) => e.id);
      expect(ids).toHaveLength(320);
      game.advance([{ kind: 'attackMove', player: 1, units: ids, x: fp(89), y: fp(59) }]);

      // CPU time, not wall time: vitest's forks pool runs each test file in its own
      // process, keeping sibling-test scheduling out of the measurement.
      const wall0 = performance.now();
      const cpu0 = process.cpuUsage();
      for (let t = 0; t < 700; t++) game.advance([]);
      const cpu = process.cpuUsage(cpu0);
      wallSamples.push((performance.now() - wall0) / 700);
      cpuSamples.push((cpu.user + cpu.system) / 1000 / 700);
    }
    cpuSamples.sort((a, b) => a - b);
    wallSamples.sort((a, b) => a - b);
    const avg = cpuSamples[1];
    const wallAvg = wallSamples[1];
    // eslint-disable-next-line no-console
    console.log(
      `perf smoke 144: median tick ${avg.toFixed(3)}ms CPU (${wallAvg.toFixed(3)}ms wall) `
      + `over 3×700 ticks, 380 units`,
    );
    // Unloaded this measures ~2ms — inside the 4ms tick budget with 2x headroom; the
    // pre-optimization sim (per-query id sorts in separation/acquisition) measured
    // ~4.7ms, so the same 4ms budget as the 120 smoke catches that regression class.
    expect(avg).toBeLessThanOrEqual(4);

    // sanity: a real share of the horde made it through the funnel and blood was drawn
    const attackers = entitiesOf(game.state.entities, 1, 'militia');
    expect(attackers.filter((u) => u.tileX > 74).length).toBeGreaterThan(50);
    const defenders = entitiesOf(game.state.entities, 2, 'militia').filter((u) => u.hp > 0);
    expect(defenders.length).toBeLessThan(60); // deaths occurred (combat load was real)
  });
});
