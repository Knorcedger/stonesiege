// Unit sprites (`unit/<defId>/<anim>/<dir>/<frame>`), ART_BIBLE §6.
// Every trainable unit in gameData: humanoids share the parameterized rig in
// rig.ts (one walk/attack engine, per-role gear layers), cavalry share the
// horse rig, siege machines use the iso-box machine rigs below.
// Dirs 0–4 authored (renderer mirrors 5–7); anchor at feet; frames trimmed to
// content so the atlas stays within the contract's 2048×2048 budget.
// Player color: magenta mask ramp left in (runtime-swap) — decay frames strip it.

import { units } from '../../../packages/data/src/units.ts';
import { Raster } from './raster.ts';
import { PALETTE, MASK } from './palette.ts';
import type { RGB } from './palette.ts';
import type { FrameDef } from './atlas.ts';
import {
  DIRS, FACE, sideView, trimFrame, decayFrom, drawHuman, drawCavalry,
  boxAxes, isoBox, pt,
} from './rig.ts';
import type { Dir, HumanSpec, HumanAnim, CavSpec, CavAnim, BoxMat } from './rig.ts';

const P = PALETTE;
const M = MASK;

export interface UnitsResult {
  frames: FrameDef[];
  impactFrames: Record<string, number>;
}

// ---------------------------------------------------------------- humanoid specs

const CLOTH: readonly [RGB, RGB] = [P.clothLight, P.clothBase];

const HUMANS: Record<string, HumanSpec> = {
  villager: {
    id: 'villager', height: 24, torsoW: 7, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'cap', weapon: 'tool', sashRows: 2, metal: 0, hunch: true,
  },
  militia: {
    id: 'militia', height: 26, torsoW: 7, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'none', weapon: 'sword', shield: 'round', sashRows: 2, metal: 0,
  },
  manAtArms: {
    id: 'manAtArms', height: 26, torsoW: 7, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'helm', weapon: 'sword', shield: 'round', sashRows: 2, metal: 1,
  },
  longswordsman: {
    id: 'longswordsman', height: 26, torsoW: 7, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'helm', weapon: 'longsword', shield: 'round', sashRows: 2, metal: 1,
  },
  champion: {
    id: 'champion', height: 27, torsoW: 7, tunic: CLOTH, legsC: P.metalDark,
    helmet: 'helmLight', weapon: 'longsword', shield: 'round', sashRows: 2,
    metal: 2, plumeMask: true, glint: true,
  },
  spearman: {
    id: 'spearman', height: 26, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'cap', capC: PALETTE.woodDark, weapon: 'spear', sashRows: 4, metal: 0,
  },
  pikeman: {
    id: 'pikeman', height: 26, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'helm', weapon: 'pike', sashRows: 4, metal: 1,
  },
  archer: {
    id: 'archer', height: 25, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'cap', weapon: 'bow', quiver: true, sashRows: 3, metal: 0,
  },
  crossbowman: {
    id: 'crossbowman', height: 25, torsoW: 6, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'helm', weapon: 'crossbow', quiver: true, sashRows: 4, metal: 1,
  },
  arbalester: {
    id: 'arbalester', height: 25, torsoW: 6, tunic: CLOTH, legsC: P.metalDark,
    helmet: 'helmLight', weapon: 'crossbow', quiver: true, sashRows: 4, metal: 2,
  },
  skirmisher: {
    id: 'skirmisher', height: 25, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'brim', weapon: 'javelin', shield: 'buckler', sashRows: 3, metal: 0,
  },
  eliteSkirmisher: {
    id: 'eliteSkirmisher', height: 25, torsoW: 6, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'brim', weapon: 'javelin', shield: 'buckler', sashRows: 3, metal: 1,
  },
  monk: {
    id: 'monk', height: 26, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'monk', weapon: 'staff', sashRows: 0, metal: 0, robe: true,
  },
  highlandRaider: {
    id: 'highlandRaider', height: 27, torsoW: 7, tunic: CLOTH, legsC: P.skinBase,
    helmet: 'none', weapon: 'axe2h', sashRows: 2, kilt: true, metal: 0,
  },
  eliteHighlandRaider: {
    id: 'eliteHighlandRaider', height: 27, torsoW: 7, tunic: CLOTH, legsC: P.skinBase,
    helmet: 'helm', weapon: 'axe2h', sashRows: 2, kilt: true, metal: 1,
  },
  longbowman: {
    id: 'longbowman', height: 26, torsoW: 6, tunic: CLOTH, legsC: P.clothDark,
    helmet: 'hood', weapon: 'longbow', quiver: true, sashRows: 4, metal: 0,
  },
  eliteLongbowman: {
    id: 'eliteLongbowman', height: 26, torsoW: 6, tunic: CLOTH, legsC: P.woodDark,
    helmet: 'hood', weapon: 'longbow', quiver: true, sashRows: 4, metal: 1,
  },
};

