import { describe, expect, it } from 'vitest';
import { unitAggroRange } from './aggro';
import { units } from './units';

describe('unitAggroRange', () => {
  it('keeps infantry tighter than cavalry and uses resolved LOS for other troops', () => {
    expect(unitAggroRange(units.militia, 9)).toBe(4);
    expect(unitAggroRange(units.knight, 9)).toBe(6);
    expect(unitAggroRange(units.archer, 7)).toBe(7);
  });
});
