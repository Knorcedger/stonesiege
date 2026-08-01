// Schema for all game data. AoE2 is the balance reference; values live in units.ts,
// buildings.ts, techs.ts, civs.ts. The sim reads ONLY these defs — no hardcoded stats.

import type { AgeId, ResourceType } from '@bf/sim/types';

export interface Cost { food?: number; wood?: number; gold?: number; stone?: number }

/** Armor classes drive the counter system: damage = max(1, Σ per-class max(0, atk - armor)). */
export type ArmorClass =
  | 'melee' | 'pierce' // base damage types — every unit has these two armor values
  | 'infantry' | 'archer' | 'cavalry' | 'siege' | 'monk' | 'spearman' | 'uniqueUnit'
  | 'building' | 'castle' | 'wallOrTower' | 'ram' | 'villager';

export interface ClassValue { cls: ArmorClass; amount: number }

export type GatherTask = 'forage' | 'hunt' | 'farm' | 'wood' | 'gold' | 'stone';

export interface UnitDef {
  id: string;
  name: string;
  age: AgeId; // available from this age (given required tech/upgrades)
  trainedAt: string[]; // building def ids (empty for gaia animals)
  cost: Cost; // empty for gaia animals
  trainTime: number; // seconds
  hp: number;
  /** Base damage first ('melee' OR 'pierce'), then bonus-vs-class entries. */
  attacks: ClassValue[];
  /** Must include 'melee' and 'pierce' entries; may include class armors (negative = weakness). */
  armor: ClassValue[];
  range: number; // tiles; 0 = melee
  minRange?: number;
  rof: number; // seconds between attacks
  projectileSpeed?: number; // tiles/second (ranged only)
  accuracy?: number; // 0..100 (ranged only)
  areaRadius?: number; // tiles, for splash (mangonel)
  speed: number; // tiles/second
  los: number; // tiles
  classes: ArmorClass[]; // memberships used by incoming bonus damage
  pop?: number; // default 1
  garrisonCapacity?: number; // ram
  heals?: boolean;
  converts?: boolean;
  gather?: Partial<Record<GatherTask, number>>; // resource/second (villager)
  buildRate?: number; // construction speed factor (villager = 1)
  /**
   * Resource carried before walking to a drop-off: one value for all tasks, or per-task
   * values (GDD: hunters carry more). Carry techs (Wheelbarrow line) multiply every entry.
   */
  carryCapacity?: number | Partial<Record<GatherTask, number>>;
  /** Built-in resistance to monk conversion, 0..100 (the Faith tech adds on this scale). */
  conversionResist?: number;
  /** Monks: healing reach in tiles (AoE2: 4; conversion uses `range`). */
  healRange?: number;
  /** Monks: HP restored per second while healing. */
  healRate?: number;
  /** Rams: added speed (tiles/second) per garrisoned unit (AoE2: +0.05). */
  garrisonSpeedPerUnit?: number;
  /** Rams: bonus damage entries added per garrisoned unit (AoE2: +10 vs buildings). */
  garrisonAttackPerUnit?: ClassValue[];
  requiresTech?: string; // e.g. line upgrade tech id
  // --- gaia animals (additive) ---
  foodAmount?: number; // food left on the carcass when hunted (sheep/deer)
  huntable?: boolean; // villagers may gather food from it once dead
  herdable?: boolean; // walks to a nearby player and changes ownership (sheep)
  /** Food/second the carcass rots away once dead and not fully eaten (AoE2 ~0.25). */
  decayRate?: number;
  // --- siege (additive) ---
  /** Trebuchet-style units must unpack before firing and pack before moving. */
  pack?: {
    packTime: number; unpackTime: number; // seconds
    /** Replaces `armor` while packed/moving (AoE2: packed trebs are arrow-vulnerable). */
    packedArmor?: ClassValue[];
  };
  icon: string; // atlas frame name
}

