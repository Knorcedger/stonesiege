// Pure projectile-visual classification (DOM/Pixi-free, unit-tested).
// fx.ts consumes this to pick the drawn shape for projectileFired events.

import { gameData } from '@bf/data';

export type ProjectileKind = 'arrow' | 'bolt' | 'stone';

const BOLT_SHOOTERS = new Set(['crossbowman', 'arbalester']);

/**
 * Which projectile visual a shooter def fires. Area/packed siege lob stones;
 * the crossbow line fires bolts; every other ranged attacker (archers,
 * TC/tower/castle arrows, longbowmen) uses arrows.
 */
export function projectileKindFor(defId: string): ProjectileKind {
  const u = gameData.units[defId];
  if (u) {
    if (u.areaRadius !== undefined || u.pack !== undefined) return 'stone';
    if (BOLT_SHOOTERS.has(defId)) return 'bolt';
    return 'arrow';
  }
  return 'arrow'; // buildings (TC/towers/castle) volley arrows
}
