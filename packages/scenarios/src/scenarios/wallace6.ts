// wallace-6 · "The Unbroken" — campaign finale, authored from
// docs/CAMPAIGN_WALLACE.md §7. The graduation exam: Imperial Age, trebuchets,
// two enemy players, a contested map — and the shadow of the betrayal.
//
// Map: 144x144 Ettrick Forest and the road to the Clyde. Dense trees cover the SE
// triangle (every tile with x+y >= 190) broken by winding grass corridors; the player
// hollow {100,100,26,24} sits at its heart, reached through two ~3-wide forest mouths
// (north at (112,78), west at (78,112)) — natural wall lines. The Clyde is a stepped
// 9-wide band: in at the N edge (x 48-56), a horizontal reach at rows 56-64 (x 40-56),
// then stepping SW to exit the W edge at rows 78-86. The Earnside bridge (road, 3 wide
// at x 43-45) is the only crossing — except the hidden ford, shallows {19,78,3,9} far
// to the SW. Happrew watch-fort (center-west) holds the gaia captive pen; Bothwell
// (NW corner, double wall ring) is the Warden's seat; Segrave's field camp (N-center)
// pressures the Forest all game.
//
// Historical note (from the doc): the storming of Bothwell is the campaign's one
// deliberate invention; every other beat follows the record.

import type { ScenarioDef } from '../schema';
import { unitGroup, wallRing } from './authoring';

