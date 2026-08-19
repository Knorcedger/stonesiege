// Gathering: reference-rate extraction (docs/AOE2_REFERENCE.md §1), the full
// gather→carry→drop-off→return loop, drop-off eligibility/choice, depletion (tree
// stump unblocks its tile; auto-continue retargeting), and AoE2 slot etiquette
// (one gatherer per tree, several per mine).

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import type { SimState } from './internal';
import { createGame, createGameFromSnapshot } from './game';
import { grassMap, player, scenarioConfig } from './testutil';

const HUMAN = 1;

function advanceUntil(game: Game, maxTicks: number, done: (events: SimEvent[]) => boolean): number {
  for (let t = 1; t <= maxTicks; t++) {
    const events = game.advance([]);
    if (done(events)) return t;
  }
  return -1;
}

/** Ticks until the villager's carry hits `capacity` (starts adjacent — pure gather rate). */
function ticksToFill(nodeDef: string, civ: string, capacity: number, maxTicks: number): number {
  const game = createGame(scenarioConfig(5, grassMap(30, 30), [
    { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
    { defId: nodeDef, player: 0, tileX: 10, tileY: 10, ref: 'node' },
  ], [player({ civ })]));
  const vid = game.state.refs.get('v')!;
  game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('node')! }]);
  for (let t = 2; t <= maxTicks; t++) {
    game.advance([]);
    const v = game.state.entities.get(vid)!;
    if ((v.carrying?.amount ?? 0) >= capacity) return t;
  }
  return -1;
}

describe('gather rates match AOE2_REFERENCE within rounding (time to fill a 10 carry)', () => {
  // fill tick = ceil(carry * 20000 / round(rate*1000)); gathering starts on tick 1
  it('berries at 0.31/s: 10 food in ~646 ticks', () => {
    const t = ticksToFill('berryBush', 'scots', 10, 700);
    expect(t).toBeGreaterThanOrEqual(644);
    expect(t).toBeLessThanOrEqual(650);
  });

  it('wood at 0.39/s: 10 wood in ~513 ticks (english — no lumber civ bonus)', () => {
    const t = ticksToFill('tree', 'english', 10, 600);
    expect(t).toBeGreaterThanOrEqual(511);
    expect(t).toBeLessThanOrEqual(517);
  });

  it('scots lumberjacks are 15% faster (stats layer applies the civ bonus)', () => {
    const t = ticksToFill('tree', 'scots', 10, 600); // 0.39*1.15 -> 449/s scaled -> ~446 ticks
    expect(t).toBeGreaterThanOrEqual(443);
    expect(t).toBeLessThanOrEqual(450);
  });

  it('gold at 0.38/s: 10 gold in ~527 ticks', () => {
    const t = ticksToFill('goldMine', 'scots', 10, 600);
    expect(t).toBeGreaterThanOrEqual(525);
    expect(t).toBeLessThanOrEqual(531);
  });

  it('stone at 0.36/s: 10 stone in ~556 ticks', () => {
    const t = ticksToFill('stoneMine', 'scots', 10, 620);
    expect(t).toBeGreaterThanOrEqual(554);
    expect(t).toBeLessThanOrEqual(560);
  });
});

