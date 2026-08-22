// Dialogue banner queue model: FIFO order, reading-time auto-advance,
// tap-to-dismiss skipping to the next message, and the narration hold that
// keeps a line up while it is still being spoken.

import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX_HOLD_MS, MessageQueue, messageDurationMs } from './messages';

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
