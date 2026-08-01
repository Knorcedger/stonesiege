// Gathering (GDD Resources & Economy). Villager state machine:
//   walk to resource → gather at the def/civ rate (stats layer) → carry full → walk to
//   the nearest ELIGIBLE drop-off (TC for everything; Mill food, Lumber Camp wood,
//   Mining Camp gold/stone) → deposit (resourceDropped) → walk back.
// Auto-continue: on depletion (resourceDepleted; trees leave a non-blocking stump,
// mines/bushes/carcasses vanish) the villager retargets a same-task node near the old
// one, else deposits any partial load and idles. AoE2 etiquette: ONE gatherer per tree
// (extras queue politely beside it), several per mine/bush. Hunting: live huntables are
// struck down first (villager attacks), then the carcass is eaten like a food node
// (rot lives in animals.ts). Farms feed exactly one farmer.
//
// All amounts/accumulators are scaled integers; every rate/capacity read goes through
// resolveUnitStats so civ bonuses and (later) techs apply.

import { gameData } from '@bf/data';
import type { GatherTask } from '@bf/data';
import { FP, GAIA, TICKS_PER_SECOND } from './types';
import type { Command, Entity, EntityId, PlayerId, ResourceType, SimEvent } from './types';
import { adjacentToFootprint, facingFromDelta } from './internal';
import type { GatherInfo, SimState } from './internal';
import { removeEntity, stumpify } from './entities';
import { resolveUnitStats } from './stats';
import { orderMove } from './path';
import { applyHit, meleeDamage } from './damage';
import { onFarmExhausted } from './farms';

/** Fixed-point-style scale for per-second gather/decay rates (0.31/s -> 310). */
export const RES_SCALE = 1000;
/** Accumulator value worth one whole resource unit. */
export const ACC_PER_UNIT = RES_SCALE * TICKS_PER_SECOND;

/** Auto-continue: search radius (tiles, chebyshev) around the depleted node. */
const RETARGET_RADIUS = 8;
/** Approach attempts for static targets (nodes, farms, drop-offs) before giving up. */
const STATIC_RETRIES = 8;
/** Live prey runs around — hunters persist much longer. */
const PREY_RETRIES = 60;
/** AoE2: max one gatherer per tree. */
const TREE_SLOTS = 1;
/** Mines/bushes/carcasses: one gatherer per adjacent tile of the node. */
const NODE_SLOTS = 8;

type GatherCmd = Extract<Command, { kind: 'gather' }>;

interface TargetView {
  kind: 'node' | 'farm' | 'prey' | 'carcass';
  task: GatherTask;
  resourceType: ResourceType;
  size: number; // footprint (1 except farms)
}

/** What (if anything) `target` currently offers a gatherer of `player`. */
export function classifyGatherTarget(
  state: SimState, target: Entity | undefined, player: PlayerId,
): TargetView | null {
  if (!target) return null;
  if (target.kind === 'resource') {
    const def = gameData.resources[target.defId];
    if (!def || (target.amountLeft ?? 0) <= 0) return null;
    return { kind: 'node', task: def.gatherTask, resourceType: def.resourceType, size: 1 };
  }
  if (target.kind === 'building') {
    const def = gameData.buildings[target.defId];
    if (!def || def.providesFood === undefined) return null;
    if (target.player !== player || target.hp <= 0) return null;
    if ((target.buildProgress ?? 1000) < 1000 || (target.amountLeft ?? 0) <= 0) return null;
    return { kind: 'farm', task: 'farm', resourceType: 'food', size: def.size };
  }
  // units: huntable animals — alive (must be killed first) or carcass (eat it)
  const def = gameData.units[target.defId];
  if (!def?.huntable) return null;
  if (target.hp > 0) {
    if (target.player !== GAIA && target.player !== player) return null; // no eating enemy herds
    return { kind: 'prey', task: 'hunt', resourceType: 'food', size: 1 };
  }
  if ((target.amountLeft ?? 0) <= 0) return null;
  return { kind: 'carcass', task: 'hunt', resourceType: 'food', size: 1 };
}

function freshInfo(task: GatherTask | null, target: Entity | null): GatherInfo {
  return {
    acc: 0, retries: 0, depositing: false, dropoffId: undefined, nextAttackTick: 0,
    task, lastX: target?.tileX ?? 0, lastY: target?.tileY ?? 0, finishAfterDeposit: false,
  };
}

/** gather command: task every selected worker onto the target and send them walking. */
export function handleGather(state: SimState, cmd: GatherCmd): void {
  const target = state.entities.get(cmd.targetId);
  const view = classifyGatherTarget(state, target, cmd.player);
  if (!target || !view) return;
  const movers: EntityId[] = [];
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    if (!gameData.units[e.defId]?.gather) continue; // workers only
    e.intent = { kind: 'gather', targetId: target.id };
    e.targetId = undefined;
    state.fleeing.delete(id);
    state.buildRetries.delete(id);
    state.combat.delete(id); // an explicit gather order overrides a fight
    state.garrisoning.delete(id);
    state.gather.set(id, freshInfo(view.task, target));
    movers.push(id);
  }
  if (movers.length > 0) orderMove(state, movers, target.x, target.y);
}

