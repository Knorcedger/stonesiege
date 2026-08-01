// wallace-2 "The Justiciar Flees": loads clean through the real loader, matches the
// docs/CAMPAIGN_WALLACE.md §3 map/entity spec, its trigger graph is statically sound,
// and the full scripted arc (economy -> feudal -> raid -> assault) plays to victory.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps, triggerGraphIssues } from '../testutil';
import { wallace2 } from './wallace2';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-2 — loads clean', () => {
  const { start, meta } = loadScenario(wallace2, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 112 + x]];

  it('resolves against gameData + campaign heroes without validation errors', () => {
    expect(start.type).toBe('scenario');
    expect(meta.id).toBe('wallace-2');
    expect(meta.index).toBe(1);
    expect(meta.title).toBe('The Justiciar Flees');
    expect(meta.maxAge).toBe('feudal');
    expect(meta.popCap).toBe(40);
    expect(meta.startCamera).toEqual({ x: 30, y: 74 });
  });

  it('maps the players (P1 human Scots dark age, P2 English feudal defender)', () => {
    expect(meta.playerSetups).toHaveLength(2);
    expect(meta.playerSetups[0]).toMatchObject({ civ: 'scots', isHuman: true, startingAge: 'dark' });
    expect(meta.playerSetups[1]).toMatchObject({ civ: 'english', isHuman: false, startingAge: 'feudal' });
    expect(meta.players[1].aiProfile).toBe('defender');
  });

  it('authors the documented 112x112 Perthshire terrain', () => {
    expect(start.map.width).toBe(112);
    expect(start.map.height).toBe(112);
    // the Tay: vertical arm from the N edge, horizontal arm to the E edge
    expect(at(46, 0)).toBe('water');
    expect(at(46, 32)).toBe('water');
    expect(at(70, 38)).toBe('water');
    expect(at(111, 38)).toBe('water');
    // the ford spans all ten water rows at x 56-58
    for (let y = 33; y <= 42; y++) expect(at(57, y), `ford row ${y}`).toBe('shallows');
    // Scone rise is dirt; the meadow is grass; forest walls are tree-on-grass
    expect(at(70, 12)).toBe('dirt');
    expect(at(30, 70)).toBe('grass');
    expect(at(0, 0)).toBe('grass');
    expect(at(20, 100)).toBe('grass');
  });

  it('emits the documented gaia objects from map tokens', () => {
    const gaia = start.entities.filter((e) => e.player === 0);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('berryBush')).toBe(8);
    expect(n('sheep')).toBe(6);
    expect(n('deer')).toBe(6);
    expect(n('goldMine')).toBe(9); // 5 NE of camp + 4 far SW
    expect(n('stoneMine')).toBe(4);
    expect(n('wolf')).toBe(0);
    expect(n('tree')).toBeGreaterThan(2000); // S + W forest walls + copses
  });

  it('places the named refs and both settlements', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1 });
    expect(byRef.get('ormesby_hall')).toMatchObject({ defId: 'townCenter', player: 2, tileX: 74, tileY: 14 });
    expect(byRef.get('ford_tower')).toMatchObject({ defId: 'watchTower', player: 2, tileX: 62, tileY: 28 });

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // player 1: TC, Wallace, 5 villagers, 2 Lanark-survivor militia
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'heroWallace')).toBe(1);
    expect(of(1, 'villager')).toBe(5);
    expect(of(1, 'militia')).toBe(2);
    // player 2: hall, ford tower, barracks, 6 houses, 6 militia + 4 archers + 2 scouts
    expect(of(2, 'townCenter')).toBe(1);
    expect(of(2, 'watchTower')).toBe(1);
    expect(of(2, 'barracks')).toBe(1);
    expect(of(2, 'house')).toBe(6);
    expect(of(2, 'militia')).toBe(6);
    expect(of(2, 'archer')).toBe(4);
    expect(of(2, 'scout')).toBe(2);
  });

  it('is registered in the wallace campaign', () => {
    expect(scenariosById['wallace-2']).toBe(wallace2);
    expect(wallaceCampaign.scenarioIds[wallace2.index]).toBe(wallace2.id);
  });
});

