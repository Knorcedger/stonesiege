import { describe, expect, it } from 'vitest';
import { shouldMirrorDirectionSheetCell } from './direction-sheet-layout';

describe('4x2 direction-sheet extraction', () => {
  it('corrects the eastward SW and W cells in the generic gather master', () => {
    expect([0, 1, 2, 3, 4].map((direction) =>
      shouldMirrorDirectionSheetCell('villager-gather-directions-cutout-v3.png', direction)))
      .toEqual([false, true, true, false, false]);
  });

  it('keeps direction masters that already follow the runtime convention unchanged', () => {
    for (const source of [
      'villager-directions-cutout-v2.png',
      'villager-carry-directions-cutout-v3.png',
      'sheep-directions-cutout-v3.png',
    ]) {
      expect([0, 1, 2, 3, 4].map((direction) =>
        shouldMirrorDirectionSheetCell(source, direction)))
        .toEqual([false, false, false, false, false]);
    }
  });
});
