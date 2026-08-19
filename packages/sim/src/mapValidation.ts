import { gameData } from '@bf/data';
import type {
  Entity, Game, PlayerId, ResourceType, TerrainId,
} from './types';
import { FP, GAIA } from './types';

export const MAP_VALIDATION_SCHEMA_VERSION = 1 as const;

const RESOURCE_TYPES: readonly ResourceType[] = ['food', 'wood', 'gold', 'stone'];

export type MapValidationSeverity = 'error' | 'warning';

export type MapValidationIssueCode =
  | 'DISCONNECTED_MOVEMENT_REGION'
  | 'START_REQUIRED_ENTITY_MISSING'
  | 'START_NO_ACCESS'
  | 'START_OUTSIDE_MAIN_COMPONENT'
  | 'STARTS_TOO_CLOSE'
  | 'START_BUILDABLE_SPACE_LOW'
  | 'RESOURCE_SHORTAGE'
  | 'SEALED_RESOURCE_CLUSTER'
  | 'NARROW_STRATEGIC_CROSSING';

export interface MapValidationProfile {
  id: string;
  requiredStartDefId: string | null;
  maximumMovementComponents: number;
  minimumStartSpacingTiles: number;
  buildableRadiusTiles: number;
  buildableFootprintSize: number;
  minimumBuildablePlacements: number;
  resourceRadiusTiles: number;
  minimumReachableResourceNodes: Readonly<Record<ResourceType, number>>;
  reportedCrossingMaximumWidth: number;
  minimumStrategicCrossingWidth: number;
  minimumCrossingLongSpan: number;
  minimumStrategicSideTiles: number;
}

/**
 * Conservative land-map requirements matching the current Practice generator. Future
 * map families (especially Islands) should provide their own explicit profile rather
 * than weakening this one.
 */
export const PRACTICE_MAP_VALIDATION_PROFILE: Readonly<MapValidationProfile> = Object.freeze({
  id: 'practice-land-v1',
  requiredStartDefId: 'townCenter',
  maximumMovementComponents: 1,
  minimumStartSpacingTiles: 30,
  buildableRadiusTiles: 16,
  buildableFootprintSize: 2,
  minimumBuildablePlacements: 80,
  resourceRadiusTiles: 40,
  minimumReachableResourceNodes: Object.freeze({ food: 9, wood: 12, gold: 10, stone: 7 }),
  reportedCrossingMaximumWidth: 6,
  minimumStrategicCrossingWidth: 3,
  minimumCrossingLongSpan: 12,
  minimumStrategicSideTiles: 64,
});

export interface MapValidationIssue {
  severity: MapValidationSeverity;
  code: MapValidationIssueCode;
  message: string;
  playerId?: PlayerId;
  otherPlayerId?: PlayerId;
  resource?: ResourceType;
  x?: number;
  y?: number;
  actual?: number;
  required?: number;
}

export interface MapValidationBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MovementComponentReport {
  id: number;
  tileCount: number;
  bounds: MapValidationBounds;
  startPlayers: PlayerId[];
}

export interface StrategicCrossingReport {
  id: number;
  orientation: 'horizontal' | 'vertical' | 'mixed';
  tileCount: number;
  minimumWidth: number;
  maximumWidth: number;
  containsShallows: boolean;
  separatesLargeRegions: boolean;
  bounds: MapValidationBounds;
}

export interface ResourceAccessReport {
  nearbyNodes: number;
  nearbyAmount: number;
  reachableNodes: number;
  reachableAmount: number;
  nearbyClusters: number;
  reachableClusters: number;
}

export interface PlayerMapValidationReport {
  playerId: PlayerId;
  startEntityId: number | null;
  startDefId: string | null;
  startX: number | null;
  startY: number | null;
  accessX: number | null;
  accessY: number | null;
  movementComponentId: number | null;
  nearestOtherStartTiles: number | null;
  reachableTiles: number;
  buildablePlacements: number;
  resources: Record<ResourceType, ResourceAccessReport>;
}

