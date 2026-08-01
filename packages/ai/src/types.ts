// Public AI contracts. The bot is an external controller exactly like a human player:
// it reads game.state, returns Command[] each tick, and the sim cannot tell the
// difference (ARCHITECTURE: command pattern). Determinism is a hard requirement —
// same seeds and same tick loop reproduce the identical command stream.

import type { Command, PlayerId, SimEvent } from '@bf/sim/types';

export type BotDifficulty = 'easy' | 'standard' | 'hard';

/**
 * Behavior profile (mirrors AiProfile in @bf/scenarios schema — kept structurally
 * identical so trigger `aiProfile` effects assign directly without an import cycle).
 */
export type AiProfile = 'passive' | 'defender' | 'raider' | 'standard' | 'aggressive';

/** Tile rectangle (structurally identical to scenarios Rect / sim TileRect). */
export interface BotRect { x: number; y: number; w: number; h: number }

export interface CreateBotOpts {
  profile?: AiProfile;
  difficulty?: BotDifficulty;
  /** Seeds the bot's own SimRng (independent of the sim's). Same seed = same decisions. */
  seed?: number;
}

export interface Bot {
  readonly player: PlayerId;
  readonly difficulty: BotDifficulty;
  /** Live profile — scenario triggers can change it mid-match (applyAiProfile). */
  readonly profile: AiProfile;
  /**
   * Call once per sim tick with that tick's events (events are optional — the bot
   * also derives everything it needs from state, so legacy `tick()` callers work).
   * Returns the command batch to feed into Game.advance (usually []).
   */
  tick(events?: SimEvent[]): Command[];
  /** ScenarioOps hook — prefer the exported applyAiProfile(bot, profile) helper. */
  setProfile(profile: AiProfile): void;
  /** ScenarioOps hook — prefer the exported attackNow(bot, targetArea?) helper. */
  forceAttack(targetArea?: BotRect): void;
}
