// Campaign storytelling contract. The menu renders these fields directly, and a
// campaign that ships without them plays as troop movement with no explanation
// attached — the failure this suite exists to prevent. Art paths are checked on
// disk for the same reason campaignArt.test.ts checks covers.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { campaigns, scenariosById } from './campaign';
import { campaignDifficulty, difficultyLabel, difficultyPips } from './difficulty';
import type { StoryPage } from './schema';

const publicDir = fileURLToPath(new URL('../../../apps/web/public', import.meta.url));
const onDisk = (webPath: string): string => `${publicDir}${webPath}`;

const expectStoryPage = (page: StoryPage, id: string): void => {
  expect(page.title.length, id).toBeGreaterThan(0);
  expect(page.kicker.length, id).toBeGreaterThan(0);
  expect(page.cta.length, id).toBeGreaterThan(0);
  expect(page.image, id).toMatch(/^\/campaign\/[\w-]+\/[\w-]+\.webp$/);
  expect(existsSync(onDisk(page.image)), page.image).toBe(true);
  expect(page.imageAlt.length, id).toBeGreaterThan(0);
  expect(page.paragraphs.length, id).toBeGreaterThanOrEqual(3);
  for (const paragraph of page.paragraphs) {
    expect(paragraph.length, id).toBeGreaterThan(80);
  }
};

describe('campaign story pages', () => {
  for (const campaign of Object.values(campaigns)) {
    it(`${campaign.id} opens with a prologue and closes with an epilogue`, () => {
      expectStoryPage(campaign.prologue, `${campaign.id} prologue`);
      expectStoryPage(campaign.epilogue, `${campaign.id} epilogue`);
    });
  }
});

describe('chapter story data', () => {
  for (const campaign of Object.values(campaigns)) {
    for (const scenarioId of campaign.scenarioIds) {
      it(`${scenarioId} states its stakes, its cast, and what the victory changed`, () => {
        const scenario = scenariosById[scenarioId];
        expect(scenario, scenarioId).toBeDefined();
        const story = scenario!.story;
        expect(story, scenarioId).toBeDefined();
        expect(story!.stakes.length, scenarioId).toBeGreaterThan(40);
        expect(story!.cast.length, scenarioId).toBeGreaterThanOrEqual(2);
        for (const member of story!.cast) {
          expect(member.name.length, scenarioId).toBeGreaterThan(0);
          expect(member.role.length, scenarioId).toBeGreaterThan(0);
          expect(member.note.length, scenarioId).toBeGreaterThan(30);
        }
        expect(story!.aftermath.title.length, scenarioId).toBeGreaterThan(0);
        expect(story!.aftermath.paragraphs.length, scenarioId).toBeGreaterThanOrEqual(2);
        // Measured over the whole page, not per paragraph: a chapter is allowed
        // to end on a deliberately short line ('The man could be killed. The
        // rising could not.'), and a floor per paragraph would forbid it.
        for (const paragraph of story!.aftermath.paragraphs) {
          expect(paragraph.trim().length, scenarioId).toBeGreaterThan(0);
        }
        expect(story!.aftermath.paragraphs.join(' ').length, scenarioId).toBeGreaterThan(240);
      });
    }
  }
});

describe('chapter difficulty', () => {
  for (const campaign of Object.values(campaigns)) {
    for (const scenarioId of campaign.scenarioIds) {
      it(`${scenarioId} is rated, with a note saying what makes it hard`, () => {
        const difficulty = scenariosById[scenarioId]?.chapter?.difficulty;
        expect(difficulty, scenarioId).toBeDefined();
        expect(difficulty!.rating, scenarioId).toBeGreaterThanOrEqual(1);
        expect(difficulty!.rating, scenarioId).toBeLessThanOrEqual(5);
        expect(difficulty!.note.length, scenarioId).toBeGreaterThan(30);
      });
    }
  }

  it('labels and pips read consistently across the scale', () => {
    expect(difficultyLabel(1)).toBe('Recruit');
    expect(difficultyLabel(5)).toBe('Legend');
    expect(difficultyPips(3)).toBe('●●●○○');
    expect(difficultyPips(5)).toBe('●●●●●');
    expect(difficultyPips(1)).toHaveLength(5);
  });

  it('derives a campaign band from the chapters it actually lists', () => {
    const wallace = campaignDifficulty(campaigns.wallace, scenariosById);
    expect(wallace.min).toBe(1); // the guided opening chapter
    expect(wallace.max).toBe(5); // Falkirk
    expect(wallace.label).toBe('Recruit to Legend');
    expect(wallace.overall).toBeGreaterThanOrEqual(wallace.min);
    expect(wallace.overall).toBeLessThanOrEqual(wallace.max);
  });

  it('reads a flat campaign as a single rank, not a range', () => {
    const flat = campaignDifficulty(
      { ...campaigns.wallace, scenarioIds: ['wallace-10-falkirk'] },
      scenariosById,
    );
    expect(flat.label).toBe('Legend');
    expect(flat.min).toBe(flat.max);
  });

  it('falls back to the gentlest rank rather than throwing on an unauthored campaign', () => {
    const empty = campaignDifficulty({ ...campaigns.wallace, scenarioIds: [] }, scenariosById);
    expect(empty).toEqual({ min: 1, max: 1, overall: 1, label: 'Recruit' });
  });
});

describe('Wallace chapters carry story while they are being played', () => {
  for (const scenarioId of campaigns.wallace.scenarioIds) {
    it(`${scenarioId} speaks more than an opening and a closing line`, () => {
      const scenario = scenariosById[scenarioId]!;
      const lines = scenario.triggers.flatMap(
        (trigger) => trigger.effects.filter((effect) => effect.kind === 'message'),
      );
      expect(lines.length, scenarioId).toBeGreaterThanOrEqual(5);
    });
  }
});
