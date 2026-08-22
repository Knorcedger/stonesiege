# Campaign and chapter index

This index is the contributor-facing map of StoneSiege's **seven selectable campaigns and 48 playable chapters**. The order below is the order presented in the game. Scenario IDs are stable references for tests, deep links, saves, bug reports, and focused content changes.

Dates, named participants, locations, and broad outcomes follow the historical notes authored with each chapter. Battlefield scale, travel time, army size, dialogue, and some tactical arrangements are compressed or dramatized for play. The full historical note shown before a mission lives in its scenario's `briefing.history`; follow the chapter-title links below rather than copying that narrative into another source of truth. The older six long Wallace scenarios and the showcase citadel remain loadable for compatibility but are not selectable campaign chapters, so they are intentionally excluded.

Mission type describes the current gameplay objective, not a claim that the historical event fit a modern game category.

Difficulty is authored per chapter as a 1–5 rating (Recruit, Soldier, Veteran, Captain, Legend) with a one-line note naming what makes the chapter hard; the menu shows both. A campaign's own rating is derived from its chapters rather than authored separately, so the two can never disagree. For the six campaigns built by the shared factory in `legendaryCampaigns.ts`, the rating follows the mission kind unless a chapter overrides it.

Each selectable chapter also carries a `story` block — the stakes, the chapter's cast, and the aftermath page shown when it is won — and each campaign carries a `prologue` and an `epilogue`. `campaignStory.test.ts` holds all of that to a contract.

## William Wallace — The Rising of Scotland

