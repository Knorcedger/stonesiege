// Combat core: exact AoE2-formula damage on the reference counter matchups
// (docs/AOE2_REFERENCE.md §3), auto-engage + leash + stop, mangonel splash with
// friendly fire (units yes, own buildings never) and auto hold-fire, ram bonus vs
// buildings + garrison speed/damage/eject rules, defensive-building arrows with
// garrison scaling and min/max range, trebuchet pack/unpack, corpse decay, throttled
// underAttack alerts.

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import type { EntityId, Game, SimEvent } from './types';
import { fp, TICKS_PER_SECOND } from './types';
import { createGame } from './game';
import { effDistFp } from './internal';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

interface Timed { tick: number; ev: SimEvent }

function run(game: Game, ticks: number, out?: Timed[]): void {
  for (let t = 0; t < ticks; t++) {
    const tick = game.state.tick;
    for (const ev of game.advance([])) out?.push({ tick, ev });
  }
}

const impacts = (evs: Timed[]): Array<Extract<SimEvent, { kind: 'attackImpact' }> & { tick: number }> =>
  evs.filter((e) => e.ev.kind === 'attackImpact')
    .map((e) => ({ ...(e.ev as Extract<SimEvent, { kind: 'attackImpact' }>), tick: e.tick }));

describe('melee matchups (exact AoE2 formula)', () => {
  it('militia vs militia: 4 damage per hit, death on the 10th, corpse then cleanup', () => {
    const game = createGame(scenarioConfig(101, grassMap(30, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'a' },
      { defId: 'militia', player: P2, tileX: 13, tileY: 10, ref: 'b' },
    ], [player(), player({ civ: 'english' })]));
    const evs: Timed[] = [];
    run(game, 700, evs);

    const hits = impacts(evs);
    expect(hits.length).toBeGreaterThan(10);
    for (const h of hits) {
      expect(h.damage).toBe(4); // 4 atk − 0 melee armor
      expect(h.melee).toBe(true);
    }
    const died = evs.filter((e) => e.ev.kind === 'entityDied');
    expect(died.length).toBeGreaterThanOrEqual(1);
    const dead = died[0].ev as Extract<SimEvent, { kind: 'entityDied' }>;
    expect(dead.defId).toBe('militia');
    expect(dead.killer).toBeDefined();
    // exactly 10 hits landed on the one that died (40 HP / 4 per hit)
    expect(hits.filter((h) => h.targetId === dead.id && h.tick <= died[0].tick)).toHaveLength(10);

    // corpse: still present as 'dying' right after death, cleaned up ~6 s later
    const corpse = game.state.entities.get(dead.id);
    if (corpse) expect(corpse.activity).toBe('dying');
    run(game, 140);
    expect(game.state.entities.get(dead.id)).toBeUndefined();

    // underAttack alerts throttled: at most 2 per player over 35 s (20 s window)
    for (const p of [P1, P2]) {
      const alerts = evs.filter((e) => e.ev.kind === 'underAttack' && e.ev.player === p);
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts.length).toBeLessThanOrEqual(2);
    }
  });

  it('pikeman +22 bonus vs knight: 24 per pike hit, 10 per knight hit', () => {
    const game = createGame(scenarioConfig(102, grassMap(30, 30), [
      { defId: 'pikeman', player: P1, tileX: 10, tileY: 10, ref: 'p0' },
      { defId: 'pikeman', player: P1, tileX: 10, tileY: 11, ref: 'p1' },
      { defId: 'knight', player: P2, tileX: 12, tileY: 10, ref: 'knight' },
    ], [player(), player({ civ: 'english' })]));
    const pikes = ['p0', 'p1'].map((r) => game.state.refs.get(r)!);
    const knight = game.state.refs.get('knight')!;
    game.advance([{ kind: 'attack', player: P1, units: pikes, targetId: knight }]);
    const evs: Timed[] = [];
    run(game, 600, evs);

    for (const h of impacts(evs)) {
      // pike: max(0, 4 − 2 melee armor) + max(0, 22 − 0 cavalry-class armor) = 24
      if (pikes.includes(h.attackerId)) expect(h.damage).toBe(24);
      else expect(h.damage).toBe(10); // knight 10 − 0 melee armor
    }
    // two pikes out-trade the knight (AoE2: one pike alone actually LOSES 1v1)
    expect(evs.some((e) => e.ev.kind === 'entityDied' && e.ev.id === knight)).toBe(true);
    expect(pikes.some((id) => (game.state.entities.get(id)?.hp ?? 0) > 0)).toBe(true);
  });

  it('skirmisher vs archer: 5 per skirm arrow, 1 per archer arrow (armor floor)', () => {
    const game = createGame(scenarioConfig(103, grassMap(30, 30), [
      { defId: 'skirmisher', player: P1, tileX: 10, tileY: 10, ref: 'skirm' },
      { defId: 'archer', player: P2, tileX: 14, tileY: 10, ref: 'archer' },
    ], [player(), player({ civ: 'english' })]));
    const skirm = game.state.refs.get('skirm')!;
    const archer = game.state.refs.get('archer')!;
    const evs: Timed[] = [];
    run(game, 1500, evs);

    const hits = impacts(evs);
    expect(hits.length).toBeGreaterThan(3);
    for (const h of hits) {
      expect(h.melee).toBe(false);
      if (h.attackerId === skirm) expect(h.damage).toBe(5); // 2 + 3 vs archer − 0
      if (h.attackerId === archer) expect(h.damage).toBe(1); // max(1, 4 − 3 pierce armor)
    }
    // the counter wins: 30 HP archer falls to 6 skirm arrows long before 30 land back
    expect(evs.some((e) => e.ev.kind === 'entityDied' && e.ev.id === archer)).toBe(true);
    expect(game.state.entities.get(skirm)!.hp).toBeGreaterThan(0);
  });
});

