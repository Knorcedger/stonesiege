// Shared HUD layout contract: the control-group chip strip's geometry lives
// here, in one place, because several top-anchored overlays (scenario message
// banner, objectives panel) must position themselves relative to it. hud.ts
// composes its .bf-chips CSS from these constants, so the strip can never
// silently move out from under the components that clear it.

/** Chip strip top offset (px) on wide viewports (single-row top bar). */
export const CHIPS_TOP_PX = 46;
/** Chip strip top offset (px) where the top bar may wrap to two rows. */
export const CHIPS_TOP_NARROW_PX = 84;
/** Chip buttons are 44px tall (the mobile touch-target floor). */
export const CHIPS_HEIGHT_PX = 44;
/** The max-width (px) media query at which the strip drops to the narrow top. */
export const CHIPS_NARROW_MAX_PX = 720;

/**
 * First clear y (px, plus a margin) below the chip strip — the top for any
 * banner/panel that must never cover the chips (they are always live during
 * normal play; covering them steals group-select taps).
 */
export function belowChipsPx(narrow: boolean, margin = 6): number {
  return (narrow ? CHIPS_TOP_NARROW_PX : CHIPS_TOP_PX) + CHIPS_HEIGHT_PX + margin;
}
