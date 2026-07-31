// Deterministic trigger engine. Runs beside the sim: the host calls tick(events) once per
// sim tick after Game.advance(). All timers are tick-based (TICKS_PER_SECOND from @bf/sim);
// no wall clock, no RNG. The engine talks to the world exclusively through ScenarioOps —
// see OPS_NEEDED.md at the package root for the contract the sim/game teams implement.

import type { AgeId, ResourceType, ScenarioStart, SimEvent, Stockpile } from '@bf/sim/types';
import { AGES, secondsToTicks } from '@bf/sim/types';
import type { AiProfile, Condition, Rect, ScenarioDef, TriggerDef, TriggerEffect } from './schema';

/** Minimal live-entity view the engine needs (a projection of sim Entity). */
export interface EntityView {
  id: number;
  defId: string;
  player: number;
  /** Anchor tile (buildings: top-left of footprint). */
  tileX: number;
  tileY: number;
  hp: number;
}

/** Filter for countEntities. Omitted fields match everything. */
export interface EntityQuery {
  player?: number;
  defIds?: string[];
  /** Tile rect; an entity matches when its ANCHOR tile lies inside. */
  area?: Rect;
}

export type SpawnRequest = ScenarioStart['entities'][number];

/**
 * Everything the trigger engine needs from the outside world.
 * Read side + sim writes are implemented over the sim (see OPS_NEEDED.md); UI-side members
 * (message, panCamera, objective callbacks, playSting, victory, defeat) are host callbacks.
 */
export interface ScenarioOps {
  // ---- read side ----
  /** Current sim tick (20 ticks/second). */
  tick(): number;
  /** Live entity for a scenario ref, or null when dead/removed/not yet spawned. */
  getEntityByRef(ref: string): EntityView | null;
  /** Count live entities matching the query (see OPS_NEEDED.md for counting rules). */
  countEntities(query: EntityQuery): number;
  getAge(player: number): AgeId;
  getResource(player: number, type: ResourceType): number;
  hasResearched(player: number, techId: string): boolean;
  isDefeated(player: number): boolean;
  // ---- write side (sim) ----
  /** Spawn immediately; MUST register each entity's ref so getEntityByRef resolves it. */
  spawn(entities: SpawnRequest[]): void;
  /** Called only with currently-live refs (the engine filters dead ones out). */
  changeOwner(refs: string[], toPlayer: number): void;
  revealArea(player: number, area: Rect): void;
  addResources(player: number, amounts: Partial<Stockpile>): void;
  /** AI lands in wave 3 — a no-op implementation is fine until then. */
  setAiProfile(player: number, profile: AiProfile): void;
  /** AI lands in wave 3 — a no-op implementation is fine until then. */
  aiAttackNow(player: number, targetArea?: Rect): void;
  // ---- host/UI callbacks ----
  message(msg: { text: string; speaker?: string; portrait?: string }): void;
  panCamera(tileX: number, tileY: number): void;
  objectiveAdded(id: string, text: string): void;
  objectiveCompleted(id: string): void;
  objectiveFailed(id: string): void;
  playSting(sting: 'horn' | 'victory' | 'defeat' | 'alert'): void;
  victory(): void;
  defeat(reason?: string): void;
}

export type ObjectiveState = 'open' | 'complete' | 'failed';

interface TriggerState {
  def: TriggerDef;
  armed: boolean;
  /** Tick at which the trigger was (last) armed; timerSeconds counts from here. */
  armedAtTick: number;
  /** Latched forever on first fire (drives triggerFired conditions + fire-once rule). */
  fired: boolean;
}

type RefStatus = 'pending' | 'alive' | 'destroyed';

interface RefState {
  status: RefStatus;
  /** Sim entity id cached while alive (lets entityDied events resolve same-tick). */
  entityId?: number;
}

export class TriggerRuntime {
  private readonly ops: ScenarioOps;
  private readonly triggers: TriggerState[] = [];
  private readonly byId = new Map<string, TriggerState>();
  private readonly objectives = new Map<string, ObjectiveState>();
  /** Ref lifecycle: initial entities start 'alive'; spawn-effect refs start 'pending'. */
  private readonly refState = new Map<string, RefState>();
  private ended = false;

