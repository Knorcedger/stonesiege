// Combat core (GDD Combat). Explicit attack orders + per-category default behavior:
//   - standard military auto-engages hostile players' units in its guard radius
//     (infantry 4 tiles, cavalry 6, other classes use LOS; staggered scans),
//     and chases with a leash when auto-acquired, then holds its battle position;
//   - villagers/monks never auto-engage (villagers fight only on explicit command);
//   - mangonels hold fire when a friendly stands in the blast (explicit orders override);
//   - rams and trebuchets never auto-acquire; attack-move sends them at the nearest
//     enemy BUILDING in LOS; trebuchets pack/unpack (immobile while deployed).
// Melee hits use the AoE2 armor-class formula via damage.ts; ranged units fire real
// projectiles (projectiles.ts). Defensive buildings (TC/towers/castle) fire volleys:
// arrowsBase + one arrow per garrisoned villager/foot-archer, capped at arrowsMax.

import { gameData, unitAggroRange } from '@bf/data';
import type { UnitDef } from '@bf/data';
import { FP, GAIA, TICKS_PER_SECOND } from './types';
import type { Command, Entity, EntityId, Fixed, SimEvent } from './types';
import { adjacentToFootprint, effDistFp, facingFromDelta, isTileWalkable } from './internal';
import type { CombatInfo, SimState } from './internal';
import { resolveBuildingStats, resolveUnitStats } from './stats';
import { orderMove } from './path';
import { applyHit, isEnemy, tickCorpses, unitAttackDamage } from './damage';
import { fireProjectile } from './projectiles';
import { cancelQueuedBuilds } from './construction';

/** Melee reach beyond the two collision radii (diagonal building adjacency included). */
const MELEE_REACH_FP = 128;
/** Auto-acquired targets are chased at most this far from the acquisition anchor. */
const LEASH_FP = 12 * FP;
/** Idle auto-acquire scans run every N ticks per unit (deterministic stagger). */
const ACQUIRE_STAGGER = 3;
/** An active friendly fight alerts idle soldiers at twice their normal guard radius. */
const BATTLE_SUPPORT_RADIUS_MULTIPLIER = 2;
/** Visual spread for secondary tower/castle arrows. */
const ARROW_JITTER_FP = 32;
/** Explicit building assaults chain through structures within the same local base. */
const ASSAULT_CHAIN_RADIUS_FP = 12 * FP;

const queryBuf: EntityId[] = [];

type AttackCmd = Extract<Command, { kind: 'attack' }>;
type PackCmd = Extract<Command, { kind: 'pack' | 'unpack' }>;

/** Valid entity for an explicit attack order from `player` (enemy unit/building/Gaia). */
function attackable(state: SimState, player: number, target: Entity | undefined): target is Entity {
  if (!target || target.hp <= 0 || target.kind === 'resource') return false;
  if (target.kind === 'unit' && target.garrisonedIn !== undefined) return false;
  return isEnemy(state, player, target.player);
}

export function handleAttack(state: SimState, cmd: AttackCmd): void {
  const target = state.entities.get(cmd.targetId);
  if (!attackable(state, cmd.player, target)) return;
  const seen = new Set<EntityId>();
  const attackers: EntityId[] = [];
  for (const id of cmd.units) {
    if (seen.has(id) || id === cmd.targetId) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    const def = gameData.units[e.defId];
    if (!def || def.attacks.length === 0) continue; // monks can't attack
    attackers.push(id);
    e.intent = { kind: 'attackTarget', targetId: target.id };
    e.targetId = target.id;
    state.fleeing.delete(id);
    state.gather.delete(id);
    state.buildRetries.delete(id);
    state.garrisoning.delete(id);
    const monk = state.monks.get(id);
    if (monk) { monk.convertTargetId = undefined; monk.healTargetId = undefined; }
    state.combat.set(id, {
      targetId: target.id, auto: false, nextAttackTick: 0, anchorX: e.x, anchorY: e.y,
      ...(target.kind === 'building' ? { continueBuildings: true } : {}),
    });
  }
  cancelQueuedBuilds(state, attackers);
}

