// wallace-2 · "The Justiciar Flees" — campaign scenario 2, authored from
// docs/CAMPAIGN_WALLACE.md §3. Teaches the full dark-age economy (mill+farms,
// mining camp+gold), the Feudal age-up, military production, and defending a
// scripted raid; ends with the assault on Ormesby's hall at Scone.
//
// Map: 112x112 Perthshire. The Tay is an L-shaped water band framing the NE corner:
// a vertical arm (x 40-52) enters at the N edge and bends E into a horizontal arm
// (rows y 33-42) that exits at the E edge. The only crossing is the ford — shallows
// {56,33,3,10} spanning all ten water rows. Beyond it, the Scone rise {62,8,30,24}
// (dirt/road) holds the English compound; the player meadow is {18,62,30,26} with
// berries, sheep, gold NE of camp (the drop-off placement lesson), stone SW, deer
// by the south wood. Heavy forest walls the S (y>=98) and W (x<=8) edges; a light
// copse {50,50,8,6} screens the ford approach. The English raid enters via the ford
// and follows the SW road to the camp.
//
// NOTE: `heroWallace` is a campaign hero def (docs/CAMPAIGN_WALLACE.md Appendix A),
// canonical in @bf/data — load with campaignGameData from ../heroes.

import type { ScenarioDef } from '../schema';
import { layRoadCurves } from './authoring';

