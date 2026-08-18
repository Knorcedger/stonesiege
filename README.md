<div align="center">
  <img src="assets/app-icon-mark.png" alt="StoneSiege crest" width="176">
  <h1>StoneSiege</h1>
  <p><strong>Build a kingdom. Raise an army. Rewrite history.</strong></p>
  <p>An AI-native, open-source historical real-time strategy game for browser, Android, and iOS.</p>
  <p>
    <a href="https://stonesiegegame.com">Website</a> ·
    <a href="https://play.stonesiegegame.com">Play in browser</a> ·
    <a href="CONTRIBUTING.md">Contributing</a> ·
    <a href="ROADMAP.md">Roadmap</a> ·
    <a href="https://github.com/Knorcedger/stonesiege/discussions">Discussions</a> ·
    <a href="https://github.com/Knorcedger/stonesiege/issues/new?template=bug_report.yml">Report a bug</a>
  </p>
  <p>
    <a href="https://github.com/Knorcedger/stonesiege/actions/workflows/ci.yml"><img src="https://github.com/Knorcedger/stonesiege/actions/workflows/ci.yml/badge.svg" alt="Quality gates"></a>
    <img src="https://img.shields.io/badge/code-MPL--2.0-8b5cf6" alt="License: MPL 2.0">
    <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript strict">
    <img src="https://img.shields.io/badge/platforms-web%20%7C%20Android%20%7C%20iOS-c9a15b" alt="Platforms: web, Android, iOS">
    <img src="https://img.shields.io/badge/status-alpha-b45309" alt="Status: alpha">
  </p>
</div>

![StoneSiege battle](art/store/screenshots/05-gameplay-intro-store.jpg)

StoneSiege is a mobile-first RTS inspired by the depth and clarity of classic historical strategy games. Gather resources, advance through the ages, build fortified settlements, command historically distinct armies, and fight through 48 playable campaign chapters.

The game is built in public and welcomes both traditional and AI-assisted contributors. The current single-player game will remain free. If an official multiplayer edition becomes viable, the present direction is a fair one-time purchase—no subscriptions, loot boxes, or pay-to-win mechanics.

StoneSiege began as a fully vibe-coded experiment and grew into a tested game with a deterministic simulation, native mobile builds, and hundreds of automated checks. We treat AI as a powerful tool, while people remain responsible for design judgment, review, provenance, security, and everything that ships.

> StoneSiege is an independent original project. It is not affiliated with, endorsed by, or sponsored by Microsoft or the Age of Empires franchise.

## Current state

StoneSiege is an **alpha**. The web build is public, while Android and iOS builds are available to invited internal testers. It already includes:

