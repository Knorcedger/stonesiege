// Cross-scenario placement sanity: every authored entity and every trigger-spawned
// entity must stand on sensible terrain. Buildings may not overlap water/shallows or
// gaia map-token objects (trees, mines, bushes) anywhere in their footprint; units may
// not stand in deep water or inside a tree. Catches hand-placed coordinates drifting
// out of sync with the authored ASCII maps.

import { describe, expect, it } from 'vitest';
import { campaignGameData } from '../heroes';
import type { ScenarioDef, ScenarioEntity } from '../schema';
import { scenariosById } from '../campaign';

const data = campaignGameData;

function checkScenario(def: ScenarioDef): string[] {
  const issues: string[] = [];
  const tokenAt = (x: number, y: number) => def.map.legend[def.map.rows[y][x]];

  const check = (where: string, e: ScenarioEntity) => {
    const building = data.buildings[e.def];
    const size = building?.size ?? 1;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const t = tokenAt(e.x + dx, e.y + dy);
        if (building !== undefined) {
          if (t.terrain === 'water' || t.terrain === 'shallows') {
            issues.push(`${where}: building '${e.def}' at (${e.x},${e.y}) covers ${t.terrain} at (${e.x + dx},${e.y + dy})`);
          }
          if (t.object !== undefined) {
            issues.push(`${where}: building '${e.def}' at (${e.x},${e.y}) covers gaia '${t.object}' at (${e.x + dx},${e.y + dy})`);
          }
        } else {
          if (t.terrain === 'water') {
            issues.push(`${where}: unit '${e.def}' at (${e.x},${e.y}) stands in deep water`);
          }
          if (t.object === 'tree') {
            issues.push(`${where}: unit '${e.def}' at (${e.x},${e.y}) stands inside a tree`);
          }
        }
      }
    }
  };

  def.entities.forEach((e, i) => check(`entities[${i}]`, e));
  for (const t of def.triggers) {
    for (const fx of t.effects) {
      if (fx.kind !== 'spawn') continue;
      fx.entities.forEach((e, i) => check(`trigger '${t.id}' spawn[${i}]`, e));
    }
  }
  return issues;
}

describe('entity placement vs authored terrain', () => {
  for (const [id, def] of Object.entries(scenariosById)) {
    it(`${id}: no entity stands on water, and no building overlaps gaia objects`, () => {
      expect(checkScenario(def)).toEqual([]);
    });
  }
});
