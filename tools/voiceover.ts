// Campaign voice-over renderer: turns the spoken lines of the shipping chapters
// into committed audio files plus the manifest the game looks them up in.
//
// Run through `npm run vo:render` (see tools/run-voiceover.mjs), which loads
// this module through Vite so the repository's @bf/* aliases resolve exactly as
// they do in tests and the production build.
//
// Rendering needs macOS: `say` synthesises and `afconvert` encodes, both of
// which ship with the system, so there is no new dependency and no service to
// call. `--list` works everywhere and prints what would be rendered, which is
// how a non-macOS contributor reviews a change to the dialogue.
//
// The beats and their ids come from packages/game/src/audio/voiceLines.ts — the
// same code the game asks with — so a render can never disagree with playback
// about what a beat is called.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wallaceChapters } from '@bf/scenarios/scenarios/wallaceChapters';
import type { ScenarioDef } from '@bf/scenarios/schema';
import { deliveryFor } from '@bf/game/audio/narration';
import {
  speechBeats, speechText, voiceLineId, type VoiceLineEntry, type VoiceManifest,
} from '@bf/game/audio/voiceLines';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps/web/public/assets/vo');
const CACHE_DIR = join(ROOT, '.vo-cache');
const MANIFEST = join(OUT_DIR, 'manifest.json');

/** The voice every speaker is read by unless the cast says otherwise. */
export const DEFAULT_VOICE = 'Martha';

/**
 * `say -r` counts words per minute where the browser counts multiples of the
 * voice's natural rate. Martha reads at roughly this pace at rate 1, so the
 * recordings land at the same speed the synthesised fallback would.
 */
const BASE_WPM = 175;

export interface VoiceBeat {
  id: string;
  /** The words to render — one beat, not the whole line. */
  text: string;
  speaker: string | undefined;
  /** Scenario the line belongs to, for the render log and the manifest. */
  chapter: string;
  /** Words per minute for `say -r`, from the speaker's delivery. */
  wpm: number;
}

export interface RenderOptions {
  list?: boolean;
  /** Re-render beats that already have a file. */
  force?: boolean;
  voice?: string;
  /** Per-speaker voices, e.g. `{ wallace: 'Daniel' }`. Keys are lower-cased. */
  cast?: Record<string, string>;
}

// ------------------------------------------------------------------ the lines

/**
 * Every spoken beat of the given scenarios, in chapter order, de-duplicated by
 * id: two chapters that reuse a line share one recording.
 */
export function collectVoiceBeats(scenarios: readonly ScenarioDef[]): VoiceBeat[] {
  const beats: VoiceBeat[] = [];
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    for (const trigger of scenario.triggers) {
      for (const effect of trigger.effects) {
        if (effect.kind !== 'message') continue;
        const speaker = effect.speaker;
        const wpm = Math.round(BASE_WPM * deliveryFor(speaker).rate);
        for (const text of speechBeats(speechText({ text: effect.text, speaker }))) {
          const id = voiceLineId(speaker, text);
          if (seen.has(id)) continue;
          seen.add(id);
          beats.push({ id, text, speaker, chapter: scenario.id, wpm });
        }
      }
    }
  }
  return beats;
}

/** The beats of the campaign as shipped — the 12 selectable chapters. */
export function shippingVoiceBeats(): VoiceBeat[] {
  return collectVoiceBeats(wallaceChapters);
}

// --------------------------------------------------------------- rendering

const voiceFor = (beat: VoiceBeat, opts: RenderOptions): string =>
  opts.cast?.[beat.speaker?.trim().toLowerCase() ?? ''] ?? opts.voice ?? DEFAULT_VOICE;

/** `<speaker>-<id>.m4a`: readable in a directory listing, unique by id. */
export function fileNameFor(beat: VoiceBeat): string {
  const slug = (beat.speaker ?? 'narrator')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'narrator';
  return `${slug}-${beat.id}.m4a`;
}

function readManifest(): VoiceManifest {
  try {
    const raw = JSON.parse(readFileSync(MANIFEST, 'utf8')) as VoiceManifest;
    if (raw && typeof raw === 'object' && raw.lines) return raw;
  } catch {
    /* first run, or a manifest that is being replaced anyway */
  }
  return { version: 1, lines: {} };
}

/** Sorted keys so a re-render produces a diff only where audio actually changed. */
function writeManifest(manifest: VoiceManifest): void {
  const lines: Record<string, VoiceLineEntry> = {};
  for (const id of Object.keys(manifest.lines).sort()) lines[id] = manifest.lines[id]!;
  writeFileSync(MANIFEST, `${JSON.stringify({ ...manifest, lines }, null, 2)}\n`, 'utf8');
}

