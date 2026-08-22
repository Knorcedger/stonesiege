import { gameData } from '@bf/data';
import { GAIA, type GameState, type PlayerId } from '@bf/sim/types';
import type { Sighting } from './memory';
import type { GaiaResourceSighting } from './resourceMemory';

export interface ObservedMap {
  isWalkable(tileX: number, tileY: number): boolean;
  canPlace(defId: string, tileX: number, tileY: number): boolean;
}

/** Build spatial queries from terrain plus player-observable occupancy only. */
export function createObservedMap(
  state: GameState,
  player: PlayerId,
  enemyBuildings: readonly Sighting[],
  enemyUnits: readonly Sighting[],
  resources: readonly GaiaResourceSighting[],
): ObservedMap {
  const { width, height, terrain, terrainIds } = state.map;
  const visibility = state.players[player]?.visibility;
  const myTeam = state.players[player]?.setup.team ?? 0;
  const blockers = new Uint16Array(width * height);
  const placementUnits = new Uint16Array(width * height);
  const friendlyGateTiles = new Set<number>();
  const gateCandidates: number[] = [];
  const visibleResourceIds = new Set<number>();

  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height;
  const terrainWalkable = (tile: number): boolean => {
    const id = terrainIds[terrain[tile]];
    return id !== 'water' && id !== 'cliff';
  };
  const visible = (x: number, y: number): boolean =>
    visibility?.[y * width + x] === 2;
  const friendly = (owner: PlayerId): boolean => {
    if (owner === player) return true;
    const team = state.players[owner]?.setup.team ?? 0;
    return myTeam > 0 && team === myTeam;
  };
  const addFootprint = (grid: Uint16Array, x: number, y: number, size: number): void => {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (inBounds(x + dx, y + dy)) grid[(y + dy) * width + x + dx]++;
      }
    }
  };

  for (const entity of state.entities.values()) {
    if (entity.kind === 'resource') {
      if (entity.player === GAIA && visible(entity.tileX, entity.tileY)
        && (entity.amountLeft ?? 0) > 0 && entity.stump !== true) {
        addFootprint(blockers, entity.tileX, entity.tileY, 1);
        visibleResourceIds.add(entity.id);
      }
      continue;
    }
    if (entity.kind === 'unit') {
      if (entity.hp > 0 && entity.garrisonedIn === undefined
        && entity.player !== player && entity.player !== GAIA && friendly(entity.player)) {
        addFootprint(placementUnits, entity.tileX, entity.tileY, 1);
      }
      continue;
    }
    if (entity.player === GAIA && !visible(entity.tileX, entity.tileY)) continue;
    if (entity.hp <= 0 || (entity.player !== GAIA && !friendly(entity.player))) continue;
    const size = gameData.buildings[entity.defId]?.size ?? 1;
    addFootprint(blockers, entity.tileX, entity.tileY, size);
    if (entity.player !== GAIA && (entity.buildProgress ?? 1000) >= 1000
      && gameData.buildings[entity.defId]?.gate === true) {
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (inBounds(entity.tileX + dx, entity.tileY + dy)) {
            gateCandidates.push((entity.tileY + dy) * width + entity.tileX + dx);
          }
        }
      }
    }
  }

  for (const resource of resources) {
    if (visible(resource.tileX, resource.tileY) || visibleResourceIds.has(resource.id)) continue;
    addFootprint(blockers, resource.tileX, resource.tileY, 1);
  }
  for (const building of enemyBuildings) {
    addFootprint(
      blockers,
      building.tileX,
      building.tileY,
      gameData.buildings[building.defId]?.size ?? 1,
    );
  }
  for (const unit of enemyUnits) {
    addFootprint(placementUnits, unit.tileX, unit.tileY, 1);
  }
  for (const tile of gateCandidates) {
    if (blockers[tile] === 1 && terrainWalkable(tile)) friendlyGateTiles.add(tile);
  }

  return {
    isWalkable(tileX, tileY): boolean {
      if (!inBounds(tileX, tileY)) return false;
      const tile = tileY * width + tileX;
      return terrainWalkable(tile)
        && (blockers[tile] === 0 || friendlyGateTiles.has(tile));
    },
    canPlace(defId, tileX, tileY): boolean {
      const def = gameData.buildings[defId];
      if (!def) return false;
      for (let dy = 0; dy < def.size; dy++) {
        for (let dx = 0; dx < def.size; dx++) {
          const x = tileX + dx;
          const y = tileY + dy;
          if (!inBounds(x, y)) return false;
          const tile = y * width + x;
          if (!terrainWalkable(tile) || blockers[tile] !== 0
            || placementUnits[tile] !== 0) return false;
        }
      }
      return true;
    },
  };
}
