// Campaign narration: reads the scenario dialogue banner aloud through the
// platform speech synthesizer so chapters play as spoken story instead of
// silent text. There are no voice-over assets, so the read is built out of two
// things the platform can actually give: the best voice installed — the
// English (UK) "Martha" the campaign is written for, where the device has her —
// and phrasing. A line is spoken as a sequence of beats with real silence
// between them, close to the voice's own register. Dragging the pitch down
// instead, as this once did, is what makes a modern voice sound synthetic.
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
 * Prepare banner text for the synthesizer: ellipses become the dots engines
 * actually pause on, and whitespace is collapsed so wrapped scenario strings do
 * not read with gaps. Dashes are left standing — `speechBeats` turns them into
 * silence, which is a longer pause than any punctuation buys.
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

// --------------------------------------------------------------- delivery

export interface NarrationDelivery {
  rate: number;
  pitch: number;
  /** Silence held between spoken beats, in ms. */
  beatMs: number;
}

/** The storyteller voices: the slowest read, and the longest silences. */
const NARRATOR_SPEAKERS = new Set(['narrator', 'chronicle']);

/**
 * Pitch stays within a whole tone of the voice's own register. Below roughly
 * 0.85 a neural voice stops sounding like a person and starts sounding like an
 * effect, which is the whole reason this read was rebuilt around silence.
 */
const NARRATOR_DELIVERY: NarrationDelivery = { rate: 0.9, pitch: 0.94, beatMs: 300 };
const CHARACTER_RATE = 0.96;
/** Characters read above the narrator, so the storyteller stays the deepest voice. */
const CHARACTER_PITCH = 1.02;
const CHARACTER_BEAT_MS = 190;

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
  // 8 stable steps across ±0.07 around the character pitch: enough to tell two
  // speakers apart, small enough that neither sounds processed.
  const step = speakerHash(key) % 8;
  return {
    rate: CHARACTER_RATE,
    pitch: CHARACTER_PITCH + (step - 3.5) * 0.02,
    beatMs: CHARACTER_BEAT_MS,
  };
}

// ---------------------------------------------------------- voice picking

/**
 * The narrator the campaign is written for, chosen by ear against the
 * alternatives: the English (UK) "Martha". Matched as a whole word so the
 * downloadable "Martha (Enhanced)" and "Martha (Premium)" variants count, and
 * so a voice merely containing the letters does not.
 */
const CHOSEN_VOICE = /\bmartha\b/;
/** Big enough that the chosen voice outranks anything else on any device. */
const CHOSEN_BONUS = 200;

/**
 * Ranked fallbacks, best first, for devices with no Martha installed — she
 * ships with Apple platforms and is an optional download even there.
 */
const FALLBACK_NAMES = [
  'arthur', 'sonia', 'daniel', 'libby', 'oliver', 'ryan', 'thomas', 'kate',
  'george', 'serena', 'stephanie', 'brian', 'james', 'alex',
];

/** Neural engines — the voices worth reading a campaign with. */
const HIGH_FIDELITY = /\b(premium|enhanced|natural|neural|wavenet|studio)\b/;
/**
 * Bandwidth-reduced or formant engines ("Daniel (Compact)", eSpeak). No
 * delivery rescues these, so they rank last among usable voices.
 */
const LOW_FIDELITY = /\b(compact|espeak|pico|eloquence)\b/;
/** Voices whose delivery fights the intent (novelty, or clearly not a narrator). */
const REJECTED_NAMES = [
  'whisper', 'bells', 'bubbles', 'organ', 'cellos', 'trinoids', 'zarvox', 'wobble',
  'bahh', 'boing', 'jester', 'superstar', 'bad news', 'good news', 'albert', 'eddy',
  'grandma', 'grandpa', 'rocko', 'sandy', 'shelley', 'junior', 'novelty',
];

const containsAny = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Higher is a better narrator; `null` is disqualified (not English, or a
 * novelty voice). A merely unappealing voice still scores, because reading the
 * campaign in the wrong language is worse than reading it in the wrong timbre.
 */
export function voiceScore(voice: NarrationVoice): number | null {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase().replace('_', '-');
  if (!lang.startsWith('en')) return null;
  if (containsAny(name, REJECTED_NAMES)) return null;

  let score = 0;
  // A British read carries the Wallace-era campaigns best; other English
  // accents still narrate well, so they rank below rather than out.
  if (lang.startsWith('en-gb')) score += 40;
  else if (lang.startsWith('en-ie') || lang.startsWith('en-au') || lang.startsWith('en-nz')) score += 24;
  else if (lang.startsWith('en-za') || lang.startsWith('en-in')) score += 16;
  else score += 8;

  if (CHOSEN_VOICE.test(name)) {
    score += CHOSEN_BONUS;
  } else {
    // Named fallbacks decay by rank, so a listed voice always beats an
    // unlisted one of the same locale without any of them nearing the chosen.
    const rank = FALLBACK_NAMES.findIndex((n) => name.includes(n));
    if (rank >= 0) score += 40 - rank * 2;
  }
  // Engine quality, not the sex the voice reads as, is what separates a
  // narrator from a robot.
  if (HIGH_FIDELITY.test(name)) score += 20;
  if (LOW_FIDELITY.test(name)) score -= 14;
  // Network voices sound better but stall offline; local wins the tiebreak.
  if (voice.localService) score += 6;
  if (voice.default) score += 2;
  return score;
}

