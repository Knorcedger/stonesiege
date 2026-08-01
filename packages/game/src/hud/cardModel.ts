// Pure command-card model (DOM-free, unit-tested): which build/train/research/
// verb buttons the card shows for a selection, whether each is enabled, and
// which icon variant (colored vs `/gray` companion) it renders. hud.ts only
// materializes this model into DOM, so "affordable actions render colored" and
// civ tech-tree filtering are testable without a browser.
//
// Wave-2 gating: verbs whose sim effects have not landed (PENDING_COMMAND_KINDS)
// render disabled with an honest reason — the card never offers an order the
// sim would silently drop. Buttons for flows with NO Command in the union yet
// (farm reseed, mill auto-reseed, trebuchet pack/unpack) are modeled here but
// always disabled; wiring them is a one-line change when the sim grows them.

import { AGES, type AgeId, type Entity, type EntityId, type ResourceType } from '@bf/sim/types';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { buildAgeIndex } from '@bf/sim/construction';
import { buildModifierTable } from '@bf/sim/stats';
import { gameData } from '@bf/data';
import type { TechDef, UnitDef } from '@bf/data';

export type Stockpile = Partial<Record<ResourceType, number>>;

/** Everything the card needs to know about the local player (derived from PlayerState). */
export interface PlayerCardView {
  stockpile: Stockpile;
  age: AgeId;
  /** Civ def id ('' = no civ filtering, used by some tests). */
  civ: string;
  researchedTechs: readonly string[];
  pop: number;
  popCap: number;
}

export interface CardButtonModel {
  id: string;
  /** Icon actually rendered: the colored atlas icon, or its `/gray` companion when disabled. */
  icon: string;
  enabled: boolean;
  /** Present iff disabled — surfaced by the tap-for-reason tip. */
  reason?: string;
  name?: string;
  cost?: Stockpile;
  timeSeconds?: number;
}

/** Verbs that arm a "next tap = target" flow (GDD alternate-command semantics). */
export type ArmedVerb = 'attackMove' | 'garrison' | 'convert' | 'heal';

export interface VerbButtonModel extends CardButtonModel {
  verb?: ArmedVerb;
  active?: boolean;
  tip: string;
}

const RESOURCE_KEYS: ResourceType[] = ['food', 'wood', 'gold', 'stone'];

export const AGE_LABEL: Record<AgeId, string> = {
  dark: 'Dark Age', feudal: 'Feudal Age', castle: 'Castle Age', imperial: 'Imperial Age',
};

export const WAVE2_REASON = 'arrives with the wave-2 sim';

export function canAffordCost(stockpile: Stockpile, cost: Stockpile): boolean {
  return RESOURCE_KEYS.every((r) => (stockpile[r] ?? 0) >= (cost[r] ?? 0));
}

/** Contract (ASSET_CONTRACT): every icon ships a grayscale companion at `<icon>/gray`. */
export function iconVariant(icon: string, enabled: boolean): string {
  return enabled ? icon : `${icon}/gray`;
}

// ------------------------------------------------------------------ civ rules

/**
 * Unit hidden from this civ's card: tech-tree cuts and rival unique units
 * (castle lists both civs' uniques). Mirrors the sim's handleTrain gate.
 */
export function unitHiddenByCiv(unit: UnitDef, civId: string): boolean {
  const civ = gameData.civs[civId];
  if (!civ) return false;
  if (civ.disabled.includes(unit.id)) return true;
  for (const other of Object.values(gameData.civs)) {
    if (other.id === civ.id) continue;
    if (unit.id === other.uniqueUnit) return true;
    if (unit.requiresTech !== undefined && unit.requiresTech === other.eliteUniqueTech) return true;
  }
  return false;
}

/** Tech hidden from this civ's card: tech-tree cuts and rival unique techs. */
export function techHiddenByCiv(tech: TechDef, civId: string): boolean {
  const civ = gameData.civs[civId];
  if (!civ) return false;
  if (civ.disabled.includes(tech.id)) return true;
  if (tech.unique) {
    return !civ.uniqueTechs.includes(tech.id) && tech.id !== civ.eliteUniqueTech;
  }
  return false;
}

/** Civ-adjusted unit cost (costMult passives, e.g. Scots' cheap siege) — matches the sim's charge. */
export function civUnitCost(civId: string, age: AgeId, def: UnitDef): Stockpile {
  const table = buildModifierTable(civId, age);
  let scale = 100;
  for (const m of table.costMult) {
    const hit =
      (!m.targetClasses && !m.targetIds) ||
      (m.targetIds?.includes(def.id) ?? false) ||
      (m.targetClasses?.some((c) => def.classes.includes(c)) ?? false);
    if (hit) scale = (scale * (100 + m.percent)) / 100;
  }
  const out: Stockpile = {};
  for (const r of RESOURCE_KEYS) {
    const v = Math.round((def.cost[r] ?? 0) * scale / 100);
    if (v > 0) out[r] = v;
  }
  return out;
}

