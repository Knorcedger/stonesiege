import { describe, expect, it } from 'vitest';
import { decodeSettings } from './settings';

describe('help settings', () => {
  it('enables extended tooltips by default and preserves an explicit opt-out', () => {
    expect(decodeSettings(null).extendedTooltips).toBe(true);
    expect(decodeSettings(JSON.stringify({ extendedTooltips: false })).extendedTooltips).toBe(false);
    expect(decodeSettings(JSON.stringify({ showHpBars: false })).extendedTooltips).toBe(true);
  });
});
