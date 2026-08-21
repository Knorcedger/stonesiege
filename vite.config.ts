import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  root: 'apps/web',
  base: './',
  // `root` is apps/web, so .env files would default to living there. Keep them
  // at the repository root instead, next to .env.example and the .gitignore
  // rules that cover them. Vercel/CI variables reach the build through
  // process.env either way.
  envDir: import.meta.dirname,
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5199,
    host: true,
  },
  resolve: {
    alias: [
      { find: /^@bf\/(\w+)$/, replacement: path.resolve(import.meta.dirname, 'packages') + '/$1/src/index.ts' },
      { find: /^@bf\/(\w+)\//, replacement: path.resolve(import.meta.dirname, 'packages') + '/$1/src/' },
    ],
  },
});
