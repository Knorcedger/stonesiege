// Anonymous gameplay-analytics payloads: pure, DOM-free, provider-free builders
// (the same shape as flow.ts / summary.ts / progress.ts — all the logic worth
// testing lives here, and the sink that ships them is trivially mockable).
//
// Nothing here knows about a provider, Capacitor, or the network. An event is a name
// plus flat scalar params; the transport is somebody else's problem.
//
// Params are OMITTED when they do not apply rather than sent as null, keeping
// the first-party event contract compact and unambiguous.

import type { MenuScreen } from '../screens/flow';

export type AnalyticsParams = Record<string, string | number>;

export interface AnalyticsEvent {
  /** Allowlisted first-party event name. */
  name: string;
  params: AnalyticsParams;
}

export type MatchMode = 'practice' | 'scenario';
export type MatchOutcome = 'victory' | 'defeat';

/**
 * Everything that identifies WHICH match an event belongs to. Practice fields
 * and campaign fields are mutually exclusive in practice, but the type does not
 * enforce that — callers build one from the live MatchPlan and the builders
 * simply skip whatever is absent.
 *
 * `storyCampaignId` is deliberately distinct from generic marketing-campaign
 * language: it identifies authored StoneSiege story content.
 */
export interface MatchContext {
  /** Random id for joining this match's lifecycle; never identifies a player. */
  matchId: string;
  mode: MatchMode;
  /** practice */
  civ?: string;
  mapSize?: string;
  opponentCount?: number;
  difficulty?: string;
  /** campaign */
  scenarioId?: string;
  storyCampaignId?: string;
  chapterIndex?: number;
}

export interface MatchEndStats {
  outcome: MatchOutcome;
  /** Raw whole seconds — never ticks, never a formatted clock string. */
  durationSeconds: number;
  ageReached: string;
  unitsKilled: number;
  unitsLost: number;
  peakPopulation: number;
}

const put = (
  params: AnalyticsParams,
  key: string,
  value: string | number | undefined,
): void => {
  if (value !== undefined) params[key] = value;
};

/** Full match identity: mode plus whichever of the practice/campaign fields apply. */
export function matchContextParams(context: MatchContext): AnalyticsParams {
  const params: AnalyticsParams = { matchId: context.matchId, mode: context.mode };
  put(params, 'civ', context.civ);
  put(params, 'map_size', context.mapSize);
  put(params, 'opponent_count', context.opponentCount);
  put(params, 'difficulty', context.difficulty);
  put(params, 'scenario_id', context.scenarioId);
  put(params, 'story_campaign_id', context.storyCampaignId);
  put(params, 'chapter_index', context.chapterIndex);
  return params;
}

/** A fresh match began (never fired for a resumed snapshot — see matchResumeEvent). */
export function matchStartEvent(context: MatchContext): AnalyticsEvent {
  return { name: 'match_start', params: matchContextParams(context) };
}

/**
 * A backgrounded match was restored. Deliberately thin: this is not a new
 * match, so it must not inflate the practice/campaign setup dimensions that
 * `match_start` owns.
 */
export function matchResumeEvent(context: MatchContext): AnalyticsEvent {
  const params: AnalyticsParams = { matchId: context.matchId, mode: context.mode };
  put(params, 'scenario_id', context.scenarioId);
  put(params, 'story_campaign_id', context.storyCampaignId);
  return { name: 'match_resume', params };
}

/** The end screen was shown. Repeats the match context so end events stand alone. */
export function matchEndEvent(context: MatchContext, stats: MatchEndStats): AnalyticsEvent {
  return {
    name: 'match_end',
    params: {
      ...matchContextParams(context),
      outcome: stats.outcome,
      duration_seconds: stats.durationSeconds,
      age_reached: stats.ageReached,
      units_killed: stats.unitsKilled,
      units_lost: stats.unitsLost,
      peak_population: stats.peakPopulation,
    },
  };
}

/** A campaign chapter was won and unlocked its successor. */
export function campaignChapterCompleteEvent(
  context: MatchContext,
  durationSeconds: number,
): AnalyticsEvent {
  const params: AnalyticsParams = { duration_seconds: durationSeconds };
  put(params, 'scenario_id', context.scenarioId);
  put(params, 'story_campaign_id', context.storyCampaignId);
  put(params, 'chapter_index', context.chapterIndex);
  return { name: 'campaign_chapter_complete', params };
}

/**
 * A menu screen became the top of the navigation stack — the drop-off funnel
 * before anyone starts a match. `menu_screen` is part of the ingest allowlist.
 */
export function menuScreenEvent(screen: MenuScreen['id']): AnalyticsEvent {
  return { name: 'menu_screen', params: { screen } };
}

/**
 * The game was launched. Without a page_view event this is the only signal that
 * anybody opened the app at all ("installed but never played").
 */
export function appOpenEvent(): AnalyticsEvent {
  return { name: 'app_open', params: {} };
}

/**
 * Stamp the per-install constants (platform, app version) onto an event. Event
 * params win on collision so a future event can override a common value.
 */
export function withCommonParams(
  event: AnalyticsEvent,
  common: AnalyticsParams,
): AnalyticsEvent {
  return { name: event.name, params: { ...common, ...event.params } };
}
