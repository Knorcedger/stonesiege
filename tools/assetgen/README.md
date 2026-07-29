# tools/assetgen — procedural sprite/atlas generation

Generates every atlas in `apps/web/public/assets/` (`terrain|objects|units|buildings|ui|icons`
`.png` + Pixi spritesheet `.json`) from code, per `docs/ART_BIBLE.md` (visual rules) and
`docs/ASSET_CONTRACT.md` (naming/geometry — it wins on conflict).

Run: `npm run assets` (plain Node, native TS type stripping — **erasable syntax only**:
no enums, no namespaces, no parameter properties; relative imports need explicit `.ts`).
Test: `npx vitest run tools` (vitest resolves `@bf/*` aliases; plain Node does not).

## Layout

| file | role |
|---|---|
| `raster.ts` | RGBA buffer + primitive set (§7): rect/ellipse/poly/line, ordered dither, outline pass, drop shadow, hflip, alpha blit |
| `palette.ts` | §1 master palette, §2 player ramps + magenta mask ramp, §9.1 whitelist builder |
| `atlas.ts` | shelf packer → PNG + Pixi JSON with per-frame `anchor` + `meta.bannerfall` (playerColorStrategy `runtime-swap`, maskPalette, playerRamps, impactFrame, nineSlice) |
| `png.ts` | pngjs read/write |
| `gen-terrain.ts` | all sim `TerrainId`s (2–4 variants) + all 28 priority-pair × 4-edge baked transitions (§3) |
| `gen-objects.ts` | trees/stump/mines/berries/farm 0–4 + animated sheep/deer/wolf (reduced anim sets, dirs 0–4) |
| `gen-ui.ts` | panel/parchment 9-slices, buttons, hp bar, selection rings 1×1..5×5 (+ unit s/m/l), minimap frame, rally flag |
| `gen-icons.ts` | 40×40 icons for EVERY unit/building/resource/tech in gameData + `icon/res/*` + `icon/cmd/*` + `/gray` companions — derived from data at gen time |
| `rig.ts` | shared rigs (§6): parameterized humanoid walk/attack/die engine, horse rig, iso-box machine helper, frame trim (feet anchors preserved), decay dropout |
| `gen-units.ts` | EVERY trainable unit in gameData: 17 humanoid specs on the shared rig, 5 cavalry on the horse rig, ram/mangonel/trebuchet machine rigs; dirs 0–4, contract frame counts, impact frame 2 |
| `gen-buildings.ts` | every building (farm exempt): per-recipe `done` (+ TC/house age variants), shared scaffold kit `construct0..2`, `rubble`; footprints read from data |
| `checks.ts` | automated §9 post-pass: palette discipline, mask hygiene/coverage bands (incl. per-defId overrides), terrain contrast |
| `contact.ts` | QA sheets (`.qa/art/*-1x/2x.png`) + `assets/contact-sheet.png` (checker grid, §9.5 strips, silhouette lineup) |
| `main.ts` | orchestrator |
| `atlas.test.ts` | completeness test, requirements derived from gameData (+ GPU budget, anchors, impact bounds) |
| `qa-zoom.ts` | dev tool: `node tools/assetgen/src/qa-zoom.ts '<regex>' [zoom] [name]` → `.qa/art/zoom-*.png` |
| `qa-cover.ts` | dev tool: per-defId mask-coverage min/max stats for tuning §9.4 bands |

## Importing game data under plain Node

`packages/data/src/index.ts` uses extensionless **value** imports → unloadable by Node
type stripping. Import the **leaf** modules instead (`units.ts`, `buildings.ts`,
`techs.ts`, `resources.ts`) — their only cross imports are `import type` (erased).
Under vitest, `@bf/data` works normally.

## Determinism

Every random choice uses `Rng` seeded by the frame name (`util.ts`) — regenerating is
byte-stable; diffs stay reviewable. Never use `Math.random`.

## Player color = runtime-swap

Sprites keep the magenta mask (`#FF00FF/#CC00CC/#990099`) in the shipped atlas; the
renderer substitutes per-player ramps at match load (see ASSET_CONTRACT). Do NOT bake
`@p<idx>` variants. Mask coverage bands are asserted (`checks.ts`); per-defId exceptions
go in `COVERAGE_OVERRIDES` there.

## Stage 2 (units + buildings) — done

- Units atlas: 3040 frames (28 trainable units × full contract anim sets, dirs 0–4,
  auto-trimmed to content) packs to 2048×~1030 — inside the single-texture budget.
  Frame counts: idle 2, walk 6 (cavalry 8), attack 5 (impact = 2, in
  `meta.bannerfall.impactFrame`), die 5, decay 3, villager gather 4 + carry 6.
  Trebuchet per ART_BIBLE §10.4: `walk` = packed cart, `idle` = unpacked A-frame.
- Buildings atlas: 106 frames — `bld/<id>/done` (TC/house per age), `construct0..2`
  (bannerless + mask-free), `rubble`. Footprints from `buildings[id].size`.
- §9.4 coverage: humanoids/cavalry sit in the 8–20% band via surcoat sash + collar
  bands; siege machines + monastery/gate are documented quiet exceptions in
  `checks.ts` COVERAGE_OVERRIDES. Decay frames strip the mask (corpses fade to neutral).

Not generated (documented contract deltas): projectiles (`obj/proj/*`, §4.6/§10.2)
and the wall/gate piece-set names (§10.3) — stoneWall/gate ship as solid standalone
full-tile pieces; coordinate with the renderer before adding oriented variants.
