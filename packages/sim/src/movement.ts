// Movement: waypoint following over A*/Dijkstra paths + AoE2-feel local avoidance.
// Units are soft obstacles — they never block tiles, but overlapping units push apart
// (moving or resting), so groups arrive, spread out, and never stack at rest.
// All arithmetic is integer fixed-point; iteration orders are insertion-stable.

import { gameData } from '@bf/data';
import { FP, TICKS_PER_SECOND } from './types';
import type { Entity, EntityId, Fixed } from './types';
import { facingFromDelta, isqrt, isTileWalkableForPlayer } from './internal';
import type { SimState } from './internal';
import { fogOnTileChange } from './fog';
import { resolveUnitStats } from './stats';
import { requestGroupPath, nearestWalkableTileForPlayer } from './path';
import { tileIndex } from './internal';

const ARRIVE_DIST = FP / 2; // within half a tile of the exact target = arrived
const ARRIVE_DIST_SQ = ARRIVE_DIST * ARRIVE_DIST;
const WAYPOINT_SNAP = 96; // advance to next waypoint within 0.375 tile of its center
const UNIT_RADIUS = 64; // 0.25 tile soft-body radius
const SEPARATION_DIST = UNIT_RADIUS * 2;
const MAX_PUSH_PER_TICK = 24;
/** Blocked near the goal for this long -> consider it arrived (group spread arrival). */
const NEAR_STUCK_TICKS = 8;
const NEAR_TARGET_DIST = 4 * FP;
/** Blocked far from the goal -> repath once, then give up. */
const FAR_STUCK_TICKS = 30;

function tryStep(state: SimState, e: Entity, nx: Fixed, ny: Fixed): boolean {
  const tx = Math.floor(nx / FP), ty = Math.floor(ny / FP);
  if (isTileWalkableForPlayer(state, tx, ty, e.player)) { applyPosition(state, e, nx, ny); return true; }
  // slide: keep the walkable axis
  const txOnly = Math.floor(nx / FP);
  if (isTileWalkableForPlayer(state, txOnly, e.tileY, e.player) && nx !== e.x) {
    applyPosition(state, e, nx, e.y); return true;
  }
  const tyOnly = Math.floor(ny / FP);
  if (isTileWalkableForPlayer(state, e.tileX, tyOnly, e.player) && ny !== e.y) {
    applyPosition(state, e, e.x, ny); return true;
  }
  return false;
}

/**
 * Slide a unit straight toward (tx, ty) by at most `maxStepFp`, honoring terrain but
 * without pathing. Combat uses it to close the last fraction of a tile onto a building
 * it is battering: the chase walk stops within ARRIVE_DIST of its ring slot, which is
 * open ground rather than the wall. Returns true if the unit actually moved.
 */
export function stepToward(state: SimState, e: Entity, tx: Fixed, ty: Fixed, maxStepFp: number): boolean {
  if (maxStepFp <= 0) return false;
  const dx = tx - e.x, dy = ty - e.y;
  const dist = isqrt(dx * dx + dy * dy);
  if (dist === 0) return false;
  const step = Math.min(maxStepFp, dist);
  const sx = Math.round(dx * step / dist), sy = Math.round(dy * step / dist);
  if (sx === 0 && sy === 0) return false;
  const beforeX = e.x, beforeY = e.y;
  tryStep(state, e, e.x + sx, e.y + sy);
  return e.x !== beforeX || e.y !== beforeY;
}

function applyPosition(state: SimState, e: Entity, nx: Fixed, ny: Fixed): void {
  if (nx === e.x && ny === e.y) return;
  e.x = nx; e.y = ny;
  const tx = Math.floor(nx / FP), ty = Math.floor(ny / FP);
  state.unitsGrid.move(e.id, nx, ny);
  if (tx !== e.tileX || ty !== e.tileY) {
    e.tileX = tx; e.tileY = ty;
    fogOnTileChange(state, e);
  }
}

export function tickMovement(state: SimState): void {
  followPaths(state);
  separationPass(state);
}

