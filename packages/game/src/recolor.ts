// Runtime-swap player-color recoloring (ASSET_CONTRACT "Player colors").
// Pure pixel math — DOM-free so it's unit-testable; assets.ts feeds it ImageData buffers.

export type Rgb = [number, number, number];

/** Parse "#RRGGBB" (or "RRGGBB") into [r,g,b]. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const v = parseInt(h, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/**
 * Exact-match substitution of the 3-tone magenta mask ramp with a player ramp,
 * in place, on RGBA pixel data. Ramps are ordered light/mid/dark to match
 * meta.bannerfall.maskPalette / playerRamps.
 */
export function swapPalette(pixels: Uint8ClampedArray, maskRamp: readonly Rgb[], playerRamp: readonly Rgb[]): void {
  const n = Math.min(maskRamp.length, playerRamp.length);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    for (let k = 0; k < n; k++) {
      const m = maskRamp[k];
      if (r === m[0] && g === m[1] && b === m[2]) {
        const p = playerRamp[k];
        pixels[i] = p[0];
        pixels[i + 1] = p[1];
        pixels[i + 2] = p[2];
        break;
      }
    }
  }
}

/** True if any pixel matches any mask ramp color (atlas needs per-color copies). */
export function containsMask(pixels: Uint8ClampedArray, maskRamp: readonly Rgb[]): boolean {
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    for (let k = 0; k < maskRamp.length; k++) {
      const m = maskRamp[k];
      if (r === m[0] && g === m[1] && b === m[2]) return true;
    }
  }
  return false;
}

/**
 * Fallback player ramps (light/mid/dark hex) matching ART_BIBLE §2 — used ONLY
 * when atlases are absent (mock-frame dev mode) or ship no
 * meta.bannerfall.playerRamps. With real atlases the meta always wins, so the
 * renderer never depends on these hexes in production.
 */
export const FALLBACK_PLAYER_RAMPS: readonly (readonly [string, string, string])[] = [
  ['#5C8CD6', '#2F5FB5', '#1C3B76'], // 0 blue
  ['#E06050', '#B3261E', '#711512'], // 1 red
  ['#6CBF5C', '#3E8C34', '#24591E'], // 2 green
  ['#F2D45C', '#D4A82A', '#8E6E14'], // 3 yellow
  ['#7AD2D2', '#38A6AA', '#1D6C70'], // 4 cyan
  ['#B07CD6', '#7E44A8', '#4C2370'], // 5 purple
  ['#C9C9CF', '#92929B', '#5A5A64'], // 6 gray
  ['#F0A04E', '#D26A1E', '#8C4212'], // 7 orange
];

export const FALLBACK_MASK_PALETTE: readonly [string, string, string] = ['#FF00FF', '#CC00CC', '#990099'];
