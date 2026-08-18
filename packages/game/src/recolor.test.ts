import { describe, expect, it } from 'vitest';
import {
  containsMask, hexToRgb, swapPalette, FALLBACK_MASK_PALETTE,
  FALLBACK_PLAYER_COLOR_NAMES, FALLBACK_PLAYER_RAMPS, type Rgb,
} from './recolor';

const MASK: Rgb[] = FALLBACK_MASK_PALETTE.map(hexToRgb);
const BLUE: Rgb[] = [hexToRgb('#5C8CD6'), hexToRgb('#2F5FB5'), hexToRgb('#1C3B76')];

function px(...pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => out.set([r, g, b, a], i * 4));
  return out;
}

describe('hexToRgb', () => {
  it('parses with and without #', () => {
    expect(hexToRgb('#FF00FF')).toEqual([255, 0, 255]);
    expect(hexToRgb('990099')).toEqual([153, 0, 153]);
  });
});

describe('swapPalette (runtime-swap per ASSET_CONTRACT)', () => {
  it('swaps all three mask tones to the matching ramp tones', () => {
    const data = px([255, 0, 255, 255], [204, 0, 204, 255], [153, 0, 153, 255]);
    swapPalette(data, MASK, BLUE);
    expect([...data.slice(0, 3)]).toEqual(BLUE[0]);
    expect([...data.slice(4, 7)]).toEqual(BLUE[1]);
    expect([...data.slice(8, 11)]).toEqual(BLUE[2]);
  });

  it('is an exact match: non-mask and transparent pixels untouched', () => {
    const data = px(
      [255, 0, 254, 255], // near-magenta but NOT the mask
      [255, 0, 255, 0],   // mask color but fully transparent
      [107, 140, 63, 255], // grassBase
    );
    const before = [...data];
    swapPalette(data, MASK, BLUE);
    expect([...data]).toEqual(before);
  });
});

describe('containsMask', () => {
  it('detects mask pixels and ignores transparent ones', () => {
    expect(containsMask(px([204, 0, 204, 255]), MASK)).toBe(true);
    expect(containsMask(px([204, 0, 204, 0], [10, 20, 30, 255]), MASK)).toBe(false);
  });
});

describe('player color accessibility names', () => {
  it('provides one distinct readable name for every banner ramp', () => {
    expect(FALLBACK_PLAYER_COLOR_NAMES).toHaveLength(FALLBACK_PLAYER_RAMPS.length);
    expect(new Set(FALLBACK_PLAYER_COLOR_NAMES).size).toBe(FALLBACK_PLAYER_RAMPS.length);
    expect(FALLBACK_PLAYER_COLOR_NAMES).toEqual([
      'Blue', 'Red', 'Green', 'Yellow', 'Cyan', 'Purple', 'Gray', 'Orange',
    ]);
  });
});
