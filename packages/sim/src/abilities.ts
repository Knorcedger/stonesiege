// Deterministic hero abilities and progression for custom modes. The first Arena
// kit is deliberately data-driven: adding another spell does not add a new command.

import { gameData } from '@bf/data';
import { FP, fp, secondsToTicks } from './types';
import type { Command, Entity, SimEvent } from './types';
import type { SimState } from './internal';
import { facingFromDelta, isqrt } from './internal';
import { applyDamage, isEnemy } from './damage';

const MAX_HERO_LEVEL = 5;
const LEVEL_HP_GAIN = 60;
const LEVEL_DAMAGE_GAIN = 6;

const xpNeeded = (level: number): number => level * 100;

function deathXp(defId: string): number {
  if (gameData.buildings[defId]) return 60;
  if (gameData.units[defId]?.abilities?.length) return 100;
  return 25;
}

/** Cast the selected hero's data-defined area ability, clamping long taps to its range. */
export function handleCastAbility(
  state: SimState,
  cmd: Extract<Command, { kind: 'castAbility' }>,
  events: SimEvent[],
): void {
  const hero = state.entities.get(cmd.unitId);
  if (!hero || hero.kind !== 'unit' || hero.player !== cmd.player || hero.hp <= 0) return;
  if (hero.garrisonedIn !== undefined) return;
  const ability = gameData.units[hero.defId]?.abilities?.find((candidate) =>
    candidate.id === cmd.abilityId);
  if (!ability || state.tick < (hero.abilityReadyTicks?.[ability.id] ?? 0)) return;

  const range = fp(ability.range);
  const dx = cmd.x - hero.x;
  const dy = cmd.y - hero.y;
  const distance = isqrt(dx * dx + dy * dy);
  let x = cmd.x;
  let y = cmd.y;
  if (distance > range) {
    x = hero.x + Math.trunc((dx * range) / distance);
    y = hero.y + Math.trunc((dy * range) / distance);
  }
  x = Math.max(FP / 2, Math.min(state.map.width * FP - FP / 2, x));
  y = Math.max(FP / 2, Math.min(state.map.height * FP - FP / 2, y));

  const cooldownTicks = secondsToTicks(ability.cooldownSeconds);
  const radius = fp(ability.radius);
  hero.abilityReadyTicks ??= {};
  hero.abilityReadyTicks[ability.id] = state.tick + cooldownTicks;
  if (dx !== 0 || dy !== 0) hero.facing = facingFromDelta(dx, dy);
  events.push({
    kind: 'abilityCast', unitId: hero.id, player: hero.player, abilityId: ability.id,
    x, y, radius, cooldownTicks,
  });

  const damage = ability.damage + ((hero.heroLevel ?? 1) - 1) * LEVEL_DAMAGE_GAIN;
  const radiusSq = radius * radius;
  // Copy the values because damage can turn units into corpses while this pass runs.
  for (const target of [...state.entities.values()]) {
    if (target.kind !== 'unit' || target.hp <= 0) continue;
    if (!isEnemy(state, hero.player, target.player)) continue;
    const tx = target.x - x;
    const ty = target.y - y;
    if (tx * tx + ty * ty > radiusSq) continue;
    applyDamage(state, {
      attackerId: hero.id, attackerPlayer: hero.player, melee: false,
      fromX: hero.x, fromY: hero.y,
    }, target, damage, events);
  }
}

/** Award kill XP after every damage-producing system has completed for this tick. */
export function tickHeroProgression(state: SimState, events: SimEvent[]): void {
  const deaths = events.filter((event): event is Extract<SimEvent, { kind: 'entityDied' }> =>
    event.kind === 'entityDied' && event.killerId !== undefined);
  for (const death of deaths) {
    const hero = state.entities.get(death.killerId!);
    if (!hero || hero.hp <= 0 || !gameData.units[hero.defId]?.abilities?.length) continue;
    if (!isEnemy(state, hero.player, death.player)) continue;
    hero.heroXp = (hero.heroXp ?? 0) + deathXp(death.defId);
    while ((hero.heroLevel ?? 1) < MAX_HERO_LEVEL && hero.heroXp >= xpNeeded(hero.heroLevel ?? 1)) {
      hero.heroXp -= xpNeeded(hero.heroLevel ?? 1);
      hero.heroLevel = (hero.heroLevel ?? 1) + 1;
      hero.maxHp += LEVEL_HP_GAIN;
      hero.hp += LEVEL_HP_GAIN;
      events.push({ kind: 'heroLeveled', unitId: hero.id, player: hero.player, level: hero.heroLevel });
    }
  }
}
