// Wave-2 macro-loop integration: one scripted, fully deterministic game played through
// the sim API exactly like a human would through the HUD — boom to 20 villagers on
// berries + farms + wood + gold, build the whole economy, age to Feudal, raise a
// barracks/range army, take blacksmith + line techs, sell stone at the market, then
// march on the idle enemy and win by conquest. Asserts resource flows, age transition,
// combat deaths, and the victory event within a hard tick budget.
//
// The driver below is a pure function of GameState (no wall clock, no external RNG),
// so the whole run replays identically — it is a determinism test as much as a
// gameplay one.

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import type { Command, Entity, EntityId, ScenarioStart, SimEvent } from './types';
import { createGame } from './game';
import type { SimState } from './internal';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;
const TICK_CAP = 30000; // 25 sim-minutes — victory must land inside this

type Role = 'food' | 'wood' | 'gold';

function startEntities(): ScenarioStart['entities'] {
  const e: ScenarioStart['entities'] = [];
  // west forest wall: two columns of trees
  for (let y = 0; y <= 21; y++) {
    e.push({ defId: 'tree', player: 0, tileX: 0, tileY: y });
    e.push({ defId: 'tree', player: 0, tileX: 1, tileY: y });
  }
  // P1 base
  e.push({ defId: 'townCenter', player: P1, tileX: 4, tileY: 4, ref: 'tc' });
  const vills = [[9, 5], [9, 6], [9, 7], [9, 8], [8, 9], [9, 9]];
  vills.forEach(([x, y], i) => e.push({ defId: 'villager', player: P1, tileX: x, tileY: y, ref: `v${i}` }));
  // berries (10 × 125 food) + gold (2 × 800)
  for (let x = 3; x <= 7; x++) {
    e.push({ defId: 'berryBush', player: 0, tileX: x, tileY: 12 });
    e.push({ defId: 'berryBush', player: 0, tileX: x, tileY: 13 });
  }
  e.push({ defId: 'goldMine', player: 0, tileX: 12, tileY: 16 });
  e.push({ defId: 'goldMine', player: 0, tileX: 13, tileY: 16 });
  // idle enemy: a TC and three villagers, nothing else (conquest: all must fall)
  e.push({ defId: 'townCenter', player: P2, tileX: 42, tileY: 16, ref: 'etc' });
  e.push({ defId: 'villager', player: P2, tileX: 40, tileY: 22, ref: 'ev0' });
  e.push({ defId: 'villager', player: P2, tileX: 41, tileY: 22, ref: 'ev1' });
  e.push({ defId: 'villager', player: P2, tileX: 42, tileY: 22, ref: 'ev2' });
  return e;
}

/** Economy layout: every site verified free of resources/other footprints. */
const BUILD_PLAN: Array<{ defId: string; x: number; y: number; at: 'start' | 'mill' | 'feudal'; minVills: number }> = [
  { defId: 'house', x: 10, y: 0, at: 'start', minVills: 0 },
  { defId: 'lumberCamp', x: 2, y: 7, at: 'start', minVills: 0 },
  { defId: 'house', x: 13, y: 0, at: 'start', minVills: 0 },
  { defId: 'mill', x: 9, y: 12, at: 'start', minVills: 0 },
  { defId: 'house', x: 16, y: 0, at: 'start', minVills: 8 },
  { defId: 'miningCamp', x: 12, y: 13, at: 'start', minVills: 9 },
  { defId: 'farm', x: 4, y: 8, at: 'mill', minVills: 0 },
  { defId: 'farm', x: 8, y: 8, at: 'mill', minVills: 0 },
  { defId: 'house', x: 19, y: 0, at: 'start', minVills: 11 },
  { defId: 'farm', x: 12, y: 8, at: 'mill', minVills: 10 },
  { defId: 'barracks', x: 20, y: 6, at: 'start', minVills: 12 },
  { defId: 'house', x: 22, y: 0, at: 'start', minVills: 14 },
  { defId: 'farm', x: 16, y: 8, at: 'mill', minVills: 14 },
  { defId: 'house', x: 25, y: 0, at: 'start', minVills: 16 },
  { defId: 'house', x: 28, y: 0, at: 'start', minVills: 18 },
  { defId: 'blacksmith', x: 20, y: 12, at: 'feudal', minVills: 0 },
  { defId: 'market', x: 24, y: 12, at: 'feudal', minVills: 0 },
  { defId: 'archeryRange', x: 24, y: 6, at: 'feudal', minVills: 0 },
];

