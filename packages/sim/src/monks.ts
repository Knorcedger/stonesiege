// Monks (GDD Combat + AOE2_REFERENCE §7). Healing: explicit heal command (monk chases
// into range) and idle auto-heal of the nearest wounded friendly IN range. Conversion:
// ALWAYS explicit (GDD — faith is never drained by accident); channels at conversion
// range with a once-per-second roll that can never land before the minimum window and
// always lands by the maximum; conversionResist (scout line, Faith tech) widens both.
// Damage does NOT interrupt; monk death, target death/garrison, or leaving range does
// (the monk chases). Success drains faith to 0; faith recharges at 1.6/s.

import { gameData } from '@bf/data';
import type { UnitDef } from '@bf/data';
import { FP, GAIA, TICKS_PER_SECOND } from './types';
import type { Command, Entity, EntityId, SimEvent } from './types';
import { effDistFp, facingFromDelta } from './internal';
import type { MonkInfo, SimState } from './internal';
import { transferOwnership } from './entities';
import { resolveUnitStats } from './stats';
import { orderMove } from './path';
import { isEnemy } from './damage';
import { ACC_PER_UNIT, RES_SCALE } from './gather';

export const FAITH_MAX = 100;
/** Faith regeneration per second (AoE2: 1.6/s ≈ 62 s to full). */
const FAITH_REGEN_PER_TICK = Math.round(1.6 * RES_SCALE);
/** Conversion window base (seconds); conversionResist/10 is added to both ends. */
const CONVERT_MIN_S = 4;
const CONVERT_MAX_S = 10;
/** One conversion roll per second while channeling in range. */
const ROLL_INTERVAL = TICKS_PER_SECOND;
/** Success chance per roll inside the window (AoE2 ≈ 25%). */
const ROLL_NUM = 1;
const ROLL_DEN = 4;
/** Idle auto-heal target scans run every N ticks per monk. */
const HEAL_SCAN_STAGGER = 5;

const queryBuf: EntityId[] = [];

type ConvertCmd = Extract<Command, { kind: 'convert' }>;
type HealCmd = Extract<Command, { kind: 'heal' }>;

function monkInfo(state: SimState, id: EntityId): MonkInfo {
  let info = state.monks.get(id);
  if (!info) {
    info = { faith: FAITH_MAX, faithAcc: 0, channelTicks: 0, healExplicit: false, healAcc: 0 };
    state.monks.set(id, info);
  }
  return info;
}

/** Valid conversion target: enemy player's unit, not a monk, not siege, not garrisoned. */
function convertible(state: SimState, player: number, t: Entity | undefined): t is Entity {
  if (!t || t.kind !== 'unit' || t.hp <= 0 || t.garrisonedIn !== undefined) return false;
  if (t.player === GAIA || !isEnemy(state, player, t.player)) return false;
  const def = gameData.units[t.defId];
  if (!def) return false;
  // AoE2: enemy monks need Atonement, siege/buildings need Redemption — neither in v1
  if (def.classes.includes('monk') || def.classes.includes('siege')) return false;
  return true;
}

function healable(state: SimState, player: number, t: Entity | undefined): t is Entity {
  if (!t || t.kind !== 'unit' || t.hp <= 0 || t.garrisonedIn !== undefined) return false;
  if (t.player === GAIA) return false;
  return t.player === player || !isEnemy(state, player, t.player);
}

function clearOtherTasks(state: SimState, e: Entity): void {
  e.intent = undefined;
  e.targetId = undefined;
  state.gather.delete(e.id);
  state.fleeing.delete(e.id);
  state.combat.delete(e.id);
  state.garrisoning.delete(e.id);
  state.buildRetries.delete(e.id);
}

export function handleConvert(state: SimState, cmd: ConvertCmd): void {
  const target = state.entities.get(cmd.targetId);
  if (!convertible(state, cmd.player, target)) return;
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined || !gameData.units[e.defId]?.converts) continue;
    clearOtherTasks(state, e);
    const info = monkInfo(state, id);
    info.convertTargetId = target.id;
    info.channelTicks = 0;
    info.healTargetId = undefined;
  }
}

export function handleHeal(state: SimState, cmd: HealCmd): void {
  const target = state.entities.get(cmd.targetId);
  if (!healable(state, cmd.player, target)) return;
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id) || id === cmd.targetId) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined || !gameData.units[e.defId]?.heals) continue;
    clearOtherTasks(state, e);
    const info = monkInfo(state, id);
    info.healTargetId = target.id;
    info.healExplicit = true;
    info.convertTargetId = undefined;
    info.channelTicks = 0;
  }
}

