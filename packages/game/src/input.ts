// Input controller: binds pointer/keyboard/wheel events, runs the gesture
// reducer (gestures.ts) and maps gestures to game intents per GDD "Mobile UX":
//  - tap = instant select; second tap in the double-tap window = select all of type on screen
//  - two-finger drag ALWAYS pans; one-finger drag pans too (touch); pinch = zoom steps
//  - long-press then drag = band select; long-press released in place with a
//    selection = alternate command (arms attack-move for the next tap)
//  - tap with selection = context command with slop + snap priority
//    (enemy > resource/Gaia > own building > ground) and a ~2 s undo toast
//  - two-finger tap = deselect (or cancels placement mode)
//  - building placement: taps/drags move the ghost; confirm/cancel live in the HUD
// Desktop equivalents: left click select / left drag band, right-click context
// command, wheel zoom, middle-drag pan, arrow keys pan, Esc cancel, P pause.

import type { Graphics } from 'pixi.js';
import {
  GAIA, fp,
  type Command, type Entity, type EntityId, type GameState, type PlayerId,
} from '@bf/sim/types';
import { worldToTile, type Camera } from './camera';
import type { WorldLayer } from './world';
import {
  createGestureState, stepGesture, flushGestures,
  type Gesture, type GestureState, type PointerEvt,
} from './gestures';

const PICK_SLOP_PX = 16;
const PINCH_STEP = 1.3;
const KEY_PAN_SPEED = 0.65; // screen px per ms

export interface InputHost {
  camera: Camera;
  world: WorldLayer;
  humanPlayer: PlayerId;
  getState(): GameState;
  getSelection(): Entity[];
  setSelection(ids: EntityId[]): void;
  deselect(): void;
  issue(cmd: Command): void;
  issueWithUndo(cmd: Command, label: string, undo: (() => void) | null): void;
  isPlacing(): boolean;
  setPlacementTile(tileX: number, tileY: number): void;
  placementHitTest(worldX: number, worldY: number): boolean;
  cancelPlacement(): void;
  isAttackMoveArmed(): boolean;
  setAttackMoveArmed(v: boolean): void;
  togglePause(): void;
  showToast(label: string): void;
}

type DragMode = 'pan' | 'band' | 'ghost' | 'none';

export class InputController {
  private gestures: GestureState = createGestureState();
  private dragMode: DragMode = 'none';
  private bandStartScreen: { x: number; y: number } | null = null;
  private keysDown = new Set<string>();
  private disposers: Array<() => void> = [];

  constructor(
    private el: HTMLElement,
    private bandOverlay: Graphics,
    private host: InputHost,
  ) {
    this.bind();
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  /** Per-frame: keyboard panning + time-based gesture transitions. */
  update(dtMs: number, now: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keysDown.has('ArrowLeft')) dx += 1;
    if (this.keysDown.has('ArrowRight')) dx -= 1;
    if (this.keysDown.has('ArrowUp')) dy += 1;
    if (this.keysDown.has('ArrowDown')) dy -= 1;
    if (dx !== 0 || dy !== 0) {
      this.host.camera.panBy(dx * KEY_PAN_SPEED * dtMs, dy * KEY_PAN_SPEED * dtMs);
    }
    for (const g of flushGestures(this.gestures, now)) this.onGesture(g);
  }

  // ------------------------------------------------------------------ binding

