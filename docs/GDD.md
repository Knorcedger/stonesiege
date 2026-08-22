# StoneSiege — Game Design Document

An original mobile RTS that recreates the *feel and depth of Age of Empires II*: economy →
ages → armies → castles, with counter-based combat and story campaigns. All art, names, text,
and code are original. Mechanics are faithful to the AoE2 experience.

Target session length: ~20 minutes (fast rush win) to ~2 hours (evenly matched imperial slugfest).
Platforms: iOS + Android (Capacitor), plus browser for development/testing.

Long sessions must survive mobile OS lifecycle: when the app is backgrounded, the match is
automatically snapshotted (the deterministic sim makes this cheap — persist the RNG seed +
command log, or a direct state dump) and resumed on relaunch, so a phone call at minute 90
never loses a game. Each campaign autosaves into its own slot, plus one for practice, so
several campaigns can be in progress at once and starting one never destroys another. All v1
modes are single-player, so the game is always pausable: explicit pause button, plus auto-pause
on backgrounding. (Named saves and per-chapter checkpoints stay on the roadmap — see Out of
scope.)

## Modes
- **Practice**: random-map skirmish vs 1–3 bot opponents. A seven-step slider runs
  from Beginner through Hardcore; each opponent can use a different level.
  Victory by conquest — elimination rules are defined in Victory / Defeat below.
- **Campaign**: scripted scenarios with objectives, briefings, and triggers.
  First campaign: **William Wallace — The Rising of Scotland** (6 scenarios; doubles as the
  tutorial arc, teaching economy → military → sieges progressively).

## Resources & Economy (AoE2-faithful)
- Four stockpiled resources: **Food, Wood, Gold, Stone**.
- **Villagers** gather and construct. Gathering requires drop-off buildings
  (Town Center for all; Mill = food, Lumber Camp = wood, Mining Camp = gold/stone).
- Food sources: berry bushes (forage), sheep/deer (herd/hunt), **farms** (renewable, a 3×3
  plot **placeable anywhere** — there is no proximity rule; efficient play clusters farms
  around a Mill/TC because of drop-off walk distance. Farms hold a finite amount of food and
  are re-seedable at full wood cost; the Mill provides a **reseed queue / auto-reseed toggle**
  that deducts wood as each farm expires, so late-game players never babysit 20 farms by hand).
  A completed farm remains reserved as a building plot but is walkable: villagers and armies
  cross its rows instead of pathing around the whole 3×3 field.
- Trees are map objects; chopping a tree replaces its canopy with a small non-blocking stump
  and clears the tile.
- Gold/stone mines are finite deposits. Depletion drives map control and aggression.
- Villagers carry a small amount (≈10; hunters carry more) and walk to drop-off: **placement
  of camps matters**.
- Market (Castle Age, matching `packages/data`): buy/sell resources at moving prices. The
  exchange rate is a **single global value shared by all players** in the match, and each
  trade shifts it. Every transaction pays a **~30% fee** (buying costs more than selling
  returns), so the Market is a lossy converter, not a free resource bank. No fee-reduction
  tech and no trade carts in v1.

## Population
- Pop cap default 100 in practice (configurable up to 200). Houses +5 pop, Town Center +5,
  Castle +20. House cost is cheap wood; getting "housed" stalls production — classic tension.

## Ages
Dark → **Feudal** → **Castle** → **Imperial**. Advancing is researched at the Town Center,
costs escalating food/gold, and requires **two qualifying buildings of your current age**
(AoE2 rule — the Town Center, houses, farms, walls, gates, and towers don't count; a Castle
alone satisfies Imperial).
Each age unlocks buildings, units, and technologies. Age-up times are substantial (~2 min)
so timing decisions matter.

## Buildings (v1 roster)
Town Center (trains villagers, researches ages, garrisons+arrows; extra TCs unlock in Castle
Age), House, Mill, Lumber Camp, Mining Camp, Farm, Barracks, Archery Range, Stable, Siege
Workshop, Blacksmith, Market, Monastery, University, Watch Tower (→ upgrades), Stone Wall,
Gate, Castle (trains unique unit,
trebuchets; strong arrows), Wonder (build + stand timer = victory in practice, optional).
No naval/docks in v1 (roadmap).

