// Bot opponents (GDD Practice: skirmish vs bots, Easy / Standard / Hard).
// createBot(game, playerId, difficulty) -> { tick(): Command[] }.
//
// The bot reads sim state through the same surface a renderer would (game.state,
// game.canPlace) and issues ordinary Commands — the sim cannot tell it from a
// human (ARCHITECTURE: command pattern). Per the v1 AI spec it uses full state
// (fog honesty is a roadmap item) but throttled decision rates per difficulty.
//
// Determinism: decisions are a pure function of sim state + internal counters
// that evolve deterministically. No Math.random, no wall clock — iteration
// relies on the sim's insertion-stable entity map, so a replayed command log
// (match snapshots) and headless test runs reproduce exactly.

import { gameData } from '@bf/data';
import { AGES, FP, GAIA } from '@bf/sim/types';
import type { AgeId, Command, Entity, EntityId, Game, PlayerId } from '@bf/sim/types';

export type BotDifficulty = 'easy' | 'standard' | 'hard';

export interface Bot {
  readonly player: PlayerId;
  readonly difficulty: BotDifficulty;
  /** Call once per sim tick (before/after advance both work); usually returns []. */
  tick(): Command[];
}

interface Profile {
  /** Ticks between decision batches — the APM throttle. */
  interval: number;
  villagerTarget: number;
  /** Military size that launches an attack wave / ends one when it collapses. */
  attackArmy: number;
  regroupArmy: number;
  maxAge: AgeId;
  research: boolean;
  farmTarget: number;
  /** Max commands per decision batch (keeps the bot's hands human). */
  batchCap: number;
}

const PROFILES: Record<BotDifficulty, Profile> = {
  easy: { interval: 60, villagerTarget: 12, attackArmy: 8, regroupArmy: 3, maxAge: 'feudal', research: false, farmTarget: 4, batchCap: 4 },
  standard: { interval: 30, villagerTarget: 20, attackArmy: 10, regroupArmy: 4, maxAge: 'castle', research: true, farmTarget: 6, batchCap: 8 },
  // hard tops out at Castle: the v1 bot has no Castle-age building script, so
  // saving for Imperial would deadlock its army economy behind the piggy bank
  hard: { interval: 14, villagerTarget: 26, attackArmy: 16, regroupArmy: 6, maxAge: 'castle', research: true, farmTarget: 8, batchCap: 12 },
};

const cheb = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Early sheep-sweep waypoints: a widening square of corners around the base. */
const SCOUT_RING = [8, 8, 8, 8, 14, 14, 14, 14, 20, 20, 20, 20];

/** Idle military farther than this from base are strays and get re-ordered. */
const STRAGGLER_LEASH = 12;

/** Gatherers-per-node etiquette (mirrors the sim: 1 per tree, more per node). */
function nodeSlots(defId: string): number {
  if (defId === 'tree' || defId === 'farm' || defId === 'sheep') return 1;
  if (defId === 'goldMine' || defId === 'stoneMine') return 3;
  return 2; // berry bushes
}

type Role = 'food' | 'wood' | 'gold';

function isFoodAnimalDef(defId: string): boolean {
  const d = gameData.units[defId];
  return !!(d?.herdable || d?.huntable);
}

