// wallace-1 END-TO-END integration: the REAL sim (@bf/sim createGame), the REAL
// trigger engine (TriggerRuntime over the sim's ScenarioOps surface), and the REAL
// @bf/ai bot on the garrison seat — driven by scripted HUMAN commands exactly as a
// player would issue them (move, gather, build, train, attack) all the way to victory.
//
// This is the wave-3 headless proof that the campaign loop closes: loader output
// boots a Game, hero defs resolve from @bf/data, trigger conditions read live sim
// state, trigger effects (spawn/reveal/aiProfile) mutate it, and the authored
// tutorial arc is actually completable. Deterministic: fixed seed, no wall clock.

import { describe, expect, it } from 'vitest';
import { createGame, fp } from '@bf/sim';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import { wallace1 } from './wallace1';

// May 1297 — a calibrated deterministic pin: sim/bot balance changes can legitimately
// alter this run (it plays real combat); re-script/re-calibrate rather than assume rot.
const SEED = 1297;

/** ScenarioOps over a live Game + the real bot hooks; UI callbacks record outcomes. */
function makeOps(game: Game, bots: Map<number, Bot>) {
  const state = game.state;
  const outcome = { victory: 0, defeat: 0, messages: [] as string[] };
  const ops: ScenarioOps = {
    tick: () => state.tick,
    getEntityByRef(ref) {
      const id = state.refs.get(ref);
      const e = id !== undefined ? state.entities.get(id) : undefined;
      if (!e || e.activity === 'dying' || (e.kind !== 'resource' && e.hp <= 0)) return null;
      return { id: e.id, defId: e.defId, player: e.player, tileX: e.tileX, tileY: e.tileY, hp: e.hp };
    },
    countEntities: (q) => game.ops!.getCounts(q),
    getAge: (player) => state.players[player]?.age ?? 'dark',
    getResource: (player, type) => state.players[player]?.stockpile[type] ?? 0,
    hasResearched: (player, techId) => state.players[player]?.researchedTechs.includes(techId) ?? false,
    isDefeated: (player) => state.players[player]?.defeated ?? false,
    spawn: (entities) => void game.ops!.spawn(entities),
    changeOwner(refs, toPlayer) {
      const ids = refs.map((r) => state.refs.get(r)).filter((i): i is EntityId => i !== undefined);
      if (ids.length > 0) game.ops!.changeOwner(ids, toPlayer);
    },
    revealArea: (player, area) => game.ops!.revealArea(player, area),
    addResources: (player, amounts) => game.ops!.addResources(player, amounts),
    setAiProfile(player, profile) {
      const bot = bots.get(player);
      if (bot) applyAiProfile(bot, profile as AiProfile);
    },
    aiAttackNow(player, targetArea) {
      const bot = bots.get(player);
      if (bot) attackNow(bot, targetArea);
    },
    message: (m) => void outcome.messages.push(m.text),
    panCamera: () => {},
    objectiveAdded: () => {},
    objectiveCompleted: () => {},
    objectiveFailed: () => {},
    playSting: () => {},
    victory: () => void outcome.victory++,
    defeat: () => void outcome.defeat++,
  };
  return { ops, outcome };
}

