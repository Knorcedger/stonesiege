// @bf/game entry: title screen -> practice game. Campaign is a v1 "coming
// soon" (scenario loader + triggers land with @bf/scenarios integration).

import { showTitleScreen } from './screens/title';
import { hasSnapshot } from './persist';

export { resolveFrameName, facingFromDelta, animForActivity } from './frames';
export { Camera, tileToWorld, worldToTile } from './camera';

/** Boot the full app (menus -> practice/campaign -> game screen) into the given DOM element. */
export async function startApp(root: HTMLElement): Promise<void> {
  root.innerHTML = '';
  root.style.position = 'relative';
  // Resume is offered when a backgrounded/killed match left a snapshot (GDD:
  // a phone call at minute 90 never loses a game)
  const choice = await showTitleScreen(root, { canResume: hasSnapshot() });
  const { runGame } = await import('./game');
  await runGame(root, choice.mode === 'resume'
    ? { resume: true }
    : { difficulty: choice.difficulty });
}
