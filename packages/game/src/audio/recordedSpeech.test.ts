// Recorded voice-over playback: which beats play a file, which fall through to
// the synthesizer, and what happens when playback is refused. The audio element
// is faked (and `fetch` stubbed for the manifest tests), so these run under the
// repo's `node` environment.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRecordedSpeech, createVoiceManifestFetch, loadVoiceManifest,
  type AudioClip, type VoiceManifestAttempt,
} from './recordedSpeech';
import type { NarrationRequest, NarrationVoice, SpeechSeam } from './narration';
import { EMPTY_VOICE_MANIFEST, voiceLineId, type VoiceManifest } from './voiceLines';

afterEach(() => {
  vi.unstubAllGlobals();
});

class FakeClip implements AudioClip {
  src = '';
  volume = 1;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  plays: string[] = [];
  pauses = 0;
  /** Set to reject the next play(), the way an autoplay policy does. */
  refuse = false;
  play(): Promise<void> | void {
    this.plays.push(this.src);
    return this.refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve();
  }
  pause(): void {
    this.pauses++;
  }
}

class FakeSeam implements SpeechSeam {
  spoken: NarrationRequest[] = [];
  cancels = 0;
  primes = 0;
  getVoices(): NarrationVoice[] {
    return [{ name: 'Martha', lang: 'en-GB' }];
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
  prime(): void {
    this.primes++;
  }
}

const RECORDED = voiceLineId('Narrator', 'Lanarkshire, May 1297.');

const manifestOf = (): VoiceManifest => ({
  version: 1,
  lines: { [RECORDED]: { file: 'narrator-abc.m4a', ms: 1800 } },
});

const request = (patch: Partial<NarrationRequest> = {}): NarrationRequest => ({
  text: 'Lanarkshire, May 1297.',
  id: RECORDED,
  voice: null,
  rate: 0.9,
  pitch: 0.94,
  volume: 0.8,
  onDone: () => undefined,
  ...patch,
});

const seamWith = (clip: AudioClip, fallback: SpeechSeam | null) =>
  createRecordedSpeech(manifestOf(), { fallback, createClip: () => clip });

describe('createRecordedSpeech', () => {
  it('adds no layer when nothing has been recorded', () => {
    const fallback = new FakeSeam();
    const seam = createRecordedSpeech({ version: 1, lines: {} }, { fallback });
    expect(seam).toBe(fallback);
  });

  it('plays the recording of a captured beat at the narration gain', () => {
    const clip = new FakeClip();
    const seam = seamWith(clip, new FakeSeam())!;
    seam.speak(request());
    expect(clip.plays).toEqual(['assets/vo/narrator-abc.m4a']);
    expect(clip.volume).toBeCloseTo(0.8);
  });

  it('speaks a beat that has no recording', () => {
    const clip = new FakeClip();
    const fallback = new FakeSeam();
    const seam = seamWith(clip, fallback)!;
    seam.speak(request({ text: 'A line written after the last render.', id: voiceLineId('Wallace', 'A line written after the last render.') }));
    expect(clip.plays).toEqual([]);
    expect(fallback.spoken.map((r) => r.text)).toEqual(['A line written after the last render.']);
  });

  it('reports the beat finished once, when the clip ends', () => {
    const clip = new FakeClip();
    const seam = seamWith(clip, new FakeSeam())!;
    let done = 0;
    seam.speak(request({ onDone: () => { done++; } }));
    clip.onended?.();
    clip.onended?.();
    expect(done).toBe(1);
  });

  it('speaks the beat instead when playback is refused', async () => {
    const clip = new FakeClip();
    clip.refuse = true;
    const fallback = new FakeSeam();
    const seam = seamWith(clip, fallback)!;
    seam.speak(request());
    await Promise.resolve();
    await Promise.resolve();
    expect(fallback.spoken).toHaveLength(1);
  });

  it('stops the clip and the synthesizer together', () => {
    const clip = new FakeClip();
    const fallback = new FakeSeam();
    const seam = seamWith(clip, fallback)!;
    let done = 0;
    seam.speak(request({ onDone: () => { done++; } }));
    seam.cancel();
    expect(clip.pauses).toBeGreaterThan(0);
    expect(fallback.cancels).toBe(1);
    clip.onended?.(); // a late end from the cancelled beat
    expect(done).toBe(0);
  });

  it('spends the first gesture on both the clip and the synthesizer', () => {
    const clip = new FakeClip();
    const fallback = new FakeSeam();
    const seam = seamWith(clip, fallback)!;
    seam.prime?.();
    expect(clip.plays).toHaveLength(1);
    expect(clip.plays[0]?.startsWith('data:audio/wav')).toBe(true);
    expect(fallback.primes).toBe(1);
  });

  it('keeps reporting the installed voices for the fallback to pick from', () => {
    const seam = seamWith(new FakeClip(), new FakeSeam())!;
    expect(seam.getVoices().map((v) => v.name)).toEqual(['Martha']);
  });

  it('survives a platform with no synthesizer at all', () => {
    const clip = new FakeClip();
    const seam = seamWith(clip, null)!;
    expect(() => seam.speak(request({ id: 'nothing-recorded' }))).not.toThrow();
    expect(() => seam.cancel()).not.toThrow();
    expect(clip.plays).toEqual([]);
  });
});

describe('loadVoiceManifest', () => {
  it('parses the manifest a normal fetch returns', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(manifestOf()) }));
    const manifest = await loadVoiceManifest(undefined, AbortSignal.timeout(1000));
    expect(Object.keys(manifest.lines)).toEqual([RECORDED]);
  });

  it('resolves empty within the bound when the fetch never settles', async () => {
    // A connection that accepts and then stalls — a captive portal, a wedged
    // CDN edge. The fake ignores its abort signal entirely, so this passes
    // only if the loader bounds the wait itself rather than trusting fetch
    // to reject on abort.
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    const manifest = await loadVoiceManifest(undefined, AbortSignal.timeout(5));
    expect(manifest.lines).toEqual({});
  });

  it('resolves empty when the body stalls after the headers arrive', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, json: () => new Promise(() => undefined) }));
    const manifest = await loadVoiceManifest(undefined, AbortSignal.timeout(5));
    expect(manifest.lines).toEqual({});
  });
});

