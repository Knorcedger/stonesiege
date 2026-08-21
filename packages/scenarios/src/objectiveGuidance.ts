// Pure objective guidance derived from authored trigger conditions. The client
// evaluates these read-only definitions on a throttle; nothing here mutates or
// feeds back into the deterministic simulation.

import { gameData } from '@bf/data';
import { AGES, TICKS_PER_SECOND } from '@bf/sim/types';
import type { AgeId, ResourceType } from '@bf/sim/types';
import type { Condition, Rect, ScenarioDef } from './schema';
import type { EntityQuery, EntityView } from './triggers';

export interface ObjectiveTargetTile {
  x: number;
  y: number;
}

interface EntityCountSource {
  player?: number;
  defIds?: string[];
  area?: Rect;
}

export type ObjectiveGoal =
  | { kind: 'entityCount'; label: string; source: EntityCountSource; comparison: 'atLeast' | 'atMost'; need: number; target?: ObjectiveTargetTile }
  | { kind: 'resource'; label: string; player: number; resource: ResourceType; need: number }
  | { kind: 'refDestroyed'; label: string; refs: string[]; need: number; fallbackTargets: Record<string, ObjectiveTargetTile> }
  | { kind: 'playerDefeated'; label: string; player: number; target?: ObjectiveTargetTile }
  | { kind: 'age'; label: string; player: number; age: AgeId }
  | { kind: 'timer'; label: string; seconds: number }
  | { kind: 'researched'; label: string; player: number; techId: string };

export interface ObjectiveGuideDefinition {
  id: string;
  text: string;
  /** First authored trigger that completes this objective (alternate paths follow the primary). */
  triggerId?: string;
  goals: ObjectiveGoal[];
}

export interface ObjectiveGoalReadout {
  label: string;
  have: number;
  need: number;
  done: boolean;
  target?: ObjectiveTargetTile;
}

export interface ObjectiveGuideReadout {
  id: string;
  goals: ObjectiveGoalReadout[];
  /** First spatial goal, used for the battlefield/minimap guidance target. */
  target?: ObjectiveTargetTile;
}

/** Read-only subset of ScenarioOps required by objective progress. */
export interface ObjectiveProgressOps {
  tick(): number;
  getEntityByRef(ref: string): EntityView | null;
  countEntities(query: EntityQuery): number;
  getAge(player: number): AgeId;
  getResource(player: number, type: ResourceType): number;
  hasResearched(player: number, techId: string): boolean;
  isDefeated(player: number): boolean;
}

/** Read-only TriggerRuntime state that conditions cannot recover from sim state alone. */
export interface ObjectiveTriggerState {
  armedAtTick(triggerId: string): number | undefined;
  hasFired(triggerId: string): boolean;
  hasRefBeenDestroyed(ref: string): boolean;
}

function effectObjectives(scenario: ScenarioDef): Array<{ id: string; text: string }> {
  const objectives = new Map<string, string>();
  for (const trigger of scenario.triggers) {
    for (const effect of trigger.effects) {
      if (effect.kind === 'objectiveAdd' && !objectives.has(effect.id)) {
        objectives.set(effect.id, effect.text);
      }
    }
  }
  return [...objectives].map(([id, text]) => ({ id, text }));
}

function refTargets(scenario: ScenarioDef): Record<string, ObjectiveTargetTile> {
  const targets: Record<string, ObjectiveTargetTile> = {};
  const register = (entities: ScenarioDef['entities']): void => {
    for (const entity of entities) {
      if (entity.ref !== undefined && targets[entity.ref] === undefined) {
        const size = gameData.buildings[entity.def]?.size ?? 1;
        targets[entity.ref] = { x: entity.x + size / 2, y: entity.y + size / 2 };
      }
    }
  };
  register(scenario.entities);
  for (const trigger of scenario.triggers) {
    for (const effect of trigger.effects) {
      if (effect.kind === 'spawn') register(effect.entities);
    }
  }
  return targets;
}