export interface BuildingDef {
  id: string;
  name: string;
  age: AgeId;
  cost: Cost;
  buildTime: number; // seconds (single villager; more villagers speed it up AoE2-style)
  hp: number;
  size: number; // footprint size×size tiles
  armor: ClassValue[];
  classes: ArmorClass[];
  attacks?: ClassValue[]; // towers / castle / TC
  range?: number;
  minRange?: number;
  rof?: number;
  projectileSpeed?: number;
  arrowsBase?: number; // simultaneous projectiles when attacking
  arrowsPerGarrison?: number;
  arrowsMax?: number; // cap on simultaneous projectiles (arrowsBase + garrison arrows)
  garrisonCapacity?: number;
  /** HP/second restored to each unit garrisoned inside (AoE2: 0.1; castle 0.2). */
  garrisonHealRate?: number;
  dropOffFor?: ResourceType[];
  trains?: string[]; // unit def ids
  researches?: string[]; // tech ids
  popProvided?: number;
  providesFood?: number; // farm total food
  wall?: boolean;
  gate?: boolean;
  wonder?: boolean;
  /** Wonder: seconds it must stand before victory (AoE2 ≈ 1000 in-game seconds). */
  wonderTimer?: number;
  requiresTech?: string;
  /** Buildings that must exist before this can be placed (e.g. castle needs castle age only). */
  requiresBuildings?: string[];
  /** False = never counts toward age-up building requirements (houses/farms/walls/gates/towers). Default true. */
  countsForAgeUp?: boolean;
  /** One of these alone meets the next age's building requirement (GDD: a Castle alone satisfies Imperial). */
  satisfiesAgeUpAlone?: boolean;
  los?: number; // tiles (additive; fog of war). Sim may default to range when absent.
  icon: string;
}

/** Gaia resource objects placed on the map: trees, mines, berry bushes. */
export interface ResourceDef {
  id: string;
  name: string;
  resourceType: ResourceType;
  amount: number; // total resource held (e.g. tree = 100 wood)
  gatherTask: GatherTask; // which villager gather rate applies
  hp?: number; // only if attackable (trees can be cleared); mines/bushes are indestructible
  icon: string;
}

export type StatKey =
  | 'hp' | 'attack' | 'armorMelee' | 'armorPierce' | 'range' | 'speed' | 'los'
  | 'rof' | 'accuracy' | 'carryCapacity' | 'buildRate' | 'trainTime'
  | 'conversionResist' | 'garrisonCapacity' | 'farmFood' | 'popCap' | 'minRange';

export type TechEffect =
  | { kind: 'statAdd'; stat: StatKey; amount: number; targetClasses?: ArmorClass[]; targetIds?: string[] }
  | { kind: 'statMult'; stat: StatKey; percent: number; targetClasses?: ArmorClass[]; targetIds?: string[] }
  | { kind: 'bonusDamage'; vs: ArmorClass; amount: number; targetClasses?: ArmorClass[]; targetIds?: string[] }
  | { kind: 'gatherMult'; task: GatherTask; percent: number }
  | { kind: 'upgradeUnit'; from: string; to: string } // line upgrade: existing units transform
  | { kind: 'enableUnit'; id: string }
  | { kind: 'enableBuilding'; id: string }
  | { kind: 'ageUp'; to: AgeId }
  | { kind: 'freeTech'; techId: string }
  | { kind: 'ballistics' } // projectile target leading
  | { kind: 'costMult'; percent: number; targetIds?: string[]; targetClasses?: ArmorClass[] };

export interface TechDef {
  id: string;
  name: string;
  age: AgeId;
  researchedAt: string[]; // building def ids
  cost: Cost;
  researchTime: number; // seconds
  effects: TechEffect[];
  requiresTech?: string; // chain (e.g. tier 2 needs tier 1)
  /**
   * AoE2 age-up rule: number of distinct buildings of the player's CURRENT age required.
   * Buildings with countsForAgeUp: false never qualify; a satisfiesAgeUpAlone building
   * (Castle, for Imperial) meets the requirement by itself.
   */
  requiresBuildingsOfCurrentAge?: number;
  unique?: boolean; // unique techs are per-civ (referenced from CivDef)
  icon: string;
}

export interface CivDef {
  id: string;
  name: string;
  description: string;
  /** Passive civ bonuses, applied at game start (or gated by an age via ageGate). */
  bonuses: Array<{ effect: TechEffect; fromAge?: AgeId }>;
  uniqueUnit: string; // unit def id (trained at castle)
  eliteUniqueTech: string; // upgrades unique unit (imperial)
  uniqueTechs: [string, string]; // [castle-age, imperial-age]
  /** Tech-tree cuts: unit/tech/building ids this civ cannot use. */
  disabled: string[];
}

export interface GameData {
  units: Record<string, UnitDef>;
  buildings: Record<string, BuildingDef>;
  techs: Record<string, TechDef>;
  civs: Record<string, CivDef>;
  resources: Record<string, ResourceDef>;
}
