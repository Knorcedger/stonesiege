// Presentation-only terrain rules (TerrainLayer): which shallows tiles are fords,
// and how road verges weather. Both are pure functions of the map — the sim, the
// minimap and pathing keep seeing the authored terrain.

import { describe, expect, it } from 'vitest';
import type { GameMap, TerrainId } from '@bf/sim/types';
import { displayTerrainId, fordTiles } from './terrain';

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
  const roadRows = (): string[] => {
    const rows: string[] = [];
    for (let y = 0; y < 12; y++) rows.push(y === 5 || y === 6 ? 'r'.repeat(20) : '.'.repeat(20));
    return rows;
  };

  it('wears part of a road verge through to dirt, and keeps the rest road', () => {
    const map = mapOf(roadRows());
    const drawn = new Set<string | null>();
    for (let x = 0; x < map.width; x++) drawn.add(display(map, x, 5));
    expect(drawn).toEqual(new Set(['road', 'dirt']));
  });

  it('is stable: the same tile always draws the same way', () => {
    const map = mapOf(roadRows());
    for (let x = 0; x < map.width; x++) {
      expect(display(map, x, 5)).toBe(display(map, x, 5));
      expect(display(map, x, 5)).toBe(displayTerrainId(mapOf(roadRows()), x, 5, new Set()));
    }
  });

  it('never weathers the interior of a wide road', () => {
    const rows: string[] = [];
    for (let y = 0; y < 9; y++) rows.push(y >= 3 && y <= 5 ? 'r'.repeat(12) : '.'.repeat(12));
    const map = mapOf(rows);
    for (let x = 1; x < 11; x++) expect(display(map, x, 4)).toBe('road');
  });

  it('never weathers a bridge or a ford ramp: road touching water stays road', () => {
    // A 2-wide road bridge over a horizontal river, with its approaches.
    const map = mapOf([
      '..rr..',
      '..rr..',
      'wwrrww',
      'wwrrww',
      '..rr..',
      '..rr..',
    ]);
    for (let y = 1; y <= 4; y++) {
      for (const x of [2, 3]) expect(display(map, x, y)).toBe('road');
    }
  });

  it('leaves every non-road, non-shallows terrain exactly as authored', () => {
    const map = mapOf(['.daw', 'w.da']);
    expect(display(map, 0, 0)).toBe('grass');
    expect(display(map, 1, 0)).toBe('dirt');
    expect(display(map, 2, 0)).toBe('sand');
    expect(display(map, 3, 0)).toBe('water');
  });
});
