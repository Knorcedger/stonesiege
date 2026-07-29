import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import type { Entity, Game } from './types';
import { entitiesOf, grassMap, practiceConfig, player, tileDist } from './testutil';

function gaiaNear(game: Game, defId: string, from: Entity, radius: number): number {
  let n = 0;
  for (const e of game.state.entities.values()) {
    if (e.player !== 0 || e.defId !== defId) continue;
    if (tileDist(e, from) <= radius) n++;
  }
  return n;
}

/** BFS over game.isWalkable (8-dir, matching sim movement). */
function reachable(game: Game, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const { width, height } = game.state.map;
  const seen = new Uint8Array(width * height);
  const queue = [from.y * width + from.x];
  seen[queue[0]] = 1;
  const target = to.y * width + to.x;
  while (queue.length > 0) {
    const t = queue.pop()!;
    if (t === target) return true;
    const tx = t % width, ty = (t / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!game.isWalkable(x, y)) continue;
        const nt = y * width + x;
        if (!seen[nt]) { seen[nt] = 1; queue.push(nt); }
      }
    }
  }
  return false;
}

function gateOf(game: Game, tc: Entity): { x: number; y: number } {
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy < 4 + r; dy++) {
      for (let dx = -r; dx < 4 + r; dx++) {
        const x = tc.tileX + dx, y = tc.tileY + dy;
        if (game.isWalkable(x, y)) return { x, y };
      }
    }
  }
  throw new Error('TC has no walkable neighbor');
}

const SEEDS = [7, 42, 1337];

describe('practice mapgen fairness', () => {
  for (const seed of SEEDS) {
    for (const playerCount of [2, 4]) {
      it(`seed ${seed}, ${playerCount} players: fair starts + mutually reachable TCs`, () => {
        const players = Array.from({ length: playerCount }, (_, i) =>
          player({ name: `P${i + 1}`, civ: i % 2 === 0 ? 'scots' : 'english', color: i }));
        const game = createGame(practiceConfig(seed, players));

        const tcs: Entity[] = [];
        for (let p = 1; p <= playerCount; p++) {
          const tcList = entitiesOf(game.state.entities, p, 'townCenter');
          expect(tcList, `player ${p} TC`).toHaveLength(1);
          const tc = tcList[0];
          tcs.push(tc);

          expect(entitiesOf(game.state.entities, p, 'villager'), `player ${p} villagers`).toHaveLength(3);
          expect(entitiesOf(game.state.entities, p, 'scout'), `player ${p} scout`).toHaveLength(1);
          expect(gaiaNear(game, 'sheep', tc, 15), `player ${p} sheep`).toBeGreaterThanOrEqual(4);
          expect(gaiaNear(game, 'berryBush', tc, 24), `player ${p} berries`).toBeGreaterThanOrEqual(5);
          expect(gaiaNear(game, 'goldMine', tc, 28), `player ${p} gold`).toBeGreaterThanOrEqual(6);
          expect(gaiaNear(game, 'stoneMine', tc, 30), `player ${p} stone`).toBeGreaterThanOrEqual(4);

          // starting economy state
          const ps = game.state.players[p];
          expect(ps.stockpile).toEqual({ food: 200, wood: 200, gold: 100, stone: 200 });
          expect(ps.pop).toBe(4); // 3 villagers + scout
          expect(ps.popCap).toBe(5); // one TC
        }

        // TC spacing: quadrant starts should not sit on top of each other
        for (let i = 0; i < tcs.length; i++) {
          for (let j = i + 1; j < tcs.length; j++) {
            expect(tileDist(tcs[i], tcs[j])).toBeGreaterThanOrEqual(30);
          }
        }

        // mutual reachability
        const gates = tcs.map((tc) => gateOf(game, tc));
        for (let i = 1; i < gates.length; i++) {
          expect(reachable(game, gates[0], gates[i]), `TC0 -> TC${i}`).toBe(true);
        }

        // forests + wildlife exist
        let trees = 0, wolves = 0, deer = 0;
        for (const e of game.state.entities.values()) {
          if (e.defId === 'tree') trees++;
          if (e.defId === 'wolf') wolves++;
          if (e.defId === 'deer') deer++;
        }
        expect(trees).toBeGreaterThan(100);
        expect(wolves).toBeGreaterThanOrEqual(playerCount); // 2 per player attempted
        expect(deer).toBeGreaterThanOrEqual(playerCount);
      });
    }
  }

  it('units and buildings never overlap blocked tiles at start', () => {
    const game = createGame(practiceConfig(99, [player(), player({ civ: 'english' })]));
    for (const e of game.state.entities.values()) {
      if (e.kind !== 'unit') continue;
      expect(game.isWalkable(e.tileX, e.tileY), `${e.defId}#${e.id}`).toBe(true);
    }
  });
});

describe('scenario starts', () => {
  it('places pre-resolved entities with refs, hp overrides, and revealAll', () => {
    const map = grassMap(20, 20);
    const game = createGame({
      seed: 5,
      map: {
        type: 'scenario',
        map,
        entities: [
          { defId: 'townCenter', player: 1, tileX: 4, tileY: 4, ref: 'home', hp: 1200 },
          { defId: 'militia', player: 1, tileX: 10, tileY: 10, ref: 'hero', facing: 3 },
          { defId: 'goldMine', player: 0, tileX: 15, tileY: 15, amountLeft: 250 },
        ],
        revealAll: true,
      },
      players: [player()],
      popCap: 100,
    });

    const home = game.state.refs.get('home');
    const hero = game.state.refs.get('hero');
    expect(home).toBeDefined();
    expect(hero).toBeDefined();
    const tc = game.state.entities.get(home!)!;
    expect(tc.hp).toBe(1200);
    expect(tc.maxHp).toBe(2400);
    const militia = game.state.entities.get(hero!)!;
    expect(militia.facing).toBe(3);

    const mine = [...game.state.entities.values()].find((e) => e.defId === 'goldMine')!;
    expect(mine.amountLeft).toBe(250);
    expect(game.isWalkable(15, 15)).toBe(false); // mines block their tile
    expect(game.isWalkable(4, 4)).toBe(false); // TC footprint blocks
    expect(game.isWalkable(10, 10)).toBe(true); // units never block

    // revealAll: everything at least explored; LOS areas visible
    const vis = game.state.players[1].visibility;
    let unexplored = 0;
    for (let i = 0; i < vis.length; i++) if (vis[i] === 0) unexplored++;
    expect(unexplored).toBe(0);
    expect(vis[10 * 20 + 10]).toBe(2);

    expect(game.canPlace(1, 'house', 17, 2)).toBe(true);
    expect(game.canPlace(1, 'house', 4, 4)).toBe(false); // on the TC
    expect(game.canPlace(1, 'house', 19, 19)).toBe(false); // out of bounds
  });
});