function playerTarget(scenario: ScenarioDef, player: number): ObjectiveTargetTile | undefined {
  const initial = scenario.entities.find((entity) => entity.player === player);
  if (initial) {
    const size = gameData.buildings[initial.def]?.size ?? 1;
    return { x: initial.x + size / 2, y: initial.y + size / 2 };
  }
  for (const trigger of scenario.triggers) {
    for (const effect of trigger.effects) {
      if (effect.kind !== 'spawn') continue;
      const spawned = effect.entities.find((entity) => entity.player === player);
      if (spawned) {
        const size = gameData.buildings[spawned.def]?.size ?? 1;
        return { x: spawned.x + size / 2, y: spawned.y + size / 2 };
      }
    }
  }
  return undefined;
}

function pluralize(label: string, need: number): string {
  if (need === 1 || label.endsWith('s')) return label;
  if (label === 'Sheep') return label;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(?:ch|sh|x|z)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

function defLabel(defIds: string[], need: number): string {
  if (defIds.length !== 1) return 'Units';
  const id = defIds[0];
  const name = gameData.units[id]?.name
    ?? gameData.buildings[id]?.name
    ?? gameData.resources[id]?.name
    ?? id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return pluralize(name, need);
}

function goalsForCondition(
  scenario: ScenarioDef,
  condition: Condition,
  knownRefTargets: Record<string, ObjectiveTargetTile>,
): ObjectiveGoal[] {
  switch (condition.kind) {
    case 'entitiesInArea': {
      const target = {
        x: condition.area.x + condition.area.w / 2,
        y: condition.area.y + condition.area.h / 2,
      };
      const source: EntityCountSource = {
        ...(condition.player !== undefined ? { player: condition.player } : {}),
        ...(condition.defIds !== undefined ? { defIds: condition.defIds } : {}),
        area: condition.area,
      };
      const goals: ObjectiveGoal[] = [];
      if (condition.atLeast !== undefined) {
        goals.push({ kind: 'entityCount', label: 'At target', source, comparison: 'atLeast', need: condition.atLeast, target });
      }
      if (condition.atMost !== undefined) {
        goals.push({ kind: 'entityCount', label: 'Remaining', source, comparison: 'atMost', need: condition.atMost, target });
      }
      return goals;
    }
    case 'refDestroyed':
      return [{
        kind: 'refDestroyed', label: 'Target', refs: [condition.ref], need: 1,
        fallbackTargets: knownRefTargets,
      }];
    case 'refsDestroyed':
      return [{
        kind: 'refDestroyed', label: 'Targets', refs: condition.refs,
        need: condition.all ? condition.refs.length : 1,
        fallbackTargets: knownRefTargets,
      }];
    case 'playerDefeated': {
      const target = playerTarget(scenario, condition.player);
      return [{
        kind: 'playerDefeated', label: 'Enemy', player: condition.player,
        ...(target ? { target } : {}),
      }];
    }
    case 'resourcesAtLeast':
      return [{
        kind: 'resource', label: condition.type[0].toUpperCase() + condition.type.slice(1),
        player: condition.player, resource: condition.type, need: condition.amount,
      }];
    case 'ownedAtLeast':
      return [{
        kind: 'entityCount', label: defLabel(condition.defIds, condition.atLeast),
        source: { player: condition.player, defIds: condition.defIds },
        comparison: 'atLeast', need: condition.atLeast,
      }];
    case 'ownedAtMost':
      return [{
        kind: 'entityCount', label: defLabel(condition.defIds, condition.atMost),
        source: { player: condition.player, defIds: condition.defIds },
        comparison: 'atMost', need: condition.atMost,
      }];
    case 'ageReached':
      return [{ kind: 'age', label: 'Age', player: condition.player, age: condition.age }];
    case 'timerSeconds':
      return [{ kind: 'timer', label: 'Time', seconds: condition.seconds }];
    case 'researched':
      return [{
        kind: 'researched', label: gameData.techs[condition.techId]?.name ?? 'Research',
        player: condition.player, techId: condition.techId,
      }];
    // These conditions order trigger beats; they do not describe player-facing progress.
    case 'always':
    case 'objectiveComplete':
    case 'triggerFired':
      return [];
  }
}

/** Derive every unique authored objective in objective-add order. */
export function deriveObjectiveGuides(scenario: ScenarioDef): ObjectiveGuideDefinition[] {
  const knownRefTargets = refTargets(scenario);
  return effectObjectives(scenario).map(({ id, text }) => {
    const completing = scenario.triggers.find((trigger) =>
      trigger.effects.some((effect) => effect.kind === 'objectiveComplete' && effect.id === id)
    );
    if (!completing) return { id, text, goals: [] };
    return {
      id,
      text,
      triggerId: completing.id,
      goals: completing.conditions.flatMap((condition) =>
        goalsForCondition(scenario, condition, knownRefTargets)
      ),
    };
  });
}

function readout(goal: ObjectiveGoal, ops: ObjectiveProgressOps, runtime: ObjectiveTriggerState, triggerId: string): ObjectiveGoalReadout {
  switch (goal.kind) {
    case 'entityCount': {
      const have = ops.countEntities(goal.source);
      const done = goal.comparison === 'atLeast' ? have >= goal.need : have <= goal.need;
      return { label: goal.label, have, need: goal.need, done, ...(goal.target ? { target: goal.target } : {}) };
    }
    case 'resource': {
      const have = ops.getResource(goal.player, goal.resource);
      return { label: goal.label, have, need: goal.need, done: have >= goal.need };
    }
    case 'refDestroyed': {
      const have = goal.refs.filter((ref) => runtime.hasRefBeenDestroyed(ref)).length;
      let liveRef: string | undefined;
      let live: EntityView | null = null;
      for (const ref of goal.refs) {
        const entity = ops.getEntityByRef(ref);
        if (!entity) continue;
        liveRef = ref;
        live = entity;
        break;
      }
      const fallbackRef = liveRef ?? goal.refs.find((ref) => goal.fallbackTargets[ref] !== undefined);
      const liveSize = live ? gameData.buildings[live.defId]?.size ?? 1 : 1;
      const target = live
        ? { x: live.tileX + liveSize / 2, y: live.tileY + liveSize / 2 }
        : fallbackRef ? goal.fallbackTargets[fallbackRef] : undefined;
      return {
        label: goal.label, have, need: goal.need, done: have >= goal.need,
        ...(target ? { target } : {}),
      };
    }
    case 'playerDefeated': {
      const have = ops.isDefeated(goal.player) ? 1 : 0;
      return { label: goal.label, have, need: 1, done: have === 1, ...(goal.target ? { target: goal.target } : {}) };
    }
    case 'age': {
      const have = AGES.indexOf(ops.getAge(goal.player)) + 1;
      const need = AGES.indexOf(goal.age) + 1;
      return { label: goal.label, have, need, done: have >= need };
    }
    case 'timer': {
      const armedAt = runtime.armedAtTick(triggerId);
      const elapsedTicks = armedAt === undefined ? 0 : Math.max(0, ops.tick() - armedAt);
      const have = Math.min(goal.seconds, Math.floor(elapsedTicks / TICKS_PER_SECOND));
      return { label: goal.label, have, need: goal.seconds, done: runtime.hasFired(triggerId) || have >= goal.seconds };
    }
    case 'researched': {
      const have = ops.hasResearched(goal.player, goal.techId) ? 1 : 0;
      return { label: goal.label, have, need: 1, done: have === 1 };
    }
  }
}

/** Evaluate one derived objective against live read-only sim/runtime state. */
export function evaluateObjectiveGuide(
  guide: ObjectiveGuideDefinition,
  ops: ObjectiveProgressOps,
  runtime: ObjectiveTriggerState,
): ObjectiveGuideReadout {
  if (guide.triggerId === undefined) return { id: guide.id, goals: [] };
  const goals = guide.goals.map((goal) => readout(goal, ops, runtime, guide.triggerId!));
  const target = goals.find((goal) => goal.target !== undefined)?.target;
  return { id: guide.id, goals, ...(target ? { target } : {}) };
}
