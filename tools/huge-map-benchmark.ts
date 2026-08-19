// Optional Phase-1 scale benchmark. Wall-clock, CPU, and memory measurement stays
// outside @bf/sim; the fixture itself is a deterministic scenario with fixed commands.

import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createGame, createGameFromSnapshot, fp } from '@bf/sim';
import type {
  Command, Game, GameConfig, GameMap, GameSnapshot, PlayerSetup, ScenarioStart, TerrainId,
} from '@bf/sim';
import type { SimState } from '@bf/sim/internal';

export const HUGE_BENCHMARK_MAP_SIZE = 192;
export const HUGE_BENCHMARK_ENTITY_COUNTS = [600, 800, 1_000, 1_500] as const;
export const HUGE_BENCHMARK_DEFAULT_TICKS = 400;
export const HUGE_BENCHMARK_SEED = 16_019;

const TERRAIN_IDS: readonly TerrainId[] = [
  'grass', 'dirt', 'sand', 'water', 'shallows', 'road', 'farmland', 'snow', 'cliff',
];
const CLIFF_INDEX = TERRAIN_IDS.indexOf('cliff');
const UNIT_MIX = ['militia', 'spearman', 'archer', 'knight'] as const;

export interface HugeBenchmarkFixture {
  game: Game;
  commands: Command[];
  attackerIds: number[];
  defenderIds: number[];
}

export interface HugeBenchmarkCaseOptions {
  entityCount: number;
  ticks: number;
  seed?: number;
}

export interface HugeBenchmarkCaseReport {
  entityCount: number;
  mapSize: number;
  ticks: number;
  seed: number;
  initialHash: number;
  finalHash: number;
  restoredHash: number;
  timingsMs: {
    create: number;
    averageTickCpu: number;
    averageTickWall: number;
    p50TickWall: number;
    p95TickWall: number;
    maxTickWall: number;
    serialize: number;
    stringify: number;
    restore: number;
  };
  memoryBytes: {
    heapBefore: number;
    heapAfterCreate: number;
    peakHeap: number;
    peakRss: number;
    heapDelta: number;
    visibilityBuffers: number;
  };
  pathfinding: {
    maxActiveSearches: number;
    maxQueuedAssignments: number;
    maxUniqueWaitingUnits: number;
    ticksWithPendingSearches: number;
    drainedAtTick: number | null;
    activeSearchesAtEnd: number;
    queuedAssignmentsAtEnd: number;
  };
  outcome: {
    liveEntities: number;
    survivingAttackers: number;
    survivingDefenders: number;
    attackersAcrossRidge: number;
    defendersAcrossRidge: number;
    unitsMovedAtLeastTwoTiles: number;
    peakProjectiles: number;
  };
  snapshotBytes: number;
  snapshotRestored: boolean;
}

export interface HugeBenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  environment: {
    node: string;
    platform: string;
    release: string;
    arch: string;
    cpuModel: string;
    logicalCpuCount: number;
    totalMemoryBytes: number;
    gcExposed: boolean;
  };
  config: {
    mapSize: number;
    entityCounts: number[];
    ticksPerCase: number;
    seed: number;
  };
  cases: HugeBenchmarkCaseReport[];
}

export interface HugeBenchmarkCliOptions {
  counts: number[];
  ticks: number;
  seed: number;
  jsonPath?: string;
  help: boolean;
}

interface PathSearchView {
  groupId: number;
  waitingCount: number;
  waitingByTile: ReadonlyMap<number, readonly number[]>;
}

function benchmarkMap(): GameMap {
  const size = HUGE_BENCHMARK_MAP_SIZE;
  const terrain = new Uint8Array(size * size);
  // A two-tile north/south ridge with one central funnel and one distant relief
  // pass. Both armies must resolve group paths before local steering and combat.
  for (let y = 8; y < size - 8; y++) {
    const centralPass = y >= 92 && y <= 99;
    const reliefPass = y >= 142 && y <= 149;
    if (centralPass || reliefPass) continue;
    terrain[y * size + 95] = CLIFF_INDEX;
    terrain[y * size + 96] = CLIFF_INDEX;
  }
  return { width: size, height: size, terrain, terrainIds: TERRAIN_IDS };
}

function setup(name: string, civ: string, color: number): PlayerSetup {
  return {
    name, civ, color, team: 0, isHuman: false, startingAge: 'imperial',
    startingResources: {},
  };
}

