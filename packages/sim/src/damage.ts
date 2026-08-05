// Damage core. Single entry point for every hit in the game (melee, projectile, wolf
// bite, hunter chop): applyHit / applyRangedHit → applyDamage. Implements the AoE2
// formula — per armor class max(0, atk − armor), summed, minimum 1 per hit — plus the
// death rules: military corpses (dying activity + decay timer), huntable carcasses,
// buildings killing their garrison, rams ejecting theirs alive, kill credit, throttled
// underAttack alerts, villager flee and standard-military retaliation.

import { gameData } from '@bf/data';
import type { ArmorClass, ClassValue, UnitDef } from '@bf/data';
import { FP, GAIA, TICKS_PER_SECOND } from './types';
import type { Entity, EntityId, Fixed, PlayerId, SimEvent } from './types';
import { isqrt } from './internal';
import type { SimState } from './internal';
import { findFreeAdjacentTile, removeEntity } from './entities';
import { resolveBuildingStats, resolveUnitStats } from './stats';
import { fogOnDeath, fogOnSpawn } from './fog';
import { orderMove } from './path';
import { onUnitDamaged } from './flee';

/** How far a struck wild animal (deer) bursts away from its attacker, in tiles. */
const ANIMAL_FLEE_TILES = 5;
/** Military corpse linger time (renderer plays the death animation, then cleanup). */
export const CORPSE_TICKS = 6 * TICKS_PER_SECOND;
/** Minimum spacing between underAttack alerts per player (GDD: throttled town bell). */
export const ALERT_THROTTLE_TICKS = 20 * TICKS_PER_SECOND;

/** Base melee damage vs base melee armor (economy systems: hunter chops, wolf bites). */
export function meleeDamage(attacker: UnitDef, target: UnitDef | undefined): number {
  const first = attacker.attacks[0];
  const atk = first && first.cls === 'melee' ? first.amount : 0;
  const armor = target?.armor.find((a) => a.cls === 'melee')?.amount ?? 0;
  return Math.max(1, atk - armor);
}

/**
 * AoE2 damage formula: base melee/pierce entry vs base armor, plus each bonus entry vs
 * a class the target belongs to (reduced by the target's armor for that class), summed,
 * minimum 1 per hit.
 */
export function computeDamage(
  attacks: readonly ClassValue[], targetClasses: readonly ArmorClass[], targetArmor: readonly ClassValue[],
): number {
  let total = 0;
  for (const a of attacks) {
    if (a.cls === 'melee' || a.cls === 'pierce') {
      const armor = targetArmor.find((x) => x.cls === a.cls)?.amount ?? 0;
      total += Math.max(0, a.amount - armor);
    } else if (targetClasses.includes(a.cls)) {
      const armor = targetArmor.find((x) => x.cls === a.cls)?.amount ?? 0;
      total += Math.max(0, a.amount - armor);
    }
  }
  return Math.max(1, total);
}

export interface TargetProtection { classes: readonly ArmorClass[]; armor: readonly ClassValue[] }

/** The defender side of the formula for any entity (tech armor + packed-treb override). */
export function targetProtection(state: SimState, target: Entity): TargetProtection {
  if (target.kind === 'building') {
    const stats = resolveBuildingStats(state, target.player, target.defId);
    return { classes: gameData.buildings[target.defId]?.classes ?? [], armor: stats.armor };
  }
  const def = gameData.units[target.defId];
  if (!def) return { classes: [], armor: [] };
  if (target.packed && def.pack?.packedArmor) {
    return { classes: def.classes, armor: def.pack.packedArmor };
  }
  if (target.player === GAIA) return { classes: def.classes, armor: def.armor };
  return { classes: def.classes, armor: resolveUnitStats(state, target.player, target.defId).armor };
}

