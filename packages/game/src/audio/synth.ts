// Procedural SFX voices (GDD: all audio synthesized, no samples). Every voice
// is a tiny WebAudio node graph — noise bursts, filtered oscillators, pitch
// ramps — connected to a provided output bus and self-stopping. Each function
// returns its duration in seconds so the engine can book the throttle.
//
// Determinism note: Math.random here is FINE — audio is presentation, the sim
// never sees it.

export type SfxName =
  | 'chopWood' | 'pickMine' | 'farmScythe' | 'hammer'
  // combat impacts: weapon family x what it lands on (see audio/combat.ts)
  | 'swordClash' | 'bladeChop' | 'sabreSlash' | 'spearThrust' | 'spearJab'
  | 'toolStrike' | 'beastBite' | 'ramCrush' | 'ramBoom'
  | 'arrowFlesh' | 'arrowThunk' | 'boltPunch' | 'stoneCrush' | 'stoneShatter'
  // shot releases
  | 'arrowShot' | 'boltShot' | 'siegeRelease'
  | 'collapse'
  | 'hornAge' | 'hornAlert' | 'hornVictory' | 'hornDefeat'
  | 'monkChant' | 'townBellIn' | 'townBellOut' | 'uiTap';

/** Shared 1s white-noise buffer, built lazily per context. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

interface NoiseOpts {
  when: number;
  dur: number;
  gain: number;
  filter?: { type: BiquadFilterType; from: number; to?: number; q?: number };
  attack?: number;
}

function noiseHit(ctx: BaseAudioContext, out: AudioNode, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.loopStart = Math.random() * 0.5; // decorrelate repeats
  src.loopEnd = 1;
  const g = ctx.createGain();
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, o.when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain), o.when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, o.when + o.dur);
  let head: AudioNode = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.setValueAtTime(o.filter.from, o.when);
    if (o.filter.to !== undefined) f.frequency.exponentialRampToValueAtTime(o.filter.to, o.when + o.dur);
    f.Q.value = o.filter.q ?? 1;
    head.connect(f);
    head = f;
  }
  head.connect(g).connect(out);
  src.start(o.when);
  src.stop(o.when + o.dur + 0.05);
}

interface ToneOpts {
  when: number;
  dur: number;
  gain: number;
  freq: number;
  freqTo?: number;
  type?: OscillatorType;
  attack?: number;
  detune?: number;
  lowpass?: number;
}

function tone(ctx: BaseAudioContext, out: AudioNode, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.when);
  if (o.freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), o.when + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, o.when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain), o.when + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, o.when + o.dur);
  let head: AudioNode = osc;
  if (o.lowpass !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    head.connect(f);
    head = f;
  }
  head.connect(g).connect(out);
  osc.start(o.when);
  osc.stop(o.when + o.dur + 0.05);
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * Play one named voice at `when` (ctx time) into `out`, scaled by `vol` 0..1.
 * Returns the voice duration in SECONDS.
 */
