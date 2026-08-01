// Tech engine: shared production/research queue (research blocks training), blacksmith
// tiers changing live combat damage, upgradeUnit transforming LIVING units (hp%
// preserved) and retiring the old trainable, the full dark→imperial age-up chain with
// the 2-buildings-of-current-age rule, civ tech-tree cuts and unique-tech ownership.

import { describe, expect, it } from 'vitest';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { completeResearch } from './research';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

interface Timed { tick: number; ev: SimEvent }

function run(game: Game, ticks: number, out?: Timed[]): void {
  for (let t = 0; t < ticks; t++) {
    const tick = game.state.tick;
    for (const ev of game.advance([])) out?.push({ tick, ev });
  }
}

const rich = { food: 10000, wood: 5000, gold: 5000, stone: 2000 };

describe('shared production queue (AoE2: research occupies the building queue)', () => {
  it('TC: villager trains, THEN loom researches, THEN the next villager', () => {
    const game = createGame(scenarioConfig(201, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
    ], [player({ startingResources: rich })]));
    const tc = game.state.refs.get('tc')!;
    game.advance([
      { kind: 'train', player: P1, buildingId: tc, defId: 'villager' },
      { kind: 'research', player: P1, buildingId: tc, techId: 'loom' },
      { kind: 'train', player: P1, buildingId: tc, defId: 'villager' },
    ]);
    const evs: Timed[] = [];
    run(game, 1700, evs); // 25 s + 25 s + 25 s = 1500 ticks + slack

    const trained = evs.filter((e) => e.ev.kind === 'unitTrained');
    const research = evs.filter((e) => e.ev.kind === 'researchComplete');
    expect(trained).toHaveLength(2);
    expect(research).toHaveLength(1);
    expect((research[0].ev as Extract<SimEvent, { kind: 'researchComplete' }>).techId).toBe('loom');
    // strict queue order: villager < loom < villager
    expect(trained[0].tick).toBeLessThan(research[0].tick);
    expect(research[0].tick).toBeLessThan(trained[1].tick);
    // loom applied: villagers now 40 HP (25 + 15), including the FIRST (living) one
    for (const v of entitiesOf(game.state.entities, P1, 'villager')) {
      expect(v.maxHp).toBe(40);
      expect(v.hp).toBe(40);
    }
  });

  it('cancelResearch refunds the full cost and unblocks the queue', () => {
    const game = createGame(scenarioConfig(202, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
    ], [player({ startingResources: { food: 100, wood: 0, gold: 50, stone: 0 } })]));
    const tc = game.state.refs.get('tc')!;
    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'loom' }]);
    expect(game.state.players[P1].stockpile.gold).toBe(0);
    run(game, 10);
    game.advance([{ kind: 'cancelResearch', player: P1, buildingId: tc }]);
    expect(game.state.players[P1].stockpile.gold).toBe(50); // full refund
    expect(game.state.entities.get(tc)!.research).toBeUndefined();
    expect(game.state.entities.get(tc)!.trainQueue).toHaveLength(0);
  });
});

describe('blacksmith tiers change live damage', () => {
  it('forging: militia hits for 5 instead of 4', () => {
    const game = createGame(scenarioConfig(203, grassMap(30, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'a' },
      { defId: 'militia', player: P2, tileX: 13, tileY: 10, ref: 'b' },
    ], [player(), player({ civ: 'english' })]));
    const a = game.state.refs.get('a')!;
    completeResearch(game.state as unknown as SimState, P1, 'forging', []);
    const evs: Timed[] = [];
    run(game, 300, evs);
    const hits = evs.filter((e) => e.ev.kind === 'attackImpact') as Array<{ ev: Extract<SimEvent, { kind: 'attackImpact' }> }>;
    expect(hits.length).toBeGreaterThan(2);
    for (const h of hits) {
      expect(h.ev.damage).toBe(h.ev.attackerId === a ? 5 : 4); // +1 melee attack
    }
  });
});

