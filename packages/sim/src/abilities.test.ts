import { describe, expect, it } from 'vitest';
import { createGame, createGameFromSnapshot } from './game';
import { FP, fp } from './types';
import type { Command, Game, GameConfig } from './types';

function arenaGame(): Game {
  const width = 24;
  const height = 16;
  const config: GameConfig = {
    seed: 77,
    map: {
      type: 'scenario',
      map: {
        width, height, terrain: new Uint8Array(width * height), terrainIds: ['grass'],
      },
      entities: [
        { defId: 'arenaWarden', player: 1, tileX: 2, tileY: 7, ref: 'hero' },
        { defId: 'militia', player: 1, tileX: 18, tileY: 10, ref: 'friend' },
        { defId: 'militia', player: 2, tileX: 7, tileY: 6, ref: 'enemy-1' },
        { defId: 'militia', player: 2, tileX: 7, tileY: 7, ref: 'enemy-2' },
        { defId: 'militia', player: 2, tileX: 8, tileY: 6, ref: 'enemy-3' },
        { defId: 'militia', player: 2, tileX: 8, tileY: 7, ref: 'enemy-4' },
      ],
      revealAll: true,
    },
    players: [
      { name: 'Warden', civ: 'scots', team: 1, isHuman: true, color: 0 },
      { name: 'Enemy', civ: 'english', team: 2, isHuman: false, color: 1 },
    ],
    popCap: 50,
  };
  return createGame(config);
}

const cast = (
  game: Game, abilityId = 'bannerfall', x = fp(20), y = fp(7),
): Command => ({
  kind: 'castAbility', player: 1, unitId: game.state.refs.get('hero')!, abilityId, x, y,
});

describe('hero abilities', () => {
  it.each([
    'bannerfall', 'shieldbreaker', 'lionCharge', 'crownstorm',
  ])('%s targets an area and damages another character', (abilityId) => {
    const game = arenaGame();
    const [targetId] = game.ops!.spawn([
      { defId: 'militia', player: 2, tileX: 4, tileY: 7, ref: `target-${abilityId}` },
    ]);
    const events = game.advance([cast(game, abilityId, fp(4.5), fp(7.5))]);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'abilityCast', abilityId }));
    expect(events).toContainEqual(expect.objectContaining({ kind: 'entityDied', id: targetId }));
  });

  it('clamps the target, deals hostile-only area damage, starts cooldown, and levels', () => {
    const game = arenaGame();
    const hero = game.state.entities.get(game.state.refs.get('hero')!)!;
    const friend = game.state.entities.get(game.state.refs.get('friend')!)!;
    const events = game.advance([cast(game)]);
    const ability = events.find((event) => event.kind === 'abilityCast');

    expect(ability?.kind).toBe('abilityCast');
    if (ability?.kind !== 'abilityCast') return;
    const dx = ability.x - hero.x;
    const dy = ability.y - hero.y;
    expect(dx * dx + dy * dy).toBeLessThanOrEqual((5 * FP) ** 2);
    expect(friend.hp).toBe(friend.maxHp);
    expect(events.filter((event) => event.kind === 'entityDied')).toHaveLength(4);
    expect(hero.heroLevel).toBe(2);
    expect(hero.heroXp).toBe(0);
    expect(events).toContainEqual({ kind: 'heroLeveled', unitId: hero.id, player: 1, level: 2 });
    expect(hero.abilityReadyTicks?.bannerfall).toBe(80);
    expect(hero.abilityReadyTicks?.shieldbreaker).toBe(0);
  });

  it('tracks cooldowns independently and preserves the complete kit through snapshot restore', () => {
    const game = arenaGame();
    game.advance([cast(game)]);
    const blocked = game.advance([cast(game, 'bannerfall', fp(5), fp(5))]);
    expect(blocked.some((event) => event.kind === 'abilityCast')).toBe(false);
    const secondAbility = game.advance([cast(game, 'shieldbreaker', fp(5), fp(5))]);
    expect(secondAbility.some((event) =>
      event.kind === 'abilityCast' && event.abilityId === 'shieldbreaker')).toBe(true);

    const restored = createGameFromSnapshot(JSON.parse(JSON.stringify(game.serialize())));
    const heroId = game.state.refs.get('hero')!;
    expect(restored.state.entities.get(heroId)?.heroLevel).toBe(2);
    expect(restored.state.entities.get(heroId)?.heroXp).toBe(0);
    expect(restored.state.entities.get(heroId)?.abilityReadyTicks).toEqual({
      bannerfall: 80, shieldbreaker: 142, lionCharge: 0, crownstorm: 0,
    });
    expect(restored.hash()).toBe(game.hash());
  });

  it('silently rejects malformed or unowned casts', () => {
    const game = arenaGame();
    expect(() => game.advance([
      { kind: 'castAbility', player: 1, unitId: 9999, abilityId: 'bannerfall', x: fp(4), y: fp(4) },
      {
        kind: 'castAbility', player: 2, unitId: game.state.refs.get('hero')!,
        abilityId: 'bannerfall', x: fp(4), y: fp(4),
      },
    ])).not.toThrow();
  });
});
