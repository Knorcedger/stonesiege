// wallace-5 · "Falkirk" — campaign scenario 5, authored from
// docs/CAMPAIGN_WALLACE.md §6. The large battle: fortified defense against an
// overwhelming scripted host, mangonel micro against massed longbows, monks between
// assaults, destroying the siege train — and a fighting retreat. History lost this
// battle; victory here is surviving it with Wallace alive.
//
// Map: 132x132 moor and slope south of Callendar Wood. The wood is a dense forest
// band across the N (rows 0-26) broken by one narrow grass ride at x 30-33; the
// Torwood escape glade {6,6,10,10} hides inside the band, reached only by the 2-wide
// grass corridor along rows y 9-10. The player war-camp {44,34,40,26} is a full
// stone-wall circuit (gates S and W) around castle, TC, and military buildings, with
// gold and stone inside to sustain repairs under siege. South of it the moss — boggy
// farmland-as-marsh {36,66,60,12} — is split by two dirt causeways (x 52 and x 76)
// that funnel every assault. Edward's tent city fills the SE quadrant; the open
// west lane (x 4-14) is the late-battle knight flank route. No berries, no sheep:
// this is a battle, not an economy build.

import type { ScenarioDef } from '../schema';
import { layRoadCurves, unitGroup, wallRing } from './authoring';

