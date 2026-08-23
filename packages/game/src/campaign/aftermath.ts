// What a won campaign chapter shows before its statistics panel: the story
// consequence of the battle just fought. Pure derivation (the repo's tests run
// without a DOM); hud/overlays.ts renders whatever this returns.

import type { ScenarioDef } from '@bf/scenarios';

export interface AftermathPage {
  /** Small line over the title: which chapter of which act this closed. */
  kicker: string;
  title: string;
  image?: string;
  imageAlt?: string;
  paragraphs: string[];
  quote?: { text: string; source: string };
  /** Where the mission departed from the record, prefixed by the renderer. */
  note?: string;
}

/**
 * The aftermath page for a scenario, or null when it has no authored story —
 * dev and legacy scenarios, which then go straight to the statistics panel as
 * they always did.
 *
 * The page has one exit and it leads to the statistics panel, so the button
 * says so plainly. Where the run goes after that — the chapter list or the
 * campaign's closing page — is the statistics panel's decision to word.
 */
export function chapterAftermathPage(
  scenario: Pick<ScenarioDef, 'title' | 'chapter' | 'story'> | null | undefined,
): AftermathPage | null {
  const aftermath = scenario?.story?.aftermath;
  if (!scenario || !aftermath) return null;
  const chapter = scenario.chapter;
  return {
    kicker: chapter ? `Chapter ${chapter.number} · ${chapter.act}` : scenario.title,
    title: aftermath.title,
    ...(chapter ? { image: chapter.image, imageAlt: chapter.imageAlt } : {}),
    paragraphs: aftermath.paragraphs,
    ...(aftermath.quote ? { quote: aftermath.quote } : {}),
    ...(scenario.story?.historyNote ? { note: scenario.story.historyNote } : {}),
  };
}