/** Deplete a node: trees leave a stump and unblock their tile, everything else vanishes. */
export function depleteResource(state: SimState, e: Entity, events: SimEvent[]): void {
  events.push({ kind: 'resourceDepleted', id: e.id, resourceType: e.resourceType ?? 'food' });
  if (e.kind === 'resource' && e.resourceType === 'wood') {
    stumpify(state, e);
    return;
  }
  removeEntity(state, e.id);
}

/** Nearest own completed drop-off accepting `type` (TC + the matching camp/mill). */
function nearestDropoff(state: SimState, e: Entity, type: ResourceType): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of state.entities.values()) {
    if (b.kind !== 'building' || b.player !== e.player || b.hp <= 0) continue;
    if ((b.buildProgress ?? 1000) < 1000) continue;
    const def = gameData.buildings[b.defId];
    if (!def?.dropOffFor?.includes(type)) continue;
    const dx = b.x - e.x, dy = b.y - e.y;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = b; }
  }
  return best;
}

/** Auto-continue: nearest same-task target around the depleted node's last tile. */
function findNearbyTarget(state: SimState, villager: Entity, task: GatherTask, cx: number, cy: number): Entity | null {
  if (task === 'farm') return null; // farmers wait at their fallow plot instead
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const t of state.entities.values()) {
    const view = classifyGatherTarget(state, t, villager.player);
    if (!view || view.task !== task) continue;
    const dx = t.tileX - cx, dy = t.tileY - cy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > RETARGET_RADIUS) continue;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = t; }
  }
  return best;
}

/** Drop the task entirely: clear intent + bookkeeping, stand down (any load is kept). */
function release(state: SimState, e: Entity): void {
  e.intent = undefined;
  state.gather.delete(e.id);
  state.motion.delete(e.id);
  e.activity = 'idle';
}

function startDeposit(state: SimState, e: Entity, info: GatherInfo): void {
  if (!e.carrying || e.carrying.amount <= 0) return;
  const drop = nearestDropoff(state, e, e.carrying.type);
  if (!drop) { release(state, e); return; } // nowhere to bank it: hold the load, idle
  info.depositing = true;
  info.dropoffId = drop.id;
  info.retries = 0;
  orderMove(state, [e.id], drop.x, drop.y);
  e.activity = 'carrying';
}

function onTargetLost(state: SimState, e: Entity, info: GatherInfo): void {
  const next = info.task ? findNearbyTarget(state, e, info.task, info.lastX, info.lastY) : null;
  if (next) {
    e.intent = { kind: 'gather', targetId: next.id };
    info.retries = 0;
    info.depositing = false;
    orderMove(state, [e.id], next.x, next.y);
    return;
  }
  if (e.carrying && e.carrying.amount > 0) {
    info.finishAfterDeposit = true;
    startDeposit(state, e, info);
    return;
  }
  release(state, e);
}

function stepDeposit(state: SimState, e: Entity, info: GatherInfo, events: SimEvent[]): void {
  if (!e.carrying || e.carrying.amount <= 0) {
    info.depositing = false;
    info.dropoffId = undefined;
    return;
  }
  let drop = info.dropoffId !== undefined ? state.entities.get(info.dropoffId) : undefined;
  const def = drop ? gameData.buildings[drop.defId] : undefined;
  const valid = drop && def && drop.kind === 'building' && drop.player === e.player &&
    drop.hp > 0 && (drop.buildProgress ?? 1000) >= 1000 && def.dropOffFor?.includes(e.carrying.type);
  if (!valid) {
    const next = nearestDropoff(state, e, e.carrying.type);
    if (!next) { release(state, e); return; }
    info.dropoffId = next.id;
    info.retries = 0;
    orderMove(state, [e.id], next.x, next.y);
    e.activity = 'carrying';
    return;
  }
  drop = drop!;
  const size = gameData.buildings[drop.defId]?.size ?? 1;
  if (adjacentToFootprint(e, drop.tileX, drop.tileY, size)) {
    state.motion.delete(e.id);
    const player = state.players[e.player];
    player.stockpile[e.carrying.type] += e.carrying.amount;
    events.push({ kind: 'resourceDropped', player: e.player, type: e.carrying.type, amount: e.carrying.amount });
    e.carrying = undefined;
    info.depositing = false;
    info.dropoffId = undefined;
    info.retries = 0;
    if (info.finishAfterDeposit) { release(state, e); return; }
    // head back to the node (revalidated — retarget path runs if it died meanwhile)
    const intent = e.intent;
    const target = intent?.kind === 'gather' ? state.entities.get(intent.targetId) : undefined;
    if (target && classifyGatherTarget(state, target, e.player)) {
      orderMove(state, [e.id], target.x, target.y);
    } else {
      onTargetLost(state, e, info);
    }
    return;
  }
  if (!state.motion.has(e.id)) {
    if (info.retries >= STATIC_RETRIES) { release(state, e); return; }
    info.retries++;
    orderMove(state, [e.id], drop.x, drop.y);
  }
  if (e.activity === 'moving') e.activity = 'carrying'; // renderer: carry walk
}

