// @bf/game entry: menu flow (title -> play -> practice setup / campaign ->
// scenario list -> briefing) -> game screen. Leaving a game reloads the page
// (screens/nav.ts hints steer the next boot back to the right menu screen).

import { showMenu, type GameRequest } from './screens/menu';
import { flowAtScenarioList } from './screens/flow';
import { takeNavHint } from './screens/nav';
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

/** Boot the full app (menus -> practice/campaign -> game screen) into the given DOM element. */
export async function startApp(root: HTMLElement, options: StartAppOptions = {}): Promise<void> {
  const analytics = options.analytics ?? noopAnalytics;
  root.innerHTML = '';
  root.style.position = 'relative';

  // Post-reload deep links: campaign results/defeat/retry navigation.
  const hint = takeNavHint();
  let request: GameRequest;
  if (hint?.kind === 'startScenario') {
    request = { mode: 'scenario', scenarioId: hint.scenarioId };
  } else if (hint?.kind === 'startPractice') {
    request = { mode: 'practice', setup: hint.setup };
  } else {
    request = await showMenu(root, {
      // Resume is offered when a backgrounded/killed match left a snapshot
      // (GDD: a phone call at minute 90 never loses a game)
      canResume: hasSnapshot(),
      analytics,
      ...(hint?.kind === 'scenarioList' ? { flow: flowAtScenarioList(hint.campaignId) } : {}),
    });
  }

  const { runGame } = await import('./game');
  const runOptions: RunGameOptions = request.mode === 'resume'
    ? { mode: 'resume' }
    : request.mode === 'scenario'
      ? { mode: 'scenario', scenarioId: request.scenarioId }
      : { mode: 'practice', setup: request.setup };
  await runGame(root, runOptions, analytics);
}
