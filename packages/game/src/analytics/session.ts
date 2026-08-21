// Session-scoped analytics identity (pure; the caller supplies the store and
// the id generators).
//
// Why sessionStorage and not memory: every match exit does a full
// window.location.reload() (`reloadTo` in game.ts), so purely in-memory ids
// would split one sitting into a dozen "users" and a dozen sessions, making
// duration and funnel numbers meaningless. Why not localStorage: an id that
// survives the app being closed is a persistent identifier, which is exactly
// what the cookieless design refuses to create. sessionStorage sits precisely
// between the two — it survives reloads and dies with the tab or app process.
//
// Both ids are needed. Cookieless GA4 (Consent Mode `analytics_storage:
// 'denied'`) keeps no cookie of its own, so it can persist neither the client
// id nor the session id; supplying only the client id would leave every reload
// starting a fresh session.

export const SESSION_KEY = 'bf.analytics.session.v1';

/** Minimal slice of the Web Storage API this needs (sessionStorage satisfies it). */
export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AnalyticsSession {
  /** GA4 `client_id`. */
  clientId: string;
  /** GA4 `session_id`. Digits only — GA4 treats it as a number. */
  sessionId: string;
  /**
   * True only when this call minted the identity, i.e. the app was genuinely
   * launched rather than reloaded on the way out of a match. `app_open` rides
   * on this so one sitting reports one launch.
   */
  isNewSession: boolean;
}

/** Defensive decode, like every other stored record in this package. */
function decode(raw: string | null): { clientId: string; sessionId: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<'clientId' | 'sessionId', unknown>>;
    const { clientId, sessionId } = parsed;
    if (typeof clientId !== 'string' || clientId.length === 0) return null;
    if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
    return { clientId, sessionId };
  } catch {
    return null;
  }
}

/**
 * Read the identity for this app session, minting one when absent or
 * unreadable. A store that throws (Safari private browsing, storage-denied
 * WebView) degrades to a fresh in-memory identity — measurement gets noisier,
 * nothing breaks.
 */
export function resolveAnalyticsSession(
  store: SessionStore | null | undefined,
  makeClientId: () => string,
  makeSessionId: () => string,
): AnalyticsSession {
  try {
    const existing = decode(store?.getItem(SESSION_KEY) ?? null);
    if (existing) return { ...existing, isNewSession: false };
  } catch {
    return { clientId: makeClientId(), sessionId: makeSessionId(), isNewSession: true };
  }
  const minted = { clientId: makeClientId(), sessionId: makeSessionId() };
  try {
    store?.setItem(SESSION_KEY, JSON.stringify(minted));
  } catch {
    // A session that cannot be persisted still measures; it just fragments.
  }
  return { ...minted, isNewSession: true };
}
