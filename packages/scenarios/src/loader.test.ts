import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import type { TerrainId } from '@bf/sim/types';
import { ScenarioValidationError, loadScenario } from './loader';
import type { Condition, ScenarioDef, TriggerEffect } from './schema';
import { makeFixture } from './testutil';

function expectError(def: ScenarioDef, ...fragments: string[]) {
  let caught: unknown;
  try {
    loadScenario(def);
  } catch (e) {
    caught = e;
  }
  expect(caught, 'expected loadScenario to throw').toBeInstanceOf(ScenarioValidationError);
  const err = caught as ScenarioValidationError;
  for (const f of fragments) {
    expect(err.errors.some((m) => m.includes(f)), `no error mentions '${f}' in:\n${err.errors.join('\n')}`).toBe(true);
  }
}

describe('loadScenario — good fixture', () => {
  it('resolves terrain, gaia objects, entities, and meta', () => {
    const def = makeFixture();
    const { start, meta } = loadScenario(def);

    // map
    expect(start.type).toBe('scenario');
    expect(start.map.width).toBe(8);
    expect(start.map.height).toBe(6);
    const at = (x: number, y: number): TerrainId => start.map.terrainIds[start.map.terrain[y * 8 + x]];
    expect(at(0, 0)).toBe('grass'); // tree tile is grass terrain + tree object
    expect(at(7, 5)).toBe('water');
    expect(at(3, 3)).toBe('grass');

    // authored entities come first, refs preserved
    expect(start.entities[0]).toMatchObject({ defId: 'townCenter', player: 1, tileX: 2, tileY: 1, ref: 'tc' });

    // every token object becomes the right gaia def
    const gaia = start.entities.filter((e) => e.player === 0);
    const byDef = (id: string) => gaia.filter((e) => e.defId === id);
    expect(byDef('tree')).toHaveLength(1);
    expect(byDef('goldMine')).toHaveLength(1);
    expect(byDef('stoneMine')).toHaveLength(1);
    expect(byDef('berryBush')).toHaveLength(1);
    expect(byDef('deer')).toHaveLength(1);
    expect(byDef('sheep')).toHaveLength(1);
    expect(byDef('wolf')).toHaveLength(1);
    expect(byDef('tree')[0]).toMatchObject({ tileX: 0, tileY: 0 });
    expect(byDef('goldMine')[0]).toMatchObject({ tileX: 1, tileY: 1 });
    expect(byDef('wolf')[0]).toMatchObject({ tileX: 3, tileY: 4 });

    // meta + PlayerSetup mapping
    expect(meta.id).toBe('fixture');
    expect(meta.playerSetups).toHaveLength(2);
    expect(meta.playerSetups[0]).toMatchObject({
      name: 'P1', civ: 'scots', team: 1, isHuman: true, color: 0,
      startingAge: 'dark', startingResources: { food: 100 },
    });
    expect(meta.popCap).toBe(200); // default when no per-player caps
    expect(meta.startCamera).toEqual({ x: 2, y: 1 });
  });

  it('passes entity overrides (hp/facing/amountLeft) through to ScenarioStart', () => {
    const def = makeFixture();
    def.entities.push({ def: 'goldMine', player: 0, x: 5, y: 5, amountLeft: 300 });
    def.entities.push({ def: 'militia', player: 2, x: 6, y: 5, hp: 7, facing: 3 });
    const { start } = loadScenario(def);
    expect(start.entities.find((e) => e.defId === 'goldMine' && e.tileX === 5)).toMatchObject({ amountLeft: 300 });
    expect(start.entities.find((e) => e.defId === 'militia' && e.tileX === 6)).toMatchObject({ hp: 7, facing: 3 });
  });

  it('accepts an injected GameData with extra defs', () => {
    const def = makeFixture();
    def.entities.push({ def: 'heroTest', player: 1, x: 5, y: 0, ref: 'h' });
    expectError(def, "unknown def 'heroTest'");
    const extended = {
      ...gameData,
      units: { ...gameData.units, heroTest: { ...gameData.units.militia, id: 'heroTest' } },
    };
    expect(() => loadScenario(def, extended)).not.toThrow();
  });
});

