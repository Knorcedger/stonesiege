// Campaign narration: reads the scenario dialogue banner aloud through the
// platform speech synthesizer so chapters play as spoken story instead of
// silent text. There are no voice-over assets — the browser's installed voices
// are steered into a slow, low, deliberate delivery, and each speaker keeps a
// stable pitch of its own so characters stay apart by ear.
//
// The browser API is reached only through the SpeechSeam below, so voice
// choice, delivery and speaking-state logic are pure and unit-tested under the
// repo's `node` test environment. Every entry point is defensive: narration
// failure must never reach gameplay.

import { getSettings, onSettingsChanged, type GameSettings } from '../settings';

export interface NarrationLine {
  text: string;
  speaker?: string;
}

/** The subset of SpeechSynthesisVoice the picker ranks on. */
export interface NarrationVoice {
  readonly name: string;
  readonly lang: string;
  readonly localService?: boolean;
  readonly default?: boolean;
}

/** One prepared utterance handed to the seam. */
export interface NarrationRequest {
  text: string;
  voice: NarrationVoice | null;
  /** Speed, 0.1..2 (1 = the voice's natural rate). */
  rate: number;
  /** Pitch, 0..2 (1 = the voice's natural pitch). */
  pitch: number;
  /** Final gain, 0..1. */
  volume: number;
  /** Fired when the utterance finishes, errors, or is cancelled. */
  onDone: () => void;
}

/** Platform seam. `createBrowserSpeech` is the only implementation shipped. */
export interface SpeechSeam {
  getVoices(): NarrationVoice[];
  speak(req: NarrationRequest): void;
  cancel(): void;
  /** Subscribe to late voice-list population; returns an unsubscribe. */
  onVoicesChanged(cb: () => void): () => void;
}

// ------------------------------------------------------------- spoken text

/**
 * Prepare banner text for the synthesizer: dashes and ellipses become the
 * punctuation engines actually pause on, and whitespace is collapsed so
 * wrapped scenario strings do not read with gaps.
 */
export function speechText(line: NarrationLine): string {
  return line.text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// --------------------------------------------------------------- delivery

export interface NarrationDelivery {
  rate: number;
  pitch: number;
}

/** The storyteller voices: the deepest, slowest read in the campaign. */
const NARRATOR_SPEAKERS = new Set(['narrator', 'chronicle']);

const NARRATOR_DELIVERY: NarrationDelivery = { rate: 0.78, pitch: 0.55 };
const CHARACTER_RATE = 0.86;
/** Characters read above the narrator, so the storyteller stays the deepest voice. */
const CHARACTER_PITCH = 0.78;

/** Stable non-cryptographic hash so a speaker sounds the same in every chapter. */
function speakerHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * How a line should be spoken. The narrator and the chronicle get the epic
 * read; every other speaker gets a character pitch derived from its name, so
 * Wallace and Cressingham are told apart without per-character authoring.
 */
export function deliveryFor(speaker: string | undefined): NarrationDelivery {
  const key = speaker?.trim().toLowerCase() ?? '';
  if (key === '' || NARRATOR_SPEAKERS.has(key)) return { ...NARRATOR_DELIVERY };
  // 8 stable steps across ±0.14 around the character pitch.
  const step = speakerHash(key) % 8;
  return { rate: CHARACTER_RATE, pitch: CHARACTER_PITCH + (step - 3.5) * 0.04 };
}

// ---------------------------------------------------------- voice picking

/** Name fragments of voices that read as a low, formal storyteller. */
const PREFERRED_NAMES = [
  'daniel', 'arthur', 'oliver', 'george', 'brian', 'ryan', 'james', 'alex', 'fred',
  'rishi', 'gordon', 'aaron', 'male',
];
/** Voices whose delivery fights the intent (novelty, or clearly not a narrator). */
const REJECTED_NAMES = [
  'whisper', 'bells', 'bubbles', 'organ', 'cellos', 'trinoids', 'zarvox', 'wobble',
  'bahh', 'boing', 'jester', 'superstar', 'bad news', 'good news', 'albert', 'eddy',
  'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley', 'junior', 'kathy',
  'novelty', 'compact',
];
const FEMALE_NAMES = [
  'female', 'samantha', 'karen', 'moira', 'tessa', 'fiona', 'serena', 'kate', 'zira',
  'susan', 'hazel', 'catherine', 'martha', 'amelie', 'victoria', 'ava', 'allison',
  'nicky', 'joelle', 'noelle',
];

const containsAny = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/** Higher is a better narrator. Negative means unusable. */
export function voiceScore(voice: NarrationVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('en')) return -1;
  if (containsAny(name, REJECTED_NAMES)) return -1;

  let score = 0;
  // A British read carries the Wallace-era campaigns best; other English
  // accents still narrate well, so they rank below rather than out.
  if (lang.startsWith('en-gb')) score += 40;
  else if (lang.startsWith('en-ie') || lang.startsWith('en-au') || lang.startsWith('en-nz')) score += 24;
  else if (lang.startsWith('en-za') || lang.startsWith('en-in')) score += 16;
  else score += 8;

  if (containsAny(name, PREFERRED_NAMES)) score += 30;
  if (containsAny(name, FEMALE_NAMES)) score -= 20;
  // Network voices sound better but stall offline; local wins the tiebreak.
  if (voice.localService) score += 6;
  if (voice.default) score += 2;
  return score;
}

