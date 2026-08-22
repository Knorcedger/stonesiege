import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FP, type Entity, type GameMap, type GameState, type PlayerId } from '@bf/sim/types';
import { tileToWorld } from './camera';
import {
  advanceGateOpenProgress, artScaleForFrame, artZIndex, buildingArtKey, buildingHpBarWidth,
  defaultRallyTilePoint,
  entityPickDistance, isHiddenInHost, mirroredWallIds, ownedResearchProgress, resourceFrameName,
  wallCornerJoins, rallyFlagWorldPoint, shouldFadeForUnit,
} from './world';

const HUMAN = 1 as PlayerId;
const ENEMY = 2 as PlayerId;

const resource = (patch: Partial<Entity> = {}): Entity => ({
  id: 7,
  kind: 'resource',
  defId: 'tree',
  player: 0,
  x: 0,
  y: 0,
  tileX: 0,
  tileY: 0,
  facing: 0,
  hp: 20,
  maxHp: 20,
  activity: 'idle',
  amountLeft: 100,
  resourceType: 'wood',
  ...patch,
});

describe('resourceFrameName', () => {
  it('replaces every depleted tree variant with the stump frame', () => {
    expect(resourceFrameName(resource())).toMatch(/^obj\/tree\/[0-2]$/);
    expect(resourceFrameName(resource({ stump: true, amountLeft: 0 }))).toBe('obj/stump');
  });

  it('uses terrain and coarse map regions to create recognizable forest variety', () => {
    const map: GameMap = {
      width: 24, height: 24,
      terrain: new Uint8Array(24 * 24),
      terrainIds: ['grass', 'snow', 'dirt'],
    };
    map.terrain[3 * map.width + 3] = 1;
    map.terrain[4 * map.width + 4] = 2;
    expect(resourceFrameName(resource({ tileX: 3, tileY: 3 }), map)).toBe('obj/tree/1');
    expect(resourceFrameName(resource({ tileX: 4, tileY: 4 }), map)).toBe('obj/tree/2');
    const regions = new Set([
      resourceFrameName(resource({ tileX: 1, tileY: 1 }), map),
      resourceFrameName(resource({ tileX: 9, tileY: 1 }), map),
      resourceFrameName(resource({ tileX: 17, tileY: 17 }), map),
    ]);
    expect(regions.size).toBeGreaterThan(1);
  });
});

describe('entityPickDistance', () => {
  it('lets a direct click select a villager standing on a farm', () => {
    const farm = resource({
      kind: 'building', defId: 'farm', player: 1,
      x: 11.5 * FP, y: 10.5 * FP, tileX: 10, tileY: 9,
      hp: 480, maxHp: 480, buildProgress: 1000, amountLeft: 175,
    });
    const villager = resource({
      kind: 'unit', defId: 'villager', player: 1,
      x: 11.5 * FP, y: 10.5 * FP, tileX: 11, tileY: 10,
      hp: 25, maxHp: 25, amountLeft: undefined, resourceType: undefined,
    });
    const feet = tileToWorld(villager.x / FP, villager.y / FP);
    const bodyY = feet.y - 12;

    expect(entityPickDistance(villager, feet.x, bodyY))
      .toBeLessThan(entityPickDistance(farm, feet.x, bodyY));
    expect(entityPickDistance(farm, feet.x, bodyY)).toBe(1);
  });
});

describe('ownedResearchProgress', () => {
  const researching = resource({
    kind: 'building', defId: 'townCenter', player: HUMAN,
    hp: 2400, maxHp: 2400,
    research: { techId: 'feudalAge', ticksLeft: 75, totalTicks: 100 },
  });

  it('returns active progress only to the building owner', () => {
    expect(ownedResearchProgress(researching, HUMAN)).toBe(0.25);
    expect(ownedResearchProgress(researching, ENEMY)).toBeNull();
  });

  it('does not expose a bar for units or idle buildings', () => {
    expect(ownedResearchProgress(resource({ ...researching, kind: 'unit' }), HUMAN)).toBeNull();
    expect(ownedResearchProgress(resource({ ...researching, research: undefined }), HUMAN)).toBeNull();
  });
});

