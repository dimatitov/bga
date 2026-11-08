# Star Wars: Rebellion (base game, FFG 2016) — справочник фактов для SWR-005 (factual reference)

Research date: 2026-11-08. Scope: **base game only** (no Rise of the Empire). Rules are restated in our own words; no rulebook or card text is reproduced verbatim beyond short identifiers (names of systems, units, leaders, phases, steps).

Confidence scale: **high** = official FFG document read directly (Rules Reference, Learn to Play, FAQ) or two independent sources agree; **medium** = one reliable secondary source, or official source read via an illustration only; **low** = single fan source, unverified.

## 0. Sources (cited below by tag)

| Tag | Source | What it is | How it was used |
|---|---|---|---|
| **RR** | https://images-cdn.fantasyflightgames.com/filer_public/d9/76/d97645d4-3973-41b6-ad78-6c9b927d3bc1/sw03_rules_reference_web.pdf | Official FFG Rules Reference (16 pp.), downloaded in full from FFG CDN; link found on the archived FFG news page https://web.archive.org/web/2016/https://www.fantasyflightgames.com/en/news/2016/3/21/fully-operational/ | Full text extracted and read. Primary source for all rules. |
| **LTP** | https://cdn.1j1ju.com/medias/e5/7d/d0-star-wars-rebellion-rulebook.pdf (official FFG link: https://images-cdn.fantasyflightgames.com/filer_public/0b/07/0b07601a-6ac3-4333-ac41-b6d1b9a979da/sw03_learn_to_play_web.pdf — not downloaded, 1j1ju copy used) | Official Learn to Play booklet (20 pp.) | Full text read; page 4 rendered to read the Imperial faction sheet and time track illustration. RR overrides LTP where they differ (RR "Golden Rules"). |
| **FAQ** | https://cs.uwaterloo.ca/~dtompkin/archive/dtlib/base/Star%20Wars%20-%20Rebellion%20~%20FAQ%20-%20may%2018%202016.pdf | Official FFG FAQ & Errata, 18 May 2016 (mirror) | Full text read. A newer FAQ version may exist — not checked. |
| **GH-API** | https://github.com/LlamasOnTheRun/Star-Wars-Rebellion-Component-Info-API (files `.../utils/h2/data/systems/Region*SystemData.java`, `.../units/*.java`, `.../leaders/*.java`) | Fan Java project, last push 2023-04-01; **only machine-readable adjacency found** (per-system neighbour mapping by direction) | Parsed by script: 32 systems, region membership, remote flag, adjacency, unit stats, leader list. Its unit *counts* are wrong (see §2). |
| **GH-TRACK** | https://github.com/TuulikkiLaine/SW_Rebellion_Tracking_App/blob/master/data.json | Fan tracking app; region groups + hand-traced SVG polygons of every system | Independent check of region membership; adjacency re-derived geometrically from polygons (see §1.4). |
| **MAPIMG** | https://github.com/rebellionmap/Rebellion-Map (`images/RebellionMap-OG.jpg`, `index.html`) | Fan player-aid; image traced from the real board | Visual check of borders and red "no travel" zones. |
| **FFG-2015** | https://www.fantasyflightgames.com/en/news/2015/11/3/star-wars-rebellion/ (read via Wayback) | Official FFG preview article | Red zones between apparently-touching systems = no travel (example: Bespin–Corellia). |
| **FFG-ALLIES** | https://www.fantasyflightgames.com/en/news/2016/1/18/powerful-allies/ (read via Wayback) | Official FFG preview | Starting leaders of both sides. |
| **FFG-MARCH** | https://www.fantasyflightgames.com/en/news/2016/1/21/the-imperial-march/ (read via Wayback) | Official FFG preview (Refresh phase) | Recruit schedule, build-icon example on space 4. Pre-release text. |
| **FFG-GROUND** | https://www.fantasyflightgames.com/en/news/2016/1/20/prepare-for-ground-assault/ (read via Wayback) | Official FFG preview (combat) | Rebels start with only two transport-capable ships (corvette + transport). |
| **EOG** | https://www.orderofgamers.com/downloads/StarWarsRebellion_v2.5.pdf | Esoteric Order of Gamers rules summary v2.5 (Apr 2024) | Cross-check only. |
| **SOLO** | https://github.com/vortilion/SWR_SoloVariant (`resources/js/main.js`, `index.html`) | Fan solo-variant app | Cross-check: 8 remote systems; resource icons per system. |
| **FORUM-UNITS** | https://ffg-forum-archive.entropicdreams.com/topic/224396-extra-imperial-units | FFG forum archive | Imperial miniature counts (matches RR). |

---

## 1. MAP

### 1.1 Facts about the board (rules level)

| Fact | Source | Confidence |
|---|---|---|
| 32 systems, 8 regions, 4 systems per region. Regions are separated by thick orange borders. | RR "Regions"; LTP p.7 | high |
| Two systems are adjacent if they share a border. Units **may** cross orange region borders. Units **cannot** move through the light-red shaded impassable areas. | RR "Moving Units" | high |
| The red zones sit between systems that look like they touch; there is no travel across them (FFG example: Corellia is not adjacent to Bespin; Sullust–Corellia is adjacent). | FFG-2015; RR "Moving Units" | high |
| A **remote** system has no resource icons and no loyalty space: no loyalty/subjugation markers ever, always neutral, units cannot be deployed there. A **populous** system has ≥1 resource icon and a loyalty space. | RR "Remote Systems", "Populous Systems" | high |
| Coruscant is always loyal to the Empire and cannot gain or lose loyalty. Coruscant has **no probe card** (probe deck = 31 cards = one per system except Coruscant). | RR "Loyalty", "Probe Cards"; LTP p.3 (31 probe cards) | high |
| The "Rebel Base" space on the board is **not a system**. | RR "Rebel Base" | high |
| A destroyed system (Death Star) is neither populous nor remote, has no loyalty/resources. | FAQ; RR "Destroyed Systems" | high |
| "Closest system" = fewest moves; ties chosen by resolving player. | RR "Systems" | high |

