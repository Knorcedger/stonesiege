// Command-card model: affordable actions must render their COLORED icon and be
// enabled; gray (`<icon>/gray`) is reserved for genuinely unavailable actions.
// Regression coverage for the wave-1 card that rendered every build icon gray
// despite a full stockpile, plus wave-2 coverage: civ tech-tree filtering,
// line-upgrade collapsing, pop-cap disabling, research menus, the age-up
// requirement counter, unit verb buttons, and the garrison panel.
//
// NOTE on wave-2 gating: enabled-ness of research/garrison/etc. buttons tracks
// PENDING_COMMAND_KINDS, which SHRINKS as sim systems land. Assertions compare
// against the live set so these tests stay green through sim integration.

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { FP, type Entity, type EntityId } from '@bf/sim/types';
import {
  ageUpButton, ageUpRequirement, buildMenuButtons, canAffordCost, civUnitCost,
  farmReseedButton, garrisonPanel, hasActiveRally, iconVariant, millAutoReseedButton,
  queueChipModel, researchMenuButtons, trainMenuButtons, unitVerbButtons,
  type PlayerCardView,
} from './cardModel';

const RICH = { food: 200, wood: 200, gold: 100, stone: 200 };
const BROKE = { food: 0, wood: 0, gold: 0, stone: 0 };
const LOADED = { food: 9999, wood: 9999, gold: 9999, stone: 9999 };

function view(over: Partial<PlayerCardView> = {}): PlayerCardView {
  return {
    stockpile: RICH, age: 'dark', civ: 'scots', researchedTechs: [],
    pop: 4, popCap: 10, ...over,
  };
}

let nextId = 1;
function ent(partial: Partial<Entity>): Entity {
  return {
    id: (nextId++) as EntityId,
    kind: 'unit',
    defId: 'militia',
    player: 1,
    x: 0, y: 0, tileX: 0, tileY: 0,
    facing: 0,
    hp: 40, maxHp: 40,
    activity: 'idle',
    ...partial,
  } as Entity;
}

/** Every prereq any v1 building can require — completed, so only cost/age gate. */
const ALL_PREREQS = ['mill', 'barracks', 'blacksmith'];

