// pngjs read/write bridge for Raster buffers.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import { Raster } from './raster.ts';

export function writePng(path: string, raster: Raster): void {
  const png = new PNG({ width: raster.width, height: raster.height });
  Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength).copy(png.data);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

export function readPng(path: string): Raster {
  const png = PNG.sync.read(readFileSync(path));
  const raster = new Raster(png.width, png.height);
  raster.data.set(png.data);
  return raster;
}