export interface MapValidationReport {
  schemaVersion: typeof MAP_VALIDATION_SCHEMA_VERSION;
  profile: MapValidationProfile;
  valid: boolean;
  summary: {
    errors: number;
    warnings: number;
  };
  map: {
    width: number;
    height: number;
    passableTerrainTiles: number;
    movementComponentCount: number;
    mainMovementComponentId: number | null;
    mainMovementComponentTiles: number;
  };
  movementComponents: MovementComponentReport[];
  strategicCrossings: StrategicCrossingReport[];
  players: PlayerMapValidationReport[];
  issues: MapValidationIssue[];
}

type ValidationGame = Pick<Game, 'state' | 'isWalkable'>;

interface ComponentAnalysis {
  componentAt: Int32Array;
  components: MovementComponentReport[];
  mainId: number;
  passableTiles: number;
}

interface PlayerWork {
  report: PlayerMapValidationReport;
  start: Entity | null;
  reach: Uint8Array | null;
}

interface ResourceNode {
  entity: Entity;
  x: number;
  y: number;
}

function inBounds(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function terrainIdAt(game: ValidationGame, index: number): TerrainId {
  const { map } = game.state;
  return map.terrainIds[map.terrain[index]];
}

function terrainPassable(game: ValidationGame, index: number): boolean {
  const terrain = terrainIdAt(game, index);
  return terrain !== 'water' && terrain !== 'cliff';
}

function analyzeComponents(game: ValidationGame): ComponentAnalysis {
  const { width, height } = game.state.map;
  const componentAt = new Int32Array(width * height).fill(-1);
  const components: MovementComponentReport[] = [];
  let passableTiles = 0;

  for (let start = 0; start < componentAt.length; start++) {
    if (componentAt[start] >= 0 || !terrainPassable(game, start)) continue;
    const id = components.length;
    const queue = [start];
    componentAt[start] = id;
    let tileCount = 0;
    let left = width, top = height, right = 0, bottom = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const tile = queue[qi];
      const x = tile % width, y = (tile / width) | 0;
      tileCount++;
      passableTiles++;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
      const neighbors = [
        x > 0 ? tile - 1 : -1,
        x < width - 1 ? tile + 1 : -1,
        y > 0 ? tile - width : -1,
        y < height - 1 ? tile + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || componentAt[next] >= 0 || !terrainPassable(game, next)) continue;
        componentAt[next] = id;
        queue.push(next);
      }
    }
    components.push({ id, tileCount, bounds: { left, top, right, bottom }, startPlayers: [] });
  }

  let mainId = -1;
  for (const component of components) {
    if (mainId < 0 || component.tileCount > components[mainId].tileCount) mainId = component.id;
  }
  return { componentAt, components, mainId, passableTiles };
}

function entityCenter(entity: Entity): { x: number; y: number } {
  if (entity.kind !== 'building') return { x: entity.tileX, y: entity.tileY };
  // Entity x/y are already the footprint center in fixed-point units. Keeping this
  // helper independent from data defs also supports injected scenario definitions.
  return { x: Math.floor(entity.x / FP), y: Math.floor(entity.y / FP) };
}

function chooseStart(game: ValidationGame, playerId: PlayerId, requiredDefId: string | null): Entity | null {
  const owned = [...game.state.entities.values()]
    .filter((entity) => entity.player === playerId && entity.hp > 0 && entity.activity !== 'dying')
    .sort((a, b) => a.id - b.id);
  return owned.find((entity) => requiredDefId !== null && entity.defId === requiredDefId)
    ?? owned.find((entity) => entity.kind === 'building' && entity.buildProgress === 1000)
    ?? owned.find((entity) => entity.kind === 'building')
    ?? owned.find((entity) => entity.kind === 'unit')
    ?? null;
}