describe('buildMenuButtons', () => {
  it('with the starting stockpile, every affordable dark-age building is enabled and colored', () => {
    const buttons = buildMenuButtons(RICH, 'dark', [], ALL_PREREQS);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const cost = gameData.buildings[b.id].cost;
      if (canAffordCost(RICH, cost)) {
        expect(b, `${b.id} should be enabled at 200f/200w/100g/200s`).toMatchObject({
          enabled: true,
          icon: gameData.buildings[b.id].icon, // colored, no /gray suffix
        });
        expect(b.reason).toBeUndefined();
      }
    }
    // concrete anchor: house (25w) colored+enabled
    const house = buttons.find((b) => b.id === 'house')!;
    expect(house).toMatchObject({ enabled: true, icon: 'icon/house' });
    // GDD: extra TCs unlock in Castle Age — hidden from the dark-age card entirely
    // (mirrors the sim's buildAgeIndex gate, so the button never lies about placeability)
    expect(buttons.find((b) => b.id === 'townCenter')).toBeUndefined();
    const castleButtons = buildMenuButtons(LOADED, 'castle');
    const tc = castleButtons.find((b) => b.id === 'townCenter')!;
    expect(tc).toMatchObject({ enabled: true, icon: 'icon/townCenter' });
  });

  it('with an empty stockpile, every button is gray with a cost reason', () => {
    for (const b of buildMenuButtons(BROKE, 'dark', [], ALL_PREREQS)) {
      expect(b.enabled).toBe(false);
      expect(b.icon.endsWith('/gray')).toBe(true);
      expect(b.reason).toBe('not enough resources');
    }
  });

  it('unmet requiresBuildings gray the button with an honest reason (sim hasBuildPrereqs mirror)', () => {
    // no completed buildings: Farm (mill), Range/Stable (barracks), Siege Workshop (blacksmith)
    const none = buildMenuButtons(LOADED, 'castle', []);
    expect(none.find((b) => b.id === 'farm')).toMatchObject({
      enabled: false, icon: `${gameData.buildings.farm.icon}/gray`, reason: 'requires a Mill',
    });
    expect(none.find((b) => b.id === 'archeryRange')).toMatchObject({ enabled: false, reason: 'requires a Barracks' });
    expect(none.find((b) => b.id === 'stable')).toMatchObject({ enabled: false, reason: 'requires a Barracks' });
    expect(none.find((b) => b.id === 'siegeWorkshop')).toMatchObject({ enabled: false, reason: 'requires a Blacksmith' });
    // prereq completed: the same buttons come alive
    const met = buildMenuButtons(LOADED, 'castle', [], ALL_PREREQS);
    for (const id of ['farm', 'archeryRange', 'stable', 'siegeWorkshop']) {
      expect(met.find((b) => b.id === id), id).toMatchObject({ enabled: true });
    }
  });

  it('the prereq reason outranks affordability (name the actionable blocker first)', () => {
    const farm = buildMenuButtons(BROKE, 'dark', [], []).find((b) => b.id === 'farm')!;
    expect(farm.enabled).toBe(false);
    expect(farm.reason).toBe('requires a Mill');
  });

  it('only shows buildings of the current age or earlier, without unmet tech gates', () => {
    for (const b of buildMenuButtons(RICH, 'dark')) {
      const def = gameData.buildings[b.id];
      expect(def.age).toBe('dark');
      expect(def.requiresTech).toBeUndefined();
    }
  });

  it('tech-gated towers appear once researched, collapsing the superseded tier (sim hasBuildPrereqs mirror)', () => {
    // before the university techs: only the Watch Tower is constructible
    const base = buildMenuButtons(LOADED, 'castle').map((b) => b.id);
    expect(base).toContain('watchTower');
    expect(base).not.toContain('guardTower'); // requiresTech unmet
    expect(base).not.toContain('keep');
    // guardTowerUpgrade researched: new towers build as Guard Towers — and the
    // weaker Watch Tower button collapses away (one tower button per tier)
    const guard = buildMenuButtons(LOADED, 'castle', ['guardTowerUpgrade']).map((b) => b.id);
    expect(guard).toContain('guardTower');
    expect(guard).not.toContain('watchTower');
    // keepUpgrade in Imperial: Keep replaces Guard Tower
    const keep = buildMenuButtons(LOADED, 'imperial', ['guardTowerUpgrade', 'keepUpgrade']).map((b) => b.id);
    expect(keep).toContain('keep');
    expect(keep).not.toContain('guardTower');
    expect(keep).not.toContain('watchTower');
    // the age gate still applies even with the tech (Keep is Imperial-only)
    expect(buildMenuButtons(LOADED, 'castle', ['guardTowerUpgrade', 'keepUpgrade']).map((b) => b.id))
      .not.toContain('keep');
  });
});

