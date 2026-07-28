// Gaia resource objects placed on the map. Amounts follow AoE2 DE:
// tree 100 wood, gold mine 800, stone mine 350, berry bush 125 food.

import type { ResourceDef } from './schema';

export const resources: Record<string, ResourceDef> = {
  tree: {
    id: 'tree', name: 'Tree', resourceType: 'wood', amount: 100,
    gatherTask: 'wood',
    hp: 20, // military units can clear trees slowly; chopping depletes wood instead
    icon: 'icon/tree',
  },
  goldMine: {
    id: 'goldMine', name: 'Gold Mine', resourceType: 'gold', amount: 800,
    gatherTask: 'gold',
    icon: 'icon/goldMine',
  },
  stoneMine: {
    id: 'stoneMine', name: 'Stone Mine', resourceType: 'stone', amount: 350,
    gatherTask: 'stone',
    icon: 'icon/stoneMine',
  },
  berryBush: {
    id: 'berryBush', name: 'Berry Bush', resourceType: 'food', amount: 125,
    gatherTask: 'forage',
    icon: 'icon/berryBush',
  },
};