describe('striking a target that is riding past', () => {
  /** Militia standing in a clump; a scout gallops down `lane` past them. */
  function flyby(lane: number): { game: Game; horse: EntityId; militia: EntityId[] } {
    const game = createGame(scenarioConfig(140, grassMap(60, 60), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'm0' },
      { defId: 'militia', player: P1, tileX: 10, tileY: 11, ref: 'm1' },
      { defId: 'militia', player: P1, tileX: 10, tileY: 12, ref: 'm2' },
      { defId: 'scout', player: P2, tileX: lane, tileY: 2, ref: 'horse' },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const horse = game.state.refs.get('horse')!;
    const militia = ['m0', 'm1', 'm2'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'move', player: P2, units: [horse], x: fp(lane), y: fp(58) }]);
    return { game, horse, militia };
  }

  it('the first blow lands the tick the target comes into reach, the second after the reload', () => {
    const game = createGame(scenarioConfig(141, grassMap(30, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'militia' },
      { defId: 'scout', player: P2, tileX: 20, tileY: 10, ref: 'horse' },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const state = game.state;
    const militia = state.refs.get('militia')!;
    const horse = state.refs.get('horse')!;
    game.advance([{ kind: 'attack', player: P1, units: [militia], targetId: horse }]);

    // MELEE_REACH_FP past both collision radii, in the sim's own integer distance
    const inReach = (): boolean => {
      const a = state.entities.get(militia)!, b = state.entities.get(horse)!;
      const dx = a.x - b.x, dy = a.y - b.y;
      return Math.max(0, Math.floor(Math.sqrt(dx * dx + dy * dy)) - 2 * 64) <= 128;
    };
    let reachedTick = -1;
    const swings: number[] = [];
    for (let step = 0; step < 400; step++) {
      const tick = state.tick;
      for (const ev of game.advance([])) {
        if (ev.kind === 'attackImpact' && ev.attackerId === militia) swings.push(tick);
      }
      if (reachedTick < 0 && inReach()) reachedTick = tick;
    }

    expect(reachedTick).toBeGreaterThan(0);
    expect(swings.length).toBeGreaterThanOrEqual(2);
    // the militia walks in and strikes on arrival — no rate-of-fire wait before swing one
    expect(swings[0]).toBe(reachedTick);
    // only the SECOND swing waits out the militia's 2 s reload
    expect(swings[1] - swings[0]).toBe(2 * TICKS_PER_SECOND);
  });

  it('three militia ordered onto a scout riding past their post get their blows in', () => {
    for (const lane of [11, 12, 13]) {
      const { game, horse, militia } = flyby(lane);
      game.advance([{ kind: 'attack', player: P1, units: militia, targetId: horse }]);
      const evs: Timed[] = [];
      run(game, 600, evs);
      expect(impacts(evs).length, `lane ${lane}`).toBeGreaterThan(0);
    }
  });

  it('but a scout with a clear head start still rides away untouched (AoE2 counter)', () => {
    const game = createGame(scenarioConfig(142, grassMap(60, 60), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 30, ref: 'militia' },
      { defId: 'scout', player: P2, tileX: 13, tileY: 30, ref: 'horse' },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const militia = game.state.refs.get('militia')!;
    const horse = game.state.refs.get('horse')!;
    game.advance([
      { kind: 'move', player: P2, units: [horse], x: fp(58), y: fp(30) },
      { kind: 'attack', player: P1, units: [militia], targetId: horse },
    ]);
    const evs: Timed[] = [];
    run(game, 600, evs);

    expect(impacts(evs)).toHaveLength(0);
    expect(game.state.entities.get(horse)!.hp).toBe(gameData.units.scout.hp);
  });
});

describe('auto-engage defaults (GDD per-category behavior)', () => {
  it('uses a smaller infantry guard radius than cavalry (4 vs 6 tiles)', () => {
    const infantryGame = createGame(scenarioConfig(112, grassMap(30, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'soldier' },
      { defId: 'villager', player: P2, tileX: 15, tileY: 10, ref: 'enemy' },
    ], [player(), player({ civ: 'english' })]));
    const infantry = infantryGame.state.refs.get('soldier')!;
    const infantryEnemy = infantryGame.state.refs.get('enemy')!;
    run(infantryGame, 120);
    expect((infantryGame.state as unknown as SimState).combat.has(infantry)).toBe(false);
    expect(infantryGame.state.entities.get(infantryEnemy)!.hp).toBe(25);

    const cavalryGame = createGame(scenarioConfig(113, grassMap(30, 30), [
      { defId: 'knight', player: P1, tileX: 10, tileY: 10, ref: 'soldier' },
      { defId: 'villager', player: P2, tileX: 15, tileY: 10, ref: 'enemy' },
    ], [player(), player({ civ: 'english' })]));
    const cavalry = cavalryGame.state.refs.get('soldier')!;
    const cavalryEnemy = cavalryGame.state.refs.get('enemy')!;
    run(cavalryGame, 120);
    expect((cavalryGame.state as unknown as SimState).combat.has(cavalry)).toBe(true);
    expect(cavalryGame.state.entities.get(cavalryEnemy)!.hp).toBeLessThan(25);
  });

  it('joins a friendly active fight from twice the normal guard radius', () => {
    const game = createGame(scenarioConfig(131, grassMap(35, 25), [
      { defId: 'knight', player: P1, tileX: 10, tileY: 10, ref: 'fighter' },
      { defId: 'militia', player: P1, tileX: 18, tileY: 10, ref: 'support' },
      { defId: 'knight', player: P2, tileX: 13, tileY: 10, ref: 'enemy' },
      { defId: 'villager', player: P1, tileX: 2, tileY: 2 },
      { defId: 'villager', player: P2, tileX: 32, tileY: 22 },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const fighter = game.state.refs.get('fighter')!;
    const support = game.state.refs.get('support')!;
    const enemy = game.state.refs.get('enemy')!;
    (game.state as unknown as SimState).conquest = true; // practice/skirmish behavior

    // Five tiles from the enemy is outside militia's ordinary four-tile guard
    // radius. The knight starts the real fight and alerts it from nearby.
    game.advance([{ kind: 'attack', player: P1, units: [fighter], targetId: enemy }]);
    run(game, 100);

    const fight = (game.state as unknown as SimState).combat.get(support);
    expect(fight?.targetId).toBe(enemy);
    expect(fight?.supporting).toBe(true);
  });

  it('joins a squadmate that a tower dragged into a fight', () => {
    const game = createGame(scenarioConfig(132, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'fighter' },
      { defId: 'militia', player: P1, tileX: 5, tileY: 10, ref: 'buddy' },
      { defId: 'watchTower', player: P2, tileX: 15, tileY: 10, ref: 'tower' },
      { defId: 'villager', player: P1, tileX: 2, tileY: 2 },
      { defId: 'villager', player: P2, tileX: 37, tileY: 27 },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const state = game.state as unknown as SimState;
    state.conquest = true; // practice/skirmish behavior
    const fighter = game.state.refs.get('fighter')!;
    const buddy = game.state.refs.get('buddy')!;
    const tower = game.state.refs.get('tower')!;

    // The tower opens up on the nearest militia, who turns on it. His squadmate
    // stands five tiles away — outside the tower's reach, and structures are never
    // acquired on sight — so only the alarm can pull him into the same fight.
    run(game, 60);
    expect((game.state as unknown as SimState).combat.get(fighter)?.targetId).toBe(tower);
    const support = (game.state as unknown as SimState).combat.get(buddy);
    expect(support?.targetId).toBe(tower);
    expect(support?.supporting).toBe(true);

    run(game, 400);
    expect(game.state.entities.get(buddy)!.activity).toBe('attacking');
    expect(game.state.entities.get(tower)!.hp).toBeLessThan(850);
  });

  it('keeps a deliberate one-unit assault on a structure from dragging bystanders in', () => {
    const game = createGame(scenarioConfig(133, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'raider' },
      { defId: 'militia', player: P1, tileX: 7, tileY: 10, ref: 'bystander' },
      { defId: 'house', player: P2, tileX: 13, tileY: 10, ref: 'house' },
      { defId: 'villager', player: P1, tileX: 2, tileY: 2 },
      { defId: 'villager', player: P2, tileX: 37, tileY: 27 },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const state = game.state as unknown as SimState;
    state.conquest = true;
    const raider = game.state.refs.get('raider')!;
    const bystander = game.state.refs.get('bystander')!;
    const house = game.state.refs.get('house')!;

    game.advance([{ kind: 'attack', player: P1, units: [raider], targetId: house }]);
    run(game, 200);
    expect((game.state as unknown as SimState).combat.get(raider)?.targetId).toBe(house);
    // A house never shoots back, so nothing forced this fight on anyone: the
    // ordered raider razes it alone and the squadmate holds his ground.
    expect((game.state as unknown as SimState).combat.has(bystander)).toBe(false);
    expect(game.state.entities.get(bystander)!.tileX).toBe(7);
  });

  it('keeps a bystander out of a structure an attack-mover picked up on its route', () => {
    const game = createGame(scenarioConfig(134, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'mover' },
      { defId: 'militia', player: P1, tileX: 7, tileY: 10, ref: 'bystander' },
      { defId: 'house', player: P2, tileX: 13, tileY: 10, ref: 'house' },
      { defId: 'villager', player: P1, tileX: 2, tileY: 2 },
      { defId: 'villager', player: P2, tileX: 37, tileY: 27 },
    ], [player({ isHuman: true }), player({ civ: 'english' })]));
    const state = game.state as unknown as SimState;
    state.conquest = true;
    const mover = game.state.refs.get('mover')!;
    const bystander = game.state.refs.get('bystander')!;
    const house = game.state.refs.get('house')!;

    // Attack-move clears structures once it arrives — that acquisition is auto, but it
    // is still an order being carried out, not a blow forced on the unit. The idle
    // squadmate was never sent anywhere and holds his post.
    game.advance([{ kind: 'attackMove', player: P1, units: [mover], x: fp(11), y: fp(10) }]);
    run(game, 200);
    expect((game.state as unknown as SimState).combat.get(mover)?.targetId).toBe(house);
    expect((game.state as unknown as SimState).combat.has(bystander)).toBe(false);
    expect(game.state.entities.get(bystander)!.tileX).toBe(7);
  });

  it('idle militia chases an enemy, leashes at ~12 tiles, and holds the battle endpoint', () => {
    const game = createGame(scenarioConfig(104, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'm' },
      { defId: 'scout', player: P2, tileX: 13, tileY: 10, ref: 's' },
    ], [player(), player({ civ: 'english' })]));
    const m = game.state.refs.get('m')!;
    const s = game.state.refs.get('s')!;
    game.advance([{ kind: 'move', player: P2, units: [s], x: fp(37), y: fp(10) }]);
    let maxX = 10;
    for (let t = 0; t < 900; t++) {
      game.advance([]);
      maxX = Math.max(maxX, game.state.entities.get(m)!.tileX);
    }
    expect(maxX).toBeGreaterThan(12); // it really chased
    expect(maxX).toBeLessThanOrEqual(23); // ...but the leash capped the pursuit
    const militia = game.state.entities.get(m)!;
    expect(militia.tileX).toBeGreaterThan(12); // stays where the chase ended
    expect(Math.abs(militia.tileX - maxX)).toBeLessThanOrEqual(1);
    expect(militia.activity).toBe('idle');
    expect(militia.hp).toBe(40); // scout outran it — no blows traded
  });

  it('stop during a chase halts the unit and clears the engagement', () => {
    const game = createGame(scenarioConfig(105, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'm' },
      { defId: 'scout', player: P2, tileX: 13, tileY: 10, ref: 's' },
    ], [player(), player({ civ: 'english' })]));
    const m = game.state.refs.get('m')!;
    const s = game.state.refs.get('s')!;
    game.advance([{ kind: 'move', player: P2, units: [s], x: fp(37), y: fp(10) }]);
    run(game, 99);
    game.advance([{ kind: 'stop', player: P1, units: [m] }]);
    run(game, 5); // let any residual motion settle
    const at105 = { ...game.state.entities.get(m)! };
    expect((game.state as unknown as SimState).combat.has(m)).toBe(false);
    run(game, 200);
    const at305 = game.state.entities.get(m)!;
    expect(at305.x).toBe(at105.x); // stood still: target left LOS, nothing re-acquired
    expect(at305.y).toBe(at105.y);
    expect(at305.activity).toBe('idle');
  });

  it('a unit on a plain move order does NOT divert to enemies en route', () => {
    // bait is an enemy VILLAGER (never auto-engages) so only the mover's behavior counts
    const game = createGame(scenarioConfig(106, grassMap(40, 30), [
      { defId: 'militia', player: P1, tileX: 5, tileY: 10, ref: 'm' },
      { defId: 'villager', player: P2, tileX: 15, tileY: 12, ref: 'bait' },
    ], [player(), player({ civ: 'english' })]));
    const m = game.state.refs.get('m')!;
    const bait = game.state.refs.get('bait')!;
    game.advance([{ kind: 'move', player: P1, units: [m], x: fp(30), y: fp(10) }]);
    run(game, 500);
    // it marched straight through the bait's neighborhood and kept going to x≈30
    expect(game.state.entities.get(m)!.tileX).toBeGreaterThanOrEqual(28);
    expect(game.state.entities.get(bait)!.hp).toBe(25); // untouched
  });

  it('damage never interrupts a plain move: a unit under TC fire keeps walking', () => {
    const game = createGame(scenarioConfig(110, grassMap(40, 30), [
      { defId: 'scout', player: P1, tileX: 5, tileY: 10, ref: 's' },
      { defId: 'townCenter', player: P2, tileX: 14, tileY: 3, ref: 'tc' }, // range clips the path
    ], [player(), player({ civ: 'english' })]));
    const s = game.state.refs.get('s')!;
    game.advance([{ kind: 'move', player: P1, units: [s], x: fp(30), y: fp(10) }]);
    const evs: Timed[] = [];
    let engaged = false;
    for (let t = 0; t < 600; t++) {
      const tick = game.state.tick;
      for (const ev of game.advance([])) evs.push({ tick, ev });
      if ((game.state as unknown as SimState).combat.has(s)) engaged = true;
    }
    expect(impacts(evs).some((h) => h.targetId === s)).toBe(true); // it WAS shot en route
    expect(engaged).toBe(false); // ...but the move order held: no retaliation hijack
    const scout = game.state.entities.get(s)!;
    expect(scout.hp).toBeGreaterThan(0);
    expect(scout.tileX).toBeGreaterThanOrEqual(28); // finished the ordered move
  });

  it('an IDLE unit shot by a TC retaliates, closes in, and lands melee hits on it', () => {
    const game = createGame(scenarioConfig(111, grassMap(30, 30), [
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'm' },
      { defId: 'townCenter', player: P2, tileX: 12, tileY: 8, ref: 'tc' },
    ], [player(), player({ civ: 'english' })]));
    const m = game.state.refs.get('m')!;
    const tc = game.state.refs.get('tc')!;
    const evs: Timed[] = [];
    run(game, 300, evs);

    // retaliation vs the building attacker really fights: melee hits land (1 = armor floor)
    const onTc = impacts(evs).filter((h) => h.attackerId === m && h.targetId === tc);
    expect(onTc.length).toBeGreaterThanOrEqual(3);
    expect(game.state.entities.get(tc)!.hp).toBeLessThan(2400);
    // never wedged 'idle' beside the target with a live engagement (deadlock guard)
    const militia = game.state.entities.get(m)!;
    expect(militia.activity).toBe('attacking');
  });

  it('attack-move engages en route, then the survivor resumes the march', () => {
    const game = createGame(scenarioConfig(107, grassMap(40, 30), [
      { defId: 'knight', player: P1, tileX: 5, tileY: 10, ref: 'k' },
      { defId: 'militia', player: P2, tileX: 15, tileY: 12, ref: 'bait' },
    ], [player(), player({ civ: 'english' })]));
    const k = game.state.refs.get('k')!;
    const bait = game.state.refs.get('bait')!;
    game.advance([{ kind: 'attackMove', player: P1, units: [k], x: fp(30), y: fp(10) }]);
    const evs: Timed[] = [];
    run(game, 900, evs);
    expect(evs.some((e) => e.ev.kind === 'entityDied' && e.ev.id === bait)).toBe(true);
    expect(game.state.entities.get(k)!.tileX).toBeGreaterThanOrEqual(28); // resumed
  });

  it('attack-move clears an enemy building when no hostile unit is nearby', () => {
    const game = createGame(scenarioConfig(128, grassMap(35, 25), [
      { defId: 'manAtArms', player: P1, tileX: 5, tileY: 10, ref: 'soldier' },
      { defId: 'house', player: P2, tileX: 14, tileY: 9, ref: 'house', hp: 120 },
    ], [player(), player({ civ: 'english' })]));
    const soldier = game.state.refs.get('soldier')!;
    const house = game.state.refs.get('house')!;
    game.advance([{ kind: 'attackMove', player: P1, units: [soldier], x: fp(15), y: fp(10) }]);
    run(game, 840);
    expect(game.state.entities.get(house)).toBeUndefined();
  });
});

