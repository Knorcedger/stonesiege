import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import { extendedTooltip, techExtendedTip, unitExtendedTip } from './helpText';

describe('extended help tooltips', () => {
  it('explains Wheelbarrow in exact, practical terms', () => {
    const tip = techExtendedTip(gameData.techs.wheelbarrow);
    expect(tip).toContain('movement speed +10%');
    expect(tip).toContain('carry capacity +25%');
    expect(tip).toContain('fewer drop-off trips');
  });

  it('teaches the spearman cavalry counter', () => {
    expect(unitExtendedTip(gameData.units.spearman)).toContain('Good against: Cavalry');
  });

  it('can remove only the extended section', () => {
    expect(extendedTooltip('Wheelbarrow', 'Effect: useful', false)).toBe('Wheelbarrow');
    expect(extendedTooltip('Wheelbarrow', 'Effect: useful', true)).toContain('Effect: useful');
  });
});
