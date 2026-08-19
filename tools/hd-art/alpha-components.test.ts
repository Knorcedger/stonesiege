import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { clearMinorAlphaComponents } from './alpha-components';

describe('authored cutout cleanup', () => {
  it('removes disconnected matte specks without changing the subject', () => {
    const png = new PNG({ width: 8, height: 8 });
    for (let y = 2; y <= 5; y++) {
      for (let x = 2; x <= 5; x++) png.data[(y * png.width + x) * 4 + 3] = 255;
    }
    png.data[3] = 255;
    png.data[((png.height - 1) * png.width + png.width - 1) * 4 + 3] = 255;

    clearMinorAlphaComponents(png);

    expect(png.data[3]).toBe(0);
    expect(png.data[((png.height - 1) * png.width + png.width - 1) * 4 + 3]).toBe(0);
    expect(png.data[(3 * png.width + 3) * 4 + 3]).toBe(255);
  });
});
