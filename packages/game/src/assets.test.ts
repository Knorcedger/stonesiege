import { describe, expect, it, vi } from 'vitest';
import {
  assertCompleteHdArtwork, boundedAssetLoad, parseHdManifest, settleAssetPack,
  shouldLoadHdArtwork,
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
