// Campaign artwork contract: the menu renders campaign covers and chapter art
// directly from these paths, so a missing or renamed file must fail here rather
// than as a broken frame in the campaign list.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { campaigns, scenariosById } from './campaign';

const publicDir = fileURLToPath(new URL('../../../apps/web/public', import.meta.url));
const onDisk = (webPath: string): string => `${publicDir}${webPath}`;

describe('campaign cover art', () => {
  it('gives every campaign a cover that exists, with alt text', () => {
    for (const campaign of Object.values(campaigns)) {
      expect(campaign.cover, campaign.id).toMatch(/^\/campaign\/[\w-]+\/[\w-]+\.webp$/);
      expect(existsSync(onDisk(campaign.cover)), campaign.cover).toBe(true);
      expect(campaign.coverAlt.length, campaign.id).toBeGreaterThan(0);
    }
  });

  it('gives every selectable chapter art that exists, with alt text', () => {
    for (const campaign of Object.values(campaigns)) {
      for (const scenarioId of campaign.scenarioIds) {
        const chapter = scenariosById[scenarioId]?.chapter;
        expect(chapter, scenarioId).toBeDefined();
        expect(existsSync(onDisk(chapter!.image)), chapter!.image).toBe(true);
        expect(chapter!.imageAlt.length, scenarioId).toBeGreaterThan(0);
      }
    }
  });
});
