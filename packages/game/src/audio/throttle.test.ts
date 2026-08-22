// SFX throttle policy: concurrency caps, min start gaps, voice expiry, and
// the distance-attenuation curve.

import { describe, expect, it } from 'vitest';
import { SFX_CATEGORY } from './engine';
import { attenuation, DEFAULT_POLICIES, SfxThrottle } from './throttle';

const policies = {
  combat: { maxConcurrent: 2, minGapMs: 50 },
  sting: { maxConcurrent: 1, minGapMs: 1000 },
};

describe('SfxThrottle', () => {
  it('caps concurrent voices per category', () => {
    const t = new SfxThrottle(policies);
    expect(t.request('combat', 0, 500)).toBe(true);
    expect(t.request('combat', 60, 500)).toBe(true);
    // third voice while two still sound: denied
    expect(t.request('combat', 130, 500)).toBe(false);
    expect(t.activeCount('combat', 130)).toBe(2);
  });

  it('frees slots when voices expire', () => {
    const t = new SfxThrottle(policies);
    t.request('combat', 0, 100);
    t.request('combat', 60, 100);
    // both voices are done by t=300 — new requests flow again
    expect(t.activeCount('combat', 300)).toBe(0);
    expect(t.request('combat', 300, 100)).toBe(true);
  });

  it('enforces the minimum start gap even with free slots', () => {
    const t = new SfxThrottle(policies);
    expect(t.request('combat', 0, 10)).toBe(true); // expires immediately
    expect(t.request('combat', 20, 10)).toBe(false); // inside the 50 ms gap
    expect(t.request('combat', 51, 10)).toBe(true);
  });

  it('stings never overlap and never rapid-fire', () => {
    const t = new SfxThrottle(policies);
    expect(t.request('sting', 0, 2000)).toBe(true);
    expect(t.request('sting', 500, 2000)).toBe(false); // still sounding
    expect(t.request('sting', 2100, 2000)).toBe(true); // expired + past the gap
  });

  it('categories are independent, unknown categories are unthrottled', () => {
    const t = new SfxThrottle(policies);
    t.request('combat', 0, 500);
    t.request('combat', 60, 500);
    expect(t.request('sting', 70, 500)).toBe(true);
    for (let i = 0; i < 10; i++) expect(t.request('nopolicy', i, 1000)).toBe(true);
  });
});

describe('DEFAULT_POLICIES', () => {
  // request() lets unknown categories through unthrottled, so a category named
  // in SFX_CATEGORY but missing here fails silently: that voice would stack
  // without limit (a wall of rams as a drum roll) with nothing to catch it.
  it('covers every category a voice is filed under', () => {
    for (const [name, category] of Object.entries(SFX_CATEGORY)) {
      expect(DEFAULT_POLICIES[category], `${name} -> ${category}`).toBeDefined();
    }
  });
});

describe('attenuation', () => {
  it('is full volume near, silent far, monotonic between', () => {
    expect(attenuation(0)).toBe(1);
    expect(attenuation(380)).toBe(1);
    expect(attenuation(1500)).toBe(0);
    expect(attenuation(99999)).toBe(0);
    const mid1 = attenuation(700);
    const mid2 = attenuation(1200);
    expect(mid1).toBeGreaterThan(mid2);
    expect(mid1).toBeLessThan(1);
    expect(mid2).toBeGreaterThan(0);
  });
});
