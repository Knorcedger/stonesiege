import { describe, expect, it } from 'vitest';
import { createGame, createGameFromSnapshot } from './game';
import type { Command, Game, ProductionSpeed, SimEvent } from './types';
import { fp } from './types';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function makeGame(speed?: ProductionSpeed): Game {
  const config = scenarioConfig(91, grassMap(36, 36), [
    { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'builder' },
    { defId: 'townCenter', player: HUMAN, tileX: 20, tileY: 20, ref: 'tc' },
  ], [player({ isHuman: true, startingResources: { food: 1000, wood: 1000, gold: 1000 } })]);
  if (speed === undefined) delete config.productionSpeed;
  else config.productionSpeed = speed;
  return createGame(config);
}

function makeGatherGame(speed: ProductionSpeed): Game {
  return createGame({
    ...scenarioConfig(93, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'gatherer' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
    ], [player({ isHuman: true })]),
    productionSpeed: speed,
  });
}

function ticksUntil(
  game: Game,
  command: Command,
  matches: (event: SimEvent) => boolean,
): number {
  for (let tick = 1; tick <= 1000; tick++) {
    const events = game.advance(tick === 1 ? [command] : []);
    if (events.some(matches)) return tick;
  }
  throw new Error('expected event did not occur');
}

describe('production speed', () => {
  it('defaults new simulations to 2×', () => {
    expect(makeGame().state.productionSpeed).toBe(2);
  });

  it.each([
    [1, 500],
    [2, 250],
    [4, 125],
  ] as const)('trains units at %d× in %d ticks', (speed, expectedTicks) => {
    const game = makeGame(speed);
    const tc = game.state.refs.get('tc')!;
    const ticks = ticksUntil(
      game,
      { kind: 'train', player: HUMAN, buildingId: tc, defId: 'villager' },
      (event) => event.kind === 'unitTrained',
    );
    expect(ticks).toBe(expectedTicks);
  });

  it.each([
    [1, 500],
    [2, 250],
    [4, 125],
  ] as const)('researches upgrades at %d× in %d ticks', (speed, expectedTicks) => {
    const game = makeGame(speed);
    const tc = game.state.refs.get('tc')!;
    const ticks = ticksUntil(
      game,
      { kind: 'research', player: HUMAN, buildingId: tc, techId: 'loom' },
      (event) => event.kind === 'researchComplete' && event.techId === 'loom',
    );
    expect(ticks).toBe(expectedTicks);
  });

  it.each([
    [1, 500],
    [2, 250],
    [4, 125],
  ] as const)('constructs buildings at %d× in %d active ticks', (speed, expectedTicks) => {
    const game = makeGame(speed);
    const builder = game.state.refs.get('builder')!;
    const ticks = ticksUntil(
      game,
      { kind: 'build', player: HUMAN, units: [builder], defId: 'house', tileX: 10, tileY: 10 },
      (event) => event.kind === 'buildingComplete' && event.defId === 'house',
    );
    expect(ticks).toBe(expectedTicks);
  });

  it('gathers at 1×/2×/4× while keeping the approach movement identical', () => {
    const results = ([1, 2, 4] as const).map((speed) => {
      const game = makeGatherGame(speed);
      const villagerId = game.state.refs.get('gatherer')!;
      const bushId = game.state.refs.get('bush')!;
      for (let tick = 0; tick < 100; tick++) {
        game.advance(tick === 0 ? [{
          kind: 'gather', player: HUMAN, units: [villagerId], targetId: bushId,
        }] : []);
      }
      const villager = game.state.entities.get(villagerId)!;
      return {
        carried: villager.carrying?.amount,
        position: [villager.x, villager.y, villager.tileX, villager.tileY],
      };
    });

    expect(results.map((result) => result.carried)).toEqual([1, 3, 6]);
    expect(results[1].position).toEqual(results[0].position);
    expect(results[2].position).toEqual(results[0].position);
  });

  it('changes active queues deterministically and rejects unsupported values', () => {
    const game = makeGame(1);
    const tc = game.state.refs.get('tc')!;
    game.advance([{ kind: 'train', player: HUMAN, buildingId: tc, defId: 'villager' }]);
    const item = game.state.entities.get(tc)!.trainQueue![0];
    expect(item.ticksLeft).toBe(499);

    game.advance([{ kind: 'setProductionSpeed', player: HUMAN, multiplier: 4 }]);
    expect(game.state.productionSpeed).toBe(4);
    expect(item.ticksLeft).toBe(495);

    game.advance([{
      kind: 'setProductionSpeed', player: HUMAN, multiplier: 3,
    } as unknown as Command]);
    expect(game.state.productionSpeed).toBe(4);
    expect(item.ticksLeft).toBe(491);
  });

  it('does not change unit movement timing', () => {
    const slow = makeGame(1);
    const fast = makeGame(4);
    const slowVillager = slow.state.refs.get('builder')!;
    const fastVillager = fast.state.refs.get('builder')!;
    const move = (unit: number): Command => ({
      kind: 'move', player: HUMAN, units: [unit], x: fp(16), y: fp(10),
    });

    for (let tick = 0; tick < 40; tick++) {
      slow.advance(tick === 0 ? [move(slowVillager)] : []);
      fast.advance(tick === 0 ? [move(fastVillager)] : []);
    }

    const a = slow.state.entities.get(slowVillager)!;
    const b = fast.state.entities.get(fastVillager)!;
    expect([a.x, a.y, a.tileX, a.tileY]).toEqual([b.x, b.y, b.tileX, b.tileY]);
  });

  it('persists the live multiplier in snapshots and hashes', () => {
    const game = makeGame(1);
    game.advance([{ kind: 'setProductionSpeed', player: HUMAN, multiplier: 4 }]);
    const restored = createGameFromSnapshot(game.serialize());

    expect(restored.state.productionSpeed).toBe(4);
    expect(restored.hash()).toBe(game.hash());
    expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(game.serialize()));
  });

  it('applies the multiplier globally to every player production queue', () => {
    const game = createGame({
      ...scenarioConfig(92, grassMap(36, 36), [
        { defId: 'townCenter', player: 1, tileX: 4, tileY: 4 },
        { defId: 'townCenter', player: 2, tileX: 24, tileY: 24 },
      ], [
        player({ isHuman: true, startingResources: { food: 1000 } }),
        player({ startingResources: { food: 1000 } }),
      ]),
      productionSpeed: 1,
    });
    const tc1 = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const tc2 = entitiesOf(game.state.entities, 2, 'townCenter')[0];

    game.advance([
      { kind: 'setProductionSpeed', player: 1, multiplier: 4 },
      { kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' },
      { kind: 'train', player: 2, buildingId: tc2.id, defId: 'villager' },
    ]);

    expect(tc1.trainQueue![0].ticksLeft).toBe(496);
    expect(tc2.trainQueue![0].ticksLeft).toBe(496);
  });
});
