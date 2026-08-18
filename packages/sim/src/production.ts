// Production: per-building train queues (cap 15) SHARED with research (AoE2: a tech
// occupies the same queue — a TC researching Loom stalls villager production). Costs
// are deducted when queued and refunded exactly on cancel; population is reserved when
// a unit item reaches the front (AoE2 "housed" stall) and released on cancel/death
// (tech items reserve none). Spawned units step to a free adjacent tile and walk to
// the rally; rallies onto a resource/enemy record gather/attack intent.

import { gameData } from '@bf/data';
import { GAIA } from './types';
import type { Entity, SimEvent, TrainQueueItem } from './types';
import type { SimState } from './internal';
import { findFreeAdjacentTile, spawnEntity } from './entities';
import { resolveUnitStats } from './stats';
import { orderMove } from './path';
import { completeResearch } from './research';

export const TRAIN_QUEUE_CAP = 15;

export function tickProduction(state: SimState, events: SimEvent[]): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || !e.trainQueue) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    const player = state.players[e.player];
    if (!player || player.defeated) continue;

    const item = e.trainQueue[0] as TrainQueueItem | undefined;
    if (!item?.techId && e.research) e.research = undefined; // cancelled/reordered research
    if (!item) continue;

    if (item.techId) {
      // research occupies the queue: no pop reservation, ticks straight down
      item.started = true;
      if (item.ticksLeft > 0) item.ticksLeft = Math.max(0, item.ticksLeft - state.productionSpeed);
      if (item.ticksLeft > 0) {
        e.research = { techId: item.techId, ticksLeft: item.ticksLeft, totalTicks: item.totalTicks };
        continue;
      }
      e.trainQueue.shift();
      e.research = undefined;
      completeResearch(state, e.player, item.techId, events);
      continue;
    }

    const stats = resolveUnitStats(state, e.player, item.defId);

    if (!item.started) {
      if (player.pop + stats.pop > player.popCap) continue; // housed — stall at the front
      item.started = true;
      player.pop += stats.pop; // reserve
    }

    if (item.ticksLeft > 0) item.ticksLeft = Math.max(0, item.ticksLeft - state.productionSpeed);
    if (item.ticksLeft > 0) continue;

    // spawn (retries every tick if the building is fully ringed)
    const def = gameData.buildings[e.defId];
    const spot = findFreeAdjacentTile(state, e.tileX, e.tileY, def?.size ?? 1);
    if (!spot) continue;
    const unit = spawnEntity(state, {
      defId: item.defId, player: e.player, tileX: spot.x, tileY: spot.y, countsPop: false,
    });
    if (!unit) { e.trainQueue.shift(); continue; }
    e.trainQueue.shift();
    events.push({ kind: 'entitySpawned', id: unit.id, defId: unit.defId, player: unit.player });
    events.push({ kind: 'unitTrained', id: unit.id, defId: unit.defId, player: unit.player, buildingId: e.id });
    sendToRally(state, e, unit);
  }
}

function sendToRally(state: SimState, building: Entity, unit: Entity): void {
  const rally = building.rally;
  if (!rally) return;
  if (rally.targetId !== undefined) {
    const target = state.entities.get(rally.targetId);
    if (target) {
      const isOwnFarm = target.kind === 'building' && target.player === unit.player &&
        gameData.buildings[target.defId]?.providesFood !== undefined;
      if (target.kind === 'resource' || isOwnFarm ||
        (target.player === GAIA && gameData.units[target.defId]?.huntable)) {
        unit.intent = { kind: 'gather', targetId: target.id };
      } else if (target.player !== GAIA && target.player !== unit.player) {
        unit.intent = { kind: 'attackTarget', targetId: target.id };
      }
      orderMove(state, [unit.id], target.x, target.y);
      return;
    }
  }
  orderMove(state, [unit.id], rally.x, rally.y);
}

/** Refund + release everything in a building's queue (delete/destroy). */
export function refundQueue(state: SimState, building: Entity): void {
  if (!building.trainQueue) return;
  const player = state.players[building.player];
  if (!player) { building.trainQueue.length = 0; return; }
  for (const item of building.trainQueue) {
    refundItem(state, building.player, item);
  }
  building.trainQueue.length = 0;
}

export function refundItem(state: SimState, playerId: number, item: TrainQueueItem): void {
  const player = state.players[playerId];
  if (!player) return;
  if (item.paid) {
    player.stockpile.food += item.paid.food ?? 0;
    player.stockpile.wood += item.paid.wood ?? 0;
    player.stockpile.gold += item.paid.gold ?? 0;
    player.stockpile.stone += item.paid.stone ?? 0;
  }
  if (item.started && !item.techId) { // research reserves no population
    const stats = resolveUnitStats(state, playerId, item.defId);
    player.pop -= stats.pop;
  }
}