describe('upgradeUnit transforms living units', () => {
  it('man-at-arms upgrade converts standing militia, preserving hp%', () => {
    const game = createGame(scenarioConfig(204, grassMap(30, 30), [
      { defId: 'barracks', player: P1, tileX: 5, tileY: 5, ref: 'rax' },
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'full' },
      { defId: 'militia', player: P1, tileX: 11, tileY: 10, ref: 'hurt', hp: 20 },
    ], [player({ startingResources: rich, startingAge: 'feudal' })]));
    const state = game.state as unknown as SimState;
    completeResearch(state, P1, 'manAtArmsUpgrade', []);

    const full = game.state.entities.get(game.state.refs.get('full')!)!;
    const hurt = game.state.entities.get(game.state.refs.get('hurt')!)!;
    expect(full.defId).toBe('manAtArms');
    expect(full.maxHp).toBe(45);
    expect(full.hp).toBe(45); // was 40/40 → 45/45
    expect(hurt.defId).toBe('manAtArms');
    expect(hurt.hp).toBe(23); // 20/40 → round(0.5 × 45)

    // the old tier is retired: training militia is rejected after the upgrade
    const rax = game.state.refs.get('rax')!;
    game.advance([{ kind: 'train', player: P1, buildingId: rax, defId: 'militia' }]);
    expect(game.state.entities.get(rax)!.trainQueue).toHaveLength(0);
    game.advance([{ kind: 'train', player: P1, buildingId: rax, defId: 'manAtArms' }]);
    expect(game.state.entities.get(rax)!.trainQueue).toHaveLength(1);
  });

  it('guard tower upgrade transforms a standing watch tower (building upgrade)', () => {
    const game = createGame(scenarioConfig(205, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10, ref: 'tower' },
    ], [player({ startingResources: rich, startingAge: 'castle' })]));
    completeResearch(game.state as unknown as SimState, P1, 'guardTowerUpgrade', []);
    const tower = game.state.entities.get(game.state.refs.get('tower')!)!;
    expect(tower.defId).toBe('guardTower');
    expect(tower.maxHp).toBe(1500);
    expect(tower.hp).toBe(1500); // was full → still full
  });
});

describe('age-up chain (dark → imperial with building requirements)', () => {
  it('rejects feudal age below 2 distinct dark building types (lone TC = 1 of 2)', () => {
    const game = createGame(scenarioConfig(206, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
      { defId: 'house', player: P1, tileX: 10, tileY: 5 }, // houses never qualify (GDD)
    ], [player({ startingResources: rich })]));
    const tc = game.state.refs.get('tc')!;
    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'feudalAge' }]);
    expect(game.state.entities.get(tc)!.trainQueue).toHaveLength(0);
    expect(game.state.players[P1].stockpile.food).toBe(rich.food); // nothing paid

    // duplicate types count once (matches the HUD's ageUpRequirement model)
    const dupes = createGame(scenarioConfig(212, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
      { defId: 'townCenter', player: P1, tileX: 15, tileY: 5 },
    ], [player({ startingResources: rich })]));
    const tc2 = dupes.state.refs.get('tc')!;
    dupes.advance([{ kind: 'research', player: P1, buildingId: tc2, techId: 'feudalAge' }]);
    expect(dupes.state.entities.get(tc2)!.trainQueue).toHaveLength(0);
  });

  it('runs the full chain: feudal (mill+barracks), castle (blacksmith+market), imperial (castle alone)', () => {
    const game = createGame(scenarioConfig(207, grassMap(40, 40), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
      { defId: 'mill', player: P1, tileX: 10, tileY: 5 },
      { defId: 'barracks', player: P1, tileX: 13, tileY: 5 },
      { defId: 'blacksmith', player: P1, tileX: 10, tileY: 9 },
      { defId: 'market', player: P1, tileX: 14, tileY: 9 },
      { defId: 'castle', player: P1, tileX: 10, tileY: 14 },
    ], [player({ startingResources: rich })]));
    const tc = game.state.refs.get('tc')!;
    const evs: Timed[] = [];

    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'feudalAge' }]);
    run(game, 130 * 20 + 30, evs);
    expect(game.state.players[P1].age).toBe('feudal');

    // castle age needs 2 FEUDAL buildings — blacksmith + market qualify
    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'castleAge' }]);
    run(game, 160 * 20 + 30, evs);
    expect(game.state.players[P1].age).toBe('castle');

    // imperial: the Castle alone satisfies the requirement (satisfiesAgeUpAlone)
    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'imperialAge' }]);
    run(game, 190 * 20 + 30, evs);
    expect(game.state.players[P1].age).toBe('imperial');

    const ages = evs.filter((e) => e.ev.kind === 'ageAdvanced')
      .map((e) => (e.ev as Extract<SimEvent, { kind: 'ageAdvanced' }>).age);
    expect(ages).toEqual(['feudal', 'castle', 'imperial']);
  });

  it('cannot skip: castle age is rejected while still in the dark age', () => {
    const game = createGame(scenarioConfig(208, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5, ref: 'tc' },
      { defId: 'mill', player: P1, tileX: 10, tileY: 5 },
      { defId: 'barracks', player: P1, tileX: 13, tileY: 5 },
    ], [player({ startingResources: rich })]));
    const tc = game.state.refs.get('tc')!;
    game.advance([{ kind: 'research', player: P1, buildingId: tc, techId: 'castleAge' }]);
    expect(game.state.entities.get(tc)!.trainQueue).toHaveLength(0);
  });
});

