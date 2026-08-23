# Asset Contract — atlases, naming, geometry

## HD frame overrides

The six baseline atlases below remain a complete source and developer-comparison
contract. The 2× pre-rendered sheets are discovered through
`apps/web/public/assets/hd/manifest.json`. When an HD sheet contains the same
logical frame name, the renderer prefers it and applies `1 / meta.scale` as the
world render scale. This preserves all existing anchors, footprints, animation
lookups, hitboxes, and gameplay code while allowing atlas-family migration.

Normal play validates the declared HD frame count before the battlefield is
created. A missing manifest, failed pack, timeout, or incomplete HD frame set
uses the existing save-preserving loading recovery screen instead of resolving
individual missing frames from the pixel-source atlases. This prevents one
animation from alternating between HD and pixel-source artwork. The complete
baseline set is rendered only through the explicit developer comparison mode.

HD sheets are lossless WebP and use linear texture sampling; baseline pixel
atlases are PNG and retain nearest sampling. Both use the same runtime
player-color mask metadata. See `HD_ART_PIPELINE.md` for the active visual rules.

The shipping HD manifest currently covers every baseline frame. Runtime team
colors are resolved on demand and packed into shared 1,024px color pages; the
renderer must never allocate a full recolored copy of each 2× source sheet.

The asset generator (`tools/assetgen`) emits Pixi spritesheet atlases into
`apps/web/public/assets/`: `terrain.png/.json`, `units.png/.json`, `buildings.png/.json`,
`objects.png/.json`, `ui.png/.json`, `icons.png/.json` (standard Pixi spritesheet JSON,
`meta.scale = 1`). The renderer loads them by these exact names.

## Isometric geometry
- Tile diamond: **64×32 px** at zoom 1. Screen: `sx = (x − y) · 32`, `sy = (x + y) · 16`.
- Rendering uses nearest-neighbor scaling at integer zooms (1×, 2×, 3×) — art stays crisp.
- Unit sprites: anchor at feet. Villager-scale humans ≈ 24–30 px tall, cavalry ≈ 34–40 px.
- Building sprites: anchored so the footprint diamond (size×size tiles) sits on the grid;
  frame name carries the anchor in the atlas JSON (`anchor` per frame).

