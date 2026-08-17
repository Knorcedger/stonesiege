// Campaign unlock reducer: completing scenario N unlocks N+1; completed stays
// replayable; storage decode is defensive.

import { describe, expect, it } from 'vitest';
import type { CampaignDef } from '@bf/scenarios';
import {
  completeScenario, decodeProgress, emptyProgress, loadProgress, nextScenarioId,
  saveProgress, scenarioStatuses,
} from './progress';
import { makeMemoryStorage } from '../storage';

const campaign: CampaignDef = {
  id: 'wallace',
  title: 'Test',
  description: '',
  scenarioIds: ['w1', 'w2', 'w3'],
};

describe('unlock reducer', () => {
  it('only the first scenario starts unlocked', () => {
    expect(scenarioStatuses(campaign, emptyProgress())).toEqual(['unlocked', 'locked', 'locked']);
  });

  it('completing a scenario unlocks the next and stays replayable', () => {
    const p = completeScenario(emptyProgress(), 'w1');
    expect(scenarioStatuses(campaign, p)).toEqual(['completed', 'unlocked', 'locked']);
    expect(nextScenarioId(campaign, p)).toBe('w2');
  });

  it('is idempotent and immutable', () => {
    const p1 = completeScenario(emptyProgress(), 'w1');
    const p2 = completeScenario(p1, 'w1');
    expect(p2).toBe(p1); // same object: no change
    expect(completeScenario(p1, 'w2')).not.toBe(p1);
    expect(p1.completed).toEqual(['w1']); // original untouched
  });

  it('completing everything leaves no next scenario', () => {
    let p = emptyProgress();
    for (const id of campaign.scenarioIds) p = completeScenario(p, id);
    expect(scenarioStatuses(campaign, p)).toEqual(['completed', 'completed', 'completed']);
    expect(nextScenarioId(campaign, p)).toBeNull();
  });

  it('an out-of-order completion (dev unlock, old saves) still unlocks its successor', () => {
    const p = completeScenario(emptyProgress(), 'w2');
    expect(scenarioStatuses(campaign, p)).toEqual(['unlocked', 'completed', 'unlocked']);
  });
});

describe('progress storage', () => {
  it('round-trips through the KV store', () => {
    const store = makeMemoryStorage();
    saveProgress(completeScenario(emptyProgress(), 'w1'), store);
    expect(loadProgress(store).completed).toEqual(['w1']);
  });

  it('decodes garbage as empty progress', () => {
    expect(decodeProgress(null)).toEqual(emptyProgress());
    expect(decodeProgress('{oops')).toEqual(emptyProgress());
    expect(decodeProgress('{"completed":"w1"}')).toEqual(emptyProgress());
    expect(decodeProgress('{"completed":["w1", 7]}')).toEqual({ completed: ['w1'] });
  });

  it('migrates each completed legacy Wallace scenario to its two focused chapters', () => {
    expect(decodeProgress('{"completed":["wallace-1","wallace-3"]}').completed).toEqual([
      'wallace-1',
      'wallace-3',
      'wallace-01-ledger',
      'wallace-02-lanark',
      'wallace-05-two-risings',
      'wallace-06-stirling',
    ]);
  });
});