/** Full live-game harness: real sim + real bot on the garrison seat + trigger engine. */
function makeHarness() {
  const { start, meta } = loadScenario(wallace1, campaignGameData); // throws on invalid input
  const game = createGame({
    seed: SEED, map: start, players: meta.playerSetups, popCap: meta.popCap,
    ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
  });
  const state = game.state;

  // the garrison seat runs the real bot with the authored aiProfile (passive);
  // t10-alarm switches it to 'defender' through ScenarioOps.setAiProfile.
  const bots = new Map<number, Bot>([
    [2, createBot(game, 2, { profile: 'passive', difficulty: 'standard', seed: SEED })],
  ]);
  const { ops, outcome } = makeOps(game, bots);
  const rt = new TriggerRuntime(wallace1, ops);

  let events: SimEvent[] = [];
  const pending: Command[] = [];
  const cmd = (c: Command) => void pending.push(c);
  const step = () => {
    const botCmds = [...bots.values()].flatMap((b) => b.tick(events));
    events = game.advance([...pending.splice(0), ...botCmds]);
    rt.tick(events);
  };
  const until = (label: string, cond: () => boolean, maxTicks: number, each?: () => void) => {
    const startTick = state.tick;
    while (!cond()) {
      if (rt.isEnded) throw new Error(`scenario ended early during '${label}' (defeat=${outcome.defeat})`);
      if (state.tick - startTick > maxTicks) throw new Error(`timeout waiting for ${label}`);
      each?.();
      step();
    }
  };

  const live = (e: Entity) => e.hp > 0 && e.activity !== 'dying';
  const mine = (defId: string): EntityId[] =>
    [...state.entities.values()].filter((e) => e.player === 1 && e.defId === defId && live(e)).map((e) => e.id);
  const resourcesNear = (defId: string, cx: number, cy: number): Entity[] =>
    [...state.entities.values()]
      .filter((e) => e.kind === 'resource' && e.defId === defId && (e.amountLeft ?? 0) > 0 && !e.stump)
      .sort((a, b) =>
        (Math.abs(a.tileX - cx) + Math.abs(a.tileY - cy)) - (Math.abs(b.tileX - cx) + Math.abs(b.tileY - cy)) || a.id - b.id);
  const findSpot = (defId: string, cx: number, cy: number): { x: number; y: number } => {
    for (let r = 0; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx; const y = cy + dy;
          if (game.canPlace(1, defId, x, y)) return { x, y };
        }
      }
    }
    throw new Error(`no placement spot for ${defId} near ${cx},${cy}`);
  };
  const moveTo = (units: EntityId[], x: number, y: number) =>
    cmd({ kind: 'move', player: 1, units, x: fp(x + 0.5), y: fp(y + 0.5) });
  // keep every idle villager chopping the nearest western trees (human re-tasking)
  const chop = () => {
    if (state.tick % 100 !== 0) return;
    const trees = resourcesNear('tree', 10, 64);
    const idle = [...state.entities.values()]
      .filter((e) => e.player === 1 && e.defId === 'villager' && live(e) && e.activity === 'idle');
    idle.forEach((v, i) => cmd({ kind: 'gather', player: 1, units: [v.id], targetId: trees[i % 4].id }));
  };
  // the naive finale: walk Wallace to his kinsmen, one attack-move on the court
  const band = () => [state.refs.get('wallace')!, ...mine('militia')].filter((id) => {
    const e = state.entities.get(id);
    return e !== undefined && live(e);
  });

  return { game, state, rt, outcome, cmd, step, until, live, mine, resourcesNear, findSpot, moveTo, chop, band };
}

