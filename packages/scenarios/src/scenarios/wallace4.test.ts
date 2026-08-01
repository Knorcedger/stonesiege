// wallace-4 "Harry the North": loads clean, matches the docs/CAMPAIGN_WALLACE.md §5
// map/entity spec (snowbound Tyne, two bridges, three fortified targets, gaia priory),
// trigger graph statically sound, and the Newcastle relief clock + loop behave.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps, triggerGraphIssues } from '../testutil';
import { wallace4 } from './wallace4';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-4 — loads clean', () => {
  const { start, meta } = loadScenario(wallace4, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 128 + x]];

  it('resolves without validation errors', () => {
    expect(meta.id).toBe('wallace-4');
    expect(meta.index).toBe(3);
    expect(meta.title).toBe('Harry the North');
    expect(meta.maxAge).toBe('castle');
    expect(meta.popCap).toBe(80);
    expect(meta.startCamera).toEqual({ x: 18, y: 20 });
    expect(meta.players.map((p) => p.aiProfile)).toEqual([undefined, 'defender', 'raider']);
  });

  it('authors the 128x128 snowbound Tyne valley', () => {
    expect(start.map.width).toBe(128);
    expect(start.map.height).toBe(128);
    expect(at(20, 20)).toBe('snow'); // the plateau
    // the Tyne, full width, rows 60-66
    expect(at(0, 60)).toBe('water');
    expect(at(50, 63)).toBe('water');
    expect(at(127, 66)).toBe('water');
    // both bridges are road through the band
    for (let y = 60; y <= 66; y++) {
      expect(at(34, y), `west bridge row ${y}`).toBe('road');
      expect(at(84, y), `east bridge row ${y}`).toBe('road');
    }
    // the Newcastle road along the south bank, entering at (127,70)
    expect(at(127, 70)).toBe('road');
    expect(at(100, 70)).toBe('road');
    // town grounds read as dirt; the open moor stays snow
    expect(at(45, 50)).toBe('snow');
    expect(at(25, 95)).toBe('dirt'); // Hexham town
    expect(at(60, 80)).toBe('dirt'); // Corbridge interior
    expect(at(92, 30)).toBe('dirt'); // Ryton interior
  });

  it('emits the documented gaia objects (winter: no berries, farms are the lesson)', () => {
    const gaia = start.entities.filter((e) => e.player === 0 && e.ref === undefined);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('goldMine')).toBe(11); // 6 plateau + 5 contested mid-map
    expect(n('stoneMine')).toBe(5);
    expect(n('deer')).toBe(8);
    expect(n('berryBush')).toBe(0);
    expect(n('sheep')).toBe(0);
    expect(n('tree')).toBeGreaterThan(1600); // snowy belts + deer wood + copses
  });

  it('places the refs, the three targets, and the gaia priory', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1 });
    expect(byRef.get('ryton_stores')).toMatchObject({ defId: 'mill', player: 2, tileX: 92, tileY: 30 });
    expect(byRef.get('corbridge_keep')).toMatchObject({ defId: 'watchTower', player: 2, tileX: 60, tileY: 80 });
    expect(byRef.get('corbridge_gate')).toMatchObject({ defId: 'gate', player: 2, tileX: 52, tileY: 81 });
    expect(byRef.get('hexham_stores')).toMatchObject({ defId: 'market', player: 2, tileX: 30, tileY: 94 });
    // the priory is gaia: no unit auto-targets it
    expect(byRef.get('hexham_priory')).toMatchObject({ defId: 'monastery', player: 0, tileX: 24, tileY: 96 });

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // player 1: the raiding column
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'villager')).toBe(6);
    expect(of(1, 'manAtArms')).toBe(6);
    expect(of(1, 'spearman')).toBe(4);
    expect(of(1, 'archer')).toBe(2);
    // player 2: Ryton ring (58) + Corbridge circuit (67)
    expect(of(2, 'stoneWall')).toBe(125);
    expect(of(2, 'gate')).toBe(1);
    expect(of(2, 'manAtArms')).toBe(12);
    expect(of(2, 'longbowman')).toBe(10);
    expect(of(2, 'militia')).toBe(6);
    // player 3 fields nothing on-map: the relief rides in by trigger
    expect(start.entities.filter((e) => e.player === 3)).toHaveLength(0);
    // gaia monks in the priory close
    expect(of(0, 'monk')).toBe(2);
  });

  it('is registered in the wallace campaign', () => {
    expect(scenariosById['wallace-4']).toBe(wallace4);
    expect(wallaceCampaign.scenarioIds[wallace4.index]).toBe(wallace4.id);
  });
});

