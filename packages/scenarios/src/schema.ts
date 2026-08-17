// Campaign scenario schema: ASCII terrain maps + entity placements + trigger scripts.
// The loader resolves a ScenarioDef into a sim ScenarioStart; the trigger engine runs
// alongside the sim, consuming state + events and issuing effects.

import type { PlayerId, ResourceType, Stockpile, AgeId, TerrainId } from '@bf/sim/types';

export interface Rect { x: number; y: number; w: number; h: number } // tiles

export interface MapToken {
  terrain: TerrainId;
  /** Optional gaia object auto-placed on this tile. */
  object?: 'tree' | 'gold' | 'stone' | 'berries' | 'deer' | 'sheep' | 'wolf';
}

export interface ScenarioMap {
  width: number;
  height: number;
  /** char -> token; every char used in rows must exist here. */
  legend: Record<string, MapToken>;
  /** height strings of exactly width chars each. */
  rows: string[];
}

export interface ScenarioEntity {
  def: string; // unit/building def id
  player: number; // 0 = gaia
  x: number; y: number; // tiles (buildings: top-left of footprint)
  hp?: number; // absolute override
  facing?: number;
  ref?: string; // name for triggers ("wallace", "english_keep")
  amountLeft?: number; // resource override
}

export type AiProfile = 'passive' | 'defender' | 'raider' | 'standard' | 'aggressive';

export interface ScenarioPlayer {
  name: string;
  civ: string;
  team: number;
  isHuman: boolean;
  color: number;
  age: AgeId;
  resources: Partial<Stockpile>;
  aiProfile?: AiProfile; // bots only
  popCap?: number;
}

export type Condition =
  | { kind: 'always' }
  | { kind: 'timerSeconds'; seconds: number } // since this trigger was (last) armed — for unarmed triggers, since armTrigger
  /** Count entities in a rect. Provide atLeast and/or atMost (at least one required). */
  | { kind: 'entitiesInArea'; player?: number; defIds?: string[]; area: Rect; atLeast?: number; atMost?: number }
  | { kind: 'refDestroyed'; ref: string }
  | { kind: 'refsDestroyed'; refs: string[]; all: boolean }
  | { kind: 'playerDefeated'; player: number }
  | { kind: 'researched'; player: number; techId: string }
  | { kind: 'ageReached'; player: number; age: AgeId }
  | { kind: 'resourcesAtLeast'; player: number; type: ResourceType; amount: number }
  | { kind: 'ownedAtLeast'; player: number; defIds: string[]; atLeast: number }
  | { kind: 'ownedAtMost'; player: number; defIds: string[]; atMost: number }
  | { kind: 'objectiveComplete'; objectiveId: string }
  | { kind: 'triggerFired'; triggerId: string };

export type TriggerEffect =
  | { kind: 'message'; text: string; speaker?: string; portrait?: string } // dialogue banner
  | { kind: 'objectiveAdd'; id: string; text: string } // idempotent: no-op if id already added
  // Objective state latches: the first complete/fail wins; later complete/fail effects on a
  // resolved id — or on an id that was never added — are no-ops.
  | { kind: 'objectiveComplete'; id: string }
  | { kind: 'objectiveFail'; id: string }
  | { kind: 'victory' }
  | { kind: 'defeat'; reason?: string }
  | { kind: 'spawn'; entities: ScenarioEntity[] }
  | { kind: 'changeOwner'; refs: string[]; toPlayer: number }
  | { kind: 'revealArea'; player: number; area: Rect }
  | { kind: 'addResources'; player: number; amounts: Partial<Stockpile> }
  | { kind: 'aiProfile'; player: number; profile: AiProfile }
  | { kind: 'aiAttackNow'; player: number; targetArea?: Rect }
  | { kind: 'panCamera'; x: number; y: number }
  // Arming a trigger that has already fired and is not loop is a no-op (a fire-once trigger
  // can never fire twice) — this makes converging arm patterns safe. Arming an armed,
  // not-yet-fired trigger is also a no-op (it does not reset the timer).
  | { kind: 'armTrigger'; triggerId: string }
  | { kind: 'playSting'; sting: 'horn' | 'victory' | 'defeat' | 'alert' };

export interface TriggerDef {
  id: string;
  /** Armed triggers evaluate every tick; unarmed wait for armTrigger. Default true. */
  armed?: boolean;
  /**
   * Re-arm after firing (periodic). Default false = fire once — and armTrigger on a
   * fired non-loop trigger is a no-op, so it can never fire twice.
   */
  loop?: boolean;
  conditions: Condition[]; // AND
  effects: TriggerEffect[];
}

export interface ScenarioDef {
  id: string;
  campaign: string;
  index: number; // order within campaign
  title: string;
  /** Campaign-menu presentation. Optional so standalone/dev scenarios stay lightweight. */
  chapter?: {
    act: string;
    number: number;
    date: string;
    location: string;
    estimatedMinutes: string;
    image: string;
    imageAlt: string;
  };
  briefing: {
    history: string; // pre-mission story text (shown on briefing screen)
    objectives: string[]; // initial objective list
    hints: string[];
  };
  players: ScenarioPlayer[]; // index+1 = PlayerId; gaia implicit
  map: ScenarioMap;
  entities: ScenarioEntity[];
  triggers: TriggerDef[];
  startCamera: { x: number; y: number }; // tiles
  /** Human player's starting age/resources come from players[]; this caps tech (e.g. no imperial). */
  maxAge?: AgeId;
}

export interface CampaignDef {
  id: string;
  title: string;
  description: string;
  scenarioIds: string[]; // in order; completing one unlocks the next
  acts?: Array<{
    id: string;
    title: string;
    years: string;
    scenarioIds: string[];
  }>;
}
