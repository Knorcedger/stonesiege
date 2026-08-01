// wallace-6 "The Unbroken": loads clean, matches the docs/CAMPAIGN_WALLACE.md §7
// map/entity spec (forest triangle, stepped Clyde, Earnside bridge, hidden ford,
// Happrew + captive pen, double-ringed Bothwell, Segrave's camp), trigger graph
// statically sound, and the captive rescue/loss latching behaves.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps, triggerGraphIssues } from '../testutil';
import { wallace6 } from './wallace6';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-6 — loads clean', () => {
  const { start, meta } = loadScenario(wallace6, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 144 + x]];

  it('resolves without validation errors; no maxAge — imperial is the point', () => {
    expect(meta.id).toBe('wallace-6');
    expect(meta.index).toBe(5);
    expect(meta.title).toBe('The Unbroken');
    expect(meta.maxAge).toBeUndefined();
    expect(meta.popCap).toBe(150);
    expect(meta.startCamera).toEqual({ x: 110, y: 108 });
    expect(meta.players.map((p) => p.aiProfile)).toEqual([undefined, 'defender', 'standard']);
    expect(meta.playerSetups[0]).toMatchObject({ civ: 'scots', isHuman: true, startingAge: 'castle' });
    expect(meta.playerSetups[1]).toMatchObject({ startingAge: 'imperial' });
  });

  it('authors the 144x144 Forest and Clyde', () => {
    expect(start.map.width).toBe(144);
    expect(start.map.height).toBe(144);
    // the Clyde: N entry, horizontal reach, stepped SW leg, W exit
    expect(at(50, 10)).toBe('water');
    expect(at(48, 55)).toBe('water');
    expect(at(50, 60)).toBe('water');
    expect(at(30, 70)).toBe('water'); // the SW step
    expect(at(5, 80)).toBe('water');
    // Earnside bridge: road, 3 wide, through the horizontal reach
    for (let y = 56; y <= 64; y++) {
      expect(at(43, y), `bridge row ${y}`).toBe('road');
      expect(at(45, y), `bridge row ${y}`).toBe('road');
    }
    // the hidden ford spans all nine water rows at x 19-21
    for (let y = 78; y <= 86; y++) expect(at(20, y), `ford row ${y}`).toBe('shallows');
    // the clearing is grass; the deep forest is tree-on-grass; Segrave's camp is dirt
    expect(at(110, 110)).toBe('grass');
    expect(at(140, 140)).toBe('grass');
    expect(at(85, 20)).toBe('dirt');
    expect(at(68, 63)).toBe('farmland'); // the abandoned fields
  });

  it('emits the documented gaia resources across camp, contested ground, and Bothwell', () => {
    const gaia = start.entities.filter((e) => e.player === 0 && e.ref === undefined);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('goldMine')).toBe(25); // 6 NE + 5 S of camp, 6 contested, 8 inside Bothwell
    expect(n('stoneMine')).toBe(11); // 6 by camp + 5 inside Happrew
    expect(n('berryBush')).toBe(8);
    expect(n('deer')).toBe(10); // two herds of 5
    expect(n('sheep')).toBe(6);
    expect(n('wolf')).toBe(3);
    expect(n('tree')).toBeGreaterThan(3000); // the Forest triangle
  });

  it('places the refs: heroes, both keeps, gates, tower, captives (gaia)', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1 });
    expect(byRef.get('fraser')).toMatchObject({ defId: 'heroFraser', player: 1 });
    expect(byRef.get('earnside_tower')).toMatchObject({ defId: 'watchTower', player: 2, tileX: 44, tileY: 52 });
    expect(byRef.get('happrew_keep')).toMatchObject({ defId: 'watchTower', player: 2, tileX: 58, tileY: 82 });
    expect(byRef.get('happrew_gate')).toMatchObject({ defId: 'gate', player: 2 });
    expect(byRef.get('bothwell_keep')).toMatchObject({ defId: 'castle', player: 2, tileX: 24, tileY: 18 });
    expect(byRef.get('bothwell_gate_s')).toMatchObject({ defId: 'gate', player: 2 });
    expect(byRef.get('bothwell_gate_e')).toMatchObject({ defId: 'gate', player: 2 });
    expect(byRef.get('valence')).toMatchObject({ defId: 'heroValence', player: 2, hp: 3000 });
    // the captive pen: gaia, so the garrison cannot auto-engage them
    for (const [ref, defId] of [
      ['captive1', 'villager'], ['captive2', 'villager'], ['captive3', 'villager'],
      ['captive4', 'highlandRaider'], ['captive5', 'highlandRaider'],
    ] as const) {
      expect(byRef.get(ref), ref).toMatchObject({ defId, player: 0 });
    }

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // player 1: the war-camp seed
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'villager')).toBe(8);
    expect(of(1, 'highlandRaider')).toBe(8);
    expect(of(1, 'pikeman')).toBe(4);
    expect(of(1, 'crossbowman')).toBe(2);
    expect(of(1, 'house')).toBe(5);
    // player 2: Earnside stubs + Happrew ring + Bothwell double ring
    expect(of(2, 'stoneWall')).toBe(231);
    expect(of(2, 'gate')).toBe(3);
    expect(of(2, 'guardTower')).toBe(4); // Bothwell's corners
    expect(of(2, 'castle')).toBe(1);
    expect(of(2, 'longbowman')).toBe(20); // 6 Earnside + 6 Happrew + 8 Bothwell
    expect(of(2, 'knight')).toBe(10);
    expect(of(2, 'manAtArms')).toBe(10);
    // player 3: Segrave's field camp
    expect(of(3, 'townCenter')).toBe(1);
    expect(of(3, 'stable')).toBe(1);
    expect(of(3, 'barracks')).toBe(1);
    expect(of(3, 'archeryRange')).toBe(1);
    expect(of(3, 'knight')).toBe(6);
  });

  it('is registered in the wallace campaign', () => {
    expect(scenariosById['wallace-6']).toBe(wallace6);
    expect(wallaceCampaign.scenarioIds[wallace6.index]).toBe(wallace6.id);
    expect(wallaceCampaign.scenarioIds).toHaveLength(6);
  });
});

