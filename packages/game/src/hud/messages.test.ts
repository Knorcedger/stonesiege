// Dialogue banner queue model: FIFO order, reading-time auto-advance,
// tap-to-dismiss skipping to the next message, and the narration hold that
// keeps a line up while it is still being spoken.

import { describe, expect, it } from 'vitest';
import {
  MESSAGE_CLEAR_GAP_PX, MESSAGE_EDGE_PX, MESSAGE_MAX_HOLD_MS, MESSAGE_MIN_WIDTH_PX,
  messageBannerBox, messageBannerWidthPx, MessageQueue, messageDurationMs,
} from './messages';

describe('messageDurationMs', () => {
  it('scales with length inside the clamp window', () => {
    const short = messageDurationMs({ text: 'Aye.' });
    const long = messageDurationMs({ text: 'x'.repeat(120), speaker: 'Narrator' });
    expect(short).toBe(3200); // floor
    expect(long).toBeGreaterThan(short);
    expect(messageDurationMs({ text: 'x'.repeat(2000) })).toBe(9000); // ceiling
  });
});

describe('MessageQueue', () => {
  it('shows messages in push order', () => {
    const q = new MessageQueue();
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    expect(q.current(0)?.text).toBe('first');
    // still the first while its duration runs
    expect(q.current(1000)?.text).toBe('first');
  });

  it('auto-advances when the reading time elapses', () => {
    const q = new MessageQueue();
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    const dur = messageDurationMs({ text: 'first' });
    expect(q.current(0)?.text).toBe('first');
    expect(q.current(dur)?.text).toBe('second');
    const dur2 = messageDurationMs({ text: 'second' });
    expect(q.current(dur + dur2)).toBeNull(); // queue drained
    expect(q.pending).toBe(0);
  });

  it('tap-to-dismiss skips straight to the next message', () => {
    const q = new MessageQueue();
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    expect(q.current(100)?.text).toBe('first');
    q.dismiss();
    expect(q.current(101)?.text).toBe('second');
  });

  it('a message pushed while idle shows on the next poll', () => {
    const q = new MessageQueue();
    expect(q.current(0)).toBeNull();
    q.push({ text: 'late', speaker: 'Wallace' });
    const cur = q.current(5000);
    expect(cur?.text).toBe('late');
    expect(cur?.speaker).toBe('Wallace');
  });
});

describe('MessageQueue narration hold', () => {
  it('keeps the current line up while the voice is still reading it', () => {
    let speaking = true;
    const q = new MessageQueue({ hold: () => speaking });
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    const dur = messageDurationMs({ text: 'first' });
    expect(q.current(0)?.text).toBe('first');
    // reading time is up, but the narrator has not finished the sentence
    expect(q.current(dur)?.text).toBe('first');
    expect(q.current(dur + 2000)?.text).toBe('first');
    speaking = false;
    expect(q.current(dur + 2001)?.text).toBe('second');
  });

  it('never holds a line past the ceiling, even if the voice never ends', () => {
    const q = new MessageQueue({ hold: () => true });
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    expect(q.current(0)?.text).toBe('first');
    expect(q.current(MESSAGE_MAX_HOLD_MS - 1)?.text).toBe('first');
    expect(q.current(MESSAGE_MAX_HOLD_MS)?.text).toBe('second');
  });

  it('does not delay a line the voice is not reading', () => {
    const q = new MessageQueue({ hold: () => false });
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    expect(q.current(0)?.text).toBe('first');
    expect(q.current(messageDurationMs({ text: 'first' }))?.text).toBe('second');
  });

  it('lets a tap skip a line that is still being spoken', () => {
    const q = new MessageQueue({ hold: () => true });
    q.push({ text: 'first' });
    q.push({ text: 'second' });
    expect(q.current(0)?.text).toBe('first');
    q.dismiss();
    expect(q.current(1)?.text).toBe('second');
  });
});

/**
 * The banner is centred at min(560px, 92%) and the objectives panel is
 * right-anchored at min(300px, 60vw), and both hang from the top bar — so
 * their vertical ranges always meet and the collision is decided horizontally.
 * The clearance used to be gated on the 720px narrow breakpoint, which is not
 * where the overlap ends: solving w/2 + 280 > w - 306 puts it at ~1172px, so
 * landscape phones, small tablets and windowed desktops all sat on the
 * objective head with no clearance applied.
 */
