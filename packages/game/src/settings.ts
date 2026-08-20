// Player settings: audio volumes, camera/HUD sizing, HP-bar visibility and help detail. Loaded once
// at boot, cached in a module singleton (input/world/audio/HUD read it live),
// persisted through the storage seam on every change.

import { appStorage, type KeyValueStorage } from './storage';
import { isProductionSpeed, type ProductionSpeed } from '@bf/sim/types';

export interface GameSettings {
  /** 0..1 gain multipliers. */
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  /** Keyboard/edge camera pan multiplier, 0.5..2. */
  cameraSpeed: number;
  /** In-match HUD scale, 0.75..1.25. */
  hudScale: number;
  /** Construction, unit training, research, and stationary gathering multiplier. */
  productionSpeed: ProductionSpeed;
  showHpBars: boolean;
  /** Rich upgrade effects and unit counter advice in the custom HUD tooltips. */
  extendedTooltips: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  sfxVolume: 1,
  ambientVolume: 0.6,
  cameraSpeed: 1,
  hudScale: 1,
  productionSpeed: 2,
  showHpBars: true,
  extendedTooltips: true,
};

const STORAGE_KEY = 'bf.settings.v1';

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** Defensive decode: any malformed field falls back to its default. */
export function decodeSettings(raw: string | null): GameSettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const s = JSON.parse(raw) as Partial<GameSettings>;
    return {
      masterVolume: clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume),
      sfxVolume: clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      ambientVolume: clamp01(s.ambientVolume, DEFAULT_SETTINGS.ambientVolume),
      cameraSpeed: typeof s.cameraSpeed === 'number' && Number.isFinite(s.cameraSpeed)
        ? Math.min(2, Math.max(0.5, s.cameraSpeed))
        : DEFAULT_SETTINGS.cameraSpeed,
      hudScale: typeof s.hudScale === 'number' && Number.isFinite(s.hudScale)
        ? Math.min(1.25, Math.max(0.75, s.hudScale))
        : DEFAULT_SETTINGS.hudScale,
      productionSpeed: isProductionSpeed(s.productionSpeed)
        ? s.productionSpeed
        : DEFAULT_SETTINGS.productionSpeed,
      showHpBars: typeof s.showHpBars === 'boolean' ? s.showHpBars : DEFAULT_SETTINGS.showHpBars,
      extendedTooltips: typeof s.extendedTooltips === 'boolean'
        ? s.extendedTooltips
        : DEFAULT_SETTINGS.extendedTooltips,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

type SettingsListener = (s: GameSettings) => void;

let current: GameSettings | null = null;
const listeners = new Set<SettingsListener>();

/** The live settings (loaded from storage on first access). */
export function getSettings(store: KeyValueStorage = appStorage): GameSettings {
  current ??= decodeSettings(store.get(STORAGE_KEY));
  return current;
}

/** Merge a partial update, persist it, and notify subscribers (audio engine). */
export function updateSettings(
  patch: Partial<GameSettings>,
  store: KeyValueStorage = appStorage,
): GameSettings {
  current = { ...getSettings(store), ...patch };
  store.set(STORAGE_KEY, JSON.stringify(current));
  for (const l of listeners) l(current);
  return current;
}

export function onSettingsChanged(l: SettingsListener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Test hook: drop the cached singleton. */
export function resetSettingsCache(): void {
  current = null;
  listeners.clear();
}
