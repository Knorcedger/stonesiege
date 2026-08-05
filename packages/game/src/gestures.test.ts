import { describe, expect, it } from 'vitest';
import {
  createGestureState, flushGestures, stepGesture,
  DEFAULT_GESTURE_CONFIG as CFG,
  type Gesture, type GestureState, type PointerEvt,
} from './gestures';

function run(state: GestureState, evts: PointerEvt[]): Gesture[] {
  const out: Gesture[] = [];
  for (const e of evts) out.push(...stepGesture(state, e));
  return out;
}

const touch = (type: PointerEvt['type'], id: number, x: number, y: number, t: number): PointerEvt =>
  ({ type, id, x, y, t, ptype: 'touch' });
const mouse = (type: PointerEvt['type'], id: number, x: number, y: number, t: number, button = 0): PointerEvt =>
  ({ type, id, x, y, t, button, ptype: 'mouse' });

describe('tap / double tap', () => {
  it('emits tap on quick press+release within slop', () => {
    const s = createGestureState();
    const out = run(s, [touch('down', 1, 100, 100, 0), touch('up', 1, 103, 102, 120)]);
    expect(out).toEqual([{ kind: 'tap', x: 103, y: 102, button: 0, ptype: 'touch' }]);
  });

  it('second tap within window and slop becomes doubleTap', () => {
    const s = createGestureState();
    run(s, [touch('down', 1, 100, 100, 0), touch('up', 1, 100, 100, 100)]);
    const out = run(s, [touch('down', 1, 105, 103, 200), touch('up', 1, 105, 103, 280)]);
    expect(out[0].kind).toBe('doubleTap');
  });

  it('slow second tap stays a tap', () => {
    const s = createGestureState();
    run(s, [touch('down', 1, 100, 100, 0), touch('up', 1, 100, 100, 100)]);
    const out = run(s, [
      touch('down', 1, 100, 100, 100 + CFG.doubleTapMs + 50),
      touch('up', 1, 100, 100, 200 + CFG.doubleTapMs + 50),
    ]);
    expect(out[0].kind).toBe('tap');
  });
});

describe('long press: band select vs alternate menu (GDD)', () => {
  it('press held past threshold emits longPress via flush', () => {
    const s = createGestureState();
    run(s, [touch('down', 1, 50, 50, 0)]);
    expect(flushGestures(s, CFG.longPressMs - 10)).toEqual([]);
    const out = flushGestures(s, CFG.longPressMs + 10);
    expect(out).toEqual([{ kind: 'longPress', x: 50, y: 50, ptype: 'touch' }]);
  });

  it('long-press then drag = band select', () => {
    const s = createGestureState();
    run(s, [touch('down', 1, 50, 50, 0)]);
    flushGestures(s, CFG.longPressMs + 10);
    const out = run(s, [
      touch('move', 1, 90, 90, CFG.longPressMs + 50),
      touch('move', 1, 120, 100, CFG.longPressMs + 80),
      touch('up', 1, 130, 110, CFG.longPressMs + 120),
    ]);
    expect(out.map((g) => g.kind)).toEqual(['bandStart', 'bandMove', 'bandEnd']);
    const end = out[2] as Extract<Gesture, { kind: 'bandEnd' }>;
    expect(end).toMatchObject({ x0: 50, y0: 50, x: 130, y: 110 });
  });

  it('long-press released in place = longPressRelease (alt command menu)', () => {
    const s = createGestureState();
    run(s, [touch('down', 1, 50, 50, 0)]);
    flushGestures(s, CFG.longPressMs + 10);
    const out = run(s, [touch('up', 1, 52, 51, CFG.longPressMs + 100)]);
    expect(out).toEqual([{ kind: 'longPressRelease', x: 52, y: 51 }]);
  });
});

describe('one-finger drag (pan on touch)', () => {
  it('movement past slop before the long press emits drag gestures', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 10, 10, 0),
      touch('move', 1, 40, 10, 40),
      touch('move', 1, 60, 20, 80),
      touch('up', 1, 70, 25, 120),
    ]);
    expect(out.map((g) => g.kind)).toEqual(['dragStart', 'dragMove', 'dragMove', 'dragEnd']);
    // it never long-presses after the drag started
    expect(flushGestures(s, 10000)).toEqual([]);
  });
});

