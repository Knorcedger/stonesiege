// Shared sprite rigs (ART_BIBLE §6): a parameterized humanoid walk/attack/die
// engine shared by all 20+ humanoid units, a mounted (horse) rig for cavalry,
// an iso-box helper for the siege machine rigs, and the frame trim helper that
// crops canvases to content so the whole units atlas stays inside the
// contract's single 2048×2048 texture budget.
// Erasable syntax only (runs under Node type stripping).

import { Raster } from './raster.ts';
import { PALETTE, MASK } from './palette.ts';
import type { RGB } from './palette.ts';

const P = PALETTE;
const M = MASK;

export type Dir = 0 | 1 | 2 | 3 | 4; // S SW W NW N (authored; renderer mirrors 5-7)
export const DIRS: readonly Dir[] = [0, 1, 2, 3, 4];

/** Screen-space facing vector per authored dir (dir 0 = toward camera = down). */
export const FACE: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1],
];

export const sideView = (dir: Dir): boolean => dir === 1 || dir === 2 || dir === 3;
export const awayView = (dir: Dir): boolean => dir === 3 || dir === 4;

// ---------------------------------------------------------------- trim

/** Crop a frame to its non-transparent bbox, shifting the anchor to match. */
export function trimFrame(
  raster: Raster,
  anchor: { x: number; y: number },
): { raster: Raster; anchor: { x: number; y: number } } {
  let x0 = raster.width;
  let y0 = raster.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      if (raster.alphaAt(x, y) > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { raster: new Raster(2, 2), anchor: { x: 1, y: 1 } };
  const out = new Raster(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [r, g, b, a] = raster.get(x, y);
      if (a > 0) out.set(x - x0, y - y0, [r, g, b], a);
    }
  }
  return { raster: out, anchor: { x: anchor.x - x0, y: anchor.y - y0 } };
}

/** Replace mask-ramp pixels with the undyed cloth ramp (decay frames lose team color). */
export function stripMask(r: Raster): void {
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const [pr, pg, pb, pa] = r.get(x, y);
      if (pa === 0) continue;
      if (pr === 255 && pg === 0 && pb === 255) r.set(x, y, P.clothLight);
      else if (pr === 204 && pg === 0 && pb === 204) r.set(x, y, P.clothBase);
      else if (pr === 153 && pg === 0 && pb === 153) r.set(x, y, P.clothDark);
    }
  }
}

/** Pixel-dropout decay from a corpse frame: keep 50%/25%/sparse + bone pixels. */
export function decayFrom(corpse: Raster, frame: number, cx: number, groundY: number): Raster {
  const r = corpse.clone();
  stripMask(r);
  const keep: 50 | 25 = frame === 0 ? 50 : 25;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      if (r.alphaAt(x, y) === 255 && !Raster.ditherOn(x, y, keep)) r.clear(x, y);
      if (frame === 2 && r.alphaAt(x, y) === 255 && !Raster.ditherOn(x, y + 1, 50)) r.clear(x, y);
    }
  }
  if (frame >= 1) {
    // rib-cage / long-bone hints
    r.line(cx - 4, groundY - 3, cx + 3, groundY - 3, P.stonePale);
    r.set(cx - 2, groundY - 4, P.stonePale);
    r.set(cx + 1, groundY - 4, P.stonePale);
    r.set(cx - 6, groundY - 2, P.stonePale);
    r.set(cx + 5, groundY - 2, P.stonePale);
  }
  return r;
}

// ---------------------------------------------------------------- humanoid rig

export type WeaponKind =
  | 'sword' | 'longsword' | 'spear' | 'pike' | 'bow' | 'longbow' | 'crossbow'
  | 'javelin' | 'axe2h' | 'staff' | 'tool' | 'none';

export interface HumanSpec {
  id: string;
  /** feet→head height in px (24–30 per contract). */
  height: number;
  torsoW: number;
  /** torso cloth [lit, base] — may be mask tones for team-heavy roles. */
  tunic: readonly [RGB, RGB];
  legsC: RGB;
  helmet: 'none' | 'cap' | 'helm' | 'helmLight' | 'hood' | 'brim' | 'monk';
  capC?: RGB;
  plumeMask?: boolean;
  weapon: WeaponKind;
  shield?: 'round' | 'buckler' | 'kite' | 'none';
  /** mask surcoat band rows at the waist (player-color carrier seen from every dir). */
  sashRows: number;
  kilt?: boolean;
  robe?: boolean;
  /** 0 cloth, 1 metal accents, 2 full metal sheen. */
  metal: 0 | 1 | 2;
  glint?: boolean;
  quiver?: boolean;
  hunch?: boolean; // villager
}

export const HUMAN_W = 48;
export const HUMAN_H = 48;
export const HUMAN_GY = 43; // ground line; anchor (24, 44)

export type HumanAnim = 'idle' | 'walk' | 'attack' | 'gather' | 'carry' | 'die' | 'decay';

interface Skel {
  cx: number;
  footY: number;
  hipY: number;
  shoulderY: number;
  headX: number;
  headY: number; // head center
  lean: number; // torso x shift
  fx: number;
  fy: number;
}

// One walk cycle: contacts on frames 0 and 3, passings between them.
// `WALK_STRIDE` is the near leg's dx; the far leg mirrors it, so the pair is
// never closer than 2 px and never has to be nudged apart.
const WALK_STRIDE = [3, 1, -1, -3, -1, 1];
// The horizontal swing alone is a palindrome (frames 1/5 and 2/4 share a stride
// magnitude). The lifts are in quadrature with it — each leg leaves the ground
// only while it is swinging through — which is what makes all six poses
// distinct and what makes the cycle read as a gait instead of a pendulum.
const WALK_LIFT_NEAR = [0, 0, 0, 0, 2, 1];
const WALK_LIFT_FAR = [0, 2, 1, 0, 0, 0];
/** Front/back: legs apart at the contacts, together as they pass. */
const WALK_SPREAD = [1, 0, 0, 1, 0, 0];
/**
 * Hips sway onto the foot taking the weight and stay there for that whole
 * stance, releasing to centre as the weight transfers. Sums to zero over the
 * cycle, so the body still tracks the simulation and not the sprite.
 */
const WALK_SWAY = [1, 1, 0, -1, -1, 0];
/**
 * Front/back leg shortening, in px off the ground line. Facing the camera a
 * stride has almost no horizontal component, so the gait has to read out of
 * foot HEIGHT: in iso a foot planted forward sits low on screen, one planted
 * behind sits high, and a swinging foot is higher still — then drops fast as it
 * plants. `R` is `L` half a cycle later, and no entry equals its own half-cycle
 * partner, which is what keeps all six (left, right) pairs distinct.
 */
const WALK_FRONT_DROP_L = [0, 1, 2, 3, 4, 1];
const WALK_FRONT_DROP_R = [3, 4, 1, 0, 1, 2];
/** Body sits lowest at each contact and rises over the straight stance leg. */
const WALK_BOB = [0, -1, -1, 0, -1, -1];

