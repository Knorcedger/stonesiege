// Construction: pay-at-placement foundations, AoE2 multi-builder progress (3T/(N+2)),
// builder approach + release, pop cap on completion, and foundation delete refunds.

import { describe, expect, it } from 'vitest';
import { fp } from './types';
import type { Command, Game, SimEvent } from './types';
import { createGame } from './game';
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
    expect(game.isWalkable(12, 10)).toBe(false); // foundation blocks its tiles

    // adjacent villager starts building immediately and completes in ~buildTime (25s = 500 ticks)
    const done = run(game, 520);
    expect(done.some((e) => e.kind === 'buildingComplete' && e.defId === 'house')).toBe(true);
    expect(house.buildProgress).toBe(1000);
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

  it('a bystander standing on the footprint is nudged off before the foundation lands', () => {
    const game = setup([{ x: 10, y: 10 }, { x: 12, y: 10 }]); // v1 stands ON the site
    const v0 = game.state.refs.get('v0')!;
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [v0], defId: 'house', tileX: 12, tileY: 10 }]);
    const bystander = game.state.entities.get(game.state.refs.get('v1')!)!;
    const inside =
      bystander.tileX >= 12 && bystander.tileX <= 13 && bystander.tileY >= 10 && bystander.tileY <= 11;
    expect(inside).toBe(false);
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

  it('gaia animals do not block placement and are nudged off like own units', () => {
    const game = createGame(scenarioConfig(9, grassMap(40, 40), [
      { defId: 'villager', player: 1, tileX: 10, tileY: 10, ref: 'v0' },
      { defId: 'sheep', player: 0, tileX: 12, tileY: 10, ref: 'sheep' },
    ], [player()]));
    const vid = game.state.refs.get('v0')!;

    expect(game.canPlace(HUMAN, 'house', 12, 10)).toBe(true);
    run(game, 1, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);

    expect(entitiesOf(game.state.entities, HUMAN, 'house')).toHaveLength(1);
    const sheep = game.state.entities.get(game.state.refs.get('sheep')!)!;
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
});
