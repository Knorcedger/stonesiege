// Load the TypeScript benchmark through Vite so the repository's @bf/* aliases
// resolve exactly as they do in tests and the production build.

import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  server: { middlewareMode: true },
  appType: 'custom',
  clearScreen: false,
  logLevel: 'error',
});

try {
  const benchmark = await server.ssrLoadModule(resolve(root, 'tools/huge-map-benchmark.ts'));
  await benchmark.runHugeMapBenchmarkCli(process.argv.slice(2));
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await server.close();
}
