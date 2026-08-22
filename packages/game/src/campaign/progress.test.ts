// Campaign unlock reducer: completing scenario N unlocks N+1; completed stays
// replayable; storage decode is defensive.

import { describe, expect, it } from 'vitest';
import type { CampaignDef } from '@bf/scenarios';
import {
  campaignEpilogueDue, completeScenario, decodeProgress, emptyProgress, hasSeenPrologue,
  isCampaignComplete, loadProgress, markPrologueSeen, nextScenarioId, saveProgress,
  scenarioStatuses,
} from './progress';
import { makeMemoryStorage } from '../storage';

const campaign: CampaignDef = {
  id: 'wallace',
  title: 'Test',
  description: '',
  cover: '/campaign/wallace/act-2-stirling.webp',
  coverAlt: '',
  prologue: {
    kicker: '', title: 'Prologue', image: '/campaign/wallace/act-1-lanark.webp',
    imageAlt: '', paragraphs: [], cta: 'Begin',
  },
  epilogue: {
    kicker: '', title: 'Epilogue', image: '/campaign/wallace/act-5-unbroken.webp',
    imageAlt: '', paragraphs: [], cta: 'Return',
  },
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
    expect(decodeProgress('{"completed":["w1", 7]}'))
      .toEqual({ completed: ['w1'], prologuesSeen: [] });
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

describe('campaign story state', () => {
  it('shows a prologue once and remembers it', () => {
    let progress = emptyProgress();
    expect(hasSeenPrologue(progress, 'wallace')).toBe(false);
    progress = markPrologueSeen(progress, 'wallace');
    expect(hasSeenPrologue(progress, 'wallace')).toBe(true);
    // Idempotent, and one campaign's opening says nothing about another's.
    expect(markPrologueSeen(progress, 'wallace')).toBe(progress);
    expect(hasSeenPrologue(progress, 'joan')).toBe(false);
  });

  it('keeps completion and prologue state independent', () => {
    const progress = completeScenario(markPrologueSeen(emptyProgress(), 'wallace'), 'w1');
    expect(progress.prologuesSeen).toEqual(['wallace']);
    expect(progress.completed).toEqual(['w1']);
  });

  it('unlocks the epilogue only once every chapter is complete', () => {
    let progress = emptyProgress();
    expect(isCampaignComplete(campaign, progress)).toBe(false);
    progress = completeScenario(completeScenario(progress, 'w1'), 'w2');
    expect(isCampaignComplete(campaign, progress)).toBe(false);
    progress = completeScenario(progress, 'w3');
    expect(isCampaignComplete(campaign, progress)).toBe(true);
  });

  it('reads a record written before campaigns had opening pages', () => {
    const decoded = decodeProgress(JSON.stringify({ completed: ['wallace-01-ledger'] }));
    expect(decoded.prologuesSeen).toEqual([]);
    expect(decoded.completed).toContain('wallace-01-ledger');
  });

  it('round-trips prologue state through storage', () => {
    const store = makeMemoryStorage();
    saveProgress(markPrologueSeen(emptyProgress(), 'wallace'), store);
    expect(loadProgress(store).prologuesSeen).toEqual(['wallace']);
  });
});

describe('campaignEpilogueDue', () => {
  const finished = { completed: ['w1', 'w2', 'w3'], prologuesSeen: [] };

  it('is due when the final chapter completes the campaign', () => {
    expect(campaignEpilogueDue(campaign, finished, 'w3')).toBe(true);
  });

  it('is not due for a replay of an earlier chapter of a finished campaign', () => {
    // Replay is an offered flow at COMPLETE, and it must end on the chapter
    // list — not drop the player back at the ending they have already read.
    expect(campaignEpilogueDue(campaign, finished, 'w1')).toBe(false);
    expect(campaignEpilogueDue(campaign, finished, 'w2')).toBe(false);
  });

  it('is not due while any earlier chapter is still unplayed', () => {
    const skipped = { completed: ['w1', 'w3'], prologuesSeen: [] };
    expect(campaignEpilogueDue(campaign, skipped, 'w3')).toBe(false);
  });

  it('is never due for a scenario outside any known campaign', () => {
    expect(campaignEpilogueDue(undefined, finished, 'w3')).toBe(false);
    expect(campaignEpilogueDue(campaign, finished, 'showcase-citadel')).toBe(false);
  });
});
