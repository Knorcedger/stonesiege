// Villager flee (GDD combat rules): damaged villagers run to the nearest defensive
// building with garrison room and garrison inside; with no shelter they keep their
// task. Military units never flee. Buildings that die kill their garrison.

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
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
