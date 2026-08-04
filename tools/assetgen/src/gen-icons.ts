// HUD icons (ART_BIBLE §8.3), 40×40: unit busts, building mini-renders, resource
// and command glyphs, tech emblems — derived from gameData at generation time.
// NOTE: data is imported via LEAF modules with explicit .ts extensions — the
// package index uses extensionless value imports which plain Node cannot load,
// while the leaves only have type-only cross imports (erased by type stripping).
// Player-color mask colors are BANNED in icons (asserted in checks.ts).

import { units } from '../../../packages/data/src/units.ts';
import { buildings } from '../../../packages/data/src/buildings.ts';
import { techs } from '../../../packages/data/src/techs.ts';
import { resources } from '../../../packages/data/src/resources.ts';
import { Raster } from './raster.ts';
import { PALETTE } from './palette.ts';
import type { RGB } from './palette.ts';
import { luma } from './util.ts';
import type { FrameDef } from './atlas.ts';

export const CMD_VERBS = [
  'attackMove', 'stop', 'garrison', 'ungarrison', 'townBell', 'delete', 'reseedFarm',
  'pack', 'unpack', 'heal', 'convert', 'rally',
] as const;

const P = PALETTE;

// ---------------------------------------------------------------- chrome

function chrome(): Raster {
  const r = new Raster(40, 40);
  r.fillRect(0, 0, 40, 40, P.uiWoodDark);
  r.fillRect(0, 0, 40, 1, P.goldDark);
  r.fillRect(0, 39, 40, 1, P.goldDark);
  r.fillRect(0, 0, 1, 40, P.goldDark);
  r.fillRect(39, 0, 1, 40, P.goldDark);
  for (const [x, y] of [[0, 0], [39, 0], [0, 39], [39, 39]] as const) r.set(x, y, P.outline);
  return r;
}

/** Grayscale companion: luma-map every pixel onto the stone ramp (ART_BIBLE §10.8). */
export function grayIcon(src: Raster): Raster {
  const out = new Raster(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b, a] = src.get(x, y);
      if (a === 0) continue;
      const l = luma(r, g, b);
      const c: RGB = l < 40 ? P.outline : l < 90 ? P.stoneDark : l < 140 ? P.stoneBase : l < 190 ? P.stoneLight : P.stonePale;
      out.set(x, y, c, a);
    }
  }
  return out;
}

// ---------------------------------------------------------------- unit busts

interface BustOpts {
  helm: 'none' | 'cap' | 'helm' | 'helmLight' | 'hood' | 'brim' | 'monk';
  capC?: RGB;
  plume?: boolean;
  glint?: boolean;
  weapon:
    | 'sword' | 'longsword' | 'spear' | 'pike' | 'bow' | 'tallbow' | 'crossbow'
    | 'javelin' | 'axe' | 'longaxe' | 'staff' | 'lance' | 'tool' | 'none';
  shield?: 'round' | 'kite' | 'buckler' | 'none';
  torso: RGB;
  torsoLight: RGB;
  horse?: 'bay' | 'dun' | 'caparison';
}

function drawBust(r: Raster, o: BustOpts): void {
  const hx = o.horse ? 16 : 20;
  // shoulders / torso
  r.fillPoly(
    [
      [hx - 8, 35],
      [hx - 6, 24],
      [hx - 2, 21],
      [hx + 2, 21],
      [hx + 6, 24],
      [hx + 8, 35],
    ],
    o.torso,
  );
  r.fillPoly(
    [
      [hx - 8, 35],
      [hx - 6, 24],
      [hx - 2, 21],
      [hx - 1, 21],
      [hx - 1, 35],
    ],
    o.torsoLight,
  );
  // neck + head
  r.fillRect(hx - 1, 19, 3, 2, P.skinShadow);
  r.fillEllipse(hx, 14, 4, 5, P.skinBase);
  r.paintWhere(
    (x, y) => Raster.inEllipse(x, y, hx, 14, 4, 5) && !Raster.inEllipse(x - 2, y - 2, hx, 14, 4, 5),
    P.skinLight,
  );
  // headgear
  if (o.helm === 'cap') {
    r.fillEllipse(hx, 11, 4, 2, o.capC ?? P.clothBase);
    r.fillRect(hx - 4, 11, 9, 1, o.capC ?? P.clothBase);
  } else if (o.helm === 'helm' || o.helm === 'helmLight') {
    const c = o.helm === 'helm' ? P.metalBase : P.metalLight;
    r.fillEllipse(hx, 11, 4, 3, c);
    r.fillRect(hx - 4, 12, 9, 2, c);
    r.set(hx - 2, 10, P.metalLight);
    if (o.glint) r.set(hx - 1, 9, P.highlight);
    if (o.plume) {
      r.fillRect(hx - 1, 6, 2, 4, P.berryRed);
      r.set(hx, 5, P.berryRed);
    }
  } else if (o.helm === 'hood' || o.helm === 'monk') {
    const c = o.capC ?? P.clothDark;
    r.fillEllipse(hx, 12, 5, 4, c);
    r.fillRect(hx - 5, 12, 11, 4, c);
    r.fillEllipse(hx, 15, 3, 3, P.skinShadow); // shadowed face
  } else if (o.helm === 'brim') {
    r.fillEllipse(hx, 11, 6, 2, o.capC ?? P.clothBase);
    r.fillEllipse(hx, 9, 3, 2, o.capC ?? P.clothBase);
  } else {
    r.fillEllipse(hx, 11, 4, 2, P.clothDark); // hair
  }
  // weapon glyphs
  const w = o.weapon;
  if (w === 'sword' || w === 'longsword') {
    const len = w === 'sword' ? 10 : 14;
    r.line(hx + 7, 32, hx + 7 + Math.round(len * 0.55), 32 - len, P.metalLight);
    r.fillRect(hx + 6, 31, 3, 1, P.goldDark);
  } else if (w === 'spear' || w === 'pike') {
    const top = w === 'spear' ? 6 : 3;
    r.fillRect(hx + 9, top + 3, 1, 33 - top, P.woodBase);
    r.fillRect(hx + 9, top, 1, 3, P.metalLight);
    r.set(hx + 8, top + 1, P.metalLight);
    r.set(hx + 10, top + 1, P.metalLight);
  } else if (w === 'bow' || w === 'tallbow') {
    const y0 = w === 'bow' ? 12 : 6;
    const y1 = w === 'bow' ? 32 : 34;
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const bend = Math.round(4 * Math.sin(Math.PI * t));
      r.set(hx + 8 + bend, y, P.woodPale);
    }
    r.line(hx + 8, y0, hx + 8, y1, P.clothLight);
  } else if (w === 'crossbow') {
    r.fillRect(hx + 4, 26, 10, 1, P.woodBase);
    r.fillRect(hx + 8, 22, 1, 6, P.woodDark);
    r.fillRect(hx + 4, 25, 1, 3, P.metalLight);
    r.fillRect(hx + 13, 25, 1, 3, P.metalLight);
  } else if (w === 'javelin') {
    r.line(hx + 4, 30, hx + 12, 10, P.woodBase);
    r.set(hx + 12, 10, P.metalLight);
    r.set(hx + 13, 9, P.metalLight);
  } else if (w === 'axe' || w === 'longaxe') {
    const len = w === 'axe' ? 10 : 16;
    r.line(hx + 5, 33, hx + 5 + len, 33 - len, P.woodBase);
    const tx = hx + 5 + len;
    r.fillRect(tx - 1, 33 - len - 2, 4, 3, P.metalLight);
  } else if (w === 'staff') {
    r.fillRect(hx + 8, 8, 1, 26, P.woodBase);
    r.set(hx + 8, 7, P.goldShine);
  } else if (w === 'lance') {
    r.line(hx + 6, 30, hx + 14, 8, P.woodBase);
    r.set(hx + 14, 8, P.metalLight);
  } else if (w === 'tool') {
    r.line(hx + 5, 30, hx + 11, 18, P.woodBase);
    r.fillRect(hx + 10, 15, 3, 3, P.metalBase);
  }
  if (o.shield === 'round') {
    r.fillEllipse(hx - 8, 29, 4, 4, P.woodBase);
    r.fillEllipse(hx - 8, 29, 2, 2, P.metalBase);
    r.set(hx - 9, 28, P.metalLight);
  } else if (o.shield === 'kite') {
    r.fillPoly([[hx - 12, 24], [hx - 5, 24], [hx - 5, 30], [hx - 8, 35], [hx - 12, 30]], P.metalBase);
    r.fillRect(hx - 11, 25, 2, 3, P.metalLight);
  } else if (o.shield === 'buckler') {
    r.fillEllipse(hx - 8, 28, 3, 3, P.woodDark);
    r.set(hx - 8, 28, P.metalLight);
  }
  // horse companion head (cavalry tell)
  if (o.horse) {
    const body = o.horse === 'dun' ? P.dirtLight : P.woodBase;
    const mane = P.woodDark;
    r.fillPoly([[27, 35], [27, 22], [31, 18], [35, 20], [36, 24], [33, 25], [33, 35]], body);
    r.fillRect(30, 17, 2, 3, mane);
    r.fillRect(27, 20, 2, 12, mane);
    r.set(36, 22, P.outline); // eye
    if (o.horse === 'caparison') {
      r.fillRect(27, 28, 9, 7, P.clothLight);
      r.fillRect(27, 28, 9, 1, P.clothDark);
    }
  }
}

