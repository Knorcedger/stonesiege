// Responsive top-bar layout contract shared by the HUD and message banner.

import { describe, expect, it } from 'vitest';
import {
  belowTopBarPx, HUD_NARROW_MAX_PX, HUD_RIGHT_CLUSTER_TOP_VAR, HUD_SAFE_AREA_INSET_CSS,
  HUD_SAFE_AREA_ROOT_STYLE, HUD_LAYER, HUD_TOP_BAR_BOTTOM_VAR, hudStageExtentPercent,
  measuredRightClusterTopPx, measuredTopBarClearPx,
  TOP_BAR_CLEAR_NARROW_PX, TOP_BAR_CLEAR_PX, TOP_BAR_GAP_PX,
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

  /**
   * Regression: the objectives panel used to hardcode a 40px top, which is the
   * bar's bottom edge ONLY as a single unscaled row. A wrapped bar (narrow
   * viewport, or four-digit stockpiles widening the readouts) or a 125% HUD
   * scale pushed the bar under the panel, and the panel — z-index 24 with
   * pointer-events:auto — then ate every tap meant for the controls beneath it,
   * the pause button included. Clearance is measured, never assumed.
   */
  it('clears the top bar from its measured edge, not a constant', () => {
    const root = { top: 0, bottom: 800, height: 800 };

    // Single unscaled row: the old 40px constant, now with a real gap.
    expect(measuredTopBarClearPx({ top: 6, bottom: 40, height: 34 }, root))
      .toBe(40 + TOP_BAR_GAP_PX);

    // Wrapped to two rows (narrow viewport, or widened resource readouts).
    expect(measuredTopBarClearPx({ top: 6, bottom: 70, height: 64 }, root))
      .toBe(70 + TOP_BAR_GAP_PX);

    // 125% HUD scale: taller on screen than any fixed constant predicts.
    expect(measuredTopBarClearPx({ top: 7.5, bottom: 50.5, height: 43 }, root))
      .toBe(Math.ceil(50.5) + TOP_BAR_GAP_PX);

    // Wrapped AND scaled clears far below the old narrow constant.
    expect(measuredTopBarClearPx({ top: 7.5, bottom: 113, height: 105 }, root))
      .toBeGreaterThan(TOP_BAR_CLEAR_NARROW_PX);
  });

  it('measures relative to the safe-area root, not the viewport', () => {
    // A notched device insets the root; the bar's viewport-space edge must be
    // rebased or overlays sit a notch too low.
    const inset = { top: 44, bottom: 800, height: 756 };
    expect(measuredTopBarClearPx({ top: 50, bottom: 84, height: 34 }, inset))
      .toBe(84 - 44 + TOP_BAR_GAP_PX);
  });

  it('falls back to the single-row contract before first layout', () => {
    const root = { top: 0, bottom: 800, height: 800 };
    // jsdom and the frames before first layout report a zero-height bar; a
    // measured 0 would stack overlays on top of the bar.
    expect(measuredTopBarClearPx({ top: 0, bottom: 0, height: 0 }, root)).toBe(TOP_BAR_CLEAR_PX);
    // Never tighter than the single-row contract, whatever the measurement says.
    expect(measuredTopBarClearPx({ top: 0, bottom: 4, height: 4 }, root)).toBe(TOP_BAR_CLEAR_PX);
  });

  it('names the variables the CSS reads', () => {
    expect(HUD_TOP_BAR_BOTTOM_VAR).toBe('--bf-top-bar-bottom');
    expect(HUD_RIGHT_CLUSTER_TOP_VAR).toBe('--bf-right-cluster-top');
    for (const name of [HUD_TOP_BAR_BOTTOM_VAR, HUD_RIGHT_CLUSTER_TOP_VAR]) {
      expect(name.startsWith('--')).toBe(true);
    }
  });

  /**
   * The HUD stage must stay OUT of this scale. Ranking it above the overlays
   * looks like a free hit-test guarantee for the top bar, but the stage's
   * transform flattens the whole HUD into that one rank — so it also buries the
   * objectives panel, the wonder countdown and the objective marker under the
   * bottom-right command card, which is ~520px tall with a town centre selected
   * and reaches all three on a landscape phone. Overlays are kept off the
   * controls by geometry instead.
   */
  it('leaves the HUD stage out of the overlay stacking scale', () => {
    expect(Object.keys(HUD_LAYER)).not.toContain('stage');
  });

  it('orders the overlays against each other', () => {
    // Guidance above the panel it points out of; modals above both.
    expect(HUD_LAYER.objectives).toBeGreaterThan(HUD_LAYER.objectiveMarker);
    expect(HUD_LAYER.messageBanner).toBeGreaterThan(HUD_LAYER.objectives);
    expect(HUD_LAYER.pauseOverlay).toBeGreaterThan(HUD_LAYER.messageBanner);
    expect(HUD_LAYER.helpOverlay).toBeGreaterThan(HUD_LAYER.pauseOverlay);
    // The end screen is terminal — nothing may paint over it.
    const others = Object.entries(HUD_LAYER).filter(([name]) => name !== 'endScreen');
    for (const [, layer] of others) expect(HUD_LAYER.endScreen).toBeGreaterThan(layer);
  });

  it('keeps every overlay layer distinct so paint order is never DOM-dependent', () => {
    const layers = Object.values(HUD_LAYER);
    expect(new Set(layers).size).toBe(layers.length);
  });
});

/**
 * The command cluster is bottom-anchored in the scaled stage and shares the
 * right edge with the objectives panel, so its top edge is the only honest
 * bound on how tall that panel's list may grow. Nothing about it is constant:
 * the card is ~120px with a villager selected and ~500px with a town centre.
 */
describe('right cluster edge', () => {
  const root = { top: 0, bottom: 800, height: 800 };

  it('reports the measured top edge, root-relative', () => {
    expect(measuredRightClusterTopPx({ top: 520, bottom: 794, height: 274 }, root)).toBe(520);
  });

  it('frees the whole column when nothing is selected', () => {
    // Both panels are display:none, so the flex cluster collapses to zero height
    // and its top edge sits on its own bottom anchor — meaningless as a bound.
    expect(measuredRightClusterTopPx({ top: 794, bottom: 794, height: 0 }, root)).toBe(root.height);
  });

  it('rebases onto the safe-area root, like the top bar', () => {
    const inset = { top: 44, bottom: 800, height: 756 };
    expect(measuredRightClusterTopPx({ top: 300, bottom: 794, height: 494 }, inset)).toBe(256);
  });

  it('clamps a cluster taller than the screen to zero free space', () => {
    // Landscape phone, town centre selected: the card starts above the viewport.
    const phone = { top: 0, bottom: 390, height: 390 };
    expect(measuredRightClusterTopPx({ top: -120, bottom: 384, height: 504 }, phone)).toBe(0);
  });
});
