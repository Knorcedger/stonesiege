# Changelog

Notable player-facing and contributor-facing changes are recorded here. StoneSiege is still in alpha, so save compatibility and balance may change between builds.

## Unreleased

### Fixed

- Militia, men-at-arms, longswordsmen, champions, and the campaign heroes drawn as champions now
  walk instead of gliding backwards. Their authored movement sheet held one standing pose in every
  cell, so once the sheet's sideways drift was corrected there was no gait left in it: the legs
  were frozen and the little motion that remained ran the wrong way. The build now gives that
  family a real cycle — the planted foot stays put on the ground while the body passes over it,
  and the trailing foot lifts and swings through.
- The procedural fallback rig, used when the HD art is unavailable, walked backwards in every
  direction: its planted foot travelled with the unit instead of against it, and the rear-facing
  cycle read its foot heights from the front-facing table.

### Added

- Campaign heroes now stand out from the troops around them. William Wallace and every
  other named hero wear their own colour, draw noticeably larger, and carry their own
  star marker — one on the ground at their feet, one floating above them — plus a pip
  on the minimap, so the one unit a chapter can be lost with is findable at a glance.
  Player colours are unchanged, so a hero still shows whose side he is on.
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
- Spoken campaign narration: the dialogue banner in campaign chapters is now read aloud, in the
  English (UK) **Martha** voice where the device has her and the best English voice installed
  otherwise. Lines are read in phrases with silence held between them rather than at a forced low
  pitch, which is what made earlier builds sound synthetic, and the narrator and each named
  character stay apart by ear. The banner waits for the voice to finish the sentence before moving
  on, and a tap dismisses the line and the voice together. Narration stops with the match —
  pausing, backgrounding the app, or finishing a chapter silences it.
- Recorded campaign voice-over. Spoken dialogue plays from audio committed under
  `apps/web/public/assets/vo/`, so every device hears the same performance instead of whatever
  voice it happens to have installed. Anything without a recording — dialogue written since the
  last render, or a device that could not fetch the manifest — is still read by the device's
  synthesizer, line by line, so nothing goes silent. `npm run vo:render` regenerates the audio on
  macOS; `npm run vo:render -- --list` reviews the lines anywhere.
- A **Narration** volume slider and a **Campaign narration** switch in Settings, with a hint
  naming the Martha voice the campaign is written for. Narration uses the voices already installed
  on the device — no download is required, and nothing is spoken when the switch is off, the volume
  is zero, the game is paused or in the background, or the device has no speech support.

### Changed

- Gameplay statistics now go to StoneSiege's own aggregate reporting service instead of Google
  Analytics. Events use one session-scoped random ID and a separate per-match join ID, with no
  cookie, account, advertising identifier, or persistent person/device identifier. Turning off
  **Share anonymous gameplay stats** stops all gameplay analytics requests.
- Updated the public privacy and store disclosures for the first-party service, its two-year raw
  event retention, and its Railway/MongoDB Atlas infrastructure. The service stores no IP address.
- Roads look their age, and behave like roads. A road is now a ribbon of worn earth laid
  over the ground rather than a row of tile-shaped patches: it has a crown polished pale by
  traffic, two cart ruts that wander and break, damp shoulders, weeds, and a frayed edge that
  narrows and widens along its length. Its centre line meanders from tile to tile, turns are
  drawn as curves, and a road authored as a curve reads as one continuous diagonal instead of
  a staircase — no more right-angle corners. Roads wider than one tile merge into a single
  band. Road earth is a step darker than sand, so a road running down to a river no longer
  merges into the bank. Every other terrain border wanders too: the baked edge fringes follow
  a noise-broken boundary with scattered outliers instead of a straight three-band ramp, with
  two variants per pair and edge picked by tile. No more machine-cut terrain edges.
