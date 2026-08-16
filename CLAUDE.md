# StoneSiege — AoE2-style mobile RTS

TypeScript + PixiJS (WebGL) game. Deterministic sim core with Capacitor 8 wrappers for iOS/Android.

## Commands
- `npm run dev` — dev server at http://localhost:5199 (game is playable in browser)
- `npm run build` — production build to `dist/`
- `npm run test` — vitest (all `packages/**/*.test.ts`)
- `npm run typecheck` — tsc over the whole repo
- `npm run assets` — regenerate sprite atlases into `apps/web/public/assets/` (Node runs the TS directly)

## Structure (NO per-package package.json — single root, imports via `@bf/*` aliases)
- `packages/sim` — deterministic game simulation. THE RULES BELOW ARE HARD REQUIREMENTS.
- `packages/data` — all unit/building/tech/civ definitions (data-driven; schema in `src/schema.ts`)
- `packages/game` — PixiJS renderer, camera, input, HUD (DOM overlay)
- `packages/ai` — bot opponents; AI reads sim state and issues Commands like a human player
- `packages/scenarios` — campaign scenario definitions + trigger engine schema
- `tools/assetgen` — procedural sprite/atlas generation (writes PNGs via pngjs)
- `apps/web` — Vite entry; `apps/web/public/assets` holds generated atlases (committed)
- `docs/` — GDD.md, ARCHITECTURE.md, ART_BIBLE.md, ASSET_CONTRACT.md — read before implementing

## Determinism rules for packages/sim (multiplayer/replay-safe)
- NO `Math.random` — use the seeded `SimRng` from `@bf/sim/rng`
- NO `Date`, no wall-clock time — only tick counts
- Game state must be integers only (positions are fixed-point, 256 units = 1 tile)
- No iteration over objects/Maps where order affects outcomes unless order is guaranteed insertion-stable and identical across runs
- Sim must never import from `packages/game` or touch DOM/Pixi

## Conventions
- `tools/` runs under Node's native TS type-stripping: erasable syntax only (no enums, no namespaces, no parameter properties) in `tools/`
- Do not add npm dependencies or edit root configs without an explicit reason
- Keep `npm run typecheck` and `npm run test` green; run both before declaring work done