### 1.2 Region names

**No official region names were found.** RR and LTP only number/describe regions ("eight regions"), and the board does not appear to print region names. Fan sources label regions after a member system; GH-API uses REGION_ONE…EIGHT. The labels below follow GH-TRACK (fan) and are **not** official — confidence for the *names*: low; for the *membership*: **high** (GH-API and GH-TRACK agree exactly, MAPIMG consistent).

| ID (ours) | Fan label (GH-TRACK) | Systems | Remote systems in region |
|---|---|---|---|
| R1 | Mon Calamari region | Mon Calamari, Felucia, Saleucami, Yavin | Yavin |
| R2 | Nal Hutta region | Kessel, Nal Hutta, Toydaria, Bothawui | — |
| R3 | Rodia region | Tatooine, Ryloth, Rodia, Geonosis | Tatooine |
| R4 | Utapau region | Dagobah, Sullust, Utapau, Naboo | Dagobah |
| R5 | Mustafar region | Mustafar, Hoth, Bespin, Endor | Hoth, Endor |
| R6 | Coruscant region | Alderaan, Cato Neimoidia, Corellia, Coruscant | — |
| R7 | Kashyyyk region | Dathomir, Mandalore, Kashyyyk, Malastare | Dathomir |
| R8 | Mygeeto region | Dantooine, Mygeeto, Ilum, Ord Mantell | Dantooine, Ilum |

**Remote systems (8):** Dagobah, Dantooine, Dathomir, Endor, Hoth, Ilum, Tatooine, Yavin. Sources: GH-API (remote flag); SOLO ("the 8 Remote Systems", and its resource table lists exactly the other 24 systems as populous). Confidence: **high** (two independent fan sources agree; the 24 populous systems all have resource icons in SOLO). Owner should still eyeball the board.

### 1.3 Systems and adjacency (32 systems)

Source of adjacency: GH-API (parsed). Verification: all 69 edges independently re-derived from GH-TRACK polygons (shared border), and visual check on MAPIMG. Confidence per edge: **high** unless noted in §1.4.

| # | System | Region (fan label) | Remote? | Adjacent systems | Degree |
|---|---|---|---|---|---|
| 1 | Felucia | R1 — Mon Calamari region | no | Mandalore, Mon Calamari, Saleucami, Yavin | 4 |
| 2 | Mon Calamari | R1 — Mon Calamari region | no | Felucia, Saleucami | 2 |
| 3 | Saleucami | R1 — Mon Calamari region | no | Felucia, Kashyyyk, Kessel, Mandalore, Mon Calamari, Toydaria | 6 |
| 4 | Yavin | R1 — Mon Calamari region | **yes** | Dathomir, Felucia, Mandalore | 3 |
| 5 | Bothawui | R2 — Nal Hutta region | no | Malastare, Nal Hutta, Rodia, Tatooine, Toydaria | 5 |
| 6 | Kessel | R2 — Nal Hutta region | no | Nal Hutta, Saleucami, Toydaria | 3 |
| 7 | Nal Hutta | R2 — Nal Hutta region | no | Bothawui, Kessel, Toydaria | 3 |
| 8 | Toydaria | R2 — Nal Hutta region | no | Bothawui, Kashyyyk, Kessel, Malastare, Nal Hutta, Saleucami | 6 |
| 9 | Geonosis | R3 — Rodia region | no | Naboo, Rodia, Ryloth, Tatooine, Utapau | 5 |
| 10 | Rodia | R3 — Rodia region | no | Bothawui, Geonosis, Malastare, Naboo, Tatooine | 5 |
| 11 | Ryloth | R3 — Rodia region | no | Geonosis, Tatooine | 2 |
| 12 | Tatooine | R3 — Rodia region | **yes** | Bothawui, Geonosis, Rodia, Ryloth | 4 |
| 13 | Dagobah | R4 — Utapau region | **yes** | Mustafar, Naboo, Sullust, Utapau | 4 |
| 14 | Naboo | R4 — Utapau region | no | Dagobah, Geonosis, Malastare, Rodia, Sullust, Utapau | 6 |
| 15 | Sullust | R4 — Utapau region | no | Bespin, Cato Neimoidia, Corellia, Dagobah, Malastare, Mustafar, Naboo | 7 |
| 16 | Utapau | R4 — Utapau region | no | Dagobah, Geonosis, Naboo | 3 |
| 17 | Bespin | R5 — Mustafar region | no | Endor, Hoth, Mustafar, Sullust | 4 |
| 18 | Endor | R5 — Mustafar region | **yes** | Bespin, Hoth | 2 |
| 19 | Hoth | R5 — Mustafar region | **yes** | Bespin, Endor, Mustafar | 3 |
| 20 | Mustafar | R5 — Mustafar region | no | Bespin, Dagobah, Hoth, Sullust | 4 |
| 21 | Alderaan | R6 — Coruscant region | no | Cato Neimoidia, Corellia, Coruscant, Kashyyyk, Mandalore, Ord Mantell | 6 |
| 22 | Cato Neimoidia | R6 — Coruscant region | no | Alderaan, Corellia, Kashyyyk, Malastare, Sullust | 5 |
| 23 | Corellia | R6 — Coruscant region | no | Alderaan, Cato Neimoidia, Coruscant, Sullust | 4 |
| 24 | Coruscant | R6 — Coruscant region | no | Alderaan, Corellia, Ord Mantell | 3 |
| 25 | Dathomir | R7 — Kashyyyk region | **yes** | Dantooine, Mandalore, Mygeeto, Yavin | 4 |
| 26 | Kashyyyk | R7 — Kashyyyk region | no | Alderaan, Cato Neimoidia, Malastare, Mandalore, Saleucami, Toydaria | 6 |
| 27 | Malastare | R7 — Kashyyyk region | no | Bothawui, Cato Neimoidia, Kashyyyk, Naboo, Rodia, Sullust, Toydaria | 7 |
| 28 | Mandalore | R7 — Kashyyyk region | no | Alderaan, Dathomir, Felucia, Kashyyyk, Mygeeto, Ord Mantell, Saleucami, Yavin | 8 |
| 29 | Dantooine | R8 — Mygeeto region | **yes** | Dathomir, Mygeeto | 2 |
| 30 | Ilum | R8 — Mygeeto region | **yes** | Mygeeto, Ord Mantell | 2 |
| 31 | Mygeeto | R8 — Mygeeto region | no | Dantooine, Dathomir, Ilum, Mandalore, Ord Mantell | 5 |
| 32 | Ord Mantell | R8 — Mygeeto region | no | Alderaan, Coruscant, Ilum, Mandalore, Mygeeto | 5 |