  private bind(): void {
    const el = this.el;
    const toEvt = (ev: PointerEvent, type: PointerEvt['type']): PointerEvt => {
      const rect = el.getBoundingClientRect();
      return {
        type,
        id: ev.pointerId,
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
        t: performance.now(),
        button: type === 'down' ? ev.button : undefined,
        ptype: (ev.pointerType as PointerEvt['ptype']) ?? 'touch',
      };
    };
    const down = (ev: PointerEvent) => {
      el.setPointerCapture?.(ev.pointerId);
      this.feed(toEvt(ev, 'down'));
      ev.preventDefault();
    };
    const move = (ev: PointerEvent) => this.feed(toEvt(ev, 'move'));
    const up = (ev: PointerEvent) => this.feed(toEvt(ev, 'up'));
    const cancel = (ev: PointerEvent) => this.feed(toEvt(ev, 'cancel'));
    const ctxmenu = (ev: Event) => ev.preventDefault();
    const wheel = (ev: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      this.host.camera.zoomStep(ev.deltaY < 0 ? 1 : -1, ev.clientX - rect.left, ev.clientY - rect.top);
      ev.preventDefault();
    };
    const keydown = (ev: KeyboardEvent) => {
      if (ev.key.startsWith('Arrow')) {
        this.keysDown.add(ev.key);
        ev.preventDefault();
      } else if (ev.key === 'Escape') {
        if (this.host.isPlacing()) this.host.cancelPlacement();
        else if (this.host.isAttackMoveArmed()) this.host.setAttackMoveArmed(false);
        else this.host.deselect();
      } else if (ev.key === 'p' || ev.key === 'P') {
        this.host.togglePause();
      } else if (ev.key === '+' || ev.key === '=') {
        this.host.camera.zoomStep(1);
      } else if (ev.key === '-') {
        this.host.camera.zoomStep(-1);
      }
    };
    const keyup = (ev: KeyboardEvent) => this.keysDown.delete(ev.key);

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', ctxmenu);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('contextmenu', ctxmenu);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    });
  }

  private pinchAccum = 1;

  private feed(evt: PointerEvt): void {
    for (const g of stepGesture(this.gestures, evt)) this.onGesture(g);
  }

  // ------------------------------------------------------------------ gestures

  private onGesture(g: Gesture): void {
    const cam = this.host.camera;
    switch (g.kind) {
      case 'tap':
        if (g.button === 2) this.contextCommandAt(g.x, g.y);
        else this.handleTap(g.x, g.y);
        break;
      case 'doubleTap':
        this.handleDoubleTap(g.x, g.y);
        break;
      case 'longPress':
        break; // visual affordance only; band vs alt-menu resolves on drag/release
      case 'longPressRelease':
        this.handleAltCommand();
        break;
      case 'bandStart':
        this.dragMode = 'band';
        this.bandStartScreen = { x: g.x0, y: g.y0 };
        this.drawBand(g.x0, g.y0, g.x, g.y);
        break;
      case 'bandMove':
        this.drawBand(g.x0, g.y0, g.x, g.y);
        break;
      case 'bandEnd':
        this.finishBand(g.x0, g.y0, g.x, g.y);
        break;
      case 'dragStart': {
        if (this.host.isPlacing()) {
          const w = cam.screenToWorld(g.x0, g.y0);
          if (this.host.placementHitTest(w.x, w.y)) {
            this.dragMode = 'ghost';
            break;
          }
        }
        if (g.ptype === 'mouse' && g.button === 0) {
          // desktop: left drag = band select
          this.dragMode = 'band';
          this.bandStartScreen = { x: g.x0, y: g.y0 };
        } else if (g.ptype === 'mouse' && g.button === 2) {
          this.dragMode = 'none';
        } else {
          this.dragMode = 'pan'; // touch one-finger drag & middle-mouse: pan
        }
        break;
      }
      case 'dragMove':
        if (this.dragMode === 'pan') cam.panBy(g.dx, g.dy);
        else if (this.dragMode === 'band' && this.bandStartScreen) {
          this.drawBand(this.bandStartScreen.x, this.bandStartScreen.y, g.x, g.y);
        } else if (this.dragMode === 'ghost') {
          const w = cam.screenToWorld(g.x, g.y);
          this.movePlacementToWorld(w.x, w.y);
        }
        break;
      case 'dragEnd':
        if (this.dragMode === 'pan') cam.fling(g.vx, g.vy);
        else if (this.dragMode === 'band' && this.bandStartScreen) {
          this.finishBand(this.bandStartScreen.x, this.bandStartScreen.y, g.x, g.y);
        }
        this.dragMode = 'none';
        break;
      case 'twoFingerPan':
        cam.panBy(g.dx, g.dy); // ALWAYS pans (GDD)
        break;
      case 'pinch':
        this.pinchAccum *= g.factor;
        if (this.pinchAccum >= PINCH_STEP) {
          cam.zoomStep(1, g.cx, g.cy);
          this.pinchAccum = 1;
        } else if (this.pinchAccum <= 1 / PINCH_STEP) {
          cam.zoomStep(-1, g.cx, g.cy);
          this.pinchAccum = 1;
        }
        break;
      case 'twoFingerTap':
        if (this.host.isPlacing()) this.host.cancelPlacement();
        else this.host.deselect();
        break;
    }
  }

