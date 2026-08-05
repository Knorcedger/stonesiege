// Core simulation contracts. Everything downstream (@bf/game, @bf/ai, @bf/scenarios)
// codes against these types. Extend carefully; renderer and AI depend on this surface.

// ---------- fixed point ----------
export const FP = 256 as const; // 256 fixed-point units = 1 tile
export type Fixed = number; // ALWAYS an integer
export const fp = (tiles: number): Fixed => Math.round(tiles * FP);
export const fpToTiles = (v: Fixed): number => v / FP;

export const TICKS_PER_SECOND = 20;
export const secondsToTicks = (s: number): number => Math.round(s * TICKS_PER_SECOND);

export type EntityId = number;
export type PlayerId = number; // 0 = Gaia (neutral: trees, mines, wildlife)
export const GAIA: PlayerId = 0;
export type Tick = number;

export type ResourceType = 'food' | 'wood' | 'gold' | 'stone';
export type Stockpile = Record<ResourceType, number>;

export type AgeId = 'dark' | 'feudal' | 'castle' | 'imperial';
export const AGES: readonly AgeId[] = ['dark', 'feudal', 'castle', 'imperial'] as const;

// ---------- terrain ----------
export type TerrainId = 'grass' | 'dirt' | 'sand' | 'water' | 'shallows' | 'road' | 'farmland' | 'snow';

export interface GameMap {
  width: number; // tiles
  height: number;
  terrain: Uint8Array; // TerrainId index, row-major [y * width + x]
  terrainIds: readonly TerrainId[]; // index -> id lookup for the grid above
}

// ---------- entities ----------
export type EntityKind = 'unit' | 'building' | 'resource';

export type UnitActivity =
  | 'idle' | 'moving' | 'attacking' | 'gathering' | 'building' | 'repairing'
  | 'carrying' | 'dying' | 'garrisoned' | 'healing' | 'converting' | 'fleeing';

/** Player-selected arrangement for groups of three or more units. */
export type Formation = 'line' | 'rectangle' | 'wedge';

export interface TrainQueueItem {
  defId: string;
  ticksLeft: number;
  totalTicks: number;
  /** Resources deducted when queued — refunded exactly on cancel (additive, sim-internal). */
  paid?: Partial<Stockpile>;
  /** True once the item reached the front and reserved population (additive, sim-internal). */
  started?: boolean;
  /**
   * Set = this queue slot is a RESEARCH, not a unit (AoE2: research occupies the same
   * production queue). defId mirrors the tech id; no population is reserved (additive).
   */
  techId?: string;
}

/**
 * Recorded intent from attack-move or a rally point set on a resource/enemy (additive).
 * Wave-1 records it; wave-2 systems (auto-engage, auto-gather) act on it.
 */
export type UnitIntent =
  | { kind: 'attackMove'; x: Fixed; y: Fixed }
  | { kind: 'attackTarget'; targetId: EntityId }
  | { kind: 'gather'; targetId: EntityId }
  | { kind: 'build'; targetId: EntityId }
  | { kind: 'repair'; targetId: EntityId };

export interface ResearchState {
  techId: string;
  ticksLeft: number;
  totalTicks: number;
}

