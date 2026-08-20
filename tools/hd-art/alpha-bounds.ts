export interface AlphaBounds { left: number; top: number; right: number; bottom: number }

interface AlphaRaster {
  width: number;
  data: Uint8Array | Buffer;
}

/** Measure a cutout while ignoring generator haze below the authored threshold. */
export function alphaBounds(
  png: AlphaRaster,
  region: AlphaBounds,
  threshold = 8,
): AlphaBounds {
  let left = region.right + 1;
  let top = region.bottom + 1;
  let right = -1;
  let bottom = -1;
  for (let y = region.top; y <= region.bottom; y++) {
    for (let x = region.left; x <= region.right; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('generated cutout contains no visible pixels');
  return { left, top, right, bottom };
}
