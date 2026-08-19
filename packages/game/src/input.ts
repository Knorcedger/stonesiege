// Input controller: binds pointer/keyboard/wheel events, runs the gesture
// reducer (gestures.ts) and maps gestures to game intents per GDD "Mobile UX":
//  - touch tap = instant select / context command; tapping empty ground with
//    units selected moves them there; second tap in the double-tap window =
//    select all of type on screen
//  - two-finger drag ALWAYS pans; one-finger drag pans too (touch); pinch = zoom steps
//  - long-press then drag = band select; long-press released in place with a
//    selection = alternate command (arms attack-move for the next tap)
//  - tap with a selection = context command with slop + snap priority
//    (enemy > resource/Gaia > own building > ground) and a ~2 s undo toast
//  - two-finger tap = deselect (or cancels placement mode)
//  - touch building placement: taps/drags move the ghost; confirm/cancel live in the HUD
// Desktop equivalents: left click selects (empty ground clears), left drag
// bands, right-click commands, wheel zoom, middle-drag pan, arrow keys pan,
// Esc cancel, P pause. Desktop placement follows the mouse and commits on the
// next valid left click. Hovering a selectable entity shows a pointer cursor.

import type { Graphics } from 'pixi.js';
import {
  GAIA, fp,
  type Command, type Entity, type EntityId, type Formation, type GameState, type PlayerId,
} from '@bf/sim/types';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { gameData } from '@bf/data';
import type { ArmedVerb } from './hud/cardModel';
import { worldToTile, type Camera } from './camera';
import type { WorldLayer } from './world';
import {
  createGestureState, stepGesture, flushGestures,
  type Gesture, type GestureState, type PointerEvt,
} from './gestures';
import { getSettings } from './settings';

const PICK_SLOP_PX = 16;
const PINCH_STEP = 1.3;
const KEY_PAN_SPEED = 0.65; // screen px per ms (settings cameraSpeed multiplies)
const EDGE_PAN_PX = 24;

/** Classic RTS edge-scroll direction in Camera.panBy sign convention. */
export function edgePanVector(
  x: number, y: number, width: number, height: number,
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return {
    x: x <= EDGE_PAN_PX ? 1 : x >= width - EDGE_PAN_PX ? -1 : 0,
    y: y <= EDGE_PAN_PX ? 1 : y >= height - EDGE_PAN_PX ? -1 : 0,
  };
}

/** Arrow keys and WASD share the same camera-pan convention. */
export function keyboardPanVector(keys: ReadonlySet<string>): { x: number; y: number } {
  let x = 0, y = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) x += 1;
  if (keys.has('ArrowRight') || keys.has('d')) x -= 1;
  if (keys.has('ArrowUp') || keys.has('w')) y += 1;
  if (keys.has('ArrowDown') || keys.has('s')) y -= 1;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

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
  confirmPlacement(keepActive?: boolean): void;
  placementHitTest(worldX: number, worldY: number): boolean;
  cancelPlacement(): void;
  /** Shift was released after one or more repeat placements. */
  releasePlacementModifier(): void;
  isAttackMoveArmed(): boolean;
  setAttackMoveArmed(v: boolean): void;
  /** Armed "next tap = target" verb (rally / attack-move / garrison / convert / heal). */
  getArmedVerb(): ArmedVerb | null;
  clearArmedVerb(): void;
  /** Current group arrangement selected in the command card. */
  getFormation(): Formation;
  togglePause(): void;
  showToast(label: string): void;
}

type DragMode = 'pan' | 'band' | 'ghost' | 'none';

export type TapAction =
  | { type: 'select'; id: EntityId }
  | { type: 'command' }
  | { type: 'inspect'; id: EntityId }
  | { type: 'deselect' }
  | { type: 'none' };

/** What the current commandable selection contains (drives tap semantics). */
export interface TapSelection {
  units: number;
  buildings: number;
  /** Villagers within `units` (own herdables become gather targets for them). */
  villagers?: number;
}

/** Own food-on-legs (captured sheep etc.): a def the sim lets villagers gather. */
export function isFoodAnimal(e: Entity): boolean {
  if (e.kind !== 'unit') return false;
  const def = gameData.units[e.defId];
  return !!(def?.herdable || def?.huntable);
}