Note: GH-API spells "Alderann" — the board name is **Alderaan** (GH-TRACK, RR). GH-TRACK spells "Cato Neimodia" — correct is **Cato Neimoidia** (MAPIMG, LTP).

### 1.4 Verification of adjacency and asymmetries

| Check | Result |
|---|---|
| Symmetry of GH-API mapping (A lists B ⇔ B lists A) | **Fully symmetric**, no asymmetry found. 138 directed entries = 69 undirected edges. |
| Geometric re-derivation from GH-TRACK polygons (independent hand-traced shapes, tolerance 12 px) | All 69 GH-API edges found. **One extra geometric contact: Mustafar–Utapau.** |
| Mustafar–Utapau | On MAPIMG the Utapau/Mustafar boundary is a double orange line with a **red stripe**, i.e. an impassable red zone (same graphic as Bespin–Corellia, which FFG-2015 explicitly calls non-adjacent). GH-API lists them as **not adjacent**. Conclusion: **not adjacent**, confidence medium-high. Owner should confirm on the physical board. |
| Other red-stripe pairs visible on MAPIMG (my reading of a fan image, low confidence for which pair each stripe separates) | Mon Calamari–Kessel, Yavin–Dantooine (left edge), Ryloth–Utapau (top right), Corellia–Bespin/Endor (bottom). None of them is an edge in GH-API — consistent. |
| Degree extremes | Mandalore 8 neighbours (max); Mon Calamari, Endor, Ryloth, Dantooine, Ilum 2 (min). |
| Connectivity | Graph is connected (every system reachable). |

### 1.5 Symmetric edge list (69 undirected edges, alphabetical)

| # | System A | System B |
|---|---|---|
| 1 | Alderaan | Cato Neimoidia |
| 2 | Alderaan | Corellia |
| 3 | Alderaan | Coruscant |
| 4 | Alderaan | Kashyyyk |
| 5 | Alderaan | Mandalore |
| 6 | Alderaan | Ord Mantell |
| 7 | Bespin | Endor |
| 8 | Bespin | Hoth |
| 9 | Bespin | Mustafar |
| 10 | Bespin | Sullust |
| 11 | Bothawui | Malastare |
| 12 | Bothawui | Nal Hutta |
| 13 | Bothawui | Rodia |
| 14 | Bothawui | Tatooine |
| 15 | Bothawui | Toydaria |
| 16 | Cato Neimoidia | Corellia |
| 17 | Cato Neimoidia | Kashyyyk |
| 18 | Cato Neimoidia | Malastare |
| 19 | Cato Neimoidia | Sullust |
| 20 | Corellia | Coruscant |
| 21 | Corellia | Sullust |
| 22 | Coruscant | Ord Mantell |
| 23 | Dagobah | Mustafar |
| 24 | Dagobah | Naboo |
| 25 | Dagobah | Sullust |
| 26 | Dagobah | Utapau |
| 27 | Dantooine | Dathomir |
| 28 | Dantooine | Mygeeto |
| 29 | Dathomir | Mandalore |
| 30 | Dathomir | Mygeeto |
| 31 | Dathomir | Yavin |
| 32 | Endor | Hoth |
| 33 | Felucia | Mandalore |
| 34 | Felucia | Mon Calamari |
| 35 | Felucia | Saleucami |
| 36 | Felucia | Yavin |
| 37 | Geonosis | Naboo |
| 38 | Geonosis | Rodia |
| 39 | Geonosis | Ryloth |
| 40 | Geonosis | Tatooine |
| 41 | Geonosis | Utapau |
| 42 | Hoth | Mustafar |
| 43 | Ilum | Mygeeto |
| 44 | Ilum | Ord Mantell |
| 45 | Kashyyyk | Malastare |
| 46 | Kashyyyk | Mandalore |
| 47 | Kashyyyk | Saleucami |
| 48 | Kashyyyk | Toydaria |
| 49 | Kessel | Nal Hutta |
| 50 | Kessel | Saleucami |
| 51 | Kessel | Toydaria |
| 52 | Malastare | Naboo |
| 53 | Malastare | Rodia |
| 54 | Malastare | Sullust |
| 55 | Malastare | Toydaria |
| 56 | Mandalore | Mygeeto |
| 57 | Mandalore | Ord Mantell |
| 58 | Mandalore | Saleucami |
| 59 | Mandalore | Yavin |
| 60 | Mon Calamari | Saleucami |
| 61 | Mustafar | Sullust |
| 62 | Mygeeto | Ord Mantell |
| 63 | Naboo | Rodia |
| 64 | Naboo | Sullust |
| 65 | Naboo | Utapau |
| 66 | Nal Hutta | Toydaria |
| 67 | Rodia | Tatooine |
| 68 | Ryloth | Tatooine |
| 69 | Saleucami | Toydaria |

