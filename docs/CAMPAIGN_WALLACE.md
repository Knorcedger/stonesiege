# Campaign: William Wallace — The Rising of Scotland

StoneSiege's first campaign and the game's tutorial arc. Six scenarios follow the historical
course of the First War of Scottish Independence from the killing of the Sheriff of Lanark
(May 1297) to Wallace's last defiance (1304–05), teaching the full game progressively:
movement → economy → ages → counters → siege → imperial warfare with trebuchets.

All prose here is original. Real history (Lanark, Scone, Stirling Bridge, the Harrying of
the North, Falkirk, the guerrilla years, the betrayal at Robroyston) is the factual spine;
AoE2 is a *mechanics* reference only. Where history handed Wallace a defeat (Falkirk) the
scenario victory condition is survival/escape, and the truthful outcome is told in the
epilogue — we never rewrite the ending, we reframe the objective.

---

## 1. Campaign overview

### Arc & tone
A commoner's war. Scenario 1 opens with one man and a handful of kin in a Lanarkshire glen;
scenario 6 ends with trebuchets breaking an occupier's keep while the noose of betrayal
tightens off-screen. Tone: stirring but unsentimental — the campaign is honest that Wallace
lost Falkirk, was abandoned by the nobility, and was betrayed by a fellow Scot. Victory
epilogues carry the true history forward (Moray's wounds, the Guardianship, Robroyston,
Smithfield, and the torch passing to Bruce and Bannockburn).