describe('createVoiceManifestFetch', () => {
  it('fetches once per session when the manifest answers', async () => {
    let calls = 0;
    const fetchManifest = createVoiceManifestFetch({
      load: async () => { calls++; return { manifest: manifestOf(), answered: true }; },
    });
    const first = await fetchManifest();
    expect(await fetchManifest()).toBe(first);
    expect(calls).toBe(1);
  });

  it('keeps the empty answer of a build with no recordings', async () => {
    let calls = 0;
    const fetchManifest = createVoiceManifestFetch({
      load: async () => { calls++; return { manifest: EMPTY_VOICE_MANIFEST, answered: true }; },
    });
    await fetchManifest();
    await fetchManifest();
    expect(calls).toBe(1); // a 404 is the build's real answer, not a stall to retry
  });

  it('shares a stalled attempt between boots, then retries it next match', async () => {
    let calls = 0;
    // What the bounded loader reports under a stall: empty and unanswered,
    // once the factory's own signal expires.
    const fetchManifest = createVoiceManifestFetch({
      timeoutMs: 5,
      load: (signal) => new Promise((resolve) => {
        calls++;
        signal.addEventListener('abort',
          () => resolve({ manifest: EMPTY_VOICE_MANIFEST, answered: false }), { once: true });
      }),
    });
    const [a, b] = await Promise.all([fetchManifest(), fetchManifest()]);
    expect(a.lines).toEqual({});
    expect(b.lines).toEqual({});
    expect(calls).toBe(1); // concurrent boots share the one in-flight attempt
    await fetchManifest();
    expect(calls).toBe(2); // the timed-out attempt did not poison the session cache
  });

  it('resolves empty for a load that throws, and does not keep the failure', async () => {
    let calls = 0;
    const fetchManifest = createVoiceManifestFetch({
      // Throws synchronously — the worst case for the cache, whose clear must
      // survive an attempt that settles before it is even stored.
      load: (): Promise<VoiceManifestAttempt> => {
        calls++;
        if (calls === 1) throw new Error('offline');
        return Promise.resolve({ manifest: manifestOf(), answered: true });
      },
    });
    expect((await fetchManifest()).lines).toEqual({}); // boot got an answer, not an exception
    expect(Object.keys((await fetchManifest()).lines)).toEqual([RECORDED]);
    expect(calls).toBe(2);
  });

  it('retries next match when the real fetch fails outright, not only when it stalls', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls++;
      return calls === 1
        ? Promise.reject(new TypeError('network down'))
        : Promise.resolve({ ok: true, json: () => Promise.resolve(manifestOf()) });
    });
    const fetchManifest = createVoiceManifestFetch();
    expect((await fetchManifest()).lines).toEqual({}); // the airplane-mode boot plays synthesised
    expect(Object.keys((await fetchManifest()).lines)).toEqual([RECORDED]); // recordings return with the network
    expect(calls).toBe(2);
  });
});