/** Unit ids upgraded away by researched line upgrades (militia hidden once Man-at-Arms lands). */
function upgradedAwayUnits(researched: readonly string[]): Set<string> {
  const gone = new Set<string>();
  for (const techId of researched) {
    const tech = gameData.techs[techId];
    if (!tech) continue;
    for (const e of tech.effects) {
      if (e.kind === 'upgradeUnit') gone.add(e.from);
    }
  }
  return gone;
}

// ------------------------------------------------------------------ build menu

/**
 * Villager "Build" card buttons: gray ONLY for genuinely unavailable actions
 * (unaffordable cost, or the build verb still wave-2-pending in the sim).
 */
export function buildMenuButtons(stockpile: Stockpile, age: AgeId): CardButtonModel[] {
  const ageIdx = AGES.indexOf(age);
  const pending = PENDING_COMMAND_KINDS.has('build');
  return Object.values(gameData.buildings)
    // buildAgeIndex mirrors the sim's construction gate (e.g. extra TCs unlock in Castle Age)
    .filter((bd) => !bd.requiresTech && buildAgeIndex(bd) <= ageIdx)
    .map((bd) => {
      const affordable = canAffordCost(stockpile, bd.cost);
      const enabled = !pending && affordable;
      return {
        id: bd.id,
        icon: iconVariant(bd.icon, enabled),
        enabled,
        reason: enabled ? undefined : pending ? 'construction arrives in wave 2' : 'not enough resources',
        name: bd.name,
        cost: bd.cost,
        timeSeconds: bd.buildTime,
      };
    });
}

// ------------------------------------------------------------------ train menu

/**
 * Production building "Train" card buttons for one building def:
 * - civ tech-tree cuts and rival unique units hidden (mirrors sim handleTrain)
 * - line upgrades collapse the line: only the latest researched tier shows
 * - age/tech-gated tiers hidden until unlocked
 * - disabled (gray + reason) when unaffordable or population-capped
 */
export function trainMenuButtons(view: PlayerCardView, buildingDefId: string): CardButtonModel[] {
  const ageIdx = AGES.indexOf(view.age);
  const def = gameData.buildings[buildingDefId];
  const gone = upgradedAwayUnits(view.researchedTechs);
  return (def?.trains ?? [])
    .map((uid) => gameData.units[uid])
    .filter((u): u is UnitDef => !!u)
    .filter((u) => !unitHiddenByCiv(u, view.civ))
    .filter((u) => AGES.indexOf(u.age) <= ageIdx)
    .filter((u) => !u.requiresTech || view.researchedTechs.includes(u.requiresTech))
    .filter((u) => !gone.has(u.id))
    .map((u) => {
      const cost = civUnitCost(view.civ, view.age, u);
      const affordable = canAffordCost(view.stockpile, cost);
      const housed = view.pop + (u.pop ?? 1) > view.popCap;
      const enabled = affordable && !housed;
      return {
        id: u.id,
        icon: iconVariant(u.icon, enabled),
        enabled,
        reason: enabled ? undefined : housed ? 'housed — build more houses' : 'not enough resources',
        name: u.name,
        cost,
        timeSeconds: u.trainTime,
      };
    });
}

// ------------------------------------------------------------------ research menu

/**
 * Research buttons for one building (blacksmith/university/monastery/market/…
 * plus unit-line upgrades at their production building and castle unique techs).
 * Age-up techs are excluded — they get the dedicated ageUpButton below.
 * Hidden: already researched, above the player's age, civ-cut, prereq unmet.
 */
export function researchMenuButtons(
  view: PlayerCardView,
  buildingDefId: string,
  busyResearching = false,
): CardButtonModel[] {
  const ageIdx = AGES.indexOf(view.age);
  const def = gameData.buildings[buildingDefId];
  const pending = PENDING_COMMAND_KINDS.has('research');
  return (def?.researches ?? [])
    .map((tid) => gameData.techs[tid])
    .filter((t): t is TechDef => !!t)
    .filter((t) => !t.effects.some((e) => e.kind === 'ageUp'))
    .filter((t) => !view.researchedTechs.includes(t.id))
    .filter((t) => !techHiddenByCiv(t, view.civ))
    .filter((t) => AGES.indexOf(t.age) <= ageIdx)
    .filter((t) => !t.requiresTech || view.researchedTechs.includes(t.requiresTech))
    .map((t) => {
      const affordable = canAffordCost(view.stockpile, t.cost);
      const enabled = !pending && affordable && !busyResearching;
      return {
        id: t.id,
        icon: iconVariant(t.icon, enabled),
        enabled,
        reason: enabled ? undefined
          : pending ? `research ${WAVE2_REASON}`
            : busyResearching ? 'already researching'
              : 'not enough resources',
        name: t.name,
        cost: t.cost,
        timeSeconds: t.researchTime,
      };
    });
}

