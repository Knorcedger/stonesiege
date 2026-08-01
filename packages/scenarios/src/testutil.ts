// Test helpers: a minimal valid scenario fixture and a scripted FakeOps that records
// every call the trigger engine makes. Used by loader/trigger/wallace1 tests only.

import type { AgeId, ResourceType, Stockpile } from '@bf/sim/types';
import type { Rect, ScenarioDef } from './schema';
import type { EntityQuery, EntityView, ScenarioOps, SpawnRequest } from './triggers';

/** Smallest scenario that passes every loader check. Deep-clone-and-mutate in tests. */
export function makeFixture(): ScenarioDef {
  return {
    id: 'fixture',
    campaign: 'test',
    index: 0,
    title: 'Fixture',
    briefing: { history: 'h', objectives: ['o'], hints: [] },
    players: [
      { name: 'P1', civ: 'scots', team: 1, isHuman: true, color: 0, age: 'dark', resources: { food: 100 } },
      { name: 'P2', civ: 'english', team: 2, isHuman: false, color: 1, age: 'dark', resources: {}, aiProfile: 'passive' },
    ],
    map: {
      width: 8,
      height: 6,
      legend: {
        '.': { terrain: 'grass' },
        w: { terrain: 'water' },
        T: { terrain: 'grass', object: 'tree' },
        G: { terrain: 'grass', object: 'gold' },
        S: { terrain: 'grass', object: 'stone' },
        B: { terrain: 'grass', object: 'berries' },
        D: { terrain: 'grass', object: 'deer' },
        H: { terrain: 'grass', object: 'sheep' },
        W: { terrain: 'grass', object: 'wolf' },
      },
      rows: [
        'T.......',
        '.G......',
        '..S...B.',
        '...D....',
        'H..W....',
        '.......w',
      ],
    },
    entities: [
      { def: 'townCenter', player: 1, x: 2, y: 1, ref: 'tc' },
      { def: 'militia', player: 1, x: 0, y: 4, ref: 'hero' },
      { def: 'militia', player: 2, x: 7, y: 0, ref: 'guard' },
    ],
    triggers: [
      {
        id: 't-intro',
        conditions: [{ kind: 'always' }],
        effects: [
          { kind: 'message', text: 'go', speaker: 'Narrator' },
          { kind: 'objectiveAdd', id: 'obj-1', text: 'do the thing' },
        ],
      },
      {
        id: 't-win',
        conditions: [{ kind: 'refDestroyed', ref: 'guard' }],
        effects: [{ kind: 'objectiveComplete', id: 'obj-1' }, { kind: 'victory' }],
      },
    ],
    startCamera: { x: 2, y: 1 },
  };
}

/**
 * Static trigger-graph checks beyond what the loader validates: every unarmed trigger is
 * reachable via some armTrigger, and every objective ever added has a resolution effect
 * (complete or fail) somewhere in the script. Returns human-readable issues; [] = sound.
 */
export function triggerGraphIssues(def: ScenarioDef): string[] {
  const issues: string[] = [];
  const armedBy = new Set<string>();
  const added = new Set<string>();
  const resolved = new Set<string>();
  for (const t of def.triggers) {
    for (const fx of t.effects) {
      if (fx.kind === 'armTrigger') armedBy.add(fx.triggerId);
      if (fx.kind === 'objectiveAdd') added.add(fx.id);
      if (fx.kind === 'objectiveComplete' || fx.kind === 'objectiveFail') resolved.add(fx.id);
    }
  }
  for (const t of def.triggers) {
    if (t.armed === false && !armedBy.has(t.id)) {
      issues.push(`unarmed trigger '${t.id}' is never armed`);
    }
  }
  for (const id of added) {
    if (!resolved.has(id)) issues.push(`objective '${id}' is added but never resolved`);
  }
  return issues;
}

export interface OpsCall { fn: string; args: unknown[] }

/** Scripted world state + full call recording. Everything is mutable from the test. */
export class FakeOps implements ScenarioOps {
  now = 0;
  /** Live entities by ref. Delete a key to "kill" it. */
  entities = new Map<string, EntityView>();
  /** Answer for countEntities, keyed by matcher fn (first match wins) — or a flat default. */
  counts: Array<{ match: (q: EntityQuery) => boolean; count: number }> = [];
  ages = new Map<number, AgeId>();
  stock = new Map<number, Partial<Stockpile>>();
  researched = new Set<string>(); // `${player}:${techId}`
  defeated = new Set<number>();
  calls: OpsCall[] = [];
  private nextId = 1000;

  private rec(fn: string, ...args: unknown[]) { this.calls.push({ fn, args }); }
  callsOf(fn: string): OpsCall[] { return this.calls.filter((c) => c.fn === fn); }

  addEntity(ref: string, view: Partial<EntityView> = {}): EntityView {
    const full: EntityView = {
      id: view.id ?? this.nextId++, defId: view.defId ?? 'militia', player: view.player ?? 1,
      tileX: view.tileX ?? 0, tileY: view.tileY ?? 0, hp: view.hp ?? 10,
    };
    this.entities.set(ref, full);
    return full;
  }
  kill(ref: string) { this.entities.delete(ref); }

  // ---- read side ----
  tick(): number { return this.now; }
  getEntityByRef(ref: string): EntityView | null { return this.entities.get(ref) ?? null; }
  countEntities(query: EntityQuery): number {
    for (const c of this.counts) if (c.match(query)) return c.count;
    return 0;
  }
  getAge(player: number): AgeId { return this.ages.get(player) ?? 'dark'; }
  getResource(player: number, type: ResourceType): number { return this.stock.get(player)?.[type] ?? 0; }
  hasResearched(player: number, techId: string): boolean { return this.researched.has(`${player}:${techId}`); }
  isDefeated(player: number): boolean { return this.defeated.has(player); }

  // ---- write side ----
  spawn(entities: SpawnRequest[]): void {
    this.rec('spawn', entities);
    for (const e of entities) {
      if (e.ref !== undefined) {
        this.addEntity(e.ref, { defId: e.defId, player: e.player, tileX: e.tileX, tileY: e.tileY });
      }
    }
  }
  changeOwner(refs: string[], toPlayer: number): void {
    this.rec('changeOwner', refs, toPlayer);
    for (const r of refs) { const e = this.entities.get(r); if (e) e.player = toPlayer; }
  }
  revealArea(player: number, area: Rect): void { this.rec('revealArea', player, area); }
  addResources(player: number, amounts: Partial<Stockpile>): void { this.rec('addResources', player, amounts); }
  setAiProfile(player: number, profile: string): void { this.rec('setAiProfile', player, profile); }
  aiAttackNow(player: number, targetArea?: Rect): void { this.rec('aiAttackNow', player, targetArea); }

  // ---- UI callbacks ----
  message(msg: { text: string; speaker?: string; portrait?: string }): void { this.rec('message', msg); }
  panCamera(tileX: number, tileY: number): void { this.rec('panCamera', tileX, tileY); }
  objectiveAdded(id: string, text: string): void { this.rec('objectiveAdded', id, text); }
  objectiveCompleted(id: string): void { this.rec('objectiveCompleted', id); }
  objectiveFailed(id: string): void { this.rec('objectiveFailed', id); }
  playSting(sting: 'horn' | 'victory' | 'defeat' | 'alert'): void { this.rec('playSting', sting); }
  victory(): void { this.rec('victory'); }
  defeat(reason?: string): void { this.rec('defeat', reason); }
}
