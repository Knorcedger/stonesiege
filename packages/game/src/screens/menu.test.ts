import { describe, expect, it } from 'vitest';
import { campaigns } from '@bf/scenarios';
import { menuScrollTopAfterRender, splitCampaignTitle, thumbnailFocus } from './menu';

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
