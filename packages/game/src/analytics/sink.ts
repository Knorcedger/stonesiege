// The analytics seam. @bf/game codes strictly against this interface and ships
// a no-op default, so the renderer never learns which service or network
// implementation is used; apps/web injects it through startApp the
// same way ScenarioUiHooks are injected into game.ts.
//
// Two hard rules, both enforced here rather than at every call site:
//  - the game is offline-first, so a throwing/blocked transport is swallowed;
//  - the opt-out is consulted on EVERY event, so turning the setting off stops
//    reporting immediately instead of at the next launch.

import { withCommonParams, type AnalyticsEvent, type AnalyticsParams } from './events';

export interface AnalyticsSink {
  /** Fire-and-forget. Never throws, never returns a promise, never blocks. */
  track(event: AnalyticsEvent): void;
}

/** The default everywhere: analytics that measurably do nothing. */
export const noopAnalytics: AnalyticsSink = { track: () => undefined };

export interface AnalyticsSinkOptions {
  /** Hands the finished event to the transport. May throw; the sink absorbs it. */
  transport: (name: string, params: AnalyticsParams) => void;
  /** Stamped onto every event (platform, app_version). */
  common?: AnalyticsParams;
  /** Consulted per event — the player's opt-out, read live. */
  enabled?: () => boolean;
}

export function createAnalyticsSink(options: AnalyticsSinkOptions): AnalyticsSink {
  const { transport, common = {}, enabled } = options;
  return {
    track(event) {
      try {
        if (enabled && !enabled()) return;
        const stamped = withCommonParams(event, common);
        transport(stamped.name, stamped.params);
      } catch {
        // Measurement is never worth a broken game: unavailable storage or a
        // blocked/offline request must be invisible to the player.
      }
    },
  };
}
