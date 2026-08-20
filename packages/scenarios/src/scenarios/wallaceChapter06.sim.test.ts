// Full-battle completion proof for chapter 6. This drives the real sim, trigger
// runtime, and every authored AI seat with a competent but ordinary human plan:
// work the starting farms, reinforce the mixed line, hold the bridgehead, and
// detach spears when the western-ford warning appears.

import { describe, expect, it } from 'vitest';
import { createGame, fp } from '@bf/sim';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import { wallaceChapter06 } from './wallaceChapters';

const SEED = 1297;
const LINE = { x: fp(58.5), y: fp(45.5) };
const WEST_FORD = { x: fp(9.5), y: fp(65.5) };

function makeOps(game: Game, bots: Map<number, Bot>) {
  const state = game.state;
  const outcome = { victory: 0, defeat: 0 };
  const ops: ScenarioOps = {
    tick: () => state.tick,
    getEntityByRef(ref) {
      const id = state.refs.get(ref);
      const entity = id !== undefined ? state.entities.get(id) : undefined;
      if (!entity || entity.activity === 'dying' || (entity.kind !== 'resource' && entity.hp <= 0)) return null;
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

describe('wallace-06 — Stirling Bridge closes from deployment to victory', () => {
  it('holds every wave, clears the western ford, and completes the mop-up', () => {
    const { start, meta } = loadScenario(wallaceChapter06, campaignGameData);
    const game = createGame({
      seed: SEED,
      map: start,
      players: meta.playerSetups,
      popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const state = game.state;
    const bots = new Map<number, Bot>([
      [2, createBot(game, 2, { profile: 'passive', difficulty: 'standard', seed: SEED })],
      [3, createBot(game, 3, { profile: 'defender', difficulty: 'standard', seed: SEED })],
      [4, createBot(game, 4, { profile: 'passive', difficulty: 'standard', seed: SEED })],
    ]);
    const { ops, outcome } = makeOps(game, bots);
    const runtime = new TriggerRuntime(wallaceChapter06, ops);

    const alive = (entity: Entity) => entity.hp > 0 && entity.activity !== 'dying';
    const mine = (defId?: string) => [...state.entities.values()].filter((entity) => (
      entity.player === 1 && entity.kind === 'unit' && alive(entity) &&
      (defId === undefined || entity.defId === defId)
    ));
    const fighters = () => mine().filter((entity) => entity.defId !== 'villager' && entity.defId !== 'heroWallace');
    const westRefs = ['flank1', 'flank2', 'flank3', 'flank4', 'flank5', 'flank6', 'flank7', 'flank8'];
    const westAlive = () => westRefs.some((ref) => ops.getEntityByRef(ref) !== null);

    const all = [...state.entities.values()];
    const barracksId = all.find((entity) => entity.player === 1 && entity.defId === 'barracks')!.id;
    const rangeId = all.find((entity) => entity.player === 1 && entity.defId === 'archeryRange')!.id;
    const farms = all.filter((entity) => entity.player === 1 && entity.defId === 'farm');
    const trees = all.filter((entity) => entity.kind === 'resource' && entity.defId === 'tree')
      .sort((a, b) => (Math.abs(a.tileX - 48) + Math.abs(a.tileY - 10)) - (Math.abs(b.tileX - 48) + Math.abs(b.tileY - 10)));

    let events: SimEvent[] = [];
    let initialOrders = false;
    let flankDetached = false;
    const milestones: string[] = [];
    const humanCommands = (): Command[] => {
      const commands: Command[] = [];
      const tick = state.tick;

      if (!initialOrders) {
        initialOrders = true;
        commands.push({ kind: 'move', player: 1, units: fighters().map((entity) => entity.id), ...LINE });
        commands.push({ kind: 'setRally', player: 1, buildingId: barracksId, ...LINE });
        commands.push({ kind: 'setRally', player: 1, buildingId: rangeId, ...LINE });
        mine('villager').forEach((villager, index) => {
          const target = index < farms.length ? farms[index] : trees[index - farms.length];
          commands.push({ kind: 'gather', player: 1, units: [villager.id], targetId: target.id });
        });
        for (let i = 0; i < 5; i++) {
          commands.push({ kind: 'train', player: 1, buildingId: barracksId, defId: 'spearman' });
        }
        for (let i = 0; i < 4; i++) {
          commands.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'archer' });
        }
      }

      if (tick > 0 && tick % 200 === 0) {
        const stock = state.players[1]!.stockpile;
        const barracks = state.entities.get(barracksId);
        if (barracks && alive(barracks) && (barracks.trainQueue?.length ?? 0) < 3 &&
          stock.food >= 35 && stock.wood >= 25) {
          commands.push({ kind: 'train', player: 1, buildingId: barracksId, defId: 'spearman' });
        }
        const range = state.entities.get(rangeId);
        if (range && alive(range) && (range.trainQueue?.length ?? 0) < 3 && stock.wood >= 25) {
          if (stock.gold >= 45) {
            commands.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'archer' });
          } else if (stock.food >= 25 && stock.wood >= 35) {
            commands.push({ kind: 'train', player: 1, buildingId: rangeId, defId: 'skirmisher' });
          }
        }

        const westIds = new Set<EntityId>();
        if (runtime.hasFired('t08-wave-d') && westAlive()) {
          const spears = mine('spearman').slice(0, 8);
          spears.forEach((entity) => westIds.add(entity.id));
          if (!flankDetached || spears.some((entity) => entity.activity === 'idle')) {
            commands.push({ kind: 'attackMove', player: 1, units: spears.map((entity) => entity.id), ...WEST_FORD });
            flankDetached = true;
          }
        }
        const line = fighters().filter((entity) => !westIds.has(entity.id));
        if (line.length > 0) {
          commands.push({ kind: 'attackMove', player: 1, units: line.map((entity) => entity.id), ...LINE });
        }
      }
      return commands;
    };

    const step = () => {
      const botCommands = [...bots.values()].flatMap((bot) => bot.tick(events));
      events = game.advance([...humanCommands(), ...botCommands]);
      runtime.tick(events);
      for (const id of ['t04-wave-a', 't06-wave-b', 't07-wave-c', 't08-wave-d', 't10-mopup-gate']) {
        const key = `${id}:`;
        if (runtime.hasFired(id) && !milestones.some((entry) => entry.startsWith(key))) {
          milestones.push(`${key}${state.tick}:${fighters().length}`);
        }
      }
    };

    while (!runtime.isEnded && state.tick < 50000) step();

    expect(outcome).toEqual({ victory: 1, defeat: 0 });
    expect(runtime.objectiveState('obj-hold-camp')).toBe('complete');
    expect(runtime.objectiveState('obj-trap')).toBe('complete');
    expect(runtime.objectiveState('obj-cressingham')).toBe('complete');
    expect(runtime.objectiveState('obj-ford')).toBe('complete');
    expect(ops.getEntityByRef('wallace')).not.toBeNull();
    expect([...state.entities.values()].some((entity) => (
      entity.player === 1 && entity.defId === 'townCenter' && alive(entity)
    ))).toBe(true);
    expect(fighters().length, milestones.join(', ')).toBeGreaterThanOrEqual(6);
  }, 120000);
});