function followPaths(state: SimState): void {
  const arrived: EntityId[] = [];
  for (const [id, m] of state.motion) {
    const e = state.entities.get(id);
    if (!e) { arrived.push(id); continue; }
    if (m.path === null) continue; // pathfinder hasn't answered yet

    // stats layer for everyone — Gaia player 0 has an empty modifier table, so animals
    // move at their def speed (deer 1.2 outruns a hunter; sheep amble at 0.8)
    let speedFp = resolveUnitStats(state, e.player, e.defId).speedFp;
    // rams: each garrisoned infantryman adds def.garrisonSpeedPerUnit (AoE2 +0.05)
    if (e.garrison && e.garrison.length > 0) {
      const perUnit = gameData.units[e.defId]?.garrisonSpeedPerUnit;
      if (perUnit) speedFp += Math.round(e.garrison.length * perUnit * FP / TICKS_PER_SECOND);
    }

    // waypoint target: tile centers along the path, exact coords for the last leg
    let wx: Fixed, wy: Fixed;
    while (true) {
      if (m.pathIndex >= m.path.length) { wx = m.targetX; wy = m.targetY; break; }
      const t = m.path[m.pathIndex];
      wx = (t % state.map.width) * FP + FP / 2;
      wy = ((t / state.map.width) | 0) * FP + FP / 2;
      const ddx = wx - e.x, ddy = wy - e.y;
      if (ddx * ddx + ddy * ddy <= WAYPOINT_SNAP * WAYPOINT_SNAP) { m.pathIndex++; continue; }
      break;
    }

    const dx = wx - e.x, dy = wy - e.y;
    const finalLeg = m.pathIndex >= m.path.length;
    if (finalLeg) {
      const tdx = m.targetX - e.x, tdy = m.targetY - e.y;
      if (tdx * tdx + tdy * tdy <= ARRIVE_DIST_SQ) { arrived.push(id); finishMove(e); continue; }
    }

    const dist = isqrt(dx * dx + dy * dy);
    if (dist === 0) { m.pathIndex++; continue; }
    const step = Math.min(speedFp, dist);
    const sx = Math.round(dx * step / dist), sy = Math.round(dy * step / dist);
    const beforeX = e.x, beforeY = e.y;
    tryStep(state, e, e.x + sx, e.y + sy);
    const movedX = e.x - beforeX, movedY = e.y - beforeY;
    if (movedX !== 0 || movedY !== 0) e.facing = facingFromDelta(movedX, movedY);

    // Stuck detection on NET movement since last tick (separation included): a unit
    // whose own step succeeds but is shoved straight back by the crowd each tick made
    // no progress — measuring only the step let head-on jams livelock forever.
    const netX = e.x - m.lastX, netY = e.y - m.lastY;
    m.lastX = e.x;
    m.lastY = e.y;
    const movedSq = netX * netX + netY * netY;
    const minMove = Math.max(1, speedFp >> 2);
    if (movedSq < minMove * minMove) {
      m.stuckTicks++;
      const tdx = m.targetX - e.x, tdy = m.targetY - e.y;
      const nearTarget = tdx * tdx + tdy * tdy <= NEAR_TARGET_DIST * NEAR_TARGET_DIST;
      if (nearTarget && m.stuckTicks >= NEAR_STUCK_TICKS) {
        arrived.push(id); finishMove(e); continue; // spread arrival: crowd ahead already there
      }
      if (!nearTarget && m.stuckTicks >= FAR_STUCK_TICKS) {
        if (m.repaths === 0) {
          m.repaths = 1;
          m.stuckTicks = 0;
          const goal = nearestWalkableTileForPlayer(
            state, e.player, Math.floor(m.targetX / FP), Math.floor(m.targetY / FP),
          );
          if (goal) requestGroupPath(state, tileIndex(state.map, goal.x, goal.y), [id]);
          else { arrived.push(id); finishMove(e); }
        } else {
          arrived.push(id); finishMove(e);
        }
      }
    } else {
      m.stuckTicks = 0;
    }
  }
  for (const id of arrived) state.motion.delete(id);
}

function finishMove(e: Entity): void {
  e.activity = 'idle'; // intent (attackMove/gather) stays recorded for wave-2 systems
}

/** Push-apart between overlapping units — applies to everyone, so nobody rests stacked. */
function separationPass(state: SimState): void {
  const neighbors: EntityId[] = [];
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.garrisonedIn !== undefined) continue;
    if (e.hp <= 0) continue; // carcasses are scenery, not soft bodies
    // unsorted query is safe here: pushX/pushY are commutative integer sums over the
    // neighbor SET, so enumeration order cannot affect the result (perf: see spatial.ts)
    state.unitsGrid.queryCircleUnsorted(e.x, e.y, SEPARATION_DIST, neighbors);
    const eMoving = state.motion.has(e.id);
    let pushX = 0, pushY = 0;
    for (let i = 0; i < neighbors.length; i++) {
      const oid = neighbors[i];
      if (oid === e.id) continue;
      const o = state.entities.get(oid);
      if (!o) continue;
      // Friendly traffic is non-blocking while either participant is walking.
      // This prevents one mover from shoving an entire friendly queue forward and
      // being pushed back every tick. Once both stop, separation resumes and gently
      // fans out any overlap left by the pass-through.
      if (e.player === o.player && (eMoving || state.motion.has(o.id))) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= SEPARATION_DIST * SEPARATION_DIST) continue;
      const dist = isqrt(distSq);
      if (dist === 0) {
        // perfectly stacked: deterministic tie-break by id
        const dir = e.id < oid ? 1 : -1;
        pushX += dir * 8; pushY += dir * 8;
        continue;
      }
      const overlap = SEPARATION_DIST - dist;
      pushX += Math.round(dx * overlap / (dist * 2));
      pushY += Math.round(dy * overlap / (dist * 2));
    }
    if (pushX === 0 && pushY === 0) continue;
    pushX = Math.max(-MAX_PUSH_PER_TICK, Math.min(MAX_PUSH_PER_TICK, pushX));
    pushY = Math.max(-MAX_PUSH_PER_TICK, Math.min(MAX_PUSH_PER_TICK, pushY));
    tryStep(state, e, e.x + pushX, e.y + pushY);
  }
}
