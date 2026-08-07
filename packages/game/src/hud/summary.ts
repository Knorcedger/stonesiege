// Pure match-summary derivation for the victory/defeat screens (DOM-free,
// unit-tested). Match tallies are renderer-side bookkeeping fed from sim
// events; alive counts and the final age read directly from state.

import {
  GAIA, TICKS_PER_SECOND,
  type AgeId, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
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
  foodGathered: number;
  woodGathered: number;
  goldGathered: number;
  stoneGathered: number;
  peakPopulation: number;
  unitsTrained: number;
  buildingsBuilt: number;
  unitsLost: number;
  buildingsLost: number;
  unitsKilled: number;
  buildingsRazed: number;
}

export const emptyTallies = (initialPopulation = 0): MatchTallies => ({
  foodGathered: 0,
  woodGathered: 0,
  goldGathered: 0,
  stoneGathered: 0,
  peakPopulation: Math.max(0, initialPopulation),
  unitsTrained: 0,
  buildingsBuilt: 0,
  unitsLost: 0,
  buildingsLost: 0,
  unitsKilled: 0,
  buildingsRazed: 0,
});

/** A detached copy suitable for persistence while the live tally keeps changing. */
export function copyTallies(tallies: MatchTallies): MatchTallies {
  return { ...tallies };
}

/** Defensive validation for match tallies read back from local storage. */
export function isMatchTallies(value: unknown): value is MatchTallies {
  if (!value || typeof value !== 'object') return false;
  const tally = value as Record<keyof MatchTallies, unknown>;
  const keys: Array<keyof MatchTallies> = [
    'foodGathered', 'woodGathered', 'goldGathered', 'stoneGathered',
    'peakPopulation', 'unitsTrained', 'buildingsBuilt', 'unitsLost',
    'buildingsLost', 'unitsKilled', 'buildingsRazed',
  ];
  return keys.every((key) => typeof tally[key] === 'number'
    && Number.isFinite(tally[key]) && tally[key] >= 0);
}

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

/** Fold any score-bearing sim event into one player's end-of-match totals. */
export function recordMatchEvent(
  tallies: MatchTallies,
  ev: SimEvent,
  human: PlayerId,
): void {
  switch (ev.kind) {
    case 'entityDied':
      recordDeath(tallies, ev, human);
      break;
    case 'resourceDropped':
      if (ev.player !== human) break;
      if (ev.type === 'food') tallies.foodGathered += ev.amount;
      else if (ev.type === 'wood') tallies.woodGathered += ev.amount;
      else if (ev.type === 'gold') tallies.goldGathered += ev.amount;
      else tallies.stoneGathered += ev.amount;
      break;
    case 'unitTrained':
      if (ev.player === human) tallies.unitsTrained++;
      break;
    case 'buildingComplete':
      if (ev.player === human) tallies.buildingsBuilt++;
      break;
    default:
      break;
  }
}

/** Sample population after each sim tick so short-lived peaks are retained. */
export function recordPopulation(tallies: MatchTallies, population: number): void {
  tallies.peakPopulation = Math.max(tallies.peakPopulation, population);
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