function strike(state: SimState, e: Entity, info: GatherInfo, prey: Entity, events: SimEvent[]): void {
  state.motion.delete(e.id);
  e.facing = facingFromDelta(prey.x - e.x, prey.y - e.y);
  e.activity = 'attacking';
  if (state.tick < info.nextAttackTick) return;
  const def = gameData.units[e.defId]!;
  info.nextAttackTick = state.tick + Math.max(1, Math.round(def.rof * TICKS_PER_SECOND));
  applyHit(state, e, prey, meleeDamage(def, gameData.units[prey.defId]), events);
}

function approach(state: SimState, e: Entity, info: GatherInfo, target: Entity, view: TargetView): void {
  if (state.motion.has(e.id)) {
    if (view.kind === 'prey') {
      // prey drifts: re-aim when the current walk target went stale
      const m = state.motion.get(e.id)!;
      const dx = m.targetX - target.x, dy = m.targetY - target.y;
      if (dx * dx + dy * dy > 2 * FP * (2 * FP)) orderMove(state, [e.id], target.x, target.y);
    }
    return;
  }
  const cap = view.kind === 'prey' ? PREY_RETRIES : STATIC_RETRIES;
  if (info.retries >= cap) { release(state, e); return; }
  info.retries++;
  orderMove(state, [e.id], target.x, target.y);
}

function stepWorker(
  state: SimState, e: Entity, info: GatherInfo, slots: Map<EntityId, number>, events: SimEvent[],
): void {
  if (info.depositing) { stepDeposit(state, e, info, events); return; }

  const intent = e.intent as Extract<NonNullable<Entity['intent']>, { kind: 'gather' }>;
  const target = state.entities.get(intent.targetId);
  const view = classifyGatherTarget(state, target, e.player);
  if (!target || !view) { onTargetLost(state, e, info); return; }

  info.task = view.task;
  info.lastX = target.tileX;
  info.lastY = target.tileY;

  const stats = resolveUnitStats(state, e.player, e.defId);
  const capacity = stats.carry[view.task] ?? Number.MAX_SAFE_INTEGER;
  if (e.carrying && e.carrying.type === view.resourceType && e.carrying.amount >= capacity) {
    startDeposit(state, e, info);
    return;
  }

  if (!adjacentToFootprint(e, target.tileX, target.tileY, view.size)) {
    approach(state, e, info, target, view);
    return;
  }
  info.retries = 0;

  if (view.kind === 'prey') { strike(state, e, info, target, events); return; }

  // slot etiquette: 1 per tree/farm, several per mine/bush/carcass
  const slotCap = view.kind === 'farm' ? 1 : view.task === 'wood' ? TREE_SLOTS : NODE_SLOTS;
  const used = slots.get(target.id) ?? 0;
  if (used >= slotCap) {
    // queue politely beside the node until the slot frees
    state.motion.delete(e.id);
    e.activity = 'idle';
    return;
  }
  slots.set(target.id, used + 1);

  state.motion.delete(e.id);
  e.activity = 'gathering';
  e.facing = facingFromDelta(target.x - e.x, target.y - e.y);
  const rate = Math.round((stats.gather[view.task] ?? 0) * RES_SCALE);
  if (rate <= 0) { release(state, e); return; }
  if (e.carrying && e.carrying.type !== view.resourceType) e.carrying = undefined; // switched tasks: old load is lost

  info.acc += rate;
  while (info.acc >= ACC_PER_UNIT && (target.amountLeft ?? 0) > 0
    && (!e.carrying || e.carrying.amount < capacity)) {
    info.acc -= ACC_PER_UNIT;
    target.amountLeft = (target.amountLeft ?? 0) - 1;
    if (!e.carrying) e.carrying = { type: view.resourceType, amount: 0 };
    e.carrying.amount++;
  }
  if (info.acc > ACC_PER_UNIT) info.acc = ACC_PER_UNIT; // no banking while capped/empty

  if ((target.amountLeft ?? 0) <= 0) {
    if (view.kind === 'farm') onFarmExhausted(state, target, events);
    else depleteResource(state, target, events);
  }
  if (e.carrying && e.carrying.amount >= capacity) startDeposit(state, e, info);
}

/** Per-tick gathering pass (after movement, so same-tick arrivals start working). */
export function tickGathering(state: SimState, events: SimEvent[]): void {
  // lazy cleanup for units that lost their gather intent (stop/move/build/flee/death)
  for (const [id] of state.gather) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0 || e.intent?.kind !== 'gather') state.gather.delete(id);
  }
  // per-tick slot claims, first come (insertion order) first served — deterministic
  const slots = new Map<EntityId, number>();
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.hp <= 0 || e.garrisonedIn !== undefined) continue;
    if (e.intent?.kind !== 'gather') continue;
    let info = state.gather.get(e.id);
    if (!info) {
      // rally-onto-resource intent (production) arrives without bookkeeping
      info = freshInfo(null, state.entities.get(e.intent.targetId) ?? null);
      state.gather.set(e.id, info);
    }
    stepWorker(state, e, info, slots, events);
  }
}
