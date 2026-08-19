// Trial of Banners — an original, compact one-lane Arena experiment built as a
// Grand Conquest. It reuses the campaign trigger language for deterministic waves.

import type { ScenarioDef } from '../schema';

const WIDTH = 56;
const HEIGHT = 32;

const rows = Array.from({ length: HEIGHT }, (_, y) => {
  if (y < 4 || y >= HEIGHT - 4) return '^'.repeat(WIDTH);
  if (y >= 12 && y <= 19) return 'r'.repeat(WIDTH);
  if (y >= 8 && y <= 23) return 'd'.repeat(WIDTH);
  return '.'.repeat(WIDTH);
});

export const arenaTrial: ScenarioDef = {
  id: 'arena-trial-of-banners',
  campaign: 'grand-conquests-arena',
  index: 0,
  title: 'Trial of Banners',
  briefing: {
    history:
      'Beyond the old imperial roads lies the Bannerfield, where rival claimants settle ' +
      'wars before they can consume a realm. Two war-hosts advance without rest. Their ' +
      'watchtowers guard the road, but only the fall of the enemy stronghold can end the trial.\n\n' +
      'Lead the Banner Warden through each wave, grow stronger from defeated foes, and ' +
      'break the Ashen Usurper’s core before your own banner is torn down.',
    objectives: [
      'Destroy the Ashen Core',
      'Defend the Banner Core',
    ],
    hints: [
      'Select the Banner Warden and arm Bannerfall from the command card, then target the lane.',
      'Bannerfall damages clustered enemy units and gains damage as the Warden levels up.',
      'Friendly and enemy warbands march automatically every sixteen seconds.',
    ],
  },
  players: [
    {
      name: 'Banner Warden', civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'castle', resources: {}, popCap: 20,
    },
    {
      name: 'Banner Host', civ: 'scots', team: 1, isHuman: false, color: 2,
      age: 'castle', resources: {}, aiProfile: 'passive', popCap: 100,
    },
    {
      name: 'Ashen Host', civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'castle', resources: {}, aiProfile: 'passive', popCap: 100,
    },
  ],
  map: {
    width: WIDTH,
    height: HEIGHT,
    legend: {
      '.': { terrain: 'grass' },
      d: { terrain: 'dirt' },
      r: { terrain: 'road' },
      '^': { terrain: 'cliff' },
    },
    rows,
  },
  entities: [
    // Banner side
    { def: 'townCenter', player: 1, x: 2, y: 14, hp: 3200, ref: 'banner_core' },
    { def: 'watchTower', player: 1, x: 14, y: 12, hp: 650, ref: 'banner_tower_north' },
    { def: 'watchTower', player: 1, x: 14, y: 19, hp: 650, ref: 'banner_tower_south' },
    { def: 'arenaWarden', player: 1, x: 10, y: 16, facing: 2, ref: 'banner_warden' },
    { def: 'militia', player: 2, x: 9, y: 14, facing: 2 },
    { def: 'militia', player: 2, x: 9, y: 16, facing: 2 },
    { def: 'archer', player: 2, x: 8, y: 18, facing: 2 },

    // Ashen side
    { def: 'townCenter', player: 3, x: 50, y: 14, hp: 3200, ref: 'ashen_core' },
    { def: 'watchTower', player: 3, x: 41, y: 12, hp: 650, ref: 'ashen_tower_north' },
    { def: 'watchTower', player: 3, x: 41, y: 19, hp: 650, ref: 'ashen_tower_south' },
    { def: 'arenaUsurper', player: 3, x: 45, y: 16, facing: 6, ref: 'ashen_usurper' },
    { def: 'militia', player: 3, x: 47, y: 14, facing: 6 },
    { def: 'militia', player: 3, x: 47, y: 16, facing: 6 },
    { def: 'archer', player: 3, x: 48, y: 18, facing: 6 },
  ],
  triggers: [
    {
      id: 'arena_opening',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'objectiveAdd', id: 'destroy_core', text: 'Destroy the Ashen Core' },
        { kind: 'objectiveAdd', id: 'defend_core', text: 'Defend the Banner Core' },
        {
          kind: 'message', speaker: 'Herald',
          text: 'The banners are raised. Break their core before they break yours.',
        },
        { kind: 'revealArea', player: 1, area: { x: 0, y: 0, w: WIDTH, h: HEIGHT } },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 45, y: 10, w: 11, h: 12 } },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 0, y: 10, w: 11, h: 12 } },
      ],
    },
    {
      id: 'arena_waves',
      loop: true,
      conditions: [{ kind: 'timerSeconds', seconds: 16 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            { def: 'militia', player: 2, x: 8, y: 14, facing: 2 },
            { def: 'militia', player: 2, x: 8, y: 16, facing: 2 },
            { def: 'archer', player: 2, x: 7, y: 18, facing: 2 },
            { def: 'militia', player: 3, x: 47, y: 14, facing: 6 },
            { def: 'militia', player: 3, x: 47, y: 16, facing: 6 },
            { def: 'archer', player: 3, x: 48, y: 18, facing: 6 },
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 45, y: 10, w: 11, h: 12 } },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 0, y: 10, w: 11, h: 12 } },
      ],
    },
    {
      id: 'arena_victory',
      conditions: [{ kind: 'refDestroyed', ref: 'ashen_core' }],
      effects: [
        { kind: 'objectiveComplete', id: 'destroy_core' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'victory' },
      ],
    },
    {
      id: 'arena_core_defeat',
      conditions: [{ kind: 'refDestroyed', ref: 'banner_core' }],
      effects: [
        { kind: 'objectiveFail', id: 'defend_core' },
        { kind: 'defeat', reason: 'The Banner Core has fallen.' },
      ],
    },
    {
      id: 'arena_hero_defeat',
      conditions: [{ kind: 'refDestroyed', ref: 'banner_warden' }],
      effects: [
        { kind: 'defeat', reason: 'The Banner Warden has fallen.' },
      ],
    },
  ],
  startCamera: { x: 13, y: 16 },
  maxAge: 'castle',
};

