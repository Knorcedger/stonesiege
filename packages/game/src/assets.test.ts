import { describe, expect, it, vi } from 'vitest';
import {
  assertCompleteHdArtwork, boundedAssetLoad, HD_LOAD_CONCURRENCY, mapWithConcurrency,
  parseHdManifest, settleAssetPack, shouldLoadHdArtwork,
} from './assets';

describe('bounded artwork-pack loading', () => {
  it('skips HD discovery only for the explicit developer comparison mode', () => {
    expect(shouldLoadHdArtwork(undefined)).toBe(true);
    expect(shouldLoadHdArtwork('hd')).toBe(true);
    expect(shouldLoadHdArtwork('standard')).toBe(false);
  });

  it('accepts only a complete declared HD frame set in normal play', () => {
    const manifest = { atlases: ['units-0.json', 'units-1.json'], frameCount: 240 };
    expect(() => assertCompleteHdArtwork('hd', manifest, 240)).not.toThrow();
    expect(() => assertCompleteHdArtwork(undefined, manifest, 240)).not.toThrow();
    expect(() => assertCompleteHdArtwork('hd', manifest, 180)).toThrow(
      'only 180 of 240 HD frames loaded',
    );
  });

  it('rejects a missing HD manifest before normal gameplay starts', () => {
    expect(() => assertCompleteHdArtwork('hd', { atlases: [] }, 0)).toThrow(
      'HD manifest was unavailable',
    );
  });

  it('keeps incomplete HD discovery irrelevant to explicit pixel-source mode', () => {
    expect(() => assertCompleteHdArtwork('standard', { atlases: [] }, 0)).not.toThrow();
  });

  it('uses the fallback when a pack does not settle before its deadline', async () => {
    vi.useFakeTimers();
    try {
      const loaded = boundedAssetLoad(
        (signal) => new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
        'standard-art',
        1_000,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(loaded).resolves.toBe('standard-art');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the fallback when optional HD loading is cancelled', async () => {
    const controller = new AbortController();
    const loaded = boundedAssetLoad(
      (signal) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
      'standard-art',
      20_000,
      controller.signal,
    );
    controller.abort();
    await expect(loaded).resolves.toBe('standard-art');
  });

  it('records settled packs and fallback use without exceeding the total', () => {
    const first = settleAssetPack({ completed: 0, total: 2, fallback: 0 }, false);
    const second = settleAssetPack(first, true);
    expect(second).toEqual({ completed: 2, total: 2, fallback: 1 });
    expect(settleAssetPack(second, true)).toEqual(second);
  });

  it('ignores malformed HD manifest fields instead of escaping the fallback path', () => {
    expect(parseHdManifest({
      atlases: ['terrain-0.json', null, 42, '', '../outside.json', 'units-0.json'],
      frameCount: -1,
    })).toEqual({ atlases: ['terrain-0.json', 'units-0.json'] });
    expect(parseHdManifest(null)).toEqual({ atlases: [] });
  });
});

describe('cold-cache artwork loading', () => {
  it('never runs more transfers at once than the lane budget', async () => {
    let inFlight = 0;
    let peak = 0;
    const files = Array.from({ length: 36 }, (_, i) => `atlas-${i}.json`);

    const seen = await mapWithConcurrency(files, HD_LOAD_CONCURRENCY, async (file) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return file;
    });

    expect(peak).toBeLessThanOrEqual(HD_LOAD_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);          // still parallel, just bounded
    expect(seen).toEqual(files);              // and results stay in manifest order
  });

  it('keeps a slow file from stalling the lanes behind it', async () => {
    const order: number[] = [];
    let release = (): void => {};
    const blocked = new Promise<void>((resolve) => { release = resolve; });

    const run = mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, async (n) => {
      if (n === 0) await blocked;             // one lane parks on a stalled transfer
      order.push(n);
      return n;
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).not.toContain(0);           // the other lanes drained meanwhile
    expect(order.length).toBeGreaterThan(0);
    release();
    expect(await run).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('retries a stalled pack instead of degrading the set on the first failure', async () => {
    let attempts = 0;
    const loaded = await boundedAssetLoad(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('stalled');
        return 'hd-atlas';
      },
      'missing',
      50,
      undefined,
      2,
    );

    expect(attempts).toBe(2);
    expect(loaded).toBe('hd-atlas');
  });

  it('gives up on the fallback once the attempts are spent', async () => {
    let attempts = 0;
    const loaded = await boundedAssetLoad(
      async () => { attempts += 1; throw new Error('offline'); },
      'missing',
      50,
      undefined,
      2,
    );

    expect(attempts).toBe(2);
    expect(loaded).toBe('missing');
  });

  it('does not retry into a caller that already gave up', async () => {
    const controller = new AbortController();
    controller.abort();
    let attempts = 0;

    const loaded = await boundedAssetLoad(
      async () => { attempts += 1; return 'hd-atlas'; },
      'missing',
      50,
      controller.signal,
      3,
    );

    expect(attempts).toBe(0);
    expect(loaded).toBe('missing');
  });
});
