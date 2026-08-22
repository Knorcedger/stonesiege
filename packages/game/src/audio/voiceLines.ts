// The text side of campaign narration, with no browser or settings dependency:
// how an authored dialogue line becomes the beats that are spoken, and how a
// beat is named so a recording of it can be found.
//
// The voice-over render tool imports this module directly, so the beats it
// records and the beats the game asks for are produced by the same code. That
// is the whole point of keeping it separate from `narration.ts`: the tool runs
// under Node, where importing the settings singleton would drag in the DOM.

export interface NarrationLine {
  text: string;
  speaker?: string;
}

/**
 * Prepare banner text for speaking: ellipses become the dots engines actually
 * pause on, and whitespace is collapsed so wrapped scenario strings do not read
 * with gaps. Dashes are left standing — `speechBeats` turns them into silence,
 * which is a longer pause than any punctuation buys.
 */
export function speechText(line: NarrationLine): string {
  return line.text
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a prepared line into the beats spoken one after another, with the
 * delivery's silence held between them. Phrasing is what reads as gravity, so
 * the line breaks where a storyteller would draw breath: sentence ends, dashes,
 * colons and semicolons. A line with nothing to say yields no beats.
 */
export function speechBeats(text: string): string[] {
  const beats: string[] = [];
  let buf = '';
  const flush = (): void => {
    const beat = buf.trim();
    if (beat !== '') beats.push(beat);
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '—' || ch === '–') {
      flush(); // the dash is the silence; it is never spoken
      continue;
    }
    buf += ch;
    // "May 1297. The English" ends a sentence; a decimal point does not.
    if ((ch === '.' || ch === '!' || ch === '?') && !/[0-9]/.test(text.charAt(i + 1))) flush();
    else if (ch === ';' || ch === ':') flush();
  }
  flush();
  return beats;
}

/**
 * The name of one spoken beat, stable across runs and machines: FNV-1a over the
 * speaker and the exact words. Editing a line changes its beats' ids, which
 * orphans the recordings made of the old wording — the game then speaks that
 * beat instead of playing audio that no longer matches the banner. Silent drift
 * between text and voice is the failure this is built to make impossible.
 */
export function voiceLineId(speaker: string | undefined, beat: string): string {
  const key = `${speaker?.trim().toLowerCase() ?? ''}|${beat}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ manifest

/** One recorded beat: the file to play, and how long it runs. */
export interface VoiceLineEntry {
  /** File name inside the voice-over directory. */
  file: string;
  /** Duration in ms, used to bound the banner hold. */
  ms: number;
  /** The words recorded, kept for review and for debugging a stale render. */
  text?: string;
  speaker?: string;
}

/** What `npm run vo:render` writes next to the audio. */
export interface VoiceManifest {
  version: 1;
  /** The voice each speaker was rendered with, for the provenance record. */
  voices?: Record<string, string>;
  lines: Record<string, VoiceLineEntry>;
}

/** An empty manifest: every beat falls back to the speech synthesizer. */
export const EMPTY_VOICE_MANIFEST: VoiceManifest = { version: 1, lines: {} };

/**
 * Accept only what can actually be played. A half-written or hand-edited
 * manifest must degrade to synthesis rather than fail the boot, so anything
 * unrecognised is dropped entry by entry instead of rejecting the file.
 */
export function parseVoiceManifest(raw: unknown): VoiceManifest {
  if (typeof raw !== 'object' || raw === null) return EMPTY_VOICE_MANIFEST;
  const source = (raw as { lines?: unknown }).lines;
  if (typeof source !== 'object' || source === null) return EMPTY_VOICE_MANIFEST;
  const lines: Record<string, VoiceLineEntry> = {};
  for (const [id, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const { file, ms } = value as { file?: unknown; ms?: unknown };
    if (typeof file !== 'string' || file === '') continue;
    if (file.includes('..') || file.includes('/')) continue; // stays in its own directory
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) continue;
    lines[id] = { file, ms: Math.round(ms) };
  }
  return { version: 1, lines };
}
