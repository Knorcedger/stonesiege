// Match snapshot/resume (GDD: backgrounding must never lose a game). The
// contract under test: recording every applied command batch through the
// SimLoop and replaying it into a FRESH engine created from the same config
// reproduces the exact sim state (hash-identical), and the resumed game stays
// in lockstep afterwards. Plus defensive decoding of stored snapshots and the
// graceful no-op behavior of the (not-yet-landed) sim serialize seam.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import { fp, TICKS_PER_SECOND, type Entity, type GameConfig } from '@bf/sim/types';
import {
  decodeSnapshot, encodeSnapshot, replaySnapshot, savedMatchLabel, saveSnapshot,
  scenarioFingerprint, SNAPSHOT_VERSION, trySerialize,
  type CommandLog, type PracticeSnapshot, type ScenarioSnapshot,
} from './persist';
import { makeMemoryStorage, setStorageBackend } from './storage';
import { gameFromSerialized, type PracticeSetup } from './simBridge';
import { SimLoop, TICK_MS } from './simloop';

const makeConfig = (): GameConfig => ({
  seed: 7,
  map: { type: 'practice-random', width: 96, height: 96 },
  players: [
    { name: 'A', civ: 'scots', team: 0, isHuman: true, color: 0 },
    { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 100,
});

const makeSetup = (): PracticeSetup => ({
  mapSize: 'small', opponents: ['standard'], civ: 'scots', color: 0,
});

function findOwn(entities: Iterable<Entity>, player: number, defId: string): Entity | null {
  for (const e of entities) {
    if (e.player === player && e.defId === defId && e.hp > 0) return e;
  }
  return null;
}

describe('snapshot record → replay', () => {
  it('replaying the recorded command log reproduces the exact state, then stays in lockstep', () => {
    const config = makeConfig();
    const original = createGame(config);
    const log: CommandLog = [];
    const loop = new SimLoop(original, {
      onAdvance: (tick, commands) => log.push([tick, commands]),
    });

    // play ~10 s of a real match through the loop: train a villager, move one,
    // send one gathering — commands land on different ticks like a human's would
    const tc = findOwn(original.state.entities.values(), 1, 'townCenter')!;
    const vill = findOwn(original.state.entities.values(), 1, 'villager')!;
    loop.issue({ kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' });
    for (let t = 0; t < 200; t++) {
      if (t === 40) {
        loop.issue({ kind: 'move', player: 1, units: [vill.id], x: vill.x + fp(4), y: vill.y });
      }
      if (t === 90) {
        const tree = findOwn(original.state.entities.values(), 0, 'tree');
        if (tree) loop.issue({ kind: 'gather', player: 1, units: [vill.id], targetId: tree.id });
      }
      loop.update(TICK_MS);
    }
    expect(original.state.tick).toBe(200);
    expect(log.length).toBeGreaterThanOrEqual(3);

    const snapshot: PracticeSnapshot = {
      version: SNAPSHOT_VERSION, mode: 'practice', config, setup: makeSetup(),
      tick: original.state.tick, log,
    };
    // storage round-trip: what localStorage gives back must decode identically
    const restored = decodeSnapshot(encodeSnapshot(snapshot))!;
    expect(restored).not.toBeNull();
    expect(restored.mode).toBe('practice');

    const resumed = createGame((restored as PracticeSnapshot).config);
    replaySnapshot(resumed, restored);
    expect(resumed.state.tick).toBe(original.state.tick);
    expect(resumed.hash()).toBe(original.hash());

    // the resumed engine must stay in lockstep from here (same inputs → same states)
    for (let t = 0; t < 60; t++) {
      original.advance([]);
      resumed.advance([]);
    }
    expect(resumed.hash()).toBe(original.hash());
  });
});

describe('decodeSnapshot (defensive intake)', () => {
  const valid = (): PracticeSnapshot => ({
    version: SNAPSHOT_VERSION, mode: 'practice', config: makeConfig(), setup: makeSetup(),
    tick: 12, log: [[0, [{ kind: 'resign', player: 2 }]]],
  });
  const validScenario = (): ScenarioSnapshot => ({
    version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: 'wallace-1', seed: 42,
    fingerprint: scenarioFingerprint('wallace-1')!,
    tick: 12, log: [],
  });

  it('accepts valid practice and scenario snapshot round-trips', () => {
    expect(decodeSnapshot(encodeSnapshot(valid()))).toEqual(valid());
    expect(decodeSnapshot(encodeSnapshot(validScenario()))).toEqual(validScenario());
  });

  it('rejects null, garbage, and non-JSON', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('')).toBeNull();
    expect(decodeSnapshot('{not json')).toBeNull();
    expect(decodeSnapshot('42')).toBeNull();
  });

  it('rejects the wrong version, bad ticks, bad modes, and malformed setups', () => {
    expect(decodeSnapshot(JSON.stringify({ ...valid(), version: 999 }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...valid(), tick: -1 }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...valid(), mode: 'skirmish' }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({
      ...valid(), setup: { ...makeSetup(), opponents: ['nightmare'] },
    }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...valid(), setup: { ...makeSetup(), opponents: [] } }))).toBeNull();
    // scenario map configs never ride inside a practice snapshot (typed arrays don't JSON)
    const scenarioMap = { ...valid(), config: { ...makeConfig(), map: { type: 'scenario' } } };
    expect(decodeSnapshot(JSON.stringify(scenarioMap))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...validScenario(), scenarioId: '' }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...validScenario(), seed: 'x' }))).toBeNull();
  });

  // Scenario resumes rebuild config from the CURRENT authored def and replay
  // the old log against it — any content change silently diverges the replay,
  // so a save stamped against different content must read as "no snapshot".
  it('rejects scenario snapshots whose content fingerprint no longer matches', () => {
    // stale across an app update: the def/game data changed since the save
    expect(decodeSnapshot(JSON.stringify({ ...validScenario(), fingerprint: 'deadbeef' }))).toBeNull();
    // legacy save from before fingerprints existed
    const { fingerprint: _dropped, ...legacy } = validScenario();
    expect(decodeSnapshot(JSON.stringify(legacy))).toBeNull();
    // scenario the current build no longer authors
    expect(decodeSnapshot(JSON.stringify({ ...validScenario(), scenarioId: 'wallace-99' }))).toBeNull();
  });
});

