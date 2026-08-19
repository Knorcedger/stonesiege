// Command intake. Every kind in the Command union dispatches to its system handler.
// Illegal commands are dropped silently — the sim never throws on player/AI input.
// Also home of defeat handling: resign, the per-tick GDD conquest elimination check
// (no TC + no villagers + no production buildings = defeated), and victory detection.

import { gameData } from '@bf/data';
import { AGES, GAIA, isProductionSpeed } from './types';
import type { Command, Entity, EntityId, PlayerId, SimEvent } from './types';
import type { SimState } from './internal';
import { removeEntity } from './entities';
import { orderMove } from './path';
import { resolveUnitStats } from './stats';
import { refundItem, refundQueue, TRAIN_QUEUE_CAP } from './production';
import { cancelQueuedBuilds, handleBuild, refundFoundation } from './construction';
import { handleGather } from './gather';
import { handleRepair } from './repair';
import { handleQueueReseed, handleReseedFarm } from './farms';
import { handleAttack, handlePackCommand } from './combat';
import { handleGarrison, handleTownBell, handleUngarrison } from './garrison';
import { handleConvert, handleHeal } from './monks';
import { handleCancelResearch, handleResearch, isUnitEnabled, isUpgradedAway } from './research';
import { handleMarketTrade } from './market';
import { ejectGarrison } from './damage';
import { orderFormationMove } from './formations';
import { handleCastAbility } from './abilities';

type Handler<K extends Command['kind']> =
  (state: SimState, cmd: Extract<Command, { kind: K }>, events: SimEvent[]) => void;

function validPlayer(state: SimState, player: PlayerId): boolean {
  return (
    Number.isInteger(player) &&
    player > GAIA &&
    player < state.players.length &&
    !state.players[player].defeated
  );
}

const NUMERIC_FIELDS = [
  'x', 'y', 'tileX', 'tileY', 'targetId', 'buildingId', 'entityId', 'farmId', 'index',
  'amount', 'multiplier', 'unitId',
] as const;
const RESOURCE_FIELDS = ['sell', 'buy'] as const;
const RESOURCES = new Set(['food', 'wood', 'gold', 'stone']);
const own = (table: object, key: unknown): boolean =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

/** Fields each kind's handler dereferences without its own presence check. */
const REQUIRED: Record<Command['kind'], readonly string[]> = {
  move: ['units', 'x', 'y'], attackMove: ['units', 'x', 'y'],
  attack: ['units', 'targetId'], gather: ['units', 'targetId'], repair: ['units', 'targetId'],
  garrison: ['units', 'targetId'], convert: ['units', 'targetId'], heal: ['units', 'targetId'],
  build: ['units', 'defId', 'tileX', 'tileY'], stop: ['units'], pack: ['units'], unpack: ['units'],
  train: ['buildingId', 'defId'], cancelTrain: ['buildingId', 'index'],
  research: ['buildingId', 'techId'], cancelResearch: ['buildingId'],
  setRally: ['buildingId', 'x', 'y'], townBell: ['buildingId'], ungarrison: ['buildingId'],
  deleteEntity: ['entityId'], reseedFarm: ['farmId'], queueReseed: [],
  setProductionSpeed: ['multiplier'],
  marketTrade: ['sell', 'buy', 'amount'], castAbility: ['unitId', 'abilityId', 'x', 'y'], resign: [],
};

/**
 * Trust boundary for the command payload itself. The kind is already known-good;
 * this rejects malformed field shapes so no handler receives a missing/non-iterable
 * `units`, a prototype-chain def id (`__proto__`, `constructor`), or a NaN index.
 * Enforces per-kind required fields, then validates every present field.
 */
function wellFormedCommand(kind: Command['kind'], cmd: Record<string, unknown>): boolean {
  for (const f of REQUIRED[kind]) {
    if (!(f in cmd)) return false;
  }
  if ('units' in cmd) {
    const u = cmd.units;
    if (!Array.isArray(u) || u.some((id) => !Number.isInteger(id))) return false;
  }
  // TypeScript optional properties are commonly present with the value
  // `undefined` when commands are assembled from UI state. Treat that exactly
  // like an omitted field while still rejecting every other invalid value.
  if ('queue' in cmd && cmd.queue !== undefined && typeof cmd.queue !== 'boolean') return false;
  if ('formation' in cmd && cmd.formation !== undefined && cmd.formation !== 'line'
    && cmd.formation !== 'rectangle' && cmd.formation !== 'wedge') return false;
  // The sim is integer-only (positions are fixed-point ints): a float coord or
  // index would land a non-integer into state and break the determinism/snapshot
  // contract, so reject non-integers here, not merely non-finite values.
  for (const f of NUMERIC_FIELDS) {
    if (f in cmd && !Number.isInteger(cmd[f] as number)) return false;
  }
  // def ids must name a real def (own-property lookup blocks prototype pollution).
  if ('defId' in cmd && !(own(gameData.units, cmd.defId) || own(gameData.buildings, cmd.defId))) return false;
  if ('techId' in cmd && !own(gameData.techs, cmd.techId)) return false;
  if ('abilityId' in cmd && typeof cmd.abilityId !== 'string') return false;
  for (const f of RESOURCE_FIELDS) {
    if (f in cmd && !RESOURCES.has(cmd[f] as string)) return false;
  }
  if (kind === 'setProductionSpeed' && !isProductionSpeed(cmd.multiplier)) return false;
  return true;
}

