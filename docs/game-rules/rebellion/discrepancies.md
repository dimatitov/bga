<!-- Generated from packages/games/rebellion/knowledge — do not edit; UPDATE_KB_DOCS=1 -->

# Star Wars: Rebellion — core-v1 audit and discrepancies

## Вывод аудита среза `core-v1` (SWR-005C, 2026-11-20)

Срез SWR-005 (`packages/games/rebellion/src/rules/core`, данные `src/scenario/core`) построчно сверен с Rules Reference,
Learn to Play (записи писались по зеркалу, пока CDN FFG отвечал 503; позже в тот же день официальный файл получен, QA подтвердил постраничную идентичность текста) и FAQ v2.1 (стр. 1–5, базовая игра).

- **Ошибок реализации в рамках среза не найдено.** Всё, что движок делает, совпадает с официальными правилами:
  порядок хода и пас (R-3, R-6), активация лидером из пула в любую систему (R-4), движение только в активированную систему
  из соседних, блокировка своим лидером, неподвижные юниты и транспорт (R-5), раскрытие базы имперскими наземными юнитами,
  но не кораблями и не Звездой Смерти (R-8), обе победы (R-9).
- **Осознанные отклонения среза:** движок сам выбирает систему базы и дополнительно исключает Ботави (R-10, D-4,
  DISC-007); клетка «Rebel Base» совмещена с системой базы (D-6, DISC-008); всегда расстановка первой партии (D-5,
  DISC-010); только стартовые лидеры (D-7, DISC-011); PASS запрещён во время своей активации — интерпретация, `needs-review`
  (DISC-012); транспорт считается в пределах одной команды MOVE_PIECES — ограничение UX, не правил (DISC-013).
- **Отсутствующие механики:** бой (D-1), миссии и фаза назначения (D-2), шаги обновления кроме возврата лидеров и времени
  (D-3, R-7), цели и репутация, лояльность и подчинение (D-5), добровольное раскрытие базы, ограничения компонентов.
- **Скрытый пробел (latent gap, DISC-009):** официально база раскрывается, как только у Империи **когда-либо** есть
  лояльность или наземные юниты в её системе (RR стр. 11). Движок проверяет это только в конце имперской активации системы
  базы. В срезе это эквивалентно, но перед добавлением лояльности, миссий с перемещением или развёртывания проверку нужно
  сделать постоянной.
- **Данные для сверки с коробкой (`verify-with-box`):** значения листа Повстанцев (вместимость, атака, здоровье —
  DISC-014), соседство Мустафар–Утапау и названия регионов (DISC-016), лидеры без тактических значений (Мон Мотма,
  DISC-017), позиции значков трека времени (DISC-018). Исправление данных не требует изменения кода правил.
- **SWR-006 (AI Commander v0)** на момент аудита не влита; она выбирает только среди `coreLegalActions` и правила нарушить
  не может. Поведение и тексты целей AI нужно сверить с этой базой отдельным пунктом после её влития.

## Summary

### By kind

| Kind | Count |
|---|---|
| intentional-deviation | 6 |
| missing-mechanic | 7 |
| latent-gap | 1 |
| data-uncertainty | 4 |
| bug | 0 |
| **total** | 18 |

### By severity

| Severity | Count |
|---|---|
| low | 9 |
| medium | 6 |
| high | 3 |
| **total** | 18 |

### By decision

| Decision | Count |
|---|---|
| accepted-for-slice | 12 |
| fix-later | 2 |
| verify-with-box | 4 |
| fixed | 0 |
| **total** | 18 |

## Items

### DISC-001 — No combat (D-1)

- **Kind:** missing-mechanic
- **Severity:** high
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:combat.trigger`, `rebellion:combat.steps`, `rebellion:combat.round`, `rebellion:command.move.combat-trigger`, `rebellion:command.activate.steps`
- **Engine behaviour:** D-1: MOVE_PIECES into a system with enemy units is accepted and nothing else happens; the system is shown as contested. No tactic cards, dice, damage, retreat or battle results (activation step 4 is skipped).
- **Official behaviour:** Moving units into a system with opposing units in the same theater starts a combat resolved in combat rounds with dice and tactic cards (RR p.2 step 4, RR p.4-5, LTP p.14-15).
- **Follow-up:** Combat slice: implement RR p.4-5 including retreat and winning a battle; replace the contested state.
- **Refs:** `rebellion:impl.no-combat`, RR p.4

### DISC-002 — No missions; Assignment Phase is empty (D-2, R-2)

- **Kind:** missing-mechanic
- **Severity:** high
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:assignment.order`, `rebellion:missions.reveal-steps`, `rebellion:missions.reveal-requirement`, `rebellion:command.unrevealed-missions-return`
- **Engine behaviour:** D-2: the Assignment Phase passes automatically with an event; a Command Phase turn is only ACTIVATE_SYSTEM or PASS; there is no opposition to missions.
- **Official behaviour:** Leaders are assigned to facedown missions (Rebels first), and a Command Phase turn may reveal a mission that can be opposed with dice (RR p.3, p.8-9, LTP p.6-8).
- **Follow-up:** Missions slice: hands, mission decks, starting missions, assignment, reveal and opposition; then mission effects (loyalty, capture, new base, projects).
- **Refs:** `rebellion:impl.no-missions`, RR p.8

