// Spatial hash grid over unit positions (fixed-point coords) for range queries and
// local avoidance. Query results are sorted by entity id so iteration order is
// deterministic regardless of cell-array churn.

import { FP } from './types';
import type { EntityId, Fixed } from './types';

const CELL_SHIFT = 9; // 512 fixed units = 2 tiles per cell
const KEY_STRIDE = 1 << 16;

export class SpatialGrid {
  private cells = new Map<number, EntityId[]>();
  private pos = new Map<EntityId, number>(); // id -> cell key

  private key(x: Fixed, y: Fixed): number {
    return ((y >> CELL_SHIFT) + 128) * KEY_STRIDE + ((x >> CELL_SHIFT) + 128);
  }

  insert(id: EntityId, x: Fixed, y: Fixed): void {
    const k = this.key(x, y);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(id);
    this.pos.set(id, k);
  }

  remove(id: EntityId): void {
    const k = this.pos.get(id);
    if (k === undefined) return;
    const arr = this.cells.get(k);
    if (arr) {
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
      if (arr.length === 0) this.cells.delete(k);
    }
    this.pos.delete(id);
  }

  move(id: EntityId, x: Fixed, y: Fixed): void {
    const k = this.key(x, y);
    const prev = this.pos.get(id);
    if (prev === k) return;
    this.remove(id);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(id);
    this.pos.set(id, k);
  }

  /**
   * Ids of units whose grid cell intersects the circle (coarse — caller filters by
   * actual distance). Sorted ascending by id for determinism.
   */
  queryCircle(x: Fixed, y: Fixed, r: Fixed, out: EntityId[]): EntityId[] {
    this.queryCircleUnsorted(x, y, r, out);
    out.sort((a, b) => a - b);
    return out;
  }

  /**
   * queryCircle WITHOUT the id sort — a measured hotspot with 300+ units (the sort was
   * >1/3 of total tick time in the 144×144 brawl smoke). The id SET returned is
   * identical, only the enumeration order is unspecified (cell-array insertion order,
   * which varies with movement history and differs after a snapshot restore). Callers
   * MUST therefore be order-independent: commutative accumulation (movement
   * separation), pure existence checks, or explicit best-candidate tie-breaks that
   * never rely on scan order (combat acquisition tie-breaks on lowest id). Everything
   * else uses the sorted query.
   */
  queryCircleUnsorted(x: Fixed, y: Fixed, r: Fixed, out: EntityId[]): EntityId[] {
    out.length = 0;
    const x0 = (x - r) >> CELL_SHIFT, x1 = (x + r) >> CELL_SHIFT;
    const y0 = (y - r) >> CELL_SHIFT, y1 = (y + r) >> CELL_SHIFT;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get((cy + 128) * KEY_STRIDE + (cx + 128));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}

/** Tiles per spatial cell (for sizing queries). */
export const SPATIAL_CELL_TILES = (1 << CELL_SHIFT) / FP;