Player civilization: **Scots** · Protagonist: **William Wallace** · Source: [`wallaceChapters.ts`](../packages/scenarios/src/scenarios/wallaceChapters.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `wallace-01-ledger` | [A Name in the Ledger](../packages/scenarios/src/scenarios/wallaceChapters.ts) | May 1297 | Lanarkshire | Scots | William Wallace | Settlement and economy | Recruit (1/5) |
| 2 | `wallace-02-lanark` | [The Sheriff of Lanark](../packages/scenarios/src/scenarios/wallaceChapters.ts) | May 1297 | Lanark | Scots | William Wallace | Targeted raid | Soldier (2/5) |
| 3 | `wallace-03-tay` | [The Camp on the Tay](../packages/scenarios/src/scenarios/wallaceChapters.ts) | Summer 1297 | The River Tay | Scots | William Wallace | Settlement and age advancement | Soldier (2/5) |
| 4 | `wallace-04-ormesby` | [The Justiciar Flees](../packages/scenarios/src/scenarios/wallaceChapters.ts) | June 1297 | Scone | Scots | William Wallace | Patrol battle and strongpoint assault | Veteran (3/5) |
| 5 | `wallace-05-two-risings` | [Two Risings, One Army](../packages/scenarios/src/scenarios/wallaceChapters.ts) | September 1297 | Abbey Craig, Stirling | Scots | William Wallace | Army preparation | Soldier (2/5) |
| 6 | `wallace-06-stirling` | [Stirling Bridge](../packages/scenarios/src/scenarios/wallaceChapters.ts) | 11 September 1297 | The River Forth | Scots | William Wallace | Defensive field battle | Captain (4/5) |
| 7 | `wallace-07-winter` | [A Guardian’s Winter](../packages/scenarios/src/scenarios/wallaceChapters.ts) | Winter 1297 | Northumberland | Scots | William Wallace | Settlement, economy, and raid | Veteran (3/5) |
| 8 | `wallace-08-guardian` | [Fire on the Tyne](../packages/scenarios/src/scenarios/wallaceChapters.ts) | Winter 1297–1298 | Corbridge and Hexham | Scots | William Wallace | Fort assault with protected neutral site | Veteran (3/5) |
| 9 | `wallace-09-schiltrons` | [The Schiltrons](../packages/scenarios/src/scenarios/wallaceChapters.ts) | 22 July 1298 | Falkirk | Scots | William Wallace | Army preparation | Veteran (3/5) |
| 10 | `wallace-10-falkirk` | [The Broken Field](../packages/scenarios/src/scenarios/wallaceChapters.ts) | 22 July 1298 | Falkirk | Scots | William Wallace | Defense and fighting retreat | Legend (5/5) |
| 11 | `wallace-11-forest` | [The Forest](../packages/scenarios/src/scenarios/wallaceChapters.ts) | 1303–1304 | The Forest of Selkirk | Scots | William Wallace | Settlement, breakthrough, and rescue | Captain (4/5) |
| 12 | `wallace-12-unbroken` | [The Unbroken](../packages/scenarios/src/scenarios/wallaceChapters.ts) | 1304–1305 | Earnside and Robroyston | Scots | William Wallace | Strongpoint assault | Captain (4/5) |

For the campaign's deeper design and sourcing rationale, also see [`CAMPAIGN_WALLACE.md`](CAMPAIGN_WALLACE.md) and [`CAMPAIGN_WALLACE_CHAPTERS.md`](CAMPAIGN_WALLACE_CHAPTERS.md).

## Henry V — Crown Across the Sea

Player civilization: **English** · Protagonist: **Henry V** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `henry-01-harfleur` | [The Mouth of the Seine](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | August–September 1415 | Harfleur, Normandy | English | Henry V | Siege | Veteran (3/5) |
| 2 | `henry-02-somme` | [The Road to Calais](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | October 1415 | The Somme, Picardy | English | Henry V | Retreat and escape | Veteran (3/5) |
| 3 | `henry-03-agincourt` | [Saint Crispin’s Day](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 25 October 1415 | Agincourt, Picardy | English | Henry V | Field battle | Captain (4/5) |
| 4 | `henry-04-normandy` | [Normandy Returns](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1417–1418 | Caen and Lower Normandy | English | Henry V | Siege | Veteran (3/5) |
| 5 | `henry-05-rouen` | [Rouen’s Long Winter](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | July 1418–January 1419 | Rouen, Normandy | English | Henry V | Siege | Veteran (3/5) |
| 6 | `henry-06-troyes` | [Two Crowns](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | May 1420–August 1422 | Troyes and the Île-de-France | English | Henry V | Journey and escort | Soldier (2/5) |

## Harald Hardrada — The Last Viking

Player civilization: **Vikings** · Protagonist: **Harald Hardrada** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `hardrada-01-stiklestad` | [The Wounded Exile](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 29 July 1030 | Stiklestad, Norway | Vikings | Harald Hardrada | Retreat and escape | Veteran (3/5) |
| 2 | `hardrada-02-varangian` | [The Varangian](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | c. 1034–1042 | The Byzantine Mediterranean | Vikings | Harald Hardrada | Composite siege | Veteran (3/5) |
| 3 | `hardrada-03-return` | [Gold for a Crown](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1045–1047 | Norway | Vikings | Harald Hardrada | Journey and escort | Soldier (2/5) |
| 4 | `hardrada-04-nisa` | [The Long War for Denmark](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 9 August 1062 | Off the Nisa River, Halland | Vikings | Harald Hardrada | Field battle | Captain (4/5) |
| 5 | `hardrada-05-fulford` | [Fulford Gate](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 20 September 1066 | Fulford, near York | Vikings | Harald Hardrada | Field battle | Captain (4/5) |
| 6 | `hardrada-06-stamford` | [Stamford Bridge](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 25 September 1066 | Stamford Bridge, Yorkshire | Vikings | Harald Hardrada | Last stand | Legend (5/5) |

## Joan of Arc — The Maid of Orléans

Player civilization: **French** · Protagonist: **Joan of Arc** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `joan-01-chinon` | [A Road Through Enemy Country](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | February–March 1429 | Vaucouleurs to Chinon | French | Joan of Arc | Retreat and escort | Veteran (3/5) |
| 2 | `joan-02-orleans` | [The Siege of Orléans](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 29 April–8 May 1429 | Orléans | French | Joan of Arc | Siege | Veteran (3/5) |
| 3 | `joan-03-patay` | [The Loire Opens](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 18 June 1429 | Patay, Orléanais | French | Joan of Arc | Field battle | Captain (4/5) |
| 4 | `joan-04-reims` | [The King’s Road](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | June–July 1429 | Gien to Reims | French | Joan of Arc | Journey and escort | Soldier (2/5) |
| 5 | `joan-05-paris` | [The Gate of Saint-Honoré](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 8 September 1429 | Paris | French | Joan of Arc | Assault and withdrawal | Veteran (3/5) |
| 6 | `joan-06-compiegne` | [The Closed Gate](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 23 May 1430–30 May 1431 | Compiègne and Rouen | French | Joan of Arc | Last stand and capture | Legend (5/5) |

## Chinggis Khan — The Felt-Walled Nation

Player civilization: **Mongols** · Protagonist: **Temüjin / Chinggis Khan** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `genghis-01-empty-camp` | [The Empty Camp](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | c. 1171 | The Onon River country | Mongols | Temüjin | Timed defense | Captain (4/5) |
| 2 | `genghis-02-borte` | [Börte Taken](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | c. 1180–1181 | The lower Kerulen | Mongols | Temüjin | Siege and rescue | Veteran (3/5) |
| 3 | `genghis-03-kereit` | [Broken Oaths](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1203 | Eastern Mongolia | Mongols | Temüjin | Field battle | Captain (4/5) |
| 4 | `genghis-04-naiman` | [The Last Rival](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1204–1206 | The Orkhon and Altai country | Mongols | Temüjin / Chinggis Khan | Field battle | Captain (4/5) |
| 5 | `genghis-05-zhongdu` | [Beyond the Great Wall](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1211–1215 | Jin northern China | Mongols | Chinggis Khan | Siege | Veteran (3/5) |
| 6 | `genghis-06-khwarazm` | [Otrar’s Answer](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1219–1221 | Transoxiana | Mongols | Chinggis Khan | Siege | Veteran (3/5) |

## Alexios Komnenos — Empire Reforged

Player civilization: **Byzantines** · Protagonist: **Alexios I Komnenos** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `alexios-01-dyrrhachion` | [The Broken Field](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 18 October 1081 | Dyrrhachion, Albania | Byzantines | Alexios I Komnenos | Retreat and escape | Veteran (3/5) |
| 2 | `alexios-02-larissa` | [The War of Patience](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1083 | Larissa, Thessaly | Byzantines | Alexios I Komnenos | Field battle | Captain (4/5) |
| 3 | `alexios-03-levounion` | [Levounion](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 29 April 1091 | Levounion, Thrace | Byzantines | Alexios I Komnenos | Field battle | Captain (4/5) |
| 4 | `alexios-04-crusaders` | [The Army at the Walls](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1096–1097 | Constantinople | Byzantines | Alexios I Komnenos | Timed defense | Captain (4/5) |
| 5 | `alexios-05-nicaea` | [Nicaea Returns](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | May–June 1097 | Nicaea, Bithynia | Byzantines | Alexios I Komnenos | Siege | Veteran (3/5) |
| 6 | `alexios-06-philomelion` | [The Long Recovery](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1116 | Philomelion, central Anatolia | Byzantines | Alexios I Komnenos | Fighting retreat and escort | Veteran (3/5) |

## Saladin — The Unifier

Player civilization: **Saracens** · Protagonist: **Saladin** · Source: [`legendaryCampaigns.ts`](../packages/scenarios/src/scenarios/legendaryCampaigns.ts)

| # | Scenario ID | Chapter | Date | Location | Player | Protagonist | Mission type | Difficulty |
|---:|---|---|---|---|---|---|---|---|
| 1 | `saladin-01-egypt` | [Vizier of Egypt](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1169–1171 | Egypt | Saracens | Saladin | Timed defense | Captain (4/5) |
| 2 | `saladin-02-damascus` | [The Open Gates of Damascus](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1174 | Damascus | Saracens | Saladin | Journey and escort | Soldier (2/5) |
| 3 | `saladin-03-montgisard` | [The Lesson of Montgisard](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 25 November 1177 | Montgisard, near Ramla | Saracens | Saladin | Retreat and escape | Veteran (3/5) |
| 4 | `saladin-04-hattin` | [The Horns of Hattin](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 4 July 1187 | Hattin, Galilee | Saracens | Saladin | Field battle | Captain (4/5) |
| 5 | `saladin-05-jerusalem` | [Jerusalem](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 20 September–2 October 1187 | Jerusalem | Saracens | Saladin | Field battle and compelled surrender | Captain (4/5) |
| 6 | `saladin-06-jaffa` | [The Lion and the Sultan](../packages/scenarios/src/scenarios/legendaryCampaigns.ts) | 1191–1192 | Arsuf and Jaffa | Saracens | Saladin | Timed defense | Captain (4/5) |

## Maintaining this index

When a selectable chapter is added, removed, renamed, or reordered, update this file in the same pull request. `campaignIndex.test.ts` compares the documented scenario IDs, order, titles, dates, and locations with `campaigns` and `scenariosById`, so the normal `npm test` quality gate catches drift.
