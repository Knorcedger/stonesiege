// Objectives model latching + the narrow-viewport auto-open policy (the
// expanded list must never bury the control-group chips under it).

import { describe, expect, it } from 'vitest';
import {
  autoOpenObjectives, objectiveDisplayState, objectiveListFits, objectiveListMaxHeightPx,
  objectiveMarkerPlacement, objectiveProgressDue, objectiveMarkerPointerEvents,
  objectivePanelPointerEvents, objectiveProgressSummary, objectiveRows,
  objectiveSequencePosition, ObjectivesModel,
  OBJECTIVE_LIST_GAP_PX, OBJECTIVE_LIST_MIN_PX,
  RESOLVED_COLLAPSE_MIN, resolvedSummaryLabel, resolvedSummaryMark,
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

describe('objective marker hit testing', () => {
  it('passes battlefield commands through the beacon but keeps the off-screen arrow interactive', () => {
    expect(objectiveMarkerPointerEvents('beacon')).toBe('none');
    expect(objectiveMarkerPointerEvents('edge')).toBe('auto');
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

/**
 * Resolved objectives are history, but each one used to keep a full row — text,
 * progress chips and all — so a campaign list outgrew the screen by its fourth
 * objective and painted over the bottom-right command card.
 */
describe('objectiveRows', () => {
  const NONE: ReadonlySet<string> = new Set();
  const model = (states: readonly ('complete' | 'failed' | 'open')[]): ObjectivesModel => {
    const m = new ObjectivesModel();
    states.forEach((state, index) => {
      m.add(`o${index}`, `objective ${index}`);
      if (state === 'complete') m.complete(`o${index}`);
      if (state === 'failed') m.fail(`o${index}`);
    });
    return m;
  };

  it('folds a run of resolved objectives into one summary row', () => {
    const m = model(['complete', 'complete', 'complete', 'open']);
    const rows = objectiveRows(m.items(), m.current?.id, NONE);
    expect(rows).toEqual([
      { kind: 'resolved', runId: 'o0', ids: ['o0', 'o1', 'o2'], completed: 3, failed: 0, expanded: false },
      expect.objectContaining({ kind: 'objective', display: 'current', folded: false }),
    ]);
  });

  it('counts completed and failed separately in the same run', () => {
    const m = model(['complete', 'failed', 'complete', 'open']);
    expect(objectiveRows(m.items(), m.current?.id, NONE)[0])
      .toMatchObject({ kind: 'resolved', completed: 2, failed: 1, expanded: false });
  });

  it('reveals the folded rows under the summary that owns them', () => {
    const m = model(['complete', 'complete', 'open']);
    const rows = objectiveRows(m.items(), m.current?.id, new Set(['o0']));
    expect(rows.map((row) => row.kind)).toEqual(['resolved', 'objective', 'objective', 'objective']);
    // The summary stays put: it is also the control that folds them back up.
    expect(rows[0]).toMatchObject({ expanded: true });
    expect(rows.slice(1, 3).every((row) => row.kind === 'objective' && row.folded)).toBe(true);
    expect(rows[3]).toMatchObject({ folded: false, display: 'current' });
  });

  it('leaves a lone resolved objective expanded — folding it saves nothing', () => {
    const m = model(['complete', 'open']);
    expect(RESOLVED_COLLAPSE_MIN).toBe(2);
    expect(objectiveRows(m.items(), m.current?.id, NONE)).toEqual([
      expect.objectContaining({ kind: 'objective', display: 'complete', folded: false }),
      expect.objectContaining({ kind: 'objective', display: 'current' }),
    ]);
  });

  /**
   * One panel-wide "show history" flag opened every block at once: tapping the
   * opening block's summary also spilled the mid-mission one, in the exact
   * shape the consecutive-run test below builds.
   */
  it('expands each run on its own', () => {
    const m = model(['complete', 'complete', 'open', 'failed', 'failed', 'open']);
    const runIds = objectiveRows(m.items(), m.current?.id, NONE)
      .filter((row) => row.kind === 'resolved')
      .map((row) => row.kind === 'resolved' ? row.runId : '');
    expect(runIds).toEqual(['o0', 'o3']);

    const rows = objectiveRows(m.items(), m.current?.id, new Set(['o3']));
    expect(rows.map((row) => row.kind)).toEqual([
      'resolved', 'objective', 'resolved', 'objective', 'objective', 'objective',
    ]);
    expect(rows[0]).toMatchObject({ runId: 'o0', expanded: false });
    expect(rows[2]).toMatchObject({ runId: 'o3', expanded: true });
  });

  it('names the objectives a summary stands for, so a folded completion can flash', () => {
    const m = model(['complete', 'complete', 'complete', 'open']);
    expect(objectiveRows(m.items(), m.current?.id, NONE)[0])
      .toMatchObject({ ids: ['o0', 'o1', 'o2'] });
  });

  it('folds by consecutive run, so the authored sequence never reorders', () => {
    // A mid-list failure must not teleport up into the opening history block.
    const m = model(['complete', 'complete', 'open', 'failed', 'failed', 'open']);
    const rows = objectiveRows(m.items(), m.current?.id, NONE);
    expect(rows.map((row) => row.kind)).toEqual(['resolved', 'objective', 'resolved', 'objective']);
    expect(rows[0]).toMatchObject({ completed: 2, failed: 0 });
    expect(rows[2]).toMatchObject({ completed: 0, failed: 2 });
    expect(rows[3]).toMatchObject({ display: 'upcoming' });
  });

  it('never folds live goals', () => {
    const m = model(['open', 'open', 'open']);
    const rows = objectiveRows(m.items(), m.current?.id, NONE);
    expect(rows.every((row) => row.kind === 'objective')).toBe(true);
    expect(rows.map((row) => row.kind === 'objective' && row.display))
      .toEqual(['current', 'upcoming', 'upcoming']);
  });

  it('labels the summary by what actually happened', () => {
    expect(resolvedSummaryLabel(3, 0)).toBe('3 completed');
    expect(resolvedSummaryLabel(0, 2)).toBe('2 failed');
    expect(resolvedSummaryLabel(2, 1)).toBe('2 completed · 1 failed');
    expect(resolvedSummaryMark(3, 0)).toBe('✔');
    expect(resolvedSummaryMark(2, 1)).toBe('✔');
    expect(resolvedSummaryMark(0, 2)).toBe('✖');
  });
});

/**
 * The panel and the bottom-right command cluster share the right edge of the
 * screen, so a list capped at a share of the VIEWPORT overlapped the command
 * card by construction — unreadable on exactly the phone widths where the card
 * is tallest relative to the screen. The cap is the free space, measured.
 */
describe('objectiveListMaxHeightPx', () => {
  it('stops the list above the command cluster', () => {
    // Landscape phone, villager selected: head ends at 110, card top at 250.
    expect(objectiveListMaxHeightPx(110, 250, 390)).toBe(250 - 110 - OBJECTIVE_LIST_GAP_PX);
  });

  it('caps a free column so the battlefield stays visible', () => {
    // Nothing selected: the cluster reports the root height, and 44% wins.
    expect(objectiveListMaxHeightPx(110, 800, 800)).toBe(Math.floor(800 * 0.44));
  });

  it('reports no room rather than negative geometry', () => {
    // Town centre selected on a landscape phone: the card starts above the head.
    expect(objectiveListMaxHeightPx(110, 0, 390)).toBe(0);
    expect(objectiveListFits(objectiveListMaxHeightPx(110, 0, 390))).toBe(false);
  });

  it('keeps the head-only fallback for spaces too small to read', () => {
    expect(objectiveListFits(OBJECTIVE_LIST_MIN_PX)).toBe(true);
    expect(objectiveListFits(OBJECTIVE_LIST_MIN_PX - 1)).toBe(false);
    // Villager card (~150px) on a landscape phone still leaves a usable list.
    expect(objectiveListFits(objectiveListMaxHeightPx(104, 236, 390))).toBe(true);
  });

  /**
   * The head is anchored under the top bar and cannot move, so when the cluster
   * fills the column it stays on top of the card's own controls. It keeps
   * painting (the current goal is worth those pixels) but stops taking taps —
   * the same rule the battlefield beacon follows.
   */
  it('lets taps through when the head cannot clear the cluster', () => {
    // Landscape phone, town centre selected: the card starts above the head.
    expect(objectivePanelPointerEvents(100, 0)).toBe('none');
    expect(objectivePanelPointerEvents(100, 84)).toBe('none');
    // Touching edges do not overlap; anything lower is a normal, tappable panel.
    expect(objectivePanelPointerEvents(100, 100)).toBe('auto');
    expect(objectivePanelPointerEvents(100, 510)).toBe('auto');
  });
});
