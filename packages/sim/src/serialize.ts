// Full sim snapshot / restore (Game.serialize + createGameFromSnapshot). The snapshot
// is versioned, JSON-safe (integers, strings, booleans, plain arrays/objects only) and
// COMPLETE: restoring resumes byte-identically (see serialize.test.ts, which proves
// hash-equality across 500 post-resume ticks).
//
// What is NOT stored, because it is exactly re-derivable (all pure functions of stored
// state, re-derived in restoreSimState):
// - walkTerrain: buildWalkTerrain(map) — pure function of terrain.
// - blockers: the per-tile sum of live entity footprints. Every runtime mutation goes
//   through addBlockers(±footprintSize) in entities.ts, so re-adding each stored
//   entity's CURRENT footprint reproduces the grid exactly (stumps, units, and
//   clearance-pending foundations and completed farms count 0).
// - unitsGrid: rebuilt by inserting every live, non-garrisoned unit. Within-cell array
//   order differs from the original run but is unobservable: queryCircle sorts results
//   by entity id (spatial.ts) before anyone iterates them.
// - vision[].counts + the 'visible' (=2) marks: re-applied from the stored visionStamps
//   set (reapplyVisionStamps in fog.ts — exact by construction, see its doc comment).
//   Only the explored (0/1) history is stored, RLE-compressed.
// - statsCache / buildingStatsCache: pure memoization over the stored modifier tables;
//   restored empty and refilled lazily with identical values.
//
// What IS stored even though it looks derivable:
// - modifiers (per-player tables): techs with freeTech chains can interleave passive
//   pushes, so the live table's entry ORDER is not always reproducible from
//   researchedTechs alone — and statMult folding is order-sensitive. Stored verbatim.
// - pathSearches: partially expanded searches saw the blocker grid of EARLIER ticks;
//   re-expanding from scratch against today's blockers could pick different parents.
//   Stored verbatim (dist/settled/parent RLE'd + heap arrays), restored exactly.

import { AGES, GAIA } from './types';
import type {
  AgeId, Entity, GameSnapshot, PlayerSetup, PlayerState, Stockpile, TerrainId, UnitIntent,
} from './types';
import type {
  CombatInfo, FleeState, FoundationSite, GarrisonWalk, GatherInfo, MonkInfo, Motion,
  PackTransition, Projectile, RepairSite, SimState, VisionGroup, VisionStamp, WonderTimer,
} from './internal';
import { inBounds, tileIndex } from './internal';
import { SimRng } from './rng';
import { SpatialGrid } from './spatial';
import type { PlayerModifierTable } from './stats';
import { footprintSize } from './entities';
import { buildWalkTerrain } from './mapgen';
import { reapplyVisionStamps } from './fog';
import { restoreSearches, snapshotSearches } from './path';
import type { GroupSearchSnapshot } from './path';

export const SNAPSHOT_SCHEMA_VERSION = 1;

// ---------- RLE (flat [value, runLength, ...] pairs; grids compress very well) ----------

export function rleEncode(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  const n = values.length;
  let i = 0;
  while (i < n) {
    const v = values[i];
    let run = 1;
    while (i + run < n && values[i + run] === v) run++;
    out.push(v, run);
    i += run;
  }
  return out;
}

/** Decode into a preallocated array-like of the expected length (throws on mismatch). */
export function rleDecodeInto(pairs: readonly number[], out: { length: number; [i: number]: number }): void {
  const expected = out.length; // captured first: writes past a plain Array's end would grow it
  let i = 0;
  for (let p = 0; p < pairs.length; p += 2) {
    const v = pairs[p], run = pairs[p + 1];
    for (let k = 0; k < run; k++) out[i++] = v;
  }
  if (i !== expected) throw new Error(`snapshot RLE length mismatch: ${i} != ${expected}`);
}

function rleToNumbers(pairs: readonly number[], length: number): number[] {
  const out = new Array<number>(length);
  rleDecodeInto(pairs, out);
  return out;
}

// ---------- schema ----------

