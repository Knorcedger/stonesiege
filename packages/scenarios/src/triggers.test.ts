// TriggerRuntime semantics against a scripted FakeOps: timers, AND conditions, arm/loop
// rules, objective latching, ref lifecycle, and the victory/defeat flow. All timers are
// tick-based (TICKS_PER_SECOND = 20), so "1 second" below means 20 ticks.

import { describe, expect, it } from 'vitest';
import { secondsToTicks } from '@bf/sim/types';
import type { ScenarioDef, ScenarioEntity, TriggerDef } from './schema';
import { TriggerRuntime } from './triggers';
import { FakeOps, makeFixture } from './testutil';

/** Fixture scenario with the triggers/entities under test (runtime does not re-validate). */
function scenarioWith(triggers: TriggerDef[], entities: ScenarioEntity[] = []): ScenarioDef {
  const def = makeFixture();
  def.entities = entities;
  def.triggers = triggers;
  return def;
}

const sting = (s: 'horn' | 'victory' | 'defeat' | 'alert' = 'horn'): TriggerDef['effects'][number] =>
  ({ kind: 'playSting', sting: s });

describe('TriggerRuntime — firing basics', () => {
  it('fires an armed always-trigger on the first tick, exactly once', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't', conditions: [{ kind: 'always' }], effects: [sting()] },
    ]), ops);
    rt.tick([]);
    rt.tick([]);
    rt.tick([]);
    expect(ops.callsOf('playSting')).toHaveLength(1);
    expect(rt.hasFired('t')).toBe(true);
    expect(rt.isArmed('t')).toBe(false); // fire-once disarms
  });

  it('never fires an unarmed trigger that nothing arms', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't', armed: false, conditions: [{ kind: 'always' }], effects: [sting()] },
    ]), ops);
    for (let i = 0; i < 50; i++) { ops.now = i; rt.tick([]); }
    expect(ops.callsOf('playSting')).toHaveLength(0);
    expect(rt.hasFired('t')).toBe(false);
  });

  it('treats conditions as AND: fires only when every condition holds', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't',
        conditions: [
          { kind: 'resourcesAtLeast', player: 1, type: 'food', amount: 150 },
          { kind: 'ownedAtLeast', player: 1, defIds: ['house'], atLeast: 2 },
        ],
        effects: [sting()],
      },
    ]), ops);

    rt.tick([]); // neither condition
    ops.stock.set(1, { food: 200 });
    rt.tick([]); // food only
    expect(ops.callsOf('playSting')).toHaveLength(0);

    ops.counts.push({ match: (q) => q.defIds?.includes('house') === true, count: 2 });
    rt.tick([]); // both
    expect(ops.callsOf('playSting')).toHaveLength(1);
  });

  it('evaluates in definition order: arming a LATER trigger fires it the same tick, an EARLIER one the next tick', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-early', armed: false, conditions: [{ kind: 'always' }], effects: [sting('alert')] },
      {
        id: 't-arm',
        conditions: [{ kind: 'always' }],
        effects: [
          { kind: 'armTrigger', triggerId: 't-early' },
          { kind: 'armTrigger', triggerId: 't-late' },
        ],
      },
      { id: 't-late', armed: false, conditions: [{ kind: 'always' }], effects: [sting('horn')] },
    ]), ops);

    rt.tick([]);
    expect(rt.hasFired('t-late')).toBe(true); // same tick: iteration reaches it after arming
    expect(rt.hasFired('t-early')).toBe(false); // already passed this tick
    rt.tick([]);
    expect(rt.hasFired('t-early')).toBe(true);
  });
});

