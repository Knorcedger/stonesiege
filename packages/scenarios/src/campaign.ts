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
