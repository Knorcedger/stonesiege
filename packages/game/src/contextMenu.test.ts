import { describe, expect, it } from 'vitest';
import { installContextMenuBlocker } from './contextMenu';

describe('installContextMenuBlocker', () => {
  it('prevents the browser context menu until disposed', () => {
    const root = new EventTarget();
    const dispose = installContextMenuBlocker(root);
    const blocked = new Event('contextmenu', { cancelable: true });

    expect(root.dispatchEvent(blocked)).toBe(false);
    expect(blocked.defaultPrevented).toBe(true);

    dispose();
    const restored = new Event('contextmenu', { cancelable: true });
    expect(root.dispatchEvent(restored)).toBe(true);
    expect(restored.defaultPrevented).toBe(false);
  });
});
