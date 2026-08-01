// Tech engine (GDD Technologies + Ages). The research command queues a tech into the
// building's SHARED production queue (AoE2: research occupies the same queue as
// training — a TC researching Loom stalls villagers). Completion applies every
// TechEffect kind from @bf/data: passive stat/gather/cost/bonus-damage mods extend the
// per-player modifier table; upgradeUnit transforms LIVING entities (hp% preserved);
// ageUp rebuilds the table so age-gated civ bonuses activate; freeTech recurses;
// ballistics flips the projectile-leading flag. Civ tech-tree cuts and unique-tech
// ownership are enforced at intake.

import { gameData } from '@bf/data';
import type { TechDef, TechEffect } from '@bf/data';
import { AGES, TICKS_PER_SECOND } from './types';
import type { AgeId, Command, PlayerId, SimEvent } from './types';
import type { SimState } from './internal';
import { invalidateStats, resolveBuildingStats, resolveUnitStats } from './stats';
import { buildModifierTable } from './stats';

type ResearchCmd = Extract<Command, { kind: 'research' }>;
type CancelResearchCmd = Extract<Command, { kind: 'cancelResearch' }>;

const ageIdx = (age: AgeId): number => AGES.indexOf(age);

/** Force-enabled by an enableUnit/enableBuilding effect (scenario/civ hooks). */
export const isUnitEnabled = (state: SimState, player: PlayerId, defId: string): boolean =>
  state.enabledUnits[player]?.has(defId) ?? false;
export const isBuildingEnabled = (state: SimState, player: PlayerId, defId: string): boolean =>
  state.enabledBuildings[player]?.has(defId) ?? false;

/** Has some researched tech already upgraded AWAY from this unit line tier? */
export function isUpgradedAway(state: SimState, player: PlayerId, defId: string): boolean {
  for (const techId of state.players[player].researchedTechs) {
    for (const fx of gameData.techs[techId]?.effects ?? []) {
      if (fx.kind === 'upgradeUnit' && fx.from === defId) return true;
    }
  }
  return false;
}

/**
 * Age-up building requirement: N DISTINCT building types of the player's CURRENT age
 * (countsForAgeUp: false never qualifies; duplicates of one type count once; one
 * satisfiesAgeUpAlone building — the Castle, for Imperial — meets it by itself).
 * Matches the HUD's ageUpRequirement model in @bf/game exactly.
 */
export function hasAgeUpBuildings(state: SimState, player: PlayerId, required: number): boolean {
  const age = state.players[player].age;
  const types = new Set<string>();
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.player !== player || e.hp <= 0) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    const def = gameData.buildings[e.defId];
    if (!def || def.age !== age || def.countsForAgeUp === false) continue;
    if (def.satisfiesAgeUpAlone) return true;
    types.add(def.id);
    if (types.size >= required) return true;
  }
  return false;
}

/** May this player research this tech at all (age, chain, civ cuts, uniques)? */
export function canResearch(state: SimState, player: PlayerId, techId: string): boolean {
  const tech = gameData.techs[techId];
  const p = state.players[player];
  if (!tech || !p) return false;
  if (p.researchedTechs.includes(techId)) return false;
  if (ageIdx(tech.age) > ageIdx(p.age)) return false;
  if (tech.requiresTech && !p.researchedTechs.includes(tech.requiresTech)) return false;
  const civ = gameData.civs[p.setup.civ];
  if (civ) {
    if (civ.disabled.includes(techId)) return false;
    if (tech.unique && !civ.uniqueTechs.includes(techId) && civ.eliteUniqueTech !== techId) return false;
  }
  if (tech.requiresBuildingsOfCurrentAge !== undefined &&
    !hasAgeUpBuildings(state, player, tech.requiresBuildingsOfCurrentAge)) return false;
  return true;
}

/** Is this tech already sitting in any of the player's building queues? */
function alreadyQueued(state: SimState, player: PlayerId, techId: string): boolean {
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.player !== player || !e.trainQueue) continue;
    for (const item of e.trainQueue) if (item.techId === techId) return true;
  }
  return false;
}

