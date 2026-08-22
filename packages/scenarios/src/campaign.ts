// The William Wallace campaign (docs/CAMPAIGN_WALLACE.md §8).

import type { CampaignDef, ScenarioDef } from './schema';
import { wallace1 } from './scenarios/wallace1';
import { wallace2 } from './scenarios/wallace2';
import { wallace3 } from './scenarios/wallace3';
import { wallace4 } from './scenarios/wallace4';
import { wallace5 } from './scenarios/wallace5';
import { wallace6 } from './scenarios/wallace6';
import {
  wallaceChapters,
  wallaceChapter01, wallaceChapter02, wallaceChapter03, wallaceChapter04,
  wallaceChapter05, wallaceChapter06, wallaceChapter07, wallaceChapter08,
  wallaceChapter09, wallaceChapter10, wallaceChapter11, wallaceChapter12,
} from './scenarios/wallaceChapters';
import { showcaseCitadel } from './scenarios/showcaseCitadel';
import {
  alexiosCampaign,
  genghisCampaign,
  hardradaCampaign,
  henryCampaign,
  joanCampaign,
  legendaryCampaigns,
  legendaryScenarios,
  saladinCampaign,
} from './scenarios/legendaryCampaigns';

export const wallaceCampaign: CampaignDef = {
  id: 'wallace',
  title: 'William Wallace — The Rising of Scotland',
  description:
    'From the killing of the sheriff at Lanark to the victory at Stirling Bridge, the ' +
    'Guardianship, Falkirk, outlaw years, capture, trial, and execution: play William ' +
    'Wallace’s complete story across twelve focused chapters in five historical acts.',
  cover: '/campaign/wallace/act-2-stirling.webp',
  coverAlt: 'Wallace and Moray watch English cavalry file across the narrow bridge at Stirling.',
  prologue: {
    kicker: 'Scotland, 1286–1297',
    title: 'A Kingdom Without a King',
    image: '/campaign/wallace/act-1-lanark.webp',
    imageAlt: 'A misty Scottish glen under grey light, with armed countrymen gathering on the ridge above a town.',
    paragraphs: [
      'In 1286 King Alexander III rode his horse off a cliff in the dark, and Scotland — prosperous, settled, unremarkable — lost its king. His heir was a child in Norway, and she died at sea on the way home. Thirteen men then claimed the throne of a kingdom with no rule for deciding between them.',
      'They asked Edward I of England to arbitrate. He agreed, on the condition that every claimant first acknowledge him as overlord of Scotland. In 1292 he chose John Balliol, and then set about proving what overlordship meant: summoning the Scottish king to English courts, demanding Scottish troops for English wars, and treating a kingdom as a province.',
      'When Scotland finally refused and allied with France, Edward came north. Berwick was stormed and its townspeople massacred. The Scottish army was destroyed at Dunbar. Balliol was stripped of his crown and his coat of arms in public — the Scots called him Toom Tabard, the empty coat — and the Stone of Scone, on which every Scottish king had been made, was carried to Westminster. English sheriffs took the towns, and in August 1296 the landholders of Scotland were made to swear to Edward, name by name, on a roll of parchment.',
      'By the spring of 1297 the conquest looks finished. It is administered, garrisoned, taxed, and signed for.',
      'This campaign is the story of the man who did not accept it — who begins it as a landholder’s younger son with no title, no army, and no place in any chronicle, and ends it as the reason a conquered country was never actually conquered.',
    ],
    quote: {
      text: 'He was a man of great strength and bold spirit, born of a family of no great name.',
      source: 'The Scotichronicon, on William Wallace',
    },
    cta: 'Begin the rising',
  },
  epilogue: {
    kicker: '1305–1329',
    title: 'What the Quartering Did Not Kill',
    image: '/campaign/wallace/act-5-unbroken.webp',
    imageAlt: 'Rain over an empty Scottish hillside at dusk, a spear standing upright in the ground.',
    paragraphs: [
      'Edward I meant the execution at Smithfield to be an argument. Hanged, cut down alive, disembowelled, beheaded, quartered — and then the pieces distributed to Newcastle, Berwick, Stirling and Perth, so that the towns Wallace had freed could look at what freeing them had cost him. The head went on London Bridge. No grave, no relics, nothing to gather around.',
      'It held for less than six months. In February 1306 Robert Bruce killed John Comyn before the altar at Dumfries, seized the crown at Scone six weeks later, and was crowned on a hillside without the Stone, without most of the nobility, and with the Pope’s excommunication on the way. He lost his first battles, lost three brothers to Edward’s executioners, and spent a winter as a hunted man in exactly the country Wallace had used.',
      'He did not lose the war. At Bannockburn in June 1314 — nine years after Smithfield — an English army twice his size broke against Scottish spears — the schiltrons that failed at Falkirk, now handled by a commander who chose his ground and kept his cavalry. In 1320 the barons and clergy of Scotland wrote to the Pope in terms Wallace would have recognised: that they fought not for glory or wealth, but for freedom, which no honest man gives up but with his life. In 1328 England recognised Scotland as an independent kingdom under King Robert.',
      'Wallace held office for less than a year and won one great battle. He was not a strategist to rank with Bruce, and the campaign has not pretended otherwise. What he did was refuse — at Lanark, at the Forest, at Westminster Hall — to accept the premise that Scotland had already lost, and he kept refusing when refusing had no upside left in it at all.',
      'That is the whole of it. A conquest is only finished when the conquered agree, and one man would not.',
    ],
    quote: {
      text: 'It is in truth not for glory, nor riches, nor honours that we are fighting, but for freedom — for that alone, which no honest man gives up but with life itself.',
      source: 'The Declaration of Arbroath, 1320',
    },
    cta: 'Close the book',
  },
  scenarioIds: wallaceChapters.map((scenario) => scenario.id),
  acts: [
    { id: 'outlaw', title: 'Act I — The Outlaw', years: '1297', scenarioIds: wallaceChapters.slice(0, 4).map((scenario) => scenario.id) },
    { id: 'victory', title: 'Act II — The Great Victory', years: '1297', scenarioIds: wallaceChapters.slice(4, 6).map((scenario) => scenario.id) },
    { id: 'guardian', title: 'Act III — Guardian of Scotland', years: '1297–1298', scenarioIds: wallaceChapters.slice(6, 8).map((scenario) => scenario.id) },
    { id: 'broken-field', title: 'Act IV — The Broken Field', years: '1298', scenarioIds: wallaceChapters.slice(8, 10).map((scenario) => scenario.id) },
    { id: 'unbroken', title: 'Act V — The Unbroken', years: '1303–1305', scenarioIds: wallaceChapters.slice(10, 12).map((scenario) => scenario.id) },
  ],
};

