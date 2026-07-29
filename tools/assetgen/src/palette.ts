// ART_BIBLE §1 master palette + §2 player ramps + magenta mask ramp.
// Single source of truth for every color assetgen may paint. The §9.1 palette
// discipline check is derived from these tables — add colors HERE or nowhere.

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const p = (v: number) => v.toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/** ART_BIBLE §1 — the 50 named colors. */
export const PALETTE = {
  // terrain & nature
  grassShadow: hexToRgb('#3F5A26'),
  grassDark: hexToRgb('#527033'),
  grassBase: hexToRgb('#6B8C3F'),
  grassLight: hexToRgb('#87A54F'),
  dirtDark: hexToRgb('#6B4E2E'),
  dirtBase: hexToRgb('#8A683E'),
  dirtLight: hexToRgb('#A8854F'),
  dirtPale: hexToRgb('#C2A268'),
  leafShadow: hexToRgb('#1F3B1E'),
  leafDark: hexToRgb('#2E5426'),
  leafBase: hexToRgb('#3F6E2F'),
  leafLight: hexToRgb('#5B8A3B'),
  waterDeep: hexToRgb('#1D4763'),
  waterBase: hexToRgb('#2C6283'),
  waterLight: hexToRgb('#4884A4'),
  // materials
  woodDark: hexToRgb('#46311E'),
  woodBase: hexToRgb('#6B4C2C'),
  woodLight: hexToRgb('#8F6C43'),
  woodPale: hexToRgb('#B08C5C'),
  stoneDark: hexToRgb('#55555E'),
  stoneBase: hexToRgb('#78787F'),
  stoneLight: hexToRgb('#9C9CA3'),
  stonePale: hexToRgb('#C0C0C6'),
  slateDark: hexToRgb('#3E4654'),
  slateBase: hexToRgb('#5A6474'),
  slateLight: hexToRgb('#7C8798'),
  thatchDark: hexToRgb('#8A6E33'),
  thatchBase: hexToRgb('#B29245'),
  thatchLight: hexToRgb('#D4B562'),
  metalDark: hexToRgb('#4A505A'),
  metalBase: hexToRgb('#78828C'),
  metalLight: hexToRgb('#A7B1BA'),
  goldDark: hexToRgb('#8A6414'),
  goldBase: hexToRgb('#C29422'),
  goldShine: hexToRgb('#E6C04A'),
  // people
  skinShadow: hexToRgb('#8A5A3C'),
  skinBase: hexToRgb('#BE8A5C'),
  skinLight: hexToRgb('#E0B183'),
  clothDark: hexToRgb('#6E5940'),
  clothBase: hexToRgb('#957C56'),
  clothLight: hexToRgb('#B89E73'),
  // UI & utility
  parchDark: hexToRgb('#B99A6B'),
  parchBase: hexToRgb('#DABE8D'),
  parchLight: hexToRgb('#EFDDB5'),
  uiWoodDark: hexToRgb('#2C1F12'),
  uiWoodBase: hexToRgb('#46331F'),
  uiWoodLight: hexToRgb('#64492B'),
  outline: hexToRgb('#1A1208'),
  highlight: hexToRgb('#F4EEDD'),
  berryRed: hexToRgb('#A62E3E'),
} as const;

export type ColorName = keyof typeof PALETTE;

/** The single translucent value allowed inside sprite frames (ART_BIBLE §0.4, §9.1). */
export const SHADOW_RGBA: readonly [number, number, number, number] = [0, 0, 0, 88];

/** Magenta mask ramp (ASSET_CONTRACT §player-colors) — light / mid / dark. */
export const MASK = {
  light: hexToRgb('#FF00FF'),
  mid: hexToRgb('#CC00CC'),
  dark: hexToRgb('#990099'),
} as const;

export const MASK_HEX: readonly string[] = ['#ff00ff', '#cc00cc', '#990099'];

export interface PlayerRamp {
  name: string;
  light: string;
  mid: string;
  dark: string;
}

/** ART_BIBLE §2 — 8 player color ramps, index 0..7 (blue red green yellow cyan purple gray orange). */
export const PLAYER_RAMPS: readonly PlayerRamp[] = [
  { name: 'blue', light: '#5c8cd6', mid: '#2f5fb5', dark: '#1c3b76' },
  { name: 'red', light: '#e06050', mid: '#b3261e', dark: '#711512' },
  { name: 'green', light: '#6cbf5c', mid: '#3e8c34', dark: '#24591e' },
  { name: 'yellow', light: '#f2d45c', mid: '#d4a82a', dark: '#8e6e14' },
  { name: 'cyan', light: '#7ad2d2', mid: '#38a6aa', dark: '#1d6c70' },
  { name: 'purple', light: '#b07cd6', mid: '#7e44a8', dark: '#4c2370' },
  { name: 'gray', light: '#c9c9cf', mid: '#92929b', dark: '#5a5a64' },
  { name: 'orange', light: '#f0a04e', mid: '#d26a1e', dark: '#8c4212' },
] as const;

function key(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/** Opaque-pixel whitelist for the §9.1 palette check: master palette ∪ player ramps. */
export function allowedOpaqueSet(includeMask: boolean): Set<number> {
  const s = new Set<number>();
  for (const c of Object.values(PALETTE)) s.add(key(c[0], c[1], c[2]));
  for (const ramp of PLAYER_RAMPS) {
    for (const hex of [ramp.light, ramp.mid, ramp.dark]) {
      const [r, g, b] = hexToRgb(hex);
      s.add(key(r, g, b));
    }
  }
  if (includeMask) for (const c of [MASK.light, MASK.mid, MASK.dark]) s.add(key(c[0], c[1], c[2]));
  return s;
}

export function isMaskColor(r: number, g: number, b: number): boolean {
  return (
    (r === 255 && g === 0 && b === 255) ||
    (r === 204 && g === 0 && b === 204) ||
    (r === 153 && g === 0 && b === 153)
  );
}

export function pixelKey(r: number, g: number, b: number): number {
  return key(r, g, b);
}
