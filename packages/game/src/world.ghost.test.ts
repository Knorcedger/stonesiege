// Behavioural cover for the fog-of-war remembered-building ghost.
//
// #138 gave the live sprite, the ghost and the placement preview one shared set
// of drawing rules, and frames.test.ts / world.test.ts pin what each rule
// returns. Nothing pinned that the ghost path still *calls* them — drop
// artScaleForFrame from updateGhosts and every one of those tests stays green
// while a scouted keep quietly returns to 1/2.95 of the tower the player saw.
// That is the shape #116 had: the rule was right, the second renderer just never
// asked for it.
//
// So these assert agreement with the live sprite rather than hardcoded numbers.
// Agreement is the actual requirement, and it survives the art or the scale
// factors being retuned.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim/game';
import { grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import type { Entity, EntityId, GameState, ScenarioStart } from '@bf/sim/types';
import { WorldLayer } from './world';
import { fakeAssets } from './renderTestutil';

const HUMAN = 1;
const ENEMY = 2;

/** The subset of a live view or a ghost view these tests read. */
interface Rig {
  root: { visible: boolean; zIndex: number };
  sprite: { texture: { width: number; height: number }; scale: { x: number; y: number } };
  cornerSprite: { visible: boolean };
}

function makeWorld(entities: ScenarioStart['entities']): {
  world: WorldLayer;
  state: GameState;
  /** Redraw with every tile either currently visible (2) or explored-but-fogged (1). */
  render: (visibility: 1 | 2) => void;
} {
  const game = createGame(scenarioConfig(
    5, grassMap(48, 48), entities,
    [player({ isHuman: true, color: 1 }), player({ civ: 'english', color: 2 })],
  ));
  const state = game.state;
  const world = new WorldLayer(fakeAssets, HUMAN);
  let tick = 0;
  return {
    world,
    state,
    render: (visibility) => {
      state.players[HUMAN].visibility.fill(visibility);
      world.onTick(state);
      world.update(state, 0, tick++);
    },
  };
}

function findEntity(state: GameState, defId: string): Entity {
  for (const e of state.entities.values()) if (e.defId === defId) return e;
  throw new Error(`no ${defId} in state`);
}

function liveRig(world: WorldLayer, id: EntityId): Rig {
  const rig = (world as unknown as { views: Map<EntityId, Rig> }).views.get(id);
  if (!rig) throw new Error(`no live view for ${id}`);
  return rig;
}

function ghostRig(world: WorldLayer, id: EntityId): Rig {
  const rig = (world as unknown as { ghostViews: Map<EntityId, Rig> }).ghostViews.get(id);
  if (!rig) throw new Error(`no ghost view for ${id}`);
  return rig;
}

/** Drawn artwork size in world px — what the player actually judges. */
function drawnSize(rig: Rig): { w: number; h: number } {
  return {
    w: Math.abs(rig.sprite.texture.width * rig.sprite.scale.x),
    h: Math.abs(rig.sprite.texture.height * rig.sprite.scale.y),
  };
}

describe('fog-remembered building ghosts', () => {
  // The fortifications carry an art scale and are what #116 was reported on; the
  // last two carry none, so they keep stating that plain buildings are unaffected.
  it.each(['watchTower', 'guardTower', 'keep', 'gate', 'stoneWall', 'house', 'barracks'])(
    'draws a remembered %s at exactly its live size',
    (defId) => {
      const { world, state, render } = makeWorld([{ defId, player: ENEMY, tileX: 20, tileY: 20 }]);
      const id = findEntity(state, defId).id;
      render(2);
      const live = drawnSize(liveRig(world, id));
      render(1);
      expect(drawnSize(ghostRig(world, id))).toEqual(live);
      expect(live.w).toBeGreaterThan(0);
    },
  );

  it('redraws a tower upgraded out of sight instead of keeping its first art', () => {
    const { world, state, render } = makeWorld([
      { defId: 'watchTower', player: ENEMY, tileX: 20, tileY: 20 },
    ]);
    const tower = findEntity(state, 'watchTower');
    render(2);
    render(1);
    const asWatchTower = drawnSize(ghostRig(world, tower.id));

    // guardTowerUpgrade mutates defId in place on the same entity.
    (tower as { defId: string }).defId = 'guardTower';
    render(2);
    const liveGuardTower = drawnSize(liveRig(world, tower.id));
    render(1);

    expect(drawnSize(ghostRig(world, tower.id))).toEqual(liveGuardTower);
    expect(liveGuardTower).not.toEqual(asWatchTower);
  });

  it('remembers the construction stage it was scouted at, at that stage\'s size', () => {
    const { world, state, render } = makeWorld([
      { defId: 'keep', player: ENEMY, tileX: 20, tileY: 20 },
    ]);
    const keep = findEntity(state, 'keep');
    const setProgress = (v: number): void => {
      (keep as { buildProgress?: number }).buildProgress = v;
    };

    setProgress(500);
    render(2);
    const liveUnderConstruction = drawnSize(liveRig(world, keep.id));
    render(1);
    const ghostUnderConstruction = drawnSize(ghostRig(world, keep.id));
    expect(ghostUnderConstruction).toEqual(liveUnderConstruction);

    setProgress(1000);
    render(2);
    const liveFinished = drawnSize(liveRig(world, keep.id));
    render(1);
    expect(drawnSize(ghostRig(world, keep.id))).toEqual(liveFinished);

    // Construction stages are authored at the footprint width and take no art
    // scale; only the finished tower does. A ghost that skipped the stage would
    // draw the foundation at the finished tower's size.
    expect(liveFinished.w).toBeGreaterThan(liveUnderConstruction.w);
  });

  it('keeps a remembered foundation sorting like the slab it was when seen', () => {
    const { world, state, render } = makeWorld([
      { defId: 'barracks', player: ENEMY, tileX: 20, tileY: 20 },
    ]);
    const barracks = findEntity(state, 'barracks');
    const setProgress = (v: number): void => {
      (barracks as { buildProgress?: number }).buildProgress = v;
    };

    setProgress(200); // flat: a barely-started foundation sorts under everything
    render(2);
    const liveFlat = liveRig(world, barracks.id).root.zIndex;
    render(1);
    expect(ghostRig(world, barracks.id).root.zIndex).toBe(liveFlat);

    // The construct0 frame holds to 334 while the flat/upright rank flips at 250,
    // so re-scouting across that window does not change the ghost's frame. Its
    // depth still has to move, or it stays buried in the ground it stands on.
    setProgress(300);
    render(2);
    const liveUpright = liveRig(world, barracks.id).root.zIndex;
    render(1);
    expect(liveUpright).toBeGreaterThan(liveFlat);
    expect(ghostRig(world, barracks.id).root.zIndex).toBe(liveUpright);
  });

  it('joins a remembered wall corner the way the live corner joins', () => {
    // An L at (20,20): connected neighbours on +tileX and on +tileY.
    const { world, state, render } = makeWorld([
      { defId: 'stoneWall', player: ENEMY, tileX: 20, tileY: 20 },
      { defId: 'stoneWall', player: ENEMY, tileX: 21, tileY: 20 },
      { defId: 'stoneWall', player: ENEMY, tileX: 20, tileY: 21 },
    ]);
    const idAt = (tileX: number, tileY: number): EntityId => {
      for (const e of state.entities.values()) {
        if (e.defId === 'stoneWall' && e.tileX === tileX && e.tileY === tileY) return e.id;
      }
      throw new Error(`no wall at ${tileX},${tileY}`);
    };
    const corner = idAt(20, 20);
    const straight = idAt(21, 20);

    render(2);
    expect(liveRig(world, corner).cornerSprite.visible).toBe(true);
    expect(liveRig(world, straight).cornerSprite.visible).toBe(false);
    const liveCornerScaleX = liveRig(world, corner).sprite.scale.x;

    render(1);
    expect(ghostRig(world, corner).cornerSprite.visible).toBe(true);
    expect(ghostRig(world, straight).cornerSprite.visible).toBe(false);
    expect(ghostRig(world, corner).sprite.scale.x).toBe(liveCornerScaleX);
  });

  it('hides the ghost again once its tile comes back into view', () => {
    const { world, state, render } = makeWorld([
      { defId: 'watchTower', player: ENEMY, tileX: 20, tileY: 20 },
    ]);
    const tower = findEntity(state, 'watchTower');
    render(2);
    render(1);
    expect(ghostRig(world, tower.id).root.visible).toBe(true);
    render(2);
    expect(ghostRig(world, tower.id).root.visible).toBe(false);
  });
});