Speakers used in `message` effects: **Wallace**, **Moray**, **Douglas**, **Graham** (Sir John
de Graham, Wallace's captain), **Fraser** (Sir Simon Fraser), **Narrator**, and enemy voices
(**Heselrig**, **Cressingham**, **Valence**, **Menteith**).

### Teaching progression
| # | Scenario | Teaches | New systems unlocked |
|---|----------|---------|----------------------|
| 1 | The Sheriff of Lanark | camera/pan, select, move, gather (berries/sheep/wood), build (house, lumber camp), train villagers, first tiny fight | movement, gathering, construction, training |
| 2 | The Justiciar Flees | mill+farms, mining camp+gold, drop-off placement, Feudal age-up (2-building rule), barracks, first real combat, defending a raid, garrisoning the TC | full dark-age economy, ages, military production |
| 3 | Stirling Bridge | army composition, the counter triangle (spears>cavalry, skirms>archers), chokepoint defense, attack-move, minimap alerts, allied AI | counters, defense, timing |
| 4 | Harry the North | full economy from scratch, Castle Age, blacksmith/university techs, Siege Workshop, rams & mangonels vs fortifications, the Market (selling plundered surplus), target discipline | siege warfare, castle-age tech, market |
| 5 | Falkirk | large-scale battle, walls/towers/castle defense, repair, mangonel micro vs massed archers, cavalry sallies from the Stable, monks (heal/convert), sally timing, fighting retreat | large-army control, fortified defense, cavalry, monks |
| 6 | The Unbroken | Imperial Age, trebuchets (pack/unpack), multi-front pressure, two-front play, full sandbox | everything; the graduation exam |

### Difficulty ramp
- **AI profiles**: passive (1) → defender + scripted raid (2) → scripted waves (3) →
  defender + escalating raider (4) → aggressive scripted host (5) → defender + aggressive,
  two enemy players (6).
- **Economy pressure**: scenario 1–2 are generous and unhurried; 3 gives a pre-built camp;
  4 restarts the economy under periodic raids; 5 is resource-rich but time-poor; 6 is
  moderate resources, contested map, escalating sweeps.
- **Pop caps**: 20 → 40 → 60 → 80 → 120 → 150.
- **Max age**: dark → feudal → feudal → castle → castle → imperial.
- **Session length**: ~12 → ~22 → ~28 → ~35 → ~45 → ~60 min (mobile-friendly; every
  scenario front-loads a clear next objective so a session can be resumed mentally).

### Conventions used in this document
- **Players**: `players[]` index+1 = PlayerId; **player 1 is always the human (Scots)**.
  Player 0 = gaia. Teams: same `team` number = allied.
- **Areas** are tile Rects `{x, y, w, h}`; x = column (0 = west edge of the ASCII map),
  y = row (0 = north edge).
- **Def ids** are the canonical ids from `packages/data/src/{units,buildings,civs}.ts`
  (see Appendix A) — the data pack has landed and matches this document. The only ids
  still to add are the hero defs (`heroWallace`, `heroMoray`, `heroHeselrig`, etc.).
- **Hero defs** (`heroWallace`, `heroMoray`, etc.) are ordinary `UnitDef`s with boosted
  stats and unique icons — see Appendix A.
- **Triggers**: conditions within one trigger are AND; OR is expressed with multiple
  triggers converging via `triggerFired`/`armTrigger`. `[armed]` = `armed: true` (default),
  `[unarmed]` = waits for `armTrigger`, `[loop]` = re-arms after firing.
  Three engine contracts (mirrored in `packages/scenarios/src/schema.ts`) that every
  script below relies on:
  1. `armTrigger` on a trigger that has already fired and is not `[loop]` is a **no-op**
     — a fire-once trigger can never fire twice, so two triggers safely converging on the
     same `armTrigger` (e.g. a "ready" check and a deadline both arming one wave) cannot
     double-fire it.
  2. Objective effects are **idempotent per id**: `objectiveAdd` of an existing id is a
     no-op, and objective state latches — the first `objectiveComplete`/`objectiveFail`
     wins; later complete/fail effects on a resolved id (or an id never added) are no-ops.
  3. `timerSeconds` counts from the moment its trigger was **(last) armed** — for
     `[unarmed]` triggers, from the `armTrigger` that armed them; for `[loop]` triggers,
     from each re-arm.
- **ASCII legend suggestion** (used by all map concepts):
  `.` grass · `d` dirt · `r` road · `w` water · `s` shallows · `f` farmland · `n` snow ·
  `T` grass+tree · `N` snow+tree · `G` grass+gold · `S` grass+stone · `B` grass+berries ·
  `D` grass+deer · `H` grass+sheep · `W` grass+wolf.

---

## 2. Scenario 1 — `wallace-1` · "The Sheriff of Lanark"

**May 1297. Lanarkshire.** Teaches camera, selection, movement, gathering, building,
training. ~10–15 minutes.

### Briefing history (player-facing)
> Scotland has no king. Edward of England saw to that: Berwick put to the sword, the army
> broken in a single morning at Dunbar, John Balliol stripped of his crown like a servant
> stripped of livery, and the ancient Stone of Scone carted south to sit beneath an English
> throne. Now English sheriffs hold Scottish towns, and English law hangs Scottish men.
>
> In Lanark, the sheriff is William Heselrig. He keeps his ledgers carefully — grain taken,
> cattle taken, sons taken. One name in those ledgers belongs to William Wallace, a
> landholder's son of no great rank, a big man with a long memory. The tales will later say
> Heselrig murdered the woman Wallace loved. What is certain is this: in May of 1297,
> Wallace came down out of the hills, and the sheriff of Lanark did not live to see June.
>
> But no man burns a garrison on an empty stomach. In a fold of the hills above the Clyde,
> Wallace's kin are waiting — a camp to be fed, sheltered, and armed in secret. See to
> your people first. Then, when the fires are banked and the axes are sharp, we will pay
> the sheriff's ledger in full.

*(~200 words)*

### Objectives
Initial:
1. `obj-move-1` — Walk Wallace to the shepherd's clearing. *(then, chained:)*
2. `obj-move-2` — Walk Wallace to the ford lookout.
3. `obj-food` — Stockpile 150 food (pick berries, herd sheep to camp).
4. `obj-houses` — Build two Houses.
5. `obj-lumber` — Build a Lumber Camp by the western wood and stockpile 200 wood.
6. `obj-vils` — Train villagers at the Town Center until you have 6.

Hidden / late:
7. `obj-muster` — Walk Wallace to the glen mouth to muster the band. *(added at nightfall beat)*
8. `obj-heselrig` — Kill William Heselrig, Sheriff of Lanark. *(added when the band musters)*

### Hints
- Drag on empty ground to pan; pinch to zoom. Tap a unit, then tap the ground to move it.
- Villagers drop food at the Town Center. Build camps close to what you gather.
- Sheep follow whoever finds them first. Bring them home before you eat them.
- Wallace fights better than any villager — but if he falls, the rising dies with him.

### Map concept — 96×96
Rolling green Lanarkshire; the Clyde as an impassable band along the east edge.
- **Player glen (SW-center)**: TC at (20, 64); open grass pocket `{10, 52, 26, 26}` ringed
  by forest (`T`) on the S and W edges (rows y≥80 and cols x≤6 solid forest).
- **Berries**: 6 bushes at `{16, 60, 3, 2}`; 6 more at `{26, 70, 3, 2}`.
- **Sheep**: 4 gaia sheep scattered `{24, 56, 6, 4}`; 2 more near the clearing (34, 52).
- **Deer**: 5 at `{40, 66, 5, 4}` (optional hunting; wolves `W` ×2 at (44, 78) guard them).
- **Shepherd's clearing**: grass gap in light woods at `{30, 52, 6, 6}`.
- **Ford lookout**: knoll by the river bend `{48, 40, 6, 6}`; dirt path (`d`→`r`) runs from
  the glen mouth (36, 58) NE to the lookout, then E to Lanark.
- **Lanark town (NE-center)**: `{58, 28, 16, 18}` — dirt/road streets, 6 English houses, a
  Watch Tower at (66, 34), Barracks at (70, 38), Heselrig's hall (English Town Center) at
  (62, 30). Guard detail: 3 militia + 1 archer — deliberately light; this is the
  first scenario's only fight. Heselrig holds his court of judgement at the gallows
  cross on the south road (65, 43), deliberately OUTSIDE both the Watch Tower's and
  the TC's arrow arcs, so the naive all-in raid fights in the open; chasing survivors
  into the town square is what the arrows punish.
- **Clyde**: water band, cols x 78–95, running full N–S (impassable; no crossing on this map).
- **Small gold** (taste of things to come, not needed): 3 tiles at (44, 60).
- No stone on this map.

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | Wallace's Band | scots | 1 | dark | f100 w100 g0 s0 | human | 20 |
| 2 | Garrison of Lanark | english | 2 | dark | f0 w0 g0 s0 | passive | 20 |

`maxAge: 'dark'`. `startCamera: (20, 64)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (22, 66).
- `heselrig` — `heroHeselrig`, player 2, (65, 43).
- `lanark_tower` — `watchTower`, player 2, (66, 34).
- Player 1 starts with: TC, `wallace`, 3 villagers.

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (22, 66)
    - message (Narrator) "Lanarkshire, May 1297. The English think Scotland is settled."
    - message (Wallace)  "Settled. Aye — the way a boot settles on a neck."
    - objectiveAdd obj-move-1 "Walk Wallace to the shepherd's clearing"

t02-move-1 [armed]
  conditions: entitiesInArea {player:1, defIds:['heroWallace'], area:{30,52,6,6}, atLeast:1}
  effects:
    - objectiveComplete obj-move-1
    - message (Wallace) "The flock's scattered since the soldiers came. Up the path — I want eyes on the ford."
    - objectiveAdd obj-move-2 "Walk Wallace to the ford lookout"
    - revealArea {player:1, area:{46,38,10,10}}
    - panCamera (50, 42)

t03-move-2 [armed]
  conditions: entitiesInArea {player:1, defIds:['heroWallace'], area:{48,40,6,6}, atLeast:1}
  effects:
    - objectiveComplete obj-move-2
    - message (Wallace) "Lanark, beyond the river bend. Heselrig's tower. Not yet — first we feed our own."
    - armTrigger t04-gather

t04-gather [unarmed]
  conditions: always
  effects:
    - panCamera (20, 64)
    - message (Narrator) "Tap a villager, then tap berries or a sheep to gather. Food is dropped off at the Town Center."
    - objectiveAdd obj-food "Stockpile 150 food"

// The eco chain (t05..t08) is strictly gated on its predecessor having fired: each
// objective is added by the previous trigger, and objectiveComplete on a never-added
// id is a latched no-op — an ungated trigger firing early would permanently strand
// its objective. Out-of-order play (e.g. training villagers before the lumber camp)
// just makes the whole chain cascade once it unlocks.
t05-food [armed]
  conditions:
    - triggerFired t04-gather
    - resourcesAtLeast {player:1, type:'food', amount:150}
  effects:
    - objectiveComplete obj-food
    - message (Wallace) "Full bellies. Now roofs — kin are coming in from the hills."
    - objectiveAdd obj-houses "Build two Houses"

t06-houses [armed]
  conditions:
    - triggerFired t05-food
    - ownedAtLeast {player:1, defIds:['house'], atLeast:2}
  effects:
    - objectiveComplete obj-houses
    - message (Narrator) "Houses raise your population room. Build a Lumber Camp beside the western wood so the walk is short."
    - objectiveAdd obj-lumber "Build a Lumber Camp near trees and stockpile 200 wood"

t07-wood [armed]
  conditions:
    - triggerFired t06-houses
    - ownedAtLeast {player:1, defIds:['lumberCamp'], atLeast:1}
    - resourcesAtLeast {player:1, type:'wood', amount:200}
  effects:
    - objectiveComplete obj-lumber
    - message (Wallace) "Good timber. Spear hafts, roof beams — and more hands to swing the axes."
    - objectiveAdd obj-vils "Train villagers until you have 6"

t08-vils [armed]
  conditions:
    - triggerFired t07-wood       // nightfall may not pre-empt the eco arc
    - ownedAtLeast {player:1, defIds:['villager'], atLeast:6}
  effects:
    - objectiveComplete obj-vils
    - message (Narrator) "Night falls over the glen. Word comes: Heselrig sits in judgement at Lanark tomorrow."
    - spawn [7× militia, player 1, at {36,58} glen mouth]
    - playSting horn
    - message (Wallace) "Kin from the hills, mustering at the glen mouth — and I will not send them against Lanark without me. We march together or not at all."
    - objectiveAdd obj-muster "Walk Wallace to the glen mouth to muster the band"
    - panCamera (36, 58)

// The muster is GATED on Wallace physically standing with the kinsmen. Wallace
// (speed 0.96) outpaces militia (0.9), and after the scripted walks he can sit at
// the ford lookout, ~15 tiles closer to Lanark than the glen mouth: revealing
// Lanark while the band is split invites a select-all attack-move where Wallace
// arrives alone, tanks the whole court detail, and — since his death is instant
// defeat — can lose the tutorial to its own recommended action. "Arriving ragged"
// only wins the open fight if the band DEPARTS together, so the reveal, the kill
// objective, and the pan to Lanark all wait for the gather.
t09-muster [armed]
  conditions:
    - triggerFired t08-vils
    - entitiesInArea {player:1, defIds:['heroWallace'], area:{34,56,6,6}, atLeast:1}
  effects:
    - objectiveComplete obj-muster
    - message (Wallace) "Kinsmen with steel. Lanark, then. The sheriff owes this shire a debt, and I mean to collect."
    - objectiveAdd obj-heselrig "Kill William Heselrig, Sheriff of Lanark"
    - revealArea {player:1, area:{58,28,16,18}}
    - panCamera (65, 43)

t10-alarm [armed]
  conditions:
    - triggerFired t09-muster
    - entitiesInArea {player:1, area:{54,26,22,22}, atLeast:1}
  effects:
    - message (Heselrig) "Brigands at the gate? Cut them down and hang what's left."
    - message (Wallace) "The sheriff, not the garrison! He holds his court on the south road — strike Heselrig down and away, before the tower archers find their marks."
    - aiProfile {player:2, profile:'defender'}
    - playSting alert

t11-victory [armed]
  conditions:
    - triggerFired t09-muster            // the tutorial arc (economy → muster) must run first;
                                         // refDestroyed latches, so an early kill still counts
    - refDestroyed 'heselrig'
  effects:
    - objectiveComplete obj-heselrig
    - playSting victory
    - message (Narrator) "The sheriff of Lanark is dead, and the news runs faster than any horse: a commoner struck the blow, and the sky did not fall."
    - message (Narrator) "Across Scotland, men look at their own garrisons and begin to count spears."
    - victory

t12-defeat [armed]
  conditions: refDestroyed 'wallace'
  effects:
    - playSting defeat
    - defeat "Wallace has fallen. The rising of Scotland dies in a Lanarkshire glen."
```

**Expected duration**: 10–15 min.
**Failure conditions**: Wallace dies (t12). The economy cannot be soft-locked: berries,
sheep, deer, and forest greatly exceed the required totals, and the English never attack
the glen.

---

## 3. Scenario 2 — `wallace-2` · "The Justiciar Flees"

**Summer 1297. Scone.** Teaches the full dark-age economy, the Feudal age-up, military
production, and defending a raid. ~20–25 minutes.

### Briefing history (player-facing)
> The blow at Lanark rang like a bell, and Scotland answered. Out of Ettrick and the
> western hills men came in twos and tens, and among the first great names to ride in was
> Sir William Douglas — "the Hardy," they call him, and not for his patience.
>
> Edward's grip on Scotland runs through clerks as much as castles. At Scone, the ancient
> crowning-place of Scottish kings, sits William de Ormesby, justiciar of Scotland —
> Edward's chief lawman, growing rich on fines levied against every Scot who will not
> swear the oath to the English king. There is a bitter joke in it: the seat where kings
> were made, occupied by the man who unmakes free men by the stroke of a pen.
>
> Wallace and Douglas mean to end the joke. But a raid is not a rising. To carry this war
> past one summer, we must learn to feed it: farms behind the mill, ore out of the hills,
> and a barracks turning ploughmen into soldiers. Build the camp on the Tay as if we mean
> to stay — because we do. Then cross the ford and show the justiciar what his fines
> have purchased.

*(~200 words)*

### Objectives
Initial:
1. `obj-camp` — Build a Mill near the berries and four Farms around it.
2. `obj-gold` — Build a Mining Camp at the gold outcrop and stockpile 200 gold.
3. `obj-feudal` — Advance to the Feudal Age (requires two Dark Age buildings).

Hidden / late:
4. `obj-army` — Muster a warband: 6 Militia and 4 Spearmen. *(added after Feudal)*
5. `obj-ormesby` — Destroy Ormesby's hall at Scone. *(added after obj-army)*
6. `obj-hold` — Drive off the English raid on your camp. *(added when the raid spawns)*

### Hints
- Farms never run dry the way berries do — reseed them and your food is safe forever.
- The age-up needs two buildings of your current age. A Mill and a Barracks both count.
- Spearmen are cheap and cruel to horsemen. Keep a few home — the English know where you sleep.
- Villagers can garrison in the Town Center; it shoots harder with them inside.

### Map concept — 112×112
Perthshire in high summer; the Tay bends around Scone.
- **River Tay**: water band entering at the N edge around x 40–52 and curving E to exit at
  the E edge (an L-shaped band framing the NE corner). At the ford's columns (x 56–58)
  the east arm spans **exactly rows y 33–42**.
- **Ford**: shallows strip `{56, 33, 3, 10}` — spanning all ten water rows of the east
  arm at x 56–58 — the only way into Scone from the south.
- **Scone rise (NE corner, beyond the river)**: `{62, 8, 30, 24}` on dirt/road. English
  compound: Ormesby's hall (English TC, ref `ormesby_hall`) at (74, 14), Watch Tower at
  (62, 28) on the rise's SW shoulder — within tower range of the ford exit at (57, 32) —
  Barracks (80, 20), 6 houses, garrison of 6 militia,
  4 archers, 2 scouts. A road runs ford → compound gate.
- **Player start (SW-center)**: TC at (30, 74); open meadow `{18, 62, 30, 26}`.
- **Berries**: 8 bushes `{24, 68, 4, 2}` just W of a natural mill spot.
- **Sheep** 6 near (36, 70); **deer** 6 at `{48, 84, 6, 4}`.
- **Gold**: 5-tile outcrop at `{42, 62, 3, 2}` (NE of camp, toward the ford — placement
  lesson: camp goes to the gold). Second small gold (4 tiles) at (20, 90).
- **Stone**: 4-tile outcrop at (16, 78) (optional tower stone).
- **Forest**: heavy belt along the full S edge (y ≥ 98) and W edge (x ≤ 8); a light copse
  `{50, 50, 8, 6}` mid-map screens the ford approach.
- **Raid path**: the English raid enters via the ford and follows the road SW — players who
  scouted will see it coming on the minimap.

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | The Rising | scots | 1 | dark | f200 w150 g50 s0 | human | 40 |
| 2 | Justiciar's Garrison | english | 2 | feudal | f600 w400 g300 s100 | defender | 40 |

`maxAge: 'feudal'`. `startCamera: (30, 74)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (32, 76).
- `ormesby_hall` — `townCenter`, player 2, (74, 14).
- `ford_tower` — `watchTower`, player 2, (62, 28).
- Player 1 starts with: TC, `wallace`, 5 villagers, 2 militia (survivors of Lanark).

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (30, 74)
    - message (Narrator) "Scone, summer 1297. The crowning-place of kings — now the counting-house of the justiciar."
    - message (Douglas) "Wallace! Douglas rides with you. But my men eat like horses — build us a camp worth the name."
    - objectiveAdd obj-camp "Build a Mill near the berries and 4 Farms"
    - objectiveAdd obj-gold "Build a Mining Camp at the gold and stockpile 200 gold"
    - objectiveAdd obj-feudal "Advance to the Feudal Age"

t02-camp [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['mill'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['farm'], atLeast:4}
  effects:
    - objectiveComplete obj-camp
    - message (Narrator) "Farms are slower than berries but never run out. Reseed them when they exhaust."

t03-gold [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['miningCamp'], atLeast:1}
    - resourcesAtLeast {player:1, type:'gold', amount:200}
  effects:
    - objectiveComplete obj-gold
    - message (Douglas) "Gold buys steel. Steel buys back Scotland. Simple arithmetic."

t04-feudal [armed]
  conditions: ageReached {player:1, age:'feudal'}
  effects:
    - objectiveComplete obj-feudal
    - playSting horn
    - message (Narrator) "The Feudal Age. New soldiers, new tools — and new attention from the enemy."
    - objectiveAdd obj-army "Muster 6 Militia and 4 Spearmen"
    - armTrigger t05-raid-timer

t05-raid-timer [unarmed]
  conditions: timerSeconds 120
  effects:
    - spawn [4× militia, 2× archer, 2× scout, player 2, at ford exit {57,42}]
    - aiAttackNow {player:2, targetArea:{18,62,30,26}}
    - playSting alert
    - message (Wallace) "Riders at the ford! To arms — and get the folk inside the Town Center!"
    - objectiveAdd obj-hold "Drive off the English raid"
    - armTrigger t06-raid-broken

t06-raid-broken [unarmed]            // armed by t05 the moment the raid spawns
  conditions:
    - timerSeconds 30                // grace: the spawn resolves before the check begins
    - entitiesInArea {player:2, area:{10,40,54,56}, atMost:0}
      // camp meadow + the whole approach from the ford (includes the spawn point) is
      // clear of English — the raid is genuinely dead or driven off, not timed out.
      // Player 2's defender AI never otherwise enters this quadrant.
  effects:
    - objectiveComplete obj-hold
    - message (Douglas) "They'll carry the tale back to Ormesby. Good. Let him lose sleep for once."

t07-army [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['militia','manAtArms'], atLeast:6}
    - ownedAtLeast {player:1, defIds:['spearman'], atLeast:4}
  effects:
    - objectiveComplete obj-army
    - message (Wallace) "Across the ford, straight up the road. Burn the hall and the ledgers in it."
    - objectiveAdd obj-ormesby "Destroy Ormesby's hall at Scone"
    - revealArea {player:1, area:{62,8,30,24}}
    - panCamera (74, 14)

t08-ford-warning [armed]
  conditions:
    - triggerFired t07-army
    - entitiesInArea {player:1, area:{56,33,3,10}, atLeast:1}
  effects:
    - message (Narrator) "The tower covers the ford. Take it down first, or pay the toll in blood."

t09-reinforce [armed]
  conditions: triggerFired t07-army
  // fires immediately after the assault objective — Douglas's men join
  effects:
    - spawn [4× militia, 2× spearman, player 1, at {34,70}]
    - message (Douglas) "My household men. Try not to get them killed faster than I would."

t10-victory [armed]
  conditions: refDestroyed 'ormesby_hall'
  effects:
    - objectiveComplete obj-ormesby
    - playSting victory
    - message (Narrator) "Ormesby did not stay for the end. He fled south with what he could carry, and the justice of Edward fled with him."
    - message (Narrator) "In the north, another fire is rising — a young knight named Andrew Moray has raised the country beyond the Mounth. Two risings, looking for each other."
    - victory

t11-defeat-wallace [armed]
  conditions: refDestroyed 'wallace'
  effects: [ playSting defeat, defeat "Wallace has fallen at Scone." ]

t12-defeat-camp [armed]
  conditions: ownedAtMost {player:1, defIds:['townCenter','villager'], atMost:0}
  effects: [ playSting defeat, defeat "The camp on the Tay is lost — the rising starves." ]
```

**Expected duration**: 20–25 min.
**Failure conditions**: Wallace dies; or the player loses every Town Center *and* villager.
The scripted raid is sized to be beatable with the starting militia + TC garrison even if
the player built no army yet.

---

## 4. Scenario 3 — `wallace-3` · "Stirling Bridge"

**11 September 1297.** Teaches counters, chokepoint defense, attack-move, and reading the
minimap. The set-piece battle scenario. ~25–30 minutes.

### Briefing history (player-facing)
> Two risings have become one army. Andrew Moray, who cleared the English out of the north
> with a broken castle wall for a schoolroom, has joined his men to Wallace's, and together
> they hold the low hills above the River Forth at Stirling — the buckle that fastens the
> north of Scotland to the south.
>
> Below them, the English host of John de Warenne, Earl of Surrey, spreads its banners.
> With him rides Hugh de Cressingham, Edward's treasurer in Scotland, a man so hated that
> Scots pay their fines twice — once in silver, once in curses. Cressingham has already
> saved his king money by sending part of the army home. He believes a rabble of commoners
> will scatter at the first charge of proper knights.
>
> Between the two armies lies one wooden bridge, wide enough for two horsemen abreast, and
> a soft causeway through the meadows beyond. Every man who crosses it puts a river at his
> back. Warenne is slow; Cressingham is greedy for a quick, cheap victory. Let them come.
> Hold your line at the camp, watch the far bank — and when enough of them stand on our
> side of the water, close the trap.

*(~210 words)*

### Objectives
Initial:
1. `obj-prepare` — Ready your warband: field at least 10 Spearmen and 8 Skirmishers before
   the English cross. *(prep phase)*
2. `obj-hold-camp` — Your camp must stand.

Hidden / late:
3. `obj-trap` — Wait for Moray's signal — let the vanguard cross, then destroy every
   English soldier north of the Forth. *(added when the crossing begins)*
4. `obj-cressingham` — Kill Hugh de Cressingham. *(added when he crosses)*
5. `obj-ford` — Repel the flanking force at the western ford. *(added at wave D)*

### Hints
- Spearmen bring down horses; Skirmishers cut down archers; your own archers punish
  infantry. Mixed lines live longer than pure ones.
- The bridge is two tiles wide. Numbers mean nothing on it.
- Watch the minimap. A river has more than one crossing if you march far enough west.
- Long-press for attack-move: your soldiers advance and fight whatever they meet.

### Map concept — 120×120
The carse of Stirling. North (top) = Scots; south = English.
- **River Forth**: horizontal water band rows y 56–68, full width, with a lazy meander
  (band midline dips to y 72 between x 20–36 and rises to y 52 between x 80–96).
- **The bridge**: wooden bridge = road tiles, 2 wide, at x 58–59 spanning y 56–68.
- **The causeway**: road from the bridge's north end (58, 55) running N through soft
  meadow (farmland tiles as boggy carse, `{50, 40, 20, 16}` flanking the road — reads as
  marsh) to the player camp.
- **Western ford**: shallows strip `{8, 56, 4, 13}` — spanning the band's full thirteen
  water rows (y 56–68 at x 8–11; the meander dip lies east of it) — hidden threat lane.
- **Player camp (N-center)**: `{44, 20, 28, 20}` — TC (52, 26), Barracks (48, 32),
  Archery Range (60, 32), 8 farms, houses; low stone outcrop 4 tiles (46, 18); gold
  outcrop 5 tiles (66, 22); forest belt across the N edge (y ≤ 8).
- **Abbey Craig (NE)**: steep wooded knoll `{76, 24, 16, 14}` (dirt + dense trees with a
  grass crown); Moray's ally camp on the crown: Watch Tower (82, 28), 6 spearmen,
  4 archers, `moray` at (83, 30).
- **South bank**: English muster field `{40, 84, 44, 28}`: tents (houses), Warenne's
  banner group (`warenne` + 8 decorative knights/archers around (60, 96)) that never
  crosses — **player 4**, a separate scripted set-dressing player, so the victory count
  of player 2's fighting host is not polluted — road S from bridge to camp. Stirling Castle painted as distant set dressing in
  the far SW corner `{6, 100, 14, 12}` (English walls + castle, out of play, no AI use).
- **Berries/sheep**: none — economy is pre-built; food comes from the 8 farms.

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | Army of Scotland | scots | 1 | feudal | f500 w400 g250 s50 | human | 60 |
| 2 | Warenne's Host | english | 2 | feudal | f2000 w1000 g800 s200 | passive *(scripted waves)* | 100 |
| 3 | Moray's Men | scots | 1 | feudal | f300 w200 g100 s0 | defender | 20 |
| 4 | Warenne's Banner Guard | english | 2 | feudal | — | passive | 10 |

`maxAge: 'feudal'`. `startCamera: (52, 26)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (54, 28).
- `moray` — `heroMoray`, player 3, (83, 30).
- `cressingham` — `heroCressingham`, player 2 (spawned with wave C).
- `warenne` — `heroWarenne`, player 4 (banner guard), (60, 96), hp override 2000 (he must
  not die to a stray raid; he never crosses).
- Player 1 starts with: camp buildings, 10 villagers on farms/wood, 6 spearmen,
  4 skirmishers, 4 archers, `wallace`.

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (58, 62)            // the bridge
    - message (Narrator) "Stirling Bridge, 11 September 1297. One bridge, two armies, and a river that takes no prisoners."
    - message (Moray) "Wallace — my men hold Abbey Craig on your right. Warenne is slow to wake. We have an hour, maybe two."
    - panCamera (52, 26)
    - objectiveAdd obj-prepare "Field 10 Spearmen and 8 Skirmishers"
    - objectiveAdd obj-hold-camp "Your camp must stand"

t02-prepared [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['spearman','pikeman'], atLeast:10}
    - ownedAtLeast {player:1, defIds:['skirmisher'], atLeast:8}
  effects:
    - objectiveComplete obj-prepare
    - message (Wallace) "Spears for their horses, javelins for their bowmen. Now we let the river do the counting."
    - armTrigger t04-wave-a

t03-prep-deadline [armed]
  conditions: timerSeconds 480      // crossing begins at 8 min even if unready
  effects:
    - armTrigger t04-wave-a

t04-wave-a [unarmed]                 // fires on first of t02/t03; fire-once default
  conditions: always
  effects:
    - playSting horn
    - panCamera (58, 70)
    - message (Cressingham) "Enough delay! Cross, in the king's name — wages are owed for VICTORIES, not for standing about."
    - spawn [8× manAtArms, 4× archer, player 2, south of bridge {54,72,8,6}]
    - aiAttackNow {player:2, targetArea:{54,44,10,8}}   // north bridgehead
    - message (Moray) "Steady. Let them cross. A blade in the water drowns same as a coward."
    - objectiveAdd obj-trap "On Moray's signal, destroy every English soldier north of the Forth"
    - armTrigger t05a-signal-north
    - armTrigger t06-wave-b

// Moray's signal must always precede the bridgehead fight. Two converging watchers arm
// the fire-once payload (t05-signal): t05a fires when 8 of wave A's 12 stand on the
// north bank (a live crossing peaks around 11 — a threshold of 12 could never be met
// and the trap was sprung before it was announced); t05b, armed with wave B, is the
// guarantee — the FIRST Englishman north after the knights ride triggers the signal
// even if the player bled wave A at the bridge itself.
t05a-signal-north [unarmed]          // armed by t04-wave-a
  conditions: entitiesInArea {player:2, area:{0,0,120,56}, atLeast:8}    // north bank
  effects:
    - armTrigger t05-signal

t05b-signal-crossed [unarmed]        // armed by t06-wave-b
  conditions: entitiesInArea {player:2, area:{0,0,120,56}, atLeast:1}    // any English north
  effects:
    - armTrigger t05-signal

t05-signal [unarmed]                 // converging arms from t05a/t05b; fire-once
  conditions: always
  effects:
    - playSting horn
    - message (Moray) "NOW, Wallace! Take the bridgehead — not one of them recrosses that bridge!"
    - aiAttackNow {player:3, targetArea:{54,44,10,8}}   // Moray charges off Abbey Craig

t06-wave-b [unarmed]
  conditions: timerSeconds 210
  effects:
    - spawn [6× knight, 4× scout, player 2, {54,72,8,6}]
    - aiAttackNow {player:2, targetArea:{44,20,28,20}}  // push at the camp
    - message (Narrator) "Knights on the causeway. Horses die on spearpoints — form your line."
    - armTrigger t05b-signal-crossed
    - armTrigger t07-wave-c

t07-wave-c [unarmed]
  conditions: timerSeconds 240
  effects:
    - spawn [8× longbowman, 6× manAtArms, player 2, {54,72,8,6}]
    - spawn [heroCressingham ref 'cressingham', player 2, at (58,70)]
    - aiAttackNow {player:2, targetArea:{44,20,28,20}}
    - playSting alert
    - message (Cressingham) "I shall recover the cost of this war from their hides personally."
    - objectiveAdd obj-cressingham "Kill Hugh de Cressingham"
    - armTrigger t08-wave-d

t08-wave-d [unarmed]
  conditions: timerSeconds 300
  effects:
    - spawn [4× knight refs 'flank1'..'flank4', 4× scout refs 'flank5'..'flank8',
             player 2, at western ford south side {8,70,4,4}]
    - aiAttackNow {player:2, targetArea:{44,20,28,20}}
    - playSting alert
    - message (Moray) "Riders at the western ford — they mean to take your camp from behind!"
    - objectiveAdd obj-ford "Repel the flanking force at the western ford"
    - armTrigger t09-ford-clear
    - armTrigger t10-mopup-gate

t09-ford-clear [unarmed]            // armed by t08 with the flankers' refs
  conditions: refsDestroyed {refs:['flank1','flank2','flank3','flank4',
              'flank5','flank6','flank7','flank8'], all:true}
              // completes exactly when the flanking force is dead — no blind timer.
              // t11's annihilation condition implies this, so obj-ford can never be
              // left dangling at victory.
  effects:
    - objectiveComplete obj-ford

t10-mopup-gate [unarmed]
  conditions: refDestroyed 'cressingham'
  effects:
    - objectiveComplete obj-cressingham
    - message (Narrator) "Cressingham is down. The men remember every fine he levied — the treasurer pays his own arrears at last."
    - message (Wallace) "Finish it! What is left of the host is being whipped up the causeway — hold the bridgehead and let the Forth take the rest."
    - armTrigger t10b-mopup-drive
    - armTrigger t11-victory

t10b-mopup-drive [unarmed] [loop]    // armed by t10-mopup-gate
  conditions: timerSeconds 20
  effects:
    - aiAttackNow {player:2, targetArea:{54,44,10,8}}
              // Every 20s of the mop-up, force-march every remaining host soldier —
              // including stragglers idling on the south bank (e.g. by the SW castle)
              // — at the north bridgehead. This squares t11's map-wide annihilation
              // count with obj-trap's 'north of the Forth' text: no player ever combs
              // the south bank; the stragglers come north to die.

t11-victory [unarmed]
  conditions: ownedAtMost {player:2, defIds:['militia','manAtArms','spearman','archer',
              'longbowman','skirmisher','scout','knight'], atMost:0}
              // player 2 is the fighting host and commits everything north; Warenne's
              // decorative banner guard belongs to player 4 and never counts. atMost 0
              // = every English soldier of the host is dead, exactly as obj-trap says.
  effects:
    - objectiveComplete obj-trap
    - objectiveComplete obj-hold-camp
    - playSting victory
    - panCamera (60, 96)
    - message (Warenne) "Burn the bridge. BURN IT. We are done here."
    - message (Narrator) "The Earl of Surrey did not stay to test the ford. The first army of knights ever broken by common footmen streams south, and Scotland north of the Forth is free ground."
    - message (Narrator) "But Andrew Moray took his wounds on the causeway. Before the first snow, the best soldier of the rising will be gone — and Wallace will carry the war alone."
    - victory

t12-moray-falls [armed]              // optional grace note, not a failure
  conditions: refDestroyed 'moray'
  effects:
    - message (Wallace) "Moray is hit — carry him back! You hear me, Andrew — Scotland is not finished with you!"

t13-defeat-wallace [armed]
  conditions: refDestroyed 'wallace'
  effects: [ playSting defeat, defeat "Wallace has fallen at Stirling Bridge." ]

t14-defeat-camp [armed]
  conditions: ownedAtMost {player:1, defIds:['townCenter'], atMost:0}
  effects: [ playSting defeat, defeat "The camp is overrun. The army scatters into the hills." ]
```

**Expected duration**: 25–30 min.
**Failure conditions**: Wallace dies; player TC destroyed. Moray's death is a scripted
lament, not a loss — history already wrote that one.

---

## 5. Scenario 4 — `wallace-4` · "Harry the North"

**October 1297 – January 1298. Northumberland, in winter.** Teaches rebuilding an economy
from scratch under pressure, the Castle Age, and siege weapons against fortifications.
~30–40 minutes.

### Briefing history (player-facing)
> Stirling made Wallace master of Scotland — master of a burned, hungry country stripped
> by two years of English tax and war. An army that cannot be fed at home must be fed
> somewhere, and Wallace's answer was the oldest in the book of war: carry the war onto
> the enemy's land and let Northumberland fill Scottish wagons.
>
> Through the last months of 1297 the Scots poured over the border. Tynedale burned.
> Corbridge, still black from earlier raiding, burned again. The country people fled
> south with what they could carry, and English garrisons shut their gates and watched
> the smoke. At Hexham, where frightened canons came out to meet the raiders, Wallace
> took the priory under his own protection — a hard man's gesture that his own hungry
> soldiers barely honored.
>
> Now winter closes in. Ahead lie the fortified stores of the Tyne valley: a supply camp
> at Ryton, the garrisoned fort at Corbridge, and the requisitioned stores at Hexham,
> hard against the priory wall. Newcastle will send riders when the smoke goes up. Build
> your winter camp, break their walls, and empty their granaries into ours — and mind
> the priory. We are raiders, not wolves.

*(~210 words)*

### Objectives
Initial:
1. `obj-winter-camp` — Establish the winter camp: 12 villagers, a Lumber Camp, a Mining
   Camp, and a Mill with 5 Farms.
2. `obj-castle-age` — Advance to the Castle Age.
3. `obj-ryton` — Burn the supply camp at Ryton (destroy its storehouse).

Hidden / late:
4. `obj-market` — Build a Market and stockpile 300 gold — sell the plundered surplus.
   *(added when Ryton falls)*
5. `obj-siege` — Build a Siege Workshop and 2 Battering Rams. *(added at Castle Age)*
6. `obj-corbridge` — Break the fort at Corbridge (destroy its keep). *(added with obj-siege)*
7. `obj-hexham` — Burn the requisitioned stores at Hexham. *(added when Corbridge falls)*
8. `obj-priory` — Hexham Priory must stand. Wallace gave his word. *(added with obj-hexham)*

### Hints
- Rams shrug off arrows and crack walls; keep spearmen beside them — cavalry eats rams.
- Mangonels outrange towers. Never send one anywhere alone.
- The Blacksmith and University make every soldier you own better. Research is never wasted.
- The Market sells what you cannot eat. Plundered grain and timber become the gold that
  buys armor.
- Newcastle's riders come up the eastern road. A watchtower there buys you minutes.

### Map concept — 128×128
The Tyne valley under snow: base terrain `n` (snow), snowy forests `N`.
- **River Tyne**: horizontal water band rows y 60–66, full width.
- **Two bridges** (road, 2 wide): west bridge at x 34, east bridge at x 84.
- **Player start (NW plateau)**: `{10, 12, 26, 22}` — TC (18, 20), 6 villagers, `wallace`,
  6 manAtArms, 4 spearmen, 2 archers (the raiding column). Forest belts (snowy) along
  the N edge and W edge. **Gold** 6 tiles at (28, 16); **stone** 5 tiles at (12, 30);
  **deer** 8 in the wood at `{30, 28, 6, 6}` (winter hunting); no berries (it is winter —
  farms are the lesson).
- **Ryton supply camp (NE, north bank)**: `{86, 24, 18, 14}` — palisade of Stone Walls
  (thin ring), storehouse (`mill`, ref `ryton_stores`) at (92, 30), 1 Watch Tower,
  garrison 6 militia + 2 archers. Reachable without crossing the river — the feudal-level
  first target.
- **Corbridge fort (center, south bank)**: `{52, 74, 20, 16}` — full Stone Wall circuit
  with a Gate facing the west bridge road; keep (`watchTower`, ref `corbridge_keep`) at
  (60, 80); Barracks + Archery Range inside; garrison 8 manAtArms, 6 longbowmen. Needs
  rams — arrows off the walls make an infantry-only assault expensive.
- **Hexham (SW, south bank)**: town `{18, 88, 22, 16}`; requisitioned stores (`market`,
  ref `hexham_stores`) at (30, 94) with 4 longbowmen + 4 manAtArms billeted around it;
  **Hexham Priory** (`monastery`, gaia/player 0, ref `hexham_priory`) directly adjacent
  at (24, 96) with 2 gaia monks in the close — gaia so no unit auto-targets it; only a
  deliberate player attack can harm it.
- **Newcastle road**: road entering the E edge at (127, 70), running W along the south
  bank to Corbridge — the relief-column lane.
- **Contested gold** 5 tiles at (70, 50) north bank (mid-map risk/reward).

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | Wallace's Raiders | scots | 1 | feudal | f200 w200 g100 s0 | human | 80 |
| 2 | Tyne Garrisons | english | 2 | castle | f1500 w1200 g900 s600 | defender | 60 |
| 3 | Newcastle Relief | english | 2 | castle | f2500 w1500 g1200 s300 | raider | 60 |

`maxAge: 'castle'`. `startCamera: (18, 20)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (20, 22).
- `ryton_stores` — `mill`, player 2, (92, 30).
- `corbridge_keep` — `watchTower`, player 2, (60, 80).
- `corbridge_gate` — `gate`, player 2, west wall of the fort.
- `hexham_stores` — `market`, player 2, (30, 94).
- `hexham_priory` — `monastery`, player 0 (gaia), (24, 96).

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (18, 20)
    - message (Narrator) "Northumberland, winter 1297. An army that cannot be fed at home must be fed abroad."
    - message (Graham) "Snow hides our tracks and theirs. Dig in, my lord Guardian-to-be. This valley will provision Scotland for a year."
    - objectiveAdd obj-winter-camp "Establish the winter camp: 12 villagers, Lumber Camp, Mining Camp, Mill + 5 Farms"
    - objectiveAdd obj-castle-age "Advance to the Castle Age"
    - objectiveAdd obj-ryton "Burn the supply camp at Ryton"

t02-camp-done [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['villager'], atLeast:12}
    - ownedAtLeast {player:1, defIds:['lumberCamp'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['miningCamp'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['mill'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['farm'], atLeast:5}
  effects:
    - objectiveComplete obj-winter-camp
    - message (Narrator) "The camp will hold through the snow. Farms under frost still feed men — a small mercy of the game of war."

t03-ryton [armed]
  conditions: refDestroyed 'ryton_stores'
  effects:
    - objectiveComplete obj-ryton
    - addResources {player:1, amounts:{food:300, wood:200}}
    - message (Graham) "Ryton's granary, in our wagons. The men eat English bread tonight."
    - objectiveAdd obj-market "Build a Market and stockpile 300 gold — sell the surplus"
    - message (Narrator) "Plunder is heavy and gold is not. A Market turns spare grain and timber into coin."
    - playSting horn
    - aiProfile {player:3, profile:'standard'}     // Newcastle stirs
    - armTrigger t03b-market
    - armTrigger t06-relief-1                      // the relief clock starts when the smoke goes up

t03b-market [unarmed]                              // armed by t03-ryton — the loot IS the lesson
  conditions:
    - ownedAtLeast {player:1, defIds:['market'], atLeast:1}
    - resourcesAtLeast {player:1, type:'gold', amount:300}
  effects:
    - objectiveComplete obj-market
    - message (Graham) "A counting-house in a war camp. Sell what we cannot carry — wagons want gold more than grain."

t04-castle-age [armed]
  conditions: ageReached {player:1, age:'castle'}
  effects:
    - objectiveComplete obj-castle-age
    - playSting horn
    - message (Narrator) "The Castle Age. Heavier armor, deadlier engines — war in its full harness."
    - objectiveAdd obj-siege "Build a Siege Workshop and 2 Battering Rams"
    - objectiveAdd obj-corbridge "Break the fort at Corbridge"

t05-siege-built [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['siegeWorkshop'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['batteringRam'], atLeast:2}
  effects:
    - objectiveComplete obj-siege
    - message (Graham) "Rams. Walls stop being an argument and start being firewood."

t06-relief-1 [unarmed]                // armed by t03-ryton: timerSeconds counts from arming,
                                      // so the relief rides exactly 5 minutes after Ryton burns
  conditions: timerSeconds 300
  effects:
    - spawn [6× knight, 4× crossbowman, player 3, at east road entry {124,68,4,4}]
    - aiAttackNow {player:3, targetArea:{10,12,26,22}}
    - playSting alert
    - message (Narrator) "Riders from Newcastle on the south-bank road. They know where your fires are."
    - armTrigger t07-relief-loop

t07-relief-loop [unarmed] [loop]      // armed by t06-relief-1: first sortie 7 minutes after
                                      // the first relief, then every 7 minutes (loop re-arms
                                      // reset the timer) — pacing is explicit, not emergent
  conditions: timerSeconds 420
  effects:
    - spawn [4× knight, 4× crossbowman, 2× manAtArms, player 3, {124,68,4,4}]
    - aiAttackNow {player:3, targetArea:{10,12,26,22}}
    - playSting alert

t08-corbridge [armed]
  conditions: refDestroyed 'corbridge_keep'
  effects:
    - objectiveComplete obj-corbridge
    - addResources {player:1, amounts:{gold:300, stone:100}}
    - playSting horn
    - message (Narrator) "Corbridge's keep is rubble. One garrison left on the Tyne — and one promise to keep."
    - objectiveAdd obj-hexham "Burn the requisitioned stores at Hexham"
    - objectiveAdd obj-priory "Hexham Priory must stand — Wallace gave his word"
    - revealArea {player:1, area:{18,88,22,16}}
    - panCamera (30, 94)
    - message (Wallace) "The stores burn. The priory does NOT. Any man who forgets that answers to me, and I have had a long winter."
    - aiProfile {player:3, profile:'aggressive'}

t09-priory-broken [armed]
  conditions: refDestroyed 'hexham_priory'
  effects:
    - objectiveFail obj-priory
    - message (Wallace) "…I gave them my word. This day is ash in my mouth, whatever else it brings."
    // soft failure: campaign continues, victory text acknowledges it via t10b

t10-victory [armed]
  conditions:
    - refDestroyed 'hexham_stores'
    - objectiveComplete obj-corbridge
    - objectiveComplete obj-ryton
  effects:
    - objectiveComplete obj-hexham
    - playSting victory
    - message (Narrator) "The wagons roll north, heavy with the Tyne valley's winter stores. Behind them, Northumberland learns what Scotland has known for two years: war is a guest that eats everything."
    - message (Narrator) "In the spring, at the Forest Kirk, the community of the realm names William Wallace knight and sole Guardian of Scotland — the commoner now first man of the kingdom. In England, Edward puts aside his French war and turns north with the greatest army he has ever raised."
    - victory

t11-defeat-wallace [armed]
  conditions: refDestroyed 'wallace'
  effects: [ playSting defeat, defeat "Wallace has fallen in Northumberland." ]

t12-defeat-camp [armed]
  conditions: ownedAtMost {player:1, defIds:['townCenter','villager'], atMost:0}
  effects: [ playSting defeat, defeat "The winter camp is destroyed. The raid starves in the snow." ]
```

**Expected duration**: 30–40 min.
**Failure conditions**: Wallace dies; total loss of TC + villagers. Destroying the priory
is a *soft* failure (objective failed, chastened victory text) — it teaches target
discipline without a rage-quit.

---

## 6. Scenario 5 — `wallace-5` · "Falkirk"

**22 July 1298.** The large battle: fortified defense against an overwhelming host,
mangonel micro against massed longbows, destroying a siege train, and a fighting retreat.
History lost this battle; the scenario's victory is *surviving it with Wallace alive*.
~35–50 minutes.

### Briefing history (player-facing)
> Edward Longshanks has come north himself. No deputy this time, no treasurer counting
> pennies — the king of England with the greatest host of his reign: armored knights in
> their thousands, and rank upon rank of longbowmen from Wales and the English shires.
>
> Wallace, now Guardian of Scotland, has done everything a general without a kingdom's
> purse can do. He has stripped the land before Edward's line of march, let hunger and
> mutiny gnaw the great army, and kept his own force always a day's march away. But near
> Falkirk, Edward's scouts have found him — and now there is no room left to be clever.
>
> The Scots' answer is the schiltron: rings of spears, packed shoulder to shoulder, a
> hedgehog no cavalry charge can break. Against knights alone it would be enough. But
> Edward did not bring knights alone, and the great lords of Scotland, whose horsemen
> Wallace needs to ride down the archers, sit their saddles at the wood's edge with
> doubtful hearts. Fortify the camp on the slope. Hold the line as long as the line will
> hold. And whatever this day costs — Scotland cannot pay what it would cost to lose
> William Wallace.

*(~200 words)*

### Objectives
Initial:
1. `obj-fortify` — Prepare the camp: repair and man the walls; field an army of at least
   30 (spears, skirmishers, archers, cavalry, mangonels).
2. `obj-monks` — Build a Monastery and train 2 Monks to mend the line between assaults.
3. `obj-hold` — Hold the war-camp against Edward's assault.

Hidden / late:
4. `obj-siege-train` — Destroy Edward's siege train. *(added with wave 3)*
5. `obj-breakout` — The day is lost. Wallace must live — bring him to the Torwood in the
   northwest. *(added after the siege train falls, or early if the castle falls)*

### Hints
- Longbows outrange your towers. Mangonels outrange longbows. Cavalry outruns everything —
  a handful of scouts riding down archers earns their pay ten times over.
- Repair villagers stationed behind a wall are worth a second wall.
- Garrison your wounded; a castle heals what it holds — and Monks mend men in the open.
  A converted English knight costs Edward twice: one lost, one gained.
- When the breakout comes, speed beats strength. Do not stop to win fights you can refuse.

### Map concept — 132×132
Moor and slope south of Callendar Wood.
- **Callendar Wood**: dense forest band across the N, rows y 4–26, broken by one narrow
  grass ride at x 30–33 (the breakout lane).
- **Torwood (escape area)**: NW corner glade `{6, 6, 10, 10}` inside the forest band,
  reached via the ride: a grass corridor 2 tiles wide runs from the ride mouth at
  (31, 10) west along rows y 9–10 to the glade's east edge at (16, 10) — the only
  route in.
- **Player war-camp (upper center slope)**: `{44, 34, 40, 26}` — Stone Wall circuit with
  two Gates (S wall at (60, 60), W wall at (44, 46)); Castle ref `war_camp_castle` at
  (62, 40); TC (52, 40); Siege Workshop, Barracks, Archery Range, Stable, Blacksmith
  inside;
  10 pre-built farms along the N inner edge; towers at the SW (46, 58) and SE (78, 58)
  corners. **Stone** 5 tiles inside NE corner (80, 36); **gold** 5 tiles inside NW
  (46, 36) — sustains repairs and reinforcements under siege.
- **The moss**: boggy lowland (farmland-as-marsh tiles) in a broad crescent south of the
  camp `{36, 66, 60, 12}` split by two dirt causeways at x 52 and x 76 — Edward's
  attacks funnel up the causeways.
- **English muster (SE quadrant)**: `{92, 96, 36, 32}` — vast tent city (houses), a
  wooden tower pair, Edward's banner: `edward` at (110, 112) with a household guard of
  8 knights. Roads lead NW to both causeways.
- **Flanking lane**: open grass along the W edge (x 4–14) — late-battle knight flank
  route (mirrors the historical collapse of the Scots' flanks).
- **No berries/sheep**; farms only. This is a battle, not an economy build.

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | Guardian's Army | scots | 1 | castle | f800 w800 g500 s300 | human | 120 |
| 2 | Edward's Host | english | 2 | castle | f9999 w9999 g9999 s9999 | passive *(scripted)* | 200 |

`maxAge: 'castle'`. `startCamera: (60, 44)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (58, 42).
- `graham` — `heroGraham`, player 1, (60, 44) (Sir John de Graham; his historical death
  at Falkirk is a scripted lament like Moray's).
- `war_camp_castle` — `castle`, player 1, (62, 40).
- `edward` — `heroEdward`, player 2, (110, 112), hp override 5000 (not a kill target).
- `ram1..ram4`, `mang1..mang3` — the siege train (spawned in wave 3).

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (110, 112)
    - message (Narrator) "Falkirk, 22 July 1298. Edward of England has crossed his last river. There is no more room to be clever."
    - panCamera (60, 44)
    - message (Graham) "The schiltrons will hold the horses, Will. It's the bowmen I fear — and the lords who swore us THEIR horses."
    - objectiveAdd obj-fortify "Field an army of 30: spears, skirmishers, archers, cavalry, mangonels"
    - objectiveAdd obj-monks "Build a Monastery and train 2 Monks"
    - objectiveAdd obj-hold "Hold the war-camp against Edward's assault"
    - armTrigger t03-battle-start-timer

t02-fortify-check [armed]
  conditions: ownedAtLeast {player:1, defIds:['spearman','pikeman','skirmisher','archer',
              'crossbowman','mangonel','militia','manAtArms','longswordsman',
              'scout','lightCavalry','knight'], atLeast:30}
              // cavalry counts — the Stable is in the camp and the hint about riding
              // down archers is meant to be taken
  effects:
    - objectiveComplete obj-fortify
    - message (Wallace) "I have brought you to the ring. Hop gracefully if you can."

t02b-monastery [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['monastery'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['monk'], atLeast:2}
  effects:
    - objectiveComplete obj-monks
    - message (Narrator) "Monks heal the hurt and turn the enemy's own steel. Keep them behind the line, never in it."

t03-battle-start-timer [unarmed]
  conditions: timerSeconds 600            // 10 min prep
  effects:
    - playSting horn
    - panCamera (76, 78)
    - message (Narrator) "Drums in the south. The host of England comes up the causeways with the morning sun on its spears."
    - armTrigger t04-wave-1

t04-wave-1 [unarmed]                      // the knight charge
  conditions: always
  effects:
    - spawn [12× knight, 6× scout, player 2, at causeway mouths {50,78,6,4} and {74,78,6,4}]
    - aiAttackNow {player:2, targetArea:{44,34,40,26}}
    - message (Graham) "First the pride of England breaks itself on our spears. SCHILTRON! Lock and hold!"
    - armTrigger t05-nobles
    - armTrigger t06-wave-2

t05-nobles [unarmed]                      // the desertion — a promise that never arrives
  conditions: timerSeconds 240
  effects:
    - playSting alert
    - panCamera (10, 30)                  // empty western treeline
    - message (Narrator) "On the wing where the lords' cavalry should stand, there is only wind in the trees. Comyn's banners are already small on the northern road."
    - message (Wallace) "So. Scotland's nobles. Remember this hour, lads — remember who stayed."

t06-wave-2 [unarmed]                      // the longbow corps
  conditions: timerSeconds 300
  effects:
    - spawn [16× longbowman, 8× manAtArms, player 2, {50,78,6,4} and {74,78,6,4}]
    - aiAttackNow {player:2, targetArea:{44,34,40,26}}
    - playSting alert
    - message (Graham) "Bowmen — THOUSANDS. Mangonels forward, and every rider we have on their flanks, NOW!"
    - armTrigger t07-wave-3

t07-wave-3 [unarmed]                      // the siege train
  conditions: timerSeconds 360
  effects:
    - spawn [4× batteringRam refs 'ram1'..'ram4', 3× mangonel refs 'mang1'..'mang3',
             8× manAtArms escort, player 2, {50,78,6,4}]
    - aiAttackNow {player:2, targetArea:{44,34,40,26}}
    - playSting alert
    - message (Narrator) "Edward's engineers bring up rams and stone-throwers against the camp walls."
    - objectiveAdd obj-siege-train "Destroy Edward's siege train"
    - armTrigger t08-wave-4
    - armTrigger t09-train-dead

t08-wave-4 [unarmed]                      // the general assault + west flank
  conditions: timerSeconds 420
  effects:
    - spawn [10× knight, player 2, west lane {6,60,6,6}]
    - spawn [10× manAtArms, 8× longbowman, player 2, {50,78,6,4} and {74,78,6,4}]
    - aiAttackNow {player:2, targetArea:{44,34,40,26}}
    - playSting alert
    - message (Narrator) "The full weight of England leans on the line. Knights round the western flank!"

t09-train-dead [unarmed]
  conditions: refsDestroyed {refs:['ram1','ram2','ram3','ram4','mang1','mang2','mang3'], all:true}
  effects:
    - objectiveComplete obj-siege-train
    - message (Graham) "Their engines burn! But Will — look at the field. For every one we cut down, Edward has five more fed and rested."
    - armTrigger t10-breakout

t10-breakout [unarmed]
  conditions: timerSeconds 120
  effects:
    - objectiveComplete obj-hold
    - playSting horn
    - panCamera (31, 20)                  // the forest ride
    - message (Wallace) "Enough. Scotland needs living men more than dead heroes. Sound the retreat — north, through the wood, and DO NOT STOP."
    - objectiveAdd obj-breakout "Bring Wallace to the Torwood in the northwest"
    - revealArea {player:1, area:{6,6,28,22}}
    - armTrigger t13-escape

t11-castle-falls [armed]                  // early collapse arms the breakout immediately.
                                          // t10 and t11 can BOTH fire; the idempotency
                                          // contract (§1) makes the duplicate objectiveAdd /
                                          // objectiveComplete / armTrigger effects no-ops
  conditions: refDestroyed 'war_camp_castle'
  effects:
    - playSting alert
    - message (Graham) "The castle is breached — the camp cannot hold! Get the Guardian OUT!"
    - objectiveComplete obj-hold          // held as long as it could
    - objectiveAdd obj-breakout "Bring Wallace to the Torwood in the northwest"
    - revealArea {player:1, area:{6,6,28,22}}
    - armTrigger t13-escape

t12-graham-falls [armed]                  // scripted lament, not a failure
  conditions: refDestroyed 'graham'
  effects:
    - message (Wallace) "John! — No. No, not you as well. Scotland, what a price you ask."

t13-escape [unarmed]
  conditions: entitiesInArea {player:1, defIds:['heroWallace'], area:{6,6,10,10}, atLeast:1}
  effects:
    - objectiveComplete obj-breakout
    - playSting victory
    - message (Narrator) "Falkirk is lost. A third of the army lies on the moor, and Sir John de Graham with them. Wallace burns Stirling and Perth behind him so that Edward may govern ashes."
    - message (Narrator) "Within weeks, Wallace resigns the Guardianship into the hands of the nobles who watched from the treeline. But Edward's great host, starving and mutinous, cannot hold what it has won. The war does not end. It goes into the hills — and so does Wallace."
    - victory

t14-defeat-wallace [armed]
  conditions: refDestroyed 'wallace'
  effects: [ playSting defeat, defeat "Wallace has fallen at Falkirk, and with him the rising." ]
```

**Expected duration**: 35–50 min.
**Failure conditions**: Wallace dies — the *only* hard failure. Losing the castle, the
camp, even the whole army merely accelerates the breakout. The scenario is a defeat you
win by surviving, exactly as history had it.

---

## 7. Scenario 6 — `wallace-6` · "The Unbroken"

**1303–1305. The Forest and the Clyde.** The finale and graduation exam: Imperial Age,
trebuchets, two enemy players, a contested map. ~45–75 minutes.

### Briefing history (player-facing)
> Seven years of war. Wallace has been to France to beg King Philip for aid and come home
> with fair words and empty hands. One by one the great men of Scotland have made their
> peace — Comyn on terms, and the young Earl of Carrick, Robert Bruce, keeping his own
> counsel as always. Edward holds the land through garrisons and a new-made government,
> and his Warden's seat is the mighty red-stone castle of Bothwell on the Clyde, where
> Sir Aymer de Valence keeps the king's peace with rope and iron.
>
> For every name on Edward's pardon rolls there is one name missing. It is missing
> because Edward struck it out himself: for William Wallace, no terms, no peace, no
> price but surrender of his body. Hunted at Happrew, harried at Earnside, Wallace holds
> to the deep woods with Sir Simon Fraser and the unforgiven — and while he stands
> unbowed, Edward's conquest is a lie told in official ink.
>
> One war-camp in the Forest. One army raised from the unpardoned. The watch-fort at
> Happrew, the bridge-tower at Earnside, and then the Warden's own walls. Break Bothwell,
> and every man in Scotland learns the war is not over — it is only waiting for a king.

*(~215 words)*

### Objectives
Initial:
1. `obj-war-camp` — Raise the hidden war-camp: 15 villagers, Lumber Camp, Mining Camp,
   Mill with 6 Farms.
2. `obj-imperial` — Advance to the Imperial Age.

Hidden / late:
3. `obj-happrew` — Destroy the watch-fort at Happrew (its keep). *(added at Castle Age)*
4. `obj-earnside` — Destroy the bridge-tower at Earnside to open the road to the Clyde.
   *(added at Castle Age)*
5. `obj-castle-treb` — Build a Castle and field two Trebuchets. *(added at Imperial)*
6. `obj-bothwell` — Breach Bothwell: destroy the Warden's keep. *(added when Happrew and
   Earnside have fallen)*
7. `obj-captives` — (Optional) Free the captives held at Happrew. *(revealed on approach,
   or when the fort falls)*

### Hints
- Trebuchets are built at the Castle and must unpack to fire. They outrange everything on
  a wall — and cannot defend themselves. Escort or regret.
- Segrave's field army sweeps the Forest. Walls across the forest mouths turn sweeps into
  toll-gates.
- The Market turns surplus wood into the gold that late-war armies drink.
- Monks heal between assaults, and a converted English knight is two swings of the sword —
  one they lose, one you gain.

### Map concept — 144×144
The Ettrick Forest and the road to the Clyde. South-east half is deep forest; the
north-west is occupied lowland.
- **The Forest**: dense trees covering the SE triangle — **every tile with x + y ≥ 190**,
  i.e. everything below/right of the diagonal from (48, 143) to (143, 48) — broken by
  winding grass corridors. Player hollow at its heart: clearing `{100, 100, 26, 24}` —
  TC (110, 108), `wallace`, `fraser`, 8 villagers, 8 highlandRaider veterans, 4 pikemen,
  2 crossbowmen. Two forest mouths breach the boundary diagonal as ~3-tile grass gaps:
  north mouth at (112, 78) and west mouth at (78, 112) — natural wall lines; grass
  corridors wind from each mouth through the trees to the clearing. Happrew, the
  contested gold at (72, 72), and both English bases all lie in the open ground NW of
  the diagonal.
- **Gold**: 6 tiles at (122, 96) and 5 at (96, 126) (both near camp); contested 6 tiles at
  (72, 72) in open ground; rich 8 tiles inside Bothwell's ring (28, 24).
- **Stone**: 6 tiles at (118, 122) near camp; contested 5 at (60, 84).
- **Food**: deer herds ×2 in the forest (`{116, 130, 6, 5}`, `{130, 110, 5, 5}`), berries
  8 bushes at (104, 124); abandoned farmland mid-map `{64, 60, 10, 8}` (re-farmable);
  sheep 6 wandering near it. Wolves ×3 deep in the forest.
- **River Clyde**: stepped band ~8–9 tiles wide, authored as an explicit polyline:
  it enters the N edge at **x 48–56** (well east of Bothwell), flows due S at x 48–56
  down to row 55, bends W into a **horizontal reach occupying rows y 56–64 from x 56
  back to x 40**, then steps SW from (40, 56–64) to exit the W edge at **y 78–86**,
  running at exactly rows y 78–86 for x ≤ 22. Bothwell sits entirely NW of the band;
  the Forest, Happrew, and Segrave's camp all lie S/E of it.
- **Earnside bridge**: stone bridge (road, 3 wide at x 43–45) crossing the horizontal
  reach at (44, 56)–(44, 64) — land at (44, 55) and (44, 65); **bridge-tower**
  (`watchTower`, ref `earnside_tower`, player 2) at the north end (44, 52) with
  6 longbowmen + wall stubs. The only crossing — except a **hidden ford**: shallows
  `{19, 78, 3, 9}` far to the SW, spanning the band's full nine water rows (y 78–86 at
  x 19–21), unguarded but longer.
