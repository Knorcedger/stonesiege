// Tiny pure helpers for scenario authoring (wall circuits, unit groups). Everything is
// deterministic data construction at module init — no RNG, no clocks.

import type { ScenarioEntity } from '../schema';

/**
 * Ring of 1-tile entities (stone walls by default) on the inclusive rectangle perimeter
 * x0..x1 / y0..y1. Tiles in `skip` (gates, corner towers, deliberate breaches) are left out.
 */
export function wallRing(
  player: number, x0: number, y0: number, x1: number, y1: number,
  skip: Array<[number, number]> = [], def = 'stoneWall',
): ScenarioEntity[] {
  const skipSet = new Set(skip.map(([x, y]) => `${x},${y}`));
  const out: ScenarioEntity[] = [];
  const push = (x: number, y: number) => {
    if (!skipSet.has(`${x},${y}`)) out.push({ def, player, x, y });
  };
  for (let x = x0; x <= x1; x++) push(x, y0);
  for (let x = x0; x <= x1; x++) push(x, y1);
  for (let y = y0 + 1; y <= y1 - 1; y++) push(x0, y);
  for (let y = y0 + 1; y <= y1 - 1; y++) push(x1, y);
  return out;
}

/** One entity of `def` per tile, in tile-list order. */
export function unitGroup(
  def: string, player: number, tiles: Array<[number, number]>,
): ScenarioEntity[] {
  return tiles.map(([x, y]) => ({ def, player, x, y }));
}
