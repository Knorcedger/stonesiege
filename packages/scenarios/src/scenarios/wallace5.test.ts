// wallace-5 "Falkirk": loads clean, matches the docs/CAMPAIGN_WALLACE.md §6 map/entity
// spec (walled war-camp, moss causeways, Torwood escape lane, Edward's tent city),
// trigger graph statically sound, and the two breakout paths converge safely.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps, triggerGraphIssues } from '../testutil';
import { wallace5 } from './wallace5';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-5 — loads clean', () => {
  const { start, meta } = loadScenario(wallace5, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 132 + x]];

  it('resolves without validation errors', () => {
    expect(meta.id).toBe('wallace-5');
    expect(meta.index).toBe(4);
    expect(meta.title).toBe('Falkirk');
    expect(meta.maxAge).toBe('castle');
    expect(meta.popCap).toBe(200); // Edward's host
    expect(meta.startCamera).toEqual({ x: 60, y: 44 });
    expect(meta.players.map((p) => p.aiProfile)).toEqual([undefined, 'passive']);
  });

  it('authors the 132x132 moor: wood, ride, corridor, glade, moss, causeways', () => {
    expect(start.map.width).toBe(132);
    expect(start.map.height).toBe(132);
    // Callendar Wood is solid trees; the ride, corridor, and glade are carved grass
    expect(at(50, 10)).toBe('grass'); // tree token — terrain grass under the wood
    expect(at(31, 5)).toBe('grass');  // the ride
    expect(at(20, 9)).toBe('grass');  // the corridor
    expect(at(10, 10)).toBe('grass'); // the Torwood glade
    // war-camp floor is dirt; the moss is farmland split by dirt causeways
    expect(at(50, 40)).toBe('dirt');
    expect(at(60, 70)).toBe('farmland');
    expect(at(52, 70)).toBe('dirt');
    expect(at(76, 70)).toBe('dirt');
    // roads run from the muster to the causeway feet; the muster grounds are dirt
    expect(at(52, 80)).toBe('road');
    expect(at(76, 80)).toBe('road');
    expect(at(100, 110)).toBe('dirt');
    // no water anywhere on this map
    expect(start.map.terrainIds).not.toContain('water');
  });

  it('emits the documented gaia objects (farms only — no berries, no sheep)', () => {
    const gaia = start.entities.filter((e) => e.player === 0);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('goldMine')).toBe(5);
    expect(n('stoneMine')).toBe(5);
    expect(n('berryBush')).toBe(0);
    expect(n('sheep')).toBe(0);
    expect(n('deer')).toBe(0);
    expect(n('tree')).toBeGreaterThan(3000); // Callendar Wood
  });

  it('places the fortified camp, the heroes, and the tent city', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1, tileX: 58, tileY: 42 });
    expect(byRef.get('graham')).toMatchObject({ defId: 'heroGraham', player: 1, tileX: 60, tileY: 44 });
    expect(byRef.get('war_camp_castle')).toMatchObject({ defId: 'castle', player: 1, tileX: 62, tileY: 40 });
    expect(byRef.get('edward')).toMatchObject({ defId: 'heroEdward', player: 2, hp: 5000 });

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // the circuit: 132 perimeter tiles minus 2 gates
    expect(of(1, 'stoneWall')).toBe(130);
    expect(of(1, 'gate')).toBe(2);
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'castle')).toBe(1);
    expect(of(1, 'watchTower')).toBe(2);
    expect(of(1, 'farm')).toBe(10);
    expect(of(1, 'barracks')).toBe(1);
    expect(of(1, 'archeryRange')).toBe(1);
    expect(of(1, 'siegeWorkshop')).toBe(1);
    expect(of(1, 'stable')).toBe(1);
    expect(of(1, 'blacksmith')).toBe(1);
    expect(of(1, 'villager')).toBe(12);
    // starting line: 22 military — the fortify objective (30) requires training
    expect(of(1, 'spearman')).toBe(8);
    expect(of(1, 'skirmisher')).toBe(6);
    expect(of(1, 'archer')).toBe(4);
    expect(of(1, 'scout')).toBe(2);
    expect(of(1, 'mangonel')).toBe(2);
    // Edward's muster: banner guard + tents + tower pair; the host arrives by waves
    expect(of(2, 'knight')).toBe(8);
    expect(of(2, 'house')).toBe(10);
    expect(of(2, 'watchTower')).toBe(2);
  });

  it('keeps the original scenario registered for legacy saves', () => {
    expect(scenariosById['wallace-5']).toBe(wallace5);
    expect(wallaceCampaign.scenarioIds).not.toContain(wallace5.id);
  });
});

describe('wallace-5 — trigger graph static soundness', () => {
  it('arms every unarmed trigger and resolves every objective', () => {
    expect(triggerGraphIssues(wallace5)).toEqual([]);
  });

  it('Wallace is the only hard failure; both breakout paths arm the same escape', () => {
    const defeats = wallace5.triggers.filter((t) => t.effects.some((fx) => fx.kind === 'defeat'));
    expect(defeats.map((t) => t.id)).toEqual(['t14-defeat-wallace']);
    const armsEscape = wallace5.triggers.filter((t) =>
      t.effects.some((fx) => fx.kind === 'armTrigger' && fx.triggerId === 't13-escape'));
    expect(armsEscape.map((t) => t.id)).toEqual(['t10-breakout', 't11-castle-falls']);
  });
});

describe('wallace-5 — the breakout converges', () => {
  it('an early castle collapse opens the breakout, and reaching the Torwood wins', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('graham', { defId: 'heroGraham', player: 1 });
    ops.addEntity('war_camp_castle', { defId: 'castle', player: 1 });
    ops.addEntity('edward', { defId: 'heroEdward', player: 2 });
    const rt = new TriggerRuntime(wallace5, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    advance(1);
    expect(rt.hasFired('t01-intro')).toBe(true);
    expect(rt.objectiveState('obj-hold')).toBe('open');

    // the castle is breached before the scripted retreat: t11 opens the breakout early
    ops.kill('war_camp_castle');
    advance(1);
    expect(rt.hasFired('t11-castle-falls')).toBe(true);
    expect(rt.objectiveState('obj-hold')).toBe('complete'); // held as long as it could
    expect(rt.objectiveState('obj-breakout')).toBe('open');
    expect(ops.callsOf('revealArea')[0].args).toEqual([1, { x: 6, y: 6, w: 28, h: 22 }]);
    expect(rt.isArmed('t13-escape')).toBe(true);

    // Wallace reaches the Torwood glade -> the survival victory
    ops.counts.unshift({ match: (q) => q.area?.x === 6 && q.area?.y === 6, count: 1 });
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    expect(rt.objectiveState('obj-breakout')).toBe('complete');
  });

  it('Graham falling is a lament, not a defeat; Wallace falling ends it', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('graham', { defId: 'heroGraham', player: 1 });
    ops.addEntity('war_camp_castle', { defId: 'castle', player: 1 });
    ops.addEntity('edward', { defId: 'heroEdward', player: 2 });
    const rt = new TriggerRuntime(wallace5, ops);
    rt.tick([]);
    ops.kill('graham');
    rt.tick([]);
    expect(rt.isEnded).toBe(false);
    expect(ops.callsOf('defeat')).toHaveLength(0);
    ops.kill('wallace');
    rt.tick([]);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('defeat')).toHaveLength(1);
  });
});
