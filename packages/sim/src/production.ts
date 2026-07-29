// Production: per-building train queues (cap 15). Costs are deducted when queued and
// refunded exactly on cancel; population is reserved when an item reaches the front
// (AoE2 "housed" stall) and released on cancel/death. Spawned units step to a free
// adjacent tile and walk to the rally; rallies onto a resource/enemy record intent
// for the wave-2 gather/attack systems.

import { gameData } from '@bf/data';
import { GAIA } from './types';
import type { Entity, SimEvent, TrainQueueItem } from './types';
import type { SimState } from './internal';
import { findFreeAdjacentTile, spawnEntity } from './entities';
import { resolveUnitStats } from './stats';
import { orderMove } from './path';

export const TRAIN_QUEUE_CAP = 15;

export function tickProduction(state: SimState, events: SimEvent[]): void {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || !e.trainQueue || e.trainQueue.length === 0) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    const player = state.players[e.player];
    if (!player || player.defeated) continue;

    const item = e.trainQueue[0];
    const stats = resolveUnitStats(state, e.player, item.defId);

    if (!item.started) {
      if (player.pop + stats.pop > player.popCap) continue; // housed — stall at the front
      item.started = true;
      player.pop += stats.pop; // reserve
    }

    if (item.ticksLeft > 0) item.ticksLeft--;
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
      if (target.kind === 'resource' || (target.player === GAIA && gameData.units[target.defId]?.huntable)) {
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
  if (item.started) {
    const stats = resolveUnitStats(state, playerId, item.defId);
    player.pop -= stats.pop;
  }
}
