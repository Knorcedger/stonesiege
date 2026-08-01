// Construction: the build command pays the full cost up front, drops a blocking
// foundation (buildProgress 0), and sends the ordered villagers to raise it.
// Builders standing adjacent to the footprint accrue progress AoE2-style
// (time with N builders = 3T / (N + 2), see docs/AOE2_REFERENCE.md); completion
// recomputes pop caps and emits buildingComplete. Deleting a foundation refunds
// the unbuilt fraction of what was paid.

import { gameData } from '@bf/data';
import type { BuildingDef } from '@bf/data';
import { AGES, FP, GAIA, TICKS_PER_SECOND } from './types';
import type { AgeId, Command, Entity, EntityId, PlayerId, SimEvent, Stockpile } from './types';
import type { SimState } from './internal';
import { facingFromDelta, isTileWalkable } from './internal';
import { findFreeAdjacentTile, recomputePopCap, spawnEntity } from './entities';
import { fogOnTileChange } from './fog';
import { orderMove } from './path';

/** buildRate is a float factor in the data (villager = 1); scale to integers for determinism. */
const RATE_SCALE = 10;
/** Give up on a builder that repeatedly fails to reach the site. */
const MAX_APPROACH_RETRIES = 3;

type BuildCmd = Extract<Command, { kind: 'build' }>;

/**
 * GDD: "extra TCs unlock in Castle Age". The Town Center DEF is age 'dark' (one exists at
 * game start), but CONSTRUCTING a new one is gated to castle age. Sim-side override so the
 * gate holds for every command source (HUD, AI, replays).
 */
const BUILD_AGE_OVERRIDES: Partial<Record<string, AgeId>> = { townCenter: 'castle' };

/** Index into AGES of the age required to construct the building (>= the def's availability age). */
export function buildAgeIndex(def: BuildingDef): number {
  const override = BUILD_AGE_OVERRIDES[def.id];
  return Math.max(AGES.indexOf(def.age), override ? AGES.indexOf(override) : 0);
}

/**
 * Non-age construction gates from the def: prerequisite buildings (completed, own —
 * e.g. Farm needs a Mill, Stable needs a Barracks) and prerequisite techs
 * (tower upgrades). Shared by handleBuild and Game.canPlace.
 */
export function hasBuildPrereqs(state: SimState, playerId: PlayerId, def: BuildingDef): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  if (state.enabledBuildings[playerId]?.has(def.id)) return true; // enableBuilding override
  if (def.requiresTech && !player.researchedTechs.includes(def.requiresTech)) return false;
  if (def.requiresBuildings) {
    for (const req of def.requiresBuildings) {
      let ok = false;
      for (const e of state.entities.values()) {
        if (e.kind === 'building' && e.player === playerId && e.defId === req &&
          e.hp > 0 && (e.buildProgress ?? 1000) >= 1000) { ok = true; break; }
      }
      if (!ok) return false;
    }
  }
  return true;
}

/**
 * AoE2-style placement rule: a rival's (non-Gaia, non-own) living unit standing on the
 * footprint blocks placement. One player's command must never move another player's units
 * or cancel their orders, so we reject instead of nudging them.
 */
export function rivalUnitOnFootprint(
  state: SimState, player: PlayerId, tileX: number, tileY: number, size: number,
): boolean {
  // circle bounding box == footprint bounds; queryCircle is coarse (cell-level), filter by tile
  const half = (size * FP) / 2;
  const ids: EntityId[] = [];
  state.unitsGrid.queryCircle(tileX * FP + half, tileY * FP + half, half, ids);
  for (const id of ids) {
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.hp <= 0 || e.garrisonedIn !== undefined) continue;
    if (e.player === player || e.player === GAIA) continue;
    if (e.tileX < tileX || e.tileX >= tileX + size || e.tileY < tileY || e.tileY >= tileY + size) continue;
    return true;
  }
  return false;
}

function pay(s: Stockpile, cost: { food?: number; wood?: number; gold?: number; stone?: number }): boolean {
  const food = cost.food ?? 0, wood = cost.wood ?? 0, gold = cost.gold ?? 0, stone = cost.stone ?? 0;
  if (s.food < food || s.wood < wood || s.gold < gold || s.stone < stone) return false;
  s.food -= food; s.wood -= wood; s.gold -= gold; s.stone -= stone;
  return true;
}

/**
 * Units never block tiles, so a fresh footprint may trap bystanders: nudge them off.
 * Only the building player's own units and Gaia animals are nudged — rival units block
 * placement upstream (rivalUnitOnFootprint), and must never be moved by this command.
 */
