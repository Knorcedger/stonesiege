import { describe, expect, it } from 'vitest';
import { loadScenario } from '../loader';
import { wallaceCampaign, scenariosById } from '../campaign';
import { campaignGameData } from '../heroes';
import { wallaceChapters } from './wallaceChapters';

describe('chapterized William Wallace campaign', () => {
  it('registers twelve playable chapters across five chronological acts', () => {
    expect(wallaceChapters).toHaveLength(12);
    expect(wallaceCampaign.scenarioIds).toEqual(wallaceChapters.map((chapter) => chapter.id));
    expect(wallaceCampaign.acts).toHaveLength(5);
    expect(wallaceCampaign.acts?.flatMap((act) => act.scenarioIds)).toEqual(wallaceCampaign.scenarioIds);
  });

  for (const [index, chapter] of wallaceChapters.entries()) {
    it(`${chapter.id} loads clean with story metadata`, () => {
      const loaded = loadScenario(chapter, campaignGameData);
      expect(loaded.meta.index).toBe(index);
      expect(chapter.chapter?.number).toBe(index + 1);
      expect(chapter.chapter?.image).toMatch(/^\/campaign\/wallace\/.+\.webp$/);
      expect(chapter.briefing.history.length).toBeGreaterThan(250);
      expect(scenariosById[chapter.id]).toBe(chapter);
    });
  }
});

