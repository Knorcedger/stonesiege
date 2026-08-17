// Shared HUD layout contract for top-anchored overlays. Control groups live in
// Pause, so scenario messages only need to clear the responsive resource bar.

/** First clear y (px) below the single-row top bar, including margin. */
export const TOP_BAR_CLEAR_PX = 46;
/** First clear y (px) where the top bar may wrap to two rows. */
export const TOP_BAR_CLEAR_NARROW_PX = 84;
/** The max-width (px) media query at which the top bar uses its narrow layout. */
export const HUD_NARROW_MAX_PX = 720;

export function belowTopBarPx(narrow: boolean): number {
  return narrow ? TOP_BAR_CLEAR_NARROW_PX : TOP_BAR_CLEAR_PX;
}