function skeleton(spec: HumanSpec, anim: HumanAnim, dir: Dir, frame: number): Skel {
  const [fx, fy] = FACE[dir];
  const h = spec.height;
  const legLen = Math.round(h * 0.34);
  const torsoH = Math.round(h * 0.42);
  let bob = 0;
  let hipBob = 0;
  let lean = 0;
  if (anim === 'walk' || anim === 'carry') {
    // Carry the bob on the HIPS, not just the shoulders: raising the shoulders
    // alone stretched and squashed the torso by a pixel each frame instead of
    // lifting the body over the stance leg, which is what made the old cycle
    // look like it was vibrating rather than walking.
    hipBob = WALK_BOB[frame];
  }
  if (anim === 'idle') bob = frame === 1 ? -1 : 0;
  if (anim === 'attack' || anim === 'gather') {
    const shift = anim === 'attack' ? [-1, -1, 2, 1, 0][frame] : [-1, -1, 2, 0][frame];
    lean = fx * shift;
    bob = [0, -1, 0, 0, 0][frame] ?? 0;
  }
  const footY = HUMAN_GY;
  const hipY = footY - legLen + hipBob;
  const shoulderY = hipY - torsoH + bob + (spec.hunch ? 1 : 0);
  // hunched roles carry the head low + forward; everyone else gets a 1px neck gap
  const headY = shoulderY - (spec.hunch ? 3 : 4);
  return {
    cx: 24,
    footY,
    hipY,
    shoulderY,
    headX: 24 + lean + fx * (spec.hunch ? 2 : 1),
    headY,
    lean,
    fx,
    fy,
  };
}

function paintTorso(r: Raster, s: Skel, spec: HumanSpec): void {
  const hw = Math.floor(spec.torsoW / 2);
  const cx = s.cx + s.lean;
  const pts: Array<readonly [number, number]> = [
    [cx - hw, s.shoulderY],
    [cx + hw + 1, s.shoulderY],
    [cx + hw, s.hipY + 1],
    [cx - hw + 1, s.hipY + 1],
  ];
  const [lit, base] = spec.metal === 2 ? [P.metalLight, P.metalBase] as const : spec.tunic;
  r.fillPoly(pts, base);
  // top-left light column
  for (let y = s.shoulderY; y <= s.hipY; y++) {
    if (r.alphaAt(cx - hw + 1, y) === 255) r.set(cx - hw + 1, y, lit);
    if (y === s.shoulderY && r.alphaAt(cx - hw + 2, y) === 255) r.set(cx - hw + 2, y, lit);
  }
  if (spec.metal === 1) {
    // shoulder plates
    r.set(cx - hw + 1, s.shoulderY, P.metalBase);
    r.set(cx + hw - 1, s.shoulderY, P.metalBase);
    r.set(cx - hw, s.shoulderY + 1, P.metalDark);
  }
  // masked surcoat band at the waist (visible from every direction)
  for (let row = 0; row < spec.sashRows; row++) {
    const y = s.hipY - row;
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
      if (r.alphaAt(x, y) !== 255) continue;
      r.set(x, y, x <= cx - 1 ? M.light : x >= cx + 2 ? M.dark : M.mid);
    }
  }
  // collar band under the shoulders keeps team color readable in every pose
  if (spec.sashRows >= 2) {
    const y = s.shoulderY + 1;
    for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
      if (r.alphaAt(x, y) !== 255) continue;
      r.set(x, y, x <= cx - 1 ? M.light : x >= cx + 2 ? M.dark : M.mid);
    }
  }
  if (spec.kilt) {
    // 2×2 check kilt below the waist
    for (let y = s.hipY + 1; y <= s.hipY + 3; y++) {
      for (let x = cx - hw; x <= cx + hw; x++) {
        const on = ((x >> 1) + (y >> 1)) % 2 === 0;
        r.set(x, y, on ? M.mid : P.clothDark);
      }
    }
    // shoulder plaid patch
    r.set(cx - hw + 1, s.shoulderY + 1, M.light);
    r.set(cx - hw + 2, s.shoulderY + 1, M.mid);
    r.set(cx - hw + 1, s.shoulderY + 2, M.mid);
  }
}

function paintHead(r: Raster, s: Skel, spec: HumanSpec, dir: Dir): void {
  const hx = s.headX;
  const hy = s.headY;
  const away = awayView(dir);
  // rounded 4–5px head (§6.1): skin circle + top-left skinLight + skinShadow jaw
  r.fillEllipse(hx, hy, 2, 2, away ? P.skinShadow : P.skinBase);
  if (!away) {
    r.set(hx - 1, hy - 1, P.skinLight);
    r.set(hx, hy - 1, P.skinLight);
    r.set(hx - 1, hy, P.skinLight);
    r.set(hx + 1, hy + 1, P.skinShadow);
  }
  // 1px skinShadow neck ties the head to the shoulders (kills the floating-block read)
  r.set(hx, hy + 2, P.skinShadow);
  r.set(hx, hy + 3, P.skinShadow);
  switch (spec.helmet) {
    case 'cap': {
      const c = spec.capC ?? M.mid;
      r.fillRect(hx - 2, hy - 2, 5, 2, c);
      r.fillRect(hx - 1, hy - 3, 3, 1, c); // rounded crown
      r.set(hx - 2, hy - 2, spec.capC ? spec.capC : M.light);
      r.set(hx - 1, hy - 3, spec.capC ? spec.capC : M.light);
      break;
    }
    case 'helm':
    case 'helmLight': {
      const c = spec.helmet === 'helm' ? P.metalBase : P.metalLight;
      r.fillRect(hx - 2, hy - 2, 5, 2, c);
      r.fillRect(hx - 1, hy - 3, 3, 1, c); // domed crown
      r.set(hx - 2, hy - 1, c);
      r.set(hx + 2, hy - 1, c);
      if (dir === 0) r.set(hx, hy, P.metalDark); // nasal bar
      if (spec.glint) r.set(hx - 1, hy - 3, P.highlight);
      break;
    }
    case 'hood': {
      r.fillRect(hx - 2, hy - 2, 5, 3, P.clothDark);
      r.fillRect(hx - 1, hy - 3, 3, 1, P.clothDark); // rounded hood crown
      r.set(hx - 2, hy - 2, M.mid);
      r.set(hx - 1, hy - 2, M.mid);
      r.set(hx - 1, hy - 3, M.mid);
      r.set(hx, hy - 3, M.mid);
      if (!away) r.fillRect(hx - 1, hy, 3, 2, P.skinShadow); // shaded face
      break;
    }
    case 'monk': {
      r.fillRect(hx - 2, hy - 2, 5, 3, P.clothDark);
      r.fillRect(hx - 1, hy - 3, 3, 1, P.clothDark);
      if (!away) r.fillRect(hx - 1, hy, 3, 2, P.skinBase);
      break;
    }
    case 'brim': {
      r.fillRect(hx - 3, hy - 1, 7, 1, P.clothDark); // wide leather brim
      r.fillRect(hx - 1, hy - 2, 3, 1, P.clothDark);
      r.set(hx - 3, hy - 1, M.mid); // headband tick
      break;
    }
    default:
      // bare head: hair cap of woodDark pixels so the skull reads round, not square
      if (!away) {
        r.fillRect(hx - 1, hy - 2, 3, 1, P.woodDark);
        r.set(hx - 2, hy - 1, P.woodDark);
      } else {
        r.fillRect(hx - 1, hy - 2, 3, 2, P.woodDark);
      }
  }
  if (spec.plumeMask) {
    r.set(hx, hy - 4, M.light);
    r.set(hx - s.fx, hy - 5, M.mid);
  }
}