**Rally points**: every production building supports a rally — select the building, then tap
ground / a resource / an enemy to set it (shown as a flag; tap the flag control to clear).
Newly produced units walk to the rally. A rally on a **resource auto-tasks new villagers to
gather it** (the classic TC-rally-onto-berries loop); a rally on an **enemy unit or building
sends new military out on attack-move** toward it. With no rally set, new units step just
outside the building's footprint and idle there.

## Units (v1 roster) — line upgrades like AoE2
- **Villager** (all-purpose worker, can fight badly)
- Barracks: **Militia → Man-at-Arms → Longswordsman → Champion** (infantry line),
  **Spearman → Pikeman** (anti-cavalry)
- Archery Range: **Archer → Crossbowman → Arbalester**, **Skirmisher → Elite Skirmisher**
  (anti-archer, min range)
- Stable: **Scout → Light Cavalry** (fast, cheap, raids), **Knight → Cavalier → Paladin**
- Siege Workshop: **Battering Ram → Capped Ram → Siege Ram** (anti-building,
  pierce-immune-ish; garrisoned infantry add speed and building damage),
  **Mangonel → Onager** (area damage, friendly fire),
  **Trebuchet** (Castle-built, Imperial; pack/unpack)
- Monastery: **Monk** (heals; converts enemy units — with cooldown and resist rules)
- Castle: civ **unique unit**
- Gaia: sheep (capturable), deer, wolves (hostile)

Deliberate line trims vs the AoE2 reference (decisions, not oversights): 4-tier militia line
(the two-handed intermediate step is skipped), **2-tier spear line** (no third-tier halberd
upgrade — Pikeman is the Imperial anti-cavalry answer and is tuned in `packages/data` to hold
against Paladins), 2-tier scout line, 2-tier skirmisher line matching AoE2's two tiers.

## Combat (the AoE2 counter system — the heart of the game)
- Damage = per-class max(0, attack − armor), summed, minimum 1 per hit — computed over
  **armor classes**: every unit has melee armor, pierce armor, and class memberships
  (infantry / archer / cavalry / siege / spearman / building
  / ram / monk / unique). Attacks carry base melee-or-pierce damage plus **bonus damage vs
  classes** (spearmen +vs cavalry, skirmishers +vs archers, mangonels +vs buildings, etc.).
- Ranged units fire real projectiles with travel time and accuracy; moving targets can be missed.
  Mangonel shots deal area damage including to friendlies.
- Rate of fire, min range (skirms/mangonels), and unit speed create micro (dodging, kiting).
- Buildings with attacks: TC/towers/castle fire arrows on their own; garrisoned
  villagers/archers add extra arrows (melee garrisons add none; castle volleys by default).
- Garrison: units can garrison in TC/towers/castle/rams; garrisoned units are safe and slowly
  heal (in buildings — not inside rams). Capacities are per building/ram (numbers in
  `packages/data`); **only infantry may enter rams**. If a building is destroyed, everything
  garrisoned inside **dies with it** (evacuating a falling TC is real tension); if a ram is
  destroyed, its garrisoned infantry are **ejected alive**. The Town Center's bell shelters the
  nearest villagers up to capacity; every sheltered villager adds one volley arrow, and ringing
  again releases them and resumes their interrupted gather/build/repair work.
- Conversion: monks convert single enemy units at range — a per-interval chance between a
  minimum and maximum time. Damage does not interrupt it; killing the monk or breaking
  range/line of sight does. Success drains the monk's faith, which recharges slowly.