function siegeGlyph(r: Raster, kind: 'ram' | 'ramCapped' | 'ramSiege' | 'mangonel' | 'onager' | 'trebuchet'): void {
  if (kind.startsWith('ram')) {
    r.fillPoly([[6, 22], [20, 14], [34, 22], [34, 30], [6, 30]], P.woodBase);
    r.fillPoly([[6, 22], [20, 14], [34, 22], [20, 24]], P.woodLight);
    if (kind !== 'ram') {
      r.fillRect(8, 20, 24, 2, P.metalBase); // plating rows
      r.fillRect(8, 26, 24, 1, P.metalBase);
    }
    r.fillRect(2, 26, 10, 2, P.woodDark); // log head
    if (kind === 'ramSiege') r.fillRect(2, 25, 3, 4, P.metalLight);
    for (const wx of [10, 28]) r.fillEllipse(wx, 32, 3, 3, P.woodDark);
  } else if (kind === 'mangonel' || kind === 'onager') {
    r.fillRect(6, 28, 28, 4, P.woodBase);
    for (const wx of [10, 30]) r.fillEllipse(wx, 33, 3, 3, P.woodDark);
    r.line(12, 28, 26, 10, P.woodBase);
    r.line(13, 28, 27, 10, kind === 'onager' ? P.metalBase : P.woodDark);
    r.fillEllipse(27, 9, 3, 2, P.stoneBase); // rock cup
    r.fillPoly([[8, 28], [14, 16], [16, 16], [12, 28]], P.woodDark); // cross-frame
  } else {
    // trebuchet: A-frame + arm + counterweight
    r.fillRect(4, 32, 32, 2, P.woodBase);
    r.line(12, 32, 19, 14, P.woodDark);
    r.line(26, 32, 19, 14, P.woodDark);
    r.line(8, 24, 34, 6, P.woodBase); // arm
    r.fillRect(6, 22, 5, 5, P.metalDark); // counterweight
    r.line(34, 6, 36, 12, P.clothLight); // sling
  }
}

function animalGlyph(r: Raster, kind: 'sheep' | 'deer' | 'wolf'): void {
  if (kind === 'sheep') {
    r.fillEllipse(20, 24, 9, 6, P.highlight);
    r.ditherWhere(10, 17, 30, 30, (x, y) => Raster.inEllipse(x, y, 20, 24, 9, 6), P.clothLight, 50);
    r.fillEllipse(10, 21, 3, 3, P.clothDark);
    for (const lx of [14, 18, 23, 27]) r.fillRect(lx, 29, 1, 4, P.clothDark);
  } else if (kind === 'deer') {
    r.fillEllipse(21, 22, 9, 5, P.dirtLight);
    r.paintWhere((x, y) => Raster.inEllipse(x, y, 21, 22, 9, 5) && y >= 25, P.dirtPale);
    r.line(12, 20, 10, 13, P.dirtLight);
    r.fillEllipse(10, 12, 2, 2, P.dirtLight);
    r.line(9, 10, 6, 5, P.woodPale);
    r.line(9, 10, 12, 5, P.woodPale);
    for (const lx of [14, 17, 25, 28]) r.fillRect(lx, 26, 1, 8, P.dirtDark);
  } else {
    // solid wolf silhouette (dither made the tiny icon read as noise)
    r.fillEllipse(21, 23, 10, 5, P.stoneBase);
    r.paintWhere((x, y) => Raster.inEllipse(x, y, 21, 23, 10, 5) && !Raster.inEllipse(x - 2, y - 2, 21, 23, 10, 5), P.stoneLight);
    r.fillPoly([[13, 19], [5, 22], [13, 26]], P.stoneBase); // low lunging head
    r.set(12, 17, P.stoneBase); // ear
    r.set(9, 21, P.berryRed);
    r.line(31, 22, 36, 19, P.stoneDark); // tail
    for (const lx of [15, 18, 25, 28]) r.fillRect(lx, 27, 1, 6, P.stoneDark);
  }
}

