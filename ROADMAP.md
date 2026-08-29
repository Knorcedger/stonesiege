# StoneSiege product roadmap

StoneSiege is an open-source historical RTS in alpha. The browser and Android builds are
public; iOS is coming soon. This is a living product plan, not a promise of dates. Priorities
should move when playtests, performance measurements, or contributor evidence show a better
order.

The next major mode is provisionally called **Grand Conquests**: a collection of handcrafted,
asymmetric adventures that start from an unusual strategic situation rather than a standard
Dark Age opening. The first proposed adventure, **The Occupied Realm**, places the player in
Castle Age on a very large map while an established empire controls roughly half the territory.
The player must build a viable state, take fortified provinces, break the empire's economy, and
defeat its capital.

Grand Conquests is a design target, not yet an implementation task. The world, scale, AI, save,
and scenario-tool foundations below come first.

## What already exists

- Practice matches against one to three bots on 96×96, 120×120, and 144×144 maps
- Seven civilizations, seven AI difficulties, seven historical campaigns, and 48 chapters
- Deterministic economy, construction, ages, technologies, formations, siege, conversion,
  garrisoning, fog of war, gates, and several victory conditions
- Procedural rivers with guaranteed fords and procedural cliff ridges with guaranteed passes
- Deep water and shallows as terrain types; deep water is currently impassable
- Scenario maps, objectives, dialogue, timed and event-driven triggers, allied teams, and AI
  profiles
- One autosaved resumable match per campaign plus one for practice, with the pause overlay
  reporting the last autosave time and deterministic restoration
- Touch-first controls, native mobile wrappers, HD runtime art, and automated quality gates
- Optional first-party gameplay analytics with no account or persistent person/device identifier

## Gap audit

| Area | Current state | Missing capability |
|---|---|---|
| Rivers | One procedural river, fixed broad fords; authored scenarios can paint water and road-tile bridges | River variety, tributaries, mouths, waterfalls, destructible/buildable bridges, and strategic crossings |
| Cliffs | Impassable ridge tiles with open passes | True elevation levels, ramps, high-ground combat, cliff-edge visuals, and elevation-aware line of sight |
| Sea and coasts | Deep water and shallows render but have no gameplay | Coastlines, beaches, navigable water, shore validation, waves, and sea map generators |
| Naval play | None | Docks/ports, fishing, transports, warships, naval combat, naval technologies, and naval AI |
| Map variety | One Arabia-style practice generator | Coastal, islands, riverlands, highlands, forest, desert, snow, and scenario-specific generators |
| Map scale | Largest tested preset is 144×144; architecture targets roughly 600 live entities | A measured Huge tier, higher entity budgets, bounded pathfinding cost, and dormant/off-screen region simulation if required |
| Fortifications | Stone walls and functional friendly-only gates; gates use a one-tile simulation footprint | Proper multi-tile gates, reliable wall corners/joins, palisades, stronger fortification tools, and bridge/gate interactions |
| Economy | Four resources, farms, drop-offs, market exchange, and finite mines | Trade routes, carts and trade ships, ports, fish, relic-like strategic income, tribute, and supply objectives |
| Tactics | Three formations, attack-move, garrisoning, siege, and category-based auto-engagement | Patrol/guard commands, player-selectable stances, waypoints, richer siege options, and naval formations |
| Civilizations | Seven civs with bonuses, roster cuts, renamed shared units, unique units, and unique techs | More distinct core troop stats/art, architecture sets, naval identities, broader tech-tree asymmetry, and civ-specific audio |
| AI | Seven deterministic levels, fog-honest memory, economy, counters, siege, monks, scouting, and attack profiles | Multi-base planning, territorial defense, naval play, transport landings, province strategy, supply pressure, and an empire-scale director |
| Scenarios | ASCII maps plus fixed entities and a deterministic condition/effect trigger graph | Visual authoring, reusable regions, variables/counters, choices, branching objectives, capture zones, province state, and reusable templates |
| Long games | One autosaved resumable match per campaign, plus practice, on the current device | Named saves, per-chapter checkpoints, versioned migrations, a player-facing replay browser, and clearer failure recovery |
| Presentation | HD units/buildings, effects, synthesized SFX, and ambient audio | Full music score, richer biome ambience, naval/elevation art, complete civilization art sets, and cinematic transitions |
| Reach | English UI and limited device evidence | Localization infrastructure, full accessibility audit, more device coverage, and sustained performance telemetry without invasive tracking |
| Community play | Source is public; game data and deterministic systems are modular | Supported scenario/mod packaging, safe validation, discovery/import UX, and compatibility rules |
| Multiplayer | Deterministic core makes research possible | Networking, desync tooling, accounts, matchmaking, moderation, privacy, hosting, and a sustainable operating model |

