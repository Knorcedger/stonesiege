# Bannerfall — Project Plan & Status

_Last updated: 2026-08-02_

**Bannerfall** is an original mobile RTS that recreates the feel and depth of Age of Empires II
(economy → ages → armies → castles, counter-based combat, story campaigns). All art, text, and
code are original; AoE2 is a mechanics/balance reference only. Target platforms: iOS + Android
(via Capacitor), plus the browser for development.

Repository: `~/dev/bannerfall` · Play locally: `npm install && npm run dev` → http://localhost:5199

---

## The plan (how we're building it)

A deterministic simulation core cleanly separated from a PixiJS renderer, built in waves. Each
wave is a multi-agent workflow: parallel builders → an integrator that boots and plays the real
game in a browser → adversarial critics (art, gameplay, fidelity, UX) whose findings drive fixer
rounds, looping until clean. Everything is committed wave by wave; the sim stays integer-only and
determinism/tests stay green throughout.

**Tech stack (decided up front):** TypeScript · PixiJS 8 (WebGL) · custom deterministic sim
(20 ticks/s, fixed-point integers, command pattern — replay/lockstep-ready) · Vite · Vitest ·
procedural pixel-art pipeline (pngjs) · Capacitor for native builds. Single-root monorepo,
`@bf/*` path aliases, no per-package manifests.

**Packages:** `sim` (rules) · `data` (all unit/building/tech/civ stats) · `game` (renderer,
input, HUD, menus, audio) · `ai` (bots) · `scenarios` (campaign maps + trigger engine) ·
`tools/assetgen` (sprite generation) · `apps/web` (Vite entry).

---

## Status at a glance

| Phase | Status | Notes |
|---|---|---|
| Design pack | ✅ Done | GDD audited vs real AoE2; full data; Wallace campaign design; art bible |
| Wave 1 — engine, art pipeline, renderer | ✅ Done & verified | Playable vertical slice |
| Wave 2 — economy, combat, tech, HUD, scenario engine | ✅ Done & verified | Full macro loop to victory |
| Wave 3 — AI, campaign 2–6, menus, audio, snapshots | ✅ Done & verified | Feature-complete v1 |
| QA-until-dry | ⏳ Blocked | Critics hit the usage limit; **did not actually run** (see below) |
| Capacitor packaging (iOS/Android) | ⬜ Staged | Workflow written, not yet run |

**Health right now:** typecheck clean · **522 tests passing** (11 skipped, opt-in heavy sweeps) ·
deterministic sim well under its per-tick budget · zero console errors in the last full-loop
browser playthrough. Latest commit: command-intake hardening (see QA section).

---

## What's completed

### Design pack
- **GDD** (`docs/GDD.md`) audited against real AoE2 by a systems expert with web research — fixed
  a dozen mechanics inaccuracies (damage formula flooring, 3×3 farms, conversion rules, garrison
  arrow scaling, five blacksmith lines, shared drifting market rate, age-up requirements).
- **`docs/AOE2_REFERENCE.md`** — verified real AoE2 numbers for the whole v1 roster, for balancing.
- **Data pack** (`packages/data`) — 31 units, 21 buildings, 50+ techs, 2 civs (Scots/English),
  gaia resources, with integrity tests (upgrade chains, tech-tree cycle detection, age gating).
- **`docs/CAMPAIGN_WALLACE.md`** — 6-scenario design of _William Wallace: The Rising of Scotland_,
  historically grounded, original prose, doubling as the tutorial arc.
- **`docs/ART_BIBLE.md`** + **`docs/ASSET_CONTRACT.md`** — 48-colour palette, per-age building
  language, code-implementable sprite recipes, atlas naming/geometry, runtime player-colour swap.

### Wave 1 — foundation
- **Sim core**: seeded fair-start map generation, insertion-ordered entity store + spatial hash,
  budgeted group pathfinding (A*/Dijkstra flood, resumable), fixed-point movement with local
  avoidance, production/pop/housing, fog of war, structural state hash. Determinism verified over
  1000 scripted ticks; ~0.1–0.7ms/tick vs a 4ms budget.
- **Art pipeline**: parameterized humanoid/horse/siege rigs generating ~3,000 unit frames + ~106
  building frames into a single 2048px atlas; the generator reads its own contact sheets and
  self-critiques.
- **Renderer**: iso camera (pan/pinch/zoom, crisp integer scaling), chunked terrain, y-sorted
  world with animation + interpolation, fog overlay, full GDD touch scheme, DOM HUD, minimap.

