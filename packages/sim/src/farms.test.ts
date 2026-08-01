// Farms: single-farmer food source at the reference rate, fallow on exhaustion
// (resourceDepleted + amountLeft 0 exposed on building state), explicit reseed at full
// wood cost, and the per-player auto-reseed queue toggle (queueReseed).

import { describe, expect, it } from 'vitest';
import type { Game, ScenarioStart, SimEvent } from './types';
import { createGame } from './game';
import { grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function setup(extra: ScenarioStart['entities'] = [], farmAmount?: number): Game {
  return createGame(scenarioConfig(31, grassMap(30, 30), [
    { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    { defId: 'farm', player: HUMAN, tileX: 10, tileY: 9, ref: 'farm', amountLeft: farmAmount },
    ...extra,
  ], [player()]));
}

function run(game: Game, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...game.advance([]));
  return events;
}

describe('farms', () => {
  it('a farmer works the farm at the reference rate (0.32/s → 10 food in ~625 ticks)', () => {
    const game = setup();
    const vid = game.state.refs.get('v')!;
    const farm = game.state.entities.get(game.state.refs.get('farm')!)!;
    expect(farm.amountLeft).toBe(175); // def providesFood exposed on building state
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: farm.id }]);
    let full = -1;
    for (let t = 2; t <= 700; t++) {
      game.advance([]);
      if ((game.state.entities.get(vid)!.carrying?.amount ?? 0) >= 10) { full = t; break; }
    }
    expect(full).toBeGreaterThanOrEqual(623);
    expect(full).toBeLessThanOrEqual(631);
  });

  it('exactly one farmer per farm — the second queues politely', () => {
    const game = setup([{ defId: 'villager', player: HUMAN, tileX: 9, tileY: 11, ref: 'v2' }]);
    const units = [game.state.refs.get('v')!, game.state.refs.get('v2')!];
    game.advance([{ kind: 'gather', player: HUMAN, units, targetId: game.state.refs.get('farm')! }]);
    run(game, 150);
    const farming = units.filter((id) => game.state.entities.get(id)!.activity === 'gathering');
    expect(farming).toHaveLength(1);
  });

  it('an exhausted farm goes fallow; the farmer banks the last load and idles', () => {
    const game = setup([{ defId: 'townCenter', player: HUMAN, tileX: 13, tileY: 8 }], 3);
    const vid = game.state.refs.get('v')!;
    const farmId = game.state.refs.get('farm')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: farmId }]);
    const events = run(game, 500);

    expect(events.some((e) => e.kind === 'resourceDepleted' && e.id === farmId && e.resourceType === 'food')).toBe(true);
    const farm = game.state.entities.get(farmId)!;
    expect(farm.amountLeft).toBe(0); // fallow — renderer reads this off building state
    expect(game.state.players[HUMAN].stockpile.food).toBe(203);
    const v = game.state.entities.get(vid)!;
    expect(v.intent).toBeUndefined();
    expect(v.activity).toBe('idle');
  });

  it('reseedFarm replants a fallow farm at full wood cost (and only a fallow farm)', () => {
    const game = setup([], 0); // starts fallow
    const farmId = game.state.refs.get('farm')!;
    const p = game.state.players[HUMAN];

    game.advance([{ kind: 'reseedFarm', player: HUMAN, farmId }]);
    expect(p.stockpile.wood).toBe(140); // 200 - 60
    expect(game.state.entities.get(farmId)!.amountLeft).toBe(175);

    // not fallow anymore: a second reseed is rejected without paying
    game.advance([{ kind: 'reseedFarm', player: HUMAN, farmId }]);
    expect(p.stockpile.wood).toBe(140);
  });

  it('queueReseed auto-replants the moment a farm expires, deducting wood silently', () => {
    const game = setup([], 2);
    const vid = game.state.refs.get('v')!;
    const farmId = game.state.refs.get('farm')!;
    game.advance([{ kind: 'queueReseed', player: HUMAN, enabled: true }]);
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: farmId }]);
    const events = run(game, 400); // 2 food at 0.32/s ≈ 125 ticks, then auto-reseed

    const p = game.state.players[HUMAN];
    expect(p.stockpile.wood).toBe(140); // auto-reseed paid the full 60 wood
    expect(events.some((e) => e.kind === 'resourceDepleted' && e.id === farmId)).toBe(false); // never went fallow
    const farm = game.state.entities.get(farmId)!;
    expect(farm.amountLeft).toBeGreaterThan(160); // replanted at 175, minus continued farming
    const v = game.state.entities.get(vid)!;
    expect(v.intent).toEqual({ kind: 'gather', targetId: farmId }); // farmer never stopped
  });

  it('building a farm requires a completed mill (GDD prerequisite)', () => {
    const game = createGame(scenarioConfig(32, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    expect(game.canPlace(HUMAN, 'farm', 12, 10)).toBe(false);
    game.advance([{ kind: 'build', player: HUMAN, units: [vid], defId: 'farm', tileX: 12, tileY: 10 }]);
    expect(game.state.players[HUMAN].stockpile.wood).toBe(200); // nothing paid

    const game2 = createGame(scenarioConfig(33, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'mill', player: HUMAN, tileX: 5, tileY: 5 },
    ], [player()]));
    expect(game2.canPlace(HUMAN, 'farm', 12, 10)).toBe(true);
    game2.advance([{ kind: 'build', player: HUMAN, units: [game2.state.refs.get('v')!], defId: 'farm', tileX: 12, tileY: 10 }]);
    expect(game2.state.players[HUMAN].stockpile.wood).toBe(140);
  });
});
