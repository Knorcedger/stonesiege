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

export interface RoadCurveOptions {
  /** Characters the road may be painted onto — plain terrain only, never objects. */
  over: string;
  /** Characters that mark water. Road tiles beside water are bridges and stay put. */
  water?: string;
  /** The legend character for road. */
  road?: string;
  /** Tiles across: 1 is a worn track, 2 a road two carts wide. Default 1. */
  width?: number;
  /** How close to water a road tile must be to count as a bridge. Default 2. */
  bridgeReach?: number;
}

/** The commonest paintable ground character around a tile, for filling a cleared road. */
function groundAround(
  grid: string[][], x: number, y: number, over: Set<string>,
): string {
  const counts = new Map<string, number>();
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[ny].length) continue;
        const char = grid[ny][nx];
        if (!over.has(char)) continue;
        counts.set(char, (counts.get(char) ?? 0) + 1);
      }
    }
    if (counts.size > 0) break;
  }
  let best = [...over][0];
  let bestCount = -1;
  for (const [char, count] of counts) {
    if (count > bestCount) { best = char; bestCount = count; }
  }
  return best;
}

/**
 * Re-lay a map's roads on curves: clear the authored road back to the ground
 * around it and paint `paths` through `curveTiles` instead.
 *
 * Road tiles touching water are left exactly where they are — those are authored
 * bridges and their ramps, and a bridge is meant to be a straight span. Painting
 * only ever covers the plain terrain characters in `over`, so gaia objects (trees,
 * mines, berries, herds) are never overwritten, and terrain passability is
 * unchanged: road, grass and dirt all carry the same traffic.
 */
export function layRoadCurves(
  rows: string[], paths: Array<Array<[number, number]>>, options: RoadCurveOptions,
): string[] {
  const road = options.road ?? 'r';
  const water = new Set((options.water ?? 'ws').split(''));
  const over = new Set(options.over.split(''));
  const grid = rows.map((row) => row.split(''));
  const inside = (x: number, y: number): boolean =>
    y >= 0 && y < grid.length && x >= 0 && x < grid[y].length;
  // Two tiles, not one: the middle lane of a three-wide causeway touches only
  // road, and clearing it would cut the span in half lengthwise.
  const bridgeReach = options.bridgeReach ?? 2;
  const bridging = (x: number, y: number): boolean => {
    for (let dy = -bridgeReach; dy <= bridgeReach; dy++) {
      for (let dx = -bridgeReach; dx <= bridgeReach; dx++) {
        if (inside(x + dx, y + dy) && water.has(grid[y + dy][x + dx])) return true;
      }
    }
    return false;
  };

  const cleared: Array<[number, number]> = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === road && !bridging(x, y)) cleared.push([x, y]);
    }
  }
  for (const [x, y] of cleared) grid[y][x] = groundAround(grid, x, y, over);

  const paint = (x: number, y: number): void => {
    if (inside(x, y) && over.has(grid[y][x])) grid[y][x] = road;
  };
  const width = options.width ?? 1;
  for (const path of paths) {
    const tiles = curveTiles(path);
    tiles.forEach(([x, y], index) => {
      paint(x, y);
      if (width < 2) return;
      // Widen to the same hand the whole way — the step into this tile is always
      // along one axis, so its perpendicular is too and the second lane stays
      // edge-adjacent. Alternating sides would bulge the band at every turn.
      const [px, py] = tiles[Math.max(0, index - 1)];
      const dx = Math.sign(x - px) || (index === 0 ? Math.sign(tiles[1]?.[0] - x) : 0);
      const dy = Math.sign(y - py) || (index === 0 ? Math.sign(tiles[1]?.[1] - y) : 0);
      paint(x - dy, y + dx);
    });
  }
  return grid.map((row) => row.join(''));
}
