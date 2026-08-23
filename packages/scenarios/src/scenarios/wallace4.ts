// wallace-4 · "Harry the North" — campaign scenario 4, authored from
// docs/CAMPAIGN_WALLACE.md §5. Rebuilding an economy from scratch under pressure,
// the Castle Age, the Market, and siege weapons against fortifications — with one
// promise to keep: Hexham Priory must stand.
//
// Map: 128x128 Tyne valley under snow (base terrain snow, snowy forests). The Tyne
// is a horizontal water band (rows 60-66) crossed by two road bridges (x 34-35 and
// x 84-85). Player plateau NW {10,12,26,22} with gold, stone, and a winter deer wood;
// Ryton supply camp NE {86,24,18,14} behind a thin stone-wall ring (north bank — the
// feudal-level first target); Corbridge fort {52,74,20,16} south bank behind a full
// wall circuit with a west Gate (rams are the lesson); Hexham town SW {18,88,22,16}
// with the requisitioned stores and, directly adjacent, the gaia Hexham Priory that
// only a deliberate player attack can harm (Appendix B). The Newcastle relief road
// enters the E edge at (127,70) and runs W along the south bank.

import type { ScenarioDef } from '../schema';
import { layRoadCurves, unitGroup, wallRing } from './authoring';

const legend: ScenarioDef['map']['legend'] = {
  n: { terrain: 'snow' },
  d: { terrain: 'dirt' },
  r: { terrain: 'road' },
  w: { terrain: 'water' },
  N: { terrain: 'snow', object: 'tree' },
  G: { terrain: 'snow', object: 'gold' },
  S: { terrain: 'snow', object: 'stone' },
  D: { terrain: 'snow', object: 'deer' },
};

/**
 * The Tyne valley roads, re-laid as curves: the two bridge approaches on either
 * bank, the Newcastle relief road running the width of the south bank, and the
 * spur to Corbridge's west gate. The bridges themselves stay straight spans —
 * `layRoadCurves` never moves a road tile that touches water.
 */
const ROAD_PATHS: Array<Array<[number, number]>> = [
  [[34, 34], [36, 40], [33, 46], [35, 52], [34, 59]],
  [[34, 67], [36, 72], [33, 78], [35, 83], [34, 87]],
  [[84, 30], [82, 36], [85, 43], [83, 50], [84, 59]],
  [[84, 67], [85, 69], [84, 71]],
  [[20, 71], [28, 69], [34, 70], [42, 72], [52, 69], [62, 71], [72, 69], [84, 70],
    [94, 72], [104, 69], [114, 71], [127, 70]],
  [[34, 81], [40, 79], [46, 82], [51, 81]],
];

