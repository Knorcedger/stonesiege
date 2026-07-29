// Pure frame-name logic + facing/animation helpers. DOM-free (unit-tested).
// Naming rules per docs/ASSET_CONTRACT.md.

import type { UnitActivity } from '@bf/sim/types';

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

export type AnimName = 'idle' | 'walk' | 'attack' | 'gather' | 'carry' | 'die' | 'decay';

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
      return isVillager ? 'carry' : 'walk';
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

/**
 * Animation playback rates (frames per second). ART_BIBLE fixes frame *counts*
 * (walk 6, attack 5, idle 2, die 5, decay 3, gather 4, carry 6) but not rates;
 * these are chosen so a walk cycle ≈ 0.6 s and attack ≈ 0.5 s (classic RTS feel).
 */
export const ANIM_FPS: Readonly<Record<AnimName, number>> = {
  idle: 2,
  walk: 10,
  attack: 10,
  gather: 8,
  carry: 10,
  die: 8,
  decay: 0.5,
};

/** Frame index for an anim at a given sim-time (seconds). die/decay clamp; others loop. */
export function animFrameIndex(anim: AnimName, animAgeSeconds: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const raw = Math.floor(animAgeSeconds * ANIM_FPS[anim]);
  if (anim === 'die' || anim === 'decay') return Math.min(raw, frameCount - 1);
  return raw % frameCount;
}
