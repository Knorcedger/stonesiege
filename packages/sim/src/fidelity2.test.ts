// Fidelity-critic round 2 — sharpest untested invariants vs docs/AOE2_REFERENCE.md:
// statMult stacking must reproduce §1's exact Wheelbarrow/Hand Cart chain (0.8 →
// 0.88 → 0.968 speed, 10 → 13 → 19 carry), building-targeted tech effects must land
// on exactly the right defs (§5/§6: Fletching +1 atk/+1 range on towers AND the TC by
// id; Murder Holes deletes tower/castle min range but never touches the TC), and the
// sim-side civ gates must block a rival's unique unit at the shared Castle trains list
// while costMult prices the own-civ roster (§10 analogs).

import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import type { SimState } from './internal';
import { completeResearch } from './research';
import { resolveBuildingStats, resolveUnitStats } from './stats';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;

const rich = { food: 10000, wood: 5000, gold: 5000, stone: 2000 };

describe('statMult stacking (AOE2_REFERENCE §1: Wheelbarrow then Hand Cart)', () => {
  it('villager speed 0.8 → 0.88 → 0.968 and carry 10 → 13 → 19 (hunt 35 → 44 → 66)', () => {
    const game = createGame(scenarioConfig(601, grassMap(20, 20), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5 },
    ], [player({ startingResources: rich })]));
    const state = game.state as unknown as SimState;

    const base = resolveUnitStats(state, P1, 'villager');
    expect(base.speed).toBeCloseTo(0.8, 6);
    expect(base.carry.wood).toBe(10);
    expect(base.carry.hunt).toBe(35);

    completeResearch(state, P1, 'wheelbarrow', []);
    const wb = resolveUnitStats(state, P1, 'villager');
    expect(wb.speed).toBeCloseTo(0.88, 6); // +10%
    expect(wb.carry.wood).toBe(13); // 10 × 1.25 = 12.5 → 13 (§1 table)
    expect(wb.carry.hunt).toBe(44); // 35 × 1.25 = 43.75 → 44

    completeResearch(state, P1, 'handCart', []);
    const hc = resolveUnitStats(state, P1, 'villager');
    // multiplicative chain, NOT additive: 0.8 × 1.1 × 1.1 = 0.968 (additive would be 0.96)
    expect(hc.speed).toBeCloseTo(0.968, 6);
    expect(hc.carry.wood).toBe(19); // 10 × 1.25 × 1.5 = 18.75 → 19 (§1 table)
    expect(hc.carry.hunt).toBe(66); // 35 × 1.25 × 1.5 = 65.625 → 66
  });
});

describe('building-targeted tech effects (AOE2_REFERENCE §5/§6)', () => {
  it('Fletching reaches towers/castle/TC; Murder Holes zeroes min range except the TC', () => {
    const game = createGame(scenarioConfig(602, grassMap(20, 20), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5 },
    ], [player({ startingResources: rich, startingAge: 'castle' })]));
    const state = game.state as unknown as SimState;

    completeResearch(state, P1, 'fletching', []);
    completeResearch(state, P1, 'murderHoles', []);

    const tower = resolveBuildingStats(state, P1, 'watchTower');
    expect(tower.attacks[0]).toEqual({ cls: 'pierce', amount: 6 }); // 5 + 1 (Fletching)
    expect(tower.range).toBe(9); // 8 + 1
    expect(tower.minRange).toBe(0); // 1 − 1 (Murder Holes)

    const castle = resolveBuildingStats(state, P1, 'castle');
    expect(castle.attacks[0]).toEqual({ cls: 'pierce', amount: 12 }); // 11 + 1
    expect(castle.minRange).toBe(0); // 1 − 1

    // the TC is targeted BY ID for Fletching but is not wallOrTower/castle class:
    // Murder Holes must not drive its min range negative or touch it at all
    const tc = resolveBuildingStats(state, P1, 'townCenter');
    expect(tc.attacks[0]).toEqual({ cls: 'pierce', amount: 6 }); // 5 + 1 (Fletching by id)
    expect(tc.range).toBe(7); // 6 + 1
    expect(tc.minRange).toBe(0); // was already 0 — unchanged
  });
});

describe('civ gates at the shared Castle trains list (§10 analogs)', () => {
  it("scots cannot train the rival's Longbowman; their own Raider trains, siege is 15% cheaper", () => {
    const game = createGame(scenarioConfig(603, grassMap(30, 30), [
      { defId: 'castle', player: P1, tileX: 5, tileY: 5, ref: 'castle' },
    ], [player({ civ: 'scots', startingResources: rich, startingAge: 'castle' })]));
    const state = game.state as unknown as SimState;
    const castle = game.state.refs.get('castle')!;
    const goldBefore = game.state.players[P1].stockpile.gold;

    // rival unique unit: the castle def lists both civs' uniques; the sim must reject
    game.advance([{ kind: 'train', player: P1, buildingId: castle, defId: 'longbowman' }]);
    expect(game.state.entities.get(castle)!.trainQueue).toHaveLength(0);
    expect(game.state.players[P1].stockpile.gold).toBe(goldBefore); // nothing paid

    // own unique unit queues fine
    game.advance([{ kind: 'train', player: P1, buildingId: castle, defId: 'highlandRaider' }]);
    expect(game.state.entities.get(castle)!.trainQueue).toHaveLength(1);

    // costMult: scots siege −15% — ram 160W 75G → 136W 64G (63.75 rounds to 64)
    const ram = resolveUnitStats(state, P1, 'batteringRam');
    expect(ram.cost.wood).toBe(136);
    expect(ram.cost.gold).toBe(64);
    // non-siege unaffected
    expect(resolveUnitStats(state, P1, 'knight').cost.gold).toBe(75);
  });
});
