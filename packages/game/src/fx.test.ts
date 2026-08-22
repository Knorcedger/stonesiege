import { describe, expect, it } from 'vitest';
import { fp, type Entity, type EntityId, type GameState, type PlayerId } from '@bf/sim/types';
import type { GameAssets } from './assets';
import { tileToWorld } from './camera';
import { FxLayer } from './fx';

const HUMAN = 1 as PlayerId;
const ENEMY = 2 as PlayerId;
const MAP = 32;

/** Mutable entity map plus the fog grid the fx layer reads for the human player. */
function harness(entities: Entity[], visibility?: Uint8Array) {
  const map = new Map<EntityId, Entity>(entities.map((e) => [e.id, e]));
  const state = {
    entities: map,
    map: { width: MAP, height: MAP },
    players: { [HUMAN]: { visibility: visibility ?? null } },
  } as unknown as GameState;
  return { state, entities: map };
}

/** Everything currently visible except the listed tiles, which are explored-but-dark. */
function fogExcept(dark: Array<[number, number]>): Uint8Array {
  const vis = new Uint8Array(MAP * MAP).fill(2);
  for (const [tx, ty] of dark) vis[ty * MAP + tx] = 1;
  return vis;
}

describe('move destination feedback', () => {
  it('places a short-lived arrow at the commanded ground point', () => {
    const fx = new FxLayer({} as GameAssets, HUMAN);
    const { state } = harness([]);
    const expected = tileToWorld(4, 6);

    fx.showMoveMarker(fp(4), fp(6), 100);
    expect(fx.air.children).toHaveLength(1); // persistent conversion-beam layer
    expect(fx.overlay.children).toHaveLength(1);
    const marker = fx.overlay.children[0];
    expect(marker.x).toBe(expected.x);

    fx.update(state, 107);
    expect(marker.alpha).toBeGreaterThan(0);
    expect(marker.y).toBeLessThan(expected.y);

    fx.update(state, 114);
    expect(fx.overlay.children).toHaveLength(0);
    fx.destroy();
  });
});

describe('target-aimed order feedback', () => {
  const foundation = {
    id: 12 as EntityId, kind: 'building', defId: 'house', player: HUMAN,
    x: fp(8), y: fp(9), tileX: 7, tileY: 8, facing: 0,
    hp: 40, maxHp: 750, activity: 'idle', buildProgress: 200,
  } as Entity;
  const scout = {
    id: 13 as EntityId, kind: 'unit', defId: 'scout', player: ENEMY,
    x: fp(8), y: fp(9), tileX: 8, tileY: 9, facing: 0,
    hp: 45, maxHp: 45, activity: 'moving',
  } as Entity;

  it('pulses the commanded building twice, then clears itself', () => {
    const fx = new FxLayer({} as GameAssets, HUMAN);
    const { state } = harness([foundation]);
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

  it('follows a visible target that walks away, and holds the point once it dies', () => {
    const fx = new FxLayer({} as GameAssets, HUMAN);
    const { state, entities } = harness([scout], fogExcept([]));

    fx.showTargetPing(scout, 100, 'attack');
    const ping = fx.overlay.children[0];

    const moved = tileToWorld(14, 9);
    entities.set(scout.id, { ...scout, x: fp(14), tileX: 14 });
    fx.update(state, 106);
    expect(ping.x).toBe(moved.x);

    entities.delete(scout.id);
    fx.update(state, 112);
    expect(ping.x).toBe(moved.x); // last known point, not a jump back to the origin

    fx.update(state, 124);
    expect(fx.overlay.children).toHaveLength(0);
    fx.destroy();
  });

  it('stops tracking a target that escapes into fog instead of tracing its path', () => {
    // The overlay draws above the fog sprite, so a ping that kept following an
    // enemy would show the player exactly where an unseen scout ran to.
    const fx = new FxLayer({} as GameAssets, HUMAN);
    const { state, entities } = harness([scout], fogExcept([[14, 9]]));
    const ordered = tileToWorld(8, 9);

    fx.showTargetPing(scout, 100, 'attack');
    const ping = fx.overlay.children[0];

    entities.set(scout.id, { ...scout, x: fp(14), tileX: 14 });
    fx.update(state, 106);
    expect(ping.x).toBe(ordered.x);
    fx.destroy();
  });

  it('keeps tracking own targets, which the fog never hides', () => {
    // A villager ordered onto its own building must not have its ping frozen
    // just because the footprint tile is momentarily out of vision.
    const fx = new FxLayer({} as GameAssets, HUMAN);
    const own = { ...scout, id: 14 as EntityId, player: HUMAN } as Entity;
    const { state, entities } = harness([own], fogExcept([[14, 9]]));

    fx.showTargetPing(own, 100, 'work');
    const ping = fx.overlay.children[0];

    entities.set(own.id, { ...own, x: fp(14), tileX: 14 });
    fx.update(state, 106);
    expect(ping.x).toBe(tileToWorld(14, 9).x);
    fx.destroy();
  });
});
