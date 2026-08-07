// WebAudio SFX engine: lazy AudioContext (unlocked by the first user gesture),
// master/sfx/ambient gain buses driven by settings, per-category throttling
// (audio/throttle.ts), tab-hidden muting. Synthesis lives in audio/synth.ts;
// event mapping in audio/events.ts. Every entry point is defensive — audio
// failure must never reach gameplay.

import { getSettings, onSettingsChanged, type GameSettings } from '../settings';
import { playVoice, startAmbient, type SfxName } from './synth';
import { DEFAULT_POLICIES, SfxThrottle } from './throttle';

/** Category a voice is throttled under (see DEFAULT_POLICIES). */
export const SFX_CATEGORY: Record<SfxName, string> = {
  chopWood: 'gather',
  pickMine: 'gather',
  farmScythe: 'gather',
  hammer: 'build',
  swordClash: 'combat',
  arrowShot: 'bow',
  collapse: 'collapse',
  hornAge: 'sting',
  hornAlert: 'sting',
  hornVictory: 'sting',
  hornDefeat: 'sting',
  monkChant: 'monk',
  townBellIn: 'bell',
  townBellOut: 'bell',
  uiTap: 'ui',
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private throttle = new SfxThrottle(DEFAULT_POLICIES);
  private stopAmbientFn: (() => void) | null = null;
  private ambientWanted = false;
  private hidden = false;
  private disposers: Array<() => void> = [];

  constructor() {
    // Browsers block AudioContexts until a gesture; first pointer/key unlocks.
    const unlock = (): void => void this.ensureContext();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    this.disposers.push(() => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    });

    const onVis = (): void => {
      this.hidden = document.hidden;
      this.applyVolumes();
    };
    document.addEventListener('visibilitychange', onVis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', onVis));

    this.disposers.push(onSettingsChanged(() => this.applyVolumes()));
  }

  dispose(): void {
    this.stopAmbient();
    for (const d of this.disposers) d();
    this.disposers = [];
    try {
      void this.ctx?.close();
    } catch {
      /* non-fatal */
    }
    this.ctx = null;
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.ambientBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.ambientBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      if (this.ambientWanted && !this.stopAmbientFn && this.ctx.state === 'running' && this.ambientBus) {
        this.stopAmbientFn = startAmbient(this.ctx, this.ambientBus);
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private applyVolumes(s: GameSettings = getSettings()): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambientBus) return;
    const t = this.ctx.currentTime;
    // short ramps avoid clicks; hidden tab hard-mutes the master
    this.master.gain.setTargetAtTime(this.hidden ? 0 : s.masterVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.ambientBus.gain.setTargetAtTime(s.ambientVolume, t, 0.05);
  }

  /**
   * Play a named voice. `volume` 0..1 is the pre-bus scale (distance
   * attenuation); 0 skips synthesis. Throttled per category.
   */
  play(name: SfxName, volume = 1): void {
    if (volume <= 0 || this.hidden) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx || ctx.state !== 'running' || !this.sfxBus) return;
      const nowMs = ctx.currentTime * 1000;
      // book with a conservative duration guess; playVoice returns the real one
      if (!this.throttle.request(SFX_CATEGORY[name] ?? 'misc', nowMs, 400)) return;
      playVoice(ctx, this.sfxBus, name, ctx.currentTime, volume);
    } catch {
      /* audio must never break the game */
    }
  }

  /** Begin the wind/birds bed (idempotent; actually starts once ctx unlocks). */
  ambientOn(): void {
    this.ambientWanted = true;
    this.ensureContext();
  }

  stopAmbient(): void {
    this.ambientWanted = false;
    if (this.stopAmbientFn) {
      try {
        this.stopAmbientFn();
      } catch {
        /* non-fatal */
      }
      this.stopAmbientFn = null;
    }
  }
}
