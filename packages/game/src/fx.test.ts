import { describe, expect, it } from 'vitest';
import { fp, type Entity, type EntityId, type GameState } from '@bf/sim/types';
import type { GameAssets } from './assets';
import { tileToWorld } from './camera';
import { FxLayer } from './fx';

describe('move destination feedback', () => {
  it('places a short-lived arrow at the commanded ground point', () => {
    const fx = new FxLayer({} as GameAssets);
    const emptyState = { entities: new Map() } as unknown as GameState;
    const expected = tileToWorld(4, 6);

    fx.showMoveMarker(fp(4), fp(6), 100);
    expect(fx.air.children).toHaveLength(1); // persistent conversion-beam layer
    expect(fx.overlay.children).toHaveLength(1);
    const marker = fx.overlay.children[0];
    expect(marker.x).toBe(expected.x);

    fx.update(emptyState, 107);
    expect(marker.alpha).toBeGreaterThan(0);
    expect(marker.y).toBeLessThan(expected.y);

    fx.update(emptyState, 114);
    expect(fx.overlay.children).toHaveLength(0);
    fx.destroy();
  });
});

describe('target-aimed order feedback', () => {
  const foundation = {
    id: 12 as EntityId, kind: 'building', defId: 'house', player: 1,
    x: fp(8), y: fp(9), tileX: 7, tileY: 8, facing: 0,
    hp: 40, maxHp: 750, activity: 'idle', buildProgress: 200,
  } as Entity;

  it('pulses the commanded building twice, then clears itself', () => {
    const fx = new FxLayer({} as GameAssets);
    const state = { entities: new Map([[foundation.id, foundation]]) } as unknown as GameState;
    const expected = tileToWorld(8, 9);

    fx.showTargetPing(foundation, 100, 'work');
    expect(fx.overlay.children).toHaveLength(1);
    const ping = fx.overlay.children[0];
    expect(ping.x).toBe(expected.x);
    expect(ping.y).toBe(expected.y);

    // First pulse fades out...
    fx.update(state, 111);
    const firstPulseEnd = ping.alpha;
    // ...and the second one starts over brighter than the trough it just left.
    fx.update(state, 113);
    expect(ping.alpha).toBeGreaterThan(firstPulseEnd);

    fx.update(state, 124);
    expect(fx.overlay.children).toHaveLength(0);
    fx.destroy();
  });

  it('follows a target that walks away and keeps the last point once it dies', () => {
    const fx = new FxLayer({} as GameAssets);
    const target = { ...foundation, kind: 'unit', defId: 'militia' } as Entity;
    const entities = new Map<EntityId, Entity>([[target.id, target]]);
    const state = { entities } as unknown as GameState;

    fx.showTargetPing(target, 100, 'attack');
    const ping = fx.overlay.children[0];

    const moved = tileToWorld(14, 9);
    entities.set(target.id, { ...target, x: fp(14) });
    fx.update(state, 106);
    expect(ping.x).toBe(moved.x);

    entities.delete(target.id);
    fx.update(state, 112);
    expect(ping.x).toBe(moved.x); // last known point, not a jump back to the origin

    fx.update(state, 124);
    expect(fx.overlay.children).toHaveLength(0);
    fx.destroy();
  });
});
