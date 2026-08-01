// Projectiles (GDD Combat): real travel time from def projectileSpeed + distance, an
// accuracy roll at fire time (a miss lands at a scatter point and may graze whoever is
// standing there — AoE2 style), Ballistics leads the target's current velocity, and the
// mangonel line deals splash with friendly fire to UNITS but never to friendly
// buildings (AOE2_REFERENCE §3). Hit resolution follows AoE2: a PASSED accuracy roll
// connects with the target at impact tick wherever it now stands (arrows track their
// victim — closing units run INTO arrows, they don't dodge them); only the mangonel
// line's splash resolves at the frozen impact point, so moving targets genuinely dodge
// it (the AoE2 mangonel-dodge micro). AOE2_REFERENCE §3 reserves the dodgeable
// frozen-point model for the mangonel line; the GDD says moving targets "can be
// missed" (the accuracy roll), not "are always missed".

import { gameData } from '@bf/data';
import type { ClassValue } from '@bf/data';
import { FP, GAIA } from './types';
import type { Entity, EntityId, Fixed, PlayerId, SimEvent } from './types';
import { distToFootprintFp, isqrt } from './internal';
import type { Projectile, SimState } from './internal';
import { resolveUnitStats } from './stats';
import { applyRangedHit, isEnemy } from './damage';

/** Stray-shot graze radius: a MISSED shot hits whoever stands this close to its scatter point. */
export const HIT_RADIUS_FP = 96;
/** Missed shots land up to this far from the aim point (each axis, uniform). */
const MISS_SCATTER_FP = 160;

const queryBuf: EntityId[] = [];

export interface FireSpec {
  fromId: EntityId;
  player: PlayerId;
  fromX: Fixed;
  fromY: Fixed;
  target: Entity;
  attacks: ClassValue[];
  accuracy: number; // 0..100; buildings are always "hit" (they cannot dodge)
  speedFpPerTick: number;
  splashFp: number;
  arc: 'flat' | 'high';
  /** Extra visual scatter for secondary tower/TC arrows (small, deterministic). */
  jitterFp?: number;
}

/** Current per-tick velocity of a moving unit (approximate: toward its next waypoint). */
function targetVelocity(state: SimState, target: Entity): { vx: number; vy: number } {
  const m = state.motion.get(target.id);
  if (!m || m.path === null) return { vx: 0, vy: 0 };
  let wx: Fixed, wy: Fixed;
  if (m.pathIndex < m.path.length) {
    const t = m.path[m.pathIndex];
    wx = (t % state.map.width) * FP + FP / 2;
    wy = ((t / state.map.width) | 0) * FP + FP / 2;
  } else {
    wx = m.targetX;
    wy = m.targetY;
  }
  const dx = wx - target.x, dy = wy - target.y;
  const dist = isqrt(dx * dx + dy * dy);
  if (dist === 0) return { vx: 0, vy: 0 };
  const speedFp = resolveUnitStats(state, target.player, target.defId).speedFp;
  return { vx: Math.round(dx * speedFp / dist), vy: Math.round(dy * speedFp / dist) };
}

const clampMap = (state: SimState, v: Fixed, axisTiles: number): Fixed =>
  Math.max(FP / 2, Math.min(axisTiles * FP - FP / 2, v));

/** Roll accuracy, resolve the aim point (ballistics lead), emit the event, go in flight. */
export function fireProjectile(state: SimState, spec: FireSpec, events: SimEvent[]): void {
  const t = spec.target;
  const isBuilding = t.kind === 'building';
  let aimX: Fixed, aimY: Fixed;
  let hit: boolean;

  if (isBuilding) {
    aimX = t.x; aimY = t.y;
    hit = true; // buildings cannot dodge (trebs "effectively always hit" them)
  } else {
    aimX = t.x; aimY = t.y;
    if (state.ballistics[spec.player]) {
      const v = targetVelocity(state, t);
      if (v.vx !== 0 || v.vy !== 0) {
        const dx0 = aimX - spec.fromX, dy0 = aimY - spec.fromY;
        const flight0 = Math.max(1, Math.ceil(isqrt(dx0 * dx0 + dy0 * dy0) / spec.speedFpPerTick));
        aimX = clampMap(state, aimX + v.vx * flight0, state.map.width);
        aimY = clampMap(state, aimY + v.vy * flight0, state.map.height);
      }
    }
    hit = spec.accuracy >= 100 ? true : state.rng.chance(spec.accuracy, 100);
    if (!hit) {
      aimX = clampMap(state, aimX + state.rng.nextRange(-MISS_SCATTER_FP, MISS_SCATTER_FP), state.map.width);
      aimY = clampMap(state, aimY + state.rng.nextRange(-MISS_SCATTER_FP, MISS_SCATTER_FP), state.map.height);
    }
  }
  if (spec.jitterFp) {
    aimX = clampMap(state, aimX + state.rng.nextRange(-spec.jitterFp, spec.jitterFp), state.map.width);
    aimY = clampMap(state, aimY + state.rng.nextRange(-spec.jitterFp, spec.jitterFp), state.map.height);
  }

  const dx = aimX - spec.fromX, dy = aimY - spec.fromY;
  const flightTicks = Math.max(1, Math.ceil(isqrt(dx * dx + dy * dy) / spec.speedFpPerTick));
  events.push({
    kind: 'projectileFired', fromId: spec.fromId, targetId: t.id,
    x0: spec.fromX, y0: spec.fromY, x1: aimX, y1: aimY, flightTicks, arc: spec.arc, hit,
  });
  state.projectiles.push({
    attackerId: spec.fromId, player: spec.player, targetId: t.id,
    x: aimX, y: aimY, impactTick: state.tick + flightTicks, hit,
    splashFp: spec.splashFp, attacks: spec.attacks,
  });
}

