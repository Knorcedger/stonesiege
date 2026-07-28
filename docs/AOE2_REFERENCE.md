# AoE2 reference numbers (auditor-compiled, for balance work)

# AoE2 Reference Sheet — Real Numbers for the Bannerfall v1 Roster

Source of truth: the current AoE2:DE game-data export (aoe2techtree.net `data.json`, pulled 2026-07-28, reflects the live balance patch), cross-checked against the Age of Empires wiki, Liquipedia, AoK Heaven, and AoEZone mechanics threads. All times are in-game seconds at 1.0× speed. Speeds are tiles/second. Armor is melee/pierce. RoF = seconds between attacks (lower = faster). TT = train time.

**Patch-vintage caveats** (the live 2025/2026 balance differs from "classic" AoE2 in a few places — pick one era and stay consistent):
- Militia line now costs **50F 20G** (was 60F 20G; the Supplies tech that discounted it was removed).
- Man-at-Arms and above now move **0.96** (militia-line was historically 0.9 throughout).
- Skirmisher TT is now 26s (was 22s). Pikeman upgrade is now 160F 90G (was 215F 90G). Champion upgrade is now 650F 350G / 70s (was 750F 350G / 100s).
- Crossbowman upgrade 175F 100G and Arbalester 450F 350G are the DE values (AoC was cheaper).
- The data export lists TC build time 100s on some TC entities and 150s on others; **150s** is the number AoE2 used for most of its life and the one players know.
- DE scales some building and wall HP up per age; single values below are the as-unlocked baseline.

---

## 1. Villager & Economy

**Villager**: 50F, TT 25s, 25 HP, 3 melee attack (+3 vs buildings, +6 vs stone-defense class i.e. walls/towers), 0/0 armor, speed 0.8, LOS 4.
- **Loom** (50G, 25s, TC, Dark): +15 HP, +1 melee/+2 pierce armor.
- **Wheelbarrow** (175F 50W, 75s, TC, Feudal): +10% speed, +25% carry.
- **Hand Cart** (300F 200W, 55s, TC, Castle): +10% more speed, +50% more carry.
- Speeds: 0.8 → 0.88 (WB) → 0.968 (HC).
- Construction with n villagers: `time = 3 × base_build_time / (n + 2)` (1 vil = 3T/3 = T).

**Gather rates** (steady-state at the resource, excluding walk time) and carry:

| Task | Rate/s | Carry (base → WB → HC) |
|---|---|---|
| Sheep (shepherd) | 0.33 food | 10 → 13 → 19 |
| Berries (forager) | 0.31 food | 10 → 13 → 19 |
| Hunt (deer/boar) | 0.41 food | **35** → 44 → 66 |
| Farm (farmer) | 0.53 worker rate, capped by the farm at 0.40 → real ceiling ≈ 24 food/min | 10 (+1 with Heavy Plow) |
| Wood (lumberjack) | 0.39 | 10 → 13 → 19 |
| Gold (miner) | 0.38 | 10 → 13 → 19 |
| Stone (miner) | 0.36 | 10 → 13 → 19 |

**Resource nodes** (DE standard): sheep 100 food (herdable, capturable by proximity, safe until killed), deer 140 food (hunted where they stand), boar 340 food (fights back — reference only if wanted), berry bush 125 food, tree 100 wood, gold mine tile 800 gold, stone mine tile 350 stone. Killed animals rot away over time if not actively gathered.

**Farms**: 60W each, 3×3 footprint, 480 HP, 15s build. Base food 175 → +75 (Horse Collar) → +125 (Heavy Plow) → +175 (Crop Rotation) = 550 max. Reseeding costs another 60W; DE's Mill auto-reseed queue prepays wood per queued farm.

**Standard starting kit**: 200F, 200W, 100G, 200S; 1 TC, 3 villagers, 1 Scout Cavalry.

---

## 2. Ages