### 1.6 Machine-readable form (derived from GH-API, names corrected)

```json
{"regions": {"R1": ["Felucia", "Mon Calamari", "Saleucami", "Yavin"], "R2": ["Bothawui", "Kessel", "Nal Hutta", "Toydaria"], "R3": ["Geonosis", "Rodia", "Ryloth", "Tatooine"], "R4": ["Dagobah", "Naboo", "Sullust", "Utapau"], "R5": ["Bespin", "Endor", "Hoth", "Mustafar"], "R6": ["Alderaan", "Cato Neimoidia", "Corellia", "Coruscant"], "R7": ["Dathomir", "Kashyyyk", "Malastare", "Mandalore"], "R8": ["Dantooine", "Ilum", "Mygeeto", "Ord Mantell"]}, "remote": ["Dagobah", "Dantooine", "Dathomir", "Endor", "Hoth", "Ilum", "Tatooine", "Yavin"], "edges": [["Alderaan", "Cato Neimoidia"], ["Alderaan", "Corellia"], ["Alderaan", "Coruscant"], ["Alderaan", "Kashyyyk"], ["Alderaan", "Mandalore"], ["Alderaan", "Ord Mantell"], ["Bespin", "Endor"], ["Bespin", "Hoth"], ["Bespin", "Mustafar"], ["Bespin", "Sullust"], ["Bothawui", "Malastare"], ["Bothawui", "Nal Hutta"], ["Bothawui", "Rodia"], ["Bothawui", "Tatooine"], ["Bothawui", "Toydaria"], ["Cato Neimoidia", "Corellia"], ["Cato Neimoidia", "Kashyyyk"], ["Cato Neimoidia", "Malastare"], ["Cato Neimoidia", "Sullust"], ["Corellia", "Coruscant"], ["Corellia", "Sullust"], ["Coruscant", "Ord Mantell"], ["Dagobah", "Mustafar"], ["Dagobah", "Naboo"], ["Dagobah", "Sullust"], ["Dagobah", "Utapau"], ["Dantooine", "Dathomir"], ["Dantooine", "Mygeeto"], ["Dathomir", "Mandalore"], ["Dathomir", "Mygeeto"], ["Dathomir", "Yavin"], ["Endor", "Hoth"], ["Felucia", "Mandalore"], ["Felucia", "Mon Calamari"], ["Felucia", "Saleucami"], ["Felucia", "Yavin"], ["Geonosis", "Naboo"], ["Geonosis", "Rodia"], ["Geonosis", "Ryloth"], ["Geonosis", "Tatooine"], ["Geonosis", "Utapau"], ["Hoth", "Mustafar"], ["Ilum", "Mygeeto"], ["Ilum", "Ord Mantell"], ["Kashyyyk", "Malastare"], ["Kashyyyk", "Mandalore"], ["Kashyyyk", "Saleucami"], ["Kashyyyk", "Toydaria"], ["Kessel", "Nal Hutta"], ["Kessel", "Saleucami"], ["Kessel", "Toydaria"], ["Malastare", "Naboo"], ["Malastare", "Rodia"], ["Malastare", "Sullust"], ["Malastare", "Toydaria"], ["Mandalore", "Mygeeto"], ["Mandalore", "Ord Mantell"], ["Mandalore", "Saleucami"], ["Mandalore", "Yavin"], ["Mon Calamari", "Saleucami"], ["Mustafar", "Sullust"], ["Mygeeto", "Ord Mantell"], ["Naboo", "Rodia"], ["Naboo", "Sullust"], ["Naboo", "Utapau"], ["Nal Hutta", "Toydaria"], ["Rodia", "Tatooine"], ["Ryloth", "Tatooine"], ["Saleucami", "Toydaria"]]}
```

### 1.7 Resource icons per populous system (bonus — not requested, needed later for Build)

Notation: ground/space × light (triangle) / medium (circle) / heavy (square); number = build-queue space. Order = left to right (left-most icon matters for subjugated systems). Primary source SOLO; cross-checked against GH-API resource types. Confidence **low–medium** (fan data only, one conflict).

| System | Icons (SOLO) | GH-API agrees? |
|---|---|---|
| Alderaan, Coruscant, Felucia, Kessel, Malastare, Rodia, Ryloth | 1× ground-light, queue 1 | yes (type) |
| Bespin, Saleucami | 1× ground-medium, queue 1 | yes |
| Bothawui | 1× ground-medium, queue 1 | **CONFLICT**: GH-API says space-medium |
| Toydaria | 1× space-medium, queue 2 | yes; FFG-MARCH confirms Toydaria = one blue circle → Corellian Corvette |
| Kashyyyk | 2× ground-light, queue 1 | yes |
| Mandalore, Naboo, Nal Hutta | ground-light + space-light, queue 1 | yes |
| Cato Neimoidia | space-light + ground-medium, queue 2 | yes |
| Geonosis, Mygeeto | space-light + ground-heavy, queue 2 | yes |
| Mustafar | space-light + space-medium, queue 2 | yes |
| Ord Mantell | ground-medium + space-medium, queue 2 | yes |
| Sullust | ground-light + ground-heavy, queue 2 | yes |
| Corellia, Mon Calamari | space-light + space-heavy, queue 3 | yes |
| Utapau | space-medium + space-heavy, queue 3 | yes; LTP p.13 confirms Utapau's left-most icon is a blue circle |
| "Rebel Base" space | space-light + ground-light, queue 1 | — |