/** Targets that a selected villager can legally gather from right now. */
export function isVillagerGatherTarget(e: Entity, human: PlayerId): boolean {
  if (e.kind === 'resource') {
    return gameData.resources[e.defId] !== undefined && (e.amountLeft ?? 0) > 0;
  }
  if (e.kind === 'building') {
    return e.player === human
      && e.hp > 0
      && (e.buildProgress ?? 1000) >= 1000
      && gameData.buildings[e.defId]?.providesFood !== undefined
      && (e.amountLeft ?? 0) > 0;
  }
  const def = gameData.units[e.defId];
  if (!def?.huntable) return false;
  // Live prey must be neutral/owned. Once dead, the sim treats any remaining
  // huntable carcass as food regardless of its former owner.
  if (e.hp > 0) return e.player === GAIA || e.player === human;
  return (e.amountLeft ?? 0) > 0;
}

/**
 * Building targets only snap when the pointer is actually on their footprint.
 * Without this guard the generous pick slop around a 3x3 farm swallowed clicks
 * just beyond the field, so villagers gathered instead of walking across it.
 */
export function isVillagerGatherTargetAt(
  e: Entity,
  human: PlayerId,
  wx: number,
  wy: number,
): boolean {
  if (!isVillagerGatherTarget(e, human)) return false;
  if (e.kind !== 'building') return true;
  const tile = worldToTile(wx, wy);
  const size = gameData.buildings[e.defId]?.size ?? 1;
  return tile.x >= e.tileX && tile.x < e.tileX + size
    && tile.y >= e.tileY && tile.y < e.tileY + size;
}

function pointerInsideBuilding(e: Entity, wx: number, wy: number): boolean {
  if (e.kind !== 'building') return false;
  const tile = worldToTile(wx, wy);
  const size = gameData.buildings[e.defId]?.size ?? 1;
  return tile.x >= e.tileX && tile.x < e.tileX + size
    && tile.y >= e.tileY && tile.y < e.tileY + size;
}

/**
 * Pick the enemy for a context attack. A directly clicked enemy foundation wins
 * over its builder: foundations are flat and the builder sprite otherwise hides
 * the only practical way to order soldiers to destroy construction in progress.
 */
export function enemyContextTarget(
  picks: readonly Entity[], human: PlayerId, wx: number, wy: number,
): Entity | undefined {
  const enemy = (e: Entity): boolean => isContextAttackTarget(e, human);
  return picks.find((e) => enemy(e) && e.kind === 'building'
      && (e.buildProgress ?? 1000) < 1000 && pointerInsideBuilding(e, wx, wy))
    ?? picks.find(enemy);
}

/**
 * A right-click attack target is either a normal enemy or armed Gaia wildlife.
 * Harmless sheep/deer remain gather targets, while wolves (and any future Gaia
 * unit with an attack) can be fought before or while they maul the selection.
 */
export function isContextAttackTarget(e: Entity, human: PlayerId): boolean {
  if (e.player === human || e.kind === 'resource' || e.hp <= 0) return false;
  if (e.player !== GAIA) return true;
  return e.kind === 'unit' && (gameData.units[e.defId]?.attacks.length ?? 0) > 0;
}

/**
 * Decide what a plain tap does. `picks` is distance-ordered (nearest first).
 * GDD intent inference:
 * - With units selected, empty ground issues a move command. An enemy anywhere
 *   in the tap slop outranks everything
 *   (taps-with-selection are attacks in melee); an own unit only steals the tap
 *   as a reselect when it is the NEAREST pick and no enemy is in the slop.
 *   Exception: with villagers selected, an own herdable/huntable (a captured
 *   sheep) is a GATHER target, not a reselect — the AoE2 opening (eat the
 *   starting sheep under the TC) must be one tap.
 * - With a buildings-only selection, plain taps remain selection-only:
 *   tapping any own unit, or an own building as the nearest pick, reselects
 *   (so TC -> Barracks is one tap and re-tapping the TC never moves its rally).
 *   Empty ground deselects, while resources/enemies are inspected. Rally points
 *   require arming the Rally button before choosing a destination.
 * - Bare taps (no selection) stay instant-select.
 */
