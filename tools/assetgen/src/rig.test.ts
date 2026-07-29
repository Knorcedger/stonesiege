// Regression tests for the round-3 art fixes (verify round 3):
// - the house gable pennant must survive the §7.2 outline pass with its full
//   3×3 masked core (an unbordered flag in open sky was eaten down to 2 px,
//   making houses team-unreadable at 1×),
// - the TC must carry its §5.3 player color (apex banner flag + door cloth),
// - the cavalry rig must hold the §6.1 proportions: ~18×8 side body, a solid
//   chest/rump mass on front/back dirs, and leg pairs that keep a colored
//   core through the outline pass.

import { describe, expect, it } from 'vitest';
import { genBuildings } from './gen-buildings.ts';
import { drawCavalry, trimFrame, CAV_GY } from './rig.ts';
import type { CavSpec } from './rig.ts';
import { PALETTE, isMaskColor } from './palette.ts';
import type { Raster } from './raster.ts';

const AGES = ['dark', 'feudal', 'castle', 'imperial'] as const;

function maskCount(r: Raster): number {
  let n = 0;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const [pr, pg, pb, pa] = r.get(x, y);
      if (pa === 255 && isMaskColor(pr, pg, pb)) n++;
    }
  }
  return n;
}

/** Longest contiguous fully-opaque run in a raster row. */
function maxOpaqueRun(r: Raster, y: number): number {
  let best = 0;
  let run = 0;
  for (let x = 0; x < r.width; x++) {
    run = r.alphaAt(x, y) === 255 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

const SCOUT: CavSpec = { id: 'scout', coat: 'dun', caparison: false, blanket: true, riderMetal: 0 };

describe('building player color survives the outline pass (§5.3/§9.4)', () => {
  const frames = genBuildings().frames;

  it('house keeps the full 3×3 masked pennant core on every age', () => {
    for (const age of AGES) {
      const f = frames.find((x) => x.name === `bld/house/${age}/done`);
      expect(f, `bld/house/${age}/done`).toBeDefined();
      expect(maskCount(f!.raster), `bld/house/${age}/done mask px`).toBeGreaterThanOrEqual(9);
    }
  });

  it('townCenter keeps the apex banner flag + door cloth on every age', () => {
    for (const age of AGES) {
      const f = frames.find((x) => x.name === `bld/townCenter/${age}/done`);
      expect(f, `bld/townCenter/${age}/done`).toBeDefined();
      expect(maskCount(f!.raster), `bld/townCenter/${age}/done mask px`).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('cavalry rig proportions (§6.1)', () => {
  it('side view carries the ~18×8 body ellipse', () => {
    const r = drawCavalry(SCOUT, 'idle', 1, 0);
    // body center for idle frame 0: CAV_GY - legLen(8) - ry(4)
    const cy = CAV_GY - 12;
    expect(maxOpaqueRun(r, cy)).toBeGreaterThanOrEqual(17);
    const t = trimFrame(r, { x: 32, y: 53 });
    expect(t.raster.width).toBeGreaterThanOrEqual(26); // body + head + tail
    expect(t.raster.width).toBeLessThanOrEqual(36);
  });

  it('front view has a solid chest mass between the splayed legs', () => {
    const r = drawCavalry(SCOUT, 'idle', 0, 0);
    const cy = CAV_GY - 13; // legLen(8) + ry(5)
    expect(maxOpaqueRun(r, cy + 2)).toBeGreaterThanOrEqual(9);
  });

  it('front-view leg pairs keep a colored (non-outline) core', () => {
    const r = drawCavalry(SCOUT, 'idle', 0, 0);
    const [or, og, ob] = PALETTE.outline;
    let colored = 0;
    const midLegY = CAV_GY - 4;
    for (let x = 0; x < r.width; x++) {
      const [pr, pg, pb, pa] = r.get(x, midLegY);
      if (pa === 255 && !(pr === or && pg === og && pb === ob)) colored++;
    }
    expect(colored).toBeGreaterThanOrEqual(4);
  });
});