GH-API queue numbers differ from SOLO for some systems (e.g. Felucia 3 vs 1) — treat queue numbers as UNKNOWN until checked on the board.

---

## 2. UNITS

Stats read from the official Imperial faction sheet (LTP p.4 illustration, rendered at 5×) — confidence **high** for Imperial rows. Rebel stats: X-wing/Y-wing confirmed by LTP p.15 combat illustration (high); the rest from GH-API only (**medium**; GH-API matched every Imperial value exactly, which raises trust). Component counts: RR "Units" (**high**), Imperial counts also confirmed by FORUM-UNITS.

Definitions (RR): unit with blue resource icon = ship; orange = ground unit. Ship with red health = capital ship; black health = fighter. Death Star / DSUC are "space stations" (ships, but neither capital nor fighter, not structures). Shield Generator and Ion Cannon are **structures** (immobile ground units, no dice, special ability). Each ground unit **and each TIE Fighter** uses 1 transport capacity. Units with the *transport restriction* icon can move only when a unit with transport capacity moves out of the same system with them.

| Faction | Unit | Theater | Attack (black/red) | Health | Transport capacity | Movement notes | In box |
|---|---|---|---|---|---|---|---|
| Empire | TIE Fighter | space (fighter) | 1 / – | 1 black | 0 | transport restriction icon; needs capacity like a ground unit | 24 |
| Empire | Assault Carrier | space (capital) | 1 / 1 | 2 red | **4** | — | 8 |
| Empire | Star Destroyer | space (capital) | 1 / 2 | 4 red | **6** | — | 8 |
| Empire | Super Star Destroyer | space (capital) | 2 / 3 | 6 red | **8** | on the base faction sheet with a teal (project-type) icon instead of a normal resource icon; how it enters play is not covered here (project cards — UNVERIFIED) | 2 |
| Empire | Death Star | space (station) | – / 4 | none (cannot be damaged) | **8** | Empire cannot retreat while a DS/DSUC is in the combat | 2 |
| Empire | Death Star Under Construction | space (station) | – / – | 4 black | 0 | **immobile** | 1 |
| Empire | Stormtrooper | ground | 1 / – | 1 black | – | needs transport | 30 |
| Empire | AT-ST | ground | 1 / 1 | 2 red | – | needs transport | 10 |
| Empire | AT-AT | ground | 1 / 2 | 3 red | – | needs transport | 4 |
| Rebel | X-wing | space (fighter) | 1 / – | 1 black | 0 | moves freely (no transport needed) | 8 |
| Rebel | Y-wing | space (fighter) | – / 1 | 1 black | 0 | moves freely | 12 |
| Rebel | Corellian Corvette | space (capital) | 1 / 1 (GH-API) | 2 red (GH-API) | **2** (GH-API) | — | 4 |
| Rebel | Rebel Transport | space (capital) | – / – (GH-API) | 2 red (GH-API) | **4** (GH-API) | if the only Rebel ships in a combat are Transports, they must retreat or are destroyed (RR) | 4 |
| Rebel | Mon Calamari Cruiser | space (capital) | 1 / 2 (GH-API) | 4 red (GH-API) | **4** (GH-API) | — | 3 |
| Rebel | Rebel Trooper | ground | 1 / – (GH-API) | 1 black (GH-API) | – | needs transport | 21 |
| Rebel | Airspeeder | ground | 1 / 1 (GH-API) | 2 red (GH-API) | – | needs transport | 6 |
| Rebel | Shield Generator | ground (structure) | none | 3 red (GH-API) | – | **immobile** | 3 |
| Rebel | Ion Cannon | ground (structure) | none | 3 red (GH-API) | – | **immobile** | 3 |

Totals check: Imperial 24+8+8+2+2+1+30+10+4 = 89; Rebel 8+12+4+4+3+21+6+3+3 = 64; matches "153 miniatures (89 Imperial, 64 Rebel)" (LTP p.3). **The requested list was missing the Super Star Destroyer** — it is part of the base game (RR "Units", "Ships"; base faction sheet).

Further unit facts:
- X-wings and Y-wings have no transport capacity; at game start the Rebels' only transport-capable ships are 1 Corvette + 1 Transport (FFG-GROUND; RR setup list). Confidence high.
- Units are limited to the components in the box; cannot build a type with none left; during Refresh step 5 a player may destroy own units on the board to free them (RR "Component Limitations"). High.
- If structures are the only Rebel ground units left and Imperial ground units remain, the structures are destroyed; DSUC alone vs Rebel ships is destroyed (RR "Combat"). High.
- GH-API `totalInGame` values (e.g. 12 TIE, 18 Stormtroopers) are **wrong** versus RR — do not use them.

---

## 3. LEADERS

25 leaders: 12 Imperial, 13 Rebel (LTP p.3, high). Each side starts with the **four leaders that have no recruit icon** in its leader pool; all others are recruitable later (RR "Leaders", setup step 2; high).

| Faction | Starting leaders (setup leader pool) | Source / confidence |
|---|---|---|
| Empire | Emperor Palpatine, Darth Vader, Grand Moff Tarkin, General Tagge | FFG-ALLIES (official), GH-API `isStartingLeader`, LTP p.6 illustration — **high** |
| Rebel | Mon Mothma, Princess Leia, Jan Dodonna, General Rieekan | FFG-ALLIES (official), GH-API — **high** |

