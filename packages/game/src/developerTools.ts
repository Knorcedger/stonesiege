// Developer-only preferences exposed when the app URL includes ?dev=1.
// These are deliberately separate from player settings: removing the query
// flag always restores the shipping HD-first artwork path.

import { appStorage, type KeyValueStorage } from './storage';

export type ArtworkMode = 'hd' | 'standard';

const ARTWORK_MODE_KEY = 'bf.dev.artwork.v1';

export function developerToolsEnabled(search?: string): boolean {
  const query = search ?? (typeof window === 'undefined' ? '' : window.location.search);
  return new URLSearchParams(query).get('dev') === '1';
}

export function decodeDeveloperArtworkMode(raw: string | null): ArtworkMode {
  return raw === 'standard' ? 'standard' : 'hd';
}

export function getDeveloperArtworkMode(store: KeyValueStorage = appStorage): ArtworkMode {
  return decodeDeveloperArtworkMode(store.get(ARTWORK_MODE_KEY));
}

export function setDeveloperArtworkMode(
  mode: ArtworkMode,
  store: KeyValueStorage = appStorage,
): void {
  store.set(ARTWORK_MODE_KEY, mode);
}

/** The shipping path stays HD-first unless the developer tools are explicitly enabled. */
export function activeArtworkMode(
  search?: string,
  store: KeyValueStorage = appStorage,
): ArtworkMode {
  return developerToolsEnabled(search) ? getDeveloperArtworkMode(store) : 'hd';
}

/** Add the artwork comparison control to the menu's ?dev=1 settings section. */
export function buildDeveloperTools(container: HTMLElement): void {
  const section = document.createElement('section');
  section.className = 'bf-set-devtools';

  const heading = document.createElement('div');
  heading.className = 'bf-set-devtitle';
  heading.textContent = 'DEVELOPER TOOLS';
  section.appendChild(heading);

  const label = document.createElement('div');
  label.className = 'bf-set-label';
  label.textContent = 'BATTLEFIELD ARTWORK';
  section.appendChild(label);

  const modes: Array<{ id: ArtworkMode; label: string }> = [
    { id: 'hd', label: 'HD' },
    { id: 'standard', label: 'Pixel source' },
  ];
  const segmented = document.createElement('div');
  segmented.className = 'bf-set-seg';
  const buttons: HTMLButtonElement[] = [];
  for (const mode of modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = mode.label;
    const selected = getDeveloperArtworkMode() === mode.id;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      setDeveloperArtworkMode(mode.id);
      buttons.forEach((candidate, index) => {
        const active = modes[index]?.id === mode.id;
        candidate.classList.toggle('on', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
    });
    buttons.push(button);
    segmented.appendChild(button);
  }
  section.appendChild(segmented);

  const hint = document.createElement('div');
  hint.className = 'bf-set-hint';
  hint.textContent = 'Comparison only. Applies when the next match loads; failed HD packs still fall back automatically.';
  section.appendChild(hint);
  container.appendChild(section);
}
