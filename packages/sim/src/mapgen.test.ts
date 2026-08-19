import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { allPassableTerrainConnected, MAP_SIZE_PRESETS } from './mapgen';
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

/** BFS flood over game.isWalkable (8-dir, matching sim movement) from one tile. */
function floodFrom(game: Game, from: { x: number; y: number }): Uint8Array {
  const { width, height } = game.state.map;
  const seen = new Uint8Array(width * height);
  const queue = [from.y * width + from.x];
  seen[queue[0]] = 1;
  while (queue.length > 0) {
    const t = queue.pop()!;
    const tx = t % width, ty = (t / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!game.isWalkable(x, y)) continue;
        if (dx !== 0 && dy !== 0
          && (!game.isWalkable(tx + dx, ty) || !game.isWalkable(tx, ty + dy))) continue;
        const nt = y * width + x;
        if (!seen[nt]) { seen[nt] = 1; queue.push(nt); }
      }
    }
  }
  return seen;
}

/** True if a villager standing on a reached tile could harvest e (adjacent walkable + reached). */
function hasReachableHarvestTile(game: Game, reach: Uint8Array, e: Entity): boolean {
  const { width, height } = game.state.map;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = e.tileX + dx, y = e.tileY + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (reach[y * width + x]) return true; // flood only marks walkable tiles
    }
  }
  return false;
}

