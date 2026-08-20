// End-to-end completion playthroughs for every generated historical campaign.
// These use the real simulation, trigger runtime, and authored enemy AI. The
// player driver deliberately limits itself to ordinary RTS decisions: preserve
// the named hero, move the column, attack-move a formation, screen siege, or
// hold the river crossing. It never edits state or completes objectives directly.

import { describe, expect, it } from 'vitest';
import { createGame, fp } from '@bf/sim';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import type { Condition, ScenarioDef } from '../schema';
import { legendaryScenarios } from './legendaryCampaigns';

const SEED = 20260820;
const ENEMY_LINE = { x: fp(49), y: fp(35) };
const SOUTHERN_FORD = { x: fp(32), y: fp(54) };
const HERO_REFUGE = { x: fp(6), y: fp(66) };
const JOURNEY_WAYPOINTS = [
  { x: 30, y: 54 },
  { x: 35, y: 53 },
  { x: 35, y: 28 },
  { x: 56, y: 25 },
  { x: 58, y: 18 },
] as const;

type MissionKind = 'journey' | 'battle' | 'siege' | 'defend' | 'lastStand';

function alive(entity: Entity): boolean {
  return entity.hp > 0 && entity.activity !== 'dying';
}

function missionKind(scenario: ScenarioDef): MissionKind {
  const victory = scenario.triggers.find((trigger) => trigger.id === 'victory');
  if (!victory) throw new Error(`${scenario.id}: no victory trigger`);
  const conditions = victory.conditions as Condition[];
  if (conditions.some((condition) => condition.kind === 'entitiesInArea')) return 'journey';
  if (conditions.some((condition) => condition.kind === 'refsDestroyed')) return 'battle';
  if (conditions.some((condition) => condition.kind === 'timerSeconds')) return 'defend';
  if (conditions.some((condition) => (
    condition.kind === 'refDestroyed' && condition.ref === 'campaign-target'
  ))) return 'siege';
  return 'lastStand';
}

function makeOps(game: Game, bot: Bot) {
  const state = game.state;
  const outcome = { victory: 0, defeat: 0 };
  const ops: ScenarioOps = {
    tick: () => state.tick,
    getEntityByRef(ref) {
      const id = state.refs.get(ref);
      const entity = id !== undefined ? state.entities.get(id) : undefined;
      if (!entity || !alive(entity)) return null;
      return {
        id: entity.id,
        defId: entity.defId,
        player: entity.player,
        tileX: entity.tileX,
        tileY: entity.tileY,
        hp: entity.hp,
      };
    },
    countEntities: (query) => game.ops!.getCounts(query),
    getAge: (player) => state.players[player]?.age ?? 'dark',
    getResource: (player, type) => state.players[player]?.stockpile[type] ?? 0,
    hasResearched: (player, techId) => state.players[player]?.researchedTechs.includes(techId) ?? false,
    isDefeated: (player) => state.players[player]?.defeated ?? false,
    spawn: (entities) => void game.ops!.spawn(entities),
    changeOwner(refs, toPlayer) {
      const ids = refs.map((ref) => state.refs.get(ref)).filter((id): id is EntityId => id !== undefined);
      if (ids.length > 0) game.ops!.changeOwner(ids, toPlayer);
    },
    revealArea: (player, area) => game.ops!.revealArea(player, area),
    addResources: (player, amounts) => game.ops!.addResources(player, amounts),
    setAiProfile(player, profile) {
      if (player === 2) applyAiProfile(bot, profile as AiProfile);
    },
    aiAttackNow(player, targetArea) {
      if (player === 2) attackNow(bot, targetArea);
    },
    message: () => {},
    panCamera: () => {},
    objectiveAdded: () => {},
    objectiveCompleted: () => {},
    objectiveFailed: () => {},
    playSting: () => {},
    victory: () => void outcome.victory++,
    defeat: () => void outcome.defeat++,
  };
  return { ops, outcome };
}