describe('TriggerRuntime — timers', () => {
  it('armed timers count from construction and fire exactly at the threshold tick', () => {
    const ops = new FakeOps();
    ops.now = 100;
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't', conditions: [{ kind: 'timerSeconds', seconds: 2 }], effects: [sting()] },
    ]), ops);
    expect(rt.armedAtTick('t')).toBe(100);

    ops.now = 100 + secondsToTicks(2) - 1;
    rt.tick([]);
    expect(rt.hasFired('t')).toBe(false);
    ops.now = 100 + secondsToTicks(2); // exactly 40 ticks after arming
    rt.tick([]);
    expect(rt.hasFired('t')).toBe(true);
    expect(rt.armedAtTick('t')).toBe(100); // retained for presentation after firing
  });

  it('unarmed timers count from the armTrigger that armed them', () => {
    const ops = new FakeOps();
    ops.now = 0;
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't-gate',
        conditions: [{ kind: 'timerSeconds', seconds: 1 }],
        effects: [{ kind: 'armTrigger', triggerId: 't-wave' }],
      },
      { id: 't-wave', armed: false, conditions: [{ kind: 'timerSeconds', seconds: 2 }], effects: [sting()] },
    ]), ops);
    expect(rt.armedAtTick('t-wave')).toBeUndefined();

    ops.now = secondsToTicks(1); // 20: gate fires, arms wave at tick 20
    rt.tick([]);
    expect(rt.hasFired('t-gate')).toBe(true);
    expect(rt.armedAtTick('t-wave')).toBe(secondsToTicks(1));

    ops.now = secondsToTicks(2); // 40 ticks from construction — but only 20 from arming
    rt.tick([]);
    expect(rt.hasFired('t-wave')).toBe(false);
    ops.now = secondsToTicks(1) + secondsToTicks(2); // 60 = armed-at 20 + 40
    rt.tick([]);
    expect(rt.hasFired('t-wave')).toBe(true);
  });

  it('re-arming an armed not-yet-fired trigger does NOT reset its timer', () => {
    const ops = new FakeOps();
    ops.now = 0;
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-rearm', conditions: [{ kind: 'always' }], effects: [{ kind: 'armTrigger', triggerId: 't-timer' }] },
      { id: 't-timer', conditions: [{ kind: 'timerSeconds', seconds: 2 }], effects: [sting()] },
    ]), ops);

    ops.now = secondsToTicks(1); // t-rearm fires here; armTrigger on armed t-timer is a no-op
    rt.tick([]);
    ops.now = secondsToTicks(2); // 40 ticks after construction: original arming still counts
    rt.tick([]);
    expect(rt.hasFired('t-timer')).toBe(true);
  });
});

describe('TriggerRuntime — fire-once, loop, and armTrigger rules', () => {
  it('armTrigger on a fired non-loop trigger is a no-op (converging arms cannot double-fire)', () => {
    const ops = new FakeOps();
    ops.now = 0;
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-ready', conditions: [{ kind: 'always' }], effects: [{ kind: 'armTrigger', triggerId: 't-wave' }] },
      {
        id: 't-deadline',
        conditions: [{ kind: 'timerSeconds', seconds: 1 }],
        effects: [{ kind: 'armTrigger', triggerId: 't-wave' }],
      },
      { id: 't-wave', armed: false, conditions: [{ kind: 'always' }], effects: [sting()] },
    ]), ops);

    rt.tick([]); // t-ready arms t-wave; t-wave fires same tick
    expect(ops.callsOf('playSting')).toHaveLength(1);
    ops.now = secondsToTicks(1);
    rt.tick([]); // t-deadline fires and re-arms t-wave — must be a no-op
    ops.now = secondsToTicks(1) + 1;
    rt.tick([]);
    expect(rt.hasFired('t-deadline')).toBe(true);
    expect(ops.callsOf('playSting')).toHaveLength(1); // wave never double-fires
    expect(rt.isArmed('t-wave')).toBe(false);
  });

  it('loop triggers re-arm with a fresh timer and fire once per interval', () => {
    const ops = new FakeOps();
    ops.now = 0;
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-loop', loop: true, conditions: [{ kind: 'timerSeconds', seconds: 1 }], effects: [sting('alert')] },
    ]), ops);

    const period = secondsToTicks(1);
    for (let tick = 0; tick <= period * 3; tick++) {
      ops.now = tick;
      rt.tick([]);
    }
    // fires at exactly 20, 40 (re-armed at 20), 60 (re-armed at 40)
    expect(ops.callsOf('playSting')).toHaveLength(3);
    expect(rt.isArmed('t-loop')).toBe(true); // still armed for the next interval
    expect(rt.hasFired('t-loop')).toBe(true);
  });
});

