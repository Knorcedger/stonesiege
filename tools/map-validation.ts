import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAP_SIZE_PRESETS,
  MAP_VALIDATION_SCHEMA_VERSION,
  createGame,
  validateMap,
} from '@bf/sim';
import type {
  MapValidationReport,
  PlayerSetup,
} from '@bf/sim';

const DEFAULT_SEEDS = [7, 42, 1337] as const;
const DEFAULT_SIZES = Object.values(MAP_SIZE_PRESETS);
const DEFAULT_PLAYER_COUNTS = [2, 3, 4] as const;
const CIVS = ['scots', 'english', 'vikings', 'french'] as const;

export interface PracticeMapValidationSweepOptions {
  seeds?: readonly number[];
  sizes?: readonly number[];
  playerCounts?: readonly number[];
}

export interface PracticeMapValidationCase {
  seed: number;
  size: number;
  playerCount: number;
  report: MapValidationReport;
}

export interface PracticeMapValidationSweepReport {
  schemaVersion: typeof MAP_VALIDATION_SCHEMA_VERSION;
  config: {
    seeds: number[];
    sizes: number[];
    playerCounts: number[];
  };
  summary: {
    cases: number;
    validCases: number;
    invalidCases: number;
    errors: number;
    warnings: number;
  };
  cases: PracticeMapValidationCase[];
}

function normalized(values: readonly number[], label: string, minimum: number): number[] {
  const result = [...new Set(values)].sort((a, b) => a - b);
  if (result.length === 0 || result.some((value) => !Number.isInteger(value) || value < minimum)) {
    throw new Error(`${label} must be a non-empty comma-separated list of integers >= ${minimum}`);
  }
  return result;
}

function playerSetups(count: number): PlayerSetup[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `P${index + 1}`,
    civ: CIVS[index % CIVS.length],
    team: 0,
    isHuman: false,
    color: index,
  }));
}

export function runPracticeMapValidationSweep(
  options: PracticeMapValidationSweepOptions = {},
): PracticeMapValidationSweepReport {
  const seeds = normalized(options.seeds ?? DEFAULT_SEEDS, 'seeds', 0);
  const sizes = normalized(options.sizes ?? DEFAULT_SIZES, 'sizes', 32);
  const playerCounts = normalized(options.playerCounts ?? DEFAULT_PLAYER_COUNTS, 'player counts', 2);
  if (playerCounts.some((count) => count > 4)) throw new Error('player counts must be <= 4');

  const cases: PracticeMapValidationCase[] = [];
  for (const size of sizes) {
    for (const playerCount of playerCounts) {
      for (const seed of seeds) {
        const game = createGame({
          seed,
          map: { type: 'practice-random', width: size, height: size },
          players: playerSetups(playerCount),
          popCap: 200,
          productionSpeed: 1,
        });
        cases.push({ seed, size, playerCount, report: validateMap(game) });
      }
    }
  }
  const errors = cases.reduce((total, item) => total + item.report.summary.errors, 0);
  const warnings = cases.reduce((total, item) => total + item.report.summary.warnings, 0);
  const validCases = cases.filter((item) => item.report.valid).length;
  return {
    schemaVersion: MAP_VALIDATION_SCHEMA_VERSION,
    config: { seeds, sizes, playerCounts },
    summary: {
      cases: cases.length,
      validCases,
      invalidCases: cases.length - validCases,
      errors,
      warnings,
    },
    cases,
  };
}

function parseList(value: string | undefined, flag: string): number[] {
  if (!value) throw new Error(`${flag} requires a comma-separated value`);
  const parsed = value.split(',').map((part) => Number(part));
  if (parsed.some((item) => !Number.isInteger(item))) {
    throw new Error(`${flag} requires comma-separated integers`);
  }
  return parsed;
}

function usage(): string {
  return [
    'StoneSiege deterministic Practice map validation',
    '',
    'Usage: npm run validate:maps -- [options]',
    '',
    'Options:',
    '  --seeds 7,42,1337       deterministic seeds (default: 7,42,1337)',
    '  --sizes 96,120,144      square map sizes (default: Practice presets)',
    '  --players 2,3,4         player counts (default: 2,3,4)',
    '  --json <path|->         write the complete stable JSON report; - prints JSON only',
    '  --help                  show this help',
  ].join('\n');
}

export function runMapValidationCli(args: readonly string[]): number {
  if (args.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  let seeds: number[] | undefined;
  let sizes: number[] | undefined;
  let playerCounts: number[] | undefined;
  let jsonTarget: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--seeds') seeds = parseList(args[++index], flag);
    else if (flag === '--sizes') sizes = parseList(args[++index], flag);
    else if (flag === '--players') playerCounts = parseList(args[++index], flag);
    else if (flag === '--json') {
      jsonTarget = args[++index];
      if (!jsonTarget) throw new Error('--json requires a path or -');
    } else throw new Error(`Unknown option: ${flag}\n\n${usage()}`);
  }

  const report = runPracticeMapValidationSweep({ seeds, sizes, playerCounts });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (jsonTarget === '-') {
    process.stdout.write(json);
  } else {
    process.stdout.write(
      `StoneSiege map validation: ${report.summary.validCases}/${report.summary.cases} cases valid, ${report.summary.errors} errors, ${report.summary.warnings} warnings\n`,
    );
    for (const item of report.cases) {
      if (item.report.summary.errors === 0 && item.report.summary.warnings === 0) continue;
      process.stdout.write(
        `  ${item.size}x${item.size}, ${item.playerCount}p, seed ${item.seed}: ${item.report.summary.errors} errors, ${item.report.summary.warnings} warnings\n`,
      );
      for (const issue of item.report.issues) {
        process.stdout.write(`    ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}\n`);
      }
    }
    if (jsonTarget) {
      const path = resolve(jsonTarget);
      writeFileSync(path, json);
      process.stdout.write(`JSON report: ${path}\n`);
    }
  }
  return report.summary.errors === 0 ? 0 : 1;
}