/** pack/unpack (trebuchets): start the fold/unfold transition from the def's pack times. */
export function handlePackCommand(state: SimState, cmd: PackCmd): void {
  const toPacked = cmd.kind === 'pack';
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    const def = gameData.units[e.defId];
    if (!def?.pack || state.packTransitions.has(id)) continue;
    if (e.packed === toPacked) continue; // already there
    state.motion.delete(id);
    e.activity = 'idle';
    if (toPacked) { // folding up to move: drop the fight
      state.combat.delete(id);
      e.targetId = undefined;
      if (e.intent?.kind === 'attackTarget') e.intent = undefined;
    }
    const seconds = toPacked ? def.pack.packTime : def.pack.unpackTime;
    state.packTransitions.set(id, {
      ticksLeft: Math.max(1, Math.round(seconds * TICKS_PER_SECOND)), toPacked,
    });
  }
}

function tickPackTransitions(state: SimState): void {
  for (const [id, tr] of state.packTransitions) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0) { state.packTransitions.delete(id); continue; }
    tr.ticksLeft--;
    if (tr.ticksLeft > 0) continue;
    state.packTransitions.delete(id);
    e.packed = tr.toPacked;
  }
}

/** Ticks between chase re-path attempts after a walk ended still out of range. */
const CHASE_RETRY_TICKS = 10;
/** Auto engagements drop after this many chase walks that ended still out of range. */
const CHASE_GIVE_UP = 8;

/**
 * A building target: walk to the currently-nearest FREE tile on the footprint ring
 * (per attacker), so a group spreads around the building instead of funneling onto
 * the single ring tile orderMove would remap the blocked center to — with 4x4
 * buildings that funnel left most of a raid milling behind one melee slot.
 */
function buildingApproachPoint(state: SimState, e: Entity, info: CombatInfo, target: Entity): { x: Fixed; y: Fixed } | null {
  const size = gameData.buildings[target.defId]?.size ?? 1;
  // melee slots claimed by other attackers of this building (reservation, not just
  // standing occupancy — a blob approaching from one side otherwise all walks at the
  // same near tile, one wins the slot, the rest rebound and mill forever)
  const reserved = new Set<number>();
  for (const [uid, ci] of state.combat) {
    if (uid === e.id || ci.targetId !== target.id || ci.slotX === undefined) continue;
    const other = state.entities.get(uid);
    // Ranged attackers do not consume a melee ring position: they stop at their
    // own firing range, so counting their path reservation strands melee troops.
    if (other && (gameData.units[other.defId]?.range ?? 0) > 0) continue;
    reserved.add(ci.slotY! * state.map.width + ci.slotX);
  }
  const taken = (tx: number, ty: number): boolean => {
    if (reserved.has(ty * state.map.width + tx)) return true;
    state.unitsGrid.queryCircle(tx * FP + FP / 2, ty * FP + FP / 2, FP / 2, queryBuf);
    for (const id of queryBuf) {
      if (id === e.id) continue;
      const u = state.entities.get(id);
      if (u && u.kind === 'unit' && u.hp > 0 && u.garrisonedIn === undefined
        && u.tileX === tx && u.tileY === ty) return true;
    }
    return false;
  };
  let bx = -1;
  let by = -1;
  let bd = Infinity;
  for (let ty = target.tileY - 1; ty <= target.tileY + size; ty++) {
    for (let tx = target.tileX - 1; tx <= target.tileX + size; tx++) {
      const onRing = tx === target.tileX - 1 || tx === target.tileX + size
        || ty === target.tileY - 1 || ty === target.tileY + size;
      if (!onRing || !isTileWalkable(state, tx, ty) || taken(tx, ty)) continue;
      const dx = tx * FP + FP / 2 - e.x;
      const dy = ty * FP + FP / 2 - e.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bx = tx; by = ty; }
    }
  }
  if (bx < 0) { info.slotX = undefined; info.slotY = undefined; return null; }
  info.slotX = bx;
  info.slotY = by;
  // aim a quarter tile INTO the ring tile toward the wall (still on the walkable tile,
  // so orderMove does not remap): a plain tile-center stop is half a tile from the
  // footprint — right at the edge of melee reach for wide units like rams
  const sx = bx < target.tileX ? 1 : bx >= target.tileX + size ? -1 : 0;
  const sy = by < target.tileY ? 1 : by >= target.tileY + size ? -1 : 0;
  return { x: bx * FP + FP / 2 + sx * (FP / 4), y: by * FP + FP / 2 + sy * (FP / 4) };
}

