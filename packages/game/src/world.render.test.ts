// Behavioural cover for the per-frame renderer fast paths: viewport culling,
// the occluder-fade broad phase, and position interpolation across the recycled
// tick buffers. These all exist for speed, so each test states the visible
// behaviour that must survive the optimization.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim/game';
import { grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import type { Entity, EntityId, GameState, ScenarioStart } from '@bf/sim/types';
import {
  shouldFadeForUnit, spriteWorldRect, unitWorldRect, WorldLayer, type EntityView,
} from './world';
import { fakeAssets } from './renderTestutil';

function makeWorld(entities: ScenarioStart['entities'], size = 48): {
  world: WorldLayer;
  state: GameState;
  advance: () => void;
} {
  const game = createGame(scenarioConfig(
    5, grassMap(size, size), entities,
    [player({ isHuman: true, color: 1 }), player({ civ: 'english', color: 2 })],
  ));
  const state = game.state;
  state.players[1].visibility.fill(2);
  const world = new WorldLayer(fakeAssets, 1);
  world.onTick(state);
  world.onTick(state);
  return { world, state, advance: () => { game.advance([]); world.onTick(state); } };
}

function viewOf(world: WorldLayer, id: EntityId): { root: { visible: boolean } } | undefined {
  return (world as unknown as { views: Map<EntityId, { root: { visible: boolean } }> })
    .views.get(id);
}

function findEntity(state: GameState, defId: string): Entity {
  for (const e of state.entities.values()) if (e.defId === defId) return e;
  throw new Error(`no ${defId} in state`);
}

describe('WorldLayer viewport culling', () => {
  it('renders every entity when no camera view is supplied', () => {
    const { world, state } = makeWorld([
      { defId: 'militia', player: 1, tileX: 2, tileY: 2 },
      { defId: 'militia', player: 1, tileX: 44, tileY: 44 },
    ]);
    world.update(state, 0, state.tick);
    for (const e of state.entities.values()) {
      expect(viewOf(world, e.id)?.root.visible).toBe(true);
    }
  });

  it('hides entities outside the camera view and restores them when it pans back', () => {
    const { world, state } = makeWorld([
      { defId: 'militia', player: 1, tileX: 2, tileY: 2 },
      { defId: 'militia', player: 1, tileX: 44, tileY: 44 },
    ]);
    const near = state.entities.get([...state.entities.keys()][0])!;
    const far = state.entities.get([...state.entities.keys()][1])!;

    const onNear = world.entityWorldPos(near, 0);
    const tight = { x0: onNear.x - 100, y0: onNear.y - 100, x1: onNear.x + 100, y1: onNear.y + 100 };
    world.update(state, 0, state.tick, tight);
    expect(viewOf(world, near.id)?.root.visible).toBe(true);
    expect(viewOf(world, far.id)?.root.visible ?? false).toBe(false);

    const onFar = world.entityWorldPos(far, 0);
    const panned = { x0: onFar.x - 100, y0: onFar.y - 100, x1: onFar.x + 100, y1: onFar.y + 100 };
    world.update(state, 0, state.tick, panned);
    expect(viewOf(world, far.id)?.root.visible).toBe(true);
    expect(viewOf(world, near.id)?.root.visible).toBe(false);
  });

  it('still renders tall artwork whose feet sit below the viewport', () => {
    // Sprites are anchored at the feet and drawn upward, so a keep standing just
    // below the bottom edge still reaches into view. Culling on feet position
    // alone with a symmetric margin popped that artwork in and out.
    const { world, state } = makeWorld([{ defId: 'keep', player: 1, tileX: 24, tileY: 24 }]);
    const keep = findEntity(state, 'keep');
    const feet = world.entityWorldPos(keep, 0);
    // Viewport bottom edge 600px above the keep's feet: less than its ~700px of
    // artwork, so part of the building belongs on screen.
    const view = { x0: feet.x - 400, y0: feet.y - 1400, x1: feet.x + 400, y1: feet.y - 600 };
    world.update(state, 0, state.tick, view);
    expect(viewOf(world, keep.id)?.root.visible).toBe(true);
  });

  it('culls artwork far enough below the viewport to be genuinely invisible', () => {
    const { world, state } = makeWorld([{ defId: 'keep', player: 1, tileX: 24, tileY: 24 }]);
    const keep = findEntity(state, 'keep');
    const feet = world.entityWorldPos(keep, 0);
    const view = { x0: feet.x - 400, y0: feet.y - 4000, x1: feet.x + 400, y1: feet.y - 3000 };
    world.update(state, 0, state.tick, view);
    expect(viewOf(world, keep.id)?.root.visible ?? false).toBe(false);
  });

  it('keeps a culled entity selectable — picking ignores the camera', () => {
    const { world, state } = makeWorld([{ defId: 'militia', player: 1, tileX: 40, tileY: 40 }]);
    const unit = findEntity(state, 'militia');
    const away = { x0: -10_000, y0: -10_000, x1: -9_000, y1: -9_000 };
    world.update(state, 0, state.tick, away);
    expect(viewOf(world, unit.id)?.root.visible ?? false).toBe(false);

    const at = world.entityWorldPos(unit, 0);
    expect(world.pickAt(state, at.x, at.y - 12, 24).map((r) => r.entity.id)).toContain(unit.id);
  });
});

describe('WorldLayer occluder fading', () => {
  it('fades a building whose artwork a unit standing behind it overlaps', () => {
    // The militia sits one tile "behind" the barracks in screen depth, so its
    // body falls inside the building sprite and the building must go translucent.
    const { world, state } = makeWorld([
      { defId: 'barracks', player: 1, tileX: 20, tileY: 20 },
      { defId: 'militia', player: 1, tileX: 19, tileY: 19 },
      { defId: 'militia', player: 1, tileX: 2, tileY: 40 },
    ]);
    world.update(state, 0, state.tick);
    const barracks = findEntity(state, 'barracks');
    const sprite = (world as unknown as {
      views: Map<EntityId, { sprite: { alpha: number } }>;
    }).views.get(barracks.id)!.sprite;
    expect(sprite.alpha).toBeLessThan(1);
  });

  it('leaves a building alone when no unit is behind it', () => {
    const { world, state } = makeWorld([
      { defId: 'barracks', player: 1, tileX: 20, tileY: 20 },
      { defId: 'militia', player: 1, tileX: 2, tileY: 40 },
    ]);
    world.update(state, 0, state.tick);
    const barracks = findEntity(state, 'barracks');
    const sprite = (world as unknown as {
      views: Map<EntityId, { sprite: { alpha: number } }>;
    }).views.get(barracks.id)!.sprite;
    expect(sprite.alpha).toBe(1);
  });

  it('reaches the same verdict however many other units are on the field', () => {
    // The broad phase buckets units spatially; a crowd elsewhere on the map must
    // not change what fades, in either direction.
    const crowd: ScenarioStart['entities'] = [
      { defId: 'barracks', player: 1, tileX: 20, tileY: 20 },
      { defId: 'militia', player: 1, tileX: 19, tileY: 19 },
    ];
    for (let i = 0; i < 40; i++) {
      crowd.push({ defId: 'militia', player: 1, tileX: 2 + (i % 8), tileY: 38 + ((i / 8) | 0) });
    }
    const { world, state } = makeWorld(crowd);
    world.update(state, 0, state.tick);
    const views = (world as unknown as {
      views: Map<EntityId, { sprite: { alpha: number } }>;
    }).views;
    expect(views.get(findEntity(state, 'barracks').id)!.sprite.alpha).toBeLessThan(1);
  });
});

describe('WorldLayer occluder fade broad phase', () => {
  /**
   * The bucketed broad phase replaced an exhaustive occluder x unit scan purely
   * for speed, so it has to agree with that scan on every layout. This rebuilds
   * the exhaustive verdict from the same views and demands an exact match over
   * randomized crowds — including units straddling bucket edges, which is where
   * a broad phase gets it wrong.
   */
  function bruteForceFaded(world: WorldLayer, state: GameState): Set<EntityId> {
    const views = (world as unknown as { views: Map<EntityId, EntityView> }).views;
    const units: EntityView[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0 || e.activity === 'dying'
        || e.garrisonedIn !== undefined) continue;
      const view = views.get(e.id);
      if (view?.root.visible) units.push(view);
    }
    const faded = new Set<EntityId>();
    for (const e of state.entities.values()) {
      if ((e.kind !== 'building' && e.kind !== 'resource') || e.hp <= 0) continue;
      const view = views.get(e.id);
      if (!view?.root.visible || !view.sprite.visible) continue;
      if (e.defId === 'farm' || (e.kind === 'building' && (e.buildProgress ?? 1000) < 250)) continue;
      const occluder = spriteWorldRect(view);
      const covered = units.some((unitView) => shouldFadeForUnit(
        occluder, view.root.zIndex, unitWorldRect(unitView), unitView.root.zIndex,
      ));
      if (covered) faded.add(e.id);
    }
    return faded;
  }

  function actualFaded(world: WorldLayer, state: GameState): Set<EntityId> {
    const views = (world as unknown as { views: Map<EntityId, EntityView> }).views;
    const faded = new Set<EntityId>();
    for (const e of state.entities.values()) {
      const view = views.get(e.id);
      if (view && view.root.visible && view.sprite.alpha < 1) faded.add(e.id);
    }
    return faded;
  }

  it('matches an exhaustive occluder x unit scan on randomized crowds', () => {
    let seed = 1234;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % n;
    };
    for (let round = 0; round < 25; round++) {
      const layout: ScenarioStart['entities'] = [];
      const taken = new Set<string>();
      const place = (defId: string, owner: number, span: number): void => {
        for (let attempt = 0; attempt < 12; attempt++) {
          const tileX = 4 + rand(38);
          const tileY = 4 + rand(38);
          let clash = false;
          for (let dy = 0; dy < span && !clash; dy++) {
            for (let dx = 0; dx < span; dx++) {
              if (taken.has(`${tileX + dx},${tileY + dy}`)) { clash = true; break; }
            }
          }
          if (clash) continue;
          for (let dy = 0; dy < span; dy++) {
            for (let dx = 0; dx < span; dx++) taken.add(`${tileX + dx},${tileY + dy}`);
          }
          layout.push({ defId, player: owner, tileX, tileY });
          return;
        }
      };
      for (let i = 0; i < 6; i++) place('barracks', 1, 3);
      for (let i = 0; i < 12; i++) place('tree', 0, 1);
      for (let i = 0; i < 30; i++) place('militia', 1, 1);

      const { world, state } = makeWorld(layout);
      world.update(state, 0, state.tick);
      expect([...actualFaded(world, state)].sort((a, b) => a - b))
        .toEqual([...bruteForceFaded(world, state)].sort((a, b) => a - b));
    }
  });

  it('finds a unit whose body straddles a bucket boundary', () => {
    // FADE_CELL is 128 world px; nudge a unit so its rect spans two buckets and
    // confirm the occluder it covers is still found exactly once.
    const { world, state } = makeWorld([
      { defId: 'barracks', player: 1, tileX: 20, tileY: 20 },
      { defId: 'militia', player: 1, tileX: 19, tileY: 19 },
    ]);
    const unit = findEntity(state, 'militia');
    for (let nudge = 0; nudge < 260; nudge += 13) {
      unit.x += 13;
      world.onTick(state);
      world.update(state, 0, state.tick);
      expect([...actualFaded(world, state)].sort((a, b) => a - b))
        .toEqual([...bruteForceFaded(world, state)].sort((a, b) => a - b));
    }
  });
});

