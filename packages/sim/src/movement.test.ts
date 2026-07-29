import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { FP, fp } from './types';
import type { Entity, ScenarioStart } from './types';
import { entitiesOf, grassMap, player, scenarioConfig } from './testutil';

describe('movement', () => {
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
