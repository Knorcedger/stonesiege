import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBootError } from './bootError';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly style = { cssText: '' };
  textContent = '';
  id = '';
  tabIndex = 0;
  type = '';

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  click(): void {
    this.listeners.get('click')?.();
  }

  focus(): void {
    fakeDocument.activeElement = this;
  }
}

const fakeDocument = {
  activeElement: null as FakeElement | null,
  createElement: (tagName: string) => new FakeElement(tagName),
};

function find(root: FakeElement, tagName: string): FakeElement | null {
  if (root.tagName === tagName) return root;
  for (const child of root.children) {
    const match = find(child, tagName);
    if (match) return match;
  }
  return null;
}

describe('initial boot recovery', () => {
  beforeEach(() => {
    fakeDocument.activeElement = null;
    vi.stubGlobal('document', fakeDocument);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders inert diagnostics and a focused keyboard-accessible retry', () => {
    const root = new FakeElement('div');
    const retry = vi.fn();
    const diagnostic = '<img src=x onerror="globalThis.pwned=true">';

    const panel = renderBootError(
      root as unknown as HTMLElement,
      diagnostic,
      { retry },
    ) as unknown as FakeElement;

    expect(panel.getAttribute('role')).toBe('alert');
    expect(panel.getAttribute('aria-labelledby')).toBe('stonesiege-boot-error-title');
    expect(fakeDocument.activeElement).toBe(panel);
    expect(find(root, 'img')).toBeNull();
    expect(find(root, 'pre')?.textContent).toBe(diagnostic);
    const button = find(root, 'button')!;
    expect(button.textContent).toBe('Try again');
    button.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('still offers recovery when diagnostics cannot be read', () => {
    const root = new FakeElement('div');
    const hostile = Object.create(null) as { toString?: () => string };
    hostile.toString = () => { throw new Error('no diagnostics'); };

    expect(() => renderBootError(
      root as unknown as HTMLElement, hostile, { retry: vi.fn() },
    )).not.toThrow();
    expect(find(root, 'pre')?.textContent).toBe('Technical details are unavailable.');

    const hostileError = new Error('hidden');
    Object.defineProperty(hostileError, 'stack', {
      get: () => { throw new Error('no stack'); },
    });
    expect(() => renderBootError(
      root as unknown as HTMLElement, hostileError, { retry: vi.fn() },
    )).not.toThrow();
    expect(find(root, 'pre')?.textContent).toBe('Technical details are unavailable.');
  });
});
