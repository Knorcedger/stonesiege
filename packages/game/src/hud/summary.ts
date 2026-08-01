// Pure match-summary derivation for the victory/defeat screens (DOM-free,
// unit-tested). Kill/loss tallies are renderer-side bookkeeping fed from
// entityDied events (the sim keeps no score); alive counts read the state.

import { GAIA, TICKS_PER_SECOND, type AgeId, type GameState, type PlayerId } from '@bf/sim/types';
import { gameData } from '@bf/data';

/** 'M:SS' under an hour, 'H:MM:SS' beyond (match clocks are long in Imperial slugfests). */
export function formatMatchTime(ticks: number): string {
  const total = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export interface MatchTallies {
  unitsLost: number;
  buildingsLost: number;
  unitsKilled: number;
  buildingsRazed: number;
}

export const emptyTallies = (): MatchTallies =>
  ({ unitsLost: 0, buildingsLost: 0, unitsKilled: 0, buildingsRazed: 0 });

/**
 * Fold one entityDied event into the human player's tallies. Gaia deaths
 * (trees cleared, sheep eaten) never count; own deaths count as losses even
 * when self-inflicted (deleting a house is still a loss).
 */
export function recordDeath(
  tallies: MatchTallies,
  ev: { defId: string; player: PlayerId; killer?: PlayerId },
  human: PlayerId,
): void {
  if (ev.player === GAIA) return;
  const isBuilding = !!gameData.buildings[ev.defId];
  if (ev.player === human) {
    if (isBuilding) tallies.buildingsLost++;
    else tallies.unitsLost++;
  } else if (ev.killer === human) {
    if (isBuilding) tallies.buildingsRazed++;
    else tallies.unitsKilled++;
  }
}

export interface MatchSummary {
  timeText: string;
  age: AgeId;
  unitsAlive: number;
  buildingsAlive: number;
  techsResearched: number;
  tallies: MatchTallies;
}

export function deriveMatchSummary(
  state: GameState,
  player: PlayerId,
  tallies: MatchTallies,
): MatchSummary {
  let unitsAlive = 0;
  let buildingsAlive = 0;
  for (const e of state.entities.values()) {
    if (e.player !== player || e.hp <= 0 || e.activity === 'dying') continue;
    if (e.kind === 'unit') unitsAlive++;
    else if (e.kind === 'building') buildingsAlive++;
  }
  const p = state.players[player];
  return {
    timeText: formatMatchTime(state.tick),
    age: p?.age ?? 'dark',
    unitsAlive,
    buildingsAlive,
    techsResearched: p?.researchedTechs.length ?? 0,
    tallies,
  };
}
