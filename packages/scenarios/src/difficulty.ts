// Difficulty presentation. Chapters author a 1..5 rating; everything the menu
// draws — the label, the pip row, a campaign's overall band — is derived here
// so a campaign card and its chapter rows can never disagree about how hard
// the campaign is.

import type { CampaignDef, DifficultyRating, ScenarioDef } from './schema';

export const DIFFICULTY_RATINGS: readonly DifficultyRating[] = [1, 2, 3, 4, 5];

/**
 * Rank names rather than "Easy/Hard": the campaign menu is in-world, and a
 * player reads "Veteran" as a claim about the chapter, not about themselves.
 */
export const DIFFICULTY_LABELS: Record<DifficultyRating, string> = {
  1: 'Recruit',
  2: 'Soldier',
  3: 'Veteran',
  4: 'Captain',
  5: 'Legend',
};

export function difficultyLabel(rating: DifficultyRating): string {
  return DIFFICULTY_LABELS[rating];
}

/** Filled/empty pip string for the badge ('●●●○○' at rating 3). */
export function difficultyPips(rating: DifficultyRating): string {
  return '●'.repeat(rating) + '○'.repeat(5 - rating);
}

export interface CampaignDifficulty {
  /** Gentlest chapter in the campaign. */
  min: DifficultyRating;
  /** Hardest chapter in the campaign. */
  max: DifficultyRating;
  /** Rounded mean, the single number a campaign card shows. */
  overall: DifficultyRating;
  /** 'Veteran' at a flat rating, 'Soldier to Legend' across a range. */
  label: string;
}

const clampRating = (value: number): DifficultyRating => (
  Math.min(5, Math.max(1, Math.round(value))) as DifficultyRating
);

/**
 * A campaign's difficulty band, derived from the chapters it lists. Chapters
 * with no authored rating (a campaign still being written) are skipped; a
 * campaign with none at all reads as Recruit rather than throwing in a menu.
 */
export function campaignDifficulty(
  campaign: CampaignDef,
  scenariosById: Record<string, ScenarioDef>,
): CampaignDifficulty {
  const ratings = campaign.scenarioIds
    .map((id) => scenariosById[id]?.chapter?.difficulty.rating)
    .filter((rating): rating is DifficultyRating => rating !== undefined);
  if (ratings.length === 0) {
    return { min: 1, max: 1, overall: 1, label: DIFFICULTY_LABELS[1] };
  }
  const min = ratings.reduce((a, b) => (b < a ? b : a));
  const max = ratings.reduce((a, b) => (b > a ? b : a));
  const overall = clampRating(ratings.reduce((sum, r) => sum + r, 0) / ratings.length);
  return {
    min,
    max,
    overall,
    label: min === max
      ? DIFFICULTY_LABELS[min]
      : `${DIFFICULTY_LABELS[min]} to ${DIFFICULTY_LABELS[max]}`,
  };
}
