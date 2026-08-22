import { describe, expect, it, vi } from 'vitest';
import type { GameState, PlayerId } from '@bf/sim/types';
import { placementStatus } from './placement';

const HUMAN = 1 as PlayerId;

function stateWithVisibility(visibility: Uint8Array): GameState {
  return {
    map: { width: 4, height: 4 },
    players: [null, { visibility }],
  } as unknown as GameState;
}

describe('placement preview visibility boundary', () => {
  it('does not sample authoritative occupancy under explored fog', () => {
    const visibility = new Uint8Array(16).fill(2);
    visibility[2 * 4 + 2] = 1;
    const authoritative = vi.fn(() => false);

    expect(placementStatus(
      stateWithVisibility(visibility), HUMAN, 1, 1, 2, authoritative,
    )).toBe('needs-visibility');
    expect(authoritative).not.toHaveBeenCalled();
  });

  it('uses authoritative placement only for a fully visible footprint', () => {
    const state = stateWithVisibility(new Uint8Array(16).fill(2));
    expect(placementStatus(state, HUMAN, 1, 1, 2, () => true)).toBe('valid');
    expect(placementStatus(state, HUMAN, 1, 1, 2, () => false)).toBe('blocked');
  });

  it('reports the public map edge without consulting hidden state', () => {
    const authoritative = vi.fn(() => true);
    expect(placementStatus(
      stateWithVisibility(new Uint8Array(16)), HUMAN, 3, 3, 2, authoritative,
    )).toBe('blocked');
    expect(authoritative).not.toHaveBeenCalled();
  });
});
