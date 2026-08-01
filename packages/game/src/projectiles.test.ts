// Projectile visual classification (pure; consumed by fx.ts).

import { describe, expect, it } from 'vitest';
import { projectileKindFor } from './projectiles';

describe('projectileKindFor', () => {
  it('siege with area damage or packing lobs stones', () => {
    expect(projectileKindFor('mangonel')).toBe('stone');
    expect(projectileKindFor('onager')).toBe('stone');
    expect(projectileKindFor('trebuchet')).toBe('stone');
  });

  it('the crossbow line fires bolts', () => {
    expect(projectileKindFor('crossbowman')).toBe('bolt');
    expect(projectileKindFor('arbalester')).toBe('bolt');
  });

  it('archers and unique foot archers fire arrows', () => {
    expect(projectileKindFor('archer')).toBe('arrow');
    expect(projectileKindFor('longbowman')).toBe('arrow');
    expect(projectileKindFor('skirmisher')).toBe('arrow');
  });

  it('buildings (TC/towers/castle) and unknown defs default to arrows', () => {
    expect(projectileKindFor('townCenter')).toBe('arrow');
    expect(projectileKindFor('castle')).toBe('arrow');
    expect(projectileKindFor('nonexistent')).toBe('arrow');
  });
});
