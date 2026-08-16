import { describe, expect, it } from 'vitest';
import { createGame, createGameFromSnapshot } from './game';
import { FP, fp } from './types';
import type { Entity, Game, ScenarioStart } from './types';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const WIDTH = 22;
const HEIGHT = 15;
const GATE_X = 10;
const GATE_Y = 7;

function walledGateEntities(gatePlayer = 1): ScenarioStart['entities'] {
  const entities: ScenarioStart['entities'] = [];
  for (let y = 0; y < HEIGHT; y++) {
    entities.push(y === GATE_Y
      ? { defId: 'gate', player: gatePlayer, tileX: GATE_X, tileY: y, ref: 'gate' }
      : { defId: 'stoneWall', player: gatePlayer, tileX: GATE_X, tileY: y });
  }
  return entities;
}

function addWalker(entities: ScenarioStart['entities'], walkerPlayer: number, x = 3): void {
  entities.push({ defId: 'villager', player: walkerPlayer, tileX: x, tileY: GATE_Y, ref: 'walker' });
}

function runMove(game: Game, walker: Entity, targetX: number, ticks = 900): boolean {
  game.advance([{
    kind: 'move', player: walker.player, units: [walker.id],
    x: fp(targetX) + FP / 2, y: fp(GATE_Y) + FP / 2,
  }]);
  let enteredGate = walker.tileX === GATE_X;
  for (let tick = 0; tick < ticks; tick++) {
    game.advance([]);
    if (walker.tileX === GATE_X) enteredGate = true;
  }
  return enteredGate;
}

describe('friendly-only gates', () => {
  it('lets its owner path and physically walk through an otherwise sealed wall', () => {
    const entities = walledGateEntities();
    addWalker(entities, 1);
    const game = createGame(scenarioConfig(101, grassMap(WIDTH, HEIGHT), entities, [player()]));
    const walker = game.state.entities.get(game.state.refs.get('walker')!)!;

    expect(game.isWalkable(GATE_X, GATE_Y)).toBe(false);
    expect(game.isWalkable(GATE_X, GATE_Y, 1)).toBe(true);
    expect(runMove(game, walker, 18)).toBe(true);
    expect(walker.tileX).toBeGreaterThanOrEqual(17);
  });

  it('opens for an allied player on the same non-zero team', () => {
    const entities = walledGateEntities(1);
    addWalker(entities, 2);
    const game = createGame(scenarioConfig(102, grassMap(WIDTH, HEIGHT), entities, [
      player({ team: 4 }), player({ team: 4, civ: 'english' }),
    ]));
    const walker = game.state.entities.get(game.state.refs.get('walker')!)!;

    expect(game.isWalkable(GATE_X, GATE_Y, 2)).toBe(true);
    expect(runMove(game, walker, 18)).toBe(true);
    expect(walker.tileX).toBeGreaterThanOrEqual(17);
  });

  it('stays closed to enemies and FFA players', () => {
    const entities = walledGateEntities(1);
    addWalker(entities, 2);
    const game = createGame(scenarioConfig(103, grassMap(WIDTH, HEIGHT), entities, [
      player(), player({ civ: 'english' }),
    ]));
    const walker = game.state.entities.get(game.state.refs.get('walker')!)!;

    expect(game.isWalkable(GATE_X, GATE_Y, 2)).toBe(false);
    expect(runMove(game, walker, 18)).toBe(false);
    expect(walker.tileX).toBeLessThan(GATE_X);
  });

  it('updates access immediately when scenario ownership changes', () => {
    const entities = walledGateEntities(1);
    addWalker(entities, 2);
    const game = createGame(scenarioConfig(104, grassMap(WIDTH, HEIGHT), entities, [
      player(), player({ civ: 'english' }),
    ]));
    const walker = game.state.entities.get(game.state.refs.get('walker')!)!;
    const gateId = game.state.refs.get('gate')!;

    expect(game.isWalkable(GATE_X, GATE_Y, 2)).toBe(false);
    game.ops!.changeOwner([gateId], 2);
    expect(game.isWalkable(GATE_X, GATE_Y, 1)).toBe(false);
    expect(game.isWalkable(GATE_X, GATE_Y, 2)).toBe(true);
    expect(runMove(game, walker, 18)).toBe(true);
  });

  it('preserves owner-specific in-flight gate searches across save and resume', () => {
    const size = 140;
    const entities: ScenarioStart['entities'] = [];
    for (let y = 0; y < size; y++) {
      entities.push(y === 70
        ? { defId: 'gate', player: 1, tileX: 70, tileY: y }
        : { defId: 'stoneWall', player: 1, tileX: 70, tileY: y });
    }
    entities.push({ defId: 'scout', player: 1, tileX: 5, tileY: 70, ref: 'walker' });
    const original = createGame(scenarioConfig(105, grassMap(size, size), entities, [player()]));
    const walkerId = original.state.refs.get('walker')!;
    original.advance([{
      kind: 'move', player: 1, units: [walkerId],
      x: fp(135) + FP / 2, y: fp(70) + FP / 2,
    }]);
    expect((original.state as SimState).pathSearches.length).toBeGreaterThan(0);

    const resumed = createGameFromSnapshot(original.serialize());
    for (let tick = 0; tick < 2_000; tick++) {
      original.advance([]);
      resumed.advance([]);
      if (tick % 100 === 0) expect(resumed.hash()).toBe(original.hash());
    }
    expect(resumed.hash()).toBe(original.hash());
    expect(resumed.state.entities.get(walkerId)!.tileX).toBeGreaterThan(130);
  });
});
