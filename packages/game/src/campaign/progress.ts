// Campaign progress: which scenarios are completed, and the pure unlock rule
// derived from it (scenario i is playable once scenario i-1 is complete).
// Persisted through the storage seam; defensive decode like every other store.

import type { CampaignDef } from '@bf/scenarios';
import { appStorage, type KeyValueStorage } from '../storage';

export interface CampaignProgress {
  /** Completed scenario ids (any campaign; ids are globally unique). */
  completed: string[];
}

export const emptyProgress = (): CampaignProgress => ({ completed: [] });

export type ScenarioStatus = 'locked' | 'unlocked' | 'completed';

/**
 * Pure unlock reducer: mark a scenario completed. Idempotent; returns a new
 * object (callers treat progress as immutable).
 */
export function completeScenario(progress: CampaignProgress, scenarioId: string): CampaignProgress {
  if (progress.completed.includes(scenarioId)) return progress;
  return { completed: [...progress.completed, scenarioId] };
}

export function isCompleted(progress: CampaignProgress, scenarioId: string): boolean {
  return progress.completed.includes(scenarioId);
}

/**
 * Status per scenario, in campaign order. The first scenario is always
 * unlocked; each later one unlocks when its predecessor is completed.
 * A completed scenario stays 'completed' (replayable).
 */
export function scenarioStatuses(campaign: CampaignDef, progress: CampaignProgress): ScenarioStatus[] {
  return campaign.scenarioIds.map((id, i) => {
    if (isCompleted(progress, id)) return 'completed';
    if (i === 0 || isCompleted(progress, campaign.scenarioIds[i - 1])) return 'unlocked';
    return 'locked';
  });
}

/** The next scenario the player should be pointed at (first non-completed unlocked one). */
export function nextScenarioId(campaign: CampaignDef, progress: CampaignProgress): string | null {
  const statuses = scenarioStatuses(campaign, progress);
  const i = statuses.findIndex((s) => s === 'unlocked');
  return i >= 0 ? campaign.scenarioIds[i] : null;
}

// ------------------------------------------------------------------ storage

const STORAGE_KEY = 'bf.campaign.progress.v1';

// The first public campaign shipped as six long scenarios. Keep those saves useful
// after the twelve-chapter cut: finishing a legacy scenario counts as finishing both
// of the focused chapters made from it. Legacy ids remain in the array so old match
// snapshots and older app versions can still understand the same storage record.
const LEGACY_WALLACE_CHAPTERS: Record<string, string[]> = {
  'wallace-1': ['wallace-01-ledger', 'wallace-02-lanark'],
  'wallace-2': ['wallace-03-tay', 'wallace-04-ormesby'],
  'wallace-3': ['wallace-05-two-risings', 'wallace-06-stirling'],
  'wallace-4': ['wallace-07-winter', 'wallace-08-guardian'],
  'wallace-5': ['wallace-09-schiltrons', 'wallace-10-falkirk'],
  'wallace-6': ['wallace-11-forest', 'wallace-12-unbroken'],
};

function migrateLegacyProgress(completed: string[]): string[] {
  const migrated = new Set(completed);
  for (const id of completed) {
    for (const chapterId of LEGACY_WALLACE_CHAPTERS[id] ?? []) migrated.add(chapterId);
  }
  return [...migrated];
}

export function decodeProgress(raw: string | null): CampaignProgress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as CampaignProgress;
    if (!Array.isArray(p.completed)) return emptyProgress();
    return {
      completed: migrateLegacyProgress(
        p.completed.filter((id): id is string => typeof id === 'string'),
      ),
    };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(store: KeyValueStorage = appStorage): CampaignProgress {
  return decodeProgress(store.get(STORAGE_KEY));
}

export function saveProgress(progress: CampaignProgress, store: KeyValueStorage = appStorage): void {
  store.set(STORAGE_KEY, JSON.stringify(progress));
}
