import { defineConfig } from 'vite';
import path from 'node:path';

const pkg = (name: string) => path.resolve(__dirname, `packages/${name}/src`);

export default defineConfig({
  root: 'apps/web',
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5199,
    host: true,
  },
  resolve: {
    alias: [
      { find: /^@bf\/(\w+)$/, replacement: path.resolve(__dirname, 'packages') + '/$1/src/index.ts' },
      { find: /^@bf\/(\w+)\//, replacement: path.resolve(__dirname, 'packages') + '/$1/src/' },
    ],
  },
});
