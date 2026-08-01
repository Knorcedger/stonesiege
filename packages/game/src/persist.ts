// Match snapshot/resume (GDD: backgrounding auto-snapshots the match — the
// deterministic sim makes this cheap. Persist the seed + command log; resume
// replays the log through the real engine, so "a phone call at minute 90 never
// loses a game").
//
// Storage is localStorage (a practice match log is a few hundred KB at worst);
// everything here is defensive — a corrupt/mismatched snapshot simply reads as
// "no snapshot" and the title screen offers a fresh start.

import type { Command, Game, GameConfig, SimEvent } from '@bf/sim/types';
import type { BotDifficulty } from '@bf/ai';

export const SNAPSHOT_VERSION = 1;
const STORAGE_KEY = 'bf.match.snapshot.v1';

/** One record per advanced tick that carried commands: [pre-advance tick, commands]. */
export type CommandLog = Array<[number, Command[]]>;

export interface MatchSnapshot {
  version: number;
  config: GameConfig;
  difficulty: BotDifficulty;
  /** state.tick the match had reached when snapshotted. */
  tick: number;
  log: CommandLog;
}

export function encodeSnapshot(snapshot: MatchSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Parse + validate; null for anything that cannot be resumed safely. */
export function decodeSnapshot(raw: string | null): MatchSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as MatchSnapshot;
    if (s.version !== SNAPSHOT_VERSION) return null;
    if (typeof s.tick !== 'number' || s.tick < 0) return null;
    if (!Array.isArray(s.log)) return null;
    if (s.difficulty !== 'easy' && s.difficulty !== 'standard' && s.difficulty !== 'hard') return null;
    const cfg = s.config;
    if (!cfg || typeof cfg.seed !== 'number' || !Array.isArray(cfg.players)) return null;
    // only seed-generated practice maps replay from config; scenario starts
    // carry typed arrays that do not survive JSON
    if (!cfg.map || cfg.map.type !== 'practice-random') return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Rebuild the snapshotted state on a FRESH game created from snapshot.config:
 * advance tick by tick, re-feeding each tick's logged commands. Determinism
 * (same seed + same command stream = same state) is the whole trick.
 */
export function replaySnapshot(
  game: Game,
  snapshot: MatchSnapshot,
  onEvents?: (events: SimEvent[]) => void,
): void {
  let li = 0;
  while (game.state.tick < snapshot.tick && !game.state.finished) {
    const t = game.state.tick;
    const cmds: Command[] = [];
    while (li < snapshot.log.length && snapshot.log[li][0] <= t) {
      if (snapshot.log[li][0] === t) cmds.push(...snapshot.log[li][1]);
      li++;
    }
    const events = game.advance(cmds);
    onEvents?.(events);
  }
}

// ------------------------------------------------------------------ storage

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // privacy modes can throw on access
  }
}

export function saveSnapshot(snapshot: MatchSnapshot): void {
  try {
    storage()?.setItem(STORAGE_KEY, encodeSnapshot(snapshot));
  } catch {
    // quota/serialization failure: losing one save beats crashing the match
  }
}

export function loadSnapshot(): MatchSnapshot | null {
  return decodeSnapshot(storage()?.getItem(STORAGE_KEY) ?? null);
}

export function clearSnapshot(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function hasSnapshot(): boolean {
  return loadSnapshot() !== null;
}
