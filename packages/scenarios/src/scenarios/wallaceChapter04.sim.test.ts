// Wallace chapter 4 end-to-end balance proof: a basic staged human plan must
// clear the road patrol and then have enough force to destroy Ormesby's hall.
// This runs the real sim, trigger runtime, and authored defender AI.

import { describe, expect, it } from 'vitest';
import { createGame, fp } from '@bf/sim';
import type { Command, Entity, EntityId, Game, SimEvent } from '@bf/sim/types';
import { applyAiProfile, attackNow, createBot, type AiProfile, type Bot } from '@bf/ai';
import { loadScenario } from '../loader';
import { TriggerRuntime } from '../triggers';
import type { ScenarioOps } from '../triggers';
import { campaignGameData } from '../heroes';
import { wallaceChapter04 } from './wallaceChapters';

const SEED = 1297;

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

describe('wallace-04 — the staged assault on Scone is winnable', () => {
  it('breaks the patrol, screens the rams, and destroys Ormesby’s hall', () => {
    const { start, meta } = loadScenario(wallaceChapter04, campaignGameData);
    const game = createGame({
      seed: SEED,
      map: start,
      players: meta.playerSetups,
      popCap: meta.popCap,
      ...(meta.maxAge !== undefined ? { maxAge: meta.maxAge } : {}),
    });
    const state = game.state;
    const bots = new Map<number, Bot>([
      [2, createBot(game, 2, { profile: 'defender', difficulty: 'standard', seed: SEED })],
    ]);
    const { ops, outcome } = makeOps(game, bots);
    const runtime = new TriggerRuntime(wallaceChapter04, ops);

    let events: SimEvent[] = [];
    const pending: Command[] = [];
    const command = (value: Command) => void pending.push(value);
    const step = () => {
      const botCommands = [...bots.values()].flatMap((bot) => bot.tick(events));
      events = game.advance([...pending.splice(0), ...botCommands]);
      runtime.tick(events);
    };
    const until = (label: string, condition: () => boolean, maxTicks: number) => {
      const startTick = state.tick;
      while (!condition()) {
        if (runtime.isEnded) throw new Error(`scenario ended early during '${label}' (defeat=${outcome.defeat})`);
        if (state.tick - startTick > maxTicks) throw new Error(`timeout waiting for ${label}`);
        step();
      }
    };
    const alive = (entity: Entity) => entity.hp > 0 && entity.activity !== 'dying';
    const playerUnits = (reject: (entity: Entity) => boolean = () => false) =>
      [...state.entities.values()]
        .filter((entity) => entity.player === 1 && entity.kind === 'unit' && alive(entity) && !reject(entity));

    step();
    expect(runtime.objectiveState('obj-hold')).toBe('open');
    expect(playerUnits((entity) => entity.defId !== 'batteringRam')).toHaveLength(2);

    const rams = playerUnits((entity) => entity.defId !== 'batteringRam').map((entity) => entity.id);
    const fieldArmy = playerUnits((entity) => entity.defId === 'batteringRam' || entity.defId === 'sheep')
      .map((entity) => entity.id);
    expect(rams).toHaveLength(2);
    expect(fieldArmy).toHaveLength(17);

    // Human-like phase one: keep the slow siege train back and intercept the patrol
    // with the whole field army at the revealed road marker.
    command({ kind: 'attackMove', player: 1, units: fieldArmy, x: fp(57.5), y: fp(46.5) });
    until('the English patrol to break', () => runtime.objectiveState('obj-hold') === 'complete', 9000);
    expect(playerUnits((entity) => entity.defId === 'batteringRam' || entity.defId === 'sheep').length)
      .toBeGreaterThanOrEqual(10);

    // Human-like phase two: protect Wallace, screen the siege engines with the
    // surviving infantry, and give the rams one explicit attack order on the hall.
    const wallaceId = state.refs.get('wallace')!;
    command({ kind: 'move', player: 1, units: [wallaceId], x: fp(56.5), y: fp(47.5) });
    const screen = playerUnits((entity) => (
      entity.defId === 'batteringRam' || entity.defId === 'sheep' || entity.id === wallaceId
    ))
      .map((entity) => entity.id);
    command({ kind: 'attackMove', player: 1, units: screen, x: fp(74.5), y: fp(14.5) });
    const hallId = state.refs.get('ormesby_hall')!;
    command({ kind: 'attack', player: 1, units: rams, targetId: hallId });
    until('Ormesby’s hall to fall', () => runtime.isEnded, 18000);

    expect(outcome).toEqual({ victory: 1, defeat: 0 });
    expect(runtime.objectiveState('obj-hold')).toBe('complete');
    expect(runtime.objectiveState('obj-ormesby')).toBe('complete');
    expect(ops.getEntityByRef('wallace')).not.toBeNull();
  }, 120000);
});
