// Presentation-only terrain rules (TerrainLayer): which shallows tiles are fords,
// which way a road runs and where its track crosses each tile edge, and what
// creeps back over its verges. All pure functions of the map — the sim, the
// minimap and pathing keep seeing the authored terrain.

import { describe, expect, it } from 'vitest';
import type { GameMap, TerrainId } from '@bf/sim/types';
import {
  displayTerrainId, fordTiles, roadFrameName, vergeTerrainId, vergeVariantIndex,
} from './terrain';

const LEGEND: Record<string, TerrainId> = {
  '.': 'grass',
  d: 'dirt',
  r: 'road',
  w: 'water',
  s: 'shallows',
  a: 'sand',
};

/** Build a map from ASCII rows; terrainIds keep the order the rows introduce them. */
function mapOf(rows: string[]): GameMap {
  const width = rows[0].length;
  const height = rows.length;
  const terrainIds: TerrainId[] = [];
  const terrain = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    expect(row.length).toBe(width);
    for (let x = 0; x < width; x++) {
      const id = LEGEND[row[x]];
      if (id === undefined) throw new Error(`unknown map char '${row[x]}'`);
      let index = terrainIds.indexOf(id);
      if (index < 0) index = terrainIds.push(id) - 1;
      terrain[y * width + x] = index;
    }
  });
  return { width, height, terrain, terrainIds };
}

const display = (map: GameMap, x: number, y: number, fords = fordTiles(map)): string | null =>
  displayTerrainId(map, x, y, fords);

describe('fordTiles', () => {
  it('marks a shallows band that spans a river, bank to bank', () => {
    // Vertical river (x 3-5) with a shallows crossing on rows 2-3.
    const map = mapOf([
      '..awwwa..',
      '..awwwa..',
      '..sssss..',
      '..sssss..',
      '..awwwa..',
      '..awwwa..',
    ]);
    const fords = fordTiles(map);
    expect(fords.size).toBe(10);
    for (let y = 2; y <= 3; y++) {
      for (let x = 2; x <= 6; x++) {
        expect(display(map, x, y, fords)).toBe('ford');
      }
    }
    expect(display(map, 4, 1, fords)).toBe('water');
  });

  it('leaves a shore fringe alone — it touches land on one side only', () => {
    const map = mapOf([
      '....swww',
      '....swww',
      '....swww',
      '....swww',
    ]);
    expect(fordTiles(map).size).toBe(0);
    expect(display(map, 4, 1)).toBe('shallows');
  });

  it('marks a crossing of a horizontal river the same way', () => {
    const map = mapOf([
      '....',
      '....',
      'wwsw',
      'wwsw',
      '....',
      '....',
    ]);
    const fords = fordTiles(map);
    expect([...fords].sort((a, b) => a - b)).toEqual([10, 14]);
  });

  it('does not mark a shallows pool that never reaches a second bank', () => {
    const map = mapOf([
      'wwwww',
      'wssww',
      'wwwww',
    ]);
    expect(fordTiles(map).size).toBe(0);
  });
});

describe('displayTerrainId', () => {
  const roadRows = (...roadY: number[]): GameMap => {
    const rows: string[] = [];
    for (let y = 0; y < 12; y++) rows.push(roadY.includes(y) ? 'r'.repeat(20) : '.'.repeat(20));
    return mapOf(rows);
  };

  it('draws a road along the axis it runs on', () => {
    const alongX = roadRows(5);
    for (let x = 3; x < 17; x++) expect(display(alongX, x, 5)).toBe('road-x');

    const alongY = mapOf(Array.from({ length: 12 }, () => '...r...'));
    for (let y = 3; y < 9; y++) expect(display(alongY, 3, y)).toBe('road-y');
  });

  it('keeps a wide road on its run direction, not on its width', () => {
    const wide = roadRows(4, 5, 6);
    for (let x = 3; x < 17; x++) {
      for (const y of [4, 5, 6]) expect(display(wide, x, y)).toBe('road-x');
    }
  });

  it('leaves a corner, a crossroads and a lone tile on the junction tile', () => {
    const corner = mapOf([
      '.......',
      '.rrrr..',
      '....r..',
      '....r..',
      '.......',
    ]);
    expect(display(corner, 4, 1)).toBe('road'); // the turn itself
    expect(display(corner, 2, 1)).toBe('road-x');
    expect(display(corner, 4, 3)).toBe('road-y');

    const crossroads = mapOf([
      '..r..',
      '..r..',
      'rrrrr',
      '..r..',
      '..r..',
    ]);
    expect(display(crossroads, 2, 2)).toBe('road');
    expect(display(crossroads, 0, 2)).toBe('road-x');

    expect(display(mapOf(['...', '.r.', '...']), 1, 1)).toBe('road');
  });

  it('leaves every non-road, non-shallows terrain exactly as authored', () => {
    const map = mapOf(['.daw', 'w.da']);
    expect(display(map, 0, 0)).toBe('grass');
    expect(display(map, 1, 0)).toBe('dirt');
    expect(display(map, 2, 0)).toBe('sand');
    expect(display(map, 3, 0)).toBe('water');
  });
});

