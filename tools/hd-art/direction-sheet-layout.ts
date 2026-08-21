/**
 * Corrective horizontal flips for authored 4x2 direction masters.
 *
 * Most masters already use the runtime S/SW/W/NW/N convention in the five cells
 * selected by slice-direction-sheet.ts. The generic villager gather master is an
 * exception: its SW and W cells were rendered as their eastward counterparts.
 */
export function shouldMirrorDirectionSheetCell(source: string, direction: number): boolean {
  return source === 'villager-gather-directions-cutout-v3.png'
    && (direction === 1 || direction === 2);
}
