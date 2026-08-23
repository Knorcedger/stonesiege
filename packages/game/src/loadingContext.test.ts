import { describe, expect, it } from 'vitest';
import { scenariosById } from '@bf/scenarios';
import { campaignLoadingArtwork } from './loadingContext';

describe('campaign loading artwork', () => {
  it('uses the selected chapter art and identifies its campaign', () => {
    expect(campaignLoadingArtwork('wallace-02-lanark')).toEqual({
      src: '/campaign/wallace/act-1-lanark.webp',
      campaign: 'William Wallace — The Rising of Scotland',
      chapter: 'Chapter 2 · The Sheriff of Lanark',
      setting: 'Lanark · May 1297',
      stakes: scenariosById['wallace-02-lanark']!.story!.stakes,
    });
  });

  it('carries the chapter stakes onto the loading screen', () => {
    // The load is the last quiet moment before the map, so it says what this
    // chapter is for rather than only where and when it happens.
    expect(campaignLoadingArtwork('wallace-02-lanark')?.stakes)
      .toContain('the rising dies with the man who started it');
    expect(campaignLoadingArtwork('henry-01-harfleur')?.stakes).toBeTruthy();
  });

  it('uses the campaign cover for chapters that share a campaign illustration', () => {
    expect(campaignLoadingArtwork('henry-01-harfleur')).toMatchObject({
      src: '/campaign/henry-v/cover.webp',
      campaign: 'Henry V — Crown Across the Sea',
      chapter: 'Chapter 1 · The Mouth of the Seine',
    });
  });

  it('leaves practice and unknown scenarios on the neutral fallback', () => {
    expect(campaignLoadingArtwork(undefined)).toBeNull();
    expect(campaignLoadingArtwork('not-a-scenario')).toBeNull();
    expect(campaignLoadingArtwork('showcase-citadel')).toBeNull();
  });
});