  // ------------------------------------------------------------------ actions

  private commandableSelection(): Entity[] {
    return this.host.getSelection().filter((e) => e.player === this.host.humanPlayer);
  }

  private handleTap(sx: number, sy: number): void {
    if (this.host.isPlacing()) {
      const w = this.host.camera.screenToWorld(sx, sy);
      this.movePlacementToWorld(w.x, w.y);
      return;
    }
    const w = this.host.camera.screenToWorld(sx, sy);
    const picks = this.pickAt(w.x, w.y);
    const ownUnit = picks.find((p) => p.player === this.host.humanPlayer && p.kind === 'unit');
    const sel = this.commandableSelection();

    if (ownUnit) {
      this.host.setSelection([ownUnit.id]);
      return;
    }
    if (sel.length > 0) {
      this.contextCommand(w.x, w.y, picks, sel);
      return;
    }
    const ownBuilding = picks.find((p) => p.player === this.host.humanPlayer && p.kind === 'building');
    if (ownBuilding) {
      this.host.setSelection([ownBuilding.id]);
      return;
    }
    if (picks.length > 0) {
      // enemy/resource with nothing selected: inspect (stats panel), never a command
      this.host.setSelection([picks[0].id]);
      return;
    }
    // ground with no selection: nothing (deselect is explicit: ✕ / two-finger tap)
  }

  private handleDoubleTap(sx: number, sy: number): void {
    const w = this.host.camera.screenToWorld(sx, sy);
    const picks = this.pickAt(w.x, w.y);
    const own = picks.find((p) => p.player === this.host.humanPlayer && p.kind === 'unit');
    if (!own) {
      this.handleTap(sx, sy);
      return;
    }
    const view = this.host.camera.getWorldView();
    const all = this.host.world.unitsOfTypeInRect(
      this.host.getState(), own.defId, view.x0, view.y0, view.x1, view.y1, this.host.humanPlayer,
    );
    this.host.setSelection(all.length > 0 ? all.map((e) => e.id) : [own.id]);
    this.host.showToast(`Selected all ${own.defId} on screen (${all.length})`);
  }

  /** Long-press released in place: alternate command — arm attack-move. */
  private handleAltCommand(): void {
    const sel = this.commandableSelection().filter((e) => e.kind === 'unit');
    if (sel.length === 0) return;
    this.host.setAttackMoveArmed(true);
    this.host.showToast('Attack-move armed — tap a target');
  }

  private contextCommandAt(sx: number, sy: number): void {
    const w = this.host.camera.screenToWorld(sx, sy);
    const sel = this.commandableSelection();
    if (sel.length === 0) return;
    this.contextCommand(w.x, w.y, this.pickAt(w.x, w.y), sel);
  }

  private pickAt(wx: number, wy: number): Entity[] {
    const slop = PICK_SLOP_PX / this.host.camera.zoom + 4;
    return this.host.world
      .pickAt(this.host.getState(), wx, wy, slop)
      .map((r) => r.entity);
  }

