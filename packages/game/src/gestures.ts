// Touch/mouse gesture recognition per the GDD Mobile UX section, as a pure
// reducer (DOM-free, unit-tested with synthetic pointer events).
//
// Recognized gestures:
//   tap                 — quick press+release within slop (select / context command)
//   doubleTap           — second tap on ~same spot within the double-tap window
//   longPress           — press held in place past the threshold (band-select arm / alt menu)
//   longPressRelease    — long press released WITHOUT dragging (alternate command menu)
//   band*               — long-press then drag (band select box)
//   drag*               — one-pointer drag without prior long press (pan on touch, band on mouse-left)
//   twoFingerPan        — two-pointer midpoint movement (ALWAYS pans per GDD)
//   pinch               — two-pointer distance ratio (zoom steps)
//   twoFingerTap        — quick two-finger tap (deselect)

export type PointerKind = 'mouse' | 'touch' | 'pen';

export interface PointerEvt {
  type: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  x: number;
  y: number;
  t: number; // ms timestamp
  button?: number; // 0 left, 1 middle, 2 right (mouse)
  ptype?: PointerKind;
}

export type Gesture =
  | { kind: 'tap'; x: number; y: number; button: number; ptype: PointerKind }
  | { kind: 'doubleTap'; x: number; y: number; ptype: PointerKind }
  | { kind: 'longPress'; x: number; y: number; ptype: PointerKind }
  | { kind: 'longPressRelease'; x: number; y: number }
  | { kind: 'bandStart'; x0: number; y0: number; x: number; y: number }
  | { kind: 'bandMove'; x0: number; y0: number; x: number; y: number }
  | { kind: 'bandEnd'; x0: number; y0: number; x: number; y: number }
  | { kind: 'dragStart'; x0: number; y0: number; x: number; y: number; button: number; ptype: PointerKind }
  | { kind: 'dragMove'; x: number; y: number; dx: number; dy: number; vx: number; vy: number; button: number; ptype: PointerKind }
  | { kind: 'dragEnd'; x: number; y: number; vx: number; vy: number; button: number; ptype: PointerKind }
  | { kind: 'twoFingerPan'; dx: number; dy: number }
  | { kind: 'pinch'; factor: number; cx: number; cy: number }
  | { kind: 'twoFingerTap' };

export interface GestureConfig {
  tapSlop: number;
  longPressMs: number;
  doubleTapMs: number;
  doubleTapSlop: number;
  twoFingerTapMs: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  tapSlop: 12,
  longPressMs: 380,
  doubleTapMs: 320,
  doubleTapSlop: 28,
  twoFingerTapMs: 260,
};

interface TrackedPointer {
  id: number;
  x0: number; y0: number;
  x: number; y: number;
  px: number; py: number; // previous position (for deltas)
  t0: number;
  lastT: number;
  vx: number; vy: number; // smoothed velocity px/ms
  button: number;
  ptype: PointerKind;
}

type Phase = 'idle' | 'press' | 'drag' | 'longpress' | 'band' | 'multi' | 'ignore';

export interface GestureState {
  phase: Phase;
  pointers: Map<number, TrackedPointer>;
  lastTap: { x: number; y: number; t: number } | null;
  multiT0: number;
  multiMoved: boolean;
  lastMid: { x: number; y: number } | null;
  lastDist: number;
}

export function createGestureState(): GestureState {
  return {
    phase: 'idle',
    pointers: new Map(),
    lastTap: null,
    multiT0: 0,
    multiMoved: false,
    lastMid: null,
    lastDist: 0,
  };
}

function firstTwo(state: GestureState): [TrackedPointer, TrackedPointer] | null {
  const it = state.pointers.values();
  const a = it.next();
  const b = it.next();
  if (a.done || b.done) return null;
  return [a.value, b.value];
}

function primary(state: GestureState): TrackedPointer | null {
  const it = state.pointers.values().next();
  return it.done ? null : it.value;
}

/**
 * Call every frame (rAF): fires time-based transitions (long press).
 * Returns gestures emitted by the passage of time.
 */
export function flushGestures(state: GestureState, now: number, cfg: GestureConfig = DEFAULT_GESTURE_CONFIG): Gesture[] {
  if (state.phase !== 'press') return [];
  const p = primary(state);
  if (!p) return [];
  if (now - p.t0 >= cfg.longPressMs) {
    state.phase = 'longpress';
    return [{ kind: 'longPress', x: p.x, y: p.y, ptype: p.ptype }];
  }
  return [];
}