interface SnapshotPlayer {
  id: number;
  setup: PlayerSetup;
  stockpile: Stockpile;
  age: AgeId;
  pop: number;
  popCap: number;
  researchedTechs: string[];
  defeated: boolean;
  autoReseed?: boolean;
}

/** GroupSearchSnapshot with the three map-sized arrays RLE'd. */
interface SnapshotSearch {
  groupId: number;
  goal: number;
  distRle: number[];
  settledRle: number[];
  parentRle: number[];
  heapCost: number[];
  heapTile: number[];
  waiting: Array<[number, number[]]>;
}

/** The full v1 snapshot schema. Consumers should treat GameSnapshot as opaque. */
export interface GameSnapshotV1 extends GameSnapshot {
  schemaVersion: 1;
  tick: number;
  finished: boolean;
  conquest: boolean;
  popCapLimit: number;
  maxAge?: AgeId;
  nextId: number;
  nextGroupId: number;
  rngState: number;
  map: { width: number; height: number; terrainRle: number[]; terrainIds: TerrainId[] };
  players: SnapshotPlayer[];
  /** Insertion order preserved — every sim pass iterates entities in this order. */
  entities: Entity[];
  refs: Array<[string, number]>;
  visionGroupOf: number[];
  /** Per vision group: explored history only (0/1; live 'visible' re-derives from stamps). */
  visionExploredRle: number[][];
  visionStamps: Array<[number, VisionStamp]>;
  pathSearches: SnapshotSearch[];
  motion: Array<[number, Motion]>;
  foundations: Array<[number, FoundationSite]>;
  buildRetries: Array<[number, number]>;
  modifiers: PlayerModifierTable[];
  ballistics: boolean[];
  enabledUnits: string[][];
  enabledBuildings: string[][];
  gather: Array<[number, GatherInfo]>;
  fleeing: Array<[number, FleeState]>;
  shelterIntents: Array<[number, UnitIntent]>;
  animalCd: Array<[number, number]>;
  decayAcc: Array<[number, number]>;
  repairs: Array<[number, RepairSite]>;
  combat: Array<[number, CombatInfo]>;
  projectiles: Projectile[];
  buildingCd: Array<[number, number]>;
  monks: Array<[number, MonkInfo]>;
  garrisoning: Array<[number, GarrisonWalk]>;
  healAcc: Array<[number, number]>;
  corpses: Array<[number, number]>;
  packTransitions: Array<[number, PackTransition]>;
  marketRates: { food: number; wood: number; stone: number };
  wonders: Array<[number, WonderTimer]>;
  alertNext: number[];
}

// ---------- serialize ----------

const pairsOf = <V>(m: ReadonlyMap<number, V>): Array<[number, V]> => [...m];

/** Keep optional GatherInfo fields in a stable position across save/restore cycles. */
const gatherPairs = (m: ReadonlyMap<number, GatherInfo>): Array<[number, GatherInfo]> =>
  [...m].map(([id, g]) => [id, {
    acc: g.acc,
    retries: g.retries,
    depositing: g.depositing,
    ...(g.dropoffId !== undefined ? { dropoffId: g.dropoffId } : {}),
    nextAttackTick: g.nextAttackTick,
    task: g.task,
    lastX: g.lastX,
    lastY: g.lastY,
    finishAfterDeposit: g.finishAfterDeposit,
    ...(g.farmSpotIndex !== undefined ? { farmSpotIndex: g.farmSpotIndex } : {}),
    ...(g.nextFarmMoveTick !== undefined ? { nextFarmMoveTick: g.nextFarmMoveTick } : {}),
    ...(g.farmRepositioning !== undefined ? { farmRepositioning: g.farmRepositioning } : {}),
  }]);