describe('trainMenuButtons', () => {
  it('town center offers an affordable villager as enabled + colored', () => {
    const buttons = trainMenuButtons(view(), 'townCenter');
    const vill = buttons.find((b) => b.id === 'villager')!;
    expect(vill).toMatchObject({ enabled: true, icon: gameData.units.villager.icon });
  });

  it('unaffordable units render the /gray companion', () => {
    for (const b of trainMenuButtons(view({ stockpile: BROKE }), 'townCenter')) {
      expect(b.enabled).toBe(false);
      expect(b.icon.endsWith('/gray')).toBe(true);
    }
  });

  it('housed trains stay ENABLED with a non-blocking badge (queue-while-housed is AoE2 play)', () => {
    // sim production.ts: cost deducts on queue, the item stalls at the front until
    // a house completes — so the button must keep taking taps at 25/25
    const buttons = trainMenuButtons(view({ pop: 10, popCap: 10 }), 'townCenter');
    const vill = buttons.find((b) => b.id === 'villager')!;
    expect(vill.enabled).toBe(true);
    expect(vill.icon).toBe(gameData.units.villager.icon); // colored, not /gray
    expect(vill.reason).toBeUndefined();
    expect(vill.badge?.note).toContain('house');
    // not housed: no badge
    const roomy = trainMenuButtons(view(), 'townCenter').find((b) => b.id === 'villager')!;
    expect(roomy.badge).toBeUndefined();
  });

  it('housed AND broke: disabled for cost, badge still warns about housing', () => {
    const vill = trainMenuButtons(view({ stockpile: BROKE, pop: 10, popCap: 10 }), 'townCenter')
      .find((b) => b.id === 'villager')!;
    expect(vill.enabled).toBe(false);
    expect(vill.reason).toBe('not enough resources');
    expect(vill.badge).toBeDefined();
  });

  it('line upgrades collapse the line: Man-at-Arms replaces Militia once researched', () => {
    const before = trainMenuButtons(view({ age: 'feudal' }), 'barracks').map((b) => b.id);
    expect(before).toContain('militia');
    expect(before).not.toContain('manAtArms'); // requiresTech unmet
    const after = trainMenuButtons(
      view({ age: 'feudal', researchedTechs: ['manAtArmsUpgrade'] }),
      'barracks',
    ).map((b) => b.id);
    expect(after).toContain('manAtArms');
    expect(after).not.toContain('militia'); // upgraded away
  });

  it('the castle trains only the OWN civ unique unit', () => {
    const scots = trainMenuButtons(view({ age: 'castle', stockpile: LOADED }), 'castle').map((b) => b.id);
    expect(scots).toContain('highlandRaider');
    expect(scots).not.toContain('longbowman');
    const english = trainMenuButtons(view({ age: 'castle', civ: 'english', stockpile: LOADED }), 'castle').map((b) => b.id);
    expect(english).toContain('longbowman');
    expect(english).not.toContain('highlandRaider');
  });

  it('civ tech-tree cuts hide units (Scots have no Paladin)', () => {
    const ids = trainMenuButtons(
      view({ age: 'imperial', stockpile: LOADED, researchedTechs: ['lightCavalryUpgrade', 'cavalierUpgrade', 'paladinUpgrade'] }),
      'stable',
    ).map((b) => b.id);
    expect(ids).not.toContain('paladin');
  });

  it('civ cost bonuses show the price the sim will charge (Scots siege −15%)', () => {
    const v = view({ age: 'castle', civ: 'scots', stockpile: LOADED });
    const mang = trainMenuButtons(v, 'siegeWorkshop').find((b) => b.id === 'mangonel')!;
    const base = gameData.units.mangonel.cost;
    const scaled = civUnitCost('scots', 'castle', gameData.units.mangonel);
    expect(mang.cost).toEqual(scaled);
    expect(scaled.wood!).toBeLessThan(base.wood!);
    // English pay full price for siege
    expect(civUnitCost('english', 'castle', gameData.units.mangonel).wood).toBe(base.wood);
  });
});