/** Far-leg shade one ramp step below the leg color (mirrors the §6.1 horse rule). */
function legShade(c: RGB): RGB {
  if (c === P.clothDark) return P.woodDark;
  if (c === P.woodDark) return P.uiWoodDark;
  if (c === P.metalDark) return P.slateDark;
  if (c === P.skinBase) return P.skinShadow;
  return P.woodDark;
}

function paintLegs(r: Raster, s: Skel, spec: HumanSpec, dir: Dir, anim: HumanAnim, frame: number): void {
  if (spec.robe) return; // monk cone hides legs
  const walkish = anim === 'walk' || anim === 'carry';
  const h = s.footY - s.hipY + 1;
  const far = legShade(spec.legsC);
  // NOTE: an isolated 2px column is fully consumed by the §7.2 outline pass
  // (both pixels border transparency). Legs therefore always paint a dark
  // filler between the two columns so each keeps a visible core color, and
  // the pair never collapses into one outline-black post.
  if (sideView(dir)) {
    // Mirrored about the hip so the pair is always >=2 px apart: the old rig
    // offset the near leg by a fixed -2, which collided at the passing frames
    // and had to teleport the far leg to the wrong side of the body.
    const stride = walkish ? WALK_STRIDE[frame] : 0;
    const nearX = s.cx + s.lean - 1 + stride;
    const farX = s.cx + s.lean - 1 - stride;
    const nearLift = walkish ? WALK_LIFT_NEAR[frame] : 0;
    const farLift = walkish ? WALK_LIFT_FAR[frame] : 0;
    const lo = Math.min(nearX, farX);
    const hi = Math.max(nearX, farX);
    r.fillRect(lo, s.hipY, hi - lo + 2, h - 1, far); // hull filler (feet row stays split)
    r.fillRect(farX, s.hipY, 2, h - farLift, far);
    r.fillRect(nearX, s.hipY, 2, h - nearLift, spec.legsC);
  } else {
    // Front/back: the legs scissor apart at the contacts and pass close
    // together. The hips also sway a pixel onto whichever foot is taking the
    // weight, which is what separates the two contact frames — without it the
    // front-facing cycle was two poses strobing at 10 fps.
    const spread = walkish ? WALK_SPREAD[frame] : 0;
    const sway = walkish ? WALK_SWAY[frame] : 0;
    const dropL = walkish ? WALK_FRONT_DROP_L[frame] : 0;
    const dropR = walkish ? WALK_FRONT_DROP_R[frame] : 0;
    const cx = s.cx + s.lean + sway;
    // Filler spans the hip, so a scissored leg never becomes an isolated 2 px
    // column (the §7.2 outline pass eats those down to a black post). Both legs
    // keep the lit leg tone: shading one of them turned the whole lower body
    // into one dark slab at game scale.
    r.fillRect(cx - 2 - spread, s.hipY, 3 + 2 * spread, h - 2, far);
    r.fillRect(cx - 3 - spread, s.hipY, 2, Math.max(2, h - dropL), spec.legsC);
    r.fillRect(cx + 1 + spread, s.hipY, 2, Math.max(2, h - dropR), spec.legsC);
  }
}

/**
 * Robed roles hide their legs, so a walk has to read out of the hem: the skirt
 * swings onto the weighted foot and each corner lifts as the leg under it swings
 * through. Without this the monk's six-frame walk was the torso bob alone —
 * two poses, four of them byte-identical.
 */
function paintRobe(
  r: Raster,
  s: Skel,
  spec: HumanSpec,
  hemDx = 0,
  hemLiftL = 0,
  hemLiftR = 0,
): void {
  const cx = s.cx + s.lean;
  const hemY = s.footY + 1;
  r.fillPoly(
    [
      [cx - 2, s.shoulderY],
      [cx + 3, s.shoulderY],
      [cx + 5 + hemDx, hemY - hemLiftR],
      [cx - 4 + hemDx, hemY - hemLiftL],
    ],
    P.clothBase,
  );
  for (let y = s.shoulderY; y <= s.footY; y++) {
    const t = (y - s.shoulderY) / (s.footY - s.shoulderY);
    const xl = Math.round(cx - 2 - 2 * t + hemDx * t);
    const xr = Math.round(cx + 3 + 2 * t + hemDx * t);
    if (r.alphaAt(xl + 1, y) === 255) r.set(xl + 1, y, P.clothLight);
    if (r.alphaAt(xr - 1, y) === 255 && Raster.ditherOn(xr, y, 50)) r.set(xr - 1, y, P.clothDark);
  }
  // masked sash trim (quiet, §9.4 monk band)
  const wy = s.shoulderY + Math.round((s.footY - s.shoulderY) * 0.45);
  for (let row = 0; row < 2; row++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      if (r.alphaAt(x, wy + row) === 255) {
        r.set(x, wy + row, x < cx ? M.light : x > cx + 1 ? M.dark : M.mid);
      }
    }
  }
}

function weaponPhase(anim: HumanAnim, frame: number): 'rest' | 'back' | 'strike' | 'follow' {
  if (anim === 'attack') return (['back', 'back', 'strike', 'follow', 'rest'] as const)[frame];
  if (anim === 'gather') return (['back', 'back', 'strike', 'rest'] as const)[frame];
  return 'rest';
}