## Phase 0 — keep the alpha healthy

This remains continuous work while new systems are designed.

- Triage player reports and complete representative Android, iPhone, iPad, and browser QA.
- Fix campaign blockers, input friction, accessibility issues, save failures, and low-end device
  performance before expanding the simulation.
- Establish repeatable CPU, memory, load-time, battery, pathfinding, and entity-count benchmarks.
- Playtest all seven AI levels and the complete counter system with real players.
- Keep source, asset provenance, store metadata, contributor documentation, and quality gates
  release-ready.

**Exit signal:** the existing game is stable enough that a new terrain or scenario-system bug
can be distinguished from old alpha instability.

## Phase 1 — world and scale foundation

This phase turns the current obstacle tiles into a world system that later land and naval modes
can share.

### Maps and performance

- Add a benchmark-only Huge map target, beginning at 192×192. Do not expose it to players until
  mobile memory, initial load, minimap, fog, rendering, and pathfinding budgets pass.
- Profile 600, 800, 1,000, and 1,500-entity battles. Choose a supported cap from measurements,
  not appearance.
- The initial headless 192×192 sweep and report format are available through
  `npm run benchmark:huge`; renderer and representative mobile-device measurements are still
  required before exposing a Huge tier. See [performance benchmarks](docs/PERFORMANCE_BENCHMARKS.md).
- Introduce hierarchical or region-aware pathfinding if a flat search cannot meet the budget.
- Investigate deterministic dormant regions for distant imperial provinces rather than running
  every remote villager and patrol at full frequency.
- Add map validation reports for starting safety, resources, buildable space, chokepoints, and
  movement-component connectivity. The deterministic Practice land profile and contributor sweep
  are available through `npm run validate:maps`; new terrain families still need purpose-built
  profiles. See [map validation reports](docs/MAP_VALIDATION.md).

### Terrain

- Expand rivers into reusable generator features: narrow and wide rivers, tributaries, deltas,
  mouths, fords, and authored bridge sites.
- Add real bridge terrain/entities with correct movement, destruction, repair, and path updates.
- Replace purely blocked cliff strips with elevation levels, explicit ramps, high-ground line of
  sight, and modest combat advantages that remain readable on mobile.
- Add biome definitions and a first map family: Inland, Riverlands, Highlands, Coastal, and
  Islands. Desert and snow variants follow once their resources and art are complete.
- Add coast and beach transitions between land, shallows, and deep water.

### Fortifications

- Replace the one-tile gate simplification with multi-tile gates large enough for formations to
  pass through, while preserving friendly-only opening and deterministic pathing.
- Make wall segments, inner/outer corners, towers, and gates snap and render as one fortification
  line.
- Add palisades as a cheaper early defensive option after the stone system is reliable.

**Exit signal:** a 192×192 land map with several fortified regions can be generated or authored,
validated, saved, restored, and played on supported mobile hardware without pathing deadlocks.

## Phase 2 — strategic scenario foundation

Grand Conquests needs a strategic layer that the current chapter trigger graph does not express
cleanly.

- Add named map regions and province ownership.
- Add capture rules for towns, forts, ports, and civic landmarks. Capturing must be distinct from
  converting an individual unit.
- Add deterministic scenario variables, integer counters, flags, reusable trigger groups, and
  region-entered/region-captured conditions.
- Add effects for changing diplomacy, enabling/disabling production, granting reinforcements,
  changing objectives, and modifying province behavior.
- Support neutral settlements, allied factions, tribute demands, defections, rescues, and
  optional objectives without forcing every story through entity-destruction checks.
