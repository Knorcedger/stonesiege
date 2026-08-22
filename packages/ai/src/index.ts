// Bot opponents (GDD Practice: seven levels from Beginner through Hardcore; campaign
// bots take an AiProfile from scenario triggers).
//
// The bot is an external controller exactly like a human: it reads game.state,
// returns Command[] each tick, and the sim cannot tell it from a player
// (ARCHITECTURE: command pattern). Enemy knowledge is fog-honest — the military
// manager acts only on sightings recorded while the enemy was actually visible.
//
// Determinism: decisions are a pure function of sim state + internal counters that
// evolve deterministically + a SimRng seeded at bot creation. No Math.random, no
// wall clock — the same seeds reproduce the identical command stream, so headless
// bot-vs-bot tests and match-snapshot replays are exact.

import { SimRng } from '@bf/sim/rng';
import { AGES } from '@bf/sim/types';
import type { Command, Game, PlayerId, SimEvent } from '@bf/sim/types';
import { createEconomy } from './economy';
import { EnemyMemory } from './memory';
import { GaiaResourceMemory } from './resourceMemory';
import { createMilitary } from './military';
import { buildSnapshot, makePlan } from './snapshot';
import type { Ctx } from './snapshot';
import { tuningFor } from './tuning';
import type { AiProfile, Bot, BotDifficulty, BotRect, CreateBotOpts } from './types';

export type { AiProfile, Bot, BotDifficulty, BotRect, CreateBotOpts } from './types';
export { BOT_DIFFICULTIES } from './types';
export type { Tuning } from './tuning';

export function createBot(
  game: Game,
  player: PlayerId,
  opts: BotDifficulty | CreateBotOpts = {},
): Bot {
  const o: CreateBotOpts = typeof opts === 'string' ? { difficulty: opts } : opts;
  const difficulty: BotDifficulty = o.difficulty ?? 'standard';
  let profile: AiProfile = o.profile ?? 'standard';

  const ctx: Ctx = {
    game,
    player,
    // decorrelate per-seat streams so two bots sharing a seed do not mirror moves
    rng: new SimRng(((o.seed ?? 0x5eed) ^ Math.imul(player + 1, 0x9e3779b9)) >>> 0),
    tuning: tuningFor(difficulty, profile),
    memory: new EnemyMemory(),
    resourceMemory: new GaiaResourceMemory(),
    enemyAgeIdx: 0,
  };
  const economy = createEconomy(ctx);
  const military = createMilitary(ctx);
  let peakVillagers = 0; // wolf losses must not reset the age-up plan
  let peakMilitary = 0; // raid losses must not reset the raider's age-up plan
  const saving = { mark: -1, markTick: -1, relaxUntil: -1, stalls: 0 }; // age-up bank progress state

  const decide = (): Command[] => {
    const snap = buildSnapshot(ctx);
    if (snap === null) return [];
    peakVillagers = Math.max(peakVillagers, snap.villagers.length + snap.garrisonedVillagers);
    peakMilitary = Math.max(peakMilitary, snap.military.length);
    const plan = makePlan(ctx, snap, peakVillagers, peakMilitary, saving);
    const cmds: Command[] = [];
    // defense first — those commands must never fall off the batch cap
    military.decide(snap, plan, cmds);
    economy.decide(snap, plan, cmds);
    return cmds.slice(0, ctx.tuning.batchCap);
  };

  return {
    player,
    difficulty,
    get profile(): AiProfile { return profile; },
    setProfile(next: AiProfile): void {
      profile = next;
      ctx.tuning = tuningFor(difficulty, next);
    },
    forceAttack(targetArea?: BotRect): void {
      military.forceAttack(targetArea);
    },
    tick(events?: SimEvent[]): Command[] {
      const st = game.state;
      if (st.finished) return [];
      if (events !== undefined && events.length > 0) {
        ctx.memory.onEvents(events);
        for (const ev of events) {
          if (ev.kind === 'underAttack' && ev.player === player) {
            military.onAlarm(ev.x, ev.y, st.tick);
          } else if (ev.kind === 'ageAdvanced' && ev.player !== player) {
            // age-up horns are announced to the whole match (as in AoE2) — this is
            // public, fog-honest intel; it feeds the resign hopelessness test.
            // Mirrors the snapshot's hostileTo: same non-zero team = ally, skip.
            const myTeam = st.players[player]?.setup.team ?? 0;
            const theirTeam = st.players[ev.player]?.setup.team ?? 0;
            if (myTeam === 0 || theirTeam === 0 || myTeam !== theirTeam) {
              ctx.enemyAgeIdx = Math.max(ctx.enemyAgeIdx, AGES.indexOf(ev.age));
            }
          }
        }
      }
      // APM throttle; the phase offset staggers rival bots off each other's ticks
      if (st.tick % ctx.tuning.interval !== (player * 7) % ctx.tuning.interval) return [];
      return decide();
    },
  };
}

/**
 * ScenarioOps hook (trigger effect `aiProfile` → ScenarioOps.setAiProfile): swap a
 * bot's behavior profile mid-scenario. Takes effect on its next decision pass.
 */
export function applyAiProfile(bot: Bot, profile: AiProfile): void {
  bot.setProfile(profile);
}

/**
 * ScenarioOps hook (trigger effect `aiAttackNow` → ScenarioOps.aiAttackNow): launch
 * an attack wave immediately with whatever military the bot has — thresholds,
 * cooldowns, and profile restrictions (even passive) are overridden once. With a
 * targetArea the wave hunts inside that rect (falling back to walking in blind);
 * without one it picks its usual best target.
 */
export function attackNow(bot: Bot, targetArea?: BotRect): void {
  bot.forceAttack(targetArea);
}
