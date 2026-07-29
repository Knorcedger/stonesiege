// Gaia objects (ART_BIBLE §4): trees + stump, gold/stone mines, berry bush,
// farm stages 0–4, and the animated animals (sheep/deer/wolf) with the reduced
// anim sets sanctioned by ASSET_CONTRACT (idle 2, walk 4, attack 4, die 3, decay 2).
// Animals author dirs 0–4 (S, SW, W, NW, N); the renderer mirrors 5/6/7.

import { Raster, diamondRow } from './raster.ts';
import { PALETTE, MASK } from './palette.ts';
import type { RGB } from './palette.ts';
import { Rng } from './util.ts';
import type { FrameDef } from './atlas.ts';

export interface ObjectsResult {
  frames: FrameDef[];
  impactFrames: Record<string, number>;
}

// ---------------------------------------------------------------- trees

function oakTree(): Raster {
  const r = new Raster(48, 64);
  r.dropShadow(24, 58, 12, 4);
  r.fillRect(21, 45, 5, 14, PALETTE.woodBase);
  r.fillRect(21, 45, 1, 14, PALETTE.woodLight);
  const inU = (x: number, y: number) =>
    Raster.inEllipse(x, y, 24, 26, 14, 10) ||
    Raster.inEllipse(x, y, 14, 32, 9, 7) ||
    Raster.inEllipse(x, y, 34, 30, 9, 7);
  r.paintWhere(inU, PALETTE.leafBase);
  r.paintWhere((x, y) => inU(x, y) && !inU(x - 3, y - 3), PALETTE.leafLight);
  r.paintWhere((x, y) => inU(x, y) && !inU(x + 2, y + 2), PALETTE.leafDark);
  r.ditherWhere(
    0, 0, 47, 47,
    (x, y) => inU(x, y) && inU(x + 2, y + 2) && !inU(x + 4, y + 4),
    PALETTE.leafDark,
    50,
  );
  const rng = new Rng('obj/tree/0');
  for (let i = 0, n = rng.int(6, 10); i < n; i++) {
    const x = rng.int(12, 38);
    const y = rng.int(18, 38);
    if (inU(x, y)) r.set(x, y, PALETTE.leafShadow);
  }
  r.outlinePass();
  return r;
}