- Add a visual or data-assisted map-authoring tool. Very large maps should not be maintained as
  hundreds of hand-counted ASCII rows.
- Add scenario linting for inaccessible objectives, invalid dock sites, sealed land regions,
  missing references, impossible victory states, and unsupported entity budgets.
- Add named local saves and scenario checkpoints on top of the per-campaign slots, for players
  who want more than one save per campaign. Continue to keep all progress on-device unless a
  future online design is explicitly approved.

**Exit signal:** a contributor can author a large province-based scenario, validate it, and test
its complete objective graph without editing engine code.

## Phase 3 — large-war AI

The established empire must feel organized, not like a standard bot given excessive resources.

- Add multi-base economy and rebuild planning.
- Give each AI defensive regions, garrisons, rally routes, reserve armies, and strategic targets.
- Add an empire director that allocates regional budgets and reinforcements while ordinary bots
  continue controlling local economy and combat.
- Make the empire respond to lost provinces, threatened roads, broken gates, raids, and siege
  preparations.
- Add coordinated attacks from more than one front without allowing impossible omniscience.
- Scale difficulty through planning quality, reaction cadence, composition, reserve timing, and
  economic efficiency. Avoid hidden combat-stat bonuses as the default answer.
- Add deterministic headless sweeps for stalemates, unreachable targets, runaway production,
  save/restore divergence, and acceptable match completion rates.

**Exit signal:** across a representative seed/scenario suite, the empire can defend several
provinces, reinforce a threatened frontier, rebuild selectively, and eventually lose or win
without freezing, cheating through fog, or exhausting the pathfinding budget.

## Phase 4 — Grand Conquests land vertical slice

Add a third top-level play option beside Practice and Historical Campaigns.

### Mode identity

- **Name:** Grand Conquests (working title)
- **Format:** handcrafted, asymmetric, replayable adventures
- **Difference from Historical Campaigns:** fewer but much larger scenarios, less linear
  scripting, several viable expansion routes, and a persistent strategic situation within each
  adventure
- **Difference from Practice:** authored factions, provinces, objectives, starting empires, and
  bespoke victory conditions

### First adventure — The Occupied Realm

- Start the player in **Castle Age** with one defensible settlement, a modest workforce, and a
  small mixed army. This avoids repeating the standard Dark Age opening.
- Use a measured Huge map rather than automatically choosing the largest imaginable dimensions.
- Let the empire control roughly 45–55% of the map through four to six provinces, roads,
  fortified crossings, resource districts, reserve armies, and a capital.
- Give the player several opening strategies: secure nearby neutral towns, raid supply routes,
  seize mines, break a frontier fortress, or ally with a local faction.
- Make province loss weaken real imperial capabilities: taxes/resources, unit access, patrol
  frequency, reinforcement routes, or naval reach in later adventures.
- Use staged victory: establish the resistance, take the frontier, break the imperial economy,
  then besiege the capital. Do not require hunting one hidden villager across a huge map.
- Target a long but resumable adventure, with checkpoints and a clear “next strategic move” when
  returning after a break.

**Exit signal:** one polished land-only Grand Conquest is fun through repeated playtests at
multiple difficulties. Naval play is not required to prove the mode.

## Phase 5 — water and naval vertical slice

Naval play is a complete gameplay pillar, not a set of decorative ship sprites.

### Simulation and maps

- Add movement domains for land, shallow/amphibious, and naval units.
- Add coast-aware building footprints so docks connect a valid land tile to a valid water
  component.
- Replace the old “all land must be connected” invariant with domain-aware validation: intended
  land components must have a ford, bridge, transport route, or explicitly optional status.
- Ensure every naval start has wood, food, build space, at least one legal dock site, and access
  to the objectives/resources needed to finish the match.
- Add water occupancy, naval collision/steering, shore targeting, transport loading, unloading,
  and safe landing-site selection.

### Economy and buildings

- Add shore fish and deep-water fish.
- Add Fishing Boat and fish drop-off behavior.
- Add a Feudal-age Dock for fishing, transport, and early military ships.
- Add a Castle-age Port/Harbor layer for trade, upgrades, stronger defenses, and late naval
  production. Final names should be historically and mechanically clear.