export {
  showcaseCitadel,
  wallace1, wallace2, wallace3, wallace4, wallace5, wallace6,
  wallaceChapter01, wallaceChapter02, wallaceChapter03, wallaceChapter04,
  wallaceChapter05, wallaceChapter06, wallaceChapter07, wallaceChapter08,
  wallaceChapter09, wallaceChapter10, wallaceChapter11, wallaceChapter12,
  henryCampaign, hardradaCampaign, joanCampaign, genghisCampaign, alexiosCampaign, saladinCampaign,
  legendaryScenarios,
};

/** Authored ScenarioDefs by id, in campaign order. */
export const scenariosById: Record<string, ScenarioDef> = {
  ...Object.fromEntries(wallaceChapters.map((scenario) => [scenario.id, scenario])),
  ...Object.fromEntries(legendaryScenarios.map((scenario) => [scenario.id, scenario])),
  // Legacy ids stay loadable for old saved matches and deep links. They are no longer
  // shown in the campaign sequence; progress.ts migrates their completion state.
  [wallace1.id]: wallace1,
  [wallace2.id]: wallace2,
  [wallace3.id]: wallace3,
  [wallace4.id]: wallace4,
  [wallace5.id]: wallace5,
  [wallace6.id]: wallace6,
  [showcaseCitadel.id]: showcaseCitadel,
};

export const campaigns: Record<string, CampaignDef> = {
  [wallaceCampaign.id]: wallaceCampaign,
  ...Object.fromEntries(legendaryCampaigns.map((campaign) => [campaign.id, campaign])),
};
