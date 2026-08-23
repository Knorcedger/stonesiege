// Load the TypeScript voice-over renderer through Vite so the repository's
// @bf/* aliases resolve exactly as they do in tests and the production build.
// Run: `npm run vo:render -- --list` (or without --list, on macOS, to render).

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
  const renderer = await server.ssrLoadModule(resolve(root, 'tools/voiceover.ts'));
  process.exitCode = renderer.runVoiceOverCli(process.argv.slice(2));
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
} finally {
  await server.close();
}
