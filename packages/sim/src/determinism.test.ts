import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { fp } from './types';
import type { Command, Game } from './types';
import { entitiesOf, practiceConfig, player } from './testutil';

/** Build the scripted command stream from a game's own (deterministic) state. */
function scriptFor(game: Game, tick: number): Command[] {
  const s = game.state;
  const tc1 = entitiesOf(s.entities, 1, 'townCenter')[0];
  const vills1 = entitiesOf(s.entities, 1, 'villager').map((e) => e.id);
  const scout1 = entitiesOf(s.entities, 1, 'scout')[0];
  const vills2 = entitiesOf(s.entities, 2, 'villager').map((e) => e.id);
  const cmds: Command[] = [];
  switch (tick) {
    case 5:
      cmds.push({ kind: 'move', player: 1, units: vills1, x: fp(tc1.tileX + 10), y: fp(tc1.tileY + 6) });
      cmds.push({ kind: 'move', player: 2, units: vills2, x: fp(30), y: fp(90) });
      break;
    case 10:
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' });
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' });
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' });
      break;
    case 60:
      cmds.push({ kind: 'cancelTrain', player: 1, buildingId: tc1.id, index: 2 });
      break;
    case 120:
      cmds.push({ kind: 'setRally', player: 1, buildingId: tc1.id, x: fp(tc1.tileX - 5), y: fp(tc1.tileY + 8) });
      break;
    case 300:
      if (scout1) cmds.push({ kind: 'attackMove', player: 1, units: [scout1.id], x: fp(60), y: fp(60) });
      break;
    case 500:
      cmds.push({ kind: 'stop', player: 1, units: vills1 });
      break;
    case 700:
      cmds.push({ kind: 'move', player: 1, units: [...vills1, ...(scout1 ? [scout1.id] : [])], x: fp(tc1.tileX), y: fp(tc1.tileY + 5) });
      // illegal commands must be dropped silently, identically in both runs
      cmds.push({ kind: 'move', player: 1, units: [999999], x: fp(3), y: fp(3) });
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'paladin' });
      cmds.push({ kind: 'garrison', player: 2, units: vills2, targetId: tc1.id }); // wave-2 no-op
      break;
    default:
      break;
  }
  return cmds;
}

const CHECKPOINTS = [100, 250, 500, 750, 1000];

function runScripted(seed: number): number[] {
  const game = createGame(practiceConfig(seed, [player({ name: 'A', civ: 'scots' }), player({ name: 'B', civ: 'english' })]));
  const hashes: number[] = [];
  for (let t = 1; t <= 1000; t++) {
    game.advance(scriptFor(game, t));
    if (CHECKPOINTS.includes(t)) hashes.push(game.hash());
  }
  return hashes;
}

describe('determinism', () => {
  it('two games with the same seed and commands hash identically at every checkpoint', () => {
    const a = runScripted(0xbf01);
    const b = runScripted(0xbf01);
    expect(a).toEqual(b);
  });

  it('hash evolves over time and differs across seeds', () => {
    const a = runScripted(0xbf01);
    const c = runScripted(0xbf02);
    expect(new Set(a).size).toBeGreaterThan(1);
    expect(a).not.toEqual(c);
  });
});
