// Villager flee (GDD combat rules): damaged villagers run to the nearest defensive
// building with garrison room and garrison inside; with no shelter they keep their
// task. Military units never flee. Buildings that die kill their garrison.
// Raid aftermath: flee-garrisoned villagers are marked `sheltering` (surfaced by the
// HUD idle-villager badge) and ungarrison is the return-to-work bell — it restores
// each villager's pre-flee task.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND, type Game, type SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { removeEntity } from './entities';
import { onUnitDamaged, RAID_SHELTER_RADIUS_TILES } from './flee';
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

  it('a raid alarms villagers across the nearby settlement, but not distant workers', () => {
    const game = createGame(scenarioConfig(50, grassMap(48, 48), [
      { defId: 'townCenter', player: HUMAN, tileX: 18, tileY: 14, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 15, tileY: 18, ref: 'struck' },
      // On the opposite side of the TC and well beyond a tiny 3-tile reaction radius.
      { defId: 'villager', player: HUMAN, tileX: 25, tileY: 15, ref: 'near' },
      { defId: 'villager', player: HUMAN, tileX: 42, tileY: 42, ref: 'far' },
    ], [player()]));
    const state = game.state as SimState;
    const struck = state.refs.get('struck')!;
    const near = state.refs.get('near')!;
    const far = state.refs.get('far')!;

    expect(RAID_SHELTER_RADIUS_TILES).toBe(12);
    onUnitDamaged(state, state.entities.get(struck)!);

    expect(state.fleeing.has(struck)).toBe(true);
    expect(state.fleeing.has(near)).toBe(true);
    expect(state.fleeing.has(far)).toBe(false);
  });

  it('a wildlife bite shelters only its victim instead of ringing a settlement-wide alarm', () => {
    const game = createGame(scenarioConfig(52, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 8, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 12, tileY: 13, ref: 'struck' },
      { defId: 'villager', player: HUMAN, tileX: 13, tileY: 13, ref: 'neighbor' },
    ], [player()]));
    const state = game.state as SimState;
    const struck = state.refs.get('struck')!;
    const neighbor = state.refs.get('neighbor')!;

    onUnitDamaged(state, state.entities.get(struck)!, false);
    expect(state.fleeing.has(struck)).toBe(true);
    expect(state.fleeing.has(neighbor)).toBe(false);
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

  it('Town Bell shelters the nearest villagers and toggles them back to their jobs', () => {
    const game = createGame(scenarioConfig(47, grassMap(36, 36), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 8, ref: 'tc' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 12, ref: 'bush' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 12, ref: 'worker' },
      { defId: 'villager', player: HUMAN, tileX: 12, tileY: 13, ref: 'idle' },
    ], [player()]));
    const state = game.state as SimState;
    const tcId = game.state.refs.get('tc')!;
    const workerId = game.state.refs.get('worker')!;
    const idleId = game.state.refs.get('idle')!;
    const bushId = game.state.refs.get('bush')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [workerId], targetId: bushId }]);
    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);

    for (let t = 0; t < 500 && game.state.entities.get(tcId)!.garrison?.length !== 2; t++) game.advance([]);
    expect(game.state.entities.get(tcId)!.garrison).toHaveLength(2);
    expect(game.state.entities.get(workerId)!.sheltering).toBe(true);
    expect(game.state.entities.get(idleId)!.sheltering).toBe(true);
    expect(state.shelterIntents.get(workerId)).toEqual({ kind: 'gather', targetId: bushId });

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    expect(game.state.entities.get(tcId)!.garrison).toHaveLength(0);
    expect(game.state.entities.get(workerId)!.intent).toEqual({ kind: 'gather', targetId: bushId });
    expect(state.gather.has(workerId)).toBe(true);
    expect(game.state.entities.get(idleId)!.activity).toBe('idle');
  });

  it('a damaged villager slowly heals while sheltered by the Town Bell', () => {
    const game = createGame(scenarioConfig(51, grassMap(30, 30), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 8, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 12, tileY: 13, ref: 'v' },
    ], [player()]));
    const tcId = game.state.refs.get('tc')!;
    const vid = game.state.refs.get('v')!;
    const villager = game.state.entities.get(vid)!;
    villager.hp = 20;

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    runUntilGarrisoned(game, vid);
    expect(villager.garrisonedIn).toBe(tcId);
    const before = villager.hp;
    run(game, 10 * TICKS_PER_SECOND);
    expect(villager.hp).toBe(before + 1);
  });

  it('turning the bell off cancels villagers who are still walking to the Town Center', () => {
    const game = createGame(scenarioConfig(49, grassMap(44, 44), [
      { defId: 'townCenter', player: HUMAN, tileX: 20, tileY: 8, ref: 'tc' },
      { defId: 'berryBush', player: 0, tileX: 4, tileY: 32, ref: 'bush' },
      { defId: 'villager', player: HUMAN, tileX: 3, tileY: 32, ref: 'worker' },
      { defId: 'villager', player: HUMAN, tileX: 6, tileY: 34, ref: 'idle' },
    ], [player()]));
    const state = game.state as SimState;
    const tcId = state.refs.get('tc')!;
    const bushId = state.refs.get('bush')!;
    const workerId = state.refs.get('worker')!;
    const idleId = state.refs.get('idle')!;

    game.advance([{ kind: 'gather', player: HUMAN, units: [workerId], targetId: bushId }]);
    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    expect(state.entities.get(tcId)!.garrison ?? []).toHaveLength(0);
    expect(state.fleeing.has(workerId)).toBe(true);
    expect(state.fleeing.has(idleId)).toBe(true);
    expect(state.fleeing.get(workerId)?.townBell).toBe(true);
    expect(state.entities.get(workerId)!.targetId).toBe(tcId);

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);

    expect(state.fleeing.has(workerId)).toBe(false);
    expect(state.fleeing.has(idleId)).toBe(false);
    expect(state.entities.get(workerId)!.intent).toEqual({ kind: 'gather', targetId: bushId });
    expect(state.gather.has(workerId)).toBe(true);
    expect(state.entities.get(workerId)!.targetId).not.toBe(tcId);
    expect(state.entities.get(idleId)!.activity).toBe('idle');
    expect(state.motion.has(idleId)).toBe(false);
  });

  it('Town Bell retargets an already-fleeing villager without losing its saved job', () => {
    const game = createGame(scenarioConfig(48, grassMap(36, 36), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 8, ref: 'tc' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 12, ref: 'bush' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 12, ref: 'worker' },
    ], [player()]));
    const state = game.state as SimState;
    const tcId = game.state.refs.get('tc')!;
    const workerId = game.state.refs.get('worker')!;
    const bushId = game.state.refs.get('bush')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [workerId], targetId: bushId }]);
    onUnitDamaged(state, game.state.entities.get(workerId)!);
    expect(state.fleeing.get(workerId)?.savedIntent).toEqual({ kind: 'gather', targetId: bushId });
    expect(state.fleeing.get(workerId)?.townBell).toBeUndefined();

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    expect(state.fleeing.get(workerId)?.townBell).toBe(true);
    runUntilGarrisoned(game, workerId);
    expect(game.state.entities.get(workerId)!.garrisonedIn).toBe(tcId);
    expect(state.shelterIntents.get(workerId)).toEqual({ kind: 'gather', targetId: bushId });

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    expect(game.state.entities.get(workerId)!.intent).toEqual({ kind: 'gather', targetId: bushId });
    expect(state.gather.has(workerId)).toBe(true);
  });

  it('Town Bell return-to-work preserves a villager\'s Shift-build queue', () => {
    const game = createGame(scenarioConfig(53, grassMap(36, 36), [
      { defId: 'townCenter', player: HUMAN, tileX: 14, tileY: 8, ref: 'tc' },
      { defId: 'villager', player: HUMAN, tileX: 12, tileY: 13, ref: 'builder' },
    ], [player()]));
    const state = game.state as SimState;
    const tcId = state.refs.get('tc')!;
    const builderId = state.refs.get('builder')!;
    game.advance([
      { kind: 'build', player: HUMAN, units: [builderId], defId: 'house', tileX: 9, tileY: 14, queue: true },
      { kind: 'build', player: HUMAN, units: [builderId], defId: 'house', tileX: 12, tileY: 15, queue: true },
    ]);
    const queued = [...state.foundations.entries()]
      .find(([, site]) => site.queuedBuilders?.includes(builderId));
    expect(queued).toBeDefined();

    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);
    runUntilGarrisoned(game, builderId);
    game.advance([{ kind: 'townBell', player: HUMAN, buildingId: tcId }]);

    expect(state.entities.get(builderId)!.intent?.kind).toBe('build');
    expect(state.foundations.get(queued![0])?.queuedBuilders).toEqual([builderId]);
  });

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