/** A nearby hostile structure with an open melee position for an overflow attacker. */
function alternateAssaultBuilding(
  state: SimState, e: Entity, info: CombatInfo, crowded: Entity,
): { target: Entity; goal: { x: Fixed; y: Fixed } } | null {
  const candidates: Array<{ target: Entity; dd: number }> = [];
  for (const target of state.entities.values()) {
    if (target.id === crowded.id || target.kind !== 'building' || target.hp <= 0 || target.player === GAIA) continue;
    if (!isEnemy(state, e.player, target.player)) continue;
    const bx = target.x - crowded.x, by = target.y - crowded.y;
    if (bx * bx + by * by > ASSAULT_CHAIN_RADIUS_FP * ASSAULT_CHAIN_RADIUS_FP) continue;
    const dx = target.x - e.x, dy = target.y - e.y;
    candidates.push({ target, dd: dx * dx + dy * dy });
  }
  candidates.sort((a, b) => a.dd - b.dd || a.target.id - b.target.id);
  for (const candidate of candidates) {
    const goal = buildingApproachPoint(state, e, info, candidate.target);
    if (goal) return { target: candidate.target, goal };
  }
  return null;
}

/**
 * (Re)aim the chase walk. Re-path when the target drifted > 1 tile from where the walk
 * was ordered, or when the walk ended while still out of range (with a short backoff so
 * a crowded ring doesn't re-path every tick). The comparison uses the chase point stored
 * on the engagement — NOT the motion target, which orderMove remaps to a ring tile for
 * buildings (comparing that against the building center re-paths forever).
 */
function chase(state: SimState, e: Entity, info: CombatInfo, target: Entity): void {
  const m = state.motion.get(e.id);
  const drifted = info.chaseX === undefined || info.chaseY === undefined
    || (info.chaseX - target.x) ** 2 + (info.chaseY - target.y) ** 2 > FP * FP;
  if (m && !drifted) return; // walk in progress toward (near enough) the target
  if (!m && !drifted && state.tick < (info.nextChaseTick ?? 0)) return; // backoff
  if (!m) info.chaseFails = (info.chaseFails ?? 0) + 1; // ordering a walk from a standstill
  info.chaseX = target.x;
  info.chaseY = target.y;
  info.nextChaseTick = state.tick + CHASE_RETRY_TICKS;
  let goal = target.kind === 'building' ? buildingApproachPoint(state, e, info, target) : null;
  // A packed melee ring must not send overflow troops on a huge walk around the
  // town. Split those attackers onto another structure in the same base instead.
  const melee = (gameData.units[e.defId]?.range ?? 0) <= 0;
  if (!goal && melee && target.kind === 'building' && info.continueBuildings
    && e.intent?.kind === 'attackTarget') {
    const alternate = alternateAssaultBuilding(state, e, info, target);
    if (alternate) {
      info.targetId = alternate.target.id;
      info.nextAttackTick = 0;
      info.chaseX = alternate.target.x;
      info.chaseY = alternate.target.y;
      info.chaseFails = 0;
      e.intent = { kind: 'attackTarget', targetId: alternate.target.id };
      e.targetId = alternate.target.id;
      goal = alternate.goal;
      orderMove(state, [e.id], goal.x, goal.y);
      return;
    }
  }
  orderMove(state, [e.id], goal?.x ?? target.x, goal?.y ?? target.y);
}

