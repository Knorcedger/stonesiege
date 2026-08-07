// Construction: pay-at-placement foundations, AoE2 multi-builder progress (3T/(N+2)),
// builder approach + release, pop cap on completion, and foundation delete refunds.

import { describe, expect, it } from 'vitest';
import { fp } from './types';
import type { Command, Game, SimEvent } from './types';
import { createGame, createGameFromSnapshot } from './game';
import type { SimState } from './internal';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function setup(villagers: Array<{ x: number; y: number }>): Game {
  const map = grassMap(40, 40);
  return createGame(scenarioConfig(
    7,
    map,
    villagers.map((v, i) => ({ defId: 'villager', player: HUMAN, tileX: v.x, tileY: v.y, ref: `v${i}` })),
    [player()],
  ));
}

function run(game: Game, ticks: number, first: Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.advance(i === 0 ? first : []));
  return events;
}

describe('construction', () => {
  it('approaches a farm by the shortest reachable side instead of circling a Town Center', () => {
    const game = createGame(scenarioConfig(70, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 8, tileY: 12, ref: 'builder' },
      { defId: 'townCenter', player: HUMAN, tileX: 10, tileY: 10 },
      { defId: 'mill', player: HUMAN, tileX: 4, tileY: 4 },
    ], [player()]));
    const state = game.state as SimState;
    const builder = state.refs.get('builder')!;

    game.advance([{
      kind: 'build', player: HUMAN, units: [builder], defId: 'farm', tileX: 14, tileY: 8,
    }]);

    const path = state.motion.get(builder)?.path;
    expect(path).not.toBeNull();
    expect(path?.length).toBeGreaterThan(0);
    const endpoint = path![path!.length - 1];
    expect([endpoint % state.map.width, Math.floor(endpoint / state.map.width)]).toEqual([13, 9]);
  });

  it('turns a builder toward the foundation before playing the build animation', () => {
    const game = setup([{ x: 11, y: 12 }]);
    const builderId = game.state.refs.get('v0')!;
    game.advance([{
      kind: 'build', player: HUMAN, units: [builderId], defId: 'house', tileX: 12, tileY: 10,
    }]);
    const builder = game.state.entities.get(builderId)!;
    expect(builder.activity).toBe('building');
    expect(builder.facing).toBe(6); // screen-right / east toward the house
  });

  it('a builder displaced by another placement resumes the original foundation', () => {
    const game = setup([{ x: 10, y: 10 }, { x: 8, y: 10 }]);
    const state = game.state as SimState;
    const originalBuilder = state.refs.get('v0')!;
    const secondBuilder = state.refs.get('v1')!;
    game.advance([{
      kind: 'build', player: HUMAN, units: [originalBuilder], defId: 'house', tileX: 12, tileY: 10,
    }]);
    run(game, 20);
    const firstHouse = entitiesOf(state.entities, HUMAN, 'house')[0];
    const progressBeforeDisplacement = firstHouse.buildProgress!;

    // The new 2x2 footprint covers the original builder's current tile.
    game.advance([{
      kind: 'build', player: HUMAN, units: [secondBuilder], defId: 'house', tileX: 9, tileY: 9,
    }]);
    expect(state.entities.get(originalBuilder)!.intent).toEqual({ kind: 'build', targetId: firstHouse.id });

    run(game, 180);
    expect(firstHouse.buildProgress).toBeGreaterThan(progressBeforeDisplacement);
    expect(state.entities.get(originalBuilder)!.intent).toEqual({ kind: 'build', targetId: firstHouse.id });
  });

  it('build pays up front, places a blocking foundation, and a villager raises it', () => {
    const game = setup([{ x: 10, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    const woodBefore = game.state.players[HUMAN].stockpile.wood;

    const events = run(game, 3, [
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 },
    ]);

    expect(game.state.players[HUMAN].stockpile.wood).toBe(woodBefore - 25);
    const placed = events.find((e) => e.kind === 'buildingPlaced');
    expect(placed).toBeDefined();
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];
    expect(house).toBeDefined();
    expect(house.buildProgress).toBeLessThan(1000);
    expect(house.hp).toBeGreaterThan(0);
    expect(house.hp).toBeLessThan(house.maxHp);
    expect(game.isWalkable(12, 10)).toBe(false); // foundation blocks its tiles

    const earlyHp = house.hp;
    run(game, 80);
    expect(house.buildProgress).toBeGreaterThan(0);
    expect(house.hp).toBeGreaterThan(earlyHp);

    // adjacent villager starts building immediately and completes in ~buildTime (25s = 500 ticks)
    const done = run(game, 520);
    expect(done.some((e) => e.kind === 'buildingComplete' && e.defId === 'house')).toBe(true);
    expect(house.buildProgress).toBe(1000);
    expect(house.hp).toBe(house.maxHp);
    expect(game.state.players[HUMAN].popCap).toBe(5); // house comes online -> pop capacity
    const builder = game.state.entities.get(vid)!;
    expect(builder.activity).toBe('idle');
    expect(builder.intent).toBeUndefined();
  });

  it('three villagers build at the AoE2 rate 3T/(N+2) — measurably faster than one', () => {
    const solo = setup([{ x: 10, y: 10 }]);
    run(solo, 1, [{ kind: 'build', player: HUMAN, units: [solo.state.refs.get('v0')!], defId: 'house', tileX: 12, tileY: 10 }]);
    let soloTicks = 0;
    for (; soloTicks < 1000; soloTicks++) {
      if (solo.advance([]).some((e) => e.kind === 'buildingComplete')) break;
    }

    const trio = setup([{ x: 10, y: 10 }, { x: 10, y: 12 }, { x: 15, y: 10 }]);
    const units = [trio.state.refs.get('v0')!, trio.state.refs.get('v1')!, trio.state.refs.get('v2')!];
    run(trio, 1, [{ kind: 'build', player: HUMAN, units, defId: 'house', tileX: 12, tileY: 10 }]);
    let trioTicks = 0;
    for (; trioTicks < 1000; trioTicks++) {
      if (trio.advance([]).some((e) => e.kind === 'buildingComplete')) break;
    }

    // 3 builders: 3T/5 = 0.6T (+ a few approach ticks)
    expect(trioTicks).toBeLessThan(soloTicks * 0.75);
  });

  it('Shift-queued placements create every foundation and build them in sequence', () => {
    const game = setup([{ x: 8, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    const placements: Command[] = [
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 10, tileY: 10, queue: true },
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 13, tileY: 10, queue: true },
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 16, tileY: 10, queue: true },
    ];
    const placed = game.advance(placements);
    expect(placed.filter((e) => e.kind === 'buildingPlaced')).toHaveLength(3);
    const initial = entitiesOf(game.state.entities, HUMAN, 'house').sort((a, b) => a.tileX - b.tileX);
    expect(initial).toHaveLength(3);

    run(game, 180);
    expect(initial[0].buildProgress).toBeGreaterThan(0);
    expect(initial[1].buildProgress).toBe(0);
    expect(initial[2].buildProgress).toBe(0);

    run(game, 1900);
    const houses = entitiesOf(game.state.entities, HUMAN, 'house');
    expect(houses.every((h) => h.buildProgress === 1000)).toBe(true);
    expect(game.state.entities.get(vid)!.intent).toBeUndefined();
  });

  it('keeps a Shift-build queue when a rejected unit order is a no-op', () => {
    const game = setup([{ x: 8, y: 10 }, { x: 8, y: 12 }]);
    const vid = game.state.refs.get('v0')!;
    const ownTarget = game.state.refs.get('v1')!;
    game.advance([
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 10, tileY: 10, queue: true },
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 13, tileY: 10, queue: true },
    ]);
    const queued = entitiesOf(game.state.entities, HUMAN, 'house')
      .find((house) => house.tileX === 13)!;
    const state = game.state as SimState;
    expect(state.foundations.get(queued.id)?.queuedBuilders).toEqual([vid]);

    // Attacking an own unit is rejected. It must not erase unrelated queued work.
    game.advance([{ kind: 'attack', player: HUMAN, units: [vid], targetId: ownTarget }]);

    expect(state.foundations.get(queued.id)?.queuedBuilders).toEqual([vid]);
  });

  it('does not skip older queued sites when the active foundation is deleted in the same batch', () => {
    const game = setup([{ x: 8, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    game.advance([
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 10, tileY: 10, queue: true },
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 13, tileY: 10, queue: true },
    ]);
    const houses = entitiesOf(game.state.entities, HUMAN, 'house');
    const active = houses.find((house) => house.tileX === 10)!;
    const olderQueued = houses.find((house) => house.tileX === 13)!;

    game.advance([
      { kind: 'deleteEntity', player: HUMAN, entityId: active.id },
      { kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 16, tileY: 10, queue: true },
    ]);

    expect(game.state.entities.get(vid)!.intent).toEqual({ kind: 'build', targetId: olderQueued.id });
    const newest = entitiesOf(game.state.entities, HUMAN, 'house').find((house) => house.tileX === 16)!;
    expect((game.state as SimState).foundations.get(newest.id)?.queuedBuilders).toEqual([vid]);
  });

  it('keeps building the assigned foundation after the builder is nudged away', () => {
    const game = setup([{ x: 10, y: 10 }]);
    const state = game.state as SimState;
    const vid = state.refs.get('v0')!;
    game.advance([{
      kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10,
    }]);
    run(game, 20);
    const builder = state.entities.get(vid)!;
    const house = entitiesOf(state.entities, HUMAN, 'house')[0];

    // Model a separation push beyond the site's adjacent ring.
    builder.x = fp(9.5);
    builder.y = fp(10.5);
    builder.tileX = 9;
    builder.tileY = 10;
    state.unitsGrid.move(builder.id, builder.x, builder.y);
    state.motion.delete(builder.id);

    game.advance([]);
    expect(builder.intent).toEqual({ kind: 'build', targetId: house.id });
    expect(state.motion.has(builder.id)).toBe(true);
    run(game, 700);
    expect(house.buildProgress).toBe(1000);
    expect(house.hp).toBe(house.maxHp);
  });

  it('rejects unaffordable, out-of-footprint, and builder-less commands without paying', () => {
    const game = setup([{ x: 10, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    const p = game.state.players[HUMAN];
    const stock = { ...p.stockpile };

    // no builders selected
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [], defId: 'house', tileX: 12, tileY: 10 }]);
    // unknown def
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'nope', tileX: 12, tileY: 10 }]);
    // out of bounds footprint
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 39, tileY: 39 }]);
    // unaffordable
    p.stockpile.wood = 10;
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);

    expect(entitiesOf(game.state.entities, HUMAN, 'house')).toHaveLength(0);
    expect(p.stockpile.food).toBe(stock.food);
    expect(p.stockpile.wood).toBe(10);
  });

  it('deleting a fresh foundation refunds ~everything; builders are released', () => {
    const game = setup([{ x: 10, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    const woodBefore = game.state.players[HUMAN].stockpile.wood;
    run(game, 2, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];

    run(game, 3, [{ kind: 'deleteEntity', player: HUMAN, entityId: house.id }]);

    const wood = game.state.players[HUMAN].stockpile.wood;
    expect(wood).toBeGreaterThanOrEqual(woodBefore - 2); // minus the built fraction, floored
    expect(wood).toBeLessThanOrEqual(woodBefore);
    expect(game.isWalkable(12, 10)).toBe(true);
    const builder = game.state.entities.get(vid)!;
    expect(builder.intent).toBeUndefined();
    expect(builder.activity).not.toBe('building');
  });

  it('a bystander walks off the footprint while the builder waits at 0% (never teleports)', () => {
    const game = setup([{ x: 10, y: 10 }, { x: 12, y: 10 }]); // v1 stands ON the site
    const v0 = game.state.refs.get('v0')!;
    const bystanderId = game.state.refs.get('v1')!;
    const before = game.state.entities.get(bystanderId)!;
    const beforeX = before.x, beforeY = before.y;
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [v0], defId: 'house', tileX: 12, tileY: 10 }]);
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];
    const bystander = game.state.entities.get(bystanderId)!;
    const firstDx = bystander.x - beforeX, firstDy = bystander.y - beforeY;
    expect(firstDx * firstDx + firstDy * firstDy).toBeLessThanOrEqual(64 * 64);
    expect(bystander.tileX).toBe(12); // still physically walking out, not snapped to the ring
    expect(house.foundationPendingClearance).toBe(true);
    expect(house.buildProgress).toBe(0); // builder waits
    expect(game.isWalkable(12, 10)).toBe(true); // soft foundation lets the occupant escape

    const inside = (): boolean => bystander.tileX >= 12 && bystander.tileX <= 13
      && bystander.tileY >= 10 && bystander.tileY <= 11;
    for (let t = 0; t < 120 && inside(); t++) {
      const x = bystander.x, y = bystander.y;
      game.advance([]);
      const dx = bystander.x - x, dy = bystander.y - y;
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(64 * 64);
      if (inside()) expect(house.buildProgress).toBe(0);
    }
    expect(inside()).toBe(false);
    expect(house.foundationPendingClearance).toBeUndefined();
    expect(game.isWalkable(12, 10)).toBe(false); // now the active foundation is solid
    run(game, 3);
    expect(house.buildProgress).toBeGreaterThan(0);
  });

  it('site clearance overrides a bystander task and spreads occupants across exit tiles', () => {
    const game = createGame(scenarioConfig(8, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'builder' },
      { defId: 'villager', player: HUMAN, tileX: 12, tileY: 10, ref: 'worker' },
      { defId: 'villager', player: HUMAN, tileX: 13, tileY: 11, ref: 'idle' },
      { defId: 'berryBush', player: 0, tileX: 18, tileY: 10, ref: 'bush' },
    ], [player()]));
    const state = game.state as SimState;
    const builder = game.state.refs.get('builder')!;
    const worker = game.state.refs.get('worker')!;
    const idle = game.state.refs.get('idle')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [worker], targetId: game.state.refs.get('bush')! }]);
    expect(game.state.entities.get(worker)!.intent?.kind).toBe('gather');

    game.advance([{ kind: 'build', player: HUMAN, units: [builder], defId: 'house', tileX: 12, tileY: 10 }]);

    expect(game.state.entities.get(worker)!.intent).toBeUndefined();
    expect(state.gather.has(worker)).toBe(false);
    const workerMotion = state.motion.get(worker)!;
    const idleMotion = state.motion.get(idle)!;
    expect([workerMotion.targetX, workerMotion.targetY]).not.toEqual([idleMotion.targetX, idleMotion.targetY]);
    expect(entitiesOf(game.state.entities, HUMAN, 'house')[0].foundationPendingClearance).toBe(true);
  });

  it('a clearance-pending foundation resumes identically after serialization', () => {
    const game = setup([{ x: 10, y: 10 }, { x: 12, y: 10 }]);
    game.advance([{
      kind: 'build', player: HUMAN, units: [game.state.refs.get('v0')!],
      defId: 'house', tileX: 12, tileY: 10,
    }]);
    const originalHouse = entitiesOf(game.state.entities, HUMAN, 'house')[0];
    expect(originalHouse.foundationPendingClearance).toBe(true);
    const resumed = createGameFromSnapshot(game.serialize!());
    expect(resumed.isWalkable(12, 10)).toBe(true);
    expect(entitiesOf(resumed.state.entities, HUMAN, 'house')[0].foundationPendingClearance).toBe(true);
    for (let t = 0; t < 80; t++) {
      game.advance([]);
      resumed.advance([]);
      expect(resumed.hash()).toBe(game.hash());
    }
  });

  it('a mid-map move command interrupts building (intent cleared by move)', () => {
    const game = setup([{ x: 10, y: 10 }]);
    const vid = game.state.refs.get('v0')!;
    run(game, 5, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];
    const progressAtInterrupt = house.buildProgress!;
    run(game, 40, [{ kind: 'move', player: HUMAN, units: [vid], x: fp(30), y: fp(30) }]);
    expect(house.buildProgress).toBe(progressAtInterrupt); // nobody building -> no progress
    expect(game.state.entities.get(vid)!.intent).toBeUndefined();
  });

  it('a rival unit on the footprint blocks placement AoE2-style (nothing paid, no nudge)', () => {
    const game = createGame(scenarioConfig(9, grassMap(40, 40), [
      { defId: 'villager', player: 1, tileX: 10, tileY: 10, ref: 'v0' },
      { defId: 'militia', player: 2, tileX: 13, tileY: 11, ref: 'enemy' }, // on the 2x2 footprint at (12,10)
    ], [player(), player({ civ: 'english' })]));
    const vid = game.state.refs.get('v0')!;
    const stockBefore = { ...game.state.players[HUMAN].stockpile };

    expect(game.canPlace(HUMAN, 'house', 12, 10)).toBe(false);
    run(game, 3, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);

    expect(entitiesOf(game.state.entities, HUMAN, 'house')).toHaveLength(0);
    expect(game.state.players[HUMAN].stockpile).toEqual(stockBefore);
    const enemy = game.state.entities.get(game.state.refs.get('enemy')!)!;
    expect(enemy.tileX).toBe(13); // rival never nudged
    expect(enemy.tileY).toBe(11);
  });

  it('gaia animals do not block placement and walk off like own units', () => {
    const game = createGame(scenarioConfig(9, grassMap(40, 40), [
      { defId: 'villager', player: 1, tileX: 10, tileY: 10, ref: 'v0' },
      { defId: 'sheep', player: 0, tileX: 12, tileY: 10, ref: 'sheep' },
    ], [player()]));
    const vid = game.state.refs.get('v0')!;

    expect(game.canPlace(HUMAN, 'house', 12, 10)).toBe(true);
    const sheepId = game.state.refs.get('sheep')!;
    const sheep = game.state.entities.get(sheepId)!;
    const beforeX = sheep.x, beforeY = sheep.y;
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);

    expect(entitiesOf(game.state.entities, HUMAN, 'house')).toHaveLength(1);
    const dx = sheep.x - beforeX, dy = sheep.y - beforeY;
    expect(dx * dx + dy * dy).toBeLessThanOrEqual(64 * 64);
    expect(sheep.tileX).toBe(12); // no teleport on the command tick
    run(game, 120);
    const inside = sheep.tileX >= 12 && sheep.tileX <= 13 && sheep.tileY >= 10 && sheep.tileY <= 11;
    expect(inside).toBe(false);
  });
});

