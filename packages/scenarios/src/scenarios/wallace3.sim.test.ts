// wallace-3 END-TO-END assault integration: the REAL sim, the REAL trigger engine,
// and REAL @bf/ai bots on every English/allied seat. Two directions:
//
// 1. IDLE human seat — the regression proof for the Stirling Bridge stall: the
//    scripted English host (passive profile + aiAttackNow pulses) must actually CROSS
//    the 2-tile bridge choke, take the north bridgehead (wave A), press up the
//    causeway into the player camp (waves B+), and — against an idle defender — raze
//    the camp. Pre-fix, the bots' enemy memory recorded ALLIED entities (no diplomacy
//    filter over team-shared fog), so the host's own defense manager locked every wave
//    unit into "guarding" against Warenne's banner guard with attack orders the sim
//    rejects as ally-fire — 15+ of 26 host units idled at their spawn tiles forever
//    and no assault ever came.
//
// 2. COMPETENT-BUT-BASIC human seat — the WINNABILITY proof: a scripted defense that
//    does only what the briefing teaches (train the mandated 10-spear/8-skirm warband,
//    rally to the bridgehead, attack-move each wave, keep the two buildings producing)
//    must break waves A and B with its line intact. Pre-fix, wave A led with 8
//    man-at-arms that hard-countered the mandated spear+skirm composition: the probe
//    showed wave A alone killing 21 of 22 player units and wave B's knights finishing
//    Wallace — the scenario was unwinnable for its target audience.
//
// Deterministic: fixed seed, no wall clock. Sim/AI balance changes can legitimately
// shift the timings — the margins here are generous; re-calibrate rather than assume rot.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import { FP } from '@bf/sim/types';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import { wallace3 } from './wallace3';

const SEED = 1297;
/** North bank of the Forth: the water band starts at row 56. */
const NORTH_BANK_Y = 56;
/** The player camp rect (t06/t07/t08 aiAttackNow target). */
const CAMP = { x: 44, y: 20, w: 28, h: 20 };

