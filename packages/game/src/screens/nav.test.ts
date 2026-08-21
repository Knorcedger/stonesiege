import { describe, expect, it } from 'vitest';
import { parseNavHint } from './nav';

describe('post-reload navigation hints', () => {
  it('restores a validated practice setup for a clean retry', () => {
    const setup = {
      mapSize: 'large',
      opponents: ['easy', 'hard'],
      civ: 'scots',
      color: 3,
    };
    expect(parseNavHint(JSON.stringify({ kind: 'startPractice', setup }))).toEqual({
      kind: 'startPractice',
      setup,
    });
  });

  it('rejects corrupt or unsafe practice retry data', () => {
    expect(parseNavHint(JSON.stringify({
      kind: 'startPractice',
      setup: { mapSize: 'huge', opponents: ['impossible'], civ: '', color: 99 },
    }))).toBeNull();
    expect(parseNavHint('{not json')).toBeNull();
  });

  it('keeps existing campaign hints compatible', () => {
    expect(parseNavHint(JSON.stringify({ kind: 'startScenario', scenarioId: 'wallace-1' })))
      .toEqual({ kind: 'startScenario', scenarioId: 'wallace-1' });
    expect(parseNavHint(JSON.stringify({ kind: 'scenarioList', campaignId: 'wallace' })))
      .toEqual({ kind: 'scenarioList', campaignId: 'wallace' });
  });
});
