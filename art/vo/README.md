# Campaign voice-over

Spoken campaign dialogue. The shipping audio lives in
[`apps/web/public/assets/vo/`](../../apps/web/public/assets/vo/) as regular Git files, like the
runtime atlases; this directory holds the provenance record rather than the audio.

## How it is made

```bash
npm run vo:render -- --list   # any platform: print the beats that would be rendered
npm run vo:render             # macOS: render, encode, write the manifest
```

The renderer ([`tools/voiceover.ts`](../../tools/voiceover.ts)) reads the spoken lines out of the
shipping chapters, splits each into the same beats the game speaks, and renders one file per beat
with the macOS `say` binary, encoding to AAC with `afconvert`. Both are system binaries, so there
is no new dependency and no service call. Intermediate AIFF masters are written to `.vo-cache/`
and are not committed — re-running the tool regenerates them.

Beat ids are `voiceLineId(speaker, text)`. Editing a line changes its ids, which orphans the old
recordings: the tool deletes them on the next render, and until then the game speaks that beat
instead of playing audio that no longer matches the banner. `tools/voiceover.test.ts` fails if the
committed manifest still references wording that has changed.

## Source and licence status

| | |
| --- | --- |
| Voice | `Martha`, English (UK) |
| Source | Apple system voice, rendered locally with macOS `say` |
| Renderer | `npm run vo:render` |
| Licence for redistribution | **Open question — see below** |

Apple's system voices are licensed to speak on the device as part of the operating system. That
grant does not clearly extend to redistributing rendered audio as game assets, which is what
committing these files to an MPL-2.0 repository and shipping them through Google Play and the App
Store does. The repository owner has chosen to proceed on that basis; this note exists so the
decision is visible and reviewable rather than buried in a commit.

If it has to be undone, only the files change. Re-render from a source whose terms permit
redistribution — Azure AI Speech and ElevenLabs both grant commercial use of generated audio on
paid tiers, and a voice actor is the strongest option — and the pipeline, the manifest format and
the runtime path stay exactly as they are. `npm run vo:render -- --voice <name>` and
`--cast Wallace=<name>` select the voice; nothing else needs to move.

## What the game does without these files

Nothing breaks. `createRecordedSpeech` returns the speech synthesizer unchanged when the manifest
is missing or empty, and falls back per beat when a single recording is absent. A fresh clone, a
contributor who has never run the renderer, and a device that fails to fetch the manifest all get
the synthesised read described in [`docs/GDD.md`](../../docs/GDD.md).
