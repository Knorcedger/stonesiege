// v1 civilizations, per the GDD sketches. Bonus magnitudes and tech-tree cuts are
// modeled on the closest AoE2 DE analogs (Scots ~ the infantry/siege civ,
// English ~ the foot-archer civ), expressed with our TechEffect vocabulary.

import type { CivDef } from './schema';

export const civs: Record<string, CivDef> = {
  scots: {
    id: 'scots', name: 'Scots',
    description:
      'Hardened clansmen of the glens. Their foot soldiers cover ground faster than any ' +
      'other army, their lumberjacks strip forests at speed, and their siege trains come ' +
      'cheap. Unique unit: the Highland Raider, a swift sword-and-targe infantryman.',
    bonuses: [
      // Infantry move 15% faster once armies take the field (analog: +15% from Feudal Age).
      { effect: { kind: 'statMult', stat: 'speed', percent: 15, targetClasses: ['infantry'] }, fromAge: 'feudal' },
      // Lumberjacks work 15% faster.
      { effect: { kind: 'gatherMult', task: 'wood', percent: 15 } },
      // Siege workshop units cost 15% less (GDD: "cheap siege").
      { effect: { kind: 'costMult', percent: -15, targetClasses: ['siege'] } },
    ],
    uniqueUnit: 'highlandRaider',
    eliteUniqueTech: 'eliteHighlandRaiderUpgrade',
    uniqueTechs: ['schiltron', 'highlandFury'],
    // Tech-tree cuts (mirrors the AoE2 analog's misses relevant to our roster):
    // no Paladin — the infantry/siege civ tops out at Cavalier, like its analog.
    disabled: [
      'arbalester', 'arbalesterUpgrade',
      'bracer',
      'paladin', 'paladinUpgrade',
      'plateBardingArmor',
      'twoManSaw',
      'cropRotation',
      'architecture',
      'blockPrinting',
    ],
  },

  english: {
    id: 'english', name: 'English',
    description:
      'A kingdom built on wool and the warbow. Levied archers are cheap to raise and, as ' +
      'the ages turn, loose their shafts farther than any rival. Shepherds tend flocks with ' +
      'famous efficiency. Unique unit: the Longbowman, a foot archer of exceptional reach.',
    bonuses: [
      // Archery units cost 10% less once ranges open.
      { effect: { kind: 'costMult', percent: -10, targetClasses: ['archer'] }, fromAge: 'feudal' },
      // Foot archers gain +1 range in the Castle Age and +1 more in the Imperial Age.
      { effect: { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer'] }, fromAge: 'castle' },
      { effect: { kind: 'statAdd', stat: 'range', amount: 1, targetClasses: ['archer'] }, fromAge: 'imperial' },
      // Shepherds work 25% faster (herding/hunting share the 'hunt' gather task in v1).
      { effect: { kind: 'gatherMult', task: 'hunt', percent: 25 } },
    ],
    uniqueUnit: 'longbowman',
    eliteUniqueTech: 'eliteLongbowmanUpgrade',
    uniqueTechs: ['yeomanLevy', 'ludgar'],
    // English keep Crop Rotation (farming kingdom; the AoE2 analog has it too).
    disabled: [
      'paladin', 'paladinUpgrade',
      'siegeRam', 'siegeRamUpgrade',
    ],
  },
};
