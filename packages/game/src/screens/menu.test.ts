import { describe, expect, it } from 'vitest';
import { menuScrollTopAfterRender } from './menu';

describe('menuScrollTopAfterRender', () => {
  it('preserves the setup-panel position for in-place Practice changes', () => {
    expect(menuScrollTopAfterRender(650, true)).toBe(650);
  });

  it('resets real menu navigation to the top', () => {
    expect(menuScrollTopAfterRender(650, false)).toBe(0);
  });

  it('never restores an invalid negative scroll position', () => {
    expect(menuScrollTopAfterRender(-12, true)).toBe(0);
  });
});
