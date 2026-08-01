// wallace-3 "Stirling Bridge": loads clean, matches the docs/CAMPAIGN_WALLACE.md §4
// map/entity spec (bridge, ford, meander, Abbey Craig, set-dressing player 4), trigger
// graph statically sound, and the wave machine runs A->D to the annihilation victory.

import { describe, expect, it } from 'vitest';
import type { TerrainId } from '@bf/sim/types';
import { loadScenario } from '../loader';
import { campaignGameData } from '../heroes';
import { TriggerRuntime } from '../triggers';
import { FakeOps, triggerGraphIssues } from '../testutil';
import { wallace3 } from './wallace3';
import { wallaceCampaign, scenariosById } from '../campaign';

describe('wallace-3 — loads clean', () => {
  const { start, meta } = loadScenario(wallace3, campaignGameData);
  const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 120 + x]];

  it('resolves without validation errors', () => {
    expect(meta.id).toBe('wallace-3');
    expect(meta.index).toBe(2);
    expect(meta.title).toBe('Stirling Bridge');
    expect(meta.maxAge).toBe('feudal');
    expect(meta.popCap).toBe(100); // max across the four players (Warenne's host)
    expect(meta.startCamera).toEqual({ x: 52, y: 26 });
    expect(meta.playerSetups).toHaveLength(4);
    expect(meta.players.map((p) => p.aiProfile)).toEqual([undefined, 'passive', 'defender', 'passive']);
    expect(meta.players.map((p) => p.team)).toEqual([1, 2, 1, 2]); // Moray allied, banner guard enemy
  });

  it('authors the 120x120 carse: bridge, causeway, ford, meandering Forth', () => {
    expect(start.map.width).toBe(120);
    expect(start.map.height).toBe(120);
    // the bridge: 2-wide road spanning the nominal band rows 56-68
    for (let y = 56; y <= 68; y++) {
      expect(at(58, y), `bridge row ${y}`).toBe('road');
      expect(at(59, y), `bridge row ${y}`).toBe('road');
    }
    // the western ford spans the full band at x 8-11
    for (let y = 56; y <= 68; y++) expect(at(8, y), `ford row ${y}`).toBe('shallows');
    // the meander: dip south between x 20-36, rise north between x 80-96
    expect(at(28, 72)).toBe('water');
    expect(at(28, 58)).toBe('grass');
    expect(at(88, 50)).toBe('water');
    expect(at(88, 66)).toBe('grass');
    // the causeway through the marsh; the marsh itself is farmland
    expect(at(58, 45)).toBe('road');
    expect(at(52, 44)).toBe('farmland');
    // Abbey Craig: dirt slopes, grass crown
    expect(at(78, 28)).toBe('dirt');
    expect(at(82, 30)).toBe('grass');
  });

  it('emits the documented gaia objects (no berries/sheep — economy is pre-built)', () => {
    const gaia = start.entities.filter((e) => e.player === 0);
    const n = (id: string) => gaia.filter((e) => e.defId === id).length;
    expect(n('goldMine')).toBe(5);
    expect(n('stoneMine')).toBe(4);
    expect(n('berryBush')).toBe(0);
    expect(n('sheep')).toBe(0);
    expect(n('deer')).toBe(0);
    expect(n('tree')).toBeGreaterThan(1100); // north belt + Abbey Craig slopes + copses
  });

  it('places refs, the pre-built camp, the allies, and the banner guard', () => {
    const byRef = new Map(start.entities.filter((e) => e.ref !== undefined).map((e) => [e.ref, e]));
    expect(byRef.get('wallace')).toMatchObject({ defId: 'heroWallace', player: 1 });
    expect(byRef.get('moray')).toMatchObject({ defId: 'heroMoray', player: 3, tileX: 83, tileY: 30 });
    expect(byRef.get('warenne')).toMatchObject({ defId: 'heroWarenne', player: 4, hp: 2000 });

    const of = (player: number, defId: string) =>
      start.entities.filter((e) => e.player === player && e.defId === defId).length;
    // player 1: full camp + starting line
    expect(of(1, 'townCenter')).toBe(1);
    expect(of(1, 'farm')).toBe(8);
    expect(of(1, 'barracks')).toBe(1);
    expect(of(1, 'archeryRange')).toBe(1);
    expect(of(1, 'villager')).toBe(10);
    expect(of(1, 'spearman')).toBe(6);
    expect(of(1, 'skirmisher')).toBe(4);
    expect(of(1, 'archer')).toBe(6); // the anti-infantry arm — waves B/C bring man-at-arms escorts
    expect(of(1, 'house')).toBe(8); // 45 pop room: warband + reinforcement margin
    // player 2 fields NOTHING at start — the host arrives by scripted waves,
    // so the annihilation count (t11) can never be polluted
    expect(start.entities.filter((e) => e.player === 2)).toHaveLength(0);
    // player 3: Moray's camp on the crown
    expect(of(3, 'watchTower')).toBe(1);
    expect(of(3, 'spearman')).toBe(6);
    expect(of(3, 'archer')).toBe(4);
    // player 4: banner guard + tents + distant Stirling Castle
    expect(of(4, 'knight')).toBe(4);
    expect(of(4, 'house')).toBe(8);
    expect(of(4, 'castle')).toBe(1);
    expect(of(4, 'stoneWall')).toBe(48);
  });

  it('is registered in the wallace campaign', () => {
    expect(scenariosById['wallace-3']).toBe(wallace3);
    expect(wallaceCampaign.scenarioIds[wallace3.index]).toBe(wallace3.id);
  });
});