describe('wallace-2 — trigger graph static soundness', () => {
  it('arms every unarmed trigger and resolves every objective', () => {
    expect(triggerGraphIssues(wallace2)).toEqual([]);
  });

  it('has one victory path and defeat watchdogs on Wallace and the camp', () => {
    const withEffect = (kind: string) =>
      wallace2.triggers.filter((t) => t.effects.some((fx) => fx.kind === kind));
    expect(withEffect('victory')).toHaveLength(1);
    expect(withEffect('victory')[0].conditions).toEqual([{ kind: 'refDestroyed', ref: 'ormesby_hall' }]);
    const defeats = withEffect('defeat');
    expect(defeats.map((t) => t.id)).toEqual(['t11-defeat-wallace', 't12-defeat-camp']);
    for (const t of defeats) expect(t.armed).not.toBe(false);
  });
});

describe('wallace-2 — scripted playthrough', () => {
  it('runs the arc: economy, feudal, raid defense, muster, burn the hall, victory', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('ormesby_hall', { defId: 'townCenter', player: 2 });
    ops.addEntity('ford_tower', { defId: 'watchTower', player: 2 });
    const ownedP1 = (defId: string, count: number) =>
      ops.counts.unshift({
        match: (q) => q.player === 1 && q.area === undefined && q.defIds?.includes(defId) === true,
        count,
      });
    ownedP1('townCenter', 1); // the camp stands throughout — keeps t12-defeat-camp quiet
    const rt = new TriggerRuntime(wallace2, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    advance(1); // t01: intro
    expect(rt.hasFired('t01-intro')).toBe(true);
    expect(rt.objectiveState('obj-camp')).toBe('open');
    expect(rt.objectiveState('obj-gold')).toBe('open');
    expect(rt.objectiveState('obj-feudal')).toBe('open');

    // mill + 4 farms
    ownedP1('mill', 1);
    ownedP1('farm', 4);
    advance(1);
    expect(rt.objectiveState('obj-camp')).toBe('complete');

    // mining camp + 200 gold
    ownedP1('miningCamp', 1);
    ops.stock.set(1, { gold: 200 });
    advance(1);
    expect(rt.objectiveState('obj-gold')).toBe('complete');

    // feudal age -> raid timer armed
    ops.ages.set(1, 'feudal');
    advance(1);
    expect(rt.objectiveState('obj-feudal')).toBe('complete');
    expect(rt.objectiveState('obj-army')).toBe('open');
    expect(rt.isArmed('t05-raid-timer')).toBe(true);

    // the raid rides 2 minutes later
    advance(120);
    expect(rt.hasFired('t05-raid-timer')).toBe(true);
    expect(rt.objectiveState('obj-hold')).toBe('open');
    const raid = ops.callsOf('spawn')[0].args[0] as Array<{ player: number }>;
    expect(raid).toHaveLength(8);
    expect(raid.every((e) => e.player === 2)).toBe(true);
    expect(ops.callsOf('aiAttackNow')[0].args).toEqual([2, { x: 18, y: 62, w: 30, h: 26 }]);

    // 30s grace, approach quadrant already scripted empty of English -> raid broken
    advance(30);
    expect(rt.objectiveState('obj-hold')).toBe('complete');

    // the warband musters -> assault objective + Douglas's reinforcements (t09, same arc)
    ownedP1('militia', 6);
    ownedP1('spearman', 4);
    advance(1);
    expect(rt.hasFired('t07-army')).toBe(true);
    expect(rt.hasFired('t09-reinforce')).toBe(true);
    expect(rt.objectiveState('obj-ormesby')).toBe('open');
    expect(ops.callsOf('spawn')).toHaveLength(2);
    const douglas = ops.callsOf('spawn')[1].args[0] as Array<{ player: number }>;
    expect(douglas).toHaveLength(6);
    expect(douglas.every((e) => e.player === 1)).toBe(true);
    expect(ops.callsOf('revealArea')[0].args).toEqual([1, { x: 62, y: 8, w: 30, h: 24 }]);

    // the hall falls
    ops.kill('ormesby_hall');
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    expect(ops.callsOf('defeat')).toHaveLength(0);
    for (const id of ['obj-camp', 'obj-gold', 'obj-feudal', 'obj-army', 'obj-hold', 'obj-ormesby']) {
      expect(rt.objectiveState(id), id).toBe('complete');
    }
  });

  it('defeats immediately if Wallace dies', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('ormesby_hall', { defId: 'townCenter', player: 2 });
    ops.addEntity('ford_tower', { defId: 'watchTower', player: 2 });
    ops.counts.unshift({ match: (q) => q.defIds?.includes('townCenter') === true, count: 1 });
    const rt = new TriggerRuntime(wallace2, ops);
    rt.tick([]);
    ops.kill('wallace');
    rt.tick([]);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('defeat')).toHaveLength(1);
  });
});