export function serializeSimState(state: SimState): GameSnapshot {
  const snap: GameSnapshotV1 = {
    schemaVersion: 1,
    tick: state.tick,
    finished: state.finished,
    conquest: state.conquest,
    popCapLimit: state.popCapLimit,
    ...(state.maxAgeLimit !== undefined ? { maxAge: state.maxAgeLimit } : {}),
    nextId: state.nextId,
    nextGroupId: state.nextGroupId,
    rngState: state.rng.getState(),
    map: {
      width: state.map.width,
      height: state.map.height,
      terrainRle: rleEncode(state.map.terrain),
      terrainIds: [...state.map.terrainIds],
    },
    players: state.players.map((p) => ({
      id: p.id,
      setup: p.setup,
      stockpile: p.stockpile,
      age: p.age,
      pop: p.pop,
      popCap: p.popCap,
      researchedTechs: p.researchedTechs,
      defeated: p.defeated,
      ...(p.autoReseed !== undefined ? { autoReseed: p.autoReseed } : {}),
    })),
    entities: [...state.entities.values()],
    refs: [...state.refs],
    visionGroupOf: [...state.visionGroupOf],
    // collapse 'visible' (2) to 'explored' (1): the 2s are re-derived from the stamps
    visionExploredRle: state.vision.map((g) =>
      rleEncode(Array.from(g.visibility, (v) => (v === 0 ? 0 : 1)))),
    visionStamps: pairsOf(state.visionStamps),
    pathSearches: snapshotSearches(state).map((s) => ({
      groupId: s.groupId,
      goal: s.goal,
      distRle: rleEncode(s.dist),
      settledRle: rleEncode(s.settled),
      parentRle: rleEncode(s.parent),
      heapCost: s.heapCost,
      heapTile: s.heapTile,
      waiting: s.waiting,
    })),
    motion: pairsOf(state.motion),
    foundations: pairsOf(state.foundations),
    buildRetries: pairsOf(state.buildRetries),
    modifiers: state.modifiers,
    ballistics: [...state.ballistics],
    enabledUnits: state.enabledUnits.map((s) => [...s]),
    enabledBuildings: state.enabledBuildings.map((s) => [...s]),
    gather: gatherPairs(state.gather),
    fleeing: pairsOf(state.fleeing),
    shelterIntents: pairsOf(state.shelterIntents),
    animalCd: pairsOf(state.animalCd),
    decayAcc: pairsOf(state.decayAcc),
    repairs: pairsOf(state.repairs),
    combat: pairsOf(state.combat),
    projectiles: state.projectiles,
    buildingCd: pairsOf(state.buildingCd),
    monks: pairsOf(state.monks),
    garrisoning: pairsOf(state.garrisoning),
    healAcc: pairsOf(state.healAcc),
    corpses: pairsOf(state.corpses),
    packTransitions: pairsOf(state.packTransitions),
    marketRates: state.marketRates,
    wonders: pairsOf(state.wonders),
    alertNext: [...state.alertNext],
  };
  // Detach from live state AND enforce JSON-safety in one move (sim state is integers,
  // strings and booleans only — anything else here would be a determinism bug anyway).
  return JSON.parse(JSON.stringify(snap)) as GameSnapshotV1;
}

// ---------- restore ----------