- **Happrew watch-fort (center-west, south of the river)**: `{52, 76, 16, 14}` — Stone
  Wall ring, Gate east, keep (`watchTower`, ref `happrew_keep`) at (58, 82), Barracks,
  garrison 10 manAtArms + 6 longbowmen + 4 knights. **Captive pen** in the NW corner of
  the fort: 3 villagers + 2 highlandRaiders, refs `captive1..captive5` — authored as
  **gaia (player 0)** per the Hexham Priory pattern (Appendix B), so the garrison
  cannot auto-engage them and they cannot pre-die; they become player 1 on rescue (t08).
- **Bothwell (NW corner, across the Clyde)**: `{8, 4, 28, 26}` — entirely NW of the
  river band — double Stone Wall ring,
  two Gates (S and E), towers on every corner, Castle (`bothwell_keep`, ref, player 2) at
  (24, 18), TC, Siege Workshop, Barracks, Archery Range, Monastery inside; Valence's
  garrison heavy with longbowmen and knights.
- **Segrave's field camp (N-center)**: `{80, 16, 20, 16}` — player 3's base: TC, Stable,
  Barracks, Archery Range, tents; roads toward both forest mouths. This is the aggressive
  AI that pressures the player all game.

### Player setup
| P | Name | Civ | Team | Age | Resources | AI | Pop cap |
|---|------|-----|------|-----|-----------|----|---------|
| 1 | The Unforgiven | scots | 1 | castle | f300 w300 g150 s100 | human | 150 |
| 2 | Warden of Scotland (Valence) | english | 2 | imperial | f4000 w3000 g2500 s2000 | defender | 120 |
| 3 | Segrave's Field Army | english | 2 | imperial | f5000 w4000 g3000 s1000 | standard → aggressive | 100 |