| Faction | Recruitable leaders (have recruit icon; come in via action cards) | Source / confidence |
|---|---|---|
| Empire (8) | Boba Fett, General Veers, Admiral Ozzel, Admiral Piett, Colonel Yularen, Moff Jerjerrod, Soontir Fel, Janus Greejatus | GH-API (names; spelled "Adiral Ozzel"/"Janus GreeJatus" there); Boba Fett with recruit icon also LTP p.4 — **medium** |
| Rebel (9) | Admiral Ackbar, Chewbacca, General Madine, Han Solo, Lando Calrissian, Luke Skywalker, Luke Skywalker (Jedi), Obi-Wan Kenobi, Wedge Antilles | GH-API; Lando, Obi-Wan, Han, Chewbacca on action cards per FFG-MARCH — **medium** |

Notes:
- "Luke Skywalker (Jedi)" is a separate leader token treated as Luke Skywalker for card abilities and action-card restrictions (RR "Leaders"). High.
- A leader with **no tactic values** cannot activate a system (RR). Per GH-API, leaders with 0/0 tactics are Mon Mothma, Boba Fett, Janus Greejatus (medium).
- Leader skill/tactic numbers exist in GH-API but were not verified — not reproduced here.

---

## 4. SETUP

### 4.1 Standard setup (RR "Appendix: Complete Setup" — used for all games after the first)