- Add trade ships only after ordinary naval movement and transports are reliable.

### Initial fleet

- Fishing Boat
- Transport Ship
- Galley line as the baseline ranged warship
- Fire Ship as the close-range anti-ship counter
- Demolition Ship only if readable, controllable, and fair on touch screens
- One historically researched signature ship for the strongest naval civilizations after the
  shared counter triangle is balanced

### Naval AI and UX

- Teach bots when to dock, fish, contest water, escort transports, choose landing sites, and
  abandon a losing sea investment.
- Add fleet selection, naval formations, embark/disembark controls, dock rally behavior, shore
  warnings, and water information on the minimap.
- Build a small coastal scenario first, then a transport scenario, then a true islands match.

**Exit signal:** a bot can play and finish a deterministic islands match using fishing,
transports, and a balanced fleet; a human can control the same match comfortably on a phone.

## Phase 6 — expand Grand Conquests

After the land and naval vertical slices are proven, add adventures that combine the systems in
different ways.

- **The Island Crown:** overthrow a naval power across an archipelago.
- **The River Kingdoms:** control bridges, fords, ports, and river trade while choosing which
  local rulers to support.
- **The Broken Marches:** defend and rebuild a frontier while a larger empire attacks through
  mountain passes.
- **The Great Migration:** begin without a permanent capital, move a population across the map,
  then claim and defend a homeland.
- Add optional mutators only after the authored experiences work: randomized province bonuses,
  alternate capitals, different allied factions, and escalating empire personalities.

Every adventure should state whether it is historical, historically inspired, alternate
history, or wholly fictional. Historical framing and unit/ship art require cited research.

## Phase 7 — deepen the core RTS

These improvements are valuable, but most are not blockers for the first Grand Conquest.

- Trade carts, trade routes, and tribute economy
- Relics or historically appropriate strategic artifacts/sites
- Regicide and king-protection victory modes
- Patrol, guard, waypoint, and selectable stance controls
- More siege interactions, including bridges, walls, and naval fortifications
- Civilization-specific architecture, core troop silhouettes/animations, naval rosters, and
  historically grounded audio
- Dynamic weather and seasonal visuals only when they improve decisions and remain readable
- Music score, richer ambience, voice treatment, localization, and accessibility expansion
- Player-facing replay browser, match statistics, and sharable deterministic replay files
- Supported scenario/mod packages with provenance, compatibility, and safety validation

## Later — investigate fair multiplayer

- Prototype deterministic lockstep networking, reconnection, spectators, and desync diagnosis.
- Threat-model accounts, matchmaking, abuse prevention, privacy, moderation, and operating cost.
- Run small community tests before promising an official service.
- If viable, keep the existing single-player game free and ship official multiplayer under the
  project's published fair-monetization principles.

Multiplayer must not delay the single-player world, naval, AI, or Grand Conquests roadmap.

## Recommended order

1. Keep alpha quality work running continuously.
2. Complete world/scale benchmarks and the fortification foundation.
3. Build province/scenario tools and long-game saves.
4. Build and validate the large-war AI.
5. Ship one land-only Grand Conquest vertical slice.
6. Build naval gameplay as its own vertical slice.
7. Expand Grand Conquests with coastal and island adventures.
8. Add the remaining core depth, creator tools, and presentation work based on playtests.

This order deliberately avoids writing a huge one-off campaign on top of systems that cannot yet
support it. It also avoids making naval work a blocker for proving that Grand Conquests is fun.

## Not planned

- Advertising or behavior-based tracking. Anonymous, aggregate gameplay measurement is not
  behavior-based tracking and is already shipping: it is cookieless, uses no persistent or
  advertising identifier, never follows anyone between apps or websites, and can be switched off
  in Settings. What stays off the roadmap is profiling individual players, cross-site or cross-app
  identity, and anything that feeds advertising.
- Energy timers, randomized paid rewards, or consumable power
- A paid gate around the existing single-player game
- Loot boxes, pay-to-win systems, blockchain, tokens, or play-to-earn mechanics

To challenge or refine this roadmap, open a GitHub Discussion or a focused feature request and
follow the decision process in [GOVERNANCE.md](GOVERNANCE.md).
