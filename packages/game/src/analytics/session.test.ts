// The session-scoped identity: survives the match-exit reload, dies with the
// tab, and never becomes a persistent identifier.

import { describe, expect, it } from 'vitest';
import { resolveAnalyticsSession, SESSION_KEY, type SessionStore } from './session';

function memoryStore(seed: Record<string, string> = {}): SessionStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

let counter = 0;
const nextClientId = (): string => `client-${++counter}`;
const nextSessionId = (): string => `${1_700_000_000 + counter}`;

describe('resolveAnalyticsSession', () => {
  it('mints both ids on the first boot of a session and stores them together', () => {
    const store = memoryStore();
    const first = resolveAnalyticsSession(store, () => 'uuid-a', () => '1700000001');
    expect(first).toEqual({ clientId: 'uuid-a', sessionId: '1700000001', isNewSession: true });
    expect(JSON.parse(store.data.get(SESSION_KEY)!))
      .toEqual({ clientId: 'uuid-a', sessionId: '1700000001' });
  });

  it('reuses client AND session id across the reload every match exit performs', () => {
    const store = memoryStore();
    const launch = resolveAnalyticsSession(store, nextClientId, nextSessionId);
    const afterMatchExit = resolveAnalyticsSession(store, nextClientId, nextSessionId);
    const afterSecondExit = resolveAnalyticsSession(store, nextClientId, nextSessionId);
    expect(afterMatchExit.clientId).toBe(launch.clientId);
    expect(afterSecondExit.clientId).toBe(launch.clientId);
    // Cookieless GA4 keeps no session cookie, so a drifting session id here
    // would report one sitting as several sessions.
    expect(afterMatchExit.sessionId).toBe(launch.sessionId);
    expect(afterSecondExit.sessionId).toBe(launch.sessionId);
    expect(afterMatchExit.isNewSession).toBe(false);
    expect(afterSecondExit.isNewSession).toBe(false);
  });

  it('treats a fresh store as a fresh launch, so the identity never outlives the session', () => {
    const closed = resolveAnalyticsSession(memoryStore(), () => 'uuid-a', () => '1');
    const reopened = resolveAnalyticsSession(memoryStore(), () => 'uuid-b', () => '2');
    expect(closed.clientId).not.toBe(reopened.clientId);
    expect(reopened.isNewSession).toBe(true);
  });

  it('re-mints rather than sending a malformed or half-written record', () => {
    for (const stored of ['', 'not json', '{}', '{"clientId":"a"}', '{"clientId":"","sessionId":"1"}']) {
      const store = memoryStore({ [SESSION_KEY]: stored });
      expect(resolveAnalyticsSession(store, () => 'uuid-a', () => '1700000001'))
        .toEqual({ clientId: 'uuid-a', sessionId: '1700000001', isNewSession: true });
    }
  });

  it('degrades to an in-memory identity when storage is unavailable or denied', () => {
    const throwing: SessionStore = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    expect(resolveAnalyticsSession(throwing, () => 'uuid-a', () => '1'))
      .toEqual({ clientId: 'uuid-a', sessionId: '1', isNewSession: true });
    expect(resolveAnalyticsSession(null, () => 'uuid-b', () => '2'))
      .toEqual({ clientId: 'uuid-b', sessionId: '2', isNewSession: true });
  });

  it('still returns a usable identity when the store refuses writes only', () => {
    const readOnly: SessionStore = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(resolveAnalyticsSession(readOnly, () => 'uuid-a', () => '1'))
      .toEqual({ clientId: 'uuid-a', sessionId: '1', isNewSession: true });
  });
});
