import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { fp } from './types';
import type { Command, Entity, Game } from './types';
import { entitiesOf, practiceConfig, player } from './testutil';

/** Nearest gaia entity of defId to `from` (deterministic: strict < keeps first-inserted). */
function nearestGaia(game: Game, defId: string, from: Entity | undefined): Entity | undefined {
  if (!from) return undefined;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of game.state.entities.values()) {
    if (e.player !== 0 || e.defId !== defId || (e.amountLeft ?? 1) <= 0) continue;
    const dx = e.tileX - from.tileX, dy = e.tileY - from.tileY;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = e; }
  }
  return best;
}

/** First placeable spot for defId in a deterministic outward ring scan around `from`. */
function placeSpot(game: Game, playerId: number, defId: string, from: Entity | undefined): { x: number; y: number } | null {
  if (!from) return null;
  for (let r = 2; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (game.canPlace(playerId, defId, from.tileX + dx, from.tileY + dy)) {
          return { x: from.tileX + dx, y: from.tileY + dy };
        }
      }
    }
  }
  return null;
}

/** Build the scripted command stream from a game's own (deterministic) state. */
function scriptFor(game: Game, tick: number): Command[] {
  const s = game.state;
  const tc1 = entitiesOf(s.entities, 1, 'townCenter')[0];
  const tc2 = entitiesOf(s.entities, 2, 'townCenter')[0];
  const vills1 = entitiesOf(s.entities, 1, 'villager').map((e) => e.id);
  const scout1 = entitiesOf(s.entities, 1, 'scout')[0];
  const vills2 = entitiesOf(s.entities, 2, 'villager').map((e) => e.id);
  const cmds: Command[] = [];
  switch (tick) {
    case 5:
      cmds.push({ kind: 'move', player: 1, units: vills1, x: fp(tc1.tileX + 10), y: fp(tc1.tileY + 6) });
      cmds.push({ kind: 'move', player: 2, units: vills2, x: fp(30), y: fp(90) });
      break;
    case 40: { // gathering session: berries for p1, wood for p2
      const bush = nearestGaia(game, 'berryBush', tc1);
      if (bush) cmds.push({ kind: 'gather', player: 1, units: vills1, targetId: bush.id });
      const tree = nearestGaia(game, 'tree', tc2);
      if (tree) cmds.push({ kind: 'gather', player: 2, units: vills2, targetId: tree.id });
      break;
    }
    case 220: { // building session: p1 pulls a villager off berries onto a house
      const spot = placeSpot(game, 1, 'house', tc1);
      if (spot && vills1.length > 0) {
        cmds.push({ kind: 'build', player: 1, units: [vills1[0]], defId: 'house', tileX: spot.x, tileY: spot.y });
      }
      break;
    }
    case 350: { // retask p1 villagers onto gold mid-run
      const mine = nearestGaia(game, 'goldMine', tc1);
      if (mine) cmds.push({ kind: 'gather', player: 1, units: vills1, targetId: mine.id });
      break;
    }
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
    case 620: { // battle session: spawned raiders (tick 600) storm p2's town center
      const raiders = ['bat-a1', 'bat-a2'].map((r) => s.refs.get(r)).filter((x): x is number => x !== undefined);
      if (raiders.length > 0 && tc2) cmds.push({ kind: 'attack', player: 1, units: raiders, targetId: tc2.id });
      break;
    }
    case 700:
      cmds.push({ kind: 'move', player: 1, units: [...vills1, ...(scout1 ? [scout1.id] : [])], x: fp(tc1.tileX), y: fp(tc1.tileY + 5) });
      // illegal commands must be dropped silently, identically in both runs
      cmds.push({ kind: 'move', player: 1, units: [999999], x: fp(3), y: fp(3) });
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'paladin' });
      cmds.push({ kind: 'garrison', player: 2, units: vills2, targetId: tc1.id }); // dropped: enemy building
      break;
    default:
      break;
  }
  return cmds;
}

const CHECKPOINTS = [100, 250, 500, 750, 1000];

/**
 * Tick 600: drop a small battle next to p2's TC via Game.ops (deterministic — both
 * runs call it identically). Melee brawl + archer accuracy rolls + TC arrows +
 * deaths/corpses all feed the 750/1000 checkpoint hashes.
 */
function spawnBattle(game: Game): void {
  const tc2 = entitiesOf(game.state.entities, 2, 'townCenter')[0];
  if (!tc2) return;
  game.ops!.spawn([
    { defId: 'militia', player: 1, tileX: tc2.tileX - 4, tileY: tc2.tileY, ref: 'bat-a1' },
    { defId: 'militia', player: 1, tileX: tc2.tileX - 4, tileY: tc2.tileY + 1, ref: 'bat-a2' },
    { defId: 'archer', player: 1, tileX: tc2.tileX - 6, tileY: tc2.tileY, ref: 'bat-a3' },
    { defId: 'militia', player: 2, tileX: tc2.tileX - 2, tileY: tc2.tileY + 4, ref: 'bat-d1' },
    { defId: 'militia', player: 2, tileX: tc2.tileX - 1, tileY: tc2.tileY + 4, ref: 'bat-d2' },
  ]);
}

function runScripted(seed: number): number[] {
  const game = createGame(practiceConfig(seed, [player({ name: 'A', civ: 'scots' }), player({ name: 'B', civ: 'english' })]));
  const hashes: number[] = [];
  for (let t = 1; t <= 1000; t++) {
    if (t === 600) spawnBattle(game);
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
