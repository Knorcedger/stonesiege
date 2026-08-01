// wallace-3 · "Stirling Bridge" — campaign scenario 3, authored from
// docs/CAMPAIGN_WALLACE.md §4. The set-piece battle: counters, chokepoint defense,
// attack-move, minimap reading, allied AI. Let the vanguard cross, then close the trap.
//
// Map: 120x120 carse of Stirling; north = Scots, south = English. The Forth is a
// horizontal water band (rows 56-68) with a lazy meander (dips to the south between
// x 20-36, rises to the north between x 80-96). The wooden bridge is a 2-wide road
// strip at x 58-59; a road causeway runs N through boggy carse (farmland-as-marsh
// {50,40,20,16}) to the player camp {44,20,28,20}. The western ford — shallows
// {8,56,4,13} spanning all thirteen water rows — is the hidden flanking lane.
// Abbey Craig {76,24,16,14} is a wooded dirt knoll with a grass crown holding
// Moray's allied camp; the English muster field {40,84,44,28} and the distant
// set-dressing Stirling Castle {6,100,14,12} fill the south bank.
//
// Player 4 is a separate scripted set-dressing player (Warenne's banner guard, the
// tents, the castle) so the victory count of player 2's fighting host stays clean.

import type { ScenarioDef } from '../schema';
import { unitGroup, wallRing } from './authoring';

