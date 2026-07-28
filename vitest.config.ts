import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
  resolve: {
    alias: [
      { find: /^@bf\/(\w+)$/, replacement: path.resolve(__dirname, 'packages') + '/$1/src/index.ts' },
      { find: /^@bf\/(\w+)\//, replacement: path.resolve(__dirname, 'packages') + '/$1/src/' },
    ],
  },
});