// ------------------------------------------------------------------ age-up

export interface AgeUpModel extends CardButtonModel {
  techId: string;
  nextAge: AgeId;
  /** '1 / 2 Feudal Age buildings' progress line for the card. */
  requirementText: string;
  requirementMet: boolean;
}

/**
 * Qualifying-building count for the AoE2 age-up rule: distinct completed
 * building defs of the player's CURRENT age (countsForAgeUp:false never
 * qualifies; a satisfiesAgeUpAlone building meets the requirement by itself).
 */
export function ageUpRequirement(
  age: AgeId,
  completedBuildingDefIds: readonly string[],
  needed: number,
): { have: number; met: boolean } {
  const distinct = new Set<string>();
  let alone = false;
  for (const id of completedBuildingDefIds) {
    const def = gameData.buildings[id];
    if (!def || def.age !== age || def.countsForAgeUp === false) continue;
    distinct.add(id);
    if (def.satisfiesAgeUpAlone) alone = true;
  }
  return { have: distinct.size, met: alone || distinct.size >= needed };
}

/** The TC's age-advance button (null in Imperial or when no age-up tech matches). */
export function ageUpButton(
  view: PlayerCardView,
  completedBuildingDefIds: readonly string[],
  busyResearching = false,
): AgeUpModel | null {
  const ageIdx = AGES.indexOf(view.age);
  const nextAge = AGES[ageIdx + 1];
  if (!nextAge) return null;
  const tech = Object.values(gameData.techs).find(
    (t) => t.effects.some((e) => e.kind === 'ageUp' && e.to === nextAge),
  );
  if (!tech || view.researchedTechs.includes(tech.id)) return null;

  const needed = tech.requiresBuildingsOfCurrentAge ?? 0;
  const { have, met } = ageUpRequirement(view.age, completedBuildingDefIds, needed);
  const affordable = canAffordCost(view.stockpile, tech.cost);
  const pending = PENDING_COMMAND_KINDS.has('research');
  const enabled = met && affordable && !pending && !busyResearching;
  return {
    id: tech.id,
    techId: tech.id,
    nextAge,
    icon: iconVariant(tech.icon, enabled),
    enabled,
    reason: enabled ? undefined
      : !met ? `${needed} ${AGE_LABEL[view.age]} buildings needed`
        : pending ? `age research ${WAVE2_REASON}`
          : busyResearching ? 'already researching'
            : 'not enough resources',
    requirementText: `${Math.min(have, needed)} / ${needed} ${AGE_LABEL[view.age]} buildings`,
    requirementMet: met,
    name: tech.name,
    cost: tech.cost,
    timeSeconds: tech.researchTime,
  };
}

// ------------------------------------------------------------------ unit verbs

const pendingVerb = (kind: 'attack' | 'garrison' | 'convert' | 'heal'): boolean =>
  PENDING_COMMAND_KINDS.has(kind);

/**
 * Verb buttons for a unit selection (military and/or villagers):
 * attack-move toggle, stop, garrison-into-target, monk convert/heal,
 * trebuchet pack/unpack, per GDD Mobile UX. Arming verbs stay disabled while
 * their sim command is wave-2-pending (the armed tap would be dropped).
 */
