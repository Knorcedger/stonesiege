// Shared HUD layout contract for top-anchored overlays. Control groups live in
// Pause, so scenario messages only need to clear the responsive resource bar.

/** First clear y (px) below the single-row top bar, including margin. */
export const TOP_BAR_CLEAR_PX = 46;
/** First clear y (px) where the top bar may wrap to two rows. */
export const TOP_BAR_CLEAR_NARROW_PX = 84;
/** The max-width (px) media query at which the top bar uses its narrow layout. */
export const HUD_NARROW_MAX_PX = 720;

/**
 * The in-match DOM UI is inset once, outside the user-scaled HUD stage. The
 * variables are defined by the web shell from env(safe-area-inset-*), while
 * the zero fallbacks keep embedded/desktop hosts unchanged.
 */
export const HUD_SAFE_AREA_INSET_CSS = [
  'var(--bf-safe-area-top, 0px)',
  'var(--bf-safe-area-right, 0px)',
  'var(--bf-safe-area-bottom, 0px)',
  'var(--bf-safe-area-left, 0px)',
].join(' ');

export const HUD_SAFE_AREA_ROOT_STYLE =
  `position:absolute;inset:${HUD_SAFE_AREA_INSET_CSS};pointer-events:none;`;

export function belowTopBarPx(narrow: boolean): number {
  return narrow ? TOP_BAR_CLEAR_NARROW_PX : TOP_BAR_CLEAR_PX;
}

/**
 * CSS variable the HUD publishes onto the safe-area root: the first clear y
 * (px, root-relative) below the top bar as actually laid out.
 *
 * Overlays anchored under the bar live on the unscaled root, while the bar
 * itself sits inside the transform-scaled HUD stage. Its on-screen bottom edge
 * therefore moves with BOTH the HUD scale setting and content-driven wrapping
 * (a narrow bar re-wraps once four-digit stockpiles widen the resource
 * readouts), so no constant can predict it. Anything that must clear the bar
 * reads this variable and falls back to the single-row contract.
 */
export const HUD_TOP_BAR_BOTTOM_VAR = '--bf-top-bar-bottom';

/** Breathing room (px) between the bar and whatever is anchored below it. */
export const TOP_BAR_GAP_PX = 6;

/**
 * Stacking order inside the HUD root, in one place because the layers are set
 * in three different CSS blocks and only make sense against each other.
 *
 * The HUD stage carries a transform, which makes it a stacking context: every
 * control inside it — the whole top bar included — collapses into the single
 * `stage` layer. So the stage must outrank the scenario overlays mounted beside
 * it on the root, or a decorative panel that happens to cover a control wins
 * the hit test and the control silently stops responding. The modal overlays
 * must in turn outrank the stage, since they are meant to cover the HUD.
 */
export const HUD_LAYER = {
  objectiveMarker: 23,
  objectives: 24,
  messageBanner: 28,
  stage: 30,
  pauseOverlay: 40,
  helpOverlay: 45,
} as const;

/** The subset of DOMRect the clearance math needs, so it is testable without a DOM. */
export interface EdgeRect {
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}

/**
 * First clear y (px, relative to `root`) below the measured top bar. An
 * unmeasured bar (height 0 before first layout) degrades to the single-row
 * contract rather than collapsing overlays onto the bar.
 */
export function measuredTopBarClearPx(bar: EdgeRect, root: EdgeRect): number {
  if (!(bar.height > 0)) return TOP_BAR_CLEAR_PX;
  return Math.max(TOP_BAR_CLEAR_PX, Math.ceil(bar.bottom - root.top) + TOP_BAR_GAP_PX);
}

/** Expand the HUD's logical stage before scaling so it still fills its safe parent. */
export function hudStageExtentPercent(scale: number): number {
  return 100 / scale;
}
