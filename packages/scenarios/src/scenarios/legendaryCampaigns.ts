// Six complete historical campaigns for the non-Scottish civilizations. The terrain
// and encounter grammar is deliberately shared: history/story/objectives are authored
// per chapter, while one validated factory supplies readable battlefields, safe river
// crossings, armies, bases, and trigger wiring. Tactical scale and dialogue are
// dramatized; dates, participants, broad outcomes, and campaign sequence follow the
// established historical chronology described in each briefing.

import type {
  CampaignDef, CastMember, ChapterDifficulty, DifficultyRating, ScenarioDef,
  ScenarioEntity, ScenarioMap, StoryPage, TriggerDef,
} from '../schema';
import { curveTiles } from './authoring';

type MissionKind = 'journey' | 'retreat' | 'battle' | 'siege' | 'defend' | 'lastStand';
type Climate = 'temperate' | 'northern' | 'steppe' | 'mediterranean' | 'desert';

interface ChapterSource {
  id: string;
  title: string;
  act: string;
  date: string;
  location: string;
  kind: MissionKind;
  history: string;
  objective: string;
  opening: string;
  turningPoint: string;
  ending: string;
  hints?: string[];
  /**
   * What is LOST if the chapter fails — not what is happening. Shown on the
   * briefing and held on the loading screen, so it is the last thing read
   * before the map appears.
   */
  stakes: string;
  /**
   * Story spoken while the chapter is being played. Without these a mission
   * says its opening line, one line at 35 seconds, and nothing else until it
   * is won. Every entry is a banner and touches no game state, so the timings
   * are free to sit wherever the story wants them.
   */
  beats: Array<{ at: number; speaker: string; text: string }>;
  /** Heading of the page shown when the chapter is won. */
  aftermathTitle: string;
  /** Overrides the rating the mission kind implies (see MISSION_DIFFICULTY). */
  difficulty?: ChapterDifficulty;
}

interface CampaignSource {
  id: string;
  title: string;
  description: string;
  civ: string;
  enemyCiv: string;
  hero: string;
  climate: Climate;
  imageAlt: string;
  acts: Array<{ id: string; title: string; years: string }>;
  /**
   * The people the whole campaign turns on, shown on every chapter briefing so
   * a name in the dialogue always has a face attached to it.
   */
  cast: CastMember[];
  /** Where these chapters compress, dramatize, or guess past the record. */
  historyNote: string;
  prologue: Omit<StoryPage, 'image' | 'imageAlt'>;
  epilogue: Omit<StoryPage, 'image' | 'imageAlt'>;
  chapters: ChapterSource[];
}

/**
 * Difficulty follows the mission kind, because that is what actually varies
 * across these chapters: the map factory, the age, and the army sizes are
 * shared, so a siege is a siege whichever campaign it belongs to. A chapter
 * that departs from its kind's shape overrides the rating itself.
 */
const MISSION_DIFFICULTY: Record<MissionKind, ChapterDifficulty> = {
  journey: {
    rating: 2,
    note: 'Won by arriving rather than by conquering; no enemy host bars the road.',
  },
  retreat: {
    rating: 3,
    note: 'A fighting withdrawal: the protagonist has to reach the far ground alive, and pursuit does not stop.',
  },
  battle: {
    rating: 4,
    note: 'A stand-up field battle against a full historical host with no economy behind you.',
  },
  siege: {
    rating: 3,
    note: 'A prepared stronghold with towers covering the approach; siege engines need screening the whole way in.',
  },
  defend: {
    rating: 4,
    note: 'Successive assaults on a base you must keep intact while replacing losses from it.',
  },
  lastStand: {
    rating: 5,
    note: 'Deliberately unwinnable in the ordinary sense: the host is overwhelming and the chapter is about how you lose.',
  },
};

/** The consequence half of a chapter's history, used as the aftermath's second beat. */
const consequenceParagraph = (history: string): string => {
  const paragraphs = history.split('\n\n');
  return paragraphs[paragraphs.length - 1];
};

const WIDTH = 72;
const HEIGHT = 72;
const PLAYER_AREA = { x: 6, y: 48, w: 24, h: 20 };
const ENEMY_AREA = { x: 43, y: 5, w: 24, h: 25 };
const GOAL_AREA = { x: 52, y: 8, w: 15, h: 17 };

const climateBase: Record<Climate, string> = {
  temperate: '.', northern: 'n', steppe: '.', mediterranean: '.', desert: 'a',
};

/** A traversable river battlefield: both halves connect through two broad fords. */
function historicalMap(climate: Climate): ScenarioMap {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(climateBase[climate]));

  // Impassable cliff rim prevents edge-pathing; sparse forest gives the map shape.
  for (let x = 0; x < WIDTH; x++) {
    grid[0][x] = 'c'; grid[HEIGHT - 1][x] = 'c';
  }
  for (let y = 0; y < HEIGHT; y++) {
    grid[y][0] = 'c'; grid[y][WIDTH - 1] = 'c';
  }
  for (let x = 3; x < WIDTH - 3; x += 4) {
    grid[3][x] = 'T'; grid[HEIGHT - 4][x + (x % 3 === 0 ? 1 : 0)] = 'T';
  }

  // Three-tile river with generous crossings at the army route and southern flank.
  for (let y = 3; y < HEIGHT - 3; y++) {
    for (let x = 34; x <= 36; x++) grid[y][x] = 'w';
  }
  for (const [y0, y1] of [[30, 34], [51, 55]] as const) {
    for (let y = y0; y <= y1; y++) for (let x = 33; x <= 37; x++) grid[y][x] = 's';
  }

  // The route through the river is water the whole way: the southern ford, a
  // shallow lane up the middle of the channel, and the northern crossing back
  // onto the east bank. These tiles used to be painted as road, which put dry
  // ground inside the river and hid where the map is actually crossable; they
  // carry exactly the same traffic as shallows, and now they look like it.
  for (let y = 25; y <= 54; y++) grid[y][35] = 's';
  for (let x = 35; x <= 37; x++) grid[25][x] = 's';

  // The road from the player's camp to the goal, laid on a curve: it wanders up
  // the west bank, wades the southern ford, and swings north on the east bank.
  // Nothing is painted on water, so the crossing stays shallows the player can
  // see through and the map's passability is exactly what it was when this road
  // ran in straight lines with right-angle corners.
  for (const [x, y] of curveTiles([
    [12, 57], [19, 56], [25, 54], [30, 53], [35, 53], [40, 52],
    [43, 47], [44, 41], [43, 35], [46, 29], [51, 24], [55, 19], [58, 15],
  ])) {
    if (y < 0 || y >= HEIGHT || x < 0 || x >= WIDTH) continue;
    if (grid[y][x] === 'w' || grid[y][x] === 's') continue;
    grid[y][x] = 'r';
  }

  // Gatherable pockets remain well away from the authored building footprints.
  for (const [x, y, token] of [
    [7, 39, 'G'], [8, 39, 'G'], [9, 39, 'G'],
    [24, 64, 'S'], [25, 64, 'S'], [26, 64, 'S'],
    [16, 45, 'B'], [17, 45, 'B'], [18, 45, 'B'],
    [66, 40, 'G'], [67, 40, 'G'], [62, 34, 'S'], [63, 34, 'S'],
  ] as Array<[number, number, string]>) grid[y][x] = token;

  return {
    width: WIDTH,
    height: HEIGHT,
    legend: {
      '.': { terrain: 'grass' },
      n: { terrain: 'snow' },
      a: { terrain: 'sand' },
      d: { terrain: 'dirt' },
      r: { terrain: 'road' },
      w: { terrain: 'water' },
      s: { terrain: 'shallows' },
      c: { terrain: 'cliff' },
      T: { terrain: climate === 'northern' ? 'snow' : 'grass', object: 'tree' },
      G: { terrain: climate === 'desert' ? 'sand' : 'grass', object: 'gold' },
      S: { terrain: climate === 'desert' ? 'sand' : 'grass', object: 'stone' },
      B: { terrain: climate === 'desert' ? 'sand' : 'grass', object: 'berries' },
    },
    rows: grid.map((row) => row.join('')),
  };
}

const uniqueUnit: Record<string, string> = {
  scots: 'highlandRaider', english: 'longbowman', norse: 'housecarl', french: 'chevalier',
  mongols: 'mangudai', byzantines: 'cataphract', saracens: 'mamluk',
};

const eliteUniqueUnit: Record<string, string> = {
  scots: 'eliteHighlandRaider', english: 'eliteLongbowman', norse: 'eliteHousecarl',
  french: 'eliteChevalier', mongols: 'eliteMangudai', byzantines: 'eliteCataphract',
  saracens: 'eliteMamluk',
};

const armyLine = (
  def: string,
  player: number,
  startX: number,
  startY: number,
  count: number,
  refPrefix?: string,
): ScenarioEntity[] => Array.from({ length: count }, (_, index) => ({
  def,
  player,
  x: startX + (index % 6),
  y: startY + Math.floor(index / 6),
  ...(refPrefix ? { ref: `${refPrefix}-${index + 1}` } : {}),
}));

const humanArmy = (source: CampaignSource, kind: MissionKind): ScenarioEntity[] => [
  { def: source.hero, player: 1, x: 12, y: 57, ref: 'protagonist' },
  // Legendary chapters begin in the Imperial Age, so the protagonist's compact
  // company uses the upgraded lines a player would field at that point. The old
  // Castle-Age mix was erased by several 26-unit opposition matchups.
  ...armyLine(eliteUniqueUnit[source.civ], 1, 14, 57, 12),
  ...armyLine(
    source.civ === 'mongols' ? 'lightCavalry' : 'pikeman',
    1,
    13,
    60,
    source.civ === 'english' ? 16 : 10,
  ),
  ...armyLine(source.civ === 'english' ? 'eliteLongbowman' : 'arbalester', 1, 14, 62, 10),
  ...(['siege', 'defend'].includes(kind) ? armyLine('trebuchet', 1, 10, 61, 2) : []),
];

const enemyArmy = (source: CampaignSource): ScenarioEntity[] => [
  // Ten French heavy cavalry overwhelm even an upgraded longbow formation before
  // its pikeman screen can trade. Retain the shock-cavalry identity without making
  // Henry's field battles a forced hero sacrifice.
  ...armyLine(uniqueUnit[source.enemyCiv], 2, 42, 31, source.enemyCiv === 'french' ? 4 : 10, 'enemy'),
  ...armyLine('pikeman', 2, 43, 34, 6, 'enemy-pike'),
  ...armyLine(source.enemyCiv === 'english' ? 'longbowman' : 'crossbowman', 2, 44, 36, 6, 'enemy-bow'),
  ...armyLine('knight', 2, 43, 38, 4, 'enemy-horse'),
];

