// Deterministically expand the canonical StoneSiege store icon into every
// native icon and splash-screen density.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

type Rgba = readonly [number, number, number, number];
const outDir = join(import.meta.dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });
const sourcePath = join(outDir, 'app-icon-source.png');
const markPath = join(outDir, 'app-icon-mark.png');
const iconPng = PNG.sync.read(readFileSync(sourcePath));
const markPng = PNG.sync.read(readFileSync(markPath));
if (iconPng.width !== iconPng.height) throw new Error('assets/app-icon-source.png must be square');
if (markPng.width !== markPng.height) throw new Error('assets/app-icon-mark.png must be square');
writeFileSync(join(outDir, 'logo.png'), PNG.sync.write(markPng));

const rootDir = join(import.meta.dirname, '..');

function rgba(hex: string): Rgba {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

function compose(
  width: number,
  height: number,
  background: Rgba | null,
  markScale: number,
  round = false,
  source = markPng,
): PNG {
  const output = new PNG({ width, height });
  const radius = Math.min(width, height) / 2;
  const centerX = width / 2;
  const centerY = height / 2;

  if (background) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (round && Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) > radius) continue;
        const i = (y * width + x) * 4;
        output.data[i] = background[0];
        output.data[i + 1] = background[1];
        output.data[i + 2] = background[2];
        output.data[i + 3] = 255;
      }
    }
  }

  if (markScale <= 0) return output;

  const targetSize = Math.max(1, Math.round(Math.min(width, height) * markScale));
  const left = Math.round((width - targetSize) / 2);
  const top = Math.round((height - targetSize) / 2);
  for (let y = 0; y < targetSize; y++) {
    const outY = top + y;
    if (outY < 0 || outY >= height) continue;
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / targetSize));
    for (let x = 0; x < targetSize; x++) {
      const outX = left + x;
      if (outX < 0 || outX >= width) continue;
      if (round && Math.hypot(outX + 0.5 - centerX, outY + 0.5 - centerY) > radius) continue;
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / targetSize));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const alpha = source.data[sourceIndex + 3] / 255;
      if (alpha === 0) continue;
      const outputIndex = (outY * width + outX) * 4;
      const inverse = 1 - alpha;
      output.data[outputIndex] = Math.round(source.data[sourceIndex] * alpha + output.data[outputIndex] * inverse);
      output.data[outputIndex + 1] = Math.round(source.data[sourceIndex + 1] * alpha + output.data[outputIndex + 1] * inverse);
      output.data[outputIndex + 2] = Math.round(source.data[sourceIndex + 2] * alpha + output.data[outputIndex + 2] * inverse);
      output.data[outputIndex + 3] = Math.round((alpha + (output.data[outputIndex + 3] / 255) * inverse) * 255);
    }
  }
  return output;
}

function writePng(path: string, image: PNG, opaque = false): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, PNG.sync.write(image, opaque ? { colorType: 2 } : undefined));
}

function generateAndroid(): number {
  const resDir = join(rootDir, 'android', 'app', 'src', 'main', 'res');
  if (!existsSync(resDir)) return 0;
  const iconBackground = rgba('#2c1f12');
  const splashBackground = rgba('#160f09');
  const splashBackgroundDark = rgba('#0d0b08');
  const densities = [
    ['ldpi', 36, 81], ['mdpi', 48, 108], ['hdpi', 72, 162],
    ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
  ] as const;
  let count = 0;
  for (const [density, iconSize, adaptiveSize] of densities) {
    const dir = join(resDir, `mipmap-${density}`);
    writePng(join(dir, 'ic_launcher.png'), compose(iconSize, iconSize, null, 1, false, iconPng), true);
    writePng(join(dir, 'ic_launcher_round.png'), compose(iconSize, iconSize, null, 1, true, iconPng), true);
    writePng(join(dir, 'ic_launcher_foreground.png'), compose(adaptiveSize, adaptiveSize, null, 0.72));
    writePng(join(dir, 'ic_launcher_background.png'), compose(adaptiveSize, adaptiveSize, iconBackground, 0));
    count += 4;
  }

  const splashes = [
    ['drawable/splash.png', 320, 480],
    ['drawable-land-ldpi/splash.png', 320, 240], ['drawable-land-mdpi/splash.png', 480, 320],
    ['drawable-land-hdpi/splash.png', 800, 480], ['drawable-land-xhdpi/splash.png', 1280, 720],
    ['drawable-land-xxhdpi/splash.png', 1600, 960], ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
    ['drawable-port-ldpi/splash.png', 240, 320], ['drawable-port-mdpi/splash.png', 320, 480],
    ['drawable-port-hdpi/splash.png', 480, 800], ['drawable-port-xhdpi/splash.png', 720, 1280],
    ['drawable-port-xxhdpi/splash.png', 960, 1600], ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ] as const;
  for (const [path, width, height] of splashes) {
    writePng(join(resDir, path), compose(width, height, splashBackground, 0.52));
    count++;
    const darkPath = path === 'drawable/splash.png'
      ? 'drawable-night/splash.png'
      : path.replace(/^drawable-(land|port)-([^-\/]+)\//, 'drawable-$1-night-$2/');
    writePng(join(resDir, darkPath), compose(width, height, splashBackgroundDark, 0.52));
    count++;
  }
  return count;
}

function generateIos(): number {
  const assetDir = join(rootDir, 'ios', 'App', 'App', 'Assets.xcassets');
  if (!existsSync(assetDir)) return 0;
  const iconBackground = rgba('#2c1f12');
  const splashBackground = rgba('#160f09');
  const splashBackgroundDark = rgba('#0d0b08');
  writePng(
    join(assetDir, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
    compose(1024, 1024, iconBackground, 1, false, iconPng),
    true,
  );
  const splashDir = join(assetDir, 'Splash.imageset');
  for (const scale of [1, 2, 3]) {
    writePng(
      join(splashDir, `Default@${scale}x~universal~anyany.png`),
      compose(2732, 2732, splashBackground, 0.52),
    );
    writePng(
      join(splashDir, `Default@${scale}x~universal~anyany-dark.png`),
      compose(2732, 2732, splashBackgroundDark, 0.52),
    );
  }
  return 7;
}

const androidCount = generateAndroid();
const iosCount = generateIos();
console.log(`wrote assets/logo.png and ${androidCount + iosCount} native assets`);
