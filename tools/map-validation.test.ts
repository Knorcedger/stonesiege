import { describe, expect, it } from 'vitest';
import { runPracticeMapValidationSweep } from './map-validation';

describe('Practice map validation sweep', () => {
  it('normalizes options and emits byte-stable reports', () => {
    const options = { seeds: [42, 7, 42], sizes: [96], playerCounts: [2] };
    const first = runPracticeMapValidationSweep(options);
    const second = runPracticeMapValidationSweep(options);

    expect(first.config).toEqual({ seeds: [7, 42], sizes: [96], playerCounts: [2] });
    expect(first.summary).toMatchObject({ cases: 2, validCases: 2, invalidCases: 0, errors: 0 });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('rejects unsupported player counts before generating maps', () => {
    expect(() => runPracticeMapValidationSweep({ playerCounts: [5] }))
      .toThrow('player counts must be <= 4');
  });
});
