import { describe, expect, it, vi } from 'vitest';
import { createFirstPartyTransport, type GameplayAnalyticsEnvelope } from './analytics';

type TransportOptions = Parameters<typeof createFirstPartyTransport>[0];
type FetchLike = TransportOptions['fetch'];

function makeTransport(overrides: { enabled?: () => boolean; fetch?: FetchLike } = {}) {
  const fetch = overrides.fetch ?? vi.fn<FetchLike>(async () => ({ ok: true, status: 204 }));
  let scheduled: (() => void) | null = null;
  const transport = createFirstPartyTransport({
    endpoint: 'https://api.stonesiegegame.com/api/events',
    platform: 'web',
    appVersion: '1.2.3',
    enabled: overrides.enabled ?? (() => true),
    getSessionId: () => 'session-123',
    fetch,
    makeId: () => 'event-12345678',
    now: () => 1_777_777_777_000,
    schedule: (callback) => {
      scheduled = callback;
      return {} as ReturnType<typeof setTimeout>;
    },
    cancel: () => { scheduled = null; },
  });
  return { transport, runScheduled: () => scheduled?.() };
}

describe('createFirstPartyTransport', () => {
  it('posts the documented first-party envelope as a credential-free simple request', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ ok: true, status: 204 }));
    const { transport } = makeTransport({ fetch });
    transport.track('menu_screen', { screen: 'play' });
    await transport.flush();

    expect(fetch).toHaveBeenCalledOnce();
    const [endpoint, init] = fetch.mock.calls[0]!;
    expect(endpoint).toBe('https://api.stonesiegegame.com/api/events');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    });
    expect(JSON.parse(init.body) as GameplayAnalyticsEnvelope[]).toEqual([{
      eventId: 'event-12345678',
      eventName: 'menu_screen',
      sessionId: 'session-123',
      occurredAt: 1_777_777_777_000,
      platform: 'web',
      appVersion: '1.2.3',
      props: { screen: 'play' },
    }]);
  });

  it('batches events and never sends after the live opt-out changes to off', async () => {
    let enabled = true;
    const fetch = vi.fn<FetchLike>(async () => ({ ok: true, status: 204 }));
    const { transport } = makeTransport({ enabled: () => enabled, fetch });
    transport.track('app_open', {});
    transport.track('menu_screen', { screen: 'title' });
    enabled = false;
    await transport.flush();
    expect(fetch).not.toHaveBeenCalled();

    transport.track('menu_screen', { screen: 'settings' });
    enabled = true;
    await transport.flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries a network or server failure once with the same event id', async () => {
    const fetch = vi.fn<FetchLike>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    const { transport } = makeTransport({ fetch });
    transport.track('app_open', {});
    await transport.flush();
    await transport.flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(JSON.parse(fetch.mock.calls[1]![1].body));
  });

  it('drops non-rate-limit 4xx responses instead of retrying a bad payload', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ ok: false, status: 400 }));
    const { transport } = makeTransport({ fetch });
    transport.track('app_open', {});
    await transport.flush();
    await transport.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('never sends more than 50 events in one request', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ ok: true, status: 204 }));
    const { transport } = makeTransport({ fetch });
    for (let index = 0; index < 51; index++) transport.track('app_open', {});
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await transport.flush();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body).length)).toEqual([50, 1]);
  });

  it('flushes a queued event when the batch timer fires', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ ok: true, status: 204 }));
    const { transport, runScheduled } = makeTransport({ fetch });
    transport.track('app_open', {});
    runScheduled();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });
});
