// Military manager: counter compositions built from SCOUTED intel only (EnemyMemory),
// production across every military building, an army staging point, attack waves per
// profile (raider eco-hunts early, aggressive never lets up, defender counterattacks,
// passive holds), retreat when losing badly, siege vs buildings, hard-mode monks,
// villager garrisoning when overwhelmed, and the GDD easy-resigns-when-hopeless rule.

import { gameData } from '@bf/data';
import { AGES, FP } from '@bf/sim/types';
import type { Command, Entity, EntityId, Fixed, Tick } from '@bf/sim/types';
import type { Sighting } from './memory';
import type { AgePlan, Ctx, Snapshot } from './snapshot';
import { cheb, nearestSighting } from './snapshot';
import type { BotRect } from './types';

/** Idle military farther than this from the staging point are strays. */
const STRAGGLER_LEASH = 12;
/** Early sheep-sweep waypoints: a widening square of corners around the base. */
const SCOUT_RING = [8, 8, 8, 8, 14, 14, 14, 14, 20, 20, 20, 20];
/** Enemies within this radius of the base are intruders — defense engages. */
const DEFEND_RADIUS = 18;
/** Max ticks a fog-sweep leg may run before advancing to the next explore point
 *  (150 s ≈ a full map crossing; covers legs whose point is walled off). */
const SWEEP_LEG_TICKS = 3000;
/** Any wave unit within this of the destination = the wave is engaged, not stalled. */
const WAVE_STALL_NEAR = 8;
/** An objective that produced zero approach progress sits out this long (6 min —
 *  villagers felling trees can open a route that was sealed earlier). */
const TARGET_BLACKLIST_TICKS = 7200;

const MILITIA_LINE = ['militia', 'manAtArms', 'longswordsman', 'champion'] as const;
const SPEAR_LINE = ['spearman', 'pikeman'] as const;
const ARCHER_LINE = ['archer', 'crossbowman', 'arbalester'] as const;
const SKIRM_LINE = ['skirmisher', 'eliteSkirmisher'] as const;

/** Eco-raid priority: what a raider burns first. */
const RAID_BUILDINGS = ['mill', 'lumberCamp', 'miningCamp', 'farm', 'house', 'market'];

export interface MilitaryManager {
  onAlarm(x: Fixed, y: Fixed, tick: Tick): void;
  forceAttack(area?: BotRect): void;
  decide(snap: Snapshot, plan: AgePlan, cmds: Command[]): void;
}

/** A sighting that can actually fight back (villagers/monks scare nobody). */
function isCombatDef(defId: string): boolean {
  const def = gameData.units[defId];
  return def !== undefined && def.attacks.length > 0 && !def.classes.includes('villager');
}

/** Highest researched tier of a unit line the player can currently train. */
function lineTier(line: readonly string[], researched: string[], ageIdx: number): string | null {
  let cur: string | null = null;
  for (const id of line) {
    const def = gameData.units[id];
    if (!def || AGES.indexOf(def.age) > ageIdx) continue;
    if (def.requiresTech !== undefined && !researched.includes(def.requiresTech)) continue;
    cur = id;
  }
  return cur;
}

