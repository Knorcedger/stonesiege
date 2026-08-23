import { describe, expect, it, vi } from 'vitest';
import {
  activatePauseControl, bindActivation, PAUSE_SAVE_HINT, pauseSaveStatus, pauseTabIndexAfterKey,
  resignControlAction, syncPausePresentation, unitStatRows,
  type PausePresentationTarget,
} from './hud';

/** A control that records its listeners so a press can be replayed event by event. */
function control() {
  const listeners = new Map<string, Array<(event: { detail?: number }) => void>>();
  const target = {
    addEventListener(type: string, listener: (event: { detail?: number }) => void) {
      const forType = listeners.get(type) ?? [];
      forType.push(listener);
      listeners.set(type, forType);
    },
  };
  const fire = (type: string, event: { detail?: number } = {}): void => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  return { target, fire };
}

function target() {
  const buttonSetAttribute = vi.fn((_name: string, _value: string) => {});
  const overlaySetAttribute = vi.fn((_name: string, _value: string) => {});
  const overlayToggle = vi.fn((_token: string, _force?: boolean) => false);
  const view = {
    button: { textContent: null, setAttribute: buttonSetAttribute },
    overlay: { classList: { toggle: overlayToggle }, setAttribute: overlaySetAttribute },
  } satisfies PausePresentationTarget;
  return { view, buttonSetAttribute, overlaySetAttribute, overlayToggle };
}

describe('pause presentation', () => {
  it('describes independent campaign and practice save slots', () => {
    expect(PAUSE_SAVE_HINT).toBe(
      'StoneSiege keeps one resumable match for each campaign, plus one practice match, locally on this device. It autosaves every 15 seconds and when the app is backgrounded.',
    );
  });

  it('reports when the match was last autosaved instead of offering a manual save', () => {
    // local-component constructor: the same wall clock in any timezone
    expect(pauseSaveStatus(new Date(2026, 7, 22, 14, 32, 5)))
      .toBe('Last autosaved 22 Aug 2026, 14:32:05');
  });

  it('pads a single-digit clock so the stamp never reads 14:3:5', () => {
    expect(pauseSaveStatus(new Date(2026, 0, 3, 9, 4, 7)))
      .toBe('Last autosaved 3 Jan 2026, 09:04:07');
  });

  it('says so plainly when nothing has been stored yet', () => {
    expect(pauseSaveStatus(null)).toBe('No autosave stored on this device yet.');
  });

  it('runs the pause action on click instead of only changing the icon', () => {
    const host = { togglePause: vi.fn(), returnToTitle: vi.fn() };

    activatePauseControl(host, false);

    expect(host.togglePause).toHaveBeenCalledOnce();
    expect(host.returnToTitle).not.toHaveBeenCalled();
  });

  it('uses the same control to leave a finished match without toggling pause', () => {
    const host = { togglePause: vi.fn(), returnToTitle: vi.fn() };

    activatePauseControl(host, true);

    expect(host.returnToTitle).toHaveBeenCalledOnce();
    expect(host.togglePause).not.toHaveBeenCalled();
  });

  it('opens an accessible pause dialog immediately', () => {
    const { view, buttonSetAttribute, overlaySetAttribute, overlayToggle } = target();
    syncPausePresentation(view, false, true);

    expect(view.button.textContent).toBe('▶');
    expect(buttonSetAttribute).toHaveBeenCalledWith('aria-label', 'Resume game');
    expect(buttonSetAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
    expect(overlayToggle).toHaveBeenCalledWith('show', true);
    expect(overlaySetAttribute).toHaveBeenCalledWith('aria-hidden', 'false');
  });

  it('restores the pause control when play resumes', () => {
    const { view, buttonSetAttribute, overlaySetAttribute, overlayToggle } = target();
    syncPausePresentation(view, false, false);

    expect(view.button.textContent).toBe('II');
    expect(buttonSetAttribute).toHaveBeenCalledWith('aria-label', 'Pause game');
    expect(buttonSetAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
    expect(overlayToggle).toHaveBeenCalledWith('show', false);
    expect(overlaySetAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
  });
});

describe('destructive pause-menu actions', () => {
  it('requires two resign activations and keeps finished-match exit separate', () => {
    expect(resignControlAction(false, false)).toBe('arm');
    expect(resignControlAction(false, true)).toBe('resign');
    expect(resignControlAction(true, false)).toBe('returnToTitle');
    expect(resignControlAction(true, true)).toBe('returnToTitle');
  });
});

describe('pause-menu tab navigation', () => {
  it('moves between sections and wraps at both ends', () => {
    expect(pauseTabIndexAfterKey(0, 'ArrowRight')).toBe(1);
    expect(pauseTabIndexAfterKey(2, 'ArrowRight')).toBe(0);
    expect(pauseTabIndexAfterKey(0, 'ArrowLeft')).toBe(2);
    expect(pauseTabIndexAfterKey(1, 'ArrowLeft')).toBe(0);
  });

  it('supports Home and End without intercepting unrelated keys', () => {
    expect(pauseTabIndexAfterKey(1, 'Home')).toBe(0);
    expect(pauseTabIndexAfterKey(1, 'End')).toBe(2);
    expect(pauseTabIndexAfterKey(1, 'Enter')).toBe(1);
  });
});

describe('selected unit stat education', () => {
  it('spells out LOS and ROF and explains what both values mean', () => {
    const rows = unitStatRows({
      attack: 3,
      meleeArmor: 0,
      pierceArmor: 1,
      range: 0,
      speed: 0.8,
      los: 4,
      rofSeconds: 2,
    });

    expect(rows.map(({ label }) => label)).toEqual([
      'Attack', 'Armor', 'Range', 'Speed', 'Line of Sight', 'Rate of Fire',
    ]);
    expect(rows.find(({ label }) => label === 'Line of Sight')?.explanation).toContain('see through fog');
    expect(rows.find(({ label }) => label === 'Rate of Fire')?.explanation).toContain('Lower is faster');
    expect(rows.some(({ label }) => label === 'LOS' || label === 'ROF')).toBe(false);
  });
});

describe('HUD control activation', () => {
  it('activates on pointerup, because a click may never be synthesized', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerdown');
    fire('pointerup');

    expect(run).toHaveBeenCalledOnce();
  });

  it('activates exactly once when the click does arrive after the pointer press', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerdown');
    fire('pointerup');
    fire('click', { detail: 1 });   // the browser's synthesized click

    expect(run).toHaveBeenCalledOnce();
  });

  it('still activates from the keyboard, which clicks with no pointer behind it', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('click', { detail: 0 });

    expect(run).toHaveBeenCalledOnce();
  });

  it('ignores a pointerup that did not start on the control', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerup');

    expect(run).not.toHaveBeenCalled();
  });

  it('keeps press-then-drag-away as a cancel', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerdown');
    fire('pointerleave');
    fire('pointerup');

    expect(run).not.toHaveBeenCalled();
  });

  it('drops the press when the pointer is cancelled', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerdown');
    fire('pointercancel');
    fire('pointerup');

    expect(run).not.toHaveBeenCalled();
  });

  it('does not let one press arm a second activation', () => {
    const { target, fire } = control();
    const run = vi.fn();
    bindActivation(target, run);

    fire('pointerdown');
    fire('pointerup');
    fire('pointerup');

    expect(run).toHaveBeenCalledOnce();
  });
});
