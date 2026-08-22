import {
  GAIA,
  type Entity,
  type EntityId,
  type GameState,
  type PlayerId,
  type ResourceType,
  type UnitActivity,
} from '@bf/sim/types';

const RESOURCE_MEMORY_VERSION = 1;
const MAX_REMEMBERED_RESOURCES = 8_192;

export interface RememberedResource {
  id: EntityId;
  defId: string;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  facing: number;
  hp: number;
  maxHp: number;
  activity: UnitActivity;
  amountLeft?: number;
  resourceType?: ResourceType;
  stump?: boolean;
}

export interface ResourceMemorySnapshot {
  version: number;
  player: PlayerId;
  resources: RememberedResource[];
}

function remember(entity: Entity): RememberedResource {
  return {
    id: entity.id,
    defId: entity.defId,
    x: entity.x,
    y: entity.y,
    tileX: entity.tileX,
    tileY: entity.tileY,
    facing: entity.facing,
    hp: entity.hp,
    maxHp: entity.maxHp,
    activity: entity.activity,
    ...(entity.amountLeft === undefined ? {} : { amountLeft: entity.amountLeft }),
    ...(entity.resourceType === undefined ? {} : { resourceType: entity.resourceType }),
    ...(entity.stump === undefined ? {} : { stump: entity.stump }),
  };
}

function projection(resource: RememberedResource): Entity {
  return { ...resource, kind: 'resource', player: GAIA };
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const RESOURCE_TYPES: readonly ResourceType[] = ['food', 'wood', 'gold', 'stone'];
const ACTIVITIES: readonly UnitActivity[] = [
  'idle', 'moving', 'attacking', 'gathering', 'building', 'repairing',
  'carrying', 'dying', 'garrisoned', 'healing', 'converting', 'fleeing',
];

/** Decode the persisted presentation memory without trusting its object shape. */
export function canonicalResourceMemorySnapshot(value: unknown): ResourceMemorySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ResourceMemorySnapshot>;
  if (candidate.version !== RESOURCE_MEMORY_VERSION || !isSafeInt(candidate.player)
    || candidate.player <= GAIA || !Array.isArray(candidate.resources)
    || candidate.resources.length > MAX_REMEMBERED_RESOURCES) return null;
  const resources: RememberedResource[] = [];
  const ids = new Set<number>();
  for (const raw of candidate.resources) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Partial<RememberedResource>;
    if (!isSafeInt(item.id) || item.id <= 0 || ids.has(item.id)
      || typeof item.defId !== 'string' || item.defId.length === 0 || item.defId.length > 64
      || !isSafeInt(item.x) || !isSafeInt(item.y)
      || !isSafeInt(item.tileX) || !isSafeInt(item.tileY)
      || !isSafeInt(item.facing) || item.facing < 0 || item.facing > 7
      || !isSafeInt(item.hp) || !isSafeInt(item.maxHp)
      || typeof item.activity !== 'string' || !ACTIVITIES.includes(item.activity as UnitActivity)
      || (item.amountLeft !== undefined && !isSafeInt(item.amountLeft))
      || (item.resourceType !== undefined
        && !RESOURCE_TYPES.includes(item.resourceType as ResourceType))
      || (item.stump !== undefined && typeof item.stump !== 'boolean')) return null;
    ids.add(item.id);
    resources.push({
      id: item.id,
      defId: item.defId,
      x: item.x,
      y: item.y,
      tileX: item.tileX,
      tileY: item.tileY,
      facing: item.facing,
      hp: item.hp,
      maxHp: item.maxHp,
      activity: item.activity as UnitActivity,
      ...(item.amountLeft === undefined ? {} : { amountLeft: item.amountLeft }),
      ...(item.resourceType === undefined ? {} : { resourceType: item.resourceType as ResourceType }),
      ...(item.stump === undefined ? {} : { stump: item.stump }),
    });
  }
  return { version: RESOURCE_MEMORY_VERSION, player: candidate.player, resources };
}

/** Last-seen static resource state owned by the presentation layer. */
export class PlayerResourceMemory {
  private readonly seen = new Map<EntityId, RememberedResource>();

  constructor(readonly player: PlayerId) {}

  refresh(state: GameState): void {
    const visibility = state.players[this.player]?.visibility;
    if (!visibility) return;
    const width = state.map.width;
    const visibleIds = new Set<EntityId>();
    for (const entity of state.entities.values()) {
      if (entity.kind !== 'resource' || entity.player !== GAIA) continue;
      if (visibility[entity.tileY * width + entity.tileX] !== 2) continue;
      visibleIds.add(entity.id);
      this.seen.delete(entity.id);
      this.seen.set(entity.id, remember(entity));
    }
    for (const [id, resource] of this.seen) {
      if (visibility[resource.tileY * width + resource.tileX] === 2
        && !visibleIds.has(id)) this.seen.delete(id);
    }
  }

  /** Live data in vision, the last observation in explored fog, or no knowledge. */
  entityFor(state: GameState, entity: Entity): Entity | null {
    if (entity.kind !== 'resource' || entity.player !== GAIA) return entity;
    const visibility = state.players[this.player]?.visibility;
    const tileVis = visibility?.[entity.tileY * state.map.width + entity.tileX] ?? 0;
    if (tileVis === 2) return entity;
    if (tileVis !== 1) return null;
    const remembered = this.seen.get(entity.id);
    return remembered ? projection(remembered) : null;
  }

  /** Resources removed from the live sim while their last-seen tile remains hidden. */
  hiddenMissing(state: GameState): Entity[] {
    const visibility = state.players[this.player]?.visibility;
    if (!visibility) return [];
    const out: Entity[] = [];
    for (const [id, resource] of this.seen) {
      if (!state.entities.has(id)
        && visibility[resource.tileY * state.map.width + resource.tileX] === 1) {
        out.push(projection(resource));
      }
    }
    return out;
  }

  snapshot(): ResourceMemorySnapshot {
    return {
      version: RESOURCE_MEMORY_VERSION,
      player: this.player,
      resources: [...this.seen.values()].map((resource) => ({ ...resource })),
    };
  }

  restore(value: unknown, state: GameState): boolean {
    const snapshot = canonicalResourceMemorySnapshot(value);
    if (!snapshot || snapshot.player !== this.player) return false;
    const visibility = state.players[this.player]?.visibility;
    if (!visibility) return false;
    const { width, height } = state.map;
    for (const resource of snapshot.resources) {
      if (resource.tileX < 0 || resource.tileY < 0
        || resource.tileX >= width || resource.tileY >= height
        || visibility[resource.tileY * width + resource.tileX] === 0) return false;
      const live = state.entities.get(resource.id);
      if (live && (live.kind !== 'resource' || live.player !== GAIA
        || live.defId !== resource.defId || live.tileX !== resource.tileX
        || live.tileY !== resource.tileY)) return false;
    }
    this.seen.clear();
    for (const resource of snapshot.resources) this.seen.set(resource.id, { ...resource });
    this.refresh(state);
    return true;
  }
}