export function createMilitary(ctx: Ctx): MilitaryManager {
  const { player } = ctx;
  const st = ctx.game.state;

  let waveActive = false;
  let waveTarget: EntityId = -1;
  let waveDest: { x: Fixed; y: Fixed } | null = null;
  let waveOrderedAt = -1;
  let waveCooldownUntil = -1;
  /**
   * The first Hard raid is deliberately smaller than its later main waves.
   * A controller created over a serialized mid-match sim must not mistake the
   * next reinforcement wave for the opening raid after lifecycle resume.
   */
  let launchedAnyWave = st.tick > 0;
  /** Adaptive escalation: failed sieges raise the next wave's mass (eroded by the
   *  idle decay, so rams are never stranded behind an unreachable army count). */
  let armyNeedBoost = 0;
  /** Tick the last wave ended (game start counts): the launch threshold DECAYS from
   *  here so a bot whose army oscillates just below attackArmy still attacks — armies
   *  parked at the staging point until the 90-minute cap were the repo's top stall. */
  let waveEndedAt = 0;
  /** Cumulative military training orders — latches the skeleton-guard exemption. */
  let trainedTotal = 0;
  /** Tick the current wave target was locked — sieges that stall time out. */
  let waveTargetSince = -1;
  let defendTarget: EntityId = -1;
  let counterattackUntil = -1; // defender: attack window after repelling a raid
  let forced: { area: BotRect | null } | null = null;
  /** Scripted (attackNow) destination — persists until the units arrive, die, or a
   *  new pulse replaces it. NEVER handed to the free-play explore sweep (which used
   *  to scatter wallace-3 assault waves to the map corners). */
  let forcedDest: { x: Fixed; y: Fixed } | null = null;
  /** Wave approach progress: best (min) unit distance to the current destination.
   *  Two reissues in a row without improvement = the objective is unreachable. */
  let progressKey = '';
  let progressBest = Infinity;
  let progressStrikes = 0;
  /** Objectives that produced zero progress -> tick they become eligible again. */
  const blacklist = new Map<EntityId, Tick>();
  let lastStrayOrderAt = -1000000; // straggler sweep throttle (once per reissue window)
  let alarm: { x: Fixed; y: Fixed; tick: Tick } | null = null;
  let alarmHandled = -1;
  let scoutLeg = 0;
  let exploreIdx = 0;
  /** Tick the current fog-sweep leg started — legs advance on arrival or timeout. */
  let sweepLegStart = -1;
  /** Seed-dependent sweep rotation — bots with different seeds scout differently. */
  const scoutSpin = ctx.rng.nextInt(4);
  const ralliedTo = new Map<EntityId, string>();
  let resigned = false;
  let lastTrainAt = -100000; // trainCooldown throttle (easy)

  /** Where the army masses: toward the known enemy, a short sortie from home. */
  const stagePoint = (snap: Snapshot): { x: number; y: number } => {
    const eb = nearestSighting(snap.enemyBuildings, snap.baseX, snap.baseY);
    const tx = eb ? eb.tileX : Math.floor(st.map.width / 2);
    const ty = eb ? eb.tileY : Math.floor(st.map.height / 2);
    const d = Math.max(1, cheb(tx, ty, snap.baseX, snap.baseY));
    const step = Math.min(7, d);
    return {
      x: snap.baseX + Math.round(((tx - snap.baseX) * step) / d),
      y: snap.baseY + Math.round(((ty - snap.baseY) * step) / d),
    };
  };

  /** Fog-of-war sweep destinations when NOTHING has been scouted: the mirrored
   *  quadrant (likely enemy start) first, then the other mirrors and the center —
   *  then a full-map lawnmower lattice. The lattice matters for TERMINATION: a
   *  razed opponent's last fogged villagers must be FOUND, and cycling the same
   *  four mirror points let 3 hidden villagers drag a won game past the time cap. */
  const explorePoint = (snap: Snapshot, i: number): { x: number; y: number } => {
    const w = st.map.width;
    const h = st.map.height;
    const clampX = (x: number): number => Math.max(2, Math.min(w - 3, x));
    const clampY = (y: number): number => Math.max(2, Math.min(h - 3, y));
    const pts = [
      { x: clampX(w - snap.baseX), y: clampY(h - snap.baseY) },
      { x: clampX(w - snap.baseX), y: clampY(snap.baseY) },
      { x: clampX(snap.baseX), y: clampY(h - snap.baseY) },
      { x: clampX(Math.floor(w / 2)), y: clampY(Math.floor(h / 2)) },
    ];
    if (i < pts.length) return pts[i];
    // boustrophedon over a 12-tile lattice (x reversed on odd rows: shorter walks);
    // ceil so the final row/column hugs the map edge — the last hidden villagers
    // sit in exactly the corners a floor()-sized lattice never looks at
    const STEP = 12;
    const cols = Math.ceil((w - 5) / STEP) + 1;
    const rows = Math.ceil((h - 5) / STEP) + 1;
    const j = (i - pts.length) % (cols * rows);
    const row = Math.floor(j / cols);
    const col = row % 2 === 0 ? j % cols : cols - 1 - (j % cols);
    return { x: clampX(2 + col * STEP), y: clampY(2 + row * STEP) };
  };

  // ---------------------------------------------------------------- defense
  /** Set by doDefense each pass; production relaxes the age piggy bank under threat. */
  let threatNearBase = false;
  /** Intruder count near base this pass (bounds the defense production burst). */
  let intrudersNear = 0;

  /** Orders a proportional guard detachment against intruders. Returns the ids it
   *  claimed this pass (the wave manager leaves them alone), or null when clear. */
  const doDefense = (snap: Snapshot, cmds: Command[]): Set<EntityId> | null => {
    // VERY fresh sightings only (15 s): stale glimpses of dead/departed raiders must
    // not pin the economy in threat-mode long after the raid is over
    const near = snap.enemyUnits.filter((s) =>
      (s.visibleNow || snap.tick - s.tick <= 300)
      && cheb(s.tileX, s.tileY, snap.baseX, snap.baseY) <= DEFEND_RADIUS);
    const atTown = near.filter((s) => cheb(s.tileX, s.tileY, snap.baseX, snap.baseY) <= 10);
    threatNearBase = near.length > 0;
    intrudersNear = near.length;
    // overwhelmed AT the town center: shelter the workforce (GDD flee covers damaged
    // villagers; this pre-empts the massacre when the raid dwarfs the standing army)
    if (atTown.length >= snap.military.length * 2 + 3) {
      const tc = snap.own.townCenter?.[0];
      if (tc) {
        const shelter = snap.villagers
          .filter((v) => cheb(v.tileX, v.tileY, snap.baseX, snap.baseY) <= 12)
          .slice(0, Math.max(0, 15 - (tc.garrison?.length ?? 0)))
          .map((v) => v.id);
        if (shelter.length > 0) cmds.push({ kind: 'garrison', player, units: shelter, targetId: tc.id });
      }
    } else if (atTown.length === 0) {
      // the town itself is clear (even if raiders prowl the outskirts): dig the
      // villagers back out — a buried workforce starves the whole game plan, and
      // flee.ts re-garrisons them the moment they take damage again
      for (const list of Object.values(snap.own)) {
        for (const b of list) {
          if ((b.garrison?.length ?? 0) > 0) cmds.push({ kind: 'ungarrison', player, buildingId: b.id });
        }
      }
    }
    if (near.length > 0) {
      counterattackUntil = snap.tick + 2400; // defender: repel first, then punish
      // PROPORTIONAL home guard: enough to repel the raid, never the whole army —
      // an army sieging the enemy town must not be yanked across the map because
      // one raiding scout circled our base (the classic AI tell), and permanent
      // harassment must not freeze the offense forever.
      const guardCount = Math.min(snap.military.length, near.length * 2 + 1);
      const guards = snap.military
        .filter((e) => cheb(e.tileX, e.tileY, snap.baseX, snap.baseY) <= 30)
        .sort((a, b) => cheb(a.tileX, a.tileY, snap.baseX, snap.baseY)
          - cheb(b.tileX, b.tileY, snap.baseX, snap.baseY))
        .slice(0, guardCount);
      const guardIds = new Set(guards.map((e) => e.id));
      if (guards.length === 0) return guardIds;
      const intruder = nearestSighting(near, snap.baseX, snap.baseY)!;
      if (defendTarget !== intruder.id) {
        defendTarget = intruder.id;
        cmds.push(intruder.visibleNow
          ? { kind: 'attack', player, units: guards.map((e) => e.id), targetId: intruder.id }
          : { kind: 'attackMove', player, units: guards.map((e) => e.id), x: intruder.x, y: intruder.y });
      }
      return guardIds;
    }
    defendTarget = -1;
    // an underAttack alarm from beyond our sight (tower fire, fogged raid, a wolf at
    // the woodline): swing the army over with a plain move — military auto-acquires
    // hostiles in LOS on arrival, and passive stays true to "never issues attacks".
    // HOME alarms only: our own attackers taking fire at the ENEMY town also raise
    // underAttack, and answering those plain-marched the army into the arrow zone
    // and yanked scripted waves (wallace-3) off their objective every single pass.
    if (alarm !== null && snap.tick - alarm.tick <= 600 && alarm.tick > alarmHandled && snap.military.length > 0) {
      alarmHandled = alarm.tick;
      if (forced !== null || waveActive) return null; // the push handles its own fights
      const ax = Math.round(alarm.x / FP);
      const ay = Math.round(alarm.y / FP);
      if (cheb(ax, ay, snap.baseX, snap.baseY) > DEFEND_RADIUS + 6) return null;
      cmds.push({ kind: 'move', player, units: snap.military.map((e) => e.id), x: alarm.x, y: alarm.y });
      return new Set(snap.military.map((e) => e.id));
    }
    return null;
  };

  /** Two reissues without approach progress toward `dest` = unreachable. */
  const noteProgress = (military: Entity[], dest: { x: Fixed; y: Fixed }): boolean => {
    const dx = Math.round(dest.x / FP);
    const dy = Math.round(dest.y / FP);
    let min = Infinity;
    for (const e of military) {
      const d = cheb(e.tileX, e.tileY, dx, dy);
      if (d < min) min = d;
    }
    const key = `${dx}:${dy}`;
    if (key !== progressKey) {
      progressKey = key;
      progressBest = min;
      progressStrikes = 0;
      return false;
    }
    if (min <= WAVE_STALL_NEAR || min < progressBest) {
      progressBest = Math.min(progressBest, min);
      progressStrikes = 0;
      return false;
    }
    progressStrikes++;
    if (progressStrikes < 2) return false;
    progressStrikes = 0;
    progressBest = Infinity;
    progressKey = '';
    return true;
  };

  // ------------------------------------------------------------------ waves
  const pickWaveTarget = (snap: Snapshot): Sighting | null => {
    // unreachable objectives sit out their blacklist window (purged in doWaves)
    const ok = (s: Sighting): boolean => !blacklist.has(s.id);
    const enemyUnits = snap.enemyUnits.filter(ok);
    const enemyBuildings = snap.enemyBuildings.filter(ok);
    if (forced?.area) {
      const a = forced.area;
      const inArea = (s: Sighting): boolean =>
        s.tileX >= a.x && s.tileX < a.x + a.w && s.tileY >= a.y && s.tileY < a.y + a.h;
      const cx = a.x + Math.floor(a.w / 2);
      const cy = a.y + Math.floor(a.h / 2);
      return nearestSighting(enemyUnits.filter(inArea), cx, cy)
        ?? nearestSighting(enemyBuildings.filter(inArea), cx, cy);
    }
    if (ctx.tuning.raidEco) {
      // raider: villagers first (starves the enemy), then eco buildings, then the rest
      const vills = enemyUnits.filter((s) => s.defId === 'villager');
      const eco = enemyBuildings.filter((s) => RAID_BUILDINGS.includes(s.defId));
      return nearestSighting(vills, snap.baseX, snap.baseY)
        ?? nearestSighting(eco, snap.baseX, snap.baseY)
        ?? nearestSighting(enemyUnits, snap.baseX, snap.baseY)
        ?? nearestSighting(enemyBuildings, snap.baseX, snap.baseY);
    }
    // main push: raze the known enemy base — attack-move auto-engages the field army
    // and workers met on the way, and conquest ultimately requires the town dead.
    // (Chasing unit sightings as objectives kept armies orbiting villagers forever.)
    // With rams in the army: first flatten the static defense (towers shred the
    // escort but barely scratch a ram), then the TC — the elimination-relevant
    // building AND the thing killing our melee; rams shrug its arrows off.
    if (snap.rams.length > 0) {
      const tower = nearestSighting(enemyBuildings.filter((s) =>
        gameData.buildings[s.defId]?.classes.includes('wallOrTower') && s.defId !== 'stoneWall'), snap.baseX, snap.baseY);
      if (tower) return tower;
      const tc = nearestSighting(enemyBuildings.filter((s) => s.defId === 'townCenter'), snap.baseX, snap.baseY);
      if (tc) return tc;
    }
    // production buildings before houses/walls: conquest only cares about the
    // enemy's ability to rebuild (TC / villagers / production buildings)
    const production = enemyBuildings.filter((s) => {
      const def = gameData.buildings[s.defId];
      return s.defId === 'townCenter' || (def?.trains !== undefined && def.trains.length > 0);
    });
    return nearestSighting(production, snap.baseX, snap.baseY)
      ?? nearestSighting(enemyBuildings, snap.baseX, snap.baseY)
      ?? nearestSighting(enemyUnits.filter((s) => isCombatDef(s.defId)), snap.baseX, snap.baseY)
      ?? nearestSighting(enemyUnits, snap.baseX, snap.baseY);
  };

  const collapseWave = (snap: Snapshot, cmds: Command[], stage: { x: number; y: number }): void => {
    // the siege FAILED (its building target still stands): mass a bigger wave next
    // time — 12 + 2 rams bounce off a garrisoned TC forever, 20 + 4 rams do not
    if (waveTarget >= 0 && ctx.memory.get(waveTarget)?.kind === 'building') {
      armyNeedBoost = Math.min(ctx.tuning.attackArmy, armyNeedBoost + 4);
    }
    waveActive = false;
    waveTarget = -1;
    waveDest = null;
    waveEndedAt = snap.tick;
    forced = null;
    forcedDest = null;
    progressKey = '';
    progressBest = Infinity;
    progressStrikes = 0;
    // pause before re-massing only when the SEEN enemy army actually outguns us —
    // backing off from a town we outnumber just lets it heal (games must END).
    // Easy (counters 0) is not that clever: it always takes the full breather.
    // Live rams = closing mode: a sieging bot that takes a breather every collapse
    // gives the town minutes to heal per cycle — with rams in hand there is none.
    const enemyCombat = snap.enemyUnits.filter((s) => isCombatDef(s.defId)).length;
    const outgunned = enemyCombat > snap.military.length;
    const pressOn = ctx.tuning.constantPressure || snap.rams.length > 0
      || (ctx.tuning.counters >= 1 && !outgunned);
    waveCooldownUntil = snap.tick + (pressOn ? 0 : ctx.tuning.waveCooldown);
    if (snap.military.length > 0) {
      cmds.push({ kind: 'move', player, units: snap.military.map((e) => e.id), x: stage.x * FP, y: stage.y * FP });
    }
  };

  /** Returns true when a full-army order went out (supersedes the straggler sweep). */
  const doWaves = (snap: Snapshot, plan: AgePlan, cmds: Command[], stage: { x: number; y: number }, guardIds: Set<EntityId> | null): boolean => {
    const t = ctx.tuning;
    // the wave owns everything defense did not claim this pass — harassment at home
    // detaches a guard party but must never freeze the offense
    const military = guardIds === null
      ? snap.military
      : snap.military.filter((e) => !guardIds.has(e.id));
    // a SPENT pulse (every wave unit dead) releases the forced state, so a later
    // profile switch (e.g. passive -> defender) resumes normal free-play behavior
    if (forced !== null && snap.military.length === 0) {
      forced = null;
      forcedDest = null;
      waveActive = false;
    }
    // seen enemy FIELD army (fog-honest, combat units only — a town of villagers is
    // a target, not a threat): sizes the launch threshold and the retreat checks
    const enemyCombat = snap.enemyUnits.filter((s) => isCombatDef(s.defId)).length;
    // Waves launch at the profile threshold plus the adaptive siege escalation.
    // TIME DECAY: every 2 sim-minutes without a wave (past the cooldown) shaves one
    // off the threshold — one per minute with LIVE RAMS at home, because parked rams
    // are exactly the "won game that never ends" symptom — floored at regroupArmy.
    // A bot whose army hovers at attackArmy-1 must eventually go with what it has
    // instead of idling to the 90-minute cap (the bank-stall valve pattern).
    // SUSPENDED while saving for an age: a bot mid-climb that bleeds endless
    // minimum-size waves into the enemy's towers never banks its age-up — park,
    // bank, THEN press with the stronger army. The floor never undercuts
    // minArmyBeforeAgeUp: a raider that streams pairs out to die can never mass the
    // party its age-up plan latches on.
    // The siege-failure boost ALSO erodes by the decay (rather than a short hard
    // deadline): after a failed siege the bot masses toward a genuinely BIGGER
    // wave, and the requirement relaxes smoothly if production cannot keep up —
    // the old 3-minute deadline snapped straight back to dribble-size waves that
    // re-bounced off the same garrisoned town forever.
    const idleDecay = plan.savingForAge
      ? 0
      : Math.floor(Math.max(0, snap.tick - waveEndedAt - t.waveCooldown) / (snap.rams.length > 0 ? 1200 : 2400));
    const needFloor = Math.max(t.regroupArmy, t.minArmyBeforeAgeUp);
    // The siege-failure boost exists to out-mass a DEFENDED town. It is JUSTIFIED
    // only by the threat actually seen: when the enemy field army is small or gone,
    // waiting 10+ idle minutes for a doubled wave (that an 18-villager economy can
    // never even sustain) only delays the kill — attrition-stalemate fuel. Rams
    // waive it entirely: they grind a garrisoned TC no field escort could crack,
    // which is the exact failure the boost was compensating for.
    const baseArmyNeed = launchedAnyWave ? t.attackArmy : t.openingArmy;
    const justifiedBoost = snap.rams.length > 0
      ? 0
      : Math.min(armyNeedBoost, Math.max(0, enemyCombat * 2 - t.attackArmy));
    const armyNeed = Math.max(needFloor, baseArmyNeed + justifiedBoost - idleDecay);
    const mayLaunch = forced !== null || (!t.neverAttack
      && snap.tick >= waveCooldownUntil
      && (!t.counterattackOnly || snap.tick <= counterattackUntil)
      && military.length >= armyNeed);
    if (!waveActive && mayLaunch && military.length > 0) {
      waveActive = true;
      launchedAnyWave = true;
      waveTarget = -1;
      waveDest = null;
      waveOrderedAt = -1;
    }
    if (!waveActive) return false;

    // retreat: the wave collapsed, or the SEEN enemy army badly outnumbers ours
    // (TOTAL army counts here — a big home defense should recall the push too).
    // Scripted (forced) waves never turn back: a wallace-3 assault that recrossed
    // the bridge to "regroup" broke both the fiction and the battle.
    // "losing badly" counts only enemies that can fight — a town of villagers is a
    // target, not a threat (counting them once locked equal armies in a forever-stall)
    // …and a remnant WITH LIVE RAMS only walks home when something can actually
    // chase it off: recalling 3 arrow-proof rams from a defenseless town cost a
    // six-minute round trip per cycle and let won games time out at the 90-minute
    // cap. Ramless remnants still regroup — they only feed the TC's arrows.
    if (forced === null && snap.military.length < t.regroupArmy
      && (snap.rams.length === 0 || enemyCombat >= snap.military.length)) {
      collapseWave(snap, cmds, stage);
      return true;
    }
    if (military.length === 0) return false; // everyone is defending: pause the wave
    if (forced === null && enemyCombat >= snap.military.length * 2 && snap.military.length < t.attackArmy) {
      collapseWave(snap, cmds, stage);
      return true;
    }

    // expire served blacklist sentences (a felled treeline may have opened the way)
    for (const [id, until] of blacklist) {
      if (snap.tick >= until) blacklist.delete(id);
    }

    const remembered = waveTarget >= 0 ? ctx.memory.get(waveTarget) : undefined;
    if (waveTarget >= 0 && remembered === undefined) armyNeedBoost = 0; // target died — progress
    // SIEGE TIMEOUT: a building that has not fallen after 4 minutes is not falling
    // to this wave — trickle-feeding reinforcements into a garrisoned TC's arrows
    // is pure attrition. Pull back, re-mass bigger (the failure boost), try again.
    // Forced waves drop the target instead of retreating and press the next one.
    // With RAMS on the field the timeout is waived: rams grind slowly but surely,
    // and aborting their siege every 4 minutes is why won games never ENDED.
    if (remembered !== undefined && remembered.kind === 'building'
      && snap.rams.length === 0
      && snap.tick - waveTargetSince > 4800) {
      if (forced === null) {
        collapseWave(snap, cmds, stage);
        return true;
      }
      blacklist.set(waveTarget, snap.tick + TARGET_BLACKLIST_TICKS);
      waveTarget = -1;
    }
    // a fogged UNIT sighting goes stale (it moved) — chasing the ghost orbits forever;
    // buildings do not move, their sightings stay valid until destroyed
    let current = waveTarget >= 0 ? ctx.memory.get(waveTarget) : undefined;
    const targetGone = current === undefined
      || (current.kind === 'unit' && !current.visibleNow
        && snap.tick - current.tick > 1200);
    // re-issue every ~30 s: freshly trained units join the push, a cleared area gets
    // the next objective. A DEAD target re-picks immediately; a merely-stale one
    // waits for the normal cadence (else the picker thrashes the path budget).
    if (current !== undefined && snap.tick - waveOrderedAt < t.waveReissue) return false;

    // ZERO-PROGRESS DETECTION: nobody got closer to the destination across two full
    // reissue windows — the route is blocked/sealed. Blacklist the objective and pick
    // a different one instead of restarting the same doomed path search forever.
    if (waveDest !== null && waveOrderedAt >= 0
      && snap.tick - waveOrderedAt >= t.waveReissue && noteProgress(military, waveDest)) {
      if (waveTarget >= 0) blacklist.set(waveTarget, snap.tick + TARGET_BLACKLIST_TICKS);
      waveTarget = -1;
      waveDest = null;
      current = undefined;
    }

    const target = (targetGone || current === undefined ? null : current) ?? pickWaveTarget(snap);
    if (target) {
      if (waveTarget !== target.id) waveTargetSince = snap.tick;
      waveTarget = target.id;
      waveDest = { x: target.x, y: target.y };
      waveOrderedAt = snap.tick;
      // REINFORCE IN SQUADS: recruits massing at the staging point hold there until
      // ~regroupArmy of them exist, then join the push together. The old reissue
      // attack-moved every lone recruit solo across the map, where it died one-by-one
      // to the defense (live-watched: an idle player's single TC slew 31 trickled
      // arrivals). Units already afield keep pressing; scripted (forced) waves are
      // exempt — the bridge queue must keep feeding.
      const rear: Entity[] = [];
      const front: Entity[] = [];
      for (const e of military) {
        (cheb(e.tileX, e.tileY, stage.x, stage.y) <= STRAGGLER_LEASH ? rear : front).push(e);
      }
      const joining = forced !== null || front.length === 0 || rear.length >= t.regroupArmy
        ? military : front;
      const ids = joining.map((e) => e.id);
      const idSet = new Set(ids);
      // multi-front (hard): a big army splits across two known enemy buildings
      if (t.multiFront && joining.length >= t.attackArmy + 2 * t.regroupArmy) {
        const second = snap.enemyBuildings.find((s) =>
          s.id !== target.id && cheb(s.tileX, s.tileY, target.tileX, target.tileY) >= 15);
        if (second) {
          const a: EntityId[] = [];
          const b: EntityId[] = [];
          joining.forEach((e, i) => (i % 2 === 0 ? a : b).push(e.id));
          cmds.push({ kind: 'attackMove', player, units: a, x: target.x, y: target.y });
          cmds.push({ kind: 'attackMove', player, units: b, x: second.x, y: second.y });
          return true;
        }
      }
      const vanguard = joining.reduce<Entity | null>((best, e) => {
        if (best === null) return e;
        return cheb(e.tileX, e.tileY, target.tileX, target.tileY)
          < cheb(best.tileX, best.tileY, target.tileX, target.tileY) ? e : best;
      }, null);
      const closeIn = vanguard !== null
        && cheb(vanguard.tileX, vanguard.tileY, target.tileX, target.tileY) <= 10;
      // FAR: attack-move — ONE group path search + auto-engage on arrival. CLOSE and
      // visible: direct attack. Never attack-by-id something we cannot currently see.
      cmds.push(closeIn && target.visibleNow
        ? { kind: 'attack', player, units: ids, targetId: target.id }
        : { kind: 'attackMove', player, units: ids, x: target.x, y: target.y });
      // rams grind the nearest known building while the field army fights (only rams
      // already released into the push — one massing at home stays with its squad)
      if (snap.rams.length > 0 && target.kind !== 'building') {
        const wall = nearestSighting(snap.enemyBuildings, target.tileX, target.tileY);
        const out = snap.rams.filter((e) => idSet.has(e.id));
        if (wall && out.length > 0) cmds.push({ kind: 'attackMove', player, units: out.map((e) => e.id), x: wall.x, y: wall.y });
      }
      return true;
    }
    if (forcedDest !== null) {
      // scripted wave with nothing sighted: press toward the ordered area and HOLD
      // there — re-pathing on the wave cadence until every unit arrives or dies.
      // (Consuming the area once and falling into the explore sweep scattered
      // wallace-3 assault waves to the far map corners.)
      waveDest = forcedDest;
      if (waveOrderedAt < 0 || snap.tick - waveOrderedAt >= t.waveReissue) {
        waveOrderedAt = snap.tick;
        cmds.push({ kind: 'attackMove', player, units: military.map((e) => e.id), x: forcedDest.x, y: forcedDest.y });
        return true;
      }
      return false;
    }
    // Nothing scouted yet: sweep toward the mirrored start, then the other corners.
    // HOLD each sweep leg until the vanguard actually arrives (or the leg times out —
    // the point may sit in forest/water) before advancing to the next point.
    // Advancing exploreIdx every decision pass re-rolled the destination far faster
    // than the army could walk, so 50-unit armies milled around mid-map forever while
    // an unscouted turtling enemy was never found. Re-issue the CURRENT leg on the
    // normal wave cadence so freshly trained units join the sweep.
    if (waveDest !== null) {
      const dx = Math.round(waveDest.x / FP);
      const dy = Math.round(waveDest.y / FP);
      const arrived = military.some((e) => cheb(e.tileX, e.tileY, dx, dy) <= 6);
      if (!arrived && snap.tick - sweepLegStart <= SWEEP_LEG_TICKS) {
        if (snap.tick - waveOrderedAt >= t.waveReissue) {
          waveOrderedAt = snap.tick;
          cmds.push({ kind: 'attackMove', player, units: military.map((e) => e.id), x: waveDest.x, y: waveDest.y });
          return true;
        }
        return false;
      }
    }
    const pt = explorePoint(snap, exploreIdx);
    exploreIdx++;
    sweepLegStart = snap.tick;
    waveDest = { x: pt.x * FP, y: pt.y * FP };
    waveOrderedAt = snap.tick;
    cmds.push({ kind: 'attackMove', player, units: military.map((e) => e.id), x: waveDest.x, y: waveDest.y });
    return true;
  };

  // ------------------------------------------------------------- production
  const doProduction = (snap: Snapshot, plan: AgePlan, cmds: Command[]): void => {
    const t = ctx.tuning;
    const { p, stock } = snap;
    if (p.pop >= p.popCap) return;
    // easy fields a small, beatable, SLOWLY-replaced army (GDD difficulty ladder)
    if (snap.military.length >= t.armyCap) return;
    if (t.trainCooldown > 0 && snap.tick - lastTrainAt < t.trainCooldown) return;
    const ageIdx = AGES.indexOf(p.age);
    const researched = p.researchedTechs;

    // counter intel: composition of the SEEN enemy army (memory only — no cheating;
    // villagers/monks are excluded so worker sightings don't skew the ratios)
    let cav = 0;
    let arch = 0;
    let total = 0;
    for (const s of snap.enemyUnits) {
      if (!isCombatDef(s.defId)) continue;
      const classes = gameData.units[s.defId]?.classes ?? [];
      total++;
      if (classes.includes('cavalry')) cav++;
      if (classes.includes('archer')) arch++;
    }
    // PROPORTIONAL counters: train the counter line only while our stock of it is
    // under ~2x the seen threat, and only for a real commitment (5+) — four scout
    // sightings once locked hard into 51 spearmen and zero gold units all game
    const countOwn = (line: readonly string[]): number => {
      let n = 0;
      for (const e of snap.military) if (line.includes(e.defId)) n++;
      return n;
    };
    const dominant = 5;
    const wantSpears = t.counters >= 1 && ageIdx >= 1 && cav >= dominant && cav * 2 >= total
      && countOwn(SPEAR_LINE) < cav * 2;
    const wantSkirms = t.counters >= 1 && ageIdx >= 1 && arch >= dominant && arch * 2 >= total
      && countOwn(SKIRM_LINE) < arch * 2;

    // Defense trumps the age-up: while raiders press the base the piggy bank opens —
    // a bot that saves 800 food while its villagers die never gets to SPEND the 800.
    // BOUNDED: once the standing army can repel the raid (2× intruders + 2), resume
    // banking — permanent harassment must not lock the bot out of its age-ups.
    // A skeleton standing force (5) trains regardless of the bank: a bot with ZERO
    // military for 35 minutes is free food for anyone who scouts it. LATCHED on
    // total military ever ordered: re-evaluating the LIVE army count let a pressured
    // bot pour every food surplus into replacement militia forever (army pinned
    // under 5 by raids -> floor collapsed -> bank never filled -> Dark Age at 79
    // minutes). After 8 trainings the piggy bank takes priority again.
    // The THREAT arm needs the same discipline: unlike the skeleton latch it used to
    // re-fire every pass forever, so a permanently-pressured bot poured every coin
    // into replacement troops and never banked its age (observed: 78 minutes stuck
    // in Feudal training 142 military). plan.holdFloors is the bank's counter-latch:
    // once the bank has already failed twice, or both age resources are within 10%
    // of the target, the floors hold even under threat.
    const skeleton = snap.military.length < 5 && trainedTotal < 8;
    const guard = ((threatNearBase && snap.military.length < intrudersNear * 2 + 2)
      || skeleton) && !plan.holdFloors;
    const foodFloor = guard ? Math.min(plan.foodFloor, 100) : plan.foodFloor;
    const goldFloor = guard ? 0 : plan.goldFloor;
    // Siege reserves: archers/knights otherwise drain every coin, and trash units
    // (skirms/spears) burn every stick of wood, so the workshop and its rams never
    // appear — and without rams a defended TC is a meat grinder forever.
    const ramCap = t.multiFront ? 4 : 3;
    const noWorkshop = t.siege && ageIdx >= 2 && (snap.own.siegeWorkshop?.length ?? 0) === 0;
    const wantRam = t.siege && (snap.own.siegeWorkshop?.length ?? 0) > 0
      && snap.rams.length < ramCap && snap.enemyBuildings.length > 0;
    const goldReserve = wantRam ? 95 : 0;
    const woodReserve = noWorkshop ? 200 : wantRam ? 220 : 0;
    // Each floor guards only its OWN resource: an archer (wood+gold) must keep
    // training while the bot banks 800 FOOD for Castle — the all-resource gate froze
    // EVERY military line for the whole saving window (the zero-army standard bug).
    const spare = (cost: Partial<Record<'food' | 'wood' | 'gold' | 'stone', number>>, foodPad = t.raidEco ? 10 : 40, goldPad = 20 + goldReserve): boolean =>
      ((cost.food ?? 0) === 0 || stock.food >= foodFloor + (cost.food ?? 0) + foodPad)
      // wood buffer (houses!) only matters for units that actually cost wood
      && stock.wood >= (cost.wood ?? 0) + ((cost.wood ?? 0) > 0 ? 60 + woodReserve : 0)
      && ((cost.gold ?? 0) === 0 || stock.gold >= goldFloor + (cost.gold ?? 0) + goldPad)
      && stock.stone >= (cost.stone ?? 0);

    // rams FIRST: commands apply in order, so the ram claims its wood/gold before
    // the barracks/range/stable spend the rest of the batch's budget (the reserves
    // in spare() are FOR the ram, so its own check bypasses them)
    for (const b of snap.own.siegeWorkshop ?? []) {
      if ((b.trainQueue?.length ?? 0) !== 0) continue;
      if (wantRam && stock.wood >= 200 && stock.gold >= goldFloor + 85) {
        cmds.push({ kind: 'train', player, buildingId: b.id, defId: 'batteringRam' });
      }
    }

    // line upgrades keep the army current (research shares the production queue)
    const tryUpgrade = (b: Entity, techIds: string[]): boolean => {
      if (!t.research || plan.savingForAge) return false;
      for (const id of techIds) {
        const tech = gameData.techs[id];
        if (!tech || researched.includes(id)) continue;
        if (AGES.indexOf(tech.age) > ageIdx) continue;
        if (tech.requiresTech !== undefined && !researched.includes(tech.requiresTech)) continue;
        if (!spare(tech.cost, 100, 50)) continue;
        cmds.push({ kind: 'research', player, buildingId: b.id, techId: id });
        return true;
      }
      return false;
    };

    /** Train the first affordable candidate (later entries are the trash fallback —
     *  when the gold runs dry the army keeps growing on food/wood units). */
    const train = (b: Entity, candidates: Array<string | null>): void => {
      if (t.trainCooldown > 0 && snap.tick - lastTrainAt < t.trainCooldown) return;
      for (const defId of candidates) {
        if (defId === null) continue;
        const def = gameData.units[defId];
        if (!def || !spare(def.cost)) continue;
        cmds.push({ kind: 'train', player, buildingId: b.id, defId });
        lastTrainAt = snap.tick;
        trainedTotal++;
        return;
      }
    };

    // Dark-age militia are a TAX on the Feudal bank, not an army: standard/hard used
    // to burn 300-500 food on militia before the bank could fill, making them SLOWER
    // to Feudal than easy (whose trainCooldown skips the burn) and inverting the
    // difficulty ladder. Cap dark-age militia per difficulty (hard trains ZERO — its
    // tempo edge) for non-rush profiles unless the base is actually under threat —
    // raiders (raidEco) rush by design and are exempt.
    const darkMilitiaCapped = ageIdx === 0 && !t.raidEco && !threatNearBase
      && countOwn(MILITIA_LINE) >= t.darkMilitia;

    for (const b of snap.own.barracks ?? []) {
      if ((b.trainQueue?.length ?? 0) !== 0) continue;
      if (tryUpgrade(b, t.counters >= 2
        ? ['manAtArmsUpgrade', 'pikemanUpgrade', 'longswordsmanUpgrade']
        : ['manAtArmsUpgrade'])) continue;
      if (darkMilitiaCapped) continue;
      const militiaTier = lineTier(MILITIA_LINE, researched, ageIdx);
      const spearTier = lineTier(SPEAR_LINE, researched, ageIdx);
      train(b, wantSpears ? [spearTier, militiaTier] : [militiaTier, spearTier]);
    }
    for (const b of snap.own.archeryRange ?? []) {
      if ((b.trainQueue?.length ?? 0) !== 0) continue;
      if (t.counters >= 2 && tryUpgrade(b, ['crossbowmanUpgrade'])) continue;
      const archerTier = lineTier(ARCHER_LINE, researched, ageIdx);
      const skirmTier = lineTier(SKIRM_LINE, researched, ageIdx);
      train(b, wantSkirms ? [skirmTier, archerTier] : [archerTier, skirmTier]);
    }
    for (const b of snap.own.stable ?? []) {
      if ((b.trainQueue?.length ?? 0) !== 0) continue;
      const cavalryCount = snap.military.filter((e) =>
        gameData.units[e.defId]?.classes.includes('cavalry')).length;
      if (ageIdx >= 2 && stock.gold >= goldFloor + goldReserve + 175) train(b, ['knight']);
      else if (cavalryCount < 3 && stock.food >= foodFloor + 130) train(b, ['scout']);
    }
    for (const b of snap.own.monastery ?? []) {
      if ((b.trainQueue?.length ?? 0) !== 0) continue;
      if (snap.monks.length < 2 && stock.gold >= goldFloor + goldReserve + 150) {
        cmds.push({ kind: 'train', player, buildingId: b.id, defId: 'monk' });
      }
    }

    // rally fresh troops onto the staging point (re-set when the stage moves)
    const stage = stagePoint(snap);
    const stageKey = `${stage.x}:${stage.y}`;
    for (const defId of ['barracks', 'archeryRange', 'stable', 'siegeWorkshop'] as const) {
      for (const b of snap.own[defId] ?? []) {
        if (ralliedTo.get(b.id) === stageKey) continue;
        ralliedTo.set(b.id, stageKey);
        cmds.push({ kind: 'setRally', player, buildingId: b.id, x: stage.x * FP, y: stage.y * FP });
      }
    }
  };

  // ------------------------------------------------------------ monks/scout
  const doMonks = (snap: Snapshot, cmds: Command[], stage: { x: number; y: number }): void => {
    for (const m of snap.monks) {
      if (m.activity !== 'idle') continue;
      let patient: Entity | null = null;
      let worst = 0;
      for (const e of snap.military) {
        if (e.hp >= e.maxHp) continue;
        if (cheb(e.tileX, e.tileY, m.tileX, m.tileY) > 10) continue;
        const missing = e.maxHp - e.hp;
        if (missing > worst) { worst = missing; patient = e; }
      }
      if (patient) cmds.push({ kind: 'heal', player, units: [m.id], targetId: patient.id });
      else if (cheb(m.tileX, m.tileY, stage.x, stage.y) > 8) {
        cmds.push({ kind: 'move', player, units: [m.id], x: stage.x * FP, y: stage.y * FP });
      }
    }
  };

  const doScout = (snap: Snapshot, cmds: Command[]): void => {
    const scout = snap.scout;
    if (scout === null || scout.activity !== 'idle' || waveActive) return;
    if (scoutLeg < SCOUT_RING.length) {
      // early sheep sweep in a widening square around the base
      const r = SCOUT_RING[scoutLeg];
      const corner = (scoutLeg + scoutSpin) % 4;
      const dx = corner === 0 || corner === 3 ? -r : r;
      const dy = corner < 2 ? -r : r;
      scoutLeg++;
      const x = Math.max(1, Math.min(st.map.width - 2, snap.baseX + dx));
      const y = Math.max(1, Math.min(st.map.height - 2, snap.baseY + dy));
      cmds.push({ kind: 'move', player, units: [scout.id], x: x * FP, y: y * FP });
    } else if (snap.enemyBuildings.length === 0 && scoutLeg < SCOUT_RING.length + 8) {
      // keep looking for the enemy base — counters and wave targets need sightings
      const pt = explorePoint(snap, scoutLeg - SCOUT_RING.length);
      scoutLeg++;
      cmds.push({ kind: 'move', player, units: [scout.id], x: pt.x * FP, y: pt.y * FP });
    }
  };

  return {
    onAlarm(x: Fixed, y: Fixed, tick: Tick): void {
      alarm = { x, y, tick };
    },
    forceAttack(area?: BotRect): void {
      forced = { area: area ?? null };
      // the pulse's destination persists for the wave's whole life — units re-path
      // toward it until they arrive or die (the bridge queue, not the idle bank)
      forcedDest = area
        ? { x: (area.x + Math.floor(area.w / 2)) * FP, y: (area.y + Math.floor(area.h / 2)) * FP }
        : null;
      waveActive = false; // relaunch against the forced objective next pass
      waveCooldownUntil = -1;
      progressKey = '';
      progressBest = Infinity;
      progressStrikes = 0;
    },
    decide(snap: Snapshot, plan: AgePlan, cmds: Command[]): void {
      // GDD Victory/Defeat: bots resign when hopeless. Easy keeps the LOOSE rule —
      // town center gone and cannot afford another; an easy player without a town is
      // done, and dragging the game out with a landless warband is exactly what the
      // rule exists to prevent. Standard/hard concede only under a STRICT test on
      // top of that: the enemy is overwhelming — publicly an age ahead (the age-up
      // horns are announced to the whole match) or the seen enemy army is 3x ours —
      // and only in CONQUEST games: campaign defeat is trigger-scripted, and a
      // scripted seat resigning would raze its own set pieces mid-story.
      if (!resigned
        && (snap.own.townCenter?.length ?? 0) === 0
        && !snap.foundations.some((f) => f.defId === 'townCenter')
        && (snap.stock.wood < 275 || snap.stock.stone < 100)
        && snap.villagers.length + snap.garrisonedVillagers < 8) {
        const enemyCombat = snap.enemyUnits.filter((s) => isCombatDef(s.defId)).length;
        const hopeless = ctx.tuning.resignEarly
          || (st.conquest === true
            && (ctx.enemyAgeIdx > AGES.indexOf(snap.p.age)
              || enemyCombat >= snap.military.length * 3 + 6));
        if (hopeless) {
          resigned = true;
          cmds.push({ kind: 'resign', player });
          return;
        }
      }
      const stage = stagePoint(snap);
      const guardIds = doDefense(snap, cmds);
      const waveBusy = doWaves(snap, plan, cmds, stage, guardIds);
      if (!waveBusy) {
        // straggler sweep: an attack-move only auto-engages what it meets, so a wave
        // member released mid-route would idle in the field forever — re-point idle
        // strays at the live objective, or gather them at the staging point
        const dest = waveActive && waveDest !== null ? waveDest : { x: stage.x * FP, y: stage.y * FP };
        // the scout's own sweep block (doScout) orders it while legs remain
        const scoutScouting = snap.scout !== null && !waveActive
          && (scoutLeg < SCOUT_RING.length
            || (snap.enemyBuildings.length === 0 && scoutLeg < SCOUT_RING.length + 8));
        const strays = snap.military.filter((e) => e.activity === 'idle'
          && !(guardIds?.has(e.id) ?? false)
          && cheb(e.tileX, e.tileY, Math.round(dest.x / FP), Math.round(dest.y / FP)) > STRAGGLER_LEASH
          // recruits massing at the staging point during a wave are NOT strays —
          // doWaves releases them as a squad at regroupArmy size; sweeping them
          // here marched every lone recruit solo into the enemy's arrows
          && !(waveActive && cheb(e.tileX, e.tileY, stage.x, stage.y) <= STRAGGLER_LEASH)
          && !(scoutScouting && e.id === snap.scout!.id));
        // THROTTLED to one order per reissue window: re-ordering every decision pass
        // (14 ticks on hard) restarted the sim's group path search before it could
        // ever answer, so a jammed army stayed frozen at its staging tile forever
        if (strays.length > 0 && snap.tick - lastStrayOrderAt >= ctx.tuning.waveReissue) {
          lastStrayOrderAt = snap.tick;
          cmds.push(waveActive
            ? { kind: 'attackMove', player, units: strays.map((e) => e.id), x: dest.x, y: dest.y }
            : { kind: 'move', player, units: strays.map((e) => e.id), x: dest.x, y: dest.y });
        }
      }
      doScout(snap, cmds);
      doProduction(snap, plan, cmds);
      doMonks(snap, cmds, stage);
    },
  };
}