/** Drop the engagement: resume attack-move, otherwise hold the battle endpoint. */
function disengage(state: SimState, e: Entity): void {
  state.combat.delete(e.id);
  e.targetId = undefined;
  if (e.intent?.kind === 'attackMove') {
    orderMove(state, [e.id], e.intent.x, e.intent.y);
    return;
  }
  if (e.intent?.kind === 'attackTarget') e.intent = undefined;
  state.motion.delete(e.id);
  e.activity = 'idle';
}

/** Continue an explicit building assault into the nearest structure in the local base. */
function continueBuildingAssault(state: SimState, e: Entity, info: CombatInfo): boolean {
  if (!info.continueBuildings || e.intent?.kind !== 'attackTarget') return false;
  let next: Entity | null = null;
  let bestD = Infinity;
  for (const candidate of state.entities.values()) {
    if (candidate.kind !== 'building' || candidate.hp <= 0 || candidate.player === GAIA) continue;
    if (!isEnemy(state, e.player, candidate.player)) continue;
    const dx = candidate.x - e.x, dy = candidate.y - e.y;
    const dd = dx * dx + dy * dy;
    if (dd > ASSAULT_CHAIN_RADIUS_FP * ASSAULT_CHAIN_RADIUS_FP) continue;
    if (dd < bestD || (dd === bestD && candidate.id < (next?.id ?? Infinity))) {
      bestD = dd;
      next = candidate;
    }
  }
  if (!next) return false;
  info.targetId = next.id;
  info.nextAttackTick = 0;
  info.chaseX = undefined;
  info.chaseY = undefined;
  info.nextChaseTick = undefined;
  info.chaseFails = undefined;
  info.slotX = undefined;
  info.slotY = undefined;
  e.intent = { kind: 'attackTarget', targetId: next.id };
  e.targetId = next.id;
  return true;
}

/** Any friendly (own/allied) unit inside the blast a shot at `target` would make? */
function friendlyInBlast(state: SimState, player: number, target: Entity, splashFp: number): boolean {
  state.unitsGrid.queryCircle(target.x, target.y, splashFp, queryBuf);
  for (const id of queryBuf) {
    const u = state.entities.get(id);
    if (!u || u.kind !== 'unit' || u.hp <= 0 || u.garrisonedIn !== undefined) continue;
    if (u.player === GAIA || isEnemy(state, player, u.player)) continue;
    const dx = u.x - target.x, dy = u.y - target.y;
    if (dx * dx + dy * dy <= splashFp * splashFp) return true;
  }
  return false;
}

