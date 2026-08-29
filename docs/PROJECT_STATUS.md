# StoneSiege project status

_Last updated: 2026-08-29_

StoneSiege is a playable single-player RTS in **alpha**. The public browser build and internal Android and iOS builds share one offline game bundle and the same deterministic simulation.

## Release snapshot

| Area | State |
|---|---|
| Browser build | Public at [play.stonesiegegame.com](https://play.stonesiegegame.com) |
| Android | Version 0.1.2, build 7 configured for Google Play internal testing |
| iOS | Version 0.1.2, build 6 configured for TestFlight internal testing |
| Website | Live at [stonesiegegame.com](https://stonesiegegame.com) |
| Repository | Public at [github.com/Knorcedger/stonesiege](https://github.com/Knorcedger/stonesiege) |
| Accounts, ads, purchases | None in the current build |

The current store builds have no accounts, advertising, cross-app tracking, purchases, or push notifications. They can report anonymous gameplay statistics to the first-party StoneSiege service — app launches, menu screens, and match start/resume/end with outcome, duration, setup, match statistics, platform, and app version. No cookie, advertising identifier, persistent person/device identifier, or IP address is stored. A random session ID is discarded when the app closes; a separate match ID joins only one match lifecycle. Raw events are retained for up to two years on Railway/MongoDB Atlas infrastructure. Players can turn reporting off under **Settings → Share anonymous gameplay stats**, after which no gameplay analytics request is sent. Campaign progress, settings, and resumable matches remain on-device. This must be reassessed before any further online feature or SDK is added.

## What is playable

- Practice/skirmish matches against one to three AI opponents, each selectable across seven difficulty levels from Beginner to Hardcore
- Seven historical campaigns with 48 chapters: twelve for William Wallace and six each for Henry V, Harald Hardrada, Joan of Arc, Chinggis Khan, Alexios Komnenos, and Saladin
- Seven playable civilizations: Scots, English, Vikings, French, Mongols, Byzantines, and Saracens, with distinct bonuses, rosters, Castle units, and technologies
- Full economy loop: villagers, four resources, farms, drop-offs, construction, production, market, and age advancement
- Counter-based combat: melee, ranged, cavalry, siege, monks, conversion, projectiles, garrisoning, gates, and fortifications
- Fog of war, rivers, cliffs, scenario triggers, objectives, multiple victory conditions, snapshots, and interrupted-match recovery
- Touch-first mobile controls and desktop mouse/keyboard controls
- Landscape-native Capacitor wrappers with generated icons, splashes, safe-area handling, and offline fonts/assets

See the [campaign and chapter index](CAMPAIGN_INDEX.md) for every selectable chapter, its chronology, protagonist, civilization, mission type, and source file.

## Technical health

- Strict TypeScript typecheck passes
- Production Vite build passes
- 768 deterministic unit, integration, scenario, and performance checks pass in the default suite; 11 optional heavy-sweep tests remain skipped by default
- The simulation uses a fixed 20 Hz timestep, integer state, seeded randomness, and stable command processing
- Headless bot games, campaign loading, asset contracts, and determinism checks are part of the normal test suite
- Pull requests must pass typecheck, tests, production build, review, and DCO sign-off checks before merge

## Current priorities

1. Run structured playtests on representative phones and tablets, including every campaign.
2. Fix high-impact input, accessibility, safe-area, resume, performance, and balance findings.
3. Maintain scoped public issues and responsive review for new contributors.
4. Improve onboarding, help, settings, localization, and accessibility infrastructure.
5. Promote stable builds from internal testing toward broader opt-in testing.

## Known gaps

- Alpha balance and bot pacing need broader player evidence.
- Device coverage is still small; performance and usability need measurement on lower-end hardware.
- Replays are enabled by the deterministic core but do not yet have a player-facing interface.
- Save compatibility is not guaranteed between alpha builds.
- Mobile production approval, localization, a complete accessibility review, and production release operations are not complete.
- The full repository includes large HD source-art and store-media archives; a lightweight sparse-checkout path is documented for ordinary web contributors.
- Multiplayer remains research, not a committed release.

## Direction after alpha

The existing single-player game will remain free. The near-term roadmap deepens campaigns, AI, accessibility, replays, content, and safe modding. If reliable official multiplayer becomes viable, the intended business model is a separate one-time purchase without ads, subscriptions, loot boxes, or pay-to-win mechanics.

See the public [roadmap](../ROADMAP.md) and [governance model](../GOVERNANCE.md) for how that direction can be challenged and refined.
