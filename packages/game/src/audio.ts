// Minimal procedural audio hooks (GDD: synthesized SFX; horn stings for
// age-up and attack warnings). WebAudio only, lazily created, and silently
// inert when the context is unavailable or not yet unlocked by a user gesture.
// Full SFX pass is a separate work item — this file is the hook point.

let ctx: AudioContext | null = null;
let lastSting = 0;

function audioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

/**
 * Low horn sting (under-attack alert / age fanfare base note). Throttled to
 * one per 2 s so simultaneous alerts never stack into a blare.
 */
export function playHornSting(): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  if (now - lastSting < 2) return;
  lastSting = now;
  try {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(gain).connect(ac.destination);
    for (const detune of [0, 7]) {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(146.83, now); // D3
      osc.frequency.setValueAtTime(196.0, now + 0.28); // G3
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 1);
    }
  } catch {
    // never let audio failures reach gameplay
  }
}
