// Campaign narration: spoken-text preparation, per-speaker delivery, narrator
// voice ranking, and the Narrator's settings and visibility gating. The speech
// API is replaced by a fake seam, so these run under the `node` environment.

import { describe, expect, it, vi } from 'vitest';
import {
  Narrator,
  deliveryFor,
  estimateLineMs,
  estimateSpeechMs,
  pickNarrationVoice,
  speechBeats,
  speechText,
  voiceScore,
  type NarrationRequest,
  type NarrationVoice,
  type SpeechSeam,
} from './narration';
import { DEFAULT_SETTINGS, type GameSettings } from '../settings';

const voice = (name: string, lang: string, localService = true): NarrationVoice =>
  ({ name, lang, localService });

class FakeSeam implements SpeechSeam {
  spoken: NarrationRequest[] = [];
  cancels = 0;
  constructor(private voices: NarrationVoice[] = [voice('Martha', 'en-GB')]) {}
  getVoices(): NarrationVoice[] {
    return this.voices;
  }
  speak(req: NarrationRequest): void {
    this.spoken.push(req);
  }
  cancel(): void {
    this.cancels++;
  }
  onVoicesChanged(): () => void {
    return () => undefined;
  }
  get last(): NarrationRequest | undefined {
    return this.spoken[this.spoken.length - 1];
  }
}

const settingsOf = (patch: Partial<GameSettings> = {}) =>
  () => ({ ...DEFAULT_SETTINGS, ...patch });

describe('speechText', () => {
  it('collapses authored whitespace and spells out an ellipsis', () => {
    expect(speechText({ text: 'Lanark,\n  beyond   the river bend.' }))
      .toBe('Lanark, beyond the river bend.');
    expect(speechText({ text: 'Wait…' })).toBe('Wait...');
  });

  it('leaves dashes standing for speechBeats to turn into silence', () => {
    expect(speechText({ text: 'Settled. Aye — the way a boot settles on a neck.' }))
      .toBe('Settled. Aye — the way a boot settles on a neck.');
  });

  it('never returns padding for an empty line', () => {
    expect(speechText({ text: '   ' })).toBe('');
  });
});

describe('speechBeats', () => {
  it('breaks the line where a storyteller draws breath', () => {
    expect(speechBeats('Settled. Aye — the way a boot settles on a neck.'))
      .toEqual(['Settled.', 'Aye', 'the way a boot settles on a neck.']);
    expect(speechBeats('The sheriff is dead: the news runs faster than any horse; nobody rides.'))
      .toEqual(['The sheriff is dead:', 'the news runs faster than any horse;', 'nobody rides.']);
  });

  it('keeps a date apart from a decimal', () => {
    expect(speechBeats('Lanarkshire, May 1297. The English think Scotland is settled.'))
      .toEqual(['Lanarkshire, May 1297.', 'The English think Scotland is settled.']);
    expect(speechBeats('The ford is 1.5 miles north.')).toEqual(['The ford is 1.5 miles north.']);
  });

  it('yields nothing to say for an empty line', () => {
    expect(speechBeats('')).toEqual([]);
    expect(speechBeats(' — ')).toEqual([]);
  });
});

describe('deliveryFor', () => {
  it('gives the storyteller voices the deepest, slowest read', () => {
    const narrator = deliveryFor('Narrator');
    expect(narrator).toEqual(deliveryFor('chronicle')); // case-insensitive
    expect(narrator).toEqual(deliveryFor(undefined)); // unattributed reads as narration
    const wallace = deliveryFor('Wallace');
    expect(narrator.rate).toBeLessThan(wallace.rate);
    expect(narrator.pitch).toBeLessThan(wallace.pitch);
    // The storyteller's weight comes from the silences, not from the pitch.
    expect(narrator.beatMs).toBeGreaterThan(wallace.beatMs);
  });

  it('keeps a character on one pitch across chapters but apart from others', () => {
    expect(deliveryFor('Wallace')).toEqual(deliveryFor('Wallace'));
    const pitches = new Set(
      ['Wallace', 'Graham', 'Douglas', 'Fraser', 'Moray', 'Cressingham']
        .map((s) => deliveryFor(s).pitch),
    );
    expect(pitches.size).toBeGreaterThan(3);
  });

  it('stays inside the synthesizer\'s legal pitch range', () => {
    for (const s of ['Wallace', 'Graham', 'Douglas', 'Fraser', 'Moray', 'Warenne', 'Valence',
      'Menteith', 'Heselrig', 'Cressingham', 'Narrator', 'Chronicle']) {
      const d = deliveryFor(s);
      // Below roughly 0.85 a neural voice stops sounding like a person, which
      // is the artefact this delivery exists to avoid.
      expect(d.pitch).toBeGreaterThanOrEqual(0.85);
      expect(d.pitch).toBeLessThanOrEqual(2);
      expect(d.rate).toBeGreaterThanOrEqual(0.1);
      expect(d.rate).toBeLessThanOrEqual(2);
    }
  });
});

