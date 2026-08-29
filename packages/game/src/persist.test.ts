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
  campaignSlot, clearSnapshot, decodeSnapshot, encodeSnapshot, hasSnapshot, listSaves, loadSnapshot,
  mostRecentSave, PRACTICE_SLOT, replaySnapshot, replaySnapshotIncrementally,
  resetSaveIndexCache, savedMatchLabel, saveForCampaign, saveSnapshot,
  scenarioFingerprint, SNAPSHOT_VERSION, slotForSnapshot, trySerialize,
  type CommandLog, type PracticeSnapshot, type ScenarioSnapshot,
} from './persist';
import { appStorage, makeMemoryStorage, setStorageBackend } from './storage';
import { gameFromSerialized, type PracticeSetup } from './simBridge';
import { SimLoop, TICK_MS } from './simloop';
import { emptyTallies } from './hud/summary';

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

  it('incremental replay yields and reports exact tick progress without changing the result', async () => {
    const config = makeConfig();
    const original = createGame(config);
    for (let tick = 0; tick < 600; tick++) original.advance([]);
    const snapshot: PracticeSnapshot = {
      version: SNAPSHOT_VERSION, mode: 'practice', config, setup: makeSetup(),
      tick: original.state.tick, log: [],
    };
    const resumed = createGame(config);
    const progress: number[] = [];
    let yields = 0;

    await replaySnapshotIncrementally(resumed, snapshot, {
      now: () => 0,
      maxTicksPerChunk: 100,
      yieldControl: async () => { yields++; },
      onProgress: (completed, target) => progress.push(completed / target),
    });

    expect(yields).toBeGreaterThan(0);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
    expect(resumed.hash()).toBe(original.hash());
  });

  it('bounds an incremental replay that cannot finish in time', async () => {
    const config = makeConfig();
    const snapshot: PracticeSnapshot = {
      version: SNAPSHOT_VERSION, mode: 'practice', config, setup: makeSetup(), tick: 600, log: [],
    };
    let clock = 0;
    await expect(replaySnapshotIncrementally(createGame(config), snapshot, {
      now: () => ++clock,
      chunkBudgetMs: 0,
      maxTicksPerChunk: 1,
      timeoutMs: 2,
      yieldControl: async () => undefined,
    })).rejects.toThrow('took too long');
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
    const withMatchId = { ...valid(), analyticsMatchId: 'match-saved-1234' };
    expect(decodeSnapshot(encodeSnapshot(withMatchId))).toEqual(withMatchId);
    const withTallies = { ...valid(), tallies: { ...emptyTallies(4), foodGathered: 120 } };
    expect(decodeSnapshot(encodeSnapshot(withTallies))).toEqual(withTallies);
  });

  it('migrates version-2 Hard saves to the equivalent new Medium AI', () => {
    const legacy = {
      ...valid(), version: 2,
      setup: { ...makeSetup(), opponents: ['easy', 'standard', 'hard'] },
    };
    expect(decodeSnapshot(JSON.stringify(legacy))).toMatchObject({
      version: SNAPSHOT_VERSION,
      setup: { opponents: ['easy', 'standard', 'medium'] },
    });
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
    expect(decodeSnapshot(JSON.stringify({ ...valid(), analyticsMatchId: 'bad id' }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({
      ...valid(), tallies: { ...emptyTallies(), buildingsBuilt: -1 },
    }))).toBeNull();
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
    resetSaveIndexCache();
    try {
      const wallace = campaignSlot('wallace');
      expect(savedMatchLabel(wallace)).toBeNull(); // nothing saved
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: 'wallace-1', seed: 42,
        fingerprint: scenarioFingerprint('wallace-1')!,
        tick: (42 * 60 + 10) * TICKS_PER_SECOND, log: [],
      });
      expect(savedMatchLabel(wallace)).toBe('The Sheriff of Lanark, 42:10');
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'practice',
        config: { seed: 7, map: { type: 'practice-random', width: 96, height: 96 }, players: [
          { name: 'A', civ: 'scots', team: 0, isHuman: true, color: 0 },
          { name: 'B', civ: 'english', team: 0, isHuman: false, color: 1 },
        ], popCap: 100 },
        setup: { mapSize: 'small', opponents: ['standard'], civ: 'scots', color: 0 },
        tick: 90 * TICKS_PER_SECOND, log: [],
      });
      expect(savedMatchLabel(PRACTICE_SLOT)).toBe('Practice match, 1:30');
      // saving practice must not have disturbed the campaign's own slot
      expect(savedMatchLabel(wallace)).toBe('The Sheriff of Lanark, 42:10');
      // a stale scenario save must offer no label either (decode rejects it)
      saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: 'wallace-1', seed: 42,
        fingerprint: 'deadbeef', tick: 100, log: [],
      });
      expect(hasSnapshot(wallace)).toBe(true);
      expect(loadSnapshot(wallace)).toBeNull();
      expect(savedMatchLabel(wallace)).toBe('Saved match from an earlier or incompatible version');
    } finally {
      setStorageBackend(makeMemoryStorage()); // never leak test snapshots
      resetSaveIndexCache();
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

// --------------------------------------------------------------- save slots
// The behaviour players asked for: several campaigns in progress at once, each
// resumable, none destroyed by starting another.

describe('per-campaign save slots', () => {
  const scenarioSave = (scenarioId: string, tick: number): ScenarioSnapshot => ({
    version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId, seed: 42,
    fingerprint: scenarioFingerprint(scenarioId)!, tick, log: [],
  });
  const practiceSave = (tick: number): PracticeSnapshot => ({
    version: SNAPSHOT_VERSION, mode: 'practice', config: makeConfig(), setup: makeSetup(),
    tick, log: [],
  });
  const withStore = (quotaBytes?: number) => (run: () => void): void => {
    setStorageBackend(makeMemoryStorage(quotaBytes));
    resetSaveIndexCache();
    try {
      run();
    } finally {
      setStorageBackend(makeMemoryStorage());
      resetSaveIndexCache();
    }
  };
  const fresh = withStore();

  it('routes a snapshot to its own campaign, and practice to its own slot', () => {
    expect(slotForSnapshot(scenarioSave('wallace-01-ledger', 1))).toBe(campaignSlot('wallace'));
    expect(slotForSnapshot(scenarioSave('joan-02-orleans', 1))).toBe(campaignSlot('joan'));
    expect(slotForSnapshot(practiceSave(1))).toBe(PRACTICE_SLOT);
  });

  it('keeps two campaigns and a practice match in progress at the same time', () => fresh(() => {
    saveSnapshot(scenarioSave('wallace-01-ledger', 100));
    saveSnapshot(scenarioSave('joan-02-orleans', 200));
    saveSnapshot(practiceSave(300));

    expect(loadSnapshot(campaignSlot('wallace'))?.tick).toBe(100);
    expect(loadSnapshot(campaignSlot('joan'))?.tick).toBe(200);
    expect(loadSnapshot(PRACTICE_SLOT)?.tick).toBe(300);
    expect(listSaves()).toHaveLength(3);
  }));

  it('replaces only its own slot when the same campaign saves again', () => fresh(() => {
    saveSnapshot(scenarioSave('wallace-01-ledger', 100));
    saveSnapshot(scenarioSave('joan-02-orleans', 200));
    // a later Wallace chapter overwrites the Wallace slot, not Joan's
    saveSnapshot(scenarioSave('wallace-05-two-risings', 500));

    const wallace = loadSnapshot(campaignSlot('wallace'));
    expect(wallace?.mode === 'scenario' && wallace.scenarioId).toBe('wallace-05-two-risings');
    expect(loadSnapshot(campaignSlot('joan'))?.tick).toBe(200);
    expect(listSaves()).toHaveLength(2);
  }));

  it('clears one slot without touching the others', () => fresh(() => {
    saveSnapshot(scenarioSave('wallace-01-ledger', 100));
    saveSnapshot(scenarioSave('joan-02-orleans', 200));
    clearSnapshot(campaignSlot('joan'));

    expect(hasSnapshot(campaignSlot('joan'))).toBe(false);
    expect(hasSnapshot(campaignSlot('wallace'))).toBe(true);
    expect(saveForCampaign('wallace')?.scenarioId).toBe('wallace-01-ledger');
    expect(saveForCampaign('joan')).toBeNull();
  }));

  it('continues the most recently saved campaign, whichever it is', () => fresh(() => {
    expect(mostRecentSave()).toBeNull();
    saveSnapshot(scenarioSave('wallace-01-ledger', 100));
    expect(mostRecentSave()?.slot).toBe(campaignSlot('wallace'));
    saveSnapshot(scenarioSave('joan-02-orleans', 200));
    expect(mostRecentSave()?.slot).toBe(campaignSlot('joan'));
    // going back to Wallace makes it the most recent again
    saveSnapshot(scenarioSave('wallace-01-ledger', 140));
    expect(mostRecentSave()?.slot).toBe(campaignSlot('wallace'));
    expect(mostRecentSave()?.label).toBe('A Name in the Ledger, 0:07');
  }));

  it('indexes the chapter a campaign save is in, for the chapter list', () => fresh(() => {
    saveSnapshot(scenarioSave('joan-02-orleans', 200));
    const entry = saveForCampaign('joan');
    expect(entry).toMatchObject({
      slot: campaignSlot('joan'), mode: 'scenario',
      scenarioId: 'joan-02-orleans', campaignId: 'joan',
    });
    expect(saveForCampaign('genghis')).toBeNull();
  }));

  it('never stores the unusable fast-path blob on a campaign save', () => fresh(() => {
    // bootGame only takes gameFromSerialized for practice: a scenario resume
    // log-replays, so a scenario blob is hundreds of KiB nothing can read
    saveSnapshot({ ...scenarioSave('wallace-01-ledger', 100), serialized: { big: 'blob' } });
    const stored = loadSnapshot(campaignSlot('wallace'));
    expect(stored?.serialized).toBeUndefined();

    saveSnapshot({ ...practiceSave(100), serialized: { schemaVersion: 1 } });
    expect(loadSnapshot(PRACTICE_SLOT)?.serialized).toEqual({ schemaVersion: 1 });
  }));

  it('migrates a pre-slot save into its campaign slot, once', () => fresh(() => {
    const legacy = encodeSnapshot(scenarioSave('wallace-01-ledger', 100));
    setStorageBackend(makeMemoryStorage());
    resetSaveIndexCache();
    appStorage.set('bf.match.snapshot.v2', legacy);

    expect(loadSnapshot(campaignSlot('wallace'))).toBeNull(); // not read directly
    expect(mostRecentSave()?.slot).toBe(campaignSlot('wallace')); // reading the index migrates
    expect(loadSnapshot(campaignSlot('wallace'))?.tick).toBe(100);
    expect(appStorage.get('bf.match.snapshot.v2')).toBeNull(); // moved, not copied

    // and it survives the next boot: the legacy key is gone, so an index that
    // only lived in memory would orphan the save it just moved
    resetSaveIndexCache();
    expect(mostRecentSave()?.slot).toBe(campaignSlot('wallace'));
    expect(saveForCampaign('wallace')?.scenarioId).toBe('wallace-01-ledger');
  }));

  it('leaves a pre-slot save in place when the device is too full to move it', () => {
    const legacyKey = 'bf.match.snapshot.v2';
    const legacy = encodeSnapshot(scenarioSave('wallace-01-ledger', 100));
    // room for the record where it is, but not for a second copy in a slot
    withStore(legacyKey.length + legacy.length)(() => {
      appStorage.set(legacyKey, legacy);
      expect(mostRecentSave()).toBeNull(); // no room to copy it into a slot
      // the original is still there for a later boot to migrate
      expect(appStorage.get(legacyKey)).toBe(legacy);
    });
  });

  it('keeps an undecodable pre-slot record resumable for the recovery screen', () => fresh(() => {
    setStorageBackend(makeMemoryStorage());
    resetSaveIndexCache();
    appStorage.set('bf.match.snapshot.v2', '{"version":1,"mode":"scenario"}');

    const entry = mostRecentSave();
    expect(entry).not.toBeNull();
    expect(hasSnapshot(entry!.slot)).toBe(true);
    expect(loadSnapshot(entry!.slot)).toBeNull();
    expect(savedMatchLabel(entry!.slot))
      .toBe('Saved match from an earlier or incompatible version');
  }));

  it('reports whether the snapshot reached storage, so the pause line cannot lie', () => {
    fresh(() => {
      expect(saveSnapshot(scenarioSave('wallace-01-ledger', 100))).toBe(true);
    });
    // a device with no room left and no other save to evict keeps nothing
    withStore(0)(() => {
      expect(saveSnapshot(scenarioSave('wallace-01-ledger', 100))).toBe(false);
      expect(hasSnapshot(campaignSlot('wallace'))).toBe(false);
    });
  });

  it('evicts the oldest other save rather than dropping the one being written', () => {
    // room for roughly two campaign saves
    const one = encodeSnapshot(scenarioSave('wallace-01-ledger', 100)).length;
    withStore(one * 3)(() => {
      saveSnapshot(scenarioSave('wallace-01-ledger', 100));
      saveSnapshot(scenarioSave('joan-02-orleans', 200));
      saveSnapshot(scenarioSave('genghis-01-empty-camp', 300));

      // the newest save always survives
      expect(loadSnapshot(campaignSlot('genghis'))?.tick).toBe(300);
      expect(hasSnapshot(campaignSlot('wallace'))).toBe(false); // oldest went first
      const slots = listSaves().map((e) => e.slot);
      expect(slots).not.toContain(campaignSlot('wallace'));
      expect(slots).toContain(campaignSlot('genghis'));
    });
  });
});