/** One record type for units, buildings, and gaia resources (trees/mines/berries/animals). */
export interface Entity {
  id: EntityId;
  kind: EntityKind;
  defId: string; // key into @bf/data defs
  player: PlayerId;
  x: Fixed; y: Fixed; // entity center, fixed-point tiles
  tileX: number; tileY: number; // derived anchor tile (buildings: top-left of footprint)
  facing: number; // 0..7, 0 = south, clockwise (see ASSET_CONTRACT.md)
  hp: number; maxHp: number;
  activity: UnitActivity; // renderer picks animation from this
  // units
  targetId?: EntityId;
  carrying?: { type: ResourceType; amount: number };
  garrisonedIn?: EntityId;
  /**
   * Garrisoned by the villager-flee reflex, NOT by an explicit order (additive). The
   * HUD counts sheltering villagers in the idle-villager badge so a raid can't bury
   * the workforce invisibly; ungarrison clears it and restores the pre-flee task.
   */
  sheltering?: boolean;
  /** Wave-2 hook: intent recorded by attack-move / rally-onto-target (additive). */
  intent?: UnitIntent;
  // buildings
  buildProgress?: number; // 0..1000 (integer); < 1000 = foundation/under construction
  /**
   * A newly placed foundation whose footprint still contains friendly/Gaia units.
   * It is visible and reserves the site, but does not block movement or gain build
   * progress until those units have physically walked outside the footprint.
   */
  foundationPendingClearance?: boolean;
  trainQueue?: TrainQueueItem[];
  research?: ResearchState;
  rally?: { x: Fixed; y: Fixed; targetId?: EntityId };
  garrison?: EntityId[];
  // resources (and farms via building def providesFood)
  amountLeft?: number;
  resourceType?: ResourceType;
  /**
   * Depleted tree remnant: the entity stays for the renderer (stump visual) but no
   * longer blocks its tile (additive; set by the gathering system).
   */
  stump?: boolean;
  /**
   * Pack-capable siege (trebuchet): true = packed/mobile (cannot fire), false =
   * unpacked/immobile (can fire). Undefined for everything else (additive).
   */
  packed?: boolean;
}

// ---------- players ----------
export interface PlayerSetup {
  name: string;
  civ: string; // civ def id
  team: number; // players on same team are allied; 0 = FFA/no team
  isHuman: boolean;
  color: number; // player color index 0..7 (see ASSET_CONTRACT.md palette)
  /**
   * When present, the COMPLETE starting stockpile — unlisted resource types start
   * at 0 (scenarios author exact kits; `{}` = destitute). When absent, the AoE2
   * standard starting kit applies (200f/200w/100g/200s).
   */
  startingResources?: Partial<Stockpile>;
  startingAge?: AgeId;
  /**
   * Per-player pop ceiling (scenario campaigns — OPS_NEEDED.md gap 2). Additive; the
   * global GameConfig.popCap still applies on top (effective cap = min of the two).
   */
  popCap?: number;
}

export interface PlayerState {
  id: PlayerId;
  setup: PlayerSetup;
  stockpile: Stockpile;
  age: AgeId;
  pop: number;
  popCap: number; // min(sum of popProvided, config.popCap)
  researchedTechs: string[]; // insertion order
  defeated: boolean;
  /**
   * GDD: the Mill/TC auto-reseed queue toggle — when on, an exhausted farm is
   * instantly replanted, deducting its full wood cost (additive; queueReseed command).
   */
  autoReseed?: boolean;
  /** 0 = unexplored, 1 = explored, 2 = visible; row-major like GameMap.terrain */
  visibility: Uint8Array;
}