describe('town center construction gate (GDD: extra TCs unlock in Castle Age)', () => {
  const RICH = { wood: 500, stone: 300 }; // TC costs 275w/100s — affordable in any age

  it('rejects a town center build before castle age without paying', () => {
    const game = createGame(scenarioConfig(11, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v0' },
    ], [player({ startingResources: RICH })]));
    const vid = game.state.refs.get('v0')!;
    const stockBefore = { ...game.state.players[HUMAN].stockpile };

    expect(game.canPlace(HUMAN, 'townCenter', 14, 10)).toBe(false);
    run(game, 3, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'townCenter', tileX: 14, tileY: 10 }]);

    expect(entitiesOf(game.state.entities, HUMAN, 'townCenter')).toHaveLength(0);
    expect(game.state.players[HUMAN].stockpile).toEqual(stockBefore);
  });

  it('allows a town center foundation from castle age on', () => {
    const game = createGame(scenarioConfig(11, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v0' },
    ], [player({ startingResources: RICH, startingAge: 'castle' })]));
    const vid = game.state.refs.get('v0')!;

    expect(game.canPlace(HUMAN, 'townCenter', 14, 10)).toBe(true);
    const events = run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'townCenter', tileX: 14, tileY: 10 }]);

    expect(events.some((e) => e.kind === 'buildingPlaced' && e.defId === 'townCenter')).toBe(true);
    const tc = entitiesOf(game.state.entities, HUMAN, 'townCenter')[0];
    expect(tc).toBeDefined();
    expect(tc.buildProgress).toBeLessThan(1000);
    expect(game.state.players[HUMAN].stockpile.wood).toBe(RICH.wood - 275);
    expect(game.state.players[HUMAN].stockpile.stone).toBe(RICH.stone - 100);
  });

  it('detects a unit in a 4x4 footprint corner before making the foundation solid', () => {
    const game = createGame(scenarioConfig(12, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 8, tileY: 10, ref: 'builder' },
      { defId: 'villager', player: HUMAN, tileX: 13, tileY: 13, ref: 'corner' },
    ], [player({ startingResources: RICH, startingAge: 'castle' })]));
    const corner = game.state.entities.get(game.state.refs.get('corner')!)!;

    game.advance([{
      kind: 'build', player: HUMAN, units: [game.state.refs.get('builder')!],
      defId: 'townCenter', tileX: 10, tileY: 10,
    }]);

    const tc = entitiesOf(game.state.entities, HUMAN, 'townCenter')[0];
    expect(tc.foundationPendingClearance).toBe(true);
    expect(tc.buildProgress).toBe(0);
    expect(game.isWalkable(13, 13)).toBe(true);
    expect(corner.tileX).toBe(13); // still walking rather than displaced
  });
});