describe('wallace-1 — real sim + trigger engine + real bot, scripted human play', () => {
  it('completes the whole authored arc to victory', () => {
    const h = makeHarness();
    const { state, rt, outcome, cmd, step, until, mine, resourcesNear, findSpot, moveTo, chop, band } = h;

    const wallace = state.refs.get('wallace')!;
    const startVils = mine('villager');
    expect(startVils).toHaveLength(3);

    // ---- act 1: the two tutorial walks ------------------------------------
    step(); // t01-intro fires immediately
    expect(rt.hasFired('t01-intro')).toBe(true);
    expect(rt.objectiveState('obj-move-1')).toBe('open');

    moveTo([wallace], 33, 55); // shepherd's clearing {30,52,6,6}
    until('Wallace at the clearing (t02)', () => rt.hasFired('t02-move-1'), 2400);
    expect(rt.objectiveState('obj-move-1')).toBe('complete');

    moveTo([wallace], 51, 43); // ford lookout {48,40,6,6}
    until('Wallace at the lookout (t03/t04)', () => rt.hasFired('t04-gather'), 2400);
    expect(rt.objectiveState('obj-move-2')).toBe('complete');
    expect(rt.objectiveState('obj-food')).toBe('open');
    moveTo([wallace], 24, 68); // walk him home, out of harm's way

    // ---- act 2: food to 150 (forage the camp berries) ---------------------
    const berries = resourcesNear('berryBush', 20, 64);
    expect(berries.length).toBeGreaterThanOrEqual(3);
    startVils.forEach((v, i) => cmd({ kind: 'gather', player: 1, units: [v], targetId: berries[i % berries.length].id }));
    until('150 food (t05)', () => rt.hasFired('t05-food'), 6000);

    // ---- act 3: two houses ------------------------------------------------
    const h1 = findSpot('house', 26, 62);
    cmd({ kind: 'build', player: 1, units: [startVils[0]], defId: 'house', tileX: h1.x, tileY: h1.y });
    const h2 = findSpot('house', 26, 68);
    cmd({ kind: 'build', player: 1, units: [startVils[1]], defId: 'house', tileX: h2.x, tileY: h2.y });
    until('two houses standing (t06)', () => rt.hasFired('t06-houses'), 4000);

    // ---- act 4: lumber camp by the western wood + 200 wood ----------------
    let campBuilt = false;
    until('lumber camp + 200 wood (t07)', () => rt.hasFired('t07-wood'), 16000, () => {
      chop();
      if (!campBuilt && (state.players[1].stockpile.wood ?? 0) >= 100 && state.tick % 20 === 0) {
        const spot = findSpot('lumberCamp', 12, 63);
        cmd({ kind: 'build', player: 1, units: [mine('villager')[0]], defId: 'lumberCamp', tileX: spot.x, tileY: spot.y });
        campBuilt = true;
      }
    });
    expect(rt.objectiveState('obj-lumber')).toBe('complete');

    // ---- act 5: train villagers to 6 --------------------------------------
    const tc = [...state.entities.values()].find((e) => e.player === 1 && e.defId === 'townCenter')!;
    for (let i = 0; i < 3; i++) cmd({ kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' });
    until('six villagers (t08 nightfall)', () => rt.hasFired('t08-vils'), 4000, chop);
    expect(rt.objectiveState('obj-vils')).toBe('complete');
    expect(mine('militia')).toHaveLength(7); // the kinsmen wait at the glen mouth
    expect(rt.objectiveState('obj-muster')).toBe('open');
    // Lanark stays hidden — the reveal/kill-objective must not catch the band split
    expect(rt.hasFired('t09-muster')).toBe(false);

    // ---- act 6: the raid on Lanark — the NAIVE line, no micro -------------
    // The muster beat walks Wallace out to his kinsmen BEFORE the kill objective
    // exists, so the most natural play — the moment Lanark is revealed, select the
    // lot, long-press the sheriff's court ONCE, never touch the band again —
    // departs from the glen mouth as one group. The finale must be winnable this
    // way with Wallace HEALTHY and at least 2 kinsmen still standing (Heselrig's
    // court sits outside the tower/TC arrow arcs so the fight happens in the open;
    // the guard detail is sized for a ragged all-in).
    moveTo([wallace], 36, 58);
    until('Wallace musters at the glen mouth (t09)', () => rt.hasFired('t09-muster'), 2400);
    expect(rt.objectiveState('obj-muster')).toBe('complete');
    expect(rt.objectiveState('obj-heselrig')).toBe('open');
    cmd({ kind: 'attackMove', player: 1, units: band(), x: fp(65.5), y: fp(43.5) });
    until('the sheriff falls (t11 victory)', () => rt.isEnded, 12000);

    // ---- the arc closed exactly as authored -------------------------------
    expect(outcome.victory).toBe(1);
    expect(outcome.defeat).toBe(0);
    expect(rt.hasFired('t10-alarm')).toBe(true); // garrison woke and went defender
    expect(rt.hasFired('t11-victory')).toBe(true);
    expect(rt.hasFired('t12-defeat')).toBe(false);
    const wallaceE = state.entities.get(wallace)!;
    expect(wallaceE !== undefined && wallaceE.hp > 0).toBe(true); // Wallace lives
    // ...and lives WELL: the whole point of the muster beat is that the band arrives
    // together, so Wallace must not have solo-tanked the court. Before the beat
    // existed, this naive line left him at ~41/200 — one wolf bite from defeat.
    expect(wallaceE.hp).toBeGreaterThanOrEqual(120);
    expect(mine('militia').length).toBeGreaterThanOrEqual(2); // and so do kinsmen
    expect(rt.objectiveIds()).toEqual([
      'obj-move-1', 'obj-move-2', 'obj-food', 'obj-houses', 'obj-lumber', 'obj-vils', 'obj-muster', 'obj-heselrig',
    ]);
    for (const id of rt.objectiveIds()) expect(rt.objectiveState(id)).toBe('complete');
  });

  it('out-of-order play — eco first, walks last — still resolves every objective', () => {
    // The most natural RTS opening ignores the tutorial rail: houses up, villagers
    // training, wood banked, all BEFORE Wallace does his two walks. Every eco
    // trigger's condition is satisfied from early on; because t05..t08 are gated on
    // their predecessors, NONE may fire (no skipped beats, no stranded objectives)
    // until the walks unlock t04 — and then the whole chain cascades and the
    // scenario still plays to victory with every objective resolved.
    const h = makeHarness();
    const { state, rt, outcome, cmd, step, until, live, mine, resourcesNear, findSpot, moveTo, chop, band } = h;

    const wallace = state.refs.get('wallace')!;
    const startVils = mine('villager');
    step(); // t01-intro
    expect(rt.hasFired('t01-intro')).toBe(true);

    // ---- eco first: berries, both houses, train to 6 villagers ------------
    const berries = resourcesNear('berryBush', 20, 64);
    startVils.forEach((v, i) => cmd({ kind: 'gather', player: 1, units: [v], targetId: berries[i % berries.length].id }));
    const h1 = findSpot('house', 26, 62);
    cmd({ kind: 'build', player: 1, units: [startVils[0]], defId: 'house', tileX: h1.x, tileY: h1.y });
    const h2 = findSpot('house', 26, 68);
    cmd({ kind: 'build', player: 1, units: [startVils[1]], defId: 'house', tileX: h2.x, tileY: h2.y });
    const tc = [...state.entities.values()].find((e) => e.player === 1 && e.defId === 'townCenter')!;
    const forage = () => { // idle villagers (house builders, fresh trainees) go to berries
      if (state.tick % 100 !== 0) return;
      const bushes = resourcesNear('berryBush', 20, 64);
      const idle = [...state.entities.values()]
        .filter((e) => e.player === 1 && e.defId === 'villager' && live(e) && e.activity === 'idle');
      idle.forEach((v, i) => cmd({ kind: 'gather', player: 1, units: [v.id], targetId: bushes[i % bushes.length].id }));
    };
    until('six villagers trained before any eco objective exists', () => mine('villager').length >= 6, 16000, () => {
      forage();
      if (mine('villager').length < 6 && (state.players[1].stockpile.food ?? 0) >= 60 && state.tick % 300 === 0) {
        cmd({ kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' });
      }
    });

    // ---- then the food bank, the wood bank, and the lumber camp -----------
    until('150+ food banked', () => (state.players[1].stockpile.food ?? 0) >= 160, 8000, forage);
    let campBuilt = false;
    until('lumber camp + 200 wood banked', () =>
      campBuilt && (state.players[1].stockpile.wood ?? 0) >= 210, 16000, () => {
      chop();
      if (!campBuilt && (state.players[1].stockpile.wood ?? 0) >= 100 && state.tick % 20 === 0) {
        const spot = findSpot('lumberCamp', 12, 63);
        cmd({ kind: 'build', player: 1, units: [mine('villager')[0]], defId: 'lumberCamp', tileX: spot.x, tileY: spot.y });
        campBuilt = true;
      }
    });

    // every eco condition is true — and every eco trigger has correctly held fire
    for (const id of ['t05-food', 't06-houses', 't07-wood', 't08-vils', 't09-muster']) {
      expect(rt.hasFired(id), `${id} must stay gated behind the walks`).toBe(false);
    }
    expect(rt.objectiveIds()).toEqual(['obj-move-1']);

    // ---- the walks, last: the chain cascades at the lookout ---------------
    moveTo([wallace], 33, 55);
    until('Wallace at the clearing (t02)', () => rt.hasFired('t02-move-1'), 2400);
    moveTo([wallace], 51, 43);
    until('lookout -> whole eco chain cascades to nightfall', () => rt.hasFired('t08-vils'), 2400);
    for (const id of ['obj-move-1', 'obj-move-2', 'obj-food', 'obj-houses', 'obj-lumber', 'obj-vils']) {
      expect(rt.objectiveState(id), id).toBe('complete');
    }
    expect(rt.objectiveState('obj-muster')).toBe('open');
    expect(mine('militia')).toHaveLength(7);
    // Wallace stands at the ford lookout, 15 tiles past the glen mouth — exactly
    // the split-band position; Lanark must NOT be revealed yet
    expect(rt.hasFired('t09-muster')).toBe(false);

    // ---- the raid still closes the arc ------------------------------------
    moveTo([wallace], 36, 58);
    until('Wallace musters at the glen mouth (t09)', () => rt.hasFired('t09-muster'), 2400);
    expect(rt.objectiveState('obj-muster')).toBe('complete');
    expect(rt.objectiveState('obj-heselrig')).toBe('open');
    cmd({ kind: 'attackMove', player: 1, units: band(), x: fp(65.5), y: fp(43.5) });
    until('the sheriff falls (t11 victory)', () => rt.isEnded, 12000);

    expect(outcome.victory).toBe(1);
    expect(outcome.defeat).toBe(0);
    const wallaceE = state.entities.get(wallace)!;
    expect(wallaceE !== undefined && wallaceE.hp > 0).toBe(true);
    expect(wallaceE.hp).toBeGreaterThanOrEqual(120); // the band fought together
    expect(rt.objectiveIds()).toEqual([
      'obj-move-1', 'obj-move-2', 'obj-food', 'obj-houses', 'obj-lumber', 'obj-vils', 'obj-muster', 'obj-heselrig',
    ]);
    for (const id of rt.objectiveIds()) expect(rt.objectiveState(id)).toBe('complete');
  });
});
