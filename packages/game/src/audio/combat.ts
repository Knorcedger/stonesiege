// Pure combat-impact voice classification (DOM/Pixi-free, unit-tested).
// audio/events.ts consumes this to pick the SFX for attackImpact/projectileFired.
//
// A blow sounds like two things at once: the weapon that lands it and the
// material it lands on. A ram booming into a gate must not share a voice with
// a militia trading blows, and an arrow burying itself in a shield-wall must
// not sound like the same arrow splitting a palisade. So the mapping is
// (weapon family) x (target material), both derived from @bf/data rather than
// hardcoded per-unit lists, so new unit defs inherit a sensible voice.

import { gameData } from '@bf/data';
import { projectileKindFor } from '../projectiles';
import type { SfxName } from './synth';

/** Weapon family an attacker's blows belong to. */
export type AttackFamily =
  | 'blade' // sword/axe infantry — militia line, champions, unique foot
  | 'cavalry' // sabre from horseback: swing, strike, hoof weight
  | 'spear' // spearman/pikeman: shaft and a narrow point
  | 'tool' // villagers fighting (and butchering) with work tools
  | 'ram' // the ram line: a swinging log, nothing else in the game like it
  | 'beast' // wildlife (wolves)
  | 'arrow' // bow shafts, including tower/TC/castle volleys
  | 'bolt' // the crossbow line: heavier, blunter, faster
  | 'stone'; // mangonel/onager/trebuchet boulders

/**
 * Weapon family for one attacker def. `melee` comes from the sim event: a
 * ranged attacker's impact is the projectile landing, so it classifies by what
 * it throws (reusing the projectile-visual classifier so sight and sound
 * always agree). Unknown defs fall back to `blade`, the generic melee voice.
 */
export function attackFamily(defId: string | undefined, melee: boolean): AttackFamily {
  if (!melee) return projectileKindFor(defId ?? '');
  const u = defId !== undefined ? gameData.units[defId] : undefined;
  if (!u) return 'blade';
  if (u.classes.includes('ram')) return 'ram';
  if (u.classes.includes('siege')) return 'stone'; // non-ram siege in a melee: rubble
  if (u.gather !== undefined || u.classes.includes('villager')) return 'tool';
  if (u.classes.includes('spearman')) return 'spear';
  if (u.classes.includes('cavalry')) return 'cavalry';
  if (u.classes.includes('infantry')) return 'blade';
  if (u.classes.length === 0) return 'beast'; // gaia wildlife carries no armor classes
  return 'blade';
}

/**
 * Voice per family, split by what is being hit. Families whose sound genuinely
 * does not change with the surface (a hoe, a wolf's jaws) repeat one voice; a
 * steel edge biting timber is the same chop whether an infantryman or a knight
 * swings it, so blade and cavalry share `bladeChop`.
 */
const IMPACT_VOICES: Record<AttackFamily, { unit: SfxName; building: SfxName }> = {
  blade: { unit: 'swordClash', building: 'bladeChop' },
  cavalry: { unit: 'sabreSlash', building: 'bladeChop' },
  spear: { unit: 'spearThrust', building: 'spearJab' },
  tool: { unit: 'toolStrike', building: 'toolStrike' },
  ram: { unit: 'ramCrush', building: 'ramBoom' },
  beast: { unit: 'beastBite', building: 'beastBite' },
  arrow: { unit: 'arrowFlesh', building: 'arrowThunk' },
  bolt: { unit: 'boltPunch', building: 'arrowThunk' },
  stone: { unit: 'stoneCrush', building: 'stoneShatter' },
};

/** The voice for one landed blow. Never null — every attacker makes a noise. */
export function impactVoice(
  attackerDefId: string | undefined, targetIsBuilding: boolean, melee: boolean,
): SfxName {
  const pair = IMPACT_VOICES[attackFamily(attackerDefId, melee)];
  return targetIsBuilding ? pair.building : pair.unit;
}

/** The voice for loosing a shot: bowstring, crossbow lock, or siege arm. */
export function releaseVoice(shooterDefId: string): SfxName {
  switch (projectileKindFor(shooterDefId)) {
    case 'stone':
      return 'siegeRelease';
    case 'bolt':
      return 'boltShot';
    default:
      return 'arrowShot';
  }
}

/**
 * Impacts heavy enough to carry past the normal SFX horizon — a ram on a gate
 * or a boulder into masonry is audible well off-screen, which is most of the
 * point of hearing a siege at all.
 */
const HEAVY_VOICES = new Set<SfxName>(['ramBoom', 'ramCrush', 'stoneShatter', 'stoneCrush', 'siegeRelease']);

/** Attenuation cutoff (world px) for a voice: heavy siege reaches further. */
export function voiceFalloff(name: SfxName): number {
  return HEAVY_VOICES.has(name) ? 2400 : 1500;
}
