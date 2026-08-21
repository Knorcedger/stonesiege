// Match snapshot/resume (GDD: backgrounding auto-snapshots the match — the
// deterministic sim makes this cheap). Two snapshot flavors:
//  - practice: full GameConfig (JSON-safe practice-random map) + command log
//  - scenario: scenario id + seed (config rebuilds from the authored def) +
//    command log — replaying the log through the sim AND the trigger runtime
//    reconstructs the identical mid-mission state.
// When the sim provides game.serialize()/deserialize() (landing in @bf/sim),
// the blob is stored too and used as a fast path for practice resumes; absent
// or failing serialization degrades gracefully to log replay.
//
// Everything here is defensive — a corrupt/mismatched snapshot is never
// replayed, while its raw record remains available to the recovery UI until
// the player explicitly discards it.

import type { Command, Game, GameConfig, SimEvent } from '@bf/sim/types';
import { gameData } from '@bf/data';
import { scenariosById } from '@bf/scenarios';
import { BOT_DIFFICULTIES, type BotDifficulty } from '@bf/ai';
import { appStorage } from './storage';
import { formatMatchTime, isMatchTallies, type MatchTallies } from './hud/summary';
import type { PracticeSetup } from './simBridge';

export const SNAPSHOT_VERSION = 3;
/** Pre-slot single-save key. Read once at startup and migrated into its slot. */
const LEGACY_STORAGE_KEY = 'bf.match.snapshot.v2';
const SLOT_KEY_PREFIX = 'bf.match.slot.v1.';
const INDEX_KEY = 'bf.match.index.v1';

/** One record per advanced tick that carried commands: [pre-advance tick, commands]. */
export type CommandLog = Array<[number, Command[]]>;

export interface PracticeSnapshot {
  version: number;
  mode: 'practice';
  config: GameConfig;
  /** Recreates the per-opponent bots on resume. */
  setup: PracticeSetup;
  /** state.tick the match had reached when snapshotted. */
  tick: number;
  log: CommandLog;
  /** game.serialize() blob when the sim provides one (fast-path restore). */
  serialized?: unknown;
  /** Renderer-owned statistics required by the end-of-match report. */
  tallies?: MatchTallies;
}

export interface ScenarioSnapshot {
  version: number;
  mode: 'scenario';
  scenarioId: string;
  /** Seed the scenario config was created with (config rebuilds from the def). */
  seed: number;
  /**
   * scenarioFingerprint(scenarioId) at save time. A scenario resume rebuilds
   * its config from the CURRENT authored def and log-replays against it, so
   * any def/game-data change since the save would silently diverge the
   * replay; decodeSnapshot rejects on mismatch instead.
   */
  fingerprint: string;
  tick: number;
  log: CommandLog;
  serialized?: unknown;
  /** Renderer-owned statistics required by the end-of-match report. */
  tallies?: MatchTallies;
}

export type MatchSnapshot = PracticeSnapshot | ScenarioSnapshot;

export function encodeSnapshot(snapshot: MatchSnapshot): string {
  return JSON.stringify(snapshot);
}

// ------------------------------------------------------- scenario fingerprint
// A scenario snapshot only stores (id, seed, log): the replay's other input is
// whatever the CURRENT build authors for that scenario plus the game data the
// sim runs on. Both change between app updates (map layout, starting entities,
// trigger edits, unit stat tweaks), and a log replayed against changed content
// silently diverges — commands no-op against missing entities, triggers latch
// differently. So saves are stamped with a content hash of everything the
// replay depends on, and a mismatched save reads as "no snapshot".

/** FNV-1a over a string, as 8 hex chars. */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const fingerprintCache = new Map<string, string | null>();

/**
 * Content fingerprint of a scenario replay's inputs: the authored ScenarioDef
 * (pure declarative data — JSON captures all of it) plus the full game data.
 * Null for scenario ids the current build no longer authors. Cached — defs and
 * game data are immutable for the life of the app.
 */