  /**
   * GDD intent inference: snap priority enemy unit > resource/Gaia > own
   * building > ground; villagers gather/build, military attack, production
   * buildings set rally. Every command gets the ~2 s undo toast.
   */
  private contextCommand(wx: number, wy: number, picks: Entity[], sel: Entity[]): void {
    const human = this.host.humanPlayer;
    const units = sel.filter((e) => e.kind === 'unit');
    const buildings = sel.filter((e) => e.kind === 'building');
    const villagers = units.filter((e) => e.defId === 'villager');
    const military = units.filter((e) => e.defId !== 'villager');
    const st = this.host.getState();

    const enemy = picks.find((p) => p.player !== human && p.player !== GAIA && p.kind !== 'resource');
    const gaiaOrRes = picks.find((p) => p.kind === 'resource' || (p.player === GAIA && p.kind === 'unit'));
    const ownBld = picks.find((p) => p.player === human && p.kind === 'building');
    const unitIds = units.map((e) => e.id);
    const undoStop = unitIds.length > 0
      ? () => this.host.issue({ kind: 'stop', player: human, units: unitIds })
      : null;

    // Production buildings selected (and no units): tap sets the rally point.
    if (units.length === 0 && buildings.length > 0) {
      const target = enemy ?? gaiaOrRes;
      for (const b of buildings) {
        this.host.issue({
          kind: 'setRally', player: human, buildingId: b.id,
          x: target ? target.x : fp(worldToTile(wx, wy).x),
          y: target ? target.y : fp(worldToTile(wx, wy).y),
          targetId: target?.id,
        });
      }
      this.host.showToast('Rally point set');
      return;
    }
    if (unitIds.length === 0) return;

    const armed = this.host.isAttackMoveArmed();
    this.host.setAttackMoveArmed(false);

    if (enemy) {
      this.host.issueWithUndo({ kind: 'attack', player: human, units: unitIds, targetId: enemy.id }, 'Attack', undoStop);
      return;
    }
    if (gaiaOrRes && villagers.length > 0) {
      this.host.issueWithUndo(
        { kind: 'gather', player: human, units: villagers.map((e) => e.id), targetId: gaiaOrRes.id },
        'Gather', undoStop,
      );
      if (military.length > 0) {
        this.host.issue({ kind: 'move', player: human, units: military.map((e) => e.id), x: gaiaOrRes.x, y: gaiaOrRes.y });
      }
      return;
    }
    if (gaiaOrRes && military.length > 0 && gaiaOrRes.kind === 'unit') {
      // military ordered onto a gaia animal: hunt it
      this.host.issueWithUndo({ kind: 'attack', player: human, units: unitIds, targetId: gaiaOrRes.id }, 'Attack', undoStop);
      return;
    }
    if (ownBld && villagers.length > 0 && ((ownBld.buildProgress ?? 1000) < 1000 || ownBld.hp < ownBld.maxHp)) {
      this.host.issueWithUndo(
        { kind: 'repair', player: human, units: villagers.map((e) => e.id), targetId: ownBld.id },
        (ownBld.buildProgress ?? 1000) < 1000 ? 'Build' : 'Repair', undoStop,
      );
      return;
    }
    const t = worldToTile(wx, wy);
    const clampX = Math.max(0, Math.min(st.map.width - 0.01, t.x));
    const clampY = Math.max(0, Math.min(st.map.height - 0.01, t.y));
    if (armed && military.length > 0) {
      this.host.issueWithUndo(
        { kind: 'attackMove', player: human, units: unitIds, x: fp(clampX), y: fp(clampY) },
        'Attack-move', undoStop,
      );
    } else {
      this.host.issueWithUndo(
        { kind: 'move', player: human, units: unitIds, x: fp(clampX), y: fp(clampY) },
        'Move', undoStop,
      );
    }
  }

  private movePlacementToWorld(wx: number, wy: number): void {
    const t = worldToTile(wx, wy);
    this.host.setPlacementTile(Math.round(t.x), Math.round(t.y));
  }

  // ------------------------------------------------------------------ band box

  private drawBand(x0: number, y0: number, x1: number, y1: number): void {
    this.bandOverlay.clear();
    this.bandOverlay
      .rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      .stroke({ width: 1, color: 0xf4eedd });
  }

  private finishBand(x0: number, y0: number, x1: number, y1: number): void {
    this.bandOverlay.clear();
    this.bandStartScreen = null;
    if (Math.abs(x1 - x0) < 6 && Math.abs(y1 - y0) < 6) return;
    const a = this.host.camera.screenToWorld(x0, y0);
    const b = this.host.camera.screenToWorld(x1, y1);
    const found = this.host.world.unitsInWorldRect(this.host.getState(), a.x, a.y, b.x, b.y, this.host.humanPlayer);
    if (found.length > 0) this.host.setSelection(found.map((e) => e.id));
  }
}
