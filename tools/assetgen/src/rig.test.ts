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
import { HUMANS } from './gen-units.ts';
import {
  drawCavalry, drawHuman, trimFrame, walkFootDrop, walkSideLegs,
  DIRS, CAV_GY, HUMAN_GY,
} from './rig.ts';
import type { CavSpec, Dir } from './rig.ts';
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

describe('humanoid walk cycle', () => {
  // This rig is the missing-atlas fallback, but it was authoring a walk that
  // was not a walk: facing the camera, frames 2 and 3 were byte-identical and
  // 0/2/3/5 were within 4 px of each other, so a six-frame cycle played as two
  // poses strobing. In the side views the far leg collided with the near leg at
  // the passing frames and was shoved to the wrong side of the body.
  //
  // Drive this from the REAL shipping specs, not a stand-in: robed roles hide
  // their legs entirely, so a leg-only gait leaves the monk on two poses while
  // a hand-written non-robed spec passes.
  const SPECS = Object.entries(HUMANS);

  function framePixels(r: Raster): string {
    let out = '';
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const [pr, pg, pb, pa] = r.get(x, y);
        out += pa === 0 ? '.' : `${pr},${pg},${pb},${pa};`;
      }
    }
    return out;
  }

  function differingPixels(a: Raster, b: Raster): number {
    let n = 0;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const pa = a.get(x, y);
        const pb = b.get(x, y);
        if (pa[0] !== pb[0] || pa[1] !== pb[1] || pa[2] !== pb[2] || pa[3] !== pb[3]) n++;
      }
    }
    return n;
  }

  it('draws six visibly distinct poses for every unit in every authored direction', () => {
    for (const [id, spec] of SPECS) {
      for (const dir of DIRS) {
        const frames = Array.from({ length: 6 }, (_, f) => drawHuman(spec, 'walk', dir as Dir, f));
        expect(new Set(frames.map(framePixels)).size, `${id} dir ${dir} distinct poses`).toBe(6);
        for (let i = 0; i < 6; i++) {
          for (let j = i + 1; j < 6; j++) {
            expect(differingPixels(frames[i], frames[j]), `${id} dir ${dir} frames ${i}/${j}`)
              .toBeGreaterThanOrEqual(5);
          }
        }
      }
    }
  });

  it('sweeps the planted foot against the direction of travel', () => {
    // The authored side views all face screen-left, so a foot with its weight
    // on it has to travel screen-RIGHT: the ground holds it while the body
    // walks over it. The rig had the series the other way round, which is a
    // moonwalk — the legs drive the unit backwards while the sim advances it.
    for (let frame = 0; frame < 6; frame++) {
      const now = walkSideLegs(frame);
      const next = walkSideLegs((frame + 1) % 6);
      for (const leg of ['near', 'far'] as const) {
        if (now[leg].lift > 0 || next[leg].lift > 0) continue; // swinging, not planted
        expect(next[leg].dx - now[leg].dx, `${leg} leg planted at frame ${frame}`)
          .toBeGreaterThan(0);
      }
    }
  });

  it('swings each lifted foot forward again, half a cycle from the other', () => {
    for (let frame = 0; frame < 6; frame++) {
      const legs = walkSideLegs(frame);
      // Both feet planted at once is a stance, never both airborne mid-stride.
      expect(legs.near.lift > 0 && legs.far.lift > 0, `frame ${frame} both airborne`)
        .toBe(false);
      expect(legs.far.dx, `frame ${frame} legs share a hip`).toBe(-legs.near.dx);
    }
    const lifted = Array.from({ length: 6 }, (_, f) => walkSideLegs(f))
      .filter((legs) => legs.near.lift > 0);
    expect(lifted.length, 'near leg swing frames').toBeGreaterThan(0);
    for (let frame = 0; frame < 6; frame++) {
      const now = walkSideLegs(frame);
      const next = walkSideLegs((frame + 1) % 6);
      if (now.near.lift === 0 || next.near.lift === 0) continue;
      expect(next.near.dx - now.near.dx, `near leg swinging at frame ${frame}`)
        .toBeLessThan(0);
    }
  });

  it('reads foot height the opposite way walking away from the camera', () => {
    // In iso the foot planted ahead of the body is the one further from the
    // camera. Walking toward it that foot sits low and rises through its
    // stance; walking away it starts high and descends. One shared table
    // played the rear-facing walk backwards.
    const front = Array.from({ length: 4 }, (_, f) => walkFootDrop(0, f)[0]);
    const rear = Array.from({ length: 4 }, (_, f) => walkFootDrop(4, f)[0]);
    for (let f = 0; f < 3; f++) {
      expect(front[f + 1] - front[f], `front stance frame ${f}`).toBeGreaterThan(0);
      expect(rear[f + 1] - rear[f], `rear stance frame ${f}`).toBeLessThan(0);
    }
    for (const dir of [0, 4] as const) {
      const drops = Array.from({ length: 6 }, (_, f) => walkFootDrop(dir, f)[0]);
      const pairs = Array.from({ length: 6 }, (_, f) => walkFootDrop(dir, f).join(','));
      expect(new Set(pairs).size, `dir ${dir} distinct foot heights`).toBe(6);
      // The right foot is the left foot half a cycle later.
      for (let f = 0; f < 6; f++) {
        expect(walkFootDrop(dir, f)[1], `dir ${dir} frame ${f} right foot`)
          .toBe(drops[(f + 3) % 6]);
      }
    }
  });

  it('holds one body center and ground line across every walk pose', () => {
    // The sprite must not travel inside its own canvas — that is the same
    // slide-and-snap the HD walk cycles had, and the simulation already moves
    // the unit.
    for (const [id, spec] of SPECS) {
      for (const dir of DIRS) {
        const bounds = Array.from({ length: 6 }, (_, f) => {
          const r = drawHuman(spec, 'walk', dir as Dir, f);
          let left = r.width;
          let right = -1;
          let bottom = -1;
          for (let y = 0; y < r.height; y++) {
            for (let x = 0; x < r.width; x++) {
              if (r.alphaAt(x, y) === 0) continue;
              if (x < left) left = x;
              if (x > right) right = x;
              if (y > bottom) bottom = y;
            }
          }
          return { center: (left + right) / 2, bottom };
        });
        const centers = bounds.map((b) => b.center);
        expect(Math.max(...centers) - Math.min(...centers), `${id} dir ${dir} travel`)
          .toBeLessThanOrEqual(1);
        // The drop shadow sits on HUMAN_GY, so no pose may sink through it.
        for (const { bottom } of bounds) {
          expect(bottom, `${id} dir ${dir} ground contact`).toBeLessThanOrEqual(HUMAN_GY + 2);
        }
      }
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
