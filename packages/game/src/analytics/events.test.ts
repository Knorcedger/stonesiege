// Analytics payload building (pure). The shape of these params is a public
// contract with the first-party ingest service: renaming one drops data.

import { describe, expect, it } from 'vitest';
import {
  appOpenEvent, campaignChapterCompleteEvent, matchContextParams, matchEndEvent,
  matchResumeEvent, matchStartEvent, menuScreenEvent, withCommonParams,
  type MatchContext,
} from './events';

const practice: MatchContext = {
  matchId: 'match-practice-123',
  mode: 'practice',
  civ: 'scots',
  mapSize: 'medium',
  opponentCount: 2,
  difficulty: 'hard',
};

const campaign: MatchContext = {
  matchId: 'match-campaign-123',
  mode: 'scenario',
  scenarioId: 'wallace-04-lanark',
  storyCampaignId: 'wallace',
  chapterIndex: 3,
};

describe('matchContextParams', () => {
  it('sends only the practice fields for a practice match', () => {
    expect(matchContextParams(practice)).toEqual({
      matchId: 'match-practice-123', mode: 'practice', civ: 'scots', map_size: 'medium', opponent_count: 2, difficulty: 'hard',
    });
  });

  it('sends only the campaign fields for a scenario match', () => {
    expect(matchContextParams(campaign)).toEqual({
      matchId: 'match-campaign-123', mode: 'scenario', scenario_id: 'wallace-04-lanark', story_campaign_id: 'wallace', chapter_index: 3,
    });
  });

  it('omits inapplicable params instead of sending nulls', () => {
    const params = matchContextParams({ matchId: 'match-minimum-123', mode: 'practice' });
    expect(params).toEqual({ matchId: 'match-minimum-123', mode: 'practice' });
    expect(Object.values(params).every((v) => v !== null && v !== undefined)).toBe(true);
  });

  it('keeps a zeroed chapter index, which is a real first chapter', () => {
    expect(matchContextParams({ ...campaign, chapterIndex: 0 }).chapter_index).toBe(0);
  });

  it('never emits marketing traffic-source parameter names', () => {
    const reserved = ['campaign_id', 'campaign', 'source', 'medium', 'term', 'content'];
    for (const key of Object.keys(matchContextParams(campaign))) {
      expect(reserved).not.toContain(key);
    }
  });
});

describe('match lifecycle events', () => {
  it('names the start event and carries the full setup', () => {
    expect(matchStartEvent(practice)).toEqual({
      name: 'match_start',
      params: { matchId: 'match-practice-123', mode: 'practice', civ: 'scots', map_size: 'medium', opponent_count: 2, difficulty: 'hard' },
    });
  });

  it('reports a resume as mode plus ids only, never as a new match', () => {
    expect(matchResumeEvent(campaign)).toEqual({
      name: 'match_resume',
      params: { matchId: 'match-campaign-123', mode: 'scenario', scenario_id: 'wallace-04-lanark', story_campaign_id: 'wallace' },
    });
    expect(matchResumeEvent(practice)).toEqual({ name: 'match_resume', params: { matchId: 'match-practice-123', mode: 'practice' } });
  });

  it('repeats the match context on end events so they stand alone', () => {
    const end = matchEndEvent(campaign, {
      outcome: 'defeat',
      durationSeconds: 754,
      ageReached: 'castle',
      unitsKilled: 31,
      unitsLost: 44,
      peakPopulation: 62,
    });
    expect(end).toEqual({
      name: 'match_end',
      params: {
        matchId: 'match-campaign-123',
        mode: 'scenario',
        scenario_id: 'wallace-04-lanark',
        story_campaign_id: 'wallace',
        chapter_index: 3,
        outcome: 'defeat',
        duration_seconds: 754,
        age_reached: 'castle',
        units_killed: 31,
        units_lost: 44,
        peak_population: 62,
      },
    });
  });

  it('sends duration as whole seconds, not ticks and not a formatted clock', () => {
    const { params } = matchEndEvent(practice, {
      outcome: 'victory',
      durationSeconds: 65,
      ageReached: 'imperial',
      unitsKilled: 0,
      unitsLost: 0,
      peakPopulation: 4,
    });
    expect(params.duration_seconds).toBe(65);
    expect(typeof params.duration_seconds).toBe('number');
    expect(Number.isInteger(params.duration_seconds)).toBe(true);
  });

  it('reports a completed chapter with its campaign coordinates and duration', () => {
    expect(campaignChapterCompleteEvent(campaign, 421)).toEqual({
      name: 'campaign_chapter_complete',
      params: {
        duration_seconds: 421,
        scenario_id: 'wallace-04-lanark',
        story_campaign_id: 'wallace',
        chapter_index: 3,
      },
    });
  });
});

describe('shell events', () => {
  it('reports menu screens under the first-party allowlisted name', () => {
    expect(menuScreenEvent('briefing')).toEqual({ name: 'menu_screen', params: { screen: 'briefing' } });
    expect(menuScreenEvent('title').name).not.toBe('screen_view');
  });

  it('reports a launch with no payload of its own', () => {
    expect(appOpenEvent()).toEqual({ name: 'app_open', params: {} });
  });
});

describe('withCommonParams', () => {
  it('stamps platform and app version onto every event', () => {
    const common = { platform: 'ios', app_version: '0.1.2' };
    expect(withCommonParams(appOpenEvent(), common).params).toEqual(common);
    expect(withCommonParams(menuScreenEvent('play'), common).params)
      .toEqual({ platform: 'ios', app_version: '0.1.2', screen: 'play' });
  });

  it('does not mutate the event it was given', () => {
    const event = menuScreenEvent('settings');
    withCommonParams(event, { platform: 'web' });
    expect(event.params).toEqual({ screen: 'settings' });
  });
});