function findAccessTile(
  game: ValidationGame, playerId: PlayerId, start: Entity,
): { x: number; y: number } | null {
  const { width, height } = game.state.map;
  if (start.kind !== 'building' && game.isWalkable(start.tileX, start.tileY, playerId)) {
    return { x: start.tileX, y: start.tileY };
  }
  const size = start.kind === 'building' ? gameData.buildings[start.defId]?.size ?? 1 : 1;
  const left = start.tileX - 1, top = start.tileY - 1;
  const right = start.tileX + size, bottom = start.tileY + size;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const inside = x >= start.tileX && x < start.tileX + size
        && y >= start.tileY && y < start.tileY + size;
      if (!inside && inBounds(width, height, x, y) && game.isWalkable(x, y, playerId)) {
        return { x, y };
      }
    }
  }
  return null;
}

function floodPlayerReach(
  game: ValidationGame, playerId: PlayerId, start: { x: number; y: number },
): Uint8Array {
  const { width, height } = game.state.map;
  const seen = new Uint8Array(width * height);
  const first = start.y * width + start.x;
  const queue = [first];
  seen[first] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const tile = queue[qi];
    const tx = tile % width, ty = (tile / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tx + dx, y = ty + dy;
        if (!inBounds(width, height, x, y) || !game.isWalkable(x, y, playerId)) continue;
        if (dx !== 0 && dy !== 0
          && (!game.isWalkable(tx + dx, ty, playerId)
            || !game.isWalkable(tx, ty + dy, playerId))) continue;
        const next = y * width + x;
        if (seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return seen;
}

function countSet(values: Uint8Array): number {
  let count = 0;
  for (const value of values) count += value === 0 ? 0 : 1;
  return count;
}

function footprintBuildable(game: ValidationGame, x: number, y: number, size: number): boolean {
  const { width, height } = game.state.map;
  if (x < 0 || y < 0 || x + size > width || y + size > height) return false;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (!game.isWalkable(x + dx, y + dy)) return false;
    }
  }
  return true;
}

function countBuildablePlacements(
  game: ValidationGame, center: { x: number; y: number }, profile: MapValidationProfile,
): number {
  const radius = profile.buildableRadiusTiles;
  const size = profile.buildableFootprintSize;
  const radius2 = (radius * 2) ** 2;
  let count = 0;
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      const dx2 = 2 * x + size - center.x * 2;
      const dy2 = 2 * y + size - center.y * 2;
      if (dx2 * dx2 + dy2 * dy2 > radius2) continue;
      if (footprintBuildable(game, x, y, size)) count++;
    }
  }
  return count;
}

function emptyResourceReport(): Record<ResourceType, ResourceAccessReport> {
  return {
    food: { nearbyNodes: 0, nearbyAmount: 0, reachableNodes: 0, reachableAmount: 0, nearbyClusters: 0, reachableClusters: 0 },
    wood: { nearbyNodes: 0, nearbyAmount: 0, reachableNodes: 0, reachableAmount: 0, nearbyClusters: 0, reachableClusters: 0 },
    gold: { nearbyNodes: 0, nearbyAmount: 0, reachableNodes: 0, reachableAmount: 0, nearbyClusters: 0, reachableClusters: 0 },
    stone: { nearbyNodes: 0, nearbyAmount: 0, reachableNodes: 0, reachableAmount: 0, nearbyClusters: 0, reachableClusters: 0 },
  };
}

function resourceClusters(nodes: ResourceNode[]): ResourceNode[][] {
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.entity.id - b.entity.id);
  const byTile = new Map<string, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const key = `${sorted[i].x},${sorted[i].y}`;
    const list = byTile.get(key);
    if (list) list.push(i);
    else byTile.set(key, [i]);
  }
  const seen = new Uint8Array(sorted.length);
  const clusters: ResourceNode[][] = [];
  for (let start = 0; start < sorted.length; start++) {
    if (seen[start]) continue;
    const indexes = [start];
    const cluster: ResourceNode[] = [];
    seen[start] = 1;
    for (let qi = 0; qi < indexes.length; qi++) {
      const index = indexes[qi];
      const node = sorted[index];
      cluster.push(node);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighbors = byTile.get(`${node.x + dx},${node.y + dy}`) ?? [];
          for (const next of neighbors) {
            if (seen[next]) continue;
            seen[next] = 1;
            indexes.push(next);
          }
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function clusterReachable(
  cluster: readonly ResourceNode[], reach: Uint8Array, width: number, height: number,
): boolean {
  for (const node of cluster) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = node.x + dx, y = node.y + dy;
        if (inBounds(width, height, x, y) && reach[y * width + x]) return true;
      }
    }
  }
  return false;
}

