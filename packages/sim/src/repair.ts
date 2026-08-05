// Repair (AoE2 semantics): villagers restore a COMPLETED building's HP. A full repair
// from zero HP costs half the building's build cost, trickled out in whole resource
// units as HP comes back; when the stockpile cannot cover the next unit the repair
// stops and the villagers stand down. Rate: one villager repairs at construction speed
// (maxHp over buildTime); extra villagers stack linearly (unlike the 3T/(N+2)
// construction rule — this matches AoE2).

import { gameData } from '@bf/data';
import { TICKS_PER_SECOND } from './types';
import type { Command, Entity, EntityId, ResourceType, SimEvent } from './types';
import { adjacentToFootprint, facingFromDelta } from './internal';
import type { RepairSite, SimState } from './internal';
import { orderMove } from './path';
import { cancelQueuedBuilds } from './construction';

/** Scale for HP + cost-debt accumulators. */
const REPAIR_SCALE = 1000;
/** Give up on a repairer that repeatedly fails to reach the site. */
const MAX_APPROACH_RETRIES = 3;

const RES_TYPES: readonly ResourceType[] = ['food', 'wood', 'gold', 'stone'];

type RepairCmd = Extract<Command, { kind: 'repair' }>;

export function handleRepair(state: SimState, cmd: RepairCmd, cancelBuildQueue = true): void {
  const b = state.entities.get(cmd.targetId);
  if (!b || b.kind !== 'building' || b.player !== cmd.player || b.hp <= 0) return;
  // A tapped FOUNDATION resumes construction, it is not repaired (AoE2 tap semantics):
  // the HUD issues `repair` for any damaged-or-unfinished own building and the sim
  // routes it — build intent for foundations (tickConstruction picks the builders up),
  // repair intent for completed buildings (integrator fix, wave 2).
  const isFoundation = (b.buildProgress ?? 1000) < 1000;
  if (!isFoundation && b.hp >= b.maxHp) return;
  const movers: EntityId[] = [];
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    if (!gameData.units[e.defId]?.buildRate) continue; // builders repair
    e.intent = { kind: isFoundation ? 'build' : 'repair', targetId: b.id };
    e.targetId = undefined;
    state.fleeing.delete(id);
    state.gather.delete(id);
    state.buildRetries.delete(id);
    state.combat.delete(id);
    state.garrisoning.delete(id);
    movers.push(id);
  }
  if (movers.length > 0) {
    if (cancelBuildQueue) cancelQueuedBuilds(state, movers);
    orderMove(state, movers, b.x, b.y);
  }
}

function releaseRepairer(state: SimState, e: Entity): void {
  e.intent = undefined;
  e.targetId = undefined;
  state.motion.delete(e.id);
  state.buildRetries.delete(e.id);
  // A site can finish while one member of a large crew is still approaching.
  // Release both the hands already hammering and every walker still en route.
  e.activity = 'idle';
}

function releaseAllOn(state: SimState, siteId: EntityId): void {
  for (const e of state.entities.values()) {
    if (e.kind === 'unit' && e.intent?.kind === 'repair' && e.intent.targetId === siteId) {
      releaseRepairer(state, e);
    }
  }
}

/** Per-tick: adjacent repairers restore HP; costs trickle from the stockpile. */
export function tickRepair(state: SimState, events: SimEvent[]): void {
  void events; // no repair-specific events defined (renderer reads activity + hp)
  // 1) resolve repairer intents -> adjacent-repairer count per site
  const crews = new Map<EntityId, number>();
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.intent?.kind !== 'repair') continue;
    const site = state.entities.get(e.intent.targetId);
    if (!site || site.kind !== 'building' || site.hp <= 0 ||
      (site.buildProgress ?? 1000) < 1000 || site.hp >= site.maxHp) {
      releaseRepairer(state, e);
      continue;
    }
    const size = gameData.buildings[site.defId]?.size ?? 1;
    if (adjacentToFootprint(e, site.tileX, site.tileY, size)) {
      state.motion.delete(e.id);
      state.buildRetries.delete(e.id);
      e.activity = 'repairing';
      e.facing = facingFromDelta(site.x - e.x, site.y - e.y);
      crews.set(site.id, (crews.get(site.id) ?? 0) + 1);
    } else if (!state.motion.has(e.id)) {
      const tries = state.buildRetries.get(e.id) ?? 0;
      if (tries >= MAX_APPROACH_RETRIES) { releaseRepairer(state, e); continue; }
      state.buildRetries.set(e.id, tries + 1);
      orderMove(state, [e.id], site.x, site.y);
    }
  }

  // 2) accrue HP + trickle costs per site
  for (const [siteId, n] of crews) {
    const site = state.entities.get(siteId)!;
    const def = gameData.buildings[site.defId];
    if (!def) continue;
    const player = state.players[site.player];
    const buildTicks = Math.max(1, Math.round(def.buildTime * TICKS_PER_SECOND));
    let rp = state.repairs.get(siteId);
    if (!rp) {
      rp = { acc: 0, debt: { food: 0, wood: 0, gold: 0, stone: 0 } } satisfies RepairSite;
      state.repairs.set(siteId, rp);
    }
    rp.acc += n * Math.max(1, Math.round((site.maxHp * REPAIR_SCALE) / buildTicks));

    // scaled cost debt per restored HP: full-HP repair costs half the build cost
    const debtPerHp: Partial<Record<ResourceType, number>> = {};
    for (const res of RES_TYPES) {
      const c = def.cost[res] ?? 0;
      if (c > 0) debtPerHp[res] = Math.round((c * REPAIR_SCALE) / (2 * site.maxHp));
    }

    let halted = false;
    while (rp.acc >= REPAIR_SCALE && site.hp < site.maxHp) {
      // can the next HP be paid for?
      for (const res of RES_TYPES) {
        const inc = debtPerHp[res] ?? 0;
        if (inc > 0 && rp.debt[res] + inc >= REPAIR_SCALE && player.stockpile[res] <= 0) {
          halted = true;
          break;
        }
      }
      if (halted) break;
      rp.acc -= REPAIR_SCALE;
      site.hp++;
      for (const res of RES_TYPES) {
        const inc = debtPerHp[res] ?? 0;
        if (inc <= 0) continue;
        rp.debt[res] += inc;
        while (rp.debt[res] >= REPAIR_SCALE) {
          rp.debt[res] -= REPAIR_SCALE;
          player.stockpile[res]--;
        }
      }
    }
    if (rp.acc > REPAIR_SCALE) rp.acc = REPAIR_SCALE; // no banking while halted

    if (site.hp >= site.maxHp) {
      state.repairs.delete(siteId);
      releaseAllOn(state, siteId);
    } else if (halted) {
      releaseAllOn(state, siteId); // out of resources: stand down (AoE2 stops the repair)
    }
  }
}