- Public browser play at [play.stonesiegegame.com](https://play.stonesiegegame.com)
- Practice matches against one to three deterministic bots across seven difficulty levels, from Beginner to Hardcore
- Seven historical campaigns with 48 chapters, including the twelve-chapter *William Wallace: The Rising of Scotland*
- Seven civilizations: Scots, English, Vikings, French, Mongols, Byzantines, and Saracens
- Villagers, resources, construction, production, technology, conversion, garrisoning, and fog of war
- Counter-based combat with ranged projectiles, siege, gates, fortifications, armor classes, and multiple victory conditions
- Procedurally connected rivers and cliffs that preserve map accessibility
- Touch-first controls plus complete mouse and keyboard support
- Offline web, Android, and iOS builds from one codebase
- A deterministic simulation designed for replays and future lockstep multiplayer

Expect rough edges, balance changes, and save incompatibilities while the project is in alpha. See [project status](docs/PROJECT_STATUS.md) for the honest snapshot.

## Quick start

You need [Node.js 22.12+ or 24+](https://nodejs.org/) and npm.

```bash
git clone --depth 1 https://github.com/Knorcedger/stonesiege.git
cd stonesiege
npm ci
npm run dev
```

Open <http://localhost:5199>.

The repository includes HD source art, generated frames, native wrappers, and store media. Contributors working only on the web game can avoid downloading most non-runtime media:

```bash
git clone --filter=blob:none --no-checkout https://github.com/Knorcedger/stonesiege.git
cd stonesiege
git sparse-checkout init --cone
git sparse-checkout set apps packages docs tools
git checkout main
npm ci
npm run dev
```

Use a normal, non-sparse clone when working on native builds, source art, or store publishing. Run `git fetch --unshallow` if a shallow checkout later needs the complete history.

Desktop controls:

- Left-click selects; left-drag selects a group.
- Right-click issues context commands.
- WASD, arrow keys, screen edges, or middle-drag move the camera.
- The mouse wheel zooms.

On touch devices, tap to select or command, drag to pan, pinch to zoom, and long-press then drag to group-select.

## How it is built

```text
apps/web ──► @bf/game (PixiJS renderer, input, HUD, menus)
                 │ commands                  │ state + events
                 ▼                           ▼
              @bf/sim ◄── @bf/data      deterministic 20 Hz simulation
                 ▲
          @bf/ai + @bf/scenarios
```

| Area | Responsibility |
|---|---|
| `packages/sim` | Integer-only deterministic rules and systems |
| `packages/data` | Units, buildings, technologies, civilizations, and balance data |
| `packages/game` | PixiJS rendering, input, audio, menus, and HUD |
| `packages/ai` | Deterministic economy and military bot controllers |
| `packages/scenarios` | Campaign maps, objectives, triggers, and dialogue |
| `tools` | Procedural and AI-assisted art pipelines plus mobile asset generation |
| `apps/web` | Vite entry point and bundled game assets |
| `android`, `ios` | Capacitor 8 native wrappers |

Read [the architecture guide](docs/ARCHITECTURE.md), [game design document](docs/GDD.md), and [mobile build guide](docs/MOBILE.md) for the details.

## Development

```bash
npm run typecheck       # strict TypeScript checks
npm test                # deterministic unit and integration tests
npm run build           # production web bundle
npm run check           # run the same three quality gates as CI
npm run assets          # rebuild generated art atlases
npm run mobile:sync     # build web and synchronize native wrappers
npm run release:mobile  # sign, validate, and upload both internal mobile builds
```

Simulation changes must preserve determinism: no wall clock, platform APIs, floating-point gameplay state, or unstable iteration in `packages/sim`. Same seed plus the same command stream must produce the same result.

## Contributing

Contributions are welcome, including carefully reviewed AI-assisted work. Start with [CONTRIBUTING.md](CONTRIBUTING.md), read the [Code of Conduct](CODE_OF_CONDUCT.md), and look through [open issues](https://github.com/Knorcedger/stonesiege/issues). Please discuss large gameplay or architecture changes before building them.

Every contributor remains responsible for understanding, testing, and licensing what they submit. A generated patch is welcome; an unexplained prompt dump is not.

See the [changelog](CHANGELOG.md) for release-level changes and the [project status](docs/PROJECT_STATUS.md) for current limitations.

## Project principles

- **Single-player stays free.** The current single-player game will not be put behind a purchase.
- **Players should be respected.** No ads, manipulative monetization, loot boxes, or pay-to-win systems.
- **Direction is discussed in public.** Maintainers make the final call, but material decisions should include players and contributors early.
- **Payment is not governance.** Supporting the official game never buys extra voting power.
- **Forking stays real.** The code is open source; only the official StoneSiege identity is reserved.

Read [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made.

## Licensing and identity

- Source code, tests, configuration, and technical documentation are licensed under the [Mozilla Public License 2.0](LICENSE).
- Original game art and audio are available under the terms in [ASSET_LICENSE.md](ASSET_LICENSE.md).
- Third-party dependencies and fonts retain their own licenses.
- The **StoneSiege** name, crest, logos, and official store identity are not granted for use as the identity of a fork. See [TRADEMARK.md](TRADEMARK.md).

Security problems should be reported privately according to [SECURITY.md](SECURITY.md). General questions can go to [support@flarmio.com](mailto:support@flarmio.com).