/** Connected components (8-adjacency) of gaia resources of one defId — the "clusters". */
function resourceComponents(game: Game, defId: string): Entity[][] {
  const list: Entity[] = [];
  for (const e of game.state.entities.values()) {
    if (e.player === 0 && e.defId === defId) list.push(e);
  }
  const byTile = new Map<string, Entity>();
  for (const e of list) byTile.set(`${e.tileX},${e.tileY}`, e);
  const seen = new Set<number>();
  const comps: Entity[][] = [];
  for (const e of list) {
    if (seen.has(e.id)) continue;
    const comp: Entity[] = [];
    const stack = [e];
    seen.add(e.id);
    while (stack.length > 0) {
      const c = stack.pop()!;
      comp.push(c);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const n = byTile.get(`${c.tileX + dx},${c.tileY + dy}`);
          if (n && !seen.has(n.id)) { seen.add(n.id); stack.push(n); }
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

const HARVEST_DEFS = ['berryBush', 'goldMine', 'stoneMine'] as const;

function expectConnectedLandforms(game: Game, label: string): void {
  const { map } = game.state;
  const counts = new Map<string, number>();
  for (let i = 0; i < map.terrain.length; i++) {
    const id = map.terrainIds[map.terrain[i]];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  expect(counts.get('water') ?? 0, `${label}: river`).toBeGreaterThan(map.width);
  expect(counts.get('shallows') ?? 0, `${label}: fords`).toBeGreaterThanOrEqual(30);
  expect(counts.get('cliff') ?? 0, `${label}: cliffs`).toBeGreaterThan(20);
  expect(allPassableTerrainConnected(map), `${label}: every land tile connected`).toBe(true);

  const water = map.terrain.findIndex((terrain) => map.terrainIds[terrain] === 'water');
  const cliff = map.terrain.findIndex((terrain) => map.terrainIds[terrain] === 'cliff');
  const ford = map.terrain.findIndex((terrain) => map.terrainIds[terrain] === 'shallows');
  expect(game.isWalkable(water % map.width, (water / map.width) | 0), `${label}: water blocks movement`).toBe(false);
  expect(game.isWalkable(cliff % map.width, (cliff / map.width) | 0), `${label}: cliff blocks movement`).toBe(false);
  expect(game.isWalkable(ford % map.width, (ford / map.width) | 0), `${label}: ford permits movement`).toBe(true);
}

/** Fairness invariant: no berry/gold/stone cluster may be fully walled off by forest. */
function expectNoSealedClusters(game: Game, reach: Uint8Array, label: string): void {
  for (const defId of HARVEST_DEFS) {
    for (const comp of resourceComponents(game, defId)) {
      const open = comp.some((e) => hasReachableHarvestTile(game, reach, e));
      expect(open, `${label}: sealed ${defId} cluster @${comp[0].tileX},${comp[0].tileY} (${comp.length} tiles)`).toBe(true);
    }
  }
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
        expectConnectedLandforms(game, `seed ${seed} ${playerCount}p`);

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
        const { width } = game.state.map;
        const gates = tcs.map((tc) => gateOf(game, tc));
        const reach = floodFrom(game, gates[0]);
        for (let i = 1; i < gates.length; i++) {
          expect(reach[gates[i].y * width + gates[i].x], `TC0 -> TC${i}`).toBe(1);
        }

        // resource fairness: every player's berry/gold/stone must be harvestable from
        // TC0's connected region — forests may never wall off one player's economy
        for (let p = 1; p <= playerCount; p++) {
          const tc = tcs[p - 1];
          for (const [defId, radius] of [['berryBush', 24], ['goldMine', 28], ['stoneMine', 30]] as const) {
            let accessible = 0;
            for (const e of game.state.entities.values()) {
              if (e.player !== 0 || e.defId !== defId) continue;
              if (tileDist(e, tc) > radius) continue;
              if (hasReachableHarvestTile(game, reach, e)) accessible++;
            }
            expect(accessible, `player ${p} reachable ${defId}`).toBeGreaterThanOrEqual(1);
          }
        }

        // and no cluster anywhere (incl. mid golds) may be fully sealed by forest
        expectNoSealedClusters(game, reach, `seed ${seed} ${playerCount}p`);

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

  it('seed sweep: starts always complete, no cluster ever sealed off (placeCluster never gives up)', () => {
    // wide net for the old failure modes: silent [] from placeCluster, and forest
    // blobs walling off one player's resources while the opponent's stay open
    for (let seed = 500; seed < 540; seed++) {
      const players = [player(), player({ civ: 'english' }), player({ civ: 'scots' })];
      const game = createGame(practiceConfig(seed, players));
      expectConnectedLandforms(game, `seed ${seed}`);
      const reach = floodFrom(game, gateOf(game, entitiesOf(game.state.entities, 1, 'townCenter')[0]));
      for (let p = 1; p <= players.length; p++) {
        const tcs = entitiesOf(game.state.entities, p, 'townCenter');
        expect(tcs, `seed ${seed} player ${p} TC`).toHaveLength(1);
        const tc = tcs[0];
        // generous radius: widened rings / spiral fallback may push clusters out a bit
        expect(gaiaNear(game, 'berryBush', tc, 40), `seed ${seed} player ${p} berries`).toBeGreaterThanOrEqual(5);
        expect(gaiaNear(game, 'goldMine', tc, 40), `seed ${seed} player ${p} gold`).toBeGreaterThanOrEqual(10); // 6 main + 4 secondary
        expect(gaiaNear(game, 'stoneMine', tc, 40), `seed ${seed} player ${p} stone`).toBeGreaterThanOrEqual(7); // 4 + 3
      }
      expectNoSealedClusters(game, reach, `seed ${seed}`);
    }
  });
});

describe('practice map size presets (96/120/144) × 2-4 players', () => {
  // the same fairness bundle across every supported size/player-count combination:
  // complete starts, mutual TC reachability, and no forest-sealed resource cluster
  for (const [label, size] of Object.entries(MAP_SIZE_PRESETS)) {
    for (const playerCount of [2, 3, 4]) {
      it(`${label} (${size}²), ${playerCount} players`, () => {
        const players = Array.from({ length: playerCount }, (_, i) =>
          player({ name: `P${i + 1}`, civ: i % 2 === 0 ? 'scots' : 'english', color: i }));
        const game = createGame(practiceConfig(9000 + size + playerCount, players, size));
        expect(game.state.map.width).toBe(size);
        expect(game.state.map.height).toBe(size);
        expectConnectedLandforms(game, `${label} ${playerCount}p`);

        const tcs: Entity[] = [];
        for (let p = 1; p <= playerCount; p++) {
          const tcList = entitiesOf(game.state.entities, p, 'townCenter');
          expect(tcList, `player ${p} TC`).toHaveLength(1);
          const tc = tcList[0];
          tcs.push(tc);
          expect(entitiesOf(game.state.entities, p, 'villager'), `player ${p} villagers`).toHaveLength(3);
          expect(entitiesOf(game.state.entities, p, 'scout'), `player ${p} scout`).toHaveLength(1);
          expect(gaiaNear(game, 'sheep', tc, 15), `player ${p} sheep`).toBeGreaterThanOrEqual(4);
          expect(gaiaNear(game, 'berryBush', tc, 40), `player ${p} berries`).toBeGreaterThanOrEqual(5);
          expect(gaiaNear(game, 'goldMine', tc, 40), `player ${p} gold`).toBeGreaterThanOrEqual(6);
          expect(gaiaNear(game, 'stoneMine', tc, 40), `player ${p} stone`).toBeGreaterThanOrEqual(4);
        }

        for (let i = 0; i < tcs.length; i++) {
          for (let j = i + 1; j < tcs.length; j++) {
            expect(tileDist(tcs[i], tcs[j]), `TC ${i} vs ${j} spacing`).toBeGreaterThanOrEqual(30);
          }
        }

        const gates = tcs.map((tc) => gateOf(game, tc));
        const reach = floodFrom(game, gates[0]);
        for (let i = 1; i < gates.length; i++) {
          expect(reach[gates[i].y * size + gates[i].x], `TC0 -> TC${i}`).toBe(1);
        }
        expectNoSealedClusters(game, reach, `${label} ${playerCount}p`);
      });
    }
  }
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