| Advance | Cost | Time | Building requirement |
|---|---|---|---|
| Feudal | 500F | 130s | 2 qualifying Dark buildings (Mill, Lumber Camp, Mining Camp, Barracks; Dock in naval games) |
| Castle | 800F 200G | 160s | 2 Feudal buildings (Archery Range, Stable, Blacksmith, Market) |
| Imperial | 1000F 800G | 190s | a Castle, **or** 2 of Monastery / University / Siege Workshop |

Houses, farms, walls, gates, and towers never count. Researched at the TC (blocks villager production while researching).

---

## 3. Units — full stat blocks (generic civ, no upgrades)

All units below are **1 population**.

### Militia line (Barracks) — 50F 20G, RoF 2.0
| Unit | Age | HP | Atk | Bonus | Armor | Speed | LOS | TT | Upgrade cost/time |
|---|---|---|---|---|---|---|---|---|---|
| Militia | Dark | 40 | 4 melee | — | 0/1 | 0.9 | 4 | 21s | — |
| Man-at-Arms | Feudal | 45 | 6 | +2 std buildings | 0/1 | 0.96 | 4 | 21s | 100F 40G / 40s |
| Long Swordsman | Castle | 60 | 9 | +3 std buildings | 1/1 | 0.96 | 4 | 21s | 150F 65G / 40s |
| Two-Handed Swordsman* | Imperial | 65 | 12 | +4 std buildings | 1/1 | 0.96 | 5 | 21s | 200F 100G / 45s |
| Champion | Imperial | 70 | 14 | +4 std buildings | 1/1 | 0.96 | 5 | 21s | 650F 350G / 70s |

*THS is skipped in Bannerfall's 4-tier line — include its numbers only if the pacing needs an intermediate step. If skipping, the Champion upgrade price should absorb some of THS's 200F 100G.

### Spearman line (Barracks) — 35F 25W, RoF 3.0, speed 1.0, armor 0/0, TT 22s
| Unit | Age | HP | Atk | Key bonuses | Upgrade |
|---|---|---|---|---|---|
| Spearman | Feudal | 45 | 3 melee | +15 vs cavalry, +12 vs camel, +9 vs ship, +1 vs std bldg | — |
| Pikeman | Castle | 55 | 4 | +22 vs cavalry, +18 vs camel, +16 vs ship | 160F 90G / 35s |
| (Halberdier, ref) | Imperial | 60 | 6 | +32 vs cavalry, +28 vs elephants, +26 vs camel | 300F 600G / 50s |

### Archer line (Archery Range) — 25W 45G, RoF 2.0, speed 0.96, armor 0/0
| Unit | Age | HP | Atk (pierce) | Bonus | Range | Accuracy | LOS | TT | Upgrade |
|---|---|---|---|---|---|---|---|---|---|
| Archer | Feudal | 30 | 4 | +3 vs spearmen | 4 | 80% | 6 | 35s | — |
| Crossbowman | Castle | 35 | 5 | +3 vs spearmen | 5 | 85% | 7 | 27s | 175F 100G / 35s |
| Arbalester | Imperial | 40 | 6 | +3 vs spearmen | 5 | 90% | 7 | 27s | 450F 350G / 50s |

### Skirmisher line (Archery Range) — 25F 35W, RoF 3.0, speed 0.96, **min range 1**
| Unit | Age | HP | Atk (pierce) | Bonus | Armor | Range | Acc | TT | Upgrade |
|---|---|---|---|---|---|---|---|---|---|
| Skirmisher | Feudal | 30 | 2 | +3 vs archers, +3 vs spearmen | 0/3 | 4 | 90% | 26s | — |
| Elite Skirmisher | Imperial | 35 | 3 | +4 vs archers, +4 vs spearmen, +2 vs cav archers | 0/4 | 5 | 90% | 22s | 230W 130G / 50s |

### Scout line (Stable) — 80F (no gold), TT 30s, armor 0/2
| Unit | Age | HP | Atk | Bonus | RoF | Speed | Upgrade |
|---|---|---|---|---|---|---|---|
| Scout Cavalry | Dark (starting unit) | 45 | 3 (→5) | +6 vs monks | 2.0 | 1.2 (→1.55) | — |
| Light Cavalry | Castle | 60 | 7 | +10 vs monks | 2.0 | 1.5 | 150F 50G / 45s |
| (Hussar, ref) | Imperial | 75 | 7 | +12 vs monks | 1.9 | 1.5 | 500F 600G / 50s |

