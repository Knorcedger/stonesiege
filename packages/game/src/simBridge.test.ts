import { describe, expect, it } from 'vitest';
import { createGame as createSimGame } from '@bf/sim';
import { grassMap, player, scenarioConfig } from '@bf/sim/testutil';
import { unitDisplayStats } from './simBridge';

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
