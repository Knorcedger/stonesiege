# Performance benchmarks

StoneSiege measures scale before exposing larger maps or raising entity limits. These developer
benchmarks are evidence-gathering tools, not player-facing modes and not promises that a given
phone can sustain the same load.

## Huge-map simulation sweep

Run the Phase 1 benchmark from the repository root:

```bash
npm run benchmark:huge
```

The default sweep creates the same deterministic 192×192 land scenario at 600, 800, 1,000, and
1,500 live entities. Two mixed armies attack through a cliff funnel, exercising group
pathfinding, movement and local steering, visibility, combat, projectiles, serialization, and
snapshot restoration. The 192×192 fixture lives only in `tools/huge-map-benchmark.ts`; the
player-facing Practice presets remain 96×96, 120×120, and 144×144.

Save the complete machine-readable report:

```bash
npm run benchmark:huge -- --json .qa/huge-map.json
```

Emit JSON only, for redirection or automation:

```bash
npm run --silent benchmark:huge -- --json - > huge-map.json
```

For a quicker investigation, select cases or shorten the run:

```bash
npm run benchmark:huge -- --counts 600,1000 --ticks 200
```

Use `npm run benchmark:huge -- --help` for all options. The default 400 ticks per case are the
shared comparison point; label any result that changes the count, tick duration, or seed.

## What the report means

Each JSON report includes Node, operating-system, CPU, and memory metadata plus:

- fixture creation time, representing headless simulation initialization rather than renderer
  or asset load;
- average CPU time per tick and average/p50/p95/maximum wall time per tick;
- sampled heap/RSS peaks and the deterministic visibility-buffer allocation; the CLI requests
  garbage collection before each case so a previous snapshot does not become the next baseline;
- maximum active path searches, queued path assignments (including superseded requests), unique
  units still waiting on their current search, ticks with pending searches, and the tick when the
  initial searches first drained;
- live/surviving unit outcomes, ridge crossings, and peak projectile count so a fast result
  cannot come from an idle or invalid fixture;
- JSON snapshot size and serialize, stringify, and restore timings;
- final and restored hashes, which must match.

Timing and managed-memory readings vary with hardware, Node/V8, background activity, thermal
state, and garbage collection. Compare medians from several runs on the same machine. Do not turn
one development-laptop result into a supported cap or a CI timing threshold.

## Initial headless baseline — 2026-08-19

The first committed report was captured on an Apple M4 with Node v26.6.0 and macOS, using the
default 400 ticks per case. See the complete environment metadata and raw values in
[`benchmarks/huge-map-2026-08-19.json`](benchmarks/huge-map-2026-08-19.json).

| Entities | CPU/tick avg | Wall/tick p95 | Searches pending at end | Snapshot | Serialize | Parse + restore |
|---:|---:|---:|---:|---:|---:|---:|
| 600 | 2.676 ms | 3.177 ms | 732 | 0.37 MiB | 1,163 ms | 634 ms |
| 800 | 2.583 ms | 3.079 ms | 1,220 | 0.56 MiB | 1,971 ms | 828 ms |
| 1,000 | 3.259 ms | 4.043 ms | 1,588 | 0.69 MiB | 2,667 ms | 1,140 ms |
| 1,500 | 4.873 ms | 6.187 ms | 1,922 | 0.96 MiB | 3,237 ms | 1,381 ms |

All four restored hashes matched. Every surviving unit moved by at least two tiles, projectiles
were emitted, and casualties occurred, so this was an active movement/combat workload rather
than an idle entity-count test.

The strongest finding is not average tick cost: combat-generated path requests refilled the
queue after the two initial group searches drained, leaving hundreds or thousands of searches
pending at the snapshot boundary. Those in-flight searches make serialization and restoration
slow. Before proposing a supported Huge tier, the next performance task should measure and safely
retire superseded path searches while preserving deterministic routing and snapshot equivalence.

## Coverage boundaries

This harness measures the deterministic headless simulation. It does **not** measure PixiJS
rendering, texture memory, minimap drawing, WebView overhead, battery use, touch responsiveness,
or thermal throttling. A player-facing Huge tier remains blocked on representative Android,
iPhone, and iPad measurements of those systems. If the simulation evidence shows sustained path
pressure or excessive tick cost, profile that subsystem before proposing hierarchical pathfinding
or dormant-region behavior.