function stepCombat(state: SimState, e: Entity, def: UnitDef, info: CombatInfo, events: SimEvent[]): void {
  const target = state.entities.get(info.targetId);
  if (!target || target.hp <= 0 ||
    (target.kind === 'unit' && target.garrisonedIn !== undefined) ||
    !isEnemy(state, e.player, target.player)) { // conversion flips this mid-fight
    if (continueBuildingAssault(state, e, info)) return;
    disengage(state, e);
    return;
  }
  if (info.auto) {
    const dx = e.x - info.anchorX, dy = e.y - info.anchorY;
    if (dx * dx + dy * dy > LEASH_FP * LEASH_FP) { disengage(state, e); return; }
  }
  e.targetId = target.id;

  const stats = resolveUnitStats(state, e.player, e.defId);
  const ranged = stats.projectileSpeedFpPerTick > 0;
  const rangeFp = ranged ? Math.round(stats.range * FP) : MELEE_REACH_FP;
  const minRangeFp = stats.minRange * FP;
  let dist = effDistFp(state, e, target);
  // Melee vs a building: standing anywhere on the footprint ring IS in reach.
  // Separation shoves can push effDist past MELEE_REACH_FP for a unit wedged on a
  // ring corner, leaving it 'idle' with a live engagement, never striking (deadlock).
  if (!ranged && target.kind === 'building' && dist > rangeFp
    && adjacentToFootprint(e, target.tileX, target.tileY, gameData.buildings[target.defId]?.size ?? 1)) {
    dist = rangeFp;
  }

  // trebuchet: mobile only while packed; deploys automatically once in position
  if (def.pack) {
    if (state.packTransitions.has(e.id)) return; // folding/unfolding
    if (e.packed) {
      if (dist <= rangeFp && dist >= minRangeFp) {
        state.motion.delete(e.id);
        state.packTransitions.set(e.id, {
          ticksLeft: Math.max(1, Math.round(def.pack.unpackTime * TICKS_PER_SECOND)), toPacked: false,
        });
        e.activity = 'idle';
      } else {
        chase(state, e, info, target);
      }
      return;
    }
    if (dist > rangeFp || dist < minRangeFp) { e.activity = 'idle'; return; } // deployed: hold
  } else if (dist < minRangeFp) {
    // inside min range: cannot fire, stand (AoE2 units don't auto-retreat)
    state.motion.delete(e.id);
    e.activity = 'idle';
    return;
  } else if (dist > rangeFp) {
    // auto engagements that repeatedly fail to close (full melee ring, unreachable
    // target) drop the fight instead of standing under fire forever
    if (info.auto && (info.chaseFails ?? 0) >= CHASE_GIVE_UP) { disengage(state, e); return; }
    chase(state, e, info, target);
    return;
  }

  // in range
  info.chaseFails = 0;
  state.motion.delete(e.id);
  e.facing = facingFromDelta(target.x - e.x, target.y - e.y);
  e.activity = 'attacking';
  if (state.tick < info.nextAttackTick) return;

  if (ranged) {
    // GDD: mangonels hold fire with a friendly in the blast unless explicitly ordered
    if (stats.areaRadiusFp > 0 && info.auto && friendlyInBlast(state, e.player, target, stats.areaRadiusFp)) {
      return; // held — cooldown not consumed
    }
    info.nextAttackTick = state.tick + stats.rofTicks;
    fireProjectile(state, {
      fromId: e.id, player: e.player, fromX: e.x, fromY: e.y, target,
      attacks: stats.attacks, accuracy: stats.accuracy,
      speedFpPerTick: stats.projectileSpeedFpPerTick, splashFp: stats.areaRadiusFp,
      arc: def.classes.includes('siege') ? 'high' : 'flat',
    }, events);
  } else {
    info.nextAttackTick = state.tick + stats.rofTicks;
    applyHit(state, e, target, unitAttackDamage(state, e, target), events);
  }
}

/** Auto-engage category: which targets a unit acquires on its own (GDD defaults). */
function autoMode(state: SimState, e: Entity, def: UnitDef): 'units' | 'buildings' | 'unitsAndBuildings' | null {
  if (def.gather || def.heals || def.converts) return null; // villagers + monks: never
  if (state.fleeing.has(e.id) || state.garrisoning.has(e.id)) return null;
  if (e.intent && e.intent.kind !== 'attackMove') return null;
  // a plain move order is honored: only idle units and attack-movers engage en route
  if (state.motion.has(e.id) && e.intent?.kind !== 'attackMove') return null;
  const siegeNoAuto = def.garrisonCapacity !== undefined || def.pack !== undefined; // rams/trebs
  if (siegeNoAuto) return e.intent?.kind === 'attackMove' ? 'buildings' : null;
  // Attack-move clears structures only AFTER reaching its ordered destination.
  // En route it still fights units, but does not peel off to raze a building that
  // merely borders the route (campaign travel orders depend on that distinction).
  return e.intent?.kind === 'attackMove' && !state.motion.has(e.id)
    ? 'unitsAndBuildings' : 'units';
}

