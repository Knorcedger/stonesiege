// Fog-honest enemy intelligence. The bot may only act on what it has SEEN: an enemy
// entity enters memory when its anchor tile is currently visible (visibility === 2)
// to the bot's team, and its recorded position only updates while visible. The one
// concession to practicality: a remembered id that leaves the sim entirely (death,
// deletion) is dropped — via entityDied events when the host passes them, and via a
// same-pass existence sweep otherwise — so waves never chase ghosts forever.
// Everything here is a pure function of sim state + events: fully deterministic.

import type { Entity, EntityId, GameState, PlayerId, SimEvent, Tick } from '@bf/sim/types';

export interface Sighting {
  id: EntityId;
  defId: string;
  player: PlayerId;
  kind: 'unit' | 'building';
  tileX: number;
  tileY: number;
  x: number; // Fixed
  y: number; // Fixed
  /** Tick of the last decision pass that saw it. */
  tick: Tick;
  /** True while its tile is visible this pass (safe to attack by id). */
  visibleNow: boolean;
}

export class EnemyMemory {
  private readonly seen = new Map<EntityId, Sighting>();

  /** Called during the snapshot's single entity pass for every rival entity. */
  note(e: Entity, visibility: Uint8Array, mapWidth: number, tick: Tick): void {
    const visible = visibility[e.tileY * mapWidth + e.tileX] === 2;
    const prior = this.seen.get(e.id);
    if (visible) {
      this.seen.set(e.id, {
        id: e.id, defId: e.defId, player: e.player,
        kind: e.kind === 'building' ? 'building' : 'unit',
        tileX: e.tileX, tileY: e.tileY, x: e.x, y: e.y,
        tick, visibleNow: true,
      });
    } else if (prior) {
      prior.visibleNow = false; // stale: keep last-known position
    }
  }

  /** entityDied events resolve deaths the honest way (the whole match hears horns). */
  onEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.kind === 'entityDied') this.seen.delete(ev.id);
    }
  }

  /** Drop remembered ids that no longer exist (hosts that don't forward events). */
  sweep(st: GameState): void {
    for (const [id, s] of this.seen) {
      const live = st.entities.get(id);
      if (!live || live.hp <= 0) { this.seen.delete(id); continue; }
      // a building we can SEE standing somewhere else changed hands/def — re-observe
      if (live.player !== s.player) this.seen.delete(id);
    }
  }

  /** Unit sightings no older than maxAgeTicks (Infinity = all). Insertion order. */
  units(now: Tick, maxAgeTicks: number): Sighting[] {
    const out: Sighting[] = [];
    for (const s of this.seen.values()) {
      if (s.kind === 'unit' && now - s.tick <= maxAgeTicks) out.push(s);
    }
    return out;
  }

  buildings(): Sighting[] {
    const out: Sighting[] = [];
    for (const s of this.seen.values()) if (s.kind === 'building') out.push(s);
    return out;
  }

  get(id: EntityId): Sighting | undefined {
    return this.seen.get(id);
  }

  get size(): number {
    return this.seen.size;
  }
}