export function createBot(game: Game, player: PlayerId, difficulty: BotDifficulty): Bot {
  const profile = PROFILES[difficulty];
  const st = game.state;

  // ---- internal (deterministically evolving) memory
  let waveActive = false;
  let waveTarget: EntityId = -1;
  let waveOrderedAt = -1;
  let defendTarget: EntityId = -1;
  let scoutLeg = 0; // sheep-sweep waypoint index
  let peakVillagers = 0; // wolf losses must not reset the age-up plan
  /** Foundation build-progress watch: stuck sites (unreachable pockets) get deleted. */
  const foundationWatch = new Map<EntityId, { progress: number; since: number }>();
  const FOUNDATION_STALL_TICKS = 1200; // 60 s without progress = written off (full refund)
  /** Sites that already stalled once — never place there again. */
  const deadSpots = new Set<string>();
  /** Villagers never gather beyond this radius of the base (enemy TC fire kills). */
  const GATHER_LEASH = 30;

  const nextAgeTech = (age: AgeId): string | null => {
    const i = AGES.indexOf(age);
    return i === 0 ? 'feudalAge' : i === 1 ? 'castleAge' : i === 2 ? 'imperialAge' : null;
  };

  /**
   * A builder must be able to STAND next to the site: require a few walkable
   * tiles in the ring around the footprint, else a farm dropped into an
   * enclosed pocket between other farms can never be raised.
   */
  const accessible = (defId: string, x: number, y: number): boolean => {
    const size = gameData.buildings[defId]?.size ?? 1;
    let open = 0;
    for (let dy = -1; dy <= size; dy++) {
      for (let dx = -1; dx <= size; dx++) {
        const onRing = dx === -1 || dy === -1 || dx === size || dy === size;
        if (!onRing) continue;
        if (game.isWalkable(x + dx, y + dy)) open++;
        if (open >= 3) return true;
      }
    }
    return false;
  };

  /** First valid, reachable top-left placement tile in a deterministic ring scan. */
  const findSpot = (defId: string, cx: number, cy: number, maxR = 14): { x: number; y: number } | null => {
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring edge only
          const x = cx + dx;
          const y = cy + dy;
          if (deadSpots.has(`${defId}:${x}:${y}`)) continue;
          if (game.canPlace(player, defId, x, y) && accessible(defId, x, y)) return { x, y };
        }
      }
    }
    return null;
  };

  const decide = (): Command[] => {
    const cmds: Command[] = [];
    const p = st.players[player];
    if (!p || p.defeated) return cmds;
    const stock = p.stockpile;
    const profileAgeIdx = AGES.indexOf(profile.maxAge);
    // farms replant automatically (GDD mill auto-reseed) — issued once
    if (p.autoReseed !== true) cmds.push({ kind: 'queueReseed', player, enabled: true });

    // ---- one pass over the world
    const villagers: Entity[] = [];
    const military: Entity[] = [];
    let scout: Entity | null = null;
    const own: Record<string, Entity[]> = {};
    const foundations: Entity[] = [];
    const enemyUnits: Entity[] = [];
    const enemyBuildings: Entity[] = [];
    const foodNodes: Entity[] = [];
    const woodNodes: Entity[] = [];
    const goldNodes: Entity[] = [];
    for (const e of st.entities.values()) {
      if (e.kind === 'resource') {
        // resource nodes have no meaningful hp — classify purely by contents
        if (e.player !== GAIA || (e.amountLeft ?? 0) <= 0 || e.stump) continue;
        if (e.defId === 'tree') woodNodes.push(e);
        else if (e.defId === 'goldMine') goldNodes.push(e);
        else if (e.defId === 'berryBush') foodNodes.push(e);
        continue;
      }
      if (e.hp <= 0 && !(e.kind === 'unit' && (e.amountLeft ?? 0) > 0)) continue;
      if (e.player === player) {
        if (e.kind === 'unit') {
          if (e.garrisonedIn !== undefined) continue;
          if (e.defId === 'villager') villagers.push(e);
          else if (e.defId === 'scout' && scout === null) scout = e;
          else if (!isFoodAnimalDef(e.defId)) military.push(e);
          if (e.hp > 0 && isFoodAnimalDef(e.defId)) foodNodes.push(e); // captured sheep = food
          if (e.hp <= 0 && (e.amountLeft ?? 0) > 0) foodNodes.push(e); // carcass
        } else if (e.kind === 'building') {
          if ((e.buildProgress ?? 1000) < 1000) foundations.push(e);
          else {
            (own[e.defId] ??= []).push(e);
            if (e.defId === 'farm' && (e.amountLeft ?? 0) > 0) foodNodes.push(e);
          }
        }
      } else if (e.player === GAIA) {
        if (e.kind === 'unit' && gameData.units[e.defId]?.herdable) {
          // stray sheep: hunting one also walks a villager into capture range
          if (e.hp > 0 || (e.amountLeft ?? 0) > 0) foodNodes.push(e);
        }
      } else {
        // rival players (full-state v1 bot; fog honesty is a roadmap item)
        if (e.kind === 'unit' && e.hp > 0 && e.garrisonedIn === undefined && !isFoodAnimalDef(e.defId)) enemyUnits.push(e);
        else if (e.kind === 'building' && e.hp > 0) enemyBuildings.push(e);
      }
    }
    if (scout !== null) military.push(scout);

    const tc = own.townCenter?.[0] ?? null;
    const anchor = tc ?? foundations[0] ?? Object.values(own)[0]?.[0] ?? villagers[0] ?? military[0];
    if (!anchor) return cmds;
    const baseX = anchor.tileX;
    const baseY = anchor.tileY;

    const nearest = (list: Entity[], x: number, y: number): Entity | null => {
      let best: Entity | null = null;
      let bd = Infinity;
      for (const e of list) {
        const d = cheb(e.tileX, e.tileY, x, y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };

    // ---- age plan
    peakVillagers = Math.max(peakVillagers, villagers.length);
    const ageTechId = nextAgeTech(p.age);
    const wantAgeUp = ageTechId !== null && AGES.indexOf(p.age) < profileAgeIdx
      && peakVillagers >= profile.villagerTarget;
    const ageQueued = ageTechId !== null && (tc?.trainQueue?.some((i) => i.techId === ageTechId) ?? false);
    const savingForAge = wantAgeUp && !ageQueued;
    const ageCost = ageTechId ? gameData.techs[ageTechId]?.cost ?? {} : {};
    // While saving for ANY age the piggy bank reserves the full age cost — army
    // production only spends the surplus above it. (Flat 300/100 floors sat far
    // below the 800f Castle cost, so barracks/range drained every surplus and
    // the bot never left Feudal.) The dark-age rush keeps extra headroom on top
    // so villagers and farms continue through the feudal climb.
    const rushing = savingForAge && p.age === 'dark';
    const foodFloor = savingForAge ? (ageCost.food ?? 0) + (rushing ? 100 : 0) : 100;
    const goldFloor = savingForAge ? (ageCost.gold ?? 0) + (rushing ? 50 : 0) : 0;

    // ---- build orders (one foundation attempt per batch, priority-ordered)
    const canPay = (defId: string): boolean => {
      const c = gameData.buildings[defId]?.cost ?? {};
      return stock.food >= (c.food ?? 0) && stock.wood >= (c.wood ?? 0)
        && stock.gold >= (c.gold ?? 0) && stock.stone >= (c.stone ?? 0);
    };
    const has = (defId: string): boolean => (own[defId]?.length ?? 0) > 0
      || foundations.some((f) => f.defId === defId);
    const feudal = AGES.indexOf(p.age) >= 1;
    const nearestWood = nearest(woodNodes, baseX, baseY);
    const nearestGold = nearest(goldNodes, baseX, baseY);
    const berries = nearest(foodNodes.filter((e) => e.defId === 'berryBush'), baseX, baseY);
    const millAnchor = own.mill?.[0] ?? tc;
    // once popProvided exceeds popCap the match cap is binding — more houses waste wood
    let providedSum = 0;
    for (const [defId, list] of Object.entries(own)) {
      providedSum += (gameData.buildings[defId]?.popProvided ?? 0) * list.length;
    }
    const farmCount = (own.farm?.length ?? 0) + foundations.filter((f) => f.defId === 'farm').length;
    // Priority list semantics: the FIRST unmet need claims the piggy bank — if it
    // is not yet affordable NOTHING lower spends (else farms eat the barracks
    // wood forever). needed() ignores cost; cost gates only the chosen need.
    const needs: Array<{ defId: string; nx: number; ny: number; needed: boolean }> = [
      { defId: 'house', nx: baseX, ny: baseY, needed: p.popCap - p.pop <= 3 && providedSum <= p.popCap },
      { defId: 'lumberCamp', nx: nearestWood?.tileX ?? baseX, ny: nearestWood?.tileY ?? baseY, needed: !has('lumberCamp') && nearestWood !== null },
      { defId: 'mill', nx: berries?.tileX ?? baseX, ny: berries?.tileY ?? baseY, needed: !has('mill') && berries !== null },
      { defId: 'miningCamp', nx: nearestGold?.tileX ?? baseX, ny: nearestGold?.tileY ?? baseY, needed: !has('miningCamp') && villagers.length >= 8 && nearestGold !== null },
      { defId: 'barracks', nx: baseX + 4, ny: baseY, needed: !has('barracks') && villagers.length >= 9 },
      { defId: 'archeryRange', nx: baseX + 4, ny: baseY + 4, needed: feudal && !has('archeryRange') },
      { defId: 'blacksmith', nx: baseX - 4, ny: baseY + 4, needed: feudal && profile.research && !has('blacksmith') },
      {
        defId: 'farm', nx: millAnchor?.tileX ?? baseX, ny: millAnchor?.tileY ?? baseY,
        // farm count scales with the food workforce, else late-game food starves
        needed: own.mill !== undefined && villagers.length >= 10 && millAnchor !== null
          && farmCount < Math.max(profile.farmTarget, Math.ceil(villagers.length * 0.6)),
      },
    ];
    const firstNeed = needs.find((o) => o.needed);
    const buildOrder = firstNeed && canPay(firstNeed.defId) ? firstNeed : null;
    // resume abandoned foundations before starting new ones
    const orphan = foundations.find((f) =>
      !villagers.some((v) => (v.intent?.kind === 'build' || v.intent?.kind === 'repair') && v.intent.targetId === f.id
        || (v.activity === 'building' && cheb(v.tileX, v.tileY, f.tileX, f.tileY) <= (gameData.buildings[f.defId]?.size ?? 1) + 1)));
    const freeVill = (x: number, y: number): Entity | null => {
      let best: Entity | null = null;
      let bd = Infinity;
      for (const v of villagers) {
        if (v.intent?.kind === 'build' || v.activity === 'building') continue;
        const d = cheb(v.tileX, v.tileY, x, y);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    };
    // write off foundations that made zero progress for a minute (unreachable
    // site, dead builder path) — deleteEntity refunds the unbuilt cost and
    // tickConstruction releases any villager still pointed at it
    for (const f of foundations) {
      const w = foundationWatch.get(f.id);
      if (!w || w.progress !== (f.buildProgress ?? 0)) {
        foundationWatch.set(f.id, { progress: f.buildProgress ?? 0, since: st.tick });
      } else if (st.tick - w.since >= FOUNDATION_STALL_TICKS) {
        cmds.push({ kind: 'deleteEntity', player, entityId: f.id });
        foundationWatch.delete(f.id);
        deadSpots.add(`${f.defId}:${f.tileX}:${f.tileY}`); // don't try that pocket again
      }
    }
    for (const id of foundationWatch.keys()) {
      if (!st.entities.has(id)) foundationWatch.delete(id);
    }
    if (orphan) {
      const v = freeVill(orphan.tileX, orphan.tileY);
      if (v) cmds.push({ kind: 'repair', player, units: [v.id], targetId: orphan.id });
    } else if (buildOrder && foundations.length < 2) {
      const spot = findSpot(buildOrder.defId, buildOrder.nx, buildOrder.ny);
      const v = spot ? freeVill(spot.x, spot.y) : null;
      if (spot && v) {
        cmds.push({ kind: 'build', player, units: [v.id], defId: buildOrder.defId, tileX: spot.x, tileY: spot.y });
      }
    }

    // ---- town center: villagers, then the age-up
    if (tc && (tc.trainQueue?.length ?? 0) === 0) {
      if (villagers.length < profile.villagerTarget && stock.food >= 50 && p.pop < p.popCap) {
        cmds.push({ kind: 'train', player, buildingId: tc.id, defId: 'villager' });
      } else if (savingForAge && ageTechId
        && stock.food >= (ageCost.food ?? 0) && stock.gold >= (ageCost.gold ?? 0)) {
        cmds.push({ kind: 'research', player, buildingId: tc.id, techId: ageTechId });
      }
    }

    // ---- army production (respect the age-up piggy bank)
    const rax = own.barracks?.[0];
    if (rax && (rax.trainQueue?.length ?? 0) === 0
      && stock.food >= foodFloor + 60 && stock.gold >= goldFloor + 20 && p.pop < p.popCap) {
      cmds.push({ kind: 'train', player, buildingId: rax.id, defId: 'militia' });
    }
    const range = own.archeryRange?.[0];
    if (range && (range.trainQueue?.length ?? 0) === 0
      && stock.wood >= 100 && stock.gold >= goldFloor + 45 && p.pop < p.popCap) {
      cmds.push({ kind: 'train', player, buildingId: range.id, defId: 'archer' });
    }

    // ---- blacksmith techs (cheapest-first order as listed in data)
    const smith = own.blacksmith?.[0];
    if (profile.research && smith && (smith.trainQueue?.length ?? 0) === 0 && !savingForAge) {
      const researchable = (gameData.buildings.blacksmith?.researches ?? [])
        .map((tid) => gameData.techs[tid])
        .find((t) => t !== undefined
          && AGES.indexOf(t.age) <= AGES.indexOf(p.age)
          && !p.researchedTechs.includes(t.id)
          && (t.requiresTech === undefined || p.researchedTechs.includes(t.requiresTech))
          && stock.food >= (t.cost.food ?? 0) + 100 && stock.wood >= (t.cost.wood ?? 0)
          && stock.gold >= (t.cost.gold ?? 0) + 50 && stock.stone >= (t.cost.stone ?? 0));
      if (researchable) cmds.push({ kind: 'research', player, buildingId: smith.id, techId: researchable.id });
    }

    // ---- military: defend the base, then attack waves
    let armyOrdered = false; // a full-army order this pass supersedes the straggler sweep
    const intruder = tc ? nearest(enemyUnits.filter((e) => cheb(e.tileX, e.tileY, baseX, baseY) <= 18), baseX, baseY) : null;
    if (intruder && military.length > 0) {
      if (defendTarget !== intruder.id) {
        defendTarget = intruder.id;
        cmds.push({ kind: 'attack', player, units: military.map((e) => e.id), targetId: intruder.id });
        armyOrdered = true;
      }
    } else {
      defendTarget = -1;
      // all clear: let wolf-bitten villagers back out of the TC (flee.ts
      // garrisons them; nobody else ungarrisons a bot's town center)
      for (const list of Object.values(own)) {
        for (const b of list) {
          if ((b.garrison?.length ?? 0) > 0) cmds.push({ kind: 'ungarrison', player, buildingId: b.id });
        }
      }
      if (!waveActive && military.length >= profile.attackArmy) waveActive = true;
      if (waveActive && military.length < profile.regroupArmy) {
        waveActive = false;
        waveTarget = -1;
        if (military.length > 0) {
          cmds.push({ kind: 'move', player, units: military.map((e) => e.id), x: anchor.x, y: anchor.y });
          armyOrdered = true;
        }
      }
      if (waveActive) {
        const live = st.entities.get(waveTarget);
        const targetDead = !live || live.hp <= 0;
        // re-issue every ~30 s: freshly trained units must join the push, and
        // a cleared area needs the next objective
        if (targetDead || st.tick - waveOrderedAt >= 600) {
          // units first: mopping villagers/military is cheap and starves the
          // enemy; big-hp buildings (their TC shoots back) come last
          const target = (targetDead ? null : live)
            ?? nearest(enemyUnits, baseX, baseY) ?? nearest(enemyBuildings, baseX, baseY);
          if (target) {
            waveTarget = target.id;
            waveOrderedAt = st.tick;
            const vanguard = nearest(military, target.tileX, target.tileY);
            const closeIn = vanguard !== null && cheb(vanguard.tileX, vanguard.tileY, target.tileX, target.tileY) <= 10;
            // FAR: attack-move — ONE group path search + auto-engage on arrival.
            // Per-unit `attack` chases across the map thrash the sim's shared
            // path budget (every unit re-floods its own search) and stall.
            cmds.push(closeIn
              ? { kind: 'attack', player, units: military.map((e) => e.id), targetId: target.id }
              : { kind: 'attackMove', player, units: military.map((e) => e.id), x: target.x, y: target.y });
            armyOrdered = true;
          } else {
            waveActive = false; // nothing left to kill
          }
        }
      }
    }

    // ---- straggler sweep: an attack-move only auto-engages what it meets, so a
    // wave member whose order completed away from base (target died mid-walk, a
    // defend order yanked and released it, or nothing entered its LOS at the
    // stale rally point) would otherwise idle outside the enemy town until the
    // next 30 s wave re-issue — or forever while the wave/defend branches are
    // busy. Re-point idle strays at the live objective, or recall them home.
    if (!armyOrdered) {
      const objective = waveActive ? st.entities.get(waveTarget) : undefined;
      const liveObjective = objective !== undefined && objective.hp > 0 ? objective : null;
      const strays = military.filter((e) => e.activity === 'idle'
        && cheb(e.tileX, e.tileY, baseX, baseY) > STRAGGLER_LEASH
        // the scout's own sheep-sweep block (below) orders it while legs remain
        && !(scout !== null && e.id === scout.id && !waveActive && scoutLeg < SCOUT_RING.length));
      if (strays.length > 0) {
        cmds.push(liveObjective
          ? { kind: 'attackMove', player, units: strays.map((e) => e.id), x: liveObjective.x, y: liveObjective.y }
          : { kind: 'move', player, units: strays.map((e) => e.id), x: anchor.x, y: anchor.y });
      }
    }

    // ---- scout: early sheep sweep in a widening square around the base
    if (scout !== null && scout.activity === 'idle' && !waveActive) {
      if (scoutLeg < SCOUT_RING.length) {
        const r = SCOUT_RING[scoutLeg];
        const corner = scoutLeg % 4;
        const dx = corner === 0 || corner === 3 ? -r : r;
        const dy = corner < 2 ? -r : r;
        scoutLeg++;
        const x = Math.max(1, Math.min(st.map.width - 2, baseX + dx));
        const y = Math.max(1, Math.min(st.map.height - 2, baseY + dy));
        cmds.push({ kind: 'move', player, units: [scout.id], x: x * FP, y: y * FP });
      }
    }

    // ---- villager economy: role targets, then idle hands to nodes
    const n = villagers.length;
    // war chest sized to the age: dark-age gold only funds militia (20 g each);
    // feudal+ pays for the next age, blacksmith techs, and archers
    const goldBanked = stock.gold >= (p.age === 'dark' ? 350 : 800);
    const targets: Record<Role, number> = {
      wood: Math.max(2, Math.min(8, Math.floor(n * 0.35))),
      gold: goldBanked ? 0 : p.age === 'dark' ? (n >= 14 ? 2 : 0) : n >= 20 ? 4 : 3,
      food: 0,
    };
    targets.food = Math.max(0, n - targets.wood - targets.gold);
    const committed: Record<Role, number> = { food: 0, wood: 0, gold: 0 };
    const nodeUse = new Map<EntityId, number>();
    const roleOf = (id: EntityId): Role | null => {
      const t = st.entities.get(id);
      if (!t) return null;
      if (t.defId === 'tree') return 'wood';
      if (t.defId === 'goldMine') return 'gold';
      if (t.defId === 'berryBush' || t.defId === 'farm' || isFoodAnimalDef(t.defId)) return 'food';
      return null;
    };
    // a gather intent only counts while its target still has something to give —
    // depleted-node stragglers keep a stale intent but idle, and must be re-tasked
    const gatherTargetLive = (id: EntityId): boolean => {
      const t = st.entities.get(id);
      if (!t) return false;
      if (t.kind === 'resource') return (t.amountLeft ?? 0) > 0 && !t.stump;
      if (t.kind === 'building') return (t.amountLeft ?? 0) > 0;
      return t.hp > 0 || (t.amountLeft ?? 0) > 0; // live prey or carcass
    };
    for (const v of villagers) {
      if (v.intent?.kind !== 'gather' || !gatherTargetLive(v.intent.targetId)) continue;
      const r = roleOf(v.intent.targetId);
      if (r) {
        committed[r]++;
        nodeUse.set(v.intent.targetId, (nodeUse.get(v.intent.targetId) ?? 0) + 1);
      }
    }
    const pickNode = (role: Role, v: Entity): Entity | null => {
      const list = role === 'wood' ? woodNodes : role === 'gold' ? goldNodes : foodNodes;
      let best: Entity | null = null;
      let bd = Infinity;
      for (const e of list) {
        if ((nodeUse.get(e.id) ?? 0) >= nodeSlots(e.defId)) continue;
        // leash: a gaia sheep grazing under the enemy TC is bait, not food
        if (cheb(e.tileX, e.tileY, baseX, baseY) > GATHER_LEASH) continue;
        const d = cheb(v.tileX, v.tileY, e.tileX, e.tileY);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };
    const assign = (v: Entity): void => {
      let node: Entity | null = null;
      for (const role of ['food', 'wood', 'gold'] as Role[]) {
        if (committed[role] >= targets[role]) continue;
        node = pickNode(role, v);
        if (node) { committed[role]++; break; }
      }
      node ??= pickNode('food', v) ?? pickNode('wood', v) ?? (goldBanked ? null : pickNode('gold', v));
      if (node) {
        nodeUse.set(node.id, (nodeUse.get(node.id) ?? 0) + 1);
        cmds.push({ kind: 'gather', player, units: [v.id], targetId: node.id });
      }
    };
    for (const v of villagers) {
      if (v.intent?.kind === 'build' || v.intent?.kind === 'repair') continue;
      if (v.activity === 'idle') {
        // idle hands get work — including surplus gatherers politely queued on a
        // full single-slot node (farm/tree), who would otherwise wait forever
        if (v.intent?.kind === 'gather' && gatherTargetLive(v.intent.targetId)) {
          const t = st.entities.get(v.intent.targetId)!;
          if ((nodeUse.get(t.id) ?? 0) <= nodeSlots(t.defId)) continue; // genuinely working soon
          nodeUse.set(t.id, (nodeUse.get(t.id) ?? 0) - 1); // leave the queue
          const r = roleOf(t.id);
          if (r) committed[r] = Math.max(0, committed[r] - 1);
        }
        assign(v);
      } else if (goldBanked && v.activity !== 'carrying'
        && v.intent?.kind === 'gather' && st.entities.get(v.intent.targetId)?.defId === 'goldMine') {
        // war chest is full: walk the miners over to food/wood
        committed.gold = Math.max(0, committed.gold - 1);
        assign(v);
      }
    }

    return cmds.slice(0, profile.batchCap);
  };

  return {
    player,
    difficulty,
    tick(): Command[] {
      if (st.finished) return [];
      if (st.tick % profile.interval !== 0) return [];
      return decide();
    },
  };
}
