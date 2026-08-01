// Bot opponent integration (GDD Practice: bots boom, age up, raise an army,
// and attack). A standard bot plays a real seeded practice map headlessly
// against an idle opponent; the run must show a working economy (villagers
// trained, resources dropped), the Feudal AND Castle Age (the profile's maxAge
// — regression: flat piggy-bank floors once let army production drain every
// surplus so 800f never accumulated), military production, and actual
// offensive pressure on the idle player. Deterministic: same seed + same bot
// code = the same run everywhere.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { Command, GameConfig, SimEvent } from '@bf/sim/types';
import { entitiesOf, grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import { createBot } from './index';

const BOT = 2;
const IDLE = 1;
const TICK_CAP = 54000; // ~45 sim-minutes (the run exits early once everything is proven)

const config = (): GameConfig => ({
  seed: 11,
  map: { type: 'practice-random', width: 96, height: 96 },
  players: [
    { name: 'Idle', civ: 'scots', team: 0, isHuman: true, color: 0 },
    { name: 'Bot', civ: 'english', team: 0, isHuman: false, color: 1 },
  ],
  popCap: 100,
});

describe('createBot (standard)', () => {
  it('booms, reaches Feudal AND Castle, raises an army, and attacks the enemy', { timeout: 180000 }, () => {
    const game = createGame(config());
    const bot = createBot(game, BOT, 'standard');

    let villagersTrained = 0;
    let militaryTrained = 0;
    let feudalReached = false;
    let castleReached = false;
    let buildingsCompleted = 0;
    let dropsByBot = 0;
    let idleLosses = 0;

    for (let t = 0; t < TICK_CAP && !game.state.finished; t++) {
      const events: SimEvent[] = game.advance(bot.tick());
      for (const ev of events) {
        switch (ev.kind) {
          case 'unitTrained':
            if (ev.player !== BOT) break;
            if (ev.defId === 'villager') villagersTrained++;
            else militaryTrained++;
            break;
          case 'ageAdvanced':
            if (ev.player === BOT && ev.age === 'feudal') feudalReached = true;
            if (ev.player === BOT && ev.age === 'castle') castleReached = true;
            break;
          case 'buildingComplete':
            if (ev.player === BOT) buildingsCompleted++;
            break;
          case 'resourceDropped':
            if (ev.player === BOT) dropsByBot += ev.amount;
            break;
          case 'entityDied':
            if (ev.player === IDLE && ev.killer === BOT) idleLosses++;
            break;
          default:
            break;
        }
      }
      // stop early once the full loop has been demonstrated (keeps the test fast)
      if (castleReached && villagersTrained >= 10 && militaryTrained >= 8 && idleLosses >= 1) break;
    }

    // economy boom
    expect(villagersTrained).toBeGreaterThanOrEqual(10);
    expect(buildingsCompleted).toBeGreaterThanOrEqual(4); // camps + houses + barracks…
    expect(dropsByBot).toBeGreaterThan(1000);
    // age-ups all the way to the profile's maxAge — the piggy bank must reserve
    // the full Castle cost or the army eats every surplus above the old floors
    expect(feudalReached).toBe(true);
    expect(castleReached).toBe(true);
    // army + attack: the idle player must actually lose something to the bot
    expect(militaryTrained).toBeGreaterThanOrEqual(8);
    expect(idleLosses).toBeGreaterThanOrEqual(1);
  });

  // Straggler sweep: raiders whose follow-through is severed mid-wave (order
  // interrupted, target gone from a stale rally point) must be re-pointed at
  // the live objective instead of idling outside the enemy town indefinitely.
  it('re-issues attack-move for wave members that go idle away from base', () => {
    const militiaSpec = Array.from({ length: 10 }, (_, i) => ({
      defId: 'militia', player: BOT as 2, tileX: 28 + (i % 5), tileY: 30 + Math.floor(i / 5),
    }));
    const game = createGame(scenarioConfig(7, grassMap(64, 64), [
      { defId: 'townCenter', player: BOT, tileX: 6, tileY: 6 },
      { defId: 'townCenter', player: IDLE, tileX: 56, tileY: 56 },
      ...militiaSpec,
    ], [player({ name: 'Idle', isHuman: true }), player({ name: 'Bot', civ: 'english', color: 1 })]));
    const bot = createBot(game, BOT, 'standard');
    const militiaIds = entitiesOf(game.state.entities, BOT, 'militia').map((e) => e.id);
    const enemyTc = entitiesOf(game.state.entities, IDLE, 'townCenter')[0];
    expect(militiaIds).toHaveLength(10);

    // tick 0: 10 military >= attackArmy — the wave launches at the enemy TC
    const launch = bot.tick();
    expect(launch.some((c) => c.kind === 'attackMove')).toBe(true);
    game.advance(launch);
    // walk a while, then sever their follow-through mid-route (stand-in for the
    // live failure: idle raiders strung along the attack route with empty LOS)
    while (game.state.tick < 29) game.advance(bot.tick());
    game.advance([{ kind: 'stop', player: BOT, units: militiaIds } as Command]);
    expect(game.state.tick).toBe(30);

    // next decide pass: the target is alive and the 30 s wave re-issue is far
    // away — WITHOUT the sweep the idle strays would receive no order here
    const cmds = bot.tick();
    const sweep = cmds.find((c): c is Extract<Command, { kind: 'attackMove' }> => c.kind === 'attackMove');
    expect(sweep).toBeDefined();
    expect(sweep!.units).toEqual(expect.arrayContaining(militiaIds));
    expect(sweep!.x).toBe(enemyTc.x);
    expect(sweep!.y).toBe(enemyTc.y);
  });

  it('recalls idle military stranded away from base when no wave is running', () => {
    const militiaSpec = Array.from({ length: 5 }, (_, i) => ({
      defId: 'militia', player: BOT as 2, tileX: 28 + i, tileY: 30,
    }));
    const game = createGame(scenarioConfig(8, grassMap(64, 64), [
      { defId: 'townCenter', player: BOT, tileX: 6, tileY: 6 },
      { defId: 'townCenter', player: IDLE, tileX: 56, tileY: 56 },
      ...militiaSpec,
    ], [player({ name: 'Idle', isHuman: true }), player({ name: 'Bot', civ: 'english', color: 1 })]));
    const bot = createBot(game, BOT, 'standard');
    const militiaIds = entitiesOf(game.state.entities, BOT, 'militia').map((e) => e.id);
    const home = entitiesOf(game.state.entities, BOT, 'townCenter')[0];

    // 5 military < attackArmy: no wave — the sweep must send the strays home
    const cmds = bot.tick();
    const recall = cmds.find((c): c is Extract<Command, { kind: 'move' }> => c.kind === 'move');
    expect(recall).toBeDefined();
    expect(recall!.units).toEqual(expect.arrayContaining(militiaIds));
    expect(recall!.x).toBe(home.x);
    expect(recall!.y).toBe(home.y);
  });

  it('all three GDD difficulties construct and issue commands deterministically', () => {
    for (const diff of ['easy', 'standard', 'hard'] as const) {
      const a = createGame(config());
      const b = createGame(config());
      const botA = createBot(a, BOT, diff);
      const botB = createBot(b, BOT, diff);
      for (let t = 0; t < 400; t++) {
        const ca = botA.tick();
        const cb = botB.tick();
        expect(cb).toEqual(ca); // same state, same decisions — no hidden randomness
        a.advance(ca);
        b.advance(cb);
      }
      expect(b.hash()).toBe(a.hash());
    }
  });
});