export function handleResearch(state: SimState, cmd: ResearchCmd, events: SimEvent[]): void {
  void events;
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.kind !== 'building' || building.player !== cmd.player || building.hp <= 0) return;
  if ((building.buildProgress ?? 1000) < 1000) return;
  const bDef = gameData.buildings[building.defId];
  const tech = gameData.techs[cmd.techId];
  if (!bDef || !tech) return;
  if (!bDef.researches || !bDef.researches.includes(cmd.techId)) return;
  if (!canResearch(state, cmd.player, cmd.techId)) return;
  if (alreadyQueued(state, cmd.player, cmd.techId)) return;
  building.trainQueue ??= []; // buildings that only research (mill/blacksmith/university)
  if (building.trainQueue.length >= 15) return; // TRAIN_QUEUE_CAP (avoid import cycle)

  const p = state.players[cmd.player];
  const cost = {
    food: tech.cost.food ?? 0, wood: tech.cost.wood ?? 0,
    gold: tech.cost.gold ?? 0, stone: tech.cost.stone ?? 0,
  };
  const s = p.stockpile;
  if (s.food < cost.food || s.wood < cost.wood || s.gold < cost.gold || s.stone < cost.stone) return;
  s.food -= cost.food; s.wood -= cost.wood; s.gold -= cost.gold; s.stone -= cost.stone;

  const ticks = Math.max(1, Math.round(tech.researchTime * TICKS_PER_SECOND));
  building.trainQueue.push({
    defId: cmd.techId, techId: cmd.techId,
    ticksLeft: ticks, totalTicks: ticks, paid: cost, started: false,
  });
}

/** Cancel the first queued research in the building (refunds the full cost). */
export function handleCancelResearch(state: SimState, cmd: CancelResearchCmd): void {
  const building = state.entities.get(cmd.buildingId);
  if (!building || building.kind !== 'building' || building.player !== cmd.player) return;
  if (!building.trainQueue) return;
  const idx = building.trainQueue.findIndex((item) => item.techId !== undefined);
  if (idx < 0) return;
  const [item] = building.trainQueue.splice(idx, 1);
  const p = state.players[cmd.player];
  if (item.paid && p) {
    p.stockpile.food += item.paid.food ?? 0;
    p.stockpile.wood += item.paid.wood ?? 0;
    p.stockpile.gold += item.paid.gold ?? 0;
    p.stockpile.stone += item.paid.stone ?? 0;
  }
  if (building.research?.techId === item.techId) building.research = undefined;
}

/**
 * Re-derive a player's modifier table from scratch: civ passives (for the CURRENT age)
 * + every researched tech's passive effects, in research order. Used on age-up so
 * age-gated civ bonuses activate without losing tech modifiers.
 */
export function rebuildModifiers(state: SimState, player: PlayerId): void {
  const p = state.players[player];
  const table = buildModifierTable(p.setup.civ, p.age);
  for (const techId of p.researchedTechs) {
    for (const fx of gameData.techs[techId]?.effects ?? []) pushPassive(table, fx);
  }
  state.modifiers[player] = table;
  // ballistics: from researched techs or civ bonuses
  let ballistics = false;
  for (const techId of p.researchedTechs) {
    for (const fx of gameData.techs[techId]?.effects ?? []) if (fx.kind === 'ballistics') ballistics = true;
  }
  const civ = gameData.civs[p.setup.civ];
  for (const b of civ?.bonuses ?? []) {
    if (b.effect.kind !== 'ballistics') continue;
    if (b.fromAge !== undefined && ageIdx(b.fromAge) > ageIdx(p.age)) continue;
    ballistics = true;
  }
  state.ballistics[player] = ballistics;
  invalidateStats(state, player);
  syncMaxHp(state, player);
}

function pushPassive(table: ReturnType<typeof buildModifierTable>, fx: TechEffect): void {
  switch (fx.kind) {
    case 'statAdd':
      table.statAdd.push({ stat: fx.stat, amount: fx.amount, targetClasses: fx.targetClasses, targetIds: fx.targetIds });
      break;
    case 'statMult':
      table.statMult.push({ stat: fx.stat, percent: fx.percent, targetClasses: fx.targetClasses, targetIds: fx.targetIds });
      break;
    case 'gatherMult':
      table.gatherMult.push({ task: fx.task, percent: fx.percent });
      break;
    case 'costMult':
      table.costMult.push({ percent: fx.percent, targetClasses: fx.targetClasses, targetIds: fx.targetIds });
      break;
    case 'bonusDamage':
      table.bonusDamage.push({ vs: fx.vs, amount: fx.amount, targetClasses: fx.targetClasses, targetIds: fx.targetIds });
      break;
    default:
      break; // one-shot kinds handled by completeResearch
  }
}