export function unitVerbButtons(sel: readonly Entity[], armed: ArmedVerb | null): VerbButtonModel[] {
  const units = sel.filter((e) => e.kind === 'unit');
  if (units.length === 0) return [];
  const military = units.filter((e) => e.defId !== 'villager');
  const monks = units.filter((e) => gameData.units[e.defId]?.converts || gameData.units[e.defId]?.heals);
  const packers = units.filter((e) => !!gameData.units[e.defId]?.pack);
  const out: VerbButtonModel[] = [];

  if (military.length > 0) {
    out.push({
      id: 'attackMove', verb: 'attackMove',
      icon: 'icon/cmd/attackMove',
      enabled: true,
      active: armed === 'attackMove',
      tip: 'Attack-move\nNext tap = attack-move there',
    });
  }
  out.push({ id: 'stop', icon: 'icon/cmd/stop', enabled: true, tip: 'Stop' });
  {
    const enabled = !pendingVerb('garrison');
    out.push({
      id: 'garrison', verb: 'garrison',
      icon: iconVariant('icon/cmd/garrison', enabled),
      enabled,
      active: armed === 'garrison',
      reason: enabled ? undefined : `garrison ${WAVE2_REASON}`,
      tip: 'Garrison\nNext tap on a building = garrison inside',
    });
  }
  if (monks.length > 0) {
    const convEnabled = !pendingVerb('convert');
    out.push({
      id: 'convert', verb: 'convert',
      icon: iconVariant('icon/cmd/convert', convEnabled),
      enabled: convEnabled,
      active: armed === 'convert',
      reason: convEnabled ? undefined : `conversion ${WAVE2_REASON}`,
      tip: 'Convert\nNext tap on an enemy = convert it',
    });
    const healEnabled = !pendingVerb('heal');
    out.push({
      id: 'heal', verb: 'heal',
      icon: iconVariant('icon/cmd/heal', healEnabled),
      enabled: healEnabled,
      active: armed === 'heal',
      reason: healEnabled ? undefined : `healing ${WAVE2_REASON}`,
      tip: 'Heal\nNext tap on a wounded friend = heal it',
    });
  }
  if (packers.length > 0) {
    // Sim contract: Entity.packed true = folded/mobile (cannot fire), false = deployed.
    // Any deployed treb in the selection → the button packs; all packed → it unpacks.
    const enabled = !PENDING_COMMAND_KINDS.has('pack') && !PENDING_COMMAND_KINDS.has('unpack');
    const anyDeployed = packers.some((e) => e.packed === false);
    out.push({
      id: anyDeployed ? 'pack' : 'unpack',
      icon: iconVariant('icon/cmd/pack', enabled),
      enabled,
      reason: enabled ? undefined : `trebuchet pack/unpack ${WAVE2_REASON}`,
      tip: anyDeployed
        ? 'Pack up\nFold the trebuchet so it can move'
        : 'Unpack\nDeploy to fire — packed trebuchets cannot shoot',
    });
  }
  return out;
}

// ------------------------------------------------------------------ farm & mill

/** Reseed button for a selected (possibly fallow) farm — full wood cost (GDD). */
export function farmReseedButton(farm: Pick<Entity, 'amountLeft'>, stockpile: Stockpile): VerbButtonModel {
  const fallow = (farm.amountLeft ?? 0) <= 0;
  const cost = gameData.buildings.farm?.cost ?? {};
  const pending = PENDING_COMMAND_KINDS.has('reseedFarm');
  const affordable = canAffordCost(stockpile, cost);
  const enabled = !pending && affordable;
  return {
    id: 'reseedFarm',
    icon: iconVariant('icon/cmd/reseedFarm', enabled),
    enabled,
    reason: enabled ? undefined : pending ? `farm reseed ${WAVE2_REASON}` : 'not enough resources',
    tip: fallow ? 'Reseed farm\nThis farm is exhausted' : 'Reseed farm\nReplant at full wood cost',
    cost,
    name: 'Reseed farm',
  };
}

/**
 * Mill auto-reseed queue toggle (GDD: expiring farms replant automatically,
 * deducting wood). Reads PlayerState.autoReseed; issues queueReseed.
 */
export function millAutoReseedButton(autoReseedOn: boolean): VerbButtonModel {
  const pending = PENDING_COMMAND_KINDS.has('queueReseed');
  return {
    id: 'autoReseed',
    icon: iconVariant('icon/cmd/reseedFarm', !pending),
    enabled: !pending,
    active: autoReseedOn,
    reason: pending ? `mill auto-reseed ${WAVE2_REASON}` : undefined,
    tip: autoReseedOn
      ? 'Auto-reseed farms: ON\nExpiring farms replant, deducting wood'
      : 'Auto-reseed farms: OFF\nTap to replant expiring farms automatically',
    name: 'Auto-reseed',
  };
}

// ------------------------------------------------------------------ garrisoned building panel

export interface GarrisonPanelModel {
  count: number;
  capacity: number;
  occupants: Array<{ id: EntityId; defId: string; icon: string }>;
  ungarrisonEnabled: boolean;
  reason?: string;
}

/** Panel for a building with garrisoned units (null when it can't hold any). */
export function garrisonPanel(
  building: Entity,
  getEntity: (id: EntityId) => Entity | undefined,
): GarrisonPanelModel | null {
  const capacity = gameData.buildings[building.defId]?.garrisonCapacity ?? 0;
  if (capacity <= 0) return null;
  const occupants = (building.garrison ?? [])
    .map((id) => ({ id, e: getEntity(id) }))
    .filter((o) => !!o.e)
    .map((o) => ({
      id: o.id,
      defId: o.e!.defId,
      icon: gameData.units[o.e!.defId]?.icon ?? `icon/${o.e!.defId}`,
    }));
  const pending = PENDING_COMMAND_KINDS.has('ungarrison');
  return {
    count: occupants.length,
    capacity,
    occupants,
    ungarrisonEnabled: occupants.length > 0 && !pending,
    reason: pending ? `ungarrison ${WAVE2_REASON}` : occupants.length === 0 ? 'nobody garrisoned' : undefined,
  };
}
