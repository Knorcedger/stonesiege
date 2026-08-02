// QA CRITIC round-1 fuzz harness (temporary — determinism/sim-safety audit).
// Contract under test (commands.ts header): "Illegal commands are dropped silently —
// the sim never throws on player/AI input." Feeds malformed/hostile Command objects
// through Game.advance and asserts: (1) no throw, (2) state stays integer-valued,
// (3) snapshot still round-trips, (4) definitely-invalid commands are hash-no-ops.

import { describe, expect, it } from 'vitest';
import { createGame, createGameFromSnapshot } from './game';
import type { Command, Game, GameSnapshot } from './types';
import type { SimState } from './internal';
import { entitiesOf, practiceConfig, player } from './testutil';

function makeGame(): Game {
  return createGame(practiceConfig(0xbadf00d, [player({ name: 'A', civ: 'scots' }), player({ name: 'B', civ: 'english' })], 80));
}

/** Every hostile shape gets a label so failures identify the exact command. */
type Case = { label: string; cmd: unknown };

function hostileCases(game: Game): Case[] {
  const s = game.state;
  const tc1 = entitiesOf(s.entities, 1, 'townCenter')[0];
  const tc2 = entitiesOf(s.entities, 2, 'townCenter')[0];
  const v1 = entitiesOf(s.entities, 1, 'villager').map((e) => e.id);
  const cases: Case[] = [
    // --- dispatch table hostility ---
    { label: 'unknown kind', cmd: { kind: 'summonDragon', player: 1 } },
    { label: 'empty kind', cmd: { kind: '', player: 1 } },
    { label: 'kind toString', cmd: { kind: 'toString', player: 1 } },
    { label: 'kind hasOwnProperty', cmd: { kind: 'hasOwnProperty', player: 1 } },
    { label: 'kind constructor', cmd: { kind: 'constructor', player: 1 } },
    { label: 'kind __proto__', cmd: { kind: '__proto__', player: 1 } },
    { label: 'kind valueOf', cmd: { kind: 'valueOf', player: 1 } },
    { label: 'kind undefined', cmd: { player: 1 } },
    { label: 'kind number', cmd: { kind: 42, player: 1 } },
    { label: 'null command', cmd: null },
    { label: 'undefined command', cmd: undefined },
    { label: 'number command', cmd: 7 },
    { label: 'string command', cmd: 'resign' },
    // --- player field hostility ---
    { label: 'player NaN', cmd: { kind: 'resign', player: NaN } },
    { label: 'player -1', cmd: { kind: 'resign', player: -1 } },
    { label: 'player 99', cmd: { kind: 'resign', player: 99 } },
    { label: 'player 1.5', cmd: { kind: 'resign', player: 1.5 } },
    { label: 'player string', cmd: { kind: 'resign', player: '1' } },
    { label: 'player gaia', cmd: { kind: 'resign', player: 0 } },
    // --- units array hostility ---
    { label: 'units null', cmd: { kind: 'move', player: 1, units: null, x: 2560, y: 2560 } },
    { label: 'units number', cmd: { kind: 'move', player: 1, units: 42, x: 2560, y: 2560 } },
    { label: 'units string', cmd: { kind: 'move', player: 1, units: 'abc', x: 2560, y: 2560 } },
    { label: 'units object', cmd: { kind: 'move', player: 1, units: { 0: v1[0] }, x: 2560, y: 2560 } },
    { label: 'units garbage ids', cmd: { kind: 'move', player: 1, units: [NaN, -1, 1e9, 'x', null, {}, v1[0]], x: 2560, y: 2560 } },
    { label: 'units missing', cmd: { kind: 'stop', player: 1 } },
    // --- coordinate hostility ---
    { label: 'move NaN coords', cmd: { kind: 'move', player: 1, units: v1, x: NaN, y: NaN } },
    { label: 'move Infinity coords', cmd: { kind: 'move', player: 1, units: v1, x: Infinity, y: -Infinity } },
    { label: 'move float coords', cmd: { kind: 'move', player: 1, units: v1, x: 1000.5, y: 999.25 } },
    { label: 'move negative coords', cmd: { kind: 'move', player: 1, units: v1, x: -50000, y: -50000 } },
    { label: 'move huge coords', cmd: { kind: 'move', player: 1, units: v1, x: 1e18, y: 1e18 } },
    { label: 'attackMove NaN', cmd: { kind: 'attackMove', player: 1, units: v1, x: NaN, y: 100 } },
    { label: 'setRally NaN', cmd: { kind: 'setRally', player: 1, buildingId: tc1?.id, x: NaN, y: NaN } },
    { label: 'setRally float+ghost target', cmd: { kind: 'setRally', player: 1, buildingId: tc1?.id, x: 10.5, y: 20.7, targetId: 123456 } },
    // --- id / defId hostility ---
    { label: 'train __proto__ def', cmd: { kind: 'train', player: 1, buildingId: tc1?.id, defId: '__proto__' } },
    { label: 'train toString def', cmd: { kind: 'train', player: 1, buildingId: tc1?.id, defId: 'toString' } },
    { label: 'train constructor def', cmd: { kind: 'train', player: 1, buildingId: tc1?.id, defId: 'constructor' } },
    { label: 'train missing def', cmd: { kind: 'train', player: 1, buildingId: tc1?.id, defId: 'nonexistent' } },
    { label: 'train def undefined', cmd: { kind: 'train', player: 1, buildingId: tc1?.id } },
    { label: 'train enemy building', cmd: { kind: 'train', player: 1, buildingId: tc2?.id, defId: 'villager' } },
    { label: 'train buildingId NaN', cmd: { kind: 'train', player: 1, buildingId: NaN, defId: 'villager' } },
    { label: 'research __proto__', cmd: { kind: 'research', player: 1, buildingId: tc1?.id, techId: '__proto__' } },
    { label: 'research missing tech', cmd: { kind: 'research', player: 1, buildingId: tc1?.id, techId: 'alchemyX' } },
    { label: 'build __proto__ def', cmd: { kind: 'build', player: 1, units: v1, defId: '__proto__', tileX: 10, tileY: 10 } },
    { label: 'build NaN tiles', cmd: { kind: 'build', player: 1, units: v1, defId: 'house', tileX: NaN, tileY: NaN } },
    { label: 'build float tiles', cmd: { kind: 'build', player: 1, units: v1, defId: 'house', tileX: 10.5, tileY: 11.7 } },
    { label: 'build negative tiles', cmd: { kind: 'build', player: 1, units: v1, defId: 'house', tileX: -5, tileY: -5 } },
    { label: 'cancelTrain NaN index', cmd: { kind: 'cancelTrain', player: 1, buildingId: tc1?.id, index: NaN } },
    { label: 'cancelTrain float index', cmd: { kind: 'cancelTrain', player: 1, buildingId: tc1?.id, index: 0.5 } },
    { label: 'cancelTrain huge index', cmd: { kind: 'cancelTrain', player: 1, buildingId: tc1?.id, index: 1e9 } },
    { label: 'gather ghost target', cmd: { kind: 'gather', player: 1, units: v1, targetId: 987654 } },
    { label: 'gather string target', cmd: { kind: 'gather', player: 1, units: v1, targetId: 'tree' } },
    { label: 'attack self target', cmd: { kind: 'attack', player: 1, units: v1, targetId: v1[0] } },
    { label: 'attack NaN target', cmd: { kind: 'attack', player: 1, units: v1, targetId: NaN } },
    { label: 'repair ghost', cmd: { kind: 'repair', player: 1, units: v1, targetId: -7 } },
    { label: 'garrison ghost', cmd: { kind: 'garrison', player: 1, units: v1, targetId: 424242 } },
    { label: 'ungarrison enemy', cmd: { kind: 'ungarrison', player: 1, buildingId: tc2?.id } },
    { label: 'convert w/o monk', cmd: { kind: 'convert', player: 1, units: v1, targetId: tc2?.id } },
    { label: 'heal ghost', cmd: { kind: 'heal', player: 1, units: v1, targetId: 55555 } },
    { label: 'deleteEntity enemy', cmd: { kind: 'deleteEntity', player: 1, entityId: tc2?.id } },
    { label: 'deleteEntity NaN', cmd: { kind: 'deleteEntity', player: 1, entityId: NaN } },
    { label: 'reseed ghost farm', cmd: { kind: 'reseedFarm', player: 1, farmId: 31337 } },
    { label: 'queueReseed non-bool', cmd: { kind: 'queueReseed', player: 1, enabled: 'yes' } },
    { label: 'pack non-treb', cmd: { kind: 'pack', player: 1, units: v1 } },
    // --- marketTrade hostility ---
    { label: 'market NaN amount', cmd: { kind: 'marketTrade', player: 1, sell: 'food', buy: 'gold', amount: NaN } },
    { label: 'market Infinity amount', cmd: { kind: 'marketTrade', player: 1, sell: 'food', buy: 'gold', amount: Infinity } },
    { label: 'market negative amount', cmd: { kind: 'marketTrade', player: 1, sell: 'food', buy: 'gold', amount: -100000 } },
    { label: 'market float amount', cmd: { kind: 'marketTrade', player: 1, sell: 'gold', buy: 'wood', amount: 150.7 } },
    { label: 'market gold->gold', cmd: { kind: 'marketTrade', player: 1, sell: 'gold', buy: 'gold', amount: 100 } },
    { label: 'market food->wood', cmd: { kind: 'marketTrade', player: 1, sell: 'food', buy: 'wood', amount: 100 } },
    { label: 'market __proto__ res', cmd: { kind: 'marketTrade', player: 1, sell: '__proto__', buy: 'gold', amount: 100 } },
  ];
  return cases;
}

