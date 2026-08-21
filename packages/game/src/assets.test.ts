import { describe, expect, it, vi } from 'vitest';
import { boundedAssetLoad, parseHdManifest, settleAssetPack } from './assets';

describe('bounded artwork-pack loading', () => {
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