Scout quirks worth copying: on hitting Feudal Age the Scout automatically gains +2 attack and speed 1.2→1.55; LOS 4 → 6 in Feudal and +2 per later age. The whole line has strong built-in conversion resistance (see §7).

### Knight line (Stable) — 60F 75G, speed 1.35, TT 30s
| Unit | Age | HP | Atk | Armor | RoF | Upgrade |
|---|---|---|---|---|---|---|
| Knight | Castle | 100 | 10 melee | 2/2 | 1.8 | — |
| Cavalier | Imperial | 120 | 12 | 2/2 | 1.8 | 300F 300G / 80s |
| Paladin | Imperial | 160 | 14 | 2/3 | 1.9 | 1300F 750G / 170s |

### Siege Workshop
**Battering Ram** (Castle): 160W 75G, 175 HP, 2 melee attack (+150 vs buildings, +40 vs siege), armor **−3/180** (arrows tick for 1), range melee, RoF 5.0, speed 0.6, LOS 3, TT 36s. Garrison: 6 infantry; each adds **+0.05 speed and +10 attack vs buildings** (full: speed 0.9, +60 bldg damage). Garrisoned units do not heal and are safe from everything but the ram dying. (Refs: Capped Ram 200 HP/+160 bldg, upgrade 300F/50s; Siege Ram 270 HP/+200 bldg, 1000F/75s.)