function paintWeapon(
  r: Raster,
  s: Skel,
  spec: HumanSpec,
  dir: Dir,
  anim: HumanAnim,
  frame: number,
): void {
  const kind = anim === 'carry' ? 'none' : anim === 'gather' ? 'tool' : spec.weapon;
  if (kind === 'none') return;
  const phase = weaponPhase(anim, frame);
  const cx = s.cx + s.lean;
  const { fx, fy } = s;
  const side = sideView(dir);
  // grip hand position
  const gx = cx + (side ? fx * 3 : -3);
  const gy = s.shoulderY + 3;
  const blade = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    r.line(x0, y0, x1, y1, c);
  };
  switch (kind) {
    case 'sword':
    case 'longsword': {
      const L = kind === 'sword' ? 7 : 9;
      if (phase === 'rest') blade(gx, gy, gx + fx * 2 - (side ? 0 : 1), gy - L, P.metalLight);
      else if (phase === 'back') blade(gx, gy, gx - fx * 3 - (side ? 0 : 2), gy - L + 1, P.metalLight);
      else if (phase === 'strike') {
        blade(gx, gy - 1, gx + fx * L, gy - 1 + fy * Math.ceil(L / 2), P.metalLight);
        r.set(gx + fx * L, gy - 1 + fy * Math.ceil(L / 2), P.highlight);
      } else blade(gx, gy, gx + fx * (L - 2), gy + 2, P.metalLight);
      r.set(gx, gy, P.goldBase); // hilt
      break;
    }
    case 'spear':
    case 'pike': {
      const over = kind === 'spear' ? 8 : 12;
      const topY = s.headY - 2 - over;
      if (phase === 'strike') {
        const sxq = gx - fx * 4;
        blade(sxq, gy + 1, gx + fx * 11, gy + 1 + fy * 4, P.woodPale);
        r.set(gx + fx * 11, gy + 1 + fy * 4, P.metalLight);
      } else {
        const dxp = phase === 'back' ? -fx * 2 : 0;
        blade(gx + dxp, s.footY - 1, gx + dxp, topY, P.woodPale);
        r.set(gx + dxp, topY, P.metalLight);
        r.set(gx + dxp, topY + 1, P.metalLight);
        // pennon strip below the head
        r.set(gx + dxp + 1, topY + 2, M.light);
        r.set(gx + dxp + 2, topY + 2, M.mid);
        r.set(gx + dxp + 1, topY + 3, M.mid);
        r.set(gx + dxp + 2, topY + 3, M.dark);
        r.set(gx + dxp + 1, topY + 4, M.dark);
      }
      break;
    }
    case 'bow':
    case 'longbow': {
      const tall = kind === 'longbow';
      const bx = cx + (side ? fx * 5 : -5);
      const top = tall ? s.headY - 6 : s.headY - 2;
      const bot = tall ? s.hipY + 5 : s.hipY + 2;
      const mid = Math.round((top + bot) / 2);
      const bow = P.woodPale;
      const bulge = side ? fx * 2 : -2;
      // 2px-thick arc (§6.2): a 1px arc is fully eaten by the outline pass
      const o = side ? fx : -1; // thickness offset toward the bulge
      for (const dx of [0, o]) {
        blade(bx + dx, top, bx + bulge + dx, mid - 2, bow);
        blade(bx + bulge + dx, mid - 2, bx + bulge + dx, mid + 2, bow);
        blade(bx + bulge + dx, mid + 2, bx + dx, bot, bow);
      }
      if (phase === 'back') {
        blade(bx, top, gx - fx * 2, gy, P.highlight);
        blade(bx, bot, gx - fx * 2, gy, P.highlight);
        blade(gx - fx * 2, gy, bx + bulge + fx, mid, P.woodBase); // nocked arrow
      } else if (phase === 'strike') {
        blade(bx, top, bx, bot, P.highlight); // string released
      } else {
        blade(bx, top, bx, bot, P.highlight);
      }
      break;
    }
    case 'crossbow': {
      // horizontal T held at chest height
      const sx0 = cx + (side ? -fx * 2 : -4);
      const sy0 = gy + (phase === 'back' ? 1 : 0);
      const len = 7;
      blade(sx0, sy0, sx0 + (side ? fx * len : len), sy0 + (side ? fy * 2 : 0), P.woodBase);
      const tx = sx0 + (side ? fx * (len - 1) : len - 1);
      const ty = sy0 + (side ? fy * 2 : 0);
      blade(tx + (side ? fy : 0) * 3, ty - (side ? fx : -1) * 0 - 3, tx - (side ? fy : 0) * 3, ty + 3, P.metalLight);
      break;
    }
    case 'javelin': {
      const jy = s.shoulderY - 2;
      if (phase === 'strike') {
        blade(cx + fx * 2, jy + fy * 2, cx + fx * 9, jy + fy * 5, P.woodBase);
      } else if (phase !== 'follow') {
        blade(cx - fx * 3, jy - 1, cx + fx * 5, jy - 2, P.woodBase);
        r.set(cx + fx * 5, jy - 2, P.metalLight);
      }
      break;
    }
    case 'axe2h': {
      if (phase === 'strike') {
        blade(cx - fx * 2, gy + 2, cx + fx * 9, gy - 1, P.woodBase);
        r.fillRect(cx + fx * 9 - 1, gy - 3, 3, 2, P.metalLight);
      } else if (phase === 'back') {
        blade(cx - fx * 2, gy + 3, cx + fx * 3, s.headY - 6, P.woodBase);
        r.fillRect(cx + fx * 3 - 1, s.headY - 8, 3, 2, P.metalLight);
      } else if (side) {
        blade(cx - fx * 4, s.hipY + 2, cx + fx * 4, s.shoulderY - 1, P.woodBase);
        r.fillRect(cx + fx * 4 - 1, s.shoulderY - 3, 3, 2, P.metalLight);
        r.set(cx + fx * 4 - 1, s.shoulderY - 3, P.metalDark);
      } else {
        blade(cx - 4, s.hipY + 2, cx + 4, s.shoulderY - 1, P.woodBase);
        r.fillRect(cx + 3, s.shoulderY - 3, 3, 2, P.metalLight);
        r.set(cx + 3, s.shoulderY - 3, P.metalDark);
      }
      break;
    }
    case 'staff': {
      const sx0 = cx + (side ? -fx * 3 : 4);
      if (phase === 'strike' || phase === 'back') {
        blade(sx0, s.footY - 2, sx0 + fx, s.headY - 6, P.woodBase);
        r.set(sx0 + fx, s.headY - 7, P.goldShine);
        if (phase === 'strike') {
          // conversion spark orbit
          r.set(s.headX - 3, s.headY - 3, P.goldShine);
          r.set(s.headX + 3, s.headY - 2, P.goldShine);
        } else if (frame % 2 === 1) {
          r.set(s.headX + 2, s.headY - 4, P.goldShine);
        }
      } else {
        blade(sx0, s.footY, sx0, s.headY - 3, P.woodBase);
        r.set(sx0, s.headY - 4, P.goldShine);
      }
      break;
    }
    case 'tool': {
      // villager hatchet — over the shoulder at rest, swung for gather
      if (phase === 'strike') {
        blade(cx, gy + 1, cx + fx * 7, gy + 3 + fy * 2, P.woodBase);
        r.fillRect(cx + fx * 7 - 1, gy + 2 + fy * 2, 2, 2, P.metalBase);
      } else if (phase === 'back') {
        blade(cx, gy + 1, cx + fx * 2, s.headY - 5, P.woodBase);
        r.fillRect(cx + fx * 2 - 1, s.headY - 7, 2, 2, P.metalBase);
      } else {
        // rest: shaft slung diagonally over the shoulder, head clear of the
        // silhouette in EVERY dir (front/back views previously drew it as a
        // vertical line hidden inside the body — §6.2 signature was invisible)
        const sxd = side ? -fx : 1; // shoulder side the shaft leans over
        blade(cx - sxd * 1, gy + 2, cx - sxd * 6, s.headY - 5, P.woodBase);
        r.fillRect(cx - sxd * 6 - 1, s.headY - 7, 3, 2, P.metalBase);
        r.set(cx - sxd * 6 - 1, s.headY - 7, P.metalLight);
      }
      break;
    }
  }
}

