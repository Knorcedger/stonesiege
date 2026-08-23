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
 * CSS variable the HUD publishes onto the safe-area root: the top edge (px,
 * root-relative) of the bottom-right command cluster — the selection panel and
 * the command card.
 *
 * The cluster shares its screen column with the objectives panel (both are
 * anchored to the right edge), and it is bottom-anchored inside the scaled HUD
 * stage, so its top edge moves with the selection (a town centre card is ~500px
 * tall, a lone villager's a third of that), with the production queue, and with
 * the HUD scale setting. Anything anchored above it measures this variable
 * instead of guessing; unset means nothing is selected and the column is free.
 */
export const HUD_RIGHT_CLUSTER_TOP_VAR = '--bf-right-cluster-top';

/**
 * Stacking order of the overlays mounted on the HUD root, in one place because
 * they are declared across four CSS blocks and only make sense against one
 * another.
 *
 * The HUD stage itself is NOT in this scale, and deliberately carries no
 * z-index. Its transform already makes it a stacking context, so every control
 * inside it collapses into one layer; giving that layer a rank would order the
 * whole HUD against each overlay at once, and the overlays need opposite
 * answers. The objectives panel has to stay above the bottom-right command
 * card (which is 500px tall with a town centre selected, and reaches the panel
 * on a landscape phone) while staying clear of the top bar. Ranking the stage
 * above the panel buys a hit-test guarantee for the bar and pays for it by
 * burying the panel, the wonder countdown and the objective marker under the
 * card. Keeping overlays and controls apart is a geometry job — see
 * HUD_TOP_BAR_BOTTOM_VAR — so the layers below only order overlay against
 * overlay.
 */
export const HUD_LAYER = {
  objectiveMarker: 23,
  objectives: 24,
  wonderBanner: 25,
  messageBanner: 28,
  ageBanner: 30,
  attackPulse: 35,
  pauseOverlay: 40,
  helpOverlay: 45,
  endScreen: 50,
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

/**
 * Top edge (px, relative to `root`) of the bottom-right command cluster. An
 * empty cluster (nothing selected, so both panels are display:none) reports the
 * root's full height: the column above it is free all the way down.
 *
 * A cluster taller than the root — a town centre card on a landscape phone —
 * clamps to 0 rather than reporting a negative edge, so callers read "no free
 * space" instead of inverted geometry.
 */
export function measuredRightClusterTopPx(cluster: EdgeRect, root: EdgeRect): number {
  if (!(cluster.height > 0)) return root.height;
  return Math.max(0, Math.min(root.height, Math.floor(cluster.top - root.top)));
}

/** Expand the HUD's logical stage before scaling so it still fills its safe parent. */
export function hudStageExtentPercent(scale: number): number {
  return 100 / scale;
}
