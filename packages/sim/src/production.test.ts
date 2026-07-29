import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { fp, TICKS_PER_SECOND } from './types';
import type { Game, SimEvent } from './types';
import { entitiesOf, grassMap, player, scenarioConfig, tileDist } from './testutil';

const VILLAGER_TICKS = 25 * TICKS_PER_SECOND;

function makeTcGame(startFood = 500): Game {
  const map = grassMap(30, 30);
  return createGame(scenarioConfig(11, map, [
    { defId: 'townCenter', player: 1, tileX: 13, tileY: 13 },
  ], [player({ startingResources: { food: startFood, wood: 0, gold: 0, stone: 0 } })]));
}

describe('production', () => {
  it('train deducts cost at queue time, reserves pop, spawns adjacent after train time', () => {
    const game = makeTcGame();
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p = game.state.players[1];
    expect(p.pop).toBe(0);
    expect(p.popCap).toBe(5);

    game.advance([{ kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' }]);
    expect(p.stockpile.food).toBe(450); // cost deducted immediately
    expect(tc.trainQueue).toHaveLength(1);
    expect(p.pop).toBe(1); // reserved once the item hits the front

    let spawned: SimEvent | undefined;
    let ticks = 1;
    for (; ticks <= VILLAGER_TICKS + 5; ticks++) {
      const events = game.advance([]);
      spawned = events.find((e) => e.kind === 'unitTrained');
      if (spawned) break;
    }
    expect(spawned).toBeDefined();
    expect(ticks).toBeGreaterThanOrEqual(VILLAGER_TICKS - 1);
    expect(ticks).toBeLessThanOrEqual(VILLAGER_TICKS + 1);

    const vill = entitiesOf(game.state.entities, 1, 'villager')[0];
    expect(vill).toBeDefined();
    expect(p.pop).toBe(1); // not double counted
    expect(tileDist(vill, { tileX: tc.tileX, tileY: tc.tileY })).toBeLessThanOrEqual(5);
    expect(game.isWalkable(vill.tileX, vill.tileY)).toBe(true);
    expect(tc.trainQueue).toHaveLength(0);
  });

  it('enforces housing: training stalls at the pop cap until room opens', () => {
    const game = makeTcGame(1000);
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p = game.state.players[1];

    // queue 6 villagers; TC provides pop 5
    const cmds = Array.from({ length: 6 }, () => ({ kind: 'train' as const, player: 1, buildingId: tc.id, defId: 'villager' }));
    game.advance([cmds[0], cmds[1], cmds[2], cmds[3], cmds[4], cmds[5]]);
    expect(p.stockpile.food).toBe(1000 - 6 * 50);
    expect(tc.trainQueue).toHaveLength(6);

    for (let t = 0; t < VILLAGER_TICKS * 6; t++) game.advance([]);
    expect(entitiesOf(game.state.entities, 1, 'villager')).toHaveLength(5);
    expect(p.pop).toBe(5);
    expect(tc.trainQueue).toHaveLength(1); // sixth is housed
    expect(tc.trainQueue![0].started).toBeFalsy();
    expect(tc.trainQueue![0].ticksLeft).toBe(tc.trainQueue![0].totalTicks);

    // free room: delete a villager -> the stalled item starts (same tick) and completes
    const victim = entitiesOf(game.state.entities, 1, 'villager')[0];
    game.advance([{ kind: 'deleteEntity', player: 1, entityId: victim.id }]);
    expect(p.pop).toBe(5); // 4 after the delete, +1 reserved as training resumes
    expect(tc.trainQueue![0].started).toBe(true);
    for (let t = 0; t < VILLAGER_TICKS + 10; t++) game.advance([]);
    expect(entitiesOf(game.state.entities, 1, 'villager')).toHaveLength(5);
    expect(p.pop).toBe(5);
    expect(tc.trainQueue).toHaveLength(0);
  });

  it('cancelTrain refunds the exact cost and releases reserved pop', () => {
    const game = makeTcGame(500);
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p = game.state.players[1];
    game.advance([
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
    ]);
    expect(p.stockpile.food).toBe(400);
    expect(p.pop).toBe(1); // front item reserved

    game.advance([{ kind: 'cancelTrain', player: 1, buildingId: tc.id, index: 1 }]);
    expect(p.stockpile.food).toBe(450);
    expect(p.pop).toBe(1);

    game.advance([{ kind: 'cancelTrain', player: 1, buildingId: tc.id, index: 0 }]);
    expect(p.stockpile.food).toBe(500);
    expect(p.pop).toBe(0);
    expect(tc.trainQueue).toHaveLength(0);
  });

  it('caps the queue at 15 and rejects unaffordable/illegal trains silently', () => {
    const game = makeTcGame(50 * 40);
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const cmds = Array.from({ length: 20 }, () => ({ kind: 'train' as const, player: 1, buildingId: tc.id, defId: 'villager' }));
    game.advance(cmds);
    expect(tc.trainQueue).toHaveLength(15);

    // TC cannot train militia; unknown defs are dropped; both silent
    const before = game.state.players[1].stockpile.food;
    game.advance([
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'militia' },
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'notAUnit' },
    ]);
    expect(game.state.players[1].stockpile.food).toBe(before);
    expect(tc.trainQueue).toHaveLength(15);
  });

  it('new units walk to the rally point; rally on a resource records gather intent', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(12, map, [
      { defId: 'townCenter', player: 1, tileX: 13, tileY: 13 },
      { defId: 'berryBush', player: 0, tileX: 24, tileY: 24 },
    ], [player({ startingResources: { food: 500 } })]));
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const bush = entitiesOf(game.state.entities, 0, 'berryBush')[0];

    game.advance([
      { kind: 'setRally', player: 1, buildingId: tc.id, x: fp(24), y: fp(24), targetId: bush.id },
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
    ]);
    expect(tc.rally).toEqual({ x: fp(24), y: fp(24), targetId: bush.id });

    for (let t = 0; t < VILLAGER_TICKS + 5; t++) game.advance([]);
    const vill = entitiesOf(game.state.entities, 1, 'villager')[0];
    expect(vill).toBeDefined();
    expect(vill.intent).toEqual({ kind: 'gather', targetId: bush.id }); // wave-2 hook
    for (let t = 0; t < 900; t++) game.advance([]);
    expect(tileDist(vill, bush)).toBeLessThanOrEqual(2); // walked to the rally
  });

  it('deleting a building refunds its queue; resign ends the game', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(13, map, [
      { defId: 'townCenter', player: 1, tileX: 5, tileY: 5 },
      { defId: 'townCenter', player: 2, tileX: 20, tileY: 20 },
    ], [player(), player({ civ: 'english' })]));
    const tc1 = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p1 = game.state.players[1];

    game.advance([
      { kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' },
      { kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' },
    ]);
    expect(p1.stockpile.food).toBe(100);
    game.advance([{ kind: 'deleteEntity', player: 1, entityId: tc1.id }]);
    expect(p1.stockpile.food).toBe(200); // queue refunded
    expect(p1.pop).toBe(0); // reservation released
    expect(p1.popCap).toBe(0); // TC gone

    const events = game.advance([{ kind: 'resign', player: 2 }]);
    expect(events.some((e) => e.kind === 'playerDefeated' && e.player === 2)).toBe(true);
    const victory = events.find((e) => e.kind === 'victory');
    expect(victory).toBeDefined();
    expect(victory!.kind === 'victory' && victory!.winners).toEqual([1]);
    expect(game.state.finished).toBe(true);
    expect(game.advance([])).toEqual([]); // finished games no-op
  });
});