describe('gather loop: carry to drop-off, deposit, return', () => {
  it('deposits 10 food at the TC and keeps cycling (resourceDropped + stockpile)', () => {
    const game = createGame(scenarioConfig(6, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
      { defId: 'townCenter', player: HUMAN, tileX: 12, tileY: 8 },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('bush')! }]);

    const drops: Array<Extract<SimEvent, { kind: 'resourceDropped' }>> = [];
    for (let t = 0; t < 1600; t++) {
      for (const ev of game.advance([])) {
        if (ev.kind === 'resourceDropped') drops.push(ev);
      }
    }
    expect(drops.length).toBeGreaterThanOrEqual(2);
    expect(drops[0]).toEqual({ kind: 'resourceDropped', player: HUMAN, type: 'food', amount: 10 });
    expect(game.state.players[HUMAN].stockpile.food).toBe(200 + drops.length * 10);

    // conservation: extracted == deposited + still carried
    const bush = game.state.entities.get(game.state.refs.get('bush')!)!;
    const v = game.state.entities.get(vid)!;
    expect(125 - bush.amountLeft!).toBe(drops.length * 10 + (v.carrying?.amount ?? 0));
  });

  it('chooses the nearest ELIGIBLE drop-off: mining camp for gold, never the closer mill', () => {
    const build = (campDef: string): Game => createGame(scenarioConfig(7, grassMap(40, 40), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'goldMine', player: 0, tileX: 10, tileY: 10, ref: 'mine' },
      { defId: campDef, player: HUMAN, tileX: 12, tileY: 9 },
      { defId: 'townCenter', player: HUMAN, tileX: 25, tileY: 25 },
    ], [player()]));

    const near = build('miningCamp');
    near.advance([{ kind: 'gather', player: HUMAN, units: [near.state.refs.get('v')!], targetId: near.state.refs.get('mine')! }]);
    const nearTick = advanceUntil(near, 900, (evs) => evs.some((e) => e.kind === 'resourceDropped'));
    expect(nearTick).toBeGreaterThan(500); // ~527 gather ticks + a short walk
    expect(nearTick).toBeLessThan(650); // banked at the adjacent camp, not the far TC
    expect(near.state.players[HUMAN].stockpile.gold).toBe(110);

    // a mill next door cannot take gold: the villager must trek to the TC
    const far = build('mill');
    far.advance([{ kind: 'gather', player: HUMAN, units: [far.state.refs.get('v')!], targetId: far.state.refs.get('mine')! }]);
    const farTick = advanceUntil(far, 1600, (evs) => evs.some((e) => e.kind === 'resourceDropped'));
    expect(farTick).toBeGreaterThan(800);
    expect(far.state.players[HUMAN].stockpile.gold).toBe(110);
    expect(far.state.players[HUMAN].stockpile.food).toBe(200); // nothing wrongly banked as food
  });

  it('takes carried stone across completed farms to the nearest Town Center edge', () => {
    const game = createGame(scenarioConfig(71, grassMap(40, 30), [
      { defId: 'villager', player: HUMAN, tileX: 7, tileY: 11, ref: 'v' },
      { defId: 'stoneMine', player: 0, tileX: 8, tileY: 11, ref: 'mine' },
      { defId: 'farm', player: HUMAN, tileX: 12, tileY: 10 },
      { defId: 'townCenter', player: HUMAN, tileX: 16, tileY: 9 },
    ], [player()]));
    const vid = game.state.refs.get('v')!;
    game.advance([{
      kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('mine')!,
    }]);

    let crossedFarmWithStone = false;
    let deposited = false;
    for (let t = 0; t < 900 && !deposited; t++) {
      const events = game.advance([]);
      const v = game.state.entities.get(vid)!;
      if (v.activity === 'carrying' && v.carrying?.type === 'stone'
        && v.tileX >= 12 && v.tileX <= 14 && v.tileY >= 10 && v.tileY <= 12) {
        crossedFarmWithStone = true;
      }
      deposited = events.some((e) => e.kind === 'resourceDropped' && e.type === 'stone');
    }
    expect(crossedFarmWithStone).toBe(true);
    expect(deposited).toBe(true);
    expect(game.state.players[HUMAN].stockpile.stone).toBe(210);
  });

  it('retargets an unreachable nearby drop-off and resumes deterministically', () => {
    // The completed mill is geometrically nearest, but every interaction tile around
    // its 2x2 footprint is sealed. The farther Town Center remains reachable.
    const walls = [];
    for (let y = 8; y <= 11; y++) {
      for (let x = 11; x <= 14; x++) {
        if (x >= 12 && x <= 13 && y >= 9 && y <= 10) continue;
        walls.push({ defId: 'stoneWall', player: HUMAN, tileX: x, tileY: y });
      }
    }
    const original = createGame(scenarioConfig(72, grassMap(40, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'berryBush', player: 0, tileX: 10, tileY: 10, ref: 'bush' },
      { defId: 'mill', player: HUMAN, tileX: 12, tileY: 9, ref: 'sealedMill' },
      ...walls,
      { defId: 'townCenter', player: HUMAN, tileX: 24, tileY: 8, ref: 'townCenter' },
    ], [player()]));
    const villagerId = original.state.refs.get('v')!;
    const millId = original.state.refs.get('sealedMill')!;
    const townCenterId = original.state.refs.get('townCenter')!;
    original.advance([{
      kind: 'gather', player: HUMAN, units: [villagerId],
      targetId: original.state.refs.get('bush')!,
    }]);

    let retargeted = false;
    for (let tick = 0; tick < 900; tick++) {
      original.advance([]);
      const info = (original.state as SimState).gather.get(villagerId);
      if (info?.failedDropoffIds?.includes(millId)) {
        expect(info.dropoffId).toBe(townCenterId);
        retargeted = true;
        break;
      }
    }
    expect(retargeted, 'worker rejected the sealed mill instead of abandoning its load').toBe(true);

    // Persist the failed candidate while the alternate route is in flight. Without
    // this state, a resumed worker could select the sealed mill and repeat forever.
    const resumed = createGameFromSnapshot(original.serialize());
    expect((resumed.state as SimState).gather.get(villagerId)?.failedDropoffIds).toEqual([millId]);
    expect(resumed.hash()).toBe(original.hash());

    let deposited = false;
    for (let tick = 0; tick < 1_200; tick++) {
      const originalEvents = original.advance([]);
      const resumedEvents = resumed.advance([]);
      expect(resumedEvents).toEqual(originalEvents);
      if (tick % 50 === 0) expect(resumed.hash()).toBe(original.hash());
      if (originalEvents.some((event) => event.kind === 'resourceDropped' && event.type === 'food')) {
        deposited = true;
        break;
      }
    }
    expect(deposited, 'worker banked the load at the reachable Town Center').toBe(true);
    expect(original.state.players[HUMAN].stockpile.food).toBe(210);
    expect(resumed.state.players[HUMAN].stockpile.food).toBe(210);
    expect(JSON.stringify(resumed.serialize())).toBe(JSON.stringify(original.serialize()));
  });
});

