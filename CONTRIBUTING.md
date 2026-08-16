# Contributing to StoneSiege

Thank you for helping build StoneSiege. Traditional coding, visual tools, and AI-assisted workflows are all welcome. The standard is the same for everyone: understand the change, show why it helps, test it, and have the right to submit it.

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md), [architecture guide](docs/ARCHITECTURE.md), and the relevant design document.
2. Search existing issues and pull requests.
3. Open an issue before a large feature, balance overhaul, new dependency, public API change, or architectural rewrite. Small fixes can go straight to a pull request.
4. Keep a change focused. Separate unrelated fixes.

Good first contributions include tests, accessibility fixes, mobile UX polish, documentation, small deterministic simulation bugs, and clearly scoped scenario improvements.

## Local setup

Prerequisite: Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Before submitting:

```bash
npm run typecheck
npm test
npm run build
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

## Review and acceptance

Maintainers consider correctness, determinism, accessibility, player experience, historical presentation, scope, maintainability, provenance, and fit with the public roadmap. A proposal can be thoughtful and well built without being right for the official game; the open-source license always leaves room to explore it in a fork.

Be patient and kind during review. Address feedback with new commits while a review is active; maintainers may squash when merging. Never include credentials, signing keys, `.env` files, player data, or store access tokens.