function paintShield(r: Raster, s: Skel, spec: HumanSpec, dir: Dir): void {
  if (!spec.shield || spec.shield === 'none') return;
  const cx = s.cx + s.lean;
  const ty = s.shoulderY + 4;
  const round = spec.shield !== 'buckler';
  const rr = round ? 4 : 2; // round shield is a real mass (§6.2), buckler stays small
  // off-hand side: opposite the weapon for side views, screen-right for front,
  // slung on the back for away views.
  const off = round ? 5 : 4;
  const sx = awayView(dir) ? cx + 2 : sideView(dir) ? cx - s.fx * off : cx + off;
  const sy = awayView(dir) ? s.shoulderY + 3 : ty;
  // wide wood rim, masked face core sized to keep the 8–20% coverage band
  r.fillEllipse(sx, sy, rr, rr, P.woodBase);
  r.fillEllipse(sx, sy, rr - (round ? 2 : 1), rr - (round ? 2 : 1), M.mid);
  if (round) {
    r.set(sx - 1, sy - 1, M.light);
    r.set(sx - 2, sy - 2, P.woodPale); // lit rim
    r.set(sx - 3, sy - 1, P.woodPale);
    r.set(sx + 2, sy + 2, P.woodDark);
    r.set(sx + 3, sy + 1, P.woodDark);
    r.set(sx + 1, sy + 3, P.woodDark);
  }
  r.set(sx, sy, P.metalDark); // boss
}

function paintQuiver(r: Raster, s: Skel, dir: Dir): void {
  const cx = s.cx + s.lean;
  const qx = awayView(dir) ? cx - 2 : cx - (sideView(dir) ? s.fx * 3 : -3);
  const qy = s.shoulderY - 1;
  r.fillRect(qx, qy, 2, 4, M.dark);
  r.set(qx, qy, M.mid);
  r.set(qx, qy - 1, P.woodPale);
  r.set(qx + 1, qy - 2, P.woodPale);
}

function paintCarrySack(r: Raster, s: Skel): void {
  const cx = s.cx + s.lean;
  const sx = cx - s.fx * 2;
  const sy = s.shoulderY - 2;
  r.fillEllipse(sx, sy, 3, 2, P.clothBase);
  r.set(sx - 1, sy - 1, P.clothLight);
  r.set(sx + 2, sy + 1, P.clothDark);
}

function drawHumanDowned(spec: HumanSpec, dir: Dir, frame: number): Raster {
  const r = new Raster(HUMAN_W, HUMAN_H);
  const cx = 24;
  const [fx] = FACE[dir];
  const bx = fx === 0 ? (dir === 0 ? -1 : 1) : -fx; // fall direction (opposite facing)
  r.dropShadow(cx, HUMAN_GY, 8, 2);
  if (frame === 0 || frame === 1) {
    // recoil / knees fold — reuse the standing rig shifted down
    const s = skeleton(spec, 'idle', dir, 0);
    const drop = frame === 0 ? 1 : 3;
    const sk: Skel = { ...s, hipY: s.hipY + drop, shoulderY: s.shoulderY + drop + (frame === 1 ? 1 : 0), headY: s.headY + drop + (frame === 1 ? 2 : 0), lean: bx * (frame + 1), headX: s.headX + bx * (frame + 1) };
    if (spec.robe) paintRobe(r, sk, spec);
    else {
      paintLegs(r, sk, spec, dir, 'idle', 0);
      // +1 sash row in the frame-0 recoil keeps team color in the 8–20% band
      // (the extended weapon adds opaque pixels that pose wouldn't otherwise
      // have); frame 1 drops the weapon, so the bonus row would overshoot 20%
      paintTorso(r, sk, { ...spec, sashRows: spec.sashRows + (frame === 0 ? 1 : 0) });
    }
    paintHead(r, sk, spec, dir);
    if (frame === 0) paintWeapon(r, sk, spec, dir, 'idle', 0);
  } else if (frame === 2) {
    // falling diagonal
    const hipX = cx;
    const hipY = HUMAN_GY - 4;
    r.fillPoly(
      [
        [hipX - 2, hipY + 3],
        [hipX + 2, hipY + 2],
        [hipX + bx * 6 + 2, hipY - 5],
        [hipX + bx * 6 - 2, hipY - 6],
      ],
      spec.tunic[1],
    );
    r.fillRect(hipX - 1, hipY + 2, 2, 4, spec.legsC);
    r.fillRect(hipX + 2, hipY + 3, 2, 3, spec.legsC);
    r.fillEllipse(hipX + bx * 8, hipY - 6, 2, 2, P.skinBase);
  } else {
    // prone / settled
    const flat = frame === 4 ? 1 : 0;
    const by = HUMAN_GY - 2 + flat;
    r.fillEllipse(cx + bx * 2, by, 6, 2, spec.tunic[1]);
    for (let x = cx + bx * 2 - 6; x <= cx + bx * 2 + 6; x++) {
      if (r.alphaAt(x, by - 2) === 255) r.set(x, by - 2, spec.tunic[0]);
    }
    // masked surcoat band across the corpse (team still reads on the ground;
    // monks get a narrower band to stay inside their quiet §9.4 override)
    const bandW = spec.robe ? 2 : 4;
    for (let row = 0; row < (spec.robe ? 1 : 2); row++) {
      for (let dx2 = -bandW; dx2 <= bandW - 1; dx2++) {
        const x = cx + bx * 2 + dx2;
        if (r.alphaAt(x, by - row) === 255) {
          r.set(x, by - row, dx2 < -1 ? M.light : dx2 > 1 ? M.dark : M.mid);
        }
      }
    }
    r.fillEllipse(cx + bx * 9, by - 1 + flat, 2, 1, P.skinBase);
    r.fillRect(cx - bx * 6, by - 1, 4, 1, spec.legsC); // legs
    // weapon detached 2px away
    if (spec.weapon !== 'none' && spec.weapon !== 'tool') {
      r.line(cx - bx * 3, by + 2, cx - bx * 3 + 5, by + 2, spec.weapon === 'bow' || spec.weapon === 'longbow' ? P.woodPale : P.metalLight);
    }
  }
  r.outlinePass();
  return r;
}

