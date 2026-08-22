// Perf smoke for the per-frame renderer, mirroring packages/sim/src/perf.test.ts:
// a real practice map at mid-game visibility, driven through the real WorldLayer.
//
// The bug this guards is not a constant cost but a slope. Frame time used to grow
// linearly with the size of the player's army — every occluder on the map was
// tested against every visible unit — so a player was fine with a scouting party
// and stuttering by the time they had ~20 soldiers. The scaling assertion below is
// the real gate; the absolute budget is a coarse backstop.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim/game';
import { practiceConfig, player } from '@bf/sim/testutil';
import type { EntityId, GameState } from '@bf/sim/types';
import { WorldLayer } from './world';
import { fakeAssets } from './renderTestutil';

interface Harness {
  world: WorldLayer;
  state: GameState;
  view: { x0: number; y0: number; x1: number; y1: number };
}

/** A practice map walked end to end, holding `army` soldiers for the human player. */
function harness(army: number): Harness {
  const game = createGame(practiceConfig(
    7,
    [player({ isHuman: true, color: 1 }), player({ civ: 'english', color: 2 })],
    120,
    200,
  ));
  const state = game.state;
  const ids: EntityId[] = game.ops!.spawn(
    Array.from({ length: army }, (_, i) => ({
      defId: 'militia' as const,
      player: 1,
      tileX: 40 + (i % 10),
      tileY: 40 + ((i / 10) | 0),
    })),
  );
  // Mid-game: the map has been explored and the army's surroundings are in sight.
  state.players[1].visibility.fill(2);
  for (let t = 0; t < 20; t++) game.advance([]);

  const world = new WorldLayer(fakeAssets, 1);
  world.onTick(state);
  world.onTick(state);
  for (const id of ids) world.selection.add(id);

  // A phone-shaped viewport centred on the army.
  const centre = world.entityWorldPos(state.entities.get(ids[0])!, 0.5);
  const view = {
    x0: centre.x - 420, y0: centre.y - 740, x1: centre.x + 420, y1: centre.y + 740,
  };
  world.update(state, 0.5, state.tick + 0.5, view);
  return { world, state, view };
}

/**
 * Median-of-three CPU ms per frame. CPU time rather than wall time keeps sibling
 * vitest workers out of the measurement, and the median rejects a single GC spike
 * (the same treatment the sim's perf smoke needs to stay unflaky).
 */
function frameCpuMs(h: Harness, frames = 200, culled = true): number {
  const view = culled ? h.view : undefined;
  const samples: number[] = [];
  for (let sample = 0; sample < 3; sample++) {
    for (let i = 0; i < 30; i++) h.world.update(h.state, 0.5, h.state.tick + 0.5, view);
    const cpu0 = process.cpuUsage();
    for (let i = 0; i < frames; i++) {
      h.world.update(h.state, 0.5, h.state.tick + 0.5, view);
    }
    const cpu = process.cpuUsage(cpu0);
    samples.push((cpu.user + cpu.system) / 1000 / frames);
  }
  samples.sort((a, b) => a - b);
  return samples[1];
}

describe('renderer performance smoke', () => {
  it('does not get more expensive per frame as the army grows', () => {
    // Measured with culling OFF, so every occluder on the map is live. Culling
    // alone would hide the slope by shrinking the occluder set to a screenful,
    // and the point here is to pin the broad phase itself.
    const scout = frameCpuMs(harness(4), 120, false);
    const army = frameCpuMs(harness(96), 120, false);
    const ratio = army / Math.max(scout, 0.001);
    // eslint-disable-next-line no-console
    console.log(
      `render perf: 4 units ${scout.toFixed(3)}ms/frame, 96 units ${army.toFixed(3)}ms/frame `
      + `(${ratio.toFixed(2)}x)`,
    );
    // A 24x larger army must not cost appreciably more per frame. The extra
    // soldiers do get their own sprite updates, so this is not 1.0 — it measures
    // ~1.2x. The exhaustive scan this replaced measured ~2.6x on the same
    // comparison (8.4ms -> 21.4ms per frame), and kept climbing with army size.
    expect(ratio).toBeLessThanOrEqual(2);
  });

  it('holds a per-frame budget on a walked 120x120 map with an army in view', () => {
    const h = harness(48);
    const ms = frameCpuMs(h);
    // eslint-disable-next-line no-console
    console.log(`render perf: ${h.state.entities.size} entities, ${ms.toFixed(3)}ms CPU/frame`);
    // Unloaded this measures well under 2ms, leaving a 60fps frame almost entirely
    // to the sim and to Pixi's own draw. The pre-optimization renderer measured
    // ~13ms on the same map, so this budget catches that regression class with
    // room to spare on slower CI hardware.
    expect(ms).toBeLessThanOrEqual(6);
  });
});
