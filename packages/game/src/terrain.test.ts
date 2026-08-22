// Presentation-only terrain rules (TerrainLayer): which shallows tiles are fords,
// which way a road runs and where its track crosses each tile edge, and what
// creeps back over its verges. All pure functions of the map — the sim, the
// minimap and pathing keep seeing the authored terrain.

import { describe, expect, it } from 'vitest';
import type { GameMap, TerrainId } from '@bf/sim/types';
import { displayTerrainId, fordTiles, roadFrameName, roadGroundId } from './terrain';

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

  it('bends at a corner and keeps a crossroads and a lone tile on the junction tile', () => {
    const corner = mapOf([
      '.......',
      '.rrrr..',
      '....r..',
      '....r..',
      '.......',
    ]);
    expect(display(corner, 4, 1)).toBe('road-bend'); // the turn itself, on an arc
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
  const straight = (axis: 'x' | 'y', length: number): GameMap => mapOf(
    axis === 'x'
      ? Array.from({ length: 3 }, (_, y) => (y === 1 ? 'r'.repeat(length) : '.'.repeat(length)))
      : Array.from({ length }, () => '.r.'),
  );

  it('hands the next tile along the road the joint it left on', () => {
    // The track must not jump at a tile boundary: tile N's exit offset is tile
    // N+1's entry offset, which is what makes the meander one continuous line.
    const alongX = straight('x', 24);
    for (let x = 1; x < 22; x++) {
      const joint = roadFrameName(alongX, x, 1, 'road-x', new Set()).split('/')[1];
      const next = roadFrameName(alongX, x + 1, 1, 'road-x', new Set()).split('/')[1];
      expect(joint[1]).toBe(next[0]);
    }
    const alongY = straight('y', 24);
    for (let y = 1; y < 22; y++) {
      const joint = roadFrameName(alongY, 1, y, 'road-y', new Set()).split('/')[1];
      const next = roadFrameName(alongY, 1, y + 1, 'road-y', new Set()).split('/')[1];
      expect(joint[1]).toBe(next[0]);
    }
  });

  it('actually meanders: a long run uses more than one joint', () => {
    const map = straight('x', 40);
    const joints = new Set<string>();
    for (let x = 1; x < 39; x++) joints.add(roadFrameName(map, x, 1, 'road-x', new Set()).split('/')[1]);
    expect(joints.size).toBeGreaterThan(2);
    expect(roadFrameName(map, 9, 1, 'road-x', new Set())).toMatch(/^road-x\/[012][012]\/\d$/);
  });

  it('crosses at the middle offset where a run meets a bend', () => {
    // A bend's arc enters at the edge midpoint, so the straight tile feeding it
    // has to arrive there too, or the track would step sideways at the join.
    const map = mapOf([
      '.......',
      '.rrrr..',
      '....r..',
      '....r..',
      '.......',
    ]);
    const fords = new Set<number>();
    expect(display(map, 4, 1)).toBe('road-bend');
    expect(roadFrameName(map, 3, 1, 'road-x', fords).split('/')[1][1]).toBe('1');
    expect(roadFrameName(map, 4, 2, 'road-y', fords).split('/')[1][0]).toBe('1');
  });

  it('names the bend after the two edges the road turns between', () => {
    const fords = new Set<number>();
    const bendOf = (rows: string[], x: number, y: number): string =>
      roadFrameName(mapOf(rows), x, y, 'road-bend', fords).split('/')[1];
    // west + south
    expect(bendOf(['.....', '.rrr.', '...r.', '...r.'], 3, 1)).toBe('nwsw');
    // west + north
    expect(bendOf(['...r.', '...r.', '.rrr.', '.....'], 3, 2)).toBe('nwne');
    // east + south
    expect(bendOf(['.....', '.rrr.', '.r...', '.r...'], 1, 1)).toBe('sesw');
    // east + north
    expect(bendOf(['.r...', '.r...', '.rrr.', '.....'], 1, 2)).toBe('sene');
  });

  it('is stable for a tile', () => {
    const map = straight('x', 24);
    expect(roadFrameName(map, 9, 1, 'road-x', new Set()))
      .toBe(roadFrameName(map, 9, 1, 'road-x', new Set()));
  });
});

describe('road bends', () => {
  it('turns a staircase of single steps into a run of bends', () => {
    // A road authored as a curve steps one tile at a time between the axes; every
    // one of those steps is a turn, and every turn must draw as an arc.
    const map = mapOf([
      'rr.....',
      '.rr....',
      '..rr...',
      '...rr..',
      '....rr.',
    ]);
    let bends = 0;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) {
        if (display(map, x, y) === 'road-bend') bends++;
      }
    }
    expect(bends).toBeGreaterThanOrEqual(8);
  });

  it('keeps a real crossroads on the junction tile', () => {
    const crossroads = mapOf([
      '..r..',
      '..r..',
      'rrrrr',
      '..r..',
      '..r..',
    ]);
    expect(display(crossroads, 2, 2)).toBe('road');
  });
});

describe('roadGroundId', () => {
  it('lays a track on the ground around it, not on a tile of its own', () => {
    const meadow = mapOf(['.....', '.rrr.', '.....']);
    expect(roadGroundId(meadow, 2, 1)).toBe('grass');

    const yard = mapOf(['ddddd', 'drrrd', 'ddddd']);
    expect(roadGroundId(yard, 2, 1)).toBe('dirt');
  });

  it('reaches past a road that is wider than one tile', () => {
    const wide = mapOf(['ddddddd', 'drrrrrd', 'drrrrrd', 'drrrrrd', 'ddddddd']);
    expect(roadGroundId(wide, 3, 2)).toBe('dirt');
  });

  it('never lays a track on water or cliff', () => {
    const bridge = mapOf(['..rr..', 'wwrrww', 'wwrrww', '..rr..']);
    expect(bridge.terrainIds).toContain('water');
    expect(roadGroundId(bridge, 2, 1)).toBe('grass');
  });

  it('has no ground far out over water: that is a bridge deck, not a track', () => {
    const rows = ['..rr..'];
    for (let i = 0; i < 12; i++) rows.push('wwrrww');
    rows.push('..rr..');
    const bridge = mapOf(rows);
    expect(roadGroundId(bridge, 2, 6)).toBeNull();
    expect(roadGroundId(bridge, 2, 1)).toBe('grass'); // the ramp still lies on the bank
  });
});
