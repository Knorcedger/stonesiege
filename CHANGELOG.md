# Changelog

Notable player-facing and contributor-facing changes are recorded here. StoneSiege is still in alpha, so save compatibility and balance may change between builds.

## Unreleased

### Added

- **Campaign prologues and epilogues.** Every campaign now opens on an artwork page explaining
  the situation the chapters are about — for William Wallace, what Edward I had already done to
  Scotland by 1297 — shown the first time the campaign is opened and re-readable from the chapter
  list at any time. Finishing the last chapter of a campaign opens its closing page instead of
  dropping you back on a list of completed chapters.
- **Chapter aftermath pages.** Winning a campaign chapter now shows what the victory actually
  changed — historically, not just numerically — before the statistics panel. Where a mission
  compresses or dramatizes the record, the page says so.
- **Difficulty ratings.** Every chapter carries a 1–5 rating with a rank name and a line saying
  what makes it hard. Ratings appear on campaign cards, on every chapter row (including locked
  ones), and on the briefing. A campaign's own rating is derived from its chapters.
- **Briefings that introduce the people in them.** Each chapter briefing now opens with what is
  at stake if it is lost, and lists who you are fighting with and against, so the names in the
  dialogue mean something the first time they are spoken.
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

- The twelve William Wallace chapters now carry story while they are being played, not only an
  opening and a closing line: the campaign gained roughly fifty new spoken beats covering the
  political situation, the arguments between Wallace and his captains, and what each fight was
  for.

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
