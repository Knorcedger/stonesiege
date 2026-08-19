import { describe, expect, it } from 'vitest';
import { MAP_SIZE_PRESETS } from '@bf/sim';
import {
  HUGE_BENCHMARK_MAP_SIZE,
  createHugeBenchmarkFixture,
  parseHugeBenchmarkArgs,
  runHugeBenchmark,
} from './huge-map-benchmark';

describe('Huge-map benchmark fixture', () => {
  it('builds an exact deterministic 192x192 load without changing player map presets', () => {
    const a = createHugeBenchmarkFixture(600);
    const b = createHugeBenchmarkFixture(600);
    expect(a.game.state.map.width).toBe(HUGE_BENCHMARK_MAP_SIZE);
    expect(a.game.state.map.height).toBe(HUGE_BENCHMARK_MAP_SIZE);
    expect(a.game.state.entities.size).toBe(600);
    expect(a.attackerIds).toHaveLength(420);
    expect(a.defenderIds).toHaveLength(180);
    expect(a.game.hash()).toBe(b.game.hash());
    expect(MAP_SIZE_PRESETS).toEqual({ small: 96, medium: 120, large: 144 });

    for (let tick = 0; tick < 8; tick++) {
      a.game.advance(tick === 0 ? a.commands : []);
      b.game.advance(tick === 0 ? b.commands : []);
    }
    expect(a.game.hash()).toBe(b.game.hash());
  });

  it('produces a complete report and proves JSON snapshot restoration at a fast test scale', () => {
    const report = runHugeBenchmark([40], 5, 99);
    const result = report.cases[0];
    expect(report.schemaVersion).toBe(1);
    expect(report.config).toEqual({
      mapSize: 192, entityCounts: [40], ticksPerCase: 5, seed: 99,
    });
    expect(report.environment.node).toBe(process.version);
    expect(result.mapSize).toBe(192);
    expect(result.entityCount).toBe(40);
    expect(result.snapshotBytes).toBeGreaterThan(0);
    expect(result.snapshotRestored).toBe(true);
    expect(result.restoredHash).toBe(result.finalHash);
    expect(result.pathfinding.maxQueuedAssignments).toBeGreaterThan(0);
    expect(result.pathfinding.maxUniqueWaitingUnits).toBeGreaterThan(0);
    expect(result.memoryBytes.visibilityBuffers).toBeGreaterThan(0);
    expect(result.timingsMs.averageTickCpu).toBeGreaterThanOrEqual(0);
  });

  it('parses explicit sweep and JSON output options and rejects malformed input', () => {
    expect(parseHugeBenchmarkArgs([
      '--counts', '600,1500', '--ticks', '250', '--seed', '7', '--json', 'report.json',
    ])).toEqual({
      counts: [600, 1500], ticks: 250, seed: 7, jsonPath: 'report.json', help: false,
    });
    expect(() => parseHugeBenchmarkArgs(['--counts', '600,600'])).toThrow(/unique/);
    expect(() => parseHugeBenchmarkArgs(['--ticks', '0'])).toThrow(/positive integer/);
    expect(() => parseHugeBenchmarkArgs(['--wat'])).toThrow(/unknown option/);
  });
});
