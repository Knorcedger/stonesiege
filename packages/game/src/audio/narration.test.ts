// Campaign narration: spoken-text preparation, per-speaker delivery, narrator
// voice ranking, and the Narrator's settings and visibility gating. The speech
// API is replaced by a fake seam, so these run under the `node` environment.

import { describe, expect, it } from 'vitest';
import {
  Narrator,
  deliveryFor,
  estimateSpeechMs,
  pickNarrationVoice,
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
  constructor(private voices: NarrationVoice[] = [voice('Daniel', 'en-GB')]) {}
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
  it('turns dashes into pauses and collapses authored whitespace', () => {
    expect(speechText({ text: 'Settled. Aye — the way a boot settles on a neck.' }))
      .toBe('Settled. Aye, the way a boot settles on a neck.');
    expect(speechText({ text: 'Lanark,\n  beyond   the river bend.' }))
      .toBe('Lanark, beyond the river bend.');
    expect(speechText({ text: 'Wait…' })).toBe('Wait...');
  });

  it('never returns padding for an empty line', () => {
    expect(speechText({ text: '   ' })).toBe('');
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
      expect(d.pitch).toBeGreaterThan(0);
      expect(d.pitch).toBeLessThanOrEqual(2);
      expect(d.rate).toBeGreaterThanOrEqual(0.1);
      expect(d.rate).toBeLessThanOrEqual(2);
    }
  });
});

describe('voiceScore', () => {
  it('rules out non-English and novelty voices', () => {
    expect(voiceScore(voice('Amélie', 'fr-FR'))).toBeLessThan(0);
    expect(voiceScore(voice('Bad News', 'en-US'))).toBeLessThan(0);
    expect(voiceScore(voice('Bubbles', 'en-GB'))).toBeLessThan(0);
  });

  it('ranks a British storyteller above other English voices', () => {
    expect(voiceScore(voice('Daniel', 'en-GB')))
      .toBeGreaterThan(voiceScore(voice('Alex', 'en-US')));
    expect(voiceScore(voice('Google UK English Male', 'en-GB')))
      .toBeGreaterThan(voiceScore(voice('Google UK English Female', 'en-GB')));
    expect(voiceScore(voice('Daniel', 'en_GB'))).toBeGreaterThan(0); // underscore locales
  });
});

describe('pickNarrationVoice', () => {
  it('picks the best-ranked installed voice', () => {
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
});

describe('estimateSpeechMs', () => {
  it('grows with length and shrinks as the rate rises', () => {
    const line = 'x'.repeat(60);
    expect(estimateSpeechMs(line, 1)).toBeGreaterThan(estimateSpeechMs('x'.repeat(20), 1));
    expect(estimateSpeechMs(line, 0.78)).toBeGreaterThan(estimateSpeechMs(line, 1));
    expect(estimateSpeechMs('Aye.', 1)).toBe(700); // floor
  });
});

describe('Narrator', () => {
  it('speaks a line with the chosen voice, delivery and gain', () => {
    const seam = new FakeSeam();
    const n = new Narrator(seam, { isHidden: () => false, readSettings: settingsOf() });
    n.speak({ text: 'Lanarkshire, May 1297.', speaker: 'Narrator' }, 0);
    expect(seam.last?.text).toBe('Lanarkshire, May 1297.');
    expect(seam.last?.voice?.name).toBe('Daniel');
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
    seam.getVoices = () => [voice('Daniel', 'en-GB')];
    n.speak({ text: 'Later line.' }, 100);
    expect(seam.last?.voice?.name).toBe('Daniel');
    n.dispose();
  });
});
