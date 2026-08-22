// Pure HUD text formatting (DOM-free, unit-tested).

/**
 * Spaced "current / max" counter shared by the pop bar and the HP line.
 * The spaces around the slash keep the two numbers separable at a glance
 * ('HP 2400 / 2400'), which matters most for the "am I housed?" read on the
 * pop bar. Both call sites must use the identical format so that read stays
 * consistent wherever a current/max pair appears.
 */
export function formatRatio(current: number, max: number): string {
  return `${current} / ${max}`;
}
