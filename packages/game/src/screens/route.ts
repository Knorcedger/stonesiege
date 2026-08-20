// URL routing for the menu flow. Every screen has an address, so the location
// bar names what you are looking at ("/#/campaigns/joan/joan-02-orleans"
// instead of an unchanging origin) and browser back/forward walk the menu.
//
// Hash routing, not History-API paths: the same build is served from a web
// origin, from `capacitor://localhost` on iOS, and from `https://localhost` on
// Android, and leaving a match reloads the page (screens/nav.ts). A path route
// would need a server rewrite the native shells cannot provide, so a reload on
// "/campaigns" would 404. A hash always survives a reload with no server help.
//
// Pure module: parsing and formatting only. screens/menu.ts owns the History
// API calls, so these rules stay testable without a DOM.

import { campaigns, scenariosById } from '@bf/scenarios';
import type { FlowState, MenuScreen } from './flow';

/** In-match addresses. Parsed back to `null`: a reload must never re-enter a match. */
export type MatchRoute =
  | { mode: 'practice' }
  | { mode: 'scenario'; scenarioId: string }
  | { mode: 'resume' };

/** Path for a screen, without the leading '#'. Always starts with '/'. */
export function screenPath(screen: MenuScreen): string {
  switch (screen.id) {
    case 'title': return '/';
    case 'play': return '/play';
    case 'practiceSetup': return '/practice';
    case 'campaigns': return '/campaigns';
    case 'scenarioList': return `/campaigns/${screen.campaignId}`;
    case 'briefing': return `/campaigns/${screen.campaignId}/${screen.scenarioId}`;
    case 'settings': return '/settings';
  }
}

export function matchPath(match: MatchRoute): string {
  return match.mode === 'scenario' ? `/match/${match.scenarioId}` : `/match/${match.mode}`;
}

/** The full `location.hash` value for a path ('/' addresses the title as '#/'). */
export const hashFor = (path: string): string => `#${path}`;

/** Address of the screen on top of a flow stack. */
export const flowHash = (flow: FlowState): string =>
  hashFor(screenPath(flow.stack[flow.stack.length - 1]));

/**
 * Ancestors of a screen, so a deep link (a shared or bookmarked URL) still has
 * a working Back path instead of dead-ending on the title.
 */
function stackFor(screen: MenuScreen): MenuScreen[] {
  switch (screen.id) {
    case 'title': return [{ id: 'title' }];
    case 'play':
    case 'settings': return [{ id: 'title' }, screen];
    case 'practiceSetup':
    case 'campaigns': return [{ id: 'title' }, { id: 'play' }, screen];
    case 'scenarioList':
      return [{ id: 'title' }, { id: 'play' }, { id: 'campaigns' }, screen];
    case 'briefing':
      return [
        { id: 'title' }, { id: 'play' }, { id: 'campaigns' },
        { id: 'scenarioList', campaignId: screen.campaignId }, screen,
      ];
  }
}

/**
 * Screen addressed by a `location.hash`, or null when the hash names no menu
 * screen: an unknown path, a campaign or chapter this build does not have, or
 * a `/match/*` address (reloading out of a match must land on a menu, and
 * screens/nav.ts hints — not the URL — decide which one).
 */
export function screenFromHash(hash: string): MenuScreen | null {
  const path = hash.replace(/^#/, '');
  const [head, ...rest] = path.split('/').filter((part) => part.length > 0);
  if (head === undefined) return { id: 'title' };
  switch (head) {
    case 'play': return rest.length === 0 ? { id: 'play' } : null;
    case 'practice': return rest.length === 0 ? { id: 'practiceSetup' } : null;
    case 'settings': return rest.length === 0 ? { id: 'settings' } : null;
    case 'campaigns': {
      const [campaignId, scenarioId, ...extra] = rest;
      if (extra.length > 0) return null;
      if (campaignId === undefined) return { id: 'campaigns' };
      const campaign = campaigns[campaignId];
      if (!campaign) return null;
      if (scenarioId === undefined) return { id: 'scenarioList', campaignId };
      // A briefing route must name a chapter this campaign actually contains,
      // or Back from it would return to an unrelated list.
      if (!campaign.scenarioIds.includes(scenarioId) || !scenariosById[scenarioId]) return null;
      return { id: 'briefing', campaignId, scenarioId };
    }
    default: return null;
  }
}

/** Flow state (screen + its Back path) for a hash, or null when unaddressed. */
export function flowFromHash(hash: string): FlowState | null {
  const screen = screenFromHash(hash);
  return screen ? { stack: stackFor(screen) } : null;
}
