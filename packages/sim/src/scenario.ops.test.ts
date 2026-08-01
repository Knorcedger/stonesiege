// Sim-side coverage for the OPS_NEEDED.md asks (packages/scenarios): spawn nudging off
// occupied tiles, the GameConfig.maxAge tech ceiling, and per-player pop caps.

import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import type { AgeId, Entity, Game } from './types';
import { grassMap, player, scenarioConfig } from './testutil';

const byRef = (game: Game, ref: string): Entity => {
  const id = game.state.refs.get(ref);
  expect(id, `ref ${ref}`).toBeDefined();
  return game.state.entities.get(id!)!;
};

describe('SimOps.spawn nudging (OPS_NEEDED.md spawn semantics)', () => {
  function makeGame(): Game {
    const entities = [
      { defId: 'tree', player: 0, tileX: 5, tileY: 5 },
      { defId: 'townCenter', player: 1, tileX: 12, tileY: 12 },
    ];
    return createGame(scenarioConfig(3, grassMap(30, 30), entities, [player()]));
  }

  it('spawns exactly on the requested tile when it is free', () => {
    const game = makeGame();
    game.ops!.spawn([{ defId: 'militia', player: 1, tileX: 8, tileY: 8, ref: 'm' }]);
    const m = byRef(game, 'm');
    expect([m.tileX, m.tileY]).toEqual([8, 8]);
  });

  it('nudges a unit off a blocked tile instead of spawning inside the blocker', () => {
    const game = makeGame();
    game.ops!.spawn([{ defId: 'militia', player: 1, tileX: 5, tileY: 5, ref: 'm' }]);
    const m = byRef(game, 'm');
    expect([m.tileX, m.tileY]).not.toEqual([5, 5]); // the tree tile
    expect(game.isWalkable(m.tileX, m.tileY)).toBe(true);
    expect(Math.max(Math.abs(m.tileX - 5), Math.abs(m.tileY - 5))).toBeLessThanOrEqual(8);
  });

  it('nudges a resource off an occupied tile without stacking blockers', () => {
    const game = makeGame();
    game.ops!.spawn([{ defId: 'goldMine', player: 0, tileX: 5, tileY: 5, ref: 'g' }]);
    const g = byRef(game, 'g');
    expect([g.tileX, g.tileY]).not.toEqual([5, 5]);
    expect(game.isWalkable(g.tileX, g.tileY)).toBe(false); // the mine now blocks ITS tile
  });

  it('relocates a whole building footprint clear of obstructions', () => {
    const game = makeGame();
    // anchor at (11, 11): free itself, but the 4×4 TC footprint at (12,12) overlaps
    game.ops!.spawn([{ defId: 'townCenter', player: 1, tileX: 11, tileY: 11, ref: 'tc2' }]);
    const tc2 = byRef(game, 'tc2');
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        // every footprint tile is blocked by exactly this TC (it was free before)
        expect(game.isWalkable(tc2.tileX + dx, tc2.tileY + dy)).toBe(false);
      }
    }
    const overlaps = tc2.tileX < 12 + 4 && tc2.tileX + 4 > 12 && tc2.tileY < 12 + 4 && tc2.tileY + 4 > 12;
    expect(overlaps, 'footprints must not overlap').toBe(false);
  });

  it('drops the spawn (no id, no ref) when nothing fits within the nudge ring', () => {
    // 3×3 map fully forested: no free tile anywhere
    const entities: Array<{ defId: string; player: number; tileX: number; tileY: number }> = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) entities.push({ defId: 'tree', player: 0, tileX: x, tileY: y });
    const game = createGame(scenarioConfig(3, grassMap(3, 3), entities, [player()]));
    const ids = game.ops!.spawn([{ defId: 'militia', player: 1, tileX: 1, tileY: 1, ref: 'm' }]);
    expect(ids).toEqual([]);
    expect(game.state.refs.has('m')).toBe(false);
  });
});

describe('GameConfig.maxAge tech ceiling (OPS_NEEDED.md gap 3)', () => {
  function ageGame(maxAge?: AgeId): Game {
    const entities = [
      { defId: 'townCenter', player: 1, tileX: 4, tileY: 4, ref: 'tc' },
      { defId: 'barracks', player: 1, tileX: 10, tileY: 4 },
      { defId: 'mill', player: 1, tileX: 10, tileY: 8 },
    ];
    return createGame({
      seed: 9,
      map: { type: 'scenario', map: grassMap(24, 24), entities },
      players: [player({ startingResources: { food: 900 } })],
      popCap: 100,
      ...(maxAge !== undefined ? { maxAge } : {}),
    });
  }

  it('without a ceiling the same setup may research Feudal', () => {
    const game = ageGame();
    const tc = byRef(game, 'tc');
    game.advance([{ kind: 'research', player: 1, buildingId: tc.id, techId: 'feudalAge' }]);
    expect(tc.trainQueue!.some((q) => q.techId === 'feudalAge')).toBe(true);
  });

  it("maxAge 'dark' blocks the Feudal age-up (wallace-1 rule)", () => {
    const game = ageGame('dark');
    const tc = byRef(game, 'tc');
    game.advance([{ kind: 'research', player: 1, buildingId: tc.id, techId: 'feudalAge' }]);
    expect(tc.trainQueue!.length).toBe(0);
    expect(game.state.players[1].stockpile.food).toBe(900); // nothing was charged
  });

  it("maxAge 'feudal' allows Feudal but blocks Castle", () => {
    const game = ageGame('feudal');
    const tc = byRef(game, 'tc');
    game.advance([{ kind: 'research', player: 1, buildingId: tc.id, techId: 'feudalAge' }]);
    expect(tc.trainQueue!.some((q) => q.techId === 'feudalAge')).toBe(true);
    // fast-forward the research, then try Castle
    for (let t = 0; t < 130 * 20 + 5 && game.state.players[1].age === 'dark'; t++) game.advance([]);
    expect(game.state.players[1].age).toBe('feudal');
    game.advance([{ kind: 'research', player: 1, buildingId: tc.id, techId: 'castleAge' }]);
    expect(tc.trainQueue!.some((q) => q.techId === 'castleAge')).toBe(false);
  });
});

describe('per-player pop caps (OPS_NEEDED.md gap 2)', () => {
  it('PlayerSetup.popCap caps below the global GameConfig.popCap', () => {
    const entities = [
      { defId: 'townCenter', player: 1, tileX: 4, tileY: 4 }, // popProvided 5
      { defId: 'townCenter', player: 2, tileX: 20, tileY: 20 },
    ];
    const game = createGame(scenarioConfig(4, grassMap(30, 30), entities, [
      player({ popCap: 3 }),
      player({ civ: 'english' }),
    ]));
    expect(game.state.players[1].popCap).toBe(3); // per-player ceiling wins
    expect(game.state.players[2].popCap).toBe(5); // provided, under the global 200
  });
});
