// Internal capture preset for marketing screenshots. It is intentionally not part of
// the campaign: the authored state is a fully developed Imperial-age civilization,
// arranged for a single readable isometric composition rather than mission balance.

import type { ScenarioDef, ScenarioEntity } from '../schema';
import { unitGroup, wallRing } from './authoring';

const WIDTH = 80;
const HEIGHT = 72;
const CORNER_KEEPS: Array<[number, number]> = [
  [20, 18], [55, 18], [20, 49], [55, 49],
];
const WALL_GAPS: Array<[number, number]> = [
  [20, 35], [39, 50],
  // The exact turn tile is occupied by the keep. The two adjacent wall ends
  // continue beneath its wide footprint so no daylight appears at the joint.
  [20, 18], [56, 18], [20, 50], [56, 50],
];
const FARM_TILES: Array<[number, number]> = [
  [22, 19], [25, 19], [28, 19], [31, 19], [34, 19],
  [22, 22], [25, 22], [28, 22], [31, 22], [34, 22],
];

const rows = Array.from({ length: HEIGHT }, (_, y) => {
  const row = Array.from({ length: WIDTH }, (_, x) => {
    const insideCitadel = x >= 19 && x <= 59 && y >= 15 && y <= 55;
    if (!insideCitadel) return '.';
    if ((x >= 36 && x <= 40) || (y >= 34 && y <= 37)) return 'r';
    return 'd';
  });
  return row.join('');
});

const farms: ScenarioEntity[] = FARM_TILES.map(([x, y], index) => ({
  def: 'farm', player: 1, x, y, ref: `showcase_farm_${index}`,
}));

const farmers: ScenarioEntity[] = FARM_TILES.map(([x, y], index) => ({
  def: 'villager', player: 1, x: x + 1, y: y + 1,
  facing: index % 2 === 0 ? 3 : 5,
  ref: `showcase_farmer_${index}`,
}));

export const showcaseCitadel: ScenarioDef = {
  id: 'showcase-citadel',
  campaign: 'showcase',
  index: 0,
  title: 'The Citadel of Scotland',
  briefing: {
    history: 'A fully developed StoneSiege civilization staged for an authentic in-engine capture.',
    objectives: [],
    hints: [],
  },
  players: [
    {
      name: 'Kingdom of Scotland', civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'imperial',
      resources: { food: 9999, wood: 9999, gold: 9999, stone: 9999 },
      popCap: 200,
    },
  ],
  map: {
    width: WIDTH,
    height: HEIGHT,
    legend: {
      '.': { terrain: 'grass' },
      d: { terrain: 'dirt' },
      r: { terrain: 'road' },
    },
    rows,
  },
  entities: [
    // A compact, uninterrupted stone circuit. Keeps punctuate the four corners;
    // gates sit on the west approach and the south processional road.
    ...wallRing(1, 20, 18, 56, 50, WALL_GAPS),
    { def: 'gate', player: 1, x: 20, y: 35 },
    { def: 'gate', player: 1, x: 39, y: 50 },
    ...CORNER_KEEPS.map(([x, y]) => ({ def: 'keep', player: 1, x, y })),

    // Productive agricultural quarter: contiguous fields, a mill, and one active
    // farmer per plot. The game host assigns their gather orders on boot.
    ...farms,
    ...farmers,
    { def: 'mill', player: 1, x: 37, y: 21 },

    // Civic and monumental core.
    { def: 'townCenter', player: 1, x: 33, y: 27 },
    { def: 'castle', player: 1, x: 41, y: 26 },
    { def: 'wonder', player: 1, x: 49, y: 20 },
    { def: 'market', player: 1, x: 29, y: 33 },
    { def: 'monastery', player: 1, x: 34, y: 34 },
    { def: 'university', player: 1, x: 38, y: 33 },
    { def: 'blacksmith', player: 1, x: 42, y: 34 },

    // Dense residential streets instead of an empty parade ground.
    ...unitGroup('house', 1, [
      [21, 28], [24, 28], [27, 28],
      [21, 31], [24, 31], [27, 31],
      [21, 34], [24, 34], [27, 37],
      [21, 40], [24, 40], [27, 40],
      [21, 43], [24, 43], [21, 46], [24, 46],
      [46, 40], [49, 40], [52, 40],
    ]),

    // Every late-game production building, grouped as a deliberate military ward.
    { def: 'barracks', player: 1, x: 46, y: 31 },
    { def: 'archeryRange', player: 1, x: 50, y: 31 },
    { def: 'stable', player: 1, x: 46, y: 35 },
    { def: 'siegeWorkshop', player: 1, x: 50, y: 35 },

    // Max-tier army in clean formations, with heroes and supporting monks.
    { def: 'heroWallace', player: 1, x: 38, y: 41, facing: 0 },
    { def: 'heroGraham', player: 1, x: 40, y: 41, facing: 0 },
    ...unitGroup('pikeman', 1, [
      [30, 42], [31, 42], [32, 42], [33, 42],
      [34, 42], [35, 42], [36, 42], [37, 42],
    ]),
    ...unitGroup('champion', 1, [
      [30, 43], [31, 43], [32, 43], [33, 43], [34, 43],
      [35, 43], [36, 43], [37, 43], [38, 43], [39, 43],
    ]),
    ...unitGroup('eliteHighlandRaider', 1, [
      [30, 44], [31, 44], [32, 44], [33, 44], [34, 44],
      [35, 44], [36, 44], [37, 44], [38, 44], [39, 44],
    ]),
    ...unitGroup('arbalester', 1, [
      [30, 45], [31, 45], [32, 45], [33, 45], [34, 45],
      [35, 45], [36, 45], [37, 45], [38, 45], [39, 45],
    ]),
    ...unitGroup('eliteSkirmisher', 1, [
      [30, 46], [31, 46], [32, 46], [33, 46],
      [34, 46], [35, 46], [36, 46], [37, 46],
    ]),
    ...unitGroup('eliteLongbowman', 1, [
      [30, 47], [31, 47], [32, 47], [33, 47],
      [34, 47], [35, 47], [36, 47], [37, 47],
    ]),
    ...unitGroup('paladin', 1, [
      [42, 42], [44, 42], [42, 44], [44, 44], [42, 46], [44, 46],
    ]),
    ...unitGroup('onager', 1, [[47, 43], [49, 43], [47, 46], [49, 46]]),
    ...unitGroup('trebuchet', 1, [[52, 43], [54, 43]]),
    ...unitGroup('siegeRam', 1, [[52, 39], [55, 39]]),
    ...unitGroup('monk', 1, [[40, 48], [42, 48], [44, 48], [46, 48]]),
  ],
  triggers: [],
  startCamera: { x: 38, y: 35 },
  maxAge: 'imperial',
};