describe('explicit base assaults', () => {
  it('can damage and destroy an enemy building while it is still half-built', () => {
    const game = createGame(scenarioConfig(129, grassMap(30, 25), [
      { defId: 'manAtArms', player: P1, tileX: 8, tileY: 10, ref: 'soldier' },
      { defId: 'house', player: P2, tileX: 12, tileY: 9, ref: 'foundation' },
    ], [player(), player({ civ: 'english' })]));
    const soldier = game.state.refs.get('soldier')!;
    const foundation = game.state.refs.get('foundation')!;
    const building = game.state.entities.get(foundation)!;
    building.buildProgress = 500;
    building.hp = 45;
    game.advance([{ kind: 'attack', player: P1, units: [soldier], targetId: foundation }]);
    run(game, 500);
    expect(game.state.entities.get(foundation)).toBeUndefined();
  });

  it('continues into a nearby enemy building after destroying the ordered target', () => {
    const game = createGame(scenarioConfig(127, grassMap(40, 30), [
      { defId: 'batteringRam', player: P1, tileX: 8, tileY: 10, ref: 'ram' },
      { defId: 'house', player: P2, tileX: 12, tileY: 10, ref: 'first', hp: 100 },
      { defId: 'house', player: P2, tileX: 16, tileY: 10, ref: 'second' },
      { defId: 'house', player: P2, tileX: 34, tileY: 24, ref: 'far' },
    ], [player(), player({ civ: 'english' })]));
    const ram = game.state.refs.get('ram')!;
    const first = game.state.refs.get('first')!;
    const second = game.state.refs.get('second')!;
    const far = game.state.refs.get('far')!;
    game.advance([{ kind: 'attack', player: P1, units: [ram], targetId: first }]);
    run(game, 900);

    expect(game.state.entities.get(first)).toBeUndefined();
    expect(game.state.entities.get(second)).toBeUndefined();
    expect(game.state.entities.get(far)?.hp).toBe(game.state.entities.get(far)?.maxHp);
  });

  it('redirects overflow melee troops to nearby buildings instead of routing around a packed Town Center', () => {
    const soldiers = Array.from({ length: 26 }, (_, i) => ({
      defId: 'militia', player: P1, tileX: 3 + (i % 7), tileY: 3 + Math.floor(i / 7), ref: `m${i}`,
    }));
    const game = createGame(scenarioConfig(130, grassMap(45, 35), [
      ...soldiers,
      { defId: 'townCenter', player: P2, tileX: 20, tileY: 14, ref: 'tc' },
      { defId: 'house', player: P2, tileX: 27, tileY: 15, ref: 'house' },
    ], [player(), player({ civ: 'english' })]));
    const ids = soldiers.map((_, i) => game.state.refs.get(`m${i}`)!);
    const tc = game.state.refs.get('tc')!;
    const house = game.state.refs.get('house')!;
    game.advance([{ kind: 'attack', player: P1, units: ids, targetId: tc }]);

    const targets = [...(game.state as SimState).combat.values()].map((c) => c.targetId);
    expect(targets).toContain(tc);
    expect(targets).toContain(house);
  });
});

