import { describe, expect, it } from 'vitest';
import { createGame } from '@bf/sim';
import type { GameConfig } from '@bf/sim/types';
import { CommandAdmission, ORDER_NO_LONGER_AVAILABLE } from './admission';
import { SimLoop, TICK_MS } from './simloop';

function gameWithFood(food: number) {
  const config: GameConfig = {
    seed: 1,
    map: {
      type: 'scenario',
      map: {
        width: 12,
        height: 12,
        terrain: new Uint8Array(144),
        terrainIds: ['grass'],
      },
      entities: [
        { defId: 'townCenter', player: 1, tileX: 2, tileY: 2 },
        { defId: 'villager', player: 1, tileX: 6, tileY: 6 },
      ],
      revealAll: true,
    },
    players: [{
      name: 'Human', civ: 'scots', team: 1, isHuman: true, color: 0,
      startingResources: { food, wood: 500, gold: 500, stone: 500 },
    }],
    popCap: 100,
  };
  return createGame(config);
}

describe('CommandAdmission', () => {
  it('rejects a rapid second train order after the first claims the stockpile', () => {
    const game = gameWithFood(50);
    const loop = new SimLoop(game);
    const feedback: Array<{ label: string; undo: (() => void) | null }> = [];
    const admission = new CommandAdmission(game, loop, (label, undo) => {
      feedback.push({ label, undo });
    });
    const tc = [...game.state.entities.values()].find((entity) => entity.defId === 'townCenter')!;

    expect(admission.issueWithUndo(
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
      'Training Villager',
      null,
    )).toBe(true);
    expect(admission.issueWithUndo(
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
      'Training Villager',
      null,
    )).toBe(false);
    expect(feedback.map((entry) => entry.label)).toEqual([
      'Training Villager', ORDER_NO_LONGER_AVAILABLE,
    ]);
    loop.update(TICK_MS);
    expect(tc.trainQueue).toHaveLength(1);
  });

  it('retracts before the tick and cancels the exact applied queue item afterwards', () => {
    const game = gameWithFood(150);
    const loop = new SimLoop(game);
    const undos: Array<() => void> = [];
    const admission = new CommandAdmission(game, loop, (_label, undo) => {
      if (undo) undos.push(undo);
    });
    const tc = [...game.state.entities.values()].find((entity) => entity.defId === 'townCenter')!;
    const train = () => admission.issueWithUndo(
      { kind: 'train', player: 1, buildingId: tc.id, defId: 'villager' },
      'Training Villager',
      null,
    );

    expect(train()).toBe(true);
    undos[0]();
    loop.update(TICK_MS);
    expect(tc.trainQueue).toHaveLength(0);

    expect(train()).toBe(true);
    expect(train()).toBe(true);
    loop.update(TICK_MS);
    expect(tc.trainQueue).toHaveLength(2);
    const secondRequest = tc.trainQueue![1].requestId;
    undos[1]();
    loop.update(TICK_MS);
    expect(tc.trainQueue).toHaveLength(1);
    expect(tc.trainQueue![0].requestId).toBe(secondRequest);
  });
});