/** Feed one pointer event; mutates state and returns emitted gestures. */
export function stepGesture(state: GestureState, evt: PointerEvt, cfg: GestureConfig = DEFAULT_GESTURE_CONFIG): Gesture[] {
  const out: Gesture[] = [];
  switch (evt.type) {
    case 'down': {
      const p: TrackedPointer = {
        id: evt.id,
        x0: evt.x, y0: evt.y, x: evt.x, y: evt.y, px: evt.x, py: evt.y,
        t0: evt.t, lastT: evt.t, vx: 0, vy: 0,
        button: evt.button ?? 0,
        ptype: evt.ptype ?? 'touch',
      };
      state.pointers.set(evt.id, p);
      const n = state.pointers.size;
      if (n === 1) {
        if (state.phase === 'idle') state.phase = 'press';
      } else if (n === 2) {
        // Second finger: abandon any single-pointer interpretation.
        if (state.phase === 'band') {
          const pr = primary(state)!;
          out.push({ kind: 'bandEnd', x0: pr.x0, y0: pr.y0, x: pr.x, y: pr.y });
        } else if (state.phase === 'drag') {
          const pr = primary(state)!;
          out.push({ kind: 'dragEnd', x: pr.x, y: pr.y, vx: 0, vy: 0, button: pr.button, ptype: pr.ptype });
        }
        state.phase = 'multi';
        state.multiT0 = evt.t;
        state.multiMoved = false;
        const pair = firstTwo(state)!;
        state.lastMid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
        state.lastDist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
      }
      // 3+ pointers: stay in multi (first two drive it).
      return out;
    }

    case 'move': {
      const p = state.pointers.get(evt.id);
      if (!p) return out;
      const dt = Math.max(1, evt.t - p.lastT);
      const dx = evt.x - p.x;
      const dy = evt.y - p.y;
      p.px = p.x; p.py = p.y;
      p.x = evt.x; p.y = evt.y;
      // Smoothed velocity for fling inertia.
      const inst = { x: dx / dt, y: dy / dt };
      p.vx = p.vx * 0.7 + inst.x * 0.3;
      p.vy = p.vy * 0.7 + inst.y * 0.3;
      p.lastT = evt.t;

      if (state.phase === 'press') {
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > cfg.tapSlop) {
          state.phase = 'drag';
          out.push({ kind: 'dragStart', x0: p.x0, y0: p.y0, x: p.x, y: p.y, button: p.button, ptype: p.ptype });
          out.push({ kind: 'dragMove', x: p.x, y: p.y, dx: p.x - p.x0, dy: p.y - p.y0, vx: p.vx, vy: p.vy, button: p.button, ptype: p.ptype });
        }
      } else if (state.phase === 'drag') {
        out.push({ kind: 'dragMove', x: p.x, y: p.y, dx, dy, vx: p.vx, vy: p.vy, button: p.button, ptype: p.ptype });
      } else if (state.phase === 'longpress') {
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > cfg.tapSlop) {
          state.phase = 'band';
          out.push({ kind: 'bandStart', x0: p.x0, y0: p.y0, x: p.x, y: p.y });
        }
      } else if (state.phase === 'band') {
        out.push({ kind: 'bandMove', x0: p.x0, y0: p.y0, x: p.x, y: p.y });
      } else if (state.phase === 'multi') {
        const pair = firstTwo(state);
        if (pair && state.lastMid) {
          const mid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
          const dist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
          const mdx = mid.x - state.lastMid.x;
          const mdy = mid.y - state.lastMid.y;
          if (Math.hypot(mid.x - state.lastMid.x, mid.y - state.lastMid.y) > 0 || Math.abs(dist - state.lastDist) > 0) {
            if (Math.abs(mdx) + Math.abs(mdy) > 2) state.multiMoved = true;
            if (mdx !== 0 || mdy !== 0) out.push({ kind: 'twoFingerPan', dx: mdx, dy: mdy });
            if (state.lastDist > 8 && dist > 8) {
              const factor = dist / state.lastDist;
              if (factor !== 1) out.push({ kind: 'pinch', factor, cx: mid.x, cy: mid.y });
              if (Math.abs(factor - 1) > 0.02) state.multiMoved = true;
            }
            state.lastMid = mid;
            state.lastDist = dist;
          }
        }
      }
      return out;
    }

    case 'up':
    case 'cancel': {
      const p = state.pointers.get(evt.id);
      if (!p) return out;
      p.x = evt.x; // the release event carries the final position
      p.y = evt.y;
      const isCancel = evt.type === 'cancel';
      const wasPhase = state.phase;
      state.pointers.delete(evt.id);

      if (wasPhase === 'press' && !isCancel) {
        // Tap (or double tap).
        const lt = state.lastTap;
        if (lt && evt.t - lt.t <= cfg.doubleTapMs && Math.hypot(p.x - lt.x, p.y - lt.y) <= cfg.doubleTapSlop) {
          out.push({ kind: 'doubleTap', x: p.x, y: p.y, ptype: p.ptype });
          state.lastTap = null;
        } else {
          out.push({ kind: 'tap', x: p.x, y: p.y, button: p.button, ptype: p.ptype });
          state.lastTap = { x: p.x, y: p.y, t: evt.t };
        }
        state.phase = 'idle';
      } else if (wasPhase === 'drag') {
        out.push({ kind: 'dragEnd', x: p.x, y: p.y, vx: isCancel ? 0 : p.vx, vy: isCancel ? 0 : p.vy, button: p.button, ptype: p.ptype });
        state.phase = 'idle';
      } else if (wasPhase === 'longpress') {
        if (!isCancel) out.push({ kind: 'longPressRelease', x: p.x, y: p.y });
        state.phase = 'idle';
      } else if (wasPhase === 'band') {
        out.push({ kind: 'bandEnd', x0: p.x0, y0: p.y0, x: p.x, y: p.y });
        state.phase = 'idle';
      } else if (wasPhase === 'multi') {
        if (
          !isCancel &&
          !state.multiMoved &&
          evt.t - state.multiT0 <= cfg.twoFingerTapMs &&
          state.pointers.size <= 1
        ) {
          out.push({ kind: 'twoFingerTap' });
        }
        // Remaining finger must not morph into another gesture.
        state.phase = state.pointers.size === 0 ? 'idle' : 'ignore';
        state.lastMid = null;
      } else if (wasPhase === 'ignore') {
        if (state.pointers.size === 0) state.phase = 'idle';
      } else if (state.pointers.size === 0) {
        state.phase = 'idle';
      }
      return out;
    }
  }
}
