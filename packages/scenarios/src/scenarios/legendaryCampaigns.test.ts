import { describe, expect, it } from 'vitest';
import {
  campaigns, legendaryScenarios, scenariosById, wallaceCampaign,
} from '../campaign';
import { campaignGameData } from '../heroes';
import { loadScenario } from '../loader';

describe('historical civilization campaigns', () => {
  it('gives every civilization one chronological campaign', () => {
    expect(Object.keys(campaigns)).toEqual([
      'wallace', 'henry-v', 'hardrada', 'joan', 'genghis', 'alexios', 'saladin',
    ]);
    expect(wallaceCampaign.scenarioIds).toHaveLength(12);
    expect(legendaryScenarios).toHaveLength(36);

    for (const campaign of Object.values(campaigns)) {
      expect(campaign.acts).toHaveLength(3 + (campaign.id === 'wallace' ? 2 : 0));
      expect(campaign.acts?.flatMap((act) => act.scenarioIds)).toEqual(campaign.scenarioIds);
    }
  });

  for (const scenario of legendaryScenarios) {
    it(`${scenario.id} is playable and carries complete story metadata`, () => {
      const loaded = loadScenario(scenario, campaignGameData);
      expect(loaded.meta.campaign).toBe(scenario.campaign);
      expect(loaded.meta.index).toBe(scenario.index);
      expect(scenario.chapter?.number).toBe(scenario.index + 1);
      expect(scenario.chapter?.image).toBe(`/campaign/${scenario.campaign}/cover.webp`);
      expect(scenario.briefing.history.length).toBeGreaterThan(300);
      expect(scenario.briefing.objectives.length).toBeGreaterThan(0);
      expect(scenario.triggers.some((trigger) => (
        trigger.effects.some((effect) => effect.kind === 'victory')
      ))).toBe(true);
      expect(scenariosById[scenario.id]).toBe(scenario);
    });
  }
});
