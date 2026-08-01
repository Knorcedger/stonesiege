// Key-value persistence abstraction. Everything in @bf/game that persists
// (settings, campaign progress, match snapshots) goes through this seam so the
// Capacitor build can swap in Preferences without touching call sites.
//
// The interface is synchronous (menu/game code reads settings inline). The
// Capacitor adapter strategy: hydrate a write-through in-memory cache from
// Preferences at boot, then mirror writes back asynchronously — reads stay sync.

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** localStorage-backed store; every access is defensive (privacy modes throw). */
function makeLocalStorage(): KeyValueStorage {
  return {
    get(key) {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      } catch {
        // quota/privacy failure: losing a save beats crashing
      }
    },
    remove(key) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        /* non-fatal */
      }
    },
  };
}

/** In-memory store for tests (and the base of a future Capacitor cache adapter). */
export function makeMemoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

let backend: KeyValueStorage = makeLocalStorage();

/** The app-wide store. Import this, not localStorage. */
export const appStorage: KeyValueStorage = {
  get: (k) => backend.get(k),
  set: (k, v) => backend.set(k, v),
  remove: (k) => backend.remove(k),
};

/** Swap the backend (Capacitor adapter, tests). */
export function setStorageBackend(s: KeyValueStorage): void {
  backend = s;
}