describe('mangonel: splash, friendly fire, hold-fire', () => {
  it('explicit shot splashes: enemy full, own militia half, enemy house hit, own house spared', () => {
    const game = createGame(scenarioConfig(108, grassMap(30, 30), [
      { defId: 'mangonel', player: P1, tileX: 10, tileY: 10, ref: 'mang' },
      { defId: 'militia', player: P2, tileX: 16, tileY: 10, ref: 'enemy' },
      { defId: 'militia', player: P1, tileX: 16, tileY: 11, ref: 'own' },
      { defId: 'house', player: P2, tileX: 17, tileY: 11, ref: 'ehouse' },
      { defId: 'house', player: P1, tileX: 14, tileY: 10, ref: 'ohouse' },
    ], [player(), player({ civ: 'english' })]));
    const mang = game.state.refs.get('mang')!;
    const enemy = game.state.refs.get('enemy')!;
    const own = game.state.refs.get('own')!;
    const ehouse = game.state.refs.get('ehouse')!;
    const ohouse = game.state.refs.get('ohouse')!;
    game.advance([{ kind: 'attack', player: P1, units: [mang], targetId: enemy }]);
    const evs: Timed[] = [];
    run(game, 60, evs);

    const shots = impacts(evs).filter((h) => !h.melee);
    expect(shots.find((h) => h.targetId === enemy)?.damage).toBe(40); // dead center, full 40
    expect(shots.find((h) => h.targetId === own)?.damage).toBe(20); // 1 tile out: falloff half
    expect(shots.find((h) => h.targetId === ehouse)?.damage).toBe(37); // (40+35)>>1 falloff
    expect(shots.some((h) => h.targetId === ohouse)).toBe(false); // never own buildings
    expect(game.state.entities.get(enemy)).toBeDefined(); // corpse lingers
    expect(game.state.entities.get(enemy)!.hp).toBeLessThanOrEqual(0); // 40 dmg = dead
    expect(game.state.entities.get(own)!.hp).toBeGreaterThan(0);
  });

  it('holds fire on auto-acquired targets while a friendly is in the blast (GDD)', () => {
    const game = createGame(scenarioConfig(109, grassMap(30, 30), [
      { defId: 'mangonel', player: P1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: P2, tileX: 16, tileY: 10 },
      { defId: 'militia', player: P1, tileX: 16, tileY: 11 },
    ], [player(), player({ civ: 'english' })]));
    const evs: Timed[] = [];
    run(game, 150, evs);
    expect(evs.filter((e) => e.ev.kind === 'projectileFired')).toHaveLength(0);
  });
});