/** Rebuild a complete SimState from a snapshot. Throws on schemaVersion mismatch. */
export function restoreSimState(snapshot: GameSnapshot): SimState {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `unsupported snapshot schemaVersion ${String(snapshot?.schemaVersion)} ` +
      `(expected ${SNAPSHOT_SCHEMA_VERSION})`,
    );
  }
  // deep-copy so the restored game never aliases the caller's snapshot object
  const snap = JSON.parse(JSON.stringify(snapshot)) as GameSnapshotV1;

  const tiles = snap.map.width * snap.map.height;
  const terrain = new Uint8Array(tiles);
  rleDecodeInto(snap.map.terrainRle, terrain);
  const map = { width: snap.map.width, height: snap.map.height, terrain, terrainIds: snap.map.terrainIds };

  // vision groups: explored history from the snapshot; counts/'visible' replayed below
  const vision: VisionGroup[] = snap.visionExploredRle.map((rle) => {
    const visibility = new Uint8Array(tiles);
    rleDecodeInto(rle, visibility);
    return { counts: new Uint16Array(tiles), visibility };
  });

  const players: PlayerState[] = snap.players.map((p) => ({
    id: p.id,
    setup: p.setup,
    stockpile: p.stockpile,
    age: p.age,
    pop: p.pop,
    popCap: p.popCap,
    researchedTechs: p.researchedTechs,
    defeated: p.defeated,
    ...(p.autoReseed !== undefined ? { autoReseed: p.autoReseed } : {}),
    // Gaia keeps its inert dark grid; real players share their group's array
    visibility: p.id === GAIA ? new Uint8Array(tiles) : vision[snap.visionGroupOf[p.id]].visibility,
  }));

  const state: SimState = {
    tick: snap.tick,
    map,
    entities: new Map(snap.entities.map((e) => [e.id, e])), // preserves insertion order
    players,
    refs: new Map(snap.refs),
    finished: snap.finished,
    rng: SimRng.fromState(snap.rngState),
    nextId: snap.nextId,
    conquest: snap.conquest,
    popCapLimit: snap.popCapLimit,
    ...(snap.maxAge !== undefined ? { maxAgeLimit: snap.maxAge } : {}),
    walkTerrain: buildWalkTerrain(map),
    blockers: new Uint16Array(tiles),
    unitsGrid: new SpatialGrid(),
    motion: new Map(snap.motion),
    pathSearches: [],
    nextGroupId: snap.nextGroupId,
    visionGroupOf: snap.visionGroupOf,
    vision,
    visionStamps: new Map(snap.visionStamps),
    foundations: new Map(snap.foundations),
    buildRetries: new Map(snap.buildRetries),
    modifiers: snap.modifiers,
    statsCache: new Map(),
    buildingStatsCache: new Map(),
    gather: new Map(snap.gather),
    fleeing: new Map(snap.fleeing),
    shelterIntents: new Map(snap.shelterIntents),
    animalCd: new Map(snap.animalCd),
    decayAcc: new Map(snap.decayAcc),
    repairs: new Map(snap.repairs),
    combat: new Map(snap.combat),
    projectiles: snap.projectiles,
    buildingCd: new Map(snap.buildingCd),
    monks: new Map(snap.monks),
    garrisoning: new Map(snap.garrisoning),
    healAcc: new Map(snap.healAcc),
    corpses: new Map(snap.corpses),
    packTransitions: new Map(snap.packTransitions),
    marketRates: snap.marketRates,
    wonders: new Map(snap.wonders),
    alertNext: snap.alertNext,
    ballistics: snap.ballistics,
    enabledUnits: snap.enabledUnits.map((ids) => new Set(ids)),
    enabledBuildings: snap.enabledBuildings.map((ids) => new Set(ids)),
  };

  // blockers + spatial grid from the entity store (see the derivability notes on top).
  // Grid membership matches the live invariant: garrisoned units (removed on entry,
  // re-inserted on eject) and dead bodies — corpses AND carcasses, both hp<=0 —
  // (removed via clearUnitBookkeeping) are out; everything else is in.
  for (const e of state.entities.values()) {
    const size = footprintSize(e);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = e.tileX + dx, y = e.tileY + dy;
        if (inBounds(map, x, y)) state.blockers[tileIndex(map, x, y)]++;
      }
    }
    if (e.kind === 'unit' && e.hp > 0 && e.garrisonedIn === undefined) {
      state.unitsGrid.insert(e.id, e.x, e.y);
    }
  }

  reapplyVisionStamps(state); // counts + 'visible' marks, exact (fog.ts)

  restoreSearches(state, snap.pathSearches.map((s): GroupSearchSnapshot => ({
    groupId: s.groupId,
    goal: s.goal,
    dist: rleToNumbers(s.distRle, tiles),
    settled: rleToNumbers(s.settledRle, tiles),
    parent: rleToNumbers(s.parentRle, tiles),
    heapCost: s.heapCost,
    heapTile: s.heapTile,
    waiting: s.waiting,
  })));

  // sanity: ages must be valid (guards against hand-edited snapshots feeding AGES.indexOf -1)
  for (const p of state.players) {
    if (!AGES.includes(p.age)) throw new Error(`snapshot: invalid age '${String(p.age)}' for player ${p.id}`);
  }
  return state;
}
