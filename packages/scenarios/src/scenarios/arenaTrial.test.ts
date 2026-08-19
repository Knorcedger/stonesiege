import { describe, expect, it } from 'vitest';
import { loadScenario } from '../loader';
import { grandConquests, scenariosById } from '../campaign';
import { arenaTrial } from './arenaTrial';

describe('Trial of Banners Grand Conquest', () => {
  it('is indexed separately from historical campaigns and loads into the sim', () => {
    expect(grandConquests['grand-conquests-arena'].scenarioIds).toEqual([arenaTrial.id]);
    expect(scenariosById[arenaTrial.id]).toBe(arenaTrial);

    const loaded = loadScenario(arenaTrial);
    expect(loaded.start.map.width).toBe(56);
    expect(loaded.meta.players).toHaveLength(3);
    expect(loaded.start.entities.some((entity) => entity.defId === 'arenaWarden')).toBe(true);
  });

  it('defines recurring mirrored waves plus core victory and defeat conditions', () => {
    const wave = arenaTrial.triggers.find((trigger) => trigger.id === 'arena_waves');
    expect(wave?.loop).toBe(true);
    const spawn = wave?.effects.find((effect) => effect.kind === 'spawn');
    expect(spawn?.kind).toBe('spawn');
    if (spawn?.kind !== 'spawn') return;
    expect(spawn.entities.filter((entity) => entity.player === 2)).toHaveLength(3);
    expect(spawn.entities.filter((entity) => entity.player === 3)).toHaveLength(3);
    expect(arenaTrial.triggers.some((trigger) =>
      trigger.conditions.some((condition) =>
        condition.kind === 'refDestroyed' && condition.ref === 'ashen_core'))).toBe(true);
    expect(arenaTrial.triggers.some((trigger) =>
      trigger.conditions.some((condition) =>
        condition.kind === 'refDestroyed' && condition.ref === 'banner_core'))).toBe(true);
  });
});