describe('researchMenuButtons', () => {
  const pending = PENDING_COMMAND_KINDS.has('research');

  it('blacksmith in Feudal shows only feudal tier-1 techs; enabled tracks the wave-2 gate', () => {
    const ids = researchMenuButtons(view({ age: 'feudal', stockpile: LOADED }), 'blacksmith');
    const names = ids.map((b) => b.id);
    expect(names).toContain('forging');
    expect(names).toContain('fletching');
    expect(names).not.toContain('ironCasting'); // castle tier, chain unmet
    for (const b of ids) {
      expect(b.enabled).toBe(!pending);
      if (pending) expect(b.reason).toContain('wave-2');
    }
  });

  it('chained tiers appear once the previous tier is researched and the age allows', () => {
    const withChain = researchMenuButtons(
      view({ age: 'castle', stockpile: LOADED, researchedTechs: ['forging'] }),
      'blacksmith',
    ).map((b) => b.id);
    expect(withChain).toContain('ironCasting');
    expect(withChain).not.toContain('forging'); // already researched
  });

  it('castle unique techs are civ-filtered', () => {
    const scots = researchMenuButtons(view({ age: 'castle', stockpile: LOADED }), 'castle').map((b) => b.id);
    expect(scots).toContain('schiltron');
    expect(scots).not.toContain('yeomanLevy');
    const english = researchMenuButtons(view({ age: 'imperial', civ: 'english', stockpile: LOADED }), 'castle').map((b) => b.id);
    expect(english).toContain('yeomanLevy');
    expect(english).toContain('eliteLongbowmanUpgrade');
    expect(english).not.toContain('eliteHighlandRaiderUpgrade');
  });

  it('civ tech cuts hide techs (Scots lack Crop Rotation)', () => {
    const ids = researchMenuButtons(
      view({ age: 'imperial', stockpile: LOADED, researchedTechs: ['horseCollar', 'heavyPlow'] }),
      'mill',
    ).map((b) => b.id);
    expect(ids).not.toContain('cropRotation');
    const english = researchMenuButtons(
      view({ age: 'imperial', civ: 'english', stockpile: LOADED, researchedTechs: ['horseCollar', 'heavyPlow'] }),
      'mill',
    ).map((b) => b.id);
    expect(english).toContain('cropRotation');
  });

  it('age-up techs never appear in the TC research list (dedicated button)', () => {
    const ids = researchMenuButtons(view({ stockpile: LOADED }), 'townCenter').map((b) => b.id);
    expect(ids).not.toContain('feudalAge');
    expect(ids).toContain('loom');
  });

  it('a busy building disables research with a reason', () => {
    const buttons = researchMenuButtons(view({ stockpile: LOADED }), 'townCenter', true);
    for (const b of buttons) expect(b.enabled).toBe(false);
  });

  it('a tech queued anywhere renders disabled with "already queued" (sim alreadyQueued mirror)', () => {
    const buttons = researchMenuButtons(view({ stockpile: LOADED }), 'townCenter', false, ['loom']);
    const loom = buttons.find((b) => b.id === 'loom')!;
    expect(loom.enabled).toBe(false);
    expect(loom.reason).toBe('already queued');
    expect(loom.icon).toBe(`${gameData.techs.loom.icon}/gray`);
    // other techs are unaffected
    const wheelbarrow = buttons.find((b) => b.id === 'wheelbarrow');
    if (wheelbarrow) expect(wheelbarrow.reason).not.toBe('already queued');
  });
});

describe('ageUpButton', () => {
  it('reports requirement progress and the "N buildings needed" reason', () => {
    const up = ageUpButton(view({ stockpile: LOADED }), ['townCenter', 'house', 'mill'])!;
    expect(up.techId).toBe('feudalAge');
    // the TC and houses never count (AOE2_REFERENCE §2 / GDD) — only the mill qualifies
    expect(up.requirementMet).toBe(false);
    expect(up.requirementText).toBe('1 / 2 Dark Age buildings');
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('2 Dark Age buildings needed');
  });

  it('two distinct qualifying buildings meet the requirement (TC/house/farm never count)', () => {
    const up = ageUpButton(view({ stockpile: LOADED }), ['townCenter', 'barracks', 'mill', 'house', 'farm'])!;
    expect(up.requirementMet).toBe(true);
    expect(up.enabled).toBe(!PENDING_COMMAND_KINDS.has('research'));
  });

  it('duplicate building types do not count twice', () => {
    const r = ageUpRequirement('dark', ['barracks', 'barracks'], 2);
    expect(r).toEqual({ have: 1, met: false });
  });

  it('a Castle alone satisfies the Imperial requirement (GDD)', () => {
    const up = ageUpButton(view({ age: 'castle', stockpile: LOADED, researchedTechs: ['feudalAge', 'castleAge'] }), ['castle'])!;
    expect(up.techId).toBe('imperialAge');
    expect(up.requirementMet).toBe(true);
  });

  it('returns null in the Imperial Age', () => {
    expect(ageUpButton(view({ age: 'imperial' }), [])).toBeNull();
  });

  it('an age-up already sitting in the shared queue disables the button honestly', () => {
    // the common flow: villagers queued first, Advance to Feudal queued behind them —
    // b.research stays unset, but a re-tap would be silently dropped by the sim
    const up = ageUpButton(
      view({ stockpile: LOADED }), ['townCenter', 'barracks', 'mill'], false, ['feudalAge'],
    )!;
    expect(up.enabled).toBe(false);
    expect(up.reason).toBe('already queued');
    expect(up.icon).toBe(`${gameData.techs.feudalAge.icon}/gray`);
  });
});

