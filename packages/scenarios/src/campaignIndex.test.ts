import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { campaigns, scenariosById } from './campaign';

const indexPath = fileURLToPath(new URL('../../../docs/CAMPAIGN_INDEX.md', import.meta.url));
const markdown = readFileSync(indexPath, 'utf8');

interface DocumentedChapter {
  id: string;
  title: string;
  date: string;
  location: string;
  player: string;
  protagonist: string;
  missionType: string;
  source: string;
}

const documented: DocumentedChapter[] = markdown.split('\n')
  .filter((line) => /^\|\s*\d+\s*\|\s*`[^`]+`/.test(line))
  .map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(cells[2]);
    if (!link) throw new Error(`Malformed campaign-index chapter link: ${cells[2]}`);
    return {
      id: cells[1].replaceAll('`', ''),
      title: link[1],
      source: link[2],
      date: cells[3],
      location: cells[4],
      player: cells[5],
      protagonist: cells[6],
      missionType: cells[7],
    };
  });

describe('contributor campaign index', () => {
  it('documents all 48 selectable chapters exactly once and in campaign order', () => {
    const selectable = Object.values(campaigns).flatMap((campaign) => campaign.scenarioIds);
    expect(selectable).toHaveLength(48);
    expect(documented.map((chapter) => chapter.id)).toEqual(selectable);
    expect(new Set(documented.map((chapter) => chapter.id)).size).toBe(48);
  });

  it('keeps titles, dates, locations, and source links aligned with authored scenarios', () => {
    for (const chapter of documented) {
      const scenario = scenariosById[chapter.id];
      expect(scenario, chapter.id).toBeDefined();
      expect(chapter.title).toBe(scenario.title);
      expect(chapter.date).toBe(scenario.chapter?.date);
      expect(chapter.location).toBe(scenario.chapter?.location);
      expect(chapter.source).toContain(
        scenario.campaign === 'wallace' ? 'wallaceChapters.ts' : 'legendaryCampaigns.ts',
      );
      expect(chapter.player.length).toBeGreaterThan(0);
      expect(chapter.protagonist.length).toBeGreaterThan(0);
      expect(chapter.missionType.length).toBeGreaterThan(0);
    }
  });

  it('links every campaign title from the document', () => {
    for (const campaign of Object.values(campaigns)) expect(markdown).toContain(`## ${campaign.title}`);
  });
});