function makeOps(game: Game, bots: Map<number, Bot>) {
  const state = game.state;
  const outcome = { victory: 0, defeat: 0 };
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
    message: () => {},
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

describe('wallace-3 — the scripted English assault actually crosses the bridge', () => {
  it('wave A takes the bridgehead, wave B reaches the camp, and an idle defender falls', () => {
    const { start, meta } = loadScenario(wallace3, campaignGameData);
    const game = createGame({
      seed: SEED, map: start, players: meta.playerSetups, popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const state = game.state;
    // every AI seat runs its authored profile, exactly as packages/game boots them
    const bots = new Map<number, Bot>([
      [2, createBot(game, 2, { profile: 'passive', difficulty: 'standard', seed: SEED })],
      [3, createBot(game, 3, { profile: 'defender', difficulty: 'standard', seed: SEED })],
      [4, createBot(game, 4, { profile: 'passive', difficulty: 'standard', seed: SEED })],
    ]);
    const { ops, outcome } = makeOps(game, bots);
    const rt = new TriggerRuntime(wallace3, ops);

    let events: SimEvent[] = [];
    const step = () => {
      const botCmds = [...bots.values()].flatMap((b) => b.tick(events));
      events = game.advance(botCmds as Command[]);
      rt.tick(events);
    };
    const until = (label: string, cond: () => boolean, maxTicks: number) => {
      const startTick = state.tick;
      while (!cond()) {
        if (state.tick - startTick > maxTicks) throw new Error(`timeout waiting for ${label} (tick ${state.tick})`);
        step();
        if (rt.isEnded) return;
      }
    };
    const hostUnits = (): Entity[] => [...state.entities.values()].filter((e) =>
      e.player === 2 && e.kind === 'unit' && e.hp > 0);
    const inCamp = (e: Entity): boolean =>
      e.tileX >= CAMP.x && e.tileX < CAMP.x + CAMP.w && e.tileY >= CAMP.y && e.tileY < CAMP.y + CAMP.h;

    // The player does NOTHING all scenario: the prep deadline (t03, 8 min) starts the
    // crossing, and the host must dismantle the camp entirely on its own.
    until('wave A spawns (t04)', () => rt.hasFired('t04-wave-a'), 12000);
    expect(rt.hasFired('t04-wave-a')).toBe(true);
    const waveATick = state.tick;

    // wave A must funnel through the 2-wide bridge and mass on the NORTH bank
    // (forced area {54,44,10,8}) — pre-fix ZERO units ever left the spawn tiles.
    until('wave A on the north bank', () =>
      hostUnits().filter((e) => e.tileY < NORTH_BANK_Y).length >= 8, 3600);
    expect(hostUnits().filter((e) => e.tileY < NORTH_BANK_Y).length).toBeGreaterThanOrEqual(8);
    expect(state.tick - waveATick).toBeLessThanOrEqual(3600); // inside 3 sim-minutes

    // Moray's signal precedes the bridgehead fight (8 host units north arms it)
    expect(rt.hasFired('t05-signal')).toBe(true);

    // wave B (knights up the causeway) must reach the player camp rect itself
    until('wave B spawns (t06)', () => rt.hasFired('t06-wave-b'), 6000);
    const waveBTick = state.tick;
    until('the host inside the camp', () => hostUnits().some(inCamp), 7200);
    expect(hostUnits().some(inCamp)).toBe(true);
    expect(state.tick - waveBTick).toBeLessThanOrEqual(7200); // inside 6 sim-minutes

    // against an idle player the assault must CLOSE: Wallace falls or the camp is
    // overrun (whichever the host reaches first) — the pre-fix host never attacked
    // anything, and the scenario simply hung forever
    until('the undefended camp falls', () => rt.isEnded, 36000);
    expect(outcome.defeat).toBe(1);
    expect(outcome.victory).toBe(0);
    expect(rt.hasFired('t13-defeat-wallace') || rt.hasFired('t14-defeat-camp')).toBe(true);
  }, 120000);
});

describe('wallace-3 — the taught defense is actually winnable', () => {
  it('a competent-but-basic spear+skirm line at the bridgehead breaks waves A and B and still stands', () => {
    const { start, meta } = loadScenario(wallace3, campaignGameData);
    const game = createGame({
      seed: SEED, map: start, players: meta.playerSetups, popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const state = game.state;
    const bots = new Map<number, Bot>([
      [2, createBot(game, 2, { profile: 'passive', difficulty: 'standard', seed: SEED })],
      [3, createBot(game, 3, { profile: 'defender', difficulty: 'standard', seed: SEED })],
      [4, createBot(game, 4, { profile: 'passive', difficulty: 'standard', seed: SEED })],
    ]);
    const { ops, outcome } = makeOps(game, bots);
    const rt = new TriggerRuntime(wallace3, ops);

    const hostUnits = (): Entity[] => [...state.entities.values()].filter((e) =>
      e.player === 2 && e.kind === 'unit' && e.hp > 0 && e.activity !== 'dying');
    /** The fighting line: everything but the villagers and Wallace (he stays home — his death is defeat). */
    const military = (): Entity[] => [...state.entities.values()].filter((e) =>
      e.player === 1 && e.kind === 'unit' && e.hp > 0 && e.activity !== 'dying' &&
      e.defId !== 'villager' && e.defId !== 'heroWallace');
    const inCamp = (e: Entity): boolean =>
      e.tileX >= CAMP.x && e.tileX < CAMP.x + CAMP.w && e.tileY >= CAMP.y && e.tileY < CAMP.y + CAMP.h;

    const all = [...state.entities.values()];
    const barracksId = all.find((e) => e.player === 1 && e.defId === 'barracks')!.id;
    const rangeId = all.find((e) => e.player === 1 && e.defId === 'archeryRange')!.id;
    // where the causeway meets the bridgehead box the waves are ordered to take
    const LINE = { x: 58 * FP + FP / 2, y: 45 * FP };

    // The script does ONLY what the briefing/hints teach — no micro, no kiting:
    // queue the mandated warband, rally to the bridgehead, attack-move when a wave
    // rides, push idle soldiers back to the line, keep both buildings producing
    // (archers while the gold lasts — hint #1's counter-infantry arm), and turn the
    // whole line on any raider that slips through to the camp.
    let engagedA = false;
    let engagedB = false;
    const defenseCmds = (): Command[] => {
      const cmds: Command[] = [];
      const t = state.tick;
      if (t === 0) {
        for (let i = 0; i < 4; i++) cmds.push({ kind: 'train', player: 1, buildingId: barracksId, defId: 'spearman' });
        for (let i = 0; i < 4; i++) cmds.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'skirmisher' });
        cmds.push({ kind: 'setRally', player: 1, buildingId: barracksId, x: LINE.x, y: LINE.y });
        cmds.push({ kind: 'setRally', player: 1, buildingId: rangeId, x: LINE.x, y: LINE.y });
        cmds.push({ kind: 'move', player: 1, units: military().map((e) => e.id), x: LINE.x, y: LINE.y });
      }
      if (!engagedA && rt.hasFired('t04-wave-a')) {
        engagedA = true;
        cmds.push({ kind: 'attackMove', player: 1, units: military().map((e) => e.id), x: LINE.x, y: LINE.y });
      }
      if (!engagedB && rt.hasFired('t06-wave-b')) {
        engagedB = true;
        cmds.push({ kind: 'attackMove', player: 1, units: military().map((e) => e.id), x: LINE.x, y: LINE.y });
      }
      if (t > 0 && t % 200 === 0) {
        const stock = state.players[1]!.stockpile;
        const barracks = state.entities.get(barracksId);
        if (barracks && barracks.hp > 0 && (barracks.trainQueue?.length ?? 0) < 3 &&
          stock.food >= 35 && stock.wood >= 25) {
          cmds.push({ kind: 'train', player: 1, buildingId: barracksId, defId: 'spearman' });
        }
        const range = state.entities.get(rangeId);
        if (range && range.hp > 0 && (range.trainQueue?.length ?? 0) < 3) {
          if (stock.gold >= 45 && stock.wood >= 25) {
            cmds.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'archer' });
          } else if (stock.food >= 25 && stock.wood >= 35) {
            cmds.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'skirmisher' });
          }
        }
        const raider = hostUnits().find(inCamp);
        if (raider) {
          cmds.push({ kind: 'attackMove', player: 1, units: military().map((e) => e.id), x: raider.x, y: raider.y });
        } else {
          const idle = military().filter((e) => e.activity === 'idle').map((e) => e.id);
          if (idle.length > 0) cmds.push({ kind: 'attackMove', player: 1, units: idle, x: LINE.x, y: LINE.y });
        }
      }
      return cmds;
    };

    let events: SimEvent[] = [];
    const step = () => {
      const botCmds = [...bots.values()].flatMap((b) => b.tick(events));
      events = game.advance([...defenseCmds(), ...botCmds] as Command[]);
      rt.tick(events);
    };
    const until = (label: string, cond: () => boolean, maxTicks: number) => {
      const startTick = state.tick;
      while (!cond()) {
        if (state.tick - startTick > maxTicks) throw new Error(`timeout waiting for ${label} (tick ${state.tick})`);
        step();
        if (rt.isEnded) return;
      }
    };

    // The warband trains inside the 8-minute deadline: t02 (readiness), never t03,
    // starts the crossing — proof the objective's composition is achievable as taught.
    until('the prepared warband brings wave A', () => rt.hasFired('t04-wave-a'), 6000);
    expect(rt.hasFired('t02-prepared')).toBe(true);
    expect(rt.hasFired('t03-prep-deadline')).toBe(false);

    // Wave A (mounted vanguard + archers) breaks on the spear-wall: when wave B
    // rides 210s later, the line still stands in strength.
    until('wave B rides (t06)', () => rt.hasFired('t06-wave-b'), 6000);
    expect(outcome.defeat).toBe(0);
    expect(military().length).toBeGreaterThanOrEqual(14);

    // Everything the English have across the water — wave A remnants plus all of
    // wave B — dies at the bridgehead, and the defense survives with a fighting
    // force left for waves C/D.
    const abIds = hostUnits().map((e) => e.id);
    const abDead = () => abIds.every((id) => {
      const e = state.entities.get(id);
      return !e || e.hp <= 0 || e.activity === 'dying';
    });
    until('waves A+B annihilated at the bridgehead', abDead, 8000);
    expect(abDead()).toBe(true);
    expect(outcome.defeat).toBe(0);
    expect(rt.isEnded).toBe(false);
    expect(ops.getEntityByRef('wallace')).not.toBeNull();
    expect([...state.entities.values()].some((e) =>
      e.player === 1 && e.defId === 'townCenter' && e.hp > 0)).toBe(true);
    expect(military().length).toBeGreaterThanOrEqual(12);
  }, 120000);
});
