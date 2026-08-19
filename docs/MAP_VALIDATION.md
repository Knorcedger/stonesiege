# Map validation reports

StoneSiege provides a deterministic, report-only validator for resolved maps. It gives
contributors one shared answer for land connectivity, starting conditions, nearby resources,
construction room, and narrow strategic crossings before a generator or scenario reaches
players. Validation never repairs terrain, moves entities, advances the RNG, or mutates the
simulation.

## Run the Practice sweep

From the repository root:

```bash
npm run validate:maps
```

The default matrix checks seeds 7, 42, and 1337 across the 96×96, 120×120, and 144×144 Practice
presets with two, three, and four players: 27 cases in a stable size/player/seed order. A non-zero
exit code means at least one validation error occurred. Warnings stay visible but do not fail the
command.

Select a smaller or broader deterministic matrix:

```bash
npm run validate:maps -- --seeds 7,99 --sizes 96,144 --players 2,4
```

Write the complete machine-readable report:

```bash
npm run validate:maps -- --json .qa/map-validation.json
```

Print JSON only for redirection or another tool:

```bash
npm run --silent validate:maps -- --json - > map-validation.json
```

The report deliberately contains no timestamp, duration, machine identifier, or unstable map
iteration. Identical maps, entities, and profiles produce byte-equivalent `JSON.stringify`
output. Schema changes increment `MAP_VALIDATION_SCHEMA_VERSION`.

## Practice land profile

`PRACTICE_MAP_VALIDATION_PROFILE` is the current conservative contract for connected land maps.
It is exported from `@bf/sim` alongside `validateMap(game, profile)`. Future families such as
Islands must provide an explicit profile instead of weakening the land rules.

| Requirement | Practice value |
|---|---:|
| Maximum passable-terrain components | 1 |
| Required start entity | Town Center |
| Minimum distance between starts | 30 tiles |
| Start access | At least one walkable tile adjoining the start footprint |
| Construction sample | 2×2 footprint within 16 tiles |
| Minimum buildable placements | 80 |
| Resource search radius | 40 tiles |
| Minimum reachable food / wood / gold / stone nodes | 9 / 12 / 10 / 7 |
| Reported crossing widths | up to 6 tiles |
| Minimum strategic crossing width | 3 tiles |
| Minimum large region on each side of a strategic crossing | 64 tiles |

Resource nodes are grouped into eight-neighbor clusters. If a villager can reach a harvest tile
beside any member, the whole cluster counts as accessible; this avoids incorrectly rejecting the
interior nodes of a dense mine or forest. Gaia sheep and deer count as food using their data-defined
carcass amounts.

Terrain components ignore entities and use four-way adjacency, so diagonal corner contact cannot
pretend to connect two land regions. Per-player reachability then overlays buildings, resources,
and friendly/allied gate rules and matches movement's no-corner-cut behavior.

Crossing widths use deterministic horizontal and vertical passable runs. A narrow candidate is
reported when it contains shallows or its removal separates two sufficiently large land regions;
it becomes an error only when it is a true large-region separator narrower than the profile
minimum. Redundant fords therefore remain measurable without being mislabeled as the map's only
strategic route.

## Issue codes

| Code | Severity | Meaning |
|---|---|---|
| `DISCONNECTED_MOVEMENT_REGION` | Error | Passable terrain exceeds the profile's component limit. |
| `START_REQUIRED_ENTITY_MISSING` | Error | A player lacks the profile's required starting entity. |
| `START_NO_ACCESS` | Error | No player-walkable tile adjoins the start footprint. |
| `START_OUTSIDE_MAIN_COMPONENT` | Error | A start belongs to a smaller disconnected land component. |
| `STARTS_TOO_CLOSE` | Error | Two starts violate minimum spacing. |
| `START_BUILDABLE_SPACE_LOW` | Error | Too few sampled building footprints fit around a start. |
| `RESOURCE_SHORTAGE` | Error | Reachable nodes fall below a required resource minimum. |
| `SEALED_RESOURCE_CLUSTER` | Warning | A nearby cluster is inaccessible, but minimum supply is evaluated separately. |
| `NARROW_STRATEGIC_CROSSING` | Error | The only connection between large regions is too narrow. |

The current default matrix can surface `SEALED_RESOURCE_CLUSTER` warnings where the older mapgen
tests' permissive diagonal flood considered a corner-touching cluster accessible. The validator
uses the stricter real path rule and records the debt without rejecting an otherwise supplied
start. A future generator issue can use these coordinates to improve corridor carving.

## Coverage boundaries

This validator evaluates resolved starting state. It does not lint scenario objectives or trigger
graphs, prove AI build orders, simulate depletion, evaluate naval routes, choose a supported Huge
entity cap, or guarantee that every tactically desirable route remains open after construction.
Those require separate profiles or later roadmap systems. Authored maps with intentional islands,
besieged starts, or asymmetric scarcity should select a purpose-built profile and document why.