describe('messageBannerBox', () => {
  /**
   * 844x390 landscape phone, nothing selected: the panel is right-anchored at
   * min(300px,60vw) so its left edge is 538, and the centred banner would run
   * to 702. They overlap — as they do at every width up to ~1172px, which is
   * why the old media query at the 720px narrow breakpoint missed most of it.
   */
  const phone = {
    barClear: 48, panelClear: 114, clusterTop: 390,
    rootWidth: 844, bannerHeight: 75, panelLeft: 538,
  };

  it('leaves the banner centred under the bar when nothing is in its way', () => {
    // 1280 desktop: the centred banner ends at 920, the panel starts at 974.
    expect(messageBannerBox({ ...phone, rootWidth: 1280, panelLeft: 974 }))
      .toEqual({ top: 48, width: 560, shift: 0 });
  });

  it('treats a missing panel as no obstacle', () => {
    // Skirmish: no objectives panel publishes an edge, so nothing to clear.
    expect(messageBannerBox({ ...phone, panelLeft: Number.POSITIVE_INFINITY }))
      .toMatchObject({ top: 48, shift: 0 });
  });

  it('steps sideways into the strip beside the panel rather than moving down', () => {
    // Every row below the bar is spoken for on a short screen, so the banner
    // takes the free width instead: 6..530, clear of the panel's 538.
    const box = messageBannerBox(phone);
    expect(box.top).toBe(48);
    expect(box.width).toBe(538 - MESSAGE_CLEAR_GAP_PX - MESSAGE_EDGE_PX);
    const left = (phone.rootWidth - box.width) / 2 + box.shift;
    expect(left).toBeCloseTo(MESSAGE_EDGE_PX, 0);
    expect(left + box.width).toBeLessThanOrEqual(phone.panelLeft);
  });

  it('keeps the full width when the strip is wider than the banner needs', () => {
    // 1024 tablet: 704px of strip, so it only shifts — it does not shrink.
    const box = messageBannerBox({ ...phone, rootWidth: 1024, panelLeft: 718 });
    expect(box.width).toBe(560);
    expect(box.shift).toBeLessThan(0);
    expect((1024 - 560) / 2 + box.shift + 560).toBeLessThanOrEqual(718);
  });

  /** A 136px strip is a column of two-word lines; drop below instead. */
  it('drops below the panel where the strip would be unreadable', () => {
    // 390x844 portrait phone: the panel's left edge is at 150.
    const box = messageBannerBox({
      ...phone, rootWidth: 390, panelLeft: 150, barClear: 76, panelClear: 156, clusterTop: 844,
    });
    expect(150 - MESSAGE_CLEAR_GAP_PX - MESSAGE_EDGE_PX).toBeLessThan(MESSAGE_MIN_WIDTH_PX);
    expect(box).toMatchObject({ top: 156, shift: 0 });
  });

  /**
   * Dodging one HUD onto another is not a fix: the banner is z-index 28 with
   * pointer-events:auto, so a drop onto the command card would swallow its taps
   * for as long as the message is up.
   */
  it('never drops onto the command cluster', () => {
    const box = messageBannerBox({
      ...phone, rootWidth: 390, panelLeft: 150, panelClear: 260, clusterTop: 250,
    });
    expect(box.top).toBe(250 - phone.bannerHeight - MESSAGE_CLEAR_GAP_PX);
    expect(box.top + phone.bannerHeight).toBeLessThan(250);
  });

  it('keeps the banner on screen when nothing is selected', () => {
    // No cluster published: the floor is the root's own bottom edge.
    const box = messageBannerBox({
      ...phone, rootWidth: 390, panelLeft: 150, panelClear: 800, clusterTop: 844,
    });
    expect(box.top + phone.bannerHeight).toBeLessThanOrEqual(844);
  });

  it('stays under the bar when neither way out fits', () => {
    // Portrait phone with a town centre card up: no strip, and no room below.
    const box = messageBannerBox({
      ...phone, rootWidth: 390, panelLeft: 150, panelClear: 200, clusterTop: 100,
    });
    expect(box.top).toBe(48);
  });

  it('never rises above the top bar, whatever the panel says', () => {
    // A clearance measured before the bar wrapped must not pull the banner up
    // onto the bar it also has to clear.
    const box = messageBannerBox({
      ...phone, rootWidth: 390, panelLeft: 150, barClear: 96, panelClear: 40,
    });
    expect(box.top).toBe(96);
  });

  it('touching edges do not overlap', () => {
    const centred = (rootWidth: number) => (rootWidth - messageBannerWidthPx(rootWidth)) / 2;
    const right = centred(844) + messageBannerWidthPx(844);
    expect(messageBannerBox({ ...phone, panelLeft: right }).shift).toBe(0);
    expect(messageBannerBox({ ...phone, panelLeft: right - 1 }).shift).not.toBe(0);
  });

  it('caps the width on wide roots and shares it on narrow ones', () => {
    expect(messageBannerWidthPx(1280)).toBe(560);
    expect(messageBannerWidthPx(390)).toBe(358);
  });
});