/** Splash: full damage inside half the radius, half damage out to the edge (falloff). */
function resolveSplash(state: SimState, p: Projectile, events: SimEvent[]): void {
  // units (friendly fire INCLUDED — mangonels hurt everyone's units, even their own)
  state.unitsGrid.queryCircle(p.x, p.y, p.splashFp, queryBuf);
  const victims: Array<{ e: Entity; falloff: boolean }> = [];
  for (const id of queryBuf) {
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.hp <= 0 || e.garrisonedIn !== undefined) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = isqrt(dx * dx + dy * dy);
    if (d > p.splashFp) continue;
    victims.push({ e, falloff: d > (p.splashFp >> 1) });
  }
  // buildings: ENEMY only — splash never damages own/allied buildings (AOE2_REFERENCE)
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.hp <= 0) continue;
    if (e.player === GAIA || !isEnemy(state, p.player, e.player)) continue;
    const size = gameData.buildings[e.defId]?.size ?? 1;
    const d = distToFootprintFp(p.x, p.y, e.tileX, e.tileY, size);
    if (d > p.splashFp) continue;
    victims.push({ e, falloff: d > (p.splashFp >> 1) });
  }
  for (const v of victims) {
    applyRangedHit(state, p.attackerId, p.player, p.x, p.y, p.attacks, v.e, events, v.falloff);
  }
}

function resolveSingle(state: SimState, p: Projectile, events: SimEvent[]): void {
  const t = state.entities.get(p.targetId);
  if (t && t.kind === 'building' && t.hp > 0) {
    applyRangedHit(state, p.attackerId, p.player, p.x, p.y, p.attacks, t, events);
    return;
  }
  // A passed accuracy roll connects wherever the target now stands (AoE2 arrows track
  // their victim); only the mangonel-line splash path resolves at the frozen point.
  if (p.hit && t && t.kind === 'unit' && t.hp > 0 && t.garrisonedIn === undefined) {
    applyRangedHit(state, p.attackerId, p.player, p.x, p.y, p.attacks, t, events);
    return;
  }
  // failed roll (or the target died / garrisoned mid-flight): the stray shot lands at
  // the scatter point and the nearest hostile unit standing there takes it instead
  state.unitsGrid.queryCircle(p.x, p.y, HIT_RADIUS_FP, queryBuf);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of queryBuf) {
    if (id === p.targetId) continue; // already checked above
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.hp <= 0 || e.garrisonedIn !== undefined) continue;
    if (!isEnemy(state, p.player, e.player)) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const dd = dx * dx + dy * dy;
    if (dd > HIT_RADIUS_FP * HIT_RADIUS_FP) continue;
    if (dd < bestD) { bestD = dd; best = e; }
  }
  if (best) applyRangedHit(state, p.attackerId, p.player, p.x, p.y, p.attacks, best, events);
}

/** Land everything whose flight ended this tick (fire order — deterministic). */
export function tickProjectiles(state: SimState, events: SimEvent[]): void {
  if (state.projectiles.length === 0) return;
  const remaining: Projectile[] = [];
  for (const p of state.projectiles) {
    if (state.tick < p.impactTick) { remaining.push(p); continue; }
    if (p.splashFp > 0) resolveSplash(state, p, events);
    else resolveSingle(state, p, events);
  }
  state.projectiles = remaining;
}