describe('rams (anti-building siege + garrison rules)', () => {
  it('ram hits a house for 152; 3 garrisoned militia raise it to 182 and add speed', () => {
    const game = createGame(scenarioConfig(110, grassMap(30, 30), [
      { defId: 'batteringRam', player: P1, tileX: 10, tileY: 10, ref: 'ram' },
      { defId: 'house', player: P2, tileX: 13, tileY: 10, ref: 'house' },
    ], [player(), player({ civ: 'english' })]));
    const ram = game.state.refs.get('ram')!;
    const house = game.state.refs.get('house')!;
    game.advance([{ kind: 'attack', player: P1, units: [ram], targetId: house }]);
    const evs: Timed[] = [];
    run(game, 120, evs);
    const hit = impacts(evs).find((h) => h.attackerId === ram);
    expect(hit?.damage).toBe(152); // max(0,2−0) + 150 vs building

    // with 3 garrisoned militia: +10 each vs buildings
    const g2 = createGame(scenarioConfig(111, grassMap(30, 30), [
      { defId: 'batteringRam', player: P1, tileX: 10, tileY: 10, ref: 'ram' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 10, ref: 'm0' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 11, ref: 'm1' },
      { defId: 'militia', player: P1, tileX: 11, tileY: 11, ref: 'm2' },
      { defId: 'house', player: P2, tileX: 14, tileY: 10, ref: 'house' },
    ], [player(), player({ civ: 'english' })]));
    const ram2 = g2.state.refs.get('ram')!;
    const crew = ['m0', 'm1', 'm2'].map((r) => g2.state.refs.get(r)!);
    g2.advance([{ kind: 'garrison', player: P1, units: crew, targetId: ram2 }]);
    run(g2, 40);
    expect(g2.state.entities.get(ram2)!.garrison).toHaveLength(3);
    g2.advance([{ kind: 'attack', player: P1, units: [ram2], targetId: g2.state.refs.get('house')! }]);
    const evs2: Timed[] = [];
    run(g2, 160, evs2);
    const hit2 = impacts(evs2).find((h) => h.attackerId === ram2);
    expect(hit2?.damage).toBe(182); // 152 + 3 × 10

    // garrison speed: empty vs loaded ram displacement over the same walk
    const speedGame = (load: boolean): number => {
      const g = createGame(scenarioConfig(112, grassMap(40, 30), [
        { defId: 'batteringRam', player: P1, tileX: 5, tileY: 10, ref: 'ram' },
        { defId: 'militia', player: P1, tileX: 4, tileY: 10, ref: 'm0' },
        { defId: 'militia', player: P1, tileX: 4, tileY: 11, ref: 'm1' },
        { defId: 'militia', player: P1, tileX: 6, tileY: 11, ref: 'm2' },
      ], [player()]));
      const r = g.state.refs.get('ram')!;
      if (load) {
        g.advance([{ kind: 'garrison', player: P1, units: ['m0', 'm1', 'm2'].map((x) => g.state.refs.get(x)!), targetId: r }]);
        run(g, 40);
      }
      g.advance([{ kind: 'move', player: P1, units: [r], x: fp(35), y: fp(10) }]);
      run(g, 200);
      return g.state.entities.get(r)!.x;
    };
    expect(speedGame(true)).toBeGreaterThan(speedGame(false));
  });

  it('rolls into contact with the house from every approach angle, corners included', () => {
    // The chase walk ends within half a tile of its ring slot (sooner on a crowded
    // ring), so without the contact creep a ram batters a house from a tile of open
    // ground. Every angle must end up touching the 2x2 footprint.
    const starts: Array<[number, number]> = [
      [8, 10], [8, 14], [16, 6], [17, 14], [12, 6], [12, 16], [6, 6], [18, 18],
    ];
    const game = createGame(scenarioConfig(114, grassMap(40, 30), [
      ...starts.map(([x, y], i) => ({ defId: 'batteringRam', player: P1, tileX: x, tileY: y, ref: `r${i}` })),
      // survives the assault, so the rams stay parked on it for the whole run
      { defId: 'house', player: P2, tileX: 12, tileY: 10, ref: 'house', hp: 100000 },
    ], [player(), player({ civ: 'english' })]));
    const rams = starts.map((_, i) => game.state.refs.get(`r${i}`)!);
    const house = game.state.refs.get('house')!;
    game.advance([{ kind: 'attack', player: P1, units: rams, targetId: house }]);
    run(game, 500);

    const target = game.state.entities.get(house)!;
    for (const id of rams) {
      const ram = game.state.entities.get(id)!;
      expect(ram.activity, `ram ${id} should be battering the house`).toBe('attacking');
      // edge-to-edge: 0 = soft body against the wall
      expect(effDistFp(game.state as unknown as SimState, ram, target)).toBe(0);
    }
  });

  it('a destroyed ram ejects its garrison ALIVE (buildings kill theirs)', () => {
    const game = createGame(scenarioConfig(113, grassMap(30, 30), [
      { defId: 'batteringRam', player: P1, tileX: 10, tileY: 10, ref: 'ram' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 10, ref: 'm0' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 11, ref: 'm1' },
      { defId: 'knight', player: P2, tileX: 14, tileY: 10, ref: 'k0' },
      { defId: 'knight', player: P2, tileX: 14, tileY: 11, ref: 'k1' },
    ], [player(), player({ civ: 'english' })]));
    const ram = game.state.refs.get('ram')!;
    const crew = ['m0', 'm1'].map((r) => game.state.refs.get(r)!);
    const knights = ['k0', 'k1'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'garrison', player: P1, units: crew, targetId: ram }]);
    run(game, 30);
    expect(game.state.entities.get(ram)!.garrison).toHaveLength(2);
    game.advance([{ kind: 'attack', player: P2, units: knights, targetId: ram }]);
    // knights deal 10+3=13 (ram melee armor −3); 175 HP → dead in ≤7 rounds of 2
    for (let t = 0; t < 600; t++) {
      game.advance([]);
      const r = game.state.entities.get(ram);
      if (!r || r.hp <= 0) break;
    }
    for (const id of crew) {
      const m = game.state.entities.get(id)!;
      expect(m.hp).toBeGreaterThan(0); // ejected alive at the wreck
      expect(m.garrisonedIn).toBeUndefined();
    }
  });
});