### DISC-003 — Incomplete Refresh Phase (D-3, R-7)

- **Kind:** missing-mechanic
- **Severity:** high
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:refresh.steps`, `rebellion:refresh.draw-missions`, `rebellion:refresh.probe-droids`, `rebellion:refresh.draw-objective`, `rebellion:refresh.advance-time`, `rebellion:refresh.deploy-step`, `rebellion:build.build-units`, `rebellion:deploy.deploy-units`, `rebellion:recruit.procedure`
- **Engine behaviour:** R-7 / D-3: Refresh runs only step 1 (all leaders return, LEADERS_RETURNED) and the +1 time advance of step 5 (TIME_ADVANCED). No missions, probe cards, objectives, recruiting, building or deploying.
- **Official behaviour:** Six steps: retrieve leaders, draw missions, launch probe droids, draw objective, advance time with recruit/build icons, deploy from the build queue (RR p.12, LTP p.10).
- **Follow-up:** Refresh slice together with missions/objectives; needs the time track icon positions (DISC-018) and resource icon data.
- **Refs:** `rebellion:impl.refresh-partial`, RR p.12

### DISC-004 — No objectives; reputation never changes

- **Kind:** missing-mechanic
- **Severity:** medium
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:cards.objectives`, `rebellion:victory.reputation`, `rebellion:victory.rebels`
- **Engine behaviour:** Reputation stays at 14 for the whole game; the Rebel victory is reached only when time reaches 14.
- **Official behaviour:** The Rebels gain reputation from objective cards, moving the reputation marker toward the time marker (RR p.10, p.12; LTP p.11).
- **Follow-up:** Objectives slice (needs combat and Refresh step 4).
- **Refs:** `rebellion:impl.no-objectives`, RR p.10

### DISC-005 — No loyalty or subjugation (D-5, activation step 5)

- **Kind:** missing-mechanic
- **Severity:** medium
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:loyalty.basics`, `rebellion:loyalty.subjugation`, `rebellion:command.activate.steps`
- **Engine behaviour:** D-5: no loyalty or subjugation markers exist; activation step 5 is skipped; first game loyalty markers are not placed.
- **Official behaviour:** Systems carry loyalty markers; an Imperial ground unit in a system without Imperial loyalty subjugates it at the end of an activation (RR p.2 step 5, p.8, p.13; LTP p.13).
- **Follow-up:** Loyalty slice; it also feeds building, deployment and the permanent base reveal condition (DISC-009).
- **Refs:** `rebellion:impl.no-loyalty`, RR p.13

### DISC-006 — No voluntary base reveal (D-4)

- **Kind:** missing-mechanic
- **Severity:** low
- **Decision:** fix-later
- **Rules:** `rebellion:base.voluntary-reveal`
- **Engine behaviour:** D-4: the Rebel side has no command to reveal its base.
- **Official behaviour:** The Rebel player may reveal his base at the start of one of his Command Phase turns, before using a leader or passing (RR p.11; FAQ p.1 errata; not after passing, FAQ p.5).
- **Follow-up:** Add a REVEAL_BASE command legal only at the start of a Rebel turn (combat on reveal comes with the combat slice).
- **Refs:** `rebellion:impl.no-voluntary-reveal`, `rebellion:base.voluntary-reveal-timing`

### DISC-007 — The engine chooses the Rebel base (D-4, R-10)

- **Kind:** intentional-deviation
- **Severity:** medium
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:setup.base-choice`, `rebellion:base.secret-location`, `rebellion:setup.base-choice-restrictions`
- **Engine behaviour:** R-10 / D-4: the base system is chosen by an FNV-1a hash of the game id among eligible systems: not Coruscant, not the five removed first game probe cards, not in or next to a system with starting Imperial units, and additionally not Bothawui (starting Rebel units).
- **Official behaviour:** The Rebel player secretly chooses the base from the probe deck (RR p.15 step 9); in the first game it must not hold or be adjacent to Imperial units (LTP p.5). A system with starting Rebel units such as Bothawui is allowed.
- **Follow-up:** Let a human Rebel player choose the base during game setup; keep the Bothawui exclusion only while D-6 makes the base visible.
- **Refs:** `rebellion:impl.engine-chooses-base`, LTP p.5

