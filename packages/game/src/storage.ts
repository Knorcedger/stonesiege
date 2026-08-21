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
  /**
   * Like set, but reports whether the write landed. Match saves are the only
   * writes big enough to exhaust a quota, and they need to know: silently
   * dropping one save is fine, silently dropping every save while the player
   * believes their campaigns are safe is not (see persist.ts eviction).
   */
  trySet(key: string, value: string): boolean;
  remove(key: string): void;
}

/** localStorage-backed store; every access is defensive (privacy modes throw). */
function makeLocalStorage(): KeyValueStorage {
  const trySet = (key: string, value: string): boolean => {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false; // quota or privacy mode
    }
  };
  return {
    get(key) {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    trySet,
    set(key, value) {
      // quota/privacy failure: losing a save beats crashing
      trySet(key, value);
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

/**
 * In-memory store for tests (and the base of a future Capacitor cache adapter).
 * `quotaBytes` simulates a full device so the eviction path is testable.
 */
export function makeMemoryStorage(quotaBytes = Infinity): KeyValueStorage {
  const m = new Map<string, string>();
  const used = (without: string): number => {
    let n = 0;
    for (const [k, v] of m) if (k !== without) n += k.length + v.length;
    return n;
  };
  const trySet = (k: string, v: string): boolean => {
    if (used(k) + k.length + v.length > quotaBytes) return false;
    m.set(k, v);
    return true;
  };
  return {
    get: (k) => m.get(k) ?? null,
    trySet,
    set: (k, v) => void trySet(k, v),
    remove: (k) => void m.delete(k),
  };
}

let backend: KeyValueStorage = makeLocalStorage();

/** The app-wide store. Import this, not localStorage. */
export const appStorage: KeyValueStorage = {
  get: (k) => backend.get(k),
  set: (k, v) => backend.set(k, v),
  trySet: (k, v) => backend.trySet(k, v),
  remove: (k) => backend.remove(k),
};

/** Swap the backend (Capacitor adapter, tests). */
export function setStorageBackend(s: KeyValueStorage): void {
  backend = s;
}