function assertIntegerState(state: SimState, phase: string): string[] {
  const problems: string[] = [];
  for (const e of state.entities.values()) {
    for (const key of ['x', 'y', 'tileX', 'tileY', 'hp', 'facing'] as const) {
      const v = e[key];
      if (!Number.isInteger(v)) problems.push(`${phase}: entity ${e.id} (${e.defId}) ${key}=${String(v)}`);
    }
    if (e.rally && (!Number.isInteger(e.rally.x) || !Number.isInteger(e.rally.y))) {
      problems.push(`${phase}: entity ${e.id} (${e.defId}) rally=(${String(e.rally.x)},${String(e.rally.y)})`);
    }
  }
  for (const p of state.players) {
    for (const r of ['food', 'wood', 'gold', 'stone'] as const) {
      const v = p.stockpile[r];
      if (!Number.isInteger(v) || v < 0) problems.push(`${phase}: player ${p.id} stockpile.${r}=${String(v)}`);
    }
  }
  for (const [id, m] of state.motion) {
    if (!Number.isFinite(m.targetX) || !Number.isFinite(m.targetY)) {
      problems.push(`${phase}: motion[${id}] target=(${String(m.targetX)},${String(m.targetY)})`);
    }
  }
  return problems;
}

describe('QA fuzz: hostile Command objects', () => {
  it('advance() never throws on malformed/hostile commands', () => {
    const game = makeGame();
    for (let t = 0; t < 20; t++) game.advance([]); // settle
    const failures: string[] = [];
    for (const { label, cmd } of hostileCases(game)) {
      try {
        game.advance([cmd as Command]);
      } catch (err) {
        failures.push(`${label}: THREW ${String(err)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('hostile commands never corrupt integer state or break snapshots', () => {
    const game = makeGame();
    for (let t = 0; t < 20; t++) game.advance([]);
    for (const { cmd } of hostileCases(game)) {
      try { game.advance([cmd as Command]); } catch { /* crash covered above */ }
    }
    // run on: any latent NaN/float corruption surfaces within a few hundred ticks
    let runOnError: string | null = null;
    try {
      for (let t = 0; t < 300; t++) game.advance([]);
    } catch (err) { runOnError = `run-on after fuzz THREW: ${String(err)}`; }
    expect(runOnError).toBeNull();

    const problems = assertIntegerState(game.state as SimState, 'post-fuzz');
    expect(problems).toEqual([]);

    // snapshot must still round-trip byte-identically
    const json = JSON.stringify(game.serialize());
    const resumed = createGameFromSnapshot(JSON.parse(json) as GameSnapshot);
    expect(resumed.hash()).toBe(game.hash());
  });

  it('definitely-invalid commands are exact hash-no-ops', () => {
    const game = makeGame();
    for (let t = 0; t < 20; t++) game.advance([]);
    const control = makeGame();
    for (let t = 0; t < 20; t++) control.advance([]);
    expect(game.hash()).toBe(control.hash());

    const s = game.state;
    const tc2 = entitiesOf(s.entities, 2, 'townCenter')[0];
    const invalid: unknown[] = [
      { kind: 'train', player: 1, buildingId: tc2?.id, defId: 'villager' }, // enemy building
      { kind: 'train', player: 1, buildingId: 999999, defId: 'villager' }, // ghost building
      { kind: 'gather', player: 1, units: [999999], targetId: 888888 }, // ghost everything
      { kind: 'deleteEntity', player: 1, entityId: tc2?.id }, // enemy delete
      { kind: 'marketTrade', player: 1, sell: 'food', buy: 'gold', amount: 100 }, // no market built
      { kind: 'research', player: 1, buildingId: tc2?.id, techId: 'loom' }, // enemy research
      { kind: 'resign', player: 42 }, // ghost player
    ];
    for (let t = 0; t < 50; t++) {
      try { game.advance(invalid as Command[]); } catch { /* covered above */ }
      control.advance([]);
    }
    expect(game.hash()).toBe(control.hash());
  });
});