describe('TriggerRuntime — objectives', () => {
  it('objectiveAdd is idempotent; complete/fail latch; resolving a never-added id is a no-op', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't',
        conditions: [{ kind: 'always' }],
        effects: [
          { kind: 'objectiveAdd', id: 'obj-a', text: 'do it' },
          { kind: 'objectiveAdd', id: 'obj-a', text: 'do it AGAIN' }, // no-op
          { kind: 'objectiveComplete', id: 'obj-a' },
          { kind: 'objectiveFail', id: 'obj-a' }, // no-op: already resolved
          { kind: 'objectiveComplete', id: 'obj-a' }, // no-op
          { kind: 'objectiveComplete', id: 'obj-ghost' }, // no-op: never added
          { kind: 'objectiveFail', id: 'obj-ghost' }, // no-op: never added
        ],
      },
    ]), ops);
    rt.tick([]);

    expect(ops.callsOf('objectiveAdded')).toHaveLength(1);
    expect(ops.callsOf('objectiveAdded')[0].args).toEqual(['obj-a', 'do it']);
    expect(ops.callsOf('objectiveCompleted')).toHaveLength(1);
    expect(ops.callsOf('objectiveFailed')).toHaveLength(0);
    expect(rt.objectiveState('obj-a')).toBe('complete');
    expect(rt.objectiveState('obj-ghost')).toBeUndefined();
    expect(rt.objectiveIds()).toEqual(['obj-a']);
  });

  it('objectiveFail latches too: a later complete cannot overturn it', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't1',
        conditions: [{ kind: 'always' }],
        effects: [{ kind: 'objectiveAdd', id: 'obj', text: 'hold' }, { kind: 'objectiveFail', id: 'obj' }],
      },
      {
        id: 't2',
        conditions: [{ kind: 'always' }],
        effects: [{ kind: 'objectiveComplete', id: 'obj' }],
      },
    ]), ops);
    rt.tick([]);
    expect(rt.objectiveState('obj')).toBe('failed');
    expect(ops.callsOf('objectiveCompleted')).toHaveLength(0);
  });

  it('objectiveComplete conditions gate on the latched state', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-check', conditions: [{ kind: 'objectiveComplete', objectiveId: 'obj' }], effects: [sting()] },
      {
        id: 't-do',
        conditions: [{ kind: 'always' }],
        effects: [{ kind: 'objectiveAdd', id: 'obj', text: 'x' }, { kind: 'objectiveComplete', id: 'obj' }],
      },
    ]), ops);
    rt.tick([]); // t-check runs before t-do resolves — must not fire yet
    expect(rt.hasFired('t-check')).toBe(false);
    rt.tick([]);
    expect(rt.hasFired('t-check')).toBe(true);
  });
});