### DISC-008 — The "Rebel Base" space is merged with the base system (D-6)

- **Kind:** intentional-deviation
- **Severity:** medium
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:base.space-not-system`, `rebellion:base.move-from-space`, `rebellion:base.activate-space`, `rebellion:base.leader-in-space-locks`
- **Engine behaviour:** D-6: units placed "on the base" stand in the base system (hidden from the Empire). Units there move like any others; a Rebel leader in the base system locks all of them; the space cannot be activated separately.
- **Official behaviour:** The "Rebel Base" space is not a system; units on it move to the base system or systems adjacent to it, the space can be activated from the base system or adjacent systems, and a leader on the space locks only the space (RR p.9-11, LTP p.12).
- **Follow-up:** Model the space as its own location once deployment and voluntary reveal exist; revisit the Bothawui exclusion of DISC-007.
- **Refs:** `rebellion:impl.base-space-merged`, `rebellion:base.units-on-space`

### DISC-009 — Base reveal checked only at the end of an Imperial activation (R-8, latent gap)

- **Kind:** latent-gap
- **Severity:** medium
- **Decision:** fix-later
- **Rules:** `rebellion:base.reveal-condition`, `rebellion:base.reveal-timing`
- **Engine behaviour:** R-8: the base is revealed at FINISH_ACTIVATION of an Imperial activation of the base system when an Imperial ground unit is there. Within core-v1 this is equivalent, because Imperial ground units can only arrive by such an activation and loyalty does not exist.
- **Official behaviour:** Whenever the Empire has loyalty or ground units in the base system, the base must be revealed ("ever", RR p.11; LTP p.12); after movement it happens before combat (RR p.2 step 3).
- **Follow-up:** Before adding loyalty, missions that move or place units, or deployment: make the reveal a state check run after every state change.
- **Refs:** `rebellion:impl.reveal-only-at-finish`, RR p.11

### DISC-010 — Fixed first game setup instead of standard setup (D-5, R-10)

- **Kind:** intentional-deviation
- **Severity:** low
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:setup.standard-loyalty`, `rebellion:setup.standard-imperial-units`, `rebellion:setup.standard-rebel-units`, `rebellion:setup.first-game-or-standard`
- **Engine behaviour:** D-5 / R-10: every game uses the LTP p.16 unit placement; loyalty markers, decks, action cards and the starting hand are not set up.
- **Official behaviour:** After the first game, step 8 uses random starting loyalty and free placement of starting units (RR p.15, LTP p.18).
- **Follow-up:** Standard setup as a game option after loyalty and missions exist.
- **Refs:** `rebellion:impl.fixed-first-game-setup`, RR p.15

### DISC-011 — Only starting leaders; no Super Star Destroyer in play (D-7)

- **Kind:** intentional-deviation
- **Severity:** low
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:leaders.starting`, `rebellion:recruit.procedure`
- **Engine behaviour:** D-7: only the four starting leaders per side exist; recruitable leaders, action cards and the Super Star Destroyer never enter play.
- **Official behaviour:** Leaders are recruited at recruit icons of the time track (RR p.11-12); further units come from building (RR p.3).
- **Follow-up:** Comes with the Refresh slice (recruiting) and building.
- **Refs:** `rebellion:impl.starting-leaders-only`, RR p.11

### DISC-012 — PASS is rejected during an own activation (interpretation, R-6)

- **Kind:** intentional-deviation
- **Severity:** low
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:command.pass`
- **Engine behaviour:** R-6: PASS while the actor's activation is running returns activationInProgress; the player must FINISH_ACTIVATION first and may pass on a later turn.
- **Official behaviour:** RR p.6 lets a player pass "at any time during the Command Phase"; FAQ p.5 says a player passes instead of taking his turn. The engine follows the reading that a started activation is the turn.
- **Follow-up:** Keep unless a ruling says otherwise; the entry is marked needs-review.
- **Refs:** `rebellion:command.pass-not-mid-activation`, `rebellion:impl.pass-during-activation`

