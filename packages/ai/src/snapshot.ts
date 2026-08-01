// One pass over the world per decision batch. Own entities are read in full (a player
// always knows their own state); RIVAL entities only flow through EnemyMemory, which
// requires actual visibility — the managers never touch enemy state directly.

import { gameData } from '@bf/data';
import { AGES, GAIA } from '@bf/sim/types';
import type { Entity, Game, PlayerId, PlayerState, Stockpile, Tick } from '@bf/sim/types';
import type { SimRng } from '@bf/sim/rng';
import type { EnemyMemory, Sighting } from './memory';
import type { Tuning } from './tuning';

export interface Ctx {
  readonly game: Game;
  readonly player: PlayerId;
  readonly rng: SimRng;
  /** Reassigned by setProfile — managers must read it fresh each pass. */
  tuning: Tuning;
  readonly memory: EnemyMemory;
  /**
   * Highest AGES index any HOSTILE player has publicly reached (createBot updates it
   * from ageAdvanced events — age-up horns are announced to the whole match, exactly
   * as in AoE2, so this is fog-honest). Feeds the hopelessness test for resigning.
   */
  enemyAgeIdx: number;
}

export interface Snapshot {
  tick: Tick;
  p: PlayerState;
  stock: Stockpile;
  villagers: Entity[];
  /** Villagers sheltering inside buildings (still alive, not available for work). */
  garrisonedVillagers: number;
  /** Fighters (scout + rams included, monks excluded). */
  military: Entity[];
  monks: Entity[];
  rams: Entity[];
  scout: Entity | null;
  /** Completed own buildings by defId. */
  own: Record<string, Entity[]>;
  foundations: Entity[];
  foodNodes: Entity[];
  woodNodes: Entity[];
  goldNodes: Entity[];
  stoneNodes: Entity[];
  baseX: number;
  baseY: number;
  anchor: Entity;
  /** Sum of popProvided over completed buildings (house-spam stop). */
  providedSum: number;
  /** Fog-honest enemy intel (from memory, refreshed this pass). */
  enemyUnits: Sighting[];
  enemyBuildings: Sighting[];
}

export interface AgePlan {
  ageTechId: string | null;
  ageCost: Partial<Stockpile>;
  savingForAge: boolean;
  foodFloor: number;
  goldFloor: number;
  /**
   * The threat/skeleton guard exemption in doProduction may NOT undercut the floors
   * this pass. Latched once the bank has already failed through two relax cycles
   * (a pressured bot that re-opens the valve every pass never banks its age at all)
   * and while BOTH age resources sit within 10% of the requirement (spending the
   * last 20 gold on an archer forever kept Castle 10% away for 30+ minutes).
   */
  holdFloors: boolean;
}

