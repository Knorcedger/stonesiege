import { gameData } from '@bf/data';
import { FP, GAIA, type Entity, type EntityId, type PlayerId, type Tick } from '@bf/sim/types';

const MAX_RESOURCE_SIGHTINGS = 8_192;

export interface GaiaResourceSighting {
  id: EntityId;
  defId: string;
  tileX: number;
  tileY: number;
  amountLeft: number;
  tick: Tick;
}

/** Deterministic last-seen knowledge for static Gaia resource nodes. */
export class GaiaResourceMemory {
  private readonly seen = new Map<EntityId, GaiaResourceSighting>();
  private readonly visibleThisPass = new Set<EntityId>();

  beginPass(): void {
    this.visibleThisPass.clear();
  }

  note(entity: Entity, visibility: Uint8Array, mapWidth: number, tick: Tick): void {
    if (entity.kind !== 'resource' || entity.player !== GAIA
      || visibility[entity.tileY * mapWidth + entity.tileX] !== 2) return;
    this.visibleThisPass.add(entity.id);
    if ((entity.amountLeft ?? 0) <= 0 || entity.stump === true) {
      this.seen.delete(entity.id);
      return;
    }
    if (!this.seen.has(entity.id) && this.seen.size >= MAX_RESOURCE_SIGHTINGS) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.delete(entity.id);
    this.seen.set(entity.id, {
      id: entity.id,
      defId: entity.defId,
      tileX: entity.tileX,
      tileY: entity.tileY,
      amountLeft: entity.amountLeft!,
      tick,
    });
  }

  /** Current LOS with no matching live node proves the old observation stale. */
  sweep(visibility: Uint8Array, mapWidth: number): void {
    for (const [id, sighting] of this.seen) {
      if (visibility[sighting.tileY * mapWidth + sighting.tileX] === 2
        && !this.visibleThisPass.has(id)) this.seen.delete(id);
    }
  }

  sightings(): GaiaResourceSighting[] {
    return [...this.seen.values()].map((sighting) => ({ ...sighting }));
  }

  entities(): Entity[] {
    return [...this.seen.values()].map((sighting) => {
      const def = gameData.resources[sighting.defId];
      const hp = def?.hp ?? 1;
      return {
        id: sighting.id,
        kind: 'resource',
        defId: sighting.defId,
        player: GAIA,
        x: sighting.tileX * FP + FP / 2,
        y: sighting.tileY * FP + FP / 2,
        tileX: sighting.tileX,
        tileY: sighting.tileY,
        facing: 0,
        hp,
        maxHp: hp,
        activity: 'idle',
        amountLeft: sighting.amountLeft,
        resourceType: def?.resourceType,
      };
    });
  }
}
