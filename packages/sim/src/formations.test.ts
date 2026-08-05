import { describe, expect, it } from 'vitest';
import { fp } from './types';
import { formationOffsets } from './formations';
import { createGame } from './game';
import { grassMap, player, scenarioConfig } from './testutil';

describe('group formations', () => {
  it('lays out distinct centered line, rectangle, and wedge slots', () => {
    const line = formationOffsets(5, 'line');
    expect(new Set(line.map((p) => `${p.lateral},${p.depth}`)).size).toBe(5);
    expect(line.every((p) => p.depth === 0)).toBe(true);
    expect(line.reduce((sum, p) => sum + p.lateral, 0)).toBe(0);

    const rectangle = formationOffsets(8, 'rectangle');
    expect(new Set(rectangle.map((p) => `${p.lateral},${p.depth}`)).size).toBe(8);
    expect(new Set(rectangle.map((p) => p.depth)).size).toBeGreaterThan(1);

    const wedge = formationOffsets(7, 'wedge');
    expect(new Set(wedge.map((p) => `${p.lateral},${p.depth}`)).size).toBe(7);
    expect(wedge[0].depth).toBeGreaterThan(wedge[1].depth);
    expect(wedge[1].lateral).toBeLessThan(wedge[2].lateral);
  });

  it('assigns separate destinations and preserves them in attack-move intents', () => {
    const game = createGame(scenarioConfig(27, grassMap(40, 40), [
      { defId: 'militia', player: 1, tileX: 5, tileY: 5, ref: 'm0' },
      { defId: 'militia', player: 1, tileX: 6, tileY: 5, ref: 'm1' },
      { defId: 'militia', player: 1, tileX: 7, tileY: 5, ref: 'm2' },
      { defId: 'militia', player: 1, tileX: 8, tileY: 5, ref: 'm3' },
    ], [player()]));
    const ids = ['m0', 'm1', 'm2', 'm3'].map((ref) => game.state.refs.get(ref)!);
    game.advance([{
      kind: 'attackMove', player: 1, units: ids, x: fp(25), y: fp(20), formation: 'rectangle',
    }]);

    const destinations = ids.map((id) => {
      const intent = game.state.entities.get(id)!.intent;
      expect(intent?.kind).toBe('attackMove');
      return intent?.kind === 'attackMove' ? `${intent.x},${intent.y}` : '';
    });
    expect(new Set(destinations).size).toBe(ids.length);
  });

  it('accepts UI move commands whose optional formation property is present but undefined', () => {
    const game = createGame(scenarioConfig(28, grassMap(30, 30), [
      { defId: 'militia', player: 1, tileX: 5, tileY: 5, ref: 'm0' },
    ], [player()]));
    const id = game.state.refs.get('m0')!;
    const unit = game.state.entities.get(id)!;
    const startX = unit.x;

    game.advance([{
      kind: 'move', player: 1, units: [id], x: fp(20), y: fp(5), formation: undefined,
    }]);
    for (let tick = 0; tick < 20 && unit.x === startX; tick++) game.advance([]);

    expect(unit.x).toBeGreaterThan(startX);
  });
});