/** A unit attacker's resolved attack entries (tech bonuses + ram garrison bonus). */
export function attackerAttacks(state: SimState, attacker: Entity): ClassValue[] {
  const def = gameData.units[attacker.defId];
  if (!def) return [];
  const base = attacker.player === GAIA
    ? def.attacks
    : resolveUnitStats(state, attacker.player, attacker.defId).attacks;
  const perUnit = def.garrisonAttackPerUnit;
  const count = attacker.garrison?.length ?? 0;
  if (!perUnit || count === 0) return base;
  const out = base.map((a) => ({ cls: a.cls, amount: a.amount }));
  for (const b of perUnit) {
    const entry = out.find((a) => a.cls === b.cls);
    if (entry) entry.amount += b.amount * count;
    else out.push({ cls: b.cls, amount: b.amount * count });
  }
  return out;
}

/** Full attacker-vs-target damage for one hit (units and buildings on either side). */
export function unitAttackDamage(state: SimState, attacker: Entity, target: Entity): number {
  const prot = targetProtection(state, target);
  return computeDamage(attackerAttacks(state, attacker), prot.classes, prot.armor);
}

/**
 * Eject a host's garrison alive beside it (rams on death per GDD; ungarrison command
 * for buildings and rams). `size` = footprint tiles (1 for rams).
 */
export function ejectGarrison(state: SimState, host: Entity, size = 1): void {
  if (!host.garrison || host.garrison.length === 0) return;
  const spot = findFreeAdjacentTile(state, host.tileX, host.tileY, size) ?? { x: host.tileX, y: host.tileY };
  const inside = host.garrison;
  host.garrison = [];
  for (const id of inside) {
    const u = state.entities.get(id);
    if (!u) continue;
    u.garrisonedIn = undefined;
    u.sheltering = undefined;
    u.x = spot.x * FP + FP / 2;
    u.y = spot.y * FP + FP / 2;
    u.tileX = spot.x;
    u.tileY = spot.y;
    u.activity = 'idle';
    state.unitsGrid.insert(id, u.x, u.y);
    fogOnSpawn(state, u);
    state.healAcc.delete(id);
  }
}

/** Clear every per-unit bookkeeping entry (shared by corpse conversion and carcasses). */
function clearUnitBookkeeping(state: SimState, id: EntityId): void {
  state.motion.delete(id);
  state.unitsGrid.remove(id);
  state.gather.delete(id);
  state.fleeing.delete(id);
  state.shelterIntents.delete(id);
  state.animalCd.delete(id);
  state.buildRetries.delete(id);
  state.combat.delete(id);
  state.monks.delete(id);
  state.garrisoning.delete(id);
  state.healAcc.delete(id);
  state.packTransitions.delete(id);
}

/**
 * Turn a dead unit into a lingering corpse: renderer keeps drawing it ('dying'),
 * everything gameplay-relevant is unwound now (pop, fog, grid, garrison membership).
 */
function toCorpse(state: SimState, e: Entity): void {
  e.hp = 0;
  e.activity = 'dying';
  e.targetId = undefined;
  e.intent = undefined;
  e.carrying = undefined;
  clearUnitBookkeeping(state, e.id);
  if (e.garrisonedIn !== undefined) {
    const host = state.entities.get(e.garrisonedIn);
    if (host?.garrison) {
      const i = host.garrison.indexOf(e.id);
      if (i >= 0) host.garrison.splice(i, 1);
    }
    e.garrisonedIn = undefined;
  }
  e.sheltering = undefined;
  fogOnDeath(state, e);
  if (e.player !== GAIA) {
    const player = state.players[e.player];
    const def = gameData.units[e.defId];
    if (player && def) player.pop -= def.pop ?? 1;
  }
  state.corpses.set(e.id, CORPSE_TICKS);
}

/** Per-tick corpse countdown (called from the combat pass). */
export function tickCorpses(state: SimState): void {
  for (const [id, left] of state.corpses) {
    if (left > 1) state.corpses.set(id, left - 1);
    else removeEntity(state, id); // removeEntity sees the corpses entry and skips pop
  }
}

