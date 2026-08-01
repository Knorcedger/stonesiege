// Match snapshot/resume (GDD: backgrounding must never lose a game). The
// contract under test: recording every applied command batch through the
// SimLoop and replaying it into a FRESH engine created from the same config
// reproduces the exact sim state (hash-identical), and the resumed game stays
// in lockstep afterwards. Plus defensive decoding of stored snapshots.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import { fp, type Entity, type GameConfig } from '@bf/sim/types';
import {
  decodeSnapshot, encodeSnapshot, replaySnapshot, SNAPSHOT_VERSION,
  type CommandLog, type MatchSnapshot,
} from './persist';
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

    const snapshot: MatchSnapshot = {
      version: SNAPSHOT_VERSION, config, difficulty: 'standard',
      tick: original.state.tick, log,
    };
    // storage round-trip: what localStorage gives back must decode identically
    const restored = decodeSnapshot(encodeSnapshot(snapshot))!;
    expect(restored).not.toBeNull();

    const resumed = createGame(restored.config);
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
  const valid = (): MatchSnapshot => ({
    version: SNAPSHOT_VERSION, config: makeConfig(), difficulty: 'easy', tick: 12,
    log: [[0, [{ kind: 'resign', player: 2 }]]],
  });

  it('accepts a valid snapshot round-trip', () => {
    expect(decodeSnapshot(encodeSnapshot(valid()))).toEqual(valid());
  });

  it('rejects null, garbage, and non-JSON', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('')).toBeNull();
    expect(decodeSnapshot('{not json')).toBeNull();
    expect(decodeSnapshot('42')).toBeNull();
  });

  it('rejects the wrong version, bad ticks, bad difficulty, and non-practice maps', () => {
    expect(decodeSnapshot(JSON.stringify({ ...valid(), version: 999 }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...valid(), tick: -1 }))).toBeNull();
    expect(decodeSnapshot(JSON.stringify({ ...valid(), difficulty: 'nightmare' }))).toBeNull();
    const scenario = { ...valid(), config: { ...makeConfig(), map: { type: 'scenario' } } };
    expect(decodeSnapshot(JSON.stringify(scenario))).toBeNull();
  });
});