describe('wallace-3 — trigger graph static soundness', () => {
  it('arms every unarmed trigger and resolves every objective', () => {
    expect(triggerGraphIssues(wallace3)).toEqual([]);
  });

  it('wave A is the mounted vanguard the briefing teaches counters for — never an infantry lead', () => {
    // Regression guard for the unwinnable-composition bug: the objectives mandate a
    // spear+skirm warband, so the FIRST wave must be cavalry+archers (which that
    // warband hard-counters), with the man-at-arms mass trailing as later escorts.
    const waveA = wallace3.triggers.find((t) => t.id === 't04-wave-a');
    const spawn = waveA?.effects.find((fx) => fx.kind === 'spawn');
    const defs = spawn?.kind === 'spawn' ? spawn.entities.map((e) => e.def) : [];
    expect(defs.filter((d) => d === 'scout')).toHaveLength(8);
    expect(defs.filter((d) => d === 'archer')).toHaveLength(4);
    expect(defs).not.toContain('manAtArms');
    expect(defs).not.toContain('knight');
  });

  it('victory counts only player 2 (the fighting host), gated behind the mop-up', () => {
    const victory = wallace3.triggers.find((t) => t.effects.some((fx) => fx.kind === 'victory'));
    expect(victory?.id).toBe('t11-victory');
    expect(victory?.armed).toBe(false); // only armed once Cressingham is down
    expect(victory?.conditions).toEqual([
      expect.objectContaining({ kind: 'ownedAtMost', player: 2, atMost: 0 }),
    ]);
    const defeats = wallace3.triggers.filter((t) => t.effects.some((fx) => fx.kind === 'defeat'));
    expect(defeats.map((t) => t.id)).toEqual(['t13-defeat-wallace', 't14-defeat-camp']);
  });
});

