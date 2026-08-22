// Guard for the hero accent against the shipped atlas (apps/web/public/assets).
//
// Campaign heroes alias a rank-and-file rig and are told apart by repainting that
// rig's outfit ramps. Which ramp a rig is painted with depends on its tier — a
// militia is cloth, a champion/knight/paladin is all metal and carries no cloth
// pixel at all — so an accent aimed at the wrong family silently recolors nothing
// and the hero renders exactly like his escort. These tests measure the real pixels
// instead of trusting the rig specs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { heroAccentFor, unitRig } from './frames';
import type { Rgb } from './recolor';

const ASSETS = path.resolve(import.meta.dirname, '../../../apps/web/public/assets');

interface AtlasFrame { frame: { x: number; y: number; w: number; h: number } }

const atlas = JSON.parse(readFileSync(path.join(ASSETS, 'units.json'), 'utf8')) as {
  frames: Record<string, AtlasFrame>;
};
const sheet = PNG.sync.read(readFileSync(path.join(ASSETS, 'units.png')));

/** Opaque pixels of a rig's core animations, and how many the accent would repaint. */
function accentCoverage(spriteId: string, from: readonly Rgb[]): { opaque: number; accented: number } {
  const swatch = new Set(from.map(([r, g, b]) => (r << 16) | (g << 8) | b));
  let opaque = 0;
  let accented = 0;
  for (const anim of ['idle', 'walk', 'attack']) {
    for (let dir = 0; dir <= 4; dir++) {
      const frame = atlas.frames[`unit/${spriteId}/${anim}/${dir}/0`];
      if (!frame) continue;
      const { x, y, w, h } = frame.frame;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const px = ((y + j) * sheet.width + (x + i)) * 4;
          if (sheet.data[px + 3] === 0) continue;
          opaque++;
          const key = (sheet.data[px] << 16) | (sheet.data[px + 1] << 8) | sheet.data[px + 2];
          if (swatch.has(key)) accented++;
        }
      }
    }
  }
  return { opaque, accented };
}

describe('hero accent coverage in the shipped atlas', () => {
  const heroes = Object.values(gameData.units).filter((u) => u.hero);

  it('repaints a visible share of every hero rig', () => {
    expect(heroes.length).toBeGreaterThan(0);
    for (const hero of heroes) {
      const accent = heroAccentFor(hero.id);
      expect(accent, `${hero.id} accent`).toBeDefined();
      const { spriteId } = unitRig(hero.id);
      const { opaque, accented } = accentCoverage(spriteId, accent!.from);
      expect(opaque, `${spriteId} frames found`).toBeGreaterThan(0);
      // Measured floor is 8% (Genghis on the scout rig, whose horse dominates the
      // frame); anything near zero means the accent is aimed at a ramp this rig does
      // not use and the hero is invisible in his own army.
      expect(accented / opaque, `${hero.id} on ${spriteId}`).toBeGreaterThan(0.05);
      expect(accented, `${hero.id} on ${spriteId}`).toBeGreaterThan(100);
    }
  });

  it('leaves the player-colour band and the horse alone', () => {
    const accent = heroAccentFor('heroWallace')!;
    const mask: Rgb[] = [[255, 0, 255], [204, 0, 204], [153, 0, 153]];
    for (const tone of mask) {
      expect(accent.from, 'ownership pixels stay ownership pixels').not.toContainEqual(tone);
    }
    // Horse coats are wood (bay) and dirt (dun) tones — not an outfit ramp.
    for (const coat of [[0x6b, 0x4c, 0x2c], [0xa8, 0x85, 0x4f]]) {
      expect(accent.from, 'mounts keep their coat').not.toContainEqual(coat);
    }
  });
});
