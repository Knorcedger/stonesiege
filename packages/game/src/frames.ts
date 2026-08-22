// Pure frame-name logic + facing/animation helpers. DOM-free (unit-tested).
// Naming rules per docs/ASSET_CONTRACT.md.

import type { UnitActivity } from '@bf/sim/types';
import { gameData } from '@bf/data';

export interface FrameRef {
  /** Atlas frame name to actually look up (dirs 5-7 remapped to 3/2/1). */
  name: string;
  /** True when the sprite must be drawn with scale.x = -1. */
  mirrored: boolean;
}

/** Contract: atlases author dirs 0-4 (S,SW,W,NW,N); 5=NE,6=E,7=SE mirror 3,2,1. */
export const MIRROR_SOURCE: Readonly<Record<number, number>> = { 5: 3, 6: 2, 7: 1 };

const ANIMATED_RE = /^(unit|obj)\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)$/;

/**
 * Resolve a logical frame name into the physical atlas frame + mirror flag.
 * Only animated unit/obj frames (`<kind>/<defId>/<anim>/<dir>/<frame>`) mirror;
 * everything else (terrain, buildings, icons, 8-rotation projectiles) passes through.
 */
export function resolveFrameName(name: string): FrameRef {
  const m = ANIMATED_RE.exec(name);
  if (m) {
    const dir = Number(m[4]);
    const src = MIRROR_SOURCE[dir];
    if (src !== undefined) {
      return { name: `${m[1]}/${m[2]}/${m[3]}/${src}/${m[5]}`, mirrored: true };
    }
  }
  return { name, mirrored: false };
}

/**
 * Candidate frame names for the building-placement ghost, most specific first
 * (callers tryResolve all but the last, then resolveFrame the last so a truly
 * missing frame still surfaces the diagnosable placeholder). Farms — any def
 * with providesFood — have NO bld/ frames (ASSET_CONTRACT: the renderer draws
 * obj/farm/<stage>), so their ghost previews the mature field, matching the
 * fog-remembered farm ghost in world.ts; resolving bld/farm/done rendered the
 * magenta missing-frame box on every farm placement.
 */
export function placementGhostFrames(defId: string, age: string): string[] {
  if (gameData.buildings[defId]?.providesFood !== undefined) return ['obj/farm/2'];
  return [`bld/${defId}/${age}/done`, `bld/${defId}/done`];
}

export interface ArtScale {
  x: number;
  y: number;
}

const NO_ART_SCALE: ArtScale = { x: 1, y: 1 };

/**
 * Fortification art is authored far smaller than one building footprint, so the
 * renderer scales it up to building scale. Wall endpoints stay close to one
 * mechanical tile while the masonry grows vertically: uniform 2.25x scaling made
 * every segment overlap its neighbours and is what caused the broken-looking
 * corners. Everything else is authored at its final size and scales 1:1.
 *
 * Every path that draws a `bld/` frame — the live sprite, the fog-remembered
 * ghost and the placement preview — must scale through `buildingSpriteScale`,
 * or the same tower renders at two different sizes depending on how it is drawn.
 */
const FORTIFICATION_ART_SCALE: Readonly<Record<string, ArtScale>> = {
  stoneWall: { x: 1.16, y: 1.82 },
  gate: { x: 2.5, y: 2.5 },
  watchTower: { x: 2.55, y: 2.55 },
  guardTower: { x: 2.72, y: 2.72 },
  keep: { x: 2.95, y: 2.95 },
};

/** Extra art-authoring scale for a building def (1x1 for everything unfortified). */
export function buildingArtScale(defId: string): ArtScale {
  return FORTIFICATION_ART_SCALE[defId] ?? NO_ART_SCALE;
}

/**
 * Final `sprite.scale` for a drawn building frame: the atlas density scale from
 * `ResolvedFrame.renderScale`, times the art-authoring scale, times the mirror
 * flip. The single place the art scale is applied, so the live sprite, the
 * fog-remembered ghost and the placement preview cannot disagree about how big
 * a watch tower is.
 */
