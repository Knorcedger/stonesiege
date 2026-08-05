// Deterministic group formations. Slots are expressed as lateral/depth offsets
// around the clicked destination, then rotated along the group's travel axis.

import { FP } from './types';
import type { EntityId, Fixed, Formation } from './types';
import type { SimState } from './internal';
import { orderMove, orderMoveToTargets } from './path';

const SPACING = Math.round(FP * 0.8);

export interface FormationOffset { lateral: Fixed; depth: Fixed }

/** Pure slot layout, centered on (0,0), in deterministic assignment order. */
export function formationOffsets(count: number, formation: Formation): FormationOffset[] {
  if (count <= 0) return [];
  const offsets: FormationOffset[] = [];
  if (formation === 'line') {
    for (let i = 0; i < count; i++) {
      offsets.push({ lateral: Math.round((i - (count - 1) / 2) * SPACING), depth: 0 });
    }
    return offsets;
  }
  if (formation === 'rectangle') {
    const columns = Math.max(2, Math.ceil(Math.sqrt(count * 1.5)));
    const rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / columns);
      const rowCount = Math.min(columns, count - row * columns);
      const column = i - row * columns;
      offsets.push({
        lateral: Math.round((column - (rowCount - 1) / 2) * SPACING),
        depth: Math.round((row - (rows - 1) / 2) * SPACING),
      });
    }
    return offsets;
  }

  // Wedge: the first unit is the point, followed by symmetric left/right pairs.
  for (let i = 0; i < count; i++) {
    if (i === 0) { offsets.push({ lateral: 0, depth: 0 }); continue; }
    const rank = Math.ceil(i / 2);
    offsets.push({
      lateral: (i % 2 === 1 ? -rank : rank) * SPACING,
      depth: -rank * SPACING,
    });
  }
  // Recenter an incomplete final pair as well as complete wedges.
  const meanLateral = Math.round(offsets.reduce((sum, p) => sum + p.lateral, 0) / count);
  const meanDepth = Math.round(offsets.reduce((sum, p) => sum + p.depth, 0) / count);
  for (const p of offsets) {
    p.lateral -= meanLateral;
    p.depth -= meanDepth;
  }
  return offsets;
}

/** Assign and order a selected group into the requested formation. */
export function orderFormationMove(
  state: SimState,
  unitIds: readonly EntityId[],
  x: Fixed,
  y: Fixed,
  formation: Formation | undefined,
): Map<EntityId, { x: Fixed; y: Fixed }> {
  const seen = new Set<EntityId>();
  const units = unitIds
    .map((id) => state.entities.get(id))
    .filter((e) => {
      if (!e || e.kind !== 'unit' || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => a!.id - b!.id);
  const assigned = new Map<EntityId, { x: Fixed; y: Fixed }>();
  if (!formation || units.length < 3) {
    orderMove(state, units.map((e) => e!.id), x, y);
    for (const e of units) assigned.set(e!.id, { x, y });
    return assigned;
  }

  const centerX = Math.round(units.reduce((sum, e) => sum + e!.x, 0) / units.length);
  const centerY = Math.round(units.reduce((sum, e) => sum + e!.y, 0) / units.length);
  const dx = x - centerX, dy = y - centerY;
  // Four stable orientations avoid floating-point trig in deterministic state.
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const forwardX = horizontal ? (dx < 0 ? -1 : 1) : 0;
  const forwardY = horizontal ? 0 : (dy < 0 ? -1 : 1);
  const lateralX = -forwardY;
  const lateralY = forwardX;
  const offsets = formationOffsets(units.length, formation);
  const minX = FP / 2, minY = FP / 2;
  const maxX = state.map.width * FP - FP / 2;
  const maxY = state.map.height * FP - FP / 2;
  const targets = units.map((e, i) => {
    const p = offsets[i];
    const target = {
      id: e!.id,
      x: Math.max(minX, Math.min(maxX, x + p.depth * forwardX + p.lateral * lateralX)),
      y: Math.max(minY, Math.min(maxY, y + p.depth * forwardY + p.lateral * lateralY)),
    };
    assigned.set(e!.id, { x: target.x, y: target.y });
    return target;
  });
  orderMoveToTargets(state, targets);
  return assigned;
}
