import { describe, expect, it } from 'vitest';
import { makeMemoryStorage } from './storage';
import {
  activeArtworkMode, decodeDeveloperArtworkMode, developerToolsEnabled,
  getDeveloperArtworkMode, setDeveloperArtworkMode,
} from './developerTools';

describe('developer artwork preference', () => {
  it('recognizes only the explicit developer-tools query flag', () => {
    expect(developerToolsEnabled('?dev=1')).toBe(true);
    expect(developerToolsEnabled('?dev=0')).toBe(false);
    expect(developerToolsEnabled('?capture=citadel')).toBe(false);
  });

  it('defaults malformed or missing preferences to HD artwork', () => {
    expect(decodeDeveloperArtworkMode(null)).toBe('hd');
    expect(decodeDeveloperArtworkMode('pixel')).toBe('hd');
    expect(decodeDeveloperArtworkMode('standard')).toBe('standard');
  });

  it('persists the comparison mode but honors it only while developer tools are enabled', () => {
    const store = makeMemoryStorage();
    setDeveloperArtworkMode('standard', store);

    expect(getDeveloperArtworkMode(store)).toBe('standard');
    expect(activeArtworkMode('?dev=1', store)).toBe('standard');
    expect(activeArtworkMode('', store)).toBe('hd');
  });
});
