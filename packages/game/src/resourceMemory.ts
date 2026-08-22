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

/**
 * True when a live resource still matches its stored observation field for field.
 * Static scenery dominates every map (a 120x120 practice map carries ~1900 trees),
 * so re-snapshotting each one on every refresh allocated a throwaway object per
 * resource per call for no change at all. Comparing first keeps the stored record
 * — identical in value, and free.
 */
function matchesObservation(seen: RememberedResource, entity: Entity): boolean {
  return seen.defId === entity.defId
    && seen.x === entity.x && seen.y === entity.y
    && seen.tileX === entity.tileX && seen.tileY === entity.tileY
    && seen.facing === entity.facing
    && seen.hp === entity.hp && seen.maxHp === entity.maxHp
    && seen.activity === entity.activity
    && seen.amountLeft === entity.amountLeft
    && seen.resourceType === entity.resourceType
    && seen.stump === entity.stump;
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
  /** Reused across refreshes so a per-frame scan allocates no set of its own. */
  private readonly visibleScratch = new Set<EntityId>();
  /**
   * Entity projections handed to the renderer, cached per stored observation.
   * A fogged forest asks for one projection per tree per frame; minting them
   * fresh each time was pure allocation churn. `refresh` keeps a record object
   * identical while nothing about it changed, so caching on that identity is
   * safe — a real change swaps in a new record and misses the cache.
   */
  private readonly projections = new Map<EntityId, { from: RememberedResource; entity: Entity }>();

  constructor(readonly player: PlayerId) {}

  private projectionFor(resource: RememberedResource): Entity {
    const cached = this.projections.get(resource.id);
    if (cached !== undefined && cached.from === resource) return cached.entity;
    const entity = projection(resource);
    this.projections.set(resource.id, { from: resource, entity });
    return entity;
  }

  refresh(state: GameState): void {
    const visibility = state.players[this.player]?.visibility;
    if (!visibility) return;
    const width = state.map.width;
    const visibleIds = this.visibleScratch;
    visibleIds.clear();
    for (const entity of state.entities.values()) {
      if (entity.kind !== 'resource' || entity.player !== GAIA) continue;
      if (visibility[entity.tileY * width + entity.tileX] !== 2) continue;
      visibleIds.add(entity.id);
      const previous = this.seen.get(entity.id);
      // The delete/set pair keeps insertion order meaning "least recently seen
      // first"; reusing an unchanged record preserves that order exactly while
      // skipping the snapshot allocation.
      this.seen.delete(entity.id);
      this.seen.set(
        entity.id,
        previous !== undefined && matchesObservation(previous, entity) ? previous : remember(entity),
      );
    }
    for (const [id, resource] of this.seen) {
      if (visibility[resource.tileY * width + resource.tileX] === 2
        && !visibleIds.has(id)) {
        this.seen.delete(id);
        this.projections.delete(id);
      }
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
    return remembered ? this.projectionFor(remembered) : null;
  }

  /** Resources removed from the live sim while their last-seen tile remains hidden. */
  hiddenMissing(state: GameState): Entity[] {
    const visibility = state.players[this.player]?.visibility;
    if (!visibility) return [];
    const out: Entity[] = [];
    for (const [id, resource] of this.seen) {
      if (!state.entities.has(id)
        && visibility[resource.tileY * state.map.width + resource.tileX] === 1) {
        out.push(this.projectionFor(resource));
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
    this.projections.clear();
    for (const resource of snapshot.resources) this.seen.set(resource.id, { ...resource });
    this.refresh(state);
    return true;
  }
}
