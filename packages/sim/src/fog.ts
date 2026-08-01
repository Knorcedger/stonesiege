// Fog of war. Per vision group (team, or solo player) we keep a Uint16 LOS-stamp count
// grid plus the public Uint8Array visibility grid (0 unexplored / 1 explored / 2 visible).
// Allied players literally share the same arrays. Stamps are precomputed circular masks
// per LOS radius; updates are incremental (spawn / tile-crossing / death only).

import { gameData } from '@bf/data';
import { GAIA } from './types';
import type { Entity } from './types';
import { inBounds } from './internal';
import type { SimState } from './internal';
import { resolveUnitStats } from './stats';

/** Precomputed (dx, dy) offset pairs per radius; module-level cache is pure data. */
const maskCache = new Map<number, Int16Array>();

export function circleMask(r: number): Int16Array {
  let mask = maskCache.get(r);
  if (mask) return mask;
  const pts: number[] = [];
  const limit = r * r + r; // slightly rounded circle, AoE2-ish
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= limit) { pts.push(dx, dy); }
    }
  }
  mask = new Int16Array(pts);
  maskCache.set(r, mask);
  return mask;
}

function stampAdd(state: SimState, group: number, cx: number, cy: number, r: number): void {
  const g = state.vision[group];
  const { width } = state.map;
  const mask = circleMask(r);
  for (let i = 0; i < mask.length; i += 2) {
    const x = cx + mask[i], y = cy + mask[i + 1];
    if (!inBounds(state.map, x, y)) continue;
    const t = y * width + x;
    if (++g.counts[t] === 1) g.visibility[t] = 2;
  }
}

function stampRemove(state: SimState, group: number, cx: number, cy: number, r: number): void {
  const g = state.vision[group];
  const { width } = state.map;
  const mask = circleMask(r);
  for (let i = 0; i < mask.length; i += 2) {
    const x = cx + mask[i], y = cy + mask[i + 1];
    if (!inBounds(state.map, x, y)) continue;
    const t = y * width + x;
    if (--g.counts[t] === 0) g.visibility[t] = 1; // stays explored
  }
}

/** LOS radius + stamp center for an entity (buildings see from footprint center). */
function visionParams(state: SimState, e: Entity): { cx: number; cy: number; r: number } | null {
  if (e.player === GAIA) return null;
  if (e.kind === 'unit') {
    if (!gameData.units[e.defId]) return null;
    // through the stats layer so civ/tech LOS modifiers apply (stamp radius refreshes
    // on the next tile change after a wave-2 LOS tech; acceptable staleness)
    return { cx: e.tileX, cy: e.tileY, r: resolveUnitStats(state, e.player, e.defId).los };
  }
  if (e.kind === 'building') {
    const def = gameData.buildings[e.defId];
    if (!def) return null;
    const half = def.size >> 1;
    const los = def.los ?? def.range ?? 4;
    return { cx: e.tileX + half, cy: e.tileY + half, r: Math.max(0, Math.round(los)) + half };
  }
  return null;
}

export function fogOnSpawn(state: SimState, e: Entity): void {
  const p = visionParams(state, e);
  if (!p) return;
  const group = state.visionGroupOf[e.player];
  stampAdd(state, group, p.cx, p.cy, p.r);
  state.visionStamps.set(e.id, { group, cx: p.cx, cy: p.cy, r: p.r });
}

export function fogOnDeath(state: SimState, e: Entity): void {
  const s = state.visionStamps.get(e.id);
  if (!s) return;
  stampRemove(state, s.group, s.cx, s.cy, s.r);
  state.visionStamps.delete(e.id);
}

/** Call when a unit crosses a tile boundary. */
export function fogOnTileChange(state: SimState, e: Entity): void {
  const s = state.visionStamps.get(e.id);
  if (!s) return;
  if (s.cx === e.tileX && s.cy === e.tileY) return;
  // add first so tiles covered by both stamps never flicker to "explored"
  stampAdd(state, s.group, e.tileX, e.tileY, s.r);
  stampRemove(state, s.group, s.cx, s.cy, s.r);
  s.cx = e.tileX;
  s.cy = e.tileY;
}

/**
 * Snapshot restore: rebuild every vision group's LOS counts (and its 'visible' marks)
 * by re-applying the active stamp set. Precondition: all counts are zero and visibility
 * holds only 0/1 (unexplored/explored). This is exact, not approximate: counts is BY
 * CONSTRUCTION the sum of the circle masks of the stamps in state.visionStamps
 * (stampAdd/stampRemove are paired precisely through that map), and visibility==2 iff
 * counts>0 (stampAdd sets 2 on 0→1, stampRemove sets 1 on 1→0, nothing else writes 2).
 */
export function reapplyVisionStamps(state: SimState): void {
  for (const s of state.visionStamps.values()) stampAdd(state, s.group, s.cx, s.cy, s.r);
}

/** Mark the whole map explored for every player (scenario revealAll). */
export function revealAll(state: SimState): void {
  for (const g of state.vision) {
    for (let i = 0; i < g.visibility.length; i++) {
      if (g.visibility[i] === 0) g.visibility[i] = 1;
    }
  }
}
