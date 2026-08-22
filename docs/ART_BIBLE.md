# StoneSiege — Legacy Procedural Art Bible

> The active visual target and 2× pre-rendered migration contract are defined in
> `HD_ART_PIPELINE.md`. This document remains authoritative for the procedural
> fallback atlases until their frame families are replaced.

The complete visual specification for `tools/assetgen`. Every rule in this document is
written to be implemented **in code** (TypeScript + pngjs): layered primitive fills,
palette lookups, ordered dither, and deterministic seeded noise. There is no hand-drawn
art and no AI-generated imagery. All designs are original; late-90s isometric RTS games
are a *mood* reference only.

Read together with `docs/ASSET_CONTRACT.md` (geometry, naming, atlas format — that
document wins on any naming/geometry conflict) and `docs/GDD.md` (roster).

---

## 0. Style pillars

1. **Warm and worn.** Everything leans yellow-brown: sunlit grass, oiled timber, dusty
   stone. Pure white, pure black, and neon saturation are banned outside the UI
   highlight color and the player-color ramps.
2. **Silhouette first.** Every unit role and building must be identifiable from its
   1-bit silhouette at 1× zoom on a phone. Detail is decoration; shape is information.
3. **One light, one outline.** Light always comes from the screen's **top-left**.
   Every sprite gets a **1 px `outline`-colored contour** (drawn inside the silhouette).
   No exceptions, no double outlines, no anti-aliasing.
4. **Palette discipline.** Sprites may only use colors from §1 and §2. Alpha is 0 or
   255 everywhere except the single drop-shadow region — black at alpha 88, drawn as an
   ellipse for units/objects and as the extended footprint diamond for buildings
   (§7.6) — and UI overlays.
5. **Dither, don't gradient.** Shading steps between ramp tones use 50%/25%
   checkerboard dither. Never blend RGB values; never introduce intermediate colors.
6. **Deterministic.** All noise/variant randomness in assetgen uses a fixed seed per
   frame name, so regenerating atlases is byte-stable and diffs stay reviewable.

---

## 1. Master palette (50 named colors)

Defined once in assetgen as `PALETTE: Record<ColorName, [r, g, b]>`. Ramps are ordered
dark → light; "base" is the default fill tone, dark = shadow step, light = lit step.

### Terrain & nature ramps

