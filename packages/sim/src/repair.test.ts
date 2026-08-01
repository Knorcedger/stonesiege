// Repair: villagers restore a completed building's HP at construction speed; the cost
// trickles from the stockpile (full repair from zero = half the build cost); repair
// halts when the bank runs dry; a finished builder auto-joins a nearby foundation.

import { describe, expect, it } from 'vitest';
import type { Command, Game, SimEvent } from './types';
import { createGame } from './game';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function run(game: Game, ticks: number, first: Command[] = []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...game.advance(i === 0 ? first : []));
  return events;
}

describe('repair', () => {
  it('restores HP to max and trickles ~half the proportional cost from the stockpile', () => {
    const game = createGame(scenarioConfig(51, grassMap(30, 30), [
      { defId: 'house', player: HUMAN, tileX: 10, tileY: 10, hp: 275 }, // half-dead 550-HP house
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];

    run(game, 60, [{ kind: 'repair', player: HUMAN, units: [vid], targetId: house.id }]);
    expect(game.state.entities.get(vid)!.activity).toBe('repairing');
    expect(house.hp).toBeGreaterThan(275); // ~1 HP per tick (550 HP / 25 s build)

    run(game, 400);
    expect(house.hp).toBe(550);
    // repairing 275 HP of a 25-wood 550-HP house ≈ 25 * 0.5 * (275/550) = 6.25 → 6 whole wood
    expect(game.state.players[HUMAN].stockpile.wood).toBe(194);
    const v = game.state.entities.get(vid)!;
    expect(v.intent).toBeUndefined(); // released on completion
    expect(v.activity).toBe('idle');
  });

  it('halts (and releases the villager) when the stockpile cannot pay', () => {
    const game = createGame(scenarioConfig(52, grassMap(30, 30), [
      { defId: 'house', player: HUMAN, tileX: 10, tileY: 10, hp: 275 },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    ], [player({ startingResources: { food: 0, wood: 0, gold: 0, stone: 0 } })]));
    const vid = game.state.refs.get('v')!;
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];

    run(game, 300, [{ kind: 'repair', player: HUMAN, units: [vid], targetId: house.id }]);
    expect(house.hp).toBeLessThan(330); // only the sub-1-wood fraction was free
    expect(game.state.players[HUMAN].stockpile.wood).toBe(0); // never negative
    const v = game.state.entities.get(vid)!;
    expect(v.intent).toBeUndefined();
    expect(v.activity).toBe('idle');
  });
});

describe('repair on a foundation resumes construction (HUD tap contract)', () => {
  it('an abandoned foundation is raised to completion by a repair-tapped villager', () => {
    const game = createGame(scenarioConfig(54, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    // place, build a little, then abandon (move away)
    run(game, 120, [{ kind: 'build', player: HUMAN, units: [vid], defId: 'house', tileX: 12, tileY: 10 }]);
    const house = entitiesOf(game.state.entities, HUMAN, 'house')[0];
    const partial = house.buildProgress!;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1000);
    run(game, 40, [{ kind: 'move', player: HUMAN, units: [vid], x: 9 * 256, y: 10 * 256 }]);
    expect(house.buildProgress).toBeLessThan(1000);

    // the HUD's foundation tap: a repair command targeting the foundation
    const events = run(game, 600, [{ kind: 'repair', player: HUMAN, units: [vid], targetId: house.id }]);
    expect(events.some((e) => e.kind === 'buildingComplete' && e.defId === 'house')).toBe(true);
    expect(house.buildProgress).toBe(1000);
    expect(game.state.players[HUMAN].stockpile.wood).toBe(175); // paid once, at placement
  });
});

describe('construction auto-join (AoE2: finished builders hop to a nearby foundation)', () => {
  it('after completing a building, a builder joins an own foundation within a short radius', () => {
    const game = createGame(scenarioConfig(53, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 11, tileY: 10, ref: 'v0' },
      { defId: 'villager', player: HUMAN, tileX: 11, tileY: 13, ref: 'v1' },
    ], [player()]));
    const v0 = game.state.refs.get('v0')!;
    const v1 = game.state.refs.get('v1')!;

    // v0 raises a quick house; v1 starts a slow barracks two tiles south
    game.advance([
      { kind: 'build', player: HUMAN, units: [v0], defId: 'house', tileX: 12, tileY: 10 },
      { kind: 'build', player: HUMAN, units: [v1], defId: 'barracks', tileX: 12, tileY: 13 },
    ]);
    const barracks = entitiesOf(game.state.entities, HUMAN, 'barracks')[0];

    // run until the house completes (solo ≈ 500 ticks), then a beat for the auto-join
    let houseDone = -1;
    for (let t = 0; t < 800 && houseDone < 0; t++) {
      if (game.advance([]).some((e) => e.kind === 'buildingComplete' && e.defId === 'house')) houseDone = t;
    }
    expect(houseDone).toBeGreaterThan(0);
    game.advance([]);
    expect(game.state.entities.get(v0)!.intent).toEqual({ kind: 'build', targetId: barracks.id });

    // and the barracks actually finishes with both hands on it
    let barracksDone = false;
    for (let t = 0; t < 900 && !barracksDone; t++) {
      barracksDone = game.advance([]).some((e) => e.kind === 'buildingComplete' && e.defId === 'barracks');
    }
    expect(barracksDone).toBe(true);
  });
});
