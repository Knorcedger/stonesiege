// Narrow sim-side ScenarioOps surface (Game.ops). The trigger engine in
// @bf/scenarios adapts these five primitives (plus plain GameState reads) into its
// own ScenarioOps interface; everything routes through the same deterministic code
// paths the sim itself uses (spawnEntity, transferOwnership, vision groups).

import { gameData } from '@bf/data';
import { GAIA } from './types';
import type { EntityId, PlayerId, SimOps, SimOpsQuery, SimOpsSpawn, Stockpile, TileRect } from './types';
import { inBounds, isTileWalkable } from './internal';
import type { SimState } from './internal';
import { defKind, spawnEntity, transferOwnership } from './entities';

function inRect(tileX: number, tileY: number, r: TileRect): boolean {
  return tileX >= r.x && tileX < r.x + r.w && tileY >= r.y && tileY < r.y + r.h;
}

const NUDGE_MAX_RING = 8;

/**
 * OPS_NEEDED.md spawn semantics: an occupied target tile nudges to the nearest free
 * spot (mapgen-style deterministic ring scan) instead of failing or stacking. Returns
 * the anchor tile for a free size×size footprint, or null when nothing fits nearby.
 * Units use size 1 (they never block tiles, but must not spawn INSIDE a blocker).
 */
function freeFootprintNear(
  state: SimState, tileX: number, tileY: number, size: number,
): { x: number; y: number } | null {
  const fits = (x: number, y: number): boolean => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (!isTileWalkable(state, x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  if (fits(tileX, tileY)) return { x: tileX, y: tileY };
  for (let r = 1; r <= NUDGE_MAX_RING; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (fits(tileX + dx, tileY + dy)) return { x: tileX + dx, y: tileY + dy };
      }
    }
  }
  return null;
}

export function makeSimOps(state: SimState): SimOps {
  return {
    spawn(entities: SimOpsSpawn[]): EntityId[] {
      const ids: EntityId[] = [];
      for (const init of entities) {
        const kind = defKind(init.defId);
        if (!kind) continue;
        const size = kind === 'building' ? gameData.buildings[init.defId].size : 1;
        const spot = freeFootprintNear(state, init.tileX, init.tileY, size);
        if (!spot) continue; // nothing free nearby — dropped (ids array just skips it)
        const e = spawnEntity(state, {
          defId: init.defId, player: init.player, tileX: spot.x, tileY: spot.y,
          hp: init.hp, facing: init.facing, amountLeft: init.amountLeft, ref: init.ref,
        });
        if (e) ids.push(e.id);
      }
      return ids;
    },

    changeOwner(entityIds: EntityId[], toPlayer: PlayerId): void {
      if (toPlayer < 0 || toPlayer >= state.players.length) return;
      for (const id of entityIds) {
        const e = state.entities.get(id);
        if (!e || e.hp <= 0 || e.kind === 'resource') continue;
        transferOwnership(state, e, toPlayer);
      }
    },

    revealArea(player: PlayerId, area: TileRect): void {
      if (player <= GAIA || player >= state.players.length) return;
      const group = state.visionGroupOf[player];
      const vis = state.vision[group]?.visibility;
      if (!vis) return;
      for (let dy = 0; dy < area.h; dy++) {
        for (let dx = 0; dx < area.w; dx++) {
          const x = area.x + dx, y = area.y + dy;
          if (!inBounds(state.map, x, y)) continue;
          const t = y * state.map.width + x;
          if (vis[t] === 0) vis[t] = 1; // explored (never force "visible")
        }
      }
    },

    addResources(player: PlayerId, amounts: Partial<Stockpile>): void {
      const p = state.players[player];
      if (!p || player <= GAIA) return;
      p.stockpile.food = Math.max(0, p.stockpile.food + (amounts.food ?? 0));
      p.stockpile.wood = Math.max(0, p.stockpile.wood + (amounts.wood ?? 0));
      p.stockpile.gold = Math.max(0, p.stockpile.gold + (amounts.gold ?? 0));
      p.stockpile.stone = Math.max(0, p.stockpile.stone + (amounts.stone ?? 0));
    },

    getCounts(query: SimOpsQuery): number {
      let count = 0;
      for (const e of state.entities.values()) {
        if (query.player !== undefined && e.player !== query.player) continue;
        if (query.defIds && !query.defIds.includes(e.defId)) continue;
        if (query.area && !inRect(e.tileX, e.tileY, query.area)) continue;
        if (e.kind === 'unit' && e.hp <= 0) continue; // corpses/carcasses don't count
        if (e.kind === 'building' && ((e.buildProgress ?? 1000) < 1000 || e.hp <= 0)) continue;
        if (e.kind === 'resource' && (e.amountLeft ?? 0) <= 0) continue; // stumps don't count
        count++;
      }
      return count;
    },
  };
}
