// The platform half of anonymous gameplay analytics: cookieless Google
// Analytics 4, loaded through a dynamically injected async <script> (the same
// shape as the dynamic import() of @capacitor/app in native.ts) so the measured
// game keeps its zero-dependency bundle. @bf/game only ever sees the
// AnalyticsSink interface from here.
//
// Cookieless by construction, verified against a real gtag.js payload:
//  - Consent Mode `analytics_storage: 'denied'` — the only thing that actually
//    stops GA4 writing _ga and _ga_<id>. The `client_storage` / `storage`
//    config fields are Universal Analytics leftovers: GA4 does not recognise
//    them, forwards them to every event as custom parameters, and writes the
//    cookies anyway.
//  - client_id, session_id — random ids held in sessionStorage, which die with
//    the tab or app process. With storage denied GA4 can persist neither, so
//    both must be supplied or every match-exit reload starts a new session.
//  - send_page_view: false — the game sends its own gameplay events.
//  - Google Signals and ad personalisation explicitly denied.
//
// Offline-first by construction: dataLayer.push() is a synchronous array write
// that works whether or not the script ever arrives, nothing here is awaited on
// the boot path, and every entry point is wrapped so a blocked request, an ad
// blocker, or a storage-denied WebView is invisible to the player.

import { createAnalyticsSink, noopAnalytics, type AnalyticsSink } from '@bf/game/analytics/sink';
import { resolveAnalyticsSession, type AnalyticsSession } from '@bf/game/analytics/session';
import { getSettings } from '@bf/game/settings';

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=';

interface DataLayerWindow extends Window {
  dataLayer?: unknown[];
}

/** RFC 4122-ish random id. crypto.randomUUID needs a secure context; degrade rather than throw. */
function randomClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to the arithmetic fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** GA4 reads session_id as a number; epoch seconds is what GA itself uses. */
function newSessionId(): string {
  return String(Math.floor(Date.now() / 1000));
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // privacy mode / storage-denied WebView
  }
}

export interface WebAnalytics {
  analytics: AnalyticsSink;
  /**
   * True only on a genuine launch. Every match exit reloads the page, so this
   * is what keeps `app_open` meaning "opened the game" rather than "left a match".
   */
  isNewSession: boolean;
}

const disabled: WebAnalytics = { analytics: noopAnalytics, isNewSession: false };

/**
 * Build the reporting sink for this boot. Returns a sink that measures nothing
 * unless a measurement id was configured for a production build; the player's
 * opt-out is re-read on every event, and while it is off no gtag script is
 * requested and no session id is stored.
 */
export function createWebAnalytics(options: {
  measurementId: string | undefined;
  appVersion: string;
  platform: string;
}): WebAnalytics {
  const { measurementId, appVersion, platform } = options;
  if (typeof measurementId !== 'string' || measurementId.length === 0) return disabled;
  if (typeof window === 'undefined') return disabled;

  const win = window as DataLayerWindow;
  let session: AnalyticsSession | null = null;
  let started = false;

  const ensureSession = (): AnalyticsSession =>
    (session ??= resolveAnalyticsSession(sessionStore(), randomClientId, newSessionId));

  /**
   * Google's own snippet, verbatim in behaviour: gtag pushes the `arguments`
   * object, and the tag's queue reader distinguishes that from a plain array
   * (which it would treat as a dataLayer variable update instead of a command).
   */
  const gtag: (...args: unknown[]) => void = function gtagCommand(): void {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer?.push(arguments);
  };

  /**
   * Bootstrap gtag on the first event that is actually allowed to be sent, so
   * an opted-out player never causes a request to googletagmanager.com. Queued
   * dataLayer commands are flushed by the script whenever — or if ever — it lands.
   */
  const ensureStarted = (): void => {
    if (started) return;
    started = true;
    win.dataLayer ??= [];
    // Consent Mode is what actually makes this cookieless. It must be pushed
    // before the config command. analytics_storage: 'denied' is the only
    // supported way to stop GA4 writing _ga / _ga_<id>; the `client_storage`
    // and `storage` config fields are Universal Analytics leftovers that GA4
    // does not recognise and silently forwards to every event as a custom
    // parameter while still setting the cookie. Nothing here is advertising, so
    // the ad signals are denied too.
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('js', new Date());
    const { clientId, sessionId } = ensureSession();
    gtag('config', measurementId, {
      client_id: clientId,
      session_id: sessionId,
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `${GTAG_SRC}${encodeURIComponent(measurementId)}`;
    // A blocked or offline request is expected, not exceptional: the queued
    // commands simply stay in the array and the game never notices.
    script.addEventListener('error', () => undefined);
    document.head.appendChild(script);
  };

  return {
    analytics: createAnalyticsSink({
      common: { platform, app_version: appVersion },
      enabled: () => getSettings().analyticsEnabled,
      transport: (name, params) => {
        ensureStarted();
        gtag('event', name, params);
      },
    }),
    // Resolving this eagerly costs one sessionStorage read; doing it only when
    // reporting is on means an opted-out player writes nothing at all.
    isNewSession: getSettings().analyticsEnabled ? ensureSession().isNewSession : false,
  };
}