describe('two fingers: pan ALWAYS, pinch, two-finger tap', () => {
  it('two-finger midpoint movement emits twoFingerPan', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 100, 100, 0),
      touch('down', 2, 200, 100, 20),
      touch('move', 1, 110, 120, 60),
      touch('move', 2, 210, 120, 60),
    ]);
    const pans = out.filter((g) => g.kind === 'twoFingerPan') as Array<Extract<Gesture, { kind: 'twoFingerPan' }>>;
    expect(pans.length).toBeGreaterThan(0);
    const total = pans.reduce((acc, g) => ({ dx: acc.dx + g.dx, dy: acc.dy + g.dy }), { dx: 0, dy: 0 });
    expect(total.dx).toBeCloseTo(10);
    expect(total.dy).toBeCloseTo(20);
  });

  it('spreading fingers emits pinch factors > 1', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 100, 100, 0),
      touch('down', 2, 140, 100, 10),
      touch('move', 1, 80, 100, 50),
      touch('move', 2, 160, 100, 55),
    ]);
    const pinches = out.filter((g) => g.kind === 'pinch') as Array<Extract<Gesture, { kind: 'pinch' }>>;
    expect(pinches.length).toBeGreaterThan(0);
    const factor = pinches.reduce((f, g) => f * g.factor, 1);
    expect(factor).toBeCloseTo(2, 5); // 40px -> 80px apart
  });

  it('quick still two-finger tap emits twoFingerTap (deselect)', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 100, 100, 0),
      touch('down', 2, 140, 100, 20),
      touch('up', 1, 100, 100, 120),
      touch('up', 2, 140, 100, 130),
    ]);
    expect(out.filter((g) => g.kind === 'twoFingerTap')).toHaveLength(1);
  });

  it('second finger landing cancels a pending tap (no tap on release)', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 100, 100, 0),
      touch('down', 2, 140, 100, 20),
      touch('move', 1, 130, 140, 60),
      touch('move', 2, 170, 140, 65),
      touch('up', 1, 130, 140, 400),
      touch('up', 2, 170, 140, 410),
    ]);
    expect(out.filter((g) => g.kind === 'tap')).toHaveLength(0);
    expect(out.filter((g) => g.kind === 'twoFingerTap')).toHaveLength(0); // it moved
  });

  it('the finger remaining after a two-finger lift is ignored (no gesture tail)', () => {
    const s = createGestureState();
    const out = run(s, [
      touch('down', 1, 100, 100, 0),
      touch('down', 2, 140, 100, 20),
      touch('up', 2, 140, 100, 500), // slow: not a two-finger tap
      touch('move', 1, 300, 300, 550),
      touch('up', 1, 300, 300, 600),
    ]);
    expect(out.filter((g) => ['tap', 'dragStart', 'bandStart'].includes(g.kind))).toHaveLength(0);
  });
});

describe('mouse buttons', () => {
  it('carries the button through tap (right-click context command)', () => {
    const s = createGestureState();
    const out = run(s, [mouse('down', 1, 10, 10, 0, 2), mouse('up', 1, 10, 10, 80)]);
    expect(out).toEqual([{ kind: 'tap', x: 10, y: 10, button: 2, ptype: 'mouse' }]);
  });

  it('never collapses rapid right-click move orders into a selection double-click', () => {
    const s = createGestureState();
    const out: Gesture[] = [];
    for (let i = 0; i < 20; i++) {
      out.push(...run(s, [
        mouse('down', 1, 100 + (i % 3), 100, i * 90, 2),
        mouse('up', 1, 100 + (i % 3), 100, i * 90 + 30, 2),
      ]));
    }
    expect(out).toHaveLength(20);
    expect(out.every((g) => g.kind === 'tap' && g.button === 2)).toBe(true);
    expect(out.some((g) => g.kind === 'doubleTap')).toBe(false);
  });

  it('carries button + ptype through drag (left-drag band select on desktop)', () => {
    const s = createGestureState();
    const out = run(s, [
      mouse('down', 1, 10, 10, 0, 0),
      mouse('move', 1, 60, 60, 50),
    ]);
    expect(out[0]).toMatchObject({ kind: 'dragStart', button: 0, ptype: 'mouse' });
  });

  it('cancel does not emit a tap', () => {
    const s = createGestureState();
    const out = run(s, [touch('down', 1, 10, 10, 0), touch('cancel', 1, 10, 10, 50)]);
    expect(out).toEqual([]);
  });
});
