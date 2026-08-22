// SimEvent -> SFX mapping with camera-distance attenuation, plus the periodic
// "work sounds" sweep (the sim emits no per-swing events, so gather/build
// loops are derived from entity activity near the camera). game.ts owns one
// GameAudio per match and calls onSimEvents each tick + update each frame.

import { FP, GAIA, type Entity, type GameState, type PlayerId, type SimEvent } from '@bf/sim/types';
import { gameData } from '@bf/data';
import { tileToWorld, type Camera } from '../camera';
import { impactVoice, releaseVoice, voiceFalloff } from './combat';
import type { AudioEngine } from './engine';
import type { SfxName } from './synth';
import { attenuation } from './throttle';

/** ms between work-sound sweeps (axe/pick/hammer rhythm near the camera). */
const WORK_SWEEP_MS = 620;
/** Max work voices per sweep — the throttle also caps, this bounds the scan cost. */
const WORK_VOICES = 3;

export class GameAudio {
  private lastSweep = 0;
  private workBeat = 0;

  constructor(
    private engine: AudioEngine,
    private camera: Camera,
    private humanPlayer: PlayerId,
  ) {}

  /** Volume for a world event at fixed-point sim coords; 0 = cull. */
  private volumeAt(x: number, y: number, far?: number): number {
    const w = tileToWorld(x / FP, y / FP);
    return attenuation(Math.hypot(w.x - this.camera.x, w.y - this.camera.y), undefined, far);
  }

  private playAt(name: SfxName, x: number, y: number, scale = 1, far?: number): void {
    const v = this.volumeAt(x, y, far) * scale;
    if (v > 0.01) this.engine.play(name, v);
  }

  /** Map one tick's SimEvents onto voices. Stings are non-positional. */
  onSimEvents(events: SimEvent[], state: GameState): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'projectileFired': {
          const shooter = state.entities.get(ev.fromId);
          const voice = releaseVoice(shooter?.defId ?? '');
          this.playAt(voice, ev.x0, ev.y0, 0.9, voiceFalloff(voice));
          break;
        }
        case 'attackImpact': {
          // The blow is heard where it lands, and it sounds like the weapon that
          // threw it: a ram booming into a gate, a bolt punching a shield, an
          // arrow thunking into a palisade. Ranged shots sound twice on purpose
          // — once at the release, once where they arrive.
          const target = state.entities.get(ev.targetId);
          if (!target) break;
          const attacker = state.entities.get(ev.attackerId);
          const voice = impactVoice(attacker?.defId, target.kind === 'building', ev.melee);
          this.playAt(voice, target.x, target.y, 1, voiceFalloff(voice));
          break;
        }
        case 'entityDied':
          if (ev.player !== GAIA && gameData.buildings[ev.defId]) {
            this.playAt('collapse', ev.x, ev.y);
          }
          break;
        case 'ageAdvanced':
          if (ev.player === this.humanPlayer) this.engine.play('hornAge');
          break;
        case 'underAttack':
          if (ev.player === this.humanPlayer) this.engine.play('hornAlert');
          break;
        case 'conversionComplete': {
          const target = state.entities.get(ev.targetId);
          if (target) this.playAt('monkChant', target.x, target.y);
          else this.engine.play('monkChant', 0.7);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Call once per frame: schedules the periodic work-sound sweep. */
  update(state: GameState, nowMs: number): void {
    if (nowMs - this.lastSweep < WORK_SWEEP_MS) return;
    this.lastSweep = nowMs;
    this.workBeat++;
    // nearest working entities to the camera get a voice this beat
    const candidates: Array<{ name: SfxName; dist: number; scale: number }> = [];
    const cam = this.camera;
    for (const e of state.entities.values()) {
      if (e.kind !== 'unit' || e.hp <= 0) continue;
      const name = workVoice(e, state);
      if (!name) continue;
      const w = tileToWorld(e.x / FP, e.y / FP);
      const dist = Math.hypot(w.x - cam.x, w.y - cam.y);
      const scale = attenuation(dist);
      if (scale <= 0.01) continue;
      candidates.push({ name, dist, scale });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    // stagger: alternate beats skip half the voices so many workers sound
    // like an irregular worksite, not a metronome
    const n = Math.min(WORK_VOICES, candidates.length);
    for (let i = 0; i < n; i++) {
      if ((i + this.workBeat) % 2 === 0) continue;
      const c = candidates[i];
      this.engine.play(c.name, c.scale * 0.85);
    }
  }
}

/** Which work sound (if any) an entity's current activity produces. */
export function workVoice(e: Entity, state: GameState): SfxName | null {
  if (e.activity === 'building' || e.activity === 'repairing') return 'hammer';
  if (e.activity !== 'gathering') return null;
  const targetId = e.intent?.kind === 'gather' ? e.intent.targetId : e.targetId;
  const target = targetId !== undefined ? state.entities.get(targetId) : undefined;
  if (!target) return null;
  if (target.defId === 'tree') return 'chopWood';
  if (target.defId === 'goldMine' || target.defId === 'stoneMine') return 'pickMine';
  if (target.defId === 'farm') return 'farmScythe';
  if (target.defId === 'berryBush') return 'farmScythe';
  return null; // animals: butchering has no dedicated voice yet
}