describe('loadScenario — map validation', () => {
  it('rejects a wrong row count', () => {
    const def = makeFixture();
    def.map.rows = def.map.rows.slice(0, 5);
    expectError(def, '5 rows provided but height is 6');
  });

  it('rejects a row of the wrong length, naming the row', () => {
    const def = makeFixture();
    def.map.rows[3] = '...'; // too short
    expectError(def, 'map row 3', 'length 3 != width 8');
  });

  it('rejects characters missing from the legend, naming the coordinate', () => {
    const def = makeFixture();
    def.map.rows[2] = '..S..?B.';
    expectError(def, "char '?' is not in the legend", 'x=5, y=2');
  });

  it('rejects a legend entry with an unknown terrain', () => {
    const def = makeFixture();
    (def.map.legend['.'] as { terrain: string }).terrain = 'lava';
    expectError(def, "legend '.'", "unknown terrain 'lava'");
  });
});

describe('loadScenario — entity validation', () => {
  it('rejects unknown defs', () => {
    const def = makeFixture();
    def.entities.push({ def: 'dragon', player: 1, x: 1, y: 1 });
    expectError(def, "unknown def 'dragon'");
  });

  it('rejects out-of-bounds entities with the coordinate', () => {
    const def = makeFixture();
    def.entities.push({ def: 'militia', player: 1, x: 8, y: 2 });
    expectError(def, '(8, 2)', 'out of map bounds 8x6');
  });

  it('rejects building footprints that hang off the map', () => {
    const def = makeFixture();
    def.entities.push({ def: 'townCenter', player: 2, x: 6, y: 0 }); // 4x4 from x=6 on an 8-wide map
    expectError(def, 'footprint 4x4 exceeds map bounds 8x6');
  });

  it('rejects players that do not exist', () => {
    const def = makeFixture();
    def.entities.push({ def: 'militia', player: 3, x: 1, y: 1 });
    expectError(def, 'player 3 out of range');
  });

  it('rejects duplicate refs, including collisions with spawn-effect refs', () => {
    const def = makeFixture();
    def.entities.push({ def: 'militia', player: 1, x: 1, y: 1, ref: 'hero' });
    expectError(def, "duplicate ref 'hero'");

    const def2 = makeFixture();
    def2.triggers[0].effects.push({
      kind: 'spawn', entities: [{ def: 'militia', player: 1, x: 1, y: 1, ref: 'tc' }],
    });
    expectError(def2, "duplicate ref 'tc'");
  });

  it('validates spawn-effect entities like initial entities', () => {
    const def = makeFixture();
    def.triggers[0].effects.push({
      kind: 'spawn', entities: [{ def: 'nessie', player: 9, x: 40, y: 2 }],
    });
    expectError(def, "unknown def 'nessie'", 'player 9 out of range', '(40, 2)');
  });

  it('rejects unknown civs and bad player colors', () => {
    const def = makeFixture();
    def.players[0].civ = 'atlanteans';
    def.players[1].color = 12;
    expectError(def, "unknown civ 'atlanteans'", 'color 12 out of range');
  });
});