/**
 * The best installed narrator voice, or null when none is usable — the
 * platform default reads instead.
 */
export function pickNarrationVoice(voices: readonly NarrationVoice[]): NarrationVoice | null {
  let best: NarrationVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const score = voiceScore(v);
    // Strictly greater keeps the first of equally ranked voices — the platform
    // list order is stable, so the pick does not shift between sessions.
    if (score !== null && score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

// ------------------------------------------------------------ speaking time

/**
 * How long one beat should take to speak. Roughly 14 characters per second at
 * rate 1, floored so very short beats still get a moment.
 */
export function estimateSpeechMs(text: string, rate: number): number {
  const safeRate = rate > 0 ? rate : 1;
  return Math.max(700, Math.round((text.length * 72) / safeRate));
}

/**
 * How long a whole line should take: every beat plus the silences between
 * them. Used to hold the banner up and to time out a seam that never reports
 * completion.
 */
export function estimateLineMs(
  beats: readonly string[],
  delivery: NarrationDelivery,
): number {
  const spoken = beats.reduce((ms, beat) => ms + estimateSpeechMs(beat, delivery.rate), 0);
  return spoken + Math.max(0, beats.length - 1) * delivery.beatMs;
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
  /** Beats of the current line still waiting their turn. */
  private queue: string[] = [];
  /** The silence between the beat that just finished and the next one. */
  private beatTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Bumped on every speak/cancel. `cancel()` makes the outgoing utterance
   * report completion asynchronously, so a stale callback must not clear the
   * state of the line that replaced it — that would drop the banner hold and
   * chop every following line mid-sentence.
   */
  private generation = 0;
  private muted = false;
  private silenced = false;
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
    if (typeof document !== 'undefined') {
      // A line already in flight keeps talking through a backgrounding unless
      // it is stopped here — the speech queue is not on any of the gain buses
      // AudioEngine mutes, and `pagehide` covers leaving the match entirely.
      const stop = (): void => {
        if (this.isHidden()) this.cancel();
      };
      document.addEventListener('visibilitychange', stop);
      this.disposers.push(() => document.removeEventListener('visibilitychange', stop));
      const onLeave = (): void => this.cancel();
      window.addEventListener('pagehide', onLeave);
      this.disposers.push(() => window.removeEventListener('pagehide', onLeave));
    }
  }

  /**
   * Silence while the match is paused. Unlike `silence()` this is reversible —
   * the ticker keeps advancing the banner behind the pause overlay, and a
   * paused game must not keep narrating.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.cancel();
  }

  /**
   * Stop for the rest of the match (the end screen is up). Latched: scenarios
   * queue their closing lines in the same effect batch as the victory, so a
   * one-shot cancel would be undone by the very next banner frame.
   */
  silence(): void {
    this.silenced = true;
    this.cancel();
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
    if (!this.seam || this.muted || this.silenced) return;
    const settings = this.readSettings();
    const volume = this.gain(settings);
    if (!settings.narrationEnabled || volume <= 0 || this.isHidden()) return;
    const beats = speechBeats(speechText(line));
    if (beats.length === 0) return;
    const delivery = deliveryFor(line.speaker);
    try {
      // Barge-in: the newest line always wins, and takes any queued beat of the
      // outgoing line with it.
      this.cancel();
      this.active = {
        startedAt: now,
        timeoutMs: estimateLineMs(beats, delivery) * SPEECH_TIMEOUT_FACTOR,
      };
      this.queue = beats.slice(1);
      this.sayBeat(beats[0], delivery, volume, this.generation);
    } catch {
      this.active = null; // narration must never break the banner
      this.queue = [];
    }
  }

  /**
   * Speak one beat and arrange the next. `generation` is the line this beat
   * belongs to: a barge-in bumps it, so a beat queued behind a cancelled line
   * is dropped instead of talking over its replacement.
   */
  private sayBeat(
    text: string,
    delivery: NarrationDelivery,
    volume: number,
    generation: number,
  ): void {
    this.seam?.speak({
      text,
      voice: this.resolveVoice(),
      rate: delivery.rate,
      pitch: delivery.pitch,
      volume,
      onDone: () => {
        if (generation !== this.generation) return;
        const next = this.queue.shift();
        if (next === undefined) {
          this.active = null; // the line is read out
          return;
        }
        this.beatTimer = setTimeout(() => {
          this.beatTimer = null;
          if (generation !== this.generation) return;
          try {
            this.sayBeat(next, delivery, volume, generation);
          } catch {
            this.active = null;
            this.queue = [];
          }
        }, delivery.beatMs);
      },
    });
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

  /** Stop immediately (dismissed line, paused, narration switched off). */
  cancel(): void {
    this.active = null;
    this.queue = [];
    if (this.beatTimer !== null) {
      clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }
    this.generation++; // orphan the in-flight utterance's completion callback
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
