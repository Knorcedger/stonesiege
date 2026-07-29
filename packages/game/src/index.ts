// @bf/game entry: title screen -> practice game. Campaign is a v1 "coming
// soon" (scenario loader + triggers land with @bf/scenarios integration).

import { showTitleScreen } from './screens/title';

export { resolveFrameName, facingFromDelta, animForActivity } from './frames';
export { Camera, tileToWorld, worldToTile } from './camera';

/** Boot the full app (menus -> practice/campaign -> game screen) into the given DOM element. */
export async function startApp(root: HTMLElement): Promise<void> {
  root.innerHTML = '';
  root.style.position = 'relative';
  await showTitleScreen(root); // resolves on Practice
  const { runGame } = await import('./game');
  await runGame(root);
}
