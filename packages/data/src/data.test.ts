import { describe, expect, it } from 'vitest';
import { AGES } from '@bf/sim/types';
import type { AgeId } from '@bf/sim/types';
import { gameData } from './index';
import type { Cost, TechEffect } from './schema';

const { units, buildings, techs, civs, resources } = gameData;

const unitIds = new Set(Object.keys(units));
const buildingIds = new Set(Object.keys(buildings));
const techIds = new Set(Object.keys(techs));
const entityIds = new Set([...unitIds, ...buildingIds]); // targetIds may hit either
const allIds = new Set([...entityIds, ...techIds]);

const ageIdx = (age: AgeId): number => AGES.indexOf(age);

function effectRefs(effect: TechEffect): { entities: string[]; techs: string[] } {
  const entities: string[] = [];
  const techRefs: string[] = [];
  if ('targetIds' in effect && effect.targetIds) entities.push(...effect.targetIds);
  switch (effect.kind) {
    case 'upgradeUnit': entities.push(effect.from, effect.to); break;
    case 'enableUnit': entities.push(effect.id); break;
    case 'enableBuilding': entities.push(effect.id); break;
    case 'freeTech': techRefs.push(effect.techId); break;
  }
  return { entities, techs: techRefs };
}

describe('id integrity', () => {
  it('record keys match def ids', () => {
    for (const [table, defs] of Object.entries({ units, buildings, techs, civs, resources })) {
      for (const [key, def] of Object.entries(defs)) {
        expect(def.id, `${table}.${key}`).toBe(key);
      }
    }
  });

  it('unit trainedAt and requiresTech resolve', () => {
    for (const u of Object.values(units)) {
      for (const b of u.trainedAt) expect(buildingIds.has(b), `${u.id} trainedAt ${b}`).toBe(true);
      if (u.requiresTech) expect(techIds.has(u.requiresTech), `${u.id} requiresTech`).toBe(true);
    }
  });

  it('building trains/researches/requires resolve', () => {
    for (const b of Object.values(buildings)) {
      for (const t of b.trains ?? []) expect(unitIds.has(t), `${b.id} trains ${t}`).toBe(true);
      for (const t of b.researches ?? []) expect(techIds.has(t), `${b.id} researches ${t}`).toBe(true);
      for (const r of b.requiresBuildings ?? []) expect(buildingIds.has(r), `${b.id} requiresBuildings ${r}`).toBe(true);
      if (b.requiresTech) expect(techIds.has(b.requiresTech), `${b.id} requiresTech`).toBe(true);
    }
  });

  it('tech researchedAt, requiresTech and effect targets resolve', () => {
    for (const t of Object.values(techs)) {
      expect(t.researchedAt.length, `${t.id} researchedAt`).toBeGreaterThan(0);
      for (const b of t.researchedAt) expect(buildingIds.has(b), `${t.id} researchedAt ${b}`).toBe(true);
      if (t.requiresTech) expect(techIds.has(t.requiresTech), `${t.id} requiresTech`).toBe(true);
      for (const e of t.effects) {
        const refs = effectRefs(e);
        for (const id of refs.entities) expect(entityIds.has(id), `${t.id} effect ref ${id}`).toBe(true);
        for (const id of refs.techs) expect(techIds.has(id), `${t.id} effect tech ref ${id}`).toBe(true);
      }
    }
  });

  it('every tech is researchable at a building that lists it', () => {
    for (const t of Object.values(techs)) {
      for (const b of t.researchedAt) {
        expect(buildings[b].researches ?? [], `${b} must list ${t.id}`).toContain(t.id);
      }
    }
  });

  it('every trainable unit is listed by each building it trains at', () => {
    for (const u of Object.values(units)) {
      for (const b of u.trainedAt) {
        expect(buildings[b].trains ?? [], `${b} must list ${u.id}`).toContain(u.id);
      }
    }
  });

  it('civ references resolve', () => {
    for (const c of Object.values(civs)) {
      expect(unitIds.has(c.uniqueUnit), `${c.id} uniqueUnit`).toBe(true);
      expect(techIds.has(c.eliteUniqueTech), `${c.id} eliteUniqueTech`).toBe(true);
      for (const t of c.uniqueTechs) {
        expect(techIds.has(t), `${c.id} uniqueTech ${t}`).toBe(true);
        expect(techs[t].unique, `${c.id} uniqueTech ${t} must be flagged unique`).toBe(true);
      }
      for (const id of c.disabled) expect(allIds.has(id), `${c.id} disabled ${id}`).toBe(true);
      for (const id of Object.keys(c.unitNames ?? {})) {
        expect(unitIds.has(id), `${c.id} unitNames ${id}`).toBe(true);
      }
      for (const b of c.bonuses) {
        const refs = effectRefs(b.effect);
        for (const id of refs.entities) expect(entityIds.has(id), `${c.id} bonus ref ${id}`).toBe(true);
        for (const id of refs.techs) expect(techIds.has(id), `${c.id} bonus tech ref ${id}`).toBe(true);
      }
      // the elite upgrade must actually upgrade the civ's unique unit
      const elite = techs[c.eliteUniqueTech];
      const up = elite.effects.find((e) => e.kind === 'upgradeUnit');
      expect(up && up.kind === 'upgradeUnit' && up.from, `${c.id} elite upgrade`).toBe(c.uniqueUnit);
    }
  });
});