export function playVoice(
  ctx: BaseAudioContext, out: AudioNode, name: SfxName, when: number, vol: number,
): number {
  const v = Math.max(0, Math.min(1, vol));
  if (v <= 0) return 0;
  switch (name) {
    case 'chopWood': {
      // axe bite: sharp mid noise crack + low wood thunk
      noiseHit(ctx, out, { when, dur: 0.07, gain: 0.5 * v, filter: { type: 'bandpass', from: rand(1500, 2100), q: 1.2 } });
      tone(ctx, out, { when, dur: 0.09, gain: 0.35 * v, freq: rand(150, 190), freqTo: 70, type: 'triangle' });
      return 0.12;
    }
    case 'pickMine': {
      // pick on stone/gold: metallic tick, high ping
      noiseHit(ctx, out, { when, dur: 0.045, gain: 0.4 * v, filter: { type: 'highpass', from: 2600 } });
      tone(ctx, out, { when: when + 0.005, dur: 0.1, gain: 0.16 * v, freq: rand(2300, 3200), freqTo: 1600, type: 'square', lowpass: 4200 });
      return 0.12;
    }
    case 'farmScythe': {
      // swish through stalks: band-swept noise
      noiseHit(ctx, out, { when, dur: 0.22, gain: 0.3 * v, attack: 0.05, filter: { type: 'bandpass', from: 3000, to: 700, q: 0.8 } });
      return 0.24;
    }
    case 'hammer': {
      // construction knock: low thud + brief clap
      tone(ctx, out, { when, dur: 0.1, gain: 0.42 * v, freq: rand(95, 125), freqTo: 55, type: 'sine' });
      noiseHit(ctx, out, { when, dur: 0.05, gain: 0.3 * v, filter: { type: 'bandpass', from: 900, q: 1 } });
      return 0.13;
    }
    case 'swordClash': {
      // steel on steel: bright noise + two inharmonic metal partials
      noiseHit(ctx, out, { when, dur: 0.08, gain: 0.4 * v, filter: { type: 'highpass', from: 1800 } });
      tone(ctx, out, { when, dur: 0.14, gain: 0.13 * v, freq: rand(2500, 2900), type: 'square', lowpass: 5000 });
      tone(ctx, out, { when: when + 0.004, dur: 0.12, gain: 0.1 * v, freq: rand(3700, 4300), type: 'square', lowpass: 6000 });
      return 0.16;
    }
    case 'bladeChop': {
      // steel edge biting timber/stone: metallic crack, low wood thunk, splinters
      noiseHit(ctx, out, { when, dur: 0.09, gain: 0.45 * v, filter: { type: 'bandpass', from: rand(900, 1300), q: 1 } });
      tone(ctx, out, { when, dur: 0.12, gain: 0.34 * v, freq: rand(120, 155), freqTo: 60, type: 'triangle' });
      noiseHit(ctx, out, { when: when + 0.03, dur: 0.12, gain: 0.14 * v, filter: { type: 'highpass', from: 3000 } });
      return 0.16;
    }
    case 'sabreSlash': {
      // from horseback: a swing through air, a bright cut, and the weight behind it
      noiseHit(ctx, out, { when, dur: 0.12, gain: 0.22 * v, attack: 0.03, filter: { type: 'bandpass', from: 2600, to: 1100, q: 1.6 } });
      noiseHit(ctx, out, { when: when + 0.05, dur: 0.07, gain: 0.38 * v, filter: { type: 'highpass', from: 2200 } });
      tone(ctx, out, { when: when + 0.05, dur: 0.12, gain: 0.12 * v, freq: rand(3000, 3600), type: 'square', lowpass: 6000 });
      tone(ctx, out, { when: when + 0.05, dur: 0.09, gain: 0.2 * v, freq: rand(110, 140), freqTo: 58, type: 'sine' });
      return 0.2;
    }
    case 'spearThrust': {
      // shaft driven forward, narrow point bites: darker and drier than a sword
      noiseHit(ctx, out, { when, dur: 0.07, gain: 0.2 * v, attack: 0.02, filter: { type: 'bandpass', from: 1400, to: 600, q: 2.4 } });
      tone(ctx, out, { when: when + 0.02, dur: 0.09, gain: 0.26 * v, freq: rand(420, 520), freqTo: 260, type: 'triangle' });
      noiseHit(ctx, out, { when: when + 0.02, dur: 0.05, gain: 0.18 * v, filter: { type: 'bandpass', from: 2200, q: 3 } });
      return 0.13;
    }
    case 'spearJab': {
      // a pike against a wall is a blunt knock, not a chop — no edge, no chips
      tone(ctx, out, { when, dur: 0.11, gain: 0.34 * v, freq: rand(160, 200), freqTo: 85, type: 'sine' });
      noiseHit(ctx, out, { when, dur: 0.045, gain: 0.18 * v, filter: { type: 'bandpass', from: 700, q: 1.4 } });
      return 0.14;
    }
    case 'toolStrike': {
      // villager hoe/axe swung in anger (also butchering): dull, wooden whack
      tone(ctx, out, { when, dur: 0.1, gain: 0.3 * v, freq: rand(180, 230), freqTo: 95, type: 'triangle' });
      noiseHit(ctx, out, { when, dur: 0.05, gain: 0.22 * v, filter: { type: 'bandpass', from: 1200, q: 0.9 } });
      return 0.12;
    }
    case 'beastBite': {
      // wolf: a wet snap over a short growl
      noiseHit(ctx, out, { when, dur: 0.05, gain: 0.3 * v, filter: { type: 'bandpass', from: 1600, to: 700, q: 1.2 } });
      tone(ctx, out, { when, dur: 0.18, gain: 0.16 * v, freq: rand(150, 190), freqTo: 110, type: 'sawtooth', lowpass: 600 });
      return 0.2;
    }
    case 'ramCrush': {
      // the log catching a body rather than a wall: heavy thud, brief crunch
      tone(ctx, out, { when, dur: 0.22, gain: 0.5 * v, freq: rand(70, 90), freqTo: 38, type: 'sine' });
      noiseHit(ctx, out, { when, dur: 0.1, gain: 0.3 * v, filter: { type: 'lowpass', from: 900, to: 300 } });
      return 0.26;
    }
    case 'ramBoom': {
      // the signature siege sound: a swung log slamming a gate. Deep boom under
      // a timber body, a hard impact crack on top, chain rattle and debris after.
      // The three onset layers sum to ~0.9 on purpose: the buses feed the
      // destination with no limiter, so a louder stack would clip into a crackle
      // instead of a boom (collapse, the next loudest voice, peaks at 0.85).
      tone(ctx, out, { when, dur: 0.5, gain: 0.4 * v, freq: rand(58, 70), freqTo: 30, type: 'sine' });
      tone(ctx, out, { when, dur: 0.3, gain: 0.2 * v, freq: rand(105, 130), freqTo: 55, type: 'triangle', lowpass: 400 });
      noiseHit(ctx, out, { when, dur: 0.16, gain: 0.3 * v, attack: 0.006, filter: { type: 'lowpass', from: 1200, to: 200 } });
      noiseHit(ctx, out, { when: when + 0.1, dur: 0.3, gain: 0.09 * v, filter: { type: 'bandpass', from: 900, to: 350, q: 0.8 } });
      for (let i = 0; i < 3; i++) {
        noiseHit(ctx, out, { when: when + 0.06 + i * rand(0.03, 0.06), dur: 0.03, gain: 0.05 * v, filter: { type: 'highpass', from: 3200 } });
      }
      return 0.6;
    }
    case 'arrowFlesh': {
      // shaft into a body: soft thud, no ring off the armor, shaft still quivering
      tone(ctx, out, { when, dur: 0.09, gain: 0.3 * v, freq: rand(190, 240), freqTo: 90, type: 'sine' });
      noiseHit(ctx, out, { when, dur: 0.05, gain: 0.2 * v, filter: { type: 'lowpass', from: 1400, to: 500 } });
      tone(ctx, out, { when: when + 0.02, dur: 0.1, gain: 0.05 * v, freq: rand(1400, 1800), type: 'triangle' });
      return 0.13;
    }
    case 'arrowThunk': {
      // shaft into timber: a sharp woody knock and a long shaft vibration
      noiseHit(ctx, out, { when, dur: 0.04, gain: 0.3 * v, filter: { type: 'bandpass', from: 2200, q: 2 } });
      tone(ctx, out, { when, dur: 0.11, gain: 0.28 * v, freq: rand(300, 380), freqTo: 150, type: 'triangle' });
      tone(ctx, out, { when: when + 0.03, dur: 0.16, gain: 0.07 * v, freq: rand(1600, 2100), type: 'sine' });
      return 0.18;
    }
    case 'boltPunch': {
      // crossbow bolt: shorter, heavier, more punch and less ring than an arrow
      noiseHit(ctx, out, { when, dur: 0.04, gain: 0.34 * v, filter: { type: 'highpass', from: 1800 } });
      tone(ctx, out, { when, dur: 0.08, gain: 0.3 * v, freq: rand(240, 300), freqTo: 110, type: 'square', lowpass: 1200 });
      return 0.11;
    }
    case 'stoneCrush': {
      // boulder onto bodies and ground: heavy crunch trailing into dust
      noiseHit(ctx, out, { when, dur: 0.18, gain: 0.5 * v, filter: { type: 'lowpass', from: 900, to: 180 } });
      tone(ctx, out, { when, dur: 0.2, gain: 0.3 * v, freq: rand(80, 100), freqTo: 40, type: 'sawtooth', lowpass: 300 });
      noiseHit(ctx, out, { when: when + 0.09, dur: 0.22, gain: 0.14 * v, filter: { type: 'bandpass', from: 600, to: 240, q: 0.7 } });
      return 0.35;
    }
    case 'stoneShatter': {
      // boulder into masonry: brighter crack than flesh, then rubble spraying off
      noiseHit(ctx, out, { when, dur: 0.1, gain: 0.5 * v, filter: { type: 'bandpass', from: 1500, to: 500, q: 0.9 } });
      tone(ctx, out, { when, dur: 0.26, gain: 0.3 * v, freq: rand(95, 120), freqTo: 44, type: 'sawtooth', lowpass: 400 });
      for (let i = 0; i < 4; i++) {
        noiseHit(ctx, out, {
          when: when + 0.05 + i * rand(0.03, 0.07), dur: 0.05, gain: 0.1 * v,
          filter: { type: 'bandpass', from: rand(1200, 2600), q: 1.5 },
        });
      }
      return 0.45;
    }
    case 'arrowShot': {
      // string release pluck + whoosh sweeping down
      tone(ctx, out, { when, dur: 0.05, gain: 0.3 * v, freq: 900, freqTo: 320, type: 'triangle' });
      noiseHit(ctx, out, { when: when + 0.02, dur: 0.28, gain: 0.22 * v, attack: 0.03, filter: { type: 'bandpass', from: 3800, to: 900, q: 2.2 } });
      return 0.3;
    }
    case 'boltShot': {
      // crossbow: the lock clacks instead of a bowstring singing, flight is tighter
      noiseHit(ctx, out, { when, dur: 0.03, gain: 0.3 * v, filter: { type: 'highpass', from: 2400 } });
      tone(ctx, out, { when, dur: 0.05, gain: 0.22 * v, freq: 700, freqTo: 300, type: 'square', lowpass: 2000 });
      noiseHit(ctx, out, { when: when + 0.015, dur: 0.2, gain: 0.18 * v, attack: 0.02, filter: { type: 'bandpass', from: 4200, to: 1400, q: 2.6 } });
      return 0.22;
    }
    case 'siegeRelease': {
      // mangonel/trebuchet loosing: timber groan, the arm slamming its stop, and
      // the stone climbing away — nothing at all like a bowstring
      noiseHit(ctx, out, { when, dur: 0.09, gain: 0.3 * v, filter: { type: 'bandpass', from: 500, to: 200, q: 1 } });
      tone(ctx, out, { when, dur: 0.14, gain: 0.28 * v, freq: rand(90, 120), freqTo: 55, type: 'sawtooth', lowpass: 350 });
      noiseHit(ctx, out, { when: when + 0.06, dur: 0.3, gain: 0.12 * v, attack: 0.04, filter: { type: 'bandpass', from: 900, to: 2600, q: 1.6 } });
      return 0.36;
    }
    case 'collapse': {
      // building down: long low rumble, falling pitch, gravel tail
      noiseHit(ctx, out, { when, dur: 1.1, gain: 0.55 * v, attack: 0.02, filter: { type: 'lowpass', from: 700, to: 90 } });
      tone(ctx, out, { when, dur: 0.8, gain: 0.3 * v, freq: 90, freqTo: 34, type: 'sawtooth', lowpass: 220 });
      noiseHit(ctx, out, { when: when + 0.35, dur: 0.5, gain: 0.2 * v, filter: { type: 'bandpass', from: 500, to: 200, q: 0.7 } });
      return 1.2;
    }
    case 'hornAge': {
      // rising two-note fanfare with a fifth on top (D3 -> G3+D4)
      for (const detune of [0, 6]) {
        tone(ctx, out, { when, dur: 0.4, gain: 0.16 * v, freq: 146.8, type: 'sawtooth', lowpass: 1100, detune, attack: 0.05 });
        tone(ctx, out, { when: when + 0.32, dur: 0.9, gain: 0.18 * v, freq: 196, type: 'sawtooth', lowpass: 1100, detune, attack: 0.05 });
        tone(ctx, out, { when: when + 0.5, dur: 0.72, gain: 0.12 * v, freq: 293.7, type: 'sawtooth', lowpass: 1400, detune, attack: 0.05 });
      }
      return 1.3;
    }
    case 'hornAlert': {
      // under attack: two urgent low blasts
      for (const start of [0, 0.34]) {
        for (const detune of [0, 8]) {
          tone(ctx, out, { when: when + start, dur: 0.26, gain: 0.2 * v, freq: 130.8, type: 'sawtooth', lowpass: 800, detune, attack: 0.02 });
        }
      }
      return 0.7;
    }
    case 'hornVictory': {
      // major fanfare: G3 - C4 - E4 - G4 held
      const notes = [[196, 0], [261.6, 0.22], [329.6, 0.44], [392, 0.66]];
      for (const [freq, start] of notes) {
        for (const detune of [0, 5]) {
          tone(ctx, out, { when: when + start, dur: start >= 0.66 ? 1.2 : 0.32, gain: 0.15 * v, freq, type: 'sawtooth', lowpass: 1600, detune, attack: 0.04 });
        }
      }
      return 2;
    }
    case 'hornDefeat': {
      // slow descending minor: D4 - Bb3 - F3 dying away
      const notes = [[293.7, 0], [233.1, 0.5], [174.6, 1.0]];
      for (const [freq, start] of notes) {
        tone(ctx, out, { when: when + start, dur: start >= 1 ? 1.4 : 0.6, gain: 0.16 * v, freq, type: 'sawtooth', lowpass: 700, attack: 0.08 });
      }
      return 2.4;
    }
    case 'monkChant': {
      // conversion blip: soft sine with slow vibrato swell
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, when);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 9;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.18 * v, when + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.75);
      osc.connect(g).connect(out);
      osc.start(when);
      lfo.start(when);
      osc.stop(when + 0.8);
      lfo.stop(when + 0.8);
      tone(ctx, out, { when: when + 0.05, dur: 0.6, gain: 0.06 * v, freq: 523.3, attack: 0.2 });
      return 0.8;
    }
    case 'townBellIn':
    case 'townBellOut': {
      // Bronze bell: several inharmonic partials with a long tail. Gathering
      // uses two firm descending tolls; return-to-work uses a lighter rising
      // pair so the state change is recognizable without looking at the HUD.
      const releasing = name === 'townBellOut';
      const starts = releasing ? [0, 0.3] : [0, 0.48];
      const roots = releasing ? [392, 493.9] : [392, 329.6];
      for (let i = 0; i < starts.length; i++) {
        const start = when + starts[i];
        const root = roots[i];
        tone(ctx, out, { when: start, dur: 1.15, gain: 0.2 * v, freq: root, type: 'sine', attack: 0.006 });
        tone(ctx, out, { when: start, dur: 0.86, gain: 0.11 * v, freq: root * 2.37, type: 'sine', attack: 0.004 });
        tone(ctx, out, { when: start, dur: 0.62, gain: 0.07 * v, freq: root * 3.91, type: 'triangle', attack: 0.003 });
        noiseHit(ctx, out, { when: start, dur: 0.035, gain: 0.1 * v, filter: { type: 'bandpass', from: 1800, q: 2 } });
      }
      return releasing ? 1.5 : 1.75;
    }
    case 'uiTap': {
      tone(ctx, out, { when, dur: 0.06, gain: 0.12 * v, freq: 1200, freqTo: 900, type: 'triangle' });
      return 0.07;
    }
    default:
      return 0;
  }
}