*(The Happrew captives are gaia units, not a fourth player — see the map concept and t08.)*

No `maxAge` (imperial allowed). `startCamera: (110, 108)`.

### Named entity refs
- `wallace` — `heroWallace`, player 1, (112, 110).
- `fraser` — `heroFraser`, player 1, (110, 112).
- `earnside_tower` — `watchTower`, player 2, (44, 52).
- `happrew_keep` — `watchTower`, player 2, (58, 82).
- `happrew_gate` — `gate`, player 2, east wall.
- `bothwell_keep` — `castle`, player 2, (24, 18).
- `bothwell_gate_s`, `bothwell_gate_e` — `gate`, player 2.
- `captive1..captive5` — gaia (player 0) units penned inside Happrew until rescued (t08).
- `valence` — `heroValence`, player 2, inside Bothwell (14, 20), hp override 3000
  (flavor presence, not a kill target).

### Trigger script
```
t01-intro [armed]
  conditions: always
  effects:
    - panCamera (24, 18)
    - message (Narrator) "Bothwell on the Clyde, seat of Edward's Warden. Official ink says Scotland is at peace. The Forest says otherwise."
    - panCamera (110, 108)
    - message (Fraser) "Every unpardoned man in the south is here, Will. Feed them, arm them — and give them somewhere to point."
    - objectiveAdd obj-war-camp "Raise the war-camp: 15 villagers, Lumber Camp, Mining Camp, Mill + 6 Farms"
    - objectiveAdd obj-imperial "Advance to the Imperial Age"
    - armTrigger t05-sweep-loop

t02-war-camp [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['villager'], atLeast:15}
    - ownedAtLeast {player:1, defIds:['lumberCamp'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['miningCamp'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['mill'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['farm'], atLeast:6}
  effects:
    - objectiveComplete obj-war-camp
    - message (Wallace) "Smoke rises where I say it rises now. Good. Let the Warden's clerks write THAT down."

t03-castle-age-gate [armed]              // player starts in castle age; this fires at once
  conditions: ageReached {player:1, age:'castle'}
  effects:
    - objectiveAdd obj-happrew "Destroy the watch-fort keep at Happrew"
    - objectiveAdd obj-earnside "Destroy the bridge-tower at Earnside"
    - message (Fraser) "Happrew's fort watches the west road; Earnside's tower holds the only bridge. While they stand, Bothwell sleeps easy."

t04-imperial [armed]
  conditions: ageReached {player:1, age:'imperial'}
  effects:
    - objectiveComplete obj-imperial
    - playSting horn
    - message (Narrator) "The Imperial Age. The full arsenal of the medieval world is yours — including the great engines."
    - objectiveAdd obj-castle-treb "Build a Castle and field two Trebuchets"

t05-sweep-loop [unarmed] [loop]          // Segrave's pressure, all game
  conditions: timerSeconds 420
  effects:
    - aiAttackNow {player:3, targetArea:{100,100,26,24}}
    - playSting alert
    - message (Narrator) "Segrave's riders sweep the Forest roads again."

t06-happrew-approach [armed]
  conditions: entitiesInArea {player:1, area:{48,72,24,20}, atLeast:1}
  effects:
    - revealArea {player:1, area:{52,76,16,14}}
    - message (Fraser) "They keep our people penned in that fort — taken in the sweeps. Break the wall and they're ours again."
    - objectiveAdd obj-captives "(Optional) Free the captives held at Happrew"
    - armTrigger t08b-captives-lost

t07-happrew-falls [armed]
  conditions: refDestroyed 'happrew_keep'
  effects:
    - objectiveComplete obj-happrew
    - playSting horn
    - message (Narrator) "The watch-fort burns. The west road belongs to the Forest now."
    - aiProfile {player:3, profile:'aggressive'}
    - objectiveAdd obj-captives "(Optional) Free the captives held at Happrew"
      // idempotent (§1) — covers a long-range trebuchet kill where t06 never fired
    - armTrigger t08-captives-check
    - armTrigger t08b-captives-lost

t08-captives-check [unarmed]              // armed by t07 — the fort must fall first
  conditions:
    - entitiesInArea {player:1, area:{52,76,16,14}, atLeast:1}
    - entitiesInArea {player:0, defIds:['villager','highlandRaider'], area:{52,76,16,14}, atLeast:1}
      // at least one captive still stands in the pen — no rescue of the dead
  effects:
    - changeOwner {refs:['captive1','captive2','captive3','captive4','captive5'], toPlayer:1}
      // dead refs are skipped; survivors change hands
    - objectiveComplete obj-captives
    - message (Wallace) "On your feet — you're Scotland's again. There's work."

t08b-captives-lost [unarmed]              // armed with obj-captives; resolves it honestly
  conditions: refsDestroyed {refs:['captive1','captive2','captive3','captive4','captive5'], all:true}
  effects:
    - objectiveFail obj-captives          // latched (§1): no-op if the rescue already resolved it
    - message (Fraser) "The pen at Happrew holds only the dead. Add it to the Warden's account."

t09-earnside-falls [armed]
  conditions: refDestroyed 'earnside_tower'
  effects:
    - objectiveComplete obj-earnside
    - playSting horn
    - message (Fraser) "The bridge is ours. Across that water sits the Warden — and every stone of Bothwell says he isn't expecting company."

t10-treb-ready [armed]
  conditions:
    - ownedAtLeast {player:1, defIds:['castle'], atLeast:1}
    - ownedAtLeast {player:1, defIds:['trebuchet'], atLeast:2}
  effects:
    - objectiveComplete obj-castle-treb
    - message (Narrator) "Trebuchets: pack them to move, unpack them to fire. Nothing built of stone argues with them for long."

t11-bothwell-gate [armed]
  conditions:
    - objectiveComplete obj-happrew
    - objectiveComplete obj-earnside
  effects:
    - objectiveAdd obj-bothwell "Breach Bothwell — destroy the Warden's keep"
    - revealArea {player:1, area:{8,4,28,26}}
    - panCamera (24, 18)
    - message (Valence) "So the brigand of the Forest has engines now. Send to Segrave: I want that camp ash by Sunday."
    - aiAttackNow {player:3, targetArea:{100,100,26,24}}

t12-menteith [armed]                      // the shadow of the betrayal
  conditions: timerSeconds 1500           // ~25 min in
  effects:
    - message (Menteith) "Wallace. Old friend. Edward forgets no one — but he can be MADE to forget, for men wise enough to help him remember others. Think on it."
    - message (Wallace) "Tell Sir John Menteith I know exactly what my name is worth in London. And that I keep it anyway."

t13-victory [armed]
  conditions: refDestroyed 'bothwell_keep'
  effects:
    - objectiveComplete obj-bothwell
    - playSting victory
    - panCamera (24, 18)
    - message (Narrator) "The Warden's keep falls, and the sound carries. In a hundred pardoned halls, men who signed Edward's rolls look up from their wine and remember they are Scots."
    - message (Narrator) "History now asks its price. In August 1305, at Robroyston, William Wallace is taken in his sleep — sold to Edward by Sir John Menteith, a Scottish knight. In Westminster Hall they crown him with laurel and call him traitor. His answer enters legend: he could not betray a king who was never his."
    - message (Narrator) "They give him a traitor's death at Smithfield and post his quartered body to four towns as a warning. As a warning, it fails. Within the year, Robert Bruce takes the crown at Scone — and the road from Lanark runs on, past Wallace, to Bannockburn and a free Scotland."
    - message (Narrator) "The man could be killed. The rising could not."
    - victory

t14-defeat-wallace [armed]
  conditions: refDestroyed 'wallace'
  effects: [ playSting defeat, defeat "Wallace has fallen — and this time there is no forest deep enough." ]

t15-defeat-camp [armed]
  conditions: ownedAtMost {player:1, defIds:['townCenter','villager'], atMost:0}
  effects: [ playSting defeat, defeat "The war-camp is ash. The last rising gutters out in the Forest." ]

t16-fraser-falls [armed]                  // lament, not failure. History gives Fraser a longer,
                                          // stranger road — Edward's peace in 1304, then death
                                          // for Bruce in 1306 — so the line praises only what
                                          // he was in the Forest years, and promises nothing
  conditions: refDestroyed 'fraser'
  effects:
    - message (Wallace) "Carry Sir Simon back. When every pardoned sword in Scotland was sheathed, his was out — whatever peace they write for him after, the Forest remembers whose side he held."
```