- No formations UI in v1; group moves keep loose spacing. Stances: none in v1 (attack-move
  exists). In place of stances, default combat behavior is fixed **per category**:
  - Standard military units auto-engage hostiles within their visible guard radius. Selected
    units show that radius as a faint ground circle: infantry guard 4 tiles, cavalry 6, and
    other military classes use their LOS. Plain move orders still take priority.
  - Same-player moving units do not shove one another into slow feedback chains. They may pass
    through a friendly queue while idle units still spread apart locally after movement ends.
  - **Villagers never auto-engage.** Attacked villagers flee toward the nearest TC/tower and
    garrison if there's room (otherwise they keep their task); they fight only on an explicit
    command.
  - **Monks never auto-convert** — conversion is always an explicit command, so faith is never
    drained by accident. Idle monks auto-heal the nearest wounded friendly in range.
  - **Mangonels hold fire** whenever a friendly unit is inside the blast area of the shot they
    would take; an explicit target/ground command overrides this (friendly fire still applies).
  - **Rams and trebuchets** never auto-acquire; they attack only explicitly ordered targets
    (attack-move sends them at the nearest enemy building).

## Technologies
- **Blacksmith**: 3 tiers each of melee attack (infantry+cavalry), archer attack/range,
  infantry armor, cavalry armor, archer armor — five lines, age-gated as in AoE2.
- **Economy**: lumber/mining efficiency tiers, farm food increases (Horse Collar line),
  Wheelbarrow/Hand Cart (villager speed + carry), Loom (villager toughness).
- **University**: Ballistics (projectile leading), Masonry/Architecture (building HP),
  Murder Holes (no tower/castle min range), Chemistry (+1 projectile dmg), Siege Engineers.
- **Monastery**: healing/conversion improvements. **Castle**: two unique techs per civ.
- Unit line upgrades are researched at their production building (like AoE2).

## Civilizations (v1)
- **Scots** (Celts-flavored): infantry speed bonus, cheap siege; unique unit: Highland Raider
  (fast infantry); lumberjacks work faster.
- **English** (Britons-flavored): archery range units cheaper/longer range; unique unit:
  Longbowman; shepherds work faster.
Full per-civ numbers live in `packages/data` (source of truth), designed relative to AoE2 as
reference, then balanced by playtesting loops.

## Map & Vision
- Isometric tile map (default 120×120 practice; scenario maps authored per scenario).
  Terrain: grass, dirt, forest (tree objects), water (impassable v1), roads/farmland visuals.
- **Fog of war** per player: unexplored (black), explored (dimmed, buildings remembered),
  visible. LOS per unit/building. No elevation combat modifiers in v1 (roadmap).

## Mobile UX
- **Camera**: **two-finger drag always pans**, regardless of what is under the fingers — in a
  late-game 100-pop battle the viewport may contain zero empty terrain, and panning must never
  depend on finding some. One-finger drag on empty terrain also pans. Pinch to zoom (3 fixed
  zoom steps, crisp pixel scaling). On desktop, moving the pointer to any viewport edge scrolls
  continuously in that direction.
- **Selection**: tap a unit/building = select, applied **instantly on the first tap** (no
  double-tap wait penalizing the most common action); a second tap on the same unit within the
  double-tap window *expands* the selection to all of that type on screen. Band-select =
  **long-press on ground, then drag** the box — it never depends on precisely hitting a tiny
  sprite (long-press without dragging opens the alternate command menu instead, see below).
  **Deselect** = tap the 44 px ✕ on the current-selection panel or **two-finger tap**
  anywhere. Empty-ground taps keep a unit selection and issue movement instead.
  Tapping an enemy with nothing selected inspects it (stats panel), never issues a command.
- **Commands**: with units selected, tapping empty ground moves them there. Tapping a target
  remains a context command (attack / gather / build / garrison) — the "right-click" of AoE2
  becomes "tap with intent inferred". Intent
  inference uses a tap-slop radius with snap priority **enemy unit > resource/Gaia > own
  building > ground**, so fat fingers resolve toward the likeliest target. Every issued
  command shows a brief **undo toast** (~2 s) that reverts the order — the mis-tap safety net.
  A move order also shows a short descending arrow at its exact ground destination.
- Long-press (held in place, with a selection) = attack-move / alternate command menu;
  long-press-then-drag on ground = band-select (above).