const cheb = (a: { tileX: number; tileY: number }, x: number, y: number): number =>
  Math.max(Math.abs(a.tileX - x), Math.abs(a.tileY - y));

describe('wave-2 macro loop (scripted full game)', () => {
  it('booms, ages up, arms, and wins by conquest — deterministically', () => {
    const game = createGame(scenarioConfig(42, grassMap(52, 34), startEntities(), [
      player({ civ: 'scots', isHuman: true }),
      player({ civ: 'english' }),
    ]));
    const st = game.state;
    // this is a practice-style skirmish authored as a scenario map: win by conquest
    // (scenario games default to trigger-driven endings, so flip the flag explicitly)
    (st as unknown as SimState).conquest = true;
    const tcId = st.refs.get('tc')!;
    const etcId = st.refs.get('etc')!;
    const enemyVills = ['ev0', 'ev1', 'ev2'].map((r) => st.refs.get(r)!);

    // ---- run tallies
    const dropped: Record<string, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    const completed: Record<string, number> = {};
    const agesReached: string[] = [];
    let villagersTrained = 0;
    let militiaTrained = 0;
    let archersTrained = 0;
    let maaDone = false;
    let forgingDone = false;
    let marketEv: Extract<SimEvent, { kind: 'marketTraded' }> | null = null;
    let tcDeath: Extract<SimEvent, { kind: 'entityDied' }> | null = null;
    let killsByP1 = 0;
    let victoryEv: Extract<SimEvent, { kind: 'victory' }> | null = null;
    let sawDefeatP2 = false;
    let maxVills = 0;
    let maxFarmers = 0;
    const placed = new Set<number>(); // BUILD_PLAN indices with a live foundation/building
    let attacking = false;
    let lastMopTarget = -1;
    const milestones: Record<string, number> = {};
    const mark = (k: string): void => { if (milestones[k] === undefined) milestones[k] = st.tick; };

    const alive = (defId: string, p: number): Entity[] => {
      const out: Entity[] = [];
      for (const e of st.entities.values()) {
        if (e.player === p && e.defId === defId && e.hp > 0) out.push(e);
      }
      return out;
    };
    const doneBuilding = (defId: string): Entity | undefined => {
      for (const e of st.entities.values()) {
        if (e.player === P1 && e.defId === defId && e.hp > 0 && (e.buildProgress ?? 0) >= 1000) return e;
      }
      return undefined;
    };
    const militaryIds = (): EntityId[] => {
      const ids: EntityId[] = [];
      for (const e of st.entities.values()) {
        if (e.player !== P1 || e.kind !== 'unit' || e.hp <= 0) continue;
        if (e.defId === 'militia' || e.defId === 'manAtArms' || e.defId === 'archer') ids.push(e.id);
      }
      return ids;
    };

    const roleOfTarget = (id: EntityId): Role | null => {
      const t = st.entities.get(id);
      if (!t) return null;
      if (t.defId === 'tree') return 'wood';
      if (t.defId === 'berryBush' || t.defId === 'farm') return 'food';
      if (t.defId === 'goldMine') return 'gold';
      return null;
    };

    /** Deterministic per-tick command policy — a scripted "player". */
    const controller = (): Command[] => {
      const cmds: Command[] = [];
      const p = st.players[P1];
      const stock = p.stockpile;
      const vills = alive('villager', P1);
      const feudal = p.age !== 'dark';

      // ---- 1. building placement (strictly in plan order; retried until a foundation exists)
      const millDone = doneBuilding('mill') !== undefined;
      const raxDone = doneBuilding('barracks') !== undefined;
      for (let i = 0; i < BUILD_PLAN.length; i++) {
        if (placed.has(i)) continue;
        const o = BUILD_PLAN[i];
        const gate = o.at === 'start' || (o.at === 'mill' && millDone) || (o.at === 'feudal' && feudal && raxDone);
        if (!gate || vills.length < o.minVills) break;
        const def = gameData.buildings[o.defId];
        const c = def.cost;
        if ((c.food ?? 0) > stock.food || (c.wood ?? 0) > stock.wood
          || (c.gold ?? 0) > stock.gold || (c.stone ?? 0) > stock.stone) break;
        // nearest villager that is not already raising something
        let builder: Entity | null = null;
        let best = Infinity;
        for (const v of vills) {
          if (v.intent?.kind === 'build' || v.activity === 'building') continue;
          const d = cheb(v, o.x, o.y);
          if (d < best) { best = d; builder = v; }
        }
        if (builder) cmds.push({ kind: 'build', player: P1, units: [builder.id], defId: o.defId, tileX: o.x, tileY: o.y });
        break; // one placement attempt per tick, strictly ordered
      }

      // ---- 2. town center: villagers to 20, then Feudal Age
      const tc = st.entities.get(tcId);
      if (tc && tc.hp > 0) {
        const queueEmpty = (tc.trainQueue?.length ?? 0) === 0;
        if (queueEmpty && vills.length < 20 && stock.food >= 50 && p.pop < p.popCap) {
          cmds.push({ kind: 'train', player: P1, buildingId: tcId, defId: 'villager' });
        } else if (queueEmpty && vills.length >= 20 && stock.food >= 500
          && !p.researchedTechs.includes('feudalAge')) {
          cmds.push({ kind: 'research', player: P1, buildingId: tcId, techId: 'feudalAge' });
        }
      }

      // ---- 3. barracks: 10 militia once Feudal is paid for, then Man-at-Arms
      const rax = doneBuilding('barracks');
      const feudalCommitted = p.researchedTechs.includes('feudalAge') || (tc?.trainQueue?.[0]?.techId === 'feudalAge');
      if (rax && (rax.trainQueue?.length ?? 0) === 0) {
        if (feudalCommitted && militiaTrained < 10 && stock.food >= 50 && stock.gold >= 20 && p.pop < p.popCap) {
          cmds.push({ kind: 'train', player: P1, buildingId: rax.id, defId: 'militia' });
        } else if (feudal && militiaTrained >= 10 && !maaDone && stock.food >= 100 && stock.gold >= 40) {
          cmds.push({ kind: 'research', player: P1, buildingId: rax.id, techId: 'manAtArmsUpgrade' });
        }
      }

      // ---- 4. blacksmith: Forging (militia first — food priority)
      const smith = doneBuilding('blacksmith');
      if (smith && (smith.trainQueue?.length ?? 0) === 0 && militiaTrained >= 10
        && !forgingDone && stock.food >= 150) {
        cmds.push({ kind: 'research', player: P1, buildingId: smith.id, techId: 'forging' });
      }

      // ---- 5. archery range: 3 archers after the line upgrade (gold priority order)
      const range = doneBuilding('archeryRange');
      if (range && (range.trainQueue?.length ?? 0) === 0 && maaDone
        && archersTrained < 3 && stock.wood >= 25 && stock.gold >= 45 && p.pop < p.popCap) {
        cmds.push({ kind: 'train', player: P1, buildingId: range.id, defId: 'archer' });
      }

      // ---- 6. market: one stone lot → gold (global rate 130, 30% fee)
      if (!marketEv && doneBuilding('market') && stock.stone >= 100) {
        cmds.push({ kind: 'marketTrade', player: P1, sell: 'stone', buy: 'gold', amount: 100 });
      }

      // ---- 7. the attack, then explicit mop-up of the last villagers
      const maa = alive('manAtArms', P1);
      const archers = alive('archer', P1);
      if (!attacking && maaDone && forgingDone && maa.length >= 10 && archers.length >= 3) {
        attacking = true;
        mark('attack');
        cmds.push({ kind: 'attack', player: P1, units: militaryIds(), targetId: etcId });
      }
      if (attacking && (st.entities.get(etcId)?.hp ?? 0) <= 0) {
        const left = enemyVills.filter((id) => (st.entities.get(id)?.hp ?? 0) > 0);
        if (left.length > 0 && left[0] !== lastMopTarget) {
          lastMopTarget = left[0];
          cmds.push({ kind: 'attack', player: P1, units: militaryIds(), targetId: left[0] });
        }
      }

      // ---- 8. villager economy management
      const committed: Record<Role, number> = { food: 0, wood: 0, gold: 0 };
      const nodeUse = new Map<EntityId, Entity[]>();
      for (const v of vills) {
        if (v.intent?.kind !== 'gather') continue;
        const r = roleOfTarget(v.intent.targetId);
        if (r) {
          committed[r]++;
          const arr = nodeUse.get(v.intent.targetId);
          if (arr) arr.push(v);
          else nodeUse.set(v.intent.targetId, [v]);
        }
      }
      const n = vills.length;
      const goldBanked = stock.gold >= 500; // everything the war costs is covered
      const targets: Record<Role, number> = {
        wood: Math.max(2, Math.min(6, Math.floor(n * 0.35))),
        gold: goldBanked ? 0 : n >= 14 ? 3 : n >= 9 ? 2 : 0,
        food: 0,
      };
      targets.food = Math.max(0, n - targets.wood - targets.gold);
      const slots = (node: Entity): number => (node.defId === 'goldMine' ? 3 : 1);
      const pickNode = (role: Role, v: Entity): EntityId | null => {
        let bestId: EntityId | null = null;
        let best = Infinity;
        for (const e of st.entities.values()) {
          if (role === 'wood' && e.defId !== 'tree') continue;
          if (role === 'gold' && e.defId !== 'goldMine') continue;
          if (role === 'food') {
            if (e.defId === 'farm') {
              if (e.player !== P1 || (e.buildProgress ?? 0) < 1000) continue;
            } else if (e.defId !== 'berryBush') continue;
          }
          if ((e.amountLeft ?? 0) <= 0 || e.stump) continue;
          if ((nodeUse.get(e.id)?.length ?? 0) >= slots(e)) continue;
          const d = cheb(v, e.tileX, e.tileY);
          if (d < best) { best = d; bestId = e.id; }
        }
        return bestId;
      };
      const sendTo = (v: Entity, node: EntityId): void => {
        cmds.push({ kind: 'gather', player: P1, units: [v.id], targetId: node });
        const arr = nodeUse.get(node);
        if (arr) arr.push(v);
        else nodeUse.set(node, [v]);
      };

      // 8a. periodic de-share: trees/bushes/farms are 1-slot — sim queues extras politely,
      // so a shared node silently idles a villager; spread them onto free nodes instead
      if (st.tick % 50 === 0) {
        for (const [nodeId, group] of nodeUse) {
          const node = st.entities.get(nodeId);
          if (!node || group.length <= slots(node)) continue;
          let keep = group.findIndex((v) => v.activity === 'gathering');
          if (keep < 0) keep = 0;
          for (let i = 0; i < group.length; i++) {
            if (i === keep || group[i].activity === 'carrying') continue;
            const role = roleOfTarget(nodeId);
            const alt = role ? pickNode(role, group[i]) : null;
            if (alt !== null && alt !== nodeId) sendTo(group[i], alt);
          }
        }
        // gold is done: walk the miners over to wood/food for the rest of the game
        if (goldBanked) {
          for (const v of vills) {
            if (v.intent?.kind !== 'gather' || v.activity === 'carrying') continue;
            if (st.entities.get(v.intent.targetId)?.defId !== 'goldMine') continue;
            const alt = pickNode('wood', v) ?? pickNode('food', v);
            if (alt !== null) sendTo(v, alt);
          }
        }
      }

      // 8b. idle villagers → deficit role first, then any open node (wood soaks overflow)
      for (const v of vills) {
        if (v.intent !== undefined || v.activity !== 'idle' || v.garrisonedIn !== undefined) continue;
        let node: EntityId | null = null;
        for (const role of ['food', 'wood', 'gold'] as Role[]) {
          if (committed[role] >= targets[role]) continue;
          node = pickNode(role, v);
          if (node !== null) { committed[role]++; break; }
        }
        node ??= pickNode('wood', v) ?? pickNode('food', v) ?? (goldBanked ? null : pickNode('gold', v));
        if (node !== null) sendTo(v, node);
      }

      return cmds;
    };

    // ---- main loop
    let feudalTick = -1;
    let victoryTick = -1;
    game.advance([{ kind: 'queueReseed', player: P1, enabled: true }]); // farms auto-replant
    for (let t = 0; t < TICK_CAP && !st.finished; t++) {
      const evs = game.advance(controller());
      for (const ev of evs) {
        switch (ev.kind) {
          case 'resourceDropped':
            if (ev.player === P1) dropped[ev.type] += ev.amount;
            break;
          case 'unitTrained':
            if (ev.player !== P1) break;
            if (ev.defId === 'villager') villagersTrained++;
            else if (ev.defId === 'militia') militiaTrained++;
            else if (ev.defId === 'archer') archersTrained++;
            break;
          case 'buildingPlaced':
            if (ev.player === P1) {
              const i = BUILD_PLAN.findIndex((o, idx) => !placed.has(idx) && o.defId === ev.defId);
              if (i >= 0) placed.add(i);
            }
            break;
          case 'buildingComplete':
            if (ev.player === P1) {
              completed[ev.defId] = (completed[ev.defId] ?? 0) + 1;
              mark(`b:${ev.defId}`);
            }
            break;
          case 'ageAdvanced':
            if (ev.player === P1) { agesReached.push(ev.age); feudalTick = st.tick; }
            break;
          case 'researchComplete':
            if (ev.player !== P1) break;
            mark(`r:${ev.techId}`);
            if (ev.techId === 'manAtArmsUpgrade') maaDone = true;
            if (ev.techId === 'forging') forgingDone = true;
            break;
          case 'marketTraded':
            if (ev.player === P1) marketEv = ev;
            break;
          case 'entityDied':
            if (ev.id === etcId) tcDeath = ev;
            if (ev.killer === P1) killsByP1++;
            break;
          case 'playerDefeated':
            if (ev.player === P2) sawDefeatP2 = true;
            break;
          case 'victory':
            victoryEv = ev;
            victoryTick = st.tick;
            break;
        }
      }
      maxVills = Math.max(maxVills, alive('villager', P1).length);
      let farmers = 0;
      for (const e of st.entities.values()) {
        if (e.player !== P1 || e.defId !== 'villager' || e.hp <= 0) continue;
        if (e.intent?.kind === 'gather' && st.entities.get(e.intent.targetId)?.defId === 'farm'
          && e.activity === 'gathering') farmers++;
      }
      maxFarmers = Math.max(maxFarmers, farmers);
    }

    // eslint-disable-next-line no-console
    console.log(`macro loop: feudal @ tick ${feudalTick}, victory @ tick ${victoryTick}, `
      + `drops f${dropped.food}/w${dropped.wood}/g${dropped.gold}, kills by P1: ${killsByP1}, `
      + `milestones ${JSON.stringify(milestones)}`);

    // ---- boom: 14 trained villagers → 20 alive, on all three gathered resources + farms
    expect(villagersTrained).toBe(14);
    expect(maxVills).toBe(20);
    expect(dropped.food).toBeGreaterThanOrEqual(1700); // villagers + feudal + army food all gathered
    expect(dropped.wood).toBeGreaterThanOrEqual(1300); // the whole town is timber-funded
    expect(dropped.gold).toBeGreaterThanOrEqual(180); // militia + upgrade + archer gold mined
    expect(maxFarmers).toBeGreaterThanOrEqual(3); // farms genuinely worked, not just built

    // ---- economy fully built
    expect(completed.house).toBe(7);
    expect(completed.lumberCamp).toBe(1);
    expect(completed.mill).toBe(1);
    expect(completed.miningCamp).toBe(1);
    expect(completed.farm).toBe(4);
    expect(completed.barracks).toBe(1);
    expect(completed.blacksmith).toBe(1);
    expect(completed.archeryRange).toBe(1);
    expect(completed.market).toBe(1);

    // ---- age + tech line
    expect(agesReached).toEqual(['feudal']);
    expect(st.players[P1].age).toBe('feudal');
    expect(st.players[P1].researchedTechs).toContain('feudalAge');
    expect(st.players[P1].researchedTechs).toContain('manAtArmsUpgrade');
    expect(st.players[P1].researchedTechs).toContain('forging');
    expect(militiaTrained).toBe(10);
    expect(archersTrained).toBe(3);

    // ---- market: one stone lot at the untouched global rate (130 × 0.7 = 91 gold)
    expect(marketEv).toMatchObject({
      player: P1, resource: 'stone', direction: 'sell', amount: 100, gold: 91, rate: 128,
    });

    // ---- combat: the enemy TC fell with kill credit, every enemy villager died
    expect(tcDeath).not.toBeNull();
    expect(tcDeath!.killer).toBe(P1);
    for (const id of enemyVills) expect(st.entities.get(id)?.hp ?? 0).toBeLessThanOrEqual(0);
    expect(killsByP1).toBeGreaterThanOrEqual(4); // TC + 3 villagers at minimum

    // ---- endgame: conquest defeat → victory, inside the tick budget
    expect(sawDefeatP2).toBe(true);
    expect(victoryEv).toEqual({ kind: 'victory', winners: [P1] });
    expect(st.finished).toBe(true);
    expect(st.players[P2].defeated).toBe(true);
    expect(victoryTick).toBeGreaterThan(0);
    expect(victoryTick).toBeLessThanOrEqual(TICK_CAP);
  }, 20000);
});
