// Tap intent inference (GDD Mobile UX): snap priority for taps with/without a
// commandable selection. Regression coverage for the wave-1 inversion where any
// own unit inside the pick slop stole the tap from a dead-center enemy and
// dropped the player's army selection mid-fight, and for the buildings-only
// inversion where re-tapping a selected TC (or tapping another own building)
// silently moved its rally point instead of selecting.

import { describe, expect, it } from 'vitest';
import { GAIA, type Entity, type EntityId, type PlayerId } from '@bf/sim/types';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { edgePanVector, resolveDesktopPrimaryAction, resolveTapAction, type TapSelection } from './input';

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

  it('ground tap: command with units selected, nothing without a selection', () => {
    expect(resolveTapAction([], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
    expect(resolveTapAction([], NO_SEL, HUMAN)).toEqual({ type: 'none' });
  });

  it('own buildings do not preempt the context command when units are selected (rally/repair)', () => {
    const bld = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    expect(resolveTapAction([bld], UNIT_SEL, HUMAN)).toEqual({ type: 'command' });
  });
});

describe('resolveTapAction — buildings-only selection (GDD: tap a building = select)', () => {
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

  it('ground / resource / enemy taps still set the rally (command)', () => {
    expect(resolveTapAction([], BLD_SEL, HUMAN)).toEqual({ type: 'command' });
    const sheep = ent({ kind: 'unit', defId: 'sheep', player: GAIA });
    expect(resolveTapAction([sheep], BLD_SEL, HUMAN)).toEqual({ type: 'command' });
    const enemy = ent({ player: ENEMY });
    expect(resolveTapAction([enemy], BLD_SEL, HUMAN)).toEqual({ type: 'command' });
  });

  it('an own building that is NOT the nearest pick does not steal a rally tap onto a resource', () => {
    const sheep = ent({ kind: 'unit', defId: 'sheep', player: GAIA });
    const tc = ent({ kind: 'building', defId: 'townCenter', player: HUMAN });
    expect(resolveTapAction([sheep, tc], BLD_SEL, HUMAN)).toEqual({ type: 'command' });
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
