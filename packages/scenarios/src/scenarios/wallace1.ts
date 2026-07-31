// wallace-1 · "The Sheriff of Lanark" — campaign scenario 1, authored from
// docs/CAMPAIGN_WALLACE.md §2. Teaches camera, selection, movement, gathering,
// building, and training villagers; ends with the raid on Lanark.
//
// Map: 96x96 Lanarkshire. The Clyde is an impassable water band along the east edge
// (x 78–95); solid forest walls the west (x<=6) and south (y>=80); the player glen is the
// open pocket {10,52,26,26} with berries, sheep, and a dirt path running NE past the
// shepherd's clearing {30,52,6,6} and the ford lookout knoll {48,40,6,6} to Lanark town
// {58,28,16,18}. Small gold at (44,60); deer at {40,66,5,4} guarded by wolves; no stone.
//
// NOTE: `heroWallace` / `heroHeselrig` are the campaign hero defs specified in
// docs/CAMPAIGN_WALLACE.md Appendix A ("still to add" to @bf/data). Until they land,
// loadScenario(wallace1) against the default gameData reports them as unknown defs.

import type { ScenarioDef } from '../schema';

const legend: ScenarioDef['map']['legend'] = {
  '.': { terrain: 'grass' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  w: { terrain: 'water' },
  T: { terrain: 'grass', object: 'tree' },
  G: { terrain: 'grass', object: 'gold' },
  B: { terrain: 'grass', object: 'berries' },
  H: { terrain: 'grass', object: 'sheep' },
  D: { terrain: 'grass', object: 'deer' },
  W: { terrain: 'grass', object: 'wolf' },
};

export const wallace1: ScenarioDef = {
  id: 'wallace-1',
  campaign: 'wallace',
  index: 0,
  title: 'The Sheriff of Lanark',
  briefing: {
    history:
      'Scotland has no king. Edward of England saw to that: Berwick put to the sword, the ' +
      'army broken in a single morning at Dunbar, John Balliol stripped of his crown like a ' +
      'servant stripped of livery, and the ancient Stone of Scone carted south to sit ' +
      'beneath an English throne. Now English sheriffs hold Scottish towns, and English law ' +
      'hangs Scottish men.\n\n' +
      'In Lanark, the sheriff is William Heselrig. He keeps his ledgers carefully — grain ' +
      'taken, cattle taken, sons taken. One name in those ledgers belongs to William ' +
      "Wallace, a landholder's son of no great rank, a big man with a long memory. The " +
      'tales will later say Heselrig murdered the woman Wallace loved. What is certain is ' +
      'this: in May of 1297, Wallace came down out of the hills, and the sheriff of Lanark ' +
      'did not live to see June.\n\n' +
      'But no man burns a garrison on an empty stomach. In a fold of the hills above the ' +
      "Clyde, Wallace's kin are waiting — a camp to be fed, sheltered, and armed in " +
      'secret. See to your people first. Then, when the fires are banked and the axes are ' +
      "sharp, we will pay the sheriff's ledger in full.",
    objectives: [
      "Walk Wallace to the shepherd's clearing",
      'Walk Wallace to the ford lookout',
      'Stockpile 150 food (pick berries, herd sheep to camp)',
      'Build two Houses',
      'Build a Lumber Camp by the western wood and stockpile 200 wood',
      'Train villagers at the Town Center until you have 6',
    ],
    hints: [
      'Drag on empty ground to pan; pinch to zoom. Tap a unit, then tap the ground to move it.',
      'Villagers drop food at the Town Center. Build camps close to what you gather.',
      'Sheep follow whoever finds them first. Bring them home before you eat them.',
      'Wallace fights better than any villager — but if he falls, the rising dies with him.',
    ],
  },
  players: [
    {
      name: "Wallace's Band", civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'dark', resources: { food: 100, wood: 100 }, popCap: 20,
    },
    {
      name: 'Garrison of Lanark', civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'dark', resources: {}, aiProfile: 'passive', popCap: 20,
    },
  ],
  map: {
    width: 96,
    height: 96,
    legend,
    rows: [
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.............................................TTT.......................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.............................................TTT.......................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................TTT.............................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................TTT.............................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT...........................................TTT.........................wwwwwwwwwwwwwwwwww',
      'TTTTTTT...........................................TTT.........................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....TTT...............................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....TTT...............................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT...............................................................TTT.....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...............................................................TTT.....wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....................TTT...............................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....................TTT...............................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....................................TTT...............................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.....................................TTT...............................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...............TTT.................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...............TTT.................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...................................................rrrrrrrrrrrrrrrr....wwwwwwwwwwwwwwwwww',
      'TTTTTTT.................................................rrrrrrrrrrrrrrrrrr....wwwwwwwwwwwwwwwwww',
      'TTTTTTT.................................................drdddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...TTT..........................................dd.dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...TTT.........................................dd..dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT..............................................dd...dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT............................................ddd....dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...........TTT.............................dd......dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT...........TTT............................dd.......dddddddrrddddddd....wwwwwwwwwwwwwwwwww',
      'TTTTTTT.......................T...T...T.........dd............................wwwwwwwwwwwwwwwwww',
      'TTTTTTT..........................T...T.........dd.............................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT......................T...T...T.....dd..........................TTT.wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT.....................T...T...T.....dd...........................TTT.wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................T...T...T.....dd................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT.......................T...T.....dd.................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT........................H.T...T.dd............TTT...................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT.........................H...T.dd.............TTT...................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT............................T.dd....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT...........................T.dd.....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT..............H...........T.ddT.....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT...................H.....ddddT......................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT.................H..T...TdddT.........................TTT...........wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT...............H.......T.ddd..........................TTT...........wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT......BBB.............T...T...T...GG................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT......BBB............T...T...T....G.................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................T...T...T.......................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT.......................T...T........................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT......................T...T...T.....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT..............................D..D......................TTT.........wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT................................D.......................TTT.........wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT..................................D.................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT...............................D....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT................BBB.................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT................BBB.................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT..............................TTT...................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT..............................TTT...................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTT....................................................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT...WW................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.....................................wwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTwwwwwwwwwwwwwwwwww',
    ],
  },
  entities: [
    // ---- Player 1: Wallace's band in the glen ----
    { def: 'townCenter', player: 1, x: 20, y: 64 },
    // Doc anchor (22,66) sits inside the TC's 4x4 footprint; spawned just south of it.
    { def: 'heroWallace', player: 1, x: 22, y: 68, ref: 'wallace' },
    { def: 'villager', player: 1, x: 18, y: 66 },
    { def: 'villager', player: 1, x: 18, y: 67 },
    { def: 'villager', player: 1, x: 24, y: 66 },
    // ---- Player 2: the garrison of Lanark ----
    { def: 'townCenter', player: 2, x: 62, y: 30 }, // Heselrig's hall
    { def: 'watchTower', player: 2, x: 66, y: 34, ref: 'lanark_tower' },
    { def: 'barracks', player: 2, x: 70, y: 38 },
    { def: 'house', player: 2, x: 59, y: 29 },
    { def: 'house', player: 2, x: 59, y: 33 },
    { def: 'house', player: 2, x: 68, y: 29 },
    { def: 'house', player: 2, x: 71, y: 29 },
    { def: 'house', player: 2, x: 59, y: 41 },
    { def: 'house', player: 2, x: 68, y: 42 },
    { def: 'militia', player: 2, x: 64, y: 35 },
    { def: 'militia', player: 2, x: 64, y: 38 },
    { def: 'militia', player: 2, x: 67, y: 36 },
    { def: 'militia', player: 2, x: 67, y: 39 },
    { def: 'archer', player: 2, x: 63, y: 36 },
    { def: 'archer', player: 2, x: 63, y: 39 },
    { def: 'heroHeselrig', player: 2, x: 65, y: 36, ref: 'heselrig' },
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 22, y: 66 },
        { kind: 'message', speaker: 'Narrator', text: 'Lanarkshire, May 1297. The English think Scotland is settled.' },
        { kind: 'message', speaker: 'Wallace', text: 'Settled. Aye — the way a boot settles on a neck.' },
        { kind: 'objectiveAdd', id: 'obj-move-1', text: "Walk Wallace to the shepherd's clearing" },
      ],
    },
    {
      id: 't02-move-1',
      conditions: [
        { kind: 'entitiesInArea', player: 1, defIds: ['heroWallace'], area: { x: 30, y: 52, w: 6, h: 6 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-move-1' },
        { kind: 'message', speaker: 'Wallace', text: "The flock's scattered since the soldiers came. Up the path — I want eyes on the ford." },
        { kind: 'objectiveAdd', id: 'obj-move-2', text: 'Walk Wallace to the ford lookout' },
        { kind: 'revealArea', player: 1, area: { x: 46, y: 38, w: 10, h: 10 } },
        { kind: 'panCamera', x: 50, y: 42 },
      ],
    },
    {
      id: 't03-move-2',
      conditions: [
        { kind: 'entitiesInArea', player: 1, defIds: ['heroWallace'], area: { x: 48, y: 40, w: 6, h: 6 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-move-2' },
        { kind: 'message', speaker: 'Wallace', text: "Lanark, beyond the river bend. Heselrig's tower. Not yet — first we feed our own." },
        { kind: 'armTrigger', triggerId: 't04-gather' },
      ],
    },
    {
      id: 't04-gather',
      armed: false,
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 20, y: 64 },
        { kind: 'message', speaker: 'Narrator', text: 'Tap a villager, then tap berries or a sheep to gather. Food is dropped off at the Town Center.' },
        { kind: 'objectiveAdd', id: 'obj-food', text: 'Stockpile 150 food' },
      ],
    },
    {
      id: 't05-food',
      conditions: [{ kind: 'resourcesAtLeast', player: 1, type: 'food', amount: 150 }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-food' },
        { kind: 'message', speaker: 'Wallace', text: 'Full bellies. Now roofs — kin are coming in from the hills.' },
        { kind: 'objectiveAdd', id: 'obj-houses', text: 'Build two Houses' },
      ],
    },
    {
      id: 't06-houses',
      conditions: [{ kind: 'ownedAtLeast', player: 1, defIds: ['house'], atLeast: 2 }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-houses' },
        { kind: 'message', speaker: 'Narrator', text: 'Houses raise your population room. Build a Lumber Camp beside the western wood so the walk is short.' },
        { kind: 'objectiveAdd', id: 'obj-lumber', text: 'Build a Lumber Camp near trees and stockpile 200 wood' },
      ],
    },
    {
      id: 't07-wood',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['lumberCamp'], atLeast: 1 },
        { kind: 'resourcesAtLeast', player: 1, type: 'wood', amount: 200 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-lumber' },
        { kind: 'message', speaker: 'Wallace', text: 'Good timber. Spear hafts, roof beams — and more hands to swing the axes.' },
        { kind: 'objectiveAdd', id: 'obj-vils', text: 'Train villagers until you have 6' },
      ],
    },
    {
      id: 't08-vils',
      conditions: [{ kind: 'ownedAtLeast', player: 1, defIds: ['villager'], atLeast: 6 }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-vils' },
        { kind: 'message', speaker: 'Narrator', text: 'Night falls over the glen. Word comes: Heselrig sits in judgement at Lanark tomorrow.' },
        { kind: 'armTrigger', triggerId: 't09-muster' },
      ],
    },
    {
      id: 't09-muster',
      armed: false,
      conditions: [{ kind: 'always' }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            // kinsmen with steel, at the glen mouth (36,58)
            { def: 'militia', player: 1, x: 35, y: 57 },
            { def: 'militia', player: 1, x: 36, y: 57 },
            { def: 'militia', player: 1, x: 37, y: 57 },
            { def: 'militia', player: 1, x: 35, y: 58 },
            { def: 'militia', player: 1, x: 36, y: 58 },
          ],
        },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Wallace', text: 'Kinsmen with steel. Lanark, then. The sheriff owes this shire a debt, and I mean to collect.' },
        { kind: 'objectiveAdd', id: 'obj-heselrig', text: 'Kill William Heselrig, Sheriff of Lanark' },
        { kind: 'revealArea', player: 1, area: { x: 58, y: 28, w: 16, h: 18 } },
        { kind: 'panCamera', x: 65, y: 36 },
      ],
    },
    {
      id: 't10-alarm',
      conditions: [
        { kind: 'triggerFired', triggerId: 't09-muster' },
        { kind: 'entitiesInArea', player: 1, area: { x: 54, y: 26, w: 22, h: 22 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'message', speaker: 'Heselrig', text: "Brigands at the gate? Cut them down and hang what's left." },
        { kind: 'aiProfile', player: 2, profile: 'defender' },
        { kind: 'playSting', sting: 'alert' },
      ],
    },
    {
      id: 't11-victory',
      conditions: [
        // the tutorial arc (economy -> muster) must run first; refDestroyed latches,
        // so an early kill still counts
        { kind: 'triggerFired', triggerId: 't09-muster' },
        { kind: 'refDestroyed', ref: 'heselrig' },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-heselrig' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'The sheriff of Lanark is dead, and the news runs faster than any horse: a commoner struck the blow, and the sky did not fall.' },
        { kind: 'message', speaker: 'Narrator', text: 'Across Scotland, men look at their own garrisons and begin to count spears.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 't12-defeat',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen. The rising of Scotland dies in a Lanarkshire glen.' },
      ],
    },
  ],
  startCamera: { x: 20, y: 64 },
  maxAge: 'dark',
};