const legend: ScenarioDef['map']['legend'] = {
  '.': { terrain: 'grass' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  w: { terrain: 'water' },
  s: { terrain: 'shallows' },
  T: { terrain: 'grass', object: 'tree' },
  G: { terrain: 'grass', object: 'gold' },
  S: { terrain: 'grass', object: 'stone' },
  B: { terrain: 'grass', object: 'berries' },
  D: { terrain: 'grass', object: 'deer' },
  H: { terrain: 'grass', object: 'sheep' },
};

/**
 * The Perth road, re-laid as a curve: down from Scone to the Tay ford on the north
 * bank, and from the ford south-west to the player's meadow camp. The straight
 * legs meeting at right angles this replaces were the one thing on the map that
 * looked surveyed rather than worn.
 */
const ROAD_PATHS: Array<Array<[number, number]>> = [
  [[75, 19], [68, 20], [62, 21], [58, 25], [57, 32]],
  [[57, 43], [56, 47], [55, 50], [50, 51], [46, 52], [44, 56], [42, 60], [36, 61]],
];

export const wallace2: ScenarioDef = {
  id: 'wallace-2',
  campaign: 'wallace',
  index: 1,
  title: 'The Justiciar Flees',
  briefing: {
    history:
      'The blow at Lanark rang like a bell, and Scotland answered. Out of Ettrick and the ' +
      'western hills men came in twos and tens, and among the first great names to ride in ' +
      'was Sir William Douglas — "the Hardy," they call him, and not for his patience.\n\n' +
      "Edward's grip on Scotland runs through clerks as much as castles. At Scone, the " +
      'ancient crowning-place of Scottish kings, sits William de Ormesby, justiciar of ' +
      "Scotland — Edward's chief lawman, growing rich on fines levied against every Scot " +
      'who will not swear the oath to the English king. There is a bitter joke in it: the ' +
      'seat where kings were made, occupied by the man who unmakes free men by the stroke ' +
      'of a pen.\n\n' +
      'Wallace and Douglas mean to end the joke. But a raid is not a rising. To carry this ' +
      'war past one summer, we must learn to feed it: farms behind the mill, ore out of ' +
      'the hills, and a barracks turning ploughmen into soldiers. Build the camp on the ' +
      'Tay as if we mean to stay — because we do. Then cross the ford and show the ' +
      'justiciar what his fines have purchased.',
    objectives: [
      'Build a Mill near the berries and four Farms around it',
      'Build a Mining Camp at the gold outcrop and stockpile 200 gold',
      'Advance to the Feudal Age (requires two Dark Age buildings)',
    ],
    hints: [
      'Farms never run dry the way berries do — reseed them and your food is safe forever.',
      'The age-up needs two buildings of your current age. A Mill and a Barracks both count.',
      'Spearmen are cheap and cruel to horsemen. Keep a few home — the English know where you sleep.',
      'Villagers can garrison in the Town Center; it shoots harder with them inside.',
    ],
  },
  players: [
    {
      name: 'The Rising', civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'dark', resources: { food: 200, wood: 150, gold: 50 }, popCap: 40,
    },
    {
      name: "Justiciar's Garrison", civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'feudal', resources: { food: 600, wood: 400, gold: 300, stone: 100 },
      aiProfile: 'defender', popCap: 40,
    },
  ],
  map: {
    width: 112,
    height: 112,
    legend,
    rows: layRoadCurves([
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...........................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww.........ddddddddddddrrdddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rrrrrrrrrrrrrrrrrrrrdddddddddddddddd....................',
      'TTTTTTTTT.....TTT.......................wwwwwwwwwwwww...rrrrrrrrrrrrrrrrrrrrdddddddddddddddd....................',
      'TTTTTTTTT.....TTT.......................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr....dddddddddddddddddddddddddddddd....................',
      'TTTTTTTTT...............................wwwwwwwwwwwww...rr......................................................',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............TTT.............wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............TTT.............wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................wwwwwwwwwwwwwwwwssswwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT...............................................rr......................................................',
      'TTTTTTTTT.....................TTT...........rrrrrrrrrrrrrr............TTT...........................TTT.........',
      'TTTTTTTTT.....................TTT...........rrrrrrrrrrrrrr............TTT...........................TTT.........',
      'TTTTTTTTT...................................rr....TTTTTTTT......................................................',
      'TTTTTTTTT...................................rr....TTTTTTTT......................................................',
      'TTTTTTTTT...................................rr....TTTTTTTT......................................................',
      'TTTTTTTTT...................................rr....TTTTTTTT......................................................',
      'TTTTTTTTT...........TTT.....................rr..................................................................',
      'TTTTTTTTT...........TTT.....................rr..................................................................',
      'TTTTTTTTT...................................rr..................................................................',
      'TTTTTTTTT...................................rr..................................................................',
      'TTTTTTTTT...........................rrrrrrrrrr........................TTT.......................................',
      'TTTTTTTTT...........................rrrrrrrrrr........................TTT.......................................',
      'TTTTTTTTT.................................GGG...................................................................',
      'TTTTTTTTT.................................GG....................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT...............BBBB........H...........................................................................',
      'TTTTTTTTT...............BBBB.......H............................................................................',
      'TTTTTTTTT............................H.H..................................................TTT...........TTT.....',
      'TTTTTTTTT.........................H.......................................................TTT...........TTT.....',
      'TTTTTTTTT.............................H.........................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......SS..............................................................................................',
      'TTTTTTTTT.......SS..............................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT........................................D..D...........................................................',
      'TTTTTTTTT..........................................D............................................................',
      'TTTTTTTTT.......................................D....D..........................................................',
      'TTTTTTTTT.........................................D.............................................................',
      'TTTTTTTTT.......................................................................................TTT.............',
      'TTTTTTTTT.......................................................................................TTT.............',
      'TTTTTTTTT...........GG......................................TTT.................TTT.............................',
      'TTTTTTTTT...........GG......................................TTT.................TTT.............................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTT.......................................................................................................',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ], ROAD_PATHS, { over: '.d', width: 2 }),
  },
  entities: [
    // ---- Player 1: the camp on the Tay ----
    { def: 'townCenter', player: 1, x: 30, y: 74 },
    // Doc anchor (32,76) sits inside the TC's 4x4 footprint; spawned just east of it.
    { def: 'heroWallace', player: 1, x: 34, y: 77, ref: 'wallace' },
    { def: 'villager', player: 1, x: 28, y: 73 },
    { def: 'villager', player: 1, x: 28, y: 76 },
    { def: 'villager', player: 1, x: 35, y: 74 },
    { def: 'villager', player: 1, x: 35, y: 76 },
    { def: 'villager', player: 1, x: 29, y: 79 },
    // survivors of Lanark
    { def: 'militia', player: 1, x: 36, y: 78 },
    { def: 'militia', player: 1, x: 34, y: 79 },
    // ---- Player 2: the compound on the Scone rise ----
    { def: 'townCenter', player: 2, x: 74, y: 14, ref: 'ormesby_hall' },
    { def: 'watchTower', player: 2, x: 62, y: 28, ref: 'ford_tower' }, // covers the ford exit
    { def: 'barracks', player: 2, x: 80, y: 20 },
    { def: 'house', player: 2, x: 64, y: 10 },
    { def: 'house', player: 2, x: 68, y: 10 },
    { def: 'house', player: 2, x: 84, y: 12 },
    { def: 'house', player: 2, x: 88, y: 14 },
    { def: 'house', player: 2, x: 80, y: 26 },
    { def: 'house', player: 2, x: 86, y: 24 },
    { def: 'militia', player: 2, x: 70, y: 20 },
    { def: 'militia', player: 2, x: 71, y: 22 },
    { def: 'militia', player: 2, x: 72, y: 24 },
    { def: 'militia', player: 2, x: 68, y: 22 },
    { def: 'militia', player: 2, x: 69, y: 24 },
    { def: 'militia', player: 2, x: 73, y: 21 },
    { def: 'archer', player: 2, x: 75, y: 19 },
    { def: 'archer', player: 2, x: 76, y: 20 },
    { def: 'archer', player: 2, x: 73, y: 18 },
    { def: 'archer', player: 2, x: 77, y: 19 },
    { def: 'scout', player: 2, x: 66, y: 26 },
    { def: 'scout', player: 2, x: 68, y: 27 },
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 30, y: 74 },
        { kind: 'message', speaker: 'Narrator', text: 'Scone, summer 1297. The crowning-place of kings — now the counting-house of the justiciar.' },
        { kind: 'message', speaker: 'Douglas', text: 'Wallace! Douglas rides with you. But my men eat like horses — build us a camp worth the name.' },
        { kind: 'objectiveAdd', id: 'obj-camp', text: 'Build a Mill near the berries and 4 Farms' },
        { kind: 'objectiveAdd', id: 'obj-gold', text: 'Build a Mining Camp at the gold and stockpile 200 gold' },
        { kind: 'objectiveAdd', id: 'obj-feudal', text: 'Advance to the Feudal Age' },
      ],
    },
    {
      id: 't02-camp',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['mill'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['farm'], atLeast: 4 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-camp' },
        { kind: 'message', speaker: 'Narrator', text: 'Farms are slower than berries but never run out. Reseed them when they exhaust.' },
      ],
    },
    {
      id: 't03-gold',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['miningCamp'], atLeast: 1 },
        { kind: 'resourcesAtLeast', player: 1, type: 'gold', amount: 200 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-gold' },
        { kind: 'message', speaker: 'Douglas', text: 'Gold buys steel. Steel buys back Scotland. Simple arithmetic.' },
      ],
    },
    {
      id: 't04-feudal',
      conditions: [{ kind: 'ageReached', player: 1, age: 'feudal' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-feudal' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Narrator', text: 'The Feudal Age. New soldiers, new tools — and new attention from the enemy.' },
        { kind: 'objectiveAdd', id: 'obj-army', text: 'Muster 6 Militia and 4 Spearmen' },
        { kind: 'armTrigger', triggerId: 't05-raid-timer' },
      ],
    },
    {
      id: 't05-raid-timer',
      armed: false, // armed by t04-feudal: the raid rides 2 minutes after the age-up
      conditions: [{ kind: 'timerSeconds', seconds: 120 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            { def: 'militia', player: 2, x: 56, y: 43 },
            { def: 'militia', player: 2, x: 57, y: 43 },
            { def: 'militia', player: 2, x: 58, y: 43 },
            { def: 'militia', player: 2, x: 56, y: 44 },
            { def: 'archer', player: 2, x: 57, y: 44 },
            { def: 'archer', player: 2, x: 58, y: 44 },
            { def: 'scout', player: 2, x: 55, y: 43 },
            { def: 'scout', player: 2, x: 55, y: 44 },
          ],
        },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 18, y: 62, w: 30, h: 26 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Wallace', text: 'Riders at the ford! To arms — and get the folk inside the Town Center!' },
        { kind: 'objectiveAdd', id: 'obj-hold', text: 'Drive off the English raid' },
        { kind: 'armTrigger', triggerId: 't06-raid-broken' },
      ],
    },
    {
      id: 't06-raid-broken',
      armed: false, // armed by t05 the moment the raid spawns
      conditions: [
        { kind: 'timerSeconds', seconds: 30 }, // grace: the spawn resolves before the check begins
        // camp meadow + the whole approach from the ford (includes the spawn point) is
        // clear of English — the raid is genuinely dead or driven off, not timed out.
        // Player 2's defender AI never otherwise enters this quadrant.
        { kind: 'entitiesInArea', player: 2, area: { x: 10, y: 40, w: 54, h: 56 }, atMost: 0 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-hold' },
        { kind: 'message', speaker: 'Douglas', text: "They'll carry the tale back to Ormesby. Good. Let him lose sleep for once." },
      ],
    },
    {
      id: 't07-army',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['militia', 'manAtArms'], atLeast: 6 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['spearman'], atLeast: 4 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-army' },
        { kind: 'message', speaker: 'Wallace', text: 'Across the ford, straight up the road. Burn the hall and the ledgers in it.' },
        { kind: 'objectiveAdd', id: 'obj-ormesby', text: "Destroy Ormesby's hall at Scone" },
        { kind: 'revealArea', player: 1, area: { x: 62, y: 8, w: 30, h: 24 } },
        { kind: 'panCamera', x: 74, y: 14 },
      ],
    },
    {
      id: 't08-ford-warning',
      conditions: [
        { kind: 'triggerFired', triggerId: 't07-army' },
        { kind: 'entitiesInArea', player: 1, area: { x: 56, y: 33, w: 3, h: 10 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'message', speaker: 'Narrator', text: 'The tower covers the ford. Take it down first, or pay the toll in blood.' },
      ],
    },
    {
      id: 't09-reinforce',
      // fires immediately after the assault objective — Douglas's men join
      conditions: [{ kind: 'triggerFired', triggerId: 't07-army' }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            { def: 'militia', player: 1, x: 33, y: 70 },
            { def: 'militia', player: 1, x: 34, y: 70 },
            { def: 'militia', player: 1, x: 35, y: 70 },
            { def: 'militia', player: 1, x: 33, y: 71 },
            { def: 'spearman', player: 1, x: 34, y: 71 },
            { def: 'spearman', player: 1, x: 35, y: 71 },
          ],
        },
        { kind: 'message', speaker: 'Douglas', text: 'My household men. Try not to get them killed faster than I would.' },
      ],
    },
    {
      id: 't10-victory',
      conditions: [{ kind: 'refDestroyed', ref: 'ormesby_hall' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-ormesby' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'Ormesby did not stay for the end. He fled south with what he could carry, and the justice of Edward fled with him.' },
        { kind: 'message', speaker: 'Narrator', text: 'In the north, another fire is rising — a young knight named Andrew Moray has raised the country beyond the Mounth. Two risings, looking for each other.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 't11-defeat-wallace',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen at Scone.' },
      ],
    },
    {
      id: 't12-defeat-camp',
      conditions: [{ kind: 'ownedAtMost', player: 1, defIds: ['townCenter', 'villager'], atMost: 0 }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'The camp on the Tay is lost — the rising starves.' },
      ],
    },
  ],
  startCamera: { x: 30, y: 74 },
  maxAge: 'feudal',
};
