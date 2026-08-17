import { describe, expect, it } from 'vitest';
import { BOT_DIFFICULTIES } from './types';
import { tuningFor } from './tuning';

describe('seven-level AI difficulty ladder', () => {
  it('scales reaction speed, command capacity, and economy at every step', () => {
    expect(BOT_DIFFICULTIES).toEqual([
      'beginner', 'easy', 'standard', 'medium', 'hard', 'expert', 'hardcore',
    ]);
    const levels = BOT_DIFFICULTIES.map((difficulty) => tuningFor(difficulty, 'standard'));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].interval, `${BOT_DIFFICULTIES[i]} reaction`).toBeLessThan(levels[i - 1].interval);
      expect(levels[i].batchCap, `${BOT_DIFFICULTIES[i]} command capacity`).toBeGreaterThan(levels[i - 1].batchCap);
      expect(levels[i].villagerTarget, `${BOT_DIFFICULTIES[i]} economy`).toBeGreaterThan(levels[i - 1].villagerTarget);
    }
  });

  it('makes Hardcore a fully enabled, relentless controller', () => {
    const hardcore = tuningFor('hardcore', 'standard');
    expect(hardcore).toMatchObject({
      interval: 3,
      constantPressure: true,
      counters: 2,
      secondTc: true,
      market: true,
      monks: true,
      siege: true,
      multiFront: true,
      research: true,
    });
    expect(hardcore.waveCooldown).toBe(0);
    expect(hardcore.waveReissue).toBeLessThanOrEqual(120);
  });

  it('keeps the former Hard behavior at Medium', () => {
    expect(tuningFor('medium', 'standard')).toMatchObject({
      interval: 14,
      batchCap: 12,
      villagerTarget: 28,
      feudalVillagerTarget: 24,
      openingArmy: 4,
      attackArmy: 10,
      waveReissue: 300,
    });
  });
});
