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
  trainedAt: string[]; // building def ids
  cost: Cost;
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
  carryCapacity?: number;
  requiresTech?: string; // e.g. line upgrade tech id
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
  garrisonCapacity?: number;
  dropOffFor?: ResourceType[];
  trains?: string[]; // unit def ids
  researches?: string[]; // tech ids
  popProvided?: number;
  providesFood?: number; // farm total food
  wall?: boolean;
  gate?: boolean;
  wonder?: boolean;
  requiresTech?: string;
  /** Buildings that must exist before this can be placed (e.g. castle needs castle age only). */
  requiresBuildings?: string[];
  icon: string;
}

export type StatKey =
  | 'hp' | 'attack' | 'armorMelee' | 'armorPierce' | 'range' | 'speed' | 'los'
  | 'rof' | 'accuracy' | 'carryCapacity' | 'buildRate' | 'trainTime'
  | 'conversionResist' | 'garrisonCapacity' | 'farmFood' | 'popCap';

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
  /** AoE2 age-up rule: number of distinct buildings of the player's CURRENT age required. */
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
}
