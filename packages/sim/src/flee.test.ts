// Villager flee (GDD combat rules): damaged villagers run to the nearest defensive
// building with garrison room and garrison inside; with no shelter they keep their
// task. Military units never flee. Buildings that die kill their garrison.
// Raid aftermath: flee-garrisoned villagers are marked `sheltering` (surfaced by the
// HUD idle-villager badge) and ungarrison is the return-to-work bell — it restores
// each villager's pre-flee task.

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { removeEntity } from './entities';
import { grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function run(game: Game, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) events.push(...game.advance([]));
  return events;
}

describe('villager flee + garrison entry', () => {
  it('a bitten villager flees to the TC and garrisons inside', () => {
    const game = createGame(scenarioConfig(41, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 6, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v' },
      { defId: 'wolf', player: 0, tileX: 12, tileY: 10 },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    const tcId = game.state.refs.get('tc')!;
    run(game, 400);

    const v = game.state.entities.get(vid)!;
    expect(v.hp).toBeLessThan(25); // it was bitten first
    expect(v.hp).toBeGreaterThan(0); // ...but reached safety
    expect(v.garrisonedIn).toBe(tcId);
    expect(v.activity).toBe('garrisoned');
    expect(game.state.entities.get(tcId)!.garrison).toContain(vid);
    // the wolf loses its (garrisoned) prey
    const state = game.state as SimState;
    expect(state.fleeing.size).toBe(0);
  });

  it('with no shelter available the villager keeps its task (GDD)', () => {
    const game = createGame(scenarioConfig(42, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
      { defId: 'wolf', player: 0, tileX: 12, tileY: 10 },
      // a barracks has garrison space but NO attack — not a flee target per GDD (TC/tower)
      { defId: 'barracks', player: HUMAN, tileX: 16, tileY: 6 },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('bush')! }]);
    run(game, 120); // a few bites land

    const v = game.state.entities.get(vid)!;
    expect(v.hp).toBeLessThan(25);
    expect(v.garrisonedIn).toBeUndefined();
    expect(v.intent).toEqual({ kind: 'gather', targetId: game.state.refs.get('bush')! }); // task kept
    expect((game.state as SimState).fleeing.size).toBe(0);
  });

  it('a destroyed building kills the villagers garrisoned inside (GDD tension rule)', () => {
    const game = createGame(scenarioConfig(43, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 6, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v' },
      { defId: 'wolf', player: 0, tileX: 12, tileY: 10 },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    const tcId = game.state.refs.get('tc')!;
    run(game, 400);
    expect(game.state.entities.get(vid)!.garrisonedIn).toBe(tcId);

    game.advance([{ kind: 'deleteEntity', player: HUMAN, entityId: tcId }]);
    expect(game.state.entities.get(vid)).toBeUndefined(); // died with the TC
    expect(game.state.players[HUMAN].pop).toBe(0);
  });
});

describe('raid aftermath: sheltering + the return-to-work bell', () => {
  /** Advance until the villager is garrisoned (or the cap runs out). */
  function runUntilGarrisoned(game: Game, vid: number, cap = 800): void {
    for (let t = 0; t < cap; t++) {
      if (game.state.entities.get(vid)?.garrisonedIn !== undefined) return;
      game.advance([]);
    }
  }

  it('a flee-garrisoned gatherer is sheltering; ungarrison resumes the gather task', () => {
    const game = createGame(scenarioConfig(44, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 6, ref: 'tc' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'wolf', player: 0, tileX: 13, tileY: 10, ref: 'wolf' },
    ], [player()]));
    const state = game.state as SimState;
    const vid = game.state.refs.get('v')!;
    const tcId = game.state.refs.get('tc')!;
    const bushId = game.state.refs.get('bush')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: bushId }]);
    runUntilGarrisoned(game, vid);

    const v = game.state.entities.get(vid)!;
    expect(v.garrisonedIn).toBe(tcId);
    expect(v.sheltering).toBe(true); // HUD: counts in the idle-villager badge
    expect(state.shelterIntents.get(vid)).toEqual({ kind: 'gather', targetId: bushId });

    removeEntity(state, game.state.refs.get('wolf')!); // threat is gone
    game.advance([{ kind: 'ungarrison', player: HUMAN, buildingId: tcId }]);

    expect(v.garrisonedIn).toBeUndefined();
    expect(v.sheltering).toBeUndefined();
    expect(v.intent).toEqual({ kind: 'gather', targetId: bushId }); // task restored
    expect(state.gather.has(vid)).toBe(true);
    expect(state.shelterIntents.size).toBe(0);

    const before = game.state.entities.get(bushId)!.amountLeft!;
    for (let t = 0; t < 400; t++) game.advance([]);
    // it actually walked back and went to work
    expect(game.state.entities.get(bushId)!.amountLeft!).toBeLessThan(before);
  });

  it('explicitly garrisoned villagers are NOT sheltering and eject idle', () => {
    const game = createGame(scenarioConfig(45, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 6, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 10, tileY: 10, ref: 'v' },
    ], [player()]));
    const state = game.state as SimState;
    const vid = game.state.refs.get('v')!;
    const tcId = game.state.refs.get('tc')!;
    game.advance([{ kind: 'garrison', player: HUMAN, units: [vid], targetId: tcId }]);
    runUntilGarrisoned(game, vid, 400);

    const v = game.state.entities.get(vid)!;
    expect(v.garrisonedIn).toBe(tcId);
    expect(v.sheltering).toBeUndefined(); // deliberate garrison, not the flee reflex
    expect(state.shelterIntents.size).toBe(0);

    game.advance([{ kind: 'ungarrison', player: HUMAN, buildingId: tcId }]);
    expect(v.garrisonedIn).toBeUndefined();
    expect(v.activity).toBe('idle');
    expect(v.intent).toBeUndefined();
  });

  it('a depleted pre-flee target drops silently: the villager ejects idle, not stuck', () => {
    const game = createGame(scenarioConfig(46, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 6, ref: 'tc' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'wolf', player: 0, tileX: 13, tileY: 10, ref: 'wolf' },
    ], [player()]));
    const state = game.state as SimState;
    const vid = game.state.refs.get('v')!;
    const tcId = game.state.refs.get('tc')!;
    const bushId = game.state.refs.get('bush')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: bushId }]);
    runUntilGarrisoned(game, vid);
    expect(game.state.entities.get(vid)!.garrisonedIn).toBe(tcId);

    removeEntity(state, game.state.refs.get('wolf')!);
    removeEntity(state, bushId); // the node died while the villager hid
    game.advance([{ kind: 'ungarrison', player: HUMAN, buildingId: tcId }]);

    const v = game.state.entities.get(vid)!;
    expect(v.garrisonedIn).toBeUndefined();
    expect(v.sheltering).toBeUndefined();
    expect(v.intent).toBeUndefined(); // handleGather dropped the stale target
    expect(v.activity).toBe('idle');
    expect(state.shelterIntents.size).toBe(0);
  });
});
