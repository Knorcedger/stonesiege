import { describe, expect, it } from 'vitest';
import { randomAnalyticsId } from './id';

describe('randomAnalyticsId', () => {
  it('returns backend-safe, non-empty identifiers', () => {
    const first = randomAnalyticsId();
    const second = randomAnalyticsId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(second).not.toBe(first);
  });
});