describe('wallace-3 — the wave machine', () => {
  it('runs waves A-D exactly once each (converging arms cannot double-fire) to victory', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('moray', { defId: 'heroMoray', player: 3 });
    ops.addEntity('warenne', { defId: 'heroWarenne', player: 4 });
    const ownedP1 = (defId: string, count: number) =>
      ops.counts.unshift({
        match: (q) => q.player === 1 && q.area === undefined && q.defIds?.includes(defId) === true,
        count,
      });
    ownedP1('townCenter', 1); // the camp stands — keeps t14 quiet
    const rt = new TriggerRuntime(wallace3, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    advance(1);
    expect(rt.hasFired('t01-intro')).toBe(true);

    // warband ready -> t02 arms wave A, which fires the same tick
    ownedP1('spearman', 10);
    ownedP1('skirmisher', 8);
    advance(1);
    expect(rt.objectiveState('obj-prepare')).toBe('complete');
    expect(rt.hasFired('t04-wave-a')).toBe(true);
    expect(ops.callsOf('spawn')).toHaveLength(1);
    expect(rt.objectiveState('obj-trap')).toBe('open');

    // the 8-minute deadline fires in the same jump as wave B's timer. The deadline's
    // armTrigger on the already-fired wave A is a no-op — if it re-fired, we would see
    // three spawns here instead of two (A twice + B).
    advance(480);
    expect(rt.hasFired('t03-prep-deadline')).toBe(true);
    expect(rt.hasFired('t06-wave-b')).toBe(true);
    expect(ops.callsOf('spawn')).toHaveLength(2);

    // Moray's signal: 8 of the host stand on the north bank (t05a arms the payload,
    // which fires the same tick; t05b's converging arm is a safe no-op)
    ops.counts.unshift({ match: (q) => q.player === 2 && q.area !== undefined, count: 8 });
    advance(1);
    expect(rt.hasFired('t05a-signal-north')).toBe(true);
    expect(rt.hasFired('t05-signal')).toBe(true);
    expect(ops.callsOf('aiAttackNow').some((c) => c.args[0] === 3)).toBe(true);

    advance(240); // wave C brings Cressingham
    expect(rt.hasFired('t07-wave-c')).toBe(true);
    expect(rt.objectiveState('obj-cressingham')).toBe('open');
    expect(ops.getEntityByRef('cressingham')).not.toBeNull();
    advance(300); // wave D: the flankers
    expect(rt.hasFired('t08-wave-d')).toBe(true);
    expect(rt.objectiveState('obj-ford')).toBe('open');
    expect(ops.callsOf('spawn')).toHaveLength(4);

    // the flanking force dies -> obj-ford completes with no blind timer
    for (let i = 1; i <= 8; i++) ops.kill(`flank${i}`);
    advance(1);
    expect(rt.objectiveState('obj-ford')).toBe('complete');

    // Cressingham falls -> mop-up gate arms the annihilation check, which (the host
    // being scripted-only) completes the trap the same tick
    ops.kill('cressingham');
    advance(1);
    expect(rt.objectiveState('obj-cressingham')).toBe('complete');
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    for (const id of ['obj-prepare', 'obj-hold-camp', 'obj-trap', 'obj-cressingham', 'obj-ford']) {
      expect(rt.objectiveState(id), id).toBe('complete');
    }
  });

  it('signal fallback + mop-up drive: a bloody bridge cannot skip the beat, and south-bank stragglers are whipped north', () => {
    const ops = new FakeOps();
    ops.addEntity('wallace', { defId: 'heroWallace', player: 1 });
    ops.addEntity('moray', { defId: 'heroMoray', player: 3 });
    ops.addEntity('warenne', { defId: 'heroWarenne', player: 4 });
    const ownedP1 = (defId: string, count: number) =>
      ops.counts.unshift({
        match: (q) => q.player === 1 && q.area === undefined && q.defIds?.includes(defId) === true,
        count,
      });
    ownedP1('townCenter', 1); // the camp stands — keeps t14 quiet
    const rt = new TriggerRuntime(wallace3, ops);
    const advance = (seconds: number) => { ops.now += seconds * 20; rt.tick([]); };

    // prep done -> wave A rides
    advance(1);
    ownedP1('spearman', 10);
    ownedP1('skirmisher', 8);
    advance(1);
    expect(rt.hasFired('t04-wave-a')).toBe(true);

    // the player bleeds the crossing white at the bridge: the north-bank count never
    // exceeds 5, so t05a's threshold (8) is out of reach for the whole battle
    ops.counts.unshift({ match: (q) => q.player === 2 && q.area !== undefined, count: 5 });
    advance(30);
    expect(rt.hasFired('t05a-signal-north')).toBe(false);
    expect(rt.hasFired('t05-signal')).toBe(false);

    // wave B rides at 210s and arms the guarantee: the FIRST Englishman north now
    // fires Moray's signal — the trap can never again be sprung unannounced
    advance(180);
    expect(rt.hasFired('t06-wave-b')).toBe(true);
    advance(1);
    expect(rt.hasFired('t05b-signal-crossed')).toBe(true);
    expect(rt.hasFired('t05-signal')).toBe(true);
    expect(ops.callsOf('aiAttackNow').some((c) => c.args[0] === 3)).toBe(true); // Moray charges

    // wave C brings Cressingham, wave D the flankers (which arms the mop-up gate);
    // the player repels the ford and kills Cressingham while 3 of the host still
    // stand (say, idling by the SW castle on the south bank)
    advance(240);
    expect(rt.hasFired('t07-wave-c')).toBe(true);
    advance(300);
    expect(rt.hasFired('t08-wave-d')).toBe(true);
    for (let i = 1; i <= 8; i++) ops.kill(`flank${i}`);
    ops.counts.unshift({ match: (q) => q.player === 2 && q.area === undefined && q.defIds !== undefined, count: 3 });
    ops.kill('cressingham');
    advance(1);
    expect(rt.hasFired('t10-mopup-gate')).toBe(true);
    expect(rt.objectiveState('obj-ford')).toBe('complete');
    expect(rt.isEnded).toBe(false); // 3 stragglers left — no victory yet

    // the mop-up drive force-marches the stragglers at the bridgehead every 20s
    const drives = () => ops.callsOf('aiAttackNow').filter((c) => c.args[0] === 2).length;
    const before = drives();
    advance(20);
    expect(rt.hasFired('t10b-mopup-drive')).toBe(true);
    expect(drives()).toBe(before + 1);
    advance(20); // loop: it keeps whipping them north until none remain
    expect(drives()).toBe(before + 2);

    // the driven stragglers die at the bridgehead -> annihilation -> victory,
    // with every objective that was ever added resolved complete
    ops.counts.unshift({ match: (q) => q.player === 2 && q.area === undefined && q.defIds !== undefined, count: 0 });
    advance(1);
    expect(rt.isEnded).toBe(true);
    expect(ops.callsOf('victory')).toHaveLength(1);
    for (const id of rt.objectiveIds()) expect(rt.objectiveState(id), id).toBe('complete');
    expect(rt.objectiveIds()).toEqual(['obj-prepare', 'obj-hold-camp', 'obj-trap', 'obj-cressingham', 'obj-ford']);
  });
});