export const cheb = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function nearestEntity(list: Entity[], x: number, y: number): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const e of list) {
    const d = cheb(e.tileX, e.tileY, x, y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function nearestSighting(list: Sighting[], x: number, y: number): Sighting | null {
  let best: Sighting | null = null;
  let bd = Infinity;
  for (const s of list) {
    const d = cheb(s.tileX, s.tileY, x, y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function isFoodAnimalDef(defId: string): boolean {
  const d = gameData.units[defId];
  return !!(d?.herdable || d?.huntable);
}

/** Unit sightings younger than this feed composition counters and intruder checks. */
export const FRESH_SIGHTING_TICKS = 2400; // 2 sim-minutes

export function buildSnapshot(ctx: Ctx): Snapshot | null {
  const st = ctx.game.state;
  const p = st.players[ctx.player];
  if (!p || p.defeated) return null;
  const vis = p.visibility;
  const w = st.map.width;
  // Diplomacy (mirrors sim isEnemy): players on the same non-zero team are ALLIES and
  // must never enter enemy memory. Fog is team-shared, so without this filter a bot
  // "sees" its ally's units as permanently-visible intruders, locks its whole army
  // into defense against them, and the sim no-ops every attack order it issues —
  // the exact wallace-3 bug where the scripted English host idled at spawn forever
  // guarding against Warenne's own banner guard.
  const myTeam = p.setup.team;
  const hostileTo = (pid: number): boolean => {
    const theirTeam = st.players[pid]?.setup.team ?? 0;
    return myTeam === 0 || theirTeam === 0 || myTeam !== theirTeam;
  };

  const villagers: Entity[] = [];
  let garrisonedVillagers = 0;
  const military: Entity[] = [];
  const monks: Entity[] = [];
  const rams: Entity[] = [];
  let scout: Entity | null = null;
  const own: Record<string, Entity[]> = {};
  const foundations: Entity[] = [];
  const foodNodes: Entity[] = [];
  const woodNodes: Entity[] = [];
  const goldNodes: Entity[] = [];
  const stoneNodes: Entity[] = [];
  let providedSum = 0;

  for (const e of st.entities.values()) {
    if (e.kind === 'resource') {
      // resource nodes have no meaningful hp — classify purely by contents
      if (e.player !== GAIA || (e.amountLeft ?? 0) <= 0 || e.stump) continue;
      if (e.defId === 'tree') woodNodes.push(e);
      else if (e.defId === 'goldMine') goldNodes.push(e);
      else if (e.defId === 'stoneMine') stoneNodes.push(e);
      else if (e.defId === 'berryBush') foodNodes.push(e);
      continue;
    }
    if (e.hp <= 0 && !(e.kind === 'unit' && (e.amountLeft ?? 0) > 0)) continue;
    if (e.player === ctx.player) {
      if (e.kind === 'unit') {
        if (e.garrisonedIn !== undefined) {
          if (e.defId === 'villager') garrisonedVillagers++;
          continue;
        }
        if (e.defId === 'villager') villagers.push(e);
        else if (e.defId === 'scout' && scout === null) scout = e;
        else if (gameData.units[e.defId]?.heals) monks.push(e);
        else if (!isFoodAnimalDef(e.defId) && e.hp > 0) {
          military.push(e);
          if (gameData.units[e.defId]?.classes.includes('ram')) rams.push(e);
        }
        if (e.hp > 0 && isFoodAnimalDef(e.defId)) foodNodes.push(e); // captured sheep = food
        if (e.hp <= 0 && (e.amountLeft ?? 0) > 0) foodNodes.push(e); // carcass
      } else if (e.kind === 'building') {
        if ((e.buildProgress ?? 1000) < 1000) foundations.push(e);
        else {
          (own[e.defId] ??= []).push(e);
          providedSum += gameData.buildings[e.defId]?.popProvided ?? 0;
          if (e.defId === 'farm' && (e.amountLeft ?? 0) > 0) foodNodes.push(e);
        }
      }
    } else if (e.player === GAIA) {
      if (e.kind === 'unit' && gameData.units[e.defId]?.herdable) {
        // stray sheep: hunting one also walks a villager into capture range
        if (e.hp > 0 || (e.amountLeft ?? 0) > 0) foodNodes.push(e);
      }
    } else if (e.hp > 0 && hostileTo(e.player)) {
      // hostile rival entity: goes through the fog filter — only recorded if visible
      if (e.kind === 'unit') {
        if (e.garrisonedIn === undefined && !isFoodAnimalDef(e.defId)) {
          ctx.memory.note(e, vis, w, st.tick);
        }
      } else {
        ctx.memory.note(e, vis, w, st.tick);
      }
    }
  }
  if (scout !== null) military.push(scout);
  ctx.memory.sweep(st);

  const tc = own.townCenter?.[0] ?? null;
  const anchor = tc ?? foundations[0] ?? Object.values(own)[0]?.[0] ?? villagers[0] ?? military[0] ?? monks[0];
  if (!anchor) return null;

  return {
    tick: st.tick, p, stock: p.stockpile,
    villagers, garrisonedVillagers, military, monks, rams, scout,
    own, foundations,
    foodNodes, woodNodes, goldNodes, stoneNodes,
    baseX: anchor.tileX, baseY: anchor.tileY, anchor,
    providedSum,
    enemyUnits: ctx.memory.units(st.tick, FRESH_SIGHTING_TICKS),
    enemyBuildings: ctx.memory.buildings(),
  };
}

/** Bank stall: no new banked high-water mark for 2 sim-minutes = income cannot fill
 *  this bank right now (harassment, dead farms) — open the spending valve. */
export const BANK_STALL_TICKS = 2400;
/** How long the valve stays open before the bank re-arms (5 sim-minutes). */
export const BANK_RELAX_TICKS = 6000;

/** Mutable per-bot saving-state (owned by createBot, persists across passes). */
export interface SavingState {
  /** High-water mark of banked progress (food+gold capped at the age cost). */
  mark: number;
  /** Tick the mark last ROSE — staleness beyond BANK_STALL_TICKS = stalled. */
  markTick: number;
  /** While tick < relaxUntil the floors drop to half so the bot fields an army. */
  relaxUntil: number;
  /** Relax cycles consumed by the CURRENT age climb (reset when the age queues).
   *  At 2 the guard exemption latches off — the bank holds even under threat. */
  stalls: number;
}

/**
 * Age-up piggy bank. While saving for ANY age the bank reserves the full age cost —
 * army production only spends the surplus above it (flat floors once sat far below
 * the 800f Castle cost, so barracks/range drained every surplus and the bot never
 * left Feudal). The dark-age climb keeps extra headroom so villagers and farms
 * continue through it.
 *
 * Saving deadline, PROGRESS-BASED: while the banked total keeps setting new highs
 * the bank holds (a fixed timer used to open the valve mid-climb and militia burned
 * the bank back down every cycle — Castle never fired at all); once it stalls for
 * BANK_STALL_TICKS the floors drop to HALF the age cost for a relax window so the
 * bot fields an army instead of starving, then the bank re-arms and tries again.
 */
export function makePlan(ctx: Ctx, snap: Snapshot, peakVillagers: number, peakMilitary: number, saving: SavingState): AgePlan {
  const p = snap.p;
  const i = AGES.indexOf(p.age);
  const ageTechId = i === 0 ? 'feudalAge' : i === 1 ? 'castleAge' : i === 2 ? 'imperialAge' : null;
  const wantAgeUp = ageTechId !== null
    && i < AGES.indexOf(ctx.tuning.maxAge)
    // the TRIGGER is a fixed early count (ageUpVillagers); the boom continues toward
    // villagerTarget during and after the climb — waiting for the full boom target
    // made hard the slowest player on the map to reach Feudal
    && peakVillagers >= ctx.tuning.ageUpVillagers
    // raider: the raid party comes FIRST — saving 500 food before the first wave
    // would freeze militia production for the whole rush window. LATCHED on the
    // PEAK army ever fielded: raid parties die to TC fire, and re-testing the live
    // count kept un-satisfying wantAgeUp forever — a permanently-Dark raider whose
    // militia cannot dent a TC literally could not win any game
    && peakMilitary >= ctx.tuning.minArmyBeforeAgeUp;
  const ageQueued = ageTechId !== null && (snap.own.townCenter ?? [])
    .some((tc) => tc.trainQueue?.some((item) => item.techId === ageTechId) ?? false);
  const savingForAge = wantAgeUp && !ageQueued;
  const ageCost = ageTechId ? gameData.techs[ageTechId]?.cost ?? {} : {};
  // NEARLY BANKED: both age resources within 10% of the requirement (integer math:
  // stock*10 >= cost*9). The last stretch is sacred — reserve BOTH resources at the
  // full target, valve or no valve, so the doTownCenters preempt actually fires.
  // Observed live: a bot floated 800-1076 food for 30+ minutes while archers spent
  // gold back to 180-190 every pass — Castle sat permanently 10% away.
  const nearlyBanked = savingForAge
    && snap.stock.food * 10 >= (ageCost.food ?? 0) * 9
    && snap.stock.gold * 10 >= (ageCost.gold ?? 0) * 9;
  if (!savingForAge) {
    saving.mark = -1;
    saving.markTick = -1;
    saving.relaxUntil = -1;
    saving.stalls = 0;
  } else if (snap.tick >= saving.relaxUntil) {
    const banked = Math.min(snap.stock.food, ageCost.food ?? 0)
      + Math.min(snap.stock.gold, ageCost.gold ?? 0);
    if (banked > saving.mark || saving.markTick < 0) {
      saving.mark = banked;
      saving.markTick = snap.tick;
    } else if (snap.tick - saving.markTick > BANK_STALL_TICKS && p.age !== 'dark') {
      // valve opens — but NEVER in the Dark Age: a dark stall means food income is
      // short, and militia burning the relaxed floor made the bot SLOWER to Feudal
      // (the economy adds farms as natural food runs out; actual defense goes
      // through the skeleton/threat exemption instead). Feudal+ stalls still relax
      // so a harassed bot fields an army rather than starving behind the bank.
      saving.relaxUntil = snap.tick + BANK_RELAX_TICKS;
      saving.stalls++;
      saving.mark = -1;
      saving.markTick = -1;
    }
  }
  const bank = savingForAge && (nearlyBanked || snap.tick >= saving.relaxUntil);
  const rushing = bank && p.age === 'dark';
  return {
    ageTechId,
    ageCost,
    savingForAge,
    foodFloor: bank ? (ageCost.food ?? 0) + (rushing ? 100 : 0)
      : savingForAge ? Math.max(100, Math.floor((ageCost.food ?? 0) / 2)) : 100,
    goldFloor: bank ? (ageCost.gold ?? 0) + (rushing ? 50 : 0)
      : savingForAge ? Math.floor((ageCost.gold ?? 0) / 2) : 0,
    holdFloors: savingForAge && (nearlyBanked || saving.stalls >= 2),
  };
}
