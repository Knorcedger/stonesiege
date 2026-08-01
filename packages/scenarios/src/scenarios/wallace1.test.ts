// wallace-1 "The Sheriff of Lanark": loads clean through the real loader (with campaign
// hero defs merged in), matches the docs/CAMPAIGN_WALLACE.md §2 map/entity spec, its
// trigger graph is statically sound, and the full scripted arc plays to victory against
// a scripted FakeOps.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps } from '../testutil';
import { wallace1 } from './wallace1';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-1 — loads clean', () => {
  const { start, meta } = loadScenario(wallace1, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 96 + x]];

  it('resolves against gameData + campaign heroes without validation errors', () => {
    expect(start.type).toBe('scenario');
    expect(meta.id).toBe('wallace-1');
    expect(meta.campaign).toBe('wallace');
    expect(meta.index).toBe(0);
    expect(meta.title).toBe('The Sheriff of Lanark');
    expect(meta.maxAge).toBe('dark');
    expect(meta.popCap).toBe(20);
    expect(meta.startCamera).toEqual({ x: 20, y: 64 });
  });

  it('maps the players onto sim PlayerSetups (P1 human Scots, P2 passive English)', () => {
    expect(meta.playerSetups).toHaveLength(2);
    expect(meta.playerSetups[0]).toMatchObject({
      civ: 'scots', team: 1, isHuman: true, startingAge: 'dark',
      startingResources: { food: 100, wood: 100 },
    });
    expect(meta.playerSetups[1]).toMatchObject({ civ: 'english', team: 2, isHuman: false });
    expect(meta.players[1].aiProfile).toBe('passive');
  });

  it('authors the documented 96x96 Lanarkshire terrain', () => {
    expect(start.map.width).toBe(96);
    expect(start.map.height).toBe(96);
    // the Clyde: impassable water band along the east edge (x >= 78) on every row
    for (let y = 0; y < 96; y++) {
      expect(at(78, y), `Clyde west bank at row ${y}`).toBe('water');
      expect(at(95, y), `east edge at row ${y}`).toBe('water');
    }
    // forest walls: solid trees west (x <= 6) and south (y >= 82) — tree tiles are grass terrain
    expect(at(0, 0)).toBe('grass');
    expect(at(3, 50)).toBe('grass');
    // Lanark town streets: dirt block with a road spine
    expect(at(60, 30)).toBe('dirt');
    expect(at(65, 30)).toBe('road');
    expect(at(60, 38)).toBe('road');
    // the glen itself is open grass
    expect(at(20, 60)).toBe('grass');
  });

  it('emits the documented gaia objects from map tokens', () => {
    const gaia = start.entities.filter((e) => e.player === 0);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('berryBush')).toBe(12); // 6 by camp + 6 south
    expect(n('sheep')).toBe(6); // 4 in the glen + 2 by the clearing
    expect(n('deer')).toBe(5);
    expect(n('wolf')).toBe(2);
    expect(n('goldMine')).toBe(3); // small taste of gold
    expect(n('stoneMine')).toBe(0); // no stone on this map
    expect(n('tree')).toBeGreaterThan(1500); // forest walls + copses
  });

  it('places the named refs and both settlements', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1 });
    expect(byRef.get('heselrig')).toMatchObject({ defId: 'heroHeselrig', player: 2, tileX: 65, tileY: 36 });
    expect(byRef.get('lanark_tower')).toMatchObject({ defId: 'watchTower', player: 2, tileX: 66, tileY: 34 });

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // player 1: TC + Wallace + 3 villagers
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'heroWallace')).toBe(1);
    expect(of(1, 'villager')).toBe(3);
    // player 2: hall (TC), tower, barracks, 6 houses, guard detail of 4 militia + 2 archers
    expect(of(2, 'townCenter')).toBe(1);
    expect(of(2, 'watchTower')).toBe(1);
    expect(of(2, 'barracks')).toBe(1);
    expect(of(2, 'house')).toBe(6);
    expect(of(2, 'militia')).toBe(4);
    expect(of(2, 'archer')).toBe(2);
  });

  it('carries the briefing: history prose, 6 initial objectives, 4 hints', () => {
    expect(meta.briefing.history.length).toBeGreaterThan(600);
    expect(meta.briefing.history).toContain('Heselrig');
    expect(meta.briefing.objectives).toHaveLength(6);
    expect(meta.briefing.hints).toHaveLength(4);
  });

  it('is registered in the wallace campaign', () => {
    expect(wallaceCampaign.scenarioIds).toEqual([
      'wallace-1', 'wallace-2', 'wallace-3', 'wallace-4', 'wallace-5', 'wallace-6',
    ]);
    expect(wallaceCampaign.scenarioIds[wallace1.index]).toBe(wallace1.id);
    expect(scenariosById['wallace-1']).toBe(wallace1);
  });
});