**Expected duration**: 45–75 min.
**Failure conditions**: Wallace dies; total loss of TC + villagers. Fraser's death is a
lament only. `edward`-style hp overrides keep `valence` alive as a voice, not a target.
**Historical note**: the storming of Bothwell is this campaign's one deliberate
invention — the Scots of 1303–05 never took Valence's seat. Every other beat (Happrew,
Earnside, the hunt, Menteith, Robroyston, Smithfield) follows the record, and the
CampaignDef description is worded accordingly.

---

## 8. CampaignDef

```ts
export const wallaceCampaign: CampaignDef = {
  id: 'wallace',
  title: 'William Wallace — The Rising of Scotland',
  description:
    'Scotland, 1297. English sheriffs hold Scottish towns and English law hangs Scottish ' +
    'men — until a commoner from Lanarkshire decides the price of obedience is too high. ' +
    'Rise from a hillside camp to the head of a nation in arms: learn to gather, build, ' +
    'and fight; break an army of knights at a narrow bridge; carry the war across the ' +
    'border; survive the terrible day at Falkirk; and, when every noble has made peace, ' +
    'teach an empire that one unbroken man is a country. Six scenarios. Its ending, at ' +
    'least, is all true.',
  scenarioIds: ['wallace-1', 'wallace-2', 'wallace-3', 'wallace-4', 'wallace-5', 'wallace-6'],
};
```

