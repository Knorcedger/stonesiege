// Combat-impact voice classification (pure; consumed by audio/events.ts).

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { attackFamily, impactVoice, releaseVoice, voiceFalloff } from './combat';
import { SFX_CATEGORY } from './engine';
import type { SfxName } from './synth';

const vsUnit = (defId: string, melee = true): SfxName => impactVoice(defId, false, melee);
const vsBuilding = (defId: string, melee = true): SfxName => impactVoice(defId, true, melee);

describe('attackFamily', () => {
  it('classifies the whole ram line as rams, not as generic siege', () => {
    for (const id of ['batteringRam', 'cappedRam', 'siegeRam']) {
      expect(attackFamily(id, true)).toBe('ram');
    }
  });

  it('separates spears, sabres and swords among melee troops', () => {
    expect(attackFamily('spearman', true)).toBe('spear');
    expect(attackFamily('pikeman', true)).toBe('spear');
    expect(attackFamily('knight', true)).toBe('cavalry');
    expect(attackFamily('paladin', true)).toBe('cavalry');
    expect(attackFamily('champion', true)).toBe('blade');
    expect(attackFamily('housecarl', true)).toBe('blade');
  });

  it('gives villagers tools and wildlife jaws', () => {
    expect(attackFamily('villager', true)).toBe('tool');
    expect(attackFamily('wolf', true)).toBe('beast');
  });

  it('classifies ranged attackers by what they throw', () => {
    expect(attackFamily('archer', false)).toBe('arrow');
    expect(attackFamily('crossbowman', false)).toBe('bolt');
    expect(attackFamily('arbalester', false)).toBe('bolt');
    expect(attackFamily('mangonel', false)).toBe('stone');
    expect(attackFamily('trebuchet', false)).toBe('stone');
    expect(attackFamily('castle', false)).toBe('arrow'); // buildings volley arrows
  });

  it('falls back to a generic melee voice for unknown or dead attackers', () => {
    expect(attackFamily(undefined, true)).toBe('blade');
    expect(attackFamily('nonexistent', true)).toBe('blade');
    expect(attackFamily(undefined, false)).toBe('arrow');
  });
});

describe('impactVoice', () => {
  it('a ram on a gate booms — nothing like infantry trading blows', () => {
    expect(vsBuilding('batteringRam')).toBe('ramBoom');
    expect(vsBuilding('batteringRam')).not.toBe(vsBuilding('champion'));
    expect(vsUnit('batteringRam')).toBe('ramCrush');
    expect(vsUnit('batteringRam')).not.toBe(vsUnit('champion'));
  });

  it('every melee weapon family sounds different against troops', () => {
    const voices = ['champion', 'knight', 'pikeman', 'villager', 'wolf', 'siegeRam']
      .map((id) => vsUnit(id));
    expect(new Set(voices).size).toBe(voices.length);
  });

  it('hitting a building differs from hitting a troop wherever the material does', () => {
    for (const id of ['champion', 'knight', 'pikeman', 'batteringRam', 'archer', 'crossbowman', 'onager']) {
      const melee = (gameData.units[id]?.range ?? 0) === 0;
      expect(vsBuilding(id, melee)).not.toBe(vsUnit(id, melee));
    }
  });

  it('a hoe and a set of jaws hit the same either way', () => {
    expect(vsBuilding('villager')).toBe(vsUnit('villager'));
    expect(vsBuilding('wolf')).toBe(vsUnit('wolf'));
  });

  it('arrows, bolts and boulders each land with their own voice', () => {
    expect(vsUnit('archer', false)).toBe('arrowFlesh');
    expect(vsBuilding('archer', false)).toBe('arrowThunk');
    expect(vsUnit('crossbowman', false)).toBe('boltPunch');
    expect(vsUnit('mangonel', false)).toBe('stoneCrush');
    expect(vsBuilding('trebuchet', false)).toBe('stoneShatter');
  });

  it('tower and castle arrows land like any other arrow', () => {
    expect(vsUnit('watchTower', false)).toBe('arrowFlesh');
    expect(vsBuilding('castle', false)).toBe('arrowThunk');
  });

  it('gives every attacking unit def a voice against both targets', () => {
    for (const [id, def] of Object.entries(gameData.units)) {
      if (def.attacks.length === 0) continue; // monks, sheep, deer never strike
      const melee = def.range === 0;
      for (const building of [false, true]) {
        const voice = impactVoice(id, building, melee);
        expect(SFX_CATEGORY[voice], `${id} -> ${voice}`).toBeDefined();
      }
    }
  });
});

describe('releaseVoice', () => {
  it('bows sing, crossbows clack, siege arms slam', () => {
    expect(releaseVoice('archer')).toBe('arrowShot');
    expect(releaseVoice('longbowman')).toBe('arrowShot');
    expect(releaseVoice('crossbowman')).toBe('boltShot');
    expect(releaseVoice('mangonel')).toBe('siegeRelease');
    expect(releaseVoice('trebuchet')).toBe('siegeRelease');
  });

  it('buildings and unknown shooters fall back to arrows', () => {
    expect(releaseVoice('castle')).toBe('arrowShot');
    expect(releaseVoice('')).toBe('arrowShot');
  });
});

describe('voiceFalloff', () => {
  it('siege carries past the normal horizon; hand weapons do not', () => {
    expect(voiceFalloff('ramBoom')).toBeGreaterThan(voiceFalloff('swordClash'));
    expect(voiceFalloff('stoneShatter')).toBeGreaterThan(voiceFalloff('arrowThunk'));
    expect(voiceFalloff('swordClash')).toBe(voiceFalloff('spearThrust'));
  });
});