describe('unit stats', () => {
  it('every unit has melee and pierce armor entries', () => {
    for (const u of Object.values(units)) {
      const classes = u.armor.map((a) => a.cls);
      expect(classes, `${u.id} armor`).toContain('melee');
      expect(classes, `${u.id} armor`).toContain('pierce');
    }
  });

  it('attacks lead with a base melee or pierce entry when present', () => {
    for (const u of Object.values(units)) {
      if (u.attacks.length === 0) continue;
      expect(['melee', 'pierce'], `${u.id} base attack`).toContain(u.attacks[0].cls);
    }
  });

  it('ranged units declare projectile speed and accuracy', () => {
    for (const u of Object.values(units)) {
      if (u.range > 0 && u.attacks.length > 0) {
        expect(u.projectileSpeed, `${u.id} projectileSpeed`).toBeGreaterThan(0);
        expect(u.accuracy, `${u.id} accuracy`).toBeGreaterThan(0);
      }
    }
  });

  it('villager gather rates are the AoE2 at-resource rates (AOE2_REFERENCE §1)', () => {
    // These are steady-state ON-RESOURCE rates. The sim makes villagers physically
    // walk carry loads to drop-offs, so walk time must NOT be pre-discounted here.
    // Farm in particular is the farm-capped 0.40 (0.53 worker rate capped by the farm);
    // shipping a walk-inclusive "effective" rate double-counts the walk and starves
    // the whole food economy (late age-ups, failed unit orders).
    expect(units.villager.gather).toEqual({
      forage: 0.31, hunt: 0.41, farm: 0.4, wood: 0.39, gold: 0.38, stone: 0.36,
    });
  });
});

describe('costs', () => {
  const checkCost = (label: string, cost: Cost) => {
    for (const [res, amount] of Object.entries(cost)) {
      expect(amount, `${label} cost.${res}`).toBeGreaterThan(0);
      expect(Number.isInteger(amount), `${label} cost.${res} integer`).toBe(true);
    }
  };

  it('all present cost entries are positive integers', () => {
    for (const u of Object.values(units)) checkCost(`unit ${u.id}`, u.cost);
    for (const b of Object.values(buildings)) checkCost(`building ${b.id}`, b.cost);
    for (const t of Object.values(techs)) checkCost(`tech ${t.id}`, t.cost);
  });

  it('trainable units, buildings, and techs cost something', () => {
    for (const u of Object.values(units)) {
      if (u.trainedAt.length > 0) {
        expect(Object.keys(u.cost).length, `unit ${u.id} must have a cost`).toBeGreaterThan(0);
      }
    }
    for (const b of Object.values(buildings)) {
      expect(Object.keys(b.cost).length, `building ${b.id} must have a cost`).toBeGreaterThan(0);
    }
    for (const t of Object.values(techs)) {
      expect(Object.keys(t.cost).length, `tech ${t.id} must have a cost`).toBeGreaterThan(0);
    }
  });
});

