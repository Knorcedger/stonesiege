import { describe, expect, it, vi } from 'vitest';
import {
  artworkLoadingStage, discardControlAction, freshStartFailureStage,
  syncLoadingPresentation, withTimeout, type LoadingPresentationTarget,
} from './loadingScreen';

function target() {
  const attributes = new Map<string, string>();
  const progressAttributes = new Map<string, string>();
  const view = {
    screen: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
    title: { textContent: null },
    status: { textContent: null },
    detail: { textContent: null },
    progress: {
      classList: { toggle: vi.fn((_token: string, force?: boolean) => force ?? false) },
      setAttribute: (name: string, value: string) => progressAttributes.set(name, value),
      removeAttribute: (name: string) => void progressAttributes.delete(name),
    },
    fill: { style: { width: '' } },
    value: { textContent: null },
  } satisfies LoadingPresentationTarget;
  return { view, attributes, progressAttributes };
}

describe('match loading presentation', () => {
  it('reports exact artwork-pack progress instead of fabricated activity', () => {
    expect(artworkLoadingStage({ completed: 12, total: 42, fallback: 0 }, false)).toEqual({
      title: 'Mustering the banners',
      status: 'Loading battlefield artwork…',
      detail: '12 of 42 artwork packs checked',
      progress: 12 / 42,
    });
    expect(artworkLoadingStage({ completed: 42, total: 42, fallback: 2 }, true)).toEqual({
      title: 'Restoring saved match',
      status: 'Loading battlefield artwork…',
      detail: '42 of 42 artwork packs checked · 2 packs could not be loaded',
      progress: 1,
    });
  });

  it('shows honest indeterminate activity when totals are unavailable', () => {
    const { view, attributes, progressAttributes } = target();
    syncLoadingPresentation(view, {
      title: 'Mustering the banners', status: 'Loading battlefield artwork…',
      detail: 'This can take longer on the first visit.', progress: null,
    });

    expect(attributes.get('aria-busy')).toBe('true');
    expect(view.progress.classList.toggle).toHaveBeenCalledWith('indeterminate', true);
    expect(progressAttributes.has('aria-valuenow')).toBe(false);
    expect(progressAttributes.get('aria-valuetext')).toContain('in progress');
    expect(view.value.textContent).toBe('');
  });

  it('clamps and announces measured replay progress', () => {
    const { view, progressAttributes } = target();
    syncLoadingPresentation(view, {
      title: 'Restoring saved match', status: 'Replaying battle history…',
      detail: '8:24 of 10:30 restored', progress: 0.8,
    });

    expect(view.progress.classList.toggle).toHaveBeenCalledWith('indeterminate', false);
    expect(progressAttributes.get('aria-valuenow')).toBe('80');
    expect(progressAttributes.get('aria-valuetext')).toContain('80%');
    expect(view.fill.style.width).toBe('80%');
    expect(view.value.textContent).toBe('80%');
  });

  it('requires confirmation before discarding the saved match', () => {
    expect(discardControlAction(false)).toBe('arm');
    expect(discardControlAction(true)).toBe('discard');
  });

  it('describes a fresh-start failure without claiming a save restore failed', () => {
    expect(freshStartFailureStage('Drawing the battlefield took too long.')).toEqual({
      title: 'Battlefield could not be prepared',
      status: 'The match has not started.',
      detail: 'Drawing the battlefield took too long.',
    });
  });
});

describe('startup phase timeout', () => {
  it('rejects a startup phase that never settles', async () => {
    vi.useFakeTimers();
    try {
      const timed = withTimeout(new Promise<void>(() => undefined), 1000, 'phase timed out');
      const rejection = expect(timed).rejects.toThrow('phase timed out');
      await vi.advanceTimersByTimeAsync(1000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