describe('civ gating', () => {
  it('civ tech-tree cuts: scots cannot research Block Printing; english can', () => {
    const build = (civ: string): Game => createGame(scenarioConfig(209, grassMap(30, 30), [
      { defId: 'monastery', player: P1, tileX: 5, tileY: 5, ref: 'mon' },
    ], [player({ civ, startingResources: rich, startingAge: 'castle' })]));
    const scots = build('scots');
    scots.advance([{ kind: 'research', player: P1, buildingId: scots.state.refs.get('mon')!, techId: 'blockPrinting' }]);
    expect(scots.state.entities.get(scots.state.refs.get('mon')!)!.trainQueue ?? []).toHaveLength(0);

    const english = build('english');
    english.advance([{ kind: 'research', player: P1, buildingId: english.state.refs.get('mon')!, techId: 'blockPrinting' }]);
    expect(english.state.entities.get(english.state.refs.get('mon')!)!.trainQueue).toHaveLength(1);
  });

  it('unique techs belong to their civ: english cannot research Schiltron', () => {
    const game = createGame(scenarioConfig(210, grassMap(30, 30), [
      { defId: 'castle', player: P1, tileX: 5, tileY: 5, ref: 'castle' },
    ], [player({ civ: 'english', startingResources: rich, startingAge: 'castle' })]));
    const castle = game.state.refs.get('castle')!;
    game.advance([{ kind: 'research', player: P1, buildingId: castle, techId: 'schiltron' }]);
    expect(game.state.entities.get(castle)!.trainQueue).toHaveLength(0);
    // ...but their own Yeoman Levy is fine
    game.advance([{ kind: 'research', player: P1, buildingId: castle, techId: 'yeomanLevy' }]);
    expect(game.state.entities.get(castle)!.trainQueue).toHaveLength(1);
  });

  it('ballistics flips the per-player projectile-leading flag', () => {
    const game = createGame(scenarioConfig(211, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 5, tileY: 5 },
    ], [player({ startingResources: rich, startingAge: 'castle' })]));
    const state = game.state as unknown as SimState;
    expect(state.ballistics[P1]).toBe(false);
    completeResearch(state, P1, 'ballistics', []);
    expect(state.ballistics[P1]).toBe(true);
  });
});