function tryAcquire(
  state: SimState, e: Entity, def: UnitDef,
  mode: 'units' | 'buildings' | 'unitsAndBuildings',
): CombatInfo | undefined {
  if ((state.tick + e.id) % ACQUIRE_STAGGER !== 0) return undefined;
  const stats = resolveUnitStats(state, e.player, e.defId);
  const aggroFp = unitAggroRange(def, stats.los) * FP;
  const minRangeFp = stats.minRange * FP;
  let targetId = -1;
  let bestD = Infinity;
  let supporting = false;
  const scanBuildings = (): void => {
    for (const t of state.entities.values()) {
      if (t.kind !== 'building' || t.hp <= 0 || t.player === GAIA) continue;
      if (!isEnemy(state, e.player, t.player)) continue;
      const d = effDistFp(state, e, t);
      if (d > aggroFp || d < minRangeFp) continue;
      if (d < bestD) { bestD = d; targetId = t.id; }
    }
  };
  if (mode === 'buildings') {
    scanBuildings();
  } else {
    // unsorted query + explicit (distance, lowest id) tie-break: picks exactly the
    // unit a sorted scan with `dd < bestD` would pick, without the per-scan id sort
    // (a measured hotspot with 300+ auto-acquiring units — see spatial.ts)
    state.unitsGrid.queryCircleUnsorted(e.x, e.y, aggroFp, queryBuf);
    for (const id of queryBuf) {
      if (id === e.id) continue;
      const t = state.entities.get(id);
      if (!t || t.kind !== 'unit' || t.hp <= 0 || t.garrisonedIn !== undefined) continue;
      if (t.player === GAIA) continue; // wildlife is engaged via retaliation, not on sight
      if (!isEnemy(state, e.player, t.player)) continue;
      const dx = t.x - e.x, dy = t.y - e.y;
      const dd = dx * dx + dy * dy;
      if (dd > aggroFp * aggroFp) continue;
      if (minRangeFp > 0 && effDistFp(state, e, t) < minRangeFp) continue;
      if (dd < bestD || (dd === bestD && t.id < targetId)) { bestD = dd; targetId = t.id; }
    }
    // Unit targets always take priority. Only a clear local battlefield lets an
    // attack-moving formation turn its weapons on structures.
    if (targetId < 0 && mode === 'unitsAndBuildings') scanBuildings();
  }
  // A soldier actively trading blows raises the alarm for nearby troops at
  // twice their usual guard radius. Only the original fighter can relay the
  // fight (`supporting` recruits cannot), preventing awareness from chaining
  // across an entire army or base one unit at a time.
  // Campaign missions author exact wave behavior and balance, so the broader
  // squad alarm is a skirmish/practice affordance for the human army only.
  if (targetId < 0 && state.conquest && state.players[e.player]?.setup.isHuman) {
    const supportRadiusFp = aggroFp * BATTLE_SUPPORT_RADIUS_MULTIPLIER;
    const supportRadiusSq = supportRadiusFp * supportRadiusFp;
    state.unitsGrid.queryCircleUnsorted(e.x, e.y, supportRadiusFp, queryBuf);
    let bestFriendId = Infinity;
    for (const id of queryBuf) {
      if (id === e.id) continue;
      const friend = state.entities.get(id);
      if (!friend || friend.kind !== 'unit' || friend.player !== e.player || friend.hp <= 0
        || friend.garrisonedIn !== undefined || friend.activity !== 'attacking') continue;
      const fight = state.combat.get(friend.id);
      if (!fight || fight.supporting) continue;
      const target = state.entities.get(fight.targetId);
      if (!target || target.hp <= 0 || target.kind === 'resource'
        || (target.kind === 'unit' && target.garrisonedIn !== undefined)
        || !isEnemy(state, e.player, target.player)) continue;
      if (mode === 'units' && target.kind !== 'unit') continue;
      if (mode === 'buildings' && target.kind !== 'building') continue;
      if (minRangeFp > 0 && effDistFp(state, e, target) < minRangeFp) continue;
      const dx = friend.x - e.x, dy = friend.y - e.y;
      const dd = dx * dx + dy * dy;
      if (dd > supportRadiusSq) continue;
      if (dd < bestD || (dd === bestD && friend.id < bestFriendId)) {
        bestD = dd;
        bestFriendId = friend.id;
        targetId = target.id;
        supporting = true;
      }
    }
  }
  if (targetId < 0) return undefined;
  const info: CombatInfo = {
    targetId, auto: true, nextAttackTick: 0, anchorX: e.x, anchorY: e.y,
    ...(supporting ? { supporting: true } : {}),
  };
  state.combat.set(e.id, info);
  return info;
}

