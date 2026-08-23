// Persistent artwork byte cache (issue #149).
//
// The HD set is ~41 MB across 72 files and static hosting serves it with
// `max-age=0, must-revalidate`, so every visit pays at least one conditional
// round-trip per file through the bounded HD lanes — and the full transfer
// again whenever the browser evicts the bytes. This store keeps atlas
// responses in Cache Storage keyed by `url?v=<content hash>` from the
// always-revalidated HD manifest:
// - a warm boot resolves every HD file locally, with zero requests;
// - an art drop re-fetches only the files whose stamped hash changed;
// - prune() drops entries the current boot no longer references.
// Downloaded bytes are verified against their stamped hash before being
// stored (same algorithm as tools/hd-art/manifestHash.ts: lowercase hex
// sha256 prefix), so a half-updated host can never seed the cache with bytes
// that disagree with the manifest.
//
// The store is deliberately absent on localhost origins: the dev server must
// serve freshly regenerated art, and the Capacitor shells already read every
// asset from the app bundle. Anywhere Cache Storage is missing or refuses to
// open (insecure contexts, some private-browsing modes), and on any cache
// read/write failure, callers get the plain network path unchanged.

export const ARTWORK_CACHE_NAME = 'bf-artwork-v1';

/** The slice of the Cache API the store touches — injectable in node tests. */
export interface ArtworkCacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<unknown>;
  keys(): Promise<ReadonlyArray<{ url: string }>>;
}

export interface ArtworkStoreEnv {
  caches?: Pick<CacheStorage, 'open'>;
  origin?: { protocol: string; hostname: string };
  /** Base for resolving relative asset URLs; defaults to the document. */
  baseUrl?: string;
}

/** Cache reads and writes are conveniences: a failing one must cost nothing. */
async function attempt<T>(op: () => Promise<T>): Promise<T | undefined> {
  try {
    return await op();
  } catch {
    return undefined;
  }
}

async function contentHashOf(bytes: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await attempt(() => subtle.digest('SHA-256', bytes));
  if (!digest) return null;
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class ArtworkStore {
  /** Absolute URLs this boot resolved; prune() keeps exactly these. */
  private readonly touched = new Set<string>();

  constructor(
    private readonly cache: ArtworkCacheLike,
    private readonly baseUrl?: string,
  ) {}

  /**
   * Cache keys must be one canonical form: Cache Storage stores absolute URLs,
   * so relative fetch URLs are resolved before they reach it or `touched`.
   */
  private absolute(url: string): string {
    try {
      const base = this.baseUrl
        ?? (typeof document !== 'undefined' ? document.baseURI : undefined);
      return new URL(url, base).toString();
    } catch {
      return url;
    }
  }

  /**
   * Resolve one hash-pinned artwork file: cached bytes when present, the
   * network otherwise. Network bytes are verified against `hash` before being
   * stored; mismatched or unverifiable bytes are still returned — the render
   * proceeds with what the server sent, exactly as it would without a store —
   * but never cached, so they cannot poison later visits.
   */
  async fetchVersioned(url: string, hash: string, signal?: AbortSignal): Promise<Response> {
    const versioned = this.absolute(`${url}?v=${hash}`);
    this.touched.add(versioned);
    const hit = await attempt(() => this.cache.match(versioned));
    if (hit) return hit;
    const response = await fetch(versioned, { signal });
    if (!response.ok) return response;
    const bytes = await response.arrayBuffer();
    const restored = (): Response => new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    const digest = await contentHashOf(bytes);
    if (digest === null || digest.startsWith(hash)) {
      await attempt(() => this.cache.put(versioned, restored()));
    } else {
      console.warn(`[assets] ${url} does not match its manifest hash — using it uncached`);
    }
    return restored();
  }

  /** Keep a fresh manifest response for boots whose next revalidation fails. */
  async writeThrough(url: string, response: Response): Promise<void> {
    const key = this.absolute(url);
    this.touched.add(key);
    await attempt(() => this.cache.put(key, response));
  }

  /** Last stored copy of an unversioned entry (the manifest), if any. */
  async readFallback(url: string): Promise<Response | undefined> {
    const key = this.absolute(url);
    this.touched.add(key);
    return attempt(() => this.cache.match(key));
  }

  /** A live "this deployment ships no HD art" answer must erase stale copies. */
  async drop(url: string): Promise<void> {
    await attempt(() => this.cache.delete(this.absolute(url)));
  }

  /**
   * Delete every entry this boot did not touch. Callers gate this on a proven
   * complete load: pruning after a partial or aborted boot would evict files
   * the next boot still needs.
   */
  async prune(): Promise<void> {
    const keys = await attempt(() => this.cache.keys());
    if (!keys) return;
    for (const key of keys) {
      if (!this.touched.has(key.url)) await attempt(() => this.cache.delete(key.url));
    }
  }
}

export async function openArtworkStore(env: ArtworkStoreEnv = {}): Promise<ArtworkStore | null> {
  try {
    const caches = env.caches
      ?? (typeof globalThis.caches === 'undefined' ? undefined : globalThis.caches);
    const origin = env.origin ?? (typeof location === 'undefined' ? undefined : location);
    if (!caches || !origin) return null;
    if (origin.protocol !== 'https:' && origin.protocol !== 'http:') return null;
    if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(origin.hostname)) return null;
    return new ArtworkStore(await caches.open(ARTWORK_CACHE_NAME), env.baseUrl);
  } catch {
    return null;
  }
}
