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

/**
 * Tiles of a smooth path through `points` — a Catmull-Rom spline sampled finely,
 * deduplicated, and made 4-connected by inserting the intermediate tile wherever
 * the path steps diagonally.
 *
 * Roads authored as axis-aligned runs meet at right angles, which no road worn by
 * traffic ever does. Laid on a curve instead, a road steps between the axes a
 * tile at a time and the renderer draws each of those steps as an arc, so the
 * route reads as one continuous, curving track.
 */
export function curveTiles(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 2) return points.slice();
  const at = (i: number): [number, number] => points[Math.max(0, Math.min(points.length - 1, i))];
  const out: Array<[number, number]> = [];
  const push = (x: number, y: number): void => {
    const last = out[out.length - 1];
    if (last === undefined) { out.push([x, y]); return; }
    if (last[0] === x && last[1] === y) return;
    const dx = x - last[0];
    const dy = y - last[1];
    if (dx !== 0 && dy !== 0) {
      // Diagonal step: insert the tile that keeps the run 4-connected, on the
      // side the path is travelling fastest.
      if (Math.abs(dx) >= Math.abs(dy)) out.push([x, last[1]]);
      else out.push([last[0], y]);
    }
    out.push([x, y]);
  };

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const span = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const steps = Math.max(8, span * 4);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * x1) + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      const y = 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      push(Math.round(x), Math.round(y));
    }
  }
  return out;
}