function formationEntities(
  count: number,
  player: number,
  startX: number,
  columns: number,
  centerY: number,
): ScenarioStart['entities'] {
  const rows = Math.ceil(count / columns);
  const startY = centerY - Math.floor(rows / 2);
  const entities: ScenarioStart['entities'] = [];
  for (let i = 0; i < count; i++) {
    entities.push({
      defId: UNIT_MIX[i % UNIT_MIX.length],
      player,
      tileX: startX + (i % columns),
      tileY: startY + Math.floor(i / columns),
    });
  }
  return entities;
}

/** Build the deterministic 192x192 fixture. It is never referenced by player setup UI. */
export function createHugeBenchmarkFixture(
  entityCount: number,
  seed = HUGE_BENCHMARK_SEED,
): HugeBenchmarkFixture {
  if (!Number.isInteger(entityCount) || entityCount < 8 || entityCount > 5_000) {
    throw new Error('entityCount must be an integer between 8 and 5000');
  }
  const attackerCount = Math.floor(entityCount * 0.7);
  const defenderCount = entityCount - attackerCount;
  const entities: ScenarioStart['entities'] = [
    ...formationEntities(attackerCount, 1, 54, 35, 96),
    ...formationEntities(defenderCount, 2, 103, 25, 96),
  ];
  const config: GameConfig = {
    seed,
    map: { type: 'scenario', map: benchmarkMap(), entities },
    players: [setup('West', 'scots', 0), setup('East', 'english', 1)],
    popCap: entityCount + 100,
    productionSpeed: 1,
  };
  const game = createGame(config);
  const attackerIds: number[] = [];
  const defenderIds: number[] = [];
  for (const entity of game.state.entities.values()) {
    if (entity.player === 1) attackerIds.push(entity.id);
    else if (entity.player === 2) defenderIds.push(entity.id);
  }
  const commands: Command[] = [
    { kind: 'attackMove', player: 1, units: attackerIds, x: fp(122), y: fp(96) },
    { kind: 'attackMove', player: 2, units: defenderIds, x: fp(70), y: fp(96) },
  ];
  return { game, commands, attackerIds, defenderIds };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
  return sorted[index];
}

function memoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

