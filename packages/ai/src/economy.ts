// Economy manager: villager allocation by age + strategy, the data-driven build
// order (houses ahead of pop, camps NEAR the resources they serve, mill at berries,
// farms as natural food depletes, defender walls/towers, hard 2nd TC), age-ups when
// eco targets are met, eco/blacksmith techs by priority, and hard-mode market use.

import { gameData } from '@bf/data';
import { AGES } from '@bf/sim/types';
import type { Command, Entity, EntityId } from '@bf/sim/types';
import type { AgePlan, Ctx, Snapshot } from './snapshot';
import { cheb, isFoodAnimalDef, nearestEntity } from './snapshot';

/** Villagers never gather beyond this radius of the base (enemy TC fire kills). */
const GATHER_LEASH = 30;
/** Foundation build-progress watch: 60 s without progress = written off (full refund). */
const FOUNDATION_STALL_TICKS = 1200;

type Role = 'food' | 'wood' | 'gold' | 'stone';
const ROLES: readonly Role[] = ['food', 'wood', 'gold', 'stone'];

/** Gatherers-per-node etiquette (mirrors the sim: 1 per tree, more per mine). */
function nodeSlots(defId: string): number {
  if (defId === 'tree' || defId === 'farm' || defId === 'sheep') return 1;
  if (defId === 'goldMine' || defId === 'stoneMine') return 3;
  return 2; // berry bushes
}

/** Eco research priorities (cheap and high-impact first). Age/prereq gates apply. */
const ECO_TECHS: ReadonlyArray<{ id: string; at: string }> = [
  { id: 'loom', at: 'townCenter' },
  { id: 'doubleBitAxe', at: 'lumberCamp' },
  { id: 'horseCollar', at: 'mill' },
  { id: 'goldMining', at: 'miningCamp' },
  { id: 'stoneMining', at: 'miningCamp' },
  { id: 'wheelbarrow', at: 'townCenter' },
  { id: 'bowSaw', at: 'lumberCamp' },
  { id: 'heavyPlow', at: 'mill' },
  { id: 'goldShaftMining', at: 'miningCamp' },
  { id: 'handCart', at: 'townCenter' },
];

export interface EconomyManager {
  decide(snap: Snapshot, plan: AgePlan, cmds: Command[]): void;
}