describe('scenarioFingerprint', () => {
  it('is stable per scenario, distinct across scenarios, null for unknown ids', () => {
    const fp1 = scenarioFingerprint('wallace-1');
    expect(fp1).toMatch(/^[0-9a-f]{8}$/);
    expect(scenarioFingerprint('wallace-1')).toBe(fp1); // deterministic (and cached)
    expect(scenarioFingerprint('wallace-2')).not.toBe(fp1);
    expect(scenarioFingerprint('no-such-scenario')).toBeNull();
  });
});

describe('savedMatchLabel (menu abandon-confirm text)', () => {
  it('names the saved scenario and its match time; practice saves read as Practice match', () => {
    setStorageBackend(makeMemoryStorage());
    try {
      expect(savedMatchLabel()).toBeNull(); // nothing saved
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: 'wallace-1', seed: 42,
        fingerprint: scenarioFingerprint('wallace-1')!,
        tick: (42 * 60 + 10) * TICKS_PER_SECOND, log: [],
      });
      expect(savedMatchLabel()).toBe('The Sheriff of Lanark, 42:10');
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'practice',
        config: { seed: 7, map: { type: 'practice-random', width: 96, height: 96 }, players: [
          { name: 'A', civ: 'scots', team: 0, isHuman: true, color: 0 },
          { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
        ], popCap: 100 },
        setup: { mapSize: 'small', opponents: ['standard'], civ: 'scots', color: 0 },
        tick: 90 * TICKS_PER_SECOND, log: [],
      });
      expect(savedMatchLabel()).toBe('Practice match, 1:30');
      // a stale scenario save must offer no label either (decode rejects it)
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: 'wallace-1', seed: 42,
        fingerprint: 'deadbeef', tick: 100, log: [],
      });
      expect(savedMatchLabel()).toBeNull();
    } finally {
      setStorageBackend(makeMemoryStorage()); // never leak test snapshots
    }
  });
});

describe('sim serialize seam', () => {
  it('serialized blob round-trips through JSON into a hash-identical game', () => {
    const game = createGame(makeConfig());
    for (let t = 0; t < 50; t++) game.advance([]);
    const blob = trySerialize(game);
    expect(blob).toBeDefined();
    // storage round-trip exactly as persist.ts stores it
    const restored = gameFromSerialized(JSON.parse(JSON.stringify(blob)));
    expect(restored).not.toBeNull();
    expect(restored!.state.tick).toBe(game.state.tick);
    expect(restored!.hash()).toBe(game.hash());
    // lockstep continues after the fast-path resume
    for (let t = 0; t < 40; t++) {
      game.advance([]);
      restored!.advance([]);
    }
    expect(restored!.hash()).toBe(game.hash());
  });

  it('degrades gracefully: bad blobs restore as null, absent serialize as undefined', () => {
    expect(gameFromSerialized(undefined)).toBeNull();
    expect(gameFromSerialized(null)).toBeNull();
    expect(gameFromSerialized({ schemaVersion: -1 })).toBeNull(); // mock stub / mismatch
    expect(gameFromSerialized('garbage')).toBeNull();
    const noSerialize = { state: {} } as unknown as Parameters<typeof trySerialize>[0];
    expect(trySerialize(noSerialize)).toBeUndefined();
  });
});