const legend: ScenarioDef['map']['legend'] = {
  '.': { terrain: 'grass' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  w: { terrain: 'water' },
  s: { terrain: 'shallows' },
  f: { terrain: 'farmland' }, // boggy carse — marsh set dressing (Appendix B)
  T: { terrain: 'grass', object: 'tree' },
  F: { terrain: 'dirt', object: 'tree' }, // Abbey Craig's wooded slopes
  G: { terrain: 'grass', object: 'gold' },
  S: { terrain: 'grass', object: 'stone' },
};

export const wallace3: ScenarioDef = {
  id: 'wallace-3',
  campaign: 'wallace',
  index: 2,
  title: 'Stirling Bridge',
  briefing: {
    history:
      'Two risings have become one army. Andrew Moray, who cleared the English out of the ' +
      'north with a broken castle wall for a schoolroom, has joined his men to ' +
      "Wallace's, and together they hold the low hills above the River Forth at Stirling " +
      '— the buckle that fastens the north of Scotland to the south.\n\n' +
      'Below them, the English host of John de Warenne, Earl of Surrey, spreads its ' +
      "banners. With him rides Hugh de Cressingham, Edward's treasurer in Scotland, a man " +
      'so hated that Scots pay their fines twice — once in silver, once in curses. ' +
      'Cressingham has already saved his king money by sending part of the army home. He ' +
      'believes a rabble of commoners will scatter at the first charge of proper ' +
      'knights.\n\n' +
      'Between the two armies lies one wooden bridge, wide enough for two horsemen ' +
      'abreast, and a soft causeway through the meadows beyond. Every man who crosses it ' +
      'puts a river at his back. Warenne is slow; Cressingham is greedy for a quick, ' +
      'cheap victory. Let them come. Hold your line at the camp, watch the far bank — ' +
      'and when enough of them stand on our side of the water, close the trap.',
    objectives: [
      'Ready your warband: field at least 10 Spearmen and 8 Skirmishers before the English cross',
      'Your camp must stand',
    ],
    hints: [
      'Spearmen bring down horses; Skirmishers cut down archers; your own archers punish infantry. Mixed lines live longer than pure ones.',
      'The bridge is two tiles wide. Numbers mean nothing on it.',
      'Watch the minimap. A river has more than one crossing if you march far enough west.',
      'Long-press for attack-move: your soldiers advance and fight whatever they meet.',
    ],
  },
  players: [
    {
      name: 'Army of Scotland', civ: 'scots', team: 1, isHuman: true, color: 0,
      // gold funds the archer reinforcements that punish the late-wave infantry
      // escorts (the spear+skirm warband the objectives mandate does not counter them)
      age: 'feudal', resources: { food: 500, wood: 400, gold: 350, stone: 50 }, popCap: 60,
    },
    {
      name: "Warenne's Host", civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'feudal', resources: { food: 2000, wood: 1000, gold: 800, stone: 200 },
      aiProfile: 'passive', popCap: 100, // scripted waves; never plays freely
    },
    {
      name: "Moray's Men", civ: 'scots', team: 1, isHuman: false, color: 2,
      age: 'feudal', resources: { food: 300, wood: 200, gold: 100 },
      aiProfile: 'defender', popCap: 20,
    },
    {
      name: "Warenne's Banner Guard", civ: 'english', team: 2, isHuman: false, color: 3,
      age: 'feudal', resources: {}, aiProfile: 'passive', popCap: 10, // set dressing only
    },
  ],
  map: {
    width: 120,
    height: 120,
    legend,
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '................TTT.....................................................................................................',
      '................TTT.....................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '..............................................SS........................................................................',
      '..............................................SS........................................................................',
      '....................................................................................................TTT.................',
      '....................................................................................................TTT.................',
      '..................................................................GGG...................................................',
      '..................................................................GG....................................................',
      '............................................................................FFFFFFFFFFFFFFFF............................',
      '............................................................................FFFFFFFFFFFFFFFF............................',
      '............................................................................FFddddddddddddFF............................',
      '............................................................................FFdd........ddFF............................',
      '............................................................................FFdd........ddFF............................',
      '............................................................................FFdd........ddFF............................',
      '................TTT.................TTT.....................................dddd........ddFF................TTT.........',
      '................TTT.................TTT.....................................dddd........ddFF................TTT.........',
      '............................................................................dddd........ddFF............................',
      '............................................................................FFdd........ddFF............................',
      '............................................................................FFdd........ddFF............................',
      '............................................................................FFddddddddddddFF............................',
      '..........................................................rr................FFFFFFFFFFFFFFFF............................',
      '..........................................................rr................FFFFFFFFFFFFFFFF............................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..................................................ffffffffrrffffffffff..................................................',
      '..................................................ffffffffrrffffffffff..................................................',
      '..................................................ffffffffrrffffffffff..................................................',
      '..................................................ffffffffrrffffffffff..................................................',
      '........................TTT.......................ffffffffrrffffffffff..................................................',
      '........................TTT.......................ffffffffrrffffffffff..................................................',
      '..................................................ffffffffrrffffffffff..........wwwwwwwwwwwwwwwww.......................',
      '..................................................ffffffffrrffffffffff.........wwwwwwwwwwwwwwwwwww......................',
      '..................................................ffffffffrrffffffffff.........wwwwwwwwwwwwwwwwwww......................',
      '..................................................ffffffffrrffffffffff........wwwwwwwwwwwwwwwwwwwww.....................',
      '..................................................ffffffffrrffffffffff.......wwwwwwwwwwwwwwwwwwwwwww....................',
      '..................................................ffffffffrrffffffffff......wwwwwwwwwwwwwwwwwwwwwwwww...................',
      '..................................................ffffffffrrffffffffff.....wwwwwwwwwwwwwwwwwwwwwwwwwww..................',
      '..................................................ffffffffrrffffffffff.....wwwwwwwwwwwwwwwwwwwwwwwwwww..................',
      '..................................................ffffffffrrffffffffff....wwwwwwwwwwwwwwwwwwwwwwwwwwwww.................',
      '..................................................ffffffffrrffffffffff...wwwwwwwwwwwwwwwwwwwwwwwwwwwwwww................',
      'wwwwwwwwsssswww...........................wwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswww...........................wwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwww.........................wwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwww.......................wwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwww.................wwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwww.......................wwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwww...................wwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwww.....................wwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwww...................wwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwww.....................wwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwww.....................wwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwww...................wwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwww.......................wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwwww.................wwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwww.........................wwwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwwww.................wwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwww...........................wwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwww...........................wwwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwww.............................wwwwwwwwwwwwwwwww',
      'wwwwwwwwsssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwww...............................wwwwwwwwwwwwwwww',
      '...............wwwwwwwwwwwwwwwwwwwwwwwwwww................rr............................................................',
      '...............wwwwwwwwwwwwwwwwwwwwwwwwwww................rr............................................................',
      '................wwwwwwwwwwwwwwwwwwwwwwwww.................rr............................................................',
      '.................wwwwwwwwwwwwwwwwwwwwwww..................rr............................................................',
      '.................wwwwwwwwwwwwwwwwwwwwwww..................rr............................................................',
      '..................wwwwwwwwwwwwwwwwwwwww...................rr............................................................',
      '..................wwwwwwwwwwwwwwwwwwwww...................rr............................................................',
      '...................wwwwwwwwwwwwwwwwwww....................rr............................................................',
      '....................wwwwwwwwwwwwwwwww.....................rr............................................................',
      '....................wwwwwwwwwwwwwwwww.....................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr..................................................TTT.......',
      '..........................................................rr..................................................TTT.......',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '....................TTT...................................rr..............................TTT...........................',
      '....................TTT...................................rr..............................TTT...........................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '..........................................................rr............................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '......dddddddddddddd..........TTT.......................................................................................',
      '......dddddddddddddd..........TTT.......................................................................................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd................................................................................TTT.................',
      '......dddddddddddddd................................................................................TTT.................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd....................................................................................................',
      '......dddddddddddddd....TTT.............................................................................................',
      '......dddddddddddddd....TTT.............................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
      '........................................................................................................................',
    ],
  },
  entities: [
    // ---- Player 1: the camp above the carse ----
    { def: 'townCenter', player: 1, x: 52, y: 26 },
    // Doc anchor (54,28) sits inside the TC's 4x4 footprint; spawned just SE of it.
    { def: 'heroWallace', player: 1, x: 56, y: 30, ref: 'wallace' },
    { def: 'barracks', player: 1, x: 48, y: 32 },
    { def: 'archeryRange', player: 1, x: 60, y: 32 },
    { def: 'farm', player: 1, x: 44, y: 20 },
    { def: 'farm', player: 1, x: 47, y: 20 },
    { def: 'farm', player: 1, x: 50, y: 20 },
    { def: 'farm', player: 1, x: 53, y: 20 },
    { def: 'farm', player: 1, x: 56, y: 20 },
    { def: 'farm', player: 1, x: 44, y: 23 },
    { def: 'farm', player: 1, x: 47, y: 23 },
    { def: 'farm', player: 1, x: 50, y: 23 },
    { def: 'house', player: 1, x: 60, y: 26 },
    { def: 'house', player: 1, x: 63, y: 26 },
    { def: 'house', player: 1, x: 66, y: 26 },
    { def: 'house', player: 1, x: 60, y: 29 },
    { def: 'house', player: 1, x: 63, y: 29 },
    { def: 'house', player: 1, x: 66, y: 29 },
    // 8 houses (45 pop room): the mandated 10-spear/8-skirm warband plus a real
    // reinforcement margin — 6 houses capped the player at 35 and made the starting
    // stockpile unspendable mid-battle
    { def: 'house', player: 1, x: 69, y: 26 },
    { def: 'house', player: 1, x: 69, y: 29 },
    ...unitGroup('villager', 1, [
      [45, 21], [48, 21], [51, 21], [54, 21], [57, 21], [45, 24], [48, 24], [51, 24],
      [46, 10], [50, 10], // wood line under the north forest
    ]),
    ...unitGroup('spearman', 1, [[54, 36], [55, 36], [56, 36], [54, 37], [55, 37], [56, 37]]),
    ...unitGroup('skirmisher', 1, [[58, 36], [59, 36], [58, 37], [59, 37]]),
    // 6 starting archers: the anti-infantry arm of the mixed line (hint #1) — the
    // mandated spears/skirms do not counter the man-at-arms escorts of waves B/C
    ...unitGroup('archer', 1, [[60, 36], [61, 36], [62, 36], [60, 37], [61, 37], [62, 37]]),
    // ---- Player 3: Moray's camp on Abbey Craig's crown ----
    { def: 'watchTower', player: 3, x: 82, y: 28 },
    { def: 'heroMoray', player: 3, x: 83, y: 30, ref: 'moray' },
    ...unitGroup('spearman', 3, [[80, 31], [81, 31], [82, 31], [84, 31], [85, 31], [86, 31]]),
    ...unitGroup('archer', 3, [[81, 33], [83, 33], [85, 33], [84, 29]]),
    // ---- Player 4: Warenne's banner guard + muster-field set dressing ----
    // he must not die to a stray raid; he never crosses
    { def: 'heroWarenne', player: 4, x: 60, y: 96, ref: 'warenne', hp: 2000 },
    ...unitGroup('knight', 4, [[58, 94], [62, 94], [58, 98], [62, 98]]),
    ...unitGroup('archer', 4, [[56, 96], [64, 96], [57, 93], [63, 93]]),
    ...unitGroup('house', 4, [ // the tent city
      [44, 86], [48, 90], [52, 86], [66, 88], [70, 92], [74, 86], [50, 100], [68, 100],
    ]),
    // distant Stirling Castle — out of play, no AI use
    { def: 'castle', player: 4, x: 10, y: 104 },
    { def: 'watchTower', player: 4, x: 8, y: 102 },
    { def: 'watchTower', player: 4, x: 17, y: 102 },
    ...wallRing(4, 6, 100, 19, 111),
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 58, y: 62 }, // the bridge
        { kind: 'message', speaker: 'Narrator', text: 'Stirling Bridge, 11 September 1297. One bridge, two armies, and a river that takes no prisoners.' },
        { kind: 'message', speaker: 'Moray', text: 'Wallace — my men hold Abbey Craig on your right. Warenne is slow to wake. We have an hour, maybe two.' },
        { kind: 'panCamera', x: 52, y: 26 },
        { kind: 'objectiveAdd', id: 'obj-prepare', text: 'Field 10 Spearmen and 8 Skirmishers' },
        { kind: 'objectiveAdd', id: 'obj-hold-camp', text: 'Your camp must stand' },
      ],
    },
    {
      id: 't02-prepared',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['spearman', 'pikeman'], atLeast: 10 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['skirmisher'], atLeast: 8 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-prepare' },
        { kind: 'message', speaker: 'Wallace', text: 'Spears for their horses, javelins for their bowmen. Now we let the river do the counting.' },
        { kind: 'armTrigger', triggerId: 't04-wave-a' },
      ],
    },
    {
      id: 't03-prep-deadline',
      conditions: [{ kind: 'timerSeconds', seconds: 480 }], // crossing begins at 8 min even if unready
      effects: [{ kind: 'armTrigger', triggerId: 't04-wave-a' }],
    },
    {
      id: 't04-wave-a',
      armed: false, // fires on first of t02/t03; fire-once default makes converging arms safe
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'playSting', sting: 'horn' },
        { kind: 'panCamera', x: 58, y: 70 },
        { kind: 'message', speaker: 'Cressingham', text: "Enough delay! Riders, cross, in the king's name — wages are owed for VICTORIES, not for standing about." },
        {
          kind: 'spawn',
          entities: [
            // The vanguard rides: a mounted rush the mandated spear-wall hard-counters,
            // with a handful of archers behind for the skirmishers. Wave A must TEACH
            // the counters, not punish them — the man-at-arms mass that used to lead
            // here shredded the prescribed spear+skirm warband and made the scenario
            // unwinnable; the foot escorts now trail with waves B/C instead.
            ...unitGroup('scout', 2, [
              [54, 72], [55, 72], [56, 72], [57, 72], [60, 72], [61, 72], [54, 73], [55, 73],
            ]),
            ...unitGroup('archer', 2, [[60, 73], [61, 73], [54, 74], [55, 74]]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 54, y: 44, w: 10, h: 8 } }, // north bridgehead
        { kind: 'message', speaker: 'Moray', text: 'Steady. Let them cross. A blade in the water drowns same as a coward.' },
        { kind: 'objectiveAdd', id: 'obj-trap', text: "On Moray's signal, destroy every English soldier north of the Forth" },
        { kind: 'armTrigger', triggerId: 't05a-signal-north' },
        { kind: 'armTrigger', triggerId: 't06-wave-b' },
      ],
    },
    // Moray's signal must always precede the bridgehead fight. Two converging watchers
    // arm the fire-once payload (t05-signal): t05a fires when 8 of wave A's 12 stand on
    // the north bank (a live crossing peaks around 11 — the old threshold of 12 could
    // never be met and the trap was sprung before it was announced); t05b, armed with
    // wave B, is the guarantee — the FIRST Englishman north after the knights ride
    // triggers the signal even if the player bled wave A at the bridge itself.
    {
      id: 't05a-signal-north',
      armed: false, // armed by t04-wave-a
      conditions: [
        { kind: 'entitiesInArea', player: 2, area: { x: 0, y: 0, w: 120, h: 56 }, atLeast: 8 }, // north bank
      ],
      effects: [{ kind: 'armTrigger', triggerId: 't05-signal' }],
    },
    {
      id: 't05b-signal-crossed',
      armed: false, // armed by t06-wave-b
      conditions: [
        { kind: 'entitiesInArea', player: 2, area: { x: 0, y: 0, w: 120, h: 56 }, atLeast: 1 }, // any English north
      ],
      effects: [{ kind: 'armTrigger', triggerId: 't05-signal' }],
    },
    {
      id: 't05-signal',
      armed: false, // converging arms from t05a/t05b; fire-once makes the double-arm safe
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Moray', text: 'NOW, Wallace! Take the bridgehead — not one of them recrosses that bridge!' },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 54, y: 44, w: 10, h: 8 } }, // Moray charges off Abbey Craig
      ],
    },
    {
      id: 't06-wave-b',
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 210 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('knight', 2, [[54, 72], [55, 72], [56, 72], [57, 72], [60, 72], [61, 72]]),
            ...unitGroup('scout', 2, [[54, 73], [55, 73], [60, 73], [61, 73]]),
            // the first foot escort — part of the man-at-arms mass moved out of wave A;
            // the player's archers (and sheer spear numbers) handle them
            ...unitGroup('manAtArms', 2, [[56, 73], [57, 73], [54, 74], [55, 74]]),
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 20, w: 28, h: 20 } }, // push at the camp
        { kind: 'message', speaker: 'Narrator', text: 'Knights on the causeway, footmen at their heels. Horses die on spearpoints — form your line.' },
        { kind: 'armTrigger', triggerId: 't05b-signal-crossed' },
        { kind: 'armTrigger', triggerId: 't07-wave-c' },
      ],
    },
    {
      id: 't07-wave-c',
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 240 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('longbowman', 2, [
              [54, 72], [55, 72], [56, 72], [57, 72], [60, 72], [61, 72], [54, 73], [55, 73],
            ]),
            ...unitGroup('manAtArms', 2, [[56, 73], [57, 73], [60, 73], [61, 73], [54, 74], [55, 74]]),
            { def: 'heroCressingham', player: 2, x: 58, y: 70, ref: 'cressingham' },
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 20, w: 28, h: 20 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Cressingham', text: 'I shall recover the cost of this war from their hides personally.' },
        { kind: 'objectiveAdd', id: 'obj-cressingham', text: 'Kill Hugh de Cressingham' },
        { kind: 'armTrigger', triggerId: 't08-wave-d' },
      ],
    },
    {
      id: 't08-wave-d',
      armed: false,
      conditions: [{ kind: 'timerSeconds', seconds: 300 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            // the flanking force at the western ford, south side
            { def: 'knight', player: 2, x: 8, y: 70, ref: 'flank1' },
            { def: 'knight', player: 2, x: 9, y: 70, ref: 'flank2' },
            { def: 'knight', player: 2, x: 10, y: 70, ref: 'flank3' },
            { def: 'knight', player: 2, x: 11, y: 70, ref: 'flank4' },
            { def: 'scout', player: 2, x: 8, y: 71, ref: 'flank5' },
            { def: 'scout', player: 2, x: 9, y: 71, ref: 'flank6' },
            { def: 'scout', player: 2, x: 10, y: 71, ref: 'flank7' },
            { def: 'scout', player: 2, x: 11, y: 71, ref: 'flank8' },
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 44, y: 20, w: 28, h: 20 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Moray', text: 'Riders at the western ford — they mean to take your camp from behind!' },
        { kind: 'objectiveAdd', id: 'obj-ford', text: 'Repel the flanking force at the western ford' },
        { kind: 'armTrigger', triggerId: 't09-ford-clear' },
        { kind: 'armTrigger', triggerId: 't10-mopup-gate' },
      ],
    },
    {
      id: 't09-ford-clear',
      armed: false, // armed by t08 with the flankers' refs
      conditions: [
        // completes exactly when the flanking force is dead — no blind timer.
        // t11's annihilation condition implies this, so obj-ford can never be
        // left dangling at victory.
        {
          kind: 'refsDestroyed',
          refs: ['flank1', 'flank2', 'flank3', 'flank4', 'flank5', 'flank6', 'flank7', 'flank8'],
          all: true,
        },
      ],
      effects: [{ kind: 'objectiveComplete', id: 'obj-ford' }],
    },
    {
      id: 't10-mopup-gate',
      armed: false,
      conditions: [{ kind: 'refDestroyed', ref: 'cressingham' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-cressingham' },
        { kind: 'message', speaker: 'Narrator', text: 'Cressingham is down. The men remember every fine he levied — the treasurer pays his own arrears at last.' },
        // tell the player how the field gets finished: the survivors come to YOU
        { kind: 'message', speaker: 'Wallace', text: 'Finish it! What is left of the host is being whipped up the causeway — hold the bridgehead and let the Forth take the rest.' },
        { kind: 'armTrigger', triggerId: 't10b-mopup-drive' },
        { kind: 'armTrigger', triggerId: 't11-victory' },
      ],
    },
    {
      id: 't10b-mopup-drive',
      armed: false, // armed by t10-mopup-gate
      loop: true,
      conditions: [{ kind: 'timerSeconds', seconds: 20 }],
      effects: [
        // Every 20s of the mop-up phase, force-march every remaining host soldier —
        // including stragglers idling on the south bank (e.g. by the SW castle) — at
        // the north bridgehead. This is what squares t11's map-wide annihilation
        // count with obj-trap's 'north of the Forth' text: no player is ever left
        // combing the south bank for a lost straggler; the stragglers come north
        // to die. Harmless once the host is annihilated (t11 ends the scenario).
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 54, y: 44, w: 10, h: 8 } },
      ],
    },
    {
      id: 't11-victory',
      armed: false,
      conditions: [
        // player 2 is the fighting host and commits everything north; Warenne's
        // decorative banner guard belongs to player 4 and never counts. atMost 0
        // = every English soldier of the host is dead, exactly as obj-trap says.
        {
          kind: 'ownedAtMost',
          player: 2,
          defIds: ['militia', 'manAtArms', 'spearman', 'archer', 'longbowman', 'skirmisher', 'scout', 'knight'],
          atMost: 0,
        },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-trap' },
        { kind: 'objectiveComplete', id: 'obj-hold-camp' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'panCamera', x: 60, y: 96 },
        { kind: 'message', speaker: 'Warenne', text: 'Burn the bridge. BURN IT. We are done here.' },
        { kind: 'message', speaker: 'Narrator', text: 'The Earl of Surrey did not stay to test the ford. The first army of knights ever broken by common footmen streams south, and Scotland north of the Forth is free ground.' },
        { kind: 'message', speaker: 'Narrator', text: 'But Andrew Moray took his wounds on the causeway. Before the first snow, the best soldier of the rising will be gone — and Wallace will carry the war alone.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 't12-moray-falls', // optional grace note, not a failure
      conditions: [{ kind: 'refDestroyed', ref: 'moray' }],
      effects: [
        { kind: 'message', speaker: 'Wallace', text: 'Moray is hit — carry him back! You hear me, Andrew — Scotland is not finished with you!' },
      ],
    },
    {
      id: 't13-defeat-wallace',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen at Stirling Bridge.' },
      ],
    },
    {
      id: 't14-defeat-camp',
      conditions: [{ kind: 'ownedAtMost', player: 1, defIds: ['townCenter'], atMost: 0 }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'The camp is overrun. The army scatters into the hills.' },
      ],
    },
  ],
  startCamera: { x: 52, y: 26 },
  maxAge: 'feudal',
};