describe('TriggerRuntime — entity queries', () => {
  it('entitiesInArea forwards player/defIds/area and honors atLeast/atMost', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't-in',
        conditions: [{ kind: 'entitiesInArea', player: 1, defIds: ['militia'], area: { x: 2, y: 3, w: 4, h: 2 }, atLeast: 2 }],
        effects: [sting('horn')],
      },
      {
        id: 't-clear',
        conditions: [{ kind: 'entitiesInArea', player: 2, area: { x: 0, y: 0, w: 8, h: 6 }, atMost: 0 }],
        effects: [sting('alert')],
      },
    ]), ops);

    // scripted counts: 1 militia in the rect (below atLeast 2); 3 enemies on the map (above atMost 0)
    ops.counts.push({
      match: (q) => q.player === 1 && q.defIds?.[0] === 'militia'
        && q.area?.x === 2 && q.area?.y === 3 && q.area?.w === 4 && q.area?.h === 2,
      count: 1,
    });
    ops.counts.push({ match: (q) => q.player === 2 && q.defIds === undefined, count: 3 });
    rt.tick([]);
    expect(rt.hasFired('t-in')).toBe(false);
    expect(rt.hasFired('t-clear')).toBe(false);

    ops.counts.length = 0;
    ops.counts.push({ match: (q) => q.player === 1, count: 2 });
    ops.counts.push({ match: (q) => q.player === 2, count: 0 });
    rt.tick([]);
    expect(rt.hasFired('t-in')).toBe(true);
    expect(rt.hasFired('t-clear')).toBe(true);
  });

  it('reads ages (ordering), research, defeat, and ownedAtMost through ops', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-age', conditions: [{ kind: 'ageReached', player: 1, age: 'feudal' }], effects: [sting()] },
      { id: 't-tech', conditions: [{ kind: 'researched', player: 1, techId: 'loom' }], effects: [sting()] },
      { id: 't-dead', conditions: [{ kind: 'playerDefeated', player: 2 }], effects: [sting()] },
      { id: 't-none', conditions: [{ kind: 'ownedAtMost', player: 2, defIds: ['militia'], atMost: 0 }], effects: [sting()] },
    ]), ops);

    ops.ages.set(1, 'dark');
    ops.counts.push({ match: (q) => q.player === 2, count: 4 });
    rt.tick([]);
    expect(rt.hasFired('t-age')).toBe(false);
    expect(rt.hasFired('t-tech')).toBe(false);
    expect(rt.hasFired('t-dead')).toBe(false);
    expect(rt.hasFired('t-none')).toBe(false);

    ops.ages.set(1, 'castle'); // castle satisfies "reached feudal"
    ops.researched.add('1:loom');
    ops.defeated.add(2);
    ops.counts.length = 0; // count falls to 0
    rt.tick([]);
    expect(rt.hasFired('t-age')).toBe(true);
    expect(rt.hasFired('t-tech')).toBe(true);
    expect(rt.hasFired('t-dead')).toBe(true);
    expect(rt.hasFired('t-none')).toBe(true);
  });
});

describe('TriggerRuntime — ref lifecycle', () => {
  const guardEntity: ScenarioEntity = { def: 'militia', player: 2, x: 7, y: 0, ref: 'guard' };

  it('resolves entityDied events the same tick, even before any poll', () => {
    const ops = new FakeOps();
    ops.addEntity('guard', { id: 7 });
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-dead', conditions: [{ kind: 'refDestroyed', ref: 'guard' }], effects: [sting()] },
    ], [guardEntity]), ops);

    rt.tick([]); // caches the entity id from the poll
    expect(rt.hasFired('t-dead')).toBe(false);
    // The sim still lists the entity this tick (corpse) but emitted entityDied:
    rt.tick([{ kind: 'entityDied', id: 7, defId: 'militia', player: 2, x: 0, y: 0 }]);
    expect(rt.hasFired('t-dead')).toBe(true);
  });

  it('detects vanished entities via the poll fallback, and destruction latches', () => {
    const ops = new FakeOps();
    ops.addEntity('guard');
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-dead', conditions: [{ kind: 'refDestroyed', ref: 'guard' }], effects: [sting()] },
    ], [guardEntity]), ops);

    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(false);
    ops.kill('guard');
    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(true);
    // a new entity under the same ref cannot resurrect the latch
    ops.addEntity('guard');
    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(true);
  });

  it('spawn-effect refs are pending (not destroyed) until spawned; spawn goes through ops and registers the ref', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-dead', conditions: [{ kind: 'refDestroyed', ref: 'late' }], effects: [sting('defeat')] },
      {
        id: 't-spawn',
        armed: false,
        conditions: [{ kind: 'always' }],
        effects: [{ kind: 'spawn', entities: [{ def: 'militia', player: 2, x: 5, y: 5, ref: 'late', hp: 7 }] }],
      },
      { id: 't-go', conditions: [{ kind: 'timerSeconds', seconds: 1 }], effects: [{ kind: 'armTrigger', triggerId: 't-spawn' }] },
    ]), ops);

    rt.tick([]);
    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(false); // pending, not destroyed

    ops.now = secondsToTicks(1);
    rt.tick([]); // t-go arms t-spawn; t-spawn fired next pass (it is earlier in the list)
    rt.tick([]);
    expect(rt.hasFired('t-spawn')).toBe(true);
    const spawned = ops.callsOf('spawn');
    expect(spawned).toHaveLength(1);
    expect(spawned[0].args[0]).toEqual([{ defId: 'militia', player: 2, tileX: 5, tileY: 5, ref: 'late', hp: 7 }]);
    expect(ops.entities.has('late')).toBe(true); // ops registered the ref

    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(false); // alive now
    ops.kill('late');
    rt.tick([]);
    expect(rt.hasFired('t-dead')).toBe(true);
  });

  it('refsDestroyed distinguishes all:true from all:false', () => {
    const ops = new FakeOps();
    ops.addEntity('a');
    ops.addEntity('b');
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-any', conditions: [{ kind: 'refsDestroyed', refs: ['a', 'b'], all: false }], effects: [sting()] },
      { id: 't-all', conditions: [{ kind: 'refsDestroyed', refs: ['a', 'b'], all: true }], effects: [sting()] },
    ], [
      { def: 'militia', player: 1, x: 0, y: 0, ref: 'a' },
      { def: 'militia', player: 1, x: 1, y: 0, ref: 'b' },
    ]), ops);

    rt.tick([]);
    expect(rt.hasFired('t-any')).toBe(false);
    ops.kill('a');
    rt.tick([]);
    expect(rt.hasFired('t-any')).toBe(true);
    expect(rt.hasFired('t-all')).toBe(false);
    ops.kill('b');
    rt.tick([]);
    expect(rt.hasFired('t-all')).toBe(true);
  });

  it('changeOwner passes only live refs and is skipped entirely when none survive', () => {
    const ops = new FakeOps();
    ops.addEntity('a');
    ops.addEntity('b');
    const rt = new TriggerRuntime(scenarioWith([
      {
        id: 't-take',
        armed: false,
        conditions: [{ kind: 'always' }],
        effects: [{ kind: 'changeOwner', refs: ['a', 'b'], toPlayer: 1 }],
      },
      { id: 't-go', conditions: [{ kind: 'timerSeconds', seconds: 1 }], effects: [{ kind: 'armTrigger', triggerId: 't-take' }] },
    ], [
      { def: 'militia', player: 0, x: 0, y: 0, ref: 'a' },
      { def: 'militia', player: 0, x: 1, y: 0, ref: 'b' },
    ]), ops);

    rt.tick([]);
    ops.kill('b');
    ops.now = secondsToTicks(1);
    rt.tick([]); // t-go arms; t-take fires next tick (earlier in list)
    rt.tick([]);
    const calls = ops.callsOf('changeOwner');
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([['a'], 1]);
    expect(ops.entities.get('a')?.player).toBe(1);
  });
});

