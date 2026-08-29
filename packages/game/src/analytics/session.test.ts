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
const nextSessionId = (): string => `session-${++counter}`;

describe('resolveAnalyticsSession', () => {
  it('mints an id on the first boot of a session and stores it', () => {
    const store = memoryStore();
    const first = resolveAnalyticsSession(store, () => 'session-a');
    expect(first).toEqual({ sessionId: 'session-a', isNewSession: true });
    expect(JSON.parse(store.data.get(SESSION_KEY)!))
      .toEqual({ sessionId: 'session-a' });
  });

  it('reuses the session id across the reload every match exit performs', () => {
    const store = memoryStore();
    const launch = resolveAnalyticsSession(store, nextSessionId);
    const afterMatchExit = resolveAnalyticsSession(store, nextSessionId);
    const afterSecondExit = resolveAnalyticsSession(store, nextSessionId);
    expect(afterMatchExit.sessionId).toBe(launch.sessionId);
    expect(afterSecondExit.sessionId).toBe(launch.sessionId);
    expect(afterMatchExit.isNewSession).toBe(false);
    expect(afterSecondExit.isNewSession).toBe(false);
  });

  it('treats a fresh store as a fresh launch, so the identity never outlives the session', () => {
    const closed = resolveAnalyticsSession(memoryStore(), () => 'session-a');
    const reopened = resolveAnalyticsSession(memoryStore(), () => 'session-b');
    expect(closed.sessionId).not.toBe(reopened.sessionId);
    expect(reopened.isNewSession).toBe(true);
  });

  it('re-mints rather than sending a malformed record', () => {
    for (const stored of [
      '', 'not json', '{}', '{"sessionId":""}', '{"sessionId":"bad id"}',
      `{"sessionId":"${'x'.repeat(65)}"}`,
    ]) {
      const store = memoryStore({ [SESSION_KEY]: stored });
      expect(resolveAnalyticsSession(store, () => 'session-a'))
        .toEqual({ sessionId: 'session-a', isNewSession: true });
    }
  });

  it('degrades to an in-memory identity when storage is unavailable or denied', () => {
    const throwing: SessionStore = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    expect(resolveAnalyticsSession(throwing, () => 'session-a'))
      .toEqual({ sessionId: 'session-a', isNewSession: true });
    expect(resolveAnalyticsSession(null, () => 'session-b'))
      .toEqual({ sessionId: 'session-b', isNewSession: true });
  });

  it('still returns a usable identity when the store refuses writes only', () => {
    const readOnly: SessionStore = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(resolveAnalyticsSession(readOnly, () => 'session-a'))
      .toEqual({ sessionId: 'session-a', isNewSession: true });
  });
});
