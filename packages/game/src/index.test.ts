import { describe, expect, it, vi } from 'vitest';
import { enterMatchRoute, type MatchRouteTarget } from './index';
import { NATIVE_BACK_EVENT } from './nativeEvents';

function makeTarget(initialState: unknown): {
  target: MatchRouteTarget;
  pushState: ReturnType<typeof vi.fn>;
  replaceState: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  popstate(): void;
} {
  let state = initialState;
  let listener: ((event: PopStateEvent) => void) | undefined;
  const pushState = vi.fn((data: unknown) => { state = data; });
  const replaceState = vi.fn((data: unknown) => { state = data; });
  const dispatchEvent = vi.fn(() => true);
  const target: MatchRouteTarget = {
    history: {
      get state() { return state; },
      pushState,
      replaceState,
    },
    addEventListener: (_type, next) => { listener = next; },
    dispatchEvent,
  };
  return {
    target,
    pushState,
    replaceState,
    dispatchEvent,
    popstate: () => listener?.(new Event('popstate') as PopStateEvent),
  };
}

describe('match address history', () => {
  it('pushes a guard entry for a match started from a cold deep link', () => {
    const history = makeTarget({ bfMenuDepth: 0 });

    enterMatchRoute({ mode: 'scenario', scenarioId: 'wallace-01-ledger' }, history.target);

    expect(history.replaceState).not.toHaveBeenCalled();
    expect(history.pushState).toHaveBeenCalledOnce();
    expect(history.pushState).toHaveBeenLastCalledWith(
      { bfMenuDepth: 0 }, '', '#/match/wallace-01-ledger',
    );

    history.popstate();
    expect(history.pushState).toHaveBeenCalledTimes(2);
    const event = history.dispatchEvent.mock.calls[0]?.[0] as Event;
    expect(event.type).toBe(NATIVE_BACK_EVENT);
    expect(event.cancelable).toBe(true);
  });

  it('replaces a normally navigated briefing while still trapping Back', () => {
    const history = makeTarget({ bfMenuDepth: 4 });

    enterMatchRoute({ mode: 'scenario', scenarioId: 'joan-02-orleans' }, history.target);

    expect(history.pushState).not.toHaveBeenCalled();
    expect(history.replaceState).toHaveBeenCalledWith(
      { bfMenuDepth: 4 }, '', '#/match/joan-02-orleans',
    );

    history.popstate();
    expect(history.pushState).toHaveBeenCalledWith(
      { bfMenuDepth: 4 }, '', '#/match/joan-02-orleans',
    );
    expect(history.dispatchEvent).toHaveBeenCalledOnce();
  });

  it('also guards Continue when the title is the only menu entry', () => {
    const history = makeTarget({ bfMenuDepth: 0 });

    enterMatchRoute({
      mode: 'resume', slot: 'campaign:wallace', scenarioId: 'wallace-01-ledger',
    }, history.target);

    expect(history.pushState).toHaveBeenCalledWith(
      { bfMenuDepth: 0 }, '', '#/match/wallace-01-ledger',
    );
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