describe('TriggerRuntime — victory and defeat flow', () => {
  it('victory ends the runtime mid-tick: later triggers do not fire, later ticks are no-ops', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-win', conditions: [{ kind: 'always' }], effects: [{ kind: 'victory' }] },
      { id: 't-after', conditions: [{ kind: 'always' }], effects: [sting('alert')] },
    ]), ops);

    rt.tick([]);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    expect(rt.hasFired('t-after')).toBe(false); // nothing after the ending effect
    rt.tick([]);
    rt.tick([]);
    expect(rt.hasFired('t-after')).toBe(false);
    expect(ops.callsOf('victory')).toHaveLength(1);
  });

  it('defeat passes the reason through and ends the runtime', () => {
    const ops = new FakeOps();
    const rt = new TriggerRuntime(scenarioWith([
      { id: 't-lose', conditions: [{ kind: 'always' }], effects: [{ kind: 'defeat', reason: 'the hero fell' }] },
    ]), ops);
    rt.tick([]);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('defeat')[0].args).toEqual(['the hero fell']);
  });

  it('runs the fixture scenario end to end: intro, then kill the guard for the win', () => {
    const def = makeFixture();
    const ops = new FakeOps();
    ops.addEntity('tc', { defId: 'townCenter' });
    ops.addEntity('hero');
    ops.addEntity('guard', { player: 2 });
    const rt = new TriggerRuntime(def, ops);

    rt.tick([]);
    expect(ops.callsOf('message')).toHaveLength(1);
    expect(rt.objectiveState('obj-1')).toBe('open');
    expect(rt.isEnded).toBe(false);

    ops.kill('guard');
    rt.tick([]);
    expect(rt.objectiveState('obj-1')).toBe('complete');
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
  });
});