  constructor(scenario: ScenarioDef, ops: ScenarioOps) {
    this.ops = ops;
    const now = ops.tick();
    for (const def of scenario.triggers) {
      const armed = def.armed !== false;
      const state: TriggerState = { def, armed, armedAtTick: armed ? now : -1, fired: false };
      this.triggers.push(state);
      this.byId.set(def.id, state);
    }
    for (const e of scenario.entities) {
      if (e.ref !== undefined) this.refState.set(e.ref, { status: 'alive' });
    }
    for (const t of scenario.triggers) {
      for (const fx of t.effects) {
        if (fx.kind !== 'spawn') continue;
        for (const e of fx.entities) {
          if (e.ref !== undefined && !this.refState.has(e.ref)) {
            this.refState.set(e.ref, { status: 'pending' });
          }
        }
      }
    }
  }

  // ---------- public introspection (host UI restore + tests) ----------
  get isEnded(): boolean { return this.ended; }
  hasFired(triggerId: string): boolean { return this.byId.get(triggerId)?.fired ?? false; }
  isArmed(triggerId: string): boolean { return this.byId.get(triggerId)?.armed ?? false; }
  objectiveState(id: string): ObjectiveState | undefined { return this.objectives.get(id); }
  /** Objective ids in the order they were added (for HUD rendering). */
  objectiveIds(): string[] { return [...this.objectives.keys()]; }

  /** Evaluate all armed triggers once. Call exactly once per sim tick, after Game.advance(). */
  tick(events: SimEvent[]): void {
    if (this.ended) return;
    this.updateRefLiveness(events);
    for (const state of this.triggers) {
      if (!state.armed) continue;
      if (!state.def.conditions.every((c) => this.evalCondition(state, c))) continue;
      // fire
      state.fired = true;
      if (state.def.loop === true) {
        state.armedAtTick = this.ops.tick(); // loop: re-arm with a fresh timer
      } else {
        state.armed = false;
      }
      for (const fx of state.def.effects) this.applyEffect(fx);
      if (this.ended) break; // victory/defeat: nothing else fires this (or any later) tick
    }
  }

  // ---------- ref liveness ----------
  private updateRefLiveness(events: SimEvent[]): void {
    // 1. entityDied events resolve deaths in the same tick they happen.
    for (const ev of events) {
      if (ev.kind !== 'entityDied') continue;
      for (const rs of this.refState.values()) {
        if (rs.status === 'alive' && rs.entityId === ev.id) rs.status = 'destroyed';
      }
    }
    // 2. Poll: an alive ref whose entity is gone (however it went) is destroyed. Latches.
    for (const [ref, rs] of this.refState) {
      if (rs.status !== 'alive') continue;
      const view = this.ops.getEntityByRef(ref);
      if (view === null) rs.status = 'destroyed';
      else rs.entityId = view.id;
    }
  }

  private refDestroyed(ref: string): boolean {
    return this.refState.get(ref)?.status === 'destroyed';
  }

  // ---------- conditions (AND, side-effect free) ----------
  private evalCondition(state: TriggerState, c: Condition): boolean {
    switch (c.kind) {
      case 'always':
        return true;
      case 'timerSeconds':
        return this.ops.tick() - state.armedAtTick >= secondsToTicks(c.seconds);
      case 'entitiesInArea': {
        const n = this.ops.countEntities({
          ...(c.player !== undefined ? { player: c.player } : {}),
          ...(c.defIds !== undefined ? { defIds: c.defIds } : {}),
          area: c.area,
        });
        if (c.atLeast !== undefined && n < c.atLeast) return false;
        if (c.atMost !== undefined && n > c.atMost) return false;
        return true;
      }
      case 'refDestroyed':
        return this.refDestroyed(c.ref);
      case 'refsDestroyed': {
        const destroyed = c.refs.filter((r) => this.refDestroyed(r)).length;
        return c.all ? destroyed === c.refs.length : destroyed > 0;
      }
      case 'playerDefeated':
        return this.ops.isDefeated(c.player);
      case 'researched':
        return this.ops.hasResearched(c.player, c.techId);
      case 'ageReached':
        return AGES.indexOf(this.ops.getAge(c.player)) >= AGES.indexOf(c.age);
      case 'resourcesAtLeast':
        return this.ops.getResource(c.player, c.type) >= c.amount;
      case 'ownedAtLeast':
        return this.ops.countEntities({ player: c.player, defIds: c.defIds }) >= c.atLeast;
      case 'ownedAtMost':
        return this.ops.countEntities({ player: c.player, defIds: c.defIds }) <= c.atMost;
      case 'objectiveComplete':
        return this.objectives.get(c.objectiveId) === 'complete';
      case 'triggerFired':
        return this.byId.get(c.triggerId)?.fired === true;
      default:
        return false; // unreachable for loader-validated scenarios
    }
  }