/**
 * Ambient bed: wind (looping lowpassed noise with a slow LFO breathing the
 * filter) + occasional bird chirps. Returns a stop function.
 */
export function startAmbient(ctx: AudioContext, out: AudioNode): () => void {
  // ---- wind
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx);
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.4;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 160; // breathes the cutoff 260..580 Hz
  lfo.connect(lfoGain).connect(windFilter.frequency);
  const lfo2 = ctx.createOscillator();
  lfo2.frequency.value = 0.05;
  const lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 0.02;
  lfo2.connect(lfo2Gain).connect(windGain.gain);
  wind.connect(windFilter).connect(windGain).connect(out);
  wind.start();
  lfo.start();
  lfo2.start();

  // ---- birds: sparse random chirps (two-note frequency flicks)
  let stopped = false;
  let birdTimer: ReturnType<typeof setTimeout> | null = null;
  const chirp = (): void => {
    if (stopped) return;
    const t = ctx.currentTime + 0.01;
    const base = rand(2400, 3800);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      tone(ctx, out, {
        when: t + i * rand(0.08, 0.14), dur: 0.07, gain: 0.045,
        freq: base * rand(0.9, 1.15), freqTo: base * rand(1.2, 1.5), attack: 0.01,
      });
    }
    birdTimer = setTimeout(chirp, rand(2500, 9000));
  };
  birdTimer = setTimeout(chirp, rand(1200, 4000));

  return () => {
    stopped = true;
    if (birdTimer) clearTimeout(birdTimer);
    try {
      wind.stop();
      lfo.stop();
      lfo2.stop();
    } catch {
      /* already stopped */
    }
    windGain.disconnect();
  };
}
