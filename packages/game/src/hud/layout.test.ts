// Responsive top-bar layout contract shared by the HUD and message banner.

import { describe, expect, it } from 'vitest';
import {
  belowTopBarPx, HUD_NARROW_MAX_PX, HUD_SAFE_AREA_INSET_CSS, HUD_SAFE_AREA_ROOT_STYLE,
  hudStageExtentPercent, TOP_BAR_CLEAR_NARROW_PX, TOP_BAR_CLEAR_PX,
} from './layout';

describe('top bar layout contract', () => {
  it('keeps banners below the wide and narrow resource bars', () => {
    expect(belowTopBarPx(false)).toBe(TOP_BAR_CLEAR_PX);
    expect(belowTopBarPx(false)).toBe(46);
    expect(belowTopBarPx(true)).toBe(TOP_BAR_CLEAR_NARROW_PX);
    expect(belowTopBarPx(true)).toBe(84);
    expect(HUD_NARROW_MAX_PX).toBe(720);
  });

  it('insets the shared UI root once, outside HUD scaling', () => {
    expect(HUD_SAFE_AREA_INSET_CSS).toBe([
      'var(--bf-safe-area-top, 0px)',
      'var(--bf-safe-area-right, 0px)',
      'var(--bf-safe-area-bottom, 0px)',
      'var(--bf-safe-area-left, 0px)',
    ].join(' '));
    expect(HUD_SAFE_AREA_ROOT_STYLE).toBe(
      `position:absolute;inset:${HUD_SAFE_AREA_INSET_CSS};pointer-events:none;`,
    );

    for (const scale of [0.75, 1, 1.25]) {
      expect(hudStageExtentPercent(scale) * scale).toBeCloseTo(100);
    }
  });
});