### DISC-013 — Transport capacity is checked within one MOVE_PIECES command (R-5, UX limit)

- **Kind:** intentional-deviation
- **Severity:** low
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:command.transport.capacity`, `rebellion:command.transport.restriction-icon`
- **Engine behaviour:** R-5: one MOVE_PIECES moves units from one source system; only ships moving in the same command provide capacity, so carried units must move together with their carriers.
- **Official behaviour:** Each moving ship brings ground units and TIE Fighters from its system up to its capacity; restricted units move only when carriers leave the same system (RR p.9, p.14). The rules do not split movement into commands.
- **Follow-up:** UX only, no rules change needed: the UI and the AI must send carriers and their cargo in one command; reconsider if moves from one system are ever split into several steps.
- **Refs:** `rebellion:impl.transport-one-source-per-command`, RR p.9

### DISC-014 — Rebel faction sheet values are unconfirmed

- **Kind:** data-uncertainty
- **Severity:** medium
- **Decision:** verify-with-box
- **Rules:** `rebellion:command.transport.capacity`, `rebellion:units.attack-health`
- **Engine behaviour:** core-v1 data uses capacities Corellian Corvette 2, Rebel Transport 4, Mon Calamari Cruiser 4 (and no attack/health) taken from a fan data set; Imperial values were read from the faction sheet illustration.
- **Official behaviour:** Capacity, attack and health are printed on the faction sheets (RR p.3, p.8, p.14); the Rebel sheet values are not in the rules text.
- **Follow-up:** Product owner checks the Rebel faction sheet; correct the data in src/scenario/core/catalog.ts if different (no rules code change).
- **Refs:** `rebellion:units.faction-sheet-values`, RR p.14

### DISC-015 — Component limitations are not modelled (n/a in the slice)

- **Kind:** missing-mechanic
- **Severity:** low
- **Decision:** accepted-for-slice
- **Rules:** `rebellion:general.component-limits`
- **Engine behaviour:** No unit, leader or marker is ever created, so limits cannot be reached and are not checked.
- **Official behaviour:** Units, leaders and rings are limited to the box contents; dice are capped at five per colour; markers are unlimited (RR p.6).
- **Follow-up:** Enforce unit limits together with building (Refresh slice) and dice caps with combat.
- **Refs:** `rebellion:impl.component-limits`, RR p.6

### DISC-016 — Map data: Mustafar–Utapau adjacency and region names unconfirmed

- **Kind:** data-uncertainty
- **Severity:** low
- **Decision:** verify-with-box
- **Rules:** `rebellion:command.move.adjacency`, `rebellion:map.regions`
- **Engine behaviour:** core-v1 treats Mustafar and Utapau as not adjacent and uses region ids r1..r8 with unofficial labels; the 69 adjacency edges come from cross-checked fan data.
- **Official behaviour:** Adjacency is defined by shared borders and impassable areas on the board (RR p.9, p.12); the rules give no region names.
- **Follow-up:** Product owner checks the Mustafar–Utapau border and whether the board prints region names; data fix only.
- **Refs:** `rebellion:map.mustafar-utapau`, `rebellion:map.region-names`

### DISC-017 — Leader data: which leaders lack tactic values

- **Kind:** data-uncertainty
- **Severity:** low
- **Decision:** verify-with-box
- **Rules:** `rebellion:command.activate.tactic-values-required`
- **Engine behaviour:** core-v1 marks Mon Mothma as the only starting leader that cannot activate (canActivate false), from fan data.
- **Official behaviour:** A leader without tactic values cannot activate a system (RR p.2, p.9); tactic values are printed on the leader tokens.
- **Follow-up:** Product owner checks the starting leader tokens (and later the recruitable ones).
- **Refs:** `rebellion:leaders.mon-mothma-no-tactics`, RR p.2

### DISC-018 — Time track recruit/build icon positions unknown

- **Kind:** data-uncertainty
- **Severity:** low
- **Decision:** verify-with-box
- **Rules:** `rebellion:refresh.advance-time`
- **Engine behaviour:** core-v1 does not use the icons (no recruiting or building); the positions are known only with low confidence.
- **Official behaviour:** Recruit and build happen when the time marker enters a space showing those icons (RR p.12, LTP p.10).
- **Follow-up:** Read the icon positions from the board before the Refresh slice.
- **Refs:** `rebellion:refresh.time-track-icons`, LTP p.10