| Step (RR numbering) | Content (own words) | Confidence |
|---|---|---|
| 1 Choose factions | Players pick sides (random if undecided) and take their own miniatures, leaders, loyalty markers, faction sheet, missions, action cards. | high |
| 2 Starting leaders | Four leaders without recruit icon → own leader pool; the rest beside the board. | high |
| 3 Board & time track | **Time marker on space 1, reputation marker on space 14.** | high |
| 4 Objective deck | Stack piles III (bottom), II, I (top), each shuffled; Rebel draws 1 objective (secret). | high |
| 5 Action decks | Each side shuffles its action cards *with* recruit icon into its action deck. | high |
| 6 Tactic decks/markers/dice | Shuffle space & ground tactic decks; supply nearby. | high |
| 7 Missions | Set aside 4 starting missions each; Empire shuffles project deck onto the Projects space; remaining missions → each side's mission deck. | high |
| 8.I Loyalty | Shuffle probe deck; reveal until **3 Rebel-icon systems and 5 Imperial-icon systems** appear. Rebel loyalty marker in each of the 3 Rebel systems; **subjugation marker in the first 2 Imperial systems drawn, Imperial loyalty in the other 3**. The 5 Imperial probe cards go back to the box; all other probe cards reshuffled into the deck. | high |
| 8.II Imperial units | 3 Star Destroyers, 3 Assault Carriers, 12 TIE Fighters, 12 Stormtroopers, 5 AT-STs, 1 AT-AT, 1 Death Star, placed freely in systems with Imperial loyalty or subjugation markers; **every Imperial system must get ≥1 ground unit**. | high |
| 8.III Rebel units | 1 Corellian Corvette, 1 Rebel Transport, 2 X-wings, 2 Y-wings, 6 Rebel Troopers, 2 Airspeeders, placed on the "Rebel Base" space and/or in **one** Rebel or neutral system. | high |
| 8.IV Action cards | Each side draws 2 random *starting* action cards (no recruit icon); the rest of those return to the box unseen. | high |
| 9 Rebel base | Rebel secretly picks one card **from the probe deck** and puts it facedown under the base "Location" space; probe deck shuffled onto its space. (The 5 starting Imperial systems' cards are already out of the deck; Coruscant has no card.) | high |
| 10 Starting hand | Each side: 4 starting missions + top 2 of own mission deck. | high |

Starting loyalty/subjugation summary (standard): 3 Rebel-loyal systems, 3 Imperial-loyal systems + 2 subjugated systems (random from probe deck), plus Coruscant which is permanently Imperial-loyal (RR "Loyalty"). Whether Imperial starting units may also be placed on Coruscant in standard setup: see open questions.

### 4.2 First-game (fixed) setup — LTP p.16 (useful as a deterministic test fixture)

| System | Placement | Confidence |
|---|---|---|
| Probe deck | Remove Corellia, Mandalore, Saleucami, Sullust, Mustafar cards | high |
| Kashyyyk | 1 Rebel loyalty | high |
| Naboo | 1 Rebel loyalty | high |
| Bothawui | 1 Corellian Corvette, 1 Rebel Transport, 1 X-wing, 1 Y-wing, 3 Rebel Troopers, 1 Airspeeder, 1 Rebel loyalty | high |
| "Rebel Base" space | 1 X-wing, 1 Y-wing, 3 Rebel Troopers, 1 Airspeeder | high |
| Saleucami | 1 Star Destroyer, 2 TIE, 2 Stormtroopers, 1 AT-ST, 1 Imperial loyalty | high |
| Mandalore | 1 Death Star, 4 TIE, 2 Stormtroopers, 1 AT-ST, 1 subjugation | high |
| Coruscant | 1 Star Destroyer, 1 Assault Carrier, 2 TIE, 3 Stormtroopers, 1 AT-AT, 1 AT-ST | high |
| Corellia | 1 Assault Carrier, 1 Stormtrooper, 1 Imperial loyalty | high |
| Sullust | 1 Star Destroyer, 2 TIE, 2 Stormtroopers, 1 AT-ST, 1 subjugation | high |
| Mustafar | 1 Assault Carrier, 2 TIE, 2 Stormtroopers, 1 AT-ST, 1 Imperial loyalty | high |
| Base choice | First game: Rebel should pick a system not adjacent to any Imperial unit (LTP setup step 9). First game ignores action-card abilities (recruited cards returned to box). | high |

(Totals match the standard Imperial list: 3 SD, 3 AC, 12 TIE, 12 ST, 5 AT-ST, 1 AT-AT, 1 DS. Rebel totals match the standard Rebel list.)

---

## 5. ROUND STRUCTURE

Game round = **Assignment Phase → Command Phase → Refresh Phase** (RR "Rounds"; note RR misprints "Activation Phase" there; LTP p.6 and RR glossary use "Assignment"). High.

### 5.1 Assignment Phase (RR "Assignment Phase")

| Rule | Confidence |
|---|---|
| Rebel assigns first (any number of leaders), then Empire. | high |
| To assign: put a mission card from hand facedown and place **1 or 2** leaders from the pool on it. Missions are not revealed in this phase. | high |
| Unassigned leaders stay in the pool (usable in Command Phase to activate systems, oppose missions, join combat). | high |
| A mission whose assigned leaders lack enough matching skill icons cannot be revealed later (stays facedown). | high (RR "Mission Cards") |
| An "Assignment" action card may be used instead of assigning a leader. | high (RR "Action Cards") |

### 5.2 Command Phase (RR "Command Phase", "Activating Systems", "Mission Cards")

| Rule | Confidence |
|---|---|
| **Rebel takes the first turn**, then players alternate. | high |
| A turn = **one** of: (a) activate a system with a leader from the pool, or (b) reveal one of own facedown missions with a leader on it. | high (LTP p.7; RR) |
| A player **may pass at any time**. After passing, that player can no longer activate systems or reveal missions **for the rest of this Command Phase** — passing is permanent for the phase; his turns are skipped while the other player keeps taking turns. | high (RR; LTP p.7 "turn is skipped for the rest of the Command Phase") |
| A passed player may still use pool leaders to **oppose** missions and to **add a leader to combat** (combat step 1). | high (RR) |
| The phase ends when **all** players have passed. | high (LTP p.7; EOG) |
| "Must pass": RR never forces a pass explicitly; it says that if a mission cannot be revealed the player must activate, reveal another mission, or pass. Practically, a player with no usable leader/mission can only pass. | medium (inference) |
| Unrevealed missions: at end of Command Phase leaders on them go back to the pool and the cards back to hand. | high |
| Rebel may optionally reveal the base during his turn — **errata: only at the start of one of his turns, before using a leader**. | high (FAQ errata; RR) |
| "Rapid Mobilization" (new base) resolves at the end of the Command Phase, just before Refresh. | high (RR) |

**Activating a system** (RR "Activating Systems" steps 1–5):
1. Place a leader from the pool in **any** system (not just adjacent to own units). Leaders without tactic values cannot activate.
2. Move own units **from adjacent systems** into it (from one or several adjacent systems). Moving 0 units is allowed (FAQ).
3. If Imperial **ground** units moved in, Rebel declares whether the base is there; if yes it is revealed.
4. If both sides have units in the same theater → combat.
5. If an Imperial ground unit is there and the system lacks Imperial loyalty → subjugation marker.

| Restriction question | Answer | Source / confidence |
|---|---|---|
| Can a system that already contains a leader be activated? | **Yes.** RR states it without restricting whose leader, so a system with one's own leader can also be activated (literal reading). | RR — high for "a leader", medium for "own leader" (not stated separately) |
| Can units move out of a system containing a leader of their own faction? | **No** — a system holding one of your leaders locks your units there (even a leader with no tactic values). Enemy leaders do not lock you. Captured Rebel leaders do **not** lock Rebel units. | RR "Moving Units", "Captured Leaders" — high |
| Only from adjacent systems? | **Yes** (normal movement); some cards override (e.g. moves between Rebel Base and any system). | RR — high |
| Can units move out of a system that contains enemy units? | Rules impose **no such restriction** (no "pinning" rule exists in RR). | RR (absence of rule) — medium; owner to confirm |
| Moving into a system with enemy units | Allowed; triggers combat. | RR — high |
| Transport | Each moving ship carries ground units **and TIE Fighters** up to its transport capacity; each uses 1 capacity. Transport-restricted units move only together with a capacity-providing unit leaving the **same** system. Rebel X/Y-wings move freely. Immobile units (structures, DSUC) never move. | RR "Moving Units", "Transport Capacity" — high |
| "Rebel Base" space movement (base hidden) | Units on the Rebel Base space may move to the base's system or any system adjacent to it; the Rebel may activate the Rebel Base space to pull units in from the base's system or adjacent systems. A Rebel leader on the Rebel Base space prevents moving units out of that space (but not out of the base's system). | RR "Rebel Base" — high |
| Same-system multiple leaders | Placement within a system doesn't matter; every leader there takes part in missions/battles in that system. | RR — high |

**Revealing a mission** (RR steps): flip card; choose legal system and place the assigned leader(s) there; if "attempt", the opponent may send **one** leader from his pool to oppose (even if he already has leaders there); opposed → both roll dice = matching skill icons of all their leaders in the system (max 10 dice; hit/direct hit = 1 success, special = 2); attacker needs **strictly more** successes; leader-portrait match adds +2 successes; starting missions return to hand, all others discarded. "Resolve" missions cannot be opposed. High.

### 5.3 Refresh Phase — step order (RR "Refresh Phase"; identical in LTP p.10 and quick reference p.20)

| Step | Content (own words) | Confidence |
|---|---|---|
| (pre-step) | Rebel may play **one** "Start of Refresh Phase" objective immediately before step 1. | high |
| 1 Retrieve Leaders | All leaders on the board return to pools; leaders still on missions return and those cards go back to hand. (Captured leaders stay — RR "Captured Leaders": cannot return to the pool.) | high |
| 2 Draw Missions | Each draws 2 missions; discard down to 10 (starting missions never discarded; projects count; objectives don't). | high |
| 3 Launch Probe Droids | Empire draws 2 probe cards (secret). | high |
| 4 Draw Objective | Rebel draws 1 objective. | high |
| 5 Advance Time Marker | Move time marker 1 space. Then, by icon on the **new** space: **I Recruit** (each draws 2 action cards, recruits 1 leader shown on either, keeps that card, other card to bottom of deck; Rebel declares first) and/or **II Build** (simultaneous; 1 unit per resource icon of each loyal system, only left-most icon for subjugated systems, placed on build-queue space = number by the icon; none from systems with an enemy unit or sabotage). | high |
| 6 Deploy Units | Rebel first, then Empire: slide queue 1 space; units leaving space "1" deploy to own loyal/subjugated systems (Rebel: also the hidden Rebel Base space), **max 2 per system per Refresh**; not to remote systems, systems with enemy units or sabotage; undeployed units go back to space 1. | high |

**Correction to the requested order:** the official order is Retrieve → Draw Missions → Probe → Objective → Advance Time (recruit/build) → Deploy. There is **no separate "Rebel victory check" step**: the Rebel win is an *immediate* condition checked whenever time marker and reputation marker share a space — in practice when the time marker advances in step 5 or when reputation is gained (RR "Time Marker", "Reputation", "Winning the Game"). High.

**Time-track icons:**

| Space | Recruit | Build | Source / confidence |
|---|---|---|---|
| 1 | — (start) | — | RR |
| 2 | yes | likely yes | Recruit: FFG-MARCH example ("advances to 2" → recruit). Build: two icons visible at space 2 in LTP p.4 illustration — low |
| 3 | yes | no? | FFG-MARCH: "recruit in each of the first four Refresh phases, then done" → spaces 2–5 — medium; icon visible in LTP p.4 — low |
| 4 | yes | **yes** | Build: FFG-MARCH explicit ("4" space features the build icon) — medium-high |
| 5 | yes | no? | FFG-MARCH (first four Refresh phases) — medium |
| 6, 8, 10, 12 | no | likely yes | single icons visible above these spaces in LTP p.4 illustration — low |
| 7, 9, 11, 13, 15 | no | no? | no icon visible (7, 9, 11) — low |
| 14, 16 | ? | ? | not visible in the illustration — **UNKNOWN** |

The exact icon layout must be read off the physical board (see open questions).

---

## 6. VICTORY (RR "Winning the Game", "Reputation", "Time Marker")

| Side | Exact condition (own words) | Confidence |
|---|---|---|
| Rebel | Wins **immediately** the moment the reputation marker and the time marker are on the **same space** of the time track. Reputation moves toward the time marker one space at a time (multi-point gains are stepped); time moves toward reputation by +1 each Refresh step 5. Losing reputation moves the marker away. | high |
| Empire (a) | Wins **immediately** if the Rebel base's system contains Imperial units (any, space or ground) and **no Rebel units** — **but only if the base is revealed**. | high |
| Empire (b) | Wins immediately if the Death Star ("Superlaser Online") destroys the Rebel base's system — **even if the base is still hidden**. | high (LTP p.11; FAQ) |
| Cheating | A player found to have cheated (e.g. illegal move from the base) loses at game end. | high (RR "Cheating") |

---

## 7. REBEL BASE REVEAL (RR "Revealing the Rebel Base", "Activating Systems" step 3; FAQ)

| Trigger / non-trigger | Result | Confidence |
|---|---|---|
| Imperial **ground units** in the base's system (typically moved in) | Base revealed — **after all movement is completed, before combat**. Rebel must declare when Imperial ground units enter a system. | high |
| Imperial **loyalty** in the base's system | Base revealed. | high |
| Imperial ships only (incl. Death Star / DSUC) | **Not** revealed; Rebel gives no information. | high (RR; FAQ) |
| Probe cards | Never reveal the base; they only tell the Empire (secretly) where the base is *not*. "Long Range Probe" mission does not reveal it. | high |
| Rebel choice | Rebel may reveal voluntarily, only at the start of his own Command-Phase turn before using a leader (errata). | high |
| Effect of reveal | Probe card turned faceup onto Rebel Base space; all units/leaders on that space move into the base system; afterwards units cannot be deployed/moved to the Rebel Base space (they go to the base system instead); Rebel Base resource icons still usable unless Imperial unit or Imperial loyalty is in the base system. | high |

---

## 8. Open questions — owner should check against the physical board / Rules Reference

1. **Time-track icons**: exact recruit and build spaces (we have high-ish confidence only for recruit on 2–5 and build on 4). Needed for Refresh step 5.
2. **Mustafar–Utapau** adjacency: confirm the red no-travel stripe on the board (we encode NOT adjacent). Also eyeball all 69 edges once (fan data, though independently cross-checked).
3. **Rebel unit stats/capacities** (Corvette 2, Transport 4, Mon Cal 4; health/attack values) come from a fan project only — check the Rebel faction sheet.
4. **Region names**: none official found — confirm the board prints none; otherwise use neutral IDs R1–R8.
5. **Resource icons / build-queue numbers per system** (§1.7): Bothawui type conflict (ground-medium vs space-medium) and queue numbers differ between fan sources.
6. **Coruscant in standard setup**: may Imperial starting units be placed on Coruscant (it has printed permanent Imperial loyalty but receives no marker)? LTP first-game setup puts units there; RR wording says "systems that have an Imperial loyalty marker or subjugation marker".
7. **Activating a system that holds one's own leader**: RR says a system "that already contains a leader can be activated" without distinguishing owner — confirm intended for own leader (we read: allowed).
8. **Leaving a system that contains enemy units**: confirm there is no pinning rule (none found in RR).
9. **Recruitable leader names/spellings** and which leaders lack tactic values (cannot activate) — fan list only.
10. Check whether a **newer FAQ** than 18 May 2016 exists for the base game.
