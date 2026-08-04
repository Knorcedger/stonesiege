import type { UnitDef } from './schema';

/** Class-based guard radii shown by the client and used by combat acquisition. */
export const INFANTRY_AGGRO_RANGE = 4;
export const CAVALRY_AGGRO_RANGE = 6;

/**
 * Radius, in tiles, inside which an idle military unit notices hostile units.
 * Foot soldiers hold a tighter area than cavalry; other military units retain
 * their resolved line-of-sight distance.
 */
export function unitAggroRange(def: UnitDef, resolvedLos = def.los): number {
  if (def.classes.includes('cavalry')) return CAVALRY_AGGRO_RANGE;
  if (def.classes.includes('infantry')) return INFANTRY_AGGRO_RANGE;
  return resolvedLos;
}
