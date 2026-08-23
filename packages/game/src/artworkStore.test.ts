import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtworkStore, openArtworkStore, type ArtworkCacheLike } from './artworkStore';

const BASE = 'https://play.example/';

class FakeCache implements ArtworkCacheLike {
  entries = new Map<string, { bytes: Uint8Array; status: number }>();
  puts = 0;

  async match(url: string): Promise<Response | undefined> {
    const entry = this.entries.get(url);
    if (!entry) return undefined;
    return new Response(entry.bytes.slice(), { status: entry.status });
  }

  async put(url: string, response: Response): Promise<void> {
    this.puts += 1;
    this.entries.set(url, {
      bytes: new Uint8Array(await response.arrayBuffer()),
      status: response.status,
    });
  }

  async delete(url: string): Promise<boolean> {
    return this.entries.delete(url);
  }

  async keys(): Promise<Array<{ url: string }>> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

/** Same algorithm the HD build stamps into the manifest. */
const hashOf = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

/** A static host: serves by path, ignoring the ?v= cache-buster. */
function stubNetwork(files: Record<string, string>): string[] {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    const path = url.replace(BASE, '').replace(/\?.*$/, '');
    const body = files[path];
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(body, { status: 200 });
  }));
  return requests;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('persistent artwork store', () => {
  it('pays the network once and serves later boots from the cache', async () => {
    const cache = new FakeCache();
    const body = '{"frames":{"terr/grass/0":{}}}';
    const requests = stubNetwork({ 'assets/hd/terrain-0.json': body });

    const coldBoot = new ArtworkStore(cache, BASE);
    const first = await coldBoot.fetchVersioned('assets/hd/terrain-0.json', hashOf(body));
    expect(await first.text()).toBe(body);
    expect(requests).toEqual([`${BASE}assets/hd/terrain-0.json?v=${hashOf(body)}`]);

    const warmBoot = new ArtworkStore(cache, BASE);
    const second = await warmBoot.fetchVersioned('assets/hd/terrain-0.json', hashOf(body));
    expect(await second.text()).toBe(body);
    expect(requests).toHaveLength(1);
  });

  it('refuses to store bytes that disagree with the manifest hash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = new FakeCache();
    const store = new ArtworkStore(cache, BASE);
    const requests = stubNetwork({ 'assets/hd/units-0.webp': 'stale-deploy-bytes' });
    const promised = hashOf('the bytes the manifest promised');

    const served = await store.fetchVersioned('assets/hd/units-0.webp', promised);
    expect(await served.text()).toBe('stale-deploy-bytes'); // render still proceeds
    expect(cache.puts).toBe(0);

    await store.fetchVersioned('assets/hd/units-0.webp', promised);
    expect(requests).toHaveLength(2); // nothing was cached to serve
    expect(warn).toHaveBeenCalledTimes(2); // each rejected transfer says so
  });

  it('never stores bytes it could not verify, even matching ones', async () => {
    vi.stubGlobal('crypto', {}); // an origin without WebCrypto
    const cache = new FakeCache();
    const store = new ArtworkStore(cache, BASE);
    const body = 'atlas bytes';
    const requests = stubNetwork({ 'assets/hd/objects-0.webp': body });

    const served = await store.fetchVersioned('assets/hd/objects-0.webp', hashOf(body));
    expect(await served.text()).toBe(body); // render proceeds from the network
    expect(cache.puts).toBe(0); // but nothing gets pinned under the hash key

    await store.fetchVersioned('assets/hd/objects-0.webp', hashOf(body));
    expect(requests).toHaveLength(2);
  });

  it('treats a changed hash as a new entry and prunes the superseded one', async () => {
    const cache = new FakeCache();
    stubNetwork({ 'assets/hd/units-0.webp': 'first art drop' });
    await new ArtworkStore(cache, BASE)
      .fetchVersioned('assets/hd/units-0.webp', hashOf('first art drop'));

    stubNetwork({ 'assets/hd/units-0.webp': 'second art drop' });
    const nextBoot = new ArtworkStore(cache, BASE);
    const updated = await nextBoot.fetchVersioned('assets/hd/units-0.webp', hashOf('second art drop'));
    expect(await updated.text()).toBe('second art drop');
    await nextBoot.prune();

    expect([...cache.entries.keys()]).toEqual([
      `${BASE}assets/hd/units-0.webp?v=${hashOf('second art drop')}`,
    ]);
  });

  it('prune keeps everything the boot touched, cache hits and manifest included', async () => {
    const cache = new FakeCache();
    stubNetwork({ 'assets/hd/a.json': 'atlas a', 'assets/hd/b.json': 'atlas b' });
    const seed = new ArtworkStore(cache, BASE);
    await seed.fetchVersioned('assets/hd/a.json', hashOf('atlas a'));
    await seed.fetchVersioned('assets/hd/b.json', hashOf('atlas b'));
    await seed.writeThrough('assets/hd/manifest.json', new Response('{"atlases":[]}'));

    const nextBoot = new ArtworkStore(cache, BASE);
    await nextBoot.readFallback('assets/hd/manifest.json');
    await nextBoot.fetchVersioned('assets/hd/a.json', hashOf('atlas a')); // cache hit
    await nextBoot.prune();

    expect([...cache.entries.keys()].sort()).toEqual([
      `${BASE}assets/hd/a.json?v=${hashOf('atlas a')}`,
      `${BASE}assets/hd/manifest.json`,
    ]);
  });

  it('keeps a written-through manifest for offline boots until drop() erases it', async () => {
    const store = new ArtworkStore(new FakeCache(), BASE);
    await store.writeThrough('assets/hd/manifest.json', new Response('{"atlases":["a.json"]}'));
    const fallback = await store.readFallback('assets/hd/manifest.json');
    expect(await fallback!.text()).toBe('{"atlases":["a.json"]}');

    await store.drop('assets/hd/manifest.json');
    expect(await store.readFallback('assets/hd/manifest.json')).toBeUndefined();
  });

  it('degrades to the plain network when every cache operation fails', async () => {
    const exploding: ArtworkCacheLike = {
      match: () => Promise.reject(new Error('storage gone')),
      put: () => Promise.reject(new Error('storage gone')),
      delete: () => Promise.reject(new Error('storage gone')),
      keys: () => Promise.reject(new Error('storage gone')),
    };
    const store = new ArtworkStore(exploding, BASE);
    const body = 'atlas bytes';
    const requests = stubNetwork({ 'assets/hd/a.json': body });

    const served = await store.fetchVersioned('assets/hd/a.json', hashOf(body));
    expect(await served.text()).toBe(body);
    expect(requests).toHaveLength(1);
    await expect(store.prune()).resolves.toBeUndefined();
  });
});

describe('opening the artwork store', () => {
  const workingCaches = { open: async () => new FakeCache() as unknown as Cache };
  const webOrigin = { protocol: 'https:', hostname: 'play.example' };

  it('opens on an ordinary web origin', async () => {
    const store = await openArtworkStore({ caches: workingCaches, origin: webOrigin, baseUrl: BASE });
    expect(store).toBeInstanceOf(ArtworkStore);
  });

  it('stays off where Cache Storage is unavailable or refuses to open', async () => {
    expect(await openArtworkStore({ origin: webOrigin })).toBeNull();
    expect(await openArtworkStore({
      caches: { open: () => Promise.reject(new Error('private browsing')) },
      origin: webOrigin,
    })).toBeNull();
  });

  it('stays off for local origins so dev servers and app bundles read fresh files', async () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      expect(await openArtworkStore({
        caches: workingCaches,
        origin: { protocol: 'http:', hostname },
      })).toBeNull();
    }
    expect(await openArtworkStore({
      caches: workingCaches,
      origin: { protocol: 'capacitor:', hostname: 'app' },
    })).toBeNull();
  });
});
