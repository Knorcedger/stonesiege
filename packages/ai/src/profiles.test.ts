// Profile behavior contracts: raider hits early, passive never attacks, and the
// ScenarioOps hooks (applyAiProfile / attackNow) drive the bot from triggers.

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { createGame } from '@bf/sim';
import type { Command, GameConfig, SimEvent } from '@bf/sim/types';
import { entitiesOf, grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import { applyAiProfile, attackNow, createBot } from './index';

const IDLE = 1;
const BOT = 2;

const practice = (seed: number): GameConfig => ({
  seed,
  map: { type: 'practice-random', width: 96, height: 96 },
  players: [
    { name: 'Idle', civ: 'scots', team: 0, isHuman: true, color: 0 },
    { name: 'Bot', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 100,
});

const isAttackCmd = (c: Command): boolean => c.kind === 'attack' || c.kind === 'attackMove';

describe('ai profiles', () => {
  it('trains the owning civilization’s unique unit from a completed Castle', () => {
    for (const civ of Object.values(gameData.civs)) {
      const game = createGame(scenarioConfig(700, grassMap(48, 48), [
        { defId: 'townCenter', player: IDLE, tileX: 38, tileY: 38 },
        { defId: 'townCenter', player: BOT, tileX: 5, tileY: 5 },
        { defId: 'castle', player: BOT, tileX: 12, tileY: 8, ref: 'castle' },
      ], [
        player({ name: 'Idle', isHuman: true }),
        player({
          name: 'Bot', civ: civ.id, color: 1, startingAge: 'castle',
          startingResources: { food: 5000, wood: 5000, gold: 5000, stone: 5000 },
        }),
      ]));
      const bot = createBot(game, BOT, { profile: 'standard', difficulty: 'easy', seed: 1 });
      const castleId = game.state.refs.get('castle')!;
      let trained = false;
      for (let tick = 0; tick < 120 && !trained; tick++) {
        const commands = bot.tick();
        trained = commands.some((command) => command.kind === 'train'
          && command.buildingId === castleId && command.defId === civ.uniqueUnit);
        game.advance(commands);
      }
      expect(trained, civ.id).toBe(true);
    }
  });

  it('raider launches its first attack before 12 sim-minutes', { timeout: 120000 }, () => {
    const game = createGame(practice(23));
    const bot = createBot(game, BOT, { profile: 'raider', difficulty: 'standard', seed: 4 });
    let firstAttackTick = -1;
    let events: SimEvent[] = [];
    for (let t = 0; t < 14400 && firstAttackTick < 0; t++) {
      const cmds = bot.tick(events);
      if (cmds.some(isAttackCmd)) firstAttackTick = t;
      events = game.advance(cmds);
    }
    expect(firstAttackTick).toBeGreaterThanOrEqual(0);
    expect(firstAttackTick).toBeLessThan(14400); // < 12 sim-minutes
  });

  it('raider still climbs to Feudal after the opening raid (latched age plan)', { timeout: 300000 }, async () => {
    // Pre-fix, makePlan re-checked the LIVE army count against minArmyBeforeAgeUp
    // every pass: raid parties kept dying to TC fire, wantAgeUp kept un-satisfying,
    // and a raider stayed Dark Age forever — dark militia cannot kill a TC, so a
    // permanently-dark raider literally could not win any game. The plan now latches
    // on the PEAK army ever fielded, so the climb starts regardless of casualties.
    const game = createGame(practice(23));
    const bot = createBot(game, BOT, { profile: 'raider', difficulty: 'standard', seed: 23 });
    let feudalAt = -1;
    let events: SimEvent[] = [];
    for (let t = 0; t < 42000 && feudalAt < 0; t++) { // 35 sim-minutes
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance(bot.tick(events));
      for (const ev of events) {
        if (ev.kind === 'ageAdvanced' && ev.player === BOT && ev.age === 'feudal') feudalAt = t;
      }
    }
    expect(feudalAt, 'raider must reach Feudal inside 35 sim-minutes').toBeGreaterThan(0);
  });

  it('passive never issues attack commands but still runs its economy', { timeout: 120000 }, () => {
    const game = createGame(practice(29));
    const bot = createBot(game, BOT, { profile: 'passive', difficulty: 'standard', seed: 4 });
    let attackCmds = 0;
    let villagersTrained = 0;
    let events: SimEvent[] = [];
    for (let t = 0; t < 18000 && !game.state.finished; t++) {
      const cmds = bot.tick(events);
      attackCmds += cmds.filter(isAttackCmd).length;
      events = game.advance(cmds);
      for (const ev of events) {
        if (ev.kind === 'unitTrained' && ev.player === BOT && ev.defId === 'villager') villagersTrained++;
      }
    }
    expect(attackCmds).toBe(0);
    expect(villagersTrained).toBeGreaterThanOrEqual(5); // it booms, it just won't fight
  });

  it('applyAiProfile re-tunes a live bot (ScenarioOps setAiProfile)', () => {
    const game = createGame(practice(31));
    const bot = createBot(game, BOT, { profile: 'passive', difficulty: 'standard', seed: 1 });
    for (let t = 0; t < 90; t++) game.advance(bot.tick());
    expect(bot.profile).toBe('passive');
    applyAiProfile(bot, 'aggressive');
    expect(bot.profile).toBe('aggressive');
  });

  it('attackNow forces an immediate wave into the target area (ScenarioOps aiAttackNow)', () => {
    const militia = Array.from({ length: 6 }, (_, i) => ({
      defId: 'militia', player: BOT, tileX: 10 + (i % 3), tileY: 12 + Math.floor(i / 3),
    }));
    const game = createGame(scenarioConfig(7, grassMap(64, 64), [
      { defId: 'townCenter', player: BOT, tileX: 6, tileY: 6 },
      { defId: 'townCenter', player: IDLE, tileX: 54, tileY: 54 },
      ...militia,
    ], [player({ name: 'Idle', isHuman: true }), player({ name: 'Bot', civ: 'english', color: 1 })]));
    // passive would never attack on its own — the trigger override must win
    const bot = createBot(game, BOT, { profile: 'passive', difficulty: 'standard', seed: 1 });
    const ids = entitiesOf(game.state.entities, BOT, 'militia').map((e) => e.id);
    expect(ids).toHaveLength(6);

    attackNow(bot, { x: 50, y: 50, w: 12, h: 12 });
    let wave: Extract<Command, { kind: 'attackMove' }> | undefined;
    for (let t = 0; t < 120 && wave === undefined; t++) {
      const cmds = bot.tick();
      wave = cmds.find((c): c is Extract<Command, { kind: 'attackMove' }> => c.kind === 'attackMove');
      game.advance(cmds);
    }
    expect(wave).toBeDefined();
    // the wave heads into the target area (fixed-point coords, area is 50..62 tiles)
    expect(wave!.x / 256).toBeGreaterThanOrEqual(50);
    expect(wave!.y / 256).toBeGreaterThanOrEqual(50);
    expect(wave!.units).toEqual(expect.arrayContaining(ids));
  });

  it('re-points idle wave strays and recalls idle military when no wave runs', () => {
    const militia = Array.from({ length: 5 }, (_, i) => ({
      defId: 'militia', player: BOT, tileX: 30 + i, tileY: 32,
    }));
    const game = createGame(scenarioConfig(8, grassMap(64, 64), [
      { defId: 'townCenter', player: BOT, tileX: 6, tileY: 6 },
      ...militia,
    ], [player({ name: 'Idle', isHuman: true }), player({ name: 'Bot', civ: 'english', color: 1 })]));
    const bot = createBot(game, BOT, { profile: 'standard', difficulty: 'standard', seed: 1 });
    const ids = entitiesOf(game.state.entities, BOT, 'militia').map((e) => e.id);

    // 5 military < attackArmy(12): the sweep must gather the strays near home
    let recall: Extract<Command, { kind: 'move' }> | undefined;
    for (let t = 0; t < 90 && recall === undefined; t++) {
      const cmds = bot.tick();
      recall = cmds.find((c): c is Extract<Command, { kind: 'move' }> =>
        c.kind === 'move' && c.units.length === ids.length);
      game.advance(cmds);
    }
    expect(recall).toBeDefined();
    expect(recall!.units).toEqual(expect.arrayContaining(ids));
    // destination is the staging point near the base quadrant, not the far field
    expect(recall!.x / 256).toBeLessThan(20);
    expect(recall!.y / 256).toBeLessThan(20);
  });
});
