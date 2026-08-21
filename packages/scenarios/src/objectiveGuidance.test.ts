import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND, type AgeId, type ResourceType } from '@bf/sim/types';
import { campaigns, scenariosById } from './campaign';
import {
  deriveObjectiveGuides, evaluateObjectiveGuide,
  type ObjectiveProgressOps, type ObjectiveTriggerState,
} from './objectiveGuidance';
import type { EntityQuery, EntityView } from './triggers';

class GuidanceOps implements ObjectiveProgressOps {
  now = 0;
  counts = new Map<string, number>();
  stock = new Map<string, number>();
  ages = new Map<number, AgeId>();
  researched = new Set<string>();
  defeated = new Set<number>();
  refs = new Map<string, EntityView>();

  tick(): number { return this.now; }
  getEntityByRef(ref: string): EntityView | null { return this.refs.get(ref) ?? null; }
  countEntities(query: EntityQuery): number {
    return this.counts.get(JSON.stringify(query)) ?? 0;
  }
  getAge(player: number): AgeId { return this.ages.get(player) ?? 'dark'; }
  getResource(player: number, type: ResourceType): number { return this.stock.get(`${player}:${type}`) ?? 0; }
  hasResearched(player: number, techId: string): boolean { return this.researched.has(`${player}:${techId}`); }
  isDefeated(player: number): boolean { return this.defeated.has(player); }
}

class GuidanceRuntime implements ObjectiveTriggerState {
  armed = new Map<string, number>();
  fired = new Set<string>();
  destroyed = new Set<string>();

  armedAtTick(triggerId: string): number | undefined { return this.armed.get(triggerId); }
  hasFired(triggerId: string): boolean { return this.fired.has(triggerId); }
  hasRefBeenDestroyed(ref: string): boolean { return this.destroyed.has(ref); }
}

function isSpatial(guide: ReturnType<typeof deriveObjectiveGuides>[number]): boolean {
  return guide.goals.some((goal) =>
    (goal.kind === 'entityCount' && goal.target !== undefined)
    || (goal.kind === 'refDestroyed' && Object.keys(goal.fallbackTargets).some((ref) => goal.refs.includes(ref)))
    || (goal.kind === 'playerDefeated' && goal.target !== undefined)
  );
}

describe('objective guidance derivation', () => {
  it('covers every objective in all 48 shipped campaign chapters', () => {
    const scenarioIds = Object.values(campaigns).flatMap((campaign) => campaign.scenarioIds);
    const guides = scenarioIds.flatMap((id) => deriveObjectiveGuides(scenariosById[id]));

    expect(scenarioIds).toHaveLength(48);
    expect(new Set(scenarioIds)).toHaveLength(48);
    expect(guides).toHaveLength(68);
    expect(guides.filter((guide) => guide.triggerId === undefined)).toEqual([]);
    expect(guides.filter((guide) => guide.goals.length === 0)).toEqual([]);
    expect(guides.filter(isSpatial)).toHaveLength(48);
  });

  it('uses the first completing trigger when an objective has alternate paths', () => {
    const scenarioIds = Object.values(campaigns).flatMap((campaign) => campaign.scenarioIds);
    const alternates: string[] = [];
    for (const scenarioId of scenarioIds) {
      const scenario = scenariosById[scenarioId];
      for (const guide of deriveObjectiveGuides(scenario)) {
        const completing = scenario.triggers.filter((trigger) =>
          trigger.effects.some((effect) => effect.kind === 'objectiveComplete' && effect.id === guide.id)
        );
        if (completing.length > 1) {
          alternates.push(`${scenarioId}:${guide.id}`);
          expect(guide.triggerId).toBe(completing[0].id);
        }
      }
    }
    expect(alternates).toHaveLength(1);
  });

  it('evaluates countable stockpile and building progress with player-facing labels', () => {
    const guides = deriveObjectiveGuides(scenariosById['wallace-01-ledger']);
    const ops = new GuidanceOps();
    const runtime = new GuidanceRuntime();

    ops.stock.set('1:food', 92);
    const food = evaluateObjectiveGuide(guides.find((guide) => guide.id === 'obj-food')!, ops, runtime);
    expect(food.goals).toEqual([{ label: 'Food', have: 92, need: 150, done: false }]);

    const housesGuide = guides.find((guide) => guide.id === 'obj-houses')!;
    const houseGoal = housesGuide.goals[0];
    expect(houseGoal.kind).toBe('entityCount');
    if (houseGoal.kind !== 'entityCount') return;
    ops.counts.set(JSON.stringify(houseGoal.source), 1);
    const houses = evaluateObjectiveGuide(housesGuide, ops, runtime);
    expect(houses.goals).toEqual([{ label: 'Houses', have: 1, need: 2, done: false }]);
  });

  it('evaluates spatial progress and follows a live ref without inventing a target', () => {
    const guides = deriveObjectiveGuides(scenariosById['wallace-01-ledger']);
    const ops = new GuidanceOps();
    const runtime = new GuidanceRuntime();

    const clearing = evaluateObjectiveGuide(guides.find((guide) => guide.id === 'obj-move-1')!, ops, runtime);
    expect(clearing.goals[0]).toMatchObject({ label: 'At target', have: 0, need: 1, done: false });
    expect(clearing.target).toEqual({ x: 33, y: 55 });

    const heselrigGuide = deriveObjectiveGuides(scenariosById['wallace-02-lanark'])
      .find((guide) => guide.id === 'obj-heselrig')!;
    ops.refs.set('heselrig', { id: 9, defId: 'sheriffHeselrig', player: 2, tileX: 61, tileY: 28, hp: 100 });
    const hunt = evaluateObjectiveGuide(heselrigGuide, ops, runtime);
    expect(hunt.target).toEqual({ x: 61.5, y: 28.5 });
    expect(hunt.goals[0]).toMatchObject({ label: 'Target', have: 0, need: 1, done: false });
  });

  it('counts timer progress from the completing trigger armed tick', () => {
    const defendScenario = Object.values(scenariosById).find((scenario) =>
      deriveObjectiveGuides(scenario).some((guide) => guide.goals.some((goal) => goal.kind === 'timer'))
    )!;
    const guide = deriveObjectiveGuides(defendScenario).find((candidate) =>
      candidate.goals.some((goal) => goal.kind === 'timer')
    )!;
    const timer = guide.goals.find((goal) => goal.kind === 'timer')!;
    const ops = new GuidanceOps();
    const runtime = new GuidanceRuntime();
    runtime.armed.set(guide.triggerId!, 40);
    ops.now = 40 + 3 * TICKS_PER_SECOND;

    expect(evaluateObjectiveGuide(guide, ops, runtime).goals.find((goal) => goal.label === 'Time')).toEqual({
      label: 'Time', have: Math.min(3, timer.seconds), need: timer.seconds,
      done: timer.seconds <= 3,
    });
  });
});
