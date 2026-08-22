// The story page a won chapter shows before its statistics.

import { describe, expect, it } from 'vitest';
import { scenariosById } from '@bf/scenarios';
import { chapterAftermathPage } from './aftermath';

describe('chapterAftermathPage', () => {
  const stirling = scenariosById['wallace-06-stirling'];

  it('heads the page with the chapter and act it closed', () => {
    const page = chapterAftermathPage(stirling)!;
    expect(page.kicker).toBe('Chapter 6 · Act II — The Great Victory');
    expect(page.title).toBe('11 September 1297');
    expect(page.image).toBe(stirling.chapter!.image);
    expect(page.paragraphs.length).toBeGreaterThan(1);
    expect(page.quote?.source).toContain('Lübeck');
  });

  it('carries the history note so the record stays separable from the mission', () => {
    expect(chapterAftermathPage(stirling)!.note).toBe(stirling.story!.historyNote);
  });

  it('is skipped entirely by a scenario with no authored story', () => {
    expect(chapterAftermathPage(null)).toBeNull();
    expect(chapterAftermathPage(scenariosById['wallace-1'])).toBeNull();
  });

  it('falls back to the scenario title when there is no chapter framing', () => {
    const page = chapterAftermathPage(
      { title: 'Standalone', story: stirling.story!, chapter: undefined as never },
    )!;
    expect(page.kicker).toBe('Standalone');
    expect(page.image).toBeUndefined();
  });
});
