import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    // Cap parallelism below the core count (4P+6E on the dev machines): the multi-minute
    // AI bot-vs-bot sims otherwise saturate every core, push sibling test processes onto
    // efficiency cores, and flake the perf gates / vitest worker RPC on pure contention.
    maxWorkers: 4,
    minWorkers: 1,
  },
  resolve: {
    alias: [
      { find: /^@bf\/(\w+)$/, replacement: path.resolve(import.meta.dirname, 'packages') + '/$1/src/index.ts' },
      { find: /^@bf\/(\w+)\//, replacement: path.resolve(import.meta.dirname, 'packages') + '/$1/src/' },
    ],
  },
});
