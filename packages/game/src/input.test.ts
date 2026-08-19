// Tap intent inference (GDD Mobile UX): snap priority for taps with/without a
// commandable selection. Regression coverage for the wave-1 inversion where any
// own unit inside the pick slop stole the tap from a dead-center enemy and
// dropped the player's army selection mid-fight, and for the buildings-only
// inversion where re-tapping a selected TC (or tapping another own building)
// silently moved its rally point instead of selecting.

import { describe, expect, it } from 'vitest';
import { GAIA, type Entity, type EntityId, type PlayerId } from '@bf/sim/types';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import {
  edgePanVector, enemyContextTarget, isContextAttackTarget, isVillagerGatherTarget, isVillagerGatherTargetAt, keyboardPanVector,
  InputController, resolveDesktopPrimaryAction, resolveTapAction,
  type TapSelection,
} from './input';
import { tileToWorld } from './camera';
import type { Command, GameState } from '@bf/sim/types';

const HUMAN = 1 as PlayerId;
const ENEMY = 2 as PlayerId;

const NO_SEL: TapSelection = { units: 0, buildings: 0 };
const UNIT_SEL: TapSelection = { units: 2, buildings: 0 };
const BLD_SEL: TapSelection = { units: 0, buildings: 1 };

let nextId = 1;
function ent(partial: Partial<Entity>): Entity {
  return {
    id: (nextId++) as EntityId,
    kind: 'unit',
    defId: 'militia',
    player: HUMAN,
    x: 0, y: 0, tileX: 0, tileY: 0,
    facing: 0,
    hp: 40, maxHp: 40,
    activity: 'idle',
    ...partial,
  } as Entity;
}

