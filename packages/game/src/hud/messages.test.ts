// Dialogue banner queue model: FIFO order, reading-time auto-advance,
// tap-to-dismiss skipping to the next message.

import { describe, expect, it } from 'vitest';
import { MessageQueue, messageDurationMs } from './messages';

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
