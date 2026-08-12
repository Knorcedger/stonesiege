// Deterministic source logo for native icons and splash screens. Capacitor's
// asset tool expands this transparent 2048px mark into every platform density.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const SIZE = 2048;
const png = new PNG({ width: SIZE, height: SIZE });

type Point = readonly [number, number];
type Rgba = readonly [number, number, number, number];

function setPixel(x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const a = color[3] / 255;
  const inv = 1 - a;
  png.data[i] = Math.round(color[0] * a + png.data[i] * inv);
  png.data[i + 1] = Math.round(color[1] * a + png.data[i + 1] * inv);
  png.data[i + 2] = Math.round(color[2] * a + png.data[i + 2] * inv);
  png.data[i + 3] = Math.round((a + (png.data[i + 3] / 255) * inv) * 255);
}

function polygon(points: readonly Point[], color: Rgba): void {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
  const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(...points.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) setPixel(x, y, color);
    }
  }
}

function thickLine(a: Point, b: Point, width: number, color: Rgba): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * width / 2;
  const ny = (dx / length) * width / 2;
  polygon([
    [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny],
  ], color);
}

const bronze: Rgba = [201, 146, 52, 255];
const gold: Rgba = [239, 211, 142, 255];
const shadow: Rgba = [46, 27, 14, 255];
const crimson: Rgba = [112, 34, 29, 255];

// Crossed field spears behind the shield.
thickLine([530, 1660], [1510, 330], 82, shadow);
thickLine([1518, 1660], [538, 330], 82, shadow);
polygon([[1465, 255], [1585, 280], [1530, 405]], bronze);
polygon([[583, 255], [463, 280], [518, 405]], bronze);

const outerShield: Point[] = [
  [430, 440], [1618, 440], [1548, 1300], [1024, 1760], [500, 1300],
];
const innerShield: Point[] = [
  [508, 522], [1540, 522], [1476, 1250], [1024, 1650], [572, 1250],
];
polygon(outerShield, bronze);
polygon(innerShield, crimson);

// A pale falling banner/castle sigil: three crenellations over a tapering pennon.
polygon([
  [700, 680], [822, 680], [822, 590], [958, 590], [958, 680],
  [1090, 680], [1090, 590], [1226, 590], [1226, 680], [1348, 680],
  [1300, 1180], [1024, 1430], [748, 1180],
], gold);
polygon([[868, 850], [1180, 850], [1164, 1080], [884, 1080]], shadow);
polygon([[948, 850], [1100, 850], [1092, 1080], [956, 1080]], bronze);

const outDir = join(import.meta.dirname, '..', 'assets');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'logo.png'), PNG.sync.write(png));

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
    const sourceY = Math.min(SIZE - 1, Math.floor((y * SIZE) / targetSize));
    for (let x = 0; x < targetSize; x++) {
      const outX = left + x;
      if (outX < 0 || outX >= width) continue;
      if (round && Math.hypot(outX + 0.5 - centerX, outY + 0.5 - centerY) > radius) continue;
      const sourceX = Math.min(SIZE - 1, Math.floor((x * SIZE) / targetSize));
      const sourceIndex = (sourceY * SIZE + sourceX) * 4;
      const alpha = png.data[sourceIndex + 3] / 255;
      if (alpha === 0) continue;
      const outputIndex = (outY * width + outX) * 4;
      const inverse = 1 - alpha;
      output.data[outputIndex] = Math.round(png.data[sourceIndex] * alpha + output.data[outputIndex] * inverse);
      output.data[outputIndex + 1] = Math.round(png.data[sourceIndex + 1] * alpha + output.data[outputIndex + 1] * inverse);
      output.data[outputIndex + 2] = Math.round(png.data[sourceIndex + 2] * alpha + output.data[outputIndex + 2] * inverse);
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
    writePng(join(dir, 'ic_launcher.png'), compose(iconSize, iconSize, iconBackground, 0.94));
    writePng(join(dir, 'ic_launcher_round.png'), compose(iconSize, iconSize, iconBackground, 0.82, true));
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
    compose(1024, 1024, iconBackground, 0.94),
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