const legend: ScenarioDef['map']['legend'] = {
  '.': { terrain: 'grass' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  f: { terrain: 'farmland' }, // the moss — marsh set dressing (Appendix B)
  T: { terrain: 'grass', object: 'tree' },
  G: { terrain: 'dirt', object: 'gold' }, // inside the war-camp (dirt floor)
  S: { terrain: 'dirt', object: 'stone' },
};

/**
 * The two approach roads onto the moss and the Linlithgow road running east along
 * it, re-laid as curves. Dead-straight legs meeting at right angles read as
 * surveyed, and nothing on a 1298 battlefield was surveyed.
 */
const ROAD_PATHS: Array<Array<[number, number]>> = [
  [[52, 78], [54, 83], [51, 87], [53, 92]],
  [[77, 78], [75, 83], [78, 88], [76, 92]],
  [[52, 93], [62, 91], [74, 93], [86, 91], [96, 93], [107, 92]],
];

export const wallace5: ScenarioDef = {
  id: 'wallace-5',
  campaign: 'wallace',
  index: 4,
  title: 'Falkirk',
  briefing: {
    history:
      'Edward Longshanks has come north himself. No deputy this time, no treasurer ' +
      'counting pennies — the king of England with the greatest host of his reign: ' +
      'armored knights in their thousands, and rank upon rank of longbowmen from Wales ' +
      'and the English shires.\n\n' +
      'Wallace, now Guardian of Scotland, has done everything a general without a ' +
      "kingdom's purse can do. He has stripped the land before Edward's line of march, " +
      'let hunger and mutiny gnaw the great army, and kept his own force always a ' +
      "day's march away. But near Falkirk, Edward's scouts have found him — and now " +
      'there is no room left to be clever.\n\n' +
      "The Scots' answer is the schiltron: rings of spears, packed shoulder to " +
      'shoulder, a hedgehog no cavalry charge can break. Against knights alone it would ' +
      'be enough. But Edward did not bring knights alone, and the great lords of ' +
      'Scotland, whose horsemen Wallace needs to ride down the archers, sit their ' +
      "saddles at the wood's edge with doubtful hearts. Fortify the camp on the slope. " +
      'Hold the line as long as the line will hold. And whatever this day costs — ' +
      'Scotland cannot pay what it would cost to lose William Wallace.',
    objectives: [
      'Prepare the camp: repair and man the walls; field an army of at least 30 (spears, skirmishers, archers, cavalry, mangonels)',
      'Build a Monastery and train 2 Monks to mend the line between assaults',
      "Hold the war-camp against Edward's assault",
    ],
    hints: [
      'Longbows outrange your towers. Mangonels outrange longbows. Cavalry outruns everything — a handful of scouts riding down archers earns their pay ten times over.',
      'Repair villagers stationed behind a wall are worth a second wall.',
      'Garrison your wounded; a castle heals what it holds — and Monks mend men in the open. A converted English knight costs Edward twice: one lost, one gained.',
      'When the breakout comes, speed beats strength. Do not stop to win fights you can refuse.',
    ],
  },
  players: [
    {
      name: "Guardian's Army", civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'castle', resources: { food: 800, wood: 800, gold: 500, stone: 300 }, popCap: 120,
    },
    {
      name: "Edward's Host", civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'castle', resources: { food: 9999, wood: 9999, gold: 9999, stone: 9999 },
      aiProfile: 'passive', popCap: 200, // scripted waves only
    },
  ],
  map: {
    width: 132,
    height: 132,
    legend,
    rows: layRoadCurves([
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT............................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT............................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..........TTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '........................................................................................................................TTT.........',
      '........................................................................................................................TTT.........',
      '....................................................................................................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................dGGddddddddddddddddddddddddddddddddSSSd................................................',
      '.............................................dGGddddddddddddddddddddddddddddddddSSdd................................................',
      '.............................................dGddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................TTT.............................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................TTT.............................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '........................TTT..................ddddddddddddddddddddddddddddddddddddddd................................................',
      '........................TTT..................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '.............................................ddddddddddddddddddddddddddddddddddddddd................................................',
      '................................................................................................................TTT.................',
      '................................................................................................................TTT.................',
      '......................................................................................TTT...........................................',
      '......................................................................................TTT...........................................',
      '....................TTT.............................................................................................................',
      '....................TTT.............................................................................................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................fffffffffffffffdddfffffffffffffffffffffdddffffffffffffffffff....................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '................TTT.................................rr......................rr......................................................',
      '................TTT.................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................TTT.............rr..........TTT.........rr......................................................',
      '....................................TTT.............rr..........TTT.........rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rr......................rr......................................................',
      '....................................................rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr........................',
      '....................................................rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr........................',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '........................TTT.................................................................dddddddddddddddddddddddddddddddddddd....',
      '........................TTT.................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................TTT.......................TTT...................dddddddddddddddddddddddddddddddddddd....',
      '............................................TTT.......................TTT...................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '............................................................................................dddddddddddddddddddddddddddddddddddd....',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '....................................................................................................................................',
      '....................................................................................................................................',
    ], ROAD_PATHS, { over: '.d', width: 2 }),
  },
  entities: [
    // ---- Player 1: the fortified war-camp ----
    ...wallRing(1, 44, 34, 84, 60, [[60, 60], [44, 46]]),
    { def: 'gate', player: 1, x: 60, y: 60 }, // south gate onto the causeway line
    { def: 'gate', player: 1, x: 44, y: 46 }, // west gate toward the ride
    { def: 'townCenter', player: 1, x: 52, y: 40 },
    { def: 'castle', player: 1, x: 62, y: 40, ref: 'war_camp_castle' },
    { def: 'heroWallace', player: 1, x: 58, y: 42, ref: 'wallace' },
    // Sir John de Graham — his historical death at Falkirk is a scripted lament (t12)
    { def: 'heroGraham', player: 1, x: 60, y: 44, ref: 'graham' },
    { def: 'barracks', player: 1, x: 48, y: 45 },
    { def: 'archeryRange', player: 1, x: 56, y: 45 },
    { def: 'siegeWorkshop', player: 1, x: 68, y: 45 },
    { def: 'blacksmith', player: 1, x: 60, y: 50 },
    { def: 'stable', player: 1, x: 72, y: 50 },
    { def: 'watchTower', player: 1, x: 46, y: 58 },
    { def: 'watchTower', player: 1, x: 78, y: 58 },
    ...unitGroup('farm', 1, [
      [49, 35], [52, 35], [55, 35], [58, 35], [61, 35], [64, 35], [67, 35], [70, 35], [73, 35], [76, 35],
    ]),
    ...unitGroup('house', 1, [
      [46, 50], [46, 53], [48, 56], [51, 56], [66, 56], [69, 56], [72, 56], [79, 52],
    ]),
    ...unitGroup('villager', 1, [
      [50, 36], [53, 36], [56, 36], [59, 36], [62, 36], [65, 36], [68, 36], [71, 36],
      [74, 36], [77, 36], [47, 44], [47, 48],
    ]),
    ...unitGroup('spearman', 1, [
      [54, 54], [55, 54], [56, 54], [57, 54], [58, 54], [59, 54], [60, 54], [61, 54],
    ]),
    ...unitGroup('skirmisher', 1, [[54, 55], [55, 55], [56, 55], [57, 55], [58, 55], [59, 55]]),
    ...unitGroup('archer', 1, [[60, 55], [61, 55], [62, 55], [63, 55]]),
    ...unitGroup('scout', 1, [[54, 56], [55, 56]]),
    ...unitGroup('mangonel', 1, [[58, 56], [60, 56]]),
    // ---- Player 2: Edward's muster — tent city, banner, household guard ----
    // hp override: not a kill target; he must not die to a stray raid
    { def: 'heroEdward', player: 2, x: 110, y: 112, ref: 'edward', hp: 5000 },
    ...unitGroup('knight', 2, [
      [108, 110], [110, 110], [112, 110], [108, 112], [112, 112], [108, 114], [110, 114], [112, 114],
    ]),
    ...unitGroup('house', 2, [ // the tent city
      [94, 98], [98, 98], [102, 98], [106, 98], [94, 104], [98, 104], [94, 110],
      [96, 116], [100, 112], [104, 116],
    ]),
    { def: 'watchTower', player: 2, x: 98, y: 102 }, // the wooden tower pair
    { def: 'watchTower', player: 2, x: 108, y: 104 },
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 110, y: 112 },
        { kind: 'message', speaker: 'Narrator', text: 'Falkirk, 22 July 1298. Edward of England has crossed his last river. There is no more room to be clever.' },
        { kind: 'panCamera', x: 60, y: 44 },
        { kind: 'message', speaker: 'Graham', text: "The schiltrons will hold the horses, Will. It's the bowmen I fear — and the lords who swore us THEIR horses." },
        { kind: 'objectiveAdd', id: 'obj-fortify', text: 'Field an army of 30: spears, skirmishers, archers, cavalry, mangonels' },
        { kind: 'objectiveAdd', id: 'obj-monks', text: 'Build a Monastery and train 2 Monks' },
        { kind: 'objectiveAdd', id: 'obj-hold', text: "Hold the war-camp against Edward's assault" },
        { kind: 'armTrigger', triggerId: 't03-battle-start-timer' },
      ],
    },
    {
      id: 't02-fortify-check',
      conditions: [
        // cavalry counts — the Stable is in the camp and the hint about riding
        // down archers is meant to be taken
        {
          kind: 'ownedAtLeast',
          player: 1,
          defIds: [
            'spearman', 'pikeman', 'skirmisher', 'archer', 'crossbowman', 'mangonel',
            'militia', 'manAtArms', 'longswordsman', 'scout', 'lightCavalry', 'knight',
          ],
          atLeast: 30,
        },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-fortify' },
        { kind: 'message', speaker: 'Wallace', text: 'I have brought you to the ring. Hop gracefully if you can.' },
      ],
    },
    {
      id: 't02b-monastery',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['monastery'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['monk'], atLeast: 2 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-monks' },
        { kind: 'message', speaker: 'Narrator', text: "Monks heal the hurt and turn the enemy's own steel. Keep them behind the line, never in it." },
      ],
    },
    {
      id: 't03-battle-start-timer',
      armed: false, // armed by t01: 10 minutes of prep, then the drums
      conditions: [{ kind: 'timerSeconds', seconds: 600 }],
      effects: [
        { kind: 'playSting', sting: 'horn' },
        { kind: 'panCamera', x: 76, y: 78 },
        { kind: 'message', speaker: 'Narrator', text: 'Drums in the south. The host of England comes up the causeways with the morning sun on its spears.' },
        { kind: 'armTrigger', triggerId: 't04-wave-1' },
      ],
    },
    {
      id: 't04-wave-1', // the knight charge
      armed: false,
      conditions: [{ kind: 'always' }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            // both causeway mouths at once
            ...unitGroup('knight', 2, [
              [50, 78], [51, 78], [52, 78], [53, 78], [54, 78], [55, 78],
              [74, 78], [75, 78], [76, 78], [77, 78], [78, 78], [79, 78],
            ]),
            ...unitGroup('scout', 2, [[50, 79], [51, 79], [52, 79], [74, 79], [75, 79], [76, 79]]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 34, w: 40, h: 26 } },
        { kind: 'message', speaker: 'Graham', text: 'First the pride of England breaks itself on our spears. SCHILTRON! Lock and hold!' },
        { kind: 'armTrigger', triggerId: 't05-nobles' },
        { kind: 'armTrigger', triggerId: 't06-wave-2' },
      ],
    },
    {
      id: 't05-nobles', // the desertion — a promise that never arrives
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 240 }],
      effects: [
        { kind: 'playSting', sting: 'alert' },
        { kind: 'panCamera', x: 10, y: 30 }, // empty western treeline
        { kind: 'message', speaker: 'Narrator', text: "On the wing where the lords' cavalry should stand, there is only wind in the trees. Comyn's banners are already small on the northern road." },
        { kind: 'message', speaker: 'Wallace', text: "So. Scotland's nobles. Remember this hour, lads — remember who stayed." },
      ],
    },
    {
      id: 't06-wave-2', // the longbow corps
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 300 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('longbowman', 2, [
              [50, 78], [51, 78], [52, 78], [53, 78], [54, 78], [55, 78], [50, 79], [51, 79],
              [74, 78], [75, 78], [76, 78], [77, 78], [78, 78], [79, 78], [74, 79], [75, 79],
            ]),
            ...unitGroup('manAtArms', 2, [
              [52, 79], [53, 79], [54, 79], [55, 79], [76, 79], [77, 79], [78, 79], [79, 79],
            ]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 34, w: 40, h: 26 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Graham', text: 'Bowmen — THOUSANDS. Mangonels forward, and every rider we have on their flanks, NOW!' },
        { kind: 'armTrigger', triggerId: 't07-wave-3' },
      ],
    },
    {
      id: 't07-wave-3', // the siege train
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 360 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            { def: 'batteringRam', player: 2, x: 50, y: 78, ref: 'ram1' },
            { def: 'batteringRam', player: 2, x: 52, y: 78, ref: 'ram2' },
            { def: 'batteringRam', player: 2, x: 54, y: 78, ref: 'ram3' },
            { def: 'batteringRam', player: 2, x: 50, y: 80, ref: 'ram4' },
            { def: 'mangonel', player: 2, x: 52, y: 80, ref: 'mang1' },
            { def: 'mangonel', player: 2, x: 54, y: 80, ref: 'mang2' },
            { def: 'mangonel', player: 2, x: 55, y: 79, ref: 'mang3' },
            ...unitGroup('manAtArms', 2, [ // the escort
              [51, 79], [53, 79], [50, 79], [55, 78], [51, 78], [53, 78], [55, 80], [51, 81],
            ]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 34, w: 40, h: 26 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Narrator', text: "Edward's engineers bring up rams and stone-throwers against the camp walls." },
        { kind: 'objectiveAdd', id: 'obj-siege-train', text: "Destroy Edward's siege train" },
        { kind: 'armTrigger', triggerId: 't08-wave-4' },
        { kind: 'armTrigger', triggerId: 't09-train-dead' },
      ],
    },
    {
      id: 't08-wave-4', // the general assault + west flank
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 420 }],
      effects: [
        {
          kind: 'spawn',
          entities: [ // knights round the western flank lane
            ...unitGroup('knight', 2, [
              [6, 60], [7, 60], [8, 60], [9, 60], [10, 60], [11, 60], [6, 61], [7, 61], [8, 61], [9, 61],
            ]),
          ],
        },
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('manAtArms', 2, [
              [50, 78], [51, 78], [52, 78], [53, 78], [54, 78],
              [74, 78], [75, 78], [76, 78], [77, 78], [78, 78],
            ]),
            ...unitGroup('longbowman', 2, [
              [50, 79], [51, 79], [52, 79], [53, 79], [74, 79], [75, 79], [76, 79], [77, 79],
            ]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 34, w: 40, h: 26 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Narrator', text: 'The full weight of England leans on the line. Knights round the western flank!' },
      ],
    },
    {
      id: 't09-train-dead',
      armed: false, // armed by t07 with the train's refs
      conditions: [
        { kind: 'refsDestroyed', refs: ['ram1', 'ram2', 'ram3', 'ram4', 'mang1', 'mang2', 'mang3'], all: true },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-siege-train' },
        { kind: 'message', speaker: 'Graham', text: 'Their engines burn! But Will — look at the field. For every one we cut down, Edward has five more fed and rested.' },
        { kind: 'armTrigger', triggerId: 't10-breakout' },
      ],
    },
    {
      id: 't10-breakout',
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 120 }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-hold' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'panCamera', x: 31, y: 20 }, // the forest ride
        { kind: 'message', speaker: 'Wallace', text: 'Enough. Scotland needs living men more than dead heroes. Sound the retreat — north, through the wood, and DO NOT STOP.' },
        { kind: 'objectiveAdd', id: 'obj-breakout', text: 'Bring Wallace to the Torwood in the northwest' },
        { kind: 'revealArea', player: 1, area: { x: 6, y: 6, w: 28, h: 22 } },
        { kind: 'armTrigger', triggerId: 't13-escape' },
      ],
    },
    {
      id: 't11-castle-falls', // early collapse arms the breakout immediately.
      // t10 and t11 can BOTH fire; the idempotency contract (§1 of the campaign doc)
      // makes the duplicate objectiveAdd / objectiveComplete / armTrigger effects no-ops
      conditions: [{ kind: 'refDestroyed', ref: 'war_camp_castle' }],
      effects: [
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Graham', text: 'The castle is breached — the camp cannot hold! Get the Guardian OUT!' },
        { kind: 'objectiveComplete', id: 'obj-hold' }, // held as long as it could
        { kind: 'objectiveAdd', id: 'obj-breakout', text: 'Bring Wallace to the Torwood in the northwest' },
        { kind: 'revealArea', player: 1, area: { x: 6, y: 6, w: 28, h: 22 } },
        { kind: 'armTrigger', triggerId: 't13-escape' },
      ],
    },
    {
      id: 't12-graham-falls', // scripted lament, not a failure
      conditions: [{ kind: 'refDestroyed', ref: 'graham' }],
      effects: [
        { kind: 'message', speaker: 'Wallace', text: 'John! — No. No, not you as well. Scotland, what a price you ask.' },
      ],
    },
    {
      id: 't13-escape',
      armed: false,
      conditions: [
        { kind: 'entitiesInArea', player: 1, defIds: ['heroWallace'], area: { x: 6, y: 6, w: 10, h: 10 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-breakout' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'Falkirk is lost. A third of the army lies on the moor, and Sir John de Graham with them. Wallace burns Stirling and Perth behind him so that Edward may govern ashes.' },
        { kind: 'message', speaker: 'Narrator', text: "Within weeks, Wallace resigns the Guardianship into the hands of the nobles who watched from the treeline. But Edward's great host, starving and mutinous, cannot hold what it has won. The war does not end. It goes into the hills — and so does Wallace." },
        { kind: 'victory' },
      ],
    },
    {
      id: 't14-defeat-wallace',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen at Falkirk, and with him the rising.' },
      ],
    },
  ],
  startCamera: { x: 60, y: 44 },
  maxAge: 'castle',
};
