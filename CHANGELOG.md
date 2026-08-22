# Changelog

Notable player-facing and contributor-facing changes are recorded here. StoneSiege is still in alpha, so save compatibility and balance may change between builds.

## Unreleased

### Added

- Spoken campaign narration: the dialogue banner in campaign chapters is now read aloud with a
  slow, low delivery, with the narrator and each named character kept apart by ear. The banner
  waits for the voice to finish the sentence before moving on, and a tap dismisses the line and
  the voice together. Narration stops with the match — pausing, backgrounding the app, or
  finishing a chapter silences it.
- A **Narration** volume slider and a **Campaign narration** switch in Settings. Narration uses
  the voices already installed on the device — no download, and nothing is spoken when the switch
  is off, the volume is zero, the game is paused or in the background, or the device has no
  speech support.

### Changed

- Orders now land visibly on the thing you aimed them at, instead of only in the corner toast.
  Sending a villager to finish an unfinished house pulses that house's outline twice, and the
  site keeps an amber ring for the whole job — so the walk over no longer looks like a command
  that was dropped. The same pulse confirms gather, repair, garrison, convert and heal orders;
  attack orders pulse red. The pulse follows a target only while you can still see it, so
  ordering an attack on a fleeing enemy never traces its path through the fog. The undo toast
  names the building too: **Building House** and **Repairing Barracks** instead of a bare
  *Build* / *Repair*.

## 0.1.2 — 2026-08-20

### Added

- Anonymous gameplay statistics so the game can be improved with evidence instead of guesswork:
  app launches, menu screens visited, and matches started, resumed, and finished with their
  outcome, duration, and setup.
- A **Share anonymous gameplay stats** switch in Settings, on by default. Turning it off stops the
  analytics script from ever loading.

### Changed

- Reporting is cookieless: no cookie, no advertising identifier, and no persistent identifier. The
  client id is a random value held in session storage and discarded when the app closes, so it
  never follows anyone between visits. Google Signals and ad personalization are disabled, and the
  game stays fully playable offline and with reporting switched off.
- Corrected the store listing, store privacy declarations, iOS privacy manifest, and project
  documentation, all of which previously stated that the game contained no analytics.
- Kept the in-match HUD and overlays inside device safe areas without shrinking the battlefield.
- Refreshed public project, contribution, release-status, and roadmap documentation.
- Added automated Developer Certificate of Origin checks for pull requests.
- Added a lightweight sparse-checkout path for web contributors.
- Removed a generated QA bundle from version control.

## 0.1.1 — 2026-08-18

### Added

- Seven historically distinct civilizations with unique bonuses, rosters, Castle units, and technologies.
- Seven historical campaigns containing 48 focused chapters, including William Wallace's complete twelve-chapter arc.
- Seven AI difficulty levels from Beginner through Hardcore.
- Connected rivers and cliffs, functional friendly-only gates, expanded fortifications, and upgraded unit, building, construction, and animation art.
- Adjustable HUD scale, clearer touch command help, improved mobile selection and rally-point controls, and pause-menu save controls.
- Automated Android and iOS build, validation, metadata, and internal-testing upload workflows.

### Release status

- Browser: public alpha at [play.stonesiegegame.com](https://play.stonesiegegame.com).
- Android: version 0.1.1, build 6 for internal testing.
- iOS: version 0.1.1, build 5 for internal testing.
