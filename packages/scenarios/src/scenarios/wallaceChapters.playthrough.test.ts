// End-to-end completion proofs for the campaign's final six chapters. These
// drive the real simulation, trigger runtime, and authored AI seats using only
// public player commands: gather, build, train, garrison, move, and attack.

import { describe, expect, it } from 'vitest';
import { createGame, fp } from '@bf/sim';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import type { ScenarioDef } from '../schema';
import {
  wallaceChapter07,
  wallaceChapter08,
  wallaceChapter09,
  wallaceChapter10,
  wallaceChapter11,
  wallaceChapter12,
} from './wallaceChapters';

const SEED = 1305;

function alive(entity: Entity): boolean {
  return entity.hp > 0 && entity.activity !== 'dying';
}

function makeOps(game: Game, bots: Map<number, Bot>) {
  const state = game.state;
  const outcome = { victory: 0, defeat: 0 };
  const ops: ScenarioOps = {
    tick: () => state.tick,
    getEntityByRef(ref) {
      const id = state.refs.get(ref);
      const entity = id === undefined ? undefined : state.entities.get(id);
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
      const bot = bots.get(player);
      if (bot) applyAiProfile(bot, profile as AiProfile);
    },
    aiAttackNow(player, targetArea) {
      const bot = bots.get(player);
      if (bot) attackNow(bot, targetArea);
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

type Driver = (context: PlayContext) => Command[];

interface PlayContext {
  game: Game;
  runtime: TriggerRuntime;
  scenario: ScenarioDef;
  mine: (defId?: string) => Entity[];
  fighters: () => Entity[];
  entity: (defId: string) => Entity | undefined;
  ref: (name: string) => Entity | undefined;
  nearestResource: (defId: string, x: number, y: number) => Entity | undefined;
}

function play(scenario: ScenarioDef, driver: Driver, maxTicks = 80000) {
  const { start, meta } = loadScenario(scenario, campaignGameData);
  const game = createGame({
    seed: SEED,
    map: start,
    players: meta.playerSetups,
    popCap: meta.popCap,
    ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
  });
  const state = game.state;
  const bots = new Map<number, Bot>();
  for (let player = 2; player < meta.playerSetups.length; player++) {
    const setup = meta.playerSetups[player - 1];
    const authored = meta.players[player - 1];
    if (!setup || !authored) continue;
    bots.set(player, createBot(game, player, {
      profile: authored.aiProfile ?? 'passive', difficulty: 'standard', seed: SEED + player,
    }));
  }
  const { ops, outcome } = makeOps(game, bots);
  const runtime = new TriggerRuntime(scenario, ops);
  const mine = (defId?: string) => [...state.entities.values()].filter((entity) => (
    entity.player === 1 && entity.kind === 'unit' && alive(entity)
    && (defId === undefined || entity.defId === defId)
  ));
  const fighters = () => mine().filter((entity) => (
    entity.defId !== 'villager' && !entity.defId.startsWith('hero')
  ));
  const entity = (defId: string) => [...state.entities.values()].find((candidate) => (
    candidate.player === 1 && candidate.defId === defId && alive(candidate)
  ));
  const ref = (name: string) => {
    const id = state.refs.get(name);
    const candidate = id === undefined ? undefined : state.entities.get(id);
    return candidate && alive(candidate) ? candidate : undefined;
  };
  const nearestResource = (defId: string, x: number, y: number) => [...state.entities.values()]
    .filter((candidate) => candidate.kind === 'resource' && candidate.defId === defId && alive(candidate))
    .sort((a, b) => (
      Math.abs(a.tileX - x) + Math.abs(a.tileY - y)
      - Math.abs(b.tileX - x) - Math.abs(b.tileY - y)
    ))[0];
  const context: PlayContext = { game, runtime, scenario, mine, fighters, entity, ref, nearestResource };
  let events: SimEvent[] = [];

  while (!runtime.isEnded && state.tick < maxTicks) {
    const botCommands = [...bots.values()].flatMap((bot) => bot.tick(events));
    events = game.advance([...driver(context), ...botCommands]);
    runtime.tick(events);
  }

  const wallaceId = state.refs.get('wallace');
  const wallace = wallaceId === undefined ? undefined : state.entities.get(wallaceId);
  return {
    outcome,
    tick: state.tick,
    wallace: wallace && {
      hp: wallace.hp, activity: wallace.activity, x: wallace.tileX, y: wallace.tileY,
    },
    objectives: Object.fromEntries([
      'obj-winter-camp', 'obj-ryton', 'obj-market', 'obj-corbridge', 'obj-hexham', 'obj-priory',
      'obj-fortify', 'obj-monks', 'obj-hold', 'obj-breakout', 'obj-war-camp', 'obj-happrew',
      'obj-captives', 'obj-earnside',
    ].map((id) => [id, runtime.objectiveState(id)])),
    units: mine().length,
    fighters: fighters().length,
    stockpile: state.players[1]?.stockpile,
    age: state.players[1]?.age,
    researched: state.players[1]?.researchedTechs,
    townCenterQueue: entity('townCenter')?.trainQueue,
    buildingCounts: [...state.entities.values()].filter((candidate) => (
      candidate.player === 1 && candidate.kind === 'building' && alive(candidate)
    )).reduce<Record<string, { complete: number; underConstruction: number }>>((counts, candidate) => {
      const entry = counts[candidate.defId] ?? { complete: 0, underConstruction: 0 };
      if ((candidate.buildProgress ?? 1000) >= 1000) entry.complete++;
      else entry.underConstruction++;
      counts[candidate.defId] = entry;
      return counts;
    }, {}),
    workers: mine('villager').map((candidate) => ({
      activity: candidate.activity, x: candidate.tileX, y: candidate.tileY,
      target: candidate.targetId === undefined ? undefined : state.entities.get(candidate.targetId)?.defId,
    })),
  };
}

function economyDriver(options: {
  base: { x: number; y: number };
  villagers: number;
  farms: number;
  foodGoal?: number;
  woodGoal?: number;
  goldGoal?: number;
  placements: Record<string, Array<{ x: number; y: number }>>;
  assaultRef?: string;
  assaultAt?: { x: number; y: number };
  assaultWhen?: (context: PlayContext) => boolean;
  afterAssault?: (context: PlayContext, commands: Command[]) => void;
}): Driver {
  let opened = false;
  let assaultIssued = false;
  const initialCounts = new Map<string, number>();
  return (context) => {
    const state = context.game.state;
    const commands: Command[] = [];
    if (!opened) {
      opened = true;
      for (const defId of Object.keys(options.placements)) {
        initialCounts.set(defId, [...state.entities.values()].filter((candidate) => (
          candidate.player === 1 && candidate.defId === defId && alive(candidate)
        )).length);
      }
      commands.push({ kind: 'setProductionSpeed', player: 1, multiplier: 4 });
      commands.push({ kind: 'queueReseed', player: 1, enabled: true });
      const wallace = context.ref('wallace');
      const townCenter = context.entity('townCenter');
      if (wallace && townCenter) commands.push({ kind: 'garrison', player: 1, units: [wallace.id], targetId: townCenter.id });
    }
    if (state.tick % 100 !== 0) return commands;

    const villagers = context.mine('villager');
    const idle = () => villagers.filter((candidate) => candidate.activity === 'idle');
    const availableBuilder = () => villagers.find((candidate) => candidate.activity !== 'building');
    const townCenter = context.entity('townCenter');
    const stock = state.players[1]!.stockpile;
    if (townCenter && villagers.length < options.villagers && stock.food >= 50 && (townCenter.trainQueue?.length ?? 0) < 2) {
      commands.push({ kind: 'train', player: 1, buildingId: townCenter.id, defId: 'villager' });
    }

    const reserved = new Set<EntityId>();
    const buildOrder = ['house', 'lumberCamp', 'miningCamp', 'mill', 'farm', 'market', 'blacksmith', 'siegeWorkshop'];
    const unfinished = [...state.entities.values()].find((candidate) => (
      candidate.player === 1 && candidate.kind === 'building' && alive(candidate)
      && (candidate.buildProgress ?? 1000) < 1000
    ));
    if (unfinished && !villagers.some((villager) => villager.activity === 'building') && availableBuilder()) {
      const builder = availableBuilder()!;
      commands.push({ kind: 'repair', player: 1, units: [builder.id], targetId: unfinished.id });
      reserved.add(builder.id);
    } else if (!unfinished) {
      for (const defId of buildOrder) {
        const additions = defId === 'farm' ? options.farms : (options.placements[defId]?.length ?? 0);
        const initial = initialCounts.get(defId) ?? 0;
        const required = initial + additions;
        const existing = [...state.entities.values()].filter((candidate) => (
          candidate.player === 1 && candidate.defId === defId && alive(candidate)
        )).length;
        if (existing >= required || !availableBuilder()) continue;
        const placement = options.placements[defId]?.[existing - initial];
        if (!placement) continue;
        const builder = availableBuilder()!;
        commands.push({
          kind: 'build', player: 1, units: [builder.id], defId,
          tileX: placement.x, tileY: placement.y,
        });
        reserved.add(builder.id);
        break;
      }
    }

    const food = context.nearestResource('deer', options.base.x, options.base.y)
      ?? context.nearestResource('berryBush', options.base.x, options.base.y);
    const wood = context.nearestResource('tree', options.base.x, options.base.y);
    const gold = context.nearestResource('goldMine', options.base.x, options.base.y)
      ?? context.nearestResource('gold', options.base.x, options.base.y);
    const allFarms = [...state.entities.values()].filter((candidate) => (
      candidate.player === 1 && candidate.defId === 'farm' && alive(candidate)
      && (candidate.buildProgress ?? 1000) >= 1000
    ));
    const fallow = allFarms.find((farm) => (farm.amountLeft ?? 0) <= 0);
    if (fallow && stock.food < (options.foodGoal ?? 500) && stock.wood >= 60) {
      commands.push({ kind: 'reseedFarm', player: 1, farmId: fallow.id });
    }
    const farms = allFarms.filter((farm) => (farm.amountLeft ?? 0) > 0);
    const gatherers = state.tick % 600 === 0
      ? villagers.filter((villager) => villager.activity !== 'building')
      : idle();
    gatherers.filter((villager) => !reserved.has(villager.id)).forEach((villager, index) => {
      const target = stock.food < (options.foodGoal ?? 500) && (food ?? farms[0])
        ? (food ?? farms[index % Math.max(1, farms.length)])
        : stock.wood < (options.woodGoal ?? 500) && wood
          ? wood
          : stock.gold < (options.goldGoal ?? 350) && gold
          ? gold
          : wood ?? farms[index % Math.max(1, farms.length)] ?? food;
      if (target) commands.push({ kind: 'gather', player: 1, units: [villager.id], targetId: target.id });
    });

    if (options.assaultRef && (options.assaultWhen?.(context) ?? true)) {
      const target = context.ref(options.assaultRef);
      const army = context.fighters();
      if (target && army.length > 0 && (!assaultIssued || state.tick % 600 === 0)) {
        commands.push({ kind: 'attackMove', player: 1, units: army.map((unit) => unit.id), x: fp(options.assaultAt!.x), y: fp(options.assaultAt!.y), formation: 'rectangle' });
        commands.push({ kind: 'attack', player: 1, units: army.map((unit) => unit.id), targetId: target.id });
        assaultIssued = true;
      }
    }
    options.afterAssault?.(context, commands);
    return commands;
  };
}

const chapter07Driver = economyDriver({
  base: { x: 18, y: 20 }, villagers: 12, farms: 5, foodGoal: 1200, woodGoal: 1000, goldGoal: 400,
  assaultRef: 'ryton_stores', assaultAt: { x: 90, y: 30 },
  placements: {
    house: [{ x: 18, y: 14 }, { x: 22, y: 14 }],
    lumberCamp: [{ x: 27, y: 23 }],
    miningCamp: [{ x: 32, y: 15 }],
    mill: [{ x: 24, y: 29 }],
    farm: [{ x: 8, y: 14 }, { x: 8, y: 18 }, { x: 8, y: 22 }, { x: 8, y: 26 }, { x: 12, y: 20 }],
    market: [{ x: 24, y: 10 }],
    blacksmith: [{ x: 28, y: 10 }],
    siegeWorkshop: [{ x: 32, y: 20 }],
  },
  assaultWhen: (context) => context.game.state.players[1]?.age === 'castle'
    && context.mine('batteringRam').length >= 2
    && context.runtime.objectiveState('obj-winter-camp') === 'complete',
  afterAssault(context, commands) {
    const state = context.game.state;
    if (context.entity('market') && state.players[1]!.stockpile.gold < 400
      && state.players[1]!.stockpile.food >= 200) {
      commands.push({ kind: 'marketTrade', player: 1, sell: 'food', buy: 'gold', amount: 100 });
    }
    const tc = context.entity('townCenter');
    if (context.runtime.objectiveState('obj-winter-camp') === 'complete'
      && state.players[1]?.age === 'feudal' && tc && !tc.research) {
      commands.push({ kind: 'research', player: 1, buildingId: tc.id, techId: 'castleAge' });
    }
    const workshop = context.entity('siegeWorkshop');
    if (workshop && (workshop.buildProgress ?? 1000) >= 1000) {
      const ramTotal = context.mine('batteringRam').length
        + (workshop.trainQueue?.filter((item) => item.defId === 'batteringRam').length ?? 0);
      if (ramTotal < 2) commands.push({ kind: 'train', player: 1, buildingId: workshop.id, defId: 'batteringRam' });
    }
  },
});

function chapter08Driver(): Driver {
  let opened = false;
  let stage = 0;
  return (context) => {
    const state = context.game.state;
    const commands: Command[] = [];
    if (!opened) {
      opened = true;
      const wallace = context.ref('wallace');
      const tc = context.entity('townCenter');
      if (wallace && tc) commands.push({ kind: 'garrison', player: 1, units: [wallace.id], targetId: tc.id });
    }
    if (state.tick % 300 !== 0) return commands;
    const army = context.fighters();
    const rams = army.filter((unit) => unit.defId === 'batteringRam');
    const screen = army.filter((unit) => unit.defId !== 'batteringRam');
    const waypoints = [{ x: 37, y: 55 }, { x: 37, y: 70 }, { x: 48, y: 81 }];
    if (stage < waypoints.length) {
      const waypoint = waypoints[stage];
      const close = army.length > 0 && army.filter((unit) => (
        (unit.tileX - waypoint.x) ** 2 + (unit.tileY - waypoint.y) ** 2 < 64
      )).length >= Math.ceil(army.length * 0.6);
      if (close) stage++;
      const destination = waypoints[stage] ?? waypoint;
      if (screen.length > 0) commands.push({ kind: 'attackMove', player: 1, units: screen.map((unit) => unit.id), x: fp(destination.x), y: fp(destination.y), formation: 'rectangle' });
      if (rams.length > 0) commands.push({ kind: 'move', player: 1, units: rams.map((unit) => unit.id), x: fp(destination.x), y: fp(destination.y), formation: 'rectangle' });
      return commands;
    }
    const gate = context.ref('corbridge_gate');
    const keep = context.ref('corbridge_keep');
    const stores = context.ref('hexham_stores');
    const target = gate ?? keep ?? stores;
    if (target && army.length > 0) {
      if (screen.length > 0) commands.push({ kind: 'attackMove', player: 1, units: screen.map((unit) => unit.id), x: fp(target.tileX), y: fp(target.tileY), formation: 'rectangle' });
      if (rams.length > 0) commands.push({ kind: 'attack', player: 1, units: rams.map((unit) => unit.id), targetId: target.id });
      if (!gate && screen.length > 0) commands.push({ kind: 'attack', player: 1, units: screen.map((unit) => unit.id), targetId: target.id });
    }
    return commands;
  };
}

function chapter09Driver(): Driver {
  let opened = false;
  return (context) => {
    const state = context.game.state;
    const commands: Command[] = [];
    if (!opened) {
      opened = true;
      commands.push({ kind: 'setProductionSpeed', player: 1, multiplier: 4 });
      const wallace = context.ref('wallace');
      const castle = context.entity('castle');
      if (wallace && castle) commands.push({ kind: 'garrison', player: 1, units: [wallace.id], targetId: castle.id });
    }
    if (state.tick % 100 !== 0) return commands;
    const barracks = context.entity('barracks');
    const monastery = context.entity('monastery');
    const villager = context.mine('villager').find((candidate) => candidate.activity === 'idle');
    if (!monastery && villager) {
      commands.push({ kind: 'build', player: 1, units: [villager.id], defId: 'monastery', tileX: 76, tileY: 44 });
    }
    const armyCount = context.fighters().filter((unit) => !['mangonel', 'monk'].includes(unit.defId)).length;
    if (barracks && armyCount < 30 && (barracks.trainQueue?.length ?? 0) < 8) {
      commands.push({ kind: 'train', player: 1, buildingId: barracks.id, defId: 'spearman' });
    }
    if (monastery && (monastery.buildProgress ?? 1000) >= 1000) {
      const monks = context.mine('monk').length;
      if (monks + (monastery.trainQueue?.filter((item) => item.defId === 'monk').length ?? 0) < 2) {
        commands.push({ kind: 'train', player: 1, buildingId: monastery.id, defId: 'monk' });
      }
    }
    return commands;
  };
}

function chapter10Driver(): Driver {
  return (context) => {
    const state = context.game.state;
    if (state.tick % 100 !== 0) return [];
    const commands: Command[] = [];
    const wallace = context.ref('wallace');
    if (wallace) {
      const escaping = context.runtime.objectiveState('obj-breakout') === 'open';
      commands.push({ kind: 'move', player: 1, units: [wallace.id], x: fp(escaping ? 9 : 52), y: fp(escaping ? 9 : 38) });
    }
    const army = context.fighters();
    const siege = ['ram1', 'ram2', 'ram3', 'ram4', 'mang1', 'mang2', 'mang3']
      .map((name) => context.ref(name)).filter((candidate): candidate is Entity => candidate !== undefined);
    if (army.length > 0) {
      if (siege.length > 0) {
        commands.push({ kind: 'attack', player: 1, units: army.map((unit) => unit.id), targetId: siege[0].id });
      } else {
        commands.push({ kind: 'attackMove', player: 1, units: army.map((unit) => unit.id), x: fp(61), y: fp(61), formation: 'rectangle' });
      }
    }
    return commands;
  };
}

const chapter11Driver = economyDriver({
  base: { x: 110, y: 108 }, villagers: 15, farms: 6, foodGoal: 700, woodGoal: 1000,
  assaultRef: 'happrew_keep', assaultAt: { x: 60, y: 82 },
  placements: {
    house: [{ x: 104, y: 100 }],
    lumberCamp: [{ x: 122, y: 112 }],
    miningCamp: [{ x: 104, y: 118 }],
    mill: [{ x: 116, y: 116 }],
    farm: [{ x: 100, y: 100 }, { x: 100, y: 103 }, { x: 100, y: 106 }, { x: 100, y: 109 }, { x: 100, y: 112 }, { x: 100, y: 115 }],
    blacksmith: [{ x: 122, y: 116 }],
    siegeWorkshop: [{ x: 122, y: 120 }],
  },
  assaultWhen: (context) => context.runtime.objectiveState('obj-war-camp') === 'complete'
    && context.mine('batteringRam').length >= 2,
  afterAssault(context, commands) {
    const workshop = context.entity('siegeWorkshop');
    if (workshop && (workshop.buildProgress ?? 1000) >= 1000) {
      const ramTotal = context.mine('batteringRam').length
        + (workshop.trainQueue?.filter((item) => item.defId === 'batteringRam').length ?? 0);
      if (ramTotal < 2) commands.push({ kind: 'train', player: 1, buildingId: workshop.id, defId: 'batteringRam' });
    }
  },
});

function chapter12Driver(): Driver {
  let opened = false;
  let advanced = false;
  return (context) => {
    const state = context.game.state;
    const commands: Command[] = [];
    const wallace = context.ref('wallace');
    const tc = context.entity('townCenter');
    if (!opened) {
      opened = true;
      if (wallace && tc) commands.push({ kind: 'garrison', player: 1, units: [wallace.id], targetId: tc.id });
      const trebs = context.mine('trebuchet');
      if (trebs.length > 0) commands.push({ kind: 'pack', player: 1, units: trebs.map((unit) => unit.id) });
    }
    if (state.tick % 200 !== 0) return commands;
    const target = context.ref('earnside_tower');
    const trebs = context.mine('trebuchet');
    const screen = context.fighters().filter((unit) => unit.defId !== 'trebuchet');
    if (target && trebs.length > 0) {
      const close = trebs.every((unit) => (unit.tileX - target.tileX) ** 2 + (unit.tileY - target.tileY) ** 2 < 225);
      if (!close) {
        commands.push({ kind: 'move', player: 1, units: trebs.map((unit) => unit.id), x: fp(50), y: fp(58), formation: 'rectangle' });
        if (!advanced && screen.length > 0) {
          commands.push({ kind: 'attackMove', player: 1, units: screen.map((unit) => unit.id), x: fp(48), y: fp(56), formation: 'rectangle' });
          advanced = true;
        }
      } else {
        commands.push({ kind: 'unpack', player: 1, units: trebs.map((unit) => unit.id) });
        commands.push({ kind: 'attack', player: 1, units: trebs.map((unit) => unit.id), targetId: target.id });
        if (screen.length > 0) commands.push({ kind: 'attack', player: 1, units: screen.map((unit) => unit.id), targetId: target.id });
      }
    }
    return commands;
  };
}

describe('William Wallace chapters 7–12 complete under human-like play', () => {
  const cases: Array<[ScenarioDef, Driver, number]> = [
    [wallaceChapter07, chapter07Driver, 120000],
    [wallaceChapter08, chapter08Driver(), 90000],
    [wallaceChapter09, chapter09Driver(), 40000],
    [wallaceChapter10, chapter10Driver(), 30000],
    [wallaceChapter11, chapter11Driver, 40000],
    [wallaceChapter12, chapter12Driver(), 70000],
  ];

  for (const [scenario, driver, maxTicks] of cases) {
    it(`${scenario.id} reaches victory with Wallace alive`, () => {
      const result = play(scenario, driver, maxTicks);
      expect(
        result.outcome,
        `${scenario.id} stopped at tick ${result.tick}: ${JSON.stringify(result)}`,
      ).toEqual({ victory: 1, defeat: 0 });
      expect(result.wallace?.hp).toBeGreaterThan(0);
    }, 300000);
  }
});