/** A dead huntable stays on the map as food; other units become corpses. */
function killUnit(state: SimState, target: Entity, killer: PlayerId | undefined, events: SimEvent[]): void {
  const def = gameData.units[target.defId];
  if (def?.huntable && (def.foodAmount ?? 0) > 0) {
    // become a carcass: inert, gatherable ('hunt'), rots via animals.ts.
    // No entityDied — the entity persists as food (wave-1 contract).
    target.hp = 0;
    target.activity = 'dying';
    target.amountLeft = def.foodAmount;
    target.resourceType = 'food';
    target.targetId = undefined;
    target.intent = undefined;
    clearUnitBookkeeping(state, target.id);
    fogOnDeath(state, target); // drop any LOS stamp (claimed sheep had one)
    return;
  }
  events.push({
    kind: 'entityDied', id: target.id, defId: target.defId, player: target.player,
    x: target.x, y: target.y, killer,
  });
  if (def?.garrisonCapacity) ejectGarrison(state, target); // GDD: dead rams eject alive
  toCorpse(state, target);
}

/** Destroyed building: garrison dies with it (GDD), reserved queue pop is released. */
function killBuilding(state: SimState, target: Entity, killer: PlayerId | undefined, events: SimEvent[]): void {
  const player = state.players[target.player];
  if (player && target.trainQueue) {
    for (const item of target.trainQueue) {
      // queued costs are LOST (AoE2), but reserved population must come back
      if (item.started && !item.techId) player.pop -= resolveUnitStats(state, target.player, item.defId).pop;
    }
  }
  // capture garrison identities before removal so their deaths can be reported
  const garrisoned: Array<{ id: EntityId; defId: string; player: PlayerId }> = [];
  for (const gid of target.garrison ?? []) {
    const u = state.entities.get(gid);
    if (u) garrisoned.push({ id: u.id, defId: u.defId, player: u.player });
  }
  removeEntity(state, target.id); // kills the garrison recursively
  events.push({
    kind: 'entityDied', id: target.id, defId: target.defId, player: target.player,
    x: target.x, y: target.y, killer,
  });
  for (const g of garrisoned) {
    events.push({
      kind: 'entityDied', id: g.id, defId: g.defId, player: g.player, x: target.x, y: target.y, killer,
    });
  }
}

/** Wild huntables (deer) burst away from the attacker when struck; herdables just bleat. */
function animalFlee(state: SimState, animal: Entity, fromX: Fixed, fromY: Fixed): void {
  const dx = animal.x - fromX, dy = animal.y - fromY;
  const dist = isqrt(dx * dx + dy * dy) || 1;
  const run = ANIMAL_FLEE_TILES * FP;
  const w = state.map.width * FP - FP / 2;
  const h = state.map.height * FP - FP / 2;
  const tx = Math.max(FP / 2, Math.min(w, animal.x + Math.round((dx * run) / dist)));
  const ty = Math.max(FP / 2, Math.min(h, animal.y + Math.round((dy * run) / dist)));
  orderMove(state, [animal.id], tx, ty);
}

const teamOf = (state: SimState, p: PlayerId): number => state.players[p]?.setup.team ?? 0;

/** Hostile relationship between two owners (Gaia counts as hostile to everyone). */
export function isEnemy(state: SimState, a: PlayerId, b: PlayerId): boolean {
  if (a === b) return false;
  if (a === GAIA || b === GAIA) return true;
  const ta = teamOf(state, a), tb = teamOf(state, b);
  return ta === 0 || tb === 0 || ta !== tb;
}

/** Standard military per GDD default behavior (auto-engages; retaliates when struck). */
export function isStandardMilitary(def: UnitDef | undefined): boolean {
  if (!def || def.attacks.length === 0) return false;
  if (def.gather) return false; // villagers never auto-engage
  if (def.heals || def.converts) return false; // monks never auto-anything offensive
  if (def.garrisonCapacity) return false; // rams never auto-acquire
  if (def.pack) return false; // trebuchets never auto-acquire
  return true;
}