const enemyRefsFor = (source: CampaignSource) => [
  ...Array.from({ length: source.enemyCiv === 'french' ? 4 : 10 }, (_, i) => `enemy-${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `enemy-pike-${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `enemy-bow-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `enemy-horse-${i + 1}`),
];

const humanBase = (source: CampaignSource): ScenarioEntity[] => [
  { def: 'townCenter', player: 1, x: 8, y: 49, ref: 'home' },
  { def: 'castle', player: 1, x: 18, y: 49, ref: 'stronghold' },
  { def: 'barracks', player: 1, x: 7, y: 64 },
  { def: 'archeryRange', player: 1, x: 12, y: 64 },
  { def: 'stable', player: 1, x: 19, y: 64 },
  ...armyLine('villager', 1, 9, 54, 6),
  ...humanArmy(source, 'defend'),
];

const enemyFort = (source: CampaignSource): ScenarioEntity[] => [
  { def: 'castle', player: 2, x: 54, y: 9, ref: 'campaign-target' },
  { def: 'townCenter', player: 2, x: 47, y: 17 },
  { def: 'barracks', player: 2, x: 62, y: 18 },
  { def: 'guardTower', player: 2, x: 47, y: 9 },
  { def: 'guardTower', player: 2, x: 64, y: 9 },
  ...armyLine(uniqueUnit[source.enemyCiv], 2, 48, 23, 8, 'garrison'),
];

function triggersFor(source: CampaignSource, chapter: ChapterSource): TriggerDef[] {
  const objectiveId = 'primary';
  const intro: TriggerDef = {
    id: 'intro',
    conditions: [{ kind: 'always' }],
    effects: [
      { kind: 'message', speaker: 'Chronicle', text: chapter.opening },
      { kind: 'objectiveAdd', id: objectiveId, text: chapter.objective },
      { kind: 'revealArea', player: 1, area: PLAYER_AREA },
    ],
  };
  const turningPoint: TriggerDef = {
    id: 'turning-point',
    conditions: [{ kind: 'timerSeconds', seconds: chapter.kind === 'journey' ? 20 : 35 }],
    effects: [
      { kind: 'message', speaker: 'Chronicle', text: chapter.turningPoint },
      { kind: 'revealArea', player: 1, area: chapter.kind === 'defend' ? PLAYER_AREA : ENEMY_AREA },
      ...(!['journey', 'defend', 'siege'].includes(chapter.kind)
        ? [{ kind: 'aiAttackNow' as const, player: 2, targetArea: PLAYER_AREA }]
        : []),
    ],
  };

  const beats: TriggerDef[] = chapter.beats.map((beat, index) => ({
    id: `beat-${index + 1}`,
    conditions: [{ kind: 'timerSeconds', seconds: beat.at }],
    effects: [{ kind: 'message', speaker: beat.speaker, text: beat.text }],
  }));

  let victory: TriggerDef;
  switch (chapter.kind) {
    case 'journey':
    case 'retreat':
      victory = {
        id: 'victory',
        conditions: [{
          kind: 'entitiesInArea', player: 1, defIds: [source.hero], area: GOAL_AREA, atLeast: 1,
        }],
        effects: [
          { kind: 'objectiveComplete', id: objectiveId },
          { kind: 'playSting', sting: 'victory' },
          { kind: 'message', speaker: 'Chronicle', text: chapter.ending },
          { kind: 'victory' },
        ],
      };
      break;
    case 'battle':
      victory = {
        id: 'victory', conditions: [{ kind: 'refsDestroyed', refs: enemyRefsFor(source), all: true }], effects: [
          { kind: 'objectiveComplete', id: objectiveId },
          { kind: 'playSting', sting: 'victory' },
          { kind: 'message', speaker: 'Chronicle', text: chapter.ending },
          { kind: 'victory' },
        ],
      };
      break;
    case 'siege':
      victory = {
        id: 'victory', conditions: [{ kind: 'refDestroyed', ref: 'campaign-target' }], effects: [
          { kind: 'objectiveComplete', id: objectiveId },
          { kind: 'playSting', sting: 'victory' },
          { kind: 'message', speaker: 'Chronicle', text: chapter.ending },
          { kind: 'victory' },
        ],
      };
      break;
    case 'defend':
      victory = {
        id: 'victory', conditions: [{ kind: 'timerSeconds', seconds: 210 }], effects: [
          { kind: 'objectiveComplete', id: objectiveId },
          { kind: 'playSting', sting: 'victory' },
          { kind: 'message', speaker: 'Chronicle', text: chapter.ending },
          { kind: 'victory' },
        ],
      };
      break;
    case 'lastStand':
      victory = {
        id: 'victory', conditions: [
          { kind: 'refDestroyed', ref: 'protagonist' },
          { kind: 'triggerFired', triggerId: 'turning-point' },
        ], effects: [
          { kind: 'objectiveComplete', id: objectiveId },
          { kind: 'playSting', sting: 'victory' },
          { kind: 'message', speaker: 'Chronicle', text: chapter.ending },
          { kind: 'victory' },
        ],
      };
      break;
  }

  const out = [intro, turningPoint, ...beats];
  if (chapter.kind === 'defend') {
    out.push({
      id: 'first-assault', conditions: [{ kind: 'timerSeconds', seconds: 12 }], effects: [
        { kind: 'playSting', sting: 'horn' },
        { kind: 'aiAttackNow', player: 2, targetArea: PLAYER_AREA },
      ],
    });
    out.push({
      id: 'reinforcements', conditions: [{ kind: 'timerSeconds', seconds: 100 }], effects: [
        { kind: 'spawn', entities: [
          ...armyLine(uniqueUnit[source.enemyCiv], 2, 55, 6, 10),
          ...armyLine('knight', 2, 56, 8, 6),
        ] },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'aiAttackNow', player: 2, targetArea: PLAYER_AREA },
      ],
    });
  }
  if (chapter.kind === 'lastStand') {
    out.push({
      id: 'overwhelming-host', conditions: [{ kind: 'timerSeconds', seconds: 50 }], effects: [
        { kind: 'spawn', entities: [
          ...armyLine(uniqueUnit[source.enemyCiv], 2, 54, 6, 18),
          ...armyLine('knight', 2, 55, 10, 12),
        ] },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'aiAttackNow', player: 2, targetArea: PLAYER_AREA },
      ],
    });
  }
  out.push(victory);
  if (chapter.kind !== 'lastStand') {
    out.push({
      id: 'hero-falls', conditions: [{ kind: 'refDestroyed', ref: 'protagonist' }], effects: [
        { kind: 'defeat', reason: `${source.title.split(' — ')[0]} has fallen before the chapter is complete.` },
      ],
    });
  }
  return out;
}

function chapterEntities(source: CampaignSource, chapter: ChapterSource): ScenarioEntity[] {
  switch (chapter.kind) {
    case 'journey': return humanArmy(source, chapter.kind);
    case 'retreat': return [...humanArmy(source, chapter.kind), ...enemyArmy(source)];
    case 'battle': return [...humanArmy(source, chapter.kind), ...enemyArmy(source)];
    case 'lastStand': return [...humanArmy(source, chapter.kind), ...enemyArmy(source)];
    case 'siege': return [...humanArmy(source, chapter.kind), ...enemyFort(source)];
    case 'defend': return [...humanBase(source), ...enemyArmy(source)];
  }
}

function makeChapter(source: CampaignSource, chapter: ChapterSource, index: number): ScenarioDef {
  return {
    id: chapter.id,
    campaign: source.id,
    index,
    title: chapter.title,
    chapter: {
      act: chapter.act,
      number: index + 1,
      date: chapter.date,
      location: chapter.location,
      estimatedMinutes: chapter.kind === 'defend' ? '10–15 min' : '8–12 min',
      image: `/campaign/${source.id}/cover.webp`,
      imageAlt: source.imageAlt,
      difficulty: chapter.difficulty ?? MISSION_DIFFICULTY[chapter.kind],
    },
    story: {
      stakes: chapter.stakes,
      cast: source.cast,
      aftermath: {
        title: chapter.aftermathTitle,
        paragraphs: [chapter.ending, consequenceParagraph(chapter.history)],
      },
      historyNote: source.historyNote,
    },
    briefing: {
      history: chapter.history,
      objectives: [chapter.objective],
      hints: chapter.hints ?? [
        'Keep the named protagonist alive unless the chapter is explicitly a last stand.',
        chapter.kind === 'siege'
          ? 'Screen the siege engines with infantry; the stronghold is the objective.'
          : 'Use the terrain and keep ranged troops behind a protected front line.',
      ],
    },
    players: [
      {
        name: source.title.split(' — ')[0], civ: source.civ, team: 1, isHuman: true,
        color: 0, age: 'imperial', resources: { food: 800, wood: 700, gold: 600, stone: 300 },
        popCap: 120,
      },
      {
        name: 'Historical Opposition', civ: source.enemyCiv, team: 2, isHuman: false,
        color: 1, age: 'imperial', resources: { food: 1000, wood: 1000, gold: 1000, stone: 500 },
        // The aggressive controller stages and reissues the historical opposition
        // as a formation. A passive controller followed by aiAttackNow instead
        // commits the entire host in a single hero-seeking pulse.
        aiProfile: 'aggressive', popCap: 140,
      },
    ],
    map: historicalMap(source.climate),
    entities: chapterEntities(source, chapter),
    triggers: triggersFor(source, chapter),
    startCamera: { x: 16, y: 58 },
    maxAge: 'imperial',
  };
}

function makeCampaign(source: CampaignSource, scenarios: ScenarioDef[]): CampaignDef {
  return {
    id: source.id,
    title: source.title,
    description: `${source.description} Six playable chapters follow the documented chronology; tactical layouts and spoken narration are dramatized.`,
    cover: `/campaign/${source.id}/cover.webp`,
    coverAlt: source.imageAlt,
    prologue: {
      ...source.prologue,
      image: `/campaign/${source.id}/cover.webp`,
      imageAlt: source.imageAlt,
    },
    epilogue: {
      ...source.epilogue,
      image: `/campaign/${source.id}/cover.webp`,
      imageAlt: source.imageAlt,
    },
    scenarioIds: scenarios.map((scenario) => scenario.id),
    acts: source.acts.map((act, index) => ({
      ...act,
      scenarioIds: scenarios.slice(index * 2, index * 2 + 2).map((scenario) => scenario.id),
    })),
  };
}

// ---------------------------------------------------------------- Henry V / English

const henrySource: CampaignSource = {
  id: 'henry-v',
  title: 'Henry V — Crown Across the Sea',
  description: 'Lead the English king from the 1415 landing in Normandy through Agincourt, the conquest of Rouen, and the road to the Treaty of Troyes.',
  civ: 'english', enemyCiv: 'french', hero: 'heroHenryV', climate: 'temperate',
  imageAlt: 'Henry V and English longbowmen stand in a rain-darkened French field before battle.',
  acts: [
    { id: 'invasion', title: 'Act I — The 1415 Expedition', years: '1415' },
    { id: 'conquest', title: 'Act II — Normandy Reclaimed', years: '1417–1419' },
    { id: 'two-crowns', title: 'Act III — Heir to France', years: '1419–1422' },
  ],
  cast: [
    {
      name: 'Henry V',
      role: 'King of England',
      note: 'Took the throne at 26 with a rebel’s reputation to live down and an arrow scar through his face from Shrewsbury. Devout, exacting, and unusually good at logistics.',
    },
    {
      name: 'Charles VI',
      role: 'King of France',
      note: 'Suffers recurring episodes of madness in which he does not know his own name. France is governed, and fought over, in his absence.',
    },
    {
      name: 'Armagnacs and Burgundians',
      role: 'France at war with itself',
      note: 'Two royal factions murdering each other’s leaders. Henry’s campaigns succeed largely because France cannot unite against him.',
    },
  ],
  historyNote: 'Dates, participants and outcomes follow the record; army sizes, terrain and the tactical shape of each chapter are compressed for play. Chronicle numbers for Agincourt in particular vary wildly and are not reliable.',
  prologue: {
    kicker: 'England and France, 1415',
    title: 'A Claim Worth an Army',
    paragraphs: [
      'The English claim to the French crown was seventy-eight years old and mostly theoretical. Edward III had asserted it, won famous battles, and left his successors a war they could not finish and could not drop. By 1415 England held little more than Calais and a strip of Gascony.',
      'Henry V had reasons to revive it. His father had taken the throne by deposing a king, and the Lancastrian line needed legitimacy that only spectacular success could supply. France, meanwhile, was tearing itself apart: a king who went mad for months at a time, and two noble factions — Armagnac and Burgundian — assassinating one another in the streets of Paris.',
      'Henry demanded Normandy, Aquitaine, an enormous dowry and the French princess. When the negotiations failed, he sailed with an army, a siege train, and a war that would define both kingdoms for a generation.',
    ],
    quote: {
      text: 'He was a prince of great justice, and kept the law without favour.',
      source: 'The First English Life of King Henry the Fifth',
    },
    cta: 'Sail for Normandy',
  },
  epilogue: {
    kicker: '1422–1453',
    title: 'The Crown He Did Not Live to Wear',
    paragraphs: [
      'Henry V died at Vincennes on 31 August 1422, aged 35, of dysentery contracted on campaign. Charles VI outlived him by seven weeks. By the Treaty of Troyes the two crowns passed to Henry’s son — nine months old, and now nominally king of England and France.',
      'Nothing held. The dauphin Henry had disinherited fought on as Charles VII, and in 1429 a peasant girl from Domrémy broke the siege of Orléans and had him crowned at Reims. English France drained away over the next two decades; by 1453 only Calais remained.',
      'What Henry actually left was a conquest that required his own attention to survive, an infant heir who grew into an unstable king, and a dynastic wound that opened thirty years later as the Wars of the Roses.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'henry-01-harfleur', title: 'The Mouth of the Seine', act: 'Act I — The 1415 Expedition',
      date: 'August–September 1415', location: 'Harfleur, Normandy', kind: 'siege',
      aftermathTitle: 'The port, and the price',
      stakes: 'The expedition has one port and one campaigning season. If Harfleur holds until dysentery finishes the army, Henry sails home with nothing and the French claim dies as a piece of paper.',
      beats: [
        { at: 75, speaker: 'Henry', text: 'No man lays a hand on a church or a woman. We are here as the rightful king of this country, not as raiders in it.' },
        { at: 160, speaker: 'A captain', text: 'Sire, the camp sickness is worse than the walls. We are burying more men than the guns are killing.' },
      ],
      history: 'Henry V landed near Harfleur in August 1415 with an army transported across the Channel. The fortified port guarded the Seine and had to be taken before the English could operate safely in Normandy. Its defenders resisted for more than a month while disease spread through the besieging camp.\n\nHarfleur surrendered on 22 September. Henry left a garrison behind, sent many sick men home, and chose to march the diminished army to English-held Calais—a decision that invited the French crown to intercept him.',
      objective: 'Break Harfleur’s stronghold and secure the port',
      opening: 'August 1415. The English fleet has emptied its army beneath Harfleur’s walls.',
      turningPoint: 'The siege lengthens and sickness thins the camp. The breach must be forced before the expedition dies in place.',
      ending: 'Harfleur capitulates. Henry leaves a garrison and marches north with an army already reduced by disease.',
    },
    {
      id: 'henry-02-somme', title: 'The Road to Calais', act: 'Act I — The 1415 Expedition',
      date: 'October 1415', location: 'The Somme, Picardy', kind: 'retreat',
      aftermathTitle: 'Across the Somme',
      stakes: 'A king caught in open country with a starving column does not negotiate — he is captured or killed, and England is left with a boy heir and a lost war.',
      beats: [
        { at: 70, speaker: 'Henry', text: 'Calais is eight days off if the ford holds. Any man who steals from these villages hangs — I will not have this march remembered for that.' },
        { at: 155, speaker: 'A scout', text: 'They have broken the crossings ahead of us and they are shadowing us on the far bank. They mean to make us march until we cannot fight.' },
      ],
      history: 'Henry’s column moved toward Calais while French forces shadowed it and blocked the customary crossing of the Somme. Food ran short, rain soaked the roads, and the English were forced inland to find an unguarded ford.\n\nAfter crossing near Béthencourt and Voyennes, the army turned northwest. A much larger French host now stood between it and Calais. This chapter compresses the hard march into a race for the northern road.',
      objective: 'Bring Henry through the ford and onto the road to Calais',
      opening: 'The direct crossing is held. The army must follow the Somme inland before French forces close the road.',
      turningPoint: 'Scouts have found a ford, but the French vanguard is moving. The column cannot stop now.',
      ending: 'The Somme is crossed. Ahead, near the village of Agincourt, banners fill the northern road.',
    },
    {
      id: 'henry-03-agincourt', title: 'Saint Crispin’s Day', act: 'Act II — Normandy Reclaimed',
      date: '25 October 1415', location: 'Agincourt, Picardy', kind: 'battle',
      aftermathTitle: 'Saint Crispin’s Day, evening',
      stakes: 'Outnumbered, ill, and blocked from Calais. Lose here and the English army ceases to exist, along with every claim it was carrying.',
      beats: [
        { at: 70, speaker: 'Henry', text: 'The ground is narrow and the mud is ours as much as theirs. Stakes in, archers on the flanks, and nobody advances until they are committed.' },
        { at: 155, speaker: 'Sir Thomas Erpingham', text: 'They come on foot, in armour, uphill through ploughed mud. They will be exhausted before they reach us — if the line holds its nerve.' },
      ],
      history: 'The English army faced a larger French force in a narrow, recently ploughed field between woods. Henry placed men-at-arms in the centre and longbowmen on the flanks behind sharpened stakes. Heavy rain had turned the ground to mud.\n\nFrench men-at-arms advancing through the constricted field became compressed and exhausted under arrow fire. The English victory was decisive, though modern estimates of army sizes and losses vary considerably.',
      objective: 'Break the French battle line at Agincourt',
      opening: 'Saint Crispin’s Day. The road to Calais is blocked, and the wet field leaves no clean retreat.',
      turningPoint: 'The French line presses into the narrowing ground. Hold the centre while the longbows work from the flanks.',
      ending: 'The French host breaks. Agincourt secures Henry’s escape and transforms his claim into a European fact.',
      hints: ['Longbowmen are the core of this army; keep them behind infantry.', 'Do not chase cavalry into isolation across the river.'],
    },
    {
      id: 'henry-04-normandy', title: 'Normandy Returns', act: 'Act II — Normandy Reclaimed',
      date: '1417–1418', location: 'Caen and Lower Normandy', kind: 'siege',
      aftermathTitle: 'A duchy taken town by town',
      stakes: 'Without Normandy garrisoned and held, the 1415 campaign stays what the French say it was: a raid that got lucky once.',
      beats: [
        { at: 70, speaker: 'Henry', text: 'This time we hold what we take. Garrisons, pay, and courts — a duchy is governed or it is only visited.' },
        { at: 155, speaker: 'A gunner', text: 'The walls come down faster than they did at Harfleur, sire. We have learned the trade since.' },
      ],
      history: 'Henry returned to France in 1417, this time for systematic conquest rather than a march of demonstration. Caen fell in September, followed by a chain of Norman towns and fortresses. Falaise, Cherbourg, and the Cotentin were brought under English control.\n\nThe campaign relied on garrisons, artillery, negotiated surrenders, and relentless sieges. Its success isolated Rouen, the duchy’s capital and the key to the lower Seine.',
      objective: 'Reduce the Norman fortress and open the road to Rouen',
      opening: 'The king has returned with engineers, garrisons, and the means to hold what he takes.',
      turningPoint: 'The outer positions are giving way. Protect the engines and keep pressure on the central fortress.',
      ending: 'Lower Normandy is methodically occupied. Rouen now stands as the great remaining obstacle.',
    },
    {
      id: 'henry-05-rouen', title: 'Rouen’s Long Winter', act: 'Act III — Heir to France',
      date: 'July 1418–January 1419', location: 'Rouen, Normandy', kind: 'siege',
      aftermathTitle: 'The gates of Rouen',
      stakes: 'Rouen is Normandy’s capital and the key to the lower Seine. Leave it unbroken and every town behind it can be retaken the moment the army moves on.',
      beats: [
        { at: 70, speaker: 'Henry', text: 'We do not storm it. A city stormed is a city destroyed, and I want this one whole and paying taxes.' },
        { at: 160, speaker: 'A captain', text: 'They have put the poorest out through the gates to save their stores, and the French will not let them pass. They are in the ditch between us, sire, and they are dying there.' },
      ],
      history: 'Rouen was encircled in July 1418. Rather than storm one of France’s largest cities, Henry tightened a blockade and waited. Hunger became catastrophic inside the walls; people expelled from the city were trapped between the defenses and English lines.\n\nAfter six months, Rouen negotiated surrender and opened its gates in January 1419. The suffering of civilians is an essential part of the history, not a triumphal detail, and the mission represents the military blockade at compressed scale.',
      objective: 'Force Rouen’s military citadel to capitulate',
      opening: 'Rouen is encircled. The capital of Normandy has walls, stores, and too many mouths for a long blockade.',
      turningPoint: 'Winter closes in. The garrison is weakening, but the cost inside the city is terrible.',
      ending: 'Rouen negotiates surrender in January 1419. Normandy’s capital is in English hands.',
    },
    {
      id: 'henry-06-troyes', title: 'Two Crowns', act: 'Act III — Heir to France',
      date: 'May 1420–August 1422', location: 'Troyes and the Île-de-France', kind: 'journey',
      aftermathTitle: 'Two crowns, one heir',
      stakes: 'The treaty is the whole point of eight years of war. If the royal party does not reach Troyes, the crown of France stays a claim on parchment.',
      beats: [
        { at: 70, speaker: 'Henry', text: 'Burgundy opened this road because his father was murdered on a bridge by the dauphin’s men. I am the beneficiary of a grudge, not a miracle.' },
        { at: 155, speaker: 'Chronicle', text: 'The treaty will make Henry regent and heir, disinherit the dauphin, and give him Catherine of Valois. It will not make the dauphin’s supporters agree to any of it.' },
      ],
      history: 'The murder of John the Fearless in 1419 pushed Burgundy toward alliance with Henry. At Troyes in May 1420, Charles VI recognized Henry as regent and heir to France, and Henry married Catherine of Valois. The treaty disinherited the dauphin, whose supporters rejected it.\n\nHenry never wore the French crown. He died of illness at Vincennes on 31 August 1422, only weeks before Charles VI. The crowns passed, in English law, to his infant son Henry VI, and the war continued.',
      objective: 'Escort Henry safely to Troyes and the treaty council',
      opening: 'Burgundian envoys have opened the road to Troyes. This chapter is won by arrival, not conquest.',
      turningPoint: 'The council waits beyond the river. Keep the royal party together and continue to the city.',
      ending: 'The Treaty of Troyes names Henry heir to France. He dies in 1422 before Charles VI, leaving two kingdoms and an unfinished war to an infant son.',
      hints: ['This is a narrative journey; reach the marked northern district with Henry.', 'No enemy host bars the treaty road.'],
    },
  ],
};

// ---------------------------------------------------------- Harald Hardrada / Vikings

const hardradaSource: CampaignSource = {
  id: 'hardrada',
  title: 'Harald Hardrada — The Last Viking',
  description: 'Follow Harald Sigurdsson from a wounded exile at Stiklestad through Rus and Byzantium to the Norwegian crown and the fatal invasion of 1066.',
  civ: 'norse', enemyCiv: 'english', hero: 'heroHardrada', climate: 'northern',
  imageAlt: 'Harald Hardrada leads mail-clad Norse warriors beneath a cold northern sky.',
  acts: [
    { id: 'exile', title: 'Act I — Exile and the Varangian Road', years: '1030–1045' },
    { id: 'king', title: 'Act II — King of Norway', years: '1046–1064' },
    { id: 'england', title: 'Act III — The Last Invasion', years: '1066' },
  ],
  cast: [
    {
      name: 'Harald Sigurdsson',
      role: 'Hardrada, the hard ruler',
      note: 'Fled Norway at fifteen with a wound and no prospects. Came back twenty years later with more gold than any king in the north.',
    },
    {
      name: 'The Varangian Guard',
      role: 'The emperor’s northmen',
      note: 'Byzantium’s axe-bearing household troops, recruited from Scandinavia and Rus. Harald commanded them in Sicily, Anatolia, and the Holy Land.',
    },
    {
      name: 'Harold Godwinson',
      role: 'King of England, 1066',
      note: 'Fights the last chapter of Harald’s life and then marches south to meet William of Normandy nineteen days later.',
    },
  ],
  historyNote: 'Harald’s career is known largely through sagas written a century or more later, which are vivid and not always reliable. Dates and major campaigns are corroborated; individual exploits, especially in Byzantine service, are often legend.',
  prologue: {
    kicker: 'Norway, 1030',
    title: 'The Wounded Boy at Stiklestad',
    paragraphs: [
      'Harald Sigurdsson was fifteen when he fought at Stiklestad in his half-brother’s army. King Olaf died there, the rebellion won, and Harald was carried off the field bleeding, hidden by farmers, and smuggled east over the mountains.',
      'What followed was the most extraordinary apprenticeship of the Viking age. He served the Grand Prince of Kiev, then took the road to Constantinople and joined the Varangian Guard — the Byzantine emperor’s Norse household troops — fighting in Sicily, Anatolia, Bulgaria, and Jerusalem, and shipping his pay north to Kiev for safekeeping.',
      'He came home in 1045 with a fortune, a marriage into the Rus royal house, and the intention of taking the crown he had been driven away from. He was thirty. He would spend the next twenty years fighting for Denmark, and the last year of his life gambling everything on England.',
    ],
    cta: 'Take the eastern road',
  },
  epilogue: {
    kicker: '25 September 1066',
    title: 'Seven Feet of English Ground',
    paragraphs: [
      'Harald Hardrada died at Stamford Bridge with an arrow in his throat, and the Norwegian army that had crossed the sea in some three hundred ships went home in twenty-four. Harold Godwinson had asked what he would give the Norwegian king; the answer was seven feet of English ground, or as much more as he was taller than other men.',
      'Three days later, William of Normandy landed at Pevensey. Harold marched his exhausted army the length of England and lost it, and his life, at Hastings on 14 October.',
      'Historians have called Stamford Bridge the end of the Viking age, which is tidier than the truth but not wrong in spirit. It was the last time a Scandinavian king tried to take an English throne by main force — and it destroyed two kingdoms in three weeks.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'hardrada-01-stiklestad', title: 'The Wounded Exile', act: 'Act I — Exile and the Varangian Road',
      date: '29 July 1030', location: 'Stiklestad, Norway', kind: 'retreat',
      aftermathTitle: 'The road east',
      stakes: 'A fifteen-year-old on the losing side of a Norwegian civil war has no lands, no following, and no protection. Being caught here ends the story before it starts.',
      beats: [
        { at: 70, speaker: 'A farmer of Verdal', text: 'Keep off the roads, boy. Half the men who fought for your brother are being hunted through this valley tonight.' },
        { at: 150, speaker: 'Harald', text: 'Then east. Sweden, then Rus, then wherever men pay for spears. I will come back to Norway when I can buy it.' },
      ],
      history: 'The teenage Harald Sigurdsson fought beside his half-brother King Olaf Haraldsson at Stiklestad. Olaf’s attempt to regain Norway ended in defeat and death. Harald was wounded but escaped the battlefield with help from loyal companions.\n\nHe crossed into Sweden and then travelled east to the court of Yaroslav the Wise in Kievan Rus. Much of the vivid detail comes from later saga tradition, but the exile and eastern service are broadly accepted.',
      objective: 'Get the wounded Harald away from Stiklestad',
      opening: 'Olaf has fallen and the royal line is collapsing. Harald must be taken east before the victors close the roads.',
      turningPoint: 'The pursuers are near. Cross the river and do not turn a retreat into a second lost battle.',
      ending: 'Harald escapes through Sweden to Rus. Norway has cast him out, but his road now runs toward Constantinople.',
    },
    {
      id: 'hardrada-02-varangian', title: 'The Varangian', act: 'Act I — Exile and the Varangian Road',
      date: 'c. 1034–1042', location: 'The Byzantine Mediterranean', kind: 'siege',
      aftermathTitle: 'The emperor’s northmen',
      stakes: 'The Varangian pay and plunder is the fortune that will buy a crown. A man who dies in the emperor’s service dies a rich stranger a long way from Norway.',
      beats: [
        { at: 70, speaker: 'Harald', text: 'The Greeks fight with engineers and account books as much as axes. I am learning both.' },
        { at: 155, speaker: 'Chronicle', text: 'Harald sent his pay north to Kiev year after year, to be kept for him by the Grand Prince. He was assembling a war chest, not a career.' },
      ],
      history: 'After serving Yaroslav, Harald entered Byzantine service and rose among the Varangian Guard. Later Norse sagas credit him with campaigns across the Mediterranean, including Sicily, while Byzantine evidence confirms a distinguished northern commander but leaves some episode-by-episode claims uncertain.\n\nThis mission represents that long mercenary career rather than one securely documented siege. It is the campaign’s most openly composite chapter.',
      objective: 'Take the enemy fortress in Byzantine service',
      opening: 'Far from Norway, the Varangian Guard is ordered against a fortified Mediterranean position.',
      turningPoint: 'Years of exile are forging a commander. Keep the shield wall around the imperial engines.',
      ending: 'Harald leaves Byzantine service with wealth, reputation, and the means to claim a kingdom of his own.',
      hints: ['This chapter is a historical composite based on Harald’s Byzantine service.', 'Housecarls protect siege engines well against archers.'],
    },
    {
      id: 'hardrada-03-return', title: 'Gold for a Crown', act: 'Act II — King of Norway',
      date: '1045–1047', location: 'Norway', kind: 'journey',
      aftermathTitle: 'A crown bought with silver',
      stakes: 'The treasure is the claim. Reach Norway with it intact and Magnus must deal; arrive without it and Harald is one more exile with an opinion about the succession.',
      beats: [
        { at: 70, speaker: 'Harald', text: 'My nephew has the crown and no silver. I have silver and no crown. There is an arrangement in that if he is sensible.' },
        { at: 150, speaker: 'Chronicle', text: 'Magnus agreed to share the kingship rather than fight. Two years later he was dead, and the arrangement became sole rule.' },
      ],
      history: 'Harald returned north through Rus with accumulated wealth and entered an alliance with King Sweyn Estridsson of Denmark against his nephew Magnus the Good. Magnus instead agreed to share the Norwegian kingship with Harald in return for a share of the treasure.\n\nWhen Magnus died in 1047, Harald became sole king of Norway. His claim was secured by negotiation, dynastic right, and the armed following built during exile.',
      objective: 'Bring Harald and his following safely to the Norwegian court',
      opening: 'The exile returns with silver, veterans, and a claim that can no longer be ignored.',
      turningPoint: 'Magnus offers co-rule rather than civil war. Reach the court with the army under control.',
      ending: 'Harald becomes co-king with Magnus — a crown bought rather than won, paid for with Byzantine silver carried the length of two continents. When Magnus dies in 1047, Harald is sole king of Norway, and turns immediately on Denmark.',
    },
    {
      id: 'hardrada-04-nisa', title: 'The Long War for Denmark', act: 'Act II — King of Norway',
      date: '9 August 1062', location: 'Off the Nisa River, Halland', kind: 'battle',
      aftermathTitle: 'The war that would not end',
      stakes: 'Fifteen years of war for Denmark come to a head here. Fail and the Danish claim is finished, and with it the reputation Harald rules Norway on.',
      beats: [
        { at: 70, speaker: 'Harald', text: 'Sweyn has lost every battle we have fought and he still has Denmark. Beating him is not the same as taking it.' },
        { at: 155, speaker: 'A húskarl', text: 'The men are asking how many more summers, lord. They have farms.' },
      ],
      history: 'Harald fought Sweyn Estridsson for Denmark for many years, raiding coasts and contesting control at sea. At the Battle of Nisa in 1062, Harald won a major victory, but Sweyn escaped and Denmark did not submit.\n\nThe kings made peace in 1064, each keeping his own kingdom. Because Stone Siege has no naval warfare, the battle is translated into a coastal land engagement while preserving the inconclusive strategic result.',
      objective: 'Break Sweyn’s field army at Nisa',
      opening: 'After years of coastal war, the rival kings finally bring their main forces together.',
      turningPoint: 'Sweyn’s line is bending, but destroying an army is not the same as winning a kingdom.',
      ending: 'Harald wins the battle; Sweyn escapes. Two years later they make peace, and Denmark remains beyond Harald’s grasp.',
    },
    {
      id: 'hardrada-05-fulford', title: 'Fulford Gate', act: 'Act III — The Last Invasion',
      date: '20 September 1066', location: 'Fulford, near York', kind: 'battle',
      aftermathTitle: 'The road to York',
      stakes: 'The invasion needs York. Break the northern earls here and England’s north opens; fail and the fleet is stranded on a hostile coast.',
      beats: [
        { at: 70, speaker: 'Tostig Godwinson', text: 'My own brother took my earldom. Give me Northumbria back and half the north rises for you.' },
        { at: 155, speaker: 'Harald', text: 'The northern earls have come out to meet us rather than sit behind walls. Good. I would rather fight them in a marsh than besiege York.' },
      ],
      history: 'After Edward the Confessor died, Harald claimed the English crown and allied with the exiled Tostig Godwinson. Their fleet entered the Humber and defeated the northern earls Edwin and Morcar at Fulford, just south of York.\n\nThe victory opened York and brought hostages and supplies, but King Harold Godwinson was already marching north with extraordinary speed. The invaders did not yet know how little time they had.',
      objective: 'Defeat the armies of Edwin and Morcar at Fulford',
      opening: 'The Norwegian host deploys on low ground south of York. English earls block the way to the city.',
      turningPoint: 'The English flank is giving way toward the marsh. Press before the northern levies recover.',
      ending: 'Fulford is won and York submits. Five days later another English army appears without warning.',
    },
    {
      id: 'hardrada-06-stamford', title: 'Stamford Bridge', act: 'Act III — The Last Invasion',
      date: '25 September 1066', location: 'Stamford Bridge, Yorkshire', kind: 'lastStand',
      aftermathTitle: 'Seven feet of English ground',
      stakes: 'The army is scattered, half its mail is with the ships, and an English king nobody expected is already here. This is not a battle to win — it is a battle to survive.',
      beats: [
        { at: 70, speaker: 'A lookout', text: 'There is dust on the Tadcaster road, lord. Too much for hostages.' },
        { at: 150, speaker: 'Harald', text: 'Godwinson has marched from London in four days. Form the shield ring and send to the ships — we will hold until they come.' },
      ],
      history: 'Harold Godwinson force-marched north and surprised the Norwegians at Stamford Bridge. Many of Harald’s men had left armour with the ships in the warm weather. The Norse formed a shield wall while reinforcements under Eystein Orri rushed from Riccall.\n\nHarald was killed, traditionally by an arrow in the throat, and Tostig also fell. The surviving invaders were allowed to leave in a small remnant of the fleet. This final chapter is a last stand: Harald’s historical death completes the story rather than failing it.',
      objective: 'Hold the shield wall and fight Harald’s final battle',
      opening: 'The English king has arrived from the south with shocking speed. Much of the Norse armour is still at the ships.',
      turningPoint: 'The shield wall is surrounded. Eystein’s exhausted reinforcements are coming, but the battle has become a last stand.',
      ending: 'Harald falls at Stamford Bridge. The Norwegian invasion ends, and the age of the great Viking invasions closes with him.',
      hints: ['This is a historically doomed last stand; Harald’s fall completes the chapter.', 'Hold formation as long as possible before the larger host arrives.'],
    },
  ],
};

// --------------------------------------------------------------- Joan / French

const joanSource: CampaignSource = {
  id: 'joan',
  title: 'Joan of Arc — The Maid of Orléans',
  description: 'Carry Joan from Vaucouleurs to Chinon, lift the siege of Orléans, open the Loire, crown Charles VII, and face the tragic end at Compiègne.',
  civ: 'french', enemyCiv: 'english', hero: 'heroJoan', climate: 'temperate',
  imageAlt: 'Joan of Arc in armour carries a white banner before the walls of Orléans.',
  acts: [
    { id: 'calling', title: 'Act I — The Road to Orléans', years: '1429' },
    { id: 'coronation', title: 'Act II — The Loire and the Crown', years: '1429' },
    { id: 'captivity', title: 'Act III — Paris and Compiègne', years: '1429–1431' },
  ],
  cast: [
    {
      name: 'Joan of Arc',
      role: 'A farmer’s daughter from Domrémy',
      note: 'Seventeen years old, illiterate, and convinced by voices she identified as saints that she was sent to relieve Orléans and crown the king.',
    },
    {
      name: 'Charles VII',
      role: 'The uncrowned dauphin',
      note: 'Disinherited by treaty and by his own mother, holding a rump kingdom south of the Loire. He needed Reims, and he needed a miracle.',
    },
    {
      name: 'John Talbot and the English captains',
      role: 'The besiegers of Orléans',
      note: 'Professional soldiers running a siege that had held for months, facing a relief army led by a teenager they considered a witch.',
    },
  ],
  historyNote: 'Joan’s life is unusually well documented: her trial and the later nullification proceedings preserve sworn testimony from people who knew her. The battles here are compressed and dramatized; her presence, her banner, and her wound at Orléans are recorded.',
  prologue: {
    kicker: 'France, 1429',
    title: 'A Kingdom Down to Its Last River',
    paragraphs: [
      'Ninety-two years into the Hundred Years’ War, France was losing it. The English and their Burgundian allies held Paris, Normandy, and everything north of the Loire. The dauphin Charles had been disinherited by the Treaty of Troyes, had never been crowned, and was widely written off — even by his own court — as a man waiting for the end.',
      'Orléans was the last bridge. If the city fell, the English could cross the Loire in force and finish the war.',
      'Into this walked a seventeen-year-old from a village on the Meuse who said that saints had told her to relieve Orléans and take the dauphin to Reims to be crowned. She had no rank, no education, and no military training whatsoever. She was examined by theologians, granted armour and a banner, and — for reasons that say more about French desperation than French judgement — given her way.',
    ],
    quote: {
      text: 'I was sent for the comfort of the poor and the needy.',
      source: 'Joan of Arc, testimony at her trial, 1431',
    },
    cta: 'Ride to Chinon',
  },
  epilogue: {
    kicker: '1431–1456',
    title: 'The Verdict, and the Second Verdict',
    paragraphs: [
      'Captured at Compiègne in May 1430 and sold to the English, Joan was tried at Rouen by a church court under English control. The charge that finally held was wearing men’s clothing. On 30 May 1431 she was burned in the marketplace; she was nineteen. Her ashes were thrown in the Seine so that nothing could be kept.',
      'Charles VII, whom she had crowned, made no attempt to ransom her. Twenty-five years later — after he had won the war — he permitted a nullification trial that overturned the verdict and cleared her name. She was canonised in 1920.',
      'The military judgement is harder to summarise than the legend. In the space of a year she broke a siege that had held for seven months, opened the Loire, and got an uncrowned claimant to Reims. Whatever else she was, she was the reason the war turned.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'joan-01-chinon', title: 'A Road Through Enemy Country', act: 'Act I — The Road to Orléans',
      date: 'February–March 1429', location: 'Vaucouleurs to Chinon', kind: 'retreat',
      aftermathTitle: 'The court at Chinon',
      stakes: 'A teenager crossing four hundred miles of Burgundian country to reach a court that has no reason to receive her. Caught on the road, she is simply gone, and nothing that follows happens.',
      beats: [
        { at: 70, speaker: 'Jean de Metz', text: 'You are riding through enemy country in men’s clothes with six soldiers. If we are stopped, none of us can explain it.' },
        { at: 155, speaker: 'Joan', text: 'Then we ride at night and we do not stop. I was not sent to be careful, I was sent to Chinon.' },
      ],
      history: 'Joan, a teenager from Domrémy, persuaded Robert de Baudricourt to provide an escort to the dauphin Charles. She travelled roughly eleven days through territory contested by English and Burgundian forces, wearing male clothing for the journey.\n\nAt Chinon she was admitted to Charles’s court and then examined by clerics at Poitiers. The surviving record does not support every later legend about the meeting, but Charles accepted her mission and sent her toward besieged Orléans.',
      objective: 'Bring Joan through the contested road to Chinon',
      opening: 'A small escort leaves Vaucouleurs by night. Chinon lies across country watched by Burgundian patrols.',
      turningPoint: 'The Loire road is close. Avoid a battle the escort cannot afford and keep Joan moving.',
      ending: 'Joan reaches Chinon and gains an audience with the dauphin. The road now turns toward Orléans.',
    },
    {
      id: 'joan-02-orleans', title: 'The Siege of Orléans', act: 'Act I — The Road to Orléans',
      date: '29 April–8 May 1429', location: 'Orléans', kind: 'siege',
      aftermathTitle: 'The siege lifted',
      stakes: 'Orléans is the last bridge. If it falls, the English cross the Loire in force and the war ends with a French king who was never crowned.',
      beats: [
        { at: 70, speaker: 'Dunois', text: 'The city has held seven months. The captains have a plan already, and it does not have you in it.' },
        { at: 160, speaker: 'Joan', text: 'Their plan is to wait. I have seen where the English are weakest and it is the bastille they think is safe. Bring the banner and the men will come.' },
      ],
      history: 'Joan entered Orléans with supplies on 29 April 1429. French forces then attacked the ring of English bastilles around the city. The fiercest fighting came at Les Tourelles, controlling the bridge across the Loire.\n\nJoan was wounded during the assault on 7 May but returned to the action. The English abandoned the siege the next day, ending a crisis that had threatened the remaining Valois position in central France.',
      objective: 'Destroy the English bastille at Les Tourelles',
      opening: 'Orléans has received supplies and a new standard. The English bridge fortress still closes the southern bank.',
      turningPoint: 'The assault has stalled and Joan is wounded. The French standard rises again; press the breach.',
      ending: 'Les Tourelles falls. On 8 May the English lift the siege of Orléans.',
    },
    {
      id: 'joan-03-patay', title: 'The Loire Opens', act: 'Act II — The Loire and the Crown',
      date: '18 June 1429', location: 'Patay, Orléanais', kind: 'battle',
      aftermathTitle: 'The Loire opens',
      stakes: 'A broken siege means nothing if the English field army survives to besiege the next town. This is where a relieved city becomes a campaign.',
      beats: [
        { at: 70, speaker: 'La Hire', text: 'They are setting stakes and archers again — the same trick that killed us at Agincourt and Verneuil.' },
        { at: 155, speaker: 'Joan', text: 'Then we do not give them time to set them. Straight at the vanguard before the line is made.' },
      ],
      history: 'The French Loire campaign captured Jargeau and secured Meung and Beaugency. An English field army under John Talbot and John Fastolf withdrew north, but French scouts found its position near Patay before the longbowmen could fully prepare their defensive stakes.\n\nThe French vanguard under La Hire and Xaintrailles struck quickly. The English army was routed and Talbot captured, clearing the practical road for Charles to travel toward Reims.',
      objective: 'Break the English field army before its longbows entrench',
      opening: 'English longbowmen have been found in open country before their defensive line is ready.',
      turningPoint: 'The French vanguard is among the archers. Commit the cavalry before the English centre can form.',
      ending: 'Patay shatters the English field army. The Loire is open, and Joan turns Charles toward Reims.',
    },
    {
      id: 'joan-04-reims', title: 'The King’s Road', act: 'Act II — The Loire and the Crown',
      date: 'June–July 1429', location: 'Gien to Reims', kind: 'journey',
      aftermathTitle: 'The crowning at Reims',
      stakes: 'Reims is where French kings are made. An uncrowned dauphin is a claimant; a king anointed at Reims is the king, and the Treaty of Troyes becomes waste paper.',
      beats: [
        { at: 70, speaker: 'Joan', text: 'Every town on this road opens its gates or is taken. None of them has been worth a siege yet, and that tells you which way people think this is going.' },
        { at: 160, speaker: 'Charles VII', text: 'My own mother signed the treaty that disinherited me. In three months you have undone what my whole council said could not be undone — and I still do not know what to make of you.' },
      ],
      history: 'Joan insisted that Charles travel through Burgundian-held Champagne to be consecrated at Reims, the traditional coronation city. Auxerre negotiated, Troyes resisted briefly and then admitted the royal army, and other towns opened their gates.\n\nCharles VII was crowned in Reims Cathedral on 17 July 1429 with Joan present beside her banner. The ceremony gave the Valois cause a legitimacy no battlefield victory alone could supply.',
      objective: 'Bring Joan to Reims for the coronation of Charles VII',
      opening: 'The army leaves the Loire and enters uncertain Champagne. The goal is a coronation, not the ruin of its towns.',
      turningPoint: 'Troyes has yielded after negotiation. Reims lies ahead with its gates ready to open.',
      ending: 'Charles VII is consecrated at Reims on 17 July. Joan stands beside the king with her banner.',
    },
    {
      id: 'joan-05-paris', title: 'The Gate of Saint-Honoré', act: 'Act III — Paris and Compiègne',
      date: '8 September 1429', location: 'Paris', kind: 'retreat',
      aftermathTitle: 'The wound at Saint-Honoré',
      stakes: 'Paris is held for the English and Burgundians and the king has already half-agreed to a truce. A failed assault hands his court the argument that the Maid’s luck has run out.',
      beats: [
        { at: 70, speaker: 'Joan', text: 'The king is negotiating while we are standing in front of the walls. One of those two things will decide this and it is not going to be the walls.' },
        { at: 155, speaker: 'Chronicle', text: 'Joan was wounded in the thigh by a crossbow bolt at the Saint-Honoré gate and had to be carried off. The assault was called off the next day on the king’s order.' },
      ],
      history: 'After the coronation, the royal army moved toward Paris, then held by the Anglo-Burgundian side. Charles VII was simultaneously pursuing negotiations with Burgundy and gave uncertain support to an assault.\n\nJoan attacked near the Saint-Honoré gate on 8 September and was wounded by a crossbow bolt. The assault failed, and Charles soon ordered the army away. Reaching the gate completes this chapter; history does not allow the city to be taken.',
      objective: 'Reach the Saint-Honoré gate, then withdraw with Joan alive',
      opening: 'Paris is defended and the king’s commitment is uncertain. Joan leads the assault toward Saint-Honoré.',
      turningPoint: 'Joan is wounded at the ditch and the attack has lost momentum. Preserve the army; Paris will not fall today.',
      ending: 'The assault fails and Charles orders a withdrawal. The coronation campaign’s momentum is spent.',
      hints: ['History requires a failed assault: reach the northern gate district to complete the chapter.', 'Keep Joan screened from longbow fire.'],
    },
    {
      id: 'joan-06-compiegne', title: 'The Closed Gate', act: 'Act III — Paris and Compiègne',
      date: '23 May 1430–30 May 1431', location: 'Compiègne and Rouen', kind: 'lastStand',
      aftermathTitle: 'Taken outside the gate',
      stakes: 'The rearguard covers the retreat into the town. If the gate closes first, whoever is still outside belongs to Burgundy.',
      beats: [
        { at: 70, speaker: 'Joan', text: 'I will go last. Get them over the bridge and into the town.' },
        { at: 150, speaker: 'Chronicle', text: 'The drawbridge was raised with Joan still outside it. Whether that was panic or calculation has been argued about for six hundred years.' },
      ],
      history: 'Joan entered Compiègne to help defend it against Burgundian forces. During a sortie on 23 May 1430, her party was driven back and she was pulled from her horse outside the closing gate. She became the prisoner of John of Luxembourg and was later transferred to English custody.\n\nTried at Rouen by an English-supported church court, Joan was executed on 30 May 1431. A later retrial annulled the conviction in 1456. This chapter ends with capture, not an invented escape.',
      objective: 'Lead the sortie at Compiègne until Joan is captured',
      opening: 'Burgundian troops close on Compiègne. Joan rides out in a sortie to protect the town.',
      turningPoint: 'The sortie is being forced back and the gate is closing. Joan refuses to leave before the rearguard.',
      ending: 'Joan is captured outside Compiègne. She is executed at Rouen in 1431; the judgment is annulled twenty-five years later.',
      hints: ['This chapter ends in Joan’s historical capture; her fall completes the campaign.', 'Protect the rearguard as long as possible.'],
    },
  ],
};

// ------------------------------------------------------------- Chinggis / Mongols

const genghisSource: CampaignSource = {
  id: 'genghis',
  title: 'Chinggis Khan — The Felt-Walled Nation',
  description: 'Rise with Temüjin from an abandoned family camp, unite the steppe, reorganize the Mongol nation, and carry the new empire into Jin China and Khwarazm.',
  civ: 'mongols', enemyCiv: 'mongols', hero: 'heroGenghis', climate: 'steppe',
  imageAlt: 'Chinggis Khan and mounted archers cross the open Mongolian steppe beneath storm clouds.',
  acts: [
    { id: 'survival', title: 'Act I — Survival and Alliance', years: 'c. 1171–1190' },
    { id: 'unification', title: 'Act II — One Nation of the Steppe', years: '1203–1206' },
    { id: 'empire', title: 'Act III — Beyond the Steppe', years: '1211–1221' },
  ],
  cast: [
    {
      name: 'Temüjin',
      role: 'Later Chinggis Khan',
      note: 'Son of a poisoned chief, abandoned with his family to starve on the steppe. He built a following out of oath-brothers and men of no birth.',
    },
    {
      name: 'Börte',
      role: 'Temüjin’s wife',
      note: 'Kidnapped by the Merkit early in his rise. The war to get her back was the campaign that made his name.',
    },
    {
      name: 'Jamukha and Toghrul',
      role: 'Sworn brother and sworn father',
      note: 'His closest allies, and then his most dangerous enemies. Unifying the steppe meant destroying the men who had raised him up.',
    },
  ],
  historyNote: 'The Secret History of the Mongols is the main source and is a court document with an agenda. Dates before 1200 are approximate; the sieges of settled cities are compressed drastically, and casualty claims from Persian chroniclers are not treated as reliable.',
  prologue: {
    kicker: 'The Mongolian steppe, c. 1171',
    title: 'The Abandoned Camp',
    paragraphs: [
      'When Yesügei was poisoned by Tatars, his followers took the herds and rode away, leaving his widow and small children on the open steppe with nothing. That was normal. A clan without a fighting head was not a clan, and steppe winters do the rest.',
      'They survived on roots, marmots and fish, which was shameful work for the family of a chief. The eldest boy, Temüjin, killed his own half-brother in a quarrel over a fish and was later taken and held in a wooden collar by the clan that had abandoned him. He escaped.',
      'What he built afterwards was not another tribal confederation. He broke up the old clans, promoted men for loyalty and competence rather than birth, imposed written law and a decimal army organisation, and made the whole steppe into one nation of felt-walled tents. Then he pointed it outward.',
    ],
    cta: 'Return to the camp',
  },
  epilogue: {
    kicker: '1227 and after',
    title: 'The Largest Land Empire There Has Ever Been',
    paragraphs: [
      'Chinggis Khan died in 1227 on campaign against the Tangut, of causes the sources cannot agree on, and was buried in an unmarked place that has never been found. His empire went to his sons and grandsons, who kept expanding it: Russia, Persia, Anatolia, Hungary’s doorstep, and finally all of China under Kublai.',
      'The cost was enormous and is genuinely disputed. Cities that resisted were destroyed as policy, and parts of Persia and north China took generations to recover. Set against that: the Mongol peace opened the overland routes between Europe and China, protected merchants and envoys, tolerated every religion in the empire, and moved craftsmen, ideas and technologies across a continent that had never been connected.',
      'It began with a boy digging roots beside a river because his father’s people had ridden off and left him.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'genghis-01-empty-camp', title: 'The Empty Camp', act: 'Act I — Survival and Alliance',
      date: 'c. 1171', location: 'The Onon River country', kind: 'defend',
      aftermathTitle: 'A family that did not die',
      stakes: 'A widow and her children abandoned on the steppe with no herds. Nothing about the empire is possible if this winter kills them.',
      beats: [
        { at: 70, speaker: 'Hoelun', text: 'They took the herds and rode off, and they expect the winter to do the rest. Dig. Fish. Do whatever feeds you and do not be ashamed of it.' },
        { at: 155, speaker: 'Temüjin', text: 'They left us because we had no one to fight for us. That is the thing I mean to change, and not only for us.' },
      ],
      history: 'After the death of Temüjin’s father Yesügei, most of his followers abandoned Hö’elün and her children. The family survived through fishing, gathering, and hunting on the margins of steppe society.\n\nThe chronology and many details of Temüjin’s youth come chiefly from The Secret History of the Mongols, a source written after his rise and shaped by epic storytelling. This chapter presents that remembered struggle without claiming every incident is independently verified.',
      objective: 'Keep Temüjin’s family camp alive until its enemies withdraw',
      opening: 'Yesügei is dead, the camp has emptied, and a family once born to command has been left with almost nothing.',
      turningPoint: 'Survival is becoming loyalty. Those who stay through this winter will become the first core of a new following.',
      ending: 'The family survives abandonment. Temüjin begins to gather companions bound to him personally rather than only by clan.',
    },
    {
      id: 'genghis-02-borte', title: 'Börte Taken', act: 'Act I — Survival and Alliance',
      date: 'c. 1180–1181', location: 'The lower Kerulen', kind: 'siege',
      aftermathTitle: 'The war for Börte',
      stakes: 'Börte has been taken by the Merkit. A man who cannot recover his own wife commands nothing on the steppe, whatever else he does.',
      beats: [
        { at: 70, speaker: 'Jamukha', text: 'You called and I came, my anda. Toghrul brings his men too. Remember afterwards who rode for you when you had nothing.' },
        { at: 155, speaker: 'Temüjin', text: 'I will remember. Take the camp whole — I want the Merkit to know it was done properly, not raided.' },
      ],
      history: 'The Merkit abducted Temüjin’s wife Börte, an act later tradition connected to an older feud involving his parents. Temüjin sought help from Toghrul, khan of the Kereit, and from his sworn companion Jamukha.\n\nTheir combined force attacked the Merkit camps and recovered Börte. The rescue demonstrated Temüjin’s ability to build alliances, but the partnership with Jamukha would not survive their competing visions of authority.',
      objective: 'Break the Merkit camp and recover Börte',
      opening: 'The Merkit have taken Börte. Temüjin cannot recover her without calling in old bonds and new allies.',
      turningPoint: 'Toghrul and Jamukha have joined the attack. Strike the camp before the captives are moved again.',
      ending: 'Börte is recovered. The alliance succeeds, but Temüjin and Jamukha are already becoming rival centres of power.',
    },
    {
      id: 'genghis-03-kereit', title: 'Broken Oaths', act: 'Act II — One Nation of the Steppe',
      date: '1203', location: 'Eastern Mongolia', kind: 'battle',
      aftermathTitle: 'Oaths broken',
      stakes: 'The men who raised Temüjin up now mean to end him. Lose and the steppe stays what it has always been: a place where alliances are seasonal and no one rules.',
      beats: [
        { at: 70, speaker: 'Temüjin', text: 'Toghrul called me son and Jamukha called me brother. Both have decided I am more useful dead.' },
        { at: 155, speaker: 'Bo’orchu', text: 'We are outnumbered and half our people have gone over to them. But the ones who stayed chose it — that is a different kind of army.' },
      ],
      history: 'Temüjin’s long relationship with Toghrul, also called Ong Khan, collapsed amid suspicion, marriage politics, and rivalry within the Kereit court. After suffering a reverse, Temüjin rebuilt his following and defeated the Kereit in 1203.\n\nThe victory absorbed many Kereit people into his growing coalition. Temüjin increasingly reorganized followers across inherited tribal lines, rewarding service and binding commanders directly to the emerging state.',
      objective: 'Defeat the Kereit host and end Toghrul’s opposition',
      opening: 'A fatherly ally has become a rival khan. The old oath cannot survive two competing centres of command.',
      turningPoint: 'The Kereit line is breaking. Accept the people who submit; the purpose is a larger nation, not an empty steppe.',
      ending: 'The Kereit confederation collapses and its people are incorporated. Only the great western rivals remain.',
    },
    {
      id: 'genghis-04-naiman', title: 'The Last Rival', act: 'Act II — One Nation of the Steppe',
      date: '1204–1206', location: 'The Orkhon and Altai country', kind: 'battle',
      aftermathTitle: 'One nation of felt walls',
      stakes: 'The last rival confederation on the steppe. Break it and the wars between Mongols end; fail and everything won so far is one more temporary alliance.',
      beats: [
        { at: 70, speaker: 'Temüjin', text: 'Every man fights in a unit of ten, under a captain he did not choose by birth. No clan formations. That is the whole reform and it is why we will win.' },
        { at: 155, speaker: 'Subotai', text: 'They think they outnumber us. Light every man’s fires as five and let them keep thinking it.' },
      ],
      history: 'The Naiman formed the strongest remaining coalition against Temüjin, joined by Jamukha and other displaced rivals. In 1204 Temüjin defeated the Naiman host. Jamukha was later delivered to him and executed, though accounts differ in detail.\n\nAt a great assembly in 1206, Temüjin was acclaimed Chinggis Khan. He reorganized the army and population into decimal units that cut across tribal loyalties, creating the institutional foundation of the Mongol Empire.',
      objective: 'Break the Naiman coalition and unite the Mongol plateau',
      opening: 'Naiman banners gather beyond the Altai approaches. Jamukha stands among the last coalition against Temüjin.',
      turningPoint: 'The coalition is losing cohesion. Press every wing before the rival clans can scatter and regroup.',
      ending: 'The Naiman are defeated. In 1206 an assembly acclaims Temüjin as Chinggis Khan of a newly organized Mongol nation.',
    },
    {
      id: 'genghis-05-zhongdu', title: 'Beyond the Great Wall', act: 'Act III — Beyond the Steppe',
      date: '1211–1215', location: 'Jin northern China', kind: 'siege',
      aftermathTitle: 'Past the Great Wall',
      stakes: 'The Jin dynasty has ruled the Mongols’ northern neighbours for a century and has walls the steppe has never taken. This is where nomads either learn siegecraft or stay nomads.',
      beats: [
        { at: 70, speaker: 'Temüjin', text: 'Horsemen cannot storm a city. So we take the men who can — engineers, sappers, anyone who has built a wall — and we pay them better than the Jin did.' },
        { at: 160, speaker: 'Chronicle', text: 'Chinese and Khitan engineers who defected brought counterweight engines, gunpowder and mining to a Mongol army that had none of it a decade earlier.' },
      ],
      history: 'After campaigns against Western Xia, Chinggis Khan invaded the Jurchen Jin state in 1211. Mongol armies crossed frontier defenses, defeated field forces, and learned to use engineers and siege technology against fortified cities.\n\nThe Jin court abandoned Zhongdu, near modern Beijing, for Kaifeng. Mongol forces captured Zhongdu in 1215. The wider Jin war continued long after Chinggis Khan’s death and was completed by his successors.',
      objective: 'Capture the Jin stronghold guarding Zhongdu',
      opening: 'The cavalry nation has reached walls that cannot be ridden around. Engineers and discipline must answer stone.',
      turningPoint: 'The frontier army is broken. Keep the siege line supplied and take the fortress before Jin relief arrives.',
      ending: 'Zhongdu falls in 1215. The Mongols now command the eastern approaches to the Silk Road, though the Jin war is not finished.',
    },
    {
      id: 'genghis-06-khwarazm', title: 'Otrar’s Answer', act: 'Act III — Beyond the Steppe',
      date: '1219–1221', location: 'Transoxiana', kind: 'siege',
      aftermathTitle: 'Otrar answered',
      stakes: 'The Shah executed a Mongol trade embassy and shaved the envoys sent to protest it. Whatever answer is given here is the one the whole world west of the steppe will read.',
      beats: [
        { at: 70, speaker: 'Temüjin', text: 'I wanted trade with Khwarazm. He killed my merchants at Otrar and returned my ambassadors without their beards.' },
        { at: 155, speaker: 'Chronicle', text: 'The campaign that followed destroyed the Khwarazmian empire in three years. Persian chroniclers writing afterwards give casualty figures no modern historian accepts, and describe a shock that was real regardless.' },
      ],
      history: 'In 1218 the governor of Otrar seized a Mongol-sponsored trade caravan, and the Khwarazm-shah had envoys sent to demand redress killed or humiliated. Chinggis Khan responded with a massive invasion in 1219.\n\nMongol columns crossed the Syr Darya and struck Otrar, Bukhara, and Samarkand. The campaign destroyed the Khwarazmian state and caused enormous civilian death and devastation. Chinggis died in 1227 during a later campaign against Western Xia; his successors expanded the empire still farther.',
      objective: 'Take the Khwarazmian citadel beyond the Syr Darya',
      opening: 'A trade mission has ended in seizure and murdered envoys. The Mongol response crosses the river in several columns.',
      turningPoint: 'The field army has been bypassed and the cities are isolated. The speed of the invasion is now its greatest weapon.',
      ending: 'The Khwarazmian state collapses under campaigns of extraordinary speed and brutality. The empire Chinggis leaves in 1227 will outgrow even his conquests.',
      hints: ['Use mounted units to contain defenders while siege engines attack the citadel.', 'The narrative acknowledges the catastrophic civilian cost of the campaign.'],
    },
  ],
};

// ------------------------------------------------------------ Alexios / Byzantines

const alexiosSource: CampaignSource = {
  id: 'alexios',
  title: 'Alexios Komnenos — Empire Reforged',
  description: 'Inherit an empire near collapse, survive Normans and Pechenegs, manage the arrival of the First Crusade, and restore an imperial army in Anatolia.',
  civ: 'byzantines', enemyCiv: 'french', hero: 'heroAlexios', climate: 'mediterranean',
  imageAlt: 'Emperor Alexios Komnenos directs Byzantine cataphracts before Constantinople’s walls.',
  acts: [
    { id: 'survival', title: 'Act I — An Empire Under Siege', years: '1081–1083' },
    { id: 'restoration', title: 'Act II — The Northern Storm', years: '1091–1096' },
    { id: 'crusade', title: 'Act III — Recovery in Anatolia', years: '1097–1116' },
  ],
  cast: [
    {
      name: 'Alexios I Komnenos',
      role: 'Emperor of the Romans',
      note: 'Seized a throne nobody sane wanted: the treasury empty, the army destroyed, and enemies on three frontiers at once.',
    },
    {
      name: 'Robert Guiscard and Bohemond',
      role: 'Norman invaders',
      note: 'Father and son, come from southern Italy to take the empire itself. Bohemond returns later as a crusader, which does not make him friendlier.',
    },
    {
      name: 'Anna Komnene',
      role: 'His daughter and historian',
      note: 'Wrote the Alexiad, the fullest account of his reign — devoted, partisan, and the reason we know what these campaigns looked like from the inside.',
    },
  ],
  historyNote: 'The Alexiad is the principal source and is written by the emperor’s daughter in his defence. Chapter scale is compressed heavily; the strategic situation, the sequence of enemies, and the awkwardness of the crusaders’ arrival are as recorded.',
  prologue: {
    kicker: 'Constantinople, 1081',
    title: 'An Empire on Three Fronts',
    paragraphs: [
      'Ten years before Alexios took the throne, a Byzantine emperor was captured by the Seljuk Turks at Manzikert. The battle itself was survivable; the civil wars that followed were not. Imperial authority in Anatolia — the empire’s recruiting ground and breadbasket — simply dissolved, and Turkish groups moved into the vacuum until they were camped within sight of the capital.',
      'Alexios Komnenos was a successful general who seized power in 1081 at twenty-four. He inherited a debased currency, an empty treasury, no field army worth the name, and simultaneous invasions: Normans from Italy in the west, Pechenegs across the Danube in the north, Turks in the east.',
      'He survived by every means available — hard fighting, harder diplomacy, melting down church plate, buying one enemy to fight another. And in 1095 he asked the West for mercenaries, and got the First Crusade instead: tens of thousands of armed pilgrims marching through his territory, led by men including the Norman who had recently tried to take his throne.',
    ],
    cta: 'Hold the empire',
  },
  epilogue: {
    kicker: '1118',
    title: 'The Empire He Handed On',
    paragraphs: [
      'Alexios died in 1118 after thirty-seven years in power. He had not restored the empire of Basil II and never came close. What he did was stop the collapse: the coinage was reformed, the western coast of Anatolia was back in imperial hands, the Normans had been fought to a standstill, and the Pechenegs had been destroyed as a threat.',
      'The Crusade was the sharpest double edge of his reign. It recovered Nicaea and opened Anatolia, and it planted independent Latin states in Syria that owed him nothing and resented him deeply — a grievance that ran on for a century and helped bring a crusading army to sack Constantinople in 1204.',
      'His son and grandson ruled over what historians call the Komnenian restoration. It rested on the settlement Alexios improvised while fighting on three frontiers with no money.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'alexios-01-dyrrhachion', title: 'The Broken Field', act: 'Act I — An Empire Under Siege',
      date: '18 October 1081', location: 'Dyrrhachion, Albania', kind: 'retreat',
      aftermathTitle: 'The Normans on the coast',
      stakes: 'Robert Guiscard has crossed from Italy to take the empire itself. Dyrrhachion is the head of the road to Constantinople, and the empire has no second army behind this one.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'I have been emperor for four months. The treasury is empty, the Anatolian army no longer exists, and there are Normans on my coast.' },
        { at: 160, speaker: 'George Palaiologos', text: 'The Varangians have gone forward on their own and broken the line doing it. They are Englishmen who lost their country to Normans — they will not be told to wait.' },
      ],
      history: 'Alexios I seized the throne in April 1081 and immediately faced a Norman invasion led by Robert Guiscard and Bohemond. He marched west to relieve Dyrrhachion, relying on a mixed army that included the Varangian Guard.\n\nThe Byzantine line was defeated on 18 October. The Varangians became isolated and were destroyed, while Alexios escaped wounded. The disaster exposed the weakness of the army he had inherited but did not end his resistance.',
      objective: 'Extract Alexios from the defeat at Dyrrhachion',
      opening: 'The new emperor’s first great battle is collapsing. The Varangian wing is cut off and Norman cavalry has broken through.',
      turningPoint: 'Dyrrhachion cannot be saved today. Preserve Alexios and the surviving core of the army.',
      ending: 'Alexios escapes the defeat. He will trade treasure, titles, alliances, and time to build another army.',
    },
    {
      id: 'alexios-02-larissa', title: 'The War of Patience', act: 'Act I — An Empire Under Siege',
      date: '1083', location: 'Larissa, Thessaly', kind: 'battle',
      aftermathTitle: 'Patience, and no pitched battle',
      stakes: 'Beaten twice in the open field, the empire cannot afford a third battle on Norman terms. What is at stake is whether Alexios can win a war without winning a battle.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'I have lost to these men in a straight fight twice. So we will not have a straight fight. Cut the supply, take the baggage, and let them stand in the rain.' },
        { at: 155, speaker: 'Anna Komnene', text: 'My father learned more from his defeats than most commanders learn from victories. He never once repeated the mistake that cost him Dyrrhachion.' },
      ],
      history: 'After Dyrrhachion, Norman forces advanced through the western Balkans. Alexios avoided simply repeating the failed battle. Near Larissa in 1083 he used deception, maneuver, and attacks on the Norman camp and baggage to defeat Bohemond’s position.\n\nNorman strength then ebbed as threats in Italy drew attention westward and Robert Guiscard died in 1085. The empire had survived its first immediate crisis.',
      objective: 'Defeat Bohemond’s army near Larissa',
      opening: 'Alexios returns with a rebuilt mixed army. This time the Norman charge will not be met on its own terms.',
      turningPoint: 'The feint has drawn troops away from the camp. Strike the exposed centre and baggage line.',
      ending: 'Bohemond’s position unravels. The Norman invasion recedes, buying the empire desperately needed time.',
    },
    {
      id: 'alexios-03-levounion', title: 'Levounion', act: 'Act II — The Northern Storm',
      date: '29 April 1091', location: 'Levounion, Thrace', kind: 'battle',
      aftermathTitle: 'The northern threat ended',
      stakes: 'The Pechenegs are wintering inside imperial territory with the Seljuk fleet offshore. If this goes wrong there is nothing between them and the capital.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'I have bought forty thousand Cuman horsemen to fight the Pechenegs. Steppe nomads to fight steppe nomads — and I must send them home again afterwards.' },
        { at: 160, speaker: 'A Cuman chief', text: 'We came for your gold, emperor, not your empire. Pay us, and the Pechenegs are a people you will not have to think about again.' },
      ],
      history: 'Pecheneg forces had crossed the Danube and threatened the empire for years, at one point approaching Constantinople in cooperation with the Turkish emir Tzachas. Alexios secured the aid of Cuman horsemen against them.\n\nAt Levounion in April 1091, the combined Byzantine-Cuman army attacked the Pecheneg camp and won a crushing victory. Medieval accounts emphasize the scale of the destruction; modern reconstructions remain cautious about exact numbers.',
      objective: 'Destroy the Pecheneg host at Levounion',
      opening: 'The Pecheneg camp lies ahead. Cuman allies have arrived, but steppe alliances can vanish as quickly as they form.',
      turningPoint: 'The allied wings are closing. Drive into the camp before the Pechenegs can reform for retreat.',
      ending: 'Levounion ends the immediate Pecheneg danger and gives Alexios room to look east again.',
    },
    {
      id: 'alexios-04-crusaders', title: 'The Army at the Walls', act: 'Act II — The Northern Storm',
      date: '1096–1097', location: 'Constantinople', kind: 'defend',
      aftermathTitle: 'An army of pilgrims, passed east',
      stakes: 'Alexios asked the West for mercenaries and got a migration in armour, led partly by the Norman who tried to take his throne. Handled badly, the relief force becomes the next invasion.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'I asked the Pope for soldiers to hire. He has sent me princes with armies of their own, and one of them is Bohemond.' },
        { at: 155, speaker: 'Bohemond', text: 'Ten years ago I came to take your throne and you know it. Swear me what you like, emperor — I will take the oath, and we will both remember how much it is worth.' },
      ],
      history: 'Alexios’s appeals for western military aid helped set in motion a response far larger and less controllable than expected. First the undisciplined People’s Crusade arrived, followed by armies led by powerful Latin princes—including Bohemond, his former enemy.\n\nAlexios ferried forces across the Bosporus and required leading princes to swear oaths concerning former imperial territory. The chapter represents the tense work of protecting the capital and moving armed hosts through it, not a declared Byzantine war on the crusaders.',
      objective: 'Keep Constantinople’s approaches secure while the crusading hosts cross',
      opening: 'Western armies are gathering outside the richest city they have ever seen. They are guests, allies, and a danger at the same time.',
      turningPoint: 'The main princes are taking oaths and their contingents are crossing the Bosporus. Hold order until the last camps move east.',
      ending: 'The armies cross into Asia. Alexios has survived their arrival and bound their leaders, however imperfectly, to imperial claims.',
      hints: ['Defend the imperial district for 210 seconds.', 'The attackers represent disorderly detachments, not the whole crusading host.'],
    },
    {
      id: 'alexios-05-nicaea', title: 'Nicaea Returns', act: 'Act III — Recovery in Anatolia',
      date: 'May–June 1097', location: 'Nicaea, Bithynia', kind: 'siege',
      aftermathTitle: 'Nicaea recovered',
      stakes: 'Nicaea was an imperial city until fifteen years ago and is now a Seljuk capital two days from the Marmara. Recovering it is the whole reason for tolerating the crusade.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'The crusaders besiege it by land. My ships go overland to the lake and close it from the water — and the garrison surrenders to me, not to them.' },
        { at: 160, speaker: 'Tatikios', text: 'The garrison will treat with us and not with the Franks. It spares the city — and it will be held against you for a hundred years by men who wanted it sacked.' },
      ],
      history: 'The crusading armies besieged Nicaea, capital of the Seljuk Sultanate of Rûm, while Byzantine troops and ships closed the lakeside supply route. Alexios negotiated secretly with the defenders to prevent a sack and secure the city for the empire.\n\nNicaea surrendered to Byzantine representatives on 19 June 1097. The arrangement angered some crusaders but restored a major city to imperial control and demonstrated Alexios’s preference for diplomacy alongside force.',
      objective: 'Close the siege and recover Nicaea for the empire',
      opening: 'Latin armies ring Nicaea while imperial boats are hauled to the lake. The city must return intact if possible.',
      turningPoint: 'The lakeside route is closed and negotiations have begun. Maintain pressure on the military citadel.',
      ending: 'Nicaea surrenders to imperial officers. The crusaders march onward, and Byzantine administration follows behind them.',
    },
    {
      id: 'alexios-06-philomelion', title: 'The Long Recovery', act: 'Act III — Recovery in Anatolia',
      date: '1116', location: 'Philomelion, central Anatolia', kind: 'retreat',
      aftermathTitle: 'The frontier that held',
      stakes: 'Anatolia is the empire’s recruiting ground and its grain. Every mile not recovered here is an empire that stays permanently smaller.',
      beats: [
        { at: 70, speaker: 'Alexios', text: 'We take back the coast, the river valleys and the roads. Not the plateau — I am not going to lose another army proving a point about the plateau.' },
        { at: 155, speaker: 'Anna Komnene', text: 'He was carrying an army, an empire and an illness by then, and he was still on campaign at sixty.' },
      ],
      history: 'The First Crusade helped Alexios recover much of western Anatolia, though Antioch became a lasting dispute with Bohemond. Alexios later contained Bohemond’s renewed invasion and imposed the Treaty of Devol in 1108.\n\nIn 1116, already ill and late in his reign, Alexios campaigned against Sultan Malik Shah near Philomelion. His army protected a large column of soldiers and civilians during a fighting withdrawal, then secured favorable peace terms. He died in 1118, leaving a substantially restored empire to John II.',
      objective: 'Bring Alexios and the imperial column safely out of Philomelion',
      opening: 'Decades after Dyrrhachion, the old emperor commands a disciplined army deep in Anatolia. A civilian column must be brought home.',
      turningPoint: 'Seljuk attacks test every side of the moving formation. Keep the column together and continue west.',
      ending: 'The army withdraws in order and favorable terms follow. Alexios dies in 1118, leaving an empire stronger than the one he seized thirty-seven years before.',
    },
  ],
};

// ---------------------------------------------------------------- Saladin / Saracens

const saladinSource: CampaignSource = {
  id: 'saladin',
  title: 'Saladin — The Unifier',
  description: 'Rise from service in Egypt, unite Egypt and Syria, recover from Montgisard, win at Hattin, retake Jerusalem, and endure Richard’s Third Crusade.',
  civ: 'saracens', enemyCiv: 'english', hero: 'heroSaladin', climate: 'desert',
  imageAlt: 'Saladin and Ayyubid cavalry overlook Jerusalem in warm desert light.',
  acts: [
    { id: 'egypt', title: 'Act I — Egypt and Syria', years: '1169–1174' },
    { id: 'jerusalem', title: 'Act II — Defeat and Victory', years: '1177–1187' },
    { id: 'crusade', title: 'Act III — Jerusalem and the Lionheart', years: '1187–1192' },
  ],
  cast: [
    {
      name: 'Salah ad-Din Yusuf ibn Ayyub',
      role: 'Saladin',
      note: 'A Kurdish officer sent to Egypt on someone else’s errand, who ended up ruling it — and then spent longer fighting fellow Muslims than fighting crusaders.',
    },
    {
      name: 'Guy of Lusignan and Raynald of Châtillon',
      role: 'The kingdom of Jerusalem’s war party',
      note: 'Raynald’s raids on caravans and on the Hajj route gave Saladin both a reason and a rallying cry. Guy’s decision to march to Hattin gave him the victory.',
    },
    {
      name: 'Richard I of England',
      role: 'The Lionheart',
      note: 'Arrives with the Third Crusade, wins his battles, and cannot take Jerusalem. He and Saladin negotiate constantly and never meet.',
    },
  ],
  historyNote: 'Saladin is described by both Muslim and Frankish writers, several of whom knew him; his reputation for restraint at Jerusalem in 1187 is attested by his enemies as well as his admirers. Chapter scale and tactics are compressed for play.',
  prologue: {
    kicker: 'Egypt and Syria, 1169',
    title: 'A Divided House',
    paragraphs: [
      'The crusader states had survived for seventy years mainly because their neighbours were divided. Egypt was ruled by a Shi‘a Fatimid caliphate in decline; Syria was a patchwork of Sunni emirs under Nur ad-Din of Damascus; and both spent as much effort on each other as on the Franks.',
      'Salah ad-Din — a Kurdish officer in Nur ad-Din’s service — went to Egypt reluctantly as second-in-command of an expedition, and within two years was its vizier. When Nur ad-Din died, he took Damascus too. Uniting Egypt and Syria under one authority took him nearly twenty years and a great deal of war against fellow Muslims, and it is the precondition for everything else.',
      'Only then could he turn the combined weight of both on the kingdom of Jerusalem — and he had been given a case for doing so by Raynald of Châtillon, who raided pilgrim caravans and threatened the holy cities of the Hijaz.',
    ],
    cta: 'Take up the command',
  },
  epilogue: {
    kicker: '1192–1193',
    title: 'What He Left, and What He Kept',
    paragraphs: [
      'The Third Crusade recovered the coast and could not recover Jerusalem. In 1192 Saladin and Richard agreed a truce: the Franks kept a coastal strip, Jerusalem stayed Muslim, and Christian pilgrims were guaranteed access to it. Richard sailed home and Saladin went to Damascus.',
      'He died there in March 1193, at about 55. His treasury was so depleted by giving that it could not pay for his funeral; his family had to borrow. The empire he had spent his life assembling was divided among relatives within a generation.',
      'His conduct at Jerusalem in 1187 — a negotiated surrender, ransoms he repeatedly waived, no massacre — was recorded with astonishment by Frankish chroniclers who remembered what their own grandfathers had done to the same city in 1099. It is the reason a man who fought the crusaders for twenty years became a hero in European literature within a century of his death.',
    ],
    cta: 'Close the book',
  },
  chapters: [
    {
      id: 'saladin-01-egypt', title: 'Vizier of Egypt', act: 'Act I — Egypt and Syria',
      date: '1169–1171', location: 'Egypt', kind: 'defend',
      aftermathTitle: 'Egypt in one hand',
      stakes: 'Egypt is the richest province in the Muslim world and it is falling apart between a dying Fatimid caliphate and a Frankish invasion. Whoever holds it holds the war.',
      beats: [
        { at: 70, speaker: 'Salah ad-Din', text: 'I did not want this posting. I came as my uncle’s second and I am now the vizier of a caliphate I do not share a creed with.' },
        { at: 155, speaker: 'al-Fadil', text: 'Nur ad-Din in Damascus expects you to hold Egypt for him. Egypt expects you to hold it for Egypt. You cannot do both indefinitely.' },
      ],
      history: 'Saladin came to Egypt in campaigns led by his uncle Shirkuh on behalf of the Zengid ruler Nur al-Din. After Shirkuh’s death in 1169, Saladin became vizier to the Fatimid caliph while also serving Nur al-Din.\n\nHe defeated or contained opposition, strengthened defenses against the kingdom of Jerusalem, and in 1171 ended the Fatimid caliphate, restoring formal Abbasid allegiance. His Kurdish-led household became the foundation of the Ayyubid dynasty.',
      objective: 'Hold the Egyptian capital while Saladin secures the vizierate',
      opening: 'A young commander inherits the vizierate of a divided court while Frankish pressure remains close to the Nile.',
      turningPoint: 'The defenses are holding and rival centres of power are being brought under control. Egypt can become a base rather than a prize.',
      ending: 'Saladin consolidates Egypt and ends the Fatimid caliphate in 1171, ruling in the name of the Abbasid caliph.',
    },
    {
      id: 'saladin-02-damascus', title: 'The Open Gates of Damascus', act: 'Act I — Egypt and Syria',
      date: '1174', location: 'Damascus', kind: 'journey',
      aftermathTitle: 'Egypt and Syria joined',
      stakes: 'Divided, Egypt and Syria have let the crusader states live for seventy years. Joined under one command, they surround the kingdom of Jerusalem entirely.',
      beats: [
        { at: 70, speaker: 'Salah ad-Din', text: 'Men will say I am fighting fellow Muslims for my own advancement. They will be partly right. They will also be standing in a kingdom that survives because we are divided.' },
        { at: 160, speaker: 'al-Fadil', text: 'Nur ad-Din died summoning you to answer for Egypt. Every emir between here and Aleppo knows it, and half of them will call this conquest rather than inheritance.' },
      ],
      history: 'Nur al-Din died in 1174, leaving a child heir and a fractured political order in Syria. Saladin marched from Egypt, presenting himself as protector of Nur al-Din’s legacy. Damascus admitted him without a siege in October.\n\nAleppo and Mosul resisted his expansion, and unification took years of campaigning and negotiation. This chapter correctly ends at open gates rather than inventing a conquest of Damascus by storm.',
      objective: 'Bring Saladin to Damascus without attacking the city',
      opening: 'Nur al-Din is dead and Syria is divided. Damascus has invited Saladin to enter as protector.',
      turningPoint: 'The city’s gates are open. Keep discipline and approach as an ally, not a besieger.',
      ending: 'Damascus receives Saladin without a siege. The longer struggle to unite Egypt and Syria has begun.',
      hints: ['This is a peaceful historical arrival; reach the northern city district with Saladin.', 'Do not waste time attacking structures.'],
    },
    {
      id: 'saladin-03-montgisard', title: 'The Lesson of Montgisard', act: 'Act II — Defeat and Victory',
      date: '25 November 1177', location: 'Montgisard, near Ramla', kind: 'retreat',
      aftermathTitle: 'What Montgisard taught',
      stakes: 'Overconfidence and a strung-out column. What is at risk here is not a province but the belief — his own and everyone else’s — that this army cannot be beaten.',
      beats: [
        { at: 70, speaker: 'Taqi al-Din', text: 'The column is spread over miles and the men are loaded with plunder. If anything comes at us now we cannot form.' },
        { at: 155, speaker: 'Chronicle', text: 'A much smaller Frankish force under the sixteen-year-old leper king Baldwin IV caught the army strung out near Ramla and routed it. Saladin barely escaped.' },
      ],
      history: 'Saladin invaded the kingdom of Jerusalem in 1177 while much of its field strength was thought to be absent. His forces dispersed to forage and raid. King Baldwin IV and a smaller Frankish army then surprised the Ayyubid host near Montgisard.\n\nSaladin suffered a severe defeat and escaped back toward Egypt with a fraction of the army. The reverse is important to his story: Hattin was not inevitable, and later campaigns showed greater care about concentration and supply.',
      objective: 'Extract Saladin and the surviving army after Montgisard',
      opening: 'The army is scattered when Baldwin’s force appears. What looked like an open road has become a rout.',
      turningPoint: 'The field cannot be recovered. Preserve Saladin and enough of the army to cross the desert home.',
      ending: 'Saladin escapes to Egypt after a major defeat. The lesson in concentration and reconnaissance will not be forgotten.',
    },
    {
      id: 'saladin-04-hattin', title: 'The Horns of Hattin', act: 'Act II — Defeat and Victory',
      date: '4 July 1187', location: 'Hattin, Galilee', kind: 'battle',
      aftermathTitle: 'The kingdom’s army destroyed',
      stakes: 'The kingdom of Jerusalem has emptied every castle to field this army. Destroy it and there is nothing left to defend the cities; lose and the last twenty years were wasted.',
      beats: [
        { at: 70, speaker: 'Salah ad-Din', text: 'They have left the springs at Sephoria to relieve Tiberias. A day in that country without water will do more than any charge of ours.' },
        { at: 160, speaker: 'Taqi al-Din', text: 'Fire the dry grass upwind of them. Let them fight thirsty, blind and in armour.' },
      ],
      history: 'After years of consolidation, Saladin assembled forces from across Egypt and Syria. He drew the army of the kingdom of Jerusalem away from water at Sepphoris toward besieged Tiberias in the July heat.\n\nNear the Horns of Hattin, the exhausted Frankish army was surrounded and destroyed. King Guy was captured, and Raynald of Châtillon was executed. The victory removed the field army that had protected most crusader-held towns.',
      objective: 'Destroy the crusader field army at Hattin',
      opening: 'The Frankish army has left its water and is marching through heat and smoke toward Tiberias.',
      turningPoint: 'The enemy line has compressed around the horns. Close the ring before any formation reaches the lake.',
      ending: 'The kingdom’s field army is destroyed at Hattin. The road to Acre, Ascalon, and Jerusalem opens.',
    },
    {
      id: 'saladin-05-jerusalem', title: 'Jerusalem', act: 'Act III — Jerusalem and the Lionheart',
      date: '20 September–2 October 1187', location: 'Jerusalem', kind: 'battle',
      aftermathTitle: 'Jerusalem, and no massacre',
      stakes: 'Eighty-eight years after the crusaders took Jerusalem and killed most of the people in it, the city is surrounded again. How this is done will be remembered longer than that it was done.',
      beats: [
        { at: 70, speaker: 'Balian of Ibelin', text: 'If there is no quarter, we will destroy the Dome and the Aqsa and kill our own prisoners before you take a stone of it.' },
        { at: 160, speaker: 'Salah ad-Din', text: 'There will be terms. Ransoms for those who can pay and mercy for those who cannot. I will not answer 1099 with 1187.' },
      ],
      history: 'After Hattin, most of the kingdom’s cities fell rapidly. Balian of Ibelin organized Jerusalem’s defense, and Saladin began a formal siege in September. When a breach became likely, Balian threatened desperate destruction and negotiated terms.\n\nJerusalem surrendered on 2 October. Many inhabitants paid ransom and left; others were enslaved when ransoms were not met, though releases and remissions also occurred. The city was not subjected to the massacre that had followed the crusader capture in 1099.',
      objective: 'Break Jerusalem’s defending army and compel surrender',
      opening: 'Jerusalem is surrounded, but its holy places and population make a storming dangerous to everyone.',
      turningPoint: 'The defenders know the wall can be breached. Defeat their field force and leave room for terms.',
      ending: 'Jerusalem surrenders by negotiation on 2 October 1187. The city returns to Muslim rule after eighty-eight years.',
      hints: ['Defeat the defending army; this mission does not require destroying the city.', 'Use Mamluks to isolate cavalry while infantry holds the line.'],
    },
    {
      id: 'saladin-06-jaffa', title: 'The Lion and the Sultan', act: 'Act III — Jerusalem and the Lionheart',
      date: '1191–1192', location: 'Arsuf and Jaffa', kind: 'defend',
      aftermathTitle: 'The truce with the Lionheart',
      stakes: 'Richard has beaten him in the field more than once and cannot hold what he takes. The war is now about who runs out of army, money and patience first.',
      beats: [
        { at: 70, speaker: 'Salah ad-Din', text: 'The English king fights better than any of them and governs a kingdom four months’ travel away. Time is my ally, not his.' },
        { at: 160, speaker: 'Richard I', text: 'Send word to the Sultan that I hold Jaffa and I cannot hold Jerusalem, and he knows both. Let us make terms while there is still an army on either side to make them with.' },
      ],
      history: 'The fall of Jerusalem provoked the Third Crusade. Richard I of England captured Acre and defeated Saladin at Arsuf in September 1191, securing much of the coast. Neither side could translate battlefield success into complete victory.\n\nAfter further fighting around Jaffa, Saladin and Richard concluded a truce in September 1192. The Franks retained a coastal strip, Jerusalem remained under Saladin, and Christian pilgrims were allowed access. Saladin died in Damascus in March 1193.',
      objective: 'Preserve Saladin’s army until negotiations at Jaffa begin',
      opening: 'Richard’s disciplined column has won at Arsuf and holds the coast. Jerusalem remains inland, beyond his secure reach.',
      turningPoint: 'Neither army can force the final decision it wants. Hold the road while envoys move between Jaffa and the sultan’s camp.',
      ending: 'The 1192 truce leaves Jerusalem with Saladin and a Frankish state on the coast. Saladin dies the following year, his union already under strain but his central achievement intact.',
      hints: ['Defend for 210 seconds while the diplomatic ending develops.', 'Do not pursue Richard’s heavy troops beyond supporting range.'],
    },
  ],
};

const sources = [henrySource, hardradaSource, joanSource, genghisSource, alexiosSource, saladinSource];

export const legendaryCampaigns: CampaignDef[] = [];
export const legendaryScenarios: ScenarioDef[] = [];

for (const source of sources) {
  const scenarios = source.chapters.map((chapter, index) => makeChapter(source, chapter, index));
  legendaryScenarios.push(...scenarios);
  legendaryCampaigns.push(makeCampaign(source, scenarios));
}

export const henryCampaign = legendaryCampaigns[0];
export const hardradaCampaign = legendaryCampaigns[1];
export const joanCampaign = legendaryCampaigns[2];
export const genghisCampaign = legendaryCampaigns[3];
export const alexiosCampaign = legendaryCampaigns[4];
export const saladinCampaign = legendaryCampaigns[5];