const BUSTS: Record<string, BustOpts> = {
  villager: { helm: 'cap', capC: P.clothBase, weapon: 'tool', torso: P.clothBase, torsoLight: P.clothLight },
  militia: { helm: 'none', weapon: 'sword', shield: 'round', torso: P.clothBase, torsoLight: P.clothLight },
  manAtArms: { helm: 'helm', weapon: 'sword', shield: 'round', torso: P.clothBase, torsoLight: P.clothLight },
  longswordsman: { helm: 'helm', weapon: 'longsword', shield: 'round', torso: P.metalBase, torsoLight: P.metalLight },
  champion: { helm: 'helmLight', plume: true, glint: true, weapon: 'longsword', shield: 'round', torso: P.metalBase, torsoLight: P.metalLight },
  spearman: { helm: 'cap', capC: P.clothDark, weapon: 'spear', torso: P.clothBase, torsoLight: P.clothLight },
  pikeman: { helm: 'helm', weapon: 'pike', torso: P.clothBase, torsoLight: P.clothLight },
  archer: { helm: 'cap', capC: P.clothBase, weapon: 'bow', torso: P.clothBase, torsoLight: P.clothLight },
  crossbowman: { helm: 'helm', weapon: 'crossbow', torso: P.clothBase, torsoLight: P.clothLight },
  arbalester: { helm: 'helmLight', glint: true, weapon: 'crossbow', torso: P.metalBase, torsoLight: P.metalLight },
  skirmisher: { helm: 'brim', weapon: 'javelin', shield: 'buckler', torso: P.clothBase, torsoLight: P.clothLight },
  eliteSkirmisher: { helm: 'brim', capC: P.clothDark, glint: true, weapon: 'javelin', shield: 'buckler', torso: P.metalBase, torsoLight: P.metalLight },
  scout: { helm: 'none', weapon: 'lance', torso: P.clothBase, torsoLight: P.clothLight, horse: 'dun' },
  lightCavalry: { helm: 'helm', weapon: 'lance', torso: P.clothBase, torsoLight: P.clothLight, horse: 'dun' },
  knight: { helm: 'helm', weapon: 'lance', shield: 'kite', torso: P.metalBase, torsoLight: P.metalLight, horse: 'caparison' },
  cavalier: { helm: 'helmLight', plume: true, weapon: 'lance', shield: 'kite', torso: P.metalBase, torsoLight: P.metalLight, horse: 'caparison' },
  paladin: { helm: 'helmLight', plume: true, glint: true, weapon: 'lance', shield: 'kite', torso: P.metalLight, torsoLight: P.highlight, horse: 'caparison' },
  monk: { helm: 'monk', weapon: 'staff', torso: P.clothDark, torsoLight: P.clothBase },
  highlandRaider: { helm: 'none', weapon: 'longaxe', torso: P.clothBase, torsoLight: P.clothLight },
  eliteHighlandRaider: { helm: 'helm', glint: true, weapon: 'longaxe', torso: P.metalBase, torsoLight: P.metalLight },
  longbowman: { helm: 'hood', weapon: 'tallbow', torso: P.clothBase, torsoLight: P.clothLight },
  eliteLongbowman: { helm: 'hood', capC: P.clothBase, glint: true, weapon: 'tallbow', torso: P.metalBase, torsoLight: P.metalLight },
};