export const wallace4: ScenarioDef = {
  id: 'wallace-4',
  campaign: 'wallace',
  index: 3,
  title: 'Harry the North',
  briefing: {
    history:
      'Stirling made Wallace master of Scotland — master of a burned, hungry country ' +
      'stripped by two years of English tax and war. An army that cannot be fed at home ' +
      "must be fed somewhere, and Wallace's answer was the oldest in the book of war: " +
      "carry the war onto the enemy's land and let Northumberland fill Scottish " +
      'wagons.\n\n' +
      'Through the last months of 1297 the Scots poured over the border. Tynedale ' +
      'burned. Corbridge, still black from earlier raiding, burned again. The country ' +
      'people fled south with what they could carry, and English garrisons shut their ' +
      'gates and watched the smoke. At Hexham, where frightened canons came out to meet ' +
      "the raiders, Wallace took the priory under his own protection — a hard man's " +
      'gesture that his own hungry soldiers barely honored.\n\n' +
      'Now winter closes in. Ahead lie the fortified stores of the Tyne valley: a supply ' +
      'camp at Ryton, the garrisoned fort at Corbridge, and the requisitioned stores at ' +
      'Hexham, hard against the priory wall. Newcastle will send riders when the smoke ' +
      'goes up. Build your winter camp, break their walls, and empty their granaries ' +
      'into ours — and mind the priory. We are raiders, not wolves.',
    objectives: [
      'Establish the winter camp: 12 villagers, a Lumber Camp, a Mining Camp, and a Mill with 5 Farms',
      'Advance to the Castle Age',
      'Burn the supply camp at Ryton (destroy its storehouse)',
    ],
    hints: [
      'Rams shrug off arrows and crack walls; keep spearmen beside them — cavalry eats rams.',
      'Mangonels outrange towers. Never send one anywhere alone.',
      'The Blacksmith and University make every soldier you own better. Research is never wasted.',
      'The Market sells what you cannot eat. Plundered grain and timber become the gold that buys armor.',
      "Newcastle's riders come up the eastern road. A watchtower there buys you minutes.",
    ],
  },
  players: [
    {
      name: "Wallace's Raiders", civ: 'scots', team: 1, isHuman: true, color: 0,
      age: 'feudal', resources: { food: 200, wood: 200, gold: 100 }, popCap: 80,
    },
    {
      name: 'Tyne Garrisons', civ: 'english', team: 2, isHuman: false, color: 1,
      age: 'castle', resources: { food: 1500, wood: 1200, gold: 900, stone: 600 },
      aiProfile: 'defender', popCap: 60,
    },
    {
      name: 'Newcastle Relief', civ: 'english', team: 2, isHuman: false, color: 2,
      age: 'castle', resources: { food: 2500, wood: 1500, gold: 1200, stone: 300 },
      aiProfile: 'raider', popCap: 60,
    },
  ],
  map: {
    width: 128,
    height: 128,
    legend,
    rows: layRoadCurves([
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnGGGnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnGGGnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNNNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNDnDnnnNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNnnnnDnNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnSSSnnnnnnnnnnnnnnNnDnnnDNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnSSnnnnnnnnnnnnnnnNnnnDnnNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNDnnnnnNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNnnDnnnNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnNNNNNrrNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnGGGnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnGGnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwrrwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
      'NNNNNNNnnnnnnnnnnnnnrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrrrrrrrrrrrrrrrrrnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrrrrrrrrrrrrrrrrrnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnrrnnnnnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnddddddddddddddddddddddnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
      'NNNNNNNnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    ], ROAD_PATHS, { over: 'nd', width: 2 }),
  },
  entities: [
    // ---- Player 1: the raiding column on the NW plateau ----
    { def: 'townCenter', player: 1, x: 18, y: 20 },
    // Doc anchor (20,22) sits inside the TC's 4x4 footprint; spawned just SE of it.
    { def: 'heroWallace', player: 1, x: 23, y: 25, ref: 'wallace' },
    { def: 'house', player: 1, x: 14, y: 16 },
    { def: 'house', player: 1, x: 14, y: 24 },
    { def: 'house', player: 1, x: 22, y: 26 },
    ...unitGroup('villager', 1, [[16, 19], [16, 22], [22, 19], [22, 24], [17, 25], [19, 25]]),
    ...unitGroup('manAtArms', 1, [[24, 20], [25, 20], [24, 21], [25, 21], [24, 22], [25, 22]]),
    ...unitGroup('spearman', 1, [[26, 20], [26, 21], [26, 22], [26, 23]]),
    ...unitGroup('archer', 1, [[27, 20], [27, 21]]),
    // ---- Player 2: Ryton supply camp (north bank, thin palisade ring) ----
    ...wallRing(2, 86, 24, 103, 37, [[86, 30], [86, 31]]), // west opening faces the approach
    { def: 'mill', player: 2, x: 92, y: 30, ref: 'ryton_stores' }, // the storehouse
    { def: 'watchTower', player: 2, x: 88, y: 26 },
    ...unitGroup('militia', 2, [[90, 28], [91, 28], [95, 28], [96, 30], [90, 33], [95, 33]]),
    ...unitGroup('archer', 2, [[89, 30], [97, 29]]),
    // ---- Player 2: Corbridge fort (south bank, full circuit + west gate) ----
    ...wallRing(2, 52, 74, 71, 89, [[52, 81]]),
    { def: 'gate', player: 2, x: 52, y: 81, ref: 'corbridge_gate' }, // faces the west bridge road
    { def: 'watchTower', player: 2, x: 60, y: 80, ref: 'corbridge_keep' },
    { def: 'barracks', player: 2, x: 55, y: 76 },
    { def: 'archeryRange', player: 2, x: 64, y: 76 },
    ...unitGroup('manAtArms', 2, [
      [58, 82], [59, 82], [62, 82], [63, 82], [58, 84], [59, 84], [62, 84], [63, 84],
    ]),
    ...unitGroup('longbowman', 2, [[56, 86], [58, 86], [60, 86], [62, 86], [64, 86], [66, 86]]),
    // ---- Player 2: Hexham town — requisitioned stores + billets ----
    { def: 'market', player: 2, x: 30, y: 94, ref: 'hexham_stores' },
    ...unitGroup('house', 2, [[20, 90], [24, 90], [28, 90], [34, 90], [36, 94]]),
    ...unitGroup('longbowman', 2, [[29, 93], [34, 93], [29, 98], [35, 98]]),
    ...unitGroup('manAtArms', 2, [[28, 94], [28, 96], [34, 96], [36, 98]]),
    // ---- Gaia: Hexham Priory — no unit auto-targets it; only a deliberate attack can ----
    { def: 'monastery', player: 0, x: 24, y: 96, ref: 'hexham_priory' },
    { def: 'monk', player: 0, x: 25, y: 99 },
    { def: 'monk', player: 0, x: 23, y: 97 },
  ],
  triggers: [
    {
      id: 't01-intro',
      conditions: [{ kind: 'always' }],
      effects: [
        { kind: 'panCamera', x: 18, y: 20 },
        { kind: 'message', speaker: 'Narrator', text: 'Northumberland, winter 1297. An army that cannot be fed at home must be fed abroad.' },
        { kind: 'message', speaker: 'Graham', text: 'Snow hides our tracks and theirs. Dig in, my lord Guardian-to-be. This valley will provision Scotland for a year.' },
        { kind: 'objectiveAdd', id: 'obj-winter-camp', text: 'Establish the winter camp: 12 villagers, Lumber Camp, Mining Camp, Mill + 5 Farms' },
        { kind: 'objectiveAdd', id: 'obj-castle-age', text: 'Advance to the Castle Age' },
        { kind: 'objectiveAdd', id: 'obj-ryton', text: 'Burn the supply camp at Ryton' },
      ],
    },
    {
      id: 't02-camp-done',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['villager'], atLeast: 12 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['lumberCamp'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['miningCamp'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['mill'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['farm'], atLeast: 5 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-winter-camp' },
        { kind: 'message', speaker: 'Narrator', text: 'The camp will hold through the snow. Farms under frost still feed men — a small mercy of the game of war.' },
      ],
    },
    {
      id: 't03-ryton',
      conditions: [{ kind: 'refDestroyed', ref: 'ryton_stores' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-ryton' },
        { kind: 'addResources', player: 1, amounts: { food: 300, wood: 200 } },
        { kind: 'message', speaker: 'Graham', text: "Ryton's granary, in our wagons. The men eat English bread tonight." },
        { kind: 'objectiveAdd', id: 'obj-market', text: 'Build a Market and stockpile 300 gold — sell the surplus' },
        { kind: 'message', speaker: 'Narrator', text: 'Plunder is heavy and gold is not. A Market turns spare grain and timber into coin.' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'aiProfile', player: 3, profile: 'standard' }, // Newcastle stirs
        { kind: 'armTrigger', triggerId: 't03b-market' },
        { kind: 'armTrigger', triggerId: 't06-relief-1' }, // the relief clock starts when the smoke goes up
      ],
    },
    {
      id: 't03b-market',
      armed: false, // armed by t03-ryton — the loot IS the lesson
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['market'], atLeast: 1 },
        { kind: 'resourcesAtLeast', player: 1, type: 'gold', amount: 300 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-market' },
        { kind: 'message', speaker: 'Graham', text: 'A counting-house in a war camp. Sell what we cannot carry — wagons want gold more than grain.' },
      ],
    },
    {
      id: 't04-castle-age',
      conditions: [{ kind: 'ageReached', player: 1, age: 'castle' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-castle-age' },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Narrator', text: 'The Castle Age. Heavier armor, deadlier engines — war in its full harness.' },
        { kind: 'objectiveAdd', id: 'obj-siege', text: 'Build a Siege Workshop and 2 Battering Rams' },
        { kind: 'objectiveAdd', id: 'obj-corbridge', text: 'Break the fort at Corbridge' },
      ],
    },
    {
      id: 't05-siege-built',
      conditions: [
        { kind: 'ownedAtLeast', player: 1, defIds: ['siegeWorkshop'], atLeast: 1 },
        { kind: 'ownedAtLeast', player: 1, defIds: ['batteringRam'], atLeast: 2 },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-siege' },
        { kind: 'message', speaker: 'Graham', text: 'Rams. Walls stop being an argument and start being firewood.' },
      ],
    },
    {
      id: 't06-relief-1',
      armed: false, // armed by t03-ryton: timerSeconds counts from arming,
      // so the relief rides exactly 5 minutes after Ryton burns
      conditions: [{ kind: 'timerSeconds', seconds: 300 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('knight', 3, [[124, 68], [125, 68], [126, 68], [127, 68], [124, 69], [125, 69]]),
            ...unitGroup('crossbowman', 3, [[126, 69], [127, 69], [124, 70], [125, 70]]),
          ],
        },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 10, y: 12, w: 26, h: 22 } },
        { kind: 'playSting', sting: 'alert' },
        { kind: 'message', speaker: 'Narrator', text: 'Riders from Newcastle on the south-bank road. They know where your fires are.' },
        { kind: 'armTrigger', triggerId: 't07-relief-loop' },
      ],
    },
    {
      id: 't07-relief-loop',
      armed: false, // armed by t06-relief-1: first sortie 7 minutes after the first relief,
      loop: true, // then every 7 minutes (loop re-arms reset the timer) — pacing is explicit
      conditions: [{ kind: 'timerSeconds', seconds: 420 }],
      effects: [
        {
          kind: 'spawn',
          entities: [
            ...unitGroup('knight', 3, [[124, 68], [125, 68], [126, 68], [127, 68]]),
            ...unitGroup('crossbowman', 3, [[124, 69], [125, 69], [126, 69], [127, 69]]),
            ...unitGroup('manAtArms', 3, [[124, 70], [125, 70]]),
          ],
        },
        { kind: 'aiAttackNow', player: 3, targetArea: { x: 10, y: 12, w: 26, h: 22 } },
        { kind: 'playSting', sting: 'alert' },
      ],
    },
    {
      id: 't08-corbridge',
      conditions: [{ kind: 'refDestroyed', ref: 'corbridge_keep' }],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-corbridge' },
        { kind: 'addResources', player: 1, amounts: { gold: 300, stone: 100 } },
        { kind: 'playSting', sting: 'horn' },
        { kind: 'message', speaker: 'Narrator', text: "Corbridge's keep is rubble. One garrison left on the Tyne — and one promise to keep." },
        { kind: 'objectiveAdd', id: 'obj-hexham', text: 'Burn the requisitioned stores at Hexham' },
        { kind: 'objectiveAdd', id: 'obj-priory', text: 'Hexham Priory must stand — Wallace gave his word' },
        { kind: 'revealArea', player: 1, area: { x: 18, y: 88, w: 22, h: 16 } },
        { kind: 'panCamera', x: 30, y: 94 },
        { kind: 'message', speaker: 'Wallace', text: 'The stores burn. The priory does NOT. Any man who forgets that answers to me, and I have had a long winter.' },
        { kind: 'aiProfile', player: 3, profile: 'aggressive' },
        { kind: 'armTrigger', triggerId: 't09-priory-broken' },
      ],
    },
    {
      id: 't09-priory-broken',
      // Armed with obj-priory (t08), not from tick 0 — the doc's always-armed version
      // could fire before the objective existed (a pre-Corbridge razing), turning the
      // objectiveFail into a never-added no-op and letting t10 later "complete" a broken
      // promise. refDestroyed latches, so a priory razed early still fails the objective
      // the same tick t08 adds it (t09 sits after t08 in definition order).
      armed: false,
      conditions: [{ kind: 'refDestroyed', ref: 'hexham_priory' }],
      effects: [
        // soft failure: campaign continues, the victory is merely chastened
        { kind: 'objectiveFail', id: 'obj-priory' },
        { kind: 'message', speaker: 'Wallace', text: '…I gave them my word. This day is ash in my mouth, whatever else it brings.' },
      ],
    },
    {
      id: 't10-victory',
      conditions: [
        { kind: 'refDestroyed', ref: 'hexham_stores' },
        { kind: 'objectiveComplete', objectiveId: 'obj-corbridge' },
        { kind: 'objectiveComplete', objectiveId: 'obj-ryton' },
      ],
      effects: [
        { kind: 'objectiveComplete', id: 'obj-hexham' },
        // Resolves the kept promise; latched no-op if the priory already fell (t09).
        { kind: 'objectiveComplete', id: 'obj-priory' },
        { kind: 'playSting', sting: 'victory' },
        { kind: 'message', speaker: 'Narrator', text: "The wagons roll north, heavy with the Tyne valley's winter stores. Behind them, Northumberland learns what Scotland has known for two years: war is a guest that eats everything." },
        { kind: 'message', speaker: 'Narrator', text: 'In the spring, at the Forest Kirk, the community of the realm names William Wallace knight and sole Guardian of Scotland — the commoner now first man of the kingdom. In England, Edward puts aside his French war and turns north with the greatest army he has ever raised.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 't11-defeat-wallace',
      conditions: [{ kind: 'refDestroyed', ref: 'wallace' }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'Wallace has fallen in Northumberland.' },
      ],
    },
    {
      id: 't12-defeat-camp',
      conditions: [{ kind: 'ownedAtMost', player: 1, defIds: ['townCenter', 'villager'], atMost: 0 }],
      effects: [
        { kind: 'playSting', sting: 'defeat' },
        { kind: 'defeat', reason: 'The winter camp is destroyed. The raid starves in the snow.' },
      ],
    },
  ],
  startCamera: { x: 18, y: 20 },
  maxAge: 'castle',
};
