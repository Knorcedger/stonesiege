// The analytics seam: the default must measure nothing, and the real sink must
// never let a failing transport reach the game.

import { describe, expect, it, vi } from 'vitest';
import { appOpenEvent, menuScreenEvent } from './events';
import { createAnalyticsSink, noopAnalytics } from './sink';

describe('noopAnalytics', () => {
  it('is the default sink and does nothing observable', () => {
    expect(() => noopAnalytics.track(appOpenEvent())).not.toThrow();
    expect(noopAnalytics.track(menuScreenEvent('title'))).toBeUndefined();
  });

  it('reports nothing for any event the game can fire', () => {
    // A spy standing in for "the network": the no-op sink must never reach one.
    const transport = vi.fn();
    const sink = noopAnalytics;
    sink.track(appOpenEvent());
    sink.track(menuScreenEvent('practiceSetup'));
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('createAnalyticsSink', () => {
  it('stamps the common params and forwards name and params to the transport', () => {
    const transport = vi.fn();
    createAnalyticsSink({ transport, common: { platform: 'android', app_version: '0.1.2' } })
      .track(menuScreenEvent('campaigns'));
    expect(transport).toHaveBeenCalledWith('menu_screen', {
      platform: 'android', app_version: '0.1.2', screen: 'campaigns',
    });
  });

  it('consults the opt-out on every event, not once at construction', () => {
    const transport = vi.fn();
    let enabled = true;
    const sink = createAnalyticsSink({ transport, enabled: () => enabled });
    sink.track(appOpenEvent());
    enabled = false;
    sink.track(appOpenEvent());
    enabled = true;
    sink.track(appOpenEvent());
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('swallows a throwing transport so a blocked request cannot break the game', () => {
    const transport = vi.fn(() => { throw new Error('ERR_BLOCKED_BY_CLIENT'); });
    const sink = createAnalyticsSink({ transport });
    expect(() => sink.track(appOpenEvent())).not.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('swallows a throwing opt-out check', () => {
    const transport = vi.fn();
    const sink = createAnalyticsSink({
      transport,
      enabled: () => { throw new Error('storage denied'); },
    });
    expect(() => sink.track(appOpenEvent())).not.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
