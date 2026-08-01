// Post-reload navigation hints. Leaving a game screen reboots the app
// (window.location.reload() — same pattern the practice end screen already
// uses; no Pixi teardown to get wrong). A hint in sessionStorage tells the
// next boot where to land: back on a campaign's scenario list, or straight
// into a scenario retry. sessionStorage, not the KV store: hints are
// tab-scoped and must not survive the session.

export type NavHint =
  | { kind: 'scenarioList'; campaignId: string }
  | { kind: 'startScenario'; scenarioId: string };

const KEY = 'bf.nav.hint.v1';

export function setNavHint(hint: NavHint): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(hint));
  } catch {
    /* fall back to landing on the title */
  }
}

/** Read AND clear the pending hint (a hint fires exactly once). */
export function takeNavHint(): NavHint | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as NavHint;
    if (h.kind === 'scenarioList' && typeof h.campaignId === 'string') return h;
    if (h.kind === 'startScenario' && typeof h.scenarioId === 'string') return h;
    return null;
  } catch {
    return null;
  }
}
