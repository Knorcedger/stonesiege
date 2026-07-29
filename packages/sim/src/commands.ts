// Command intake. Every kind in the Command union has a dispatch entry; wave-1 implements
// move / attackMove / stop / train / cancelTrain / setRally / deleteEntity / resign, and
// the rest are accepted as validated no-ops (TODO hooks filled by wave 2). Illegal
// commands are dropped silently — the sim never throws on player/AI input.
// Also home of defeat handling: resign, the per-tick GDD conquest elimination check
// (no TC + no villagers + no production buildings = defeated), and victory detection.

import { gameData } from '@bf/data';
import { AGES, GAIA } from './types';
import type { Command, Entity, EntityId, PlayerId, SimEvent } from './types';
import type { SimState } from './internal';
import { removeEntity } from './entities';
import { orderMove } from './path';
import { resolveUnitStats } from './stats';
import { refundItem, refundQueue, TRAIN_QUEUE_CAP } from './production';
import { handleBuild, refundFoundation } from './construction';

type Handler<K extends Command['kind']> =
  (state: SimState, cmd: Extract<Command, { kind: K }>, events: SimEvent[]) => void;

function validPlayer(state: SimState, player: PlayerId): boolean {
  return player > GAIA && player < state.players.length && !state.players[player].defeated;
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

const handleMove: Handler<'move'> = (state, cmd) => {
  const units = ownedUnits(state, cmd.player, cmd.units);
  for (const id of units) {
    const e = state.entities.get(id)!;
    e.intent = undefined;
  }
  orderMove(state, units, cmd.x, cmd.y);
};

const handleAttackMove: Handler<'attackMove'> = (state, cmd) => {
  const units = ownedUnits(state, cmd.player, cmd.units);
  for (const id of units) {
    const e = state.entities.get(id)!;
    e.intent = { kind: 'attackMove', x: cmd.x, y: cmd.y }; // wave 2: auto-engage en route
  }
  orderMove(state, units, cmd.x, cmd.y);
};

const handleStop: Handler<'stop'> = (state, cmd) => {
  for (const id of ownedUnits(state, cmd.player, cmd.units)) {
    const e = state.entities.get(id)!;
    state.motion.delete(id);
    e.intent = undefined;
    e.targetId = undefined;
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
  removeEntity(state, cmd.entityId);
  events.push({ kind: 'entityDied', id: e.id, defId: e.defId, player: e.player, x: e.x, y: e.y });
};

const handleResign: Handler<'resign'> = (state, cmd, events) => {
  defeatPlayer(state, cmd.player, events);
  checkVictory(state, events);
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

// Wave-2 kinds: validated intake exists, effects land with their systems. Never crash.
const todo = (): void => { /* TODO(wave 2) */ };

const handlers: { [K in Command['kind']]: Handler<K> } = {
  move: handleMove,
  attackMove: handleAttackMove,
  attack: todo, // TODO(wave 2): combat targeting
  gather: todo, // TODO(wave 2): gathering
  build: handleBuild,
  repair: todo, // TODO(wave 2): repair
  train: handleTrain,
  cancelTrain: handleCancelTrain,
  research: todo, // TODO(wave 2): research + tech effects
  cancelResearch: todo, // TODO(wave 2)
  setRally: handleSetRally,
  stop: handleStop,
  garrison: todo, // TODO(wave 2): garrison
  ungarrison: todo, // TODO(wave 2)
  convert: todo, // TODO(wave 2): monks
  heal: todo, // TODO(wave 2)
  deleteEntity: handleDeleteEntity,
  marketTrade: todo, // TODO(wave 2): market
  resign: handleResign,
};

/**
 * Command kinds whose effects have NOT landed yet (wave-2 systems): the intake
 * validates and accepts them, but they are no-ops. The HUD reads this so it never
 * confirms an order the sim will drop (no false-positive toasts / disabled verbs).
 * Derived from the handlers map — shrinks automatically as wave-2 handlers land.
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
    if (!validPlayer(state, cmd.player)) continue;
    const handler = handlers[cmd.kind] as Handler<typeof cmd.kind>;
    handler(state, cmd as never, events);
  }
}
