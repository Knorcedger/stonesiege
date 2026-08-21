// Post-reload navigation hints. Leaving a game screen reboots the app
// (window.location.reload() — same pattern the practice end screen already
// uses; no Pixi teardown to get wrong). A hint in sessionStorage tells the
// next boot where to land: back on a campaign's scenario list, or straight
// into a scenario/practice retry. sessionStorage, not the KV store: hints are
// tab-scoped and must not survive the session.

import { BOT_DIFFICULTIES, type BotDifficulty } from '@bf/ai';
import type { PracticeMapSize, PracticeSetup } from '../simBridge';

export type NavHint =
  | { kind: 'scenarioList'; campaignId: string }
  | { kind: 'startScenario'; scenarioId: string }
  | { kind: 'startPractice'; setup: PracticeSetup };

const KEY = 'bf.nav.hint.v1';
const PRACTICE_MAP_SIZES: readonly PracticeMapSize[] = ['small', 'medium', 'large'];

function isPracticeSetup(value: unknown): value is PracticeSetup {
  if (!value || typeof value !== 'object') return false;
  const setup = value as Record<string, unknown>;
  return PRACTICE_MAP_SIZES.includes(setup.mapSize as PracticeMapSize)
    && Array.isArray(setup.opponents)
    && setup.opponents.length >= 1
    && setup.opponents.length <= 3
    && setup.opponents.every((difficulty) => (
      BOT_DIFFICULTIES.includes(difficulty as BotDifficulty)
    ))
    && typeof setup.civ === 'string'
    && setup.civ.length > 0
    && Number.isInteger(setup.color)
    && (setup.color as number) >= 0
    && (setup.color as number) <= 7;
}

export function parseNavHint(raw: string | null): NavHint | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Record<string, unknown>;
    if (h.kind === 'scenarioList' && typeof h.campaignId === 'string') {
      return { kind: 'scenarioList', campaignId: h.campaignId };
    }
    if (h.kind === 'startScenario' && typeof h.scenarioId === 'string') {
      return { kind: 'startScenario', scenarioId: h.scenarioId };
    }
    if (h.kind === 'startPractice' && isPracticeSetup(h.setup)) {
      return { kind: 'startPractice', setup: h.setup };
    }
    return null;
  } catch {
    return null;
  }
}

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
    return parseNavHint(raw);
  } catch {
    return null;
  }
}
