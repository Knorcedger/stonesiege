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

/**
 * How hard a chapter plays, 1 (gentle) to 5 (brutal). Authored per chapter;
 * a campaign's rating is derived from its chapters so the two cannot drift.
 * `difficulty.ts` turns a rating into the label and pip count the menu draws.
 */
export type DifficultyRating = 1 | 2 | 3 | 4 | 5;

export interface ChapterDifficulty {
  rating: DifficultyRating;
  /** One line naming what actually makes this chapter hard. */
  note: string;
}

/** A sourced line of period voice, set apart from the narration around it. */
export interface StoryQuote {
  text: string;
  source: string;
}

/** One named person the player meets this chapter, so dialogue has faces. */
export interface CastMember {
  name: string;
  /** Their standing in one short phrase ("Sheriff of Lanark"). */
  role: string;
  /** Why they matter to this chapter. */
  note: string;
}

/** A full-bleed story page: campaign prologue, campaign epilogue. */
export interface StoryPage {
  /** Small line above the title ("Scotland, 1296"). */
  kicker: string;
  title: string;
  /** 16:9 artwork under apps/web/public, like campaign covers. */
  image: string;
  imageAlt: string;
  paragraphs: string[];
  quote?: StoryQuote;
  /** Label for the button that leaves the page ("Begin the rising"). */
  cta: string;
}

/** Narrative framing around a chapter: before it, and after it is won. */
export interface ChapterStory {
  /** What is lost if this chapter fails. Shown large on the briefing. */
  stakes: string;
  cast: CastMember[];
  /** Shown on victory, before the statistics panel: what this changed. */
  aftermath: {
    title: string;
    paragraphs: string[];
    quote?: StoryQuote;
  };
  /** Where the mission dramatizes, compresses, or guesses past the record. */
  historyNote?: string;
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
    difficulty: ChapterDifficulty;
  };
  /**
   * Story framing. Optional for the same reason as `chapter` — dev and legacy
   * scenarios carry neither — but required of every chapter a campaign lists.
   */
  story?: ChapterStory;
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
  /**
   * Campaign-menu cover art: a 16:9 image under apps/web/public (absolute path,
   * e.g. `/campaign/joan/cover.webp`). Required so no campaign can ship as a
   * text-only card in the menu.
   */
  cover: string;
  coverAlt: string;
  /**
   * Opening story page, shown the first time the campaign is opened and
   * re-readable from the chapter list. Required: a campaign must be able to
   * explain itself before it asks anyone to move troops.
   */
  prologue: StoryPage;
  /** Closing story page, shown once the final chapter is complete. */
  epilogue: StoryPage;
  scenarioIds: string[]; // in order; completing one unlocks the next
  acts?: Array<{
    id: string;
    title: string;
    years: string;
    scenarioIds: string[];
  }>;
}