/** voiceScore returns null for a disqualified voice; these compare rankings. */
const rank = (v: NarrationVoice): number => {
  const score = voiceScore(v);
  expect(score).not.toBeNull();
  return score as number;
};

describe('voiceScore', () => {
  it('rules out non-English and novelty voices', () => {
    expect(voiceScore(voice('Amélie', 'fr-FR'))).toBeNull();
    expect(voiceScore(voice('Bad News', 'en-US'))).toBeNull();
    expect(voiceScore(voice('Bubbles', 'en-GB'))).toBeNull();
  });

  it('ranks a British storyteller above other English voices', () => {
    expect(rank(voice('Daniel', 'en-GB'))).toBeGreaterThan(rank(voice('Alex', 'en-US')));
    expect(rank(voice('Daniel', 'en_GB'))).toBeGreaterThan(0); // underscore locales
  });

  it('puts the chosen narrator above every other installed voice', () => {
    expect(rank(voice('Martha', 'en-GB'))).toBeGreaterThan(rank(voice('Arthur (Premium)', 'en-GB')));
    // Among her own variants the downloaded one wins.
    expect(rank(voice('Martha (Premium)', 'en-GB'))).toBeGreaterThan(rank(voice('Martha', 'en-GB')));
    // A voice that merely contains the letters is not her.
    expect(rank(voice('Marthana', 'en-GB'))).toBeLessThan(rank(voice('Martha', 'en-GB')));
  });

  it('ranks a named fallback above an unnamed voice of the same locale', () => {
    expect(rank(voice('Microsoft Sonia', 'en-GB'))).toBeGreaterThan(rank(voice('Rosalind', 'en-GB')));
  });

  it('prefers a neural engine to a formant one', () => {
    expect(rank(voice('Sonia (Natural)', 'en-GB'))).toBeGreaterThan(rank(voice('Sonia', 'en-GB')));
    expect(rank(voice('Daniel (Compact)', 'en-GB'))).toBeLessThan(rank(voice('Daniel', 'en-GB')));
    expect(rank(voice('English (Great Britain) espeak', 'en-GB')))
      .toBeLessThan(rank(voice('Google UK English', 'en-GB', false)));
  });

  it('keeps a usable English voice ranked, however unappealing', () => {
    // Reading the campaign in the wrong timbre beats reading it in the wrong
    // language, so an unlisted English voice still scores.
    expect(rank(voice('Zira', 'en-US'))).toBeGreaterThan(0);
    expect(rank(voice('Zira', 'en-US'))).toBeLessThan(rank(voice('Martha', 'en-GB')));
  });
});

describe('pickNarrationVoice', () => {
  it('takes the chosen narrator whenever the device has her', () => {
    const picked = pickNarrationVoice([
      voice('Arthur (Premium)', 'en-GB'),
      voice('Martha', 'en-GB'),
      voice('Google UK English Male', 'en-GB', false),
    ]);
    expect(picked?.name).toBe('Martha');
  });

  it('falls back to the best-ranked installed voice', () => {
    const picked = pickNarrationVoice([
      voice('Samantha', 'en-US'),
      voice('Anna', 'de-DE'),
      voice('Daniel', 'en-GB'),
      voice('Karen', 'en-AU'),
    ]);
    expect(picked?.name).toBe('Daniel');
  });

  it('falls back to the platform default when nothing is usable', () => {
    expect(pickNarrationVoice([])).toBeNull();
    expect(pickNarrationVoice([voice('Anna', 'de-DE'), voice('Zarvox', 'en-US')])).toBeNull();
  });

  it('takes a low-ranked English voice over a non-English one', () => {
    const picked = pickNarrationVoice([voice('Anna', 'de-DE'), voice('Samantha', 'en-US')]);
    expect(picked?.name).toBe('Samantha');
  });
});

