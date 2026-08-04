// Command-validation invariant (types.ts: "Commands are validated (ownership, legality)"):
// one player's command must never move another player's units or cancel their orders.
// Enforced AoE2-style: handleBuild (and Game.canPlace) reject placement when a rival's
// unit stands on the footprint (rivalUnitOnFootprint), and clearance walking only ever
// redirects the building player's own units and Gaia animals — so a 25-wood house drop
// can never teleport an enemy unit or cancel its march.

import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { fp } from './types';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

describe('build command vs enemy units', () => {
  it('placing a foundation on an enemy unit must not teleport it or cancel its orders', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(51, map, [
      { defId: 'villager', player: 1, tileX: 10, tileY: 10 },
      { defId: 'militia', player: 2, tileX: 12, tileY: 10, ref: 'target' },
    ], [player(), player({ civ: 'english' })]));
    const vid = entitiesOf(game.state.entities, 1, 'villager')[0].id;
    const enemy = game.state.entities.get(game.state.refs.get('target')!)!;

    // the enemy is marching south on its owner's orders
    game.advance([{ kind: 'move', player: 2, units: [enemy.id], x: fp(12) + 128, y: fp(20) + 128 }]);
    for (let t = 0; t < 5; t++) game.advance([]); // path answered, unit walking
    expect(enemy.activity).toBe('moving');

    const beforeX = enemy.x, beforeY = enemy.y;
    // player 1 drops a house foundation on the enemy's current tile
    game.advance([{
      kind: 'build', player: 1, units: [vid], defId: 'house',
      tileX: enemy.tileX, tileY: enemy.tileY,
    }]);

    // invariant: in one tick the enemy moves at most its own speed (~12 fixed units for
    // militia; 32 is a generous bound for any unit) — it is never teleported
    const dx = enemy.x - beforeX, dy = enemy.y - beforeY;
    expect(dx * dx + dy * dy, 'enemy unit teleported by a rival build command').toBeLessThanOrEqual(32 * 32);
    // invariant: its move order survives a rival's build command
    expect(enemy.activity, 'enemy move order cancelled by a rival build command').toBe('moving');
  });
});
