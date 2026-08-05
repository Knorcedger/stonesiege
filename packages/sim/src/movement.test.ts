import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { FP, fp } from './types';
import type { Entity, ScenarioStart } from './types';
import type { SimState } from './internal';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

describe('movement', () => {
  it('a cavalry unit takes a straight diagonal route across open ground', () => {
    const game = createGame(scenarioConfig(10, grassMap(35, 30), [
      { defId: 'scout', player: 1, tileX: 3, tileY: 4, ref: 'horse' },
    ], [player()]));
    const horse = game.state.entities.get(game.state.refs.get('horse')!)!;
    const targetX = fp(27) + FP / 2;
    const targetY = fp(18) + FP / 2;
    const startX = horse.x, startY = horse.y;
    game.advance([{ kind: 'move', player: 1, units: [horse.id], x: targetX, y: targetY }]);

    const motion = (game.state as SimState).motion.get(horse.id)!;
    expect(motion.path?.length).toBe(1); // open terrain needs no grid-corner waypoint
    let maxCrossTrack = 0;
    for (let tick = 0; tick < 500 && horse.activity === 'moving'; tick++) {
      game.advance([]);
      const vx = targetX - startX, vy = targetY - startY;
      const cross = Math.abs((horse.x - startX) * vy - (horse.y - startY) * vx);
      maxCrossTrack = Math.max(maxCrossTrack, cross / Math.hypot(vx, vy));
    }
    expect(horse.activity).toBe('idle');
    expect(maxCrossTrack).toBeLessThan(FP / 8);
  });

  it('a walking unit passes through a friendly crowd without pushing the whole line', () => {
    const entities: ScenarioStart['entities'] = [
      { defId: 'villager', player: 1, tileX: 4, tileY: 10, ref: 'walker' },
    ];
    for (let x = 7; x <= 15; x++) {
      entities.push({ defId: 'villager', player: 1, tileX: x, tileY: 10, ref: `idle${x}` });
    }
    const game = createGame(scenarioConfig(9, grassMap(30, 24), entities, [player()]));
    const walker = game.state.entities.get(game.state.refs.get('walker')!)!;
    const idleBefore = [...game.state.entities.values()]
      .filter((e) => e.kind === 'unit' && e.id !== walker.id)
      .map((e) => ({ id: e.id, x: e.x, y: e.y }));

    game.advance([{ kind: 'move', player: 1, units: [walker.id], x: fp(20) + FP / 2, y: fp(10) + FP / 2 }]);
    let arrivedAt = -1;
    for (let t = 0; t < 520; t++) {
      game.advance([]);
      if (walker.tileX >= 19) { arrivedAt = t; break; }
    }
    expect(arrivedAt, 'friendly traffic slowed the walker indefinitely').toBeGreaterThan(0);
    expect(arrivedAt).toBeLessThan(500);
    for (const before of idleBefore) {
      const idle = game.state.entities.get(before.id)!;
      expect({ x: idle.x, y: idle.y }, `idle friendly ${idle.id} was pushed`).toEqual({ x: before.x, y: before.y });
    }
  });

  it('a unit crosses the map around a forest wall, never entering blocked tiles', () => {
    const map = grassMap(40, 40);
    const entities: ScenarioStart['entities'] = [];
    // vertical tree wall at x=20 with a gap at the south end (y 34..39 open)
    for (let y = 0; y < 34; y++) entities.push({ defId: 'tree', player: 0, tileX: 20, tileY: y });
    entities.push({ defId: 'militia', player: 1, tileX: 5, tileY: 10 });

    const game = createGame(scenarioConfig(1, map, entities, [player()]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];
    game.advance([{ kind: 'move', player: 1, units: [unit.id], x: fp(35) + FP / 2, y: fp(10) + FP / 2 }]);

    let arrivedAt = -1;
    for (let t = 0; t < 3000; t++) {
      game.advance([]);
      expect(game.isWalkable(unit.tileX, unit.tileY), `tick ${t}: unit inside blocked tile`).toBe(true);
      const dx = unit.x - (fp(35) + FP / 2), dy = unit.y - (fp(10) + FP / 2);
      if (dx * dx + dy * dy <= FP * FP && arrivedAt === -1) { arrivedAt = t; break; }
    }
    expect(arrivedAt, 'unit never reached the far side').toBeGreaterThan(0);
    // it must have detoured south around the wall (straight-line would be ~30 tiles)
    expect(unit.tileX).toBeGreaterThanOrEqual(34);
  });

  it('a group of 20 arrives spread out, nobody stacked or inside blocked tiles', () => {
    const map = grassMap(40, 40);
    const entities: ScenarioStart['entities'] = [];
    for (let i = 0; i < 20; i++) {
      entities.push({ defId: 'militia', player: 1, tileX: 3 + (i % 5), tileY: 10 + Math.floor(i / 5) });
    }
    const game = createGame(scenarioConfig(2, map, entities, [player()]));
    const ids = entitiesOf(game.state.entities, 1, 'militia').map((e) => e.id);
    expect(ids).toHaveLength(20);

    game.advance([{ kind: 'move', player: 1, units: ids, x: fp(32), y: fp(24) }]);
    for (let t = 0; t < 2000; t++) game.advance([]);

    const units = entitiesOf(game.state.entities, 1, 'militia');
    const tiles = new Set<string>();
    for (const u of units) {
      expect(u.activity, `unit ${u.id} still moving`).toBe('idle');
      expect(game.isWalkable(u.tileX, u.tileY), `unit ${u.id} in blocked tile`).toBe(true);
      const d = Math.max(Math.abs(u.tileX - 32), Math.abs(u.tileY - 24));
      expect(d, `unit ${u.id} too far from target`).toBeLessThanOrEqual(5);
      tiles.add(`${u.tileX},${u.tileY}`);
    }
    // spread: 20 units cannot be stacked on a couple of tiles
    expect(tiles.size).toBeGreaterThanOrEqual(8);

    // no resting stack: pairwise distance should be at least ~a third of a tile
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const dx = units[i].x - units[j].x, dy = units[i].y - units[j].y;
        expect(dx * dx + dy * dy, `units ${units[i].id}/${units[j].id} stacked`).toBeGreaterThan(80 * 80);
      }
    }
  });

  it('attackMove records intent and still moves; stop clears it', () => {
    const map = grassMap(20, 20);
    const game = createGame(scenarioConfig(3, map, [
      { defId: 'militia', player: 1, tileX: 2, tileY: 2 },
    ], [player()]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];

    game.advance([{ kind: 'attackMove', player: 1, units: [unit.id], x: fp(15), y: fp(15) }]);
    expect(unit.intent).toEqual({ kind: 'attackMove', x: fp(15), y: fp(15) });
    for (let t = 0; t < 30; t++) game.advance([]);
    expect(unit.tileX + unit.tileY).toBeGreaterThan(4); // it moved

    game.advance([{ kind: 'stop', player: 1, units: [unit.id] }]);
    expect(unit.intent).toBeUndefined();
    expect(unit.activity).toBe('idle');
    const frozen = { x: unit.x, y: unit.y };
    for (let t = 0; t < 20; t++) game.advance([]);
    expect(unit.x).toBe(frozen.x);
    expect(unit.y).toBe(frozen.y);
  });

  it('a move onto a blocked tile is remapped to the nearest walkable tile', () => {
    const map = grassMap(20, 20);
    const game = createGame(scenarioConfig(4, map, [
      { defId: 'tree', player: 0, tileX: 10, tileY: 10 },
      { defId: 'militia', player: 1, tileX: 2, tileY: 10 },
    ], [player()]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];
    game.advance([{ kind: 'move', player: 1, units: [unit.id], x: fp(10) + FP / 2, y: fp(10) + FP / 2 }]);
    for (let t = 0; t < 400; t++) game.advance([]);
    expect(game.isWalkable(unit.tileX, unit.tileY)).toBe(true);
    expect(Math.max(Math.abs(unit.tileX - 10), Math.abs(unit.tileY - 10))).toBeLessThanOrEqual(1);
  });

  it('a move into a sealed forest pocket walks to the closest reachable tile (never a no-op)', () => {
    const map = grassMap(20, 20);
    const entities: ScenarioStart['entities'] = [
      { defId: 'militia', player: 1, tileX: 2, tileY: 10 },
    ];
    // tree ring sealing the walkable tile (10,10): walkable but disconnected
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        entities.push({ defId: 'tree', player: 0, tileX: 10 + dx, tileY: 10 + dy });
      }
    }
    const game = createGame(scenarioConfig(6, map, entities, [player()]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];

    game.advance([{ kind: 'move', player: 1, units: [unit.id], x: fp(10) + FP / 2, y: fp(10) + FP / 2 }]);
    for (let t = 0; t < 600; t++) game.advance([]);

    // AoE2 behavior: the unit walked up to the pocket instead of standing at (2,10)
    expect(unit.activity).toBe('idle');
    expect(game.isWalkable(unit.tileX, unit.tileY)).toBe(true);
    expect(Math.max(Math.abs(unit.tileX - 10), Math.abs(unit.tileY - 10))).toBeLessThanOrEqual(3);
  });

  it('an attack-move group to an unreachable goal still advances (order not dropped)', () => {
    const map = grassMap(20, 20);
    const entities: ScenarioStart['entities'] = [];
    for (let i = 0; i < 5; i++) entities.push({ defId: 'militia', player: 1, tileX: 2, tileY: 8 + i });
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        entities.push({ defId: 'tree', player: 0, tileX: 10 + dx, tileY: 10 + dy });
      }
    }
    const game = createGame(scenarioConfig(7, map, entities, [player()]));
    const ids = entitiesOf(game.state.entities, 1, 'militia').map((e) => e.id);
    expect(ids).toHaveLength(5);

    game.advance([{ kind: 'attackMove', player: 1, units: ids, x: fp(10) + FP / 2, y: fp(10) + FP / 2 }]);
    for (let t = 0; t < 800; t++) game.advance([]);

    for (const u of entitiesOf(game.state.entities, 1, 'militia')) {
      expect(u.activity, `unit ${u.id} never arrived`).toBe('idle');
      expect(u.intent?.kind, `unit ${u.id} lost its attack-move intent`).toBe('attackMove');
      const d = Math.max(Math.abs(u.tileX - 10), Math.abs(u.tileY - 10));
      expect(d, `unit ${u.id} did not advance toward the goal`).toBeLessThanOrEqual(6);
    }
  });

  it('a click deep inside a lake (beyond the 8-tile spiral) walks to the shore', () => {
    const map = grassMap(40, 40);
    // 20x20 lake: nearest land to its center (20,20) is 10 tiles away, past the old maxR=8
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) map.terrain[y * 40 + x] = 3; // water
    }
    const game = createGame(scenarioConfig(8, map, [
      { defId: 'militia', player: 1, tileX: 2, tileY: 20 },
    ], [player()]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];

    game.advance([{ kind: 'move', player: 1, units: [unit.id], x: fp(20) + FP / 2, y: fp(20) + FP / 2 }]);
    for (let t = 0; t < 800; t++) game.advance([]);

    expect(unit.activity).toBe('idle');
    expect(game.isWalkable(unit.tileX, unit.tileY)).toBe(true);
    // reached the shoreline near the click, not stuck at the start column
    expect(Math.max(Math.abs(unit.tileX - 20), Math.abs(unit.tileY - 20))).toBeLessThanOrEqual(11);
  });

  it('commands from the wrong player are dropped', () => {
    const map = grassMap(20, 20);
    const game = createGame(scenarioConfig(5, map, [
      { defId: 'militia', player: 1, tileX: 2, tileY: 2 },
    ], [player(), player({ civ: 'english' })]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];
    game.advance([{ kind: 'move', player: 2, units: [unit.id], x: fp(15), y: fp(15) }]);
    for (let t = 0; t < 20; t++) game.advance([]);
    expect(unit.tileX).toBe(2);
    expect(unit.tileY).toBe(2);
  });
});

