# ScenarioOps — what the trigger engine needs from sim + game

`TriggerRuntime` (packages/scenarios/src/triggers.ts) drives campaign scripts. It never
touches the sim or the DOM directly: everything goes through one interface, `ScenarioOps`,
that the host (game screen) implements — sim-backed members over `@bf/sim`, UI members as
callbacks. This file is the contract for the sim/game teams. The authoritative TypeScript
interface is `ScenarioOps` in `src/triggers.ts`; this document explains the required
semantics.

## Wiring

```ts
const { start, meta } = loadScenario(wallace1, campaignGameData); // heroes merged in — see gap 1
const game = createGame({ seed, map: start, players: meta.playerSetups, popCap: meta.popCap });
const runtime = new TriggerRuntime(wallace1, ops); // ops closes over `game` + UI
// each frame step:
const events = game.advance(commands);
runtime.tick(events); // exactly once per sim tick, after advance()
```

Determinism: the engine is tick-based (`timerSeconds` uses `secondsToTicks` from
`@bf/sim/types`), holds no wall-clock or RNG state, and iterates triggers in definition
order. As long as `ScenarioOps` reads are pure functions of sim state, the whole thing
replays identically.

## Read side (sim-backed)

| Member | Semantics |
| --- | --- |
| `tick(): number` | Current sim tick (`GameState.tick`). Called during `TriggerRuntime` construction too — construct the runtime after the game. |
| `getEntityByRef(ref): EntityView \| null` | Resolve a scenario ref via `GameState.refs`. Return `null` when the ref is unknown, or the entity is dead/removed. Must keep resolving after `changeOwner` (ownership change is not death). `EntityView = { id, defId, player, tileX, tileY, hp }`. |
| `countEntities(query): number` | Count **live** entities matching every provided filter: `player` (exact, 0 = gaia), `defIds` (defId ∈ list), `area` (tile rect; an entity matches when its **anchor tile** `tileX/tileY` is inside — buildings by top-left; scripts author areas generously so anchor containment is fine). Counting rules: units count while alive (garrisoned units included, dying/corpse entities excluded); buildings count **only when fully built** (`buildProgress === 1000`) — "Build two Houses" must not complete on foundations; gaia resources count like any other entity (scripts filter with `player`/`defIds` wherever it matters, so no special-casing is needed). |
| `getAge(player): AgeId` | `PlayerState.age`. |
| `getResource(player, type): number` | `PlayerState.stockpile[type]`. |
| `hasResearched(player, techId): boolean` | `techId ∈ PlayerState.researchedTechs`. |
| `isDefeated(player): boolean` | `PlayerState.defeated`. |

## Write side (sim-backed)

| Member | Semantics |
| --- | --- |
| `spawn(entities: SpawnRequest[])` | Spawn immediately (same tick), exactly like `ScenarioStart.entities` placement (same shape: `defId/player/tileX/tileY/hp?/facing?/ref?/amountLeft?`). **Must register each `ref` in `GameState.refs`** so `getEntityByRef` resolves it from this tick on. If a tile is occupied, nudge to the nearest free tile (mapgen-style) rather than failing. |
| `changeOwner(refs, toPlayer)` | Transfer each ref'd entity to `toPlayer`. The engine only passes refs that are currently alive. Keep the entity id and ref mapping intact. |
| `revealArea(player, area)` | Mark the tile rect at least *explored* (ideally briefly *visible*) in `player`'s visibility mask. |
| `addResources(player, amounts)` | Add to the stockpile (amounts may be any integers; clamp at 0). |
| `setAiProfile(player, profile)` | Hand the profile (`passive/defender/raider/standard/aggressive`) to `@bf/ai`. **AI lands in wave 3 — a no-op is fine until then.** |
| `aiAttackNow(player, targetArea?)` | Tell the bot to attack now, optionally toward `targetArea`. **No-op until wave 3.** Scripted-wave scenarios still work: `spawn` does the spawning; this only aims the units. |

## Host/UI callbacks (game screen implements)

| Member | Semantics |
| --- | --- |
| `message({ text, speaker?, portrait? })` | Queue a dialogue banner. May arrive several per tick (intro sequences) — queue, don't overwrite. |
| `panCamera(tileX, tileY)` | Scripted camera pan (smooth-scroll, don't teleport). |
| `objectiveAdded(id, text)` | New objective for the HUD list. Fires at most once per id (engine is idempotent). |
| `objectiveCompleted(id)` / `objectiveFailed(id)` | Latched: at most one resolution per id, ever. |
| `playSting(sting)` | `'horn' \| 'victory' \| 'defeat' \| 'alert'` audio sting. |
| `victory()` / `defeat(reason?)` | End of scenario. The runtime stops evaluating permanently after either; the host owns the end screen (and campaign unlock on victory). |

## Engine guarantees (so ops can stay dumb)

- `armTrigger` no-op rules, objective idempotency/latching, `timerSeconds`-since-armed,
  fire-once vs `loop` — all enforced inside `TriggerRuntime` per the schema comments.
- `refDestroyed` latches: once a tracked ref's entity dies (detected via `entityDied`
  events same-tick, plus a `getEntityByRef` null-poll fallback), it stays destroyed.
- `changeOwner` is pre-filtered to live refs; `spawn` ref bookkeeping is engine-side.
- After `victory()`/`defeat()`, `tick()` is a permanent no-op.

## Known gaps / asks — ALL CLOSED (wave 3)

1. **Hero defs** — CLOSED. `heroWallace` & co. (docs/CAMPAIGN_WALLACE.md Appendix A) are
   canonical `@bf/data` units now (packages/data/src/units.ts). The placeholder defs in
   `src/heroes.ts` are inert: the `campaignGameData` merge prefers `@bf/data`, so loading
   with `loadScenario(def, campaignGameData)` keeps working unchanged.
2. **Per-player pop caps** — CLOSED. The sim honors `PlayerSetup.popCap` (min'd with the
   global `GameConfig.popCap` in `recomputePopCap`), and the loader now maps
   `ScenarioPlayer.popCap` onto `meta.playerSetups[i].popCap`. `meta.popCap` remains the
   max across players and should still be passed as the global `GameConfig.popCap`.
3. **`maxAge` tech ceiling** — CLOSED. The sim enforces `GameConfig.maxAge` at research
   intake AND inside ageUp (freeTech chains cannot bypass it). Pass `meta.maxAge` into
   `GameConfig.maxAge` (the game's `scenarioConfig` in packages/game/src/simBridge.ts
   already does).