  // ---------- effects ----------
  private applyEffect(fx: TriggerEffect): void {
    switch (fx.kind) {
      case 'message':
        this.ops.message({
          text: fx.text,
          ...(fx.speaker !== undefined ? { speaker: fx.speaker } : {}),
          ...(fx.portrait !== undefined ? { portrait: fx.portrait } : {}),
        });
        return;
      case 'objectiveAdd':
        if (!this.objectives.has(fx.id)) { // idempotent per id
          this.objectives.set(fx.id, 'open');
          this.ops.objectiveAdded(fx.id, fx.text);
        }
        return;
      case 'objectiveComplete':
        if (this.objectives.get(fx.id) === 'open') { // latched: first resolution wins
          this.objectives.set(fx.id, 'complete');
          this.ops.objectiveCompleted(fx.id);
        }
        return;
      case 'objectiveFail':
        if (this.objectives.get(fx.id) === 'open') { // latched; no-op if never added
          this.objectives.set(fx.id, 'failed');
          this.ops.objectiveFailed(fx.id);
        }
        return;
      case 'victory':
        this.ended = true;
        this.ops.victory();
        return;
      case 'defeat':
        this.ended = true;
        this.ops.defeat(fx.reason);
        return;
      case 'spawn': {
        const requests: SpawnRequest[] = fx.entities.map((e) => ({
          defId: e.def, player: e.player, tileX: e.x, tileY: e.y,
          ...(e.hp !== undefined ? { hp: e.hp } : {}),
          ...(e.facing !== undefined ? { facing: e.facing } : {}),
          ...(e.ref !== undefined ? { ref: e.ref } : {}),
          ...(e.amountLeft !== undefined ? { amountLeft: e.amountLeft } : {}),
        }));
        this.ops.spawn(requests);
        for (const e of fx.entities) {
          if (e.ref === undefined) continue;
          const rs = this.refState.get(e.ref);
          if (rs !== undefined && rs.status === 'pending') rs.status = 'alive';
          else if (rs === undefined) this.refState.set(e.ref, { status: 'alive' });
        }
        return;
      }
      case 'changeOwner': {
        // dead refs are skipped; survivors change hands
        const live = fx.refs.filter((r) => this.refState.get(r)?.status === 'alive');
        if (live.length > 0) this.ops.changeOwner(live, fx.toPlayer);
        return;
      }
      case 'revealArea':
        this.ops.revealArea(fx.player, fx.area);
        return;
      case 'addResources':
        this.ops.addResources(fx.player, fx.amounts);
        return;
      case 'aiProfile':
        this.ops.setAiProfile(fx.player, fx.profile);
        return;
      case 'aiAttackNow':
        this.ops.aiAttackNow(fx.player, fx.targetArea);
        return;
      case 'panCamera':
        this.ops.panCamera(fx.x, fx.y);
        return;
      case 'armTrigger': {
        const target = this.byId.get(fx.triggerId);
        if (target === undefined) return; // loader-validated; be safe anyway
        if (target.fired && target.def.loop !== true) return; // fire-once can never fire twice
        if (target.armed) return; // arming an armed trigger does NOT reset its timer
        target.armed = true;
        target.armedAtTick = this.ops.tick();
        return;
      }
      case 'playSting':
        this.ops.playSting(fx.sting);
        return;
      default:
        return; // unreachable for loader-validated scenarios
    }
  }
}
