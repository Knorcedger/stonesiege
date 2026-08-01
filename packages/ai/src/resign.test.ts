// GDD Victory/Defeat: "Bots resign when hopeless." resignEarly (easy) has always
// done this; pre-fix, standard and hard NEVER resigned — every loss ended in a
// full-map mop-up (observed: a standard bot with no Castle, army <= 4 vs 20+ with
// rams was ground to annihilation at 80.3 minutes). Standard/hard now concede
// behind a STRICTER hopelessness test: town unrebuildable AND the enemy publicly
// an age ahead (age-up horns are announced to the whole match) or 3x the army —
// and only in conquest games, never in trigger-scripted scenarios.

import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { Command, GameConfig, PlayerId, SimEvent } from '@bf/sim/types';
import { createBot } from './index';

const HUMAN = 1;
const BOT = 2;

const config = (): GameConfig => ({
  seed: 21,
  map: { type: 'practice-random', width: 64, height: 64 },
  players: [
    { name: 'Idle', civ: 'scots', team: 0, isHuman: true, color: 0 },
    // zero starting stone: standard mines no stone in the dark age, so once the TC
    // falls the bot provably cannot afford another (the test's "unrebuildable" leg)
    {
      name: 'Bot', civ: 'english', team: 0, isHuman: false, color: 1,
      startingResources: { food: 200, wood: 200, gold: 100, stone: 0 },
    },
  ],
  popCap: 60,
});

describe('standard resigns when hopeless (GDD)', () => {
  it('holds while merely townless, resigns once the enemy is publicly an age ahead', { timeout: 120000 }, async () => {
    const game = createGame(config());
    const bot = createBot(game, BOT, { difficulty: 'standard', seed: 5 });
    let events: SimEvent[] = [];
    const resigns = (cmds: Command[]): boolean => cmds.some((c) => c.kind === 'resign');

    // let the bot establish its town (still dark age at 5 sim-minutes)
    for (let t = 0; t < 6000; t++) {
      if (t % 4000 === 3999) await new Promise((r) => { setImmediate(r); });
      events = game.advance(bot.tick(events));
    }
    expect(game.state.players[BOT].age).toBe('dark');

    // raze the town by fiat: TC gone, workforce cut under 8 (conquest elimination
    // does NOT fire — villagers remain — so any game end below must be a resign)
    const doomed: Command[] = [];
    let villagersLeft = 0;
    for (const e of game.state.entities.values()) {
      if (e.player !== BOT || e.hp <= 0) continue;
      if (e.kind === 'building' && e.defId === 'townCenter') {
        doomed.push({ kind: 'deleteEntity', player: BOT, entityId: e.id });
      } else if (e.kind === 'unit' && e.defId === 'villager' && e.garrisonedIn === undefined) {
        villagersLeft++;
        if (villagersLeft > 5) doomed.push({ kind: 'deleteEntity', player: BOT, entityId: e.id });
      }
    }
    expect(doomed.length).toBeGreaterThan(1);
    events = game.advance(doomed);

    // townless but the enemy is NOT known to be ahead: the bot must keep playing
    // (easy's loose rule would resign right here — standard's stricter test holds)
    for (let t = 0; t < 3600; t++) {
      if (t % 3000 === 2999) await new Promise((r) => { setImmediate(r); });
      const cmds = bot.tick(events);
      expect(resigns(cmds), 'standard resigned without evidence the enemy is ahead').toBe(false);
      events = game.advance(cmds);
    }
    expect(game.state.finished).toBe(false);

    // the whole match hears the age-up horns: the idle player "reaches" Castle.
    // Now townless + unrebuildable + an age behind = hopeless -> resign.
    let resigned = false;
    let winners: PlayerId[] = [];
    events = [...events, { kind: 'ageAdvanced', player: HUMAN, age: 'castle' }];
    for (let t = 0; t < 1200 && !game.state.finished; t++) {
      const cmds = bot.tick(events);
      if (resigns(cmds)) resigned = true;
      events = game.advance(cmds);
      for (const ev of events) if (ev.kind === 'victory') winners = ev.winners;
    }
    expect(resigned, 'standard must resign once hopeless').toBe(true);
    expect(game.state.finished).toBe(true);
    expect(winners).toEqual([HUMAN]);
  });
});
