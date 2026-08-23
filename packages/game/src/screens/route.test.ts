// Menu addresses: every screen formats to a hash, every hash parses back to the
// screen plus a working Back path, and anything unaddressable parses to null.

import { describe, expect, it } from 'vitest';
import { campaigns } from '@bf/scenarios';
import { currentScreen, flowReducer, initialFlow, type MenuScreen } from './flow';
import { flowFromHash, flowHash, hashFor, matchPath, screenFromHash, screenPath } from './route';

const SCREENS: MenuScreen[] = [
  { id: 'title' },
  { id: 'play' },
  { id: 'practiceSetup' },
  { id: 'campaigns' },
  { id: 'scenarioList', campaignId: 'wallace' },
  { id: 'prologue', campaignId: 'wallace' },
  { id: 'epilogue', campaignId: 'wallace' },
  { id: 'briefing', campaignId: 'joan', scenarioId: 'joan-02-orleans' },
  { id: 'settings' },
];

describe('screen addresses', () => {
  it('gives every screen a distinct, readable path', () => {
    const paths = SCREENS.map(screenPath);
    expect(paths).toEqual([
      '/', '/play', '/practice', '/campaigns',
      '/campaigns/wallace', '/campaigns/wallace/prologue', '/campaigns/wallace/epilogue',
      '/campaigns/joan/joan-02-orleans', '/settings',
    ]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('round-trips every screen through its hash', () => {
    for (const screen of SCREENS) {
      expect(screenFromHash(hashFor(screenPath(screen)))).toEqual(screen);
    }
  });

  it('addresses the top of a flow stack', () => {
    const flow = flowReducer(initialFlow(), { kind: 'openPlay' });
    expect(flowHash(flow)).toBe('#/play');
  });

  it('reads an empty or bare-hash address as the title', () => {
    for (const hash of ['', '#', '#/']) expect(screenFromHash(hash)).toEqual({ id: 'title' });
  });

  it('tolerates a trailing slash', () => {
    expect(screenFromHash('#/campaigns/wallace/')).toEqual({ id: 'scenarioList', campaignId: 'wallace' });
  });
});

describe('unaddressable hashes', () => {
  it('rejects unknown paths and stray extra segments', () => {
    for (const hash of ['#/nowhere', '#/play/extra', '#/settings/deep', '#/campaigns/wallace/x/y']) {
      expect(screenFromHash(hash), hash).toBeNull();
    }
  });

  it('rejects campaigns and chapters this build does not have', () => {
    expect(screenFromHash('#/campaigns/atlantis')).toBeNull();
    expect(screenFromHash('#/campaigns/wallace/joan-02-orleans')).toBeNull();
    expect(screenFromHash('#/campaigns/wallace/not-a-chapter')).toBeNull();
  });

  it('never re-enters a match from the address bar', () => {
    for (const match of [
      { mode: 'practice' } as const,
      { mode: 'resume' } as const,
      { mode: 'scenario', scenarioId: 'wallace-01-ledger' } as const,
    ]) {
      expect(screenFromHash(hashFor(matchPath(match)))).toBeNull();
    }
    expect(matchPath({ mode: 'scenario', scenarioId: 'wallace-01-ledger' }))
      .toBe('/match/wallace-01-ledger');
    expect(matchPath({ mode: 'practice' })).toBe('/match/practice');
  });
});

describe('deep links keep a Back path', () => {
  it('rebuilds the ancestors of a briefing down to the title', () => {
    let flow = flowFromHash('#/campaigns/joan/joan-02-orleans');
    expect(flow).not.toBeNull();
    const seen: MenuScreen[] = [currentScreen(flow!)];
    while (flow!.stack.length > 1) {
      flow = flowReducer(flow!, { kind: 'back' });
      seen.push(currentScreen(flow!));
    }
    expect(seen).toEqual([
      { id: 'briefing', campaignId: 'joan', scenarioId: 'joan-02-orleans' },
      { id: 'scenarioList', campaignId: 'joan' },
      { id: 'campaigns' },
      { id: 'play' },
      { id: 'title' },
    ]);
  });

  it('returns null for an address with no screen, so the caller can fall back', () => {
    expect(flowFromHash('#/match/practice')).toBeNull();
    expect(flowFromHash('#/nowhere')).toBeNull();
  });

  it('addresses every shipped campaign and chapter', () => {
    for (const campaign of Object.values(campaigns)) {
      expect(screenFromHash(`#/campaigns/${campaign.id}`))
        .toEqual({ id: 'scenarioList', campaignId: campaign.id });
      for (const scenarioId of campaign.scenarioIds) {
        expect(screenFromHash(`#/campaigns/${campaign.id}/${scenarioId}`))
          .toEqual({ id: 'briefing', campaignId: campaign.id, scenarioId });
      }
    }
  });
});
