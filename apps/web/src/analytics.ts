// First-party gameplay analytics. @bf/game only sees AnalyticsSink; this file
// owns the network envelope, batching, session identity, retry, and lifecycle
// flushing. Every path is fire-and-forget so analytics can never block play.

import { createAnalyticsSink, noopAnalytics, type AnalyticsSink } from '@bf/game/analytics/sink';
import { randomAnalyticsId } from '@bf/game/analytics/id';
import { resolveAnalyticsSession, type AnalyticsSession } from '@bf/game/analytics/session';
import type { AnalyticsParams } from '@bf/game/analytics/events';
import { getSettings } from '@bf/game/settings';

const MAX_BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 250;
const RETRY_DELAY_MS = 1_000;

export interface GameplayAnalyticsEnvelope {
  eventId: string;
  eventName: string;
  sessionId: string;
  occurredAt: number;
  platform: string;
  appVersion: string;
  props: AnalyticsParams;
}

type FetchLike = (
  input: string,
  init: {
    method: 'POST';
    headers: { 'Content-Type': 'text/plain' };
    body: string;
    keepalive: true;
    credentials: 'omit';
    mode: 'cors';
  },
) => Promise<{ ok: boolean; status: number }>;

type TimerHandle = ReturnType<typeof setTimeout>;

interface QueuedEvent {
  envelope: GameplayAnalyticsEnvelope;
  attempts: number;
}

export interface FirstPartyTransport {
  track(name: string, params: AnalyticsParams): void;
  flush(): Promise<void>;
}

export interface FirstPartyTransportOptions {
  endpoint: string;
  platform: string;
  appVersion: string;
  enabled: () => boolean;
  getSessionId: () => string;
  fetch: FetchLike;
  makeId?: () => string;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
}

/**
 * Pure, dependency-injected batching transport. Exported so the exact wire
 * behavior can be tested in Node without a DOM or a live analytics service.
 */
export function createFirstPartyTransport(options: FirstPartyTransportOptions): FirstPartyTransport {
  const {
    endpoint,
    platform,
    appVersion,
    enabled,
    getSessionId,
    fetch,
    makeId = randomAnalyticsId,
    now = Date.now,
    schedule = (callback, delayMs) => setTimeout(callback, delayMs),
    cancel = clearTimeout,
  } = options;
  const queue: QueuedEvent[] = [];
  let timer: TimerHandle | null = null;
  let inFlight: Promise<void> | null = null;

  const scheduleFlush = (delayMs: number): void => {
    if (timer !== null) return;
    timer = schedule(() => {
      timer = null;
      void flush();
    }, delayMs);
  };

  const flush = async (): Promise<void> => {
    if (!enabled()) {
      queue.length = 0;
      if (timer !== null) cancel(timer);
      timer = null;
      return;
    }
    if (inFlight) {
      await inFlight;
      return queue.length > 0 ? flush() : undefined;
    }
    if (queue.length === 0) return;

    if (timer !== null) cancel(timer);
    timer = null;
    const batch = queue.splice(0, MAX_BATCH_SIZE);

    inFlight = (async () => {
      let retry = false;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(batch.map(({ envelope }) => envelope)),
          keepalive: true,
          credentials: 'omit',
          mode: 'cors',
        });
        retry = response.status === 429 || response.status >= 500;
      } catch {
        retry = true;
      }

      if (retry) {
        const retryable = batch
          .filter(({ attempts }) => attempts === 0)
          .map(({ envelope }) => ({ envelope, attempts: 1 }));
        queue.unshift(...retryable);
      }
    })().finally(() => {
      inFlight = null;
      if (!enabled()) queue.length = 0;
      if (queue.length > 0) {
        const hasRetry = queue.some(({ attempts }) => attempts > 0);
        scheduleFlush(hasRetry ? RETRY_DELAY_MS : FLUSH_DELAY_MS);
      }
    });

    return inFlight;
  };

  return {
    track(name, params) {
      if (!enabled()) {
        queue.length = 0;
        return;
      }
      queue.push({
        attempts: 0,
        envelope: {
          eventId: makeId(),
          eventName: name,
          sessionId: getSessionId(),
          occurredAt: now(),
          platform,
          appVersion,
          props: params,
        },
      });
      scheduleFlush(FLUSH_DELAY_MS);
      if (queue.length >= MAX_BATCH_SIZE) void flush();
    },
    flush,
  };
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export interface WebAnalytics {
  analytics: AnalyticsSink;
  /** True only for the first boot of a tab/app session, not match-exit reloads. */
  isNewSession: boolean;
}

const disabled: WebAnalytics = { analytics: noopAnalytics, isNewSession: false };

export function createWebAnalytics(options: {
  endpoint: string | undefined;
  appVersion: string;
  platform: string;
}): WebAnalytics {
  const { endpoint, appVersion, platform } = options;
  if (typeof endpoint !== 'string' || endpoint.length === 0) return disabled;
  if (typeof window === 'undefined') return disabled;

  let session: AnalyticsSession | null = null;
  const ensureSession = (): AnalyticsSession =>
    (session ??= resolveAnalyticsSession(sessionStore(), randomAnalyticsId));

  const transport = createFirstPartyTransport({
    endpoint,
    platform,
    appVersion,
    enabled: () => getSettings().analyticsEnabled,
    getSessionId: () => ensureSession().sessionId,
    fetch: (input, init) => window.fetch(input, init),
  });

  const flushWhenHidden = (): void => {
    if (document.visibilityState === 'hidden') void transport.flush();
  };
  document.addEventListener('visibilitychange', flushWhenHidden);
  window.addEventListener('pagehide', () => void transport.flush());

  return {
    analytics: createAnalyticsSink({
      enabled: () => getSettings().analyticsEnabled,
      transport: (name, params) => transport.track(name, params),
    }),
    // Do not create even a session-scoped id for a player who has opted out.
    isNewSession: getSettings().analyticsEnabled ? ensureSession().isNewSession : false,
  };
}