export function resolveTapAction(picks: Entity[], sel: TapSelection, human: PlayerId): TapAction {
  const villagersSelected = (sel.villagers ?? 0) > 0;
  const ownUnit = picks.find((p) =>
    p.player === human && p.kind === 'unit' &&
    // own sheep are food, not a reselect, while villagers hold the selection
    !(sel.units > 0 && villagersSelected && isFoodAnimal(p)));
  if (sel.units > 0) {
    const enemy = picks.find((p) => isContextAttackTarget(p, human));
    if (!enemy && ownUnit && picks[0]?.id === ownUnit.id) return { type: 'select', id: ownUnit.id };
    return { type: 'command' };
  }
  if (sel.buildings > 0) {
    if (ownUnit) return { type: 'select', id: ownUnit.id };
    const nearest = picks[0];
    if (nearest && nearest.player === human && nearest.kind === 'building') {
      return { type: 'select', id: nearest.id };
    }
    if (nearest) return { type: 'inspect', id: nearest.id };
    return { type: 'deselect' };
  }
  if (ownUnit) return { type: 'select', id: ownUnit.id };
  const ownBuilding = picks.find((p) => p.player === human && p.kind === 'building');
  if (ownBuilding) return { type: 'select', id: ownBuilding.id };
  // enemy/resource with nothing selected: inspect (stats panel), never a command
  if (picks.length > 0) return { type: 'inspect', id: picks[0].id };
  // ground with no selection: nothing (deselect is explicit: ✕ / two-finger tap)
  return { type: 'none' };
}

/**
 * Desktop primary-click semantics are deliberately selection-only. Orders live
 * on right-click, so an existing army selection can never turn a left click on
 * a building into a repair/rally command or a left click on ground into a move.
 * `picks` is distance ordered; desktop precision should choose what is actually
 * under the pointer rather than applying the wider touch snap priorities.
 */
export function resolveDesktopPrimaryAction(picks: Entity[], human: PlayerId): TapAction {
  const nearest = picks[0];
  if (!nearest) return { type: 'deselect' };
  if (nearest.player === human && (nearest.kind === 'unit' || nearest.kind === 'building')) {
    return { type: 'select', id: nearest.id };
  }
  return { type: 'inspect', id: nearest.id };
}

