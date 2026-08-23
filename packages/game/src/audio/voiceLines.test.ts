// Beat naming and manifest parsing. The render tool imports the same module, so
// these are the guarantees that keep recordings and playback in agreement.

import { describe, expect, it } from 'vitest';
import { parseVoiceManifest, speechBeats, speechText, voiceLineId } from './voiceLines';

describe('voiceLineId', () => {
  it('names a beat the same way every time', () => {
    expect(voiceLineId('Narrator', 'Lanarkshire, May 1297.'))
      .toBe(voiceLineId('narrator ', 'Lanarkshire, May 1297.')); // speaker case and padding
    expect(voiceLineId(undefined, 'Lanarkshire, May 1297.'))
      .toBe(voiceLineId('', 'Lanarkshire, May 1297.'));
  });

  it('changes when the wording or the speaker changes', () => {
    const base = voiceLineId('Wallace', 'Full bellies.');
    expect(voiceLineId('Wallace', 'Full bellies!')).not.toBe(base);
    expect(voiceLineId('Heselrig', 'Full bellies.')).not.toBe(base);
  });

  it('is a fixed-width hex name safe to use in a file name', () => {
    for (const beat of speechBeats(speechText({ text: 'Hold — for Scotland. Now.' }))) {
      expect(voiceLineId('Narrator', beat)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('speechBeats', () => {
  const beats = (text: string): string[] => speechBeats(speechText({ text }));

  it('treats an ellipsis as a breath, never as spoken dots', () => {
    // Splitting on each dot used to emit beats whose whole text was '.', which
    // the game read aloud as a click and the render tool recorded as a file.
    expect(beats('…I gave them my word. This day is ash in my mouth.'))
      .toEqual(['I gave them my word.', 'This day is ash in my mouth.']);
    expect(beats('Aye… the way a boot settles on a neck.'))
      .toEqual(['Aye', 'the way a boot settles on a neck.']);
  });

  it('never yields a beat with nothing to say', () => {
    for (const text of ['…', '...', '. . .', '—', 'Aye…']) {
      for (const beat of beats(text)) expect(beat).toMatch(/[\p{L}\p{N}]/u);
    }
  });

  it('still breaks on dashes and sentence ends, and not inside a decimal', () => {
    expect(beats('Settled. Aye — the way a boot settles on a neck.'))
      .toEqual(['Settled.', 'Aye', 'the way a boot settles on a neck.']);
    expect(beats('He paid 3.5 marks. Then left.')).toEqual(['He paid 3.5 marks.', 'Then left.']);
  });
});

describe('parseVoiceManifest', () => {
  it('keeps entries that can actually be played', () => {
    const manifest = parseVoiceManifest({
      version: 1,
      lines: { abcd1234: { file: 'narrator-abcd1234.m4a', ms: 1800.4 } },
    });
    expect(manifest.lines.abcd1234).toEqual({ file: 'narrator-abcd1234.m4a', ms: 1800 });
  });

  it('drops entries the game could not use, one by one', () => {
    const manifest = parseVoiceManifest({
      version: 1,
      lines: {
        good: { file: 'a.m4a', ms: 500 },
        noFile: { ms: 500 },
        emptyFile: { file: '', ms: 500 },
        noDuration: { file: 'b.m4a' },
        zeroDuration: { file: 'b.m4a', ms: 0 },
        escaping: { file: '../../secrets.m4a', ms: 500 },
        nested: { file: 'sub/dir.m4a', ms: 500 },
        notAnObject: 'b.m4a',
      },
    });
    expect(Object.keys(manifest.lines)).toEqual(['good']);
  });

  it('treats a missing or broken manifest as no recordings', () => {
    expect(parseVoiceManifest(null).lines).toEqual({});
    expect(parseVoiceManifest('not json').lines).toEqual({});
    expect(parseVoiceManifest({ version: 1 }).lines).toEqual({});
  });
});
