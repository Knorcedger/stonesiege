import { describe, expect, it } from 'vitest';
import { decodeSettings } from './settings';

describe('help settings', () => {
  it('enables extended tooltips by default and preserves an explicit opt-out', () => {
    expect(decodeSettings(null).extendedTooltips).toBe(true);
    expect(decodeSettings(JSON.stringify({ extendedTooltips: false })).extendedTooltips).toBe(false);
    expect(decodeSettings(JSON.stringify({ showHpBars: false })).extendedTooltips).toBe(true);
  });

  it('defaults production to 2× and accepts only the supported multipliers', () => {
    expect(decodeSettings(null).productionSpeed).toBe(2);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 1 })).productionSpeed).toBe(1);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 4 })).productionSpeed).toBe(4);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 3 })).productionSpeed).toBe(2);
    expect(decodeSettings(JSON.stringify({ productionSpeed: '4' })).productionSpeed).toBe(2);
  });
});