describe('depletion: stump + tile unblock + auto-continue', () => {
  it('a chopped-out tree leaves a stump, unblocks the tile, and the villager retargets nearby', () => {
    const game = createGame(scenarioConfig(8, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 't1', amountLeft: 4 },
      { defId: 'tree', player: 0, tileX: 13, tileY: 10, ref: 't2' },
    ], [player({ civ: 'english' })]));
    const vid = game.state.refs.get('v')!;
    const t1 = game.state.refs.get('t1')!;
    const t2 = game.state.refs.get('t2')!;
    expect(game.isWalkable(10, 10)).toBe(false); // trees block

    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: t1 }]);
    const depletedAt = advanceUntil(game, 400, (evs) =>
      evs.some((e) => e.kind === 'resourceDepleted' && e.id === t1 && e.resourceType === 'wood'));
    expect(depletedAt).toBeGreaterThan(0);
    expect(depletedAt).toBeLessThanOrEqual(250); // 4 wood at 0.39/s ≈ 206 ticks

    const stump = game.state.entities.get(t1)!;
    expect(stump.stump).toBe(true);
    expect(stump.amountLeft).toBe(0);
    expect(game.isWalkable(10, 10)).toBe(true); // stump no longer blocks

    // auto-continue: same-task tree within the retarget radius
    for (let t = 0; t < 150; t++) game.advance([]);
    const v = game.state.entities.get(vid)!;
    expect(v.intent).toEqual({ kind: 'gather', targetId: t2 });
    expect(v.activity).toBe('gathering');
  });

  it('continues into a tree elsewhere in the same local forest', () => {
    const game = createGame(scenarioConfig(14, grassMap(36, 36), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 't1', amountLeft: 1 },
      { defId: 'tree', player: 0, tileX: 22, tileY: 10, ref: 't2' },
    ], [player({ civ: 'english' })]));
    const vid = game.state.refs.get('v')!;
    const t2 = game.state.refs.get('t2')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('t1')! }]);

    for (let t = 0; t < 500; t++) game.advance([]);
    expect(game.state.entities.get(vid)!.intent).toEqual({ kind: 'gather', targetId: t2 });
  });

  it('with nothing to retarget the villager banks the partial load and goes idle', () => {
    const game = createGame(scenarioConfig(9, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 't1', amountLeft: 3 },
      { defId: 'townCenter', player: HUMAN, tileX: 12, tileY: 8 },
    ], [player({ civ: 'english' })]));
    const vid = game.state.refs.get('v')!;
    game.advance([{ kind: 'gather', player: HUMAN, units: [vid], targetId: game.state.refs.get('t1')! }]);
    for (let t = 0; t < 400; t++) game.advance([]);
    const v = game.state.entities.get(vid)!;
    expect(game.state.players[HUMAN].stockpile.wood).toBe(203); // 200 + the 3-wood final load
    expect(v.intent).toBeUndefined();
    expect(v.activity).toBe('idle');
    expect(v.carrying).toBeUndefined();
  });
});