export function createEconomy(ctx: Ctx): EconomyManager {
  const { game, player } = ctx;
  const st = game.state;

  /** Foundation build-progress watch: stuck sites (unreachable pockets) get deleted. */
  const foundationWatch = new Map<EntityId, { progress: number; since: number }>();
  /** Sites that already stalled once — never place there again. */
  const deadSpots = new Set<string>();

  /**
   * A builder must be able to STAND next to the site: require a few walkable tiles
   * in the ring around the footprint, else a farm dropped into an enclosed pocket
   * between other farms can never be raised.
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

  /**
   * NEVER WALL YOURSELF IN: reject a placement that would seal a currently-reachable
   * walkable pocket shut. Observed live: barracks + archery range + TC + one late farm
   * enclosed the army staging strip — every freshly trained soldier spawned INTO the
   * sealed pocket, all attack orders rerouted one tile, and a 37-unit army idled at
   * home for 30+ minutes while the game deadlocked.
   * Check: every walkable tile ringing the footprint that can currently reach the
   * edge of a local window must still reach it once the footprint is blocked.
   */
  const SEAL_WINDOW = 9;
  const wouldSealPocket = (defId: string, bx: number, by: number): boolean => {
    const size = gameData.buildings[defId]?.size ?? 1;
    const x0 = bx - SEAL_WINDOW;
    const y0 = by - SEAL_WINDOW;
    const w = size + SEAL_WINDOW * 2;
    const h = size + SEAL_WINDOW * 2;
    const inFoot = (x: number, y: number): boolean =>
      x >= bx && x < bx + size && y >= by && y < by + size;
    // reachable-from-window-edge flood (4-dir matches the sim's no-corner-cut pathing)
    const flood = (blockFoot: boolean): Uint8Array => {
      const seen = new Uint8Array(w * h);
      const queue: number[] = [];
      const push = (x: number, y: number): void => {
        const i = (y - y0) * w + (x - x0);
        if (seen[i]) return;
        if (blockFoot && inFoot(x, y)) return;
        if (!game.isWalkable(x, y)) return;
        seen[i] = 1;
        queue.push(i);
      };
      for (let x = x0; x < x0 + w; x++) { push(x, y0); push(x, y0 + h - 1); }
      for (let y = y0; y < y0 + h; y++) { push(x0, y); push(x0 + w - 1, y); }
      for (let qi = 0; qi < queue.length; qi++) {
        const i = queue[qi];
        const x = x0 + (i % w);
        const y = y0 + Math.floor(i / w);
        if (x > x0) push(x - 1, y);
        if (x < x0 + w - 1) push(x + 1, y);
        if (y > y0) push(x, y - 1);
        if (y < y0 + h - 1) push(x, y + 1);
      }
      return seen;
    };
    const pre = flood(false);
    const post = flood(true);
    // ring = tiles bordering the footprint (the accessible() ring)
    for (let dy = -1; dy <= size; dy++) {
      for (let dx = -1; dx <= size; dx++) {
        if (dx !== -1 && dy !== -1 && dx !== size && dy !== size) continue;
        const x = bx + dx;
        const y = by + dy;
        const i = (y - y0) * w + (x - x0);
        if (pre[i] === 1 && post[i] === 0) return true; // a pocket just got sealed
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
          if (game.canPlace(player, defId, x, y) && accessible(defId, x, y)
            && !wouldSealPocket(defId, x, y)) return { x, y };
        }
      }
    }
    return null;
  };

  interface Need {
    defId: string;
    nx: number;
    ny: number;
    needed: boolean;
    /** Walls: nx/ny is the exact tile (already validated) — no ring scan. */
    exact?: boolean;
  }

  /** Threat direction: unit step from base toward the enemy (or map center). */
  const threatDir = (snap: Snapshot): { dx: number; dy: number } => {
    const eb = snap.enemyBuildings[0];
    const tx = eb ? eb.tileX : Math.floor(st.map.width / 2);
    const ty = eb ? eb.tileY : Math.floor(st.map.height / 2);
    return { dx: Math.sign(tx - snap.baseX), dy: Math.sign(ty - snap.baseY) };
  };

  /** First placeable wall tile on a short line across the threat-facing side. */
  const wallTile = (snap: Snapshot): { x: number; y: number } | null => {
    const { dx, dy } = threatDir(snap);
    if (dx === 0 && dy === 0) return null;
    // perpendicular axis of the (diagonal-capable) threat direction
    const px = dy !== 0 ? 1 : 0;
    const py = dx !== 0 ? 1 : 0;
    const cx = snap.baseX + dx * 9;
    const cy = snap.baseY + dy * 9;
    for (let i = -3; i <= 3; i++) {
      const x = cx + px * i;
      const y = cy + py * i;
      if (game.canPlace(player, 'stoneWall', x, y) && accessible('stoneWall', x, y)) return { x, y };
    }
    return null;
  };

  const buildNeeds = (snap: Snapshot, plan: AgePlan): Need[] => {
    const t = ctx.tuning;
    const { p, own, foundations, villagers, baseX, baseY } = snap;
    const feudal = AGES.indexOf(p.age) >= 1;
    const castle = AGES.indexOf(p.age) >= 2;
    const has = (defId: string): boolean => (own[defId]?.length ?? 0) > 0
      || foundations.some((f) => f.defId === defId);
    // Camp/mill sites must sit inside the gather leash: the snapshot sees EVERY node
    // on the map, and an unleashed "nearest" berry patch could be the ENEMY's — the
    // mill went up under their TC, each builder walked across the map into arrow
    // fire, and the "mill" need blocked farm wood forever while villagers bled out.
    const leashed = (e: Entity | null): Entity | null =>
      e !== null && cheb(e.tileX, e.tileY, baseX, baseY) <= GATHER_LEASH ? e : null;
    const nearestWood = leashed(nearestEntity(snap.woodNodes, baseX, baseY));
    const nearestGold = leashed(nearestEntity(snap.goldNodes, baseX, baseY));
    const berries = leashed(nearestEntity(snap.foodNodes.filter((e) => e.defId === 'berryBush'), baseX, baseY));
    const millAnchor = own.mill?.[0] ?? own.townCenter?.[0] ?? null;
    const farmCount = (own.farm?.length ?? 0) + foundations.filter((f) => f.defId === 'farm').length;
    const towerCount = (own.watchTower?.length ?? 0) + (own.guardTower?.length ?? 0)
      + (own.keep?.length ?? 0) + foundations.filter((f) => gameData.buildings[f.defId]?.classes.includes('wallOrTower') && f.defId !== 'stoneWall').length;
    const wallCount = (own.stoneWall?.length ?? 0) + foundations.filter((f) => f.defId === 'stoneWall').length;
    const dir = threatDir(snap);
    // 2nd TC (hard, castle): claim a far resource pocket — gold first, wood second
    const expandAt = snap.goldNodes.filter((e) => cheb(e.tileX, e.tileY, baseX, baseY) >= 8)[0]
      ?? snap.woodNodes.filter((e) => cheb(e.tileX, e.tileY, baseX, baseY) >= 10)[0] ?? null;
    const wall = t.walls && feudal && wallCount < 6 && snap.stock.stone >= 40 ? wallTile(snap) : null;

    const house: Need = { defId: 'house', nx: baseX, ny: baseY, needed: p.popCap - p.pop <= (t.interval >= 60 ? 3 : 5) && snap.providedSum <= p.popCap };
    const lumberCamp: Need = { defId: 'lumberCamp', nx: nearestWood?.tileX ?? baseX, ny: nearestWood?.tileY ?? baseY, needed: !has('lumberCamp') && nearestWood !== null };
    // The mill is the FARM PREREQUISITE (sim canPlace enforces it): with no berry
    // patch inside the leash it still must go up — next to the TC — once the eco is
    // real, or farms are impossible and food income dies with the last sheep.
    const mill: Need = {
      defId: 'mill', nx: berries?.tileX ?? baseX, ny: berries?.tileY ?? baseY,
      needed: !has('mill') && (berries !== null || villagers.length >= 8),
    };
    const miningCamp: Need = { defId: 'miningCamp', nx: nearestGold?.tileX ?? baseX, ny: nearestGold?.tileY ?? baseY, needed: !has('miningCamp') && villagers.length >= 8 && nearestGold !== null };
    const barracks: Need = { defId: 'barracks', nx: baseX + 4, ny: baseY, needed: !has('barracks') && villagers.length >= t.barracksAt };
    // Priority list semantics: the FIRST unmet need claims the resources it is short
    // of — nothing lower spends from THOSE stockpiles (else farms eat the barracks
    // wood forever), but needs paying from other resources proceed.
    // needed() ignores cost; cost gates only the chosen need (see doBuildOrders).
    // Raider opening: the barracks outranks mill/mining camp — militia flow beats eco.
    return [
      house, lumberCamp,
      ...(t.raidEco ? [barracks, mill, miningCamp] : [mill, miningCamp, barracks]),
      // towers early: mostly stone (which nothing else early wants), and they blunt
      // feudal raids so the age-up bank can actually fill. One for standard —
      // two turtles the map into a stalemate; defender/hard get the pair.
      {
        defId: 'watchTower', nx: baseX + dir.dx * 7, ny: baseY + dir.dy * 7,
        needed: t.towers && feudal && towerCount < (t.counterattackOnly || t.counters >= 2 ? 2 : 1),
      },
      { defId: 'archeryRange', nx: baseX + 4, ny: baseY + 4, needed: feudal && !has('archeryRange') },
      { defId: 'blacksmith', nx: baseX - 4, ny: baseY + 4, needed: feudal && t.research && !has('blacksmith') },
      { defId: 'stable', nx: baseX - 4, ny: baseY - 4, needed: feudal && t.counters >= 1 && has('archeryRange') && !has('stable') },
      ...(wall !== null ? [{ defId: 'stoneWall', nx: wall.x, ny: wall.y, needed: true, exact: true }] : []),
      { defId: 'market', nx: baseX - 6, ny: baseY, needed: t.market && feudal && !has('market') && villagers.length >= 16 },
      {
        defId: 'townCenter', nx: expandAt?.tileX ?? baseX, ny: expandAt?.tileY ?? baseY,
        needed: t.secondTc && castle && (own.townCenter?.length ?? 0) === 1
          && !foundations.some((f) => f.defId === 'townCenter') && expandAt !== null && villagers.length >= 20,
      },
      { defId: 'siegeWorkshop', nx: baseX + 6, ny: baseY + 6, needed: t.siege && castle && has('blacksmith') && !has('siegeWorkshop') },
      { defId: 'monastery', nx: baseX - 6, ny: baseY + 6, needed: t.monks && castle && !has('monastery') },
      // Standard+ opponents express their civilization identity in real matches:
      // bank stone for a Castle, then the military manager fields the civ-only unit.
      { defId: 'castle', nx: baseX - 8, ny: baseY - 6, needed: t.research && castle && !has('castle') && villagers.length >= 20 },
      // castle-age wood surplus becomes production capacity: a second barracks and
      // range double the reinforcement stream behind the big pushes
      { defId: 'barracks', nx: baseX + 6, ny: baseY - 4, needed: castle && t.counters >= 1 && (own.barracks?.length ?? 0) === 1 && snap.stock.wood >= 400 },
      { defId: 'archeryRange', nx: baseX + 8, ny: baseY + 2, needed: castle && t.counters >= 1 && (own.archeryRange?.length ?? 0) === 1 && snap.stock.wood >= 400 },
      {
        defId: 'farm', nx: millAnchor?.tileX ?? baseX, ny: millAnchor?.tileY ?? baseY,
        // farm count scales with the food workforce, else late-game food starves
        needed: own.mill !== undefined && villagers.length >= 10
          && farmCount < Math.max(t.farmTarget, Math.ceil(villagers.length * 0.6)),
      },
    ];
  };

  const doBuildOrders = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    const { stock, villagers, foundations } = snap;
    const canPay = (defId: string): boolean => {
      const c = gameData.buildings[defId]?.cost ?? {};
      return stock.food >= (c.food ?? 0) && stock.wood >= (c.wood ?? 0)
        && stock.gold >= (c.gold ?? 0) && stock.stone >= (c.stone ?? 0);
    };
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

    // write off foundations that made zero progress for a minute (unreachable site,
    // dead builder path) — deleteEntity refunds the unbuilt cost
    for (const f of foundations) {
      const w = foundationWatch.get(f.id);
      if (!w || w.progress !== (f.buildProgress ?? 0)) {
        foundationWatch.set(f.id, { progress: f.buildProgress ?? 0, since: snap.tick });
      } else if (snap.tick - w.since >= FOUNDATION_STALL_TICKS) {
        cmds.push({ kind: 'deleteEntity', player, entityId: f.id });
        foundationWatch.delete(f.id);
        deadSpots.add(`${f.defId}:${f.tileX}:${f.tileY}`); // don't try that pocket again
      }
    }
    for (const id of foundationWatch.keys()) {
      if (!st.entities.has(id)) foundationWatch.delete(id);
    }

    // resume abandoned foundations before starting new ones
    const orphan = foundations.find((f) =>
      !villagers.some((v) => (v.intent?.kind === 'build' || v.intent?.kind === 'repair') && v.intent.targetId === f.id
        || (v.activity === 'building' && cheb(v.tileX, v.tileY, f.tileX, f.tileY) <= (gameData.buildings[f.defId]?.size ?? 1) + 1)));
    if (orphan) {
      const v = freeVill(orphan.tileX, orphan.tileY);
      if (v) cmds.push({ kind: 'repair', player, units: [v.id], targetId: orphan.id });
      return;
    }
    if (foundations.length >= ctx.tuning.maxFoundations) return;
    // Priority claim, PER RESOURCE: an unaffordable higher need claims only the
    // resources it is still SHORT of, so lower needs paying from other stockpiles
    // proceed. (The old whole-bank claim let a stone-starved watchtower freeze the
    // wood-only farm line for 10+ minutes while one miner trickled stone.)
    const RES = ['food', 'wood', 'gold', 'stone'] as const;
    const blocked: Record<(typeof RES)[number], boolean> = { food: false, wood: false, gold: false, stone: false };
    let firstNeed: Need | null = null;
    for (const need of buildNeeds(snap, plan)) {
      if (!need.needed) continue;
      const cost = gameData.buildings[need.defId]?.cost ?? {};
      if (RES.some((r) => (cost[r] ?? 0) > 0 && blocked[r])) continue;
      if (canPay(need.defId)) { firstNeed = need; break; }
      for (const r of RES) if ((cost[r] ?? 0) > stock[r]) blocked[r] = true;
    }
    if (!firstNeed) return;
    // Farms search the whole gather leash: they are the food LIFELINE, and a base
    // wedged into a forest pocket can have no 3x3 clearing within the default ring
    // — observed pinning a bot at zero food income (Dark Age forever) with 4000
    // wood banked. Villagers happily work fields up to GATHER_LEASH out.
    const spot = firstNeed.exact === true
      ? { x: firstNeed.nx, y: firstNeed.ny }
      : findSpot(firstNeed.defId, firstNeed.nx, firstNeed.ny,
        firstNeed.defId === 'farm' ? GATHER_LEASH - 4 : 14);
    const v = spot ? freeVill(spot.x, spot.y) : null;
    if (spot && v) {
      cmds.push({ kind: 'build', player, units: [v.id], defId: firstNeed.defId, tileX: spot.x, tileY: spot.y });
    }
  };

  const doTownCenters = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    const { p, stock } = snap;
    const t = ctx.tuning;
    // sheltering villagers are alive — training past the target while they hide
    // in the TC just floods the town (and starves the age-up)
    const villagerCount = snap.villagers.length + snap.garrisonedVillagers;
    // the boom target scales with age (e.g. hard 18 dark / 24 feudal / 28 castle):
    // training the FULL boom during the dark-age bank drains 50f per villager into
    // the piggy bank's face and made hard the slowest player on the map to Feudal
    const ageIdx = AGES.indexOf(p.age);
    const villagerTarget = ageIdx === 0
      ? Math.min(t.villagerTarget, t.ageUpVillagers + 2)
      : ageIdx === 1
        ? Math.min(t.villagerTarget, t.feudalVillagerTarget)
        : t.villagerTarget;
    for (const tc of snap.own.townCenter ?? []) {
      if ((tc.trainQueue?.length ?? 0) !== 0) continue;
      // the age-up preempts the villager queue the MOMENT it is affordable: with the
      // trigger decoupled from the boom target (ageUpVillagers < villagerTarget) the
      // old villagers-first branch would keep the TC busy and never queue the age
      if (plan.savingForAge && plan.ageTechId !== null
        && stock.food >= (plan.ageCost.food ?? 0) && stock.gold >= (plan.ageCost.gold ?? 0)) {
        cmds.push({ kind: 'research', player, buildingId: tc.id, techId: plan.ageTechId });
        return; // one age-up; other TCs keep making villagers next pass
      }
      if (villagerCount < villagerTarget && stock.food >= 50 && p.pop < p.popCap) {
        cmds.push({ kind: 'train', player, buildingId: tc.id, defId: 'villager' });
      }
    }
  };

  const canSpare = (snap: Snapshot, plan: AgePlan, cost: Partial<Record<'food' | 'wood' | 'gold' | 'stone', number>>): boolean => {
    const s = snap.stock;
    return s.food >= plan.foodFloor + (cost.food ?? 0) + 100
      && s.wood >= (cost.wood ?? 0) + 50
      && s.gold >= plan.goldFloor + (cost.gold ?? 0) + 25
      && s.stone >= (cost.stone ?? 0);
  };

  const doTechs = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    if (!ctx.tuning.research) return;
    const { p } = snap;
    const ageIdx = AGES.indexOf(p.age);
    // one eco tech per pass, priority-ordered
    for (const et of ECO_TECHS) {
      if (et.id === 'stoneMining' && ctx.tuning.stoneMiners === 0) continue;
      const tech = gameData.techs[et.id];
      if (!tech || p.researchedTechs.includes(et.id)) continue;
      if (AGES.indexOf(tech.age) > ageIdx) continue;
      if (tech.requiresTech !== undefined && !p.researchedTechs.includes(tech.requiresTech)) continue;
      const b = (snap.own[et.at] ?? []).find((e) => (e.trainQueue?.length ?? 0) === 0);
      if (!b) continue;
      if (!canSpare(snap, plan, tech.cost)) break; // priority order claims the surplus
      cmds.push({ kind: 'research', player, buildingId: b.id, techId: tech.id });
      break;
    }
    // blacksmith techs, cheapest-first as listed in data
    const smith = (snap.own.blacksmith ?? []).find((e) => (e.trainQueue?.length ?? 0) === 0);
    if (smith && !plan.savingForAge) {
      const researchable = (gameData.buildings.blacksmith?.researches ?? [])
        .map((tid) => gameData.techs[tid])
        .find((t) => t !== undefined
          && AGES.indexOf(t.age) <= ageIdx
          && !p.researchedTechs.includes(t.id)
          && (t.requiresTech === undefined || p.researchedTechs.includes(t.requiresTech))
          && canSpare(snap, plan, t.cost));
      if (researchable) cmds.push({ kind: 'research', player, buildingId: smith.id, techId: researchable.id });
    }
  };

  /** Hard-mode market: dump deep surplus to cover the current bottleneck. */
  const doMarket = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    if (!ctx.tuning.market || (snap.own.market?.length ?? 0) === 0) return;
    const s = snap.stock;
    if (s.gold < plan.goldFloor + 60 && s.wood >= 500) {
      cmds.push({ kind: 'marketTrade', player, sell: 'wood', buy: 'gold', amount: 100 });
    } else if (s.gold < plan.goldFloor + 60 && s.stone >= 400) {
      cmds.push({ kind: 'marketTrade', player, sell: 'stone', buy: 'gold', amount: 100 });
    } else if (plan.savingForAge && s.food < (plan.ageCost.food ?? 0)
      && s.gold >= (plan.ageCost.gold ?? 0) + 250) {
      cmds.push({ kind: 'marketTrade', player, sell: 'gold', buy: 'food', amount: 100 });
    }
  };

  const doVillagers = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    const { p, stock, villagers, baseX, baseY } = snap;
    const t = ctx.tuning;
    const n = villagers.length;
    const ageIdx = AGES.indexOf(p.age);
    // war chest sized to the age: dark-age gold only funds militia (20 g each);
    // feudal+ pays for the next age, techs, and gold-heavy units
    const goldBanked = stock.gold >= (ageIdx === 0 ? 350 : 800);
    const needsCastle = ageIdx >= 2 && t.research
      && (snap.own.castle?.length ?? 0) === 0
      && !snap.foundations.some((f) => f.defId === 'castle');
    const stoneBanked = stock.stone >= (needsCastle ? 700 : 400);
    const wantStone = ageIdx >= 1 && !stoneBanked && snap.stoneNodes.length > 0 ? t.stoneMiners : 0;
    const targets: Record<Role, number> = {
      // while banking a feudal+/castle age-up — and only once the farm estate is
      // BUILT (thinning wood before that starves farm construction and kills the
      // food income the bank needs) — the wood line thins and crews move to food:
      // the 800f Castle bank at ~1.5f/s net was a 9-minute wait while a thousand
      // wood floated in the stockpile
      wood: ageIdx === 0
        ? Math.max(2, Math.min(8, Math.floor(n * 0.3)))
        : plan.savingForAge && (snap.own.farm?.length ?? 0) >= ctx.tuning.farmTarget
          ? Math.max(3, Math.min(6, Math.floor(n * 0.2)))
          : Math.max(3, Math.min(12, Math.floor(n * 0.35))),
      // dark-age gold only funds militia (20 g each): a profile that trains no dark
      // militia (hard's tempo edge) keeps those hands on the Feudal bank instead
      gold: goldBanked ? 0
        : ageIdx === 0 ? ((t.darkMilitia > 0 || t.raidEco) && n >= (t.raidEco ? 8 : 12) ? 2 : 0)
          : ageIdx === 1 ? (n >= 20 ? 4 : 3)
            : (n >= 24 ? 5 : 4),
      stone: wantStone,
      food: 0,
    };
    targets.food = Math.max(0, n - targets.wood - targets.gold - targets.stone);

    const committed: Record<Role, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    const nodeUse = new Map<EntityId, number>();
    const roleOf = (id: EntityId): Role | null => {
      const target = st.entities.get(id);
      if (!target) return null;
      if (target.defId === 'tree') return 'wood';
      if (target.defId === 'goldMine') return 'gold';
      if (target.defId === 'stoneMine') return 'stone';
      if (target.defId === 'berryBush' || target.defId === 'farm' || isFoodAnimalDef(target.defId)) return 'food';
      return null;
    };
    // a gather intent only counts while its target still has something to give —
    // depleted-node stragglers keep a stale intent but idle, and must be re-tasked
    const gatherTargetLive = (id: EntityId): boolean => {
      const target = st.entities.get(id);
      if (!target) return false;
      if (target.kind === 'resource') return (target.amountLeft ?? 0) > 0 && !target.stump;
      if (target.kind === 'building') return (target.amountLeft ?? 0) > 0;
      return target.hp > 0 || (target.amountLeft ?? 0) > 0; // live prey or carcass
    };
    for (const v of villagers) {
      if (v.intent?.kind !== 'gather' || !gatherTargetLive(v.intent.targetId)) continue;
      const r = roleOf(v.intent.targetId);
      if (r) {
        committed[r]++;
        nodeUse.set(v.intent.targetId, (nodeUse.get(v.intent.targetId) ?? 0) + 1);
      }
    }
    const listFor = (role: Role): Entity[] => role === 'wood' ? snap.woodNodes
      : role === 'gold' ? snap.goldNodes
        : role === 'stone' ? snap.stoneNodes : snap.foodNodes;
    const pickNode = (role: Role, v: Entity): Entity | null => {
      let best: Entity | null = null;
      let bd = Infinity;
      for (const e of listFor(role)) {
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
      for (const role of ROLES) {
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
          const target = st.entities.get(v.intent.targetId)!;
          if ((nodeUse.get(target.id) ?? 0) <= nodeSlots(target.defId)) continue; // genuinely working soon
          nodeUse.set(target.id, (nodeUse.get(target.id) ?? 0) - 1); // leave the queue
          const r = roleOf(target.id);
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
  };

  return {
    decide(snap: Snapshot, plan: AgePlan, cmds: Command[]): void {
      // farms replant automatically (GDD mill auto-reseed) — issued once
      if (snap.p.autoReseed !== true) cmds.push({ kind: 'queueReseed', player, enabled: true });
      doTownCenters(snap, plan, cmds);
      doBuildOrders(snap, plan, cmds);
      doTechs(snap, plan, cmds);
      doMarket(snap, plan, cmds);
      doVillagers(snap, plan, cmds);
    },
  };
}