---

## Appendix A — Def ids used by this campaign (all landed in `packages/data`; heroes still to add)

**Units**: `villager`, `militia`, `manAtArms`, `longswordsman`, `champion`, `spearman`,
`pikeman`, `archer`, `crossbowman`, `arbalester`, `skirmisher`, `eliteSkirmisher`,
`scout`, `lightCavalry`, `knight`, `cavalier`, `paladin`, `batteringRam`, `mangonel`,
`trebuchet`, `monk`, `highlandRaider` (Scots UU), `longbowman` (English UU),
`sheep`, `deer`, `wolf`.

**Buildings**: `townCenter`, `house`, `mill`, `lumberCamp`, `miningCamp`, `farm`,
`barracks`, `archeryRange`, `stable`, `siegeWorkshop`, `blacksmith`, `market`,
`monastery`, `university`, `watchTower`, `stoneWall`, `gate`, `castle`, `wonder`.

**Civs**: `scots`, `english`.

**Hero units to add** (ordinary `UnitDef`s, `classes: ['infantry','uniqueUnit']`-style,
boosted hp/attack, unique icons, not trainable):
`heroWallace`, `heroMoray`, `heroGraham`, `heroFraser` (Scots);
`heroHeselrig`, `heroCressingham`, `heroWarenne`, `heroEdward`, `heroValence` (English).
Enemy heroes that must survive as "voices" use the `hp` override in `ScenarioEntity`.

## Appendix B — Level-builder notes

- Bridges/fords are plain terrain: a 2–3 tile wide strip of `road` (bridge) or `shallows`
  (ford) interrupting a `water` band. No special bridge entity is required or assumed.
- "Marsh"/"moss" is authored as `farmland` tiles for the visual read; it has no movement
  penalty in v1 (no such mechanic exists) — it is set dressing that shapes attack lanes
  because the *causeways carry the roads* and AI attack paths follow open ground.
- Neutral must-not-die structures (Hexham Priory) are **gaia** (`player: 0`) so
  auto-engagement never targets them; only a deliberate player command can destroy them.
- Wave AI pattern: enemy `aiProfile` stays `passive` while waves are scripted
  (`spawn` + `aiAttackNow`); switch to `defender`/`aggressive` only when the AI should
  play freely. This keeps scripted scenarios deterministic and tunable.
- All timers above are design targets for Standard difficulty; Easy/Hard variants should
  scale wave sizes ±30% and loop timers ±25% (mechanism TBD — see open questions).
