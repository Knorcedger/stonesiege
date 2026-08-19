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

/** Expand the HUD's logical stage before scaling so it still fills its safe parent. */
export function hudStageExtentPercent(scale: number): number {
  return 100 / scale;
}