// ---------------------------------------------------------------- cavalry specs

const CAVALRY: Record<string, CavSpec> = {
  scout: { id: 'scout', coat: 'dun', caparison: false, blanket: true, riderMetal: 0 },
  lightCavalry: { id: 'lightCavalry', coat: 'dun', caparison: false, blanket: true, riderMetal: 1 },
  knight: { id: 'knight', coat: 'bay', caparison: true, blanket: false, riderMetal: 1, kite: true },
  cavalier: { id: 'cavalier', coat: 'bay', caparison: true, blanket: false, riderMetal: 2, kite: true },
  paladin: {
    id: 'paladin', coat: 'bay', caparison: true, blanket: false, riderMetal: 2,
    kite: true, plumeMask: true,
  },
};

// ---------------------------------------------------------------- ram

const WOOD_MAT: BoxMat = {
  // topLit = woodPale keeps machines readable on the dark forest floor (§9.5)
  top: P.woodLight, topLit: P.woodPale, wallLit: P.woodLight, wall: P.woodBase, wallDark: P.woodDark,
};

type RamTier = 0 | 1 | 2; // battering / capped / siege

function drawRamWreck(tier: RamTier, dir: Dir, stage: number): Raster {
  const r = new Raster(88, 84);
  const cx = 44;
  const GY = 74;
  const ax = boxAxes(dir);
  r.dropShadow(cx, GY, 22, 5);
  const h = stage === 0 ? 8 : stage === 1 ? 5 : 3;
  // collapsed plank pile
  const pts = [
    pt(cx, GY, ax, 15, 8, 0), pt(cx, GY, ax, 17, -6, 0),
    pt(cx, GY, ax, -16, -8, 0), pt(cx, GY, ax, -14, 7, 0),
  ];
  r.fillPoly(pts, P.woodDark);
  r.fillPoly(pts.map(([x, y]) => [x, y - h] as [number, number]), P.woodBase);
  // protruding tilted beams
  const [bx, by] = pt(cx, GY, ax, -10, 0, h);
  r.line(bx, by, bx - 6, by - 7, P.woodDark);
  r.line(bx + 8, by, bx + 13, by - 5, P.woodDark);
  // the ram log lying in front
  const [lx, ly] = pt(cx, GY, ax, 12, 4, 0);
  r.line(lx - 5, ly - 1, lx + 5, ly - 1, P.woodBase);
  r.line(lx - 5, ly - 2, lx + 5, ly - 2, P.woodLight);
  if (tier === 2) r.fillRect(lx + 3, ly - 3, 3, 3, P.metalBase);
  // tipped wheel
  const [wx, wy] = pt(cx, GY, ax, 6, -7, 0);
  r.fillEllipse(wx, wy - 2, 3, 3, P.woodDark);
  r.set(wx, wy - 2, P.woodBase);
  r.outlinePass();
  return r;
}

