# StoneSiege project status

_Last updated: 2026-08-16_

StoneSiege is a playable single-player RTS in **internal alpha**. The browser, Android, and iOS versions share one offline game bundle and the same deterministic simulation.

## Release snapshot

| Area | State |
|---|---|
| Browser build | Playable locally; public deployment is not yet the primary test channel |
| Android | Version 1.0, build 2 active on Google Play internal testing |
| iOS | Build 1 processed in TestFlight and available to internal testers |
| Website | Live at [stonesiegegame.com](https://stonesiegegame.com) |
| Repository | Being prepared for public open-source contributions |
| Accounts, ads, purchases | None in the current build |

The current store builds collect no user data through accounts, analytics, advertising, tracking, purchases, push notifications, or project-operated network services. Campaign progress, settings, and resumable matches remain on-device. This must be reassessed before any online feature or SDK is added.

## What is playable

- Practice/skirmish matches against easy, standard, and hard AI
- Six original William Wallace campaign scenarios, including tutorial progression
- Full economy loop: villagers, four resources, farms, drop-offs, construction, production, market, and age advancement
- Counter-based combat: melee, ranged, cavalry, siege, monks, conversion, projectiles, garrisoning, and fortifications
- Fog of war, scenario triggers, objectives, multiple victory conditions, snapshots, and interrupted-match recovery
- Touch-first mobile controls and desktop mouse/keyboard controls
- Landscape-native Capacitor wrappers with generated icons, splashes, safe-area handling, and offline fonts/assets

## Technical health

- Strict TypeScript typecheck passes
- Production Vite build passes
- 605 deterministic unit and integration tests pass; 11 optional heavy-sweep tests are skipped by default
- The simulation uses a fixed 20 Hz timestep, integer state, seeded randomness, and stable command processing
- Headless bot games and determinism checks are part of the normal test suite

## Current priorities

1. Finish the public repository, licenses, contributor workflow, and continuous integration.
2. Run structured playtests on representative phones and tablets, including all campaign scenarios.
3. Fix high-impact input, accessibility, safe-area, resume, performance, and balance findings.
4. Improve onboarding, help, settings, and contributor-facing documentation.
5. Promote stable builds from internal testing toward broader opt-in testing.

## Known gaps

- Alpha balance and bot pacing need broader player evidence.
- Device coverage is still small; performance and usability need measurement on lower-end hardware.
- Replays are enabled by the deterministic core but do not yet have a player-facing interface.
- Save compatibility is not guaranteed between alpha builds.
- Public store listings, final screenshots, localization, accessibility review, and production release operations are not complete.
- Multiplayer remains research, not a committed release.

## Direction after alpha

The existing single-player game will remain free. The near-term roadmap deepens campaigns, AI, accessibility, replays, content, and safe modding. If reliable official multiplayer becomes viable, the intended business model is a separate one-time purchase without ads, subscriptions, loot boxes, or pay-to-win mechanics.

See the public [roadmap](../ROADMAP.md) and [governance model](../GOVERNANCE.md) for how that direction can be challenged and refined.
