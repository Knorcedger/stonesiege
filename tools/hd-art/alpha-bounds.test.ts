import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { alphaBounds } from './alpha-bounds';

describe('alphaBounds', () => {
  it('ignores low-alpha corner noise when a stricter authored threshold is used', () => {
    const png = new PNG({ width: 6, height: 5 });
    png.data[(0 * png.width + 0) * 4 + 3] = 8;
    for (let y = 1; y <= 3; y++) {
      for (let x = 2; x <= 4; x++) png.data[(y * png.width + x) * 4 + 3] = 255;
    }
    const region = { left: 0, top: 0, right: 5, bottom: 4 };

    expect(alphaBounds(png, region, 8)).toEqual({ left: 0, top: 0, right: 4, bottom: 3 });
    expect(alphaBounds(png, region, 16)).toEqual({ left: 2, top: 1, right: 4, bottom: 3 });
  });
});
