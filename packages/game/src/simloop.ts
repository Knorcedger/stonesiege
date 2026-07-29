// Fixed-timestep sim driver: 20 tps accumulator around game.advance(commands),
// interpolation alpha for the renderer, pause/resume, auto-pause when the
// document is hidden (GDD: single-player is always pausable; backgrounding
// must never lose a game).

import { TICKS_PER_SECOND, type Command, type Game, type SimEvent } from '@bf/sim/types';

export const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_CATCHUP_TICKS = 5;

export interface SimLoopCallbacks {
  /** After every advanced tick (events of that tick). */
  onTick?: (events: SimEvent[], tick: number) => void;
  /** Pause state changed (manual or auto). */
  onPauseChanged?: (paused: boolean, auto: boolean) => void;
}

export class SimLoop {
  private accumulator = 0;
  private pending: Command[] = [];
  private _paused = false;
  private autoPaused = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(
    private game: Game,
    private callbacks: SimLoopCallbacks = {},
  ) {}

  get paused(): boolean {
    return this._paused;
  }

  /** 0..1 fraction of the way from the previous tick to the current one. */
  get alpha(): number {
    return this._paused ? 1 : Math.min(1, this.accumulator / TICK_MS);
  }

  /** Queue a command for the next tick boundary. */
  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  pause(auto = false): void {
    if (this._paused) return;
    this._paused = true;
    this.autoPaused = auto;
    this.callbacks.onPauseChanged?.(true, auto);
  }

  resume(): void {
    if (!this._paused) return;
    this._paused = false;
    this.autoPaused = false;
    this.accumulator = 0;
    this.callbacks.onPauseChanged?.(false, false);
  }

  togglePause(): void {
    if (this._paused) this.resume();
    else this.pause(false);
  }

  /** Hook document visibility for GDD auto-pause. Call once; returns a disposer. */
  attachAutoPause(doc: Document = document): () => void {
    this.visibilityHandler = () => {
      if (doc.hidden) this.pause(true);
      // Deliberately no auto-resume: the player returns to an explicit paused
      // overlay and taps to continue (GDD: a phone call never loses a game).
    };
    doc.addEventListener('visibilitychange', this.visibilityHandler);
    return () => {
      if (this.visibilityHandler) doc.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    };
  }

  /**
   * Advance the accumulator by elapsed wall ms; steps the sim 0..N times.
   * Long stalls are clamped (no spiral of death) — the game effectively pauses.
   */
  update(elapsedMs: number): void {
    if (this._paused) return;
    this.accumulator += elapsedMs;
    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < MAX_CATCHUP_TICKS) {
      const commands = this.pending;
      this.pending = [];
      const events = this.game.advance(commands);
      this.callbacks.onTick?.(events, this.game.state.tick);
      this.accumulator -= TICK_MS;
      steps++;
    }
    if (steps === MAX_CATCHUP_TICKS && this.accumulator >= TICK_MS) {
      this.accumulator = 0; // drop the backlog
    }
  }
}
