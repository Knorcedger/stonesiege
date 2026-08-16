import { describe, expect, it } from 'vitest';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { scenariosById } from '../campaign';
import { showcaseCitadel } from './showcaseCitadel';

describe('showcase-citadel capture preset', () => {
  const { start, meta } = loadScenario(showcaseCitadel, campaignGameData);
  const count = (defId: string) => start.entities.filter((e) => e.player === 1 && e.defId === defId).length;

  it('loads as a fully developed Imperial-age civilization', () => {
    expect(meta.id).toBe('showcase-citadel');
    expect(meta.playerSetups[0]).toMatchObject({ startingAge: 'imperial', popCap: 200 });
    expect(meta.maxAge).toBe('imperial');
    expect(count('farm')).toBe(10);
    expect(count('villager')).toBe(10);
    expect(count('house')).toBe(19);
    expect(count('castle')).toBe(1);
    expect(count('wonder')).toBe(1);
  });

  it('stages a max-tier army behind a complete fortified circuit', () => {
    const eliteArmy = ['champion', 'eliteHighlandRaider', 'arbalester', 'eliteSkirmisher', 'paladin', 'onager', 'trebuchet'];
    expect(start.entities.filter((e) => e.player === 1 && eliteArmy.includes(e.defId))).toHaveLength(50);
    expect(count('stoneWall')).toBe(130);
    expect(count('gate')).toBe(2);
    expect(count('keep')).toBe(4);
    const wallTiles = new Set(start.entities.filter((e) => e.defId === 'stoneWall')
      .map((e) => `${e.tileX},${e.tileY}`));
    for (const corner of ['20,18', '56,18', '20,50', '56,50']) {
      expect(wallTiles.has(corner), corner).toBe(false);
    }
  });

  it('is deep-linkable without appearing in the Wallace campaign sequence', () => {
    expect(scenariosById[showcaseCitadel.id]).toBe(showcaseCitadel);
  });
});
