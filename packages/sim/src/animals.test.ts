// Wildlife: hunters kill deer first and carry 35 (AOE2_REFERENCE hunt carry), sheep are
// claimed by proximity/LOS and cannot be re-stolen once owned, killed sheep are eaten as
// carcasses, carcasses rot at decayRate, and wolves aggro nearby units.

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import { grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function run(game: Game, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...game.advance([]));
  return events;
}

describe('hunting', () => {
  it('hunter kills the deer, eats the carcass, and banks a full 35-food hunt load', () => {
    const game = createGame(scenarioConfig(21, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 5, tileY: 5 },
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v' },
      { defId: 'deer', player: 0, tileX: 13, tileY: 10, ref: 'deer' },
    ], [player()])); // scots: no hunt-rate civ bonus
    const vid = game.state.refs.get('v')!;
    const deerId = game.state.refs.get('deer')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: deerId }]);

    let killed = -1;
    let dropped: Extract<SimEvent, { kind: 'resourceDropped' }> | null = null;
    for (let t = 2; t <= 4500 && !dropped; t++) {
      for (const ev of game.advance([])) {
        if (ev.kind === 'resourceDropped') dropped = ev;
      }
      const deer = game.state.entities.get(deerId);
      if (killed < 0 && deer && deer.hp <= 0) killed = t;
    }
    expect(killed).toBeGreaterThan(0); // the deer had to die before any food flowed
    expect(dropped).toEqual({ kind: 'resourceDropped', player: HUMAN, type: 'food', amount: 35 });
    expect(game.state.players[HUMAN].stockpile.food).toBe(235);
  });

  it('carcasses rot at decayRate (0.25/s) once nobody is eating', () => {
    const game = createGame(scenarioConfig(22, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'sheep', player: 0, tileX: 10, tileY: 10, ref: 'sheep' },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    const sheepId = game.state.refs.get('sheep')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: sheepId }]);

    // wait for the kill (villager strikes: 3 dmg vs 7 hp, RoF 2s), then call the hunter off
    let t = 0;
    for (; t < 400; t++) {
      game.advance([]);
      if (game.state.entities.get(sheepId)!.hp <= 0) break;
    }
    const sheep = game.state.entities.get(sheepId)!;
    expect(sheep.hp).toBeLessThanOrEqual(0);
    expect(sheep.activity).toBe('dying');
    game.advance([{ kind: 'stop', player: HUMAN, units: [vid] }]);
    const atStop = sheep.amountLeft!;

    run(game, 400); // 20 s of rot at 0.25/s = 5 food
    expect(sheep.amountLeft).toBe(atStop - 5);
  });
});

describe('sheep herding', () => {
  it('an unclaimed sheep changes owner when a player unit has it in LOS', () => {
    const game = createGame(scenarioConfig(23, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10 },
      { defId: 'sheep', player: 0, tileX: 12, tileY: 10, ref: 'sheep' }, // 3 tiles < villager LOS 4
    ], [player()]));
    run(game, 3);
    expect(game.state.entities.get(game.state.refs.get('sheep')!)!.player).toBe(HUMAN);
  });

  it('a claimed sheep is not re-stolen by a rival walking past (v1 rule)', () => {
    const game = createGame(scenarioConfig(24, grassMap(30, 30), [
      { defId: 'villager', player: 1, tileX: 9, tileY: 10 },
      { defId: 'sheep', player: 0, tileX: 12, tileY: 10, ref: 'sheep' },
      { defId: 'scout', player: 2, tileX: 25, tileY: 10, ref: 'scout' },
    ], [player(), player({ civ: 'english' })]));
    run(game, 3);
    const sheep = game.state.entities.get(game.state.refs.get('sheep')!)!;
    expect(sheep.player).toBe(1);

    // rival scout rides right up to the sheep — ownership must not flip
    const scout = game.state.refs.get('scout')!;
    game.advance([{ kind: 'move', player: 2, units: [scout], x: 13 * 256, y: 10 * 256 }]);
    run(game, 300);
    expect(sheep.player).toBe(1);
  });

  it('an own sheep is killed then eaten like AoE2 (carcass food, hunt task)', () => {
    const game = createGame(scenarioConfig(25, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'sheep', player: 0, tileX: 11, tileY: 10, ref: 'sheep' },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    const sheepId = game.state.refs.get('sheep')!;
    run(game, 3); // claim it first
    expect(game.state.entities.get(sheepId)!.player).toBe(HUMAN);

    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: sheepId }]);
    run(game, 400);
    const sheep = game.state.entities.get(sheepId)!;
    const v = game.state.entities.get(vid)!;
    expect(sheep.hp).toBeLessThanOrEqual(0);
    expect(sheep.amountLeft).toBeLessThan(100); // being eaten (and rotting)
    expect(v.activity).toBe('gathering');
    expect(v.carrying?.type).toBe('food');
    expect((v.carrying?.amount ?? 0)).toBeGreaterThan(0);
  });
});

describe('wolves', () => {
  it('a wolf aggros and bites a nearby military unit (which never garrisons)', () => {
    const game = createGame(scenarioConfig(26, grassMap(30, 30), [
      { defId: 'militia', player: HUMAN, tileX: 10, tileY: 10, ref: 'm' },
      { defId: 'wolf', player: 0, tileX: 13, tileY: 10, ref: 'wolf' },
    ], [player()]));
    run(game, 200);
    const militia = game.state.entities.get(game.state.refs.get('m')!)!;
    expect(militia.hp).toBeLessThan(40); // bitten
    expect(militia.garrisonedIn).toBeUndefined();
    const wolf = game.state.entities.get(game.state.refs.get('wolf')!)!;
    expect(wolf.activity).toBe('attacking');
  });

  it('gaia animals wander a little over time (SimRng idles)', () => {
    const game = createGame(scenarioConfig(27, grassMap(30, 30), [
      { defId: 'sheep', player: 0, tileX: 10, tileY: 10, ref: 's1' },
      { defId: 'deer', player: 0, tileX: 20, tileY: 20, ref: 'd1' },
      { defId: 'deer', player: 0, tileX: 5, tileY: 20, ref: 'd2' },
      { defId: 'deer', player: 0, tileX: 20, tileY: 5, ref: 'd3' },
    ], [player()]));
    const start = new Map(
      ['s1', 'd1', 'd2', 'd3'].map((r) => {
        const e = game.state.entities.get(game.state.refs.get(r)!)!;
        return [r, { x: e.x, y: e.y }] as const;
      }),
    );
    run(game, 1200); // ~60 s: expect at least one stroll among four animals
    const moved = ['s1', 'd1', 'd2', 'd3'].filter((r) => {
      const e = game.state.entities.get(game.state.refs.get(r)!)!;
      const s = start.get(r)!;
      return e.x !== s.x || e.y !== s.y;
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});