describe('roadFrameName', () => {
  it('hands the next tile along the road the joint it left on', () => {
    // The track must not jump at a tile boundary: tile N's exit offset is tile
    // N+1's entry offset, which is what makes the meander one continuous line.
    for (let x = 0; x < 24; x++) {
      const [, joint] = roadFrameName(x, 7, 'road-x').split('/');
      const [, next] = roadFrameName(x + 1, 7, 'road-x').split('/');
      expect(joint[1]).toBe(next[0]);
    }
    for (let y = 0; y < 24; y++) {
      const [, joint] = roadFrameName(3, y, 'road-y').split('/');
      const [, next] = roadFrameName(3, y + 1, 'road-y').split('/');
      expect(joint[1]).toBe(next[0]);
    }
  });

  it('actually meanders: a long run uses more than one joint', () => {
    const joints = new Set<string>();
    for (let x = 0; x < 40; x++) joints.add(roadFrameName(x, 7, 'road-x').split('/')[1]);
    expect(joints.size).toBeGreaterThan(2);
  });

  it('is stable for a tile', () => {
    expect(roadFrameName(9, 4, 'road-x')).toBe(roadFrameName(9, 4, 'road-x'));
    expect(roadFrameName(9, 4, 'road-x')).toMatch(/^road-x\/[012][012]\/\d$/);
  });
});

describe('verges', () => {
  const map = mapOf([
    '.......',
    'rrrrrrr',
    '.......',
    '..w....',
    '..r....',
  ]);

  it('lets grass, dirt, sand and snow creep over a road edge', () => {
    expect(vergeTerrainId(map, 3, 1, 0, -1)).toBe('grass');
    expect(vergeTerrainId(map, 3, 1, 0, 1)).toBe('grass');
  });

  it('never creeps along a road-to-road edge, over water, or onto a non-road tile', () => {
    expect(vergeTerrainId(map, 3, 1, 1, 0)).toBeNull(); // next road tile
    expect(vergeTerrainId(map, 2, 4, 0, -1)).toBeNull(); // water above
    expect(vergeTerrainId(map, 3, 0, 0, 1)).toBeNull(); // grass tile, not a road
  });

  it('reclaims deeper on the flank the track meanders away from', () => {
    let sawDeep = false;
    let sawShallow = false;
    for (let x = 0; x < 40; x++) {
      const near = vergeVariantIndex(x, 1, 'ne', 'road-x', 3);
      const far = vergeVariantIndex(x, 1, 'sw', 'road-x', 3);
      expect(near + far).toBe(2); // one flank opens exactly as much as the other closes
      sawDeep ||= near === 2 || far === 2;
      sawShallow ||= near === 0 || far === 0;
    }
    expect(sawDeep && sawShallow).toBe(true);
  });

  it('falls back to a stable per-tile pick off a road flank', () => {
    expect(vergeVariantIndex(4, 1, 'nw', 'road-x', 3)).toBe(vergeVariantIndex(4, 1, 'nw', 'road-x', 3));
    expect(vergeVariantIndex(4, 1, 'nw', 'grass', 1)).toBe(0);
  });
});
