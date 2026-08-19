// Screen-flow state machine: the navigation rules the menu shell renders from.

import { describe, expect, it } from 'vitest';
import {
  currentScreen, flowAtScenarioList, flowReducer, initialFlow,
  type FlowEvent, type FlowState,
} from './flow';

const run = (state: FlowState, ...events: FlowEvent[]): FlowState =>
  events.reduce(flowReducer, state);

describe('menu flow', () => {
  it('starts on the title', () => {
    expect(currentScreen(initialFlow())).toEqual({ id: 'title' });
  });

  it('walks title -> play -> practice setup', () => {
    const s = run(initialFlow(), { kind: 'openPlay' }, { kind: 'openPractice' });
    expect(currentScreen(s)).toEqual({ id: 'practiceSetup' });
  });

  it('walks the campaign path down to a briefing', () => {
    const s = run(
      initialFlow(),
      { kind: 'openPlay' },
      { kind: 'openCampaigns' },
      { kind: 'openScenarios', campaignId: 'wallace' },
      { kind: 'openBriefing', campaignId: 'wallace', scenarioId: 'wallace-1' },
    );
    expect(currentScreen(s)).toEqual({ id: 'briefing', campaignId: 'wallace', scenarioId: 'wallace-1' });
  });

  it('walks the Grand Conquest path down to a custom-mode briefing', () => {
    const s = run(
      initialFlow(),
      { kind: 'openPlay' },
      { kind: 'openGrandConquests' },
      { kind: 'openScenarios', campaignId: 'grand-conquests-arena' },
      {
        kind: 'openBriefing', campaignId: 'grand-conquests-arena',
        scenarioId: 'arena-trial-of-banners',
      },
    );
    expect(currentScreen(s)).toEqual({
      id: 'briefing', campaignId: 'grand-conquests-arena', scenarioId: 'arena-trial-of-banners',
    });
  });

  it('back pops one screen at a time until the title, then no-ops', () => {
    let s = run(initialFlow(), { kind: 'openPlay' }, { kind: 'openCampaigns' });
    s = flowReducer(s, { kind: 'back' });
    expect(currentScreen(s)).toEqual({ id: 'play' });
    s = flowReducer(s, { kind: 'back' });
    expect(currentScreen(s)).toEqual({ id: 'title' });
    const same = flowReducer(s, { kind: 'back' });
    expect(same).toBe(s); // no-op returns the identical state
  });

  it('ignores illegal transitions (guards)', () => {
    const title = initialFlow();
    expect(flowReducer(title, { kind: 'openPractice' })).toBe(title);
    expect(flowReducer(title, { kind: 'openScenarios', campaignId: 'wallace' })).toBe(title);
    const play = run(title, { kind: 'openPlay' });
    expect(flowReducer(play, { kind: 'openBriefing', campaignId: 'w', scenarioId: 's' })).toBe(play);
    // briefing must come from the matching campaign's list
    const list = run(play, { kind: 'openCampaigns' }, { kind: 'openScenarios', campaignId: 'wallace' });
    expect(flowReducer(list, { kind: 'openBriefing', campaignId: 'other', scenarioId: 's' })).toBe(list);
  });

  it('settings pushes from anywhere and back returns to where you were', () => {
    const fromTitle = run(initialFlow(), { kind: 'openSettings' });
    expect(currentScreen(fromTitle)).toEqual({ id: 'settings' });
    expect(currentScreen(flowReducer(fromTitle, { kind: 'back' }))).toEqual({ id: 'title' });

    const fromPlay = run(initialFlow(), { kind: 'openPlay' }, { kind: 'openSettings' });
    expect(currentScreen(flowReducer(fromPlay, { kind: 'back' }))).toEqual({ id: 'play' });
    // double-open is a no-op
    expect(flowReducer(fromPlay, { kind: 'openSettings' })).toBe(fromPlay);
  });

  it('deep-links to a scenario list with a working back path', () => {
    let s = flowAtScenarioList('wallace');
    expect(currentScreen(s)).toEqual({ id: 'scenarioList', campaignId: 'wallace' });
    s = flowReducer(s, { kind: 'back' });
    expect(currentScreen(s)).toEqual({ id: 'campaigns' });
    s = run(s, { kind: 'back' }, { kind: 'back' });
    expect(currentScreen(s)).toEqual({ id: 'title' });
  });

  it('deep-links back through the Grand Conquests collection', () => {
    let s = flowAtScenarioList('grand-conquests-arena', 'grandConquests');
    s = flowReducer(s, { kind: 'back' });
    expect(currentScreen(s)).toEqual({ id: 'grandConquests' });
  });
});