export class InputController {
  private gestures: GestureState = createGestureState();
  private dragMode: DragMode = 'none';
  private bandStartScreen: { x: number; y: number } | null = null;
  private keysDown = new Set<string>();
  private edgePan = { x: 0, y: 0 };
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
    this.edgePan = { x: 0, y: 0 };
    this.el.style.cursor = 'default';
  }

  /** Per-frame: keyboard panning + time-based gesture transitions. */
  update(dtMs: number, now: number): void {
    let { x: dx, y: dy } = keyboardPanVector(this.keysDown);
    dx = Math.max(-1, Math.min(1, dx + this.edgePan.x));
    dy = Math.max(-1, Math.min(1, dy + this.edgePan.y));
    if (dx !== 0 || dy !== 0) {
      const speed = KEY_PAN_SPEED * getSettings().cameraSpeed;
      this.host.camera.panBy(dx * speed * dtMs, dy * speed * dtMs);
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
      // capture can throw NotFoundError if the pointer is already gone
      // (released between event dispatch and handling, or synthetic events)
      try { el.setPointerCapture?.(ev.pointerId); } catch { /* non-fatal */ }
      this.feed(toEvt(ev, 'down'));
      ev.preventDefault();
    };
    const move = (ev: PointerEvent) => {
      this.feed(toEvt(ev, 'move'));
      if (ev.pointerType === 'mouse') {
        const rect = el.getBoundingClientRect();
        const sx = ev.clientX - rect.left;
        const sy = ev.clientY - rect.top;
        if (ev.buttons === 0) this.updateHoverCursor(sx, sy);
      }
    };
    const up = (ev: PointerEvent) => {
      this.feed(toEvt(ev, 'up'));
      if (ev.pointerType === 'mouse') {
        const rect = el.getBoundingClientRect();
        this.updateHoverCursor(ev.clientX - rect.left, ev.clientY - rect.top);
      }
    };
    const cancel = (ev: PointerEvent) => this.feed(toEvt(ev, 'cancel'));
    const leave = (ev: PointerEvent) => {
      if (ev.pointerType === 'mouse') {
        el.style.cursor = 'default';
      }
    };
    // Window-level tracking deliberately survives canvas pointerleave: pushing the
    // cursor just outside any game edge should keep scrolling in that direction.
    const trackEdge = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      const insideCanvasBounds = ev.clientX >= rect.left && ev.clientX <= rect.right
        && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      // The DOM HUD sits over the Pixi canvas. Its controls are deliberately
      // pointer-active, so hovering a top-bar button near the viewport edge
      // must not be mistaken for pushing the pointer against the game edge.
      if (insideCanvasBounds && ev.target !== el) {
        this.edgePan = { x: 0, y: 0 };
        return;
      }
      this.edgePan = edgePanVector(
        ev.clientX - rect.left,
        ev.clientY - rect.top,
        rect.width,
        rect.height,
      );
    };
    const blur = () => {
      this.edgePan = { x: 0, y: 0 };
      if (this.keysDown.has('Shift')) this.host.releasePlacementModifier();
      this.keysDown.clear(); // never leave Shift/arrow repeat latched after tabbing away
    };
    const ctxmenu = (ev: Event) => ev.preventDefault();
    const wheel = (ev: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      this.host.camera.zoomStep(ev.deltaY < 0 ? 1 : -1, ev.clientX - rect.left, ev.clientY - rect.top);
      ev.preventDefault();
    };
    const keydown = (ev: KeyboardEvent) => {
      const target = ev.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (ev.key.startsWith('Arrow')) {
        this.keysDown.add(ev.key);
        ev.preventDefault();
      } else if (['w', 'a', 's', 'd'].includes(ev.key.toLowerCase())) {
        this.keysDown.add(ev.key.toLowerCase());
        ev.preventDefault();
      } else if (ev.key === 'Shift') {
        this.keysDown.add(ev.key);
      } else if (ev.key === 'Escape') {
        if (this.host.isPlacing()) this.host.cancelPlacement();
        else if (this.host.getArmedVerb() !== null) this.host.clearArmedVerb();
        else this.host.deselect();
      } else if (ev.key === 'p' || ev.key === 'P') {
        this.host.togglePause();
      } else if (ev.key === '+' || ev.key === '=') {
        this.host.camera.zoomStep(1);
      } else if (ev.key === '-') {
        this.host.camera.zoomStep(-1);
      }
    };
    const keyup = (ev: KeyboardEvent) => {
      this.keysDown.delete(ev.key);
      this.keysDown.delete(ev.key.toLowerCase());
      if (ev.key === 'Shift') this.host.releasePlacementModifier();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('contextmenu', ctxmenu);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('pointermove', trackEdge);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('contextmenu', ctxmenu);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('pointermove', trackEdge);
      window.removeEventListener('blur', blur);
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
        else if (g.ptype === 'mouse') this.handleDesktopPrimaryTap(g.x, g.y);
        else this.handleTap(g.x, g.y);
        break;
      case 'doubleTap':
        if (this.host.isPlacing()) {
          if (g.ptype === 'mouse') this.handleDesktopPrimaryTap(g.x, g.y);
          else this.handleTap(g.x, g.y);
          break;
        }
        this.handleDoubleTap(g.x, g.y, g.ptype);
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
    const sel = this.commandableSelection();
    const selCtx: TapSelection = {
      units: sel.filter((e) => e.kind === 'unit').length,
      buildings: sel.filter((e) => e.kind === 'building').length,
      villagers: sel.filter((e) => e.kind === 'unit' && e.defId === 'villager').length,
    };
    // An explicitly armed verb owns the next tap, even when normal context
    // inference would reselect the own unit under the pointer.
    if (sel.length > 0 && this.host.getArmedVerb() !== null) {
      this.contextCommand(w.x, w.y, picks, sel);
      return;
    }
    const action = resolveTapAction(picks, selCtx, this.host.humanPlayer);
    switch (action.type) {
      case 'select':
      case 'inspect':
        this.host.setSelection([action.id]);
        break;
      case 'command':
        this.contextCommand(w.x, w.y, picks, sel);
        break;
      case 'deselect':
        this.host.deselect();
        break;
      case 'none':
        break;
    }
  }

  /** Mouse-left never issues an order: select the nearest entity or clear. */
  private handleDesktopPrimaryTap(sx: number, sy: number): void {
    if (this.host.isPlacing()) {
      const w = this.host.camera.screenToWorld(sx, sy);
      this.movePlacementToWorld(w.x, w.y);
      this.host.confirmPlacement(this.keysDown.has('Shift'));
      return;
    }
    const w = this.host.camera.screenToWorld(sx, sy);
    const picks = this.pickAt(w.x, w.y);
    const selected = this.commandableSelection();
    // Command-card verbs promise "next tap", not "next right-click". Honor
    // that promise for mouse/trackpad players too; ordinary unarmed left-clicks
    // remain selection-only below.
    if (selected.length > 0 && this.host.getArmedVerb() !== null) {
      this.contextCommand(w.x, w.y, picks, selected);
      return;
    }
    const action = resolveDesktopPrimaryAction(picks, this.host.humanPlayer);
    if (action.type === 'select' || action.type === 'inspect') {
      this.host.setSelection([action.id]);
    } else if (action.type === 'deselect') {
      this.host.deselect();
    }
  }

  private updateHoverCursor(sx: number, sy: number): void {
    if (this.host.isPlacing()) {
      const w = this.host.camera.screenToWorld(sx, sy);
      this.movePlacementToWorld(w.x, w.y);
      this.el.style.cursor = 'crosshair';
      return;
    }
    if (this.host.getArmedVerb() !== null) {
      this.el.style.cursor = 'crosshair';
      return;
    }
    const w = this.host.camera.screenToWorld(sx, sy);
    const action = resolveDesktopPrimaryAction(this.pickAt(w.x, w.y), this.host.humanPlayer);
    this.el.style.cursor = action.type === 'select' || action.type === 'inspect' ? 'pointer' : 'default';
  }

  private handleDoubleTap(sx: number, sy: number, ptype: 'mouse' | 'touch' | 'pen'): void {
    const w = this.host.camera.screenToWorld(sx, sy);
    const picks = this.pickAt(w.x, w.y);
    const own = picks.find((p) => p.player === this.host.humanPlayer && p.kind === 'unit');
    if (!own) {
      // No own unit: double-tap on an own building expands to all of its type
      // on screen (GDD expand-to-type applies to buildings too).
      const ownBld = picks.find((p) => p.player === this.host.humanPlayer && p.kind === 'building');
      if (ownBld) {
        const view = this.host.camera.getWorldView();
        const all = this.host.world.buildingsOfTypeInRect(
          this.host.getState(), ownBld.defId, view.x0, view.y0, view.x1, view.y1, this.host.humanPlayer,
        );
        this.host.setSelection(all.length > 0 ? all.map((e) => e.id) : [ownBld.id]);
        this.host.showToast(`Selected all ${ownBld.defId} on screen (${Math.max(all.length, 1)})`);
        return;
      }
      if (ptype === 'mouse') this.handleDesktopPrimaryTap(sx, sy);
      else this.handleTap(sx, sy);
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
   * building > ground; villagers gather/build and military attack. Production
   * buildings set rally only after the Rally verb is armed. Every command gets
   * the ~2 s undo toast.
   */
  private contextCommand(wx: number, wy: number, picks: Entity[], sel: Entity[]): void {
    const human = this.host.humanPlayer;
    const units = sel.filter((e) => e.kind === 'unit');
    const buildings = sel.filter((e) => e.kind === 'building');
    const villagers = units.filter((e) => e.defId === 'villager');
    const military = units.filter((e) => e.defId !== 'villager');
    const st = this.host.getState();

    const enemy = enemyContextTarget(picks, human, wx, wy);
    // Gather targets include own completed farms (gatherable buildings), not just
    // map resources and food animals. This mirrors classifyGatherTarget in the sim.
    const gatherTarget = picks.find((p) => isVillagerGatherTargetAt(p, human, wx, wy));
    const ownBld = picks.find((p) => p.player === human && p.kind === 'building');
    const unitIds = units.map((e) => e.id);
    const armedVerb = this.host.getArmedVerb();
    const undoStop = unitIds.length > 0
      ? () => this.host.issue({ kind: 'stop', player: human, units: unitIds })
      : null;

    if (armedVerb === 'ability') {
      const hero = units.find((unit) => gameData.units[unit.defId]?.ability);
      if (!hero || units.length !== 1) {
        this.host.showToast('Select one hero to cast an ability');
        return;
      }
      const ability = gameData.units[hero.defId].ability!;
      const target = worldToTile(wx, wy);
      const x = Math.max(0, Math.min(st.map.width - 0.01, target.x));
      const y = Math.max(0, Math.min(st.map.height - 0.01, target.y));
      this.host.clearArmedVerb();
      this.host.issueWithUndo({
        kind: 'castAbility', player: human, unitId: hero.id, x: fp(x), y: fp(y),
      }, ability.name, null);
      return;
    }

    // Production buildings selected (and no units): Rally must be armed first.
    // This prevents an ordinary map tap/right-click from silently moving the
    // spawn destination while the player is merely trying to clear selection.
    // Undo restores each building's previous rally (or re-centers it on the
    // building itself when none was set — the sim remaps a blocked center tile
    // to the nearest walkable one, i.e. the default spawn side).
    if (units.length === 0 && buildings.length > 0) {
      if (armedVerb !== 'rally') return;
      this.host.clearArmedVerb();
      const target = enemy ?? gatherTarget;
      const prevRallies = buildings.map((b) => ({
        id: b.id,
        rally: b.rally ? { ...b.rally } : null,
        x: b.x,
        y: b.y,
      }));
      const undoRally = (): void => {
        for (const p of prevRallies) {
          this.host.issue({
            kind: 'setRally', player: human, buildingId: p.id,
            x: p.rally ? p.rally.x : p.x,
            y: p.rally ? p.rally.y : p.y,
            targetId: p.rally?.targetId,
          });
        }
      };
      const rallyCmd = (b: Entity): Command => ({
        kind: 'setRally', player: human, buildingId: b.id,
        x: target ? target.x : fp(worldToTile(wx, wy).x),
        y: target ? target.y : fp(worldToTile(wx, wy).y),
        targetId: target?.id,
      });
      for (const b of buildings.slice(0, -1)) this.host.issue(rallyCmd(b));
      this.host.issueWithUndo(rallyCmd(buildings[buildings.length - 1]), 'Rally point set', undoRally);
      return;
    }
    if (unitIds.length === 0) return;

    const armed = armedVerb === 'attackMove';
    const formation = military.length >= 3 ? this.host.getFormation() : undefined;
    this.host.clearArmedVerb();

    // Wave-2 verbs the sim would silently drop are downgraded to an HONEST move
    // toward the target — the toast confirms exactly what happened, never a no-op.
    const can = (k: Command['kind']): boolean => !PENDING_COMMAND_KINDS.has(k);
    const moveTo = (x: number, y: number, ids: EntityId[], label: string): void => {
      this.host.issueWithUndo({ kind: 'move', player: human, units: ids, x, y }, label, undoStop);
    };

    // Armed targeting verbs (garrison / convert / heal) outrank the default
    // tap inference — the player explicitly chose the verb on the card.
    if (armedVerb === 'garrison' || armedVerb === 'convert' || armedVerb === 'heal') {
      if (this.armedVerbCommand(armedVerb, picks, units, undoStop)) return;
      // no valid target under the tap: explain, then fall through to inference
    }

    if (enemy) {
      if (can('attack')) {
        this.host.issueWithUndo({ kind: 'attack', player: human, units: unitIds, targetId: enemy.id }, 'Attack', undoStop);
      } else {
        moveTo(enemy.x, enemy.y, unitIds, 'Move (attack lands in wave 2)');
      }
      return;
    }
    if (gatherTarget && villagers.length > 0) {
      if (can('gather')) {
        this.host.issueWithUndo(
          { kind: 'gather', player: human, units: villagers.map((e) => e.id), targetId: gatherTarget.id },
          'Gather', undoStop,
        );
        if (military.length > 0) {
          this.host.issue({
            kind: 'move', player: human, units: military.map((e) => e.id),
            x: gatherTarget.x, y: gatherTarget.y,
          });
        }
      } else {
        moveTo(gatherTarget.x, gatherTarget.y, unitIds, 'Move (gathering lands in wave 2)');
      }
      return;
    }
    if (gatherTarget && gatherTarget.player === GAIA
      && military.length > 0 && gatherTarget.kind === 'unit') {
      // military ordered onto a gaia animal: hunt it
      if (can('attack')) {
        this.host.issueWithUndo(
          { kind: 'attack', player: human, units: unitIds, targetId: gatherTarget.id },
          'Attack', undoStop,
        );
      } else {
        moveTo(gatherTarget.x, gatherTarget.y, unitIds, 'Move (hunting lands in wave 2)');
      }
      return;
    }
    if (ownBld && villagers.length > 0 && ((ownBld.buildProgress ?? 1000) < 1000 || ownBld.hp < ownBld.maxHp)) {
      const isFoundation = (ownBld.buildProgress ?? 1000) < 1000;
      if (can(isFoundation ? 'build' : 'repair')) {
        this.host.issueWithUndo(
          { kind: 'repair', player: human, units: villagers.map((e) => e.id), targetId: ownBld.id },
          isFoundation ? 'Build' : 'Repair', undoStop,
        );
      } else {
        moveTo(ownBld.x, ownBld.y, unitIds, `Move (${isFoundation ? 'construction' : 'repair'} lands in wave 2)`);
      }
      return;
    }
    const t = worldToTile(wx, wy);
    const clampX = Math.max(0, Math.min(st.map.width - 0.01, t.x));
    const clampY = Math.max(0, Math.min(st.map.height - 0.01, t.y));
    if (armed && military.length > 0) {
      this.host.issueWithUndo(
        { kind: 'attackMove', player: human, units: unitIds, x: fp(clampX), y: fp(clampY), formation },
        'Attack-move', undoStop,
      );
    } else {
      this.host.issueWithUndo(
        { kind: 'move', player: human, units: unitIds, x: fp(clampX), y: fp(clampY), formation },
        'Move', undoStop,
      );
    }
  }

  /**
   * Execute an armed garrison/convert/heal on the tapped target. Returns true
   * when a command was issued; false leaves the tap to default inference
   * (after a toast explaining what a valid target would be).
   */
  private armedVerbCommand(
    verb: 'garrison' | 'convert' | 'heal',
    picks: Entity[],
    units: Entity[],
    undoStop: (() => void) | null,
  ): boolean {
    const human = this.host.humanPlayer;
    if (PENDING_COMMAND_KINDS.has(verb)) return false; // defensive: button was disabled
    if (verb === 'garrison') {
      const target = picks.find((p) =>
        p.player === human && (
          (p.kind === 'building' &&
            (gameData.buildings[p.defId]?.garrisonCapacity ?? 0) > 0 &&
            (p.buildProgress ?? 1000) >= 1000) ||
          (p.kind === 'unit' && (gameData.units[p.defId]?.garrisonCapacity ?? 0) > 0)
        ));
      if (!target) {
        this.host.showToast('Tap a building with room to garrison');
        return false;
      }
      this.host.issueWithUndo(
        { kind: 'garrison', player: human, units: units.map((e) => e.id), targetId: target.id },
        'Garrison', undoStop,
      );
      return true;
    }
    if (verb === 'convert') {
      const monks = units.filter((e) => gameData.units[e.defId]?.converts).map((e) => e.id);
      const target = picks.find((p) => p.player !== human && p.player !== GAIA && p.kind !== 'resource');
      if (monks.length === 0 || !target) {
        this.host.showToast('Tap an enemy to convert');
        return false;
      }
      this.host.issueWithUndo(
        { kind: 'convert', player: human, units: monks, targetId: target.id },
        'Converting', undoStop,
      );
      return true;
    }
    // heal
    const healers = units.filter((e) => gameData.units[e.defId]?.heals).map((e) => e.id);
    const wounded = picks.find((p) => p.player === human && p.kind === 'unit' && p.hp < p.maxHp);
    if (healers.length === 0 || !wounded) {
      this.host.showToast('Tap a wounded friendly unit to heal');
      return false;
    }
    this.host.issueWithUndo(
      { kind: 'heal', player: human, units: healers, targetId: wounded.id },
      'Healing', undoStop,
    );
    return true;
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
