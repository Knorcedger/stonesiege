// Fidelity-critic invariants against docs/AOE2_REFERENCE.md exact numbers:
// farm tech line raises per-farm food (§1/§6), damage-formula edge cases (per-class
// flooring, negative armor, min-1 total — §3/§5 model), and garrison-arrow caps with
// non-qualifying garrison units (§5: melee units add zero arrows).

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import type { Game, SimEvent } from './types';
import { createGame } from './game';
import { computeDamage } from './damage';
import { grassMap, player, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

interface Timed { tick: number; ev: SimEvent }

function run(game: Game, ticks: number, out?: Timed[]): void {
  for (let t = 0; t < ticks; t++) {
    const tick = game.state.tick;
    for (const ev of game.advance([])) out?.push({ tick, ev });
  }
}

describe('farm tech line (AOE2_REFERENCE §1/§6: 175 → +75 Horse Collar)', () => {
  it('a farm reseeded after Horse Collar holds 250 food', () => {
    const game = createGame(scenarioConfig(501, grassMap(30, 30), [
      { defId: 'mill', player: P1, tileX: 5, tileY: 5, ref: 'mill' },
      { defId: 'farm', player: P1, tileX: 10, tileY: 9, ref: 'farm', amountLeft: 0 }, // fallow
    ], [player({ startingAge: 'feudal' })]));
    const mill = game.state.refs.get('mill')!;
    const farmId = game.state.refs.get('farm')!;

    game.advance([{ kind: 'research', player: P1, buildingId: mill, techId: 'horseCollar' }]);
    run(game, 20 * 20 + 10); // 20 s research
    expect(game.state.players[P1].researchedTechs).toContain('horseCollar');

    game.advance([{ kind: 'reseedFarm', player: P1, farmId }]);
    // base 175 + 75 (Horse Collar) — the tech must actually reach resolveFarmFood
    expect(game.state.entities.get(farmId)!.amountLeft).toBe(250);
  });
});

describe('damage formula edge cases (per-class flooring, negative armor, min 1 total)', () => {
  const protOf = (buildingId: string) => {
    const def = gameData.buildings[buildingId]!;
    return { classes: def.classes, armor: def.armor };
  };
  const unitProtOf = (unitId: string) => {
    const def = gameData.units[unitId]!;
    return { classes: def.classes, armor: def.armor };
  };

  it('militia vs stone wall: base floored to 0, no bonuses → total clamps to 1', () => {
    const wall = protOf('stoneWall'); // melee armor 8
    const dmg = computeDamage(gameData.units.militia!.attacks, wall.classes, wall.armor);
    expect(dmg).toBe(1); // max(0, 4 − 8) = 0, then max(1, 0) = 1
  });

  it('militia vs battering ram: negative melee armor ADDS damage (4 − (−3) = 7)', () => {
    const ram = unitProtOf('batteringRam');
    const dmg = computeDamage(gameData.units.militia!.attacks, ram.classes, ram.armor);
    expect(dmg).toBe(7);
  });

  it('villager vs stone wall: base floors at 0 per class, bonuses still sum (0+3+6=9)', () => {
    // if flooring happened AFTER summing, 3−8 would eat into the bonuses (total 4)
    const wall = protOf('stoneWall');
    const dmg = computeDamage(gameData.units.villager!.attacks, wall.classes, wall.armor);
    expect(dmg).toBe(9); // melee max(0,3−8)=0 + building 3 + wallOrTower 6
  });
});

describe('garrison arrows (AOE2_REFERENCE §5: caps; melee garrison adds zero)', () => {
  function lastVolley(evs: Timed[], fromId: number): number {
    const volleys = new Map<number, number>();
    for (const e of evs) {
      if (e.ev.kind === 'projectileFired' && e.ev.fromId === fromId) {
        volleys.set(e.tick, (volleys.get(e.tick) ?? 0) + 1);
      }
    }
    const sizes = [...volleys.values()];
    return sizes[sizes.length - 1] ?? 0;
  }

  it('tower with 5 villagers caps at arrowsMax 5 (1 base + 5 would be 6)', () => {
    const game = createGame(scenarioConfig(502, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10, ref: 'tower' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 9, ref: 'v0' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 10, ref: 'v1' },
      { defId: 'villager', player: P1, tileX: 9, tileY: 11, ref: 'v2' },
      { defId: 'villager', player: P1, tileX: 10, tileY: 11, ref: 'v3' },
      { defId: 'villager', player: P1, tileX: 11, tileY: 11, ref: 'v4' },
      { defId: 'militia', player: P2, tileX: 14, tileY: 10 },
    ], [player(), player({ civ: 'english' })]));
    const tower = game.state.refs.get('tower')!;
    const vills = ['v0', 'v1', 'v2', 'v3', 'v4'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'garrison', player: P1, units: vills, targetId: tower }]);
    const evs: Timed[] = [];
    run(game, 150, evs);

    expect(game.state.entities.get(tower)!.garrison).toHaveLength(5);
    expect(lastVolley(evs, tower)).toBe(5); // capped at arrowsMax, not 6
  });

  it('garrisoned militia add NO arrows (only villagers and foot archers count)', () => {
    const game = createGame(scenarioConfig(503, grassMap(30, 30), [
      { defId: 'watchTower', player: P1, tileX: 10, tileY: 10, ref: 'tower' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 10, ref: 'm0' },
      { defId: 'militia', player: P1, tileX: 9, tileY: 11, ref: 'm1' },
      { defId: 'militia', player: P2, tileX: 14, tileY: 10 },
    ], [player(), player({ civ: 'english' })]));
    const tower = game.state.refs.get('tower')!;
    const mils = ['m0', 'm1'].map((r) => game.state.refs.get(r)!);
    game.advance([{ kind: 'garrison', player: P1, units: mils, targetId: tower }]);
    const evs: Timed[] = [];
    run(game, 150, evs);

    expect(game.state.entities.get(tower)!.garrison).toHaveLength(2);
    expect(lastVolley(evs, tower)).toBe(1); // arrowsBase only
  });
});