| Name | Hex | Role |
|---|---|---|
| `grassShadow` | `#3F5A26` | grass ramp 1 — tile shadow fringe, under-tree floor |
| `grassDark` | `#527033` | grass ramp 2 — noise speckle |
| `grassBase` | `#6B8C3F` | grass ramp 3 — base fill (the game's "canvas") |
| `grassLight` | `#87A54F` | grass ramp 4 — sunlit speckle, tufts |
| `dirtDark` | `#6B4E2E` | dirt ramp 1 — pebbles, ruts |
| `dirtBase` | `#8A683E` | dirt ramp 2 — base fill |
| `dirtLight` | `#A8854F` | dirt ramp 3 — dry patches |
| `dirtPale` | `#C2A268` | dirt ramp 4 — roads, packed earth, sand accents |
| `leafShadow` | `#1F3B1E` | foliage ramp 1 — canopy underside, forest floor litter |
| `leafDark` | `#2E5426` | foliage ramp 2 — canopy shade half |
| `leafBase` | `#3F6E2F` | foliage ramp 3 — canopy fill |
| `leafLight` | `#5B8A3B` | foliage ramp 4 — canopy lit crown |
| `waterDeep` | `#1D4763` | water ramp 1 — deep fill |
| `waterBase` | `#2C6283` | water ramp 2 — base fill |
| `waterLight` | `#4884A4` | water ramp 3 — shimmer bands, shore foam |

### Material ramps

| Name | Hex | Role |
|---|---|---|
| `woodDark` | `#46311E` | timber ramp 1 — log shadow, plank gaps, timber framing |
| `woodBase` | `#6B4C2C` | timber ramp 2 — base fill |
| `woodLight` | `#8F6C43` | timber ramp 3 — lit plank faces |
| `woodPale` | `#B08C5C` | timber ramp 4 — fresh-cut ends, wattle panels |
| `stoneDark` | `#55555E` | stone ramp 1 — mortar lines, block shadow |
| `stoneBase` | `#78787F` | stone ramp 2 — base fill (castle-age masonry) |
| `stoneLight` | `#9C9CA3` | stone ramp 3 — lit faces |
| `stonePale` | `#C0C0C6` | stone ramp 4 — imperial dressed stone |
| `slateDark` | `#3E4654` | slate ramp 1 — roof shade plane |
| `slateBase` | `#5A6474` | slate ramp 2 — castle/imperial roofs |
| `slateLight` | `#7C8798` | slate ramp 3 — lit roof plane, ridge |
| `thatchDark` | `#8A6E33` | thatch ramp 1 — eave shadow rows |
| `thatchBase` | `#B29245` | thatch ramp 2 — straw roofs |
| `thatchLight` | `#D4B562` | thatch ramp 3 — lit thatch, hay, ripe grain |
| `metalDark` | `#4A505A` | metal ramp 1 — blade edges, mail shade |
| `metalBase` | `#78828C` | metal ramp 2 — armor/weapon fill |
| `metalLight` | `#A7B1BA` | metal ramp 3 — lit steel, helmet crowns |
| `goldDark` | `#8A6414` | gold ramp 1 — icon borders, trim shadow |
| `goldBase` | `#C29422` | gold ramp 2 — ore veins, coins, trim |
| `goldShine` | `#E6C04A` | gold ramp 3 — glints, imperial finials |

### People ramps

| Name | Hex | Role |
|---|---|---|
| `skinShadow` | `#8A5A3C` | skin ramp 1 |
| `skinBase` | `#BE8A5C` | skin ramp 2 |
| `skinLight` | `#E0B183` | skin ramp 3 |
| `clothDark` | `#6E5940` | undyed cloth ramp 1 — monk robes, sacks, tents |
| `clothBase` | `#957C56` | undyed cloth ramp 2 |
| `clothLight` | `#B89E73` | undyed cloth ramp 3 |

### UI ramps & utility

| Name | Hex | Role |
|---|---|---|
| `parchDark` | `#B99A6B` | parchment ramp 1 — panel inset edges |
| `parchBase` | `#DABE8D` | parchment ramp 2 — text panels, tooltips |
| `parchLight` | `#EFDDB5` | parchment ramp 3 — parchment highlights |
| `uiWoodDark` | `#2C1F12` | HUD wood ramp 1 — panel fill, icon backgrounds |
| `uiWoodBase` | `#46331F` | HUD wood ramp 2 — panel plank texture |
| `uiWoodLight` | `#64492B` | HUD wood ramp 3 — panel bevels |
| `outline` | `#1A1208` | THE outline color; also HUD outermost border |
| `highlight` | `#F4EEDD` | warm white — glints, selection ring, text, water sparkle |
| `berryRed` | `#A62E3E` | berries, blacksmith embers, meat, wolf eyes |

Drop shadows are `#000000` at **alpha 88** (≈35%) — the only translucent paint allowed
inside sprite frames. One value for everything: unit/object shadow ellipses and building
footprint shadows (§7.6) alike, so the §9.1 whitelist stays `{black@88}` exactly.

---

## 2. Player colors & the magenta mask

Eight player colors (index 0..7 per ASSET_CONTRACT), each authored as a 3-tone ramp:

| Idx | Name | light | mid | dark |
|---|---|---|---|---|
| 0 | blue | `#5C8CD6` | `#2F5FB5` | `#1C3B76` |
| 1 | red | `#E06050` | `#B3261E` | `#711512` |
| 2 | green | `#6CBF5C` | `#3E8C34` | `#24591E` |
| 3 | yellow | `#F2D45C` | `#D4A82A` | `#8E6E14` |
| 4 | cyan | `#7AD2D2` | `#38A6AA` | `#1D6C70` |
| 5 | purple | `#B07CD6` | `#7E44A8` | `#4C2370` |
| 6 | gray | `#C9C9CF` | `#92929B` | `#5A5A64` |
| 7 | orange | `#F0A04E` | `#D26A1E` | `#8C4212` |

**Mask mapping** (per ASSET_CONTRACT): sprites are authored with the magenta-family
mask and assetgen swaps at build time:

- `#FF00FF` → player **light**
- `#CC00CC` → player **mid**
- `#990099` → player **dark**

**Strategy: `baked`.** Assetgen emits fully-recolored `@p<idx>` frame variants — the
variant token is the **numeric player index 0–7** (`@p0`…`@p7`, never the color name;
indices stay stable if names ever change) — and writes
`meta.bannerfall.playerColorStrategy = 'baked'` into every atlas JSON that
contains masked frames. (Baked preserves the 3-tone shading; tinting would flatten it.)

Rules of use:
- Author player-color areas with all three mask tones so the swap keeps the top-left
  light model (light on upper-left of the area, dark on lower-right / folds).
- Player color must cover **8–20%** of a unit's opaque pixels — enough to read team at
  1×, never the whole body. Assetgen asserts this range in a post-pass check; the
  assert reads the **per-defId override table in §9.4** (monk and owned animals sit
  deliberately below the default band).
- `gray` (idx 6) is deliberately lighter and cooler than the stone ramp; still, never
  place gray banners directly against `stonePale` without the 1 px outline between.

---

## 3. Terrain

Terrain frames are full 64×32 diamonds (transparent corners), 2–4 seeded variants per
terrain, named `terr/<terrainId>/<variant>`. All noise is seeded per
`(terrainId, variant)` so tiles are stable across builds; the *map* varies tiles by
picking variants per-coordinate hash at runtime.

### 3.1 Per-terrain treatment

| Terrain | Base fill | Noise recipe (per 64×32 tile) | Variants |
|---|---|---|---|
| `grass` | `grassBase` | ~70 single px: 60% `grassLight`, 40% `grassDark`; plus 4–6 two-px horizontal dashes of `grassDark` | 4 — v0/v1 plain seeds; v2 adds 2 grass tufts (3 px "Ʌ" of `grassLight` over `grassDark`); v3 adds one `dirtLight` bare patch (5×3 px ellipse, 50% dither edge) |
| `dirt` | `dirtBase` | ~50 px: 50% `dirtDark`, 30% `dirtLight`, 20% `dirtPale`; 3–5 pebbles (2×1 `dirtDark` with 1 px `dirtLight` top) | 3 — v2 adds a dry crack: 6–10 px meandering 1 px `dirtDark` polyline |
| `forest` (floor under trees) | `grassShadow` | ~80 px litter: 50% `leafShadow`, 30% `grassDark`, 20% `dirtDark`; 2–3 root knuckles (2×2 `woodDark`) | 3 |
| `water` | `waterBase` | 3 horizontal shimmer bands: rows y=8/16/24 dashed `waterLight` (dash 4 px, gap 6 px, x-offset differs per variant); ~10 px `waterDeep` speckle below center; 1–2 single `highlight` sparkle px | 4 (band offsets shift +2 px per variant — tiling water looks alive without animation) |
| `shallows` | `waterLight` | sandy-bottom patches, sparse `waterBase` speckle, and broken `highlight` ripple bands | 3 |
| `sand` | `dirtPale` | sparse earth/thatch flecks and short wind-ripple dashes | 3 |
| `road` | `dirtPale` | ~40 px: 50% `dirtLight`, 30% `dirtBase`, 20% `stoneLight` fleck; two 1 px wheel-rut lines of `dirtBase` running corner-to-corner of the diamond long axis | 3 |
| `farmland` (under farm objects, optional) | `dirtBase` | plow rows: 1 px `dirtDark` lines parallel to the NW edge every 4 px, `dirtLight` line adjacent (furrow highlight) | 2 |
| `snow` | `highlight` | cool stone/parchment speckle with short pale drift lines | 3 |
| `cliff` (blocked) | `stoneDark` | raised `stoneBase`/`stoneLight` shelf over dark layered strata, broken seams, cracks, and stone flecks | 3 |

Noise placement: rejection-sample points inside the diamond via
`insideDiamond(x, y) = abs(x-32)/32 + abs(y-16)/16 <= 1` (minus a 1 px margin).

### 3.2 Edge transitions

Terrain priority (high paints over low): `cliff > road > farmland > forest > snow >
grass > dirt > sand > shallows > water`.

Algorithm (implemented as an overlay pass when the renderer composes, or as baked
transition frames `terr/<hi>_<lo>/<edge>` if we prefer baking — assetgen picks baked;
a tile diamond's four edges run diagonally on screen, so edges are named `nw`, `ne`,
`sw`, `se`. These frames are packed into `terrain.png` and are registered in
ASSET_CONTRACT — see §10.7):

1. For each tile edge where the neighbor's terrain differs and has **lower** priority,
   the higher terrain bleeds a fringe **into the neighbor tile** along the shared edge.
2. Fringe = 3 bands parallel to the edge, in the neighbor's frame:
   band 0 (touching edge): 100% higher-terrain base fill, 2 px deep;
   band 1: 50% checker dither of higher base over lower base, 2 px;
   band 2: 25% dither, 2 px.
3. **Water shores** additionally draw a 1 px `waterLight` foam line on the water side
   of the edge, with a 50% dither break every 3rd px (no solid banding).
4. `forest` floor never transitions to `water` directly (map gen guarantees a grass or
   dirt ring); farmland only ever borders grass/dirt.

This reads as soft, hand-blended edges at 1× while being ~30 lines of code.

---

## 4. Objects

All objects: drop-shadow ellipse first, paint layers, outline pass last (§7).

### 4.1 Trees (`obj/tree/<variant>`, `obj/stump`)

Two species + one dead variant. Canvas 48×64, anchor (24, 60) at trunk base.

- **Oak** (`obj/tree/0`): trunk = 5 px wide `woodBase` rect, height 14, with 1 px
  `woodLight` left column; canopy = 3 overlapping ellipses (big center r14×10 at
  (24,26), two satellites r9×7 at (14,32) and (34,30)) filled `leafBase`; top-left
  crescent of each ellipse → `leafLight` (offset the same ellipse −2,−2 and keep the
  difference); bottom-right crescent → `leafDark` with 50% dither into base; 6–10
  seeded single-px `leafShadow` "leaf hole" speckles.
- **Pine** (`obj/tree/1`): the worked cookbook example — see §7.9.
- **Dead/bare** (`obj/tree/2`, sprinkle ≤8% of forests): `woodDark` trunk, 3 forked
  1 px branch polylines, no canopy, 2 px `woodPale` broken top.
- **Stump** (`obj/stump`): 7×4 `woodBase` ellipse top with `woodPale` inner ellipse
  (cut face) + 1 px `woodDark` ring, 3 px tall side, tiny root flares; shadow ellipse.

Forest look = oak/pine mixed per map biome (map gen chooses one dominant species per
forest cluster, 80/20 mix) over `forest` floor terrain.

### 4.2 Mines

- **Gold mine** (`obj/gold/<variant>`, 2 variants): mound of 3 stacked rock lumps
  (polygon fills, `stoneBase` with `stoneLight` top-left facets and `stoneDark`
  bottom-right facets), studded with 4–7 gold vein clusters: 2×2 `goldBase` squares
  each with 1 `goldShine` px at top-left. Canvas 56×40, anchor centered on a 1-tile
  footprint.
- **Stone mine** (`obj/stone/<variant>`, 2 variants): same mound construction, no
  veins; instead 2–3 flat cleaved faces of `stonePale` with 1 px `stoneDark` fracture
  lines. Silhouette is chunkier/flatter than gold (gold = lumpy, stone = blocky).

### 4.3 Berry bush (`obj/berries`)

Canvas 40×32, anchor (20, 28). Low dome: ellipse r15×8 `leafDark`, top-left crescent
`leafBase`, bottom row `leafShadow`; 8–12 berries = single `berryRed` px each with a
`highlight` px diagonal neighbor on ~⅓ of them. Reads as "red dots on dark green" at 1×.

### 4.4 Farms (`obj/farm/<stage>`)

3×3 tiles (192×96 diamond — GDD-fixed, mirrored in `packages/data`), drawn as a flat
terrain-like object with a 1 px `woodDark` post at each corner and split-rail edging on
the two camera-facing edges.

Farms skip the §5.2 `construct0..2`/`rubble` states entirely: a farm under
construction is `obj/farm/0` drawn by the renderer with a 50% checker pixel-dropout
that fills in as build progress advances, and a deleted or destroyed farm reverts to
bare terrain with no rubble frame (`farm/4` below is the *intact-but-exhausted* state,
not a ruin).

- `farm/0` (seeded): `farmland` plow-row treatment, `dirtDark`/`dirtBase`.
- `farm/1` (sprouting): plow rows + every 3rd px along each `dirtLight` furrow line
  becomes a 1 px `leafLight` sprout tick.
- `farm/2` (green): rows read as crop lines — 2 px `leafBase` bands with `leafLight`
  dashes on top, `dirtDark` gaps between.
- `farm/3` (ripe): bands switch to `thatchBase` with `thatchLight` dashes (golden
  wheat) — this is the "ready" read.
- `farm/4` (depleted/fallow): `dirtBase` with sparse `thatchDark` stubble ticks, posts
  intact. Used when the farm is exhausted awaiting re-seed.

### 4.5 Gaia animals (`obj/sheep/...`, `obj/deer/...`, `obj/wolf/...`)

Follow unit anim naming under `obj/`. Small canvases (32×32), height 10–14 px.

- **Sheep**: `highlight`-dithered-with-`clothLight` wool blob ellipse, `outline`
  contour, `clothDark` face and 4 leg ticks. When owned, a 2 px collar band in player
  mid via mask, emitted as `obj/sheep@p<idx>/...` variants (§10.9); collar coverage
  falls under the §9.4 animal override band (1–6%), not the unit 8–20% rule. Anims:
  idle 2, walk 4, die 3, decay 2 — reduced counts sanctioned for `obj/*` animals by
  the contract (§10.11).
- **Deer**: `dirtLight` body, `dirtPale` belly, 1 px antler forks (`woodPale`) on the
  head; longer legs than sheep = distinct silhouette. Same anim set; fleeing is the
  same `walk` frames played at 2× rate by the renderer — no extra anim, nothing new
  for the contract.
- **Wolf**: `stoneBase` body dithered with `stoneDark`, low head posture, tail straight
  back, 1 px `berryRed` eye. Attack anim 4 frames (lunge).

### 4.6 Projectiles (proposed `obj/proj/*` — see §10 contract deltas)

- `obj/proj/arrow/<dir>`: 7 px shaft `woodPale` + 2 px `metalLight` head + 1 px
  `clothLight` fletch, 8 rotations.
- `obj/proj/bolt/<dir>`: as arrow, 5 px, thicker head.
- `obj/proj/javelin/<dir>`: 9 px `woodBase` shaft, no fletch.
- `obj/proj/rock`: 5×4 `stoneBase` lump, `stoneLight` top-left px (mangonel: three
  rocks in flight = draw 3 offset copies at renderer level).
- `obj/proj/boulder`: 9×7 lump for trebuchet.

---

## 5. Buildings

### 5.1 Age visual language (one western-European set, both civs)

Civs share architecture; ownership reads via **player-color banners, trim, and door
cloth** (masked areas). Materials escalate per age:

| Age | Walls | Roofs | Details |
|---|---|---|---|
| **Dark** | rough round logs (`woodBase` verticals, `woodDark` gaps) + wattle panels (`woodPale` with `clothDark` weave dither) | thatch ramp, ragged 1 px eave edge (alternate ±1 px) | rope lashings (1 px `clothDark` X at joints), no windows, hide door flaps |
| **Feudal** | timber frame: `woodDark` posts/beams/X-braces over `woodPale` daub panels | thatch on houses; wood shingle (`woodBase` rows, `woodLight` every 3rd row) on military | shuttered windows (2×3 `woodDark`), plank doors |
| **Castle** | cut stone: `stoneBase` fill, 1 px `stoneDark` mortar lines every 4 px staggered like coursed blocks, `stoneLight` top-left quoins | slate ramp, straight eaves | arched doors (3 px arch of `stoneLight`), arrow slits (1×3 `outline`) |
| **Imperial** | dressed stone: `stonePale` fill, tighter 6 px coursing, `stoneLight` shade | slate with `slateLight` ridge + `goldShine` finial px | banners on poles, gold trim lines (1 px `goldBase`) on parapets, glazed windows (2×3 `waterLight`) |

Only **Town Center** and **House** get per-age variants (`bld/<defId>/<age>/done` per
contract). Every other building is authored once in the style of its unlock age.

One explicit exemption: defensive stone structures — Watch Tower (and its Guard
Tower/Keep tiers), Stone Wall, Gate — are stone whatever their unlock age, because
stone is their function, not decoration. §9.11 scores them against the stone rows of
this table rather than their unlock age.

### 5.2 Shared construction & rubble states

Per contract: `construct0..2` + `rubble`, one set per building (age-variant buildings
use the *unlock-age* look for scaffolds).

The HD override keeps all three construction stages on the approved completed
building's exact canvas and ground anchor. It progressively reveals that same
silhouette beneath a neutral foundation/scaffold layer; an older building recipe
must never be overlaid into an authored construction frame. Additional Town Centers
use the Castle-age model because that is the age in which they become constructible.

- `construct0`: footprint diamond of `dirtBase` (edges 50%-dithered into terrain), 4
  corner stakes (1×4 `woodBase`), 2–3 plank piles (6×2 `woodPale` stacks), one
  `clothDark` sack.
- `construct1`: perimeter scaffold at half final height — `woodBase` poles every 8 px,
  1 px `woodLight` horizontal walkways, X-braces `woodDark`; interior shows wall
  material rising to ~40% height.
- `construct2`: building at ~80% height/detail, roof missing its top third (show
  `woodDark` rafter lines), one scaffold face remaining on the right side.
- `rubble`: collapsed mound ~35% of building height — irregular polygon of the
  building's primary wall material (dark tone), studded with 4–8 chunks (3×2 blocks of
  the material's base tone), 2 protruding tilted beams (`woodDark`), `dirtLight` dust
  skirt dithered into the terrain. Rubble uses the same footprint anchor.

### 5.3 Per-building recipes

Footprints below match `packages/data` — **data is source of truth**; assetgen must
read footprints from data, not hardcode. Sprite canvas = footprint diamond width ×
(diamond height + wall/roof height). All buildings: banner/trim mask areas noted.
Shading is stated in screen terms (unambiguous under the top-left light): only the two
camera-facing wall planes exist in an iso view — the **screen-left plane uses the
material light tone, the screen-right plane uses the base tone**.

The **H** column is wall height / roof height in px, measured up from the top corner
of the footprint diamond (identity features that overshoot the roof are noted in
parentheses). These numbers are the objective basis for the §9.11 crescendo check.

| Building | Fp | H (wall/roof px) | Silhouette concept & key features | Player color |
|---|---|---|---|---|
| **Town Center** | 4×4 | 26 / 34 | Raised 6 px platform (stone from Castle age, log crib before) with front steps; open-sided great hall: 4 corner posts + one huge hipped roof (§7.13; roof = 34 of the 60 px above the diamond — the defining mass); interior floor `dirtPale`; side lean-to annex. Age variants: Dark = thatch + logs; Feudal = shingle + timber frame; Castle = slate + stone piers; Imperial = `stonePale`, gold ridge trim, glazed gable window. | Tall banner pole at roof apex (flag 6×4 masked px) + door cloth |
| **House** | 2×2 | 12 / 14 | Dark: oval wattle hut, conical thatch; Feudal: gabled timber-frame cottage; Castle: stone ground floor + jettied timber upper; Imperial: stone townhouse, slate roof, chimney (smoke = roadmap). Chimney/gable placement varies per age so the skyline stays varied. | 3×3 pennant on gable end |
| **Mill** | 2×2 | 24 / 8 (sail cross +12) | Dark-age log-crib base (`woodBase` verticals, `woodDark` gaps, rope lashings) + tapered wooden tower + **diagonal 4-blade sail cross (X, not +)** — instantly readable food icon on the skyline; grain sacks (`clothBase`) at door. | Sail cloth stripes (2 px per blade) |
| **Lumber Camp** | 2×2 | 10 / 8 | Open lean-to (two posts + single-pitch shingle roof) sheltering a **big horizontal log stack** (4 logs = `woodBase` cylinders with `woodPale` end ellipses + `woodDark` ring); sawhorse + leaned axe outside. | Roof edge trim line |
| **Mining Camp** | 2×2 | 8 / 6 (headframe apex 24) | Timber **headframe** (A-frame gantry, 2 px beams) over a dark pit mouth (`outline` ellipse), ore cart (6×4 `woodDark` box on 2 px wheels) with `goldBase`-or-`stoneLight` fleck load; crate + pick. | Flag on headframe apex |
| **Farm** | 3×3 | 0 / 0 (flat) | Flat field object — see §4.4. | none |
| **Barracks** | 3×3 | 14 / 18 | Dark-age long-hall: log walls, steep thatch ridge running NW–SE, **shield rack** on the front wall (3 round shields = masked circles — doubles as the player-color read), spear rack + training post in the yard corner. | Shield rack + door banner |
| **Archery Range** | 3×3 | 10 / 10 | Feudal open yard: small timber-frame shed at back, low fence, **target butt** (straw disc: `thatchBase` circle, `berryRed` 2 px bullseye, `highlight` ring) — target = the identity feature; 3 arrows stuck in the ground. | Awning stripe over shed door |
| **Stable** | 3×3 | 12 / 16 | Feudal wide gable barn with big open door (dark interior + `thatchLight` hay), corral fence on the right tiles, water trough; horseshoe (`metalLight` U) over the door. | Long roof-ridge pennant |
| **Blacksmith** | 3×3 | 12 / 12 (chimney +8) | Feudal open-front forge: shingle roof, **stone chimney with 3 ember px** (`berryRed` + `goldShine` at the mouth — the only "glow" in the set), anvil block outside, wall-hung tools. | Trim on roof fascia |
| **Market** | 4×4 | 18 / 12 (stalls 10) | Feudal timber-frame trading hall (`woodDark` posts/X-braces over `woodPale` daub, shingle roof) + two **cloth awning stalls** (striped canopies: one parchment-striped, one masked player-striped), barrels, coin chest with `goldShine` px. Bustling = lots of small props, tallest element only 2 stories. | One full awning |
| **Siege Workshop** | 4×4 | 14 / 10 | Castle-age big open-front stone shed (wide arch), **giant spare wheel** leaning on the wall (radius 10 px, `woodDark` spokes) + timber crane arm over a half-built ram frame in the yard. Widest, flattest military building. | Flag on crane tip |
| **Monastery** | 3×3 | 20 / 22 (bell tower apex 52) | Castle-age chapel: tall narrow nave, steep slate roof, small **bell tower** with visible bell (`goldBase` 3 px), round window = `goldShine` **sunburst disc emblem** (our original ecclesiastic mark — no real-world religious symbols), arched door, tiny walled herb garden strip. | Door banner only (subtle — monks convert, color stays quiet) |
| **University** | 4×4 | 22 / 16 (armillary +8) | Castle-age scholars' hall: two-story `stoneBase`, three arched windows lit `thatchLight` (candlelight), slate roof with **brass armillary sphere** (3 crossed 1 px `goldBase` ellipses) on a rooftop post — the identity feature. | Heraldic plaque (3×4) beside door |
| **Watch Tower** | 1×1 | 44 / 8 | Feudal round stone tower, 52 px total (tallest thing per footprint px): battered base, arrow slit, **crenellated crown** (2 px merlons), timber hoarding ring under the crown. Upgrade tiers (`guardTower`, `keep` — separate defIds in data): +8 px height, machicolation row, then `stonePale` + gold trim. | Flag from crown |
| **Stone Wall** | 1×1 | 12 / 0 | Coursed `stoneBase` curtain, 12 px tall, crenellated. Piece set: 2 straight orientations (NW–SE, NE–SW), corner post (round mini-tower), end cap — see §10. | none |
| **Gate** | 1×1 | 16 / 0 (posts 20) | Single-tile (v1, per data): two flanking posts hugging the tile's corners + arch spanning the wall line + **portcullis grid** (1 px `metalDark` lattice); open state = raised portcullis (grid at arch top). Two orientations to match the wall axes. | Pennants on both posts |
| **Castle** | 4×4 | 44 / 28 (drum caps — §7.14) | The hero sprite: central square **keep** (2 stories, `stoneBase`) + **4 corner drum towers** with conical slate caps + curtain walls between, full crenellation runs, arrow slits, battered plinth. Big banner on the keep + 2 tower pennants. Heaviest military silhouette in the game (~200 px sprite; only the Wonder's spire tops it). | Keep banner 8×6 + pennants + door |
| **Wonder** | 5×5 | 56 / 34 (spire) | "**The Bannerspire**" — original design: three stacked, shrinking `stonePale` octagonal tiers (§7.15) on a great plinth, braced at each compass corner by a diagonal 2 px `stonePale` buttress strut from plinth to the tier-1 cornice (§7.15), crowned with a `goldShine`-dithered spire and 4 player banners at the compass points; gold trim line on every tier. Reads as a gilded beacon from across the map. | 4 banners + spire trim |

Roof shading rule for all gabled/hipped roofs, in screen terms: **screen-left plane =
material light tone; screen-right plane = base tone with a 2-row 50% dither of dark
tone along the eave; 1 px ridge line = light tone (slate uses `slateLight`, thatch
`thatchLight`)**. Vertical walls: screen-left plane light, screen-right plane base;
under-eave shadow = one 1 px dark-tone row.

---

## 6. Units

### 6.1 Global rig rules

- Humans **24–30 px** tall (feet→head, before outline), cavalry **34–40 px**, per
  ASSET_CONTRACT. Working canvases: human 48×48, cavalry 64×56, ram/mangonel 80×72,
  trebuchet 112×96. Anchor at feet (contract); anchor point = canvas center-x, 4 px
  above canvas bottom (room for the shadow ellipse).
- 8 directions, dir 0 = S (toward camera), clockwise. Assetgen draws dirs **0–4**
  (S, SW, W, NW, N) and bakes 5/6/7 by horizontally flipping 3/2/1. Consequence: gear
  swaps hands on east-facing dirs — the classic retro convention; accept it, and keep
  torso art near-symmetric so the flip is invisible at 1×.
- Frame counts (fixed choices within contract ranges): `idle` 2, `walk` 6 (cavalry 8),
  `attack` 5 with **impact on frame index 2** (written to
  `meta.bannerfall.impactFrame` per anim), `die` 5, `decay` 3 (corpse → bones → dust,
  each ~40% more transparent via pixel-dropout dither, not alpha fade), villager
  `gather` 4 (per gather pose: chop/mine/forage share the swing rig with different
  tools), `carry` 6 (walk rig + shoulder sack/bundle prop).
- Every unit: drop-shadow ellipse (width ≈ 70% of body width, height ¼ of width,
  black alpha 88) drawn before the body.
- Body construction is layered primitives: legs (2×5 px columns), torso (rounded rect
  or ellipse), head (3–4 px circle + 1 px `skinShadow` neck), gear layers, then
  outline pass. Skin/cloth/metal each shaded 2-tone with the top-left rule.
- **Horse rig** (all cavalry): body = ellipse ~18×8 px; neck = 3 px wide poly rising
  ~45° toward screen-left; head = 4×3 wedge poly + 1 px ear; legs = four 2×8 px
  columns (far pair one ramp step darker); mane crest and tail = 1 px polylines that
  lag the body by 1 px per §6.3. **Coats use existing ramps — no new palette
  entries**: knight line = bay (`woodBase` body, `woodLight` lit crest/rump,
  `woodDark` mane/tail/lower legs); scout line = dun (`dirtLight` body, `dirtPale`
  belly/muzzle, `woodDark` mane/tail) — the paler coat keeps the light rider readable
  against the knight line's mass. Layer order for the caparisoned knight line: far
  legs → body → near legs → caparison cloth (masked, hem at mid-leg so legs stay
  visible) → saddle → rider legs → rider torso/head → gear → outline pass.

### 6.2 Role silhouettes (the readability contract)

Each role owns ONE exaggerated feature no other role has:

| Role | Silhouette key | Height | Player color placement |
|---|---|---|---|
| **Villager** | Rounded hunch + tool over shoulder; carry = visible sack/log/ore lump | 24 px | Cap + belt sash (mask ~10%) |
| **Militia line** (Militia → Man-at-Arms → Longswordsman → Champion) | Sword + **round shield** held at side; upgrades add: metal helmet (MAA), longer blade + shoulder plates (LS), full plate sheen + plume (Champ) — same rig, gear layers escalate | 26 px | Shield face + tunic |
| **Spearman → Pikeman** | **Tall vertical spear** exceeding head by 8 px (pike 12 px) — the only strong vertical in the roster | 26 px | Pennon strip below spearhead + tunic |
| **Archer line** (→ Crossbowman → Arbalester) | **Bow arc** in front profile, quiver spike behind shoulder; crossbow variants hold a horizontal T (distinct from bow C) | 25 px | Quiver + cap |
| **Skirmisher → Elite** | Javelin held overhand + **small buckler**, wide-brim leather hat (round head blob = distinct vs archer cap) | 25 px | Headband + buckler rim |
| **Scout → Light Cavalry** | Small rider, **bare horse**, forward lean, short lance; horse tail streams | 34 px | Saddle blanket |
| **Knight → Cavalier → Paladin** | Big rider, **caparisoned horse** (cloth covering = large mass), kite shield, couched lance; Paladin = full horse caparison + plume | 38–40 px | Caparison + kite shield (biggest mask area in game ~18%) |
| **Battering Ram** (→ Capped → Siege Ram) | Wheeled **housing box** (no visible crew): pitched plank roof, swinging log head protruding front; attack anim = log piston. Tiers per the upgrade-line rule: Capped adds `metalBase` plating rows, Siege Ram a full metal-capped head + skirt | 20 px tall, long | Banner strip along roof ridge |
| **Mangonel** | Low chassis + **throwing arm + cross-frame**; attack = arm snaps 3 poses (cocked → vertical → follow-through), rock leaves on impact frame | 26 px | Frame stripe |
| **Trebuchet** | Packed (= `walk`): flat cart, folded arm along the bed. Unpacked (= `idle`): **towering counterweight A-frame**, arm at rest; `attack` 5 frames: sling drag → arm whips over the top → sway settle. Tallest unit (≈70 px unpacked) | — | Counterweight box panel + flag |
| **Monk** | **Robed cone silhouette** (no legs visible), hood, staff; attack anim = conversion: staff raised, 2-px `goldShine` spark orbit (2 frames alternating) | 26 px | Sash trim only (~6% — intentional minimum via the §9.4 override band 4–10%; monks read as neutral-ish) |
| **Highland Raider** (Scots UU) | Sprinter pose, **two-handed long axe** across body, kilt = 2-tone check dither (player mid × `clothDark`, 2×2 checks), bare calves | 27 px | Kilt check + shoulder plaid |
| **Longbowman** (English UU) | **Warbow taller than the man** (bow tip 4 px above head), hooded, arrow bag at hip | 26 px | Hood + bracer |

Upgrade-line rule: one rig per line; tiers add/replace gear layers and bump 1–2 tones
up the metal ramp (Champion/Paladin get `metalLight` dominance + a `highlight` glint
px on helmet). Silhouette never changes within a line — only reads richer.

### 6.3 Key poses per anim (drawn as per-frame limb offset tables)

Poses are data: each anim = array of `{legL, legR, armL, armR, torsoDy, gear}`
integer offsets applied to the layered rig. `gear` is **per-frame weapon endpoint
coordinates** `[x0, y0, x1, y1]` in canvas space: the weapon is simply redrawn each
frame as a `line`/`poly` between the authored endpoints. (The §7 primitive set has no
rotation, and rotating pixel art at arbitrary angles would alias — endpoints sidestep
both.)

- `walk` 6: contact / down / passing / contact(mirrored) / down / passing. Torso bob
  `dy = [0, -1, 0, 0, -1, 0]` (§7.7). Cavalry 8-frame: 4-beat leg cycle with leg
  phase offsets of 0/2/4/6 frames (order: left-fore, right-hind, right-fore,
  left-hind), mane/tail 1 px lag.
- `attack` 5: anticipation (gear pulled back, torso −1 px) ×2 → **impact** (full
  extension, gear +2 px toward facing — frame index 2, marked in atlas meta) →
  follow-through → recover.
- `idle` 2: base + one frame with 1 px chest/gear shift (subtle life, cheap).
- `die` 5: hit recoil → knees fold (torso +2 px down) → falling diagonal → prone →
  prone settled (weapon detached 2 px away).
- `gather` 4 (villager): raise tool ×2 → strike (impact mark) → recover; same timing
  for chop/mine; forage/farm variant swaps tool for reach-down pose.

---

## 7. Drawing technique cookbook (assetgen recipes)

Primitives assumed in `tools/assetgen` (all integer, all palette-indexed):
`px(x,y,c)`, `rect(x,y,w,h,c)`, `ellipse(cx,cy,rx,ry,c)` (filled, scanline),
`poly(points,c)` (filled, scanline), `line(x0,y0,x1,y1,c)` (Bresenham),
`ditherRect/ditherRegion(region, cA, cB, level)` where level ∈ {50, 25}.

1. **Paint order** (every sprite): shadow ellipse → back-to-front layers (far legs →
   body → near limbs → gear) → shading passes → dither passes → **outline pass** →
   mask-color check.
2. **Outline pass**: for every opaque pixel with ≥1 transparent 4-neighbor, recolor to
   `outline`. For the neighbor test, "transparent" means **alpha < 255** — the
   alpha-88 shadow counts as transparent, so feet touching the shadow still get their
   contour — and the pass never recolors shadow pixels themselves.
   Inside-the-silhouette outlining keeps frame dimensions exact and is one
   double loop. Interior detail lines (mortar, plank gaps) use the material dark tone,
   *never* `outline` — reserve true black-brown for the contour so silhouettes pop.
3. **Top-left light**: for any volume, the shading transform is: offset the volume's
   own shape by (−2, −2), intersect with itself → that region steps **+1** up the ramp;
   offset by (+2, +2), intersect → steps **−1** down. Two set-operations, no normals.
4. **Two-tone dither**: transitions between adjacent ramp tones get a 2 px band of 50%
   checker (`(x + y) & 1`), optionally followed by 25% (`x % 2 == 0 && y % 2 == 0`).
   Never dither across non-adjacent tones (no `grassLight` checker into `grassShadow`).
5. **No banding**: never lay two parallel 1 px ramp-tone lines hugging the outline
   (the "glow worm"). Shading bands must be ≥2 px or broken by dither.
6. **Drop shadow**: `ellipse(anchorX, anchorY - 1, bodyW * 0.35, bodyW * 0.09, black)`
   composited at alpha 88 before anything else. Buildings: shadow = footprint diamond
   extended 4 px to the SE, same black at **alpha 88** — one whitelisted translucent
   value everywhere (§0.4, §9.1).
7. **Walk bob**: integer torso/head y-offsets per frame — `[0, -1, 0, 0, -1, 0]` for
   6 frames (never sub-pixel; nearest-neighbor zoom would shimmer). Gear bobs with the
   torso; the shadow does NOT bob.
8. **Mirroring**: after baking dirs 0–4, `flipH` frames 3/2/1 → 5/6/7. `flipH` must
   run **after** the outline pass and **before** magenta baking, so mask pixels flip
   identically and recolored variants stay consistent.
9. **Worked example — pine tree** (`obj/tree/1`, canvas 48×64, anchor (24, 60)):
   ```
   shadow:  ellipse(24, 58, 10, 4, BLACK@88)
   trunk:   rect(22, 44, 4, 15, woodBase); rect(22, 44, 1, 15, woodLight)   // lit left edge
   tiers (bottom→top), fill leafBase:
            poly [(24,22),(6,46),(42,46)]
            poly [(24,12),(10,36),(38,36)]
            poly [(24, 4),(14,26),(34,26)]
   shade:   per tier — pixels within 3 px of the LEFT edge → leafLight;
            within 3 px of the RIGHT edge → leafDark;
            bottom row of each tier → leafShadow (tier-on-tier shadow)
   dither:  50% checker of leafDark over leafBase in a 2 px band inboard of the
            right-edge shade; 6 seeded leafShadow speckle px in the interior
   outline: standard pass (§7.2)
   check:   no mask colors present → frame is player-neutral
   ```
   Variant seeds jitter tier half-widths ±2 px and speckle placement.
10. **Roof recipe** (any gable): left plane = `poly` fill light tone; right plane =
    base tone; `line` ridge = light tone; 2-row 50% dither of dark tone above the right
    eave; 1 px dark-tone under-eave shadow row on the wall below.
11. **Coursed masonry**: fill wall rect base tone; every 4th row, 1 px dark line;
    vertical 1 px dark joints every 6 px, offset 3 px on alternate courses; corner
    column of light tone (quoins) on the screen-left corner.
12. **Magenta authoring**: draw team areas directly in `#FF00FF`/`#CC00CC`/`#990099`
    respecting the light rule (FF top-left, 99 bottom-right). Bake pass: exact-match
    swap to the player ramp, emit `@p<idx>` frames, assert leftover-magenta count == 0.
13. **Hipped roof** (TC): four trapezoid `poly` fills, but only the two camera-facing
    planes are drawn — screen-left trapezoid = light tone, screen-right = base tone
    with the §7.10 eave dither; 1 px ridge `line` = light tone; hip seams = 1 px
    dark-tone diagonals from ridge ends to eave corners.
14. **Cone** (castle drum-tower caps, Mill cap): stacked 1-px-tall `ellipse` rows
    whose rx shrinks linearly to a single apex px; on each row the left ~⅓ arc =
    light tone, right ~⅓ = dark tone, middle = base; apex px = light tone.
15. **Octagonal tier + buttress strut** (Wonder): tier = `poly` of the octagon's
    visible faces with §7.11 coursed masonry per face (screen-left faces one tone
    lighter); buttress strut = two parallel Bresenham `line`s forming a 2 px wide
    diagonal from plinth to the tier-1 cornice, `stonePale` fill with a 1 px
    `stoneDark` underside line — one strut per compass corner.

---

## 8. UI style

### 8.1 HUD chrome (`ui/*`)

- **Panels**: dark wood 9-slice (`ui/panel/*`): fill `uiWoodDark` with 1 px
  `uiWoodBase` plank lines every 12 px; border = 1 px `outline` outermost, then 1 px
  `goldDark`, then 1 px `uiWoodLight` bevel. Corners get a 3×3 gold rivet dot.
  Parchment inset (`ui/parchment`): `parchBase` fill, `parchDark` 1 px edge,
  `parchLight` top-left inner bevel — used for tooltips, objectives, briefing text.
- **Buttons** (`ui/btn/<state>`, 44×44 frame around 40×40 icons): `idle` = wood fill +
  1 px `goldDark` border; `pressed` = icon content shifted +1,+1, border `goldBase`,
  top+left inner rows darkened to `outline`; `disabled` = idle frame, icon drawn from
  its grayscale companion (assetgen emits `icon/<id>/gray` by luma-mapping onto the
  stone ramp — contract-registered, §10.8) + 45% black overlay; `active`
  (toggled/queued) = border `goldShine` + 4 corner ticks.
- **Health bar** (`ui/hp`): height 4 px, width 26 px for units / footprint-diamond
  width − 8 for buildings; 1 px `outline` border; fill = `#3E8C34` above 50%,
  `#D4A82A` 25–50%, `#B3261E` below (the green/yellow/red player-ramp mids reused);
  1 px `highlight` top row inside the fill; empty portion `uiWoodDark`.
- **Selection ring** (`ui/ring/<size>`): units = 1 px `highlight` ellipse at the feet
  sized to the shadow, with a 1 px `outline` ellipse offset +1 y beneath it (keeps it
  visible on snow-bright or pale terrain — and on `stonePale` roads). Buildings = 1 px
  `highlight` diamond outline tracing the footprint. Enemy-target flash: same ring in
  `#B3261E` for 6 ticks.
- **Minimap** (`ui/minimap/frame`): 128×128 panel, wood 9-slice + gold corner caps;
  map area is the rotated diamond; renderer plots: terrain = base fills darkened one
  step, trees `leafDark`; **resources** = 1 px dots over a 1 px `outline` backing
  pixel — gold `goldShine`, stone `stonePale`, berries `berryRed` (the pale tones sit
  a ramp step away from every player mid; measured collisions: gray mid vs
  `stoneLight` and yellow mid vs `goldBase` were indistinguishable at dot size);
  **units/buildings** = solid 2×2 squares of player **mid**, no backing — solid
  square vs outlined dot is the army-vs-resource tell at a glance; alerts = 3 px
  `#B3261E` blinking diamond, camera = `highlight` 1 px trapezoid.
- **Command card**: 5×3 button grid of the 44×44 buttons over a wood panel; progress
  overlay = vertical `goldBase` 2 px bar on the button's right edge + queue count in
  parchment chip.

### 8.2 Fonts

UI text is optimized for legibility first: the HUD carries dense, small,
frequently-changing strings (stats, queue counts, timers) that a bitmap face
renders ambiguously on high-DPI phone screens. The period tone is carried by the
display face and by §8.1 panel art, not by pixelated body text.

- **Display / headers / age banners**: **"Cinzel"** (Google Fonts, OFL) — an
  inscriptional Roman capital serif that keeps the medieval register while staying
  readable at banner sizes. Weights 600 (section titles) and 700 (banners).
- **Body / numbers / tooltips**: **"Alegreya Sans"** (Google Fonts, OFL), a humanist
  sans with a calligraphic root. Weights 400/500/700, typically 13–18 px.
- **CSS stacks**: `"Alegreya Sans", "Trebuchet MS", sans-serif` for body and
  `"Cinzel", "Georgia", serif` for display. Let the browser antialias normally — do
  NOT apply `image-rendering: pixelated` to HUD text.
- **Numerals**: every counter (`.bf-num`, resource/pop/HP/queue/timer readouts) sets
  `font-variant-numeric: tabular-nums` so digits keep a fixed advance width and
  values do not shift their neighbors as they tick.
- Text colors: `parchLight` on wood, `outline` on parchment, `goldShine` for resource
  numbers when recently increased, `#B3261E` when insufficient.

### 8.3 Icons (`icon/*`, 40×40)

- Background: flat `uiWoodDark` with the 4 corner px stepped to `outline`; border
  1 px `goldDark` (inside the 40×40).
- Subject fills a 32×32 center box, same palette + outline pass as sprites.
- Unit icons = bust view (head + shoulders + signature gear, NOT the full sprite —
  busts stay readable at 40 px). Building icons = ¾ mini-render of the silhouette.
  Resource icons: food = meat haunch (`berryRed` + `skinLight` bone), wood = plank
  pair, gold = coin stack (`goldShine` glint), stone = block pair.
- **Tech icons** (`icon/tech/<techId>`) = a single emblem object per tech, assigned by
  group; tiers within a line add 1/2/3 `goldBase` pips in the bottom-right corner:

  | Tech ids | Emblem (palette) |
  |---|---|
  | `feudalAge` / `castleAge` / `imperialAge` | stone arch gateway (`stoneBase`/`stoneLight`) with I/II/III `goldShine` numeral pips |
  | `forging`, `ironCasting`, `blastFurnace` | anvil (`metalDark`) + sword blade (`metalLight`) |
  | `fletching`, `bodkinArrow`, `bracer` | fletched arrow, point up (`woodPale` shaft, `metalLight` head) |
  | `scaleMailArmor`, `chainMailArmor`, `plateMailArmor` | cuirass torso plate (`metalBase`, `metalLight` top-left) |
  | `scaleBardingArmor`, `chainBardingArmor`, `plateBardingArmor` | horse head in barding (`woodBase` head, `metalBase` chanfron) |
  | `paddedArcherArmor`, `leatherArcherArmor`, `ringArcherArmor` | hood + jerkin (`clothBase`/`clothDark`) |
  | `horseCollar`, `heavyPlow`, `cropRotation` | wheat sheaf (`thatchBase`, `thatchLight` heads) |
  | `doubleBitAxe`, `bowSaw`, `twoManSaw` | axe head over a log (`metalLight` + `woodBase`); saw teeth line for the saw tiers |
  | `goldMining`, `goldShaftMining` | pick over coin (`metalBase` + `goldShine`) |
  | `stoneMining`, `stoneShaftMining` | pick over block (`metalBase` + `stonePale`) |
  | `loom` | cloth bolt + spindle (`clothLight`/`clothDark`) |
  | `wheelbarrow`, `handCart` | one-wheel barrow / two-wheel cart (`woodBase`, `woodDark` wheel) |
  | `ballistics` | arrow on a dotted arc (`metalLight` head, `goldDark` dots) |
  | `masonry`, `architecture` | trowel over a block wall (`metalLight` + `stoneBase`) |
  | `murderHoles` | portcullis grid (`metalDark` lattice on `outline` field) |
  | `chemistry` | round flask (`waterLight` glass, `goldShine` contents) |
  | `siegeEngineers` | ram head log with `metalBase` cap |
  | `sanctity`, `fervor`, `faith` | the §5.3 monastery sunburst disc (`goldShine`), tier pips |
  | `blockPrinting` | open book (`parchLight` pages, `clothDark` cover) |
  | `schiltron` | ring of spear points (`metalLight` on `outline`) |
  | `highlandFury` | crossed long axes (`metalLight`/`woodBase`) |
  | `yeomanLevy` | drawn longbow, arrow nocked (`woodPale`) |
  | `ludgar` | trebuchet arm + sling silhouette (`woodBase`) |
  | any `*Upgrade` (unit-line upgrades) | reuse the target unit's bust icon + a `goldShine` chevron in the top-right |

- **Command icons** (`icon/cmd/<verb>`, same 40×40 chrome — contract-registered,
  §10.10): `attackMove` = sword over a ground arrow; `stop` = hollow octagon
  (`berryRed` rim); `garrison` = arrow into a doorway arch; `ungarrison` = arrow out
  of the arch; `townBell` = gold bell with clapper and ringing marks; `delete` =
  cracked shield (`stoneBase`, `outline` fracture);
  `reseedFarm` = hand scattering `thatchLight` seed px over furrow lines; `pack` /
  `unpack` = folded trebuchet + down arrow / raised A-frame + up arrow; `heal` =
  open palm + `goldShine` spark; `convert` = sunburst disc with an orbit ring;
  `rally` = flag on pole (`highlight` cloth).
- Player color never appears in icons (icons are player-agnostic); mask colors banned
  in `icons.png`.

### 8.4 Renderer overlays (GDD-mandated, composited at runtime — no atlas frames)

These are drawn by the renderer, not assetgen, but must stay on-palette:

- **Placement preview** (GDD building placement mode): the footprint diamond filled
  `#3E8C34` (valid) or `#B3261E` (invalid) — the green/red player-ramp mids reused —
  at ~50% alpha, with a solid 1 px edge of the same color; the building's `done`
  sprite ghosts above it at 50% checker pixel-dropout.
- **Fog of war**: unexplored = solid black. Explored-but-not-visible = a 45% black
  overlay; remembered buildings are drawn desaturated by luma-mapping onto the stone
  ramp (the same recipe as `icon/<id>/gray`), so memory reads as "stone-gray past".
  Visible = untouched.
- **Campaign heroes**: heroes alias a rank-and-file rig (`UnitDef.sprite`), and in the
  HD pack a hero and his militia are the same frames, so the renderer marks them
  instead of the atlas. Per hero, from `UnitDef.heroCloth` (a master-palette ramp,
  light/mid/dark): the rig's cloth AND metal ramps are palette-swapped to it — which
  of the two a rig uses depends on its tier, so both are needed — the sprite is
  multiplied by the ramp's light tone, lifted to a `0xE8` peak and deepened by a
  saturation exponent (the accent's only carrier on pre-rendered HD art), and the art
  draws at 1.3×. The marker is a pair of stars in that same hero colour over a dark
  rim with a `highlight` core — an eight-pointed compass rose (long cardinals, short
  diagonals; uniform points fill in as a circle at this size) squashed onto the floor
  plane at the feet, and a five-pointed star above the health bar — deliberately not
  the amber ellipse that gather targets, rally flags and garrison badges already use.
  The minimap adds a matching gold pip. Hero health bars anchor to the sprite's
  visible top rather than the fixed unit offset, which the larger art would cross. The
  player-colour band keeps its own ramp so ownership still reads; hero ramps must
  stay clear of the cloth and metal ramps and be saturated enough to tint (a grey or
  near-white ramp multiplies to nothing).
- **Band-select box**: 1 px `highlight` rect while dragging (no fill).
- **Control-group chips**: parchment mini-panels (§8.1 parchment inset, 20×20) with
  the group numeral in Alegreya Sans `outline`-colored text.

Score each sprite 0–2 per item (2 = pass, 1 = marginal, 0 = fail). Ship bar: no 0s,
≥ 90% of total points per atlas. Items marked ⚙ are automated in assetgen's post-pass;
the rest are eyeball checks on the contact-sheet review page.

1. ⚙ **Palette discipline**: every non-transparent pixel ∈ master palette ∪ player
   ramps ∪ {black@88 shadow}. Zero off-palette values.
2. ⚙ **Outline integrity**: 100% of silhouette boundary pixels are `outline`; no
   interior use of `outline` except authored contour details.
3. **Silhouette readability**: at 1× on a 64-px-wide phone-screen crop, each unit
   role is distinguishable from every other role by shape alone (test: 1-bit
   silhouette lineup image, generated automatically, judged by eye).
4. ⚙ **Player-color coverage**: units 8–20% of opaque pixels masked; buildings 2–8%;
   icons 0%. The assert reads this per-defId override table (quiet by design):
   `monk` 4–10%; masked `obj/*` animals (owned sheep collar) 1–6%; siege reads
   team via banner panels, not cloth mass — rams 1.5–8%, `mangonel`/`onager`
   3–9%, `trebuchet` 1.5–13%; `monastery` and `gate` 0.1–8% (door banner /
   post pennants on big quiet masses); `townCenter` 0.2–8% (apex banner flag +
   door cloth only) and `house` 0.2–8% (the single pre-outlined 3×3 gable
   pennant) — their §5.3 placements are small by construction on big sprites.
   Any future exception must be added here, not special-cased in code.
5. ⚙ **Contrast vs terrain**: composited on four backdrop strips — `grassBase`,
   `dirtBase`, `grassShadow` (forest floor, where hunting/lumbering happens), and
   `dirtPale` (road) — ≥ 40% of a unit's opaque pixels differ from each backdrop by
   ≥ 25 luma (0–255). Fails = mud camouflage in the woods or washout on roads.
6. **No banding**: no ≥ 4-px runs of parallel 1 px ramp lines along the contour; ramp
   transitions ≥ 2 px or dithered.
7. ⚙ **Dither discipline**: checker patterns only between ramp-adjacent tones; no
   random per-pixel noise inside unit/building sprites (seeded noise is terrain-only).
8. **Light consistency**: light tone concentration in the top-left of each volume;
   roofs follow §5.3/§7.10 (left plane lighter than right in every building frame).
9. ⚙ **Geometry compliance**: anchors match contract; footprint diamonds align to the
   64×32 grid; frame names resolve per ASSET_CONTRACT; `walk`/`attack` frame counts
   within contract ranges **for `unit/*` frames** (`obj/*` animals use the reduced
   counts of §4.5, which the contract sanctions — §10.11) and `impactFrame` present
   on attack anims.
10. **Animation legibility**: at 1×, walk reads as locomotion (no moonwalk — feet
    contact frames anchor), attack impact is visible as a distinct extreme pose, die
    is unambiguous vs idle.
11. **Age/material grammar**: building materials match §5.1 for the building's age;
    TC/house age variants form a clear visual crescendo when lined up.
12. ⚙ **Mirroring correctness**: dirs 5/6/7 are exact flips of 3/2/1 post-outline;
    baked `@p` variants contain zero residual magenta pixels.

Assetgen must emit `apps/web/public/assets/contact-sheet.png` (all frames on
checkerboard + grass/dirt/forest-floor/road composite strips matching §9.5 + the
1-bit silhouette lineup) so the critic can score 3, 6, 8, 10, 11 quickly.

---

## 10. Contract deltas & open questions

Items discovered while writing this bible. Items marked **[in contract]** are now
mirrored into ASSET_CONTRACT.md; the rest still need sign-off.

1. **Footprints**: §5.3 matches `packages/data` (source of truth — assetgen reads
   sizes from data, never hardcodes): TC 4×4, Market 4×4, University 4×4,
   Siege Workshop 4×4, Castle 4×4, Wonder 5×5, Gate 1×1 (v1 single-tile),
   **farm 3×3** (GDD-fixed; data's earlier 2×2 was updated to match).
2. **Projectiles**: not in the contract. Proposed: `obj/proj/<kind>/<dir>` (§4.6).
3. **Walls/gates**: contract has no piece-set naming for connectivity. Proposed:
   `bld/wall/<ori>` with `ori` ∈ {`a` NW–SE, `b` NE–SW, `post`, `end_a`, `end_b`} and
   `bld/gate_<ori>/<state>` (single-tile, two orientations) with `open`/`closed`
   folded into `done`-style states.
4. **Trebuchet pack/unpack**: mapped onto contract anims (`walk` = packed cart,
   `idle` = unpacked, `attack` = fire). If the sim wants a visible pack/unpack
   transition, the contract needs `pack`/`unpack` anims added.
5. **Villager gender**: this bible specs ONE unisex villager rig to halve the frame
   budget; if male/female variants are wanted later, they're a rig re-dress.
6. **Impact frame metadata** [in contract]: `meta.bannerfall.impactFrame` per attack
   anim, alongside `playerColorStrategy`.
7. **Baked terrain transitions** [in contract]: `terr/<hi>_<lo>/<edge>` with `edge`
   ∈ {`nw`, `ne`, `sw`, `se`} (§3.2), packed into `terrain.png`.
8. **Grayscale icon companions** [in contract]: `icon/<id>/gray` (§8.1 disabled
   buttons), packed into `icons.png`; luma-mapped onto the stone ramp, never masked.
9. **`@p<idx>` scope & token** [in contract]: the variant token is the numeric player
   index (`@p0`…`@p7`), never the color name; masked `obj/*` frames (owned sheep)
   emit `obj/<defId>@p<idx>/...` exactly like units.
10. **Command-verb icons** [in contract]: `icon/cmd/<verb>` (§8.3) for
    attack-move / stop / garrison / ungarrison / town bell / delete / farm re-seed /
    trebuchet pack + unpack / heal / convert / rally.
11. **Reduced animal frame counts** [in contract]: `obj/*` animals may use idle 1–2,
    walk 4, attack 4, die 3, decay 2 (§4.5); the §9.9 frame-count check applies the
    full ranges to `unit/*` only.