export function buildingSpriteScale(defId: string, renderScale: number, mirrorX: boolean): ArtScale {
  const art = buildingArtScale(defId);
  return { x: (mirrorX ? -renderScale : renderScale) * art.x, y: renderScale * art.y };
}

export interface FrameChoice {
  /** Most specific first; callers tryResolve all but the last, resolveFrame the last. */
  candidates: string[];
  alpha: number;
}

/**
 * The frame a building shows at a given construction stage — shared by the live
 * renderer and the fog-of-war ghost so a remembered building can never disagree
 * with the sprite the player last saw.
 *
 * `amountLeft` only matters for farms (mature field vs. exhausted plot).
 */
export function buildingFrameChoice(
  defId: string,
  buildProgress: number,
  age: string,
  amountLeft = 1,
): FrameChoice {
  if (defId === 'farm') {
    // ART_BIBLE §4.4: farms have no construct/rubble frames — obj/farm/<stage>,
    // with a build-progress dropout (approximated here with alpha ramp).
    if (buildProgress < 1000) {
      return { candidates: ['obj/farm/0'], alpha: 0.35 + (buildProgress / 1000) * 0.65 };
    }
    return { candidates: [`obj/farm/${amountLeft <= 0 ? 4 : 3}`], alpha: 1 };
  }
  if (buildProgress < 1000) {
    const stage = buildProgress < 334 ? 0 : buildProgress < 667 ? 1 : 2;
    return { candidates: [`bld/${defId}/construct${stage}`], alpha: 1 };
  }
  // TC/house have per-age variants (`bld/<defId>/<age>/done`); everything else
  // is authored once as `bld/<defId>/done` — try the variant, fall back.
  return { candidates: [`bld/${defId}/${age}/done`, `bld/${defId}/done`], alpha: 1 };
}

/**
 * Atlas rig for a unit def. Hero defs carry a `sprite` alias onto an existing rig
 * (heroWallace -> unit/champion/...); everything else rigs under its own id.
 * Gaia animals (no production building) live under obj/ per ASSET_CONTRACT.
 */
export function unitRig(defId: string): { spriteId: string; prefix: 'unit' | 'obj' } {
  const spriteId = gameData.units[defId]?.sprite ?? defId;
  const def = gameData.units[spriteId];
  return { spriteId, prefix: def && def.trainedAt.length === 0 ? 'obj' : 'unit' };
}

/** Insert the baked player-color token into a frame name: unit/villager/... -> unit/villager@p2/... */
export function bakedColorName(name: string, colorIdx: number): string {
  const slash = name.indexOf('/');
  if (slash < 0) return name;
  const rest = name.indexOf('/', slash + 1);
  if (rest < 0) return `${name}@p${colorIdx}`;
  return `${name.slice(0, rest)}@p${colorIdx}${name.slice(rest)}`;
}

/**
 * Facing 0..7 (0 = S toward camera, clockwise — ASSET_CONTRACT) from a
 * tile-space movement delta. Returns `fallback` for a zero vector.
 */
export function facingFromDelta(dxTiles: number, dyTiles: number, fallback = 0): number {
  const sx = dxTiles - dyTiles; // screen x
  const sy = dxTiles + dyTiles; // screen y (down)
  if (sx === 0 && sy === 0) return fallback;
  const deg = (Math.atan2(sy, sx) * 180) / Math.PI; // 0 = screen-right (east)
  const rel = (((deg - 90) % 360) + 360) % 360; // 0 = south, clockwise
  return Math.round(rel / 45) % 8;
}

export type AnimName =
  | 'idle' | 'walk' | 'attack' | 'gather' | 'carry' | 'die' | 'decay'
  | 'chop' | 'farm' | 'forage' | 'mine' | 'build';

