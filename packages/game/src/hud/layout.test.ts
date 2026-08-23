// Responsive top-bar layout contract shared by the HUD and message banner.

import { describe, expect, it } from 'vitest';
import {
  belowTopBarPx, HUD_NARROW_MAX_PX, HUD_RIGHT_CLUSTER_TOP_VAR, HUD_SAFE_AREA_INSET_CSS,
  HUD_SAFE_AREA_ROOT_STYLE, HUD_LAYER, HUD_TOP_BAR_BOTTOM_VAR, hudStageExtentPercent,
  cardOverflowsBound, CARD_OVERFLOW_SLACK_PX, cssVarPx, measuredRightClusterTopPx, measuredTopBarClearPx,
  OBJECTIVES_HEAD_BOTTOM_VAR, OBJECTIVES_LEFT_VAR, OBJECTIVES_MESSAGE_TOP_VAR,
  rightClusterMaxHeightPx,
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
    expect(OBJECTIVES_MESSAGE_TOP_VAR).toBe('--bf-objectives-message-top');
    expect(OBJECTIVES_LEFT_VAR).toBe('--bf-objectives-left');
    expect(OBJECTIVES_HEAD_BOTTOM_VAR).toBe('--bf-objectives-head-bottom');
    const names = [
      HUD_TOP_BAR_BOTTOM_VAR, HUD_RIGHT_CLUSTER_TOP_VAR,
      OBJECTIVES_MESSAGE_TOP_VAR, OBJECTIVES_LEFT_VAR, OBJECTIVES_HEAD_BOTTOM_VAR,
    ];
    for (const name of names) expect(name.startsWith('--')).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * Every published edge is read back through this, and an unpublished one has
   * to degrade to "no obstacle" rather than to zero — a 0 would pin overlays to
   * the top of the screen during the frames before the first measurement.
   */
  it('falls back when an edge has not been published yet', () => {
    expect(cssVarPx('520px', 800)).toBe(520);
    expect(cssVarPx('520', 800)).toBe(520);
    expect(cssVarPx('', 800)).toBe(800);
    expect(cssVarPx('   ', 800)).toBe(800);
    expect(cssVarPx('auto', 800)).toBe(800);
    expect(cssVarPx('', Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
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

/**
 * The cluster is bottom-anchored with no bound of its own, so a card taller
 * than the screen sent its excess off the TOP: at 844x390 a town centre card is
 * 531px, which put its train and research buttons above the viewport where
 * nothing — no scroll, no gesture — could reach them.
 */
describe('right cluster bound', () => {
  it('fills the column between the first clear y and its own bottom', () => {
    expect(CARD_OVERFLOW_SLACK_PX).toBe(1);
    // 844x390 landscape phone: bar clear 48, cluster bottom 384.
    expect(rightClusterMaxHeightPx(384, 48, 1)).toBe(336);
  });

  it('converts into the scaled stage the cluster actually lives in', () => {
    // Every edge is measured on the unscaled root, so a 125% HUD needs fewer
    // stage units to fill the same screen space — and a 75% HUD more.
    expect(rightClusterMaxHeightPx(384, 48, 1.25)).toBe(Math.floor(336 / 1.25));
    expect(rightClusterMaxHeightPx(384, 48, 0.75)).toBe(Math.floor(336 / 0.75));
  });

  it('yields to a wrapped bar and to the objectives head below it', () => {
    // The caller passes whichever is lower; a taller head means a shorter card.
    expect(rightClusterMaxHeightPx(384, 106, 1)).toBe(278);
    expect(rightClusterMaxHeightPx(384, 106, 1)).toBeLessThan(rightClusterMaxHeightPx(384, 48, 1));
  });

  it('never reports a negative bound', () => {
    expect(rightClusterMaxHeightPx(100, 240, 1)).toBe(0);
  });

  /**
   * Dropping the queue reserve is a consequence of being capped, so the test
   * has to be made against the card as it would be WITH the full reserve —
   * otherwise a card that only just overflows un-caps itself, restores the
   * reserve, overflows again, and flips every frame.
   */
  it('judges overflow against the full queue reserve, not the shortened card', () => {
    const shortfall = 140 - 44;
    // Town centre at 844x390: 531px of content in a 278px bound.
    expect(cardOverflowsBound(531, 278, 0)).toBe(true);
    // Shortened to 435 by dropping the reserve — still capped, no flip-flop.
    expect(cardOverflowsBound(435, 278, shortfall)).toBe(true);
    // The borderline case the hysteresis exists for: 340 shortened to 244 would
    // "fit" a 290 bound, but with its reserve back it would not.
    expect(cardOverflowsBound(244, 290, shortfall)).toBe(true);
    // Room enough for the full-reserve card: the reserve comes back.
    expect(cardOverflowsBound(204, 310, shortfall)).toBe(false);
  });

  /**
   * The bound, never the card's own client height: once the card fits, its
   * client height IS its content, so that comparison reads as "overflowing"
   * for ever and a desktop card never gets its queue reserve back.
   */
  it('compares against the room given, not the card it measures', () => {
    // 1280x800 desktop: a 530px card with 688px of room is not capped...
    expect(cardOverflowsBound(530, 688, 0)).toBe(false);
    // ...and the shortened form of the same card must not latch it either.
    expect(cardOverflowsBound(434, 688, 140 - 44)).toBe(false);
    // A card measured against itself always looks 0-1px over: that is slack,
    // not overflow.
    expect(cardOverflowsBound(434, 433, 0)).toBe(false);
    expect(cardOverflowsBound(434, 434, 0)).toBe(false);
    expect(cardOverflowsBound(436, 434, 0)).toBe(true);
  });
});