export function drawHuman(spec: HumanSpec, anim: HumanAnim, dir: Dir, frame: number): Raster {
  if (anim === 'die') return drawHumanDowned(spec, dir, frame);
  if (anim === 'decay') {
    const corpse = drawHumanDowned(spec, dir, 4);
    return decayFrom(corpse, frame, 24, HUMAN_GY);
  }
  const r = new Raster(HUMAN_W, HUMAN_H);
  const s = skeleton(spec, anim, dir, frame);
  r.dropShadow(24, HUMAN_GY, 6, 2);
  const behindWeapon = awayView(dir); // weapon behind body when facing away
  if (behindWeapon) paintWeapon(r, s, spec, dir, anim, frame);
  if (spec.robe) {
    const walkish = anim === 'walk' || anim === 'carry';
    paintRobe(
      r, s, spec,
      walkish ? WALK_SWAY[frame] : 0,
      walkish ? Math.min(2, WALK_FRONT_DROP_L[frame]) : 0,
      walkish ? Math.min(2, WALK_FRONT_DROP_R[frame]) : 0,
    );
  } else {
    paintLegs(r, s, spec, dir, anim, frame);
    paintTorso(r, s, spec);
  }
  paintHead(r, s, spec, dir);
  if (!behindWeapon) paintWeapon(r, s, spec, dir, anim, frame);
  paintShield(r, s, spec, dir);
  if (spec.quiver) paintQuiver(r, s, dir);
  if (anim === 'carry') paintCarrySack(r, s);
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- horse rig

export interface CavSpec {
  id: string;
  coat: 'bay' | 'dun';
  caparison: boolean; // knight line masked cloth
  blanket: boolean; // scout line masked saddle blanket
  riderMetal: 0 | 1 | 2;
  plumeMask?: boolean;
  kite?: boolean;
}

export const CAV_W = 64;
export const CAV_H = 56;
export const CAV_GY = 52;

const CAV_STRIDE = [2, 1, 0, -1, -2, -1, 0, 1]; // 8-frame 4-beat, per-leg phase offset

export type CavAnim = 'idle' | 'walk' | 'attack' | 'die' | 'decay';

function coatColors(coat: 'bay' | 'dun'): { body: RGB; lit: RGB; dark: RGB; legFar: RGB } {
  // §6.1: mane/tail = woodDark for both coats, but the FAR LEG pair is only
  // "one ramp step darker" than the body — dun far legs in woodDark read as
  // detached black sticks under the pale coat (r3-16 deer/giraffe report)
  return coat === 'bay'
    ? { body: P.woodBase, lit: P.woodLight, dark: P.woodDark, legFar: P.woodDark }
    : { body: P.dirtLight, lit: P.dirtPale, dark: P.woodDark, legFar: P.dirtBase };
}

function drawCavDowned(spec: CavSpec, dir: Dir, frame: number): Raster {
  const r = new Raster(CAV_W, CAV_H);
  const cx = 32;
  const [fx] = FACE[dir];
  const bx = fx === 0 ? 1 : -fx;
  const c = coatColors(spec.coat);
  r.dropShadow(cx, CAV_GY, 13, 3);
  if (frame <= 1) {
    // horse rears/buckles
    const drop = frame * 3;
    const cy = CAV_GY - 10 - 5 + drop;
    r.fillEllipse(cx, cy, 10, 5, c.body);
    for (const lx of [cx - 7, cx - 4, cx + 4, cx + 7]) {
      r.fillRect(lx, cy + 3, 2, CAV_GY - cy - 3 - frame, c.dark);
    }
    r.fillEllipse(cx + bx * -11, cy - 5 + frame * 2, 2, 2, c.body); // head drooping
    // rider slumping
    r.fillRect(cx - 2, cy - 9 + frame, 4, 6, spec.caparison ? P.metalBase : P.clothBase);
    r.fillEllipse(cx, cy - 11 + frame, 2, 2, P.skinBase);
  } else {
    const flat = frame === 4 ? 1 : 0;
    const by = CAV_GY - 4 + flat;
    r.fillEllipse(cx, by, 12, 3, c.body);
    for (let x = cx - 11; x <= cx + 11; x++) {
      if (r.alphaAt(x, by - 3) === 255) r.set(x, by - 3, c.lit);
    }
    r.fillEllipse(cx - 13, by - 1, 2, 2, c.body); // head
    r.fillRect(cx + 9, by - 5 - (1 - flat), 1, 3, c.dark); // stiff legs up
    r.fillRect(cx + 6, by - 6 - (1 - flat), 1, 3, c.dark);
    if (spec.caparison) {
      for (let x = cx - 6; x <= cx + 4; x++) {
        if (r.alphaAt(x, by - 1) === 255) r.set(x, by - 1, x < cx - 2 ? M.light : x > cx + 1 ? M.dark : M.mid);
        if (r.alphaAt(x, by) === 255 && x % 2 === 0) r.set(x, by, M.dark);
      }
    }
    // thrown rider beside the horse
    const rx2 = cx + bx * 5;
    const ry2 = by - 6 - flat;
    r.fillEllipse(rx2, ry2, 4, 2, spec.riderMetal >= 1 ? P.metalBase : P.clothBase);
    r.fillEllipse(rx2 + bx * 5, ry2, 1, 1, P.skinBase);
    if (spec.blanket) {
      // blanket band across the fallen horse
      for (let row = 0; row < 3; row++) {
        for (let dx2 = -4; dx2 <= 4; dx2++) {
          if (r.alphaAt(cx + dx2, by - row) === 255) {
            r.set(cx + dx2, by - row, dx2 < -1 ? M.light : dx2 > 1 ? M.dark : M.mid);
          }
        }
      }
    }
  }
  r.outlinePass();
  return r;
}

export function drawCavalry(spec: CavSpec, anim: CavAnim, dir: Dir, frame: number): Raster {
  if (anim === 'die') return drawCavDowned(spec, dir, frame);
  if (anim === 'decay') return decayFrom(drawCavDowned(spec, dir, 4), frame, 32, CAV_GY);

  const r = new Raster(CAV_W, CAV_H);
  const cx = 32;
  const [fx, fy] = FACE[dir];
  const side = sideView(dir);
  const c = coatColors(spec.coat);
  // §6.1 numbers: body ellipse ~18×8 (side), four 2×8 leg columns
  const legLen = 8;
  const ry = side ? 4 : 5;
  const rx = side ? 9 : 6;
  const bob = anim === 'walk' ? [0, -1, -1, 0, 0, -1, -1, 0][frame] : anim === 'idle' && frame === 1 ? -1 : 0;
  const lunge = anim === 'attack' ? [-1, -1, 2, 1, 0][frame] : 0;
  const cy = CAV_GY - legLen - ry + bob;
  const bx0 = cx + fx * lunge;

  r.dropShadow(cx, CAV_GY, side ? 13 : 9, 3);

  const inB = (x: number, y: number) => Raster.inEllipse(x, y, bx0, cy, rx, ry);

  // legs — 2×8 columns (+2px overlap into the body), far pair one ramp step
  // darker, 4-beat cycle. Front/back pairs are ADJACENT (near+far touching):
  // an isolated 2px column is fully consumed by the §7.2 outline pass, so
  // gapped columns rendered as coreless black sticks.
  const legXs = side
    ? [bx0 + fx * (rx - 2), bx0 + fx * (rx - 4), bx0 - fx * (rx - 4), bx0 - fx * (rx - 2)]
    : [bx0 - 6, bx0 - 4, bx0 + 2, bx0 + 4];
  const phases = [0, 4, 2, 6];
  for (let i = 0; i < 4; i++) {
    const stride = anim === 'walk' ? CAV_STRIDE[(frame + phases[i]) % 8] : 0;
    const dx = side ? stride : 0;
    const lift = anim === 'walk' && Math.abs(stride) === 2 ? 1 : 0;
    const far = side ? i === 1 || i === 3 : i === 1 || i === 2;
    r.fillRect(legXs[i] + dx, cy + ry - 2, 2, legLen + 2 - lift, far ? c.legFar : c.body);
  }

  // body
  r.paintWhere(inB, c.body);
  r.paintWhere((x, y) => inB(x, y) && !inB(x - 2, y - 2), c.lit);
  r.paintWhere((x, y) => inB(x, y) && !inB(x + 2, y + 2) && Raster.ditherOn(x, y, 50), c.dark);
  if (!side) {
    // solid chest (dir 0) / rump (dir 4) mass filling the gap between the
    // splayed legs (r3-16: the front frame read as a void between sticks);
    // drawn BEFORE the caparison so the knight's cloth drapes over it
    const low = dir === 0 ? 5 : 4;
    r.fillPoly([[cx - 4, cy - 3], [cx + 4, cy - 3], [cx + 3, cy + low], [cx - 3, cy + low]], c.body);
    for (let y = cy - 3; y <= cy + low - 1; y++) {
      if (r.alphaAt(cx - 3, y) === 255) r.set(cx - 3, y, c.lit); // lit left flank
    }
  }

  const lag = anim === 'walk' ? (frame % 4 < 2 ? 0 : 1) : 0;

  // caparison / blanket (after legs+body, hem at mid-leg; §6.1 layer order —
  // the neck/head block above paints AFTER this so the head clears the cloth)
  if (spec.caparison) {
    if (side) {
      const hem = cy + ry + 3;
      for (let y = cy + 1; y <= hem; y++) {
        const hw = y <= cy + ry ? 0 : y - (cy + ry);
        for (let x = bx0 - rx + 3 + hw; x <= bx0 + rx - 3 - hw; x++) {
          if (y <= cy + ry && !inB(x, y)) continue;
          r.set(x, y, x < bx0 - 3 ? M.light : x > bx0 + 3 ? M.dark : M.mid);
        }
      }
    } else {
      // front/away: the cloth drapes the whole chest/rump silhouette.
      // Rounded shoulder + 2px hem taper keep the drape inside the 20% §9.4
      // ceiling on the smaller §6.1 horse (walk frames lift legs, shrinking
      // the opaque denominator).
      for (let y = cy; y <= cy + ry + 1; y++) {
        const hw = (y === cy ? 3 : 4) - 2 * Math.max(0, y - (cy + ry));
        for (let x = bx0 - hw; x <= bx0 + hw; x++) {
          if (y <= cy + ry - 1 && !inB(x, y)) continue;
          r.set(x, y, x < bx0 - 1 ? M.light : x > bx0 + 1 ? M.dark : M.mid);
        }
      }
    }
  } else if (spec.blanket) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = bx0 - 5; x <= bx0 + 5; x++) {
        if (inB(x, y)) r.set(x, y, x < bx0 - 2 ? M.light : x > bx0 + 2 ? M.dark : M.mid);
      }
    }
  }

  // neck + head toward facing (over the cloth so the head clears it)
  if (side) {
    // §6.1 neck: a 3px-wide band rising ~45° from the shoulder — 5 steps, so
    // the head sits ON the neck top (the old 6-step neck with the head thrown
    // 2px further forward read as a giraffe at pinch-zoom, r3-16)
    const sx = bx0 + fx * (rx - 3);
    for (let i = 0; i < 5; i++) {
      r.fillRect(sx + fx * i - (fx < 0 ? 2 : 0), cy - 1 - i, 3, 2, c.body);
    }
    // §6.1 head: 4×3 wedge poly (brow high at the neck, muzzle low in front)
    const hx0 = sx + fx * 5;
    const hy0 = cy - 7;
    r.fillPoly(
      [
        [hx0 - fx, hy0 - 1],
        [hx0 + fx * 3, hy0],
        [hx0 + fx * 4, hy0 + 2],
        [hx0 - fx, hy0 + 2],
      ],
      c.body,
    );
    r.set(hx0, hy0 - 2, c.dark); // 1px ear
    r.set(hx0 + fx * 4, hy0 + 2, spec.coat === 'dun' ? c.lit : c.dark); // muzzle
    // mane crest polyline along the back of the neck (1px walk lag)
    r.line(sx + fx, cy - 2, sx + fx * 5, cy - 6 - lag, c.dark);
    // chest bulge under the neck root ties neck to body
    r.fillRect(bx0 + fx * (rx - 1) - (fx < 0 ? 1 : 0), cy - 1, 2, 4, c.body);
    // tail streams behind
    const tx = bx0 - fx * rx;
    r.line(tx, cy - 1, tx - fx * 4, cy + 3 + lag, c.dark);
    r.line(tx, cy, tx - fx * 3, cy + 5 + lag, c.dark);
  } else if (dir === 0) {
    // facing camera: hanging head below the chest mass
    r.fillEllipse(cx, cy + 6, 2, 3, c.body);
    r.set(cx - 2, cy - 2, c.dark);
    r.set(cx + 2, cy - 2, c.dark); // ears
    r.set(cx - 1, cy + 7, c.dark);
    r.set(cx + 1, cy + 7, c.dark); // nostrils
    if (spec.caparison) {
      // chanfron cloth over the brow — the §6.2 "full caparison" front read
      for (let y = cy + 3; y <= cy + 5; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          r.set(x, y, x < cx ? M.light : x > cx ? M.dark : M.mid);
        }
      }
    }
  } else {
    // away: hanging tail over the rump mass
    r.line(cx, cy + 1, cx, cy + 7 + lag, c.dark);
    r.set(cx - 2, cy - ry - 3, c.dark);
    r.set(cx + 2, cy - ry - 3, c.dark); // ear tips beyond the rider
  }

  // saddle + rider
  const seatY = cy - ry;
  r.fillRect(bx0 - 2, seatY - 1, 5, 2, P.woodDark); // saddle
  const rTorso: RGB = spec.riderMetal === 2 ? P.metalLight : spec.riderMetal === 1 ? P.metalBase : P.clothBase;
  const rTorsoDark: RGB = spec.riderMetal >= 1 ? P.metalDark : P.clothDark;
  // rider near leg along the flank (side views)
  if (side) r.fillRect(bx0 - fx * 1, seatY, 2, 5, rTorsoDark);
  // torso — shoulders wider than the waist so the rider reads as a figure,
  // not a featureless column (r3-16); scout line leans forward (§6.2)
  const lean = spec.caparison ? 0 : fx;
  r.fillPoly(
    [
      [bx0 - 3 + lean, seatY - 11],
      [bx0 + 4 + lean, seatY - 11],
      [bx0 + 2, seatY - 1],
      [bx0 - 1, seatY - 1],
    ],
    rTorso,
  );
  if (r.alphaAt(bx0 - 2 + lean, seatY - 10) === 255) {
    r.set(bx0 - 2 + lean, seatY - 10, spec.riderMetal === 2 ? P.highlight : spec.riderMetal === 1 ? P.metalLight : P.clothLight);
  }
  // belt row splits torso from hips
  for (let x = bx0 - 1; x <= bx0 + 2; x++) {
    if (r.alphaAt(x, seatY - 4) === 255) r.set(x, seatY - 4, rTorsoDark);
  }
  // arm reaching toward the lance grip (side + front views)
  if (side) {
    r.line(bx0 + lean + fx, seatY - 9, bx0 + fx * 4, seatY - 6, rTorso);
    r.set(bx0 + fx * 4, seatY - 6, P.skinBase); // hand
  } else if (dir === 0) {
    r.line(bx0 + 3, seatY - 9, bx0 + 4, seatY - 6, rTorso);
    r.set(bx0 + 4, seatY - 6, P.skinBase);
  }
  // §6.1 layered rider: a DISTINCT head pixel-group over a 1px neck —
  // bare skin + hair for the scout line, metal helm for the knight line
  const hx = bx0 + lean + (side ? fx : 0);
  const hy = seatY - 14;
  r.set(hx, hy + 2, P.skinShadow); // neck
  if (spec.riderMetal === 0) {
    r.fillEllipse(hx, hy, 2, 2, awayView(dir) ? P.skinShadow : P.skinBase);
    if (!awayView(dir)) {
      r.set(hx - 1, hy - 1, P.skinLight);
      r.set(hx, hy - 1, P.skinLight);
    }
    r.fillRect(hx - 1, hy - 2, 3, 1, P.woodDark); // hair cap
  } else {
    const helmC: RGB = spec.riderMetal === 2 ? P.metalLight : P.metalBase;
    r.fillEllipse(hx, hy, 2, 2, awayView(dir) ? P.skinShadow : P.skinBase);
    // one wide flat-domed block (a narrow crown gets eaten to a 1px spike by
    // the outline pass); face rows stay skin below the brim
    r.fillRect(hx - 2, hy - 2, 5, 3, helmC);
    r.set(hx + 2, hy, P.metalDark);
    if (dir === 0) r.set(hx, hy + 1, P.metalDark); // nasal bar
    if (spec.riderMetal === 2) r.set(hx - 1, hy - 2, P.highlight); // glint
  }
  if (spec.plumeMask) {
    r.set(hx, hy - 4, M.light);
    r.set(hx - fx, hy - 5, M.mid);
  }
  // lance: straight couched lance for the knight line, short raised lance for
  // scouts — always a straight 2px shaft (a 1px line reads as an antenna)
  const lanceY = seatY - 5;
  if (anim === 'attack') {
    const ext = [0, 0, 3, 2, 0][frame];
    r.line(bx0 - fx * 4, lanceY + 1, bx0 + fx * (12 + ext), lanceY + fy * 3, P.woodPale);
    r.line(bx0 - fx * 4, lanceY + 2, bx0 + fx * (12 + ext), lanceY + fy * 3 + 1, P.woodDark);
    if (frame === 2) r.set(bx0 + fx * (13 + ext), lanceY + fy * 3, P.highlight);
  } else if (spec.caparison) {
    if (side) {
      // butt behind the hip, steel tip ahead of the chest, sloping gently
      // down — held just above the horse's back line so the shaft reads
      // against the grass instead of sinking into the caparison
      r.line(bx0 - fx * 6, seatY - 5, bx0 + fx * 13, seatY - 1, P.woodPale);
      r.line(bx0 - fx * 6, seatY - 4, bx0 + fx * 13, seatY, P.woodDark);
      r.set(bx0 + fx * 14, seatY - 1, P.metalLight);
      r.set(bx0 + fx * 14, seatY, P.metalLight);
    } else {
      r.line(bx0 - 4, lanceY + 4, bx0 - 4, lanceY - 2, P.woodPale);
      r.line(bx0 - 5, lanceY + 4, bx0 - 5, lanceY - 2, P.woodDark);
      r.set(bx0 - 4, lanceY - 3, P.metalLight);
    }
  } else if (side) {
    r.line(bx0 + fx * 2, seatY - 2, bx0 + fx * 7, seatY - 11, P.woodPale);
    r.line(bx0 + fx * 3, seatY - 2, bx0 + fx * 8, seatY - 11, P.woodPale);
    r.set(bx0 + fx * 8, seatY - 12, P.metalLight);
    r.set(bx0 + fx * 7, seatY - 12, P.metalLight);
  } else {
    r.line(bx0 + 4, lanceY + 3, bx0 + 4, lanceY - 4, P.woodPale);
    r.line(bx0 + 5, lanceY + 3, bx0 + 5, lanceY - 4, P.woodDark);
    r.set(bx0 + 4, lanceY - 5, P.metalLight);
  }
  // kite shield on the off side
  if (spec.kite) {
    const sx = awayView(dir) ? bx0 + 3 : side ? bx0 - fx * 4 : bx0 + 4;
    r.fillPoly(
      [
        [sx - 1, seatY - 7],
        [sx + 2, seatY - 7],
        [sx + 1, seatY - 2],
        [sx, seatY - 2],
      ],
      M.mid,
    );
    r.set(sx - 1, seatY - 7, M.light);
    r.set(sx + 1, seatY - 4, M.dark);
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- iso box (machines)

export interface BoxAxes {
  a: readonly [number, number];
  b: readonly [number, number];
}

/** Long/short screen axes for a machine facing `dir` (2:1 iso diagonals). */
export function boxAxes(dir: Dir): BoxAxes {
  const n = 2.236;
  switch (dir) {
    case 0: return { a: [0, 0.55], b: [1, 0] };
    case 1: return { a: [-2 / n, 1 / n], b: [2 / n, 1 / n] };
    case 2: return { a: [-1, 0], b: [0, 0.55] };
    case 3: return { a: [-2 / n, -1 / n], b: [-2 / n, 1 / n] };
    default: return { a: [0, -0.55], b: [1, 0] };
  }
}

export interface BoxMat {
  top: RGB;
  topLit: RGB;
  wallLit: RGB;
  wall: RGB;
  wallDark: RGB;
}

export function pt(
  cx: number,
  cy: number,
  ax: BoxAxes,
  s: number,
  t: number,
  dz: number,
): [number, number] {
  return [cx + ax.a[0] * s + ax.b[0] * t, cy + ax.a[1] * s + ax.b[1] * t - dz];
}

/**
 * Draw an iso box (flat top) sitting on baseY: half-length L along facing,
 * half-width W across, height H. Returns nothing; paint order back→front.
 */
export function isoBox(
  r: Raster,
  cx: number,
  baseY: number,
  dir: Dir,
  L: number,
  W: number,
  H: number,
  mat: BoxMat,
): void {
  const ax = boxAxes(dir);
  const corners: Array<[number, number]> = [
    pt(cx, baseY, ax, L, W, 0),
    pt(cx, baseY, ax, L, -W, 0),
    pt(cx, baseY, ax, -L, -W, 0),
    pt(cx, baseY, ax, -L, W, 0),
  ];
  // walls: draw every face; front faces drawn last (painter's algo by midpoint y)
  const faces: Array<{ i: number; j: number; midY: number; midX: number }> = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push({
      i,
      j,
      midY: (corners[i][1] + corners[j][1]) / 2,
      midX: (corners[i][0] + corners[j][0]) / 2,
    });
  }
  faces.sort((f1, f2) => f1.midY - f2.midY);
  for (const f of faces) {
    const [x0, y0] = corners[f.i];
    const [x1, y1] = corners[f.j];
    const c = f.midX < cx - 1 ? mat.wallLit : f.midY > baseY - 1 ? mat.wall : mat.wallDark;
    r.fillPoly(
      [
        [x0, y0],
        [x1, y1],
        [x1, y1 - H],
        [x0, y0 - H],
      ],
      c,
    );
  }
  const top = corners.map(([x, y]) => [x, y - H] as [number, number]);
  r.fillPoly(top, mat.top);
  // lit strip on the screen-left half of the top
  const minX = Math.min(...top.map((p) => p[0]));
  const maxX = Math.max(...top.map((p) => p[0]));
  const minY = Math.min(...top.map((p) => p[1]));
  const maxY = Math.max(...top.map((p) => p[1]));
  const mid = (minX + maxX) / 2;
  const inTop = new Raster(r.width, r.height);
  inTop.fillPoly(top, P.highlight);
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (inTop.alphaAt(x, y) === 255 && x < mid) r.set(x, y, mat.topLit);
    }
  }
}
