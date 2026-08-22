// The story page a won chapter shows before its statistics.

import { describe, expect, it } from 'vitest';
import { scenariosById } from '@bf/scenarios';
import { chapterAftermathPage } from './aftermath';

describe('chapterAftermathPage', () => {
  const stirling = scenariosById['wallace-06-stirling'];

  it('heads the page with the chapter and act it closed', () => {
    const page = chapterAftermathPage(stirling, false)!;
    expect(page.kicker).toBe('Chapter 6 · Act II — The Great Victory');
    expect(page.title).toBe('11 September 1297');
    expect(page.image).toBe(stirling.chapter!.image);
    expect(page.paragraphs.length).toBeGreaterThan(1);
    expect(page.quote?.source).toContain('Lübeck');
  });

  it('carries the history note so the record stays separable from the mission', () => {
    expect(chapterAftermathPage(stirling, false)!.note)
      .toBe(stirling.story!.historyNote);
  });

  it('points the last chapter of a campaign at the ending rather than the list', () => {
    expect(chapterAftermathPage(stirling, false)!.continueLabel).toBe('Continue');
    expect(chapterAftermathPage(stirling, true)!.continueLabel).toBe('Read the ending');
  });

  it('is skipped entirely by a scenario with no authored story', () => {
    expect(chapterAftermathPage(null, false)).toBeNull();
    expect(chapterAftermathPage(scenariosById['wallace-1'], false)).toBeNull();
  });

  it('falls back to the scenario title when there is no chapter framing', () => {
    const page = chapterAftermathPage(
      { title: 'Standalone', story: stirling.story!, chapter: undefined as never }, false,
    )!;
    expect(page.kicker).toBe('Standalone');
    expect(page.image).toBeUndefined();
  });
});