describe('queueChipModel (shared production queue chips)', () => {
  it('every tech in the game resolves to its TechDef icon + name — never icon/<techId>', () => {
    for (const tech of Object.values(gameData.techs)) {
      // the sim queues research as { defId: techId, techId } (research.ts)
      const chip = queueChipModel({ defId: tech.id, techId: tech.id });
      expect(chip.isTech).toBe(true);
      expect(chip.icon).toBe(tech.icon); // a real atlas frame, not a missing-icon fallback
      expect(chip.name).toBe(tech.name);
    }
  });

  it('every trainable unit resolves to its UnitDef icon + name', () => {
    for (const unit of Object.values(gameData.units)) {
      if (unit.trainedAt.length === 0) continue; // gaia animals never queue
      const chip = queueChipModel({ defId: unit.id });
      expect(chip.isTech).toBe(false);
      expect(chip.icon).toBe(unit.icon);
      expect(chip.name).toBe(unit.name);
    }
  });
});

describe('unitVerbButtons', () => {
  it('military selection: attack-move toggle (active when armed), stop, garrison', () => {
    const sel = [ent({ defId: 'militia' })];
    const idle = unitVerbButtons(sel, null);
    expect(idle.map((b) => b.id)).toEqual(['attackMove', 'stop', 'garrison']);
    expect(idle[0].active).toBe(false);
    const armed = unitVerbButtons(sel, 'attackMove');
    expect(armed[0].active).toBe(true);
    // garrison enabled-ness tracks the wave-2 gate
    expect(idle[2].enabled).toBe(!PENDING_COMMAND_KINDS.has('garrison'));
  });

  it('villager-only selection: no attack-move, but stop + garrison', () => {
    const ids = unitVerbButtons([ent({ defId: 'villager' })], null).map((b) => b.id);
    expect(ids).not.toContain('attackMove');
    expect(ids).toContain('stop');
    expect(ids).toContain('garrison');
  });

  it('monks add convert + heal', () => {
    const ids = unitVerbButtons([ent({ defId: 'monk' })], null).map((b) => b.id);
    expect(ids).toContain('convert');
    expect(ids).toContain('heal');
  });

  it('trebuchets get a live unpack button while packed, pack while deployed', () => {
    // spawn state: packed (mobile) → the button unpacks (deploy to fire)
    const packedBtns = unitVerbButtons([ent({ defId: 'trebuchet', packed: true })], null);
    const unpack = packedBtns.find((b) => b.id === 'unpack')!;
    expect(unpack.enabled).toBe(true);
    expect(unpack.reason).toBeUndefined();
    expect(packedBtns.some((b) => b.id === 'pack')).toBe(false);
    // deployed (packed === false) → the button packs (fold to move)
    const deployedBtns = unitVerbButtons([ent({ defId: 'trebuchet', packed: false })], null);
    expect(deployedBtns.find((b) => b.id === 'pack')!.enabled).toBe(true);
    // mixed selection: any deployed treb → pack them all
    const mixed = unitVerbButtons(
      [ent({ defId: 'trebuchet', packed: true }), ent({ defId: 'trebuchet', packed: false })],
      null,
    );
    expect(mixed.some((b) => b.id === 'pack')).toBe(true);
  });

  it('empty / building-only selections produce no verb buttons', () => {
    expect(unitVerbButtons([], null)).toEqual([]);
    expect(unitVerbButtons([ent({ kind: 'building', defId: 'barracks' })], null)).toEqual([]);
  });

  it('captured sheep get a minimal card: no attack-move (livestock is not military)', () => {
    const ids = unitVerbButtons([ent({ defId: 'sheep' })], null).map((b) => b.id);
    expect(ids).not.toContain('attackMove');
    expect(ids).toContain('stop');
    // a sheep mixed into an army must not change the military card either way
    const mixed = unitVerbButtons([ent({ defId: 'sheep' }), ent({ defId: 'militia' })], null).map((b) => b.id);
    expect(mixed).toContain('attackMove');
  });
});

