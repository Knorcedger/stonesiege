import { describe, expect, it } from 'vitest';
import { fp, type GameState } from '@bf/sim/types';
import type { GameAssets } from './assets';
import { tileToWorld } from './camera';
import { FxLayer } from './fx';

describe('move destination feedback', () => {
  it('places a short-lived arrow at the commanded ground point', () => {
    const fx = new FxLayer({} as GameAssets);
    const emptyState = { entities: new Map() } as unknown as GameState;
    const expected = tileToWorld(4, 6);

    fx.showMoveMarker(fp(4), fp(6), 100);
    expect(fx.air.children).toHaveLength(2); // persistent conversion-beam layer + marker
    const marker = fx.air.children[1];
    expect(marker.x).toBe(expected.x);

    fx.update(emptyState, 107);
    expect(marker.alpha).toBeGreaterThan(0);
    expect(marker.y).toBeLessThan(expected.y);

    fx.update(emptyState, 114);
    expect(fx.air.children).toHaveLength(1);
    fx.destroy();
  });
});