describe('wallace-6 — trigger graph static soundness', () => {
  it('arms every unarmed trigger and resolves every objective', () => {
    expect(triggerGraphIssues(wallace6)).toEqual([]);
  });

  it('victory hangs on Bothwell keep; defeat watches Wallace and the camp; Fraser is a lament', () => {
    const victory = wallace6.triggers.find((t) => t.effects.some((fx) => fx.kind === 'victory'));
    expect(victory?.id).toBe('t13-victory');
    expect(victory?.conditions).toEqual([{ kind: 'refDestroyed', ref: 'bothwell_keep' }]);
    const defeats = wallace6.triggers.filter((t) => t.effects.some((fx) => fx.kind === 'defeat'));
    expect(defeats.map((t) => t.id)).toEqual(['t14-defeat-wallace', 't15-defeat-camp']);
    const fraser = wallace6.triggers.find((t) => t.id === 't16-fraser-falls');
    expect(fraser?.effects.every((fx) => fx.kind === 'message')).toBe(true);
  });
});

describe('wallace-6 — the captives of Happrew', () => {
  const makeOps = () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('fraser', { defId: 'heroFraser', player: 1 });
    ops.addEntity('earnside_tower', { defId: 'watchTower', player: 2 });
    ops.addEntity('happrew_keep', { defId: 'watchTower', player: 2 });
    ops.addEntity('happrew_gate', { defId: 'gate', player: 2 });
    ops.addEntity('bothwell_keep', { defId: 'castle', player: 2 });
    ops.addEntity('bothwell_gate_s', { defId: 'gate', player: 2 });
    ops.addEntity('bothwell_gate_e', { defId: 'gate', player: 2 });
    ops.addEntity('valence', { defId: 'heroValence', player: 2 });
    ops.addEntity('captive1', { defId: 'villager', player: 0 });
    ops.addEntity('captive2', { defId: 'villager', player: 0 });
    ops.addEntity('captive3', { defId: 'villager', player: 0 });
    ops.addEntity('captive4', { defId: 'highlandRaider', player: 0 });
    ops.addEntity('captive5', { defId: 'highlandRaider', player: 0 });
    ops.counts.unshift({
      match: (q) => q.player === 1 && q.area === undefined && q.defIds?.includes('townCenter') === true,
      count: 1,
    });
    ops.ages.set(1, 'castle'); // scenario start age
    return ops;
  };

  it('rescues the survivors when the fort falls, and the rescue latches over a later loss', () => {
    const ops = makeOps();
    const rt = new TriggerRuntime(wallace6, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    advance(1); // t01 + t03 (castle-age gate fires at once)
    expect(rt.hasFired('t03-castle-age-gate')).toBe(true);
    expect(rt.objectiveState('obj-happrew')).toBe('open');
    expect(rt.objectiveState('obj-earnside')).toBe('open');

    // a long-range kill: t06 (approach) never fired, t07's idempotent add covers it
    ops.kill('happrew_keep');
    advance(1);
    expect(rt.objectiveState('obj-happrew')).toBe('complete');
    expect(rt.objectiveState('obj-captives')).toBe('open');
    expect(ops.callsOf('setAiProfile')[0].args).toEqual([3, 'aggressive']);

    // a player unit stands in the fort with captives alive -> the rescue
    ops.counts.unshift({ match: (q) => q.area?.x === 52 && q.player === 1, count: 1 });
    ops.counts.unshift({ match: (q) => q.area?.x === 52 && q.player === 0, count: 5 });
    advance(1);
    expect(rt.hasFired('t08-captives-check')).toBe(true);
    expect(ops.callsOf('changeOwner')[0].args).toEqual(
      [['captive1', 'captive2', 'captive3', 'captive4', 'captive5'], 1],
    );
    expect(rt.objectiveState('obj-captives')).toBe('complete');

    // even if every rescued soul later dies, the resolution latches (t08b's fail no-ops)
    for (let i = 1; i <= 5; i++) ops.kill(`captive${i}`);
    advance(1);
    expect(rt.objectiveState('obj-captives')).toBe('complete');

    // Earnside + Bothwell -> the finale
    ops.kill('earnside_tower');
    advance(1);
    expect(rt.objectiveState('obj-earnside')).toBe('complete');
    advance(1); // t11-bothwell-gate (both objectiveComplete conditions now hold)
    expect(rt.objectiveState('obj-bothwell')).toBe('open');
    ops.kill('bothwell_keep');
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
  });

  it('fails the objective honestly when every captive dies before rescue', () => {
    const ops = makeOps();
    const rt = new TriggerRuntime(wallace6, ops);
    rt.tick([]);
    ops.kill('happrew_keep');
    rt.tick([]); // t07: adds obj-captives, arms t08 + t08b
    for (let i = 1; i <= 5; i++) ops.kill(`captive${i}`);
    rt.tick([]);
    expect(rt.hasFired('t08b-captives-lost')).toBe(true);
    expect(rt.objectiveState('obj-captives')).toBe('failed');
    // the rescue can no longer fire its completion over the latched failure
    ops.counts.unshift({ match: (q) => q.area?.x === 52 && q.player === 1, count: 1 });
    ops.counts.unshift({ match: (q) => q.area?.x === 52 && q.player === 0, count: 0 });
    rt.tick([]);
    expect(rt.objectiveState('obj-captives')).toBe('failed');
  });
});