describe('farm & mill buttons', () => {
  it('farm reseed tracks the wave-2 gate and wood affordability', () => {
    const pending = PENDING_COMMAND_KINDS.has('reseedFarm');
    const rich = farmReseedButton({ amountLeft: 0 }, RICH);
    expect(rich.enabled).toBe(!pending);
    const broke = farmReseedButton({ amountLeft: 0 }, BROKE);
    expect(broke.enabled).toBe(false);
  });

  it('mill auto-reseed toggle reflects the sim-side flag', () => {
    const on = millAutoReseedButton(true);
    expect(on.active).toBe(true);
    expect(on.enabled).toBe(!PENDING_COMMAND_KINDS.has('queueReseed'));
    expect(millAutoReseedButton(false).active).toBe(false);
  });
});

describe('garrisonPanel', () => {
  it('lists occupant icons and caps; null for buildings that cannot garrison', () => {
    const vill = ent({ defId: 'villager' });
    const militia = ent({ defId: 'militia' });
    const byId = new Map<EntityId, Entity>([[vill.id, vill], [militia.id, militia]]);
    const tc = ent({ kind: 'building', defId: 'townCenter', garrison: [vill.id, militia.id] });
    const panel = garrisonPanel(tc, (id) => byId.get(id))!;
    expect(panel.count).toBe(2);
    expect(panel.capacity).toBe(gameData.buildings.townCenter.garrisonCapacity);
    expect(panel.occupants.map((o) => o.defId)).toEqual(['villager', 'militia']);
    expect(panel.ungarrisonEnabled).toBe(!PENDING_COMMAND_KINDS.has('ungarrison'));
    // houses hold nobody
    expect(garrisonPanel(ent({ kind: 'building', defId: 'house' }), () => undefined)).toBeNull();
  });

  it('dead/missing occupants are dropped from the panel', () => {
    const tc = ent({ kind: 'building', defId: 'townCenter', garrison: [999 as EntityId] });
    const panel = garrisonPanel(tc, () => undefined)!;
    expect(panel.count).toBe(0);
    expect(panel.ungarrisonEnabled).toBe(false);
  });

  it('rams (unit hosts) get the same panel — garrisoned infantry must have a UI exit', () => {
    const militia = ent({ defId: 'militia' });
    const ram = ent({ defId: 'batteringRam', garrison: [militia.id] });
    const panel = garrisonPanel(ram, (id) => (id === militia.id ? militia : undefined))!;
    expect(panel).not.toBeNull();
    expect(panel.capacity).toBe(gameData.units.batteringRam.garrisonCapacity);
    expect(panel.count).toBe(1);
    expect(panel.occupants[0].defId).toBe('militia');
    expect(panel.ungarrisonEnabled).toBe(!PENDING_COMMAND_KINDS.has('ungarrison'));
    // ordinary units can hold nobody
    expect(garrisonPanel(ent({ defId: 'militia' }), () => undefined)).toBeNull();
  });
});

describe('hasActiveRally', () => {
  const bld = (over: Partial<Entity>): Entity =>
    ent({ kind: 'building', defId: 'barracks', x: 10 * FP, y: 10 * FP, tileX: 10, tileY: 10, ...over });

  it('false without a rally; true for a rally on open ground', () => {
    expect(hasActiveRally(bld({}))).toBe(false);
    expect(hasActiveRally(bld({ rally: { x: 20 * FP, y: 10 * FP } }))).toBe(true);
  });

  it('a rally onto a target (berries/enemy) is always active, wherever it sits', () => {
    expect(hasActiveRally(bld({ rally: { x: 10 * FP, y: 10 * FP, targetId: 7 as EntityId } }))).toBe(true);
  });

  it('a cleared rally (back onto the building footprint, no target) is NOT active', () => {
    // clearRally re-rallies onto the building center — flag and Clear control must vanish
    expect(hasActiveRally(bld({ rally: { x: 10 * FP, y: 10 * FP } }))).toBe(false);
  });

  it('units never report a rally', () => {
    expect(hasActiveRally(ent({ defId: 'militia', rally: { x: 99 * FP, y: 99 * FP } }))).toBe(false);
  });
});

describe('iconVariant', () => {
  it('returns the colored icon when enabled, the /gray companion when not', () => {
    expect(iconVariant('icon/house', true)).toBe('icon/house');
    expect(iconVariant('icon/house', false)).toBe('icon/house/gray');
  });
});