function nudgeUnitsOffFootprint(state: SimState, player: PlayerId, tileX: number, tileY: number, size: number): void {
  const spot = findFreeAdjacentTile(state, tileX, tileY, size);
  if (!spot) return; // fully enclosed site — leave them; tryStep still lets them walk out
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.garrisonedIn !== undefined) continue;
    if (e.player !== player && e.player !== GAIA) continue;
    if (e.tileX < tileX || e.tileX >= tileX + size || e.tileY < tileY || e.tileY >= tileY + size) continue;
    e.x = spot.x * FP + FP / 2;
    e.y = spot.y * FP + FP / 2;
    const changed = e.tileX !== spot.x || e.tileY !== spot.y;
    e.tileX = spot.x;
    e.tileY = spot.y;
    state.unitsGrid.move(e.id, e.x, e.y);
    if (changed) fogOnTileChange(state, e);
    state.motion.delete(e.id);
    if (e.activity === 'moving') e.activity = 'idle';
  }
}

export function handleBuild(state: SimState, cmd: BuildCmd, events: SimEvent[]): void {
  const def = gameData.buildings[cmd.defId];
  const player = state.players[cmd.player];
  if (!def || !player) return;
  const enabled = state.enabledBuildings[cmd.player]?.has(cmd.defId) === true;
  if (!enabled && buildAgeIndex(def) > AGES.indexOf(player.age)) return;
  if (!hasBuildPrereqs(state, cmd.player, def)) return;
  const civ = gameData.civs[player.setup.civ];
  if (!enabled && civ && civ.disabled.includes(cmd.defId)) return;

  // builders: owned, alive, un-garrisoned units that can actually build (villagers)
  const builders: Entity[] = [];
  const seen = new Set<EntityId>();
  for (const id of cmd.units) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.entities.get(id);
    if (!e || e.kind !== 'unit' || e.player !== cmd.player || e.hp <= 0) continue;
    if (e.garrisonedIn !== undefined) continue;
    if (!(gameData.units[e.defId]?.buildRate)) continue;
    builders.push(e);
  }
  if (builders.length === 0) return;

  // full footprint must be placeable and free of rival units (mirrors Game.canPlace)
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      if (!isTileWalkable(state, cmd.tileX + dx, cmd.tileY + dy)) return;
    }
  }
  if (rivalUnitOnFootprint(state, cmd.player, cmd.tileX, cmd.tileY, def.size)) return;

  if (!pay(player.stockpile, def.cost)) return;

  nudgeUnitsOffFootprint(state, cmd.player, cmd.tileX, cmd.tileY, def.size);
  const foundation = spawnEntity(state, {
    defId: cmd.defId, player: cmd.player, tileX: cmd.tileX, tileY: cmd.tileY, buildProgress: 0,
  });
  if (!foundation) {
    player.stockpile.food += def.cost.food ?? 0;
    player.stockpile.wood += def.cost.wood ?? 0;
    player.stockpile.gold += def.cost.gold ?? 0;
    player.stockpile.stone += def.cost.stone ?? 0;
    return;
  }

  const ticks = Math.max(1, Math.round(def.buildTime * TICKS_PER_SECOND));
  state.foundations.set(foundation.id, {
    acc: 0,
    accNeeded: 3 * ticks * RATE_SCALE,
    paid: {
      food: def.cost.food ?? 0, wood: def.cost.wood ?? 0,
      gold: def.cost.gold ?? 0, stone: def.cost.stone ?? 0,
    },
  });
  events.push({ kind: 'buildingPlaced', id: foundation.id, defId: foundation.defId, player: foundation.player });

  for (const b of builders) {
    b.intent = { kind: 'build', targetId: foundation.id };
    b.targetId = undefined;
    state.buildRetries.delete(b.id);
    state.combat.delete(b.id);
    state.garrisoning.delete(b.id);
    state.gather.delete(b.id);
    state.fleeing.delete(b.id);
  }
  // blocked center remaps to the nearest walkable tile — i.e. adjacent to the footprint
  orderMove(state, builders.map((b) => b.id), foundation.x, foundation.y);
}