describe('estimateSpeechMs', () => {
  it('grows with length and shrinks as the rate rises', () => {
    const line = 'x'.repeat(60);
    expect(estimateSpeechMs(line, 1)).toBeGreaterThan(estimateSpeechMs('x'.repeat(20), 1));
    expect(estimateSpeechMs(line, 0.78)).toBeGreaterThan(estimateSpeechMs(line, 1));
    expect(estimateSpeechMs('Aye.', 1)).toBe(700); // floor
  });
});

describe('estimateLineMs', () => {
  it('counts the silence between beats as well as the words', () => {
    const delivery = deliveryFor('Narrator');
    expect(estimateLineMs(['Hold the line.'], delivery))
      .toBe(estimateSpeechMs('Hold the line.', delivery.rate));
    expect(estimateLineMs(['Hold the line.', 'For Scotland.'], delivery))
      .toBe(estimateSpeechMs('Hold the line.', delivery.rate)
        + estimateSpeechMs('For Scotland.', delivery.rate)
        + delivery.beatMs);
    expect(estimateLineMs([], delivery)).toBe(0);
  });
});

describe('Narrator', () => {
  it('speaks a line with the chosen voice, delivery and gain', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'Lanarkshire, May 1297.', speaker: 'Narrator' }, 0);
    expect(seam.last?.text).toBe('Lanarkshire, May 1297.');
    expect(seam.last?.voice?.name).toBe('Martha');
    expect(seam.last?.rate).toBe(deliveryFor('Narrator').rate);
    expect(seam.last?.volume).toBeCloseTo(DEFAULT_SETTINGS.masterVolume * DEFAULT_SETTINGS.narrationVolume);
    n.dispose();
  });

  it('stays silent when narration is off, muted, or the tab is hidden', () => {
    const off = new FakeSeam();
    const a = new Narrator(off, { isHidden: () => false, readSettings: settingsOf({ narrationEnabled: false }) });
    a.speak({ text: 'Silence.' }, 0);

    const muted = new FakeSeam();
    const b = new Narrator(muted, { isHidden: () => false, readSettings: settingsOf({ narrationVolume: 0 }) });
    b.speak({ text: 'Silence.' }, 0);

    const hidden = new FakeSeam();
    const c = new Narrator(hidden, { isHidden: () => true, readSettings: settingsOf() });
    c.speak({ text: 'Silence.' }, 0);

    expect([off.spoken.length, muted.spoken.length, hidden.spoken.length]).toEqual([0, 0, 0]);
    for (const n of [a, b, c]) n.dispose();
  });

  it('skips a line with nothing to say', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: '   ', speaker: 'Wallace' }, 0);
    expect(seam.spoken).toHaveLength(0);
    expect(n.isSpeaking(0)).toBe(false);
    n.dispose();
  });

  it('reports speaking until the voice finishes', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'The English think Scotland is settled.', speaker: 'Narrator' }, 1000);
    expect(n.isSpeaking(1100)).toBe(true);
    seam.last?.onDone();
    expect(n.isSpeaking(1200)).toBe(false);
    n.dispose();
  });

  it('gives up on a seam that never reports finishing', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'x'.repeat(40), speaker: 'Wallace' }, 0);
    expect(n.isSpeaking(1000)).toBe(true);
    expect(n.isSpeaking(600000)).toBe(false);
    n.dispose();
  });

  it('lets the newest line barge in, and stops everything on cancel', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'First line.', speaker: 'Narrator' }, 0);
    n.speak({ text: 'Second line.', speaker: 'Wallace' }, 10);
    expect(seam.spoken.map((r) => r.text)).toEqual(['First line.', 'Second line.']);
    expect(seam.cancels).toBe(2); // each speak clears what was running
    n.cancel();
    expect(seam.cancels).toBe(3);
    expect(n.isSpeaking(11)).toBe(false);
    n.dispose();
  });

  it('ignores a cancelled line reporting completion late', () => {
    // speechSynthesis fires end/error for the utterance cancel() interrupts,
    // and it arrives after the replacement has started talking.
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'The first long line of the chapter.', speaker: 'Narrator' }, 0);
    const interrupted = seam.last!;
    n.speak({ text: 'The second long line of the chapter.', speaker: 'Wallace' }, 10);
    interrupted.onDone(); // late completion of the line that was cut off
    expect(n.isSpeaking(20)).toBe(true); // the new line is still reading
    seam.last!.onDone();
    expect(n.isSpeaking(30)).toBe(false);
    n.dispose();
  });

  it('stops for a paused match and speaks again on resume', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'Before the pause.', speaker: 'Narrator' }, 0);
    n.setMuted(true);
    expect(n.isSpeaking(10)).toBe(false);
    n.speak({ text: 'While paused.', speaker: 'Wallace' }, 20);
    expect(seam.spoken).toHaveLength(1);
    n.setMuted(false);
    n.speak({ text: 'After the pause.', speaker: 'Wallace' }, 30);
    expect(seam.last?.text).toBe('After the pause.');
    n.dispose();
  });

  it('stays silenced once the match is over', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'The last stand.', speaker: 'Narrator' }, 0);
    n.silence();
    expect(n.isSpeaking(10)).toBe(false);
    // The closing lines are queued in the same effect batch as the victory.
    n.speak({ text: 'Heselrig is dead.', speaker: 'Narrator' }, 20);
    n.speak({ text: 'Men begin to count spears.', speaker: 'Narrator' }, 30);
    expect(seam.spoken).toHaveLength(1);
    n.dispose();
  });

  it('reads a line as beats with silence held between them', () => {
    vi.useFakeTimers();
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    const beat = deliveryFor('Wallace').beatMs;
    n.speak({ text: 'Settled. Aye — the way a boot settles on a neck.', speaker: 'Wallace' }, 0);

    expect(seam.spoken.map((r) => r.text)).toEqual(['Settled.']);
    seam.last!.onDone();
    expect(seam.spoken).toHaveLength(1); // the silence between beats
    vi.advanceTimersByTime(beat);
    expect(seam.spoken.map((r) => r.text)).toEqual(['Settled.', 'Aye']);

    seam.last!.onDone();
    vi.advanceTimersByTime(beat);
    expect(seam.spoken).toHaveLength(3);
    expect(n.isSpeaking(100)).toBe(true); // the banner waits for the last beat
    seam.last!.onDone();
    expect(n.isSpeaking(100)).toBe(false);

    n.dispose();
    vi.useRealTimers();
  });

  it('drops a queued beat when the line is cut off mid-read', () => {
    vi.useFakeTimers();
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'Hold the line — for Scotland.', speaker: 'Narrator' }, 0);
    seam.last!.onDone(); // first beat done, the next is waiting out the silence
    n.cancel();
    vi.advanceTimersByTime(5000);
    expect(seam.spoken.map((r) => r.text)).toEqual(['Hold the line']);
    expect(n.isSpeaking(5000)).toBe(false);
    n.dispose();
    vi.useRealTimers();
  });

  it('is inert on a platform without speech synthesis', () => {
    const n = new Narrator(null, { isHidden: () => false, readSettings: settingsOf() });
    expect(() => n.speak({ text: 'Nothing to speak with.' }, 0)).not.toThrow();
    expect(n.isSpeaking(0)).toBe(false);
    expect(() => n.cancel()).not.toThrow();
    n.dispose();
  });

  it('re-picks the voice once the platform publishes its list', () => {
    const seam = new FakeSeam([]);
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'Early line.' }, 0);
    expect(seam.last?.voice).toBeNull();
    seam.getVoices = () => [voice('Martha', 'en-GB')];
    n.speak({ text: 'Later line.' }, 100);
    expect(seam.last?.voice?.name).toBe('Martha');
    n.dispose();
  });
});