/** Measure one scale. All time and memory reads remain outside game.advance(). */
export function runHugeBenchmarkCase(options: HugeBenchmarkCaseOptions): HugeBenchmarkCaseReport {
  const { entityCount, ticks } = options;
  const seed = options.seed ?? HUGE_BENCHMARK_SEED;
  if (!Number.isInteger(ticks) || ticks < 1) throw new Error('ticks must be a positive integer');

  // The CLI exposes GC so one case's large snapshot-search arrays do not become
  // the next case's memory baseline. Tests still work when GC is unavailable.
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const heapBefore = memoryUsage().heapUsed;
  const createStart = performance.now();
  const fixture = createHugeBenchmarkFixture(entityCount, seed);
  const createMs = performance.now() - createStart;
  const initialHash = fixture.game.hash();
  if (fixture.game.state.entities.size !== entityCount) {
    throw new Error(`fixture created ${fixture.game.state.entities.size} entities, expected ${entityCount}`);
  }

  let peakHeap = memoryUsage().heapUsed;
  let peakRss = memoryUsage().rss;
  const heapAfterCreate = peakHeap;
  let maxActiveSearches = 0;
  let maxQueuedAssignments = 0;
  let maxUniqueWaitingUnits = 0;
  let ticksWithPendingSearches = 0;
  let drainedAtTick: number | null = null;
  let sawPendingSearch = false;
  let peakProjectiles = 0;
  const wallSamples: number[] = [];
  let cpuMicros = 0;
  const initialTiles = new Map(
    [...fixture.game.state.entities].map(([id, entity]) => [id, { x: entity.tileX, y: entity.tileY }]),
  );

  for (let tick = 0; tick < ticks; tick++) {
    const tickCpuStart = process.cpuUsage();
    const wallStart = performance.now();
    fixture.game.advance(tick === 0 ? fixture.commands : []);
    wallSamples.push(performance.now() - wallStart);
    const tickCpu = process.cpuUsage(tickCpuStart);
    cpuMicros += tickCpu.user + tickCpu.system;

    const state = fixture.game.state as SimState;
    const searches = state.pathSearches as readonly PathSearchView[];
    const queuedAssignments = searches.reduce((sum, search) => sum + search.waitingCount, 0);
    const uniqueWaitingIds = new Set<number>();
    for (const search of searches) {
      for (const ids of search.waitingByTile.values()) {
        for (const id of ids) {
          if (state.motion.get(id)?.groupId === search.groupId) uniqueWaitingIds.add(id);
        }
      }
    }
    maxActiveSearches = Math.max(maxActiveSearches, searches.length);
    maxQueuedAssignments = Math.max(maxQueuedAssignments, queuedAssignments);
    maxUniqueWaitingUnits = Math.max(maxUniqueWaitingUnits, uniqueWaitingIds.size);
    peakProjectiles = Math.max(peakProjectiles, state.projectiles.length);
    if (searches.length > 0) {
      ticksWithPendingSearches++;
      sawPendingSearch = true;
    } else if (sawPendingSearch && drainedAtTick === null) {
      drainedAtTick = tick;
    }
    if (tick % 10 === 0 || tick === ticks - 1) {
      const usage = memoryUsage();
      peakHeap = Math.max(peakHeap, usage.heapUsed);
      peakRss = Math.max(peakRss, usage.rss);
    }
  }
  const averageTickCpu = cpuMicros / 1_000 / ticks;
  const sortedWall = [...wallSamples].sort((a, b) => a - b);

  const serializeStart = performance.now();
  const snapshot = fixture.game.serialize();
  const serializeMs = performance.now() - serializeStart;
  const stringifyStart = performance.now();
  const snapshotJson = JSON.stringify(snapshot);
  const stringifyMs = performance.now() - stringifyStart;
  const restoreStart = performance.now();
  const restored = createGameFromSnapshot(JSON.parse(snapshotJson) as GameSnapshot);
  const restoreMs = performance.now() - restoreStart;
  const finalHash = fixture.game.hash();
  const restoredHash = restored.hash();

  const state = fixture.game.state as SimState;
  const survivingAttackers = [...state.entities.values()].filter((e) => e.player === 1 && e.hp > 0);
  const survivingDefenders = [...state.entities.values()].filter((e) => e.player === 2 && e.hp > 0);
  const visibilityBuffers = state.vision.reduce(
    (sum, vision) => sum + vision.counts.byteLength + vision.visibility.byteLength,
    0,
  );
  const finalSearches = state.pathSearches as readonly PathSearchView[];
  const unitsMovedAtLeastTwoTiles = [...state.entities.values()].filter((entity) => {
    const initial = initialTiles.get(entity.id);
    return initial !== undefined
      && Math.max(Math.abs(entity.tileX - initial.x), Math.abs(entity.tileY - initial.y)) >= 2;
  }).length;

  return {
    entityCount,
    mapSize: HUGE_BENCHMARK_MAP_SIZE,
    ticks,
    seed,
    initialHash,
    finalHash,
    restoredHash,
    timingsMs: {
      create: round(createMs),
      averageTickCpu: round(averageTickCpu),
      averageTickWall: round(wallSamples.reduce((sum, value) => sum + value, 0) / ticks),
      p50TickWall: round(percentile(sortedWall, 0.5)),
      p95TickWall: round(percentile(sortedWall, 0.95)),
      maxTickWall: round(sortedWall[sortedWall.length - 1] ?? 0),
      serialize: round(serializeMs),
      stringify: round(stringifyMs),
      restore: round(restoreMs),
    },
    memoryBytes: {
      heapBefore,
      heapAfterCreate,
      peakHeap,
      peakRss,
      heapDelta: peakHeap - heapBefore,
      visibilityBuffers,
    },
    pathfinding: {
      maxActiveSearches,
      maxQueuedAssignments,
      maxUniqueWaitingUnits,
      ticksWithPendingSearches,
      drainedAtTick,
      activeSearchesAtEnd: finalSearches.length,
      queuedAssignmentsAtEnd: finalSearches.reduce((sum, search) => sum + search.waitingCount, 0),
    },
    outcome: {
      liveEntities: state.entities.size,
      survivingAttackers: survivingAttackers.length,
      survivingDefenders: survivingDefenders.length,
      attackersAcrossRidge: survivingAttackers.filter((entity) => entity.tileX > 96).length,
      defendersAcrossRidge: survivingDefenders.filter((entity) => entity.tileX < 95).length,
      unitsMovedAtLeastTwoTiles,
      peakProjectiles,
    },
    snapshotBytes: Buffer.byteLength(snapshotJson),
    snapshotRestored: finalHash === restoredHash,
  };
}

