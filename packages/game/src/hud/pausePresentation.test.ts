import { describe, expect, it, vi } from 'vitest';
import { syncPausePresentation, type PausePresentationTarget } from './hud';

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