/** The best installed narrator voice, or null to let the platform default read. */
export function pickNarrationVoice(voices: readonly NarrationVoice[]): NarrationVoice | null {
  let best: NarrationVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const score = voiceScore(v);
    // Strictly greater keeps the first of equally ranked voices — the platform
    // list order is stable, so the pick does not shift between sessions.
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

// ------------------------------------------------------------ speaking time

/**
 * How long a line should take to speak, used to hold the banner up and to time
 * out a seam that never reports completion. Roughly 14 characters per second
 * at rate 1, floored so very short lines still get a beat.
 */
export function estimateSpeechMs(text: string, rate: number): number {
  const safeRate = rate > 0 ? rate : 1;
  return Math.max(700, Math.round((text.length * 72) / safeRate));
}

/** Grace beyond the estimate before a silent seam is assumed finished. */
const SPEECH_TIMEOUT_FACTOR = 1.8;

// ------------------------------------------------------------------ narrator

export interface NarratorOptions {
  /** Muted while the tab is hidden, like the rest of the audio buses. */
  isHidden?: () => boolean;
  /** Injected in tests; defaults to the live settings singleton. */
  readSettings?: () => GameSettings;
}

/**
 * Speaks campaign lines. `speak`/`isSpeaking` take the caller's frame clock so
 * the timeout stays testable — the banner already has one.
 */
export class Narrator {
  private voice: NarrationVoice | null = null;
  private voicesResolved = false;
  private active: { startedAt: number; timeoutMs: number } | null = null;
  private disposers: Array<() => void> = [];
  private readonly isHidden: () => boolean;
  private readonly readSettings: () => GameSettings;

  constructor(private readonly seam: SpeechSeam | null, opts: NarratorOptions = {}) {
    this.isHidden = opts.isHidden ?? (() => typeof document !== 'undefined' && document.hidden);
    this.readSettings = opts.readSettings ?? (() => getSettings());
    if (!seam) return;
    // Chromium populates getVoices() asynchronously; re-pick when it lands.
    this.disposers.push(seam.onVoicesChanged(() => {
      this.voicesResolved = false;
    }));
    this.disposers.push(onSettingsChanged((s) => {
      if (!s.narrationEnabled || this.gain(s) <= 0) this.cancel();
    }));
  }

  private gain(s: GameSettings): number {
    return Math.min(1, Math.max(0, s.masterVolume * s.narrationVolume));
  }

  private resolveVoice(): NarrationVoice | null {
    if (this.voicesResolved) return this.voice;
    try {
      const voices = this.seam?.getVoices() ?? [];
      // An empty list means the platform has not published voices yet: keep
      // asking until one arrives rather than caching "no voice" forever.
      if (voices.length > 0) {
        this.voice = pickNarrationVoice(voices);
        this.voicesResolved = true;
      }
    } catch {
      this.voicesResolved = true;
    }
    return this.voice;
  }

  /** The voice currently chosen to read (null = platform default). */
  get selectedVoice(): NarrationVoice | null {
    return this.voice;
  }

  /** Speak a banner line, replacing anything already being read. */
  speak(line: NarrationLine, now: number): void {
    if (!this.seam) return;
    const settings = this.readSettings();
    const volume = this.gain(settings);
    if (!settings.narrationEnabled || volume <= 0 || this.isHidden()) return;
    const text = speechText(line);
    if (text === '') return;
    const delivery = deliveryFor(line.speaker);
    try {
      this.seam.cancel(); // barge-in: the newest line always wins
      this.active = {
        startedAt: now,
        timeoutMs: estimateSpeechMs(text, delivery.rate) * SPEECH_TIMEOUT_FACTOR,
      };
      const request: NarrationRequest = {
        text,
        voice: this.resolveVoice(),
        rate: delivery.rate,
        pitch: delivery.pitch,
        volume,
        onDone: () => {
          this.active = null;
        },
      };
      this.seam.speak(request);
    } catch {
      this.active = null; // narration must never break the banner
    }
  }

  /**
   * Whether a line is still being read at `now`. Falls back to the estimated
   * duration so a seam that never reports completion cannot wedge the banner.
   */
  isSpeaking(now: number): boolean {
    if (!this.active) return false;
    if (now - this.active.startedAt >= this.active.timeoutMs) {
      this.active = null;
      return false;
    }
    return true;
  }

  /** Stop immediately (dismissed line, match ended, narration switched off). */
  cancel(): void {
    this.active = null;
    try {
      this.seam?.cancel();
    } catch {
      /* non-fatal */
    }
  }

  dispose(): void {
    this.cancel();
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}

// --------------------------------------------------------- browser adapter

interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener?(type: 'voiceschanged', cb: () => void): void;
  removeEventListener?(type: 'voiceschanged', cb: () => void): void;
}

/** The live `speechSynthesis` seam, or null where the platform has none. */
export function createBrowserSpeech(): SpeechSeam | null {
  try {
    if (typeof window === 'undefined') return null;
    const synth = (window as unknown as { speechSynthesis?: SpeechSynthesisLike }).speechSynthesis;
    const Utterance = (window as unknown as {
      SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
    }).SpeechSynthesisUtterance;
    if (!synth || !Utterance) return null;
    return {
      getVoices: () => synth.getVoices(),
      speak(req) {
        const u = new Utterance(req.text);
        // The picked voice is one of the objects getVoices() returned, so it
        // assigns straight back onto the utterance.
        if (req.voice) u.voice = req.voice as SpeechSynthesisVoice;
        u.rate = req.rate;
        u.pitch = req.pitch;
        u.volume = req.volume;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          req.onDone();
        };
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      },
      cancel: () => synth.cancel(),
      onVoicesChanged(cb) {
        synth.addEventListener?.('voiceschanged', cb);
        return () => synth.removeEventListener?.('voiceschanged', cb);
      },
    };
  } catch {
    return null;
  }
}

/**
 * iOS refuses the first utterance unless it follows a user gesture. Speaking a
 * silent one on the first pointer/key press spends that gesture up front so the
 * opening narrator line is not the one that gets swallowed.
 */
export function primeSpeechOnGesture(seam: SpeechSeam | null): () => void {
  if (!seam || typeof document === 'undefined') return () => undefined;
  let primed = false;
  const prime = (): void => {
    if (primed) return;
    primed = true;
    try {
      seam.speak({ text: ' ', voice: null, rate: 1, pitch: 1, volume: 0, onDone: () => undefined });
    } catch {
      /* non-fatal */
    }
    remove();
  };
  const remove = (): void => {
    document.removeEventListener('pointerdown', prime, { capture: true });
    document.removeEventListener('keydown', prime, { capture: true });
  };
  document.addEventListener('pointerdown', prime, { capture: true });
  document.addEventListener('keydown', prime, { capture: true });
  return remove;
}
