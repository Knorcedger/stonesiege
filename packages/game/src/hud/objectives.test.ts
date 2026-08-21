// Objectives model latching + the narrow-viewport auto-open policy (the
// expanded list must never bury the control-group chips under it).

import { describe, expect, it } from 'vitest';
import {
  autoOpenObjectives, objectiveDisplayState, objectiveMarkerPlacement, objectiveProgressDue,
  objectiveProgressSummary, objectiveSequencePosition, ObjectivesModel,
} from './objectives';
import { HUD_NARROW_MAX_PX } from './layout';

const progress = (id: string, have: number) => ({
  id,
  goals: [{ label: 'At target', have, need: 1, done: have >= 1 }],
});

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

  it('advances the current objective while preserving sequence position', () => {
    const m = new ObjectivesModel();
    m.add('a', 'first');
    m.add('b', 'second');
    m.add('c', 'third');
    expect(m.current?.id).toBe('a');
    expect(m.currentPosition).toBe(1);
    m.complete('a');
    expect(m.current?.id).toBe('b');
    expect(m.currentPosition).toBe(2);
    m.fail('b');
    expect(m.current?.id).toBe('c');
    expect(m.currentPosition).toBe(3);
  });

  it('distinguishes current and queued open objectives', () => {
    const m = new ObjectivesModel();
    m.add('a', 'first');
    m.add('b', 'second');
    expect(objectiveDisplayState(m.items()[0], m.current?.id)).toBe('current');
    expect(objectiveDisplayState(m.items()[1], m.current?.id)).toBe('upcoming');
  });

  it('reports position in the complete authored sequence without revealing future text', () => {
    const m = new ObjectivesModel();
    m.add('a', 'first');
    expect(objectiveSequencePosition('a', m.items(), ['a', 'b', 'c'])).toEqual({ position: 1, total: 3 });
    m.complete('a');
    m.add('b', 'second');
    expect(objectiveSequencePosition('b', m.items(), ['a', 'b', 'c'])).toEqual({ position: 2, total: 3 });
    expect(m.items().map((objective) => objective.text)).toEqual(['first', 'second']);
  });

  it('freezes completed progress so leaving a completed area cannot regress it', () => {
    const m = new ObjectivesModel();
    m.add('a', 'reach the target');
    m.setReadout(progress('a', 0));
    m.complete('a');
    expect(m.items()[0].readout?.goals[0]).toMatchObject({ have: 1, need: 1, done: true });
    m.setReadout(progress('a', 0));
    expect(m.items()[0].readout?.goals[0]).toMatchObject({ have: 1, need: 1, done: true });
  });

  it('formats current progress for the always-visible collapsed header', () => {
    const m = new ObjectivesModel();
    m.add('food', 'Stockpile 150 food');
    m.setReadout({
      id: 'food',
      goals: [
        { label: 'Food', have: 92, need: 150, done: false },
        { label: 'Houses', have: 1, need: 2, done: false },
      ],
    });
    expect(objectiveProgressSummary(m.current)).toBe('Food 92/150 · Houses 1/2');
    expect(objectiveProgressSummary()).toBe('');
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
    expect(autoOpenObjectives(HUD_NARROW_MAX_PX)).toBe(false);
    expect(autoOpenObjectives(HUD_NARROW_MAX_PX + 1)).toBe(true);
    expect(autoOpenObjectives(1280)).toBe(true);
  });
});

describe('objectiveMarkerPlacement', () => {
  it('keeps an in-view target on its battlefield tile', () => {
    expect(objectiveMarkerPlacement(210, 360, 390, 844)).toEqual({
      kind: 'beacon', x: 210, y: 360, angle: expect.any(Number),
    });
  });

  it('clamps an off-screen target to a tappable edge arrow', () => {
    const marker = objectiveMarkerPlacement(900, -400, 390, 844);
    expect(marker.kind).toBe('edge');
    expect(marker.x).toBeGreaterThanOrEqual(28);
    expect(marker.x).toBeLessThanOrEqual(362);
    expect(marker.y).toBeGreaterThanOrEqual(104);
    expect(marker.y).toBeLessThanOrEqual(792);
  });

  it('moves guidance beside the minimap when the target is occluded by it', () => {
    const marker = objectiveMarkerPlacement(60, 760, 390, 844);
    expect(marker.kind).toBe('edge');
    expect(marker.x).toBeGreaterThanOrEqual(140);
  });
});

describe('objective progress throttle', () => {
  it('runs at most once per five simulation ticks', () => {
    expect(objectiveProgressDue(0, -1)).toBe(true);
    expect(objectiveProgressDue(1, 0)).toBe(false);
    expect(objectiveProgressDue(4, 0)).toBe(false);
    expect(objectiveProgressDue(5, 0)).toBe(true);
  });

  it('measures four reads across one 20-tick simulation second', () => {
    let lastRead = -1;
    let reads = 0;
    for (let tick = 0; tick < 20; tick++) {
      if (!objectiveProgressDue(tick, lastRead)) continue;
      lastRead = tick;
      reads++;
    }
    expect(reads).toBe(4);
  });
});