/** Map a sim activity to a contract anim name. Villagers use gather/carry variants. */
export function animForActivity(activity: UnitActivity, isVillager: boolean): AnimName {
  switch (activity) {
    case 'moving':
    case 'fleeing':
      return 'walk';
    case 'attacking':
      return 'attack';
    case 'gathering':
      return isVillager ? 'gather' : 'attack';
    case 'building':
    case 'repairing':
      return isVillager ? 'gather' : 'attack';
    case 'carrying':
      // The resource badge already communicates the carried material. Use the
      // full directional walk cycle instead of the legacy one-pose carry rig,
      // which made villagers slide across the ground at several angles.
      return 'walk';
    case 'dying':
      return 'die';
    case 'healing':
    case 'converting':
      return 'attack';
    case 'garrisoned':
    case 'idle':
    default:
      return 'idle';
  }
}

/** Task-specific villager work cycle, inferred from the public target entity. */
export function villagerWorkAnim(activity: UnitActivity, targetDefId?: string): AnimName {
  if (activity === 'building' || activity === 'repairing') return 'build';
  if (activity !== 'gathering') return animForActivity(activity, true);
  switch (targetDefId) {
    case 'tree': return 'chop';
    case 'farm': return 'farm';
    case 'berryBush': return 'forage';
    case 'goldMine':
    case 'stoneMine': return 'mine';
    default: return 'gather';
  }
}

/**
 * Animation playback rates (frames per second). ART_BIBLE fixes frame *counts*
 * (walk 6, attack 5, idle 2, die 5, decay 3, gather 4, carry 6) but not rates;
 * these are chosen so a walk cycle ≈ 0.6 s and attack ≈ 0.5 s (classic RTS feel).
 */
export const ANIM_FPS: Readonly<Record<AnimName, number>> = {
  idle: 2,
  walk: 10,
  attack: 10,
  gather: 5,
  chop: 5,
  farm: 7,
  forage: 5,
  mine: 5,
  build: 5,
  carry: 10,
  die: 8,
  decay: 0.5,
};

/**
 * Villager work is not a walk or combat loop: the contact pose needs time to
 * read at game scale, followed by a short recovery before the next action.
 * Repeating authored frame indices gives every four-frame work sheet a natural
 * cadence without synthesizing new art or changing simulation work rates.
 */
const WORK_FRAME_SEQUENCE: Partial<Readonly<Record<AnimName, readonly number[]>>> = {
  gather: [0, 1, 2, 2, 3, 0],
  chop: [0, 1, 2, 2, 3, 0],
  // Foraging is a quieter reach-and-pick action: hold contact and the ready
  // pose longer so berry workers do not look as if they are vibrating.
  forage: [0, 1, 2, 2, 2, 3, 0, 0],
  mine: [0, 1, 2, 2, 3, 0],
  build: [0, 1, 2, 2, 3, 0],
};

/** Frame index for an anim at a given sim-time (seconds). die/decay clamp; others loop. */
export function animFrameIndex(anim: AnimName, animAgeSeconds: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  // Clamp: a caller-side clock hiccup (e.g. sim time frozen at game end while
  // interpolation alpha wraps) must never yield a negative frame index.
  const raw = Math.max(0, Math.floor(animAgeSeconds * ANIM_FPS[anim]));
  if (anim === 'die' || anim === 'decay') return Math.min(raw, frameCount - 1);
  // The farm sheet is a stand → crouch sequence, not a looping scythe swing.
  // Holding its crouched work pose stops farmers bobbing upright every 0.6 s;
  // the sim periodically switches them to walk and resets this sequence when
  // they arrive at a different spot on the plot.
  if (anim === 'farm') return Math.min(raw, Math.min(2, frameCount - 1));
  const workSequence = WORK_FRAME_SEQUENCE[anim];
  if (workSequence) {
    return Math.min(workSequence[raw % workSequence.length], frameCount - 1);
  }
  return raw % frameCount;
}
