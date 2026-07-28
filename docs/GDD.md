# Bannerfall — Game Design Document

An original mobile RTS that recreates the *feel and depth of Age of Empires II*: economy →
ages → armies → castles, with counter-based combat and story campaigns. All art, names, text,
and code are original. Mechanics are faithful to the AoE2 experience.

Target session length: ~20 minutes (fast rush win) to ~2 hours (evenly matched imperial slugfest).
Platforms: iOS + Android (Capacitor), plus browser for development/testing.

## Modes
- **Practice**: random-map skirmish vs 1–3 bot opponents. Difficulties: Easy / Standard / Hard.
  Victory by conquest (destroy enemies or force resign).
- **Campaign**: scripted scenarios with objectives, briefings, and triggers.
  First campaign: **William Wallace — The Rising of Scotland** (6 scenarios; doubles as the
  tutorial arc, teaching economy → military → sieges progressively).

## Resources & Economy (AoE2-faithful)
- Four stockpiled resources: **Food, Wood, Gold, Stone**.
- **Villagers** gather and construct. Gathering requires drop-off buildings
  (Town Center for all; Mill = food, Lumber Camp = wood, Mining Camp = gold/stone).
- Food sources: berry bushes (forage), sheep/deer (herd/hunt), **farms** (renewable, built on
  a 2×2 plot near a Mill/TC, hold a finite amount of food, re-seedable).
- Trees are map objects; chopping a tree eventually depletes it and clears the tile.
- Gold/stone mines are finite deposits. Depletion drives map control and aggression.
- Villagers carry a small amount (≈10) and walk to drop-off: **placement of camps matters**.
- Market (Castle Age): buy/sell resources at moving prices (no trade carts in v1).

## Population
- Pop cap default 100 in practice (configurable up to 200). Houses +5 pop, Town Center +5,
  Castle +20. House cost is cheap wood; getting "housed" stalls production — classic tension.

## Ages
Dark → **Feudal** → **Castle** → **Imperial**. Advancing is researched at the Town Center,
costs escalating food/gold, and requires **two buildings of your current age** (AoE2 rule).
Each age unlocks buildings, units, and technologies. Age-up times are substantial (~2 min)
so timing decisions matter.

## Buildings (v1 roster)
Town Center (trains villagers, researches ages, garrisons+arrows), House, Mill, Lumber Camp,
Mining Camp, Farm, Barracks, Archery Range, Stable, Siege Workshop, Blacksmith, Market,
Monastery, University, Watch Tower (→ upgrades), Stone Wall, Gate, Castle (trains unique unit,
trebuchets; strong arrows), Wonder (build + stand timer = victory in practice, optional).
No naval/docks in v1 (roadmap).

## Units (v1 roster) — line upgrades like AoE2
- **Villager** (all-purpose worker, can fight badly)
- Barracks: **Militia → Man-at-Arms → Longswordsman → Champion** (infantry line),
  **Spearman → Pikeman** (anti-cavalry)
- Archery Range: **Archer → Crossbowman → Arbalester**, **Skirmisher → Elite Skirmisher**
  (anti-archer, min range)
- Stable: **Scout → Light Cavalry** (fast, cheap, raids), **Knight → Cavalier → Paladin**
- Siege Workshop: **Battering Ram** (anti-building, pierce-immune-ish, garrisonable),
  **Mangonel** (area damage, friendly fire), **Trebuchet** (Castle-built, Imperial; pack/unpack)
- Monastery: **Monk** (heals; converts enemy units — with cooldown and resist rules)
- Castle: civ **unique unit**
- Gaia: sheep (capturable), deer, wolves (hostile)

## Combat (the AoE2 counter system — the heart of the game)
- Damage = max(1, attack − armor), computed per **armor class**: every unit has melee armor,
  pierce armor, and class memberships (infantry / archer / cavalry / siege / spearman / building
  / ram / monk / unique). Attacks carry base melee-or-pierce damage plus **bonus damage vs
  classes** (spearmen +vs cavalry, skirmishers +vs archers, mangonels +vs buildings, etc.).
- Ranged units fire real projectiles with travel time and accuracy; moving targets can be missed.
  Mangonel shots deal area damage including to friendlies.
- Rate of fire, min range (skirms/mangonels), and unit speed create micro (dodging, kiting).
- Buildings with attacks: TC/towers/castle fire arrows, more when garrisoned (villagers/archers).
- Garrison: units can garrison in TC/towers/castle/rams; garrisoned units are safe and heal.
- Conversion: monks convert single enemy units over a few seconds at range; interrupted by
  damage to line of sight loss.
- No formations UI in v1; group moves keep loose spacing. Stances: none in v1 (units auto-engage
  within LOS; attack-move exists).

## Technologies
- **Blacksmith**: 3 tiers each of infantry/cavalry attack, archer attack, infantry/cavalry armor,
  archer armor (age-gated as in AoE2).
- **Economy**: lumber/mining efficiency tiers, farm food increases (Horse Collar line),
  Wheelbarrow/Hand Cart (villager speed + carry), Loom (villager toughness).
- **University**: Ballistics (projectile leading), Masonry/Architecture (building HP),
  Murder Holes (no tower min range), Chemistry (+1 projectile dmg), Siege Engineers.
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
- Pan: one-finger drag on empty terrain; pinch to zoom (3 fixed zoom steps, crisp pixel scaling).
- Tap unit/building = select; drag from a unit = band-select box; double-tap unit = select all
  of type on screen. Tap ground/enemy with selection = context command (move / attack / gather /
  build / garrison) — the "right-click" of AoE2 becomes "tap with intent inferred".
- Long-press = attack-move / alternate command menu.
- HUD: top resource + pop bar; bottom-left minimap (tap to jump, shows alerts); bottom command
  card (train/build/research grid with progress + queue); building placement mode with green/red
  footprint preview. Control groups via saved-selection chips (mobile answer to ctrl+1).
- Desktop testing: mouse + right-click + keyboard camera also supported (dev convenience).

## Audio
Procedural/synthesized SFX v1 (villager chop, mining picks, swordplay, arrows, building
placement, horn stings for age-up and attack warnings, UI clicks). Ambient loop. Music: roadmap.

## Victory / Defeat
- Practice: conquest (a player with no Town Center, no villagers, and no production buildings
  is defeated; bots resign when hopeless). Optional Wonder victory.
- Campaign: per-scenario objectives via the trigger system.

## Out of scope for v1 (explicit roadmap)
Naval/water gameplay, elevation bonuses, formations & stances, trade carts, relics,
regicide, multiplayer (architecture is ready: deterministic lockstep), mid-game saves,
additional civs and campaigns, music score.
