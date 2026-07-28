# Asset Contract — atlases, naming, geometry

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
- Units: `unit/<defId>/<anim>/<dir>/<frame>`
  - anims: `idle`, `walk`, `attack`, `gather` (villager), `carry` (villager), `die`, `decay`
  - dir: 0..7, **0 = facing south (toward camera), clockwise** (1 = SW, 2 = W, 3 = NW, 4 = N…).
    The generator bakes all 8 (mirroring E from W side at build time).
  - frames: `walk` 6–8, `attack` 4–6 (impact on a marked frame), `idle` 1–2, `die` 4–6.
- Buildings: `bld/<defId>/<state>` — states: `done`, `construct0..2` (scaffold stages), `rubble`.
  Where a building looks different per age (TC, houses), suffix: `bld/<defId>/<age>/done`.
- Objects: `obj/tree/<variant>`, `obj/stump`, `obj/gold/<variant>`, `obj/stone/<variant>`,
  `obj/berries`, `obj/farm/<stage>`, `obj/sheep/...`, `obj/deer/...` (animals follow unit anim
  naming under `obj/` if animated).
- Icons (HUD command card, 40×40): `icon/<defId>`, `icon/tech/<techId>`, `icon/res/<resource>`.
- UI chrome under `ui/*` (panel slices, buttons, health bar, selection ring sized per footprint).

## Player colors
8 player colors (index 0..7): blue, red, green, yellow, cyan, purple, gray, orange.
Unit/building sprites are authored with a **magenta-family mask palette** (pure #FF00FF,
#CC00CC, #990099) that the generator swaps per player color at build time, emitting
`unit/<defId>@p<color>/...` variants — OR the atlas emits grayscale-mask companion frames and
the renderer tints. **The generator picks ONE strategy and documents it in the atlas JSON
`meta.bannerfall.playerColorStrategy` field ('baked' | 'tint')**; renderer must support the
declared one. Baked is preferred for quality (shading preserved).

## Style (see ART_BIBLE.md for the full bible)
Original stylized pixel art evoking late-90s isometric RTS: warm earthy palette, strong
silhouette per unit role, 1px dark outline, dithered shading, NO content copied from any game.
