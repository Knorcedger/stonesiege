// Pop-cap race across MULTIPLE production buildings — the invariant the existing
// housing test (one TC) never exercises: when several buildings' front items compete
// for the last population slot in the same tick, exactly one may reserve it and
// player.pop must never exceed popCap at any tick. Reservation order follows entity
// insertion order (deterministic), and a stalled building resumes as soon as room opens.

import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { TICKS_PER_SECOND } from './types';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

const VILLAGER_TICKS = 25 * TICKS_PER_SECOND;

describe('pop cap race across multiple production buildings', () => {
  it('two TCs racing for the last pop slot never push pop past popCap', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(61, map, [
      { defId: 'townCenter', player: 1, tileX: 3, tileY: 3, ref: 'tcA' },
      { defId: 'townCenter', player: 1, tileX: 20, tileY: 20, ref: 'tcB' },
      { defId: 'villager', player: 1, tileX: 10, tileY: 10 },
      { defId: 'villager', player: 1, tileX: 11, tileY: 10 },
      { defId: 'villager', player: 1, tileX: 12, tileY: 10 },
      { defId: 'villager', player: 1, tileX: 13, tileY: 10 },
    ], [player({ startingResources: { food: 1000, wood: 0, gold: 0, stone: 0 } })], 5));
    const tcA = game.state.entities.get(game.state.refs.get('tcA')!)!;
    const tcB = game.state.entities.get(game.state.refs.get('tcB')!)!;
    const p = game.state.players[1];
    expect(p.pop).toBe(4); // 4 villagers
    expect(p.popCap).toBe(5); // min(2 TCs * 5, config 5)

    // both TCs try to claim the single free slot in the same tick
    game.advance([
      { kind: 'train', player: 1, buildingId: tcA.id, defId: 'villager' },
      { kind: 'train', player: 1, buildingId: tcB.id, defId: 'villager' },
    ]);
    expect(p.stockpile.food).toBe(900); // both queued (cost is paid at queue time)
    expect(tcA.trainQueue![0].started).toBe(true); // insertion order wins the slot
    expect(tcB.trainQueue![0].started).toBeFalsy(); // loser stalls housed, keeps its ticks
    expect(p.pop).toBe(5);

    // run past one full train time: pop must NEVER exceed popCap on any tick
    for (let t = 0; t < VILLAGER_TICKS + 20; t++) {
      game.advance([]);
      expect(p.pop, `tick ${t}: pop exceeded cap`).toBeLessThanOrEqual(p.popCap);
    }
    expect(entitiesOf(game.state.entities, 1, 'villager')).toHaveLength(5); // only tcA delivered
    expect(p.pop).toBe(5);
    expect(tcA.trainQueue).toHaveLength(0);
    expect(tcB.trainQueue).toHaveLength(1); // still housed
    expect(tcB.trainQueue![0].started).toBeFalsy();
    expect(tcB.trainQueue![0].ticksLeft).toBe(tcB.trainQueue![0].totalTicks); // no progress while housed

    // room opens -> the stalled TC reserves the slot and finishes its unit
    const victim = entitiesOf(game.state.entities, 1, 'villager')[0];
    game.advance([{ kind: 'deleteEntity', player: 1, entityId: victim.id }]);
    expect(tcB.trainQueue![0].started).toBe(true);
    expect(p.pop).toBe(5); // 4 alive + 1 reserved
    for (let t = 0; t < VILLAGER_TICKS + 20; t++) {
      game.advance([]);
      expect(p.pop, `tick ${t}: pop exceeded cap after resume`).toBeLessThanOrEqual(p.popCap);
    }
    expect(entitiesOf(game.state.entities, 1, 'villager')).toHaveLength(5);
    expect(p.pop).toBe(5);
    expect(tcB.trainQueue).toHaveLength(0);
  });
});
