# StoneSiege — Architecture

## Big picture
```
apps/web  ──► @bf/game (Pixi renderer + input + HUD + menus)
                 │  issues Command[]           reads state, consumes SimEvent[]
                 ▼
              @bf/sim (deterministic simulation, fixed timestep 20 ticks/s)
                 ▲                                   ▲
              @bf/ai (bots issue Commands)        @bf/data (all stats)
              @bf/scenarios (maps + triggers feed sim config; trigger engine runs on events/state)
```

## Simulation (`packages/sim`)
- **Fixed timestep**: `TICKS_PER_SECOND = 20`. `game.advance(commands)` steps exactly one tick
  and returns `SimEvent[]` for renderer/audio/triggers/AI.
- **Determinism**: integer-only state; positions are fixed-point (`FP = 256` per tile); seeded
  RNG (`SimRng`, PCG/LCG); no wall clock; stable iteration order. Same seed + same command
  stream ⇒ identical game. This enables headless bot-vs-bot integration tests, replays, and
  future lockstep multiplayer.
- **Command pattern**: all player/AI intent enters as `Command` objects applied at tick
  boundaries. Human and bot players are indistinguishable to the sim.
- **Entities**: single `Entity` record (units, buildings, resource objects) in an insertion-
  ordered Map + spatial hash grid for range queries. Scale target: ≤ ~600 live entities.
- **Systems** (each its own module, registered in the tick pipeline):
  movement (A* on tile grid + local steering), gathering, construction, production/research,
  combat (targeting, projectiles, armor-class damage), garrison, conversion/healing,
  fog-of-war/visibility per player, victory conditions.
- **Tech effects**: `TechEffect[]` from `@bf/data` are applied to per-player *modified stat
  tables* (base defs never mutate). All stat reads go through the player's stat table.

## Renderer (`packages/game`)
- PixiJS v8. Layers: terrain (chunked, baked to render textures, redrawn only on change),
  ground overlays (farms, foundations, rubble), y-sorted world layer (units/buildings/trees,
  depth = isometric y), projectiles/effects, fog overlay (explored/visible alpha grid),
  selection rings + health bars, DOM HUD on top.
- Isometric projection: tile (x, y) → screen ((x−y)·32, (x+y)·16); 64×32 diamond tiles,
  integer zoom scaling with nearest-neighbor for crisp pixel art.
- Interpolation: renderer runs at rAF; entity positions lerp between last two sim ticks.
- Minimap: offscreen canvas, terrain baked once, entities/fog refreshed ~4 Hz.
- HUD is DOM (fast to build, crisp text, natural touch targets); game world is canvas.

## Data (`packages/data`)
All unit/building/tech/civ stats as typed TS objects validated by schema + tests. AoE2 serves
as the reference balance model. Nothing gameplay-affecting is hardcoded in sim — sim reads defs.

## Scenarios (`packages/scenarios`)
Scenario = ASCII terrain grid (legend → tokens) + explicit entity placements (+ optional `ref`
names) + players (civ, stockpile, AI profile, diplomacy) + triggers (conditions ⇒ effects) +
briefing text. The trigger engine evaluates each tick against sim state/events.

## AI (`packages/ai`)
Bot = per-player controller. Economy manager (villager allocation targets by age/strategy,
build orders), military manager (army composition vs scouted enemy, attack waves, defense),
expansion manager. Reads only what the sim exposes (honors fog at higher difficulties is a
roadmap item; v1 bots use full state but throttled APM and scripted pacing per difficulty).

## Asset pipeline (`tools/assetgen`)
Procedural original pixel-art generation (pngjs; custom rasterizer — no native deps).
Outputs Pixi spritesheet atlases (PNG + JSON) into `apps/web/public/assets/` (committed).
Contract in `docs/ASSET_CONTRACT.md`; style rules in `docs/ART_BIBLE.md`.

## Testing
- Unit tests per system (vitest, headless — sim has zero DOM deps).
- Determinism test: same seed/commands twice ⇒ deep-equal state hash.
- Integration: full bot-vs-bot headless games run to a victory event under N ticks.
- Data validation tests: every def schema-valid, all references resolve, tech tree acyclic.
- Visual QA: Playwright drives the dev server; screenshots evaluated by review agents.

## Mobile packaging
Capacitor 8 wraps the same `dist/` bundle for Android and iOS. Native wrappers provide landscape
orientation, lifecycle snapshots, Android Back handling, safe-area integration, and generated
app icons/splashes while gameplay remains offline in the WebView. `npm run mobile:sync` rebuilds
the web bundle and synchronizes both native projects; platform signing stays outside Git. See
`docs/MOBILE.md` for local builds and official-release boundaries.
