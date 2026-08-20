// @bf/game entry: menu flow (title -> play -> practice setup / campaign ->
// scenario list -> briefing) -> game screen. Leaving a game reloads the page
// (screens/nav.ts hints steer the next boot back to the right menu screen).

import { showMenu, type GameRequest } from './screens/menu';
import { flowAtScenarioList, type FlowState } from './screens/flow';
import { takeNavHint } from './screens/nav';
import { flowFromHash, hashFor, matchPath, type MatchRoute } from './screens/route';
import { NATIVE_BACK_EVENT } from './nativeEvents';
import { hasSnapshot } from './persist';
import { noopAnalytics, type AnalyticsSink } from './analytics/sink';
import type { RunGameOptions } from './game';

export { resolveFrameName, facingFromDelta, animForActivity } from './frames';
export { Camera, tileToWorld, worldToTile } from './camera';

export interface StartAppOptions {
  /**
   * Where anonymous gameplay events go. Defaults to measuring nothing; the
   * platform shell (apps/web) injects the real implementation, so this package
   * never learns which provider, platform, or network is involved.
   */
  analytics?: AnalyticsSink;
}

const matchRouteFor = (request: GameRequest): MatchRoute =>
  request.mode === 'scenario' ? { mode: 'scenario', scenarioId: request.scenarioId } : { mode: request.mode };

/**
 * Address the running match and hold that address. A match is not a menu
 * screen you can step out of by changing the URL — the game owns the screen
 * until it ends — so a back gesture here does what the Android back button
 * already does: pause and save, and put the match address back.
 */
function enterMatchRoute(request: GameRequest): void {
  const hash = hashFor(matchPath(matchRouteFor(request)));
  // Replace, not push: the briefing entry becomes the match, so the first back
  // out of a finished match returns to the chapter list rather than the
  // briefing of the chapter that was just played.
  window.history.replaceState(window.history.state, '', hash);
  window.addEventListener('popstate', () => {
    window.history.pushState(window.history.state, '', hash);
    window.dispatchEvent(new Event(NATIVE_BACK_EVENT, { cancelable: true }));
  });
}

/** Boot the full app (menus -> practice/campaign -> game screen) into the given DOM element. */
export async function startApp(root: HTMLElement, options: StartAppOptions = {}): Promise<void> {
  const analytics = options.analytics ?? noopAnalytics;
  root.innerHTML = '';
  root.style.position = 'relative';

  // Where this boot lands, in priority order: a post-reload nav hint (campaign
  // results, defeat retry), then the address in the location bar (a deep link,
  // a bookmark, or a reload), then the title.
  const hint = takeNavHint();
  let request: GameRequest;
  if (hint?.kind === 'startScenario') {
    request = { mode: 'scenario', scenarioId: hint.scenarioId };
  } else if (hint?.kind === 'startPractice') {
    request = { mode: 'practice', setup: hint.setup };
  } else {
    const flow: FlowState | null = hint?.kind === 'scenarioList'
      ? flowAtScenarioList(hint.campaignId)
      : flowFromHash(window.location.hash);
    request = await showMenu(root, {
      // Resume is offered when a backgrounded/killed match left a snapshot
      // (GDD: a phone call at minute 90 never loses a game)
      canResume: hasSnapshot(),
      analytics,
      ...(flow ? { flow } : {}),
    });
  }
  enterMatchRoute(request);

  const { runGame } = await import('./game');
  const runOptions: RunGameOptions = request.mode === 'resume'
    ? { mode: 'resume' }
    : request.mode === 'scenario'
      ? { mode: 'scenario', scenarioId: request.scenarioId }
      : { mode: 'practice', setup: request.setup };
  await runGame(root, runOptions, analytics);
}