/** Owned, alive, non-garrisoned units of the player (silent filter, preserves order). */
function ownedUnits(state: SimState, player: PlayerId, ids: EntityId[]): EntityId[] {
  const out: EntityId[] = [];
  const seen = new Set<EntityId>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    out.push(id);
  }
  return out;
}

function ownedBuilding(state: SimState, player: PlayerId, id: EntityId): Entity | null {
  const e = state.entities.get(id);
  if (!e || e.kind !== 'building' || e.player !== player || e.hp <= 0) return null;
  return e;
}

/** An explicit order overrides every running reflex/engagement on the unit. */
function clearTaskState(state: SimState, e: Entity): void {
  state.fleeing.delete(e.id);
  state.combat.delete(e.id);
  state.garrisoning.delete(e.id);
  state.buildRetries.delete(e.id);
  e.targetId = undefined;
  const monk = state.monks.get(e.id);
  if (monk) {
    monk.convertTargetId = undefined;
    monk.healTargetId = undefined;
    monk.channelTicks = 0;
  }
}

/** Pack-capable siege (trebuchets) cannot walk while deployed or mid-transition. */
function canWalk(state: SimState, e: Entity): boolean {
  const def = gameData.units[e.defId];
  if (!def?.pack) return true;
  return e.packed === true && !state.packTransitions.has(e.id);
}

const handleMove: Handler<'move'> = (state, cmd) => {
  const units = ownedUnits(state, cmd.player, cmd.units).filter((id) =>
    canWalk(state, state.entities.get(id)!));
  cancelQueuedBuilds(state, units);
  for (const id of units) {
    const e = state.entities.get(id)!;
    e.intent = undefined;
    clearTaskState(state, e);
  }
  orderFormationMove(state, units, cmd.x, cmd.y, cmd.formation);
};

const handleAttackMove: Handler<'attackMove'> = (state, cmd) => {
  const units = ownedUnits(state, cmd.player, cmd.units).filter((id) =>
    canWalk(state, state.entities.get(id)!));
  cancelQueuedBuilds(state, units);
  const destinations = orderFormationMove(state, units, cmd.x, cmd.y, cmd.formation);
  for (const id of units) {
    const e = state.entities.get(id)!;
    const destination = destinations.get(id) ?? { x: cmd.x, y: cmd.y };
    e.intent = { kind: 'attackMove', x: destination.x, y: destination.y }; // combat auto-engages en route
    clearTaskState(state, e);
  }
};

const handleStop: Handler<'stop'> = (state, cmd) => {
  const units = ownedUnits(state, cmd.player, cmd.units);
  cancelQueuedBuilds(state, units);
  for (const id of units) {
    const e = state.entities.get(id)!;
    state.motion.delete(id);
    clearTaskState(state, e);
    e.intent = undefined;
    e.activity = 'idle';
  }
};