/** Struck standard military with no current target turns on its attacker. */
function retaliate(state: SimState, victim: Entity, attackerId: EntityId): void {
  if (victim.player <= GAIA || victim.garrisonedIn !== undefined) return;
  if (state.combat.has(victim.id) || state.fleeing.has(victim.id)) return;
  if (state.garrisoning.has(victim.id)) return;
  // AoE2: damage never interrupts an explicit order. A unit on a plain move keeps
  // walking (retreat/disengage micro stays possible); other non-attack intents also
  // hold. Attack-movers DO retaliate — engaging under fire is the point of the order.
  if (victim.intent !== undefined && victim.intent.kind !== 'attackMove') return;
  if (state.motion.has(victim.id) && victim.intent?.kind !== 'attackMove') return;
  const def = gameData.units[victim.defId];
  if (!isStandardMilitary(def)) return;
  const attacker = state.entities.get(attackerId);
  if (!attacker || attacker.hp <= 0 || attacker.kind === 'resource') return;
  if (!isEnemy(state, victim.player, attacker.player)) return; // never turn on an ally (splash)
  state.combat.set(victim.id, {
    targetId: attackerId, auto: true, nextAttackTick: 0, anchorX: victim.x, anchorY: victim.y,
  });
  victim.targetId = attackerId;
}

export interface HitContext {
  attackerId: EntityId;
  attackerPlayer: PlayerId;
  melee: boolean;
  /** Where the blow came from (attacker position or projectile impact point). */
  fromX: Fixed;
  fromY: Fixed;
}

/**
 * Apply one hit from any source. Emits attackImpact; handles deaths (carcass / corpse /
 * building collapse), survivor reactions (deer burst-flee, villager flee, military
 * retaliation) and the throttled underAttack alert.
 */
export function applyDamage(state: SimState, ctx: HitContext, target: Entity, damage: number, events: SimEvent[]): void {
  if (target.hp <= 0) return;
  target.hp -= damage;
  events.push({ kind: 'attackImpact', attackerId: ctx.attackerId, targetId: target.id, damage, melee: ctx.melee });

  // throttled town-bell alert for the defender
  if (target.player > GAIA && isEnemy(state, target.player, ctx.attackerPlayer)) {
    const next = state.alertNext[target.player] ?? 0;
    if (state.tick >= next) {
      state.alertNext[target.player] = state.tick + ALERT_THROTTLE_TICKS;
      events.push({ kind: 'underAttack', player: target.player, x: target.x, y: target.y });
    }
  }

  if (target.hp <= 0) {
    if (target.kind === 'building') killBuilding(state, target, ctx.attackerPlayer, events);
    else killUnit(state, target, ctx.attackerPlayer, events);
    return;
  }

  if (target.kind !== 'unit') return;
  const def = gameData.units[target.defId];
  if (target.player === GAIA && def?.huntable) {
    if (!def.herdable) animalFlee(state, target, ctx.fromX, ctx.fromY);
    return;
  }
  // Enemy raids alarm the surrounding settlement; a wildlife bite only sends
  // the bitten villager running, so one wolf cannot park an entire economy.
  onUnitDamaged(
    state,
    target,
    ctx.attackerPlayer !== GAIA && isEnemy(state, target.player, ctx.attackerPlayer),
  );
  retaliate(state, target, ctx.attackerId);
}

/**
 * Apply one melee hit from a live attacker (hunters, wolves, melee combat). Kept as THE
 * standard entry point — ranged impacts go through applyRangedHit with a frozen payload.
 */
export function applyHit(state: SimState, attacker: Entity, target: Entity, damage: number, events: SimEvent[]): void {
  applyDamage(state, {
    attackerId: attacker.id, attackerPlayer: attacker.player, melee: true,
    fromX: attacker.x, fromY: attacker.y,
  }, target, damage, events);
}

/** Apply a projectile hit whose damage payload was frozen at fire time. */
export function applyRangedHit(
  state: SimState, attackerId: EntityId, attackerPlayer: PlayerId,
  impactX: Fixed, impactY: Fixed, attacks: readonly ClassValue[], target: Entity,
  events: SimEvent[], falloffHalf = false,
): void {
  const prot = targetProtection(state, target);
  let damage = computeDamage(attacks, prot.classes, prot.armor);
  if (falloffHalf) damage = Math.max(1, damage >> 1);
  applyDamage(state, {
    attackerId, attackerPlayer, melee: false, fromX: impactX, fromY: impactY,
  }, target, damage, events);
}
