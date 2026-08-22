import { describe, expect, it } from 'vitest';
import { campaigns } from '@bf/scenarios';
import {
  campaignMenuSummary, menuScrollTopAfterRender, resumeMenuLabel, splitCampaignTitle,
  thumbnailFocus,
} from './menu';

describe('menuScrollTopAfterRender', () => {
  it('preserves the setup-panel position for in-place Practice changes', () => {
    expect(menuScrollTopAfterRender(650, true)).toBe(650);
  });

  it('resets real menu navigation to the top', () => {
    expect(menuScrollTopAfterRender(650, false)).toBe(0);
  });

  it('never restores an invalid negative scroll position', () => {
    expect(menuScrollTopAfterRender(-12, true)).toBe(0);
  });
});

describe('splitCampaignTitle', () => {
  it('splits the authored "Protagonist — Subtitle" form', () => {
    expect(splitCampaignTitle('William Wallace — The Rising of Scotland'))
      .toEqual({ name: 'William Wallace', subtitle: 'The Rising of Scotland' });
  });

  it('keeps a title without the separator whole', () => {
    expect(splitCampaignTitle('Showcase')).toEqual({ name: 'Showcase', subtitle: '' });
  });

  it('gives every shipped campaign a non-empty card name', () => {
    for (const campaign of Object.values(campaigns)) {
      expect(splitCampaignTitle(campaign.title).name.length, campaign.id).toBeGreaterThan(0);
    }
  });
});

describe('thumbnailFocus', () => {
  it('pans across the frame so chapters sharing art do not repeat one crop', () => {
    const focuses = Array.from({ length: 12 }, (_, i) => thumbnailFocus(i));
    expect(new Set(focuses).size).toBe(12);
    expect(focuses[0]).toBe('0% 50%');
  });

  it('stays inside the valid object-position range', () => {
    for (let i = 0; i < 48; i++) {
      const percent = Number(thumbnailFocus(i).split('%')[0]);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('campaignMenuSummary', () => {
  const wallace = campaigns.wallace;

  it('connects a resumable match to its chapter number and completed count', () => {
    const completed = wallace.scenarioIds.slice(0, 6);
    const summary = campaignMenuSummary(
      wallace,
      { completed, prologuesSeen: [] },
      { scenarioId: wallace.scenarioIds[6], label: 'A Guardian’s Winter, 5:59' },
    );

    expect(summary.progressLabel).toBe('6 of 12 chapters complete');
    expect(summary.ribbonLabel).toBe('CHAPTER 7 IN PROGRESS');
    expect(summary.detailLabel).toBe('Chapter 7 in progress · A Guardian’s Winter, 5:59');
  });

  it('names the first ready chapter before a campaign begins', () => {
    const summary = campaignMenuSummary(wallace, { completed: [], prologuesSeen: [] }, null);

    expect(summary.progressLabel).toBe('0 of 12 chapters complete');
    expect(summary.detailLabel).toContain('Chapter 1 ready');
    expect(summary.ribbonLabel).toBeUndefined();
  });

  it('turns the completed state into an explicit replay invitation', () => {
    const summary = campaignMenuSummary(
      wallace, { completed: [...wallace.scenarioIds], prologuesSeen: [] }, null,
    );

    expect(summary.ribbonLabel).toBe('COMPLETE');
    expect(summary.detailLabel).toBe('Campaign complete · Replay any chapter');
  });
});

describe('resumeMenuLabel', () => {
  it('adds campaign and chapter position to the title-screen Continue action', () => {
    const wallace = campaigns.wallace;
    expect(resumeMenuLabel({
      scenarioId: wallace.scenarioIds[6], label: 'A Guardian’s Winter, 5:59',
    })).toBe('William Wallace · Chapter 7 of 12 · A Guardian’s Winter, 5:59');
  });

  it('keeps a practice or legacy label that has no current chapter', () => {
    expect(resumeMenuLabel({ label: 'Practice match, 12:30' })).toBe('Practice match, 12:30');
  });
});