function unitIcon(id: string): Raster {
  const r = chrome();
  if (id === 'sheep' || id === 'deer' || id === 'wolf') {
    animalGlyph(r, id);
  } else if (id.includes('Ram') || id === 'batteringRam') {
    siegeGlyph(r, id === 'batteringRam' ? 'ram' : id === 'cappedRam' ? 'ramCapped' : 'ramSiege');
  } else if (id === 'mangonel' || id === 'onager') {
    siegeGlyph(r, id);
  } else if (id === 'trebuchet') {
    siegeGlyph(r, 'trebuchet');
  } else {
    drawBust(r, BUSTS[id] ?? { helm: 'none', weapon: 'sword', torso: P.clothBase, torsoLight: P.clothLight });
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- buildings

function roofTri(r: Raster, x0: number, x1: number, yBase: number, yApex: number, c: RGB, cl: RGB): void {
  const apex = Math.round((x0 + x1) / 2);
  r.fillPoly([[apex, yApex], [x1, yBase], [x0, yBase]], c);
  r.fillPoly([[apex, yApex], [apex, yBase], [x0, yBase]], cl);
  r.line(apex, yApex, apex, yApex, cl);
}

function wallBox(r: Raster, x0: number, x1: number, y0: number, y1: number, base: RGB, light: RGB): void {
  r.fillRect(x0, y0, x1 - x0, y1 - y0, base);
  r.fillRect(x0, y0, Math.max(1, Math.round((x1 - x0) / 2)), y1 - y0, light);
}

function towerGlyph(r: Raster, h: number, pale: boolean): void {
  const base = pale ? P.stonePale : P.stoneBase;
  const light = pale ? P.stonePale : P.stoneLight;
  wallBox(r, 15, 26, 34 - h, 34, base, light);
  for (let y = 34 - h + 3; y < 33; y += 4) r.fillRect(16, y, 9, 1, P.stoneDark);
  // crenellated crown
  for (let x = 13; x <= 26; x += 3) r.fillRect(x, 34 - h - 3, 2, 3, base);
  r.fillRect(13, 34 - h - 1, 15, 1, base);
  r.fillRect(19, 34 - h + 4, 2, 4, P.outline); // arrow slit
  diamondBase(r);
}

function diamondBase(r: Raster): void {
  r.fillPoly([[20, 31], [35, 35], [20, 39], [5, 35]], P.grassBase);
}

function buildingIcon(id: string): Raster {
  const r = chrome();
  switch (id) {
    case 'townCenter': {
      diamondBase(r);
      wallBox(r, 8, 32, 24, 34, P.woodBase, P.woodLight);
      r.fillPoly([[20, 8], [36, 24], [4, 24]], P.thatchBase);
      r.fillPoly([[20, 8], [20, 24], [4, 24]], P.thatchLight);
      r.fillRect(19, 4, 1, 5, P.woodDark); // banner pole
      r.fillRect(20, 4, 4, 3, P.berryRed);
      r.fillRect(17, 27, 6, 7, P.uiWoodDark); // door
      break;
    }
    case 'house': {
      diamondBase(r);
      wallBox(r, 10, 30, 24, 34, P.woodPale, P.clothLight);
      for (const px of [12, 19, 26]) r.fillRect(px, 24, 1, 10, P.woodDark);
      roofTri(r, 8, 32, 24, 14, P.thatchBase, P.thatchLight);
      r.fillRect(17, 28, 5, 6, P.woodDark);
      break;
    }
    case 'mill': {
      diamondBase(r);
      wallBox(r, 14, 26, 18, 34, P.woodBase, P.woodLight);
      r.fillPoly([[20, 12], [27, 18], [13, 18]], P.thatchBase);
      // diagonal X sail cross
      r.line(12, 5, 28, 21, P.woodPale);
      r.line(28, 5, 12, 21, P.woodPale);
      r.fillRect(13, 6, 3, 2, P.clothLight);
      r.fillRect(25, 6, 3, 2, P.clothLight);
      break;
    }
    case 'lumberCamp': {
      diamondBase(r);
      // lean-to over a log stack
      r.fillPoly([[6, 22], [34, 16], [36, 20], [8, 26]], P.woodBase);
      for (let i = 0; i < 3; i++) {
        r.fillRect(9, 26 + i * 3, 20, 2, P.woodBase);
        r.fillEllipse(9, 27 + i * 3, 1, 1, P.woodPale);
      }
      r.fillRect(6, 22, 2, 12, P.woodDark);
      r.fillRect(32, 17, 2, 13, P.woodDark);
      break;
    }
    case 'miningCamp': {
      diamondBase(r);
      // A-frame headframe over pit
      r.fillEllipse(20, 32, 6, 3, P.outline);
      r.line(12, 34, 20, 12, P.woodBase);
      r.line(28, 34, 20, 12, P.woodBase);
      r.fillRect(14, 24, 12, 1, P.woodDark);
      r.fillRect(8, 28, 7, 4, P.woodDark); // ore cart
      r.fillRect(9, 27, 5, 1, P.goldBase);
      break;
    }
    case 'farm': {
      r.fillPoly([[20, 12], [37, 25], [20, 38], [3, 25]], P.dirtBase);
      for (let y = 14; y < 37; y++) {
        for (let x = 5; x < 36; x++) {
          if (!insidePoly(x, y)) continue;
          const s = (x + 2 * y) % 6;
          if (s === 0) r.set(x, y, P.dirtDark);
          else if (s === 1) r.set(x, y, P.thatchBase);
        }
      }
      for (const [px, py] of [[20, 12], [37, 25], [20, 38], [3, 25]] as const) {
        r.fillRect(px, py - 4, 1, 4, P.woodDark);
      }
      break;
    }
    case 'barracks': {
      diamondBase(r);
      wallBox(r, 6, 34, 22, 34, P.woodBase, P.woodLight);
      roofTri(r, 4, 36, 22, 12, P.thatchBase, P.thatchLight);
      // shield rack: 3 round shields
      for (const sx of [12, 20, 28]) {
        r.fillEllipse(sx, 27, 2, 2, P.woodPale);
        r.set(sx, 27, P.berryRed);
      }
      break;
    }
    case 'archeryRange': {
      diamondBase(r);
      wallBox(r, 22, 36, 22, 34, P.woodPale, P.clothLight);
      roofTri(r, 20, 38, 22, 15, P.woodBase, P.woodLight);
      // target butt
      r.fillEllipse(11, 27, 6, 6, P.thatchBase);
      r.fillEllipse(11, 27, 4, 4, P.highlight);
      r.fillEllipse(11, 27, 2, 2, P.berryRed);
      r.line(11, 27, 15, 21, P.woodPale); // stuck arrow
      break;
    }
    case 'stable': {
      diamondBase(r);
      wallBox(r, 6, 34, 22, 34, P.woodPale, P.clothLight);
      for (const px of [8, 20, 32]) r.fillRect(px, 22, 1, 12, P.woodDark);
      roofTri(r, 4, 36, 22, 13, P.thatchBase, P.thatchLight);
      r.fillRect(14, 26, 12, 8, P.uiWoodDark); // big open door
      r.fillRect(16, 30, 8, 2, P.thatchLight); // hay
      // horseshoe
      r.set(19, 24, P.metalLight);
      r.set(21, 24, P.metalLight);
      r.set(20, 23, P.metalLight);
      break;
    }
    case 'blacksmith': {
      diamondBase(r);
      wallBox(r, 8, 32, 22, 34, P.woodBase, P.woodLight);
      roofTri(r, 6, 34, 22, 14, P.woodBase, P.woodLight);
      r.fillRect(27, 8, 4, 14, P.stoneBase); // chimney
      r.set(28, 7, P.berryRed);
      r.set(29, 6, P.goldShine);
      r.set(29, 8, P.berryRed);
      r.fillRect(12, 30, 5, 3, P.metalDark); // anvil
      break;
    }
    case 'market': {
      diamondBase(r);
      wallBox(r, 6, 26, 20, 34, P.woodPale, P.clothLight);
      roofTri(r, 4, 28, 20, 12, P.woodBase, P.woodLight);
      // striped awning stall
      for (let i = 0; i < 5; i++) {
        r.fillRect(27 + i * 2, 22, 2, 4, i % 2 ? P.parchBase : P.berryRed);
      }
      r.fillRect(27, 26, 10, 1, P.woodDark);
      r.fillRect(28, 30, 3, 4, P.woodBase); // barrel
      r.set(34, 31, P.goldShine); // coin chest glint
      break;
    }
    case 'siegeWorkshop': {
      diamondBase(r);
      wallBox(r, 6, 34, 20, 34, P.stoneBase, P.stoneLight);
      r.fillPoly([[6, 20], [34, 20], [30, 14], [10, 14]], P.slateBase);
      r.fillRect(14, 24, 12, 10, P.uiWoodDark); // wide arch
      // giant spare wheel
      r.fillEllipse(31, 28, 5, 5, P.woodDark);
      r.fillEllipse(31, 28, 3, 3, P.uiWoodDark);
      r.line(28, 28, 34, 28, P.woodDark);
      r.line(31, 25, 31, 31, P.woodDark);
      break;
    }
    case 'monastery': {
      diamondBase(r);
      wallBox(r, 10, 26, 18, 34, P.stoneBase, P.stoneLight);
      roofTri(r, 8, 28, 18, 10, P.slateBase, P.slateLight);
      r.fillRect(28, 10, 4, 24, P.stoneBase); // bell tower
      r.fillPoly([[30, 5], [33, 10], [27, 10]], P.slateBase);
      r.set(30, 8, P.goldBase); // bell
      // sunburst disc
      r.fillEllipse(18, 22, 3, 3, P.goldShine);
      r.set(18, 17, P.goldShine);
      r.set(18, 27, P.goldShine);
      r.set(13, 22, P.goldShine);
      r.set(23, 22, P.goldShine);
      break;
    }
    case 'university': {
      diamondBase(r);
      wallBox(r, 6, 34, 16, 34, P.stoneBase, P.stoneLight);
      r.fillPoly([[6, 16], [34, 16], [30, 10], [10, 10]], P.slateBase);
      for (const wx of [11, 19, 27]) r.fillRect(wx, 20, 3, 5, P.thatchLight); // lit windows
      // armillary sphere
      r.fillRect(19, 4, 1, 6, P.woodDark);
      ellipseRing(r, 19, 4, 4, 2, P.goldBase);
      ellipseRing(r, 19, 4, 2, 4, P.goldBase);
      break;
    }
    case 'watchTower':
      towerGlyph(r, 22, false);
      break;
    case 'guardTower':
      towerGlyph(r, 26, false);
      r.fillRect(14, 12, 13, 1, P.stoneDark); // machicolation row
      break;
    case 'keep':
      towerGlyph(r, 28, true);
      r.fillRect(13, 5, 15, 1, P.goldBase); // gold trim
      break;
    case 'stoneWall': {
      diamondBase(r);
      wallBox(r, 4, 36, 20, 32, P.stoneBase, P.stoneLight);
      for (let y = 23; y < 31; y += 4) r.fillRect(5, y, 30, 1, P.stoneDark);
      for (let x = 4; x <= 34; x += 5) r.fillRect(x, 17, 3, 3, P.stoneBase);
      break;
    }
    case 'gate': {
      diamondBase(r);
      wallBox(r, 6, 12, 14, 34, P.stoneBase, P.stoneLight);
      wallBox(r, 28, 34, 14, 34, P.stoneBase, P.stoneLight);
      r.fillPoly([[12, 18], [20, 12], [28, 18], [28, 22], [12, 22]], P.stoneBase);
      // portcullis lattice
      for (let x = 14; x <= 26; x += 3) r.fillRect(x, 20, 1, 13, P.metalDark);
      for (let y = 22; y <= 32; y += 4) r.fillRect(13, y, 14, 1, P.metalDark);
      break;
    }
    case 'castle': {
      diamondBase(r);
      // corner drums + central keep
      for (const dx of [7, 33]) {
        wallBox(r, dx - 3, dx + 3, 16, 34, P.stoneBase, P.stoneLight);
        r.fillPoly([[dx, 10], [dx + 4, 16], [dx - 4, 16]], P.slateBase);
      }
      wallBox(r, 12, 28, 12, 34, P.stoneBase, P.stoneLight);
      for (let x = 12; x <= 26; x += 3) r.fillRect(x, 9, 2, 3, P.stoneBase);
      r.fillRect(19, 16, 2, 4, P.outline); // arrow slit
      r.fillRect(19, 3, 1, 6, P.woodDark);
      r.fillRect(20, 3, 4, 3, P.berryRed); // keep banner
      break;
    }
    case 'wonder': {
      diamondBase(r);
      // three shrinking stonePale tiers + gold trim + spire
      wallBox(r, 8, 32, 26, 34, P.stonePale, P.highlight);
      r.fillRect(8, 26, 24, 1, P.goldBase);
      wallBox(r, 12, 28, 18, 26, P.stonePale, P.highlight);
      r.fillRect(12, 18, 16, 1, P.goldBase);
      wallBox(r, 16, 24, 11, 18, P.stonePale, P.highlight);
      r.fillRect(16, 11, 8, 1, P.goldBase);
      r.fillPoly([[20, 2], [23, 11], [17, 11]], P.goldShine);
      break;
    }
    default: {
      diamondBase(r);
      wallBox(r, 10, 30, 22, 34, P.woodBase, P.woodLight);
      roofTri(r, 8, 32, 22, 13, P.thatchBase, P.thatchLight);
    }
  }
  r.outlinePass();
  return r;
}

function insidePoly(x: number, y: number): boolean {
  // farm icon diamond membership
  return Math.abs(x - 20) / 17 + Math.abs(y - 25) / 13 <= 1;
}

function ellipseRing(r: Raster, cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let a = 0; a < 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    r.set(Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t)), c);
  }
}

