// The render tool's contract with the game: which beats get recorded, what the
// files are called, and whether anything already rendered has drifted from the
// dialogue it was rendered from.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { voiceLineId } from '@bf/game/audio/voiceLines';
import type { ScenarioDef } from '@bf/scenarios/schema';
import { collectVoiceBeats, fileNameFor, shippingVoiceBeats } from './voiceover';

const MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/web/public/assets/vo/manifest.json',
);

const scenarioWith = (effects: Array<{ kind: 'message'; text: string; speaker?: string }>) =>
  ({
    id: 'test-chapter',
    triggers: [{ id: 't1', conditions: [], effects }],
  } as unknown as ScenarioDef);

describe('collectVoiceBeats', () => {
  it('records one beat per phrase, not one per line', () => {
    const beats = collectVoiceBeats([scenarioWith([
      { kind: 'message', speaker: 'Wallace', text: 'Settled. Aye — the way a boot settles on a neck.' },
    ])]);
    expect(beats.map((b) => b.text)).toEqual([
      'Settled.', 'Aye', 'the way a boot settles on a neck.',
    ]);
    expect(beats.every((b) => b.id === voiceLineId('Wallace', b.text))).toBe(true);
  });

  it('renders a repeated beat once', () => {
    const beats = collectVoiceBeats([
      scenarioWith([{ kind: 'message', speaker: 'Wallace', text: 'Hold.' }]),
      scenarioWith([{ kind: 'message', speaker: 'Wallace', text: 'Hold.' }]),
    ]);
    expect(beats).toHaveLength(1);
  });

  it('reads the narrator slower than the characters', () => {
    const beats = collectVoiceBeats([scenarioWith([
      { kind: 'message', speaker: 'Narrator', text: 'Night falls.' },
      { kind: 'message', speaker: 'Wallace', text: 'Then we march.' },
    ])]);
    expect(beats[0]!.wpm).toBeLessThan(beats[1]!.wpm);
  });

  it('skips effects that are not dialogue', () => {
    const scenario = scenarioWith([
      { kind: 'message', speaker: 'Narrator', text: 'Spoken.' },
    ]);
    scenario.triggers[0]!.effects.push({ kind: 'objectiveComplete', id: 'obj' });
    expect(collectVoiceBeats([scenario]).map((b) => b.text)).toEqual(['Spoken.']);
  });
});

describe('fileNameFor', () => {
  it('names the file after the speaker and the beat id', () => {
    const [beat] = collectVoiceBeats([scenarioWith([
      { kind: 'message', speaker: 'Heselrig', text: 'Cut them down.' },
    ])]);
    expect(fileNameFor(beat!)).toBe(`heselrig-${beat!.id}.m4a`);
  });

  it('falls back to the narrator for an unattributed line', () => {
    const [beat] = collectVoiceBeats([scenarioWith([{ kind: 'message', text: 'Word comes.' }])]);
    expect(fileNameFor(beat!)).toBe(`narrator-${beat!.id}.m4a`);
  });
});

describe('the shipping campaign', () => {
  it('has dialogue to record, all of it named uniquely', () => {
    const beats = shippingVoiceBeats();
    expect(beats.length).toBeGreaterThan(0);
    expect(new Set(beats.map((b) => b.id)).size).toBe(beats.length);
    expect(beats.every((b) => b.text.trim() !== '')).toBe(true);
  });

  it('has no rendered audio left over from wording that changed', () => {
    // Skipped until someone runs `npm run vo:render` — the game speaks any beat
    // that has no recording, so an absent manifest is a supported state.
    if (!existsSync(MANIFEST)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
      lines: Record<string, { file: string }>;
    };
    const current = new Set(shippingVoiceBeats().map((b) => b.id));
    const orphans = Object.keys(manifest.lines).filter((id) => !current.has(id));
    expect(orphans, 'stale recordings — re-run npm run vo:render').toEqual([]);
  });
});