describe('loadScenario — trigger validation', () => {
  const withCondition = (c: Condition): ScenarioDef => {
    const def = makeFixture();
    def.triggers.push({ id: 't-test', conditions: [c], effects: [{ kind: 'playSting', sting: 'horn' }] });
    return def;
  };
  const withEffect = (fx: TriggerEffect): ScenarioDef => {
    const def = makeFixture();
    def.triggers.push({ id: 't-test', conditions: [{ kind: 'always' }], effects: [fx] });
    return def;
  };

  it('rejects duplicate trigger ids', () => {
    const def = makeFixture();
    def.triggers.push({ ...def.triggers[0], id: 't-intro' });
    expectError(def, "'t-intro'", 'duplicate trigger id');
  });

  it('rejects triggers with no conditions', () => {
    const def = makeFixture();
    def.triggers[0].conditions = [];
    expectError(def, 'at least one condition');
  });

  it('rejects armTrigger/triggerFired references to unknown triggers', () => {
    expectError(withEffect({ kind: 'armTrigger', triggerId: 't-nope' }), "unknown trigger 't-nope'");
    expectError(withCondition({ kind: 'triggerFired', triggerId: 't-nope' }), "unknown trigger 't-nope'");
  });

  it('rejects unknown entity refs in conditions and effects', () => {
    expectError(withCondition({ kind: 'refDestroyed', ref: 'ghost' }), "unknown entity ref 'ghost'");
    expectError(withCondition({ kind: 'refsDestroyed', refs: ['hero', 'ghost'], all: true }), "unknown entity ref 'ghost'");
    expectError(withEffect({ kind: 'changeOwner', refs: ['ghost'], toPlayer: 1 }), "unknown entity ref 'ghost'");
  });

  it('accepts refs that only exist via spawn effects', () => {
    const def = makeFixture();
    def.triggers.push({
      id: 't-spawner',
      conditions: [{ kind: 'always' }],
      effects: [{ kind: 'spawn', entities: [{ def: 'militia', player: 2, x: 5, y: 5, ref: 'late' }] }],
    });
    def.triggers.push({
      id: 't-late-dead',
      conditions: [{ kind: 'refDestroyed', ref: 'late' }],
      effects: [{ kind: 'playSting', sting: 'alert' }],
    });
    expect(() => loadScenario(def)).not.toThrow();
  });

  it('rejects objective ids that no objectiveAdd introduces (effects and conditions)', () => {
    expectError(withEffect({ kind: 'objectiveComplete', id: 'obj-nope' }), "objective 'obj-nope'", 'never added');
    expectError(withEffect({ kind: 'objectiveFail', id: 'obj-nope' }), "objective 'obj-nope'");
    expectError(withCondition({ kind: 'objectiveComplete', objectiveId: 'obj-nope' }), "objective 'obj-nope'");
  });

  it('rejects out-of-range players in conditions and effects', () => {
    expectError(withCondition({ kind: 'resourcesAtLeast', player: 5, type: 'food', amount: 1 }), 'player 5 out of range');
    expectError(withCondition({ kind: 'ageReached', player: 0, age: 'feudal' }), 'player 0 out of range');
    expectError(withEffect({ kind: 'revealArea', player: 3, area: { x: 0, y: 0, w: 2, h: 2 } }), 'player 3 out of range');
    expectError(withEffect({ kind: 'aiProfile', player: 4, profile: 'defender' }), 'player 4 out of range');
  });

  it('rejects unknown def ids and techs in conditions', () => {
    expectError(withCondition({ kind: 'ownedAtLeast', player: 1, defIds: ['keepx'], atLeast: 1 }), "unknown def 'keepx'");
    expectError(withCondition({ kind: 'researched', player: 1, techId: 'alchemy9' }), "unknown tech 'alchemy9'");
  });

  it('rejects bad areas and bad timer/entitiesInArea parameters', () => {
    expectError(
      withCondition({ kind: 'entitiesInArea', area: { x: 6, y: 4, w: 4, h: 4 }, atLeast: 1 }),
      'not a valid rect inside the 8x6 map',
    );
    expectError(withCondition({ kind: 'entitiesInArea', area: { x: 0, y: 0, w: 2, h: 2 } }), 'needs atLeast and/or atMost');
    expectError(withCondition({ kind: 'timerSeconds', seconds: -5 }), 'must be >= 0');
  });

  it('rejects an out-of-bounds startCamera and panCamera', () => {
    const def = makeFixture();
    def.startCamera = { x: 99, y: 0 };
    expectError(def, 'startCamera (99, 0) out of map bounds');
    expectError(withEffect({ kind: 'panCamera', x: 0, y: 66 }), 'panCamera (0, 66) out of map bounds');
  });

  it('reports every error at once with the scenario id in the message', () => {
    const def = makeFixture();
    def.map.rows[0] = 'T......?';
    def.entities.push({ def: 'dragon', player: 7, x: 99, y: 99 });
    try {
      loadScenario(def);
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ScenarioValidationError;
      expect(err.message).toContain("scenario 'fixture'");
      expect(err.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});