### Wave 2 — the actual game
- **Combat**: exact AoE2 armour-class damage formula; real projectiles with accuracy, ballistics
  leading, mangonel splash + friendly-fire hold-fire; garrison arrows scaling with occupants;
  ram passenger bonuses; per-category auto-engage rules; deaths, corpses, kill credit.
- **Economy**: gathering with drop-off logic, hunting/herding (deer, sheep-stealing, wolves),
  3×3 farms with auto-reseed, construction with multi-villager speedup, villager flee-and-garrison.
- **Tech/ages**: every tech-effect kind applied through a per-player stat layer; age-ups enforcing
  the two-qualifying-buildings rule; live unit/building upgrades; civ tech-tree cuts.
- **Monks** (faith, conversion windows), **market** (global drifting rate + 30% fee), **wonder**
  and **conquest** victory.
- **Command card**: model-driven, civ-filtered, with honest disabled states, queues, age-up
  feedback, market panel, garrison flows, farm reseed.
- **Scenario engine**: ASCII-map loader with hard validation + deterministic trigger runtime.
- Verified with a headless boom→age-up→army→victory test _and_ a live browser match to a
  conquest-victory screen (incl. a 15-man rush correctly repelled by TC fire, then a ram assault).

### Wave 3 — feature-complete
- **AI** (`packages/ai`): economy + military managers, build orders, counter compositions from the
  bot's _own scouting_ (no fog cheating), attack waves per profile, resign-when-hopeless;
  easy/standard/hard; deterministic command streams; bot-vs-bot games as integration tests.
- **Campaign**: all six Wallace scenarios authored (maps, refs, full trigger scripts, hero units)
  with runtime playthrough tests; Stirling Bridge's 2-tile chokepoint, the Falkirk breakout, the
  Ettrick Forest finale with trebuchets.
- **Client**: title → Play → practice setup / campaign → briefing → game flow; objectives panel;
  dialogue banner queue; results + unlock; settings; procedural WebAudio SFX (13 synth voices +
  ambient); ?dev=1 speed toggle.
- **Sim**: versioned `serialize()` / `createGameFromSnapshot()` resuming byte-identically (for
  phone background/resume).

---

## What's left

### 1. QA-until-dry — **not yet actually done** (highest priority)
The QA workflow launched but **all 12 critic agents failed on the account usage limit**, so it
reported a _false_ "2 clean rounds" — nothing was actually inspected. Before it died, two critic
agents did land test files; one (`packages/sim/src/qafuzz.test.ts`) caught a **real robustness
bug**: `advance()` threw on hostile/malformed commands instead of dropping them silently.
**That bug is now fixed** (commit `005a8d2`) — command intake is a hard no-throw boundary
(rejects non-object commands, prototype-key kinds/def-ids, non-integer players/coords, missing
required fields, non-array units) and stays integer-only + snapshot-stable under garbage input.

**Still to run** (the real QA wave, when the limit resets): per round, 6 critics with distinct
lenses — desktop practice playtests vs standard/hard bots, phone-viewport campaign playthroughs
across all 6 scenarios, art critique, measured perf (tick p95, in-battle FPS, heap growth, bundle
size), equal-cost balance battles verifying the full counter web, and rotating code-health sweeps
— fixers by area, looping until two genuinely clean rounds. _Workflow script is written and
staged:_ `…/workflows/scripts/bannerfall-qa.js`.

### 2. Capacitor packaging — iOS + Android (staged, not started)
Wrap `dist/` with Capacitor: `com.bannerfall.app`, landscape orientation, app icons + splash from
the art pipeline, safe-area/notch handling, iOS WebAudio unlock, Android back-button → pause,
lifecycle snapshot-resume, DPR-aware crisp scaling, simulator smoke tests where toolchains exist,
and a `docs/MOBILE.md` with store-submission steps. _Workflow script staged:_
`…/workflows/scripts/bannerfall-capacitor.js`. **Will need from you:** an Apple Developer account +
signing, a Google Play account, and (optionally) your own bundle id.

### Roadmap (explicitly out of scope for v1)
Naval/water gameplay, elevation combat bonuses, formations & stances, trade carts, relics,
regicide, multiplayer (the deterministic core is already lockstep-ready), manual save/load UI,
more civs and campaigns, a music score.

---

## Current blocker

The multi-agent workflows are paused on the **account usage limit (resets Aug 8, 6am Europe/London)**.
Waves 1–3 are fully committed and the game is feature-complete and playable today; the remaining
QA and packaging waves are written and ready to launch when the limit resets. In the meantime the
game runs via `npm run dev`, and individual fixes (like the command-hardening above) can be done
directly.