export function runHugeBenchmark(
  counts: readonly number[] = HUGE_BENCHMARK_ENTITY_COUNTS,
  ticks = HUGE_BENCHMARK_DEFAULT_TICKS,
  seed = HUGE_BENCHMARK_SEED,
): HugeBenchmarkReport {
  const cases = counts.map((entityCount) => runHugeBenchmarkCase({ entityCount, ticks, seed }));
  const cpuList = cpus();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpuModel: cpuList[0]?.model ?? 'unknown',
      logicalCpuCount: cpuList.length,
      totalMemoryBytes: totalmem(),
      gcExposed: typeof globalThis.gc === 'function',
    },
    config: {
      mapSize: HUGE_BENCHMARK_MAP_SIZE,
      entityCounts: [...counts],
      ticksPerCase: ticks,
      seed,
    },
    cases,
  };
}

function positiveInteger(raw: string | undefined, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} requires a positive integer`);
  return value;
}

export function parseHugeBenchmarkArgs(args: readonly string[]): HugeBenchmarkCliOptions {
  const options: HugeBenchmarkCliOptions = {
    counts: [...HUGE_BENCHMARK_ENTITY_COUNTS],
    ticks: HUGE_BENCHMARK_DEFAULT_TICKS,
    seed: HUGE_BENCHMARK_SEED,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--ticks') options.ticks = positiveInteger(args[++i], '--ticks');
    else if (arg === '--seed') options.seed = positiveInteger(args[++i], '--seed');
    else if (arg === '--json') {
      const path = args[++i];
      if (!path) throw new Error('--json requires a path or - for stdout');
      options.jsonPath = path;
    } else if (arg === '--counts') {
      const raw = args[++i];
      if (!raw) throw new Error('--counts requires a comma-separated list');
      options.counts = raw.split(',').map((part) => positiveInteger(part.trim(), '--counts'));
      if (new Set(options.counts).size !== options.counts.length) {
        throw new Error('--counts values must be unique');
      }
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function formatMiB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function printHumanReport(report: HugeBenchmarkReport): void {
  // eslint-disable-next-line no-console
  console.log(
    `StoneSiege Huge benchmark: ${report.config.mapSize}x${report.config.mapSize}, `
    + `${report.config.ticksPerCase} ticks/case`,
  );
  // eslint-disable-next-line no-console
  console.log(`${report.environment.node} | ${report.environment.cpuModel} | ${report.environment.platform}/${report.environment.arch}`);
  for (const result of report.cases) {
    // eslint-disable-next-line no-console
    console.log(
      `${result.entityCount.toString().padStart(4)} entities | `
      + `${result.timingsMs.averageTickCpu.toFixed(3)}ms CPU/tick | `
      + `${result.timingsMs.p95TickWall.toFixed(3)}ms wall p95 | `
      + `${formatMiB(result.memoryBytes.heapDelta)}MiB heap delta | `
      + `${formatMiB(result.snapshotBytes)}MiB snapshot | `
      + `${result.pathfinding.maxActiveSearches} max path searches | `
      + `restore ${result.snapshotRestored ? 'OK' : 'FAILED'}`,
    );
  }
}

function usage(): string {
  return [
    'Usage: npm run benchmark:huge -- [options]',
    '',
    '  --counts 600,800,1000,1500  entity counts (default: full roadmap sweep)',
    '  --ticks 400                 measured simulation ticks per case',
    '  --seed 16019                deterministic fixture seed',
    '  --json <path|->             also write JSON, or emit JSON only with -',
    '  --help                      show this help',
  ].join('\n');
}

export async function runHugeMapBenchmarkCli(args: readonly string[]): Promise<void> {
  const options = parseHugeBenchmarkArgs(args);
  if (options.help) {
    // eslint-disable-next-line no-console
    console.log(usage());
    return;
  }
  const report = runHugeBenchmark(options.counts, options.ticks, options.seed);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.jsonPath === '-') {
    process.stdout.write(json);
    return;
  }
  printHumanReport(report);
  if (options.jsonPath) {
    const path = resolve(options.jsonPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, json);
    // eslint-disable-next-line no-console
    console.log(`JSON report: ${path}`);
  }
  if (report.cases.some((result) => !result.snapshotRestored)) {
    throw new Error('one or more snapshot restores diverged');
  }
}