const legend: ScenarioDef['map']['legend'] = {
  '.': { terrain: 'grass' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  w: { terrain: 'water' },
  s: { terrain: 'shallows' },
  f: { terrain: 'farmland' }, // abandoned fields, re-farmable
  T: { terrain: 'grass', object: 'tree' },
  G: { terrain: 'grass', object: 'gold' },
  S: { terrain: 'grass', object: 'stone' },
  B: { terrain: 'grass', object: 'berries' },
  D: { terrain: 'grass', object: 'deer' },
  H: { terrain: 'grass', object: 'sheep' },
  W: { terrain: 'grass', object: 'wolf' },
};

export const wallace6: ScenarioDef = {
  id: 'wallace-6',
  campaign: 'wallace',
  index: 5,
  title: 'The Unbroken',
  briefing: {
    history:
      'Seven years of war. Wallace has been to France to beg King Philip for aid and ' +
      'come home with fair words and empty hands. One by one the great men of Scotland ' +
      'have made their peace — Comyn on terms, and the young Earl of Carrick, Robert ' +
      'Bruce, keeping his own counsel as always. Edward holds the land through garrisons ' +
      "and a new-made government, and his Warden's seat is the mighty red-stone castle " +
      "of Bothwell on the Clyde, where Sir Aymer de Valence keeps the king's peace with " +
      'rope and iron.\n\n' +
      "For every name on Edward's pardon rolls there is one name missing. It is missing " +
      'because Edward struck it out himself: for William Wallace, no terms, no peace, no ' +
      'price but surrender of his body. Hunted at Happrew, harried at Earnside, Wallace ' +
      'holds to the deep woods with Sir Simon Fraser and the unforgiven — and while he ' +
      "stands unbowed, Edward's conquest is a lie told in official ink.\n\n" +
      'One war-camp in the Forest. One army raised from the unpardoned. The watch-fort ' +
      "at Happrew, the bridge-tower at Earnside, and then the Warden's own walls. Break " +
      'Bothwell, and every man in Scotland learns the war is not over — it is only ' +
      'waiting for a king.',
    objectives: [
      'Raise the hidden war-camp: 15 villagers, Lumber Camp, Mining Camp, Mill with 6 Farms',
      'Advance to the Imperial Age',
    ],
    hints: [
      'Trebuchets are built at the Castle and must unpack to fire. They outrange everything on a wall — and cannot defend themselves. Escort or regret.',
      "Segrave's field army sweeps the Forest. Walls across the forest mouths turn sweeps into toll-gates.",
      'The Market turns surplus wood into the gold that late-war armies drink.',
      'Monks heal between assaults, and a converted English knight is two swings of the sword — one they lose, one you gain.',
    ],
  },
  players: [
    {
      name: 'The Unforgiven', civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'castle', resources: { food: 300, wood: 300, gold: 150, stone: 100 }, popCap: 150,
    },
    {
      name: 'Warden of Scotland (Valence)', civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'imperial', resources: { food: 4000, wood: 3000, gold: 2500, stone: 2000 },
      aiProfile: 'defender', popCap: 120,
    },
    {
      name: "Segrave's Field Army", civ: 'english', team: 2, isHuman: false, color: 2,
      age: 'imperial', resources: { food: 5000, wood: 4000, gold: 3000, stone: 1000 },
      aiProfile: 'standard', popCap: 100, // -> aggressive when Happrew falls (t07)
    },
  ],
  map: {
    width: 144,
    height: 144,
    legend,
    rows: [
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......TTT.............................................................................',
      '................................................wwwwwwwww.......TTT.............................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................................................................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww...TTT.................dddddddddddddddddddd..............................TTT...........',
      '................................................wwwwwwwww...TTT.................dddddddddddddddddddd..............................TTT...........',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '............................GGGG................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '............................GGGG................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '................................................wwwwwwwww.......................dddddddddddddddddddd............................................',
      '......................rrrrrrrrrrrrrrrrrrrrrrrr..wwwwwwwww.......................dddddddddddddddddddd............................................',
      '......................rrrrrrrrrrrrrrrrrrrrrrrr..wwwwwwwww.......................dddddddddddddddddddd............................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '..............................TTT..........rrr..wwwwwwwww.............TTT.................rr..................TTT...............................',
      '..............................TTT..........rrr..wwwwwwwww.............TTT.................rr..................TTT...............................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr....................................................',
      '...........................................rrr..wwwwwwwww.................................rr...................................................T',
      '...........................................rrr..wwwwwwwww.................................rr..................................................TT',
      '...........................................rrr..wwwwwwwww.................................rr.................................................TTT',
      '..........TTT..............................rrr..wwwwwwwww.................................rr........TTT.....................................TTTT',
      '..........TTT..............................rrr..wwwwwwwww.................................rr........TTT....................................TTTTT',
      '...........................................rrr..wwwwwwwww.................................rr..............................................TTTTTT',
      '...........................................rrr..wwwwwwwww.................................rr.............................................TTTTTTT',
      '...........................................rrr..wwwwwwwww.................................rr............................................TTTTTTTT',
      '...........................................rrr..wwwwwwwww.................................rr...........................................TTTTTTTTT',
      '........................................wwwrrrwwwwwwwwwww.................................rr..........................................TTTTTTTTTT',
      '.......................................wwwwrrrwwwwwwwwwww.................................rr.........................................TTTTTTTTTTT',
      '......................................wwwwwrrrwwwwwwwwwww.................................rr........................................TTTTTTTTTTTT',
      '......................................wwwwwrrrwwwwwwwwwww.................................rr.......................................TTTTTTTTTTTTT',
      '........................TTT..........wwwwwwrrrwwwwwwwwwww.......ffffffffff................rrrrrrrrrrrrrrrrrrrrrrrr................TTTTTTTTTTTTTT',
      '........................TTT.........wwwwwwwrrrwwwwwwwwwww.......ffffffffff................rrrrrrrrrrrrrrrrrrrrrrrr...............TTTTTTTTTTTTTTT',
      '...................................wwwwwwwwrrrwwwwwwwwwww.......ffffffffff................rr....................rr..............TTTTTTTTTTTTTTTT',
      '..................................wwwwwwwwwrrrwwwwwwwwwww.......ffffffffff................rr....................rr.............TTTTTTTTTTTTTTTTT',
      '..................................wwwwwwwwwrrrwwwwwwwwwww.......ffffffffff................rr....................rr............TTTTTTTTTTTTTTTTTT',
      '.................................wwwwwww...rrr..................ffffffffff................rr....................rr...........TTTTTTTTTTTTTTTTTTT',
      '................................wwwwwww....rrr..................ffffffffff................rr....................rr..........TTTTTTTTTTTTTTTTTTTT',
      '...............................wwwwwww.....rrr..................ffffffffff................rr....................rr.........TTTTTTTTTTTTTTTTTTTTT',
      '..............................wwwwwwww.....rrr....................H...H...................rr....................rr........TTTTTTTTTTTTTTTTTTTTTT',
      '.............................wwwwwwww......rrr......................H...H.................rr....................rr.......TTTTTTTTTTTTTTTTTTTTTTT',
      '.............................wwwwwww.......rrr....................H.......................rr....................rr......TTTTTTTTTTTTTTTTTTTTTTTT',
      '............................wwwwwww........rrr.......................H....................rr....................rr.....TTTTTTTTTTTTTTTTTTTTTTTTT',
      '...........................wwwwwww.........rrr..........................GGG...............rr....................rr....TTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..........................wwwwwwww.........rrr..........................GGG...............rr....................rr...TTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '.........................wwwwwwww..........rrrrrrrrrrrrrrrrrrrrrrrrrrr....................rr....................rr..TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '.........................wwwwwww............rrrrrrrrrrrrrrrrrrrrrrrrrr....................rr....................rr.TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '........................wwwwwww.....................................rr....................rr....................rr.TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '.......................wwwwwww......................................rr....................rr....................rr.TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswwwwwww.......................................rr....................rr.......................TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswwwwwww.......................................rr....................rr.......................TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswwwwww........................................rr....................rr..................T....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswwwww.........................................rr....................rr.................TT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswwww..........................................rr....................rr................TTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswww...........................................rr....................rr...............TTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwssswww...................................SSS...........................rr..............TTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwsssww....................................SS............................rr.............TTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'wwwwwwwwwwwwwwwwwwwsssw...................................................................rr............TTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr...........TTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr..........TTTTTTTTT..........TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr.........TTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr........TTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr.......TTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr......TTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr.....TTTTTTTTTTTTTTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTT',
      '..........................................................................................rr....TTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTT',
      '..........................................................................................rr...TTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTT',
      '..........................................................................................rr..TTTTTTTTTTTTTTTTTTTTTTT.....GGG..TTTTTTTTTTTTTTTTT',
      '..........................................................................................rr.TTTTTTTTTTTTTTTTTTTTTTTT.....GGG..TTTTTTTTTTTTTTTTT',
      '..........................................................................................rrTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTT',
      '..........................................................................................rrTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTT...TTTTTT',
      '..........TTT.............................................................................rrTTTTTTTT..........................TTTTTTTTT.W.TTTTTT',
      '..........TTT............................................................................TrrTTTTTTTT..........................TTTTTTTTT...TTTTTT',
      '........................................................................................TTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '.......................................................................................TTTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '......................................................................................TTTTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '.....................................................................................TTTTTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '....................................................................................TTTTTTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '...................................................................................TTTTTTTrrTTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '..................................................................................TTTTTTTTrrTTTTTTTT..........................TT.........TTTTTTT',
      '.................................................................................TTTTTTTTTrrTTTTTTTT..........................TT.........TTTTTTT',
      '..............................TTT..............................................rrrrrrrrrrrrrTTTTTTTT..............................D..D...TTTTTTT',
      '..............................TTT..............................................rrrrrrrrrrrrrTTTTTTTT................................D....TTTTTTT',
      '............................................................................................TTTTTTTT..................................D..TTTTTTT',
      '............................................................................................TTTTTTTT...............................D.....TTTTTTT',
      '............................................................................TTTTTTTTTTTT....TTTTTTTT..........................TT.........TTTTTTT',
      '...........................................................................TTTTTTTTTTTTT....TTTTTTTT.....................................TTTTTTT',
      '..........................................................................TTTTTTTTTTTTTT....TTTTTTTT..........................W..........TTTTTTT',
      '.........................................................................TTTTTTTTTTTTTTT....TTTTTTTT............................TTTTTTTTTTTTTTTT',
      '........................................................................TTTTTTTTTTTTTTTT....TTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '.......................................................................TTTTTTTTTTTTTTTTT....TTTTTTTT..........................TTTTTTTTTTTTTTTTTT',
      '............................................................TTT.......TTTTTTTTTTTTTTTTTT......................................TTTTTTTTTTTTTTTTTT',
      '............................................................TTT......TTTTTTTTTTTTTTTTTTT..............................SSS.....TTTTTTTTTTTTTTTTTT',
      '....................................................................TTTTTTTTTTTTTTTTTTTT..............................SSS.....TTTTTTTTTTTTTTTTTT',
      '...................................................................TTTTTTTTTTTTTTTTTTTTT......................................TTTTTTTTTTTTTTTTTT',
      '..................................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTT.......T.BBBB.TTTTTTTT....TTTTTTTTTTTTTTTTTTTTTTTT',
      '.................................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTT.......T.BBBB.T...TTTT....TTTTTTTTTTTTTTTTTTTTTTTT',
      '................................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..GGG..T......T.W.TTTT....TTTTTTTTTTTTTTTTTTTTTTTT',
      '...............................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..GG...T......T...TTTT....TTTTTTTTTTTTTTTTTTTTTTTT',
      '..............................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.......TTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTT',
      '.............................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTT',
      '............................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..D....D..TTTTTTTTTTTTTTTTTTTT',
      '...........................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....D.....TTTTTTTTTTTTTTTTTTTT',
      '..........................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT......D...TTTTTTTTTTTTTTTTTTTT',
      '.........................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT...D......TTTTTTTTTTTTTTTTTTTT',
      '........................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTT',
      '.......................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTT',
      '......................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTT',
      '.....................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '....................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '...................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '..................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '.................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '................................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '...............................................TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
  },
  entities: [
    // ---- Player 1: the hidden war-camp in the clearing ----
    { def: 'townCenter', player: 1, x: 110, y: 108 },
    // Doc anchor (112,110) sits inside the TC's 4x4 footprint; spawned just east of it.
    { def: 'heroWallace', player: 1, x: 114, y: 110, ref: 'wallace' },
    { def: 'heroFraser', player: 1, x: 110, y: 112, ref: 'fraser' },
    ...unitGroup('house', 1, [[104, 109], [104, 112], [116, 104], [118, 106], [120, 104]]),
    ...unitGroup('villager', 1, [
      [108, 107], [108, 109], [108, 111], [114, 107], [115, 108], [112, 113], [114, 113], [116, 110],
    ]),
    ...unitGroup('highlandRaider', 1, [ // the veterans
      [104, 104], [105, 104], [106, 104], [107, 104], [104, 105], [105, 105], [106, 105], [107, 105],
    ]),
    ...unitGroup('pikeman', 1, [[104, 106], [105, 106], [106, 106], [107, 106]]),
    ...unitGroup('crossbowman', 1, [[104, 107], [105, 107]]),
    // ---- Player 2: Earnside bridge-tower ----
    { def: 'watchTower', player: 2, x: 44, y: 52, ref: 'earnside_tower' },
    ...unitGroup('stoneWall', 2, [[41, 52], [42, 52], [46, 52], [47, 52]]), // wall stubs
    ...unitGroup('longbowman', 2, [[42, 53], [43, 53], [45, 53], [46, 53], [42, 54], [46, 54]]),
    // ---- Player 2: Happrew watch-fort (stone ring, east gate) ----
    ...wallRing(2, 52, 76, 67, 89, [[67, 82]]),
    { def: 'gate', player: 2, x: 67, y: 82, ref: 'happrew_gate' },
    { def: 'watchTower', player: 2, x: 58, y: 82, ref: 'happrew_keep' },
    { def: 'barracks', player: 2, x: 54, y: 84 },
    ...unitGroup('manAtArms', 2, [
      [60, 78], [61, 78], [62, 78], [63, 78], [64, 78], [60, 80], [61, 80], [62, 80], [63, 80], [64, 80],
    ]),
    ...unitGroup('longbowman', 2, [[57, 87], [59, 87], [63, 87], [65, 87], [65, 78], [66, 80]]),
    ...unitGroup('knight', 2, [[64, 82], [65, 82], [64, 83], [65, 83]]),
    // ---- Gaia: the captive pen in Happrew's NW corner (Hexham Priory pattern) ----
    { def: 'villager', player: 0, x: 53, y: 77, ref: 'captive1' },
    { def: 'villager', player: 0, x: 54, y: 77, ref: 'captive2' },
    { def: 'villager', player: 0, x: 53, y: 78, ref: 'captive3' },
    { def: 'highlandRaider', player: 0, x: 54, y: 78, ref: 'captive4' },
    { def: 'highlandRaider', player: 0, x: 53, y: 79, ref: 'captive5' },
    // ---- Player 2: Bothwell, the Warden's seat (double ring, corner towers) ----
    ...wallRing(2, 8, 4, 35, 29, [[8, 4], [35, 4], [8, 29], [35, 29], [22, 29], [35, 16]]),
    { def: 'guardTower', player: 2, x: 8, y: 4 },
    { def: 'guardTower', player: 2, x: 35, y: 4 },
    { def: 'guardTower', player: 2, x: 8, y: 29 },
    { def: 'guardTower', player: 2, x: 35, y: 29 },
    { def: 'gate', player: 2, x: 22, y: 29, ref: 'bothwell_gate_s' },
    { def: 'gate', player: 2, x: 35, y: 16, ref: 'bothwell_gate_e' },
    // inner ring, breached opposite each gate so the fort is traversable once a gate falls
    ...wallRing(2, 11, 7, 32, 26, [[21, 26], [22, 26], [23, 26], [32, 15], [32, 16], [32, 17]]),
    { def: 'castle', player: 2, x: 24, y: 18, ref: 'bothwell_keep' },
    { def: 'townCenter', player: 2, x: 12, y: 8 },
    { def: 'siegeWorkshop', player: 2, x: 17, y: 8 },
    { def: 'barracks', player: 2, x: 22, y: 8 },
    { def: 'archeryRange', player: 2, x: 27, y: 8 },
    { def: 'monastery', player: 2, x: 12, y: 13 },
    // flavor presence, not a kill target — hp override keeps him a voice
    { def: 'heroValence', player: 2, x: 14, y: 20, ref: 'valence', hp: 3000 },
    ...unitGroup('longbowman', 2, [
      [16, 17], [18, 17], [20, 17], [16, 19], [18, 19], [20, 19], [17, 22], [19, 22],
    ]),
    ...unitGroup('knight', 2, [[22, 23], [24, 23], [26, 23], [28, 22], [29, 22], [30, 22]]),
    ...unitGroup('monk', 2, [[13, 17], [13, 18]]),
    // ---- Player 3: Segrave's field camp (N-center) ----
    { def: 'townCenter', player: 3, x: 86, y: 20 },
    { def: 'stable', player: 3, x: 82, y: 26 },
    { def: 'barracks', player: 3, x: 92, y: 26 },
    { def: 'archeryRange', player: 3, x: 92, y: 18 },
    ...unitGroup('house', 3, [[81, 17], [84, 17], [97, 17], [96, 22], [96, 25], [81, 30]]),
    ...unitGroup('knight', 3, [[90, 24], [91, 24], [90, 25], [91, 25], [85, 24], [85, 25]]),
    ...unitGroup('manAtArms', 3, [[83, 22], [84, 22], [83, 23], [84, 23], [95, 21], [95, 22]]),
    ...unitGroup('crossbowman', 3, [[90, 17], [91, 17], [90, 18], [91, 18]]),
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 24, y: 18 },
        { kind: 'message', speaker: 'Narrator', text: "Bothwell on the Clyde, seat of Edward's Warden. Official ink says Scotland is at peace. The Forest says otherwise." },
        { kind: 'panCamera', x: 110, y: 108 },
        { kind: 'message', speaker: 'Fraser', text: 'Every unpardoned man in the south is here, Will. Feed them, arm them — and give them somewhere to point.' },
        { kind: 'objectiveAdd', id: 'obj-war-camp', text: 'Raise the war-camp: 15 villagers, Lumber Camp, Mining Camp, Mill + 6 Farms' },
        { kind: 'objectiveAdd', id: 'obj-imperial', text: 'Advance to the Imperial Age' },
        { kind: 'armTrigger', triggerId: 't05-sweep-loop' },
      ],
    },
    {
      id: 't02-war-camp',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['villager'], atLeast: 15 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['lumberCamp'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['miningCamp'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['mill'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['farm'], atLeast: 6 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-war-camp' },
        { kind: 'message', speaker: 'Wallace', text: "Smoke rises where I say it rises now. Good. Let the Warden's clerks write THAT down." },
      ],
    },
    {
      id: 't03-castle-age-gate', // player starts in castle age; this fires at once
      conditions: [{ kind: 'ageReached', player: 1, age: 'castle' }],
      effects: [
        { kind: 'objectiveAdd', id: 'obj-happrew', text: 'Destroy the watch-fort keep at Happrew' },
        { kind: 'objectiveAdd', id: 'obj-earnside', text: 'Destroy the bridge-tower at Earnside' },
        { kind: 'message', speaker: 'Fraser', text: "Happrew's fort watches the west road; Earnside's tower holds the only bridge. While they stand, Bothwell sleeps easy." },
      ],
    },
    {
      id: 't04-imperial',
      conditions: [{ kind: 'ageReached', player: 1, age: 'imperial' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-imperial' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Narrator', text: 'The Imperial Age. The full arsenal of the medieval world is yours — including the great engines.' },
        { kind: 'objectiveAdd', id: 'obj-castle-treb', text: 'Build a Castle and field two Trebuchets' },
      ],
    },
    {
      id: 't05-sweep-loop', // Segrave's pressure, all game
      armed: false, // armed by t01; re-arms itself every sweep
      loop: true,
      conditions: [{ kind: 'timerSeconds', seconds: 420 }],
      effects: [
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 100, y: 100, w: 26, h: 24 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Narrator', text: "Segrave's riders sweep the Forest roads again." },
      ],
    },
    {
      id: 't06-happrew-approach',
      conditions: [
        { kind: 'entitiesInArea', player: 1, area: { x: 48, y: 72, w: 24, h: 20 }, atLeast: 1 },
      ],
      effects: [
        { kind: 'revealArea', player: 1, area: { x: 52, y: 76, w: 16, h: 14 } },
        { kind: 'message', speaker: 'Fraser', text: "They keep our people penned in that fort — taken in the sweeps. Break the wall and they're ours again." },
        { kind: 'objectiveAdd', id: 'obj-captives', text: '(Optional) Free the captives held at Happrew' },
        { kind: 'armTrigger', triggerId: 't08b-captives-lost' },
      ],
    },
    {
      id: 't07-happrew-falls',
      conditions: [{ kind: 'refDestroyed', ref: 'happrew_keep' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-happrew' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Narrator', text: 'The watch-fort burns. The west road belongs to the Forest now.' },
        { kind: 'aiProfile', player: 3, profile: 'aggressive' },
        // idempotent (§1) — covers a long-range trebuchet kill where t06 never fired
        { kind: 'objectiveAdd', id: 'obj-captives', text: '(Optional) Free the captives held at Happrew' },
        { kind: 'armTrigger', triggerId: 't08-captives-check' },
        { kind: 'armTrigger', triggerId: 't08b-captives-lost' },
      ],
    },
    {
      id: 't08-captives-check',
      armed: false, // armed by t07 — the fort must fall first
      conditions: [
        { kind: 'entitiesInArea', player: 1, area: { x: 52, y: 76, w: 16, h: 14 }, atLeast: 1 },
        // at least one captive still stands in the pen — no rescue of the dead
        { kind: 'entitiesInArea', player: 0, defIds: ['villager', 'highlandRaider'], area: { x: 52, y: 76, w: 16, h: 14 }, atLeast: 1 },
      ],
      effects: [
        // dead refs are skipped; survivors change hands
        { kind: 'changeOwner', refs: ['captive1', 'captive2', 'captive3', 'captive4', 'captive5'], toPlayer: 1 },
        { kind: 'objectiveComplete', id: 'obj-captives' },
        { kind: 'message', speaker: 'Wallace', text: "On your feet — you're Scotland's again. There's work." },
      ],
    },
    {
      id: 't08b-captives-lost',
      armed: false, // armed with obj-captives; resolves it honestly
      conditions: [
        { kind: 'refsDestroyed', refs: ['captive1', 'captive2', 'captive3', 'captive4', 'captive5'], all: true },
      ],
      effects: [
        // latched (§1): no-op if the rescue already resolved it
        { kind: 'objectiveFail', id: 'obj-captives' },
        { kind: 'message', speaker: 'Fraser', text: "The pen at Happrew holds only the dead. Add it to the Warden's account." },
      ],
    },
    {
      id: 't09-earnside-falls',
      conditions: [{ kind: 'refDestroyed', ref: 'earnside_tower' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-earnside' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Fraser', text: "The bridge is ours. Across that water sits the Warden — and every stone of Bothwell says he isn't expecting company." },
      ],
    },
    {
      id: 't10-treb-ready',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['castle'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['trebuchet'], atLeast: 2 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-castle-treb' },
        { kind: 'message', speaker: 'Narrator', text: 'Trebuchets: pack them to move, unpack them to fire. Nothing built of stone argues with them for long.' },
      ],
    },
    {
      id: 't11-bothwell-gate',
      conditions: [
        { kind: 'objectiveComplete', objectiveId: 'obj-happrew' },
        { kind: 'objectiveComplete', objectiveId: 'obj-earnside' },
      ],
      effects: [
        { kind: 'objectiveAdd', id: 'obj-bothwell', text: "Breach Bothwell — destroy the Warden's keep" },
        { kind: 'revealArea', player: 1, area: { x: 8, y: 4, w: 28, h: 26 } },
        { kind: 'panCamera', x: 24, y: 18 },
        { kind: 'message', speaker: 'Valence', text: 'So the brigand of the Forest has engines now. Send to Segrave: I want that camp ash by Sunday.' },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 100, y: 100, w: 26, h: 24 } },
      ],
    },
    {
      id: 't12-menteith', // the shadow of the betrayal
      conditions: [{ kind: 'timerSeconds', seconds: 1500 }], // ~25 min in
      effects: [
        { kind: 'message', speaker: 'Menteith', text: 'Wallace. Old friend. Edward forgets no one — but he can be MADE to forget, for men wise enough to help him remember others. Think on it.' },
        { kind: 'message', speaker: 'Wallace', text: 'Tell Sir John Menteith I know exactly what my name is worth in London. And that I keep it anyway.' },
      ],
    },
    {
      id: 't13-victory',
      conditions: [{ kind: 'refDestroyed', ref: 'bothwell_keep' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-bothwell' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'panCamera', x: 24, y: 18 },
        { kind: 'message', speaker: 'Narrator', text: "The Warden's keep falls, and the sound carries. In a hundred pardoned halls, men who signed Edward's rolls look up from their wine and remember they are Scots." },
        { kind: 'message', speaker: 'Narrator', text: 'History now asks its price. In August 1305, at Robroyston, William Wallace is taken in his sleep — sold to Edward by Sir John Menteith, a Scottish knight. In Westminster Hall they crown him with laurel and call him traitor. His answer enters legend: he could not betray a king who was never his.' },
        { kind: 'message', speaker: 'Narrator', text: "They give him a traitor's death at Smithfield and post his quartered body to four towns as a warning. As a warning, it fails. Within the year, Robert Bruce takes the crown at Scone — and the road from Lanark runs on, past Wallace, to Bannockburn and a free Scotland." },
        { kind: 'message', speaker: 'Narrator', text: 'The man could be killed. The rising could not.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 't14-defeat-wallace',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen — and this time there is no forest deep enough.' },
      ],
    },
    {
      id: 't15-defeat-camp',
      conditions: [{ kind: 'ownedAtMost', player: 1, defIds: ['townCenter', 'villager'], atMost: 0 }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'The war-camp is ash. The last rising gutters out in the Forest.' },
      ],
    },
    {
      id: 't16-fraser-falls', // lament, not failure — history gives Fraser a longer, stranger road
      conditions: [{ kind: 'refDestroyed', ref: 'fraser' }],
      effects: [
        { kind: 'message', speaker: 'Wallace', text: 'Carry Sir Simon back. When every pardoned sword in Scotland was sheathed, his was out — whatever peace they write for him after, the Forest remembers whose side he held.' },
      ],
    },
  ],
  startCamera: { x: 110, y: 108 },
  // no maxAge — the Imperial Age is the point
};
