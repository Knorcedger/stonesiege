# Contributing to StoneSiege

Thank you for helping build StoneSiege. Traditional coding, visual tools, and AI-assisted workflows are all welcome. The standard is the same for everyone: understand the change, show why it helps, test it, and have the right to submit it.

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md), [architecture guide](docs/ARCHITECTURE.md), and the relevant design document.
2. Follow the issue-first coordination workflow below.
3. Keep a change focused. Separate unrelated fixes.

## Coordinate through an issue before implementation

Every code, test, campaign, map, balance, art, audio, build, or documentation contribution must
have one GitHub issue before files are changed. This includes small fixes. Read-only investigation
needed to reproduce, search, or describe a problem is fine before the issue exists.

1. Search [open and closed issues](https://github.com/Knorcedger/stonesiege/issues) using the
   feature, system, error, and player-facing terms—not only your proposed solution.
2. Search [active pull requests](https://github.com/Knorcedger/stonesiege/pulls) for overlapping
   implementation.
3. When a matching issue exists, inspect its assignees, recent comments, and linked pull requests.
   If someone is actively working on it, coordinate in the issue and do not start a parallel
   implementation. If it is available, comment with your intended scope and ask to be assigned or
   assign yourself when permitted. Ask before taking over work that might merely be paused.
4. When no matching issue exists, create a focused bug report or feature request. Explain the
   player or contributor problem, proposed scope, acceptance criteria, dependencies, and important
   tradeoffs. Do not create a duplicate issue merely to satisfy the process.
5. Record the issue number and create an issue branch, for example
   `your-name/123-short-description`.
6. Put `Closes #123` in the pull-request description. Use `Refs #123` only when the PR deliberately
   delivers part of a larger accepted issue and should not close it.

A free GitHub account is therefore required before implementation begins. If you cannot create or
comment on the coordination issue, prepare a read-only problem report and ask for help rather than
starting untracked work.

Good first contributions include tests, accessibility fixes, mobile UX polish, documentation, small deterministic simulation bugs, and clearly scoped scenario improvements.

Issues labeled [`good first issue`](https://github.com/Knorcedger/stonesiege/labels/good%20first%20issue) are intended to be independently reviewable and include acceptance criteria. Issues labeled [`help wanted`](https://github.com/Knorcedger/stonesiege/labels/help%20wanted) need community input or implementation.

## Local setup

Prerequisite: Node.js 22.12+ or 24+. Clone the repository using either the normal or lightweight web-only setup in [README.md](README.md), then create a focused branch:

```bash
npm ci
git switch -c your-name/short-description
npm run dev
```

Before submitting:

```bash
npm run typecheck
npm test
npm run build
# or run all three:
npm run check
```

Add focused tests for behavior changes. Include before/after screenshots or a short recording for visible changes. Native changes should identify the devices or simulators used.

## Engineering rules

The simulation is deterministic by design. In `packages/sim`:

- Use integers for gameplay state; positions use the existing fixed-point representation.
- Never use `Math.random()`, `Date`, DOM APIs, PixiJS, or platform state.
- Use the seeded simulation RNG when randomness is required.
- Preserve stable iteration order and command-boundary validation.
- Prove that identical seeds and command streams still produce identical results.

Keep gameplay rules in the simulation, presentation in the game client, and balance/content definitions in `packages/data`. Avoid new dependencies unless the benefit and maintenance cost are explained in the pull request.

## AI-assisted contributions

AI assistance is welcome, but the human contributor is accountable for the result.

- Review every changed line and be able to explain the implementation.
- State the tool and the material role it played in the pull-request description.
- Do not paste secrets, private player data, proprietary code, or unlicensed assets into a model.
- Verify APIs and licenses instead of trusting generated claims.
- Keep prompts and generated transcripts out of the repository unless they are genuinely useful project documentation.
- Run the full quality gates. “The model wrote it” is not evidence that it works.

For generated or AI-assisted art, include provenance, source references, model/tool, material edits, and a statement that you reasonably believe the contribution can be dedicated under [ASSET_LICENSE.md](ASSET_LICENSE.md). Recognizable copies of third-party game art will not be accepted.

Do not edit generated atlases in `apps/web/public/assets/hd/` by hand. Source renders, validated frames, generation steps, and licensing provenance belong under `art/hd/`; see [art/hd/README.md](art/hd/README.md). Source art and store screenshots use Git LFS and are intentionally excluded from ordinary clones. Install Git LFS and run `git lfs pull --include="art/**,store/screenshots/**" --exclude=""` before source-art or store-publishing work. Shipping runtime atlases remain regular Git files.

Spoken campaign dialogue is rendered, not hand-edited: `npm run vo:render` writes the audio in
`apps/web/public/assets/vo/` and its manifest. Re-run it after changing a dialogue line, or the
recording of the old wording is deleted as stale and that beat falls back to the device's speech
synthesizer. `npm run vo:render -- --list` reviews the lines on any platform; rendering needs
macOS. Provenance and the licence status of the voice are recorded in [art/vo/README.md](art/vo/README.md).

## Commits and pull requests

Write an imperative, specific commit subject, such as `Fix villagers losing queued drop-off orders`. The pull request should explain:

- The player or developer problem
- The chosen solution and important tradeoffs
- Tests performed
- Visual evidence, when relevant
- AI or generator assistance, when material
- Asset provenance or licensing considerations

By contributing, you certify the [Developer Certificate of Origin](DCO) for your work. Sign off each commit:

```bash
git commit -s -m "Describe the change"
```

This adds `Signed-off-by: Your Name <you@example.com>` to the commit. It is a statement about provenance and your right to contribute, not an assignment of copyright.

Pull-request CI checks every non-bot commit for this trailer. If you forgot it on your latest commit, use `git commit --amend --signoff`; for several local commits, use an interactive rebase and add a sign-off to each one. Historical maintainer commits created before automated DCO enforcement are not being rewritten.

## Review and acceptance

Maintainers consider correctness, determinism, accessibility, player experience, historical presentation, scope, maintainability, provenance, and fit with the public roadmap. A proposal can be thoughtful and well built without being right for the official game; the open-source license always leaves room to explore it in a fork.

Be patient and kind during review. Address feedback with new commits while a review is active; maintainers may squash when merging. Never include credentials, signing keys, `.env` files, player data, or store access tokens.
