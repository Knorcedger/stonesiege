// Objectives model latching + the narrow-viewport auto-open policy (the
// expanded list must never bury the control-group chips under it).

import { describe, expect, it } from 'vitest';
import { autoOpenObjectives, ObjectivesModel } from './objectives';
import { CHIPS_NARROW_MAX_PX } from './layout';

describe('ObjectivesModel', () => {
  it('keeps insertion order and dedupes by id', () => {
    const m = new ObjectivesModel();
    m.add('a', 'first');
    m.add('b', 'second');
    m.add('a', 'dupe — ignored');
    expect(m.items().map((o) => o.text)).toEqual(['first', 'second']);
    expect(m.openCount).toBe(2);
  });

  it('latches complete/fail (like the trigger engine)', () => {
    const m = new ObjectivesModel();
    m.add('a', 'one');
    m.complete('a');
    m.fail('a'); // already latched complete — must not flip
    expect(m.items()[0].state).toBe('complete');
    m.add('b', 'two');
    m.fail('b');
    m.complete('b');
    expect(m.items()[1].state).toBe('failed');
    expect(m.openCount).toBe(0);
  });
});

describe('autoOpenObjectives', () => {
  it('never auto-opens on phone widths where the list covers the chips', () => {
    // measured collision: at 390×844 the open list (x150-384) sat on chips 2-4
    // (x148-292, y84-128); horizontal overlap persists up to ~706px viewports
    expect(autoOpenObjectives(390)).toBe(false);
    expect(autoOpenObjectives(480)).toBe(false);
    expect(autoOpenObjectives(700)).toBe(false);
  });

  it('auto-opens above the chip strip breakpoint, where they cannot collide', () => {
    expect(autoOpenObjectives(CHIPS_NARROW_MAX_PX)).toBe(false);
    expect(autoOpenObjectives(CHIPS_NARROW_MAX_PX + 1)).toBe(true);
    expect(autoOpenObjectives(1280)).toBe(true);
  });
});
