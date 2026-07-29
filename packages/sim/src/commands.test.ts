// Command-validation invariants not covered elsewhere: the existing "unaffordable" test
// in production.test.ts hits the queue cap (15) before affordability ever fires, so the
// insufficient-resources rejection path was untested. Also covers cross-player train theft,
// and the GDD conquest elimination rule (no TC + no villagers + no production buildings).

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { createGame } from './game';
import type { SimState } from './internal';
import { findFreeAdjacentTile, spawnEntity } from './entities';
import { entitiesOf, grassMap, player, practiceConfig, scenarioConfig } from './testutil';

describe('command validation: train affordability + ownership', () => {
  it('train is rejected when the stockpile cannot cover the cost (no partial deduction)', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(31, map, [
      { defId: 'townCenter', player: 1, tileX: 5, tileY: 5 },
    ], [
      // villager costs 50 food — 40 is not enough
      player({ startingResources: { food: 40, wood: 0, gold: 0, stone: 0 } }),
    ]));
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p1 = game.state.players[1];

    game.advance([{ kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' }]);
    expect(tc.trainQueue).toHaveLength(0);
    expect(p1.stockpile).toEqual({ food: 40, wood: 0, gold: 0, stone: 0 }); // untouched
    expect(p1.pop).toBe(0);

    // run on: nothing may ever drive the stockpile negative or spawn a unit
    for (let t = 0; t < 60; t++) game.advance([]);
    expect(p1.stockpile.food).toBe(40);
    expect(entitiesOf(game.state.entities, 1, 'villager')).toHaveLength(0);
  });

  it('a player cannot train from (or cancel out of) an enemy building', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(32, map, [
      { defId: 'townCenter', player: 1, tileX: 5, tileY: 5 },
      { defId: 'townCenter', player: 2, tileX: 20, tileY: 20 },
    ], [
      player({ startingResources: { food: 500, wood: 0, gold: 0, stone: 0 } }),
      player({ civ: 'english', startingResources: { food: 500, wood: 0, gold: 0, stone: 0 } }),
    ]));
    const tc1 = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const p2 = game.state.players[2];

    // enemy train: dropped, nobody pays, nothing queued
    game.advance([{ kind: 'train', player: 2, buildingId: tc1.id, defId: 'villager' }]);
    expect(tc1.trainQueue).toHaveLength(0);
    expect(p2.stockpile.food).toBe(500);
    expect(game.state.players[1].stockpile.food).toBe(500);

    // enemy cancelTrain: cannot steal a refund from someone else's queue
    game.advance([{ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' }]);
    expect(tc1.trainQueue).toHaveLength(1);
    game.advance([{ kind: 'cancelTrain', player: 2, buildingId: tc1.id, index: 0 }]);
    expect(tc1.trainQueue).toHaveLength(1); // still training
    expect(p2.stockpile.food).toBe(500); // no refund landed anywhere wrong
  });
});

describe('conquest elimination (GDD Victory / Defeat)', () => {
  it('a player with no TC, no villagers, no production buildings loses — army does not save them', () => {
    const game = createGame(practiceConfig(41, [player(), player({ civ: 'english' })], 64));
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const vills = entitiesOf(game.state.entities, 1, 'villager');
    const scout = entitiesOf(game.state.entities, 1, 'scout')[0];
    expect(vills).toHaveLength(3);

    // deleting only the TC is not defeat — villagers can rebuild
    let events = game.advance([{ kind: 'deleteEntity', player: 1, entityId: tc.id }]);
    expect(game.state.players[1].defeated).toBe(false);
    expect(events.some((e) => e.kind === 'playerDefeated')).toBe(false);
    expect(game.state.finished).toBe(false);

    // deleting the villagers too crosses the GDD line; the scout still standing must
    // not save the player (the intended stalemate-breaker)
    events = game.advance(vills.map((v) => ({ kind: 'deleteEntity' as const, player: 1, entityId: v.id })));
    expect(game.state.players[1].defeated).toBe(true);
    expect(events.filter((e) => e.kind === 'playerDefeated')).toEqual([{ kind: 'playerDefeated', player: 1 }]);

    // cleanup: remaining entities are destroyed (entityDied), not converted to Gaia
    expect(events.some((e) => e.kind === 'entityDied' && e.id === scout.id)).toBe(true);
    expect(entitiesOf(game.state.entities, 1)).toHaveLength(0);
    expect(game.state.players[1].pop).toBe(0);

    // last player standing wins the same tick; a finished game no longer advances
    expect(events.find((e) => e.kind === 'victory')).toEqual({ kind: 'victory', winners: [2] });
    expect(game.state.finished).toBe(true);
    expect(game.advance([])).toEqual([]);
  });

  it('a lone production building (barracks) keeps a player alive; deleting it ends the game', () => {
    const game = createGame(practiceConfig(43, [player(), player({ civ: 'english' })], 64));
    // wave 1 has no build command yet — spawn a barracks via the internal API to
    // exercise the "any production building" branch of the elimination predicate
    const state = game.state as SimState;
    const tc = entitiesOf(game.state.entities, 1, 'townCenter')[0];
    const spot = findFreeAdjacentTile(state, tc.tileX, tc.tileY, gameData.buildings.townCenter.size, 6)!;
    const barracks = spawnEntity(state, {
      defId: 'barracks', player: 1, tileX: spot.x, tileY: spot.y,
    })!;

    // delete TC + villagers + scout: barracks alone sustains the player
    const doomed = [
      tc,
      ...entitiesOf(game.state.entities, 1, 'villager'),
      ...entitiesOf(game.state.entities, 1, 'scout'),
    ];
    game.advance(doomed.map((e) => ({ kind: 'deleteEntity' as const, player: 1, entityId: e.id })));
    expect(game.state.players[1].defeated).toBe(false);

    // deleting the barracks removes the last way to rebuild → defeat + victory
    const events = game.advance([{ kind: 'deleteEntity', player: 1, entityId: barracks.id }]);
    expect(game.state.players[1].defeated).toBe(true);
    expect(events.find((e) => e.kind === 'victory')).toEqual({ kind: 'victory', winners: [2] });
    expect(game.state.finished).toBe(true);
  });

  it('two resigns in one tick: the second is a no-op — the winner keeps their entities', () => {
    // Plausible in lockstep multiplayer (or two hopeless bots): both players submit
    // 'resign' the same tick. The first resign finishes the game; the second must not
    // be processed, or the declared winner would end up defeated with everything destroyed.
    const game = createGame(practiceConfig(44, [player(), player({ civ: 'english' })], 64));
    const p2Before = entitiesOf(game.state.entities, 2).length;
    expect(p2Before).toBeGreaterThan(0);

    const events = game.advance([
      { kind: 'resign', player: 1 },
      { kind: 'resign', player: 2 },
    ]);

    // exactly one defeat (player 1) and one victory (player 2) — no playerDefeated(2)
    expect(events.filter((e) => e.kind === 'playerDefeated')).toEqual([{ kind: 'playerDefeated', player: 1 }]);
    expect(events.filter((e) => e.kind === 'victory')).toEqual([{ kind: 'victory', winners: [2] }]);
    expect(game.state.finished).toBe(true);

    // terminal state matches the victory event: winner alive with all entities intact
    expect(game.state.players[2].defeated).toBe(false);
    expect(entitiesOf(game.state.entities, 2)).toHaveLength(p2Before);
    expect(entitiesOf(game.state.entities, 1)).toHaveLength(0);
  });

  it('scenario games leave defeat to the trigger system (no auto-elimination)', () => {
    const map = grassMap(20, 20);
    const game = createGame(scenarioConfig(42, map, [
      { defId: 'militia', player: 1, tileX: 3, tileY: 3 }, // army only: no eco at all
      { defId: 'townCenter', player: 2, tileX: 10, tileY: 10 },
    ], [player(), player({ civ: 'english' })]));
    for (let t = 0; t < 10; t++) game.advance([]);
    expect(game.state.players[1].defeated).toBe(false);
    expect(game.state.finished).toBe(false);
    expect(entitiesOf(game.state.entities, 1, 'militia')).toHaveLength(1);
  });
});
