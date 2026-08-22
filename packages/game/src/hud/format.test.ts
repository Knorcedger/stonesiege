// Regression coverage for the "Pop 4/$" bug: the pop counter rendered
// `${pop}/${popCap}` with no spacing, which let the digits and the slash run
// together at HUD sizes. Pop and HP must share the spaced format.

import { describe, expect, it } from 'vitest';
import { formatRatio } from './format';

describe('formatRatio', () => {
  it('spaces the slash so the digits never merge into it', () => {
    expect(formatRatio(4, 5)).toBe('4 / 5');
    expect(formatRatio(2400, 2400)).toBe('2400 / 2400');
    expect(formatRatio(0, 0)).toBe('0 / 0');
  });
});
