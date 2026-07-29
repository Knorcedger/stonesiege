// Automated post-pass checks (the ⚙ items of ART_BIBLE §9 that apply to the
// emitted frames): palette discipline, mask hygiene, mask coverage bands,
// contrast vs terrain backdrops. Throws on hard failures.

import { Raster } from './raster.ts';
import { PALETTE, allowedOpaqueSet, isMaskColor, pixelKey } from './palette.ts';
import { luma } from './util.ts';
import type { FrameDef } from './atlas.ts';

/**
 * §9.4 per-defId mask-coverage override bands (fractions of opaque pixels).
 * Default bands: unit/* 8–20%, bld/* 2–8%, masked obj/* animals 1–6%.
 * Stage 2: add exceptions HERE (e.g. monk), never special-case in code.
 */
export const COVERAGE_OVERRIDES: Record<string, [number, number]> = {
  monk: [0.04, 0.10],
  sheep: [0.01, 0.06],
  // Siege machines read team via a banner panel/pennant, not cloth mass —
  // deliberately below the humanoid band (like monk), per §9.4's override rule.
  batteringRam: [0.015, 0.08],
  cappedRam: [0.015, 0.08],
  siegeRam: [0.015, 0.08],
  mangonel: [0.03, 0.09],
  onager: [0.03, 0.09],
  trebuchet: [0.015, 0.13],
  // Quiet-by-design buildings (ART_BIBLE §5.3): monastery shows a door banner
  // only; the gate carries two small post banners on a big stone mass.
  monastery: [0.001, 0.08],
  gate: [0.001, 0.08],
};

/** §9.1: every opaque pixel on-palette; only translucency is black@88 (+ ui overlays). */
export function checkPalette(frames: FrameDef[], atlasName: string, allowMask: boolean): void {
  const allowed = allowedOpaqueSet(allowMask);
  for (const f of frames) {
    const r = f.raster;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const [pr, pg, pb, pa] = r.get(x, y);
        if (pa === 0) continue;
        if (pa === 88 && pr === 0 && pg === 0 && pb === 0) continue;
        if (pa !== 255) {
          throw new Error(`${atlasName}:${f.name} (${x},${y}) has off-whitelist alpha ${pa}`);
        }
        if (!allowed.has(pixelKey(pr, pg, pb))) {
          throw new Error(
            `${atlasName}:${f.name} (${x},${y}) off-palette rgb(${pr},${pg},${pb})${
              isMaskColor(pr, pg, pb) ? ' [mask color banned in this atlas]' : ''
            }`,
          );
        }
      }
    }
  }
}

/** §9.4: mask coverage bands for frames that carry mask pixels. */
export function checkMaskCoverage(frames: FrameDef[], atlasName: string): void {
  for (const f of frames) {
    const r = f.raster;
    let opaque = 0;
    let mask = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const [pr, pg, pb, pa] = r.get(x, y);
        if (pa !== 255) continue;
        opaque++;
        if (isMaskColor(pr, pg, pb)) mask++;
      }
    }
    if (mask === 0 || opaque === 0) continue;
    const frac = mask / opaque;
    const defId = f.name.split('/')[1]?.split('@')[0] ?? '';
    const band: [number, number] =
      COVERAGE_OVERRIDES[defId] ??
      (f.name.startsWith('unit/') ? [0.08, 0.2] : f.name.startsWith('bld/') ? [0.02, 0.08] : [0.01, 0.06]);
    if (frac < band[0] || frac > band[1]) {
      throw new Error(
        `${atlasName}:${f.name} mask coverage ${(frac * 100).toFixed(1)}% outside [${band[0] * 100}%, ${band[1] * 100}%]`,
      );
    }
  }
}

/** §9.5: ≥40% of a sprite's opaque pixels differ ≥25 luma from each of 4 backdrops. */
export function checkContrast(frames: FrameDef[], atlasName: string): void {
  const backdrops = [PALETTE.grassBase, PALETTE.dirtBase, PALETTE.grassShadow, PALETTE.dirtPale];
  for (const f of frames) {
    const r = f.raster;
    let opaque = 0;
    const pass = [0, 0, 0, 0];
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const [pr, pg, pb, pa] = r.get(x, y);
        if (pa !== 255) continue;
        opaque++;
        const l = luma(pr, pg, pb);
        backdrops.forEach((c, i) => {
          if (Math.abs(l - luma(c[0], c[1], c[2])) >= 25) pass[i]++;
        });
      }
    }
    if (opaque === 0) continue;
    backdrops.forEach((c, i) => {
      if (pass[i] / opaque < 0.4) {
        throw new Error(
          `${atlasName}:${f.name} contrast fail vs rgb(${c.join(',')}): ${(100 * pass[i] / opaque).toFixed(0)}% < 40%`,
        );
      }
    });
  }
}

/** §9.12 helper for stage 2: dirs 5/6/7 must equal hflips of 3/2/1 — exported for reuse. */
export function isExactHflip(a: Raster, b: Raster): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const fl = a.hflip();
  for (let i = 0; i < fl.data.length; i++) if (fl.data[i] !== b.data[i]) return false;
  return true;
}
