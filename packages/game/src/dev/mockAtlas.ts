// DEV-ONLY fallback frames, generated on demand when the real atlases in
// /assets/ are missing (they're produced by tools/assetgen in a parallel task).
// Rough colored shapes on canvases — just enough to see terrain, units,
// buildings, objects and icons move around. Colors approximate ART_BIBLE ramps.
// resolveFrame() falls back here per-atlas; genuinely unknown names still get
// the magenta placeholder.

import { gameData } from '@bf/data';
import { FALLBACK_PLAYER_RAMPS } from '../recolor';

export interface MockFrame {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
}

const UNIT_FRAME_COUNTS: Record<string, number> = {
  idle: 2, walk: 6, attack: 5, die: 5, decay: 3, gather: 4, carry: 6,
  chop: 4, farm: 4, forage: 4, mine: 4, build: 4,
};
const ANIMAL_FRAME_COUNTS: Record<string, number> = { idle: 2, walk: 4, attack: 4, die: 3, decay: 2 };
const ANIMAL_IDS = new Set(['sheep', 'deer', 'wolf']);
const CAVALRY_IDS = new Set(['scout', 'lightCavalry', 'knight', 'cavalier', 'paladin']);
const SIEGE_IDS = new Set(['batteringRam', 'cappedRam', 'siegeRam', 'mangonel', 'onager', 'trebuchet']);

const TERRAIN_COLORS: Record<string, string> = {
  grass: '#6B8C3F', dirt: '#8A683E', sand: '#C2A268', water: '#2C6283',
  shallows: '#4884A4', road: '#CBAB70', farmland: '#7A5E38', snow: '#D9D9E2',
};
const TERRAIN_VARIANTS: Record<string, number> = {
  grass: 4, dirt: 3, sand: 3, water: 4, shallows: 3, road: 3, farmland: 2, snow: 3,
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((v >> 16) & 0xff) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((v >> 8) & 0xff) * f)));
  const b = Math.max(0, Math.min(255, Math.round((v & 0xff) * f)));
  return `rgb(${r},${g},${b})`;
}

function playerMid(colorIdx: number | undefined): string {
  const ramp = FALLBACK_PLAYER_RAMPS[colorIdx ?? 6] ?? FALLBACK_PLAYER_RAMPS[6];
  return ramp[1];
}

// ------------------------------------------------------------------ terrain

function mockTerrain(parts: string[]): MockFrame | null {
  // terr/<id>/<variant>  or  terr/<hi>_<lo>/<edge>
  const id = parts[1];
  const tail = parts[2];
  if (id.includes('_')) {
    const hi = id.split('_')[0];
    const color = TERRAIN_COLORS[hi];
    if (!color || !['nw', 'ne', 'sw', 'se'].includes(tail)) return null;
    const [c, ctx] = mkCanvas(64, 32);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    // Fringe triangle along one diamond edge.
    ctx.beginPath();
    if (tail === 'ne') { ctx.moveTo(32, 0); ctx.lineTo(64, 16); ctx.lineTo(32, 10); }
    else if (tail === 'se') { ctx.moveTo(64, 16); ctx.lineTo(32, 32); ctx.lineTo(32, 22); }
    else if (tail === 'sw') { ctx.moveTo(32, 32); ctx.lineTo(0, 16); ctx.lineTo(32, 22); }
    else { ctx.moveTo(0, 16); ctx.lineTo(32, 0); ctx.lineTo(32, 10); }
    ctx.closePath();
    ctx.fill();
    return { canvas: c, anchorX: 0.5, anchorY: 0.5 };
  }
  const base = TERRAIN_COLORS[id];
  const variants = TERRAIN_VARIANTS[id] ?? 0;
  const v = Number(tail);
  if (!base || !Number.isInteger(v) || v < 0 || v >= variants) return null;
  const [c, ctx] = mkCanvas(64, 32);
  diamondPath(ctx, 32, 16, 32, 16);
  ctx.fillStyle = base;
  ctx.fill();
  // Seeded speckle so variants differ.
  let seed = hashStr(`terr/${id}/${v}`) || 1;
  ctx.fillStyle = shade(base, v % 2 === 0 ? 1.15 : 0.85);
  for (let i = 0; i < 26; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = 4 + (seed % 56);
    const y = 2 + ((seed >>> 8) % 28);
    if (Math.abs(x - 32) / 32 + Math.abs(y - 16) / 16 <= 0.94) ctx.fillRect(x, y, 1, 1);
  }
  return { canvas: c, anchorX: 0.5, anchorY: 0.5 };
}

