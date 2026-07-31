// The William Wallace campaign (docs/CAMPAIGN_WALLACE.md §8).

import type { CampaignDef } from './schema';

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

export { wallace1 } from './scenarios/wallace1';
// Scenarios 2–6 are fully designed in docs/CAMPAIGN_WALLACE.md but not yet authored:
// export { wallace2 } from './scenarios/wallace2'; // 'The Justiciar Flees'
// export { wallace3 } from './scenarios/wallace3'; // 'Stirling Bridge'
// export { wallace4 } from './scenarios/wallace4'; // 'Harry the North'
// export { wallace5 } from './scenarios/wallace5'; // 'Falkirk'
// export { wallace6 } from './scenarios/wallace6'; // 'The Unbroken'

/** Authored ScenarioDefs by id (grows as scenarios land). */
import type { ScenarioDef } from './schema';
import { wallace1 } from './scenarios/wallace1';

export const scenariosById: Record<string, ScenarioDef> = {
  [wallace1.id]: wallace1,
};

export const campaigns: Record<string, CampaignDef> = {
  [wallaceCampaign.id]: wallaceCampaign,
};
