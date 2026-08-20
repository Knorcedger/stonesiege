import { describe, expect, it } from 'vitest';
import { shouldMirrorWorkDirection, WORK_ANIMS } from './work-sheet-layout';

describe('work-sheet direction extraction', () => {
  it('keeps every authored mining direction unchanged', () => {
    for (let direction = 0; direction < 5; direction++) {
      expect(shouldMirrorWorkDirection('mine', direction)).toBe(false);
    }
  });

  it('still mirrors the eastward middle columns in the other work sheets', () => {
    for (const animation of WORK_ANIMS.filter((name) => name !== 'mine')) {
      expect([0, 1, 2, 3, 4].map((direction) => shouldMirrorWorkDirection(animation, direction)))
        .toEqual([false, true, true, true, false]);
    }
  });
});