// ---------- commands (all player/AI intent) ----------
export type Command =
  | { kind: 'move'; player: PlayerId; units: EntityId[]; x: Fixed; y: Fixed; formation?: Formation }
  | { kind: 'attackMove'; player: PlayerId; units: EntityId[]; x: Fixed; y: Fixed; formation?: Formation }
  | { kind: 'attack'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'gather'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | {
      kind: 'build'; player: PlayerId; units: EntityId[]; defId: string; tileX: number; tileY: number;
      /** Shift-placement: place now, but builders already constructing finish their queue first. */
      queue?: boolean;
    }
  | { kind: 'repair'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'train'; player: PlayerId; buildingId: EntityId; defId: string }
  | { kind: 'cancelTrain'; player: PlayerId; buildingId: EntityId; index: number }
  | { kind: 'research'; player: PlayerId; buildingId: EntityId; techId: string }
  | { kind: 'cancelResearch'; player: PlayerId; buildingId: EntityId }
  | { kind: 'setRally'; player: PlayerId; buildingId: EntityId; x: Fixed; y: Fixed; targetId?: EntityId }
  | { kind: 'stop'; player: PlayerId; units: EntityId[] }
  | { kind: 'garrison'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  /** Toggle the TC bell: shelter nearby villagers, or release them back to work. */
  | { kind: 'townBell'; player: PlayerId; buildingId: EntityId }
  | { kind: 'ungarrison'; player: PlayerId; buildingId: EntityId }
  | { kind: 'convert'; player: PlayerId; units: EntityId[]; targetId: EntityId } // monks
  | { kind: 'heal'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'deleteEntity'; player: PlayerId; entityId: EntityId }
  | { kind: 'marketTrade'; player: PlayerId; sell: ResourceType; buy: ResourceType; amount: number }
  | { kind: 'reseedFarm'; player: PlayerId; farmId: EntityId } // GDD: reseed a fallow farm at full wood cost
  | { kind: 'queueReseed'; player: PlayerId; enabled: boolean } // GDD: Mill/TC auto-reseed toggle
  | { kind: 'pack'; player: PlayerId; units: EntityId[] } // trebuchets: fold up to move
  | { kind: 'unpack'; player: PlayerId; units: EntityId[] } // trebuchets: deploy to fire
  | { kind: 'resign'; player: PlayerId };

// ---------- events (for renderer, audio, triggers, AI) ----------
export type SimEvent =
  | { kind: 'entitySpawned'; id: EntityId; defId: string; player: PlayerId }
  | { kind: 'entityDied'; id: EntityId; defId: string; player: PlayerId; x: Fixed; y: Fixed; killer?: PlayerId }
  | { kind: 'buildingComplete'; id: EntityId; defId: string; player: PlayerId }
  | { kind: 'buildingPlaced'; id: EntityId; defId: string; player: PlayerId }
  | { kind: 'projectileFired'; fromId: EntityId; targetId: EntityId; x0: Fixed; y0: Fixed; x1: Fixed; y1: Fixed; flightTicks: number; arc: 'flat' | 'high'; hit: boolean }
  | { kind: 'attackImpact'; attackerId: EntityId; targetId: EntityId; damage: number; melee: boolean }
  | { kind: 'unitTrained'; id: EntityId; defId: string; player: PlayerId; buildingId: EntityId }
  | { kind: 'researchComplete'; player: PlayerId; techId: string }
  | { kind: 'ageAdvanced'; player: PlayerId; age: AgeId }
  | { kind: 'resourceDepleted'; id: EntityId; resourceType: ResourceType }
  | { kind: 'resourceDropped'; player: PlayerId; type: ResourceType; amount: number }
  | { kind: 'conversionComplete'; monkId: EntityId; targetId: EntityId; fromPlayer: PlayerId; toPlayer: PlayerId }
  | { kind: 'underAttack'; player: PlayerId; x: Fixed; y: Fixed } // throttled town-bell alert
  | { kind: 'playerDefeated'; player: PlayerId }
  | { kind: 'victory'; winners: PlayerId[] }
  // market (GDD: global drifting rate, ~30% fee). One event per marketTrade command.
  | { kind: 'marketTraded'; player: PlayerId; resource: ResourceType; direction: 'buy' | 'sell'; amount: number; gold: number; rate: number }
  // wonder victory countdown stream (started/once-per-second/cancelled)
  | { kind: 'wonderStarted'; player: PlayerId; secondsLeft: number }
  | { kind: 'wonderCountdown'; player: PlayerId; secondsLeft: number }
  | { kind: 'wonderDestroyed'; player: PlayerId };

// ---------- game ----------
export interface MapGenConfig {
  type: 'practice-random';
  width: number; height: number;
}

/** Pre-resolved scenario start (produced by @bf/scenarios loader). */
export interface ScenarioStart {
  type: 'scenario';
  map: GameMap;
  entities: Array<{
    defId: string; player: PlayerId; tileX: number; tileY: number;
    hp?: number; facing?: number; ref?: string; amountLeft?: number;
  }>;
  revealAll?: boolean;
}

export interface GameConfig {
  seed: number;
  map: MapGenConfig | ScenarioStart;
  players: PlayerSetup[]; // index + 1 = PlayerId (0 is Gaia)
  popCap: number;
  /**
   * Scenario tech ceiling (OPS_NEEDED.md gap 3, loader meta.maxAge): researching INTO
   * any age beyond this is blocked for every player (e.g. 'dark' = no Feudal in
   * wallace-1). Omitted = no ceiling. startingAge above the ceiling is left untouched.
   */
  maxAge?: AgeId;
}

export interface GameState {
  tick: Tick;
  map: GameMap;
  entities: ReadonlyMap<EntityId, Entity>; // insertion-ordered
  players: PlayerState[]; // players[0] is Gaia
  /** Entity ids by scenario ref name (empty for practice games). */
  refs: ReadonlyMap<string, EntityId>;
  finished: boolean;
  /**
   * True when the GDD conquest rules (per-tick elimination check) decide this match —
   * practice games; scenario defeat is trigger-scripted. Additive/optional so mock
   * states stay valid; the SimState behind a real Game always carries it. Bots read
   * it to know whether resigning-when-hopeless applies.
   */
  conquest?: boolean;
  /**
   * GDD market: the live GLOBAL exchange rates (gold per 100), shared by all players
   * and drifted by every trade. Additive/optional so mock states stay valid; the HUD
   * should quote from these when present.
   */
  marketRates?: Readonly<{ food: number; wood: number; stone: number }>;
}

// ---------- scenario ops (narrow sim-side surface for the trigger engine) ----------
/** Tile rectangle (x, y = top-left; w × h tiles). */
export interface TileRect { x: number; y: number; w: number; h: number }

export interface SimOpsSpawn {
  defId: string; player: PlayerId; tileX: number; tileY: number;
  hp?: number; facing?: number; amountLeft?: number; ref?: string;
}

/** Filter for SimOps.getCounts. Omitted fields match everything. */
export interface SimOpsQuery {
  player?: PlayerId;
  defIds?: string[];
  /** An entity matches when its ANCHOR tile (buildings: top-left) lies inside. */
  area?: TileRect;
}

/**
 * Narrow deterministic write/read surface for the scenario trigger engine (additive).
 * Everything here mutates/reads sim state through the same code paths commands use.
 */
export interface SimOps {
  /** Spawn entities immediately (refs registered in state.refs). Returns created ids (null entries dropped). */
  spawn(entities: SimOpsSpawn[]): EntityId[];
  /** Transfer entities to another player (hp preserved; fog/pop/popCap re-booked). */
  changeOwner(entityIds: EntityId[], toPlayer: PlayerId): void;
  /** Permanently mark a tile rect explored for a player (their team's shared map). */
  revealArea(player: PlayerId, area: TileRect): void;
  addResources(player: PlayerId, amounts: Partial<Stockpile>): void;
  /** Count live entities matching the query (corpses and under-construction buildings excluded). */
  getCounts(query: SimOpsQuery): number;
}

/**
 * Versioned, JSON-safe snapshot of COMPLETE sim state. Opaque to consumers: treat it
 * as a black box for JSON.stringify/parse + createGameFromSnapshot. The full schema
 * (GameSnapshotV1) lives in serialize.ts; schemaVersion mismatches are rejected on load.
 */
export interface GameSnapshot {
  schemaVersion: number;
}

export interface Game {
  readonly state: GameState;
  /** Advance exactly one tick. Commands are validated (ownership, legality) and illegal ones dropped. */
  advance(commands: Command[]): SimEvent[];
  /** Cheap structural hash of sim state for determinism tests / desync detection. */
  hash(): number;
  /**
   * Complete JSON-safe snapshot of the sim (all deterministic state). Resuming via
   * createGameFromSnapshot continues byte-identically to the original run.
   */
  serialize(): GameSnapshot;
  /** True if the building def can be placed with its footprint at tile (for UI preview + AI). */
  canPlace(player: PlayerId, defId: string, tileX: number, tileY: number): boolean;
  /** Walkability grid snapshot (for AI/debug). */
  isWalkable(tileX: number, tileY: number): boolean;
  /** Scenario-engine surface (additive; absent on mock/replay implementations). */
  readonly ops?: SimOps;
}