describe('icons', () => {
  it('every def has an icon frame name', () => {
    for (const u of Object.values(units)) expect(u.icon, `unit ${u.id}`).toMatch(/^icon\//);
    for (const b of Object.values(buildings)) expect(b.icon, `building ${b.id}`).toMatch(/^icon\//);
    for (const t of Object.values(techs)) expect(t.icon, `tech ${t.id}`).toMatch(/^icon\/tech\//);
    for (const r of Object.values(resources)) expect(r.icon, `resource ${r.id}`).toMatch(/^icon\//);
  });
});

describe('age gating', () => {
  const defAge = (id: string): AgeId => (units[id] ?? buildings[id]).age;

  it('upgrade lines are monotonic and gated no earlier than the tech', () => {
    for (const t of Object.values(techs)) {
      for (const e of t.effects) {
        if (e.kind !== 'upgradeUnit') continue;
        const from = ageIdx(defAge(e.from));
        const to = ageIdx(defAge(e.to));
        expect(to, `${t.id}: ${e.to} must not predate ${e.from}`).toBeGreaterThanOrEqual(from);
        expect(to, `${t.id}: upgraded def age must match the tech age`).toBe(ageIdx(t.age));
      }
    }
  });

  it('units gated by a tech are not available before it', () => {
    for (const u of Object.values(units)) {
      if (!u.requiresTech) continue;
      expect(ageIdx(u.age), `${u.id} vs ${u.requiresTech}`).toBeGreaterThanOrEqual(ageIdx(techs[u.requiresTech].age));
    }
  });

  it('tech prerequisite chains never go back in time', () => {
    for (const t of Object.values(techs)) {
      if (!t.requiresTech) continue;
      expect(ageIdx(t.age), `${t.id} vs prereq ${t.requiresTech}`).toBeGreaterThanOrEqual(ageIdx(techs[t.requiresTech].age));
    }
  });

  it('techs are not researchable before their building exists', () => {
    for (const t of Object.values(techs)) {
      const earliest = Math.min(...t.researchedAt.map((b) => ageIdx(buildings[b].age)));
      expect(ageIdx(t.age), `${t.id} vs its research building`).toBeGreaterThanOrEqual(earliest);
    }
  });

  it('units are not trainable before their building exists', () => {
    for (const u of Object.values(units)) {
      if (u.trainedAt.length === 0) continue;
      const earliest = Math.min(...u.trainedAt.map((b) => ageIdx(buildings[b].age)));
      expect(ageIdx(u.age), `${u.id} vs its production building`).toBeGreaterThanOrEqual(earliest);
    }
  });

  it('age-up techs follow the 2-buildings-of-current-age rule', () => {
    for (const id of ['feudalAge', 'castleAge', 'imperialAge']) {
      expect(techs[id].requiresBuildingsOfCurrentAge, id).toBe(2);
    }
  });
});

describe('tech tree structure', () => {
  it('has no cycles (requiresTech + freeTech edges)', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const edges = (id: string): string[] => {
      const t = techs[id];
      const out = t.requiresTech ? [t.requiresTech] : [];
      for (const e of t.effects) if (e.kind === 'freeTech') out.push(e.techId);
      return out;
    };
    const visit = (id: string, path: string[]): void => {
      if (done.has(id)) return;
      expect(visiting.has(id), `cycle: ${[...path, id].join(' -> ')}`).toBe(false);
      visiting.add(id);
      for (const next of edges(id)) visit(next, [...path, id]);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of Object.keys(techs)) visit(id, []);
  });

  it('upgradeUnit sources and targets share a production/placement site', () => {
    for (const t of Object.values(techs)) {
      for (const e of t.effects) {
        if (e.kind !== 'upgradeUnit') continue;
        if (unitIds.has(e.from)) {
          expect(unitIds.has(e.to), `${t.id}: ${e.from} -> ${e.to} must both be units`).toBe(true);
          expect(units[e.to].trainedAt, `${t.id}: upgraded unit trains at the same building`)
            .toEqual(units[e.from].trainedAt);
        } else {
          expect(buildingIds.has(e.to), `${t.id}: ${e.from} -> ${e.to} must both be buildings`).toBe(true);
        }
      }
    }
  });
});

describe('roster completeness', () => {
  it('contains the full GDD v1 roster', () => {
    const expectUnits = [
      'villager', 'militia', 'manAtArms', 'longswordsman', 'champion', 'spearman', 'pikeman',
      'archer', 'crossbowman', 'arbalester', 'skirmisher', 'eliteSkirmisher',
      'scout', 'lightCavalry', 'knight', 'cavalier', 'paladin',
      'batteringRam', 'cappedRam', 'siegeRam', 'mangonel', 'onager', 'trebuchet', 'monk',
      'highlandRaider', 'eliteHighlandRaider', 'longbowman', 'eliteLongbowman',
      'housecarl', 'eliteHousecarl', 'chevalier', 'eliteChevalier',
      'mangudai', 'eliteMangudai', 'cataphract', 'eliteCataphract',
      'mamluk', 'eliteMamluk',
      'sheep', 'deer', 'wolf',
    ];
    for (const id of expectUnits) expect(unitIds.has(id), id).toBe(true);
    const expectBuildings = [
      'townCenter', 'house', 'mill', 'lumberCamp', 'miningCamp', 'farm', 'barracks',
      'archeryRange', 'stable', 'siegeWorkshop', 'blacksmith', 'market', 'monastery',
      'university', 'watchTower', 'guardTower', 'keep', 'stoneWall', 'gate', 'castle', 'wonder',
    ];
    for (const id of expectBuildings) expect(buildingIds.has(id), id).toBe(true);
    for (const id of ['tree', 'goldMine', 'stoneMine', 'berryBush']) {
      expect(id in resources, id).toBe(true);
    }
    expect(Object.keys(civs).sort()).toEqual([
      'byzantines', 'english', 'french', 'mongols', 'norse', 'saracens', 'scots',
    ]);
  });

  it('gaia animals carry the gaia fields', () => {
    expect(units.sheep.foodAmount).toBe(100);
    expect(units.sheep.herdable).toBe(true);
    expect(units.deer.foodAmount).toBe(140);
    expect(units.wolf.attacks.length).toBeGreaterThan(0); // wolves are hostile
  });
});
