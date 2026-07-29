// Command-card model: affordable actions must render their COLORED icon and be
// enabled; gray (`<icon>/gray`) is reserved for genuinely unavailable actions.
// Regression coverage for the wave-1 card that rendered every build icon gray
// despite a full stockpile.

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { buildMenuButtons, trainMenuButtons, canAffordCost, iconVariant } from './cardModel';

const RICH = { food: 200, wood: 200, gold: 100, stone: 200 };
const BROKE = { food: 0, wood: 0, gold: 0, stone: 0 };

describe('buildMenuButtons', () => {
  it('with the starting stockpile, every affordable dark-age building is enabled and colored', () => {
    const buttons = buildMenuButtons(RICH, 'dark');
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const cost = gameData.buildings[b.id].cost;
      if (canAffordCost(RICH, cost)) {
        expect(b, `${b.id} should be enabled at 200f/200w/100g/200s`).toMatchObject({
          enabled: true,
          icon: gameData.buildings[b.id].icon, // colored, no /gray suffix
        });
        expect(b.reason).toBeUndefined();
      }
    }
    // concrete anchor: house (25w) colored+enabled
    const house = buttons.find((b) => b.id === 'house')!;
    expect(house).toMatchObject({ enabled: true, icon: 'icon/house' });
    // GDD: extra TCs unlock in Castle Age — hidden from the dark-age card entirely
    // (mirrors the sim's buildAgeIndex gate, so the button never lies about placeability)
    expect(buttons.find((b) => b.id === 'townCenter')).toBeUndefined();
    const castleButtons = buildMenuButtons({ food: 999, wood: 999, gold: 999, stone: 999 }, 'castle');
    const tc = castleButtons.find((b) => b.id === 'townCenter')!;
    expect(tc).toMatchObject({ enabled: true, icon: 'icon/townCenter' });
  });

  it('with an empty stockpile, every button is gray with a cost reason', () => {
    for (const b of buildMenuButtons(BROKE, 'dark')) {
      expect(b.enabled).toBe(false);
      expect(b.icon.endsWith('/gray')).toBe(true);
      expect(b.reason).toBe('not enough resources');
    }
  });

  it('only shows buildings of the current age or earlier, without tech gates', () => {
    for (const b of buildMenuButtons(RICH, 'dark')) {
      const def = gameData.buildings[b.id];
      expect(def.age).toBe('dark');
      expect(def.requiresTech).toBeUndefined();
    }
  });
});

describe('trainMenuButtons', () => {
  it('town center offers an affordable villager as enabled + colored', () => {
    const buttons = trainMenuButtons(RICH, 'dark', 'townCenter');
    const vill = buttons.find((b) => b.id === 'villager')!;
    expect(vill).toMatchObject({ enabled: true, icon: gameData.units.villager.icon });
  });

  it('unaffordable units render the /gray companion', () => {
    const buttons = trainMenuButtons(BROKE, 'dark', 'townCenter');
    for (const b of buttons) {
      expect(b.enabled).toBe(false);
      expect(b.icon.endsWith('/gray')).toBe(true);
    }
  });
});

describe('iconVariant', () => {
  it('returns the colored icon when enabled, the /gray companion when not', () => {
    expect(iconVariant('icon/house', true)).toBe('icon/house');
    expect(iconVariant('icon/house', false)).toBe('icon/house/gray');
  });
});