// ---------------------------------------------------------------- gaia resource objects

function resourceIcon(id: string): Raster {
  const r = chrome();
  if (id === 'tree') {
    r.fillRect(18, 26, 4, 8, P.woodBase);
    r.fillRect(18, 26, 1, 8, P.woodLight);
    const inU = (x: number, y: number) => Raster.inEllipse(x, y, 20, 17, 10, 9);
    r.paintWhere(inU, P.leafBase);
    r.paintWhere((x, y) => inU(x, y) && !inU(x - 2, y - 2), P.leafLight);
    r.paintWhere((x, y) => inU(x, y) && !inU(x + 2, y + 2), P.leafDark);
  } else if (id === 'goldMine' || id === 'stoneMine') {
    const inM = (x: number, y: number) =>
      Raster.inEllipse(x, y, 20, 26, 12, 8) && y <= 33;
    r.paintWhere(inM, P.stoneBase);
    r.paintWhere((x, y) => inM(x, y) && !inM(x - 2, y - 2), P.stoneLight);
    r.paintWhere((x, y) => inM(x, y) && !inM(x + 2, y + 2), P.stoneDark);
    if (id === 'goldMine') {
      for (const [gx, gy] of [[14, 24], [22, 21], [27, 27], [18, 30]] as const) {
        r.fillRect(gx, gy, 2, 2, P.goldBase);
        r.set(gx, gy, P.goldShine);
      }
    } else {
      r.fillRect(14, 21, 8, 4, P.stonePale);
      r.fillRect(22, 27, 7, 4, P.stonePale);
      r.line(15, 24, 20, 22, P.stoneDark);
    }
  } else if (id === 'berryBush') {
    const inE = (x: number, y: number) => Raster.inEllipse(x, y, 20, 25, 13, 8);
    r.paintWhere(inE, P.leafDark);
    r.paintWhere((x, y) => inE(x, y) && !inE(x - 2, y - 2), P.leafBase);
    // chunky 2×2 berries so the red survives 40px
    for (const [bx, by] of [[12, 24], [17, 21], [23, 22], [28, 26], [15, 28], [21, 27], [26, 30]] as const) {
      r.fillRect(bx, by, 2, 2, P.berryRed);
      r.set(bx, by, P.highlight);
    }
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- res + cmd

function resTypeIcon(res: string): Raster {
  const r = chrome();
  if (res === 'food') {
    // meat haunch: fat drumstick + white bone with two knobs
    const inH = (x: number, y: number) => Raster.inEllipse(x, y, 16, 24, 9, 8);
    r.paintWhere(inH, P.berryRed);
    r.paintWhere((x, y) => inH(x, y) && !inH(x - 2, y - 2), P.skinShadow);
    r.line(23, 18, 29, 12, P.skinLight);
    r.line(24, 19, 30, 13, P.skinLight);
    r.fillEllipse(30, 11, 2, 2, P.highlight);
    r.fillEllipse(28, 14, 2, 2, P.highlight);
  } else if (res === 'wood') {
    for (const [px, py] of [[12, 18], [16, 24]] as const) {
      r.fillPoly([[px, py], [px + 16, py - 4], [px + 16, py - 1], [px, py + 3]], P.woodBase);
      r.fillPoly([[px, py], [px + 16, py - 4], [px + 16, py - 3], [px, py + 1]], P.woodLight);
    }
  } else if (res === 'gold') {
    for (let i = 0; i < 3; i++) {
      r.fillEllipse(20, 28 - i * 5, 9, 3, P.goldBase);
      r.fillEllipse(20, 27 - i * 5, 9, 2, P.goldShine);
    }
  } else {
    // stone block pair
    r.fillRect(10, 20, 12, 9, P.stoneBase);
    r.fillRect(10, 20, 12, 2, P.stoneLight);
    r.fillRect(19, 15, 12, 9, P.stonePale);
    r.fillRect(19, 15, 12, 2, P.highlight);
  }
  r.outlinePass();
  return r;
}

function cmdIcon(verb: string): Raster {
  const r = chrome();
  switch (verb) {
    case 'attackMove': {
      // bold gold ground arrow (the attack-move ping) + sword over it
      r.fillRect(8, 28, 18, 3, P.goldShine);
      r.fillPoly([[26, 24], [34, 29], [26, 35]], P.goldShine);
      r.line(24, 6, 12, 22, P.metalLight); // sword blade
      r.line(25, 6, 13, 22, P.metalLight);
      r.fillRect(10, 22, 6, 2, P.goldDark); // crossguard
      r.fillRect(11, 24, 2, 3, P.woodDark); // grip
      break;
    }
    case 'stop': {
      // hollow octagon, berryRed rim
      const pts: Array<readonly [number, number]> = [
        [14, 8], [26, 8], [32, 14], [32, 26], [26, 32], [14, 32], [8, 26], [8, 14],
      ];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        r.line(x0, y0, x1, y1, P.berryRed);
        r.line(x0 + (x0 < 20 ? 1 : -1), y0 + (y0 < 20 ? 1 : -1), x1 + (x1 < 20 ? 1 : -1), y1 + (y1 < 20 ? 1 : -1), P.berryRed);
      }
      break;
    }
    case 'garrison':
    case 'ungarrison': {
      // doorway arch + arrow in/out
      r.fillRect(12, 14, 16, 18, P.stoneBase);
      r.fillPoly([[12, 14], [20, 8], [28, 14]], P.stoneLight);
      r.fillRect(16, 18, 8, 14, P.uiWoodDark);
      const dirIn = verb === 'garrison';
      r.fillRect(19, dirIn ? 26 : 20, 2, 8, P.goldShine);
      if (dirIn) r.fillPoly([[20, 21], [16, 27], [24, 27]], P.goldShine);
      else r.fillPoly([[20, 36], [16, 30], [24, 30]], P.goldShine);
      break;
    }
    case 'townBell': {
      // broad gold bell + clapper and sound waves: readable at 40px without text
      r.fillRect(18, 8, 4, 3, P.goldDark);
      r.fillPoly([[17, 10], [23, 10], [27, 16], [28, 27], [12, 27], [13, 16]], P.goldBase);
      r.fillPoly([[17, 11], [19, 11], [17, 26], [13, 26], [14, 16]], P.goldShine);
      r.fillRect(10, 27, 20, 3, P.goldDark);
      r.fillEllipse(20, 32, 3, 2, P.goldShine);
      r.line(8, 13, 5, 17, P.parchLight);
      r.line(8, 20, 5, 17, P.parchLight);
      r.line(32, 13, 35, 17, P.parchLight);
      r.line(32, 20, 35, 17, P.parchLight);
      break;
    }
    case 'delete': {
      // cracked shield
      r.fillPoly([[12, 10], [28, 10], [28, 20], [20, 32], [12, 20]], P.stoneBase);
      r.fillPoly([[12, 10], [19, 10], [19, 31], [12, 20]], P.stoneLight);
      r.line(20, 10, 17, 18, P.outline);
      r.line(17, 18, 22, 24, P.outline);
      r.line(22, 24, 19, 31, P.outline);
      break;
    }
    case 'reseedFarm': {
      // furrows + scattering hand + seeds
      for (let y = 26; y <= 34; y += 3) r.fillRect(8, y, 24, 1, P.dirtDark);
      r.fillRect(8, 25, 24, 1, P.dirtLight);
      r.fillEllipse(14, 14, 4, 3, P.skinBase);
      r.fillRect(10, 15, 4, 2, P.clothBase); // sleeve
      for (const [sx, sy] of [[20, 14], [24, 17], [27, 13], [23, 21], [28, 20]] as const) {
        r.set(sx, sy, P.thatchLight);
      }
      break;
    }
    case 'pack':
    case 'unpack': {
      const up = verb === 'unpack';
      if (up) {
        r.line(14, 30, 20, 14, P.woodBase);
        r.line(26, 30, 20, 14, P.woodBase);
        r.fillRect(12, 30, 17, 2, P.woodDark);
      } else {
        r.fillRect(10, 24, 20, 4, P.woodBase);
        r.fillRect(10, 22, 20, 1, P.woodDark); // folded arm
        for (const wx of [13, 27]) r.fillEllipse(wx, 30, 2, 2, P.woodDark);
      }
      // up/down arrow at the right edge
      r.fillRect(33, up ? 14 : 8, 2, 8, P.goldShine);
      if (up) r.fillPoly([[34, 8], [30, 15], [38, 15]], P.goldShine);
      else r.fillPoly([[34, 22], [30, 15], [38, 15]], P.goldShine);
      break;
    }
    case 'heal': {
      // open palm (fingers joined to the palm) + bold gold spark
      r.fillEllipse(17, 26, 6, 5, P.skinBase);
      for (let i = 0; i < 4; i++) r.fillRect(12 + i * 3, 17, 2, 8, P.skinBase);
      r.fillRect(23, 22, 3, 2, P.skinShadow); // thumb
      r.paintWhere((x, y) => Raster.inEllipse(x, y, 17, 26, 6, 5) && !Raster.inEllipse(x - 2, y - 2, 17, 26, 6, 5), P.skinLight);
      r.fillEllipse(30, 11, 2, 2, P.goldShine);
      for (const [dx, dy] of [[0, -4], [0, 4], [-4, 0], [4, 0]] as const) {
        r.set(30 + dx, 11 + dy, P.goldBase);
      }
      break;
    }
    case 'convert': {
      // sunburst disc + orbit ring
      r.fillEllipse(20, 20, 4, 4, P.goldShine);
      for (const [dx, dy] of [[0, -7], [0, 7], [-7, 0], [7, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]] as const) {
        r.set(20 + dx, 20 + dy, P.goldBase);
      }
      ellipseRing(r, 20, 20, 11, 8, P.parchLight);
      break;
    }
    default: {
      // rally: flag on pole, highlight cloth
      r.fillRect(16, 8, 1, 24, P.woodBase);
      r.fillPoly([[17, 8], [30, 10], [27, 13], [30, 16], [17, 18]], P.highlight);
      r.fillRect(17, 17, 11, 1, P.parchDark);
    }
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- tech emblems

function pips(r: Raster, n: number): void {
  for (let i = 0; i < n; i++) r.fillRect(34 - i * 4, 34, 3, 3, P.goldBase);
}

function chevron(r: Raster): void {
  r.fillPoly([[30, 10], [34, 6], [38, 10], [34, 8]], P.goldShine);
  r.fillPoly([[30, 14], [34, 10], [38, 14], [34, 12]], P.goldShine);
}

function techEmblem(id: string): Raster {
  // unit/building-line upgrades reuse the target's icon + gold chevron
  const def = techs[id];
  const up = def?.effects.find((e) => e.kind === 'upgradeUnit');
  if (up && up.kind === 'upgradeUnit') {
    const base = units[up.to] ? unitIcon(up.to) : buildingIcon(up.to);
    chevron(base);
    return base;
  }

  const r = chrome();
  const draw: Record<string, () => void> = {
    age: () => {
      wallBox(r, 8, 32, 18, 34, P.stoneBase, P.stoneLight);
      r.fillPoly([[12, 18], [20, 10], [28, 18]], P.stoneLight);
      r.fillRect(15, 20, 10, 14, P.uiWoodDark);
    },
    anvilSword: () => {
      r.fillRect(10, 24, 16, 5, P.metalDark);
      r.fillRect(14, 29, 8, 4, P.metalDark);
      r.fillPoly([[26, 24], [31, 24], [28, 27]], P.metalDark);
      r.line(28, 6, 16, 22, P.metalLight);
      r.line(29, 7, 17, 23, P.metalLight);
    },
    arrowUp: () => {
      r.fillRect(19, 12, 2, 20, P.woodPale);
      r.fillPoly([[20, 6], [15, 14], [25, 14]], P.metalLight);
      r.fillPoly([[16, 32], [20, 26], [24, 32], [20, 30]], P.clothLight);
    },
    cuirass: () => {
      r.fillPoly([[13, 10], [27, 10], [30, 16], [28, 30], [20, 34], [12, 30], [10, 16]], P.metalBase);
      r.fillPoly([[13, 10], [19, 10], [19, 33], [12, 30], [10, 16]], P.metalLight);
      r.fillRect(17, 10, 6, 2, P.metalDark); // collar
    },
    barding: () => {
      r.fillPoly([[12, 32], [12, 18], [18, 10], [26, 12], [28, 18], [22, 20], [20, 32]], P.woodBase);
      r.fillPoly([[16, 12], [26, 12], [28, 18], [22, 20], [20, 14]], P.metalBase); // chanfron
      r.set(25, 15, P.outline);
      r.fillRect(17, 8, 2, 3, P.woodDark);
      r.fillRect(23, 9, 2, 3, P.woodDark);
    },
    jerkin: () => {
      r.fillEllipse(20, 12, 5, 5, P.clothDark); // hood
      r.fillEllipse(20, 14, 3, 3, P.skinShadow);
      r.fillPoly([[12, 34], [14, 20], [26, 20], [28, 34]], P.clothBase);
      r.fillPoly([[12, 34], [14, 20], [19, 20], [19, 34]], P.clothLight);
    },
    wheat: () => {
      // full sheaf: thick stalks + fat grain heads + binding
      for (const dx of [-5, 0, 5]) {
        const hx2 = 20 + Math.round(dx / 2);
        r.line(20 + dx, 34, hx2, 20, P.thatchBase);
        r.line(21 + dx, 34, hx2 + 1, 20, P.thatchDark);
        r.fillEllipse(hx2, 15, 2, 5, P.thatchLight);
        r.set(hx2, 9, P.thatchLight); // awn tip
      }
      r.fillRect(14, 27, 13, 3, P.clothDark); // binding
      r.fillRect(14, 27, 13, 1, P.clothBase);
    },
    axeLog: () => {
      r.fillRect(8, 26, 22, 5, P.woodBase);
      r.fillEllipse(8, 28, 2, 2, P.woodPale);
      r.line(28, 8, 20, 22, P.woodBase);
      r.fillRect(17, 20, 6, 4, P.metalLight);
    },
    saw: () => {
      r.fillRect(8, 26, 22, 5, P.woodBase);
      r.fillEllipse(8, 28, 2, 2, P.woodPale);
      r.fillRect(10, 14, 20, 3, P.metalLight);
      for (let x = 10; x < 30; x += 2) r.set(x, 17, P.metalLight);
      r.fillRect(7, 12, 3, 6, P.woodDark);
      r.fillRect(30, 12, 3, 6, P.woodDark);
    },
    pickCoin: () => {
      r.fillEllipse(24, 26, 6, 5, P.goldBase);
      r.set(22, 24, P.goldShine);
      r.line(10, 26, 24, 10, P.woodBase);
      r.fillPoly([[18, 6], [30, 12], [26, 14], [16, 10]], P.metalBase);
    },
    pickBlock: () => {
      r.fillRect(18, 22, 12, 9, P.stonePale);
      r.fillRect(18, 22, 12, 2, P.highlight);
      r.line(10, 26, 24, 10, P.woodBase);
      r.fillPoly([[18, 6], [30, 12], [26, 14], [16, 10]], P.metalBase);
    },
    loom: () => {
      r.fillRect(10, 14, 14, 16, P.clothLight);
      r.fillRect(10, 14, 14, 3, P.clothDark);
      r.fillRect(10, 27, 14, 3, P.clothDark);
      r.line(28, 10, 28, 30, P.woodBase); // spindle
      r.fillEllipse(28, 18, 2, 5, P.clothBase);
    },
    barrow: () => {
      r.fillPoly([[10, 18], [28, 18], [25, 26], [13, 26]], P.woodBase);
      r.line(28, 18, 34, 14, P.woodDark);
      r.fillEllipse(14, 30, 4, 4, P.woodDark);
      r.fillEllipse(14, 30, 1, 1, P.woodPale);
    },
    cart: () => {
      r.fillPoly([[8, 16], [30, 16], [28, 24], [10, 24]], P.woodBase);
      r.line(30, 18, 36, 16, P.woodDark);
      for (const wx of [13, 25]) {
        r.fillEllipse(wx, 28, 4, 4, P.woodDark);
        r.fillEllipse(wx, 28, 1, 1, P.woodPale);
      }
    },
    ballistics: () => {
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        r.set(Math.round(8 + 24 * t), Math.round(28 - 22 * Math.sin(Math.PI * t)), P.goldDark);
      }
      r.line(26, 10, 32, 14, P.woodPale);
      r.fillPoly([[33, 15], [30, 10], [35, 12]], P.metalLight);
    },
    masonry: () => {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          r.fillRect(8 + col * 8 + (row % 2) * 4, 20 + row * 5, 7, 4, P.stoneBase);
        }
      }
      r.fillPoly([[14, 8], [24, 8], [19, 16]], P.metalLight); // trowel
      r.fillRect(18, 4, 2, 5, P.woodBase);
    },
    murderHoles: () => {
      r.fillRect(8, 8, 24, 24, P.outline);
      for (let x = 10; x <= 30; x += 4) r.fillRect(x, 8, 1, 24, P.metalDark);
      for (let y = 10; y <= 30; y += 4) r.fillRect(8, y, 24, 1, P.metalDark);
    },
    chemistry: () => {
      r.fillEllipse(20, 26, 7, 6, P.waterLight);
      r.fillRect(18, 12, 4, 9, P.waterLight);
      r.paintWhere((x, y) => Raster.inEllipse(x, y, 20, 27, 5, 4), P.goldShine);
      r.fillRect(17, 11, 6, 2, P.stoneLight);
    },
    siegeEng: () => {
      r.fillRect(8, 20, 20, 6, P.woodBase);
      r.fillEllipse(8, 23, 2, 3, P.woodPale);
      r.fillRect(26, 18, 6, 10, P.metalBase); // capped head
      r.fillRect(30, 21, 4, 4, P.metalLight);
    },
    sunburst: () => {
      r.fillEllipse(20, 20, 5, 5, P.goldShine);
      for (const [dx, dy] of [[0, -9], [0, 9], [-9, 0], [9, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]] as const) {
        r.line(20 + Math.sign(dx) * 6, 20 + Math.sign(dy) * 6, 20 + dx, 20 + dy, P.goldBase);
      }
    },
    book: () => {
      r.fillPoly([[8, 14], [20, 17], [20, 32], [8, 29]], P.parchLight);
      r.fillPoly([[32, 14], [20, 17], [20, 32], [32, 29]], P.parchLight);
      r.fillRect(19, 17, 2, 15, P.clothDark);
      r.line(10, 19, 18, 21, P.parchDark);
      r.line(22, 21, 30, 19, P.parchDark);
      r.line(10, 23, 18, 25, P.parchDark);
      r.line(22, 25, 30, 23, P.parchDark);
    },
    schiltron: () => {
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        const x = Math.round(20 + 10 * Math.cos(t));
        const y = Math.round(20 + 8 * Math.sin(t));
        r.line(20 + Math.round(4 * Math.cos(t)), 20 + Math.round(3 * Math.sin(t)), x, y, P.woodBase);
        r.set(x, y, P.metalLight);
      }
    },
    crossedAxes: () => {
      r.line(10, 30, 28, 8, P.woodBase);
      r.line(30, 30, 12, 8, P.woodBase);
      r.fillRect(26, 6, 5, 4, P.metalLight);
      r.fillRect(9, 6, 5, 4, P.metalLight);
    },
    longbowDrawn: () => {
      for (let y = 6; y <= 34; y++) {
        const t = (y - 6) / 28;
        r.set(Math.round(24 + 5 * Math.sin(Math.PI * t)), y, P.woodPale);
      }
      r.line(24, 6, 14, 20, P.clothLight);
      r.line(24, 34, 14, 20, P.clothLight);
      r.line(14, 20, 30, 20, P.woodPale); // nocked arrow
      r.fillPoly([[31, 20], [28, 18], [28, 22]], P.metalLight);
    },
    trebArm: () => {
      r.line(8, 30, 32, 8, P.woodBase);
      r.line(9, 31, 33, 9, P.woodBase);
      r.line(32, 8, 35, 16, P.clothLight); // sling
      r.fillEllipse(35, 18, 2, 2, P.stoneBase);
      r.fillRect(6, 26, 6, 6, P.metalDark);
    },
  };

  const groups: Array<[string[], string]> = [
    [['feudalAge', 'castleAge', 'imperialAge'], 'age'],
    [['forging', 'ironCasting', 'blastFurnace'], 'anvilSword'],
    [['fletching', 'bodkinArrow', 'bracer'], 'arrowUp'],
    [['scaleMailArmor', 'chainMailArmor', 'plateMailArmor'], 'cuirass'],
    [['scaleBardingArmor', 'chainBardingArmor', 'plateBardingArmor'], 'barding'],
    [['paddedArcherArmor', 'leatherArcherArmor', 'ringArcherArmor'], 'jerkin'],
    [['horseCollar', 'heavyPlow', 'cropRotation'], 'wheat'],
    [['doubleBitAxe'], 'axeLog'],
    [['bowSaw', 'twoManSaw'], 'saw'],
    [['goldMining', 'goldShaftMining'], 'pickCoin'],
    [['stoneMining', 'stoneShaftMining'], 'pickBlock'],
    [['loom'], 'loom'],
    [['wheelbarrow'], 'barrow'],
    [['handCart'], 'cart'],
    [['ballistics'], 'ballistics'],
    [['masonry', 'architecture'], 'masonry'],
    [['murderHoles'], 'murderHoles'],
    [['chemistry'], 'chemistry'],
    [['siegeEngineers'], 'siegeEng'],
    [['sanctity', 'fervor', 'faith'], 'sunburst'],
    [['blockPrinting'], 'book'],
    [['schiltron'], 'schiltron'],
    [['highlandFury'], 'crossedAxes'],
    [['yeomanLevy'], 'longbowDrawn'],
    [['ludgar'], 'trebArm'],
  ];

  let matched = false;
  for (const [ids, key] of groups) {
    const tierIdx = ids.indexOf(id);
    if (tierIdx >= 0) {
      draw[key]();
      // tiers within a line add 1/2/3 pips (saw group continues the axe line at tier 2)
      if (key === 'saw') pips(r, tierIdx + 2);
      else if (ids.length > 1) pips(r, tierIdx + 1);
      matched = true;
      break;
    }
  }
  if (!matched) {
    // fallback: rolled scroll (unmapped techs stay visibly generic, never crash)
    r.fillRect(10, 14, 20, 14, P.parchBase);
    r.fillEllipse(10, 21, 2, 7, P.parchDark);
    r.fillEllipse(30, 21, 2, 7, P.parchLight);
    r.line(14, 18, 26, 18, P.parchDark);
    r.line(14, 22, 26, 22, P.parchDark);
  }
  r.outlinePass();
  return r;
}

// ---------------------------------------------------------------- entry

export function genIcons(): FrameDef[] {
  const frames: FrameDef[] = [];
  const anchor = { x: 0, y: 0 };
  const push = (name: string, raster: Raster) => {
    frames.push({ name, raster, anchor });
    frames.push({ name: `${name}/gray`, raster: grayIcon(raster), anchor });
  };

  for (const id of Object.keys(units)) push(`icon/${id}`, unitIcon(id));
  for (const id of Object.keys(buildings)) push(`icon/${id}`, buildingIcon(id));
  for (const id of Object.keys(resources)) push(`icon/${id}`, resourceIcon(id));
  for (const id of Object.keys(techs)) push(`icon/tech/${id}`, techEmblem(id));
  for (const res of ['food', 'wood', 'gold', 'stone']) push(`icon/res/${res}`, resTypeIcon(res));
  for (const verb of CMD_VERBS) push(`icon/cmd/${verb}`, cmdIcon(verb));

  return frames;
}