/** Duration in ms, from the encoded file rather than from an estimate. */
function durationMs(file: string): number {
  try {
    const info = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const match = /estimated duration:\s*([0-9.]+)\s*sec/i.exec(info);
    if (match) return Math.round(Number(match[1]) * 1000);
  } catch {
    /* fall through to the estimate */
  }
  return 0;
}

function renderBeat(beat: VoiceBeat, opts: RenderOptions): VoiceLineEntry {
  const aiff = join(CACHE_DIR, `${beat.id}.aiff`);
  const file = fileNameFor(beat);
  const out = join(OUT_DIR, file);
  execFileSync('say', [
    '-v', voiceFor(beat, opts),
    '-r', String(beat.wpm),
    '-o', aiff,
    '--data-format=LEI16@22050',
    beat.text,
  ]);
  rmSync(out, { force: true }); // afconvert refuses to overwrite
  execFileSync('afconvert', [aiff, out, '-f', 'm4af', '-d', 'aac', '-b', '48000']);
  const ms = durationMs(out);
  return {
    file,
    // A file whose duration cannot be read still plays; the estimate only bounds
    // how long the banner is willing to wait for it.
    ms: ms > 0 ? ms : Math.max(700, Math.round((beat.text.length * 72) / (beat.wpm / BASE_WPM))),
    text: beat.text,
    speaker: beat.speaker,
  };
}

// -------------------------------------------------------------------- CLI

function parseArgs(argv: readonly string[]): RenderOptions {
  const opts: RenderOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--list') opts.list = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--voice') opts.voice = argv[++i];
    else if (arg.startsWith('--voice=')) opts.voice = arg.slice('--voice='.length);
    else if (arg === '--cast' || arg.startsWith('--cast=')) {
      const value = arg.startsWith('--cast=') ? arg.slice('--cast='.length) : argv[++i] ?? '';
      opts.cast = opts.cast ?? {};
      for (const pair of value.split(',')) {
        const [speaker, voice] = pair.split('=');
        if (speaker && voice) opts.cast[speaker.trim().toLowerCase()] = voice.trim();
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

/** Returns a process exit code. */
export function runVoiceOverCli(argv: readonly string[]): number {
  let opts: RenderOptions;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.stderr.write('Usage: npm run vo:render -- [--list] [--force] [--voice Martha] [--cast Wallace=Daniel]\n');
    return 2;
  }

  const beats = shippingVoiceBeats();
  const spoken = beats.reduce((n, b) => n + b.text.length, 0);
  process.stdout.write(`${beats.length} beats, ${spoken} characters\n`);

  if (opts.list) {
    for (const beat of beats) {
      process.stdout.write(
        `  ${beat.id}  ${beat.chapter.padEnd(20)} ${(beat.speaker ?? '—').padEnd(12)} `
        + `${String(beat.wpm).padStart(3)}wpm  ${beat.text}\n`,
      );
    }
    return 0;
  }

  if (process.platform !== 'darwin') {
    process.stderr.write(
      'Rendering needs macOS: `say` and `afconvert` are system binaries.\n'
      + 'Use --list to review the lines on another platform; the game speaks any beat that has no recording.\n',
    );
    return 1;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const previous = readManifest();
  const manifest: VoiceManifest = { version: 1, voices: {}, lines: {} };
  let rendered = 0;
  let reused = 0;

  for (const beat of beats) {
    const voice = voiceFor(beat, opts);
    manifest.voices![beat.speaker ?? 'Narrator'] = voice;
    const existing = previous.lines[beat.id];
    if (!opts.force && existing && existsSync(join(OUT_DIR, existing.file))) {
      manifest.lines[beat.id] = existing;
      reused++;
      continue;
    }
    try {
      manifest.lines[beat.id] = renderBeat(beat, opts);
      rendered++;
      process.stdout.write(`  rendered ${beat.id}  ${beat.text}\n`);
    } catch (error) {
      process.stderr.write(`  FAILED   ${beat.id}: ${(error as Error).message}\n`);
      return 1;
    }
  }

  // Anything left over is a recording of wording that no longer exists. Leaving
  // it would ship audio no beat can ever ask for.
  const keep = new Set(Object.values(manifest.lines).map((entry) => entry.file));
  let pruned = 0;
  for (const name of readdirSync(OUT_DIR)) {
    if (name === 'manifest.json' || keep.has(name)) continue;
    rmSync(join(OUT_DIR, name), { force: true });
    pruned++;
  }

  writeManifest(manifest);
  process.stdout.write(
    `${rendered} rendered, ${reused} unchanged, ${pruned} stale removed → ${MANIFEST}\n`,
  );
  return 0;
}