**Mangonel** (Castle): 160W 135G, 50 HP, 40 attack — **melee-class damage** (reduced by melee armor) — +35 vs buildings, +12 vs siege; blast width ~1 tile with falloff, hurts friendlies; range 7, **min range 3**; armor 0/6; RoF 6.0; speed 0.6; LOS 9; TT 46s. Projectile is dodgeable — it lands where the target was at fire time (until Siege-Onager-style tracking, which we don't have). (Ref: Onager 60 HP, 50 atk, range 8, upgrade 800F 500G / 75s.)

**Trebuchet** (trained at Castle, Imperial): 200W 200G, 150 HP, 200 **pierce** attack +250 vs buildings (≈450 raw vs buildings), range 16, **min range 4**, accuracy 15% vs units but effectively always hits stationary buildings, RoF 10.0, TT 50s. Pack/unpack ≈ **11s each way**. Packed: speed 0.8, armor 2/8. Unpacked: immobile, armor 1/150. LOS 19 — outranges castles (16 vs 8) but needs vision.

### Monk (Monastery, Castle Age)
100G, TT 51s, 30 HP, 0/0 armor, speed 0.7, LOS 11. **Conversion range 9** (+3 with Block Printing). Heals friendly units at range 4, one target at a time (rate is modest — a badly hurt knight takes on the order of a minute; tune in playtests). Full conversion rules in §7.

### Unique units (our civ references)
**Longbowman** (Britons → our English): 35W 40G, TT 18s, speed 0.96.
- Base: 35 HP, 6 pierce (+2 vs spearmen), range 5, accuracy 70%, armor 0/0.
- Elite: 40 HP, 7 pierce, range 6, accuracy 80%, armor 0/1. Upgrade 850F 850G / 60s.
- Fully upgraded range hits 12 (6 base + 3 Fletching line + 2 civ + 1 Yeomen) — the identity of the unit.

**Woad Raider** (Celts → our Highland Raider): 70F 25G, TT 10s (castle UUs pump out fast).
- Base: 70 HP, 11 melee (+2 std bldg), armor 0/1, speed 1.17 before the civ's infantry-speed bonus (~1.35 with it) — knight-speed infantry.
- Elite: 85 HP, 15 attack (+3 std bldg). Upgrade 1000F 800G / 45s.

---

## 4. Buildings (cost / HP / build time / size / garrison)

| Building | Cost | HP | Build | Size | Garrison | Notes |
|---|---|---|---|---|---|---|
| Town Center | 275W 100S | 2400 | 150s | 4×4 | 15 | armor 3/5; attack §5; extra TCs Castle Age+; starting TC free |
| House | 25W | 550 | 25s | 2×2 | — | +5 pop |
| Mill | 100W | 600 | 35s | 2×2 | — | food drop-off; farm techs + auto-reseed queue |
| Lumber Camp | 100W | 600 | 35s | 2×2 | — | wood drop-off + wood techs |
| Mining Camp | 100W | 600 | 35s | 2×2 | — | gold/stone drop-off + mining techs |
| Farm | 60W | 480 | 15s | 3×3 | — | see §1 |
| Barracks | 175W | 1200 | 50s | 3×3 | 10 | Dark Age |
| Archery Range | 175W | 1500 | 50s | 3×3 | 10 | Feudal; requires Barracks |
| Stable | 175W | 1500 | 50s | 3×3 | 10 | Feudal; requires Barracks |
| Siege Workshop | 200W | 1500 | 40s | 4×4 | 10 | Castle; requires Blacksmith |
| Blacksmith | 150W | 1800 | 40s | 3×3 | — | Feudal |
| Market | 175W | 1800 | 60s | 4×4 | — | Feudal; trading in §8 |
| Monastery | 175W | 2100 | 40s | 3×3 | 10 (monks) | Castle |
| University | 200W | 2100 | 60s | 4×4 | — | Castle |
| Watch Tower | 35W 125S | 850 | 80s | 1×1 | 5 | Feudal; attack §5 |
| Guard Tower | (upgrade 100F 250W / 30s) | 1500 | — | 1×1 | 5 | Castle univ./tower upgrade |
| Keep | (upgrade 500F 350W / 75s) | 2250 | — | 1×1 | 5 | Imperial |
| Stone Wall | 5S/tile | ~1080 Feudal, scaling with age (classic flat 1800) | 10s | 1×1 | — | huge armor (8/10 + big anti-building armor) |
| Fortified Wall | (upgrade 200F 100W / 50s) | 3000 | — | 1×1 | — | Imperial |
| Gate | 30S | 1650 | 70s | 1×4 | — | auto-opens for allies; can lock |
| Castle | 650S | 4800 | 200s | 4×4 | 20 | armor 8/11; attack §5; trains UU + trebs; unique techs |
| Wonder | 1000W 1000G 1000S | 4800 | 3500s (58:20 solo) | 5×5 | — | victory countdown ≈ 1000 in-game s (16:40 at 1×) |

Garrison rule of thumb: TC/towers/Castle take villagers + foot military (capacity above); production buildings hold 10 of their own units; rams take 6 infantry only. In DE several production/eco buildings gain ~+300 HP per age advance — the table shows as-unlocked values.

---

## 5. Defensive attack values & garrison arrows

| Building | Attack | Arrows (empty) | Range | Min range | RoF | LOS | Max arrows |
|---|---|---|---|---|---|---|---|
| Town Center | 5 pierce | 1 | 6 | 0 | 2.0 | 8 | ~11 (base + up to 10 from garrison) |
| Watch Tower | 5 pierce (+2 vs spearmen, +5 vs ships) | 1 | 8 | 1 | 2.0 | 10 | ~5 (5 villagers ⇒ 4 extra) |
| Guard Tower | 7 pierce (+2 vs spearmen) | 1 | 8 | 1 | 2.0 | 10 | ~5 |
| Keep | 8 pierce (+2 vs spearmen) | 1 | 8 | 1 | 2.0 | 10 | ~5 |
| Castle | 11 pierce (+2 vs spearmen) | **5** | 8 | 1 | 2.0 | 11 | 21 (up to +16 from garrison) |

**How extra arrows scale (DE)**: only garrisoned **villagers and foot archers** add arrows — melee units and cavalry add zero. Each qualifying unit contributes its ranged DPS (pierce attack ÷ its RoF; a villager counts as a flat 2.5 DPS), and the building fires one extra arrow per (building attack ÷ building RoF) of contributed DPS, rounded down. Practical shorthand that is 95% correct: **one extra arrow per garrisoned villager/archer**, capped per the table. Extra arrows deal the building's full arrow damage (castle arrows are 11 each). Fletching/Bodkin/Bracer give towers/TC/castle +1 attack +1 range per tier; Murder Holes (University) deletes the min range.

**Garrison healing**: units garrisoned in TCs/towers heal 0.1 HP/s; in Castles 0.2 HP/s. Herbal Medicine ×6 (36 and 72 HP/min). Nothing heals inside rams.

---

## 6. Technologies

### Blacksmith (Feudal building; tiers gated Feudal → Castle → Imperial)
| Line | Tier 1 | Tier 2 | Tier 3 | Effect per tier |
|---|---|---|---|---|
| Melee attack (infantry + cavalry) | Forging 150F / 50s | Iron Casting 220F 120G / 75s | Blast Furnace 275F 225G / 100s | +1 / +1 / **+2** attack |
| Archer attack & range (archers, towers, TC, castle) | Fletching 100F 50G / 30s | Bodkin Arrow 200F 100G / 35s | Bracer 300F 200G / 40s | +1 attack **and +1 range** each |
| Infantry armor | Scale Mail 100F / 40s | Chain Mail 200F 100G / 55s | Plate Mail 300F 150G / 70s | +1/+1, +1/+1, **+1/+2** |
| Cavalry armor | Scale Barding 150F / 45s | Chain Barding 250F 150G / 60s | Plate Barding 350F 200G / 75s | +1/+1, +1/+1, **+1/+2** |
| Archer armor | Padded 100F / 40s | Leather 150F 150G / 55s | Ring 250F 250G / 70s | +1/+1, +1/+1, **+1/+2** |

### Economy (Mill / Lumber Camp / Mining Camp / TC)
| Tech | Cost / time | Age | Effect |
|---|---|---|---|
| Double-Bit Axe | 100F 50W / 25s | Feudal | wood +20% |
| Bow Saw | 150F 100W / 50s | Castle | wood +20% |
| Two-Man Saw | 300W 200F / 100s | Imperial | wood +10% |
| Gold Mining / Gold Shaft Mining | 100F 75W / 30s ; 175F 75W / 75s | Feudal ; Castle | gold +15% each |
| Stone Mining / Stone Shaft Mining | 100F 75W / 30s ; 175F 75W / 75s | Feudal ; Castle | stone +15% each |
| Horse Collar | 75F 75W / 20s | Feudal | farms +75 food |
| Heavy Plow | 125F 125W / 40s | Castle | farms +125 food, farmers +1 carry |
| Crop Rotation | 250F 250W / 70s | Imperial | farms +175 food |
| Loom / Wheelbarrow / Hand Cart | see §1 | Dark / Feudal / Castle | see §1 |
| Town Watch / Town Patrol | 75F / 25s ; 300F 100G / 40s | Feudal ; Imperial | buildings +4 LOS each |

### University (Castle Age building)
| Tech | Cost / time | Age | Effect |
|---|---|---|---|
| Ballistics | 300W 175G / 60s | Castle | projectiles lead moving targets (huge for archers/towers/mangonels) |
| Masonry | 150F 175W / 50s | Castle | buildings +10% HP, +1/+1 armor, +3 anti-building armor |
| Architecture | 300F 200W / 70s | Imperial | same again |
| Murder Holes | 200F 100S / 35s | Castle | removes min range of towers and castles |
| Chemistry | 300F 200G / 100s | Imperial | +1 attack for arrow-firing units/buildings |
| Siege Engineers | 500F 600W / 45s | Imperial | siege +1 range, +20% attack vs buildings |
| Guard Tower / Keep | 100F 250W / 30s ; 500F 350W / 75s | Castle ; Imperial | tower upgrades |
| Fortified Wall | 200F 100W / 50s | Imperial | wall upgrade |
| Arrowslits | 250F 250W / 25s | Imperial | towers +attack (ref; optional for v1) |
| Treadmill Crane | ~300F 200W | Castle | villagers build 20% faster (ref; optional) |

### Monastery (all gold-heavy on purpose — monks are a gold sink)
| Tech | Cost / time | Effect |
|---|---|---|
| Sanctity | 175G / 60s | monks +15 HP |
| Fervor | 140G / 50s | monks +15% speed |
| Devotion | 100F 200G / 40s | own units +1 min/+1 max conversion time (harder to convert) |
| Faith | 550F 750G / 60s (Imperial) | own units +4 min/+4 max conversion time |
| Illumination | 120G / 65s | faith recharges ~2× faster (1.6 → 3.0/s) |
| Block Printing | 200G / 55s | +3 conversion range |
| Redemption | 475G / 50s | can convert buildings & siege (slow) |
| Atonement | 325G / 40s | can convert enemy monks |
| Theocracy | 200G / 75s | group conversion drains only one monk's faith |
| Herbal Medicine | 200G / 35s | garrisoned units heal 6× faster |
| Heresy | 1000G / 60s | your converted units die instead of switching sides |

### Other production-building techs (AoE2 reference — GDD lists only line upgrades, adopt if desired)
Squires 100F/40s (+10% infantry speed) · Arson 75F 25G/25s (infantry +2 vs buildings) · Gambesons 50F 100G/25s (militia-line +1 pierce armor) · Bloodlines 150F 100G/50s (+20 cavalry HP) · Husbandry 150F/40s (+10% cavalry speed) · Thumb Ring 300F 250W/45s (archers fire faster, 100% accuracy).

### Castle techs (generic AoE2, reference)
Hoardings 400F 400W/75s (+21% castle HP) · Sappers 400F 200W/10s (villagers +15 vs buildings) · Conscription 150F 150G/60s (military buildings produce 33% faster).

---

## 7. Conversion & Faith (Monk rules)

- Monk targets a single enemy unit within **range 9** and LOS. Conversion rolls once per ~1s interval with roughly a **25% success chance**, but it can never land before the minimum and always lands by the maximum: default **min 4s, max 10s**.
- **Damage to the monk does NOT interrupt conversion.** It ends only if the monk dies, the target dies/garrisons, or the target breaks range/line of sight (monks will chase).
- On success the monk's **faith (100 points) drops to 0** and regenerates at **1.6/s (~62s to full)**; Illumination raises it to 3.0/s (~33s). A monk with partial faith can still start converting — faith is spent on success, not upfront (Theocracy makes group conversions cheap).
- **Resistance**: Scout-line (and similar raiders) convert at min 8 / max 10 — the designed monk counter along with their anti-monk attack bonus. Siege and buildings (Redemption required) take substantially longer and monks must channel at range. Devotion/Faith add +1/+1 and +4/+4 to min/max for the defender's units.
- Converted units keep the owner's upgrades? No — they adopt the converting player's researched upgrades. Heresy (defender) kills them instead.

---

## 8. Market & prices

- Commodity trading fee: **30%** of the exchange rate (Guilds tech → 15%).
- Each commodity (food/wood/stone) has one **global** exchange rate in gold per 100 units. Start of game: **food 100, wood 100, stone 130**.
- Sell 100 of a resource ⇒ receive `rate × 0.7` gold. Buy 100 ⇒ pay `rate × 1.3` gold. At start: sell 70 / buy 130 (food & wood), sell 91 / buy 169 (stone).
- Every 100 units traded moves that commodity's rate **±2** (selling pushes it down, buying up), shared across ALL players — dumping wood crashes the wood price for everyone.
- Rate clamps: floor 20 (sell 14 / buy 26), ceiling 9999. Gold is always the medium; you never trade food↔wood directly.

---

## 9. Quick reference — speeds & pop

| Unit | Speed | | Unit | Speed |
|---|---|---|---|---|
| Villager | 0.8 (0.88 / 0.968 with WB/HC) | | Knight line | 1.35 |
| Militia | 0.9 | | Scout | 1.2 → 1.55 (Feudal) |
| MAA → Champion | 0.96 | | Light Cavalry | 1.5 |
| Spearman line | 1.0 | | Ram / Mangonel | 0.6 |
| Archer / Skirm | 0.96 | | Trebuchet (packed) | 0.8 |
| Monk | 0.7 | | Woad Raider | 1.17 (~1.35 w/ Celt bonus) |

Population: every unit above = 1 pop. House +5, Town Center +5, Castle +20. AoE2 default cap 200 (Bannerfall v1 default 100 is a deliberate cut).

---

## 10. Civ bonus reference (for tuning Scots/English)

**Celts** (Scots reference): infantry +15% speed (from Feudal); lumberjacks +15%; siege weapons fire **25% faster** (note: faster, not cheaper — Bannerfall's \"cheap siege\" is its own design); herdables in a Celt unit's LOS can't be stolen. Team: siege workshops work 20% faster. UTs: Stronghold 250F 200G (castles/towers fire 25% faster) · Furor Celtica 750F 450G (siege workshop units +40% HP).

**Britons** (English reference): TCs cost −50% wood from Castle Age; foot archers +1 range in Castle, +2 total in Imperial; shepherds +25% (note: longer range yes, cheaper no — \"cheaper\" is Bannerfall's own design). Team: archery ranges work 20% faster. UTs: Yeomen 750W 450G (foot archers +1 range, towers +2 attack) · Warwolf 800W 400G (trebuchets get blast damage and 100% accuracy vs units).

---

### Sources
- [aoe2techtree data export](https://aoe2techtree.net/data/data.json) (unit/building/tech numbers, current DE patch)
- [Fandom: Conversion](https://ageofempires.fandom.com/wiki/Conversion), [Garrison](https://ageofempires.fandom.com/wiki/Garrison), [Castle](https://ageofempires.fandom.com/wiki/Castle_(Age_of_Empires_II)), [Market](https://ageofempires.fandom.com/wiki/Market_(Age_of_Empires_II)), [Villager](https://ageofempires.fandom.com/wiki/Villager_(Age_of_Empires_II)), [Wheelbarrow](https://ageofempires.fandom.com/wiki/Wheelbarrow_(Age_of_Empires_II)), [Herbal Medicine](https://ageofempires.fandom.com/wiki/Herbal_Medicine_(Age_of_Empires_II)), [Battering Ram](https://ageofempires.fandom.com/wiki/Battering_Ram_(Age_of_Empires_II)), [Trebuchet](https://ageofempires.fandom.com/wiki/Trebuchet), [Krepost](https://ageofempires.fandom.com/wiki/Krepost), [Imperial/Feudal Age pages](https://ageofempires.fandom.com/wiki/Feudal_Age_(Age_of_Empires_II)), [Scout Cavalry](https://ageofempires.fandom.com/wiki/Scout_Cavalry_(Age_of_Empires_II)), [Militia](https://ageofempires.fandom.com/wiki/Militia_(Age_of_Empires_II)), [Update 141935](https://ageofempires.fandom.com/wiki/Update_141935)
- [AoK Heaven: Market Exchange Rates](https://aok.heavengames.com/university/strategy/statistics/market-exchange-rates/)
- [AoEZone: Garrisoned Units and Maximizing Arrows](https://aoezone.net/threads/garrisoned-units-and-maximizing-arrows.88639/), [How monks really work v.2](https://aoezone.net/threads/how-monks-really-work-v-2-all-the-details.119879/)
- [Forgotten Empires: Resource Gathering](https://www.forgottenempires.net/strategy/age-of-empires-ii-strategy-center/resource-gathering)
- [Liquipedia: Siege Workshop](https://liquipedia.net/ageofempires/Siege_Workshop), [Market](https://liquipedia.net/ageofempires/Market), [University](https://liquipedia.net/ageofempires/University), [Wonder](https://liquipedia.net/ageofempires/Wonder)
- [Steam guide: Farming Rates in DE](https://steamcommunity.com/sharedfiles/filedetails/?id=1932327114), [AoE2 Database](https://www.aoe2database.com/conversion_mechanics/en)
