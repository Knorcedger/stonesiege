# HD source art

`town-center-style-reference.png` is the approved visual comparison. The first
production source was generated with OpenAI image generation from that reference
and is preserved as `source/town-center-dark-chroma.png`.

Production prompt summary: isolate the approved Dark Age Town Center; preserve
its original timber-and-wattle hall, layered thatch, stone foundation, right-side
annex, packed-earth 4×4 platform, orthographic 2:1 camera, and warm upper-left
light; replace team cloth with neutral gray; render on an exact chroma-green
background with no scenery, labels, border, or shadow outside the platform.

The chroma source was matted with the image-generation skill's
`remove_chroma_key.py`, cropped, and Lanczos-downsampled into the padded 2×
acceptance frame `frames/town-center-dark-neutral.png`. `npm run assets:hd`
converts its two authored cloth regions to StoneSiege's exact runtime mask and
emits the shipping lossless WebP atlas. Never hand-edit the generated atlas in
`apps/web/public/assets/hd/`; edit the neutral frame or builder instead.

Source and validated PNGs in `art/` use Git LFS and are excluded from ordinary
clones. Before regenerating atlases, install Git LFS and run
`git lfs pull --include="art/**" --exclude=""`.

`materials/material-atlas.png` was generated with the same built-in OpenAI image
workflow and Town Center style reference. Its prompt requested an exact 4×2 grid
of seamless thatch, timber, wattle/daub, fieldstone, packed earth, meadow grass,
hammered iron, and linen swatches with no labels or dividers. The deterministic
renderer in `tools/hd-art/materialize.ts` preserves every authored pose and
footprint while applying those surface responses, softened contours, ambient
edge shading, and 2× sampling to frames that do not yet have a subject render.

The `source/buildings`, `source/objects`, and `source/units` directories contain
the authored production batches, also produced with the built-in OpenAI image
workflow using the approved Town Center as their camera/material reference. The
prompt set covers individually recognizable medieval production, economic,
religious, defensive, civic, and age-progression buildings; isolated natural
resources and the harvested oak stump; exact direction sheets for villagers,
scouts, sheep, deer, and wolves; and 6×5 movement grids for every military and
siege visual family. All sources use a flat green or magenta removal background,
matching upper-left world light, no baked terrain, and no baked player color.
Their validated alpha cutouts live under `frames/`.

The civilization-unique runtime sheets are documented in
[`source/units/CIVILIZATION_UNITS.md`](source/units/CIVILIZATION_UNITS.md).
They give the Viking housecarl, French chevalier, Mongol Kheshig horse archer,
Byzantine cataphract, and Saracen mamluk distinct movement silhouettes instead
of aliasing generic infantry or cavalry. The base and elite definitions share
their civilization's authored sheet while retaining separate data and icon
names. Elite definitions intentionally alias their civilization's unique base
animation to avoid shipping identical image data twice; their icons stay
separate so an elite visual treatment can be introduced without changing the UI
contract.

`tools/hd-art/build.ts` fits those cutouts into the unchanged mechanical frame
and anchor contract, restores the exact runtime player-color ramp, derives
grounded action/death poses and the three construction stages, creates matching
world-entity icons, and packs the resulting authored overrides after the
systemic sheets. `slice-direction-sheet.ts` extracts the five authored directions
used by the runtime mirror convention and removes cross-cell fragments from the
wolf sheet.
