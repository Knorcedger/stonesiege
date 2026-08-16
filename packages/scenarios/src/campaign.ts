// The William Wallace campaign (docs/CAMPAIGN_WALLACE.md §8).

import type { CampaignDef, ScenarioDef } from './schema';
import { wallace1 } from './scenarios/wallace1';
import { wallace2 } from './scenarios/wallace2';
import { wallace3 } from './scenarios/wallace3';
import { wallace4 } from './scenarios/wallace4';
import { wallace5 } from './scenarios/wallace5';
import { wallace6 } from './scenarios/wallace6';
import { showcaseCitadel } from './scenarios/showcaseCitadel';

export const wallaceCampaign: CampaignDef = {
  id: 'wallace',
  title: 'William Wallace — The Rising of Scotland',
  description:
    'Scotland, 1297. English sheriffs hold Scottish towns and English law hangs Scottish ' +
    'men — until a commoner from Lanarkshire decides the price of obedience is too high. ' +
    'Rise from a hillside camp to the head of a nation in arms: learn to gather, build, ' +
    'and fight; break an army of knights at a narrow bridge; carry the war across the ' +
    'border; survive the terrible day at Falkirk; and, when every noble has made peace, ' +
    'teach an empire that one unbroken man is a country. Six scenarios. Its ending, at ' +
    'least, is all true.',
  scenarioIds: ['wallace-1', 'wallace-2', 'wallace-3', 'wallace-4', 'wallace-5', 'wallace-6'],
};

export { showcaseCitadel, wallace1, wallace2, wallace3, wallace4, wallace5, wallace6 };

/** Authored ScenarioDefs by id, in campaign order. */
export const scenariosById: Record<string, ScenarioDef> = {
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
};
