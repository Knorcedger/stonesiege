# StoneSiege HD art direction

Status: complete runtime contract coverage, active authored migration. All 3,806
shipping frames have 2× HD overrides, but those overrides intentionally have two
tiers: 139 frames use newly rendered subject art and 3,667 animation-heavy or
low-priority frames use the deterministic material renderer. The procedural
pixel atlases remain source geometry and a safe fallback if an HD sheet cannot
load.

## Visual target

StoneSiege uses an original, premium pre-rendered isometric strategy-game look:

- Orthographic 2:1 isometric camera; no perspective convergence.
- Warm key light from the upper-left, cooler ambient fill, grounded contact
  occlusion, and one consistent shadow direction.
- Real material separation at gameplay distance: layered thatch, hand-hewn
  timber, woven wattle, irregular stone, packed soil, hammered iron, and cloth.
- Rich detail without photographic noise. Silhouettes, doors, weapons, resource
  loads, and team colors must read before surface texture.
- Buildings sit inside their existing tile footprint. Art never changes
  pathfinding, selection, construction reach, or simulation dimensions.
- Designs are original. Historic RTS games are a quality benchmark, not an
  asset or architecture source to copy.

The Dark Age Town Center in `art/hd/frames/town-center-dark-neutral.png` is the
acceptance asset for camera, material density, contrast, lighting, and scale.

## Technical contract

HD sheets live in `apps/web/public/assets/hd/` and are listed by
`manifest.json`. A frame in an HD sheet overrides the same logical frame name in
the legacy atlas. Missing or unavailable HD frames automatically fall back to
the procedural set.

- Author at 2 source pixels per existing world pixel (`meta.scale: 2`).
- Runtime renders HD textures at `0.5` scale with linear sampling.
- Preserve the frame naming in `ASSET_CONTRACT.md`; no gameplay code branches on
  the art style.
- Use transparent RGBA. Keep adequate transparent padding around every pose and
  building; no visible pixel may touch a sheet edge.
- Building anchors sit at the geometric center of the footprint plane, not the
  bottom of the rendered image.
- Store player-color cloth as the exact mask ramp `#ff00ff`, `#cc00cc`,
  `#990099`. The existing runtime swaps it to all eight player ramps.
- Player cloth must be large enough to identify ownership at 1× but may not
  replace primary material boundaries or obscure attack silhouettes.
- Use atlas chunks rather than one global texture. A migration batch can add a
  new sheet without repacking previously approved art.
- Palette-swapped frames are generated lazily and shelf-packed into shared
  1,024px runtime pages. This avoids cloning the complete 24 MB HD set for every
  player while keeping team colors batchable.

Run `npm run assets:hd` to rebuild HD sheets. `npm run assets` rebuilds both the
legacy fallback and HD overrides.

## Age and asset-family grammar

- Dark Age: rough thatch, round logs, wattle and daub, fieldstone footings,
  rope lashings, undyed cloth.
- Feudal Age: sawn timber frames, wood shingles, limewashed infill, iron straps.
- Castle Age: dressed stone walls, slate roofs, fortified profiles, carved
  timber and restrained heraldry.
- Imperial Age: precise masonry, glazed openings, metal roof accents, richer
  banners and civic ornament—never fantasy excess.
- Terrain/resources: softer natural value variation and physically grounded
  clusters; do not bake directional shadows that conflict when tiles repeat.
- Units: shared humanoid and cavalry rigs per body class. Equipment swaps carry
  unit identity so all animation directions remain mechanically consistent.
- UI: rendered material portraits/icons on the existing dark timber/parchment
  interface, with the same warm light and team-color rules as world art.

## Production coverage

1. Buildings: every completed building and age variant is newly rendered;
   construction stages composite the new render with mechanically exact
   scaffolding. Rubble uses the systemic material pass.
2. Static resources: trees, berries, gold, stone, and farms are newly rendered.
   Terrain tiles and transitions use the systemic material pass.
3. Units: the villager idle/walk direction set is newly rendered and retains the
   player-color contract. Other unit actions, military units, siege, and animals
   use animation-safe systemic rendering until their directional sheets land.
4. UI: typography and panel treatment are refreshed; icons retain their exact
   silhouettes with HD material rendering and linear sampling.
5. The legacy atlas remains intentionally: it is compact fallback art and the
   source geometry for deterministic regeneration.

`tools/hd-art/materialize.ts` applies the approved material library, softened
contours, natural edge shading, small-unit volume reconstruction, and 2× sampling
to the remaining mechanical frame contract. Authored renders are packed last and
therefore override systemic frames without changing their logical names.