function drawRam(tier: RamTier, anim: CavAnim, dir: Dir, frame: number): Raster {
  if (anim === 'die') {
    if (frame <= 1) {
      // intact housing shudders down before collapsing
      const base = drawRam(tier, 'idle', dir, 0);
      const out = new Raster(88, 84);
      out.blit(base, 0, frame + 1);
      return out;
    }
    return drawRamWreck(tier, dir, frame - 2);
  }
  if (anim === 'decay') return decayFrom(drawRamWreck(tier, dir, 2), frame, 44, 74);
  const r = new Raster(88, 84);
  const cx = 44;
  const GY = 74;
  const ax = boxAxes(dir);
  const bob = anim === 'walk' ? [0, 0, -1, 0, 0, -1][frame] : 0;
  const logDx = anim === 'attack' ? [-2, -3, 4, 2, 0][frame] : anim === 'idle' && frame === 1 ? -1 : anim === 'walk' ? [0, 1, 0, 0, -1, 0][frame] : 0;
  const L = 16;
  const W = 9;
  const H = 9;
  r.dropShadow(cx, GY, 22, 5);
  // wheels (visible under the housing)
  for (const [s, t] of [[-10, W], [0, W + 1], [10, W], [-10, -W], [10, -W]] as const) {
    const [wx, wy] = pt(cx, GY, ax, s, t, 0);
    r.fillEllipse(wx, wy - 2, 2, 2, P.woodDark);
    r.set(wx, wy - 2, P.woodPale);
  }
  // housing box on the wheels
  const baseY = GY - 3 + bob;
  isoBox(r, cx, baseY, dir, L, W, H, WOOD_MAT);
  // plank lines on the near wall
  for (let i = -1; i <= 1; i++) {
    const [px0, py0] = pt(cx, baseY, ax, -L + 2, W, 3 + i * 3);
    const [px1, py1] = pt(cx, baseY, ax, L - 2, W, 3 + i * 3);
    r.line(px0, py0, px1, py1, P.woodDark);
  }
  // pitched roof
  const RH = 6;
  const ridge0 = pt(cx, baseY, ax, L - 1, 0, H + RH);
  const ridge1 = pt(cx, baseY, ax, -L + 1, 0, H + RH);
  const eaveNear0 = pt(cx, baseY, ax, L, W + 1, H);
  const eaveNear1 = pt(cx, baseY, ax, -L, W + 1, H);
  const eaveFar0 = pt(cx, baseY, ax, L, -W - 1, H);
  const eaveFar1 = pt(cx, baseY, ax, -L, -W - 1, H);
  r.fillPoly([eaveFar0, eaveFar1, ridge1, ridge0], P.woodBase);
  r.fillPoly([eaveNear0, eaveNear1, ridge1, ridge0], P.woodLight);
  // plank gap stripes across both roof planes (dark share keeps §9.5 contrast
  // vs grass while the lit plane carries the forest-floor read)
  for (const tt2 of [0.2, 0.45, 0.8]) {
    const nx0 = eaveNear0[0] + (ridge0[0] - eaveNear0[0]) * tt2;
    const ny0 = eaveNear0[1] + (ridge0[1] - eaveNear0[1]) * tt2;
    const nx1 = eaveNear1[0] + (ridge1[0] - eaveNear1[0]) * tt2;
    const ny1 = eaveNear1[1] + (ridge1[1] - eaveNear1[1]) * tt2;
    r.line(nx0, ny0, nx1, ny1, P.woodDark);
    const fx0 = eaveFar0[0] + (ridge0[0] - eaveFar0[0]) * tt2;
    const fy0 = eaveFar0[1] + (ridge0[1] - eaveFar0[1]) * tt2;
    const fx1 = eaveFar1[0] + (ridge1[0] - eaveFar1[0]) * tt2;
    const fy1 = eaveFar1[1] + (ridge1[1] - eaveFar1[1]) * tt2;
    r.line(fx0, fy0, fx1, fy1, P.woodDark);
  }
  if (tier >= 1) {
    // capped: metal plating rows on the near roof plane
    for (const tt of [0.3, 0.7]) {
      const x0 = eaveNear0[0] + (ridge0[0] - eaveNear0[0]) * tt;
      const y0 = eaveNear0[1] + (ridge0[1] - eaveNear0[1]) * tt;
      const x1 = eaveNear1[0] + (ridge1[0] - eaveNear1[0]) * tt;
      const y1 = eaveNear1[1] + (ridge1[1] - eaveNear1[1]) * tt;
      r.line(x0, y0, x1, y1, tier === 2 ? P.metalLight : P.metalBase);
    }
  }
  // masked banner panel on the camera-facing wall + pennant at the ridge center
  // (interior pixels survive the outline pass on every dir; §9.4 override band)
  const [pS, pT] = dir === 0 ? [L, 5] : dir === 4 ? [-L, 5] : [0, W];
  const [pnx, pny] = pt(cx, baseY, ax, pS, pT, 5);
  for (let py = 0; py < 3; py++) {
    for (let px = -3; px <= 3; px++) {
      const c = py === 0 ? M.light : px > 1 ? M.dark : M.mid;
      r.set(pnx + px, pny - py, c);
    }
  }
  const [rmx, rmy] = pt(cx, baseY, ax, 0, 0, H + RH);
  r.fillRect(Math.round(rmx), Math.round(rmy) - 4, 1, 4, P.woodDark);
  r.set(rmx + 1, rmy - 4, M.light);
  r.set(rmx + 2, rmy - 4, M.mid);
  r.set(rmx + 1, rmy - 3, M.dark);
  // swinging log head protruding at the front
  const [hx, hy] = pt(cx, baseY, ax, L + 4 + logDx, 0, 5);
  const [tx2, ty2] = pt(cx, baseY, ax, L - 3 + logDx, 0, 5);
  r.line(tx2, ty2 - 1, hx, hy - 1, P.woodBase);
  r.line(tx2, ty2, hx, hy, P.woodBase);
  r.line(tx2, ty2 + 1, hx, hy + 1, P.woodDark);
  if (tier === 2) {
    r.fillRect(hx - 1, hy - 2, 3, 4, P.metalBase);
    r.set(hx - 1, hy - 2, P.metalLight);
  } else {
    r.set(hx, hy - 1, P.woodPale);
    r.set(hx, hy, P.woodPale);
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- mangonel

function drawMangonelWreck(heavy: boolean, dir: Dir): Raster {
  const r = new Raster(88, 84);
  const cx = 44;
  const GY = 74;
  const ax = boxAxes(dir);
  r.dropShadow(cx, GY, 16, 4);
  const pts = [
    pt(cx, GY, ax, 10, 7, 0), pt(cx, GY, ax, 11, -6, 0),
    pt(cx, GY, ax, -10, -7, 0), pt(cx, GY, ax, -9, 6, 0),
  ];
  r.fillPoly(pts, P.woodDark);
  r.fillPoly(pts.map(([x, y]) => [x, y - 3] as [number, number]), P.woodBase);
  // broken arm lying across
  const [ax0, ay0] = pt(cx, GY, ax, -8, 2, 3);
  r.line(ax0, ay0, ax0 + 12, ay0 - 4, P.woodBase);
  r.line(ax0 + 12, ay0 - 4, ax0 + 15, ay0 - 3, P.woodDark);
  const [wx, wy] = pt(cx, GY, ax, 7, -6, 0);
  r.fillEllipse(wx, wy - 2, 3, 3, P.woodDark);
  if (heavy) r.fillRect(cx - 2, GY - 5, 4, 2, P.metalBase);
  r.outlinePass();
  return r;
}

function drawMangonel(heavy: boolean, anim: CavAnim, dir: Dir, frame: number): Raster {
  if (anim === 'die') {
    if (frame <= 1) {
      const base = drawMangonel(heavy, 'idle', dir, 0);
      // shudder: shift down
      const out = new Raster(88, 84);
      out.blit(base, 0, frame);
      return out;
    }
    return drawMangonelWreck(heavy, dir);
  }
  if (anim === 'decay') return decayFrom(drawMangonelWreck(heavy, dir), frame, 44, 74);
  const r = new Raster(88, 84);
  const cx = 44;
  const GY = 74;
  const ax = boxAxes(dir);
  const bob = anim === 'walk' ? [0, -1, 0, 0, -1, 0][frame] : 0;
  const W = heavy ? 8 : 7;
  r.dropShadow(cx, GY, 16, 4);
  for (const [s, t] of [[-7, W], [7, W], [-7, -W], [7, -W]] as const) {
    const [wx, wy] = pt(cx, GY, ax, s, t, 0);
    r.fillEllipse(wx, wy - 2, 3, 3, P.woodDark);
    r.set(wx - 1, wy - 3, P.woodBase);
    r.set(wx, wy - 2, P.woodPale);
  }
  const baseY = GY - 3 + bob;
  isoBox(r, cx, baseY, dir, 10, W, 5, WOOD_MAT);
  if (heavy) {
    // onager: metal plating row on the near wall
    const [px0, py0] = pt(cx, baseY, ax, -9, W, 2);
    const [px1, py1] = pt(cx, baseY, ax, 9, W, 2);
    r.line(px0, py0, px1, py1, P.metalBase);
  }
  // masked frame stripe on the camera-facing wall
  const stripeEnds: [number, number, number, number] =
    dir === 0 ? [10, -5, 10, 5] : dir === 4 ? [-10, -5, -10, 5] : [-8, W, 8, W];
  const [mx0, my0] = pt(cx, baseY, ax, stripeEnds[0], stripeEnds[1], 4);
  const [mx1, my1] = pt(cx, baseY, ax, stripeEnds[2], stripeEnds[3], 4);
  const stepsM = 12;
  for (let i = 0; i <= stepsM; i++) {
    const x = Math.round(mx0 + ((mx1 - mx0) * i) / stepsM);
    const y = Math.round(my0 + ((my1 - my0) * i) / stepsM);
    const c = i < 4 ? M.light : i > 8 ? M.dark : M.mid;
    r.set(x, y, c);
    r.set(x, y - 1, c);
  }
  // cross-frame uprights
  const apexH = 15;
  const [u0x, u0y] = pt(cx, baseY, ax, 4, 0, 5);
  const [u1x, u1y] = pt(cx, baseY, ax, -4, 0, 5);
  const [a0x, a0y] = pt(cx, baseY, ax, 0, 0, apexH);
  r.line(u0x, u0y, a0x, a0y, P.woodBase);
  r.line(u1x, u1y, a0x, a0y, P.woodBase);
  // throwing arm
  const armPhase = anim === 'attack' ? ([0, 0, 1, 2, 2] as const)[frame] : 0;
  let tip: [number, number];
  if (armPhase === 0) tip = pt(cx, baseY, ax, -13, 0, 2); // cocked back
  else if (armPhase === 1) tip = [a0x, a0y - 12]; // vertical (impact)
  else tip = pt(cx, baseY, ax, 9, 0, apexH + 6); // follow-through
  r.line(a0x, a0y, tip[0], tip[1], P.woodBase);
  r.line(a0x, a0y + 1, tip[0], tip[1] + 1, P.woodDark);
  // bucket + rock (rock leaves on the impact frame)
  r.fillRect(tip[0] - 1, tip[1] - 1, 3, 2, P.woodDark);
  const hasRock = anim !== 'attack' ? true : frame < 2;
  if (hasRock) {
    r.fillRect(tip[0] - 1, tip[1] - 3, 3, 2, P.stoneBase);
    r.set(tip[0] - 1, tip[1] - 3, P.stoneLight);
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- trebuchet

function drawTrebWreck(dir: Dir): Raster {
  const r = new Raster(112, 112);
  const cx = 56;
  const GY = 102;
  const ax = boxAxes(dir);
  r.dropShadow(cx, GY, 26, 6);
  const pts = [
    pt(cx, GY, ax, 16, 9, 0), pt(cx, GY, ax, 18, -8, 0),
    pt(cx, GY, ax, -16, -9, 0), pt(cx, GY, ax, -15, 8, 0),
  ];
  r.fillPoly(pts, P.woodDark);
  r.fillPoly(pts.map(([x, y]) => [x, y - 4] as [number, number]), P.woodBase);
  // fallen A-frame legs
  r.line(cx - 12, GY - 4, cx - 26, GY - 14, P.woodBase);
  r.line(cx + 10, GY - 4, cx + 24, GY - 12, P.woodBase);
  // the long arm on the ground
  r.line(cx - 20, GY - 2, cx + 22, GY - 6, P.woodBase);
  r.line(cx - 20, GY - 1, cx + 22, GY - 5, P.woodDark);
  // burst counterweight box
  r.fillRect(cx + 6, GY - 10, 7, 5, P.woodDark);
  r.fillRect(cx + 7, GY - 9, 5, 3, M.mid);
  r.set(cx + 7, GY - 9, M.light);
  r.set(cx + 11, GY - 7, M.dark);
  r.outlinePass();
  return r;
}

function drawTrebuchet(anim: HumanAnim, dir: Dir, frame: number): Raster {
  if (anim === 'die') {
    if (frame <= 1) {
      const base = drawTrebuchet('idle', dir, 0);
      const out = new Raster(112, 112);
      out.blit(base, 0, frame * 2);
      return out;
    }
    return drawTrebWreck(dir);
  }
  if (anim === 'decay') return decayFrom(drawTrebWreck(dir), frame, 56, 102);

  const r = new Raster(112, 112);
  const cx = 56;
  const GY = 102;
  const ax = boxAxes(dir);

  if (anim === 'walk') {
    // PACKED cart (contract §10.4: walk = packed)
    const bob = [0, -1, 0, 0, -1, 0][frame];
    r.dropShadow(cx, GY, 24, 5);
    for (const [s, t] of [[-14, 8], [14, 8], [-14, -8], [14, -8]] as const) {
      const [wx, wy] = pt(cx, GY, ax, s, t, 0);
      r.fillEllipse(wx, wy - 2, 3, 3, P.woodDark);
      r.set(wx, wy - 2, P.woodPale);
    }
    const baseY = GY - 3 + bob;
    isoBox(r, cx, baseY, dir, 18, 8, 5, WOOD_MAT);
    // alternating pale/dark plank lines across the bed (§9.5 contrast both ways)
    for (const t of [-5, 0, 5]) {
      const [b0x, b0y] = pt(cx, baseY, ax, -16, t, 5);
      const [b1x, b1y] = pt(cx, baseY, ax, 17, t, 5);
      r.line(b0x, b0y, b1x, b1y, P.woodPale);
    }
    for (const t of [-3, 3, 7]) {
      const [b0x, b0y] = pt(cx, baseY, ax, -16, t, 5);
      const [b1x, b1y] = pt(cx, baseY, ax, 17, t, 5);
      r.line(b0x, b0y, b1x, b1y, P.woodDark);
    }
    // folded arm lying along the bed
    const [f0x, f0y] = pt(cx, baseY, ax, -17, 0, 8);
    const [f1x, f1y] = pt(cx, baseY, ax, 19, 0, 7);
    r.line(f0x, f0y, f1x, f1y, P.woodBase);
    r.line(f0x, f0y + 1, f1x, f1y + 1, P.woodDark);
    // counterweight box strapped at the rear + masked panel
    const [cbx, cby] = pt(cx, baseY, ax, -10, 0, 5);
    r.fillRect(cbx - 4, cby - 8, 9, 7, P.woodDark);
    r.fillRect(cbx - 3, cby - 7, 7, 5, M.mid);
    r.fillRect(cbx - 3, cby - 7, 3, 2, M.light);
    r.fillRect(cbx + 1, cby - 4, 3, 2, M.dark);
    r.outlinePass();
    return r;
  }

  // UNPACKED (idle / attack): towering counterweight A-frame
  const apex: [number, number] = [cx, GY - 42];
  r.dropShadow(cx, GY, 22, 5);
  // base skids (2px)
  const [s0x, s0y] = pt(cx, GY, ax, -16, 7, 0);
  const [s1x, s1y] = pt(cx, GY, ax, 16, 7, 0);
  const [s2x, s2y] = pt(cx, GY, ax, -16, -7, 0);
  const [s3x, s3y] = pt(cx, GY, ax, 16, -7, 0);
  r.line(s0x, s0y, s1x, s1y, P.woodBase);
  r.line(s0x, s0y - 1, s1x, s1y - 1, P.woodLight);
  r.line(s2x, s2y, s3x, s3y, P.woodBase);
  r.line(s2x, s2y - 1, s3x, s3y - 1, P.woodLight);
  // A-frame legs — 3px timbers so the wood survives the outline pass
  for (const [sx, sy] of [[s2x, s2y], [s3x, s3y], [s0x, s0y], [s1x, s1y]] as const) {
    r.fillPoly([
      [sx - 1, sy - 1], [sx + 2, sy - 1],
      [apex[0] + 2, apex[1]], [apex[0] - 1, apex[1]],
    ], P.woodBase);
    r.line(sx - 1, sy - 1, apex[0] - 1, apex[1], P.woodLight);
    r.line(sx + 2, sy - 1, apex[0] + 2, apex[1], P.woodDark);
  }
  // crossbrace (2px)
  r.line(cx - 10, GY - 18, cx + 10, GY - 18, P.woodBase);
  r.line(cx - 10, GY - 17, cx + 10, GY - 17, P.woodDark);

  // arm through the pivot: long (throwing) end + short (counterweight) end
  const phase = anim === 'attack' ? frame : -1;
  let tip: [number, number];
  let cwt: [number, number];
  if (phase === 0) {
    tip = pt(cx, GY, ax, -26, 0, 6); // sling dragged low behind
    cwt = pt(apex[0], apex[1], ax, 8, 0, -6);
  } else if (phase === 1) {
    tip = pt(apex[0], apex[1], ax, -14, 0, 18);
    cwt = pt(apex[0], apex[1], ax, 6, 0, -10);
  } else if (phase === 2) {
    tip = [apex[0] + FACE[dir][0] * 3, apex[1] - 24]; // whip over the top (impact)
    cwt = pt(apex[0], apex[1], ax, 2, 0, -12);
  } else if (phase === 3) {
    tip = pt(apex[0], apex[1], ax, 16, 0, 8);
    cwt = pt(apex[0], apex[1], ax, -4, 0, -11);
  } else {
    // rest / settle: long end up-back, counterweight hanging under the pivot
    tip = pt(apex[0], apex[1], ax, -12, 0, 22);
    cwt = pt(apex[0], apex[1], ax, 4, 0, -9);
  }
  r.line(apex[0], apex[1] - 1, tip[0], tip[1] - 1, P.woodLight);
  r.line(apex[0], apex[1], tip[0], tip[1], P.woodBase);
  r.line(apex[0] + 1, apex[1] + 1, tip[0] + 1, tip[1] + 1, P.woodDark);
  r.line(apex[0], apex[1], cwt[0], cwt[1], P.woodBase);
  r.line(apex[0] + 1, apex[1], cwt[0] + 1, cwt[1], P.woodDark);
  // counterweight box with masked panel + hanging flag at the apex
  r.fillRect(cwt[0] - 4, cwt[1] - 1, 9, 8, P.woodDark);
  r.fillRect(cwt[0] - 3, cwt[1], 7, 6, M.mid);
  r.fillRect(cwt[0] - 3, cwt[1], 3, 2, M.light);
  r.fillRect(cwt[0] + 1, cwt[1] + 4, 3, 2, M.dark);
  r.fillRect(apex[0], apex[1] - 6, 1, 5, P.woodPale); // flag pole
  r.set(apex[0] + 1, apex[1] - 6, M.light);
  r.set(apex[0] + 2, apex[1] - 6, M.mid);
  r.set(apex[0] + 1, apex[1] - 5, M.mid);
  // sling rope + boulder
  if (phase === 0) {
    r.line(tip[0], tip[1], tip[0] - FACE[dir][0] * 3, GY - 2, P.clothDark);
    r.fillEllipse(tip[0] - FACE[dir][0] * 4, GY - 2, 3, 2, P.stoneBase);
    r.set(tip[0] - FACE[dir][0] * 5, GY - 3, P.stoneLight);
  } else if (phase === -1 || phase === 4) {
    r.line(tip[0], tip[1], tip[0], tip[1] + 5, P.clothDark);
  } else if (phase === 2) {
    r.line(tip[0], tip[1], tip[0] + FACE[dir][0] * 4, tip[1] - 3, P.clothDark); // released sling
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- assembly

interface AnimPlan {
  anim: HumanAnim | 'chop' | 'farm' | 'forage' | 'mine' | 'build';
  count: number;
}

function animPlanFor(id: string): AnimPlan[] {
  const u = units[id];
  const cavalry = u.classes.includes('cavalry');
  const plan: AnimPlan[] = [
    { anim: 'idle', count: 2 },
    { anim: 'walk', count: cavalry ? 8 : 6 },
  ];
  if (u.attacks.length > 0 || u.converts) plan.push({ anim: 'attack', count: 5 });
  if (u.gather) plan.push(
    { anim: 'gather', count: 4 },
    { anim: 'chop', count: 4 },
    { anim: 'farm', count: 4 },
    { anim: 'forage', count: 4 },
    { anim: 'mine', count: 4 },
    { anim: 'build', count: 4 },
    { anim: 'carry', count: 6 },
  );
  plan.push({ anim: 'die', count: 5 }, { anim: 'decay', count: 3 });
  return plan;
}

export function genUnits(): UnitsResult {
  const frames: FrameDef[] = [];
  const impactFrames: Record<string, number> = {};

  const trainable = Object.values(units).filter((u) => u.trainedAt.length > 0);
  for (const u of trainable) {
    const plan = animPlanFor(u.id);
    for (const { anim, count } of plan) {
      for (const dir of DIRS) {
        for (let f = 0; f < count; f++) {
          let raster: Raster;
          let anchor: { x: number; y: number };
          if (HUMANS[u.id]) {
            const rigAnim: HumanAnim = ['chop', 'farm', 'forage', 'mine', 'build'].includes(anim)
              ? 'gather' : anim as HumanAnim;
            raster = drawHuman(HUMANS[u.id], rigAnim, dir, f);
            anchor = { x: 24, y: 44 };
          } else if (CAVALRY[u.id]) {
            raster = drawCavalry(CAVALRY[u.id], anim as CavAnim, dir, f);
            anchor = { x: 32, y: 53 };
          } else if (u.id === 'batteringRam' || u.id === 'cappedRam' || u.id === 'siegeRam') {
            const tier = (u.id === 'batteringRam' ? 0 : u.id === 'cappedRam' ? 1 : 2) as RamTier;
            raster = drawRam(tier, anim as CavAnim, dir, f);
            anchor = { x: 44, y: 75 };
          } else if (u.id === 'mangonel' || u.id === 'onager') {
            raster = drawMangonel(u.id === 'onager', anim as CavAnim, dir, f);
            anchor = { x: 44, y: 75 };
          } else if (u.id === 'trebuchet') {
            raster = drawTrebuchet(anim as HumanAnim, dir, f);
            anchor = { x: 56, y: 103 };
          } else {
            throw new Error(`no rig for unit ${u.id}`);
          }
          const t = trimFrame(raster, anchor);
          frames.push({ name: `unit/${u.id}/${anim}/${dir}/${f}`, raster: t.raster, anchor: t.anchor });
        }
      }
    }
    if (u.attacks.length > 0 || u.converts) impactFrames[`unit/${u.id}/attack`] = 2;
  }
  return { frames, impactFrames };
}