describe('fog of war', () => {
  it('stamps visible around units, leaves explored behind, allies share vision', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(6, map, [
      { defId: 'militia', player: 1, tileX: 5, tileY: 5 },
      { defId: 'militia', player: 2, tileX: 25, tileY: 25 },
    ], [player({ team: 1 }), player({ civ: 'english', team: 1 })]));

    const p1 = game.state.players[1], p2 = game.state.players[2];
    const at = (x: number, y: number): number => p1.visibility[y * 30 + x];
    expect(at(5, 5)).toBe(2); // own unit tile visible
    expect(at(25, 25)).toBe(2); // ally vision shared
    expect(at(15, 15)).toBe(0); // middle unexplored
    expect(p1.visibility).toBe(p2.visibility); // literally shared

    // walk the unit; the old position must stay explored
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];
    game.advance([{ kind: 'move', player: 1, units: [unit.id], x: fp(15), y: fp(5) }]);
    for (let t = 0; t < 300; t++) game.advance([]);
    expect(at(5, 5)).toBeGreaterThanOrEqual(1);
    expect(at(15, 5)).toBe(2);
  });

  it('vision disappears (to explored) when the unit dies', () => {
    const map = grassMap(30, 30);
    const game = createGame(scenarioConfig(7, map, [
      { defId: 'militia', player: 1, tileX: 5, tileY: 5 },
    ], [player(), player({ civ: 'english' })]));
    const unit = entitiesOf(game.state.entities, 1, 'militia')[0];
    const p1 = game.state.players[1];
    expect(p1.visibility[5 * 30 + 5]).toBe(2);
    const events = game.advance([{ kind: 'deleteEntity', player: 1, entityId: unit.id }]);
    expect(events.some((e) => e.kind === 'entityDied')).toBe(true);
    expect(p1.visibility[5 * 30 + 5]).toBe(1);
  });
});