const handleTrain: Handler<'train'> = (state, cmd) => {
  const building = ownedBuilding(state, cmd.player, cmd.buildingId);
  if (!building || !building.trainQueue) return;
  if ((building.buildProgress ?? 1000) < 1000) return;
  if (building.trainQueue.length >= TRAIN_QUEUE_CAP) return;

  const buildingDef = gameData.buildings[building.defId];
  const unitDef = gameData.units[cmd.defId];
  if (!buildingDef || !unitDef) return;
  if (!buildingDef.trains || !buildingDef.trains.includes(cmd.defId)) return;

  const player = state.players[cmd.player];
  const civ = gameData.civs[player.setup.civ];

  // an enableUnit effect (scenario/civ hook) overrides the availability gates below
  if (!isUnitEnabled(state, cmd.player, cmd.defId)) {
    // tech-tree cuts + rival unique units (castle lists both civs' uniques)
    if (civ) {
      if (civ.disabled.includes(cmd.defId)) return;
      for (const otherCiv of Object.values(gameData.civs)) {
        if (otherCiv.id === civ.id) continue;
        if (cmd.defId === otherCiv.uniqueUnit) return;
        if (unitDef.requiresTech !== undefined && unitDef.requiresTech === otherCiv.eliteUniqueTech) return;
      }
    }
    if (AGES.indexOf(unitDef.age) > AGES.indexOf(player.age)) return;
    if (unitDef.requiresTech && !player.researchedTechs.includes(unitDef.requiresTech)) return;
    if (isUpgradedAway(state, cmd.player, cmd.defId)) return; // militia gone once MAA researched
  }

  const stats = resolveUnitStats(state, cmd.player, cmd.defId);
  const { cost } = stats;
  const s = player.stockpile;
  if (s.food < cost.food || s.wood < cost.wood || s.gold < cost.gold || s.stone < cost.stone) return;
  s.food -= cost.food; s.wood -= cost.wood; s.gold -= cost.gold; s.stone -= cost.stone;

  building.trainQueue.push({
    defId: cmd.defId,
    ticksLeft: stats.trainTimeTicks,
    totalTicks: stats.trainTimeTicks,
    paid: { food: cost.food, wood: cost.wood, gold: cost.gold, stone: cost.stone },
    started: false,
  });
};

const handleCancelTrain: Handler<'cancelTrain'> = (state, cmd) => {
  const building = ownedBuilding(state, cmd.player, cmd.buildingId);
  if (!building || !building.trainQueue) return;
  if (cmd.index < 0 || cmd.index >= building.trainQueue.length) return;
  const [item] = building.trainQueue.splice(cmd.index, 1);
  refundItem(state, cmd.player, item);
};

const handleSetRally: Handler<'setRally'> = (state, cmd) => {
  const building = ownedBuilding(state, cmd.player, cmd.buildingId);
  if (!building || !building.trainQueue) return; // rally only on production buildings
  if (cmd.targetId !== undefined && !state.entities.has(cmd.targetId)) {
    building.rally = { x: cmd.x, y: cmd.y };
    return;
  }
  building.rally = { x: cmd.x, y: cmd.y, targetId: cmd.targetId };
};

const handleDeleteEntity: Handler<'deleteEntity'> = (state, cmd, events) => {
  const e = state.entities.get(cmd.entityId);
  if (!e || e.player !== cmd.player) return;
  if (e.kind === 'building') {
    refundQueue(state, e);
    refundFoundation(state, e); // unbuilt fraction of a foundation comes back
  }
  // deleting a ram ejects its passengers alive (buildings still kill theirs — GDD)
  if (e.kind === 'unit' && e.garrison && e.garrison.length > 0) ejectGarrison(state, e);
  removeEntity(state, cmd.entityId);
  events.push({ kind: 'entityDied', id: e.id, defId: e.defId, player: e.player, x: e.x, y: e.y });
};

const handleResign: Handler<'resign'> = (state, cmd, events) => {
  defeatPlayer(state, cmd.player, events);
  checkVictory(state, events);
};

const handleSetProductionSpeed: Handler<'setProductionSpeed'> = (state, cmd) => {
  // This is a single-player host setting, not an AI strategy command. Keeping it
  // in the deterministic command stream makes pause-menu changes replayable.
  if (!state.players[cmd.player]?.setup.isHuman) return;
  state.productionSpeed = cmd.multiplier;
};

/** GDD defeat cleanup: mark defeated and destroy everything they own (no Gaia conversion). */
function defeatPlayer(state: SimState, playerId: PlayerId, events: SimEvent[]): void {
  state.players[playerId].defeated = true;
  const doomed: Entity[] = [];
  for (const e of state.entities.values()) if (e.player === playerId) doomed.push(e);
  for (const e of doomed) {
    removeEntity(state, e.id);
    events.push({ kind: 'entityDied', id: e.id, defId: e.defId, player: e.player, x: e.x, y: e.y });
  }
  events.push({ kind: 'playerDefeated', player: playerId });
}

/**
 * GDD elimination rule (conquest games only — campaign defeat comes from triggers):
 * a player with no Town Center, no villagers, and no production buildings is defeated
 * on the spot, deliberately including a player whose army is still standing. Runs once
 * per tick from advance() so every removal path (deleteEntity now, wave-2 combat deaths
 * later) is covered without each caller remembering to check.
 */
