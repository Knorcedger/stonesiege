# Militia-line walk sheet — regeneration brief

`champion-walk-grid-cutout-v1.png` drives `militia`, `manAtArms`, `longswordsman`
and `champion`, plus the four campaign heroes that alias the champion rig.

It is not a walk cycle. Its six cells hold one standing pose translated across
the strip: measured against the subject's own body center, the authored feet
hold within 2.5px for the whole northwest and north "cycles", while the subject
itself drifts 29–33.5px in every row regardless of which way that row faces.
`build.ts` registers each pose on its own subject and so correctly discards that
translation (issue #60), which leaves this family with no gait at all. Until the
sheet is replaced the build synthesizes one — see `syntheticGait` in
`tools/hd-art/build.ts`. Replacing the sheet retires that opt-in.

Every other humanoid family on a walk grid has a genuine authored stride and
must not be regenerated for this.

## Production prompt

Generate as `champion-walk-grid-v2.png` (or later) and keep the raw generation in
this directory for provenance, as the batches above it were kept.

> A single 6-column by 5-row sprite grid, 30 equal cells, on one flat image.
>
> One medieval foot soldier, the same soldier in all 30 cells: knee-length mail
> hauberk over a dark tunic, conical helmet with a nasal bar, short beard, a
> round wooden shield with an iron boss on his left arm, a straight arming sword
> in his right hand, leather boots with wrapped lower legs. Generic rank-and-file
> infantry, not a named or heroic character. Identical equipment, proportions and
> scale in every cell.
>
> Rows are five viewing directions of the same character, top to bottom:
> 1. walking toward the viewer,
> 2. walking toward the viewer and to his right (viewer's left),
> 3. walking to the viewer's left in full profile,
> 4. walking away from the viewer and to the viewer's left,
> 5. walking directly away from the viewer.
>
> Columns are six consecutive frames of ONE looping walk cycle, left to right:
> 1. contact — left foot planted forward, right foot planted behind, legs at
>    their widest, body at its lowest;
> 2. weight over the left leg, right foot lifted clear of the ground and swinging
>    forward, body rising;
> 3. passing — the legs cross close together, the right foot swings through at
>    its highest, body at its highest;
> 4. contact — the mirror of frame 1, right foot planted forward, left behind;
> 5. the mirror of frame 2, left foot lifted and swinging forward;
> 6. passing — the mirror of frame 3, left foot swinging through.
>
> Frame 6 must lead back into frame 1 as a seamless loop.
>
> CRITICAL — this is a walk-IN-PLACE cycle. The soldier's body stays at exactly
> the same position within its own cell in all six columns of a row. Do not move
> the figure across the strip; only his legs, arms and torso change. The walk must
> be readable from the legs alone: in every frame the two legs are in visibly
> different positions, and in the swing frames one foot is clearly off the ground
> with the sole visible.
>
> Orthographic isometric camera, 2:1 three-quarter top-down angle, identical for
> every cell. Warm light from the upper left, consistent across all 30 cells.
> Painterly medieval real-time-strategy finish, grounded and historical, no
> fantasy or anachronistic equipment.
>
> Include one restrained cobalt-blue cloth element — a waist sash or surcoat band
> — in the same place in all 30 cells, large enough to be visible at small size.
> Everything else stays neutral: browns, greys, steel and undyed cloth.
>
> Background: a single flat pure magenta (#FF00FF) fill behind everything. No
> terrain, no ground plane, no cast shadow, no scenery, no grid lines, no cell
> separators, no borders, no text, no labels, no watermark. Every figure sits
> fully inside its own cell with clear padding; no sword, shield or foot may
> cross into a neighbouring cell.

If the generator cannot hold the figure in place across six cells, generate one
row at a time as a 6-cell strip for a single direction — the same wording, one
direction, six frames — which is how the villager, scout and sheep cycles were
produced. `slice-animation-sheets.ts` is the existing pattern for splitting
per-direction strips.

## Bringing a new sheet in

1. Keep the raw generation as `art/hd/source/units/champion-walk-grid-v2.png`.
2. Matte the chroma background off into
   `art/hd/frames/units/champion-walk-grid-cutout-v2.png` (the earlier batches
   used the image-generation skill's `remove_chroma_key.py` soft-matte/despill).
3. Add `champion-walk-grid-cutout-v2` to `SHEETS` in
   `normalize-civilization-unit-sheets.ts` and run `npm run assets:hd`. That pass
   isolates the 30 dominant figures and repacks them into equal padded cells, so
   a sword or shield that crosses a generated cell boundary cannot leak into the
   next pose.
4. Point `walkGridCutouts` at the v2 cutout and drop `syntheticGait: true`.
5. `npm run assets && node tools/hd-art/qa-walk-grid.ts 'militia'`.

## Accepting the result

`node tools/hd-art/qa-walk-grid.ts` reports how much of the boot band changes
between consecutive frames, per direction, for every shipping family. It is a
report, not a gate: the authored families run from about 3% (pikeman, whose
stride is genuine but shallow) to 51% (mamluk), so no single threshold separates
a weak stride from no stride.

Read a regeneration against its neighbours in that table. For reference, the
militia line scores 6.3% at its weakest direction on the v1 sheet, against 16.8%
for chevalier, 18.8% for housecarl and 20.3% for monk. A sheet that lands in the
authored band, and whose contact sheet shows a lifted foot in the swing frames,
is doing its job.

The vitest suite additionally asserts canvas size, anchor, ground contact, shared
family scale, horizontal registration and idle/walk/attack registration for every
walk cycle, so `npm run check` catches a sheet that is animated but misaligned.