function analyzeResources(
  game: ValidationGame,
  work: PlayerWork,
  profile: MapValidationProfile,
  issues: MapValidationIssue[],
): void {
  if (!work.start || !work.reach) return;
  const { width, height } = game.state.map;
  const center = entityCenter(work.start);
  const radius2 = profile.resourceRadiusTiles ** 2;

  for (const resource of RESOURCE_TYPES) {
    const allNodes: ResourceNode[] = [];
    for (const entity of game.state.entities.values()) {
      if (entity.player !== GAIA || entity.stump) continue;
      const unitFood = entity.kind === 'unit' ? gameData.units[entity.defId]?.foodAmount : undefined;
      const resourceType = entity.resourceType ?? (unitFood !== undefined ? 'food' : undefined);
      const amount = entity.amountLeft ?? unitFood ?? 0;
      if (resourceType !== resource || amount <= 0) continue;
      allNodes.push({ entity, x: entity.tileX, y: entity.tileY });
    }
    // Form physical clusters before applying the player's nearby radius. A
    // forest is progressively harvestable: a villager reaches the exposed
    // outer tree, then opens the trees behind it. Clipping first can turn one
    // accessible edge forest into an artificial one-tree "sealed cluster" at
    // the radius boundary even though that tree belongs to the same woodline.
    const clusters = resourceClusters(allNodes);
    const report = work.report.resources[resource];
    for (const cluster of clusters) {
      const nearby = cluster.filter((node) => {
        const dx = node.x - center.x, dy = node.y - center.y;
        return dx * dx + dy * dy <= radius2;
      });
      if (nearby.length === 0) continue;
      report.nearbyClusters++;
      const nodeCount = nearby.length;
      const amount = nearby.reduce((total, node) => total + (
        node.entity.amountLeft ?? (node.entity.kind === 'unit'
          ? gameData.units[node.entity.defId]?.foodAmount ?? 0
          : 0)
      ), 0);
      report.nearbyNodes += nodeCount;
      report.nearbyAmount += amount;
      if (clusterReachable(cluster, work.reach, width, height)) {
        report.reachableClusters++;
        report.reachableNodes += nodeCount;
        report.reachableAmount += amount;
      } else {
        const first = nearby[0];
        issues.push({
          severity: 'warning', code: 'SEALED_RESOURCE_CLUSTER',
          message: `Player ${work.report.playerId} cannot reach the ${resource} cluster at ${first.x},${first.y}`,
          playerId: work.report.playerId, resource, x: first.x, y: first.y,
          actual: 0, required: 1,
        });
      }
    }
    const required = profile.minimumReachableResourceNodes[resource];
    if (report.reachableNodes < required) {
      issues.push({
        severity: 'error', code: 'RESOURCE_SHORTAGE',
        message: `Player ${work.report.playerId} has ${report.reachableNodes}/${required} reachable ${resource} nodes within ${profile.resourceRadiusTiles} tiles`,
        playerId: work.report.playerId, resource,
        actual: report.reachableNodes, required,
      });
    }
  }
}

