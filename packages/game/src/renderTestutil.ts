// Shared helpers for renderer tests (not shipped to the game — nothing in the
// app imports this module).
//
// The renderer's hot paths derive world-space rectangles from texture
// dimensions, so tests need frames with realistic sizes: building artwork is
// several times larger than a unit and spans multiple broad-phase buckets. A
// single 1x1 stand-in would make every overlap test vacuous.

import { BufferImageSource, Texture } from 'pixi.js';
import type { GameAssets } from './assets';

export interface TestFrame {
  texture: Texture;
  mirrored: boolean;
  anchorX: number;
  anchorY: number;
  renderScale: number;
}

export function frameOf(width: number, height: number): TestFrame {
  return {
    texture: new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(width * height * 4), width, height,
      }),
    }),
    mirrored: false,
    anchorX: 0.5,
    anchorY: 1,
    renderScale: 1,
  };
}

const BUILDING_FRAME = frameOf(224, 288);
const UNIT_FRAME = frameOf(48, 72);

/** A GameAssets stand-in that resolves every name without an atlas or a canvas. */
export const fakeAssets = {
  tryResolve: (name: string) => (name.startsWith('bld/') ? BUILDING_FRAME : UNIT_FRAME),
  resolveFrame: (name: string) => (name.startsWith('bld/') ? BUILDING_FRAME : UNIT_FRAME),
  contentTopPx: () => 0,
  frameCount: () => 4,
} as unknown as GameAssets;
