// Farms (GDD Resources & Economy): a completed farm building is a gatherable food
// source for exactly one farmer (the slot rule lives in gather.ts). amountLeft on the
// entity is the remaining food; 0 = fallow — the renderer reads that straight off
// building state. Reseeding costs the full wood cost again, either explicitly
// (reseedFarm) or automatically the moment a farm expires via the per-player
// auto-reseed toggle (queueReseed, the GDD Mill/TC reseed queue).

import { gameData } from '@bf/data';
import type { BuildingDef } from '@bf/data';
import type { Command, Entity, SimEvent, Stockpile } from './types';
import { adjacentToFootprint } from './internal';
import type { SimState } from './internal';
import { resolveFarmFood } from './stats';

type ReseedCmd = Extract<Command, { kind: 'reseedFarm' }>;
type QueueReseedCmd = Extract<Command, { kind: 'queueReseed' }>;

export function isFarm(e: Entity): boolean {
  return e.kind === 'building' && gameData.buildings[e.defId]?.providesFood !== undefined;
}

function payCost(s: Stockpile, def: BuildingDef): boolean {
  const food = def.cost.food ?? 0, wood = def.cost.wood ?? 0;
  const gold = def.cost.gold ?? 0, stone = def.cost.stone ?? 0;
  if (s.food < food || s.wood < wood || s.gold < gold || s.stone < stone) return false;
  s.food -= food; s.wood -= wood; s.gold -= gold; s.stone -= stone;
  return true;
}

/**
 * Re-task an adjacent IDLE own villager onto a just-reseeded farm (an ex-farmer who
 * was released before the fallow-wait behavior existed, or any bystander). No-op when
 * some worker already intends this farm (a waiting farmer resumes on its own).
 */
function attachIdleFarmer(state: SimState, farm: Entity): void {
  const size = gameData.buildings[farm.defId]?.size ?? 1;
  for (const u of state.entities.values()) {
    if (u.kind !== 'unit' || u.hp <= 0) continue;
    if (u.intent?.kind === 'gather' && u.intent.targetId === farm.id) return; // taken
  }
  for (const u of state.entities.values()) {
    if (u.kind !== 'unit' || u.player !== farm.player || u.hp <= 0) continue;
    if (u.garrisonedIn !== undefined || u.intent !== undefined || u.activity !== 'idle') continue;
    if (!gameData.units[u.defId]?.gather) continue;
    if (state.fleeing.has(u.id) || state.combat.has(u.id) || state.garrisoning.has(u.id)) continue;
    if (!adjacentToFootprint(u, farm.tileX, farm.tileY, size)) continue;
    u.intent = { kind: 'gather', targetId: farm.id }; // gather pass books it lazily
    return; // farms feed exactly one farmer
  }
}

/** Explicit reseed of a fallow farm at full cost. */
export function handleReseedFarm(state: SimState, cmd: ReseedCmd): void {
  const farm = state.entities.get(cmd.farmId);
  if (!farm || !isFarm(farm) || farm.player !== cmd.player || farm.hp <= 0) return;
  if ((farm.buildProgress ?? 1000) < 1000) return;
  if ((farm.amountLeft ?? 0) > 0) return; // only fallow farms reseed
  const def = gameData.buildings[farm.defId];
  const player = state.players[cmd.player];
  if (!player || !payCost(player.stockpile, def)) return;
  farm.amountLeft = resolveFarmFood(state, cmd.player, def);
  attachIdleFarmer(state, farm);
}

/** Toggle the per-player auto-reseed queue (GDD Mill/TC toggle). */
export function handleQueueReseed(state: SimState, cmd: QueueReseedCmd): void {
  const player = state.players[cmd.player];
  if (!player) return;
  player.autoReseed = cmd.enabled;
  if (!cmd.enabled) return;
  // sweep farms ALREADY fallow when the toggle turns on: reseed what the bank affords
  // (waiting farmers resume on their own the moment amountLeft comes back)
  for (const farm of state.entities.values()) {
    if (farm.player !== cmd.player || farm.hp <= 0 || !isFarm(farm)) continue;
    if ((farm.buildProgress ?? 1000) < 1000) continue;
    if ((farm.amountLeft ?? 0) > 0) continue;
    const def = gameData.buildings[farm.defId];
    if (!payCost(player.stockpile, def)) break; // same cost for every farm: bank is dry
    farm.amountLeft = resolveFarmFood(state, cmd.player, def);
  }
}

/**
 * Called by the gathering system the moment a farm's food hits zero. With auto-reseed
 * on (and wood in the bank) the farm replants instantly and the farmer never stops;
 * otherwise it goes fallow and a resourceDepleted event fires.
 */
export function onFarmExhausted(state: SimState, farm: Entity, events: SimEvent[]): void {
  const def = gameData.buildings[farm.defId];
  const player = state.players[farm.player];
  if (def && player && player.autoReseed && payCost(player.stockpile, def)) {
    farm.amountLeft = resolveFarmFood(state, farm.player, def);
    return;
  }
  events.push({ kind: 'resourceDepleted', id: farm.id, resourceType: 'food' });
}