describe('defaultRallyTilePoint', () => {
  it('puts a selected Barracks flag beyond the center of its south edge', () => {
    const barracks = resource({ kind: 'building', defId: 'barracks', tileX: 10, tileY: 20 });
    expect(defaultRallyTilePoint(barracks)).toEqual([11.5, 23.5]);
  });
});

describe('rallyFlagWorldPoint', () => {
  const state = (entities: Entity[]): GameState => ({
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    players: [],
  } as unknown as GameState);

  it('resolves default, custom-ground, and live-target destinations', () => {
    const barracks = resource({
      id: 20, kind: 'building', defId: 'barracks', player: HUMAN,
      tileX: 10, tileY: 20, x: 11.5 * FP, y: 21.5 * FP, buildProgress: 1000,
    });
    expect(rallyFlagWorldPoint(state([barracks]), barracks))
      .toEqual(tileToWorld(11.5, 23.5));

    barracks.rally = { x: 20 * FP, y: 18 * FP };
    expect(rallyFlagWorldPoint(state([barracks]), barracks))
      .toEqual(tileToWorld(20, 18));

    const target = resource({ id: 21, x: 27 * FP, y: 12 * FP, tileX: 27, tileY: 12 });
    barracks.rally = { x: 1, y: 1, targetId: target.id };
    expect(rallyFlagWorldPoint(state([barracks, target]), barracks))
      .toEqual(tileToWorld(27, 12));
  });

  it('does not produce rally markers for non-production structures', () => {
    const house = resource({ kind: 'building', defId: 'house', player: HUMAN, buildProgress: 1000 });
    expect(rallyFlagWorldPoint(state([house]), house)).toBeNull();
  });
});

describe('shouldFadeForUnit', () => {
  const occluder = { left: 100, right: 180, top: 70, bottom: 150 };

  it('fades when visible unit artwork overlaps behind an obstacle', () => {
    const unit = { left: 125, right: 145, top: 80, bottom: 135 };
    expect(shouldFadeForUnit(occluder, 150, unit, 134)).toBe(true);
  });

  it('does not fade for a unit in front of or beside the obstacle', () => {
    const overlap = { left: 125, right: 145, top: 80, bottom: 135 };
    const beside = { left: 181, right: 205, top: 80, bottom: 135 };
    expect(shouldFadeForUnit(occluder, 150, overlap, 151)).toBe(false);
    expect(shouldFadeForUnit(occluder, 150, beside, 134)).toBe(false);
  });

  it('requires actual vertical artwork overlap', () => {
    const above = { left: 125, right: 145, top: 20, bottom: 69 };
    expect(shouldFadeForUnit(occluder, 150, above, 68)).toBe(false);
  });
});

describe('buildingHpBarWidth', () => {
  it('uses half of the previous near-full-footprint width', () => {
    expect(buildingHpBarWidth(4)).toBe(124); // old Town Center bar: 248px
    expect(buildingHpBarWidth(3)).toBe(92); // old Barracks/Farm bar: 184px
  });
});