/** Defensive buildings: acquire when ready to fire, volley arrowsBase + garrison extras. */
function tickBuildingAttacks(state: SimState, events: SimEvent[]): void {
  for (const b of state.entities.values()) {
    if (b.kind !== 'building' || b.player === GAIA || b.hp <= 0) continue;
    if ((b.buildProgress ?? 1000) < 1000) continue;
    const def = gameData.buildings[b.defId];
    if (!def?.attacks || def.attacks.length === 0) continue;
    if (state.tick < (state.buildingCd.get(b.id) ?? 0)) continue;
    const bs = resolveBuildingStats(state, b.player, b.defId);
    if (bs.projectileSpeedFpPerTick <= 0) continue;
    const rangeFp = Math.round(bs.range * FP);
    const minRangeFp = bs.minRange * FP;

    // nearest hostile unit in range (armed Gaia — wolves — included; herds are safe)
    state.unitsGrid.queryCircle(b.x, b.y, rangeFp + ((def.size * FP) >> 1) + FP, queryBuf);
    let target: Entity | null = null;
    let bestD = Infinity;
    for (const id of queryBuf) {
      const t = state.entities.get(id);
      if (!t || t.kind !== 'unit' || t.hp <= 0 || t.garrisonedIn !== undefined) continue;
      if (!isEnemy(state, b.player, t.player)) continue;
      const td = gameData.units[t.defId];
      if (t.player === GAIA && (!td || td.attacks.length === 0)) continue; // never shoot sheep
      const d = effDistFp(state, b, t);
      if (d > rangeFp || d < minRangeFp) continue;
      if (d < bestD) { bestD = d; target = t; }
    }
    if (!target) {
      state.buildingCd.set(b.id, state.tick + 5); // nobody in range: rescan in ¼ s
      continue;
    }

    let arrows = bs.arrowsBase;
    for (const gid of b.garrison ?? []) {
      const u = state.entities.get(gid);
      const ud = u ? gameData.units[u.defId] : undefined;
      if (!ud) continue;
      // DE rule of thumb: only villagers and foot archers add arrows
      if (ud.gather || ud.classes.includes('archer')) arrows += bs.arrowsPerGarrison;
    }
    arrows = Math.min(arrows, bs.arrowsMax);
    for (let i = 0; i < arrows; i++) {
      fireProjectile(state, {
        fromId: b.id, player: b.player, fromX: b.x, fromY: b.y, target,
        attacks: bs.attacks, accuracy: 100,
        speedFpPerTick: bs.projectileSpeedFpPerTick, splashFp: 0,
        arc: 'flat', jitterFp: i > 0 ? ARROW_JITTER_FP : 0,
      }, events);
    }
    state.buildingCd.set(b.id, state.tick + bs.rofTicks);
  }
}

/** Per-tick combat pass (after movement, before projectile impacts). */
export function tickCombat(state: SimState, events: SimEvent[]): void {
  tickPackTransitions(state);
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.player === GAIA || e.hp <= 0 || e.garrisonedIn !== undefined) continue;
    const def = gameData.units[e.defId];
    if (!def || def.attacks.length === 0) continue;
    let info = state.combat.get(e.id);
    if (!info && e.intent?.kind === 'attackTarget') {
      // rally-onto-enemy intent (production) arrives without combat bookkeeping
      info = { targetId: e.intent.targetId, auto: false, nextAttackTick: 0, anchorX: e.x, anchorY: e.y };
      state.combat.set(e.id, info);
    }
    if (!info) {
      const mode = autoMode(state, e, def);
      if (mode) info = tryAcquire(state, e, def, mode);
    }
    if (info) stepCombat(state, e, def, info, events);
  }
  tickBuildingAttacks(state, events);
  tickCorpses(state);
}