function playThrough(scenario: ScenarioDef) {
  const { start, meta } = loadScenario(scenario, campaignGameData);
  const game = createGame({
    seed: SEED,
    map: start,
    players: meta.playerSetups,
    popCap: meta.popCap,
    ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
  });
  const state = game.state;
  const bot = createBot(game, 2, {
    profile: meta.players[1]?.aiProfile ?? 'passive',
    difficulty: 'standard',
    seed: SEED,
  });
  const { ops, outcome } = makeOps(game, bot);
  const runtime = new TriggerRuntime(scenario, ops);
  const kind = missionKind(scenario);
  let events: SimEvent[] = [];
  let journeyStage = 0;
  let siegeStaged = false;
  let battleFormationIssued = false;
  let siegeMoveIssued = false;
  let siegeAdvanceIssued = false;
  const combatStats = { humanDeaths: 0, enemyDeaths: 0, humanHits: 0, enemyHits: 0 };

  const mine = () => [...state.entities.values()].filter((entity) => (
    entity.player === 1 && entity.kind === 'unit' && alive(entity)
  ));
  const hero = () => {
    const id = state.refs.get('protagonist');
    return id === undefined ? undefined : state.entities.get(id);
  };
  const fieldArmy = () => mine().filter((entity) => (
    entity.defId !== 'villager' && entity.id !== hero()?.id
  ));
  const enemies = () => [...state.entities.values()].filter((entity) => (
    entity.player === 2 && entity.kind === 'unit' && alive(entity)
  ));
  const nearestEnemy = (units: Entity[], preferred?: Entity[]) => {
    const candidates = preferred ?? enemies();
    if (units.length === 0 || candidates.length === 0) return undefined;
    const center = units.reduce((position, unit) => ({
      x: position.x + unit.tileX / units.length,
      y: position.y + unit.tileY / units.length,
    }), { x: 0, y: 0 });
    return candidates.reduce((nearest, candidate) => {
      const distance = (candidate.tileX - center.x) ** 2 + (candidate.tileY - center.y) ** 2;
      const nearestDistance = (nearest.tileX - center.x) ** 2 + (nearest.tileY - center.y) ** 2;
      return distance < nearestDistance ? candidate : nearest;
    });
  };
  const focusNearest = (units: Entity[], preferred?: Entity[]): Command[] => {
    const idle = units.filter((unit) => {
      const current = unit.targetId === undefined ? undefined : state.entities.get(unit.targetId);
      return !current || !alive(current);
    });
    const target = nearestEnemy(idle, preferred);
    return idle.length > 0 && target
      ? [{ kind: 'attack', player: 1, units: idle.map((unit) => unit.id), targetId: target.id }]
      : [];
  };

  const humanCommands = (): Command[] => {
    const commands: Command[] = [];
    const refresh = state.tick === 0 || state.tick % 600 === 0;
    if (!refresh) return commands;

    const protagonist = hero();
    const army = fieldArmy();
    switch (kind) {
      case 'journey':
        if (protagonist && alive(protagonist)) {
          while (journeyStage < JOURNEY_WAYPOINTS.length) {
            const waypoint = JOURNEY_WAYPOINTS[journeyStage];
            if ((protagonist.tileX - waypoint.x) ** 2 + (protagonist.tileY - waypoint.y) ** 2 > 4) break;
            journeyStage++;
          }
          const destination = JOURNEY_WAYPOINTS[journeyStage] ?? { x: 58, y: 16 };
          commands.push({
            kind: 'move', player: 1,
            units: [protagonist.id],
            x: fp(destination.x), y: fp(destination.y),
          });
        }
        break;
      case 'battle': {
        const pikes = army.filter((unit) => unit.defId === 'pikeman');
        const melee = army.filter((unit) => unit.defId !== 'pikeman'
          && (campaignGameData.units[unit.defId]?.range ?? 0) === 0);
        const ranged = army.filter((unit) => (campaignGameData.units[unit.defId]?.range ?? 0) > 0);
        const front = [...pikes, ...melee];
        if (!battleFormationIssued) {
          if (front.length > 0) {
            commands.push({ kind: 'move', player: 1, units: front.map((unit) => unit.id), x: fp(27), y: fp(53), formation: 'rectangle' });
          }
          if (ranged.length > 0) {
            commands.push({ kind: 'move', player: 1, units: ranged.map((unit) => unit.id), x: fp(23), y: fp(59), formation: 'rectangle' });
          }
          battleFormationIssued = true;
        }
        // Let the scripted host cross the river before committing. Ordering a
        // focus target while it is still on the far bank strings a formation
        // through the ford one unit at a time.
        const enemyUnits = enemies().filter((enemy) => enemy.tileX < 34 && enemy.tileY > 42);
        if (enemyUnits.length > 0) {
          const cavalry = enemyUnits.filter((unit) => campaignGameData.units[unit.defId]?.classes.includes('cavalry'));
          const archers = enemyUnits.filter((unit) => campaignGameData.units[unit.defId]?.classes.includes('archer'));
          const spears = enemyUnits.filter((unit) => campaignGameData.units[unit.defId]?.classes.includes('spearman'));
          commands.push(...focusNearest(pikes.filter((unit) => unit.activity === 'idle'), cavalry.length > 0 ? cavalry : enemyUnits));
          commands.push(...focusNearest(melee.filter((unit) => unit.activity === 'idle'), archers.length > 0 ? archers : enemyUnits));
          commands.push(...focusNearest(ranged.filter((unit) => unit.activity === 'idle'), spears.length > 0 ? spears : enemyUnits));
        }
        if (protagonist && alive(protagonist)) {
          commands.push({ kind: 'move', player: 1, units: [protagonist.id], ...HERO_REFUGE });
        }
        break;
      }
      case 'siege': {
        const siege = army.filter((entity) => entity.defId === 'trebuchet');
        const screen = army.filter((entity) => entity.defId !== 'trebuchet');
        const melee = screen.filter((unit) => (campaignGameData.units[unit.defId]?.range ?? 0) === 0);
        const ranged = screen.filter((unit) => (campaignGameData.units[unit.defId]?.range ?? 0) > 0);
        if (!siegeStaged) {
          siegeStaged = state.tick >= 3600;
        }
        if (!siegeStaged) {
          if (!siegeMoveIssued) {
            if (melee.length > 0) commands.push({ kind: 'move', player: 1, units: melee.map((unit) => unit.id), x: fp(31), y: fp(52), formation: 'rectangle' });
            if (ranged.length > 0) commands.push({ kind: 'move', player: 1, units: ranged.map((unit) => unit.id), x: fp(27), y: fp(56), formation: 'rectangle' });
            if (siege.length > 0) commands.push({ kind: 'move', player: 1, units: siege.map((unit) => unit.id), x: fp(24), y: fp(60), formation: 'rectangle' });
            siegeMoveIssued = true;
          }
        } else {
          if (!siegeAdvanceIssued) {
            if (melee.length > 0) commands.push({ kind: 'attackMove', player: 1, units: melee.map((unit) => unit.id), x: fp(48), y: fp(24), formation: 'rectangle' });
            if (ranged.length > 0) commands.push({ kind: 'attackMove', player: 1, units: ranged.map((unit) => unit.id), x: fp(44), y: fp(28), formation: 'rectangle' });
            siegeAdvanceIssued = true;
          } else {
            commands.push(...focusNearest(melee.filter((unit) => unit.activity === 'idle')));
            commands.push(...focusNearest(ranged.filter((unit) => unit.activity === 'idle')));
          }
          const targetId = state.refs.get('campaign-target');
          const target = targetId === undefined ? undefined : state.entities.get(targetId);
          const idleSiege = siege.filter((unit) => unit.activity === 'idle');
          if (idleSiege.length > 0 && target && alive(target)) {
            commands.push({
              kind: 'attack', player: 1,
              units: idleSiege.map((unit) => unit.id), targetId: target.id,
            });
          }
        }
        if (protagonist && alive(protagonist)) {
          commands.push({ kind: 'move', player: 1, units: [protagonist.id], ...HERO_REFUGE });
        }
        break;
      }
      case 'defend': {
        const nearbyEnemy = nearestEnemy(army);
        if (nearbyEnemy && nearbyEnemy.tileX < 40) {
          commands.push(...focusNearest(army));
        } else if (army.length > 0) {
          commands.push({
            kind: 'attackMove', player: 1,
            units: army.map((entity) => entity.id),
            ...SOUTHERN_FORD,
          });
        }
        if (protagonist && alive(protagonist)) {
          const strongholdId = state.refs.get('stronghold');
          const stronghold = strongholdId === undefined ? undefined : state.entities.get(strongholdId);
          if (stronghold && alive(stronghold) && protagonist.garrisonedIn === undefined) {
            commands.push({ kind: 'garrison', player: 1, units: [protagonist.id], targetId: stronghold.id });
          } else if (!stronghold || !alive(stronghold)) {
            commands.push({ kind: 'move', player: 1, units: [protagonist.id], ...HERO_REFUGE });
          }
        }
        break;
      }
      case 'lastStand': {
        if (state.tick < 700) {
          commands.push(...focusNearest(army));
        } else if (army.length > 0) {
          // The surviving escort withdraws while the protagonist covers it. This
          // exposes the hero to the scripted overwhelming host instead of letting
          // the upgraded company accidentally erase the authored last stand.
          commands.push({ kind: 'move', player: 1, units: army.map((unit) => unit.id), ...HERO_REFUGE });
        }
        if (protagonist && alive(protagonist)) {
          // Scenario timers use the simulation's 20 Hz clock: the authored
          // turning point fires at 35 seconds (tick 700).
          if (state.tick >= 700) {
            const target = nearestEnemy([protagonist]);
            if (target) commands.push({
              kind: 'move', player: 1, units: [protagonist.id],
              x: fp(target.tileX), y: fp(target.tileY),
            });
            else commands.push({ kind: 'attackMove', player: 1, units: [protagonist.id], ...ENEMY_LINE });
          } else {
            commands.push({ kind: 'move', player: 1, units: [protagonist.id], ...HERO_REFUGE });
          }
        }
        break;
      }
    }
    return commands;
  };

  while (!runtime.isEnded && state.tick < 36000) {
    const botCommands = bot.tick(events);
    events = game.advance([...humanCommands(), ...botCommands]);
    for (const event of events) {
      if (event.kind === 'entityDied') {
        if (event.player === 1) combatStats.humanDeaths++;
        if (event.player === 2) combatStats.enemyDeaths++;
      }
      if (event.kind === 'attackImpact') {
        const attacker = state.entities.get(event.attackerId);
        if (attacker?.player === 1) combatStats.humanHits++;
        if (attacker?.player === 2) combatStats.enemyHits++;
      }
    }
    runtime.tick(events);
  }

  const protagonistId = state.refs.get('protagonist');
  const rawProtagonist = protagonistId === undefined ? undefined : state.entities.get(protagonistId);
  const targetId = state.refs.get('campaign-target');
  const rawTarget = targetId === undefined ? undefined : state.entities.get(targetId);
  return {
    kind,
    outcome,
    tick: state.tick,
    protagonist: ops.getEntityByRef('protagonist'),
    objective: runtime.objectiveState('primary'),
    diagnostics: {
      hero: rawProtagonist && {
        defId: rawProtagonist.defId,
        hp: rawProtagonist.hp,
        tileX: rawProtagonist.tileX,
        tileY: rawProtagonist.tileY,
        activity: rawProtagonist.activity,
      },
      target: rawTarget && { hp: rawTarget.hp, activity: rawTarget.activity },
      humanUnits: mine().length,
      enemyUnits: enemies().length,
      combatStats,
    },
  };
}

describe('all generated historical campaigns complete under human-like play', () => {
  for (const scenario of legendaryScenarios) {
    it(`${scenario.id} reaches its authored ending`, () => {
      const result = playThrough(scenario);
      expect(
        result.outcome,
        `${scenario.id} stopped at tick ${result.tick}: ${JSON.stringify(result.diagnostics)}`,
      ).toEqual({ victory: 1, defeat: 0 });
      expect(result.objective).toBe('complete');
      if (result.kind !== 'lastStand') expect(result.protagonist).not.toBeNull();
    }, 120000);
  }
});