describe('defensive buildings (arrows, garrison scaling, min/max range)', () => {
  it('Town Bell villagers make a Town Center fire a stronger volley', () => {
    const game = createGame(scenarioConfig(120, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 10, tileY: 10, ref: 'tc' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 10 },
      { defId: 'villager', player: P1, tileX: 9, tileY: 11 },
      { defId: 'villager', player: P1, tileX: 9, tileY: 12 },
      { defId: 'knight', player: P2, tileX: 17, tileY: 11 },
    ], [player(), player({ civ: 'english' })]));
    const tc = game.state.refs.get('tc')!;
    const evs: Timed[] = [];
    const tick0 = game.state.tick;
    for (const ev of game.advance([{ kind: 'townBell', player: P1, buildingId: tc }])) {
      evs.push({ tick: tick0, ev });
    }
    run(game, 160, evs);

    expect(game.state.entities.get(tc)!.garrison).toHaveLength(3);
    const volleys = new Map<number, number>();
    for (const e of evs) {
      if (e.ev.kind === 'projectileFired' && e.ev.fromId === tc) {
        volleys.set(e.tick, (volleys.get(e.tick) ?? 0) + 1);
      }
    }
    expect([...volleys.values()]).toContain(4); // 1 base + one per sheltered villager
  });

  it('tower fires 1 arrow empty, 4 with 3 villagers garrisoned; 4 damage vs militia', () => {
    const game = createGame(scenarioConfig(114, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10, ref: 'tower' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 10, ref: 'v0' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 11, ref: 'v1' },
      { defId: 'villager', player: P1, tileX: 10, tileY: 11, ref: 'v2' },
      { defId: 'militia', player: P2, tileX: 14, tileY: 10, ref: 'm' },
    ], [player(), player({ civ: 'english' })]));
    const tower = game.state.refs.get('tower')!;
    const vills = ['v0', 'v1', 'v2'].map((r) => game.state.refs.get(r)!);
    const evs: Timed[] = [];
    const tick0 = game.state.tick;
    for (const ev of game.advance([{ kind: 'garrison', player: P1, units: vills, targetId: tower }])) {
      evs.push({ tick: tick0, ev });
    }
    run(game, 110, evs);

    // group volleys by tick
    const volleys = new Map<number, number>();
    for (const e of evs) {
      if (e.ev.kind === 'projectileFired' && e.ev.fromId === tower) {
        volleys.set(e.tick, (volleys.get(e.tick) ?? 0) + 1);
      }
    }
    const sizes = [...volleys.values()];
    expect(sizes[0]).toBe(1); // fired before the villagers got in
    expect(sizes[sizes.length - 1]).toBe(4); // arrowsBase 1 + 3 garrisoned villagers
    const towerHits = impacts(evs).filter((h) => h.attackerId === tower);
    expect(towerHits.length).toBeGreaterThan(0);
    for (const h of towerHits) expect(h.damage).toBe(4); // 5 pierce − 1 pierce armor
  });

  it('no arrows beyond range, and none inside min range (until Murder Holes)', () => {
    const far = createGame(scenarioConfig(115, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: P2, tileX: 19, tileY: 10 }, // 8.5 tiles to rect > range 8
    ], [player(), player({ civ: 'english' })]));
    const evs1: Timed[] = [];
    run(far, 200, evs1);
    expect(evs1.filter((e) => e.ev.kind === 'projectileFired')).toHaveLength(0);

    const near = createGame(scenarioConfig(116, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: P2, tileX: 11, tileY: 10 }, // hugging the wall: min range 1
    ], [player(), player({ civ: 'english' })]));
    const evs2: Timed[] = [];
    run(near, 200, evs2);
    expect(evs2.filter((e) => e.ev.kind === 'projectileFired')).toHaveLength(0);
  });
});