/**
 * Re-sync living entities' maxHp with the (possibly changed) resolved stats: the HP
 * DELTA is applied to current hp (AoE2 Loom behavior — a wounded villager gains the
 * flat +15 too), never dropping below 1.
 */
function syncMaxHp(state: SimState, player: PlayerId): void {
  for (const e of state.entities.values()) {
    if (e.player !== player || e.hp <= 0) continue;
    let newMax: number;
    if (e.kind === 'unit') newMax = resolveUnitStats(state, player, e.defId).hp;
    else if (e.kind === 'building') newMax = resolveBuildingStats(state, player, e.defId).hp;
    else continue;
    if (newMax === e.maxHp) continue;
    const delta = newMax - e.maxHp;
    e.maxHp = newMax;
    e.hp = Math.max(1, Math.min(newMax, e.hp + delta));
  }
}

/** Line upgrade: every living own entity of `from` becomes `to`, hp% preserved. */
function transformEntities(state: SimState, player: PlayerId, from: string, to: string): void {
  const isUnit = gameData.units[to] !== undefined;
  const toBuilding = gameData.buildings[to];
  if (!isUnit && !toBuilding) return;
  if (toBuilding) {
    const fromBuilding = gameData.buildings[from];
    if (!fromBuilding || fromBuilding.size !== toBuilding.size) return; // footprint must match
  }
  for (const e of state.entities.values()) {
    if (e.player !== player || e.defId !== from || e.hp <= 0) continue;
    const oldMax = Math.max(1, e.maxHp);
    const newMax = isUnit
      ? resolveUnitStats(state, player, to).hp
      : resolveBuildingStats(state, player, to).hp;
    e.defId = to;
    e.maxHp = newMax;
    e.hp = Math.max(1, Math.round((e.hp * newMax) / oldMax));
  }
}

function ageUp(state: SimState, player: PlayerId, to: AgeId, events: SimEvent[]): void {
  const p = state.players[player];
  if (ageIdx(to) <= ageIdx(p.age)) return;
  p.age = to;
  rebuildModifiers(state, player);
  events.push({ kind: 'ageAdvanced', player, age: to });
}

/**
 * Complete a research: record it, apply every effect, emit researchComplete.
 * Shared by the production queue and freeTech recursion.
 */
export function completeResearch(state: SimState, player: PlayerId, techId: string, events: SimEvent[]): void {
  const tech: TechDef | undefined = gameData.techs[techId];
  const p = state.players[player];
  if (!tech || !p || p.researchedTechs.includes(techId)) return;
  p.researchedTechs.push(techId);
  events.push({ kind: 'researchComplete', player, techId });

  let passiveChanged = false;
  for (const fx of tech.effects) {
    switch (fx.kind) {
      case 'statAdd':
      case 'statMult':
      case 'gatherMult':
      case 'costMult':
      case 'bonusDamage':
        pushPassive(state.modifiers[player], fx);
        passiveChanged = true;
        break;
      case 'upgradeUnit':
        // apply passives first so the transform sees fresh stats
        if (passiveChanged) { invalidateStats(state, player); passiveChanged = false; syncMaxHp(state, player); }
        transformEntities(state, player, fx.from, fx.to);
        break;
      case 'enableUnit':
        (state.enabledUnits[player] ??= new Set()).add(fx.id);
        break;
      case 'enableBuilding':
        (state.enabledBuildings[player] ??= new Set()).add(fx.id);
        break;
      case 'ageUp':
        if (passiveChanged) { invalidateStats(state, player); passiveChanged = false; syncMaxHp(state, player); }
        ageUp(state, player, fx.to, events);
        break;
      case 'freeTech':
        completeResearch(state, player, fx.techId, events);
        break;
      case 'ballistics':
        state.ballistics[player] = true;
        break;
      default:
        break;
    }
  }
  if (passiveChanged) {
    invalidateStats(state, player);
    syncMaxHp(state, player);
  }
}

/** For handleTrain: is a unit def trainable given enable-overrides + line upgrades? */
export function unitTrainBlocked(state: SimState, player: PlayerId, defId: string): boolean {
  if (isUnitEnabled(state, player, defId)) return false;
  return isUpgradedAway(state, player, defId);
}