- **Rally points**: with a production building selected, tap the **Rally** flag button first,
  then tap ground/resource/enemy to set its destination (see Buildings for behavior).
- HUD: top resource + pop bar with a top-right **elapsed match clock** (simulation time, so it
  freezes while paused), plus an **idle-villager button** (badge shows the idle
  count; tapping cycles through idle villagers, centering the camera with the command card
  ready — the touch answer to AoE2's `.` hotkey) and an **idle-military** equivalent;
  bottom-left minimap (tap to jump; shows alerts and idle-military markers); bottom command
  card (train/build/research grid with progress + queue). Selecting any owned building,
  including passive Houses and wall pieces, shows its details and destroy control. A selected
  villager shows the type and amount of resources currently carried. Desktop right-click on the
  minimap sends selected units to that map position and uses the same destination arrow.
- **Building placement**: placement mode immediately spawns a draggable ghost with green/red
  footprint preview. Touch keeps explicit **confirm/cancel buttons** — a mis-dropped Castle is
  far too expensive for one-tap placement — while desktop follows the pointer and commits on the
  next valid left click. Committing over friendly or Gaia units never teleports them: the
  foundation stays non-solid and at 0% while its occupants walk outside the footprint, then
  becomes solid and its builders begin work.
- **Control groups** via saved-selection chips (mobile answer to ctrl+1): with units selected,
  **long-press an empty chip to save** the group; long-press an occupied chip to overwrite it;
  tap a chip to reselect (tap again to center the camera on the group).
- **Production speed** in Settings offers **1× / 2× / 4×** (default **2×**) and applies
  globally to construction, troop training, research, age advancement, and upgrades. It never
  changes movement, gathering, repair, or combat timing. In-match changes enter the deterministic
  command log so suspend/resume and replay remain exact.
- Desktop testing: mouse + right-click + keyboard camera also supported (dev convenience).

## Audio
Procedural/synthesized SFX v1 (villager chop, mining picks, swordplay, arrows, building
placement, horn stings for age-up and attack warnings, UI clicks). Ambient loop. Music: roadmap.

**Campaign narration.** Campaign dialogue banners are also read aloud, so chapters play as
spoken story rather than silent text. There is no recorded voice-over: the lines go to the
device's own speech synthesizer, steered into a slow, low, deliberate delivery. The `Narrator`
and `Chronicle` lines get the deepest, slowest read, and every other speaker keeps a pitch
derived from its name, so Wallace and Cressingham stay apart by ear across chapters. The banner
holds until the voice finishes (capped at 20s) so a line is never cut off mid-sentence, and a
tap dismisses text and voice together. Narration stops with the match: pausing, backgrounding
the app, or reaching the end screen silences it, and the closing lines are not read over the
victory or defeat fanfare. **Narration** volume and a **Campaign narration** switch sit with
the other audio settings; off sends nothing to the synthesizer at all.
Devices without speech synthesis simply read nothing and play exactly as before. Recorded
voice-over remains on the roadmap and can replace the synthesizer behind the same seam.

## Victory / Defeat
- Practice: conquest. A player is defeated the moment they have **no Town Center, no
  villagers, and no production buildings** — deliberately including a player whose army is
  still standing. This is the intended stalemate-breaker: an economy that can never rebuild
  has already lost. On defeat, the player's remaining units and buildings are destroyed
  (death/collapse animations, then removed) — they do not convert to Gaia and do not keep
  fighting. Bots resign when hopeless; a human can resign at any time, with the same cleanup.
  Optional Wonder victory (build + stand timer).
- Campaign: per-scenario objectives via the trigger system.

## Out of scope for v1 (explicit roadmap)
Naval/water gameplay, elevation bonuses, formations & stances (per-category default behavior
covers v1 — see Combat), trade carts, relics, regicide, multiplayer (architecture is ready:
deterministic lockstep), named save slots and per-chapter checkpoints (automatic per-campaign
suspend/resume snapshots and pause ARE in v1 — see the top of this document), additional civs
and campaigns, music score.