export function checkEliminations(state: SimState, events: SimEvent[]): void {
  if (!state.conquest || state.finished) return;
  const canRebuild: boolean[] = state.players.map(() => false);
  for (const e of state.entities.values()) {
    if (e.player === GAIA || e.hp <= 0) continue;
    if (e.kind === 'unit') {
      if (e.defId === 'villager') canRebuild[e.player] = true;
    } else if (e.kind === 'building') {
      const def = gameData.buildings[e.defId];
      if (e.defId === 'townCenter' || (def?.trains !== undefined && def.trains.length > 0)) {
        canRebuild[e.player] = true;
      }
    }
  }
  let anyDefeated = false;
  for (const p of state.players) {
    if (p.id === GAIA || p.defeated || canRebuild[p.id]) continue;
    defeatPlayer(state, p.id, events);
    anyDefeated = true;
  }
  if (anyDefeated) checkVictory(state, events);
}

export function checkVictory(state: SimState, events: SimEvent[]): void {
  if (state.finished) return;
  const aliveTeams = new Set<string>();
  const winners: PlayerId[] = [];
  for (const p of state.players) {
    if (p.id === GAIA || p.defeated) continue;
    aliveTeams.add(p.setup.team > 0 ? `t${p.setup.team}` : `p${p.id}`);
    winners.push(p.id);
  }
  if (aliveTeams.size <= 1) {
    state.finished = true;
    events.push({ kind: 'victory', winners });
  }
}

// Every command kind now has a live handler (wave 2 complete). The `todo` marker is
// kept so PENDING_COMMAND_KINDS stays a valid (now empty) contract for the HUD.
const todo = (): void => { /* unreachable — retained for the PENDING contract */ };

const handlers: { [K in Command['kind']]: Handler<K> } = {
  move: handleMove,
  attackMove: handleAttackMove,
  attack: (state, cmd) => handleAttack(state, cmd),
  gather: (state, cmd) => handleGather(state, cmd),
  build: handleBuild,
  repair: (state, cmd) => handleRepair(state, cmd),
  train: handleTrain,
  cancelTrain: handleCancelTrain,
  research: handleResearch,
  cancelResearch: (state, cmd) => handleCancelResearch(state, cmd),
  setRally: handleSetRally,
  stop: handleStop,
  garrison: (state, cmd) => handleGarrison(state, cmd),
  townBell: (state, cmd) => handleTownBell(state, cmd),
  ungarrison: (state, cmd) => handleUngarrison(state, cmd),
  convert: (state, cmd) => handleConvert(state, cmd),
  heal: (state, cmd) => handleHeal(state, cmd),
  deleteEntity: handleDeleteEntity,
  marketTrade: handleMarketTrade,
  reseedFarm: (state, cmd) => handleReseedFarm(state, cmd),
  queueReseed: (state, cmd) => handleQueueReseed(state, cmd),
  setProductionSpeed: handleSetProductionSpeed,
  pack: (state, cmd) => handlePackCommand(state, cmd),
  unpack: (state, cmd) => handlePackCommand(state, cmd),
  castAbility: handleCastAbility,
  resign: handleResign,
};

/**
 * Command kinds whose effects have NOT landed yet: the intake validates and accepts
 * them, but they are no-ops. The HUD reads this so it never confirms an order the sim
 * will drop. Derived from the handlers map — EMPTY as of wave 2 (kept for the contract).
 */
export const PENDING_COMMAND_KINDS: ReadonlySet<Command['kind']> = new Set(
  (Object.keys(handlers) as Array<Command['kind']>).filter(
    (k) => (handlers[k] as unknown) === (todo as unknown),
  ),
);

export function applyCommands(state: SimState, commands: Command[], events: SimEvent[]): void {
  for (const cmd of commands) {
    // A command earlier in this batch may have ended the game (e.g. simultaneous
    // resigns in lockstep). Once finished, later commands must not mutate the
    // terminal state — otherwise the declared winner could end up "defeated".
    if (state.finished) return;
    // Hostile/malformed intake must be dropped silently, never thrown on: the
    // command stream can carry replay/network garbage, and advance() is a hard
    // no-throw boundary. Reject non-objects, non-own-property kinds (guards
    // prototype keys like __proto__/valueOf), and non-integer players.
    if (cmd === null || typeof cmd !== 'object') continue;
    const kind = (cmd as { kind?: unknown }).kind;
    if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, kind)) continue;
    if (!validPlayer(state, (cmd as Command).player)) continue;
    if (!wellFormedCommand(kind as Command['kind'], cmd as Record<string, unknown>)) continue;
    const handler = handlers[kind as Command['kind']] as Handler<Command['kind']>;
    handler(state, cmd as never, events);
  }
}