// ------------------------------------------------------------------ units / animals

function facingVec(dir: number): [number, number] {
  const rad = ((90 + 45 * dir) * Math.PI) / 180; // 0 = S (screen-down), clockwise
  return [Math.cos(rad), Math.sin(rad)];
}

function mockUnit(parts: string[], colorIdx: number | undefined): MockFrame | null {
  const [, defId, anim, dirS, frameS] = parts;
  const dir = Number(dirS);
  const frame = Number(frameS);
  const isAnimal = ANIMAL_IDS.has(defId);
  const counts = isAnimal ? ANIMAL_FRAME_COUNTS : UNIT_FRAME_COUNTS;
  const count = counts[anim];
  if (!count || !Number.isInteger(dir) || dir < 0 || dir > 4) return null;
  if (!Number.isInteger(frame) || frame < 0 || frame >= count) return null;

  const cav = CAVALRY_IDS.has(defId);
  const siege = SIEGE_IDS.has(defId);
  const W = siege ? 80 : cav ? 64 : 48;
  const H = siege ? 72 : cav ? 56 : 48;
  const [c, ctx] = mkCanvas(W, H);
  const cx = W / 2;
  const feetY = H - 4;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, feetY - 1, siege ? 22 : cav ? 14 : 8, siege ? 7 : cav ? 5 : 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const mid = isAnimal ? (defId === 'sheep' ? '#E8E4D4' : defId === 'deer' ? '#A8854F' : '#78787F') : playerMid(colorIdx);
  const bob = anim === 'walk' || anim === 'carry' ? [0, -1, 0, 0, -1, 0][frame % 6] : 0;
  const dying = anim === 'die' || anim === 'decay';
  const [fx] = facingVec(dir);
  const lunge = anim === 'attack' && frame === 2 ? 3 : 0;

  ctx.save();
  ctx.translate(lunge * fx, bob);
  if (dying) {
    // prone
    ctx.fillStyle = shade(mid, 0.8);
    ctx.strokeStyle = '#1A1208';
    const spread = Math.min(frame + 1, 3) * 3;
    ctx.fillRect(cx - 8 - spread / 2, feetY - 7, 16 + spread, 6);
    ctx.strokeRect(cx - 8 - spread / 2 + 0.5, feetY - 7 + 0.5, 15 + spread, 5);
  } else {
    const bodyH = siege ? 22 : cav ? 22 : defId === 'villager' ? 14 : 16;
    const bodyW = siege ? 34 : cav ? 22 : 10;
    // body
    ctx.fillStyle = mid;
    ctx.strokeStyle = '#1A1208';
    ctx.fillRect(cx - bodyW / 2, feetY - bodyH - (siege ? 0 : 6), bodyW, bodyH);
    ctx.strokeRect(cx - bodyW / 2 + 0.5, feetY - bodyH - (siege ? 0 : 6) + 0.5, bodyW - 1, bodyH - 1);
    if (!siege) {
      // head
      ctx.fillStyle = isAnimal ? shade(mid, 0.9) : '#BE8A5C';
      ctx.beginPath();
      ctx.arc(cx + fx * 2, feetY - bodyH - 9, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // legs
      ctx.fillStyle = '#46311E';
      const step = anim === 'walk' || anim === 'carry' ? (frame % 2 === 0 ? 1 : -1) : 0;
      ctx.fillRect(cx - 3 + step, feetY - 6, 2, 6);
      ctx.fillRect(cx + 1 - step, feetY - 6, 2, 6);
    }
    // facing tick
    ctx.fillStyle = '#F4EEDD';
    ctx.fillRect(cx + fx * (bodyW / 2 + 1) - 1, feetY - (siege ? 12 : 12), 2, 2);
  }
  ctx.restore();
  return { canvas: c, anchorX: 0.5, anchorY: feetY / H };
}

// ------------------------------------------------------------------ objects

function mockObject(parts: string[], colorIdx: number | undefined): MockFrame | null {
  const id = parts[1];
  if (ANIMAL_IDS.has(id.split('@')[0])) return mockUnit(parts, colorIdx);
  if (id === 'tree') {
    const v = Number(parts[2]);
    if (!(v >= 0 && v < 3)) return null;
    const [c, ctx] = mkCanvas(48, 64);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(24, 58, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6B4C2C';
    ctx.fillRect(22, 44, 4, 15);
    ctx.fillStyle = v === 2 ? '#46311E' : '#3F6E2F';
    if (v === 1) { // pine
      ctx.beginPath(); ctx.moveTo(24, 4); ctx.lineTo(8, 48); ctx.lineTo(40, 48); ctx.closePath(); ctx.fill();
    } else if (v === 0) { // oak
      ctx.beginPath(); ctx.ellipse(24, 26, 15, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5B8A3B';
      ctx.beginPath(); ctx.ellipse(19, 21, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else { // dead
      ctx.fillRect(20, 20, 3, 26); ctx.fillRect(14, 24, 12, 3);
    }
    return { canvas: c, anchorX: 0.5, anchorY: 60 / 64 };
  }
  if (id === 'stump') {
    const [c, ctx] = mkCanvas(24, 16);
    ctx.fillStyle = '#6B4C2C'; ctx.fillRect(8, 6, 8, 6);
    ctx.fillStyle = '#B08C5C'; ctx.beginPath(); ctx.ellipse(12, 6, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    return { canvas: c, anchorX: 0.5, anchorY: 13 / 16 };
  }
  if (id === 'gold' || id === 'stone') {
    const v = Number(parts[2]);
    if (!(v >= 0 && v < 2)) return null;
    const [c, ctx] = mkCanvas(56, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(28, 34, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#78787F';
    ctx.beginPath(); ctx.ellipse(28, 24, 17, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18 + v * 4, 18, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (id === 'gold') {
      ctx.fillStyle = '#E6C04A';
      for (const [x, y] of [[22, 20], [34, 24], [28, 15], [16, 26]]) ctx.fillRect(x, y, 3, 3);
    } else {
      ctx.fillStyle = '#C0C0C6';
      ctx.fillRect(20, 18, 8, 4); ctx.fillRect(31, 24, 7, 4);
    }
    return { canvas: c, anchorX: 0.5, anchorY: 34 / 40 };
  }
  if (id === 'berries') {
    const [c, ctx] = mkCanvas(40, 32);
    ctx.fillStyle = '#2E5426';
    ctx.beginPath(); ctx.ellipse(20, 22, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#A62E3E';
    let seed = 7;
    for (let i = 0; i < 10; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ctx.fillRect(8 + (seed % 24), 16 + ((seed >>> 8) % 10), 2, 2);
    }
    return { canvas: c, anchorX: 0.5, anchorY: 28 / 32 };
  }
  if (id === 'farm') {
    const stage = Number(parts[2]);
    if (!(stage >= 0 && stage <= 4)) return null;
    const [c, ctx] = mkCanvas(192, 96);
    diamondPath(ctx, 96, 48, 96, 48);
    const colors = ['#7A5E38', '#7C6A3A', '#5E7A34', '#B29245', '#8A683E'];
    ctx.fillStyle = colors[stage];
    ctx.fill();
    ctx.strokeStyle = '#46311E';
    ctx.stroke();
    ctx.strokeStyle = shade(colors[stage], 0.8);
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(96 - i * 14, 48 - 48 + i * 7 + 4);
      ctx.lineTo(96 + 96 - i * 14, 48 + i * 7 - 4);
      ctx.stroke();
    }
    return { canvas: c, anchorX: 0.5, anchorY: 0.5 };
  }
  if (id === 'proj') {
    const [c, ctx] = mkCanvas(12, 12);
    ctx.strokeStyle = '#B08C5C';
    ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(10, 2); ctx.stroke();
    return { canvas: c, anchorX: 0.5, anchorY: 0.5 };
  }
  return null;
}

// ------------------------------------------------------------------ buildings

const AGE_ROOF: Record<string, string> = { dark: '#B29245', feudal: '#8F6C43', castle: '#5A6474', imperial: '#7C8798' };
const AGE_WALL: Record<string, string> = { dark: '#6B4C2C', feudal: '#8F6C43', castle: '#78787F', imperial: '#C0C0C6' };

function mockBuilding(parts: string[], colorIdx: number | undefined): MockFrame | null {
  // bld/<defId>/<state>  or  bld/<defId>/<age>/done
  const defId = parts[1].split('@')[0];
  const def = gameData.buildings[defId];
  if (!def) return null;
  let state = parts[2];
  let age = 'dark';
  if (parts.length === 4) {
    age = parts[2];
    state = parts[3];
    if (!(age in AGE_ROOF)) return null;
  } else {
    age = def.age;
  }
  const valid = state === 'done' || state === 'rubble' || /^construct[0-2]$/.test(state);
  if (!valid) return null;

  const s = def.size;
  const fpW = s * 64;
  const fpH = s * 32;
  const wallH = state === 'rubble' ? 8 : 16 + s * 8;
  const W = fpW;
  const H = fpH + wallH;
  const [c, ctx] = mkCanvas(W, H);
  const cx = W / 2;
  const fpCy = H - fpH / 2;

  // footprint diamond (ground shadow / floor)
  diamondPath(ctx, cx, fpCy, fpW / 2, fpH / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  const wall = AGE_WALL[age] ?? '#6B4C2C';
  const roof = AGE_ROOF[age] ?? '#B29245';

  if (state === 'construct0') {
    diamondPath(ctx, cx, fpCy, fpW / 2 - 3, fpH / 2 - 2);
    ctx.fillStyle = '#8A683E';
    ctx.fill();
    ctx.fillStyle = '#B08C5C';
    ctx.fillRect(cx - fpW / 4, fpCy - 4, 12, 4);
    ctx.fillRect(cx + fpW / 8, fpCy + 2, 12, 4);
  } else if (state === 'rubble') {
    diamondPath(ctx, cx, fpCy, fpW / 2 - 4, fpH / 2 - 3);
    ctx.fillStyle = shade(wall, 0.55);
    ctx.fill();
  } else {
    const frac = state === 'construct1' ? 0.45 : state === 'construct2' ? 0.8 : 1;
    const h = Math.round(wallH * frac);
    const bw = fpW * 0.62;
    const topY = H - fpH / 2 - h;
    // walls: left plane light, right plane base (top-left light rule)
    ctx.fillStyle = shade(wall, 1.15);
    ctx.fillRect(cx - bw / 2, topY, bw / 2, h);
    ctx.fillStyle = wall;
    ctx.fillRect(cx, topY, bw / 2, h);
    ctx.strokeStyle = '#1A1208';
    ctx.strokeRect(cx - bw / 2 + 0.5, topY + 0.5, bw - 1, h - 1);
    if (state === 'done') {
      // roof
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2 - 3, topY);
      ctx.lineTo(cx, topY - Math.max(8, s * 5));
      ctx.lineTo(cx + bw / 2 + 3, topY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // player banner
      ctx.fillStyle = playerMid(colorIdx);
      ctx.fillRect(cx - 2, topY - Math.max(8, s * 5) - 7, 5, 7);
      ctx.strokeRect(cx - 2 + 0.5, topY - Math.max(8, s * 5) - 7 + 0.5, 4, 6);
    } else {
      // scaffold ticks
      ctx.strokeStyle = '#B08C5C';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2 + (i * bw) / 3, topY + h);
        ctx.lineTo(cx - bw / 2 + (i * bw) / 3, topY);
        ctx.stroke();
      }
    }
  }
  return { canvas: c, anchorX: 0.5, anchorY: (H - fpH / 2) / H };
}

// ------------------------------------------------------------------ icons

function mockIcon(name: string): MockFrame {
  const [c, ctx] = mkCanvas(40, 40);
  ctx.fillStyle = '#2C1F12';
  ctx.fillRect(0, 0, 40, 40);
  ctx.strokeStyle = '#8A6414';
  ctx.strokeRect(1.5, 1.5, 37, 37);
  const gray = name.endsWith('/gray');
  const tail = name.split('/').filter((p) => p !== 'gray').pop() ?? '?';
  const label = (tail.length <= 2 ? tail : tail.replace(/[^A-Za-z]/g, '').slice(0, 2)).toUpperCase();
  ctx.fillStyle = gray ? '#92929B' : '#DABE8D';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 20, 21);
  return { canvas: c, anchorX: 0, anchorY: 0 };
}

/**
 * Build a mock frame for a contract frame name, or null when the name is out
 * of the mock's (contract-shaped) range — the caller then shows the magenta
 * placeholder.
 */
export function makeMockFrame(name: string, colorIdx?: number): MockFrame | null {
  const parts = name.split('/');
  try {
    switch (parts[0]) {
      case 'terr': return parts.length === 3 ? mockTerrain(parts) : null;
      case 'unit': return parts.length === 5 ? mockUnit(parts, colorIdx) : null;
      case 'obj': return mockObject(parts, colorIdx);
      case 'bld': return parts.length === 3 || parts.length === 4 ? mockBuilding(parts, colorIdx) : null;
      case 'icon': return mockIcon(name);
      default: return null;
    }
  } catch {
    return null;
  }
}