describe('wallace-1 — trigger graph static soundness', () => {
  const triggers = wallace1.triggers;

  it('arms every unarmed trigger from somewhere', () => {
    const armedBy = new Set<string>();
    for (const t of triggers) {
      for (const fx of t.effects) if (fx.kind === 'armTrigger') armedBy.add(fx.triggerId);
    }
    for (const t of triggers) {
      if (t.armed === false) {
        expect(armedBy.has(t.id), `unarmed trigger '${t.id}' is never armed`).toBe(true);
      }
    }
  });

  it('resolves every objective it adds (no objective can dangle at scenario end)', () => {
    const added = new Set<string>();
    const resolved = new Set<string>();
    for (const t of triggers) {
      for (const fx of t.effects) {
        if (fx.kind === 'objectiveAdd') added.add(fx.id);
        if (fx.kind === 'objectiveComplete' || fx.kind === 'objectiveFail') resolved.add(fx.id);
      }
    }
    expect(added.size).toBe(7); // 6 tutorial objectives + obj-heselrig
    for (const id of added) {
      expect(resolved.has(id), `objective '${id}' is added but never resolved`).toBe(true);
    }
  });

  it('has exactly one victory path and an always-armed defeat watchdog on Wallace', () => {
    const withEffect = (kind: string) =>
      triggers.filter((t) => t.effects.some((fx) => fx.kind === kind));
    expect(withEffect('victory')).toHaveLength(1);
    const defeats = withEffect('defeat');
    expect(defeats).toHaveLength(1);
    expect(defeats[0].armed).not.toBe(false); // watches from tick 0
    expect(defeats[0].conditions).toEqual([{ kind: 'refDestroyed', ref: 'wallace' }]);
    // the victory trigger gates on the muster so the tutorial arc always runs
    const victory = withEffect('victory')[0];
    expect(victory.conditions).toContainEqual({ kind: 'triggerFired', triggerId: 't09-muster' });
    expect(victory.conditions).toContainEqual({ kind: 'refDestroyed', ref: 'heselrig' });
  });

  it('references only refs/triggers that exist (loader-level check re-run explicitly)', () => {
    const refs = new Set<string>();
    for (const e of wallace1.entities) if (e.ref !== undefined) refs.add(e.ref);
    for (const t of triggers) {
      for (const fx of t.effects) {
        if (fx.kind === 'spawn') for (const e of fx.entities) if (e.ref !== undefined) refs.add(e.ref);
      }
    }
    const ids = new Set(triggers.map((t) => t.id));
    for (const t of triggers) {
      for (const c of t.conditions) {
        if (c.kind === 'refDestroyed') expect(refs.has(c.ref), `${t.id}: ref '${c.ref}'`).toBe(true);
        if (c.kind === 'triggerFired') expect(ids.has(c.triggerId), `${t.id}: trigger '${c.triggerId}'`).toBe(true);
      }
      for (const fx of t.effects) {
        if (fx.kind === 'armTrigger') expect(ids.has(fx.triggerId), `${t.id}: arms '${fx.triggerId}'`).toBe(true);
      }
    }
  });
});