function fillRuns(game: ValidationGame, componentAt: Int32Array, mainId: number): {
  horizontal: Uint16Array;
  vertical: Uint16Array;
} {
  const { width, height } = game.state.map;
  const horizontal = new Uint16Array(width * height);
  const vertical = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      while (x < width && componentAt[y * width + x] !== mainId) x++;
      const start = x;
      while (x < width && componentAt[y * width + x] === mainId) x++;
      const length = x - start;
      for (let fill = start; fill < x; fill++) horizontal[y * width + fill] = length;
    }
  }
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      while (y < height && componentAt[y * width + x] !== mainId) y++;
      const start = y;
      while (y < height && componentAt[y * width + x] === mainId) y++;
      const length = y - start;
      for (let fill = start; fill < y; fill++) vertical[fill * width + x] = length;
    }
  }
  return { horizontal, vertical };
}

function separatesLargeRegions(
  game: ValidationGame,
  componentAt: Int32Array,
  mainId: number,
  group: readonly number[],
  minimumSideTiles: number,
): boolean {
  const { width, height } = game.state.map;
  const excluded = new Uint8Array(width * height);
  for (const tile of group) excluded[tile] = 1;
  const seeds = new Set<number>();
  for (const tile of group) {
    const x = tile % width, y = (tile / width) | 0;
    if (x > 0 && !excluded[tile - 1]) seeds.add(tile - 1);
    if (x < width - 1 && !excluded[tile + 1]) seeds.add(tile + 1);
    if (y > 0 && !excluded[tile - width]) seeds.add(tile - width);
    if (y < height - 1 && !excluded[tile + width]) seeds.add(tile + width);
  }
  const seen = new Uint8Array(width * height);
  let largeSides = 0;
  for (const seed of [...seeds].sort((a, b) => a - b)) {
    if (seen[seed] || componentAt[seed] !== mainId) continue;
    const queue = [seed];
    seen[seed] = 1;
    let size = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const tile = queue[qi];
      size++;
      const x = tile % width, y = (tile / width) | 0;
      const neighbors = [
        x > 0 ? tile - 1 : -1,
        x < width - 1 ? tile + 1 : -1,
        y > 0 ? tile - width : -1,
        y < height - 1 ? tile + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || excluded[next] || componentAt[next] !== mainId) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    if (size >= minimumSideTiles) largeSides++;
    if (largeSides >= 2) return true;
  }
  return false;
}

function analyzeCrossings(
  game: ValidationGame,
  analysis: ComponentAnalysis,
  profile: MapValidationProfile,
  issues: MapValidationIssue[],
): StrategicCrossingReport[] {
  if (analysis.mainId < 0) return [];
  const { width, height } = game.state.map;
  const { horizontal, vertical } = fillRuns(game, analysis.componentAt, analysis.mainId);
  const candidates = new Uint8Array(width * height);
  for (let tile = 0; tile < candidates.length; tile++) {
    if (analysis.componentAt[tile] !== analysis.mainId) continue;
    const narrow = Math.min(horizontal[tile], vertical[tile]);
    const long = Math.max(horizontal[tile], vertical[tile]);
    if (narrow <= profile.reportedCrossingMaximumWidth
      && long >= profile.minimumCrossingLongSpan) candidates[tile] = 1;
  }

  const seen = new Uint8Array(candidates.length);
  const reports: StrategicCrossingReport[] = [];
  for (let start = 0; start < candidates.length; start++) {
    if (!candidates[start] || seen[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let qi = 0; qi < group.length; qi++) {
      const tile = group[qi];
      const x = tile % width, y = (tile / width) | 0;
      const neighbors = [
        x > 0 ? tile - 1 : -1,
        x < width - 1 ? tile + 1 : -1,
        y > 0 ? tile - width : -1,
        y < height - 1 ? tile + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || !candidates[next]) continue;
        seen[next] = 1;
        group.push(next);
      }
    }

    let left = width, top = height, right = 0, bottom = 0;
    let minimumWidth = Number.MAX_SAFE_INTEGER, maximumWidth = 0;
    let horizontalVotes = 0, verticalVotes = 0;
    let containsShallows = false;
    for (const tile of group) {
      const x = tile % width, y = (tile / width) | 0;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
      const widthAtTile = Math.min(horizontal[tile], vertical[tile]);
      minimumWidth = Math.min(minimumWidth, widthAtTile);
      maximumWidth = Math.max(maximumWidth, widthAtTile);
      if (vertical[tile] < horizontal[tile]) horizontalVotes++;
      else if (horizontal[tile] < vertical[tile]) verticalVotes++;
      if (terrainIdAt(game, tile) === 'shallows') containsShallows = true;
    }
    const strategic = separatesLargeRegions(
      game, analysis.componentAt, analysis.mainId, group, profile.minimumStrategicSideTiles,
    );
    if (!containsShallows && !strategic) continue;
    const orientation = horizontalVotes > verticalVotes
      ? 'horizontal' as const
      : verticalVotes > horizontalVotes ? 'vertical' as const : 'mixed' as const;
    const report: StrategicCrossingReport = {
      id: reports.length,
      orientation,
      tileCount: group.length,
      minimumWidth,
      maximumWidth,
      containsShallows,
      separatesLargeRegions: strategic,
      bounds: { left, top, right, bottom },
    };
    reports.push(report);
    if (strategic && minimumWidth < profile.minimumStrategicCrossingWidth) {
      issues.push({
        severity: 'error', code: 'NARROW_STRATEGIC_CROSSING',
        message: `Crossing at ${left},${top} is ${minimumWidth} tiles wide; ${profile.minimumStrategicCrossingWidth} required`,
        x: left, y: top, actual: minimumWidth, required: profile.minimumStrategicCrossingWidth,
      });
    }
  }
  return reports;
}