describe('wallace-4 — trigger graph static soundness', () => {
  it('arms every unarmed trigger and resolves every objective (incl. the soft-fail priory)', () => {
    expect(triggerGraphIssues(wallace4)).toEqual([]);
    // obj-priory can fail (t09) or complete at victory (t10) — both resolutions exist
    const fails = wallace4.triggers.filter((t) => t.effects.some((fx) => fx.kind === 'objectiveFail'));
    expect(fails.map((t) => t.id)).toEqual(['t09-priory-broken']);
  });

  it('victory requires all three targets; defeat watches Wallace and the camp', () => {
    const victory = wallace4.triggers.find((t) => t.effects.some((fx) => fx.kind === 'victory'));
    expect(victory?.id).toBe('t10-victory');
    expect(victory?.conditions).toEqual([
      { kind: 'refDestroyed', ref: 'hexham_stores' },
      { kind: 'objectiveComplete', objectiveId: 'obj-corbridge' },
      { kind: 'objectiveComplete', objectiveId: 'obj-ryton' },
    ]);
    const defeats = wallace4.triggers.filter((t) => t.effects.some((fx) => fx.kind === 'defeat'));
    expect(defeats.map((t) => t.id)).toEqual(['t11-defeat-wallace', 't12-defeat-camp']);
  });
});

describe('wallace-4 — the Newcastle relief clock', () => {
  it('starts 5 minutes after Ryton burns, then loops every 7 minutes', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('ryton_stores', { defId: 'mill', player: 2 });
    ops.addEntity('corbridge_keep', { defId: 'watchTower', player: 2 });
    ops.addEntity('corbridge_gate', { defId: 'gate', player: 2 });
    ops.addEntity('hexham_stores', { defId: 'market', player: 2 });
    ops.addEntity('hexham_priory', { defId: 'monastery', player: 0 });
    ops.counts.unshift({
      match: (q) => q.player === 1 && q.defIds?.includes('townCenter') === true, count: 1,
    });
    const rt = new TriggerRuntime(wallace4, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    advance(1);
    expect(rt.hasFired('t01-intro')).toBe(true);
    expect(rt.isArmed('t06-relief-1')).toBe(false); // clock has not started

    // Ryton burns: plunder lands, the market lesson opens, Newcastle stirs
    ops.kill('ryton_stores');
    advance(1);
    expect(rt.objectiveState('obj-ryton')).toBe('complete');
    expect(rt.objectiveState('obj-market')).toBe('open');
    expect(ops.callsOf('addResources')[0].args).toEqual([1, { food: 300, wood: 200 }]);
    expect(ops.callsOf('setAiProfile')[0].args).toEqual([3, 'standard']);
    expect(rt.isArmed('t06-relief-1')).toBe(true);

    advance(300); // the first relief, 5 minutes after the smoke
    expect(rt.hasFired('t06-relief-1')).toBe(true);
    expect(ops.callsOf('spawn')).toHaveLength(1);
    expect(ops.callsOf('aiAttackNow')[0].args).toEqual([3, { x: 10, y: 12, w: 26, h: 22 }]);

    advance(420); // loop sortie 1
    expect(ops.callsOf('spawn')).toHaveLength(2);
    advance(420); // loop sortie 2 — the loop re-armed itself
    expect(ops.callsOf('spawn')).toHaveLength(3);

    // the Castle Age opens the siege objectives
    ops.ages.set(1, 'castle');
    advance(1);
    expect(rt.objectiveState('obj-corbridge')).toBe('open');

    // priory razed EARLY, before Corbridge falls: t09 is not yet armed, but the ref
    // destruction latches...
    ops.kill('hexham_priory');
    advance(1);
    expect(rt.objectiveState('obj-priory')).toBeUndefined(); // not yet added (Corbridge stands)
    // ...so when Corbridge falls, t08 adds obj-priory and arms t09, which fires the
    // same tick and fails the objective honestly. Soft failure only: no defeat.
    ops.kill('corbridge_keep');
    advance(1);
    expect(rt.objectiveState('obj-corbridge')).toBe('complete');
    expect(rt.objectiveState('obj-priory')).toBe('failed');
    expect(rt.isEnded).toBe(false);

    // the stores burn -> victory despite the failed priory objective; the latched
    // 'failed' state survives t10's kept-word objectiveComplete
    ops.kill('hexham_stores');
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    expect(rt.objectiveState('obj-hexham')).toBe('complete');
    expect(rt.objectiveState('obj-priory')).toBe('failed');
  });

  it('completes the priory objective at victory when the promise was kept', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('ryton_stores', { defId: 'mill', player: 2 });
    ops.addEntity('corbridge_keep', { defId: 'watchTower', player: 2 });
    ops.addEntity('corbridge_gate', { defId: 'gate', player: 2 });
    ops.addEntity('hexham_stores', { defId: 'market', player: 2 });
    ops.addEntity('hexham_priory', { defId: 'monastery', player: 0 });
    ops.counts.unshift({
      match: (q) => q.player === 1 && q.defIds?.includes('townCenter') === true, count: 1,
    });
    const rt = new TriggerRuntime(wallace4, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };
    advance(1);
    ops.kill('ryton_stores');
    advance(1);
    ops.ages.set(1, 'castle');
    advance(1); // t04 opens the siege objectives
    ops.kill('corbridge_keep');
    advance(1);
    expect(rt.objectiveState('obj-priory')).toBe('open');
    ops.kill('hexham_stores'); // the priory stands
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(rt.objectiveState('obj-priory')).toBe('complete');
  });
});
