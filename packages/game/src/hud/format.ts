// Pure HUD text formatting (DOM-free, unit-tested).

/**
 * Spaced "current / max" counter shared by the pop bar and the HP line.
 * The spaces around the slash are load-bearing: VT323's '5' glyph is S-shaped,
 * and at 16px an unspaced '/' kerns ~1px from it, so '4/5' visually merges
 * into '4$'. The spaced form ('HP 2400 / 2400') is verified legible; pop must
 * use the identical format so the "am I housed?" read never regresses.
 */
export function formatRatio(current: number, max: number): string {
  return `${current} / ${max}`;
}
