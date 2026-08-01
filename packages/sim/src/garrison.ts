// Full garrison system (GDD Combat): explicit garrison/ungarrison commands with
// per-def capacities and AoE2 eligibility (rams: infantry only; defensive buildings:
// villagers + foot units; production buildings: units they train), walk-to-enter, and
// slow healing inside buildings (def.garrisonHealRate; nothing heals inside rams).
// Villager town-bell flee entry lives in flee.ts and shares garrisonUnit().

import { gameData } from '@bf/data';
import type { BuildingDef, UnitDef } from '@bf/data';
import { FP } from './types';
import type { Command, Entity, EntityId, SimEvent } from './types';
import { adjacentToFootprint } from './internal';
import type { SimState } from './internal';
import { garrisonUnit } from './flee';
import { ejectGarrison } from './damage';
import { orderMove } from './path';
import { ACC_PER_UNIT, RES_SCALE } from './gather';

/** Give up entering after this many failed approaches. */
const GARRISON_RETRIES = 4;

type GarrisonCmd = Extract<Command, { kind: 'garrison' }>;
type UngarrisonCmd = Extract<Command, { kind: 'ungarrison' }>;

function hostCapacity(host: Entity): number {
  if (host.kind === 'building') return gameData.buildings[host.defId]?.garrisonCapacity ?? 0;
  return gameData.units[host.defId]?.garrisonCapacity ?? 0;
}

function hostRoom(host: Entity): number {
  return hostCapacity(host) - (host.garrison?.length ?? 0);
}

/** AoE2 eligibility: who may enter what. */
export function canGarrisonIn(unitDef: UnitDef, host: Entity): boolean {
  if (host.kind === 'unit') {
    // rams take infantry only (GDD)
    return unitDef.classes.includes('infantry');
  }
  const def: BuildingDef | undefined = gameData.buildings[host.defId];
  if (!def?.garrisonCapacity) return false;
  if (def.attacks && def.attacks.length > 0) {
    // defensive buildings (TC/towers/castle): villagers + foot units, no cavalry/siege
    return !unitDef.classes.includes('cavalry') && !unitDef.classes.includes('siege');
  }
  // production buildings garrison the units they train (monastery: monks, etc.)
  return def.trains !== undefined && def.trains.includes(unitDef.id);
}

function validHost(state: SimState, player: number, host: Entity | undefined): host is Entity {
  if (!host || host.hp <= 0 || host.player !== player) return false;
  if (host.kind === 'building') return (host.buildProgress ?? 1000) >= 1000 && hostCapacity(host) > 0;
  return host.kind === 'unit' && hostCapacity(host) > 0 && host.garrisonedIn === undefined;
}

export function handleGarrison(state: SimState, cmd: GarrisonCmd): void {
  const host = state.entities.get(cmd.targetId);
  if (!validHost(state, cmd.player, host)) return;
  const seen = new Set<EntityId>();
  const movers: EntityId[] = [];
  for (const id of cmd.units) {
    if (seen.has(id) || id === host.id) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    const def = gameData.units[e.defId];
    if (!def || !canGarrisonIn(def, host)) continue;
    e.intent = undefined;
    e.targetId = undefined;
    state.gather.delete(id);
    state.fleeing.delete(id);
    state.combat.delete(id);
    state.buildRetries.delete(id);
    const monk = state.monks.get(id);
    if (monk) { monk.convertTargetId = undefined; monk.healTargetId = undefined; }
    state.garrisoning.set(id, { targetId: host.id, retries: 0 });
    movers.push(id);
  }
  if (movers.length > 0) orderMove(state, movers, host.x, host.y);
}

/** Ungarrison ALL occupants of a building or ram (AoE2 "ungarrison" button). */
export function handleUngarrison(state: SimState, cmd: UngarrisonCmd): void {
  const host = state.entities.get(cmd.buildingId);
  if (!host || host.player !== cmd.player || host.hp <= 0) return;
  if (!host.garrison || host.garrison.length === 0) return;
  const size = host.kind === 'building' ? gameData.buildings[host.defId]?.size ?? 1 : 1;
  ejectGarrison(state, host, size);
}

/** Per-tick: walkers enter on arrival; garrisoned units heal inside buildings. */
export function tickGarrison(state: SimState, events: SimEvent[]): void {
  void events;
  // 1) explicit garrison walks
  for (const [id, gw] of state.garrisoning) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0 || e.garrisonedIn !== undefined) {
      state.garrisoning.delete(id);
      continue;
    }
    const host = state.entities.get(gw.targetId);
    if (!validHost(state, e.player, host) || hostRoom(host!) <= 0) {
      state.garrisoning.delete(id);
      state.motion.delete(id);
      e.activity = 'idle';
      continue;
    }
    const size = host.kind === 'building' ? gameData.buildings[host.defId]?.size ?? 1 : 1;
    if (adjacentToFootprint(e, host.tileX, host.tileY, size)) {
      garrisonUnit(state, e, host);
      state.garrisoning.delete(id);
      continue;
    }
    if (host.kind === 'unit') {
      // moving host (ram): re-aim when the walk target went stale
      const m = state.motion.get(id);
      if (!m || (m.targetX - host.x) ** 2 + (m.targetY - host.y) ** 2 > FP * FP) {
        orderMove(state, [id], host.x, host.y);
      }
    } else if (!state.motion.has(id)) {
      if (gw.retries >= GARRISON_RETRIES) {
        state.garrisoning.delete(id);
        e.activity = 'idle';
        continue;
      }
      gw.retries++;
      orderMove(state, [id], host.x, host.y);
    }
  }

  // 2) garrison healing (buildings only; rams have no garrisonHealRate)
  for (const host of state.entities.values()) {
    if (host.kind !== 'building' || host.hp <= 0) continue;
    if (!host.garrison || host.garrison.length === 0) continue;
    const rate = gameData.buildings[host.defId]?.garrisonHealRate;
    if (!rate) continue;
    const inc = Math.round(rate * RES_SCALE);
    for (const gid of host.garrison) {
      const u = state.entities.get(gid);
      if (!u || u.hp <= 0) continue;
      if (u.hp >= u.maxHp) { state.healAcc.delete(gid); continue; }
      let acc = (state.healAcc.get(gid) ?? 0) + inc;
      while (acc >= ACC_PER_UNIT && u.hp < u.maxHp) {
        acc -= ACC_PER_UNIT;
        u.hp++;
      }
      state.healAcc.set(gid, acc);
    }
  }
}