describe('WorldLayer tick position buffers', () => {
  it('interpolates between the two most recent ticks after buffer recycling', () => {
    const { world, state, advance } = makeWorld([{ defId: 'militia', player: 1, tileX: 10, tileY: 10 }]);
    const unit = findEntity(state, 'militia');
    // Several ticks so the ping-ponged buffers have both been reused at least once.
    for (let i = 0; i < 4; i++) advance();
    const startX = unit.x;
    unit.x += 512;
    world.onTick(state);

    const half = world.entityWorldPos(unit, 0.5);
    const full = world.entityWorldPos(unit, 1);
    const none = world.entityWorldPos(unit, 0);
    // alpha 0 must still report the previous tick, proving prevPos was not
    // clobbered when curPos was refilled in place.
    expect(none.x).not.toBe(full.x);
    expect(half.x).toBeCloseTo((none.x + full.x) / 2, 5);
    expect(startX).not.toBe(unit.x);
  });

  it('drops positions for entities that left the sim', () => {
    const { world, state, advance } = makeWorld([
      { defId: 'militia', player: 1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: 1, tileX: 12, tileY: 12 },
    ]);
    const doomed = [...state.entities.values()][0];
    advance();
    (state.entities as Map<EntityId, Entity>).delete(doomed.id);
    world.onTick(state);
    const positions = (world as unknown as { curPos: Map<EntityId, unknown> }).curPos;
    expect(positions.has(doomed.id)).toBe(false);
  });
});
