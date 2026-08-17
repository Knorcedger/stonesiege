// Responsive top-bar layout contract shared by the HUD and message banner.

import { describe, expect, it } from 'vitest';
import {
  belowTopBarPx, HUD_NARROW_MAX_PX, TOP_BAR_CLEAR_NARROW_PX, TOP_BAR_CLEAR_PX,
} from './layout';

describe('top bar layout contract', () => {
  it('keeps banners below the wide and narrow resource bars', () => {
    expect(belowTopBarPx(false)).toBe(TOP_BAR_CLEAR_PX);
    expect(belowTopBarPx(false)).toBe(46);
    expect(belowTopBarPx(true)).toBe(TOP_BAR_CLEAR_NARROW_PX);
    expect(belowTopBarPx(true)).toBe(84);
    expect(HUD_NARROW_MAX_PX).toBe(720);
  });
});