function stepConvert(state: SimState, e: Entity, info: MonkInfo, events: SimEvent[]): void {
  const target = state.entities.get(info.convertTargetId!);
  if (!convertible(state, e.player, target)) {
    info.convertTargetId = undefined;
    info.channelTicks = 0;
    state.motion.delete(e.id);
    e.activity = 'idle';
    return;
  }
  const rangeFp = Math.round(resolveUnitStats(state, e.player, e.defId).range * FP);
  if (effDistFp(state, e, target) > rangeFp) {
    // out of range: chase (rolls pause — leaving range suspends, killing the monk ends)
    const m = state.motion.get(e.id);
    if (!m || (m.targetX - target.x) ** 2 + (m.targetY - target.y) ** 2 > FP * FP) {
      orderMove(state, [e.id], target.x, target.y);
    }
    return;
  }
  state.motion.delete(e.id);
  e.activity = 'converting';
  e.facing = facingFromDelta(target.x - e.x, target.y - e.y);
  e.targetId = target.id;
  info.channelTicks++;

  const resist = resolveUnitStats(state, target.player, target.defId).conversionResist;
  const shift = Math.floor(resist / 10); // resist 0..100 -> +0..10 s on both window ends
  const minTicks = (CONVERT_MIN_S + shift) * TICKS_PER_SECOND;
  const maxTicks = (CONVERT_MAX_S + shift) * TICKS_PER_SECOND;
  if (info.channelTicks < minTicks) return;
  const forced = info.channelTicks >= maxTicks;
  const rolled = info.channelTicks % ROLL_INTERVAL === 0 && state.rng.chance(ROLL_NUM, ROLL_DEN);
  if (!forced && !rolled) return;

  const fromPlayer = target.player;
  transferOwnership(state, target, e.player);
  events.push({
    kind: 'conversionComplete', monkId: e.id, targetId: target.id,
    fromPlayer, toPlayer: e.player,
  });
  info.faith = 0; // spent on success (AoE2)
  info.faithAcc = 0;
  info.convertTargetId = undefined;
  info.channelTicks = 0;
  e.targetId = undefined;
  e.activity = 'idle';
}

function stepHeal(state: SimState, e: Entity, info: MonkInfo, def: UnitDef): void {
  const target = state.entities.get(info.healTargetId!);
  if (!healable(state, e.player, target) || target.hp >= target.maxHp) {
    info.healTargetId = undefined;
    info.healAcc = 0;
    if (e.activity === 'healing') e.activity = 'idle';
    return;
  }
  const rangeFp = (def.healRange ?? 4) * FP;
  if (effDistFp(state, e, target) > rangeFp) {
    if (!info.healExplicit) { // auto-heal never chases; explicit orders do
      info.healTargetId = undefined;
      info.healAcc = 0;
      if (e.activity === 'healing') e.activity = 'idle';
      return;
    }
    const m = state.motion.get(e.id);
    if (!m || (m.targetX - target.x) ** 2 + (m.targetY - target.y) ** 2 > FP * FP) {
      orderMove(state, [e.id], target.x, target.y);
    }
    return;
  }
  state.motion.delete(e.id);
  e.activity = 'healing';
  e.facing = facingFromDelta(target.x - e.x, target.y - e.y);
  info.healAcc += Math.round((def.healRate ?? 1) * RES_SCALE);
  while (info.healAcc >= ACC_PER_UNIT && target.hp < target.maxHp) {
    info.healAcc -= ACC_PER_UNIT;
    target.hp++;
  }
}

/** Idle monks pick up the nearest wounded friendly already within heal range (GDD). */
function autoAcquireHeal(state: SimState, e: Entity, info: MonkInfo, def: UnitDef): void {
  if ((state.tick + e.id) % HEAL_SCAN_STAGGER !== 0) return;
  const rangeFp = (def.healRange ?? 4) * FP;
  state.unitsGrid.queryCircle(e.x, e.y, rangeFp + FP, queryBuf);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of queryBuf) {
    if (id === e.id) continue;
    const t = state.entities.get(id);
    if (!healable(state, e.player, t) || t.hp >= t.maxHp) continue;
    if (effDistFp(state, e, t) > rangeFp) continue;
    const dx = t.x - e.x, dy = t.y - e.y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = t; }
  }
  if (!best) return;
  info.healTargetId = best.id;
  info.healExplicit = false;
  info.healAcc = 0;
}

/** Per-tick monk pass: faith regen, conversion channels, healing, idle auto-heal. */
export function tickMonks(state: SimState, events: SimEvent[]): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.player === GAIA || e.hp <= 0) continue;
    const def = gameData.units[e.defId];
    if (!def || (!def.heals && !def.converts)) continue;
    const info = monkInfo(state, e.id);

    // faith regen (also while garrisoned)
    if (info.faith < FAITH_MAX) {
      info.faithAcc += FAITH_REGEN_PER_TICK;
      while (info.faithAcc >= ACC_PER_UNIT && info.faith < FAITH_MAX) {
        info.faithAcc -= ACC_PER_UNIT;
        info.faith++;
      }
    }
    if (e.garrisonedIn !== undefined) continue;

    if (def.converts && info.convertTargetId !== undefined) {
      stepConvert(state, e, info, events);
    } else if (def.heals && info.healTargetId !== undefined) {
      stepHeal(state, e, info, def);
    } else if (def.heals && e.activity === 'idle' && !state.motion.has(e.id) && e.intent === undefined) {
      autoAcquireHeal(state, e, info, def);
    }
  }
}