## Frame naming (renderer resolves names mechanically — follow exactly)
- Terrain: `terr/<terrainId>/<variant>` (2–4 variants each, e.g. `terr/grass/0`)
  - Baked edge transitions: `terr/<hi>_<lo>/<edge>/<variant>`, `edge` ∈ {`nw`, `ne`, `sw`,
    `se`} (higher-priority terrain's fringe composited over the lower neighbor; packed into
    `terrain.png` — recipe in ART_BIBLE §3.2). The renderer picks the variant per tile
    coordinate, so one wobbling boundary is never repeated down a whole shoreline; it falls
    back to an unnumbered `terr/<hi>_<lo>/<edge>` when an atlas ships without variants.
  - Presentation-only families (no sim `TerrainId`), all resolved from the map by the
    renderer — ART_BIBLE §3.3:
    - `terr/ford/<variant>`, drawn in place of a `shallows` tile that resolves as a river
      crossing;
    - road ribbons, drawn OVER the ground the renderer paints under them (their frames are
      transparent past the track's edge): `terr/road-<axis>/<entry><exit>/<variant>` for a
      run along one map axis (`axis` ∈ {`x`, `y`}, `entry`/`exit` ∈ {0, 1, 2} — where the
      track crosses each tile edge, one tile's exit being its neighbour's entry),
      `terr/road-bend/<corner>/<arms>/<variant>` for a turn (`corner` ∈ {`nwne`, `nwsw`,
      `sene`, `sesw`}, `arms` ∈ {`ss`, `sb`, `bs`, `bb`}), `terr/road-fill/<edge>/<variant>`
      for the half-tile that merges the lanes of a road wider than one tile, and
      `terr/road/<variant>` for a crossroads or a lone tile.
    - No `terr/road_*` or `terr/*_road` transition frames exist: a road blends with its
      neighbours as the ground it lies on.
- Units: `unit/<defId>/<anim>/<dir>/<frame>`
  - anims: `idle`, `walk`, `attack`, `gather` (villager), `carry` (villager), `die`, `decay`
  - dir: 0..7, **0 = facing south (toward camera), clockwise** (1 = SW, 2 = W, 3 = NW, 4 = N…).
    The generator authors ONLY dirs 0–4 (S, SW, W, NW, N); the renderer derives 5=NE, 6=E,
    7=SE by mirroring dirs 3, 2, 1 with `scale.x = -1`. This keeps the whole units atlas
    within a single 2048×2048 texture (GPU budget: ≤256 MB total for all textures incl.
    per-player color copies).
  - frames: `walk` 6–8, `attack` 4–6 (impact on a marked frame), `idle` 1–2, `die` 4–6.
    Each attack anim's impact frame index is written to `meta.bannerfall.impactFrame`
    in the atlas JSON.
- Buildings: `bld/<defId>/<state>` — states: `done`, `construct0..2` (scaffold stages), `rubble`.
  Where a building looks different per age (TC, houses), suffix: `bld/<defId>/<age>/done`.
  Exception: the farm has no construct/rubble states — see ART_BIBLE §4.4 (the renderer
  draws `obj/farm/0` with a progress dropout during construction).
- Objects: `obj/tree/<variant>`, `obj/stump`, `obj/gold/<variant>`, `obj/stone/<variant>`,
  `obj/berries`, `obj/farm/<stage>`, `obj/sheep/...`, `obj/deer/...` (animals follow unit anim
  naming under `obj/` if animated). Animals may use reduced frame counts: `idle` 1–2,
  `walk` 4, `attack` 4, `die` 3, `decay` 2 — the unit ranges above bind `unit/*` only.
  Ownable animals (captured sheep) carry the player-color mask and emit
  `obj/<defId>@p<idx>/...` variants exactly like units.
- Icons (HUD command card, 40×40): `icon/<defId>`, `icon/tech/<techId>`, `icon/res/<resource>`,
  `icon/cmd/<verb>` (command verbs: `attackMove`, `stop`, `garrison`, `ungarrison`, `townBell`, `delete`,
  `reseedFarm`, `pack`, `unpack`, `heal`, `convert`, `rally`). Every icon also gets a
  grayscale companion `icon/<...>/gray` (disabled-button state; luma-mapped, no mask colors).
- UI chrome under `ui/*` (panel slices, buttons, health bar, selection ring sized per footprint).

## Player colors
8 player colors (index 0..7): blue, red, green, yellow, cyan, purple, gray, orange.
Unit/building/ownable-object sprites are authored with a **magenta-family mask palette**
(pure #FF00FF, #CC00CC, #990099 — light/mid/dark). Strategy is **'runtime-swap'** (declared
in atlas JSON `meta.bannerfall.playerColorStrategy`): the atlas ships ONE base copy with the
magenta mask left in; at match load the RENDERER builds per-player-color textures by exact
palette substitution on an offscreen canvas (magenta ramp → that color's 3-tone ramp from
ART_BIBLE), only for the ≤4 colors actually in the match. Shading quality is identical to
baking, without the 8× atlas blowup. The mask ramp and the 8 player ramps are also listed in
`meta.bannerfall.maskPalette` / `meta.bannerfall.playerRamps` so the renderer never hardcodes
hexes. (Baked `@p<idx>` frame naming remains reserved for a future strategy switch.)

## Style (see `HD_ART_PIPELINE.md`)
The shipping renderer requires the premium pre-rendered 2× override set: grounded
medieval materials, upper-left world light, antialiased silhouettes, and exact
runtime player colors. The deterministic warm-palette pixel atlases described in
`ART_BIBLE.md` remain the developer comparison and mechanical animation source;
they are not the active visual target. No content is copied from another game.
