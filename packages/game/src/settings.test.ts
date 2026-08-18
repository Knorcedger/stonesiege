import { describe, expect, it } from 'vitest';
import { decodeSettings } from './settings';

describe('help settings', () => {
  it('enables extended tooltips by default and preserves an explicit opt-out', () => {
    expect(decodeSettings(null).extendedTooltips).toBe(true);
    expect(decodeSettings(JSON.stringify({ extendedTooltips: false })).extendedTooltips).toBe(false);
    expect(decodeSettings(JSON.stringify({ showHpBars: false })).extendedTooltips).toBe(true);
  });

  it('defaults, preserves, and safely clamps HUD scale', () => {
    expect(decodeSettings(null).hudScale).toBe(1);
    expect(decodeSettings(JSON.stringify({ hudScale: 0.85 })).hudScale).toBe(0.85);
    expect(decodeSettings(JSON.stringify({ hudScale: 0.2 })).hudScale).toBe(0.75);
    expect(decodeSettings(JSON.stringify({ hudScale: 3 })).hudScale).toBe(1.25);
  });

  it('defaults production to 2× and accepts only the supported multipliers', () => {
    expect(decodeSettings(null).productionSpeed).toBe(2);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 1 })).productionSpeed).toBe(1);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 4 })).productionSpeed).toBe(4);
    expect(decodeSettings(JSON.stringify({ productionSpeed: 3 })).productionSpeed).toBe(2);
    expect(decodeSettings(JSON.stringify({ productionSpeed: '4' })).productionSpeed).toBe(2);
  });
});