export function scenarioFingerprint(scenarioId: string): string | null {
  const cached = fingerprintCache.get(scenarioId);
  if (cached !== undefined) return cached;
  const def = scenariosById[scenarioId];
  const fp = def ? hashString(`${JSON.stringify(def)}\0${JSON.stringify(gameData)}`) : null;
  fingerprintCache.set(scenarioId, fp);
  return fp;
}

const LEGACY_DIFFICULTIES: readonly string[] = ['easy', 'standard', 'hard'];
const MAP_SIZES = ['small', 'medium', 'large'];

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Parse + validate; null for anything that cannot be resumed safely. */
export function decodeSnapshot(raw: string | null): MatchSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as MatchSnapshot;
    if (s.version !== SNAPSHOT_VERSION && s.version !== 2) return null;
    if (!isInt(s.tick) || s.tick < 0) return null;
    if (!Array.isArray(s.log)) return null;
    if (s.tallies !== undefined && !isMatchTallies(s.tallies)) return null;
    if (s.mode === 'practice') {
      const cfg = s.config;
      if (!cfg || typeof cfg.seed !== 'number' || !Array.isArray(cfg.players)) return null;
      // only seed-generated practice maps replay from a stored config; scenario
      // starts carry typed arrays that do not survive JSON (they rebuild from defs)
      if (!cfg.map || cfg.map.type !== 'practice-random') return null;
      const setup = s.setup;
      if (!setup || !MAP_SIZES.includes(setup.mapSize)) return null;
      if (!Array.isArray(setup.opponents) || setup.opponents.length < 1) return null;
      let opponents: BotDifficulty[];
      if (s.version === 2) {
        if (!setup.opponents.every((d) => LEGACY_DIFFICULTIES.includes(d))) return null;
        // Version 2 only had Easy / Standard / Hard. The old Hard tuning is now
        // Medium, so resume it there to keep the saved match deterministic.
        opponents = setup.opponents.map((d) => d === 'hard' ? 'medium' : d) as BotDifficulty[];
      } else {
        if (!setup.opponents.every((d) => BOT_DIFFICULTIES.includes(d as BotDifficulty))) return null;
        opponents = [...setup.opponents];
      }
      if (typeof setup.civ !== 'string' || !isInt(setup.color)) return null;
      return { ...s, version: SNAPSHOT_VERSION, setup: { ...setup, opponents } };
    }
    if (s.mode === 'scenario') {
      if (typeof s.scenarioId !== 'string' || s.scenarioId.length === 0) return null;
      if (typeof s.seed !== 'number') return null;
      // stale across an app update (or unknown scenario): the current def/game
      // data no longer matches what the log was recorded against — replaying
      // would silently produce a subtly wrong mission, so refuse to replay it
      if (typeof s.fingerprint !== 'string'
        || s.fingerprint !== scenarioFingerprint(s.scenarioId)) return null;
      return { ...s, version: SNAPSHOT_VERSION };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Rebuild the snapshotted state on a FRESH game created from the same config:
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

export interface IncrementalReplayOptions {
  onEvents?: (events: SimEvent[]) => void;
  onProgress?: (completedTick: number, targetTick: number) => void;
  /** Browser yield seam; injectable so deterministic tests do not wait on timers. */
  yieldControl?: () => Promise<void>;
  now?: () => number;
  chunkBudgetMs?: number;
  maxTicksPerChunk?: number;
  timeoutMs?: number;
}

/**
 * The observable resume path. It performs the same deterministic tick replay
 * as replaySnapshot(), but in bounded chunks so the browser can paint the
 * progress bar and remain responsive throughout a long match restore.
 */
export async function replaySnapshotIncrementally(
  game: Game,
  snapshot: MatchSnapshot,
  options: IncrementalReplayOptions = {},
): Promise<void> {
  const now = options.now ?? (() => performance.now());
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const chunkBudgetMs = options.chunkBudgetMs ?? 16;
  const maxTicksPerChunk = options.maxTicksPerChunk ?? 250;
  // A 90-minute campaign is a supported save. Keep the operation bounded,
  // but leave enough room for older phones while visible progress continues.
  const timeoutMs = options.timeoutMs ?? 300_000;
  const startedAt = now();
  let li = 0;

  options.onProgress?.(game.state.tick, snapshot.tick);
  while (game.state.tick < snapshot.tick && !game.state.finished) {
    const chunkStartedAt = now();
    let chunkTicks = 0;
    do {
      const tick = game.state.tick;
      const commands: Command[] = [];
      while (li < snapshot.log.length && snapshot.log[li][0] <= tick) {
        if (snapshot.log[li][0] === tick) commands.push(...snapshot.log[li][1]);
        li++;
      }
      const events = game.advance(commands);
      options.onEvents?.(events);
      chunkTicks++;
    } while (
      game.state.tick < snapshot.tick
      && !game.state.finished
      && chunkTicks < maxTicksPerChunk
      && now() - chunkStartedAt < chunkBudgetMs
    );

    options.onProgress?.(game.state.tick, snapshot.tick);
    if (game.state.tick >= snapshot.tick) break;
    if (game.state.finished) {
      throw new Error('The saved battle ended before its recorded restore point.');
    }
    if (now() - startedAt >= timeoutMs) {
      throw new Error('Restoring this saved match took too long.');
    }
    await yieldControl();
  }

  if (game.state.tick !== snapshot.tick) {
    throw new Error('The saved match could not be replayed to its recorded restore point.');
  }
}

// -------------------------------------------------- sim serialization seam
// @bf/sim's snapshot API: game.serialize() -> JSON-safe GameSnapshot,
// restored via createGameFromSnapshot (see simBridge.gameFromSerialized).
// Both directions stay defensive: an implementation without serialize (the
// dev mock predates it) or a blob the sim rejects degrades to log replay.

/** The sim's serialized blob, or undefined when unsupported/failed. */
export function trySerialize(game: Game): unknown {
  const g = game as unknown as { serialize?: () => unknown };
  if (typeof g.serialize !== 'function') return undefined;
  try {
    const blob = g.serialize();
    // never persist a blob that cannot survive JSON (Maps, functions, cycles)
    return JSON.parse(JSON.stringify(blob));
  } catch {
    return undefined;
  }
}

// ------------------------------------------------------------------ storage
//
// One slot per campaign, plus one for practice. Bounded at eight today, so
// there is no save-management UI to build, and it matches how players describe
// the want: start Wallace, start Joan, come back to Wallace. Starting a Joan
// chapter must never touch the Wallace slot.
//
// Budget: localStorage is ~5 MB. A practice save is ~400 KiB, almost all of it
// the sim's `serialized` fast-path blob, while a campaign save is log-only at
// roughly 30-150 KiB (measured on this build). Eight blob-carrying slots would
// crowd the quota, so scenario snapshots drop the blob — bootGame only ever
// takes the fast path for practice anyway, because a TriggerRuntime's
// fired/objective state reconstructs from the event stream alone.

/** `practice`, or `campaign:<campaignId>`. */
export type SaveSlot = string;

export const PRACTICE_SLOT: SaveSlot = 'practice';
export const campaignSlot = (campaignId: string): SaveSlot => `campaign:${campaignId}`;

/** Slot a snapshot belongs in. Campaign is resolved through the scenario's def. */
export function slotForSnapshot(snapshot: MatchSnapshot): SaveSlot {
  if (snapshot.mode !== 'scenario') return PRACTICE_SLOT;
  const campaign = scenariosById[snapshot.scenarioId]?.campaign;
  return campaign ? campaignSlot(campaign) : campaignSlot('unknown');
}

/** Menu-facing summary of one slot — enough to list saves without decoding them. */
export interface SaveEntry {
  slot: SaveSlot;
  mode: 'practice' | 'scenario';
  /** Campaign chapter this save is in, when it is a campaign save. */
  scenarioId?: string;
  campaignId?: string;
  /** 'The Sheriff of Lanark, 42:10' */
  label: string;
  tick: number;
  /**
   * Save ordering. A counter, not a clock: it needs no wall-clock source, and
   * ordering is the only thing the menu asks of it.
   */
  seq: number;
}

interface SaveIndex {
  next: number;
  entries: SaveEntry[];
}

const slotKey = (slot: SaveSlot): string => `${SLOT_KEY_PREFIX}${slot}`;

const isEntry = (e: unknown): e is SaveEntry => {
  const c = e as SaveEntry | null;
  return !!c && typeof c.slot === 'string' && typeof c.label === 'string'
    && typeof c.tick === 'number' && typeof c.seq === 'number'
    && (c.mode === 'practice' || c.mode === 'scenario');
};

function decodeIndex(raw: string | null): SaveIndex {
  if (!raw) return { next: 1, entries: [] };
  try {
    const parsed = JSON.parse(raw) as SaveIndex;
    if (!Array.isArray(parsed.entries)) return { next: 1, entries: [] };
    const entries = parsed.entries.filter(isEntry);
    const next = typeof parsed.next === 'number' && parsed.next > 0 ? parsed.next : 1;
    return { next, entries };
  } catch {
    return { next: 1, entries: [] };
  }
}

/**
 * Fold the pre-slot single save into its slot, once. A record that no longer
 * decodes still moves: hasSave stays true for it so the recovery screen can
 * explain the problem and the player, not startup code, decides to discard it.
 */
function migrateLegacySave(index: SaveIndex): SaveIndex {
  const raw = appStorage.get(LEGACY_STORAGE_KEY);
  if (raw === null) return index;
  const decoded = decodeSnapshot(raw);
  const slot = decoded ? slotForSnapshot(decoded) : PRACTICE_SLOT;
  if (index.entries.some((e) => e.slot === slot)) {
    appStorage.remove(LEGACY_STORAGE_KEY); // a newer per-slot save already owns it
    return index;
  }
  // Copy before dropping the original: a failed write (full device) must leave
  // the save where it is so the next boot can try again, not delete it.
  if (!appStorage.trySet(slotKey(slot), raw)) return index;
  appStorage.remove(LEGACY_STORAGE_KEY);
  const entry: SaveEntry = decoded
    ? entryFor(slot, decoded, index.next)
    : {
      slot, mode: 'practice', tick: 0, seq: index.next,
      label: 'Saved match from an earlier or incompatible version',
    };
  return { next: index.next + 1, entries: [...index.entries, entry] };
}

let indexCache: SaveIndex | null = null;

function readIndex(): SaveIndex {
  if (indexCache) return indexCache;
  const stored = decodeIndex(appStorage.get(INDEX_KEY));
  const migrated = migrateLegacySave(stored);
  indexCache = migrated;
  // A migration only happens once, and the legacy key is already gone, so the
  // new index has to reach storage now or the moved save is orphaned: still on
  // disk in its slot, but invisible to Continue and the campaign list.
  if (migrated !== stored) appStorage.set(INDEX_KEY, JSON.stringify(migrated));
  return indexCache;
}

function writeIndex(index: SaveIndex): void {
  indexCache = index;
  appStorage.set(INDEX_KEY, JSON.stringify(index));
}

/** Drop cached index state (tests that swap the storage backend). */
export function resetSaveIndexCache(): void {
  indexCache = null;
}

function snapshotLabel(snapshot: MatchSnapshot): string {
  const title = snapshot.mode === 'scenario'
    ? scenariosById[snapshot.scenarioId]?.title ?? 'campaign mission'
    : 'Practice match';
  return `${title}, ${formatMatchTime(snapshot.tick)}`;
}

function entryFor(slot: SaveSlot, snapshot: MatchSnapshot, seq: number): SaveEntry {
  return {
    slot,
    mode: snapshot.mode,
    ...(snapshot.mode === 'scenario' ? { scenarioId: snapshot.scenarioId } : {}),
    ...(snapshot.mode === 'scenario'
      ? { campaignId: scenariosById[snapshot.scenarioId]?.campaign ?? 'unknown' }
      : {}),
    label: snapshotLabel(snapshot),
    tick: snapshot.tick,
    seq,
  };
}

/**
 * Persist a match into its slot. On a full device the write sheds ballast
 * rather than failing outright: first the practice fast-path blob, then the
 * least-recently-saved OTHER slot, one at a time. The save being written is
 * never the one evicted — the match in front of the player wins.
 */
export function saveSnapshot(snapshot: MatchSnapshot): void {
  const slot = slotForSnapshot(snapshot);
  // A scenario resume always log-replays, so its blob is unreadable weight.
  const stored: MatchSnapshot = snapshot.mode === 'scenario' && snapshot.serialized !== undefined
    ? { ...snapshot, serialized: undefined }
    : snapshot;
  let payload: string;
  try {
    payload = encodeSnapshot(stored);
  } catch {
    return; // unserializable state: losing one save beats crashing the match
  }
  let index = readIndex();
  if (!appStorage.trySet(slotKey(slot), payload)) {
    if (stored.serialized !== undefined) {
      payload = encodeSnapshot({ ...stored, serialized: undefined });
    }
    while (!appStorage.trySet(slotKey(slot), payload)) {
      const oldest = [...index.entries]
        .filter((e) => e.slot !== slot)
        .sort((a, b) => a.seq - b.seq)[0];
      if (!oldest) return; // nothing left to give up
      appStorage.remove(slotKey(oldest.slot));
      index = { ...index, entries: index.entries.filter((e) => e.slot !== oldest.slot) };
      writeIndex(index);
    }
  }
  writeIndex({
    next: index.next + 1,
    entries: [
      ...index.entries.filter((e) => e.slot !== slot),
      entryFor(slot, stored, index.next),
    ],
  });
}

export function loadSnapshot(slot: SaveSlot): MatchSnapshot | null {
  return decodeSnapshot(appStorage.get(slotKey(slot)));
}

export function clearSnapshot(slot: SaveSlot): void {
  appStorage.remove(slotKey(slot));
  const index = readIndex();
  writeIndex({ ...index, entries: index.entries.filter((e) => e.slot !== slot) });
}

/**
 * True when a slot holds any saved-match record, including an incompatible or
 * corrupt one. The menu still offers Resume so the recovery screen can explain
 * the problem and the player, not startup code, decides whether to discard it.
 */
export function hasSnapshot(slot: SaveSlot): boolean {
  return appStorage.get(slotKey(slot)) !== null;
}

/** Every save on the device, most recently saved first. */
export function listSaves(): SaveEntry[] {
  return [...readIndex().entries].sort((a, b) => b.seq - a.seq);
}

/** What Continue on the title screen resumes. */
export function mostRecentSave(): SaveEntry | null {
  return listSaves()[0] ?? null;
}

export function saveForCampaign(campaignId: string): SaveEntry | null {
  return listSaves().find((e) => e.slot === campaignSlot(campaignId)) ?? null;
}

/**
 * 'The Sheriff of Lanark, 42:10' — what starting a new match in THIS slot
 * would abandon, or null when the slot is free. The menu's start buttons show
 * it in their two-tap abandon confirm; a save in another campaign's slot is
 * not at risk and must not raise one.
 */
export function savedMatchLabel(slot: SaveSlot): string | null {
  const s = loadSnapshot(slot);
  if (s) return snapshotLabel(s);
  return hasSnapshot(slot) ? 'Saved match from an earlier or incompatible version' : null;
}
