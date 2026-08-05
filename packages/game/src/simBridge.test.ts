import { describe, expect, it } from 'vitest';
import { createGame as createSimGame } from '@bf/sim';
import { grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import { MAP_SIZE_TILES, practiceConfig, unitDisplayStats } from './simBridge';

describe('unitDisplayStats', () => {
  it('resolves stats for the selected unit owner rather than always using the human player', () => {
    const game = createSimGame(scenarioConfig(91, grassMap(20, 20), [], [
      player({ civ: 'scots', startingAge: 'feudal' }),
      player({ civ: 'english', startingAge: 'feudal' }),
    ]));

    const scots = unitDisplayStats(game, 1, 'militia')!;
    const english = unitDisplayStats(game, 2, 'militia')!;
    expect(scots.speed).toBeGreaterThan(english.speed);
    expect(english.speed).toBe(0.9);
  });
});

describe('practiceConfig', () => {
  it('carries map size and 1–3 selected opponent seats into the match', () => {
    const config = practiceConfig({
      mapSize: 'large', opponents: ['easy', 'standard', 'hard'], civ: 'scots', color: 3,
    }, 123);
    expect(config.map).toEqual({
      type: 'practice-random', width: MAP_SIZE_TILES.large, height: MAP_SIZE_TILES.large,
    });
    expect(config.players).toHaveLength(4);
    expect(config.players[0]).toMatchObject({ isHuman: true, civ: 'scots', color: 3 });
    expect(config.players.slice(1).every((p) => !p.isHuman)).toBe(true);
    expect(new Set(config.players.map((p) => p.color)).size).toBe(4);
  });
});