describe('mirroredWallIds', () => {
  const wall = (id: number, tileX: number, tileY: number, defId = 'stoneWall'): Entity =>
    resource({ id, kind: 'building', defId, player: HUMAN, tileX, tileY, hp: 1800, maxHp: 1800 });

  it('mirrors perpendicular wall runs while leaving the primary axis and L-corners stable', () => {
    const walls = [
      wall(1, 4, 4), wall(2, 5, 4), wall(3, 6, 4),
      wall(4, 4, 5), wall(5, 4, 6), wall(6, 4, 7, 'gate'),
    ];
    expect([...mirroredWallIds(walls)].sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect(wallCornerJoins(walls).get(1)).toEqual({ xDir: 1, yDir: 1 });
  });

  it('describes all four corner directions without treating a T-junction as a corner', () => {
    const walls = [
      wall(1, 5, 5), wall(2, 6, 5), wall(3, 5, 6),
      wall(4, 10, 10), wall(5, 9, 10), wall(6, 10, 9),
      wall(7, 15, 15), wall(8, 16, 15), wall(9, 15, 14),
      wall(10, 20, 20), wall(11, 19, 20), wall(12, 20, 21),
      wall(13, 30, 30), wall(14, 29, 30), wall(15, 31, 30), wall(16, 30, 31),
    ];
    const corners = wallCornerJoins(walls);
    expect(corners.get(1)).toEqual({ xDir: 1, yDir: 1 });
    expect(corners.get(4)).toEqual({ xDir: -1, yDir: -1 });
    expect(corners.get(7)).toEqual({ xDir: 1, yDir: -1 });
    expect(corners.get(10)).toEqual({ xDir: -1, yDir: 1 });
    expect(corners.has(13)).toBe(false);
  });
});

describe('advanceGateOpenProgress', () => {
  it('opens and closes smoothly while clamping at both endpoints', () => {
    expect(advanceGateOpenProgress(0, true, 1)).toBeGreaterThan(0);
    expect(advanceGateOpenProgress(0.5, true, 999)).toBe(1);
    expect(advanceGateOpenProgress(0.5, false, 999)).toBe(0);
    expect(advanceGateOpenProgress(0.5, false, -1)).toBe(0.5);
  });
});

describe('isHiddenInHost', () => {
  const villager = (patch: Partial<Entity> = {}): Entity => ({
    id: 3, kind: 'unit', defId: 'villager', player: HUMAN,
    x: 8 * FP, y: 8 * FP, tileX: 8, tileY: 8,
    facing: 0, hp: 40, maxHp: 40, activity: 'idle', ...patch,
  });

  it('hides an occupant that the sim parked on its host anchor', () => {
    // garrisonUnit() copies the host's position onto the occupant, so drawing it
    // stacks every villager over the Town Center roof.
    expect(isHiddenInHost(villager({ garrisonedIn: 12, activity: 'garrisoned' }))).toBe(true);
  });

  it('keeps drawing units that are only walking to a host, and the host itself', () => {
    expect(isHiddenInHost(villager({ activity: 'moving' }))).toBe(false);
    expect(isHiddenInHost(villager({ activity: 'fleeing' }))).toBe(false);
    const host: Entity = {
      id: 12, kind: 'building', defId: 'townCenter', player: HUMAN,
      x: 10 * FP, y: 10 * FP, tileX: 10, tileY: 10,
      facing: 0, hp: 2400, maxHp: 2400, activity: 'idle', garrison: [3],
    };
    expect(isHiddenInHost(host)).toBe(false);
  });
});

describe('artScaleForFrame', () => {
  // Alpha-measured content size of each shipped HD frame, in world px at the
  // runtime renderScale of 1/2. The authored art alone shrinks on age-up.
  const AUTHORED = {
    dark: { w: 253, h: 187.5 },
    feudal: { w: 159, h: 138 },
    castle: { w: 208, h: 172 },
    imperial: { w: 216.5, h: 175 },
  } as const;
  const AGES = ['dark', 'feudal', 'castle', 'imperial'] as const;
  const FOOTPRINT_W = 256; // 4 tiles x 2 x HALF_W

  const drawn = (age: keyof typeof AUTHORED) => {
    const scale = artScaleForFrame('townCenter', `bld/townCenter/${age}/done`);
    return { w: AUTHORED[age].w * scale.x, h: AUTHORED[age].h * scale.y };
  };

  it('grows the Town Center with every age instead of shrinking it', () => {
    for (let i = 1; i < AGES.length; i++) {
      const prev = drawn(AGES[i - 1]);
      const next = drawn(AGES[i]);
      expect(next.w).toBeGreaterThan(prev.w);
      expect(next.h).toBeGreaterThan(prev.h);
    }
  });

  it('keeps every age planted inside its own 4x4 footprint', () => {
    for (const age of AGES) expect(drawn(age).w).toBeLessThanOrEqual(FOOTPRINT_W);
  });

  it('never upsamples an authored frame past its native resolution', () => {
    // renderScale is 1/density (2 for the HD atlases): anything under 1 is a downscale.
    for (const age of AGES) {
      expect(artScaleForFrame('townCenter', `bld/townCenter/${age}/done`).x / 2)
        .toBeLessThan(1);
    }
  });

  it('scales ages uniformly so no hall is stretched', () => {
    for (const age of AGES) {
      const scale = artScaleForFrame('townCenter', `bld/townCenter/${age}/done`);
      expect(scale.x).toBe(scale.y);
    }
  });

  it('leaves shared Town Center frames and ordinary buildings unscaled', () => {
    for (const name of ['bld/townCenter/done', 'bld/townCenter/construct1', 'bld/townCenter/rubble']) {
      expect(artScaleForFrame('townCenter', name)).toEqual({ x: 1, y: 1 });
    }
    expect(artScaleForFrame('barracks', 'bld/barracks/done')).toEqual({ x: 1, y: 1 });
  });

  it('preserves the fortification scales, which are keyed by def', () => {
    expect(artScaleForFrame('keep', 'bld/keep/done')).toEqual({ x: 2.95, y: 2.95 });
    expect(artScaleForFrame('stoneWall', 'bld/stoneWall/done')).toEqual({ x: 1.16, y: 1.82 });
  });

  it('scales only the finished building: foundations and rubble are footprint-sized', () => {
    // Every building authors construct0..2 at exactly its footprint width and its
    // rubble at 72-74% of it. A keep's 2.95x tower factor turned its 64px
    // foundation into a 189px sprawl across three tiles (#134), and would have
    // piled its debris two tiles wide once rubble reached this helper.
    for (const defId of ['keep', 'gate', 'watchTower', 'guardTower', 'stoneWall', 'townCenter', 'house']) {
      for (const stage of ['construct0', 'construct1', 'construct2', 'rubble']) {
        expect(artScaleForFrame(defId, `bld/${defId}/${stage}`), `${defId}/${stage}`)
          .toEqual({ x: 1, y: 1 });
      }
    }
  });

  it('still scales the gate layers that stand in for its finished frame', () => {
    // open/door replace done at runtime; unscaled they would not fit the arch.
    expect(artScaleForFrame('gate', 'bld/gate/open')).toEqual({ x: 2.5, y: 2.5 });
    expect(artScaleForFrame('gate', 'bld/gate/door')).toEqual({ x: 2.5, y: 2.5 });
  });
});

describe('artScaleForFrame — house age crescendo', () => {
  // Alpha-measured content size of the shipped frame, in world px at the runtime
  // renderScale of 1/2. All four house ages ship the same 82x85 picture.
  const AUTHORED = { w: 82, h: 84.5 };
  const AGES = ['dark', 'feudal', 'castle', 'imperial'] as const;
  const FOOTPRINT_W = 128; // size 2
  // Every other size-2 building: mill 102, miningCamp 102, lumberCamp 99 px wide.
  const PEER_FLOOR = 99;

  const drawn = (age: string) => {
    const scale = artScaleForFrame('house', `bld/house/${age}/done`);
    return { w: AUTHORED.w * scale.x, h: AUTHORED.h * scale.y };
  };

  it('makes ageing up visible on housing, which shipped four identical frames', () => {
    for (let i = 1; i < AGES.length; i++) {
      expect(drawn(AGES[i]).w).toBeGreaterThan(drawn(AGES[i - 1]).w);
      expect(drawn(AGES[i]).h).toBeGreaterThan(drawn(AGES[i - 1]).h);
    }
  });

  it('lands the class in its size-2 peers band instead of 16 points below it', () => {
    expect(drawn('dark').w).toBeGreaterThan(AUTHORED.w);
    expect(drawn('imperial').w).toBeGreaterThan(PEER_FLOOR);
    // packed housing rows must keep visible gaps
    expect(drawn('imperial').w).toBeLessThan(FOOTPRINT_W * 0.9);
  });

  it('never upsamples the authored frame', () => {
    for (const age of AGES) {
      expect(artScaleForFrame('house', `bld/house/${age}/done`).x / 2).toBeLessThan(1);
    }
  });
});

describe('buildingArtKey', () => {
  const wall = ['bld/stoneWall/done'];

  it('re-resolves when the remembered building changes under the fog', () => {
    // A tower upgrades in place (upgradeUnit mutates defId), an owner ages up, a
    // foundation finishes — the ghost kept its first frame through all of it.
    const base = buildingArtKey(['bld/watchTower/done'], 2, false, undefined);
    expect(buildingArtKey(['bld/keep/done'], 2, false, undefined)).not.toBe(base);
    expect(buildingArtKey(['bld/watchTower/construct2'], 2, false, undefined)).not.toBe(base);
    expect(buildingArtKey(['bld/watchTower/done'], 5, false, undefined)).not.toBe(base);
  });

  it('separates a wall run mirrored onto the other isometric axis', () => {
    expect(buildingArtKey(wall, 2, true, undefined)).not.toBe(buildingArtKey(wall, 2, false, undefined));
  });

  it('separates each L-corner orientation from a straight segment and from each other', () => {
    const straight = buildingArtKey(wall, 2, false, undefined);
    const keys = new Set([straight]);
    for (const xDir of [-1, 1] as const) {
      for (const yDir of [-1, 1] as const) keys.add(buildingArtKey(wall, 2, false, { xDir, yDir }));
    }
    expect(keys.size).toBe(5);
  });

  it('ignores an unowned color the same way for every caller', () => {
    expect(buildingArtKey(wall, undefined, false, undefined)).toContain('none');
  });
});

describe('artZIndex', () => {
  it('sorts farms and fresh foundations under everything else', () => {
    expect(artZIndex('farm', 1000, 500)).toBeLessThan(artZIndex('barracks', 1000, 500));
    expect(artZIndex('barracks', 100, 500)).toBeLessThan(artZIndex('barracks', 1000, 500));
    // past the flat stage a foundation sorts with the buildings again
    expect(artZIndex('barracks', 300, 500)).toBe(500);
  });

  it('lifts a gatehouse over the wall caps it joins, so the arch is never half-hidden', () => {
    expect(artZIndex('gate', 1000, 500)).toBeGreaterThan(artZIndex('stoneWall', 1000, 500));
  });

  it('ranks units by their world y', () => {
    expect(artZIndex('villager', undefined, 420)).toBe(420);
  });
});

describe('no building-art draw path may drift off the shared art scale', () => {
  // The live sprite, the fog ghost and the placement preview each drew the same
  // building frames from a private copy of the scale rule, so towers, gates and
  // walls rendered at ~1/2.5 scale as ghosts and previews for as long as the
  // three paths disagreed (#116). A drawn size derived from renderScale without
  // the art scale is that bug coming back.
  const code = (name: string) =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
      .replace(/^\s*\/\/.*$/gm, '');          // line comments

  /** Statements, so a call reformatted across lines still reads as one unit. */
  const statements = (source: string) =>
    source.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Every renderScale must be multiplied by the shared art scale, in either
  // order. Checked per occurrence, not per line or statement: dropping the
  // factor from one axis of a two-axis scale.set() leaves the other axis to
  // vouch for it, and that half-applied scale is exactly how a sprite ends up
  // stretched instead of merely wrong.
  const SCALED_USE = /(?:artScale\.[xy] \* )?\w+\.renderScale(?: \* artScale\.[xy])?/g;

  it('multiplies every renderScale in the entity and placement layers by artScale', () => {
    for (const file of ['./world.ts', './game.ts']) {
      const flat = code(file).replace(/\s+/g, ' ');
      const offenders = [...flat.matchAll(SCALED_USE)]
        .filter((m) => !m[0].includes('artScale'))
        .map((m) => flat.slice(Math.max(0, m.index - 60), m.index + 40).trim());
      expect(offenders, `${file} draws building art without the shared art scale`).toEqual([]);
    }
  });

  it('feeds every applyBuildingArt call from artScaleForFrame', () => {
    // The shared applier is the other way a drawn size is set, and it takes the
    // scale as an argument: a hardcoded {x:1,y:1} there is the same bug with no
    // renderScale in sight.
    const flat = code('./world.ts').replace(/\s+/g, ' ');
    const calls = [...flat.matchAll(/applyBuildingArt\((.*?)\) ?;/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(1); // live sprite + fog ghost
    expect(calls.filter((args) => !args.includes('artScale'))).toEqual([]);
  });

  it('keeps rubble out of it, since those frames are authored at footprint size', () => {
    // fx.ts draws building rubble and must stay scale-free — asserted here so the
    // exclusion is a decision on the record rather than an oversight.
    const fx = code('./fx.ts');
    expect(fx).toContain('renderScale');
    expect(statements(fx).filter((s) => s.includes('artScale'))).toEqual([]);
  });
});
