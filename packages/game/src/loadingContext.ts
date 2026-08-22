import { campaigns, scenariosById } from '@bf/scenarios';
import type { LoadingArtwork } from './loadingScreen';

/** Resolve a campaign chapter into the artwork and copy shown while it loads. */
export function campaignLoadingArtwork(scenarioId: string | null | undefined): LoadingArtwork | null {
  if (!scenarioId) return null;
  const scenario = scenariosById[scenarioId];
  if (!scenario) return null;
  const campaign = campaigns[scenario.campaign];
  const src = scenario.chapter?.image ?? campaign?.cover;
  if (!src) return null;

  return {
    src,
    campaign: campaign?.title ?? scenario.campaign,
    chapter: scenario.chapter
      ? `Chapter ${scenario.chapter.number} · ${scenario.title}`
      : scenario.title,
    ...(scenario.chapter
      ? { setting: `${scenario.chapter.location} · ${scenario.chapter.date}` }
      : {}),
    ...(scenario.story ? { stakes: scenario.story.stakes } : {}),
  };
}