/** Per-tick: builders raise adjacent foundations; finished sites come online. */
export function tickConstruction(state: SimState, events: SimEvent[]): void {
  // 1) resolve builder intents -> scaled build-rate sum per foundation
  const ratesOf = new Map<EntityId, number>();
  for (const e of state.entities.values()) {
    if (e.kind !== 'unit' || e.intent?.kind !== 'build') continue;
    const site = state.entities.get(e.intent.targetId);
    if (!site || site.kind !== 'building' || site.hp <= 0 || (site.buildProgress ?? 1000) >= 1000) {
      // site gone or already complete: release the builder
      e.intent = undefined;
      state.buildRetries.delete(e.id);
      if (e.activity === 'building') e.activity = 'idle';
      continue;
    }
    const size = gameData.buildings[site.defId]?.size ?? 1;
    const adjacent =
      e.tileX >= site.tileX - 1 && e.tileX <= site.tileX + size &&
      e.tileY >= site.tileY - 1 && e.tileY <= site.tileY + size;
    if (adjacent) {
      state.motion.delete(e.id);
      state.buildRetries.delete(e.id);
      e.activity = 'building';
      e.facing = facingFromDelta(site.x - e.x, site.y - e.y);
      const rate = Math.max(1, Math.round((gameData.units[e.defId]?.buildRate ?? 1) * RATE_SCALE));
      ratesOf.set(site.id, (ratesOf.get(site.id) ?? 0) + rate);
    } else if (!state.motion.has(e.id)) {
      // arrived short (spread arrival) or the path failed: re-approach a few times
      const tries = state.buildRetries.get(e.id) ?? 0;
      if (tries >= MAX_APPROACH_RETRIES) {
        e.intent = undefined;
        state.buildRetries.delete(e.id);
        if (e.activity === 'building') e.activity = 'idle';
        continue;
      }
      state.buildRetries.set(e.id, tries + 1);
      orderMove(state, [e.id], site.x, site.y);
    }
  }

  // 2) accrue progress; complete sites
  for (const [id, info] of state.foundations) {
    const site = state.entities.get(id);
    if (!site || (site.buildProgress ?? 1000) >= 1000) {
      state.foundations.delete(id); // destroyed elsewhere (delete/defeat) — lazy cleanup
      continue;
    }
    const n = ratesOf.get(id) ?? 0;
    if (n === 0) continue;
    info.acc += n + 2 * RATE_SCALE; // AoE2: rate with N builders ~ (N + 2) / 3T
    if (info.acc >= info.accNeeded) {
      site.buildProgress = 1000;
      state.foundations.delete(id);
      recomputePopCap(state, site.player);
      events.push({ kind: 'buildingComplete', id: site.id, defId: site.defId, player: site.player });
      for (const e of state.entities.values()) {
        if (e.kind === 'unit' && e.intent?.kind === 'build' && e.intent.targetId === id) {
          e.intent = undefined;
          state.buildRetries.delete(e.id);
          if (e.activity === 'building') e.activity = 'idle';
          // AoE2 behavior: a finished builder auto-joins a nearby own foundation, else idles
          autoJoinNearbyFoundation(state, e);
        }
      }
    } else {
      site.buildProgress = Math.min(999, Math.floor((info.acc * 1000) / info.accNeeded));
    }
  }
}

/** Auto-join: how far (tiles) a finished builder looks for the next own foundation. */
const AUTO_JOIN_RADIUS = 4;

/** Send a just-released builder to the nearest own foundation within a short radius. */
function autoJoinNearbyFoundation(state: SimState, builder: Entity): void {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of state.foundations.keys()) {
    const site = state.entities.get(id);
    if (!site || site.player !== builder.player || site.hp <= 0) continue;
    if ((site.buildProgress ?? 1000) >= 1000) continue;
    const size = gameData.buildings[site.defId]?.size ?? 1;
    // chebyshev distance from the builder to the nearest footprint tile
    const dx = Math.max(site.tileX - builder.tileX, builder.tileX - (site.tileX + size - 1), 0);
    const dy = Math.max(site.tileY - builder.tileY, builder.tileY - (site.tileY + size - 1), 0);
    if (Math.max(dx, dy) > AUTO_JOIN_RADIUS) continue;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = site; }
  }
  if (!best) return;
  builder.intent = { kind: 'build', targetId: best.id };
  orderMove(state, [builder.id], best.x, best.y);
}

/** Refund the unbuilt fraction of a deleted foundation (no-op for completed buildings). */
export function refundFoundation(state: SimState, e: Entity): void {
  const info = state.foundations.get(e.id);
  if (!info) return;
  state.foundations.delete(e.id);
  const player = state.players[e.player];
  if (!player) return;
  const left = 1000 - Math.min(1000, Math.max(0, e.buildProgress ?? 1000));
  player.stockpile.food += Math.floor((info.paid.food * left) / 1000);
  player.stockpile.wood += Math.floor((info.paid.wood * left) / 1000);
  player.stockpile.gold += Math.floor((info.paid.gold * left) / 1000);
  player.stockpile.stone += Math.floor((info.paid.stone * left) / 1000);
}