- River crossings are visible as crossings. A shallows band that spans a channel now draws as
  a ford — a gravel causeway lying under shin-deep water, with stepping stones standing out of
  it — so a player following a road to the water can see where the army wades across. Deep
  water is unchanged, and nothing about movement, pathing, or the minimap changes.
- Every campaign road is laid on a curve. The Wallace chapters' roads — Lanark's two streets,
  the Perth road to the Tay ford, the Tyne valley's bridge approaches and the Newcastle relief
  road, the Falkirk approaches, the Forest roads to the Clyde — now wander to where they are
  going instead of running in straight legs that meet at right angles. Bridges and causeways
  keep their authored straight spans, roads still reach every place they reached before, and
  no tile's passability changes.
- The historical battlefield map (every generated legendary chapter) has a road that curves
  from the camp to the ford and on to the objective, instead of straight runs meeting at right
  angles — and it no longer runs down the middle of the river. The route through the channel is
  water the whole way, and the road stops at one bank and resumes on the other. Every tile
  carries exactly the same traffic as before.
- Every chapter in every campaign now carries story while it is being played, not only an opening
  and a closing line. The twelve William Wallace chapters gained 57 new spoken beats; the six
  legendary campaigns gained 72, and their missions are no longer narrated end to end by a single
  "Chronicle" voice — Henry, Joan, Charles VII, Temüjin, Bohemond, Richard the Lionheart and the
  rest speak for themselves.
- Chapter briefings state what is lost if the chapter fails, rather than repeating the line that
  sets the scene.
- Battles can be read by ear. Every blow used to play the same steel clash, so a battering ram
  pounding a Town Center sounded exactly like two swordsmen trading hits, and arrows and boulders
  landed in silence. Now the sound is the weapon plus what it lands on: a ram booms into a gate
  and crushes when it catches a body, swords clash on armor but chop into timber, pikes thrust
  and knock, cavalry sabres carry the weight of the horse, villagers strike with tools and wolves
  bite. Arrows thud into flesh and thunk into wood, crossbow bolts punch, and mangonel and
  trebuchet stones crush bodies or shatter masonry. Siege carries further than hand weapons, so a
  ram working on your walls is audible before it is on screen — and a trebuchet no longer looses
  its stone with the twang of a bow.
- Orders now land visibly on the thing you aimed them at, instead of only in the corner toast.
  Sending a villager to finish an unfinished house pulses that house's outline twice, and the
  site keeps an amber ring for the whole job — so the walk over no longer looks like a command
  that was dropped. The same pulse confirms gather, repair, garrison, convert and heal orders;
  attack orders pulse red. The pulse follows a target only while you can still see it, so
  ordering an attack on a fleeing enemy never traces its path through the fog. The undo toast
  names the building too: **Building House** and **Repairing Barracks** instead of a bare
  *Build* / *Repair*.
- Soldiers answer a tower together. A man shot while standing with his squad used to charge
  the tower alone while everyone beside him watched; now whatever struck him pulls in the
  troops inside their guard circle, and they set off with him instead of trickling in one at a
  time. Ordering an assault on a building still sends exactly the units you sent — nobody
  parked nearby gets dragged along.

### Fixed

- Frame rate no longer degrades as your army grows. The renderer used to compare every object on
  the map against every visible soldier each frame, so the game ran smoothly with a scouting
  party and began to stutter at around twenty troops. Per-frame renderer cost on a walked
  120x120 map dropped from ~13 ms to under 2 ms, and it no longer rises with army size. Tapping
  to select is faster for the same reason.
- Siege engines and soldiers now roll right up against the building they are attacking. They
  used to stop wherever the approach walk ended — up to a tile of open ground short of the wall,
  worst on the diagonal — and swing at nothing.
- One attack animation per attack. Every unit looped its half-second swing continuously, so a
  Battering Ram flailed ten times for each blow it actually landed and read as if it barely
  scratched a house. It now winds up, slams once, and holds its ready pose until the next hit
  (its damage is unchanged: 152 to a house, four hits to bring one down).

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