describe('resolveTapAction — units selected', () => {
  it('an enemy anywhere in the slop wins the tap (attack, not reselect)', () => {
    // picks are distance-ordered: enemy tapped dead-center, own unit adjacent (melee)
    const enemy = ent({ player: ENEMY });
    const own = ent({ player: HUMAN });
    expect(resolveTapAction([enemy, own], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
    // even when the own unit happens to be the nearest pick, the enemy still wins
    expect(resolveTapAction([own, enemy], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
  });

  it('with no enemy, the nearest own unit is an instant reselect', () => {
    const own = ent({ player: HUMAN });
    const res = ent({ kind: 'resource', player: GAIA, defId: 'tree' });
    expect(resolveTapAction([own, res], UNIT_SEL, HUMAN)).toEqual({ type: 'select', id: own.id });
  });

  it('an own unit that is NOT the nearest pick does not steal the tap', () => {
    const res = ent({ kind: 'resource', player: GAIA, defId: 'berryBush' });
    const own = ent({ player: HUMAN });
    // villager ordered onto a berry bush with own units in the slop: gather, not reselect
    expect(resolveTapAction([res, own], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
  });

  it('ground tap: commands selected units to move and keeps the selection', () => {
    expect(resolveTapAction([], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
    expect(resolveTapAction([], NO_SEL, HUMAN)).toEqual({ type: 'none' });
  });

  it('own buildings do not preempt the context command when units are selected (rally/repair)', () => {
    const bld = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    expect(resolveTapAction([bld], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
  });
});

describe('InputController touch command dispatch', () => {
  function touchController(selection: Entity[], initialVerb: 'rally' | null) {
    const issued: Command[] = [];
    let armedVerb: 'rally' | null = initialVerb;
    const host = {
      humanPlayer: HUMAN,
      camera: {
        zoom: 1,
        screenToWorld: () => tileToWorld(20, 20),
      },
      world: { pickAt: () => [] },
      getState: () => ({ map: { width: 64, height: 64 } }) as GameState,
      getSelection: () => selection,
      setSelection: () => {},
      deselect: () => {},
      issue: (cmd: Command) => issued.push(cmd),
      issueWithUndo: (cmd: Command) => issued.push(cmd),
      isPlacing: () => false,
      getArmedVerb: () => armedVerb,
      clearArmedVerb: () => { armedVerb = null; },
      getFormation: () => 'line',
    };
    const controller = Object.create(InputController.prototype) as InputController;
    Object.assign(controller, { host, el: { style: {} } });
    const tap = () => (controller as unknown as { handleTap(x: number, y: number): void }).handleTap(20, 20);
    return { issued, tap, armedVerb: () => armedVerb };
  }

  it('consumes an armed Rally tap and sets the selected production building rally', () => {
    const barracks = ent({ kind: 'building', defId: 'barracks', player: HUMAN, x: 10, y: 10 });
    const { issued, tap, armedVerb } = touchController([barracks], 'rally');

    tap();

    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ kind: 'setRally', buildingId: barracks.id });
    expect(armedVerb()).toBeNull();
  });

  it('moves a selected villager on an unarmed ground tap without deselecting it', () => {
    const villager = ent({ defId: 'villager', player: HUMAN });
    const { issued, tap } = touchController([villager], null);

    tap();

    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({ kind: 'move', units: [villager.id] });
  });
});

describe('resolveTapAction — buildings-only selection', () => {
  it('re-tapping the selected building reselects — it must NOT move the rally point', () => {
    const tc = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    expect(resolveTapAction([tc], BLD_SEL, HUMAN)).toEqual({ type: 'select', id: tc.id });
  });

  it('tapping ANOTHER own building switches selection in one tap (TC -> Barracks)', () => {
    const barracks = ent({ kind: 'building', defId: 'barracks', player: HUMAN });
    expect(resolveTapAction([barracks], BLD_SEL, HUMAN)).toEqual({ type: 'select', id: barracks.id });
  });

  it('tapping an own unit selects it', () => {
    const vill = ent({ kind: 'unit', defId: 'villager', player: HUMAN });
    expect(resolveTapAction([vill], BLD_SEL, HUMAN)).toEqual({ type: 'select', id: vill.id });
  });

  it('ground deselects; resource and enemy taps inspect instead of setting rally', () => {
    expect(resolveTapAction([], BLD_SEL, HUMAN)).toEqual({ type: 'deselect' });
    const sheep = ent({ kind: 'unit', defId: 'sheep', player: GAIA });
    expect(resolveTapAction([sheep], BLD_SEL, HUMAN)).toEqual({ type: 'inspect', id: sheep.id });
    const enemy = ent({ player: ENEMY });
    expect(resolveTapAction([enemy], BLD_SEL, HUMAN)).toEqual({ type: 'inspect', id: enemy.id });
  });

  it('an own building that is NOT the nearest pick does not steal an inspection tap', () => {
    const sheep = ent({ kind: 'unit', defId: 'sheep', player: GAIA });
    const tc = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    expect(resolveTapAction([sheep, tc], BLD_SEL, HUMAN)).toEqual({ type: 'inspect', id: sheep.id });
  });
});

describe('resolveTapAction — captured sheep are food, not a reselect (AoE2 opening)', () => {
  const VILL_SEL: TapSelection = { units: 2, buildings: 0, villagers: 2 };
  const MIL_SEL: TapSelection = { units: 2, buildings: 0, villagers: 0 };

  it('villagers selected: tapping an OWN sheep is a command (gather), even dead-center', () => {
    const ownSheep = ent({ kind: 'unit', defId: 'sheep', player: HUMAN });
    expect(resolveTapAction([ownSheep], VILL_SEL, HUMAN)).toEqual({ type: 'command' });
    // an own non-food unit further out must not steal it either
    const ownVill = ent({ kind: 'unit', defId: 'villager', player: HUMAN });
    expect(resolveTapAction([ownSheep, ownVill], VILL_SEL, HUMAN)).toEqual({ type: 'command' });
  });

  it('military-only selection: tapping an own sheep keeps the reselect behavior', () => {
    const ownSheep = ent({ kind: 'unit', defId: 'sheep', player: HUMAN });
    expect(resolveTapAction([ownSheep], MIL_SEL, HUMAN)).toEqual({ type: 'select', id: ownSheep.id });
  });

  it('no selection: tapping an own sheep still selects it', () => {
    const ownSheep = ent({ kind: 'unit', defId: 'sheep', player: HUMAN });
    expect(resolveTapAction([ownSheep], NO_SEL, HUMAN)).toEqual({ type: 'select', id: ownSheep.id });
  });

  it('an enemy in the slop still outranks the sheep (melee taps stay attacks)', () => {
    const ownSheep = ent({ kind: 'unit', defId: 'sheep', player: HUMAN });
    const enemy = ent({ player: ENEMY });
    expect(resolveTapAction([ownSheep, enemy], VILL_SEL, HUMAN)).toEqual({ type: 'command' });
  });
});

describe('villager gather targets', () => {
  it('recognizes a live completed own farm as food', () => {
    const farm = ent({
      kind: 'building', defId: 'farm', player: HUMAN,
      hp: 480, maxHp: 480, buildProgress: 1000, amountLeft: 175,
    });
    expect(isVillagerGatherTarget(farm, HUMAN)).toBe(true);
    expect(isVillagerGatherTarget({ ...farm, amountLeft: 0 }, HUMAN)).toBe(false);
    expect(isVillagerGatherTarget({ ...farm, buildProgress: 999 }, HUMAN)).toBe(false);
    expect(isVillagerGatherTarget({ ...farm, player: ENEMY }, HUMAN)).toBe(false);
  });

  it('rejects non-food Gaia units instead of issuing a gather no-op', () => {
    expect(isVillagerGatherTarget(ent({ defId: 'sheep', player: GAIA }), HUMAN)).toBe(true);
    expect(isVillagerGatherTarget(ent({ defId: 'wolf', player: GAIA }), HUMAN)).toBe(false);
  });

  it('matches the sim rule for live enemy animals and edible carcasses', () => {
    expect(isVillagerGatherTarget(ent({ defId: 'deer', player: ENEMY, hp: 5 }), HUMAN)).toBe(false);
    expect(isVillagerGatherTarget(ent({
      defId: 'deer', player: ENEMY, hp: 0, amountLeft: 40,
    }), HUMAN)).toBe(true);
    expect(isVillagerGatherTarget(ent({
      defId: 'deer', player: GAIA, hp: 0, amountLeft: 0,
    }), HUMAN)).toBe(false);
  });

  it('does not let farm pick slop steal a move click just beyond the field', () => {
    const farm = ent({
      kind: 'building', defId: 'farm', player: HUMAN,
      tileX: 10, tileY: 9, hp: 480, maxHp: 480, buildProgress: 1000, amountLeft: 175,
    });
    const inside = tileToWorld(11.5, 10.5);
    const beyond = tileToWorld(13.1, 10.5);
    expect(isVillagerGatherTargetAt(farm, HUMAN, inside.x, inside.y)).toBe(true);
    expect(isVillagerGatherTargetAt(farm, HUMAN, beyond.x, beyond.y)).toBe(false);
  });
});

describe('enemy foundation targeting', () => {
  it('lets a directly clicked half-built building win over the builder standing on it', () => {
    const foundation = ent({
      kind: 'building', defId: 'house', player: ENEMY,
      tileX: 10, tileY: 10, x: 11 * 256, y: 11 * 256,
      hp: 40, maxHp: 750, buildProgress: 200,
    });
    const builder = ent({ kind: 'unit', defId: 'villager', player: ENEMY });
    const center = tileToWorld(11, 11);
    expect(enemyContextTarget([builder, foundation], HUMAN, center.x, center.y)?.id).toBe(foundation.id);
  });

  it('keeps normal nearest-enemy priority away from a foundation footprint', () => {
    const unit = ent({ player: ENEMY });
    const foundation = ent({
      kind: 'building', defId: 'house', player: ENEMY,
      tileX: 20, tileY: 20, buildProgress: 400,
    });
    const elsewhere = tileToWorld(2, 2);
    expect(enemyContextTarget([unit, foundation], HUMAN, elsewhere.x, elsewhere.y)?.id).toBe(unit.id);
  });
});

describe('hostile Gaia targeting', () => {
  it('makes wolves valid attack targets without turning harmless animals into enemies', () => {
    const wolf = ent({ defId: 'wolf', player: GAIA });
    const sheep = ent({ defId: 'sheep', player: GAIA });
    const center = tileToWorld(0, 0);
    expect(isContextAttackTarget(wolf, HUMAN)).toBe(true);
    expect(enemyContextTarget([wolf], HUMAN, center.x, center.y)?.id).toBe(wolf.id);
    expect(isContextAttackTarget(sheep, HUMAN)).toBe(false);
    expect(enemyContextTarget([sheep], HUMAN, center.x, center.y)).toBeUndefined();
  });

  it('keeps a selected unit in command mode when a wolf is tapped', () => {
    const wolf = ent({ defId: 'wolf', player: GAIA });
    expect(resolveTapAction([wolf], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
  });
});

describe('resolveTapAction — no selection', () => {
  it('bare taps stay instant select: own unit, then own building', () => {
    const own = ent({ player: HUMAN });
    expect(resolveTapAction([own], NO_SEL, HUMAN)).toEqual({ type: 'select', id: own.id });
    const bld = ent({ kind: 'building', defId: 'barracks', player: HUMAN });
    expect(resolveTapAction([bld], NO_SEL, HUMAN)).toEqual({ type: 'select', id: bld.id });
    // own unit outranks own building regardless of distance (units are tiny)
    expect(resolveTapAction([bld, own], NO_SEL, HUMAN)).toEqual({ type: 'select', id: own.id });
  });

  it('enemy/resource with nothing selected: inspect, never a command', () => {
    const enemy = ent({ player: ENEMY });
    expect(resolveTapAction([enemy], NO_SEL, HUMAN)).toEqual({ type: 'inspect', id: enemy.id });
    const res = ent({ kind: 'resource', player: GAIA, defId: 'goldMine' });
    expect(resolveTapAction([res], NO_SEL, HUMAN)).toEqual({ type: 'inspect', id: res.id });
  });
});

describe('resolveDesktopPrimaryAction — mouse-left is selection-only', () => {
  it('clears the current selection when the pointer is on empty ground', () => {
    expect(resolveDesktopPrimaryAction([], HUMAN)).toEqual({ type: 'deselect' });
  });

  it('selects the nearest own building even when friendly units are in the pick slop', () => {
    const tc = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    const villager = ent({ kind: 'unit', defId: 'villager', player: HUMAN });
    expect(resolveDesktopPrimaryAction([tc, villager], HUMAN)).toEqual({ type: 'select', id: tc.id });
  });

  it('replaces an army selection with the own unit directly under the pointer', () => {
    const villager = ent({ kind: 'unit', defId: 'villager', player: HUMAN });
    expect(resolveDesktopPrimaryAction([villager], HUMAN)).toEqual({ type: 'select', id: villager.id });
  });

  it('inspects visible enemies and resources instead of issuing an order', () => {
    const enemy = ent({ player: ENEMY });
    expect(resolveDesktopPrimaryAction([enemy], HUMAN)).toEqual({ type: 'inspect', id: enemy.id });
    const gold = ent({ kind: 'resource', player: GAIA, defId: 'goldMine' });
    expect(resolveDesktopPrimaryAction([gold], HUMAN)).toEqual({ type: 'inspect', id: gold.id });
  });
});

describe('wave-2 gating contract', () => {
  // PENDING_COMMAND_KINDS shrinks as wave-2 sim systems land — asserting that a
  // specific verb IS pending would go stale mid-integration. The stable invariant
  // the HUD depends on: core wave-1 verbs are implemented and never gated.
  it('core verbs are never reported as pending (HUD relies on issuing them)', () => {
    for (const k of ['move', 'attackMove', 'stop', 'train', 'cancelTrain', 'setRally', 'build', 'deleteEntity', 'resign'] as const) {
      expect(PENDING_COMMAND_KINDS.has(k)).toBe(false);
    }
  });
});

describe('desktop edge scrolling', () => {
  it('maps every canvas edge to the matching camera-pan direction', () => {
    expect(edgePanVector(0, 300, 800, 600)).toEqual({ x: 1, y: 0 });
    expect(edgePanVector(800, 300, 800, 600)).toEqual({ x: -1, y: 0 });
    expect(edgePanVector(400, 0, 800, 600)).toEqual({ x: 0, y: 1 });
    expect(edgePanVector(400, 600, 800, 600)).toEqual({ x: 0, y: -1 });
    expect(edgePanVector(400, 300, 800, 600)).toEqual({ x: 0, y: 0 });
  });

  it('scrolls diagonally from a corner and ignores invalid viewports', () => {
    expect(edgePanVector(3, 4, 800, 600)).toEqual({ x: 1, y: 1 });
    expect(edgePanVector(-20, 300, 800, 600)).toEqual({ x: 1, y: 0 });
    expect(edgePanVector(400, 640, 800, 600)).toEqual({ x: 0, y: -1 });
    expect(edgePanVector(0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('keyboard camera scrolling', () => {
  it('maps WASD exactly like the arrow keys and supports diagonals', () => {
    expect(keyboardPanVector(new Set(['w']))).toEqual(keyboardPanVector(new Set(['ArrowUp'])));
    expect(keyboardPanVector(new Set(['a']))).toEqual({ x: 1, y: 0 });
    expect(keyboardPanVector(new Set(['s', 'd']))).toEqual({ x: -1, y: -1 });
  });

  it('cancels opposite directions instead of accelerating', () => {
    expect(keyboardPanVector(new Set(['a', 'd', 'w', 's']))).toEqual({ x: 0, y: 0 });
  });
});
