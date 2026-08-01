// Campaign hero unit defs (docs/CAMPAIGN_WALLACE.md Appendix A) are canonical
// @bf/data units now (packages/data/src/units.ts: heroWallace & co., with boosted
// stats and `sprite`/`icon` aliases onto existing atlas rigs). This module used to
// carry placeholder defs until they landed; `campaignGameData` remains the campaign
// loading surface so scenario callers keep a single import point should campaign-only
// defs ever be needed again.

import type { GameData } from '@bf/data';
import { gameData } from '@bf/data';

/** Game data campaign scenarios load against — the full @bf/data pack. */
export const campaignGameData: GameData = gameData;