function compareIssues(a: MapValidationIssue, b: MapValidationIssue): number {
  return (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)
    || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    || (a.playerId ?? -1) - (b.playerId ?? -1)
    || RESOURCE_TYPES.indexOf(a.resource ?? 'food') - RESOURCE_TYPES.indexOf(b.resource ?? 'food')
    || (a.y ?? -1) - (b.y ?? -1)
    || (a.x ?? -1) - (b.x ?? -1)
    || (a.message < b.message ? -1 : a.message > b.message ? 1 : 0);
}

/**
 * Analyze a resolved game map without changing simulation state. The report contains no
 * timestamps or platform values, and every collection has a stable order so identical
 * inputs and profiles produce byte-equivalent JSON.
 */
export function validateMap(
  game: ValidationGame,
  profile: MapValidationProfile = PRACTICE_MAP_VALIDATION_PROFILE,
): MapValidationReport {
  const issues: MapValidationIssue[] = [];
  const componentAnalysis = analyzeComponents(game);
  const { width, height } = game.state.map;

  if (componentAnalysis.components.length > profile.maximumMovementComponents) {
    issues.push({
      severity: 'error', code: 'DISCONNECTED_MOVEMENT_REGION',
      message: `Map has ${componentAnalysis.components.length} passable terrain components; ${profile.maximumMovementComponents} allowed`,
      actual: componentAnalysis.components.length,
      required: profile.maximumMovementComponents,
    });
  }

  const work: PlayerWork[] = [];
  for (let playerId = 1; playerId < game.state.players.length; playerId++) {
    const start = chooseStart(game, playerId, profile.requiredStartDefId);
    if (profile.requiredStartDefId !== null && start?.defId !== profile.requiredStartDefId) {
      issues.push({
        severity: 'error', code: 'START_REQUIRED_ENTITY_MISSING',
        message: `Player ${playerId} has no ${profile.requiredStartDefId} start entity`,
        playerId, actual: 0, required: 1,
      });
    }
    const center = start ? entityCenter(start) : null;
    const access = start ? findAccessTile(game, playerId, start) : null;
    if (start && !access) {
      issues.push({
        severity: 'error', code: 'START_NO_ACCESS',
        message: `Player ${playerId} has no walkable access tile adjoining its start footprint`,
        playerId, x: center!.x, y: center!.y, actual: 0, required: 1,
      });
    }
    const componentId = access ? componentAnalysis.componentAt[access.y * width + access.x] : -1;
    if (componentId >= 0) componentAnalysis.components[componentId].startPlayers.push(playerId);
    if (componentId >= 0 && componentAnalysis.mainId >= 0 && componentId !== componentAnalysis.mainId) {
      issues.push({
        severity: 'error', code: 'START_OUTSIDE_MAIN_COMPONENT',
        message: `Player ${playerId} starts in movement component ${componentId}, outside main component ${componentAnalysis.mainId}`,
        playerId, x: access!.x, y: access!.y,
        actual: componentId, required: componentAnalysis.mainId,
      });
    }
    const reach = access ? floodPlayerReach(game, playerId, access) : null;
    const buildablePlacements = center ? countBuildablePlacements(game, center, profile) : 0;
    if (start && buildablePlacements < profile.minimumBuildablePlacements) {
      issues.push({
        severity: 'error', code: 'START_BUILDABLE_SPACE_LOW',
        message: `Player ${playerId} has ${buildablePlacements}/${profile.minimumBuildablePlacements} buildable ${profile.buildableFootprintSize}x${profile.buildableFootprintSize} placements near its start`,
        playerId, x: center!.x, y: center!.y,
        actual: buildablePlacements, required: profile.minimumBuildablePlacements,
      });
    }
    work.push({
      start,
      reach,
      report: {
        playerId,
        startEntityId: start?.id ?? null,
        startDefId: start?.defId ?? null,
        startX: center?.x ?? null,
        startY: center?.y ?? null,
        accessX: access?.x ?? null,
        accessY: access?.y ?? null,
        movementComponentId: componentId >= 0 ? componentId : null,
        nearestOtherStartTiles: null,
        reachableTiles: reach ? countSet(reach) : 0,
        buildablePlacements,
        resources: emptyResourceReport(),
      },
    });
  }

  for (let i = 0; i < work.length; i++) {
    const start = work[i].start;
    if (!start) continue;
    const a = entityCenter(start);
    let nearest: number | null = null;
    for (let j = 0; j < work.length; j++) {
      const otherStart = work[j].start;
      if (i === j || !otherStart) continue;
      const b = entityCenter(otherStart);
      const distance = Math.floor(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
      nearest = nearest === null ? distance : Math.min(nearest, distance);
      if (j > i && distance < profile.minimumStartSpacingTiles) {
        issues.push({
          severity: 'error', code: 'STARTS_TOO_CLOSE',
          message: `Players ${work[i].report.playerId} and ${work[j].report.playerId} start ${distance}/${profile.minimumStartSpacingTiles} tiles apart`,
          playerId: work[i].report.playerId,
          otherPlayerId: work[j].report.playerId,
          x: a.x, y: a.y, actual: distance, required: profile.minimumStartSpacingTiles,
        });
      }
    }
    work[i].report.nearestOtherStartTiles = nearest;
    analyzeResources(game, work[i], profile, issues);
  }

  const strategicCrossings = analyzeCrossings(game, componentAnalysis, profile, issues);
  issues.sort(compareIssues);
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const main = componentAnalysis.mainId >= 0
    ? componentAnalysis.components[componentAnalysis.mainId]
    : null;
  return {
    schemaVersion: MAP_VALIDATION_SCHEMA_VERSION,
    profile: {
      ...profile,
      minimumReachableResourceNodes: { ...profile.minimumReachableResourceNodes },
    },
    valid: errors === 0,
    summary: { errors, warnings },
    map: {
      width,
      height,
      passableTerrainTiles: componentAnalysis.passableTiles,
      movementComponentCount: componentAnalysis.components.length,
      mainMovementComponentId: componentAnalysis.mainId >= 0 ? componentAnalysis.mainId : null,
      mainMovementComponentTiles: main?.tileCount ?? 0,
    },
    movementComponents: componentAnalysis.components,
    strategicCrossings,
    players: work.map((item) => item.report),
    issues,
  };
}