/** The §7.9 worked example. */
function pineTree(): Raster {
  const r = new Raster(48, 64);
  const rng = new Rng('obj/tree/1');
  r.dropShadow(24, 58, 10, 4);
  r.fillRect(22, 44, 4, 15, PALETTE.woodBase);
  r.fillRect(22, 44, 1, 15, PALETTE.woodLight);
  const j = () => rng.int(-2, 2);
  const tiers: Array<Array<readonly [number, number]>> = [
    [[24, 22], [6 + j(), 46], [42 + j(), 46]],
    [[24, 12], [10 + j(), 36], [38 + j(), 36]],
    [[24, 4], [14 + j(), 26], [34 + j(), 26]],
  ];
  for (const tier of tiers) {
    r.fillPoly(tier, PALETTE.leafBase);
  }
  // per-tier edge shading: 3px inboard of left edge → light, right → dark; bottom row → shadow
  for (const tier of tiers) {
    const [apex, bl, br] = tier;
    const yTop = apex[1];
    const yBot = bl[1];
    for (let y = yTop; y <= yBot; y++) {
      const t = (y - yTop) / (yBot - yTop || 1);
      const xl = Math.round(apex[0] + (bl[0] - apex[0]) * t);
      const xr = Math.round(apex[0] + (br[0] - apex[0]) * t);
      for (let x = xl; x <= Math.min(xl + 2, xr); x++) {
        if (r.alphaAt(x, y) === 255) r.set(x, y, PALETTE.leafLight);
      }
      for (let x = Math.max(xr - 2, xl + 3); x <= xr; x++) {
        if (r.alphaAt(x, y) === 255) r.set(x, y, PALETTE.leafDark);
      }
      if (y === yBot) {
        for (let x = xl; x <= xr; x++) {
          if (r.alphaAt(x, y) === 255) r.set(x, y, PALETTE.leafShadow);
        }
      }
      // 50% dither band inboard of the right-edge shade
      for (let x = Math.max(xr - 5, xl + 3); x <= xr - 3; x++) {
        if (Raster.ditherOn(x, y, 50) && r.alphaAt(x, y) === 255) r.set(x, y, PALETTE.leafDark);
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.int(16, 32);
    const y = rng.int(10, 42);
    if (r.alphaAt(x, y) === 255) r.set(x, y, PALETTE.leafShadow);
  }
  r.outlinePass();
  return r;
}

function deadTree(): Raster {
  const r = new Raster(48, 64);
  const rng = new Rng('obj/tree/2');
  r.dropShadow(24, 58, 8, 3);
  r.fillRect(22, 26, 3, 33, PALETTE.woodDark);
  r.fillRect(22, 26, 1, 33, PALETTE.woodBase);
  r.fillRect(22, 26, 3, 2, PALETTE.woodPale); // broken top
  // 3 forked 1px branches
  const branches: Array<[number, number, number, number]> = [
    [23, 34, 12 + rng.int(-1, 1), 24],
    [24, 30, 36 + rng.int(-1, 1), 20],
    [23, 42, 14 + rng.int(-1, 1), 38],
  ];
  for (const [x0, y0, x1, y1] of branches) {
    r.line(x0, y0, x1, y1, PALETTE.woodDark);
    r.line(x1, y1, x1 + (x1 < 24 ? -2 : 2), y1 - 4, PALETTE.woodDark);
  }
  r.outlinePass();
  return r;
}

function stump(): Raster {
  const r = new Raster(24, 20);
  r.dropShadow(12, 16, 6, 2);
  // 3px side below the top ellipse
  for (let dy = 0; dy < 3; dy++) {
    r.fillEllipse(12, 10 + dy, 4, 2, dy === 2 ? PALETTE.woodDark : PALETTE.woodBase);
  }
  r.fillEllipse(12, 10, 4, 2, PALETTE.woodBase); // ring
  r.fillEllipse(12, 10, 3, 1, PALETTE.woodPale); // cut face
  // root flares
  r.set(6, 13, PALETTE.woodDark);
  r.set(7, 13, PALETTE.woodBase);
  r.set(17, 13, PALETTE.woodDark);
  r.set(16, 13, PALETTE.woodBase);
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- mines

function mine(kind: 'gold' | 'stone', variant: number): Raster {
  const r = new Raster(56, 40);
  const rng = new Rng(`obj/${kind}/${variant}`);
  r.dropShadow(28, 33, 20, 5);
  const j = () => rng.int(-2, 2);
  // mound of 3 lumps; stone = blockier (flat tops), gold = lumpy
  const mask = new Raster(56, 40);
  const lumps: Array<Array<readonly [number, number]>> =
    kind === 'gold'
      ? [
          [[12 + j(), 32], [16 + j(), 16], [28, 10 + j()], [42 + j(), 17], [46 + j(), 32]],
          [[6, 33], [10 + j(), 23], [20, 20 + j()], [25, 33]],
          [[31, 33], [35 + j(), 23], [47, 24 + j()], [51, 33]],
        ]
      : [
          [[12 + j(), 32], [14, 15 + j()], [40, 13 + j()], [45 + j(), 32]],
          [[5, 33], [8, 22 + j()], [22, 21 + j()], [24, 33]],
          [[32, 33], [34, 23 + j()], [50, 22 + j()], [52, 33]],
        ];
  for (const lump of lumps) mask.fillPoly(lump, PALETTE.stoneBase);
  const inM = (x: number, y: number) => mask.alphaAt(x, y) === 255;
  r.paintWhere(inM, PALETTE.stoneBase);
  r.paintWhere((x, y) => inM(x, y) && !inM(x - 2, y - 2), PALETTE.stoneLight);
  r.paintWhere((x, y) => inM(x, y) && !inM(x + 2, y + 2), PALETTE.stoneDark);
  if (kind === 'gold') {
    // guaranteed 5–7 chunky vein clusters (rejection sampling with retries)
    const n = rng.int(5, 7);
    let placed = 0;
    for (let tries = 0; tries < 200 && placed < n; tries++) {
      const x = rng.int(10, 42);
      const y = rng.int(14, 27);
      if (!inM(x, y) || !inM(x + 2, y + 1)) continue;
      r.fillRect(x, y, 3, 2, PALETTE.goldBase);
      r.set(x, y, PALETTE.goldShine);
      r.set(x + 2, y + 1, PALETTE.goldDark);
      placed++;
    }
  } else {
    // cleaved pale faces + fracture lines
    for (let i = 0, n = rng.int(2, 3); i < n; i++) {
      const x = rng.int(12, 38);
      const y = rng.int(14, 22);
      r.paintWhere(
        (px, py) => inM(px, py) && px >= x && px < x + 8 && py >= y && py < y + 5,
        PALETTE.stonePale,
      );
      r.line(x + 1, y + 4, x + 6, y + 1, PALETTE.stoneDark);
    }
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- berry bush

function berryBush(): Raster {
  const r = new Raster(40, 32);
  const rng = new Rng('obj/berries');
  r.dropShadow(20, 28, 13, 3);
  const inE = (x: number, y: number) => Raster.inEllipse(x, y, 20, 20, 15, 8);
  r.paintWhere(inE, PALETTE.leafDark);
  r.paintWhere((x, y) => inE(x, y) && !inE(x - 2, y - 2), PALETTE.leafBase);
  r.paintWhere((x, y) => inE(x, y) && y >= 26, PALETTE.leafShadow);
  // guaranteed 12–16 berries so the "red dots on dark green" read survives 1×
  const n = rng.int(12, 16);
  let placed = 0;
  for (let tries = 0; tries < 300 && placed < n; tries++) {
    const x = rng.int(8, 32);
    const y = rng.int(14, 25);
    if (!inE(x, y) || !inE(x + 1, y - 1)) continue;
    r.set(x, y, PALETTE.berryRed);
    if (placed % 3 === 0) r.set(x + 1, y - 1, PALETTE.highlight);
    placed++;
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- farm

const FARM_W = 192;
const FARM_H = 96;
const FARM_TOP = 8; // canvas headroom for corner posts

function farmStage(stage: number): Raster {
  const r = new Raster(FARM_W, FARM_H + FARM_TOP);
  const rng = new Rng(`obj/farm/${stage}`);
  for (let dy = 0; dy < FARM_H; dy++) {
    const row = diamondRow(dy, FARM_W, FARM_H);
    if (!row) continue;
    const y = dy + FARM_TOP;
    for (let x = row[0]; x < row[1]; x++) {
      const s = (x + 2 * dy) % 8;
      let c: RGB = PALETTE.dirtBase;
      if (stage === 0 || stage === 1) {
        if (s === 0) c = PALETTE.dirtDark;
        else if (s === 1) c = PALETTE.dirtLight;
        if (stage === 1 && s === 1 && x % 3 === 0) c = PALETTE.leafLight;
      } else if (stage === 2 || stage === 3) {
        const band: RGB = stage === 2 ? PALETTE.leafBase : PALETTE.thatchBase;
        const dash: RGB = stage === 2 ? PALETTE.leafLight : PALETTE.thatchLight;
        if (s === 0 || s === 1) c = PALETTE.dirtDark;
        else if (s >= 3 && s <= 5) c = s === 4 && x % 4 < 2 ? dash : band;
        else c = PALETTE.dirtBase;
      } else {
        c = PALETTE.dirtBase;
        if (rng.chance(0.05)) c = PALETTE.thatchDark; // stubble ticks
      }
      r.set(x, y, c);
    }
  }
  // split-rail edging on the two camera-facing (SW/SE) edges
  const bx = FARM_W / 2;
  const by = FARM_H - 3 + FARM_TOP;
  const lx = 6;
  const rx2 = FARM_W - 7;
  const sideY = FARM_H / 2 + FARM_TOP;
  for (const [x0, y0, x1, y1] of [
    [lx + 4, sideY + 1, bx - 4, by],
    [bx + 4, by, rx2 - 4, sideY + 1],
  ] as const) {
    const steps = Math.abs(x1 - x0);
    for (let i = 0; i <= steps; i++) {
      if (i % 9 > 6) continue; // rail gaps
      const x = x0 + (x0 < x1 ? i : -i);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      r.set(x, y - 2, PALETTE.woodBase);
      if (i % 16 === 0) r.fillRect(x, y - 4, 1, 3, PALETTE.woodDark);
    }
  }
  // corner posts (1px wide, 6 tall)
  for (const [px, py] of [
    [FARM_W / 2, FARM_TOP + 1],
    [FARM_W - 3, FARM_H / 2 + FARM_TOP],
    [FARM_W / 2, FARM_H - 2 + FARM_TOP],
    [2, FARM_H / 2 + FARM_TOP],
  ] as const) {
    r.fillRect(px, py - 6, 1, 7, PALETTE.woodDark);
    r.set(px, py - 6, PALETTE.woodPale);
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- animals

type Facing = 0 | 1 | 2 | 3 | 4; // S SW W NW N

interface AnimalStyle {
  id: 'sheep' | 'deer' | 'wolf';
  rx: number;
  ry: number;
  legLen: number;
  legW: number;
  body: (r: Raster, inB: (x: number, y: number) => boolean, cx: number, cy: number) => void;
  legC: RGB;
  headC: RGB;
  extras: (r: Raster, dir: Facing, cx: number, cy: number, headX: number, headY: number) => void;
}

const SHEEP: AnimalStyle = {
  id: 'sheep',
  rx: 6,
  ry: 4,
  legLen: 3,
  legW: 1,
  body: (r, inB) => {
    r.paintWhere(inB, PALETTE.highlight);
    r.ditherWhere(0, 0, 31, 31, inB, PALETTE.clothLight, 50);
    r.paintWhere((x, y) => inB(x, y) && !inB(x - 2, y - 2), PALETTE.highlight);
  },
  legC: PALETTE.clothDark,
  headC: PALETTE.clothDark,
  extras: (r, dir, cx, cy) => {
    // masked collar band at the neck, all three mask tones, interior pixels only
    // (so the outline pass never eats them). §9.4 animal band: 1–6% of opaque.
    if (dir >= 1 && dir <= 3) {
      const nx = cx - 4; // neck x for side views (head is at cx - rx - 1)
      r.set(nx, cy - 1, MASK.light);
      r.set(nx, cy, MASK.mid);
      r.set(nx + 1, cy, MASK.mid);
      r.set(nx, cy + 1, MASK.dark);
      r.set(nx + 1, cy + 1, MASK.dark);
    } else {
      const ny = dir === 0 ? cy + 2 : cy - 2; // under/over the head for S/N views
      r.set(cx - 1, ny, MASK.light);
      r.set(cx, ny, MASK.mid);
      r.set(cx + 1, ny, MASK.dark);
    }
  },
};

const DEER: AnimalStyle = {
  id: 'deer',
  rx: 7,
  ry: 3,
  legLen: 6,
  legW: 1,
  body: (r, inB) => {
    r.paintWhere(inB, PALETTE.dirtLight);
    r.paintWhere((x, y) => inB(x, y) && !inB(x, y - 2), PALETTE.dirtLight);
    r.paintWhere((x, y) => inB(x, y) && !inB(x, y + 2), PALETTE.dirtPale); // belly
  },
  legC: PALETTE.dirtDark,
  headC: PALETTE.dirtLight,
  extras: (r, dir, _cx, _cy, headX, headY) => {
    // raised neck + antler forks
    const nx = headX;
    const ny = headY - 4;
    r.line(headX, headY, nx, ny, PALETTE.dirtLight);
    r.line(nx, ny - 1, nx - 2, ny - 4, PALETTE.woodPale);
    r.line(nx, ny - 1, nx + 2, ny - 4, PALETTE.woodPale);
    if (dir === 1 || dir === 2 || dir === 3) {
      r.set(nx - 1, ny - 1, PALETTE.dirtLight); // muzzle
    }
  },
};

const WOLF: AnimalStyle = {
  id: 'wolf',
  rx: 7,
  ry: 3,
  legLen: 4,
  legW: 1,
  body: (r, inB) => {
    r.paintWhere(inB, PALETTE.stoneBase);
    r.ditherWhere(0, 0, 31, 31, inB, PALETTE.stoneDark, 25);
    r.paintWhere((x, y) => inB(x, y) && !inB(x - 2, y - 2), PALETTE.stoneLight);
  },
  legC: PALETTE.stoneDark,
  headC: PALETTE.stoneBase,
  extras: (r, dir, cx, cy, headX, headY) => {
    // tail straight back (side views) or a nub toward the camera (N view);
    // hidden behind the body when facing S — never a floating "antenna"
    if (dir >= 1 && dir <= 3) {
      r.line(cx + 7, cy, cx + 10, cy - 2, PALETTE.stoneDark);
    } else if (dir === 4) {
      r.fillRect(cx, cy + 3, 1, 2, PALETTE.stoneDark);
    }
    if (dir === 0 || dir === 1 || dir === 2) r.set(headX, headY - 1, PALETTE.berryRed);
  },
};

/** Head center offset from body center per facing (screen space). */
function headOffset(dir: Facing, rx: number): [number, number] {
  if (dir === 0) return [0, rx - 1]; // S: toward camera (down)
  if (dir === 1) return [-(rx - 1), 3];
  if (dir === 2) return [-(rx + 1), 0];
  if (dir === 3) return [-(rx - 1), -3];
  return [0, -(rx - 1)]; // N: away (up)
}

function drawAnimal(
  style: AnimalStyle,
  anim: 'idle' | 'walk' | 'attack' | 'die' | 'decay',
  dir: Facing,
  frame: number,
): Raster {
  const r = new Raster(32, 32);
  const cx = 16;
  const groundY = 27;
  const sideView = dir === 1 || dir === 2 || dir === 3;
  const rx = sideView ? style.rx : Math.max(3, style.rx - 2);
  const ry = style.ry;

  if (anim === 'die' || anim === 'decay') {
    return drawAnimalDown(style, anim, frame, cx, groundY, rx);
  }

  const bob = anim === 'walk' ? [0, -1, 0, -1][frame] : anim === 'idle' ? [0, -1][frame] ?? 0 : 0;
  const lungeF = anim === 'attack' ? [0, 1, 2, 1][frame] : 0;
  const lunge: [number, number] = [
    (dir === 0 || dir === 4 ? 0 : -lungeF),
    (dir === 0 ? lungeF : dir === 4 ? -lungeF : 0),
  ];
  const cy = groundY - style.legLen - ry + bob + lunge[1];
  const bodyCx = cx + lunge[0];

  r.dropShadow(cx, groundY, Math.round(rx * 1.1), Math.max(2, Math.round(rx * 0.35)));

  const inB = (x: number, y: number) => Raster.inEllipse(x, y, bodyCx, cy, rx, ry);

  // legs (drawn before body so hips merge)
  const legXs = sideView
    ? [bodyCx - rx + 2, bodyCx - rx + 4, bodyCx + rx - 4, bodyCx + rx - 2]
    : [bodyCx - 3, bodyCx - 1, bodyCx + 1, bodyCx + 3];
  const phase = anim === 'walk' ? [1, 0, -1, 0][frame] : 0;
  for (let i = 0; i < 4; i++) {
    const dx = anim === 'walk' ? (i % 2 === 0 ? phase : -phase) : 0;
    const far = sideView && i % 2 === 1;
    const c = far ? darker(style.legC) : style.legC;
    r.fillRect(legXs[i] + dx, cy + ry - 1, style.legW, style.legLen + 1 - Math.abs(dx), c);
  }

  const [hx, hy] = headOffset(dir, rx);
  const headX = bodyCx + hx + lunge[0];
  const headY = cy + hy - 1 + (anim === 'attack' && lungeF === 2 ? 1 : 0);

  if (dir === 3 || dir === 4) {
    // facing away: head behind body
    r.fillEllipse(headX, headY, 2, 2, style.headC);
    style.body(r, inB, bodyCx, cy);
  } else {
    style.body(r, inB, bodyCx, cy);
    r.fillEllipse(headX, headY, 2, 2, style.headC);
    r.set(headX - 1, headY - 2, style.headC); // ear
    r.set(headX + 1, headY - 2, style.headC);
  }
  style.extras(r, dir, bodyCx, cy, headX, headY);
  r.outlinePass();
  return r;
}

function darker(c: RGB): RGB {
  // one ramp step down approximation for far legs — reuse the closest dark tone
  if (c === PALETTE.clothDark) return PALETTE.woodDark;
  if (c === PALETTE.dirtDark) return PALETTE.woodDark;
  if (c === PALETTE.stoneDark) return PALETTE.slateDark;
  return PALETTE.outline;
}

function drawAnimalDown(
  style: AnimalStyle,
  anim: 'die' | 'decay',
  frame: number,
  cx: number,
  groundY: number,
  rx: number,
): Raster {
  const r = new Raster(32, 32);
  r.dropShadow(cx, groundY, rx + 3, 3);
  const stage = anim === 'die' ? frame : 3; // decay starts from the settled pose
  // keep the carcass a readable lump: ry never drops below 3 (thin slivers vanish at 1×)
  const ry = stage === 0 ? style.ry : 3;
  const bodyRx = rx + (stage >= 2 ? 2 : stage === 1 ? 1 : 0);
  const cy = groundY - ry - (stage === 0 ? style.legLen - 1 : 0);
  const inB = (x: number, y: number) => Raster.inEllipse(x, y, cx, cy, bodyRx, ry);
  style.body(r, inB, cx, cy);
  if (stage === 0) {
    // knees folded: stubby legs, head drooping forward
    for (const lx of [cx - rx + 2, cx + rx - 3]) r.fillRect(lx, cy + ry - 1, 1, 2, style.legC);
    r.fillEllipse(cx - rx, cy + 1, 2, 2, style.headC);
  } else {
    // on side: head flat at the front, limp legs raised off the ground line
    r.fillEllipse(cx - bodyRx - 1, cy + 1, 2, 2, style.headC);
    r.fillRect(cx + bodyRx - 2, cy - ry - 1, 1, 2, style.legC);
    r.fillRect(cx + bodyRx - 4, cy - ry - 2, 1, 2, style.legC);
  }
  r.outlinePass();
  if (anim === 'decay') {
    // pixel-dropout dither (keep ~50% then ~25%) + bone pixels — never alpha fade
    const keep: 50 | 25 = frame === 0 ? 50 : 25;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (r.alphaAt(x, y) === 255 && !Raster.ditherOn(x, y, keep)) r.clear(x, y);
      }
    }
    if (frame === 1) {
      r.line(cx - 3, groundY - 2, cx + 4, groundY - 2, PALETTE.stonePale);
      r.set(cx - 5, groundY - 3, PALETTE.stonePale);
      r.set(cx + 2, groundY - 4, PALETTE.stonePale);
    }
  }
  return r;
}

const ANIMAL_ANIMS: Array<{ anim: 'idle' | 'walk' | 'attack' | 'die' | 'decay'; frames: number }> = [
  { anim: 'idle', frames: 2 },
  { anim: 'walk', frames: 4 },
  { anim: 'die', frames: 3 },
  { anim: 'decay', frames: 2 },
];

// ---------------------------------------------------------------- entry

export function genObjects(): ObjectsResult {
  const frames: FrameDef[] = [];
  const impactFrames: Record<string, number> = {};

  frames.push({ name: 'obj/tree/0', raster: oakTree(), anchor: { x: 24, y: 60 } });
  frames.push({ name: 'obj/tree/1', raster: pineTree(), anchor: { x: 24, y: 60 } });
  frames.push({ name: 'obj/tree/2', raster: deadTree(), anchor: { x: 24, y: 60 } });
  frames.push({ name: 'obj/stump', raster: stump(), anchor: { x: 12, y: 16 } });
  for (let v = 0; v < 2; v++) {
    frames.push({ name: `obj/gold/${v}`, raster: mine('gold', v), anchor: { x: 28, y: 32 } });
    frames.push({ name: `obj/stone/${v}`, raster: mine('stone', v), anchor: { x: 28, y: 32 } });
  }
  frames.push({ name: 'obj/berries', raster: berryBush(), anchor: { x: 20, y: 28 } });
  for (let stage = 0; stage <= 4; stage++) {
    frames.push({
      name: `obj/farm/${stage}`,
      raster: farmStage(stage),
      anchor: { x: FARM_W / 2, y: FARM_H / 2 + FARM_TOP },
    });
  }

  for (const style of [SHEEP, DEER, WOLF]) {
    const anims = [...ANIMAL_ANIMS];
    if (style.id === 'wolf') {
      anims.splice(2, 0, { anim: 'attack', frames: 4 });
      impactFrames['obj/wolf/attack'] = 2;
    }
    for (const { anim, frames: count } of anims) {
      for (let dir = 0 as Facing; dir <= 4; dir++) {
        for (let f = 0; f < count; f++) {
          frames.push({
            name: `obj/${style.id}/${anim}/${dir}/${f}`,
            raster: drawAnimal(style, anim, dir as Facing, f),
            anchor: { x: 16, y: 28 },
          });
        }
      }
    }
  }

  return { frames, impactFrames };
}
