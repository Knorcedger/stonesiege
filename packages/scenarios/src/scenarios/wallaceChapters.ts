// The original Wallace campaign was authored as six long scenarios. These chapter
// variants reuse those battlefields and their strongest trigger sequences, but put a
// clean victory boundary between economy/preparation and the battle that follows.

import type {
  ChapterDifficulty, ChapterStory, ScenarioDef, ScenarioEntity, ScenarioPlayer,
  TriggerDef, TriggerEffect,
} from '../schema';
import { wallace1 } from './wallace1';
import { wallace2 } from './wallace2';
import { wallace3 } from './wallace3';
import { wallace4 } from './wallace4';
import { wallace5 } from './wallace5';
import { wallace6 } from './wallace6';

const IMAGE = {
  uprising: '/campaign/wallace/act-1-lanark.webp',
  stirling: '/campaign/wallace/act-2-stirling.webp',
  guardian: '/campaign/wallace/act-3-guardian.webp',
  falkirk: '/campaign/wallace/act-4-falkirk.webp',
  unbroken: '/campaign/wallace/act-5-unbroken.webp',
} as const;

const trigger = (scenario: ScenarioDef, id: string): TriggerDef => {
  const found = scenario.triggers.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing trigger '${id}' in ${scenario.id}`);
  return found;
};

const effectsWithout = (
  source: TriggerDef,
  reject: (effect: TriggerEffect) => boolean,
): TriggerDef => ({ ...source, effects: source.effects.filter((effect) => !reject(effect)) });

const withEffects = (source: TriggerDef, effects: TriggerEffect[]): TriggerDef => ({ ...source, effects });

const withTimer = (source: TriggerDef, seconds: number): TriggerDef => ({
  ...source,
  conditions: source.conditions.map((condition) => (
    condition.kind === 'timerSeconds' ? { ...condition, seconds } : condition
  )),
});

const withoutSpawnUnits = (source: TriggerDef, defId: string, count: number): TriggerDef => {
  let removed = 0;
  return {
    ...source,
    effects: source.effects.map((effect) => {
      if (effect.kind !== 'spawn') return effect;
      return {
        ...effect,
        entities: effect.entities.filter((entity) => {
          if (entity.def !== defId || removed >= count) return true;
          removed++;
          return false;
        }),
      };
    }),
  };
};

const units = (
  def: string,
  player: number,
  coords: Array<[number, number]>,
): ScenarioEntity[] => coords.map(([x, y]) => ({ def, player, x, y }));


/**
 * Message-only story beats on a clock. The middle of a chapter used to be
 * silent — an opening line, then nothing until the victory line — so these
 * carry the chapter's story while it is being played. They touch no game
 * state: every effect is a banner, which is why they can be timed loosely
 * without interacting with the objectives around them.
 */
const beats = (
  chapterId: string,
  lines: Array<{ at: number; speaker: string; text: string }>,
): TriggerDef[] => lines.map((line, index) => ({
  id: `${chapterId}-beat-${index + 1}`,
  conditions: [{ kind: 'timerSeconds', seconds: line.at }],
  effects: [{ kind: 'message', speaker: line.speaker, text: line.text }],
}));

const playersWith = (
  base: ScenarioDef,
  human: Partial<ScenarioPlayer>,
  bots: Record<number, Partial<ScenarioPlayer>> = {},
): ScenarioPlayer[] => base.players.map((player, index) => ({
  ...player,
  ...(index === 0 ? human : bots[index + 1] ?? {}),
}));

interface ChapterOptions {
  base: ScenarioDef;
  id: string;
  index: number;
  title: string;
  act: string;
  date: string;
  location: string;
  estimatedMinutes: string;
  image: string;
  imageAlt: string;
  difficulty: ChapterDifficulty;
  story: ChapterStory;
  history: string;
  objectives: string[];
  hints: string[];
  triggers: TriggerDef[];
  entities?: ScenarioEntity[];
  players?: ScenarioPlayer[];
  startCamera?: { x: number; y: number };
}

const chapter = (options: ChapterOptions): ScenarioDef => ({
  ...options.base,
  id: options.id,
  campaign: 'wallace',
  index: options.index,
  title: options.title,
  chapter: {
    act: options.act,
    number: options.index + 1,
    date: options.date,
    location: options.location,
    estimatedMinutes: options.estimatedMinutes,
    image: options.image,
    imageAlt: options.imageAlt,
    difficulty: options.difficulty,
  },
  story: options.story,
  briefing: {
    history: options.history,
    objectives: options.objectives,
    hints: options.hints,
  },
  players: options.players ?? options.base.players,
  entities: options.entities ?? options.base.entities,
  triggers: options.triggers,
  startCamera: options.startCamera ?? options.base.startCamera,
});

// ------------------------------------------------------------------ Act I

const c01Final = withEffects(trigger(wallace1, 't08-vils'), [
  { kind: 'objectiveComplete', id: 'obj-vils' },
  { kind: 'playSting', sting: 'victory' },
  { kind: 'message', speaker: 'Narrator', text: 'Night falls over the glen. The camp is fed, roofed, and hidden. Word comes: Heselrig sits in judgement at Lanark tomorrow.' },
  { kind: 'message', speaker: 'Wallace', text: 'Then tomorrow the sheriff answers his own ledger. Call the kin down from the hills.' },
  { kind: 'victory' },
]);

export const wallaceChapter01 = chapter({
  base: wallace1,
  id: 'wallace-01-ledger',
  index: 0,
  title: 'A Name in the Ledger',
  act: 'Act I — The Outlaw',
  date: 'May 1297',
  location: 'Lanarkshire',
  estimatedMinutes: '8–12 min',
  image: IMAGE.uprising,
  imageAlt: 'Wallace musters a small band on a misty ridge above Lanark.',
  difficulty: {
    rating: 1,
    note: 'A sheltered opening: nobody attacks the glen while you learn to gather, build, and feed a camp.',
  },
  story: {
    stakes: 'An outlaw band that cannot feed itself has to scatter by winter. Everything Wallace does later depends on surviving this ordinary week.',
    cast: [
      {
        name: 'William Wallace',
        role: 'Younger son of a Clydesdale landholder',
        note: 'Not a lord, not a knight, and not yet in any English record. He lives outside the law on the goodwill of kin and tenants.',
      },
      {
        name: 'Sir William Heselrig',
        role: 'English Sheriff of Lanark',
        note: 'Keeps Edward’s peace in Clydesdale through fines, seizures, and hangings. Anyone recognised at Lanark market is his to judge.',
      },
      {
        name: 'Edward I',
        role: 'King of England',
        note: 'Has stripped John Balliol of the Scottish crown, carried the Stone of Scone south, and set English officers over Scottish towns.',
      },
    ],
    aftermath: {
      title: 'The night before Lanark',
      paragraphs: [
        'The fires are banked, the roofs are on, and there is grain enough that no one has to walk down to Lanark market and be recognised. That is the entire victory, and it is a real one.',
        'A band that can feed itself no longer has to disperse at the first hard week — which means Wallace, for the first time, gets to choose when he is seen.',
        'A rider comes up the glen after dark with news from the town: Sheriff Heselrig holds his court in the morning.',
      ],
    },
    historyNote: 'The hidden camp is a dramatisation. What the record supports is its shape — in the spring of 1297 Wallace was living outside English law in Clydesdale, kept alive by kin and tenantry, months before any chronicler thought him worth naming.',
  },
  history:
    'Scotland has no king. Edward I has carried the Stone of Scone south, stripped John Balliol of his crown, and placed English sheriffs over Scottish towns. In Lanark, Sheriff William Heselrig keeps the new order with fines, seizures, and the rope.\n\n' +
    'William Wallace is not yet a Guardian, a knight, or a name known beyond Clydesdale. He is a landholder’s son with kin in the hills and a grievance the surviving records do not fully explain. Later stories give the grievance a murdered wife; history gives us the result. Before any blow can be struck, his hidden camp must live through the week.',
  objectives: [
    'Scout the shepherd’s clearing and ford',
    'Feed and shelter the hidden camp',
    'Raise a working settlement of six villagers',
  ],
  hints: wallace1.briefing.hints,
  triggers: [
    ...beats('c01', [
      { at: 40, speaker: 'Wallace', text: 'Work quietly. Smoke carries down the glen, and Heselrig pays men to watch for smoke.' },
      { at: 110, speaker: 'A tenant of Elderslie', text: 'My brother swore to Edward in August. His name is on the roll at Berwick with every other landholder in Scotland. He says there was no refusing it.' },
      { at: 190, speaker: 'Wallace', text: 'There was refusing it. There was just no surviving the refusal. That is what we are changing.' },
      { at: 300, speaker: 'Narrator', text: 'Across Scotland this spring, small bands like this one are doing the same arithmetic: how many men, how much grain, how long before someone informs.' },
      { at: 420, speaker: 'Wallace', text: 'Grain first, roofs second, blades last. A hungry man cannot hold a spear for an hour.' },
    ]),
    ...['t01-intro', 't02-move-1', 't03-move-2', 't04-gather', 't05-food', 't06-houses', 't07-wood']
      .map((id) => trigger(wallace1, id)),
    c01Final,
  ],
});

const lanarkBand: ScenarioEntity[] = [
  { def: 'heroWallace', player: 1, x: 35, y: 57, ref: 'wallace' },
  ...units('militia', 1, [[36, 57], [37, 57], [35, 58], [36, 58], [37, 58], [36, 59]]),
];

export const wallaceChapter02 = chapter({
  base: wallace1,
  id: 'wallace-02-lanark',
  index: 1,
  title: 'The Sheriff of Lanark',
  act: 'Act I — The Outlaw',
  date: 'May 1297',
  location: 'Lanark',
  estimatedMinutes: '5–8 min',
  image: IMAGE.uprising,
  imageAlt: 'Wallace and armed countrymen overlook the English-held town of Lanark.',
  difficulty: {
    rating: 2,
    note: 'A small strike force with no economy behind it. Losses cannot be replaced, and Wallace’s death ends the chapter.',
  },
  story: {
    stakes: 'One band, one morning, one chance. If Wallace falls inside Lanark, the rising dies with the man who started it — and the sheriff hangs the rest by the week’s end.',
    cast: [
      {
        name: 'Sir William Heselrig',
        role: 'Sheriff of Lanark',
        note: 'The nearest face of English government. Killing him is not a raid on a garrison; it is an attack on the king’s law itself.',
      },
      {
        name: 'Marion Braidfute',
        role: 'Wallace’s wife, in legend',
        note: 'The poet Blind Harry, writing nearly two centuries later, says Heselrig killed her and that Lanark was revenge. Contemporary sources record only the killing, never the reason.',
      },
      {
        name: 'The Lanark garrison',
        role: 'English soldiery',
        note: 'Enough men to hold a town against outlaws, and far too many to fight in the open. Speed is the only advantage Wallace has.',
      },
    ],
    aftermath: {
      title: 'A killing that could not be undone',
      paragraphs: [
        'Heselrig is dead in his own court, and with him the last chance of this being treated as a private quarrel. A man who kills a royal sheriff cannot be pardoned, bought, or quietly forgotten. He can only win or be executed.',
        'The news travels faster than any rider Wallace sends. In Ayrshire, in Ettrick, in the north where Andrew Moray is already in arms, men hear the same sentence: an English official was struck down, and the man who did it is still alive.',
        'Sir William Douglas — a great name, a real lord — begins to look for him. What was an outlaw becomes a cause with recruits.',
      ],
      quote: {
        text: 'I could not be a traitor to Edward, for I was never his subject.',
        source: 'Wallace at his trial, 1305 — the argument that begins here, at Lanark',
      },
    },
    historyNote: 'The attack on Lanark in May 1297 is the first firmly dated event in Wallace’s life. The motive is not. Blind Harry’s murdered wife is a later tradition, dramatised here as the campaign’s open question rather than stated as fact.',
  },
  history:
    'At dawn, Wallace comes down from the hills with a few armed kinsmen. Heselrig has a garrison, a tower, and the authority of the English king. Wallace has surprise and one narrow purpose.\n\n' +
    'The attack on Lanark in May 1297 is the first fixed point in Wallace’s story. When the sheriff dies, the act is no longer a private feud. News travels across Scotland that an English official can be struck—and that the man who struck him still lives.',
  objectives: ['Enter Lanark and kill Sheriff William Heselrig'],
  hints: [
    'Keep the band together; Wallace is formidable, but his death ends the rising.',
    'The sheriff holds court on the south road. You do not need to destroy the whole town.',
  ],
  entities: [...wallace1.entities.filter((entity) => entity.player === 2), ...lanarkBand],
  startCamera: { x: 36, y: 58 },
  triggers: [
    ...beats('c02', [
      { at: 25, speaker: 'Wallace', text: 'Nobody stops for plunder. We are not here to be enriched — we are here to be understood.' },
      { at: 70, speaker: 'A kinsman', text: 'There are more of them than we counted. If the garrison forms up in the square we are finished.' },
      { at: 110, speaker: 'Wallace', text: 'Then we do not let them form up. Straight for the court, and take the sheriff before the horn is done sounding.' },
      { at: 180, speaker: 'Narrator', text: 'Every man in this street knows what happens to the families of failed rebels. They came anyway.' },
    ]),
    {
      id: 'intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Narrator', text: 'Lanark, May 1297. A grievance becomes a rebellion.' },
        { kind: 'message', speaker: 'Wallace', text: 'Heselrig, not the town. Strike fast, and leave before the garrison closes its fist.' },
        { kind: 'objectiveAdd', id: 'obj-heselrig', text: 'Kill William Heselrig, Sheriff of Lanark' },
        { kind: 'revealArea', player: 1, area: { x: 58, y: 28, w: 16, h: 18 } },
      ],
    },
    {
      id: 'victory', conditions: [{ kind: 'refDestroyed', ref: 'heselrig' }], effects: [
        { kind: 'objectiveComplete', id: 'obj-heselrig' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'Heselrig is dead. Across Scotland, men look at their own garrisons and begin to count spears.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 'defeat', conditions: [{ kind: 'refDestroyed', ref: 'wallace' }], effects: [
        { kind: 'defeat', reason: 'Wallace has fallen at Lanark.' },
      ],
    },
  ],
});

const c03Intro = trigger(wallace2, 't01-intro');
const c03Age = effectsWithout(
  trigger(wallace2, 't04-feudal'),
  (effect) => effect.kind === 'objectiveAdd' || effect.kind === 'armTrigger',
);

export const wallaceChapter03 = chapter({
  base: wallace2,
  id: 'wallace-03-tay',
  index: 2,
  title: 'The Camp on the Tay',
  act: 'Act I — The Outlaw',
  date: 'Summer 1297',
  location: 'The River Tay',
  estimatedMinutes: '8–12 min',
  image: IMAGE.uprising,
  imageAlt: 'Scottish rebels gather beneath a cold dawn sky.',
  difficulty: {
    rating: 2,
    note: 'An economy chapter with room to breathe: English patrols probe the camp, but no serious assault comes before you are ready.',
  },
  story: {
    stakes: 'Raids live off what they steal. An army needs farms, timber, iron, and pay — or Wallace’s recruits go home at harvest and the rising ends without a battle.',
    cast: [
      {
        name: 'Sir William Douglas “the Hardy”',
        role: 'Lord of Douglas',
        note: 'The first great name to join Wallace. A lord riding with an outlaw tells lesser men the rising is survivable.',
      },
      {
        name: 'Andrew Moray',
        role: 'Leader of the northern rising',
        note: 'A knight’s son, taken prisoner at Dunbar and escaped from Chester. He is raising the north at the same time, and has never met Wallace.',
      },
      {
        name: 'William de Ormesby',
        role: 'Edward’s justiciar in Scotland',
        note: 'Sits at Scone fining every Scot who refuses to swear to Edward. His court is turning neutral men into rebels faster than Wallace could.',
      },
    ],
    aftermath: {
      title: 'From a band to an army',
      paragraphs: [
        'The Tay camp has fields, a mill, a forge, and a treasury. None of it is glorious and all of it is the difference between a rebellion and a season of banditry.',
        'Men are arriving faster than they can be armed — not only Wallace’s tenantry now, but Douglas’s riders and small landholders who have decided which way this is going.',
        'Two risings are running in Scotland this summer and neither knows much of the other. In the north, Moray is taking castles. In the south, Wallace can finally think about a target worth the name.',
      ],
    },
    historyNote: 'Wallace’s summer camp on the Tay stands in for a documented process rather than a documented place: through mid-1297 his following grew from a raiding party into a force capable of besieging garrisons and holding the field.',
  },
  history:
    'Lanark rings like a bell, and Scotland answers. Men come out of Ettrick and the western hills; Sir William Douglas, called “the Hardy,” brings the first great name to Wallace’s rising. Farther north, Andrew Moray has begun a second revolt.\n\n' +
    'A raid can live from a sack. A rebellion needs farms, iron, carpenters, and time. On the Tay, Wallace’s growing band must become an army that can still be in the field when summer ends.',
  objectives: wallace2.briefing.objectives,
  hints: wallace2.briefing.hints,
  triggers: [
    ...beats('c03', [
      { at: 50, speaker: 'Douglas', text: 'You have farmers, Wallace. I have riders and a name Edward already hates. Between us we might make something an English earl has to take seriously.' },
      { at: 140, speaker: 'Wallace', text: 'Then teach the farmers to stand when the riders come at them. That is the whole of it. Everything else is supply.' },
      { at: 240, speaker: 'Narrator', text: 'In the north, Andrew Moray is taking castles Wallace has never seen, in a rising that started for its own reasons. Neither leader has met the other.' },
      { at: 360, speaker: 'Douglas', text: 'Word from Irvine — the nobles are talking terms with the English rather than fighting. Half of Scotland wants this over before harvest.' },
      { at: 480, speaker: 'Wallace', text: 'Let them talk. Terms with Edward are just a slower way of losing. Keep building.' },
    ]),
    c03Intro,
    trigger(wallace2, 't02-camp'),
    trigger(wallace2, 't03-gold'),
    c03Age,
    {
      id: 'chapter-complete',
      conditions: [
        { kind: 'triggerFired', triggerId: 't02-camp' },
        { kind: 'triggerFired', triggerId: 't03-gold' },
        { kind: 'triggerFired', triggerId: 't04-feudal' },
      ],
      effects: [
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Douglas', text: 'A camp worth defending. Now let us give Ormesby reason to fear it.' },
        { kind: 'victory' },
      ],
    },
  ],
});

const sconeArmy: ScenarioEntity[] = [
  { def: 'heroWallace', player: 1, x: 38, y: 67, ref: 'wallace' },
  ...units('militia', 1, [[35, 68], [36, 68], [37, 68], [35, 69], [36, 69], [37, 69]]),
  ...units('spearman', 1, [[34, 70], [35, 70], [36, 70], [37, 70], [38, 70], [39, 70]]),
  ...units('archer', 1, [[35, 71], [36, 71], [37, 71], [38, 71]]),
  { def: 'batteringRam', player: 1, x: 40, y: 69 },
  { def: 'batteringRam', player: 1, x: 41, y: 69 },
];

const raidRefs = ['raid-1', 'raid-2', 'raid-3', 'raid-4', 'raid-5', 'raid-6', 'raid-7', 'raid-8'];

export const wallaceChapter04 = chapter({
  base: wallace2,
  id: 'wallace-04-ormesby',
  index: 3,
  title: 'The Justiciar Flees',
  act: 'Act I — The Outlaw',
  date: 'June 1297',
  location: 'Scone',
  estimatedMinutes: '8–12 min',
  image: IMAGE.uprising,
  imageAlt: 'Wallace leads armed Scots toward an English-held burgh.',
  difficulty: {
    rating: 3,
    note: 'A timed field battle. The patrol arrives before your army is comfortable, and the ford tower covers the only direct road to Scone.',
  },
  story: {
    stakes: 'Ormesby’s court is where Scotland is being turned English one fine at a time. Let him reach a walled town with his rolls intact and English law simply carries on behind stronger gates.',
    cast: [
      {
        name: 'William de Ormesby',
        role: 'Chief justiciar of Scotland',
        note: 'Edward’s law in person, holding court at Scone — the crowning-place of Scottish kings — and outlawing everyone who will not swear.',
      },
      {
        name: 'Sir William Douglas',
        role: 'Wallace’s first noble ally',
        note: 'Rides with him to Scone. For Douglas this is also personal: Edward has held his lands and his family before.',
      },
      {
        name: 'Scone Abbey',
        role: 'The crowning-place',
        note: 'Where Scottish kings were made, and where the Stone Edward carried to Westminster used to sit. Holding court here is a deliberate humiliation.',
      },
    ],
    aftermath: {
      title: 'The justiciar runs',
      paragraphs: [
        'Ormesby does not stand and fight. He goes south with what he can carry and leaves the ledgers burning — which is exactly the picture Scotland needed: the king’s justice, running.',
        'The raid on Scone makes the rising public and unmistakable. English officials across the country start writing to London about a general revolt rather than local disorder.',
        'Then the summer turns. Douglas is besieged and forced to submit at Irvine while the nobles argue over terms. Wallace does not submit. He moves north — where Andrew Moray, having swept the English out of Moray and Aberdeenshire, is marching to meet him.',
      ],
    },
    historyNote: 'Ormesby genuinely fled Scone in the summer of 1297 ahead of Wallace and Douglas, leaving much behind. The patrol battle and the ford tower are gameplay; the flight and the plunder are in the record.',
  },
  history:
    'At Scone—the crowning-place of Scottish kings—William de Ormesby now sits as Edward’s chief justiciar, levying fines against Scots who refuse the English oath. Wallace and Douglas march to end the bitter joke.\n\n' +
    'Ormesby learns they are coming and prepares to run. His field patrol rides to buy him time. Break the patrol, cross the ford, and burn the hall with its ledgers before English law escapes behind stronger walls.',
  objectives: ['Break the English patrol', 'Destroy Ormesby’s hall at Scone'],
  hints: [
    'Spearmen counter the patrol’s mounted scouts.',
    'Keep the rams behind your infantry until the patrol breaks, then send them against Ormesby’s hall.',
    'The ford tower covers the direct road. Bring it down or move quickly past its range.',
  ],
  players: playersWith(wallace2, { age: 'feudal', resources: { food: 300, wood: 200, gold: 150 } }),
  entities: [...wallace2.entities.filter((entity) => entity.player === 2), ...sconeArmy],
  startCamera: { x: 38, y: 67 },
  triggers: [
    ...beats('c04', [
      { at: 60, speaker: 'Douglas', text: 'Scone. Where our kings were made — and Edward has his clerk sitting in it, fining men for not swearing to him.' },
      { at: 120, speaker: 'Wallace', text: 'The stone is gone to Westminster, the crown is gone with Balliol. The place is still ours. Take it back for an afternoon and let people see it.' },
      { at: 220, speaker: 'Narrator', text: 'Ormesby has a strongbox, a fast horse, and no intention of testing whether his patrol holds.' },
      { at: 330, speaker: 'Douglas', text: 'Burn the rolls, not the abbey. What is written in those ledgers is the only thing holding a man to Edward’s oath.' },
    ]),
    {
      id: 'intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Douglas', text: 'Ormesby is packing his silver. His patrol is already on the road.' },
        { kind: 'objectiveAdd', id: 'obj-hold', text: 'Break the English patrol' },
        { kind: 'objectiveAdd', id: 'obj-ormesby', text: 'Destroy Ormesby’s hall at Scone' },
        { kind: 'revealArea', player: 1, area: { x: 55, y: 40, w: 12, h: 12 } },
      ],
    },
    {
      id: 'raid', conditions: [{ kind: 'timerSeconds', seconds: 25 }], effects: [
        { kind: 'spawn', entities: [
          ...units('militia', 2, [[56, 43], [57, 43], [58, 43], [56, 44]])
            .map((entity, index) => ({ ...entity, ref: raidRefs[index] })),
          ...units('archer', 2, [[57, 44], [58, 44]])
            .map((entity, index) => ({ ...entity, ref: raidRefs[index + 4] })),
          ...units('scout', 2, [[55, 43], [55, 44]])
            .map((entity, index) => ({ ...entity, ref: raidRefs[index + 6] })),
        ] },
        { kind: 'aiAttackNow', player: 2, targetArea: { x: 30, y: 62, w: 18, h: 18 } },
        { kind: 'playSting', sting: 'alert' },
      ],
    },
    {
      id: 'raid-broken', conditions: [{ kind: 'refsDestroyed', refs: raidRefs, all: true }], effects: [
        { kind: 'objectiveComplete', id: 'obj-hold' },
        { kind: 'message', speaker: 'Douglas', text: 'The road is open. Across the ford—before the justiciar finds a faster horse.' },
        { kind: 'revealArea', player: 1, area: { x: 62, y: 8, w: 30, h: 24 } },
      ],
    },
    {
      id: 'victory', conditions: [
        { kind: 'refDestroyed', ref: 'ormesby_hall' },
        { kind: 'objectiveComplete', objectiveId: 'obj-hold' },
      ], effects: [
        { kind: 'objectiveComplete', id: 'obj-ormesby' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'Ormesby flees south. In the north, Andrew Moray’s separate rising is sweeping English garrisons away. Soon the two armies will meet.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 'defeat', conditions: [{ kind: 'refDestroyed', ref: 'wallace' }], effects: [
        { kind: 'defeat', reason: 'Wallace has fallen at Scone.' },
      ],
    },
  ],
});

// ------------------------------------------------------------------ Act II

export const wallaceChapter05 = chapter({
  base: wallace3,
  id: 'wallace-05-two-risings',
  index: 4,
  title: 'Two Risings, One Army',
  act: 'Act II — The Great Victory',
  date: 'September 1297',
  location: 'Abbey Craig, Stirling',
  estimatedMinutes: '6–10 min',
  image: IMAGE.stirling,
  imageAlt: 'Wallace and Moray watch the narrow bridge at Stirling.',
  difficulty: {
    rating: 2,
    note: 'Preparation under a clock rather than a sword: build the spear and javelin line before Cressingham loses patience and crosses.',
  },
  story: {
    stakes: 'Warenne’s host outclasses anything Scotland can field in the open. If the foot soldiers are not ready and in position when the English cross, the one advantage of the ground is wasted.',
    cast: [
      {
        name: 'Andrew Moray',
        role: 'Joint commander of the army of Scotland',
        note: 'Brings the northern rising, a knight’s training, and a reputation among men who will not take orders from a commoner.',
      },
      {
        name: 'John de Warenne, Earl of Surrey',
        role: 'English commander',
        note: 'Old, cautious, and reluctant. He wants to negotiate or outflank rather than force a narrow bridge.',
      },
      {
        name: 'Hugh de Cressingham',
        role: 'Treasurer of English Scotland',
        note: 'Loathed as a tax collector, impatient with delay, and unwilling to pay for another day of the army’s upkeep. His impatience is the Scottish plan.',
      },
    ],
    aftermath: {
      title: 'Spears above the Forth',
      paragraphs: [
        'Ten deep ranks of spears and eight files of javelins stand on Abbey Craig, looking down on a wooden bridge two horsemen wide.',
        'Wallace and Moray now command one army under two names, and the men in it are almost entirely commoners: small tenants, townsmen, the sons of farms. Nothing in European warfare says such men can beat mounted knights.',
        'Below them, the English are arguing about whether to cross.',
      ],
    },
    historyNote: 'Moray and Wallace commanded jointly at Stirling — surviving letters were issued in both their names. The training targets are gameplay shorthand for an army that really was overwhelmingly infantry.',
  },
  history:
    'Andrew Moray has driven the English out of northern Scotland after escaping captivity at Avoch. His rising and Wallace’s are different in temper and origin, but at Stirling they become one army.\n\n' +
    'Below Abbey Craig, John de Warenne’s host must cross the Forth by one narrow wooden bridge. Hugh de Cressingham urges an immediate attack. Prepare the foot soldiers who will turn English confidence into a trap.',
  objectives: ['Field 10 Spearmen and 8 Skirmishers before the English crossing'],
  hints: wallace3.briefing.hints,
  triggers: [
    ...beats('c05', [
      { at: 45, speaker: 'Moray', text: 'My men came out of Avoch and Inverness. Yours came out of Clydesdale. Today they learn to stand in one line, or the Forth will not save us.' },
      { at: 130, speaker: 'Wallace', text: 'Spears close, and no man breaks the ring to chase a fallen knight. The ring is the reason he fell.' },
      { at: 230, speaker: 'Narrator', text: 'Below them, Warenne has offered terms twice and sent friars to negotiate. Wallace’s answer — that they have come to free the kingdom, and the English may come and prove otherwise — is remembered by English chroniclers.' },
      { at: 340, speaker: 'Moray', text: 'Cressingham is counting the daily cost of the army out loud, where his own soldiers can hear him. He will force the crossing before the week is out.' },
    ]),
    {
      id: 'intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Moray', text: 'Spears for their horses, javelins for their bowmen. We need ten and eight before Cressingham loses patience.' },
        { kind: 'objectiveAdd', id: 'obj-prepare', text: 'Field 10 Spearmen and 8 Skirmishers' },
      ],
    },
    {
      id: 'prepared', conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['spearman', 'pikeman'], atLeast: 10 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['skirmisher'], atLeast: 8 },
      ], effects: [
        { kind: 'objectiveComplete', id: 'obj-prepare' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Wallace', text: 'The line is ready. Now we let the river do the counting.' },
        { kind: 'victory' },
      ],
    },
    trigger(wallace3, 't13-defeat-wallace'),
  ],
});

const stirlingReinforcements = [
  ...units('spearman', 1, [[54, 38], [55, 38], [56, 38], [57, 38]]),
  ...units('skirmisher', 1, [[58, 38], [59, 38], [60, 38], [61, 38]]),
];

export const wallaceChapter06 = chapter({
  base: wallace3,
  id: 'wallace-06-stirling',
  index: 5,
  title: 'Stirling Bridge',
  act: 'Act II — The Great Victory',
  date: '11 September 1297',
  location: 'The River Forth',
  estimatedMinutes: '10–15 min',
  image: IMAGE.stirling,
  imageAlt: 'English cavalry crosses the narrow Stirling Bridge toward Scottish spears.',
  difficulty: {
    rating: 4,
    note: 'Successive English waves cross the bridge and probe the western ford while your camp must keep replacing losses. Giving up the choke point loses the battle.',
  },
  story: {
    stakes: 'This is the battle the whole rising has been building toward. Win, and Scotland is governed by Scots again. Lose, and Wallace is a bandit whose luck ran out.',
    cast: [
      {
        name: 'The bridge',
        role: 'The Scottish plan',
        note: 'Narrow enough for two horsemen abreast. Every Englishman who crosses puts a deep river at his back and cannot be reinforced quickly.',
      },
      {
        name: 'Hugh de Cressingham',
        role: 'English treasurer',
        note: 'Overrules Warenne’s caution and orders the crossing to begin. He will die on the north bank.',
      },
      {
        name: 'Andrew Moray',
        role: 'Joint commander',
        note: 'Leads from the front and takes a wound in the fighting. Scotland does not yet know what that will cost.',
      },
    ],
    aftermath: {
      title: '11 September 1297',
      paragraphs: [
        'The vanguard that crossed the Forth is destroyed against the spears with the river behind it. Warenne, watching from the south bank with the greater part of his army intact, orders the bridge broken and rides for Berwick.',
        'Cressingham is killed on the field. What is done to his body afterwards — flayed, and pieces of the skin taken as tokens — is reported by English chroniclers with horror and by Scottish ones without much regret. It is a measure of how the tax collector was hated.',
        'A commoner has beaten a feudal army in open battle. Within weeks Wallace is issuing letters as a governor of the realm, and southern Scotland is effectively free of English administration for the first time since 1296.',
        'But Andrew Moray is badly wounded. He dies before the year is out, and Wallace is left to lead alone.',
      ],
      quote: {
        text: 'William Wallace and Andrew Moray, leaders of the army of the kingdom of Scotland.',
        source: 'The Lübeck letter, 11 October 1297 — sent a month after the battle, telling Hanseatic merchants that Scotland’s ports were open again',
      },
    },
    historyNote: 'The Scottish victory, Cressingham’s death, and Warenne’s retreat are well documented; the exact tactical sequence is not. Casualty figures in the chronicles are unreliable in both directions.',
  },
  history:
    'The English vanguard begins to cross two horsemen abreast. Each man who reaches the north bank puts the Forth behind him. Warenne delays; Cressingham demands speed.\n\n' +
    'Wallace and Moray wait until enough of the host is trapped on their side of the river. Hold the bridgehead, answer the western ford, and break an army of knights with common foot soldiers.',
  objectives: ['Hold the Scottish camp', 'Destroy the English force north of the Forth'],
  hints: [
    'Hold the north end of the bridge. Chasing the first wave onto the causeway gives up the choke point.',
    'Keep the villagers on the starting farms and wood line so the Barracks and Archery Range can replace losses.',
    ...wallace3.briefing.hints,
  ],
  entities: [...wallace3.entities, ...stirlingReinforcements],
  triggers: [
    ...beats('c06', [
      { at: 35, speaker: 'Wallace', text: 'Let them come. Every man who crosses that bridge puts a deep river between himself and his friends.' },
      { at: 150, speaker: 'Moray', text: 'Not yet — not yet. When enough of them are on this bank to be worth killing and too many to go back.' },
      { at: 260, speaker: 'Narrator', text: 'Warenne’s knights are the finest heavy cavalry in Europe. The men waiting for them are farmers with eight feet of ash and an iron head.' },
      { at: 380, speaker: 'Wallace', text: 'Hold the bridge end. The moment we chase them onto the causeway we give back the only advantage we have.' },
      { at: 520, speaker: 'Narrator', text: 'On the south bank, an English army still greater than the Scottish one is watching its own vanguard die and cannot reach it.' },
    ]),
    {
      id: 'battle-intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Narrator', text: 'Stirling Bridge, 11 September 1297. Cressingham orders the crossing.' },
        { kind: 'objectiveAdd', id: 'obj-hold-camp', text: 'Your camp must stand' },
        { kind: 'armTrigger', triggerId: 't04-wave-a' },
      ],
    },
    trigger(wallace3, 't04-wave-a'),
    trigger(wallace3, 't05a-signal-north'),
    trigger(wallace3, 't05b-signal-crossed'),
    trigger(wallace3, 't05-signal'),
    withTimer(trigger(wallace3, 't06-wave-b'), 90),
    withoutSpawnUnits(
      withoutSpawnUnits(withTimer(trigger(wallace3, 't07-wave-c'), 110), 'longbowman', 3),
      'manAtArms',
      3,
    ),
    withTimer(trigger(wallace3, 't08-wave-d'), 120),
    trigger(wallace3, 't09-ford-clear'),
    trigger(wallace3, 't10-mopup-gate'),
    trigger(wallace3, 't10b-mopup-drive'),
    trigger(wallace3, 't11-victory'),
    trigger(wallace3, 't12-moray-falls'),
    trigger(wallace3, 't13-defeat-wallace'),
    trigger(wallace3, 't14-defeat-camp'),
  ],
});

// ------------------------------------------------------------------ Act III

const c07Intro = effectsWithout(
  trigger(wallace4, 't01-intro'),
  (effect) => effect.kind === 'objectiveAdd' && effect.id === 'obj-castle-age',
);
const c07Ryton = effectsWithout(
  trigger(wallace4, 't03-ryton'),
  (effect) => effect.kind === 'armTrigger' && effect.triggerId === 't06-relief-1',
);

export const wallaceChapter07 = chapter({
  base: wallace4,
  id: 'wallace-07-winter',
  index: 6,
  title: 'A Guardian’s Winter',
  act: 'Act III — Guardian of Scotland',
  date: 'Winter 1297',
  location: 'Northumberland',
  estimatedMinutes: '10–15 min',
  image: IMAGE.guardian,
  imageAlt: 'Wallace’s raiders carry grain from a burning supply store through snow.',
  difficulty: {
    rating: 3,
    note: 'A long chapter with three separate demands — camp, raid, and treasury — while English garrisons in the area stay awake.',
  },
  story: {
    stakes: 'Wallace now has to govern. A victorious army that starves through the winter loses Scotland just as surely as a defeated one.',
    cast: [
      {
        name: 'Wallace, Guardian in all but title',
        role: 'Leader of the army of Scotland',
        note: 'Stirling made him the effective government of a country stripped bare by two years of war and requisition.',
      },
      {
        name: 'Northumberland',
        role: 'The other side of the border',
        note: 'English territory with full granaries. Carrying the war south feeds the Scottish army and takes the burden off Scottish farms.',
      },
      {
        name: 'Sir John de Graham',
        role: 'Wallace’s captain and friend',
        note: 'One of the few named men who stays with him from the good year to the bad one.',
      },
    ],
    aftermath: {
      title: 'Government by other means',
      paragraphs: [
        'The winter camp stands, the Ryton stores are ash, and there is gold in the treasury bought with English grain. The army will see the spring.',
        'This is what victory actually turns into: quartermastering, market prices, and hard choices about whose country gets eaten. The Scottish raids into Northumberland and Cumberland in the winter of 1297 were severe, and English chroniclers remembered them bitterly.',
        'Wallace begins issuing letters under his own seal, appointing to church offices, and writing to foreign merchants as the man responsible for Scotland. In March he is knighted and made sole Guardian of the realm — a commoner, governing a kingdom in the name of an absent king.',
      ],
    },
    historyNote: 'The Northumbrian raids and the resulting supply are documented. Ryton stands in for the many places named in English complaints of that winter; the camp economy is the game’s way of showing a logistical problem, not a specific event.',
  },
  history:
    'Stirling makes Wallace master of a hungry, war-stripped country. An army that cannot be fed at home must be fed elsewhere, so the Scots carry the war over the border. Tynedale burns and English garrisons bar their gates.\n\n' +
    'Establish a winter camp, take the stores at Ryton, and turn captured goods into the coin an army needs. Wallace’s war is becoming government by other means.',
  objectives: [
    'Establish a winter camp with 12 villagers, camps, a Mill, and 5 Farms',
    'Burn the Ryton supply store',
    'Build a Market and stockpile 300 gold',
  ],
  hints: wallace4.briefing.hints,
  triggers: [
    ...beats('c07', [
      { at: 55, speaker: 'Graham', text: 'Stirling made you the government, and the government has nothing in its stores. Scotland was eaten bare before we ever won it.' },
      { at: 165, speaker: 'Wallace', text: 'Then the war feeds itself south of the border. I would rather answer for burnt Northumbrian barns than bury Scots who starved.' },
      { at: 290, speaker: 'Narrator', text: 'English chroniclers of that winter describe the raids in terms usually saved for scripture. Their complaints are also evidence of how completely the border had reversed.' },
      { at: 420, speaker: 'Graham', text: 'The merchants want to know who guarantees their goods. They are asking for your seal, not the king’s.' },
      { at: 560, speaker: 'Wallace', text: 'Then they get my seal — in the name of King John, whether he is in a cell in England or not. This kingdom still has a king. He is simply not here.' },
    ]),
    c07Intro,
    trigger(wallace4, 't02-camp-done'),
    c07Ryton,
    trigger(wallace4, 't03b-market'),
    {
      id: 'chapter-complete', conditions: [
        { kind: 'objectiveComplete', objectiveId: 'obj-winter-camp' },
        { kind: 'objectiveComplete', objectiveId: 'obj-ryton' },
        { kind: 'objectiveComplete', objectiveId: 'obj-market' },
      ], effects: [
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'The camp will hold. Farther south, Corbridge and Hexham still provision English garrisons.' },
        { kind: 'victory' },
      ],
    },
    trigger(wallace4, 't11-defeat-wallace'),
  ],
});

const c08Victory = {
  ...trigger(wallace4, 't10-victory'),
  conditions: trigger(wallace4, 't10-victory').conditions.filter((condition) => (
    condition.kind !== 'objectiveComplete' || condition.objectiveId !== 'obj-ryton'
  )),
};

export const wallaceChapter08 = chapter({
  base: wallace4,
  id: 'wallace-08-guardian',
  index: 7,
  title: 'Fire on the Tyne',
  act: 'Act III — Guardian of Scotland',
  date: 'Winter 1297–1298',
  location: 'Corbridge and Hexham',
  estimatedMinutes: '10–15 min',
  image: IMAGE.guardian,
  imageAlt: 'Wallace rides past captured wagons while a priory remains untouched.',
  difficulty: {
    rating: 3,
    note: 'Two objectives under cavalry pressure, plus a restraint the game enforces: burning Hexham Priory fails the chapter.',
  },
  story: {
    stakes: 'Wallace gave the canons of Hexham his word. A leader who cannot hold his own army to a promise is exactly the brigand English propaganda says he is.',
    cast: [
      {
        name: 'The canons of Hexham',
        role: 'Priory clergy',
        note: 'They came out to meet the raiders rather than wait to be burned. Wallace granted them protection — and, by the account, admitted he could not fully control his own men.',
      },
      {
        name: 'Corbridge',
        role: 'Fortified crossing on the Tyne',
        note: 'The military position that has to break before the stores behind it can be taken.',
      },
      {
        name: 'Sir John de Graham',
        role: 'Wallace’s captain',
        note: 'Carries the order that the priory stands, to men who have watched English armies burn Scottish churches.',
      },
    ],
    aftermath: {
      title: 'The word he kept',
      paragraphs: [
        'Corbridge is broken, the military stores at Hexham are burning, and the priory is untouched. The distinction matters more than it looks: it is the difference between an army and a mob, and Wallace’s enemies would very much prefer the second.',
        'In the spring the community of the realm makes it official. At the Forest kirk, William Wallace — a younger son with no title — is knighted and named sole Guardian of Scotland, governing for the exiled King John.',
        'It is the highest point of his life, and it lasts four months. In the summer of 1298 Edward I comes north in person with the largest army he has ever raised.',
      ],
    },
    historyNote: 'The Hexham episode comes from the priory’s own chronicle tradition, which credits Wallace with protecting the house while conceding he could not restrain every man under him. It is one of the few glimpses of him as a person rather than a threat.',
  },
  history:
    'Wallace’s column reaches the fortified crossing at Corbridge and the requisitioned stores at Hexham. The campaign is harsh, but not indiscriminate: when frightened canons come out to meet him, Wallace promises the priory protection.\n\n' +
    'Break the fort, burn the military stores, and keep that promise. In the spring, the community of the realm will make the commoner a knight and sole Guardian of Scotland.',
  objectives: ['Break the fort at Corbridge', 'Burn the stores at Hexham', 'Hexham Priory must stand'],
  hints: [
    'Your two starting rams can break the gate, but cavalry can destroy them quickly.',
    'The priory is neutral. Keep attack-move orders clear of it.',
  ],
  players: playersWith(wallace4, { age: 'castle', resources: { food: 700, wood: 600, gold: 500, stone: 200 } }),
  entities: [
    ...wallace4.entities,
    { def: 'batteringRam', player: 1, x: 24, y: 20 },
    { def: 'batteringRam', player: 1, x: 25, y: 20 },
  ],
  triggers: [
    ...beats('c08', [
      { at: 45, speaker: 'Graham', text: 'The canons at Hexham came out to meet us rather than wait. They are asking for your protection in front of the whole column.' },
      { at: 120, speaker: 'Wallace', text: 'They have it. Stores and soldiers, nothing else. Any man who touches the priory answers to me before he answers to God.' },
      { at: 230, speaker: 'A raider', text: 'They burned our churches at Berwick with the people inside them.' },
      { at: 300, speaker: 'Wallace', text: 'I know what they did. That is precisely why we will not. We are not fighting to become them.' },
      { at: 430, speaker: 'Narrator', text: 'The priory’s own chronicle preserves the episode — and Wallace’s blunt admission that he could protect them while he stood there, and not a moment after he rode away.' },
    ]),
    {
      id: 'intro-assault', conditions: [{ kind: 'always' }], effects: [
        { kind: 'objectiveAdd', id: 'obj-corbridge', text: 'Break the fort at Corbridge' },
        { kind: 'revealArea', player: 1, area: { x: 50, y: 72, w: 24, h: 20 } },
        { kind: 'message', speaker: 'Graham', text: 'Corbridge first. Then Hexham—and the priory stands on Wallace’s word.' },
      ],
    },
    trigger(wallace4, 't08-corbridge'),
    trigger(wallace4, 't09-priory-broken'),
    c08Victory,
    trigger(wallace4, 't11-defeat-wallace'),
  ],
});

// ------------------------------------------------------------------ Act IV

const c09Intro = effectsWithout(
  trigger(wallace5, 't01-intro'),
  (effect) => (effect.kind === 'objectiveAdd' && effect.id === 'obj-hold') || effect.kind === 'armTrigger',
);

export const wallaceChapter09 = chapter({
  base: wallace5,
  id: 'wallace-09-schiltrons',
  index: 8,
  title: 'The Schiltrons',
  act: 'Act IV — The Broken Field',
  date: '22 July 1298',
  location: 'Falkirk',
  estimatedMinutes: '6–10 min',
  image: IMAGE.falkirk,
  imageAlt: 'Wallace and Graham inspect Scottish spear formations before Falkirk.',
  difficulty: {
    rating: 3,
    note: 'A short preparation chapter, but the army you build here is the army you fight Falkirk with. Cutting it short is felt in the next chapter.',
  },
  story: {
    stakes: 'Edward has found the Scottish army and there is no more room to retreat. Whatever is standing when the drums start is what Scotland gets to fight with.',
    cast: [
      {
        name: 'The schiltron',
        role: 'A ring of common spearmen',
        note: 'Hedgehog formations of long spears that horses will not charge. Against knights they work. Against archers, standing still is fatal.',
      },
      {
        name: 'Edward I',
        role: 'King of England, in person',
        note: 'Came north with the greatest host of his reign and a broken rib from his own horse. He does not intend to go home without a battle.',
      },
      {
        name: 'The Scottish nobility',
        role: 'Wallace’s cavalry',
        note: 'Mounted, well armed, and commanded by men who resent taking orders from a knight of four months’ standing.',
      },
    ],
    aftermath: {
      title: 'Ready, and not enough',
      paragraphs: [
        'The rings are formed, the stakes are set, and there are monks behind the line to carry the wounded out. By every standard Wallace can control, the army is ready.',
        'What he cannot control is the part of the field that is not his: the nobles on the wings, and the fact that Edward’s army contains thousands of archers with a weapon that does not need to close.',
        'Wallace’s plan was never to fight this battle at all. He stripped the country ahead of Edward’s march and waited for hunger to send the English home. It nearly worked — and then Edward’s scouts found the Scots camped in the Torwood.',
      ],
    },
    historyNote: 'Falkirk is the first battle where massed English archery is decisive in this way, and it changed how war was fought for a century. The monastery objective is the game’s stand-in for the healers any medieval army carried.',
  },
  history:
    'Edward I comes north in person with the greatest host of his reign. Wallace has stripped the line of march and let hunger weaken it, but English scouts find the Scots near Falkirk. There is no more room to evade battle.\n\n' +
    'The schiltron—dense rings of common spearmen—can stop knights. It cannot stop longbow arrows without support. Strengthen the line and prepare healers before Edward’s drums begin.',
  objectives: ['Field an army of 30', 'Build a Monastery and train 2 Monks'],
  hints: wallace5.briefing.hints,
  triggers: [
    ...beats('c09', [
      { at: 40, speaker: 'Graham', text: 'Edward is come himself, with more men than have ever crossed the border at once. He has been eating his own supplies for a week because you left him nothing to take.' },
      { at: 120, speaker: 'Wallace', text: 'It nearly worked. Two more days of hunger and he would have turned for home — and then two Scots earls sold him our position for a pardon.' },
      { at: 220, speaker: 'Graham', text: 'The rings will hold against horse. You know what they will not hold against.' },
      { at: 300, speaker: 'Wallace', text: 'The archers. Yes. That is what the cavalry on our wing is for, and the cavalry is commanded by men who would rather I had never been knighted.' },
    ]),
    c09Intro,
    trigger(wallace5, 't02-fortify-check'),
    trigger(wallace5, 't02b-monastery'),
    {
      id: 'chapter-complete', conditions: [
        { kind: 'objectiveComplete', objectiveId: 'obj-fortify' },
        { kind: 'objectiveComplete', objectiveId: 'obj-monks' },
      ], effects: [
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Graham', text: 'The line is ready. Now we discover who keeps faith when the arrows fall.' },
        { kind: 'victory' },
      ],
    },
    trigger(wallace5, 't14-defeat-wallace'),
  ],
});

const falkirkReinforcements = [
  ...units('spearman', 1, [[64, 54], [65, 54], [66, 54], [67, 54]]),
  ...units('skirmisher', 1, [[64, 55], [65, 55], [66, 55], [67, 55]]),
  ...units('archer', 1, [[68, 54], [69, 54], [68, 55], [69, 55]]),
];

export const wallaceChapter10 = chapter({
  base: wallace5,
  id: 'wallace-10-falkirk',
  index: 9,
  title: 'The Broken Field',
  act: 'Act IV — The Broken Field',
  date: '22 July 1298',
  location: 'Falkirk',
  estimatedMinutes: '10–15 min',
  image: IMAGE.falkirk,
  imageAlt: 'Scottish schiltrons face Edward’s vast host beneath a dark sky.',
  difficulty: {
    rating: 5,
    note: 'The hardest chapter in the campaign, and it is meant to be lost. Wave after wave arrives, your cavalry abandons the field, and success means getting Wallace out alive.',
  },
  story: {
    stakes: 'Falkirk cannot be won. What is still in your hands is whether Scotland loses an army and its leader, or only an army.',
    cast: [
      {
        name: 'Edward’s longbowmen',
        role: 'The answer to the schiltron',
        note: 'Once the spear rings are pinned in place, archers shoot gaps into them from beyond spear reach. Nothing on the Scottish side can reach the archers.',
      },
      {
        name: 'The Scottish horse',
        role: 'Gone from the field',
        note: 'The cavalry that should have ridden down the archers leaves early. Whether that was treachery, sound judgement, or a collapse of nerve is still argued about.',
      },
      {
        name: 'Sir John de Graham',
        role: 'Wallace’s captain and friend',
        note: 'Killed at Falkirk. His grave in the churchyard there is still marked.',
      },
    ],
    aftermath: {
      title: 'The Torwood',
      paragraphs: [
        'The rings held until they could not. Graham is dead, the spearmen who stood are dead around him, and what is left of the army is in the trees.',
        'Wallace is alive. Within months he resigns the Guardianship — the man who won Stirling cannot lead an army that has watched him lose Falkirk, and he knows it. Robert Bruce and John Comyn take his place.',
        'He does not surrender. He goes to France, and probably to Rome, arguing Scotland’s case in front of foreign courts while the great men at home negotiate their own peace with Edward.',
        'Everything after this is a hunted man refusing to accept an outcome that everyone else has accepted.',
      ],
      quote: {
        text: 'I have brought you to the ring, now dance if you can.',
        source: 'Attributed to Wallace before Falkirk by later chroniclers — probably invented, and repeated ever since',
      },
    },
    historyNote: 'The Scottish defeat, Graham’s death, and the departure of the Scottish cavalry are recorded; the cavalry’s motives are not. Wallace surviving the field is fact, not a game concession.',
  },
  history:
    'The English knights charge and break against the spears. Then Edward brings up the longbows. On the wing, the noble cavalry Wallace needs to silence them turns away from the field.\n\n' +
    'Hold as long as the army can hold. When the line breaks, Scotland needs a living Wallace more than another dead hero. Reach the Torwood and carry the war back into the hills.',
  objectives: ['Hold the war-camp', 'When ordered, bring Wallace to the Torwood'],
  hints: wallace5.briefing.hints,
  entities: [...wallace5.entities, ...falkirkReinforcements],
  triggers: [
    ...beats('c10', [
      { at: 40, speaker: 'Wallace', text: 'Close the rings. Front rank kneel, spears grounded. Whatever comes at you, the ground does not move.' },
      { at: 95, speaker: 'Narrator', text: 'The first English charge breaks on the spears exactly as it should. For a few minutes it looks like Stirling again.' },
      { at: 175, speaker: 'Graham', text: 'The horse are pulling off the field. Ours. They are riding away, and they are not coming back.' },
      { at: 250, speaker: 'Wallace', text: 'Then the archers do as they please, and we can neither reach them nor move. Hold. Just hold, and make it cost him.' },
      { at: 340, speaker: 'Narrator', text: 'Edward brings his bowmen forward and has them shoot into the stationary rings until gaps open. Then the knights ride into the gaps.' },
      { at: 430, speaker: 'Wallace', text: 'Graham is down. Take him up if you can and get to the trees — Scotland needs men who lived through this more than it needs another grave.' },
    ]),
    {
      id: 'battle-intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Narrator', text: 'Falkirk, 22 July 1298. Edward’s drums answer across the moor.' },
        { kind: 'objectiveAdd', id: 'obj-hold', text: 'Hold the war-camp against Edward’s assault' },
        { kind: 'armTrigger', triggerId: 't04-wave-1' },
      ],
    },
    trigger(wallace5, 't04-wave-1'),
    withTimer(trigger(wallace5, 't05-nobles'), 120),
    withTimer(trigger(wallace5, 't06-wave-2'), 150),
    withTimer(trigger(wallace5, 't07-wave-3'), 180),
    withTimer(trigger(wallace5, 't08-wave-4'), 210),
    trigger(wallace5, 't09-train-dead'),
    withTimer(trigger(wallace5, 't10-breakout'), 60),
    {
      ...withTimer(trigger(wallace5, 't10-breakout'), 270),
      id: 'chapter-breakout-clock',
      // The siege-train trigger rewards a successful defense with an earlier
      // withdrawal. This independent clock prevents a deadlock when the line is
      // wiped out but the surviving siege engines never finish the camp castle.
      armed: true,
    },
    trigger(wallace5, 't11-castle-falls'),
    trigger(wallace5, 't12-graham-falls'),
    trigger(wallace5, 't13-escape'),
    trigger(wallace5, 't14-defeat-wallace'),
  ],
});

// ------------------------------------------------------------------ Act V

const c11Intro = effectsWithout(
  trigger(wallace6, 't01-intro'),
  (effect) => effect.kind === 'objectiveAdd' && effect.id === 'obj-imperial',
);
const c11Outposts = effectsWithout(
  trigger(wallace6, 't03-castle-age-gate'),
  (effect) => effect.kind === 'objectiveAdd' && effect.id === 'obj-earnside',
);

export const wallaceChapter11 = chapter({
  base: wallace6,
  id: 'wallace-11-forest',
  index: 10,
  title: 'The Forest',
  act: 'Act V — The Unbroken',
  date: '1303–1304',
  location: 'The Forest of Selkirk',
  estimatedMinutes: '12–18 min',
  image: IMAGE.unbroken,
  imageAlt: 'An older Wallace plans with outlawed veterans in a rain-soaked forest camp.',
  difficulty: {
    rating: 4,
    note: 'A long chapter fought from a weak base against repeated sweeps, with an optional rescue that punishes you for ignoring it.',
  },
  story: {
    stakes: 'Every important man in Scotland has been pardoned. If the last unpardoned band is broken up, the surrender is complete and unanimous.',
    cast: [
      {
        name: 'Sir Simon Fraser',
        role: 'Wallace’s last noble ally',
        note: 'Fought for Edward, changed sides, and stayed on the losing one. He is hunted with the same energy as Wallace and executed a year after him.',
      },
      {
        name: 'Sir John de Segrave',
        role: 'English commander in Scotland',
        note: 'Runs the mounted sweeps through the Forest. At Happrew in February 1304 he finds Wallace and Fraser and routs them — and both get away.',
      },
      {
        name: 'The Forest of Selkirk',
        role: 'The last Scottish ground',
        note: 'Broken country that cavalry cannot control and armies cannot hold. It is the only reason the war has not ended.',
      },
    ],
    aftermath: {
      title: 'The unpardoned',
      paragraphs: [
        'The cordon is broken and the captives are out of English hands. It changes nothing strategically and everything politically: the war is not over while anyone is still fighting it.',
        'In February 1304 the Scottish leadership formally submits to Edward at Strathord. The terms are lenient — lands restored, offices kept — and almost everyone takes them. John Comyn takes them. Robert Bruce has already made his peace.',
        'Edward’s pardon rolls name virtually every man of consequence in Scotland. One name is explicitly excluded: Wallace is to be taken, and no terms are offered.',
      ],
    },
    historyNote: 'Happrew and the Forest campaign are documented in English pay records and orders; the captive rescue is invented to give the chapter a human stake. Wallace and Fraser really did escape the trap.',
  },
  history:
    'After Falkirk, Wallace resigns the Guardianship. He travels to France seeking aid, returns with little, and continues the war while Scotland’s great men make their peace. Edward’s pardon rolls contain every important name but one: Wallace’s.\n\n' +
    'With Sir Simon Fraser and the unpardoned, he holds to the Forest. At Happrew in February 1304, Segrave’s mounted force finds and routs them, but both leaders escape. Raise a hidden camp, break through the English cordon, and free the people taken in the sweeps.',
  objectives: ['Raise the hidden war-camp', 'Break the English cordon at Happrew', 'Optional: free the captives'],
  hints: wallace6.briefing.hints,
  triggers: [
    ...beats('c11', [
      { at: 50, speaker: 'Fraser', text: 'Comyn has submitted. Bruce submitted a year ago. Edward is offering lands back, offices back, everything back — and the terms are on the table for every man here except you.' },
      { at: 160, speaker: 'Wallace', text: 'I know what is on the table. I have seen what a Scottish parliament looks like when Edward writes the invitations.' },
      { at: 280, speaker: 'Narrator', text: 'Wallace had gone to Paris and argued Scotland’s case at the French court, and probably carried it to Rome. He came back with letters, sympathy, and no army.' },
      { at: 400, speaker: 'Fraser', text: 'Segrave’s riders are sweeping the Forest again, and they are taking whole households now — not fighters, families.' },
      { at: 520, speaker: 'Wallace', text: 'Then we take them back. If the only thing left to defend is the people, that is still something worth being in the field for.' },
    ]),
    c11Intro,
    trigger(wallace6, 't02-war-camp'),
    c11Outposts,
    trigger(wallace6, 't05-sweep-loop'),
    trigger(wallace6, 't06-happrew-approach'),
    trigger(wallace6, 't07-happrew-falls'),
    trigger(wallace6, 't08-captives-check'),
    trigger(wallace6, 't08b-captives-lost'),
    {
      id: 'chapter-complete', conditions: [
        { kind: 'objectiveComplete', objectiveId: 'obj-war-camp' },
        { kind: 'objectiveComplete', objectiveId: 'obj-happrew' },
      ], effects: [
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Fraser', text: 'Happrew burns. Earnside’s bridge and Bothwell’s walls are all that stand between us and the Warden.' },
        { kind: 'victory' },
      ],
    },
    trigger(wallace6, 't14-defeat-wallace'),
  ],
});

const earnsideAssault = [
  { def: 'trebuchet', player: 1, x: 108, y: 104 } as ScenarioEntity,
  { def: 'trebuchet', player: 1, x: 109, y: 104 } as ScenarioEntity,
  ...units('pikeman', 1, [[108, 105], [109, 105], [110, 105], [111, 105]]),
  ...units('crossbowman', 1, [[112, 105], [113, 105], [114, 105], [115, 105]]),
];

const earnsideEntities = wallace6.entities.filter((entity) => (
  entity.player === 1
  || (entity.player === 2 && entity.x >= 40 && entity.x <= 48 && entity.y >= 48 && entity.y <= 56)
));

export const wallaceChapter12 = chapter({
  base: wallace6,
  id: 'wallace-12-unbroken',
  index: 11,
  title: 'The Unbroken',
  act: 'Act V — The Unbroken',
  date: '1304–1305',
  location: 'Earnside and Robroyston',
  estimatedMinutes: '8–12 min',
  image: IMAGE.unbroken,
  imageAlt: 'Wallace’s hunted veterans watch English patrols below a red-stone castle.',
  difficulty: {
    rating: 4,
    note: 'A full imperial-age assault on a prepared English position, with your veteran army and no reinforcements coming.',
  },
  story: {
    stakes: 'Nothing military is left to win. What is at stake is the fact of resistance — that on the day Scotland is declared conquered, someone is still in the field.',
    cast: [
      {
        name: 'Wallace, outlaw',
        role: 'Former Guardian of Scotland',
        note: 'No office, no army, no allies with anything left to lose. He is now the only argument that the conquest is not finished.',
      },
      {
        name: 'Sir John Menteith',
        role: 'Scottish knight in Edward’s peace',
        note: 'Not in this battle. In August 1305 his men take Wallace at Robroyston near Glasgow and hand him to the English.',
      },
      {
        name: 'Edward I',
        role: 'King of England',
        note: 'Has Scotland governed, garrisoned, and legislated for. He wants Wallace taken alive and tried, because a trial says the conquest is lawful.',
      },
    ],
    aftermath: {
      title: 'Smithfield, and after',
      paragraphs: [
        'The English position at Earnside breaks. After it, the military record of William Wallace simply stops.',
        'On 5 August 1305 he is taken at Robroyston and carried south in chains. At Westminster Hall he is crowned with laurel and charged with treason, and he answers the only argument he has ever needed: he could not be a traitor to Edward, because he had never been Edward’s subject. It is not a defence the court is willing to hear. There is no trial in the sense of a verdict in doubt.',
        'On 23 August he is dragged to Smithfield and hanged, drawn, and quartered. His head is set on London Bridge; his quarters go to Newcastle, Berwick, Stirling, and Perth, so that four Scottish towns can see what happens.',
        'It was meant to end the argument. Within eight months Robert Bruce kills Comyn, seizes the crown, and takes up a war Wallace had refused to concede. Sixteen years after Smithfield, at Bannockburn, an English army breaks against Scottish spears on ground of Scotland’s choosing.',
        'The man could be killed. The rising could not.',
      ],
      quote: {
        text: 'I could not be a traitor to Edward, for I was never his subject.',
        source: 'William Wallace, Westminster Hall, 23 August 1305',
      },
    },
    historyNote: 'Earnside is the last action the record places Wallace in, and it is barely recorded at all — an English document notes a horse lost in flight from him near “Yrenside” in September 1304. The capture, trial, and execution are documented in detail.',
  },
  history:
    'Scotland’s organized resistance collapses in 1304, but Wallace refuses Edward’s peace. Hunted at Happrew and harried at Earnside, he remains proof that conquest on parchment is not conquest in fact.\n\n' +
    'The English record only a horse lost in flight from Wallace below “Yrenside” in September 1304; the place and details are uncertain. This final battle dramatizes that last recorded action. What follows at Robroyston, Westminster Hall, and Smithfield is not uncertain—and killing the man will not kill the rising.',
  objectives: ['Break the English position at Earnside'],
  hints: wallace6.briefing.hints,
  players: playersWith(
    wallace6,
    { age: 'imperial', resources: { food: 1200, wood: 1000, gold: 900, stone: 500 } },
    { 3: { aiProfile: 'passive' } },
  ),
  entities: [...earnsideEntities, ...earnsideAssault],
  triggers: [
    ...beats('c12', [
      { at: 40, speaker: 'Narrator', text: 'Scotland is, on parchment, a settled province with a governing ordinance and a new administration. The parchment does not mention the men still under arms in the Forest.' },
      { at: 130, speaker: 'Fraser', text: 'They have offered again. Submit, and you keep your life. You would not even have to swear it loudly.' },
      { at: 210, speaker: 'Wallace', text: 'A man who swears to Edward admits that Edward had the right to be sworn to. I have spent eight years arguing that he never did. I will not sign it away in an afternoon.' },
      { at: 320, speaker: 'Narrator', text: 'This is the last action the record can place him in. What comes afterwards — Robroyston, Westminster Hall, Smithfield — it records in far more detail, because Edward wanted it written down.' },
    ]),
    {
      id: 'final-intro', conditions: [{ kind: 'always' }], effects: [
        { kind: 'message', speaker: 'Narrator', text: 'Earnside, September 1304. Here the record catches Wallace in arms for the last time.' },
        { kind: 'objectiveAdd', id: 'obj-earnside', text: 'Break the English position at Earnside' },
        { kind: 'revealArea', player: 1, area: { x: 40, y: 48, w: 12, h: 12 } },
      ],
    },
    {
      id: 'final-victory', conditions: [{ kind: 'refDestroyed', ref: 'earnside_tower' }], effects: [
        { kind: 'objectiveComplete', id: 'obj-earnside' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: 'The English position breaks. After Earnside, the military record of William Wallace falls silent.' },
        { kind: 'message', speaker: 'Narrator', text: 'On 5 August 1305, at Robroyston near Glasgow, Wallace is captured by men serving Sir John Menteith and carried south in chains. In Westminster Hall he rejects the charge of treason: he could not betray a king who was never his.' },
        { kind: 'message', speaker: 'Narrator', text: 'On 23 August he is executed at Smithfield and his quartered body sent to Newcastle, Berwick, Stirling, and Perth as a warning. The warning fails. Robert Bruce takes the crown in 1306; at Bannockburn in 1314, the road from Lanark reaches a free Scotland.' },
        { kind: 'message', speaker: 'Narrator', text: 'The man could be killed. The rising could not.' },
        { kind: 'victory' },
      ],
    },
    trigger(wallace6, 't14-defeat-wallace'),
    trigger(wallace6, 't16-fraser-falls'),
  ],
});

export const wallaceChapters: ScenarioDef[] = [
  wallaceChapter01,
  wallaceChapter02,
  wallaceChapter03,
  wallaceChapter04,
  wallaceChapter05,
  wallaceChapter06,
  wallaceChapter07,
  wallaceChapter08,
  wallaceChapter09,
  wallaceChapter10,
  wallaceChapter11,
  wallaceChapter12,
];