describe('trebuchet (pack/unpack)', () => {
  it('deploys automatically in range, hits a house for 443, and is immobile deployed', () => {
    const game = createGame(scenarioConfig(117, grassMap(30, 30), [
      { defId: 'trebuchet', player: P1, tileX: 10, tileY: 10, ref: 'treb' },
      { defId: 'house', player: P2, tileX: 10, tileY: 20, ref: 'house' },
    ], [player(), player({ civ: 'english' })]));
    const treb = game.state.refs.get('treb')!;
    const house = game.state.refs.get('house')!;
    expect(game.state.entities.get(treb)!.packed).toBe(true); // arrives packed
    game.advance([{ kind: 'attack', player: P1, units: [treb], targetId: house }]);
    const evs: Timed[] = [];
    run(game, 300, evs);
    expect(game.state.entities.get(treb)!.packed).toBe(false); // auto-deployed (10 s)
    const hit = impacts(evs).find((h) => h.attackerId === treb);
    expect(hit?.damage).toBe(443); // max(0,200−7) + 250 vs building
    run(game, 400, evs);
    expect(game.state.entities.get(house)).toBeUndefined(); // 550 HP < 2 × 443

    // deployed trebs ignore move orders; pack first, then it walks
    const before = game.state.entities.get(treb)!.x;
    game.advance([{ kind: 'move', player: P1, units: [treb], x: fp(20), y: fp(10) }]);
    run(game, 50);
    expect(game.state.entities.get(treb)!.x).toBe(before);
    game.advance([{ kind: 'pack', player: P1, units: [treb] }]);
    run(game, 210);
    expect(game.state.entities.get(treb)!.packed).toBe(true);
    game.advance([{ kind: 'move', player: P1, units: [treb], x: fp(20), y: fp(10) }]);
    run(game, 100);
    expect(game.state.entities.get(treb)!.x).not.toBe(before);
  });
});