describe('AoE2 slot etiquette', () => {
  it('max one gatherer per tree: extras queue politely and extraction stays single-rate', () => {
    const game = createGame(scenarioConfig(10, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 9, ref: 'v0' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v1' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 11, ref: 'v2' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 'tree' },
    ], [player({ civ: 'english' })]));
    const units = ['v0', 'v1', 'v2'].map((r) => game.state.refs.get(r)!);
    const tree = game.state.refs.get('tree')!;
    game.advance([{ kind: 'gather', player: HUMAN, units, targetId: tree }]);
    for (let t = 0; t < 300; t++) game.advance([]);

    const gathering = units.filter((id) => game.state.entities.get(id)!.activity === 'gathering');
    expect(gathering).toHaveLength(1);
    // three unrestricted gatherers would have taken ~15 by now; one slot ≈ 5
    const extracted = 100 - game.state.entities.get(tree)!.amountLeft!;
    expect(extracted).toBeLessThanOrEqual(7);
    expect(extracted).toBeGreaterThanOrEqual(4);
  });

  it('extras on an occupied tree bump to nearby free trees (lumberjack spread)', () => {
    const game = createGame(scenarioConfig(13, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 9, ref: 'v0' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v1' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 11, ref: 'v2' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 't0' },
      { defId: 'tree', player: 0, tileX: 12, tileY: 10, ref: 't1' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 13, ref: 't2' },
    ], [player({ civ: 'english' })]));
    const units = ['v0', 'v1', 'v2'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'gather', player: HUMAN, units, targetId: game.state.refs.get('t0')! }]);
    for (let t = 0; t < 300; t++) game.advance([]);

    // instead of two queueing idle at t0, everyone works their own tree
    const targets = new Set(units.map((id) => {
      const intent = game.state.entities.get(id)!.intent;
      return intent?.kind === 'gather' ? intent.targetId : -1;
    }));
    expect(targets.size).toBe(3);
    const gathering = units.filter((id) => game.state.entities.get(id)!.activity === 'gathering');
    expect(gathering).toHaveLength(3);
  });

  it('queues at an occupied live tree instead of abandoning woodcutting after depletion', () => {
    const game = createGame(scenarioConfig(15, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 9, ref: 'v0' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v1' },
      { defId: 'tree', player: 0, tileX: 10, tileY: 10, ref: 't0', amountLeft: 1 },
      { defId: 'tree', player: 0, tileX: 12, tileY: 10, ref: 't1' },
      { defId: 'townCenter', player: HUMAN, tileX: 16, tileY: 7 },
    ], [player({ civ: 'english' })]));
    const units = ['v0', 'v1'].map((r) => game.state.refs.get(r)!);
    const t1 = game.state.refs.get('t1')!;
    game.advance([{ kind: 'gather', player: HUMAN, units, targetId: game.state.refs.get('t0')! }]);
    for (let t = 0; t < 180; t++) game.advance([]);

    for (const id of units) {
      expect(game.state.entities.get(id)!.intent).toEqual({ kind: 'gather', targetId: t1 });
    }
  });

  it('mines support several gatherers at once', () => {
    const game = createGame(scenarioConfig(11, grassMap(30, 30), [
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 9, ref: 'v0' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 10, ref: 'v1' },
      { defId: 'villager', player: HUMAN, tileX: 9, tileY: 11, ref: 'v2' },
      { defId: 'goldMine', player: 0, tileX: 10, tileY: 10, ref: 'mine' },
    ], [player()]));
    const units = ['v0', 'v1', 'v2'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'gather', player: HUMAN, units, targetId: game.state.refs.get('mine')! }]);
    for (let t = 0; t < 120; t++) game.advance([]);
    const gathering = units.filter((id) => game.state.entities.get(id)!.activity === 'gathering');
    expect(gathering).toHaveLength(3);
  });
});
