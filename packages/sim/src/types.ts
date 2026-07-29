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

export interface TrainQueueItem {
  defId: string;
  ticksLeft: number;
  totalTicks: number;
  /** Resources deducted when queued — refunded exactly on cancel (additive, sim-internal). */
  paid?: Partial<Stockpile>;
  /** True once the item reached the front and reserved population (additive, sim-internal). */
  started?: boolean;
}

/**
 * Recorded intent from attack-move or a rally point set on a resource/enemy (additive).
 * Wave-1 records it; wave-2 systems (auto-engage, auto-gather) act on it.
 */
export type UnitIntent =
  | { kind: 'attackMove'; x: Fixed; y: Fixed }
  | { kind: 'attackTarget'; targetId: EntityId }
  | { kind: 'gather'; targetId: EntityId }
  | { kind: 'build'; targetId: EntityId };

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
  /** Wave-2 hook: intent recorded by attack-move / rally-onto-target (additive). */
  intent?: UnitIntent;
  // buildings
  buildProgress?: number; // 0..1000 (integer); < 1000 = foundation/under construction
  trainQueue?: TrainQueueItem[];
  research?: ResearchState;
  rally?: { x: Fixed; y: Fixed; targetId?: EntityId };
  garrison?: EntityId[];
  // resources (and farms via building def providesFood)
  amountLeft?: number;
  resourceType?: ResourceType;
}

// ---------- players ----------
export interface PlayerSetup {
  name: string;
  civ: string; // civ def id
  team: number; // players on same team are allied; 0 = FFA/no team
  isHuman: boolean;
  color: number; // player color index 0..7 (see ASSET_CONTRACT.md palette)
  startingResources?: Partial<Stockpile>;
  startingAge?: AgeId;
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
  /** 0 = unexplored, 1 = explored, 2 = visible; row-major like GameMap.terrain */
  visibility: Uint8Array;
}

// ---------- commands (all player/AI intent) ----------
export type Command =
  | { kind: 'move'; player: PlayerId; units: EntityId[]; x: Fixed; y: Fixed }
  | { kind: 'attackMove'; player: PlayerId; units: EntityId[]; x: Fixed; y: Fixed }
  | { kind: 'attack'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'gather'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'build'; player: PlayerId; units: EntityId[]; defId: string; tileX: number; tileY: number }
  | { kind: 'repair'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'train'; player: PlayerId; buildingId: EntityId; defId: string }
  | { kind: 'cancelTrain'; player: PlayerId; buildingId: EntityId; index: number }
  | { kind: 'research'; player: PlayerId; buildingId: EntityId; techId: string }
  | { kind: 'cancelResearch'; player: PlayerId; buildingId: EntityId }
  | { kind: 'setRally'; player: PlayerId; buildingId: EntityId; x: Fixed; y: Fixed; targetId?: EntityId }
  | { kind: 'stop'; player: PlayerId; units: EntityId[] }
  | { kind: 'garrison'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'ungarrison'; player: PlayerId; buildingId: EntityId }
  | { kind: 'convert'; player: PlayerId; units: EntityId[]; targetId: EntityId } // monks
  | { kind: 'heal'; player: PlayerId; units: EntityId[]; targetId: EntityId }
  | { kind: 'deleteEntity'; player: PlayerId; entityId: EntityId }
  | { kind: 'marketTrade'; player: PlayerId; sell: ResourceType; buy: ResourceType; amount: number }
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
  | { kind: 'victory'; winners: PlayerId[] };

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
}

export interface GameState {
  tick: Tick;
  map: GameMap;
  entities: ReadonlyMap<EntityId, Entity>; // insertion-ordered
  players: PlayerState[]; // players[0] is Gaia
  /** Entity ids by scenario ref name (empty for practice games). */
  refs: ReadonlyMap<string, EntityId>;
  finished: boolean;
}

export interface Game {
  readonly state: GameState;
  /** Advance exactly one tick. Commands are validated (ownership, legality) and illegal ones dropped. */
  advance(commands: Command[]): SimEvent[];
  /** Cheap structural hash of sim state for determinism tests / desync detection. */
  hash(): number;
  /** True if the building def can be placed with its footprint at tile (for UI preview + AI). */
  canPlace(player: PlayerId, defId: string, tileX: number, tileY: number): boolean;
  /** Walkability grid snapshot (for AI/debug). */
  isWalkable(tileX: number, tileY: number): boolean;
}
