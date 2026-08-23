// Recorded campaign voice-over, in front of the speech synthesizer.
//
// A beat the render tool has captured plays as audio; a beat it has not — new
// dialogue, edited wording, a device that never fetched the manifest — is
// spoken exactly as before. That per-beat fallback is what lets the recordings
// be incomplete on purpose: writers can add a line without waiting for a
// render, and an edited line stops playing the audio of its old wording because
// its id no longer matches.
//
// The seam interface is the one `Narrator` already drives, so banner hold,
// barge-in, pause and end-of-match silencing need no knowledge of which beats
// are recorded.

import type { NarrationRequest, NarrationVoice, SpeechSeam } from './narration';
import { parseVoiceManifest, type VoiceManifest } from './voiceLines';

/** Where the render tool writes, relative to the web root. */
export const VOICE_OVER_DIR = 'assets/vo/';
const MANIFEST_URL = `${VOICE_OVER_DIR}manifest.json`;

/** The slice of HTMLAudioElement the seam drives, kept small so tests can fake it. */
export interface AudioClip {
  src: string;
  volume: number;
  currentTime: number;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

export interface RecordedSpeechOptions {
  /** Spoken instead whenever a beat has no recording. Null on platforms with no synthesizer. */
  fallback: SpeechSeam | null;
  /** Directory the manifest's file names sit in. */
  base?: string;
  /** Injected in tests; defaults to a single reused `Audio` element. */
  createClip?: () => AudioClip;
}

/**
 * 44 bytes of silent WAV. Played on the first gesture so iOS releases the one
 * element every beat afterwards reuses — a fresh element created mid-match
 * would be refused, having no gesture of its own.
 */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

/**
 * Fetch the voice-over manifest. Missing, unreachable or malformed all mean the
 * same thing — no recordings — because narration must never block or break the
 * boot over an optional asset.
 */
export async function loadVoiceManifest(
  url: string = MANIFEST_URL,
  signal?: AbortSignal,
): Promise<VoiceManifest> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return parseVoiceManifest(null);
    return parseVoiceManifest(await response.json());
  } catch {
    return parseVoiceManifest(null);
  }
}

/**
 * Wrap a speech seam so recorded beats play as audio. Returns the fallback
 * unchanged when there is nothing recorded, so the common case adds no layer.
 */
export function createRecordedSpeech(
  manifest: VoiceManifest,
  opts: RecordedSpeechOptions,
): SpeechSeam | null {
  const entries = manifest.lines;
  if (Object.keys(entries).length === 0) return opts.fallback;
  const base = opts.base ?? VOICE_OVER_DIR;
  const fallback = opts.fallback;
  // HTMLAudioElement's handler properties are typed for DOM events; the seam
  // only ever assigns zero-argument callbacks, which they accept at runtime.
  const createClip = opts.createClip ?? ((): AudioClip => new Audio() as unknown as AudioClip);

  let clip: AudioClip | null = null;
  /** Bumped on every speak and cancel, so a late `ended` cannot clear a newer beat. */
  let generation = 0;

  const ensureClip = (): AudioClip | null => {
    if (clip) return clip;
    try {
      clip = createClip();
    } catch {
      clip = null; // no audio element: everything falls back to speech
    }
    return clip;
  };

  const stopClip = (): void => {
    if (!clip) return;
    clip.onended = null;
    clip.onerror = null;
    try {
      clip.pause();
    } catch {
      /* non-fatal */
    }
  };

  return {
    getVoices: () => fallback?.getVoices() ?? ([] as NarrationVoice[]),
    onVoicesChanged: (cb) => fallback?.onVoicesChanged(cb) ?? (() => undefined),

    prime(): void {
      const target = ensureClip();
      if (!target) return;
      try {
        target.volume = 0;
        target.src = SILENCE;
        void target.play();
        target.pause();
      } catch {
        /* non-fatal */
      }
      fallback?.prime?.();
    },

    speak(req: NarrationRequest): void {
      const entry = req.id === undefined ? undefined : entries[req.id];
      const target = entry ? ensureClip() : null;
      if (!entry || !target) {
        fallback?.speak(req);
        return;
      }
      const mine = ++generation;
      let done = false;
      const finish = (): void => {
        if (done || mine !== generation) return;
        done = true;
        req.onDone();
      };
      try {
        stopClip();
        target.onended = finish;
        target.onerror = finish;
        target.volume = Math.min(1, Math.max(0, req.volume));
        target.src = `${base}${entry.file}`;
        target.currentTime = 0;
        const started = target.play();
        // Autoplay refusals surface as a rejected promise, and a refused beat
        // must still be heard: speak it rather than dropping it.
        if (started && typeof started.catch === 'function') {
          started.catch(() => {
            if (done || mine !== generation) return;
            done = true;
            stopClip();
            fallback?.speak(req);
          });
        }
      } catch {
        done = true;
        fallback?.speak(req);
      }
    },

    cancel(): void {
      generation++;
      stopClip();
      fallback?.cancel();
    },
  };
}
