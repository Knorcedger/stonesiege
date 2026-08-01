// Chip-strip layout contract: the message banner (and anything else that must
// clear the control-group chips) derives its top from these numbers — pin them
// so a hud.ts CSS tweak that forgets layout.ts fails loudly here.

import { describe, expect, it } from 'vitest';
import {
  belowChipsPx, CHIPS_HEIGHT_PX, CHIPS_NARROW_MAX_PX, CHIPS_TOP_NARROW_PX, CHIPS_TOP_PX,
} from './layout';

describe('chip strip layout contract', () => {
  it('keeps the 44px touch-target floor', () => {
    expect(CHIPS_HEIGHT_PX).toBe(44);
  });

  it('clearance starts below the strip on both breakpoints', () => {
    // wide: chips at y46..90 -> first clear top 96 (6px margin)
    expect(belowChipsPx(false)).toBe(CHIPS_TOP_PX + CHIPS_HEIGHT_PX + 6);
    expect(belowChipsPx(false)).toBe(96);
    // narrow (<=720px, two-row top bar): chips at y84..128 -> top 134
    expect(belowChipsPx(true)).toBe(CHIPS_TOP_NARROW_PX + CHIPS_HEIGHT_PX + 6);
    expect(belowChipsPx(true)).toBe(134);
    expect(CHIPS_NARROW_MAX_PX).toBe(720);
  });
});