describe('wallace-1 — scripted playthrough', () => {
  it('runs the whole arc: walk, gather, build, train, muster, kill the sheriff, victory', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('heselrig', { defId: 'heroHeselrig', player: 2 });
    ops.addEntity('lanark_tower', { defId: 'watchTower', player: 2 });
    const rt = new TriggerRuntime(wallace1, ops);
    const step = () => { ops.now += 20; rt.tick([]); };
    const inArea = (x: number, y: number, count: number) =>
      ops.counts.unshift({ match: (q) => q.area?.x === x && q.area?.y === y, count });
    const owned = (defId: string, count: number) =>
      ops.counts.unshift({ match: (q) => q.area === undefined && q.defIds?.includes(defId) === true, count });

    // t01: intro fires immediately
    step();
    expect(rt.hasFired('t01-intro')).toBe(true);
    expect(ops.callsOf('panCamera')[0].args).toEqual([22, 66]);
    expect(rt.objectiveState('obj-move-1')).toBe('open');

    // Wallace reaches the shepherd's clearing {30,52}
    inArea(30, 52, 1);
    step();
    expect(rt.objectiveState('obj-move-1')).toBe('complete');
    expect(rt.objectiveState('obj-move-2')).toBe('open');
    expect(ops.callsOf('revealArea')[0].args).toEqual([1, { x: 46, y: 38, w: 10, h: 10 }]);

    // Wallace reaches the ford lookout {48,40}; t03 arms t04 which fires the same tick
    inArea(48, 40, 1);
    step();
    expect(rt.objectiveState('obj-move-2')).toBe('complete');
    expect(rt.hasFired('t04-gather')).toBe(true);
    expect(rt.objectiveState('obj-food')).toBe('open');

    // 150 food stockpiled
    ops.stock.set(1, { food: 150 });
    step();
    expect(rt.objectiveState('obj-food')).toBe('complete');
    expect(rt.objectiveState('obj-houses')).toBe('open');

    // two houses stand
    owned('house', 2);
    step();
    expect(rt.objectiveState('obj-houses')).toBe('complete');
    expect(rt.objectiveState('obj-lumber')).toBe('open');

    // lumber camp + 200 wood
    owned('lumberCamp', 1);
    ops.stock.set(1, { food: 150, wood: 200 });
    step();
    expect(rt.objectiveState('obj-lumber')).toBe('complete');
    expect(rt.objectiveState('obj-vils')).toBe('open');

    // six villagers -> nightfall -> muster (t08 arms t09, which fires the same tick)
    owned('villager', 6);
    step();
    expect(rt.objectiveState('obj-vils')).toBe('complete');
    expect(rt.hasFired('t09-muster')).toBe(true);
    const spawns = ops.callsOf('spawn');
    expect(spawns).toHaveLength(1);
    const kin = spawns[0].args[0] as Array<{ defId: string; player: number }>;
    expect(kin).toHaveLength(5);
    expect(kin.every((e) => e.defId === 'militia' && e.player === 1)).toBe(true);
    expect(rt.objectiveState('obj-heselrig')).toBe('open');

    // the band approaches Lanark: the garrison wakes
    inArea(54, 26, 1);
    step();
    expect(rt.hasFired('t10-alarm')).toBe(true);
    expect(ops.callsOf('setAiProfile')[0].args).toEqual([2, 'defender']);

    // the sheriff falls
    ops.kill('heselrig');
    step();
    expect(rt.objectiveState('obj-heselrig')).toBe('complete');
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    expect(ops.callsOf('defeat')).toHaveLength(0);

    // every objective resolved complete, in add order
    expect(rt.objectiveIds()).toEqual([
      'obj-move-1', 'obj-move-2', 'obj-food', 'obj-houses', 'obj-lumber', 'obj-vils', 'obj-heselrig',
    ]);
    for (const id of rt.objectiveIds()) expect(rt.objectiveState(id)).toBe('complete');
  });

  it('defeats immediately, at any point, if Wallace dies', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('heselrig', { defId: 'heroHeselrig', player: 2 });
    ops.addEntity('lanark_tower', { defId: 'watchTower', player: 2 });
    const rt = new TriggerRuntime(wallace1, ops);
    rt.tick([]); // intro
    ops.kill('wallace');
    rt.tick([]);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('defeat')).toHaveLength(1);
    expect(ops.callsOf('victory')).toHaveLength(0);
  });
});
