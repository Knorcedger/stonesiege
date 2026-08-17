// The original Wallace campaign was authored as six long scenarios. These chapter
// variants reuse those battlefields and their strongest trigger sequences, but put a
// clean victory boundary between economy/preparation and the battle that follows.

import type {
  ScenarioDef, ScenarioEntity, ScenarioPlayer, TriggerDef, TriggerEffect,
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

const units = (
  def: string,
  player: number,
  coords: Array<[number, number]>,
): ScenarioEntity[] => coords.map(([x, y]) => ({ def, player, x, y }));

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
  },
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
  history:
    'Lanark rings like a bell, and Scotland answers. Men come out of Ettrick and the western hills; Sir William Douglas, called “the Hardy,” brings the first great name to Wallace’s rising. Farther north, Andrew Moray has begun a second revolt.\n\n' +
    'A raid can live from a sack. A rebellion needs farms, iron, carpenters, and time. On the Tay, Wallace’s growing band must become an army that can still be in the field when summer ends.',
  objectives: wallace2.briefing.objectives,
  hints: wallace2.briefing.hints,
  triggers: [
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
  history:
    'At Scone—the crowning-place of Scottish kings—William de Ormesby now sits as Edward’s chief justiciar, levying fines against Scots who refuse the English oath. Wallace and Douglas march to end the bitter joke.\n\n' +
    'Ormesby learns they are coming and prepares to run. His field patrol rides to buy him time. Break the patrol, cross the ford, and burn the hall with its ledgers before English law escapes behind stronger walls.',
  objectives: ['Break the English patrol', 'Destroy Ormesby’s hall at Scone'],
  hints: [
    'Spearmen counter the patrol’s mounted scouts.',
    'The ford tower covers the direct road. Bring it down or move quickly past its range.',
  ],
  players: playersWith(wallace2, { age: 'feudal', resources: { food: 300, wood: 200, gold: 150 } }),
  entities: [...wallace2.entities.filter((entity) => entity.player === 2), ...sconeArmy],
  startCamera: { x: 38, y: 67 },
  triggers: [
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
  history:
    'Andrew Moray has driven the English out of northern Scotland after escaping captivity at Avoch. His rising and Wallace’s are different in temper and origin, but at Stirling they become one army.\n\n' +
    'Below Abbey Craig, John de Warenne’s host must cross the Forth by one narrow wooden bridge. Hugh de Cressingham urges an immediate attack. Prepare the foot soldiers who will turn English confidence into a trap.',
  objectives: ['Field 10 Spearmen and 8 Skirmishers before the English crossing'],
  hints: wallace3.briefing.hints,
  triggers: [
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
  history:
    'The English vanguard begins to cross two horsemen abreast. Each man who reaches the north bank puts the Forth behind him. Warenne delays; Cressingham demands speed.\n\n' +
    'Wallace and Moray wait until enough of the host is trapped on their side of the river. Hold the bridgehead, answer the western ford, and break an army of knights with common foot soldiers.',
  objectives: ['Hold the Scottish camp', 'Destroy the English force north of the Forth'],
  hints: wallace3.briefing.hints,
  entities: [...wallace3.entities, ...stirlingReinforcements],
  triggers: [
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
    withTimer(trigger(wallace3, 't07-wave-c'), 110),
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
  history:
    'Edward I comes north in person with the greatest host of his reign. Wallace has stripped the line of march and let hunger weaken it, but English scouts find the Scots near Falkirk. There is no more room to evade battle.\n\n' +
    'The schiltron—dense rings of common spearmen—can stop knights. It cannot stop longbow arrows without support. Strengthen the line and prepare healers before Edward’s drums begin.',
  objectives: ['Field an army of 30', 'Build a Monastery and train 2 Monks'],
  hints: wallace5.briefing.hints,
  triggers: [
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
  history:
    'The English knights charge and break against the spears. Then Edward brings up the longbows. On the wing, the noble cavalry Wallace needs to silence them turns away from the field.\n\n' +
    'Hold as long as the army can hold. When the line breaks, Scotland needs a living Wallace more than another dead hero. Reach the Torwood and carry the war back into the hills.',
  objectives: ['Hold the war-camp', 'When ordered, bring Wallace to the Torwood'],
  hints: wallace5.briefing.hints,
  entities: [...wallace5.entities, ...falkirkReinforcements],
  triggers: [
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
  history:
    'After Falkirk, Wallace resigns the Guardianship. He travels to France seeking aid, returns with little, and continues the war while Scotland’s great men make their peace. Edward’s pardon rolls contain every important name but one: Wallace’s.\n\n' +
    'With Sir Simon Fraser and the unpardoned, he holds to the Forest. At Happrew in February 1304, Segrave’s mounted force finds and routs them, but both leaders escape. Raise a hidden camp, break through the English cordon, and free the people taken in the sweeps.',
  objectives: ['Raise the hidden war-camp', 'Break the English cordon at Happrew', 'Optional: free the captives'],
  hints: wallace6.briefing.hints,
  triggers: [
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
