# Test cases — SWR-005

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-08).
**Ревизия 2** — приведено к замороженной спецификации (Rules ревизия 2, D-1..D-7, Clarifications, Data clarifications),
`docs/game-rules/rebellion-reference.md`, `implementation-plan.md`, `plan-backend.md`, `plan-frontend.md` §9–§10.
Это **дизайн**: тесты ещё не написаны и не запускались; ничто здесь не является доказательством `passed`.
**Приоритет источников при расхождении** (как в `implementation-plan.md`): `specification.md` (Rules ревизия 2 +
Clarifications + Data clarifications) → `implementation-plan.md` → планы лидов. Там, где `plan-backend.md` ещё содержит
устаревший текст (`consecutivePasses`, `systemHasOwnLeader`, раскрытие при `MOVE_PIECES`, победа «нужен наземный юнит»,
база скрыта после конца партии), ожидания тест-кейсов следуют спецификации (см. Q-36).

## Изменения ревизии 2 (кратко)

- Пас **постоянный до конца фазы приказов** (`passed: {rebels, empire}`): спасовавшая сторона больше не ходит, другая ходит
  подряд; фаза кончается, когда спасовали обе. Переписаны TC-U-07..U-12, добавлены TC-U-12a/12b; TC-AI, TC-HS, TC-G — по новой очерёдности.
- Ключ `systemHasOwnLeader` **не вводится**: активация системы со своим лидером легальна (TC-U-26 заменён, TC-U-31 обновлён).
- Новый ключ `leaderCannotActivate` (Мон Мотма, `canActivate:false`) — TC-U-26a, TC-U-11, порядок проверок TC-U-30a.
- Раскрытие базы — только **наземные** юниты Империи, проверка при `FINISH_ACTIVATION` Империи (TC-U-57..U-59 переписаны, U-57a/b новые).
- Победа Империи: база раскрыта + ≥1 любой юнит Империи + **ни одного** юнита Повстанцев (TC-U-60..U-64 переписаны, U-64a новый).
- После `outcome` база видна всем (TC-U-69, TC-H-18).
- Данные — конкретные числа справочника: 32 системы, 8 регионов `r1..r8` по 4, **69 рёбер**, Мустафар–Утапау не соседние,
  8 удалённых, 18 типов юнитов с вместимостями, 4+4 стартовых лидера, расстановка первой партии, репутация 14, кандидаты базы по R-10.
- handoff-view += `rulesEngine` (8 ключей); `details` += `rulesEngine`, `winner`, `reputation`.
- testids — по `plan-frontend.md` §9 (TR-1 заменён); имена скриншотов — по `plan-frontend.md` §10.
- Все Q-1..Q-34 закрыты ссылками на Clarifications; новые открытые вопросы — Q-35..Q-41. (Q-35..Q-41 закрыты Analyst позже — см. «Ambiguities».)
- Заменённые кейсы помечены «**[заменён rev2]**» с указанием замены; id не переиспользуются.

## Preconditions (общие)

- Базовая линия SWR-004 (зелёная, `docs/tasks/SWR-004/delivery-report.md` → Verification): process 357, platform 64,
  rebellion 201, forbidden-stars 5, web 255, api 181 (+1 opt-in dev-DB), **e2e 75**. Регрессия сохранена, если наборы не
  теряют кейсов, кроме явно заменённых; таблица замен «старый TC → новый» обязательна в `qa-results.md` (Clarifications Q-1).
- Генерические e2e/integration о доске (выделение, zoom/pan, клавиатура, board-view, persistence, hot-seat, скриншоты)
  **переписываются на `core-v1`**; mock-поведение сохраняется меньшим регрессионным набором на **засеянных** `mock-v1` строках
  (integration — `createSwr004Db`, W6a; e2e — сидирование e2e-БД v2-строками до старта сервера, QA, TR-4) (Q-1).
- unit: Vitest в `packages/games/rebellion/test/**`, `packages/platform/test/**`, без React/Nest. Состояния строятся тестовым
  конструктором (TR-2), а не только скриптом от начала партии.
- integration: Vitest + supertest, реальный Nest (`createApp`), отдельная копия SQLite на тест (`apps/api/test/support/test-app.ts`).
- component: Vitest + Testing Library (jsdom), `renderWithProviders`, `mockFetch`; Konva — через чистые `sceneModel`.
- e2e: `pnpm e2e`, api :3100 (`e2e-serve.mjs`, чистая БД + seed по TR-4), web :5174 (`VITE_E2E=1`), `workers: 1`,
  `00-empty-db.spec.ts` первым. Скриншоты — в `docs/tasks/SWR-005/artifacts/screenshots/` (TC-A-07). Текст фазы
  `command` — «Приказы» везде, включая старые партии и заслонку (Q-FE-8): e2e с проверкой текста обновляются.

## Conventions

**Уровни (Level):** `unit`, `component` (web, jsdom), `integration` (API, Nest + SQLite), `e2e` (Playwright),
`visual-a11y` (Playwright-скриншоты + фокус/контраст/роли), `manual` (встроенный браузер, skill `browser-qa`, скриншот
как доказательство), `arch` (ESLint/grep/check:bundle/ревью документа), `gate` (корневая команда).

**Обозначения:**
- `R` = `'star-wars-rebellion'`; `REB` = `'rebels'`, `EMP` = `'empire'`; `CORE` = `rulesEngine:'core-v1'`, `MOCK` = `'mock-v1'`.
- `S0(sid)` = начальное состояние `core-v1` для `sessionId = sid` (при фиксированном `now`); `BASE(s)` = система базы.
- `ADJ(x)` = соседи по данным; `CAP(t)` = `transportCapacity`; `TIME` = `round` = `markers.time`; `REP` = `markers.reputation`.
- Лидеры: `palpatine, vader, tarkin, tagge` (EMP), `mon-mothma, leia, dodonna, rieekan` (REB) — точные id задаёт W2 (`core-ids.ts`).
  `MM` = Мон Мотма (`canActivate:false`).
- Типы: `SD` Звёздный разрушитель (6), `AC` Ударный авианосец (4), `SSD` (8), `DS` Звезда Смерти (8, подвижна), `DSUC`
  строящаяся ЗС (неподвижна, 0), `TIE` (0, требует места), `ST`/`ATST`/`ATAT` (наземные, требуют места);
  `CC` Кореллианский корвет (2), `TR` Транспорт (4), `MC` Мон-Каламари (4), `XW`/`YW` (0, места не требуют),
  `RT` пехота, `AS` спидер (наземные, требуют места), `SG`/`IC` сооружения (неподвижны).
- `cmd(actor, type, payload)` = `CommandEnvelope { actor, expectedVersion: <текущая>, command: { type, ...payload } }`.
- `err422(key)` = HTTP 422 `{ ok:false, error:{ code:'ILLEGAL_COMMAND', messageKey:'errors.<key>', details? } }` (на уровне unit —
  `Result` с тем же `messageKey`). «Без изменений» = state, `version`, число событий журнала и строка БД побайтно не изменились.
- `AI_REB` = AI-партия, игрок REB (AI — Империя); `AI_EMP` = игрок EMP (AI — Повстанцы); `HS` = hot-seat.
- Порядок проверок `core-v1` (plan-backend BD-7/§3.3 + Clarifications): 400 схема → 422 `gameOver` → 409 → 422
  `commandUnavailable` → `notYourSide` → `notYourTurn` → hot-seat (`handoffNotAvailable`/`handoffPending`) → `wrongPhase` → проверки команды.
  `ACTIVATE_SYSTEM`: `activationInProgress` → `unknownLeader` → `leaderNotInPool` → `leaderCannotActivate` → `unknownSystem`.
  `MOVE_PIECES`: `noActivation` → `unknownSystem` → `notActivatedSystem` → `sameSystem` → `notAdjacent` → `pinnedByLeader` →
  по каждому юниту `unknownPiece` → `notOwner` → `notInFromSystem` → `immobileUnit` → `insufficientCapacity`.
- **Empire-facing payload** = любой JSON, который может получить EMP: `view` (`viewer:'empire'`), ответ команды (view + события),
  журнал, `legalActions`, `GET /api/sessions` (`details`), handoff-view, тело ошибки, ответ `POST /api/sessions` для AI_EMP,
  вход AI-политики для AI-Империи, серверные логи на время EMP-запросов (Q-17).
- **Сканер базы `scanForBase(json, baseId)`** (TR-3): обход JSON с путями; id базы и `systems.<baseId>` допустимы **только**
  в `view.map.systems[*]` (статический каталог) и в `ACTIVATE_SYSTEM.systemIds` (= все 32 системы); в любом другом месте —
  провал с путём. Не применяется после `BASE_REVEALED` или `outcome`.

## Test cases

### 1. Данные базовой игры и стартовая позиция (AC-01, AC-02, R-10, D-5..D-7)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-D-01 | AC-01 | unit | positive | — | `CoreDataSchema.parse(coreDataBaseV1)` | успешно; ровно **32** системы; id уникальны, kebab-case англ. названия (`mon-calamari`, `cato-neimoidia`, …); совпадают с `CORE_SYSTEM_IDS` (`core-ids.ts`) |
| TC-D-02 | AC-01 | unit | positive | — | регионы | ровно **8** регионов `r1..r8`; в каждом ровно **4** системы; каждая система ровно в одном регионе; состав регионов = справочник §1.3 (снимок) |
| TC-D-03 | AC-01 | unit | positive | — | соседство | симметрично; без петель и дублей; ссылки существуют; число неориентированных рёбер = **69**; множество рёбер = справочник §1.5/§1.6 (снимок списка); `mustafar`–`utapau` **не** соседние |
| TC-D-04 | AC-01 | unit | positive | — | граф (BFS) | связный: все 32 достижимы от любой системы |
| TC-D-05 | AC-01 | unit | negative | копия данных с поломкой | (a) удалить обратное ребро; (b) сосед — несуществующая система; (c) регион — несуществующий; (d) дубль id; (e) петля; (f) `typeKey` с префиксом не своей стороны; (g) стартовый юнит Повстанцев с `kind:'rebelBase'` у Империи; (h) кандидат базы = система со стартовыми юнитами Империи; (i) `startingTime ≥ startingReputation` | `integrity` **падает** для каждого случая с понятным сообщением (валидатор реально ловит ошибку) |
| TC-D-06 | AC-01 | unit | positive | — | флаг `remote` | ровно 8 удалённых: Дагоба, Дантуин, Датомир, Эндор, Хот, Илум, Татуин, Явин; у остальных 24 — `false` (Q-33: только отображается) |
| TC-D-07 | AC-01, AC-12 | unit | positive | — | `./board` `coreMapLayout` vs каталог | координаты ровно для 32 id (без лишних/недостающих); попарное расстояние центров ≥ минимального; все в `CORE_MAP_BOUNDS`; позиции подписей/контуров для `r1..r8`; модуль не импортирует `./scenario` |
| TC-D-08 | AC-01, AC-12 | unit | positive | — | i18n ru/en (`rebellion.data`, `rebellion.map`): `systems.<id>`, `regions.<id>`, `pieceTypes.<typeKey>`, `leaders.<id>` по `core-ids.ts` | ключ есть в обеих локалях для **каждого** id; en без кириллицы; ru не пуст и ≠ id; подписи регионов помечены как неофициальные (комментарий/док) (Q-FE-9) |
| TC-D-09 | AC-02 | unit | positive | — | каталог типов | ровно **18** типов (9 EMP, 9 REB, вкл. SSD); `transportCapacity`: SD 6, AC 4, SSD 8, DS 8, CC 2, TR 4, MC 4, остальные 0; `requiresTransport=true` у всех наземных обеих сторон и TIE; `false` у XW, YW и кораблей; `mobility:'immobile'` ровно у SG, IC, DSUC; DS подвижна; арена: наземные `ground`, прочие `space` |
| TC-D-10 | AC-02, D-7 | unit | positive | — | лидеры | стартовый пул EMP = {Палпатин, Вейдер, Таркин, Тагге}, REB = {Мон Мотма, Лея, Додонна, Рикан}; `canActivate:false` только у Мон Мотмы; вербуемые лидеры (если есть в каталоге) в state партии не попадают |
| TC-D-11 | AC-02, R-10, D-5, D-6 | unit | positive | `S0` | стартовые юниты | точно по справочнику §4.2: Ботави — CC, TR, XW, YW, 3 RT, AS; база — XW, YW, 3 RT, AS (в state — с `systemId = BASE`, D-6); Салеуками — SD, 2 TIE, 2 ST, ATST; Мандалор — DS, 4 TIE, 2 ST, ATST; Корусант — SD, AC, 2 TIE, 3 ST, ATAT, ATST; Кореллия — AC, ST; Салласт — SD, 2 TIE, 2 ST, ATST; Мустафар — AC, 2 TIE, 2 ST, ATST. Итого EMP: 3 SD, 3 AC, 12 TIE, 12 ST, 5 ATST, 1 ATAT, 1 DS; маркеров лояльности нет |
| TC-D-12 | AC-02, R-10 | unit | positive | — | `S0('sid-A', now)` дважды; `JSON.stringify` | побайтно равны при одинаковых `sessionId` **и** `now` (Q-24); id юнитов `u-01..u-NN` в порядке `startSetup.units`, **не зависят от базы** |
| TC-D-13 | AC-02, R-10 | unit | boundary | — | `rebelBaseCandidates` | = все системы, кроме Корусанта, Кореллии, Мандалора, Салеуками, Салласта, Мустафара и систем, соседних с системами стартовых юнитов Империи; непуст; удалённые допустимы; Ботави включён тогда и только тогда, когда не соседствует с юнитами Империи; список вычислен из данных (не захардкожен отдельно) — сверка со снимком |
| TC-D-14 | AC-02, R-10 | unit | boundary | — | `S0` для 200 разных `sessionId` (детерминированный список) | `BASE ∈ candidates` всегда; встречается > 1 различной базы; `chooseRebelBase` = `fnv1a32(sessionId) % n` по отсортированным кандидатам — golden 5 пар `sessionId → systemId` |
| TC-D-15 | AC-02, R-8 | unit | negative | — | для каждого кандидата | в `S0` в системе базы и в соседних с ней системах **нет** юнитов Империи; `rebelBase.revealed=false` |
| TC-D-16 | AC-02 | unit | boundary | — | `sessionId`: очень длинный, unicode, два id с разницей в один символ | `chooseRebelBase` детерминирована, не бросает; результат ∈ кандидатам (пустой — 400 раньше, вне функции) |
| TC-D-17 | AC-02 | unit | positive | — | файлы данных | шапка каждого файла `src/scenario/core/*` ссылается на `docs/game-rules/rebellion-reference.md` (раздел); значения с низкой уверенностью помечены `// confidence: low` (наличие проверяется, сверка — TC-A-10) |
| TC-D-18 | AC-02 | unit | positive | `S0` | маркеры | `round = 1`, `reputation = 14` (R-1) |

### 2. Правила `core-v1` — раунд, фазы, очередь (AC-03, AC-06, R-1, R-2, R-3, R-6, R-7)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-U-01 | AC-03, R-1 | unit | positive | — | `S0(sid)` (HS) | `rulesEngine:'core-v1'`, `schemaVersion:3`, `round=1`, `reputation=14`, `phase:'command'`, `activeSide:'rebels'`, `passed={rebels:false, empire:false}`, `activation=null`, пулы = 4+4, лидеров на карте нет, `outcome=null`, `version=1` |
| TC-U-02 | AC-03, R-2 | unit | positive | — | журнал `S0` | `GAME_CREATED` → `PHASE_STARTED{1,'assignment'}` (system) → `PHASE_STARTED{1,'command'}` (system), в этом порядке |
| TC-U-03 | AC-03 | unit | negative | `S0` | `ADVANCE_PHASE`(REB), `END_TURN`(REB) | `err422(commandUnavailable)` `{actor, type}` (Q-2); без изменений |
| TC-U-04 | AC-03, R-1 | unit | negative | любые скрипты | все команды | `reputation` никогда не меняется; `round` меняется только в обновлении |
| TC-U-05 | AC-06, R-3 | unit | positive | HS `S0` | `ACTIVATE_SYSTEM`(REB) → `FINISH_ACTIVATION`(REB) | `activeSide='empire'`, `handoffPending=true`; события `SYSTEM_ACTIVATED`, `ACTIVATION_FINISHED{auto:false}` |
| TC-U-06 | AC-06, R-3, R-6 | unit | positive | HS `S0` | `PASS`(REB) | `PASSED{auto:false}` actor REB; `passed.rebels=true`; `activeSide='empire'`, `handoffPending=true`; фаза продолжается |
| TC-U-07 | AC-06, R-6 | unit | positive | HS | `PASS`(REB) → ACCEPT(EMP) → `PASS`(EMP) | обе спасовали → в той же команде: `PHASE_STARTED{1,'refresh'}` → `LEADERS_RETURNED` → `TIME_ADVANCED{1→2}` → `PHASE_STARTED{2,'assignment'}` → `PHASE_STARTED{2,'command'}`; `round=2`, `activeSide='rebels'`, `passed` сброшен; `version` +1 на команду (одна) |
| TC-U-08 | AC-06, R-6 | unit | boundary | HS | `PASS`(REB) → ACCEPT(EMP) → `ACTIVATE+FINISH`(EMP) → `ACTIVATE+FINISH`(EMP) → `PASS`(EMP) | после каждого `FINISH_ACTIVATION` EMP ход **остаётся** у EMP (REB спасовали), `handoffPending=false`; фаза кончается только на `PASS`(EMP) |
| TC-U-09 | AC-06, R-6 | unit | boundary | HS | `ACTIVATE+FINISH`(REB) → `PASS`(EMP) → `ACTIVATE+FINISH`(REB) ×2 → `PASS`(REB) | после `PASS`(EMP) REB ходят подряд; после 3-й активации REB в пуле только `MM` → `legalActions` REB = только `PASS`; фаза кончается на `PASS`(REB) |
| TC-U-10 | AC-06, R-6 | unit | negative | `passed.rebels=true`, ход EMP | любая команда REB (`ACTIVATE_SYSTEM`, `PASS`, `FINISH_ACTIVATION`) | `err422(notYourTurn)`; без изменений; у REB нет `legalActions` до конца фазы (`PASS` при `passed[actor]` недостижим) |
| TC-U-11 | AC-04, AC-06, R-6 | unit | boundary | REB: в пуле только `MM` | `legalActions` REB; `ACTIVATE_SYSTEM{MM, X}` | только `PASS` (нет `ACTIVATE_SYSTEM` или `leaderIds=[]` — по контракту §3.5, `MM` не включается); команда → `err422(leaderCannotActivate)` |
| TC-U-12 | AC-06, R-6 | unit | boundary | пулы обеих сторон без активирующих лидеров | очередь | обе только пасуют; фаза кончается за 2 паса |
| TC-U-12a | AC-06, R-6 | unit | boundary | HS, свежий раунд | максимальная длина фазы (все активации обеих сторон + 2 паса) | не более 3 (REB) + 4 (EMP) активаций + 2 паса; цикла нет; после завершения — раунд +1 |
| TC-U-12b | AC-06, R-6 | unit | positive | HS, `passed.empire=true`, ход REB | `PASS`(REB) | фаза кончается сразу (обе `true`), обновление в той же команде |
| TC-U-13 | AC-06, R-7, D-3 | unit | positive | лидеры на карте у обеих сторон (в т.ч. в `BASE`) | конец фазы | все 8 лидеров в пулах (`systemId:null`), `LEADERS_RETURNED{leaderIds}` в порядке `state.leaders`; `activation=null`; `passed` сброшен; `round+1` ровно на 1; юниты не тронуты (шаги 2–4, 6 вне среза) |
| TC-U-14 | AC-06, R-3 | unit | positive | новый раунд (последний пас — любой стороны) | первый ход | всегда Повстанцы (Q-5) |
| TC-U-15 | AC-06 | unit | negative | `S0` (ход REB) | `PASS`(EMP); `FINISH_ACTIVATION`(EMP) | `err422(notYourTurn)`; без изменений |
| TC-U-16 | AC-06 | unit | negative | идёт активация REB | `PASS`(REB) | `err422(activationInProgress)` |
| TC-U-17 | AC-06 | unit | negative | ход REB, активации нет | `FINISH_ACTIVATION`(REB) | `err422(noActivation)` |
| TC-U-18 | AC-06 | unit | positive | — | `ACTIVATE` → `FINISH_ACTIVATION` без перемещений | легально; лидер остаётся в системе до обновления |
| TC-U-19 | AC-03 | unit | negative | синтетический state с `phase:'assignment'`/`'refresh'` без `outcome` (только конструктор) | любая команда | `err422(wrongPhase)` (в сохранённом state недостижимо — Q-6) |
| TC-U-20 | AC-06, AC-14 | unit | positive | после каждой успешной команды скриптов §9 | инварианты (`coreInvariants`) | каждый лидер ровно в одном месте; число юнитов каждой стороны неизменно (боя нет); `version` +1 на каждую команду движка; ≤1 активации и она у `activeSide`; `round` монотонен; `outcome===null ⇒ phase==='command'`; `outcome ⇒ activation=null ∧ handoffPending=false` |

### 3. Активация `ACTIVATE_SYSTEM` (AC-04, R-4)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-U-21 | AC-04 | unit | positive | ход REB, `leia` в пуле | `ACTIVATE_SYSTEM{leia, X}` для X = обычная, удалённая, с юнитами EMP, с лидером EMP, с лидером REB | успех; `leia.systemId = X`; `activation={rebels, leia, X}`; `SYSTEM_ACTIVATED{leaderId, systemId}` |
| TC-U-22 | AC-04 | unit | negative | ход REB | `actor:EMP` (HS) | `err422(notYourTurn)` |
| TC-U-23 | AC-04 | unit | negative | `leia` уже на карте | `ACTIVATE_SYSTEM{leia, Y}` | `err422(leaderNotInPool)` `{leaderId}` |
| TC-U-24 | AC-04 | unit | negative | ход REB | `leaderId = vader` (в пуле EMP) | `err422(leaderNotInPool)` (Q-4) |
| TC-U-25 | AC-04 | unit | negative | ход REB | `leaderId:'nobody'`; `systemId:'nowhere'`; пустые строки | `unknownLeader`; `unknownSystem`; пустые → 400 `VALIDATION` (Q-4) |
| TC-U-26 | AC-04 | unit | — | — | **[заменён rev2 → TC-U-26b]** «система со своим лидером → `systemHasOwnLeader`»: ключ не вводится (Q-BE-3) | — |
| TC-U-26a | AC-04, R-4 | unit | negative | ход REB, `MM` в пуле | `ACTIVATE_SYSTEM{MM, X}` | `err422(leaderCannotActivate)` `{leaderId}`; без изменений |
| TC-U-26b | AC-04, R-4 | unit | positive | в X уже стоит лидер REB (прошлая активация раунда) | `ACTIVATE_SYSTEM{dodonna, X}` | **легально**; в X два лидера REB; активированная система = X |
| TC-U-27 | AC-04 | unit | positive | в X стоит лидер EMP | REB активирует X | легально |
| TC-U-28 | AC-04 | unit | negative | REB уже активировал в этом ходу | второй `ACTIVATE_SYSTEM` | `err422(activationInProgress)` |
| TC-U-29 | AC-04 | unit | negative | HS, `handoffPending=true` | `ACTIVATE_SYSTEM` новой активной стороной до `ACCEPT_HANDOFF` | `err422(handoffPending)`; без изменений |
| TC-U-30 | AC-04 | unit | negative | каждая ошибка TC-U-22..29, 26a | state после | **без изменений** (общий хелпер `expectRejectedUnchanged`) |
| TC-U-30a | AC-04 | unit | boundary | порядок | (a) активация идёт + `unknownLeader` → `activationInProgress`; (b) `unknownLeader` + `unknownSystem` → `unknownLeader`; (c) лидер EMP + `unknownSystem` → `leaderNotInPool`; (d) `MM` + `unknownSystem` → `leaderCannotActivate` | ключи строго по порядку Data clarifications «BE-корректировка» |
| TC-U-31 | AC-04, AC-14 | unit | positive | ход REB без активации | `legalActions` | `ACTIVATE_SYSTEM{leaderIds, systemIds}`: `leaderIds` = лидеры пула REB с `canActivate` (без `MM`, без лидеров на карте); `systemIds` = **все 32** системы (Q-BE-3); + `PASS`; во время активации — нет `ACTIVATE_SYSTEM`/`PASS` |

### 4. Перемещение `MOVE_PIECES` (AC-05, R-5)

Обозначения: активированная система `A`; `F ∈ ADJ(A)`; `N ∉ ADJ(A)`.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-U-32 | AC-05 | unit | positive | активация REB в A | `MOVE_PIECES{[XW], F, A}` | юнит в A; `PIECES_MOVED`; активация продолжается |
| TC-U-33 | AC-05 | unit | positive | в A уже перемещались | второй `MOVE_PIECES` из `F2 ∈ ADJ(A)` | легально (из нескольких систем) |
| TC-U-34 | AC-05 | unit | negative | активации нет | `MOVE_PIECES` | `err422(noActivation)` |
| TC-U-35 | AC-05 | unit | negative | активация в A | `toSystemId = F2 ≠ A` | `err422(notActivatedSystem)` `{toSystemId}` |
| TC-U-36 | AC-05 | unit | negative | активация в A | `fromSystemId = N` | `err422(notAdjacent)` `{fromSystemId, toSystemId}` |
| TC-U-37 | AC-05 | unit | negative | активация в A | `fromSystemId = A` | `err422(sameSystem)` (до соседства, Q-7) |
| TC-U-38 | AC-05 | unit | negative | в F стоит лидер REB | двигать юниты REB из F | `err422(pinnedByLeader)` `{fromSystemId}` |
| TC-U-39 | AC-05 | unit | positive | в F стоит лидер **EMP** | REB двигает из F | легально |
| TC-U-40 | AC-05 | unit | negative | REB активировал A (лидер остался), в следующем ходу активирует A2 ∈ ADJ(A) | двигать из A | `err422(pinnedByLeader)` |
| TC-U-41 | AC-05 | unit | negative | в F стоят SG/IC REB (конструктор); DSUC EMP | двигать их | `err422(immobileUnit)` `{pieceId}` для каждого |
| TC-U-42 | AC-05 | unit | boundary | F: SD + 6 из {ST, ATST, TIE} | двигать SD + 6 | легально (ровно по вместимости 6) |
| TC-U-43 | AC-05 | unit | boundary | F: SD + 7 требующих места | двигать SD + 7 | `err422(insufficientCapacity)` `{fromSystemId, required:7, available:6}`; ничего не сдвинулось |
| TC-U-44 | AC-05 | unit | negative | F: SD и ST | двигать **только** ST (SD остаётся) | `err422(insufficientCapacity)` (`available:0`) |
| TC-U-45 | AC-05 | unit | boundary | F: SD (6) + AC (4) | оба + 10 требующих места → легально; + 11 → `insufficientCapacity` | вместимость суммируется по кораблям этой команды |
| TC-U-46 | AC-05 | unit | boundary | F: AC (4) + 2 ST + 2 TIE; затем AC + 3 ST + 2 TIE | общий лимит мест (Q-8) | 4 места → легально; 5 → `insufficientCapacity` |
| TC-U-46a | AC-05 | unit | boundary | REB: CC (2) + 2 RT → легально; CC + 2 RT + AS → `insufficientCapacity`; TR (4) + 3 RT + AS → легально | вместимости CC 2, TR 4 | по каталогу |
| TC-U-46b | AC-05 | unit | positive | F: XW, YW без кораблей | двигать XW + YW | легально (места не требуют) |
| TC-U-46c | AC-05 | unit | negative | F: только TIE | двигать TIE | `err422(insufficientCapacity)` (TIE требует места) |
| TC-U-46d | AC-05 | unit | positive | F: DS + 8 ST/TIE | двигать | легально (DS подвижна, `CAP=8`) |
| TC-U-47 | AC-05 | unit | positive | — | двигать только корабли (`CAP` любой) | легально |
| TC-U-47a | AC-05 | unit | boundary | корабль с вместимостью уже прибыл в A ранее | двигать ST из F без корабля | `insufficientCapacity` (прибывшие корабли вместимость не дают) |
| TC-U-48 | AC-05 | unit | negative | «всё или ничего» | `pieceIds` = 2 легальных + 1 нелегальный (чужой / сооружение / из другой системы / сверх вместимости) | отказ; **ни один** юнит не сдвинулся; без изменений |
| TC-U-49 | AC-05 | unit | negative | — | `pieceIds` с юнитом EMP | `err422(notOwner)` |
| TC-U-50 | AC-05 | unit | negative | — | юнит не в `from`; несуществующий юнит; несуществующие `from`/`to` | `notInFromSystem`; `unknownPiece`; `unknownSystem` |
| TC-U-51 | AC-05 | unit | negative | — | `pieceIds: []`; `[p, p]` | 400 `VALIDATION` (Q-9) |
| TC-U-52 | AC-05, D-1 | unit | positive | в A есть юниты EMP | REB перемещает в A | легально; A ∈ `contestedSystemIds` (обе стороны); юниты EMP не тронуты, боя нет |
| TC-U-53 | AC-05, D-6 | unit | positive | `BASE ∈ ADJ(A)`, CC в базе (пришёл ранее) + RT | REB двигает CC + RT из базы в A | легально по тем же правилам (`fromSystemId = BASE`) |
| TC-U-54 | AC-05, AC-14 | unit | positive | активация REB в A | `legalActions` | по одному `MOVE_PIECES{fromSystemId, toSystemId:A, pieces[{pieceId, transportCapacity, requiresTransport}]}` на каждую `F ∈ ADJ(A)` без своего лидера с ≥1 подвижным своим юнитом; юниты `requiresTransport` включены, только если в той же системе есть свой корабль с `CAP>0`; + `FINISH_ACTIVATION`; порядок детерминирован (порядок `map`/`units`) |
| TC-U-55 | AC-05 | unit | negative | каждая ошибка TC-U-34..51 | state после | без изменений |
| TC-U-56 | AC-05 | unit | boundary | порядок | (a) `notActivatedSystem` + `notAdjacent` → `notActivatedSystem`; (b) `pinnedByLeader` + чужой юнит → `pinnedByLeader`; (c) в одном запросе `[чужой, неподвижный]` → `notOwner` (первый по порядку); (d) чужой юнит не в `from` → `notOwner` (owner раньше местоположения) | ключи строго по порядку Conventions |

### 5. Раскрытие базы и конец партии (AC-07, AC-10, R-8, R-9)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-U-57 | AC-10, R-8 | unit | positive | `BASE ∈ ADJ(F)`, в F у EMP AC + ST; в базе юниты REB | EMP активирует `BASE`, `MOVE_PIECES{[AC, ST], F, BASE}`, затем `FINISH_ACTIVATION` | после `MOVE_PIECES` — **не** раскрыта (`revealed=false`, события без `BASE_REVEALED`); после `FINISH_ACTIVATION` — `BASE_REVEALED{systemId:BASE}` (system), `revealed=true` |
| TC-U-57a | AC-10, R-8 | unit | boundary | то же, но активированная система ≠ база | `FINISH_ACTIVATION`(EMP) | раскрытия нет (проверяется только активированная система = база) |
| TC-U-57b | AC-10, R-8 | unit | negative | REB завершает активацию своей базы (`FINISH_ACTIVATION`(REB)) | — | раскрытия нет (только Империя раскрывает; добровольного раскрытия нет, D-4) |
| TC-U-58 | AC-10, R-8 | unit | boundary | EMP двигает в базу только корабли (SD, AC, TIE с транспортом, DS) | `FINISH_ACTIVATION` | раскрытия нет (только наземные, Q-10) |
| TC-U-59 | AC-10, R-8 | unit | boundary | EMP **только активирует** базу лидером | `FINISH_ACTIVATION` | раскрытия нет (Q-11) |
| TC-U-60 | AC-07, R-9 | unit | positive | база не раскрыта, в базе **нет** юнитов REB (REB заранее вывели всё), EMP приводит AC + ST | `FINISH_ACTIVATION`(EMP) | в одном ответе `BASE_REVEALED` → `GAME_OVER{winner:'empire', reason:'rebelBaseCaptured'}` (порядок — Q-41); `outcome` задан; `legalActions` пусты |
| TC-U-61 | AC-07, R-9 | unit | boundary | раскрытие при юнитах REB в базе (обычный случай) | `FINISH_ACTIVATION`(EMP) | `BASE_REVEALED`, победы нет; ход переходит по R-3/R-6 |
| TC-U-62 | AC-07, R-9 | unit | boundary | база раскрыта, юниты EMP в базе; у REB в базе остался ровно один юнит: (a) XW; (b) SG (сооружение); (c) RT | любое `MOVE_PIECES` | победы нет — любой юнит REB (корабль, сооружение, наземный) мешает |
| TC-U-63 | AC-07, R-9 | unit | positive | база раскрыта, в базе юниты EMP; REB выводят **последние** юниты из базы в соседнюю активированную | `MOVE_PIECES`(REB) | `GAME_OVER{winner:'empire'}` сразу после хода REB (проверка после каждого `MOVE_PIECES` любой стороны, Q-12) |
| TC-U-64 | AC-07, R-9 | unit | positive | база раскрыта, юнитов REB нет, у EMP в базе ничего | EMP двигает в базу **только корабль** (SD) | победа Империи (достаточно любого юнита Империи) |
| TC-U-64a | AC-07, R-9 | unit | boundary | база раскрыта, в базе нет ни юнитов EMP, ни REB | ход, не затрагивающий базу | победы нет (нужен ≥1 юнит Империи) |
| TC-U-65 | AC-07, R-7 | unit | boundary | `round = 13`, `reputation = 14`, обе вот-вот спасуют | второй пас | `TIME_ADVANCED{13→14}` → `GAME_OVER{winner:'rebels', reason:'timeReachedReputation'}`; `phase:'refresh'`; нового раунда нет; `activeSide` не меняется |
| TC-U-66 | AC-07, R-7 | unit | boundary | `round = 12` | конец фазы | `round = 13`, игра продолжается |
| TC-U-67 | AC-07, R-9 | unit | negative | `outcome` задан | каждая команда (`ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION`, `PASS`, `ACCEPT_HANDOFF`, `ADVANCE_PHASE`, `END_TURN`) от обеих сторон, с верной **и устаревшей** `expectedVersion` | `err422(gameOver)` `{actor}` для всех (раньше 409 и `commandUnavailable`, Q-13); невалидное тело — 400 раньше `gameOver`; без изменений |
| TC-U-68 | AC-07, AC-13 | unit | positive | — | `statusOf(state)` | `outcome=null` → `'prototype'`; любая причина победы → `'completed'`; `mock-v1` → всегда `'prototype'` |
| TC-U-69 | AC-07, AC-10 | unit | positive | HS, победа на ходу любой стороны (обе причины); AI_REB | state и `toPlayerView` обеих сторон | `handoffPending=false` (заслонки нет); **база видна Империи** (`rebelBase.systemId` задан, зоны нет, юниты REB в системе) — `hiddenBaseFor` учитывает `outcome` (Q-14) |

### 6. Скрытая информация (AC-10) — adversarial

Каждый кейс выполняется на **двух** базах (разные `sessionId`, TC-D-14), чтобы исключить совпадения.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-H-01 | AC-10 | unit | positive | `S0` | `toPlayerView(s, EMP)` | `scanForBase` = 0 вне допустимых путей; юниты REB базы — `location:{kind:'rebelBase'}`; `rebelBase:{systemId:null, revealed:false}`; `toPlayerView(s, REB)` — `systemId = BASE` |
| TC-H-02 | AC-10 | unit | positive (metamorphic) | скриптованные и псевдослучайные (сидированный PRNG) последовательности до раскрытия | на каждом шаге `relocateBase(S, b')` для каждого кандидата `b'` | `toSideView(·, EMP)`, события для EMP, `legalActions(·, EMP)` и результаты набора пробных команд EMP (включая нелегальные) **глубоко равны** для `S` и `S'` |
| TC-H-03 | AC-10 | unit | positive | REB активирует `BASE` | view EMP + `SYSTEM_ACTIVATED` для EMP | `activation.location:{kind:'rebelBase'}`; лидер в зоне; в событии `systemId:null` |
| TC-H-04 | AC-10 | unit | positive | REB двигает юниты в `BASE` из соседа и из `BASE` в A | `PIECES_MOVED` для EMP | системы базы → `null` («из скрытой зоны в A» / «из A в скрытую зону» — допустимо, Q-15) |
| TC-H-05 | AC-10, D-1 | unit | negative | (a) юниты REB в базе, юнитов EMP в базе нет; (b) EMP привёл наземные в базу, но ещё не `FINISH_ACTIVATION` | `contestedSystemIds` в view EMP | база **не** в списке EMP в обоих случаях (вычисляется после редактирования); в view REB для (b) — в списке |
| TC-H-06 | AC-10 | unit | positive | обновление: лидер REB возвращается из `BASE` | `LEADERS_RETURNED` для EMP | только `leaderIds`, без систем |
| TC-H-07 | AC-10 | unit | positive | `legalActions` EMP на каждом шаге скриптов | сериализовать | `ACTIVATE_SYSTEM.systemIds` = все 32 (база не исключена и не выделена); `MOVE_PIECES` — только свои юниты; иначе `scanForBase` = 0 |
| TC-H-08 | AC-10 | unit | negative | активация EMP в A; EMP шлёт `MOVE_PIECES` с `pieceIds` юнитов REB из зоны базы, `fromSystemId` = каждая `F ∈ ADJ(A)` без лидера EMP | ответы | для всех F **одинаково** `notOwner`; `details` без `systemId` базы (owner раньше местоположения) |
| TC-H-09 | AC-10 | unit | negative | EMP шлёт невалидные `ACTIVATE_SYSTEM`/`MOVE_PIECES`, ссылающиеся на `BASE` и на обычную систему | `details` | эхо только полей запроса; ответы для `BASE` и обычной системы неразличимы |
| TC-H-10 | AC-10 | unit | positive | `BASE_REVEALED` применён | view и журнал EMP | `rebelBase.systemId = BASE`; юниты REB в системе; зоны нет; **прошлые** события журнала без редактирования (Q-16) |
| TC-H-11 | AC-10, AC-08 | unit | positive | AI_REB (AI = Империя) | шпион на политике | аргумент глубоко равен `toSideView(state, EMP)`; `scanForBase` = 0 |
| TC-H-12 | AC-10, AC-09 | unit | positive | HS, handoff | handoff-view | strict ровно 8 ключей: `kind, id, version, activeSide, round, phase, sessionStatus, rulesEngine` (AM-FE-8); событий нет (`[]`); `scanForBase` = 0 |
| TC-H-13 | AC-10, AC-14 | integration | positive | две скриптованные партии с фиксированными `sessionId` (AI_EMP; HS с ходами REB в базу/из базы, активацией базы, ≥2 раундами, затем раскрытием); база — из строки БД | собрать **все** Empire-facing тела: `POST /api/sessions` (AI_EMP), `GET /:id`, ответы `/commands` (успехи и 4xx), журнал, `legalActions`, `GET /api/sessions?gameId=R`, handoff-view | `scanForBase` = 0 до `BASE_REVEALED`; после — `BASE_REVEALED` и `rebelBase.systemId` у обеих сторон; перечень проверенных ответов → `artifacts/logs/hidden-info-scan.log` |
| TC-H-14 | AC-10 | integration | negative | HS, ход EMP | `GET /:id?viewer=rebels`; команда с `actor:'rebels'` | `?viewer` игнорируется; `notYourTurn`; тело ошибки без view Повстанцев |
| TC-H-15 | AC-10 | integration | positive | AI_EMP | `GET /api/sessions?gameId=R` | `details` = `{playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase, rulesEngine, winner, reputation}`; без систем; `scanForBase` = 0 |
| TC-H-16 | AC-10 | integration | positive | перехват логов Nest во время TC-H-13 | grep | id базы нет в логах (Q-17); сообщения о 500 авто-хода без данных state |
| TC-H-17 | AC-10, AC-14 | arch | positive | — | `check:bundle` | в бандле нет модулей Rebellion `scenario`/`rules`/`server`/`ai`; нет символа `chooseRebelBase` и строки `rebelBaseCandidates`; строковый поиск id базы для `core-v1` не применяется (Q-18) |
| TC-H-18 | AC-10, AC-07 | integration | positive | AI_EMP доведена до победы Повстанцев (13 пасов) | ответ последней команды и `GET /:id` EMP | `rebelBase.systemId` задан, `hidden-base-zone` пуста; scan не применяется (после `outcome` скрытой информации нет, Q-14) |

### 7. AI авто-пас (AC-08)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-AI-01 | AC-08 | unit | positive | — | `chooseAutoCommand(view)` с `PASS` в `legalActions` | `PASS`; 10 вызовов — один результат; чистая функция; `AUTO_POLICY_ID='auto-pass-v1'` |
| TC-AI-02 | AC-08 | unit | boundary | view во время активации (`FINISH_ACTIVATION` есть, `PASS` нет); view без действий | политика | `FINISH_ACTIVATION`; `null` |
| TC-AI-03 | AC-08 | integration | positive | AI_REB, ход REB | `ACTIVATE` → `FINISH_ACTIVATION` | ответ на `FINISH_ACTIVATION`: `ACTIVATION_FINISHED{auto:false}`, `PASSED{auto:true}` actor `empire`; `activeSide=REB`, `handoffPending=false`; в БД событие с `actor='empire'`, `payload.auto=true` |
| TC-AI-04 | AC-08, R-6 | integration | positive | TC-AI-03 (AI спасовал) | ещё `ACTIVATE+FINISH`(REB) | AI больше не ходит (спасовал до конца фазы); событий AI в ответе нет; ход REB |
| TC-AI-05 | AC-08 | integration | positive | AI_REB, начало раунда | `PASS`(REB) первым ходом | ход AI → `PASSED{auto}` → обе спасовали → обновление → `round+1` → ход REB — всё в одном ответе |
| TC-AI-06 | AC-08 | integration | positive | — | `POST /api/sessions` AI_EMP | 201: журнал содержит `PASSED{auto:true}` actor `rebels`; `view.viewer=EMP`, ход EMP; `version=2`; `GET /:id` — то же |
| TC-AI-07 | AC-08 | integration | positive | AI_EMP | `ACTIVATE+FINISH`(EMP) | ход остаётся у EMP (AI спасовал), AI не ходит |
| TC-AI-07a | AC-08 | integration | positive | AI_EMP | `PASS`(EMP) | обновление → новый раунд → AI-Повстанцы пасуют → ход EMP в том же ответе; `round+1` |
| TC-AI-08 | AC-08, AC-07 | integration | boundary | AI_EMP (и AI_REB) | 13 × `PASS` игрока | после 13-го: `round=14` → победа Повстанцев; AI больше не ходит; `status:'completed'` в том же ответе; после 12-го — игра продолжается |
| TC-AI-09 | AC-08 | unit/integration | boundary | — | цикл `runAutoPlay` | не более `MAX_AUTO_STEPS=16`; превышение → throw → 500 без записи |
| TC-AI-10 | AC-08 | integration | positive | AI_REB | версии | каждая команда движка `+1` (включая авто-ходы); ответ несёт версию после последнего авто-хода; следующая команда с `view.version` → 200, с предыдущей → 409 (Q-19) |
| TC-AI-11 | AC-08 | integration | negative | AI_REB | команда игрока с `actor:'empire'` | `err422(notYourSide)`; без изменений |
| TC-AI-12 | AC-08 | integration | negative | тестовая политика возвращает нелегальный ход / `null` | ход игрока | 500 без внутренностей; **ничего не записано** (ни ход игрока, ни AI; `version` та же); в журнале нет записи (Q-27) |
| TC-AI-13 | AC-08 | integration | negative | `OPENAI_API_KEY` не задан / фиктивный; шпион на AI-клиенте API (если есть) и `fetch` | полный раунд AI_REB и AI_EMP | ни одного вызова OpenAI/внешней сети |
| TC-AI-14 | AC-08 | arch | positive | — | ESLint/grep `src/ai/**` | импорт только `../schema` (B-6); нет OpenAI/Nest/React/`scenario`/`rules` |
| TC-AI-15 | AC-08, AC-14 | integration | concurrency | AI_REB | 2 параллельные команды игрока с одной `expectedVersion` | один 200, один 409; авто-пас записан ровно один раз |
| TC-AI-16 | AC-08 | integration | regression | AI_EMP | повтор `POST` с тем же `Idempotency-Key` | тот же `sessionId`; авто-пас не повторён (`version=2`, число событий то же) |
| TC-AI-17 | AC-08 | integration | positive | AI_REB/AI_EMP после каждой команды | инвариант SWR-004 | в сохранённом state `activeSide=playerFaction` (кроме `outcome`), `handoffPending=false`; view всегда для `playerFaction` |

### 8. Hot-seat (AC-09)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-HS-01 | AC-09 | integration | positive | HS, REB | `ACTIVATE`, `MOVE_PIECES` | заслонки нет во время активации |
| TC-HS-02 | AC-09 | integration | positive | HS, EMP не спасовала | `FINISH_ACTIVATION`(REB) | `view.kind:'handoff'`, `activeSide:'empire'`, ровно 8 ключей (TC-H-12); `events: []` |
| TC-HS-03 | AC-09 | integration | positive | HS | `PASS`(REB) | handoff к EMP |
| TC-HS-04 | AC-09 | integration | boundary | HS, REB спасовали раньше, последним пасует EMP | конец фазы → новый раунд (REB) | handoff к REB (сторона сменилась) |
| TC-HS-05 | AC-09 | integration | boundary | HS, EMP спасовала раньше, последним пасует REB | новый раунд (REB) | заслонки нет (та же сторона, Q-28) |
| TC-HS-05a | AC-09, R-6 | integration | boundary | HS, REB спасовали, ход EMP | `ACTIVATE+FINISH`(EMP) | заслонки нет; ход остаётся у EMP |
| TC-HS-06 | AC-09 | integration | negative | handoff к EMP | любая команда REB; `ACTIVATE` EMP до ACCEPT; `ACCEPT_HANDOFF` REB | `notYourTurn` / `handoffPending` / `notYourTurn`; без изменений |
| TC-HS-07 | AC-09 | integration | positive | — | полный раунд вдвоём: REB активация+перемещение+FINISH → handoff → EMP активация+FINISH → handoff → REB `PASS` → handoff → EMP активация+FINISH (без заслонки) → EMP `PASS` → обновление → handoff к REB | все шаги 200; `round=2`; лидеры в пулах; журнал содержит все события |
| TC-HS-08 | AC-09 | integration | regression | HS `core-v1` | `END_TURN` | `err422(commandUnavailable)` |
| TC-HS-09 | AC-09 | integration | concurrency | handoff | 2 параллельных `ACCEPT_HANDOFF` | один 200, один 409 |
| TC-HS-10 | AC-09 | integration | positive | handoff | `GET /:id` после перезапроса | handoff-view (состояние на сервере) |
| TC-HS-11 | AC-09, AC-07 | integration | positive | HS, ход ведёт к победе | ответ | `kind:'player'` (не handoff), `outcome` задан, обе стороны получают финальный view |

### 9. Golden / детерминированная скриптованная партия (AC-14, AC-02, AC-06)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-G-01 | AC-14 | unit | positive | фиксированные `sessionId`, `now`, HS | скрипт ≥ 2 раундов: активации обеих сторон (в т.ч. система со своим лидером), перемещения по вместимости, в спорную систему, ходы подряд после паса соперника, пасы, обновления | итоговый state и последовательность типов событий **равны** golden-снимку (< 100 KB); два прогона подряд идентичны |
| TC-G-02 | AC-14, AC-10, AC-07 | unit | positive | фиксированный `sessionId` (известная база) | скрипт: Империя за несколько раундов доводит наземные + транспорт до базы → раскрытие на `FINISH_ACTIVATION`; Повстанцы выводят все юниты (транспорт заводится в базу заранее) → победа Империи | golden: `BASE_REVEALED`, `GAME_OVER{empire, rebelBaseCaptured}` в ожидаемых позициях |
| TC-G-03 | AC-14, AC-07 | unit | positive | — | 13 раундов только пасов (по 2 паса) | golden: `round=14`, `outcome={rebels, timeReachedReputation}`; ровно 13 событий `TIME_ADVANCED` |
| TC-G-04 | AC-14 | unit | negative | golden-скрипт + одна нелегальная команда в середине | применить | отказ с ожидаемым ключом; итог = golden без этой команды |
| TC-G-05 | AC-14 | arch | positive | — | ESLint/grep `src/rules/**` | нет `Date`, `Math.random`, `crypto` (время только из `ctx.now`) |
| TC-G-06 | AC-14 | integration | positive | TC-G-01 через HTTP на свежей БД с тем же `sessionId` (если API позволяет задать — иначе сравнение по эталонным view W5 `test/fixtures/core/views/*.json`) | итоговые view REB/EMP | совпадают с эталоном (без `at`/`updatedAt`) |
| TC-G-07 | AC-14 | unit | positive | — | обновление golden | только явным флагом (`UPDATE_GOLDEN=1`); тест не перезаписывает снимок молча |

### 10. Платформа и статус сессии (AC-07, AC-13)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-P-01 | AC-13 | unit | positive | `@bga/platform` | тип `ServerGameModule` | обязательный `statusOf(state): SessionStatus` (BD-6); док `createInitialState` — «version ≥ 1» |
| TC-P-02 | AC-13 | integration | positive | fake-game (`{finish:true}` → `'completed'`) | команда | `Session.status='completed'` в том же commit; ответ и `GET /api/sessions` — `completed` |
| TC-P-03 | AC-13 | integration | regression | forbidden-stars / fake без смены | команда | статус не меняется |
| TC-P-04 | AC-13 | integration | negative | `statusOf` возвращает невалидное значение; сбой записи (TR-5) | команда | 500 без внутренностей; ни state, ни статус не записаны; повтор после восстановления → 200 |
| TC-P-05 | AC-13 | arch | positive | — | grep `packages/platform` | нет `rebels|empire|outcome|winner|faction|rulesEngine` |
| TC-P-06 | AC-13 | integration | positive | новая партия | `POST`, `GET`, список | `status:'prototype'` |
| TC-P-07 | AC-07, AC-13 | integration | positive | партия доведена до победы (обе причины) | ответ, `GET /:id`, список | `status:'completed'`; `details.winner` задан; `outcome` во view обеих сторон; `legalActions` пусты; команды → `gameOver`; статус остаётся `completed` |
| TC-P-08 | AC-13 | integration | boundary | — | `status` | ∈ `setup|prototype|active|completed`; `active` не используется (A-2) |
| TC-P-09 | AC-13 | integration | positive | — | `prisma migrate diff … --exit-code` | exit 0 (миграции нет, `schema.prisma` не тронут) |

### 11. Legacy-сессии и миграция v1/v2 → v3 (AC-11)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-M-01 | AC-11 | unit | positive | фикстуры `test/fixtures/v2/*.json` | `upcastV2toV3` | `schemaVersion:3`, `rulesEngine:'mock-v1'`; прочие поля глубоко равны; результат проходит `MockGameStateV3Schema` |
| TC-M-02 | AC-11 | unit | positive | фикстура v1 | цепочка v1→v2→v3 | = v2-апкаст (SWR-004) + `rulesEngine:'mock-v1'`; v2-промежуток валидируется **замороженной** `GameStateV2Schema` (`legacy-v2.ts`) |
| TC-M-03 | AC-11 | unit | boundary | v3 | повторный апкаст | идемпотентен для `mock-v1` и `core-v1`; `version` не меняется |
| TC-M-04 | AC-11 | unit | negative | `schemaVersion:99`; v3 без `rulesEngine`; `rulesEngine:'core-v9'` | `upcastState` | throw (→ 500), не тихая подмена |
| TC-M-05 | AC-11 | unit | positive | v3 `mock-v1` | `MOVE_PIECES` (mock), `ADVANCE_PHASE`, `END_TURN`/`ACCEPT_HANDOFF` | поведение SWR-004 байт-в-байт (кроме `view.rulesEngine`, `details`) |
| TC-M-06 | AC-11 | unit | negative | `mock-v1` | `ACTIVATE_SYSTEM`, `PASS`, `FINISH_ACTIVATION` | `err422(commandUnavailable)` (Q-29); без изменений |
| TC-M-07 | AC-11 | unit | negative | `core-v1` | mock-форма `MOVE_PIECES` вне активации | `err422(noActivation)` |
| TC-M-08 | AC-11 | integration | positive | `createSwr004Db(sessions.v2.json)` (AI-rebels, AI-empire, HS в handoff) + v1-БД (`pre-migration-db.ts`/`swr003-db.ts`) | `GET /`, `GET /:id`, mock-команда | 200; `view.rulesEngine:'mock-v1'`, `details.rulesEngine:'mock-v1'`, `details.reputation:null`; HS в handoff остаётся handoff; ход по mock-правилам; количество строк/событий сохранено |
| TC-M-09 | AC-11 | integration | positive | TC-M-08 | строка после команды | `schemaVersion:3`, `rulesEngine:'mock-v1'`, setup v2 (апкаст ленивый, Q-30); повторное чтение даёт идентичный view; до команды строка остаётся v1/v2 |
| TC-M-10 | AC-11 | integration | positive | копия `apps/api/prisma/dev.db` (opt-in `SWR005_DEV_DB`, алиас `SWR004_DEV_DB`) | все строки GET → mock-команда на строку → рестарт → GET | все 200, `mock-v1`; view после рестарта идентичен; sha256 оригинала до = после; лог в `artifacts/logs/` |
| TC-M-11 | AC-11 | manual | positive | — | `apps/api/prisma/dev.pre-swr005.db` создан Analyst до первого запуска на коде SWR-005 | файл существует; sha256 = dev.db на момент бэкапа (лог); не в git (`git check-ignore`) |
| TC-M-12 | AC-11 | integration | regression | — | `migration.int.test.ts`, `migration-swr004.int.test.ts`, `upcast-v1.int.test.ts` | зелёные; ожидаемая версия после команды — v3; остальные проверки не ослаблены |
| TC-M-13 | AC-11 | integration | negative | — | хеши SQL-миграций SWR-002…004 | не изменены; новых миграций нет |
| TC-M-14 | AC-11, AC-13 | integration | positive | legacy-сессия | статус после команд | `prototype` (mock никогда не `completed`) |

### 12. Web — component / unit (AC-07, AC-08, AC-10, AC-11, AC-12, AC-13)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-C-01 | AC-12 | component | positive | core-view (REB) | render | `game-table[data-rules-engine=core-v1][data-phase][data-active-side]`; `time-track[data-time=1][data-reputation=14]`; `phase-indicator` «Приказы»; `turn-indicator[data-side][data-mine]` |
| TC-C-02 | AC-12 | component | positive | ход REB | пул | `leader-pool` (`role=radiogroup`) с 4 `leader-<id>` (`role=radio`, `aria-checked`, `data-owner`); `MM` недоступна для выбора (по `leaderIds`) с понятной подсказкой |
| TC-C-03 | AC-12 | component | positive | лидер выбран (`turn-panel[data-state=armed]`) | клик по подсвеченной системе; клавиатура: `activation-system-select` → `activation-confirm` | `ACTIVATE_SYSTEM{leaderId, systemId}`; доступны все `systemIds` (Q-FE-5) |
| TC-C-04 | AC-12 | component | positive | идёт активация | render | `turn-panel[data-state=activation]`; `system-item-<A>[data-activated]`; `finish-activation` активна; `pass-turn` `disabled`; пул неактивен |
| TC-C-05 | AC-12 | component | positive | `legalActions` MOVE | `move-panel[data-to=A]` → `move-source-<F>` → `move-piece-<id>`/`move-select-all-<F>` → `move-submit-<F>` | `MOVE_PIECES{pieceIds, fromSystemId:F, toSystemId:A}`; предпросмотр «вместимость N/M» по `pieces` (Q-FE-2); при превышении — `move-error-<F>`, отправка заблокирована |
| TC-C-06 | AC-12 | component | positive | ход REB без активации, в пуле есть активирующие лидеры | `pass-turn` | диалог `pass-confirm` (фокус на `pass-confirm-cancel`); `pass-confirm-ok` → `PASS{}`; без лидеров — без диалога (Q-FE-3) |
| TC-C-07 | AC-12 | component | negative | 422 с каждым ключом: `notYourTurn, wrongPhase, unknownLeader, leaderNotInPool, leaderCannotActivate, activationInProgress, noActivation, notActivatedSystem, notAdjacent, pinnedByLeader, immobileUnit, insufficientCapacity, gameOver, commandUnavailable` + существующие | показ | понятный текст ru/en, не код/`messageKey`/«undefined»; `gameOver` → инвалидирует view |
| TC-C-08 | AC-12 | unit | positive | — | `locales.i18n.test.ts`: `rebellion.turn`, `errors`, `match`, `common`, `data`, `map` | все ключи в ru и en; en без кириллицы; ключ ошибки на каждый `messageKey` из `errors.ts` |
| TC-C-09 | AC-08 | component | positive | журнал с `PASSED{auto:true}` | render | `log-entry-<seq>[data-auto=true][data-actor=empire][data-type=PASSED]` «Империя (AI) пасует — авто, AI Commander ещё не реализован» / en |
| TC-C-10 | AC-10 | component | positive | view EMP до раскрытия | render | `hidden-base-zone[data-count]` «База Повстанцев — местоположение неизвестно» в списке и панели; ни один `system-item` не связан с базой |
| TC-C-11 | AC-10 | component | positive | view EMP после раскрытия / после `outcome`; view REB | render | `hidden-base-zone` отсутствует; база отмечена у системы (атрибут — Q-37) |
| TC-C-12 | AC-07 | component | positive | `outcome` (обе причины) | render | `game-over-banner[data-winner][data-reason]` + `game-over-title` «Победа …» с причиной; `turn-panel[data-state=over]`; кнопки хода неактивны; drag выключен |
| TC-C-13 | AC-07, AC-13 | component | positive | список: `completed` (новее) + незавершённая | `/games/R` | `recent-session-status[data-status=completed]` «Завершена»; «Продолжить» ведёт к последней **незавершённой** (Q-31); завершённая открывается по клику |
| TC-C-14 | AC-13 | component | positive | core / mock / handoff | бейдж | `prototype-badge[data-variant=core-v1]` «Реальная карта; правила частично: раунд и активация. Бой, миссии, производство — позже»; `legacy` «Старый прототип: тестовые правила»; на заслонке — по `rulesEngine` handoff-view |
| TC-C-15 | AC-11 | component | positive | mock-view | стол | LegacyTable SWR-004 (`advance-phase`, `end-turn` для human); нет `leader-pool`/`pass-turn` |
| TC-C-16 | AC-12, D-1 | component | positive | `contestedSystemIds=[X]` | список | `system-item-<X>[data-contested=true]` + текстовая метка; `data-remote`, `data-region` у всех 32 |
| TC-C-17 | AC-12 | component | positive | `VITE_E2E` | `window.__boardDebug` | `getSystemScreenPos`, `getSystemLabelRect`, `getContentBounds`, `getLod`, `getActivatedSystemId`, `getArmedLeaderId`, `getRulesEngine`; при заслонке — `undefined` |
| TC-C-18 | AC-09 | component | regression | handoff-view (8 ключей) | render | заслонка SWR-004; данные стола размонтированы; фаза «Приказы» |
| TC-C-19 | AC-12 | component | positive | `map-legend` во вкладке «Партия» | render | обозначения удалённых, спорных, активированной, зоны базы |

### 13. E2E Playwright (AC-01, AC-03..AC-13, AC-16)

Каждый e2e проверяет UI, сеть (`page.waitForResponse`) и сервер через API (`e2e/support/api.ts`). testids — `plan-frontend.md` §9.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-E-01 | AC-01, AC-03, AC-12, AC-13 | e2e | positive | — | **Сценарий 1:** форма (defaults) → старт | `game-table[data-rules-engine=core-v1]`; 32 `system-item-*` в 8 регионах (`data-region` r1..r8); `time-track` 1/14; «Приказы»; ход REB; `leader-pool` из 4; бейдж среза |
| TC-E-02 | AC-04, AC-05, AC-06, AC-08 | e2e | positive | TC-E-01 | лидер → система (клик) → drag юнита из соседней (подсвечены только легальные — `__boardDebug`) → `finish-activation` | ответ: `PIECES_MOVED`, `ACTIVATION_FINISHED`, `PASSED{auto}` (empire); `log-entry-*[data-auto=true]`; ход снова REB |
| TC-E-03 | AC-06, AC-08, R-6 | e2e | positive | TC-E-02 | ещё одна активация (AI не ходит) → `pass-turn` → `pass-confirm-ok` | после паса: лидеры в пуле (UI + API), `time-track[data-time=2]`, ход REB |
| TC-E-04 | AC-08, AC-10 | e2e | positive | — | **Сценарий 2:** старт AI_EMP | при первом показе стола ход EMP; авто-пас AI-Повстанцев в журнале; `hidden-base-zone[data-count=6]` (XW, YW, 3 RT, AS; состав = сохранённому state и ровно 6 — база не бывает в системе со стартовыми юнитами REB, review #1); id базы (получен по TR-3) отсутствует во всех сетевых ответах (`page.on('response')` + `scanForBase`), в DOM-атрибутах и `__boardDebug` |
| TC-E-05 | AC-09 | e2e | positive | — | **Сценарий 3:** HS: REB активация → `finish-activation` → заслонка → «Я — Империя» → EMP `pass-turn` → заслонка → «Я — Повстанцы» → REB ходит подряд без заслонки | заслонки только при смене стороны; на заслонке нет `board-canvas`/журнала; `end-turn` отсутствует в `core-v1` |
| TC-E-06 | AC-10 | e2e | positive | TR-4 / Q-35 | **Сценарий 4:** EMP стягивает наземные юниты в базу → `finish-activation` | событие «База Повстанцев раскрыта в <системе>» в журнале обеих сторон; у EMP исчезла `hidden-base-zone`, база видна |
| TC-E-07 | AC-07, AC-13 | e2e | positive | AI_EMP, 12 пасов через API (`e2e/support/api.ts`) | **Сценарий 5a:** 13-й «Пас» в UI | `game-over-banner[data-winner=rebels][data-reason=timeReachedReputation]`; ответ `status:'completed'`; в `/games/R` «Завершена»; API-команда → 422 `gameOver`; база видна Империи |
| TC-E-08 | AC-07 | e2e | positive | TR-4 / Q-35 | **Сценарий 5b:** победа Империи | `game-over-banner[data-winner=empire][data-reason=rebelBaseCaptured]`; `completed` |
| TC-E-09 | AC-11 | e2e | positive | e2e-БД засеяна v2-строками (и v1) до старта сервера (TR-4) | **Сценарий 6:** `/games/R` → legacy → `advance-phase`, mock-перемещение → reload | вымышленная карта; `prototype-badge[data-variant=legacy]` «Старый прототип: тестовые правила»; ход сохранён |
| TC-E-10 | AC-12 | e2e | positive | TC-E-01 | только клавиатура: пул (стрелки) → `activation-system-select` → `activation-confirm` → `move-panel` → `move-submit-*` → `finish-activation` → `pass-turn` → диалог | весь поток без мыши; фокус видим |
| TC-E-11 | AC-12 | e2e | negative | ход REB | `page.route` → 422 `notAdjacent` / `insufficientCapacity` на `MOVE_PIECES` | понятное сообщение; выбор сброшен, повтор возможен |
| TC-E-12 | AC-12 | e2e | positive | TC-E-01 на 1440×900, 1024×768, 768×1024 | `zoom-fit` | `getSystemScreenPos` всех 32 и `getSystemLabelRect` внутри rect `board-canvas`; подписи попарно без пересечений (допуск 2px); `getLod()` любой (на 768 допустим `compact`, Q-FE-7); resize до взаимодействия — fit пересчитывается |
| TC-E-13 | AC-03 | e2e | negative | `core-v1` | API: `ADVANCE_PHASE`, `END_TURN` | 422 `commandUnavailable`; в UI нет `advance-phase` |
| TC-E-14 | AC-13 | e2e | positive | ≥1 `core-v1`, ≥1 legacy, ≥1 `completed` | `/games/R` | статусы/бейджи различимы; «Продолжить» → последняя незавершённая |
| TC-E-15 | AC-16 | e2e | regression | — | переписанные на `core-v1` `selection`, `zoom-pan`, `keyboard`, `board-view`, `persistence`, `hot-seat`, `screenshots`, `architecture`; mock-регрессия на засеянных строках (`move`, `phase`) | сила проверок не ослаблена; каждый старый TC в таблице замен |

### 14. Visual & accessibility (AC-07, AC-09..AC-13)

Скриншоты: `docs/tasks/SWR-005/artifacts/screenshots/<file>` по `plan-frontend.md` §10, `reducedMotion:'reduce'`, ru
(en — одна копия стола 1440, Q-34).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-VA-01 | AC-12 | visual-a11y | screenshot | TC-E-01 | `01-core-fit-1440x900.png`, `02-core-fit-1024x768.png`, `03-core-fit-768x1024.png`, `18-core-fit-1440-en.png` | 32 системы с подписями, 8 регионов, трек, фаза, очередь |
| TC-VA-02 | AC-12 | visual-a11y | screenshot | — | `04-leader-armed-targets.png`, `05-activation-keyboard.png`, `06-activation-move-panel.png`, `07-move-drag.png` | цели подсвечены; фокус-кольцо; `move-panel` с отмеченными юнитами |
| TC-VA-03 | AC-08, AC-06 | visual-a11y | screenshot | — | `08-ai-autopass-log.png`, `09-new-round.png` | подпись авто-паса; время 2, лидеры в пуле |
| TC-VA-04 | AC-10 | visual-a11y | screenshot | AI_EMP | `10-empire-hidden-zone.png` | зона «местоположение неизвестно» |
| TC-VA-05 | AC-10 | visual-a11y | screenshot | после раскрытия | `11-base-revealed.png` | событие и значок базы |
| TC-VA-06 | AC-07 | visual-a11y | screenshot | — | `13-game-over-rebels.png` (+ `13b-game-over-empire.png`, если TC-E-08 реализован) | баннер читаем, причина указана, кнопок хода нет |
| TC-VA-07 | AC-09 | visual-a11y | screenshot | HS | `16-hotseat-handoff-core.png` | заслонка без данных стола |
| TC-VA-08 | AC-11, AC-13 | visual-a11y | screenshot | legacy | `15-legacy-table.png` | бейдж «Старый прототип» |
| TC-VA-09 | AC-07, AC-13 | visual-a11y | screenshot | — | `14-game-page-completed.png` | «Завершена», «Время N», старая партия с «Старый прототип» |
| TC-VA-10 | AC-12 | visual-a11y | layout | 1024×768, 768×1024 | шапка, панели | без пересечений детей, `scrollWidth <= clientWidth`; `finish-activation`/`pass-turn` не обрезаны |
| TC-VA-11 | AC-12 | visual-a11y | focus | — | пул, `activation-system-select`, `move-*`, `finish-activation`, `pass-turn`, диалог паса (`17-pass-confirm.png`), баннер | видимое кольцо фокуса (≥ 3:1); диалог держит фокус, Esc = отмена |
| TC-VA-12 | AC-12, D-1 | visual-a11y | contrast / screenshot | — | новые тексты; `12-contested.png` | ≥ 4.5:1 (≥ 3:1 крупные подписи регионов); спорная система отмечена не только цветом |
| TC-VA-13 | AC-12 | visual-a11y | semantics | — | роли: `leader-pool` radiogroup/radio с именами лидеров; `turn-panel`; баннер `status`/`alert`; live-region объявляет авто-пас и смену хода | доступные имена на языке UI |
| TC-VA-14 | AC-12, PO-1 | visual-a11y | assets | — | сеть при открытии стола | нет внешних доменов и растровых изображений поля/артов |

### 15. Архитектура, документация, гейты (AC-14, AC-15, AC-16)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-A-01 | AC-14 | arch | positive | — | ESLint-границы + `scripts/eslint-boundaries.test.mjs` | `src/rules/**`, `src/schema/**`, `src/scenario/**` без React/MUI/Nest/OpenAI/Prisma; `./board` без `scenario`/`rules`; кейс «`src/rules/core/x.ts` импортирует `../../scenario` → ошибка» |
| TC-A-02 | AC-14 | arch | positive | — | `pnpm check:bundle` | зелёный (см. TC-H-17); `__boardDebug` нет в prod-бандле |
| TC-A-03 | AC-14 | arch | negative | — | тест скрипта: модуль `rules`/`ai` в `--modules-dir`; символ `chooseRebelBase` в бандле | скрипт падает в обоих случаях |
| TC-A-04 | AC-15 | arch | positive | — | ревью `docs/game-rules/rebellion-core-v1.md` | R-1..R-10 своими словами; D-1..D-7; источники; нет цитат правил/карт |
| TC-A-05 | AC-15 | arch | positive | — | `docs/architecture/application.md`, `adding-a-game.md` | `rulesEngine`, `statusOf`, авто-пас, данные игры/`core-ids.ts`, i18n-ключи; ссылки существуют |
| TC-A-06 | AC-15, PO-1 | arch | negative | — | поиск новых `*.png|*.jpg|*.webp|*.pdf` в `packages/`, `apps/`, `docs/game-rules/` | нет сканов/артов/изображений поля |
| TC-A-07 | AC-12, AC-16 | arch | positive | — | `e2e/support/board.ts` | `CURRENT_SCREENSHOT_TASK = 'SWR-005'` (или `SCREENSHOT_TASK=SWR-005`); после прогона в `docs/tasks/SWR-004/artifacts/screenshots/` нет изменений (`git status`) |
| TC-A-08 | AC-16 | gate | positive | — | `pnpm verify` | exit 0; лог в `artifacts/logs/` |
| TC-A-09 | AC-16 | gate | positive | — | `node scripts/check-task.mjs docs/tasks/SWR-005` | exit 0 |
| TC-A-10 | AC-02, AC-15 | manual | positive | — | сверка данных со справочником: 32 системы, регионы, 8 удалённых, 69 рёбер (снимок), 10 случайных рёбер вручную, вместимости, лидеры, расстановка §4.2 | совпадают; отметки уверенности перенесены |
| TC-A-11 | AC-16 | gate | positive | — | `node --test scripts/` | зелёный |
| TC-A-12 | AC-12 | manual | positive | dev-сервер на копии dev.db (после бэкапа TC-M-11) | skill `browser-qa`: сценарии 1, 2, 6 | скриншоты `manual-*`; лог `artifacts/logs/qa-manual.log` |

### 16. Регрессия SWR-004 (AC-09, AC-10, AC-11, AC-16)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-R-01 | AC-16 | e2e | regression | — | `pnpm e2e` | ≥ 75 старых (или явные замены) + новые; зелёные |
| TC-R-02 | AC-16 | unit/integration/component | regression | — | `pnpm test` | api ≥ 181, web ≥ 255, rebellion ≥ 201, platform ≥ 64, process ≥ 357, forbidden-stars ≥ 5 (+ новые); заменённые перечислены |
| TC-R-03 | AC-09 | integration | regression | — | `hotseat.int.test.ts`, `concurrency.int.test.ts` | mock-часть на засеянных строках (W6a) + core-часть (TC-HS-*) |
| TC-R-04 | AC-10 | integration | regression | — | `hidden-info.int.test.ts` (TC-API-11..13) | зелёные на засеянных `mock-v1`; core — TC-H-13 |
| TC-R-05 | AC-08 | integration | regression | — | `idempotency.int.test.ts`, `idempotency.unit.test.ts` | зелёные; + TC-AI-16 |
| TC-R-06 | AC-11 | integration | regression | — | `migration*.int.test.ts`, `upcast-v1.int.test.ts`, `dev-db-upgrade.int.test.ts` (opt-in) | зелёные с v3 |
| TC-R-07 | AC-16 | e2e | regression | — | см. TC-E-15 | — |
| TC-R-08 | AC-08 | integration | regression | — | `POST /api/sessions` (AI_REB/AI_EMP/HS) | ключи ответа `sessionId, gameId, status, settings, view` как в SWR-004; `rulesEngine` не в `settings` (AM-FE-1) |

## Coverage

| AC | Test cases |
|---|---|
| AC-01 | TC-D-01..TC-D-08, TC-E-01, TC-VA-01 |
| AC-02 | TC-D-09..TC-D-18, TC-G-01, TC-A-10 |
| AC-03 | TC-U-01..TC-U-04, TC-U-19, TC-E-01, TC-E-13 |
| AC-04 | TC-U-11, TC-U-21..TC-U-25, TC-U-26a, TC-U-26b, TC-U-27..TC-U-31, TC-U-30a, TC-C-02, TC-C-03, TC-E-02 |
| AC-05 | TC-U-32..TC-U-56 (вкл. 46a..46d, 47a), TC-C-05, TC-E-02, TC-E-11 |
| AC-06 | TC-U-05..TC-U-18 (вкл. 12a, 12b), TC-U-20, TC-HS-05a, TC-E-02, TC-E-03, TC-VA-03 |
| AC-07 | TC-U-60..TC-U-69 (вкл. 64a), TC-AI-08, TC-HS-11, TC-H-18, TC-P-07, TC-C-12, TC-C-13, TC-E-07, TC-E-08, TC-VA-06, TC-VA-09 |
| AC-08 | TC-AI-01..TC-AI-17 (вкл. 07a), TC-H-11, TC-C-09, TC-E-02..TC-E-04, TC-VA-03, TC-R-05, TC-R-08 |
| AC-09 | TC-HS-01..TC-HS-11 (вкл. 05a), TC-H-12, TC-C-18, TC-E-05, TC-VA-07, TC-R-03 |
| AC-10 | TC-U-57..TC-U-59 (вкл. 57a, 57b), TC-U-69, TC-H-01..TC-H-18, TC-C-10, TC-C-11, TC-E-04, TC-E-06, TC-VA-04, TC-VA-05, TC-R-04 |
| AC-11 | TC-M-01..TC-M-14, TC-C-15, TC-E-09, TC-VA-08, TC-R-06 |
| AC-12 | TC-D-07, TC-D-08, TC-C-01..TC-C-08, TC-C-16, TC-C-17, TC-C-19, TC-E-10..TC-E-12, TC-VA-01, TC-VA-02, TC-VA-10..TC-VA-14, TC-A-07, TC-A-12 |
| AC-13 | TC-U-68, TC-P-01..TC-P-09, TC-C-13, TC-C-14, TC-E-14, TC-VA-08, TC-VA-09 |
| AC-14 | TC-G-01..TC-G-07, TC-U-20, TC-H-17, TC-A-01..TC-A-03 |
| AC-15 | TC-A-04..TC-A-06, TC-A-10 |
| AC-16 | TC-A-07..TC-A-09, TC-A-11, TC-R-01, TC-R-02, TC-R-07, TC-E-15; сценарии 1–6 = TC-E-01..TC-E-09 |

Rules → TC: R-1 U-01/04, D-18; R-2 U-02; R-3 U-05/06/14; R-4 U-21..31 (26a/26b/30a); R-5 U-32..56; R-6 U-06..12b, U-10,
HS-05a, AI-04; R-7 U-07/13/65/66; R-8 U-57..59 (57a/57b), H-10; R-9 U-60..67 (64a), U-69; R-10 D-11..D-16.
D-n → TC: D-1 U-52, H-05, C-16, VA-12; D-2 U-02; D-3 U-13; D-4 U-57b, D-14; D-5 D-11; D-6 D-11, U-53; D-7 D-10.
Ключи ошибок → TC: `notYourTurn` U-10/15/22, HS-06; `wrongPhase` U-19; `unknownLeader` U-25/30a; `leaderNotInPool` U-23/24;
`leaderCannotActivate` U-11/26a/30a; `activationInProgress` U-16/28; `noActivation` U-17/34, M-07; `notActivatedSystem` U-35;
`notAdjacent` U-36; `pinnedByLeader` U-38/40; `immobileUnit` U-41; `insufficientCapacity` U-43..46c/47a; `gameOver` U-67, P-07;
`commandUnavailable` U-03, M-06, HS-08, E-13; `notOwner` U-49, H-08; `notInFromSystem`/`unknownPiece`/`unknownSystem` U-50;
`sameSystem` U-37; `handoffPending` U-29, HS-06; `notYourSide` AI-11. (`systemHasOwnLeader` — не вводится, TC-U-26 заменён.)

## Testability requirements for implementers

- **TR-1 testids** — согласованный список `plan-frontend.md` §9 (переносится QA в `e2e/support/testids.ts`):
  `game-table[data-rules-engine|data-phase|data-active-side]`, `prototype-badge[data-variant]`, `turn-indicator`, `time-track`,
  `phase-indicator`, `finish-activation`, `pass-turn`, `pass-confirm(-ok|-cancel)`, `turn-panel[data-state]`, `leader-pool`,
  `leader-<id>`, `activation-system-select`, `activation-confirm`, `move-panel`, `move-source-<from>`, `move-piece-<id>`,
  `move-select-all-<from>`, `move-submit-<from>`, `move-error-<from>`, `system-item-<id>[data-activatable|data-activated|data-contested|data-remote|data-region]`,
  `system-item-<id>-activate`, `leader-item-<id>[data-location]`, `hidden-base-zone[data-count]`, `game-over-banner`,
  `game-over-title`, `log-entry-<seq>[data-type|data-actor|data-auto]`, `map-legend`; `__boardDebug` — методы §9.
  Отметка базы на системе — Q-37.
- **TR-2 Конструктор состояний** (`packages/games/rebellion/test/rules/helpers.ts` или `test/rules/core/*`): `core-v1` state
  с заданными базой, юнитами/лидерами (включая сооружения и DSUC, которых нет в стартовой позиции), `round`, `passed`,
  `activation`, `revealed`; `relocateBase(S, b')` для TC-H-02.
- **TR-3 Сканер** `scanForBase(payload, baseId)` с белым списком путей (Conventions) — общий для unit/integration/e2e; e2e
  получает `baseId` без Empire-facing API (Q-35).
- **TR-4 Seed e2e-БД:** v2/v1-строки (Clarifications Q-1) до старта сервера; для сценариев 4/5b — Q-35.
- **TR-5 Инъекция сбоя** записи и подмена AI-политики (TC-P-04, TC-AI-12).
- **TR-6 Golden:** снимки в `packages/games/rebellion/test/fixtures/golden/` (+ эталонные view W5), обновление по флагу.
- **TR-7 `__boardDebug`:** `getSystemScreenPos`, `getSystemLabelRect`, `getContentBounds`, `getLod` (TC-E-12).
- **TR-8 Opt-in dev-DB тест** `SWR005_DEV_DB` (алиас `SWR004_DEV_DB`), не в `pnpm verify`; sha256 оригинала.

## Ambiguities

Не решаются QA. Q-1..Q-34 (ревизия 1) — **закрыты** ответами Analyst; ссылки — на разделы `specification.md`.

| Q | Статус | Ответ (кратко) | Где |
|---|---|---|---|
| Q-1 | resolved | генерические тесты → `core-v1`; mock — регрессия на засеянных строках; таблица замен обязательна | Clarifications → «Тесты, e2e, UX» Q-1 |
| Q-2 | resolved | `ADVANCE_PHASE`/`END_TURN` в core → `commandUnavailable` | «Правила и порядок проверок» Q-2, Q-29 |
| Q-3 | resolved | пас постоянный до конца фазы, `passed:{rebels, empire}` | Data clarifications Q-BE-2, Q-3; R-6 |
| Q-4 | resolved | `unknownLeader` / `leaderNotInPool` / `unknownSystem`; пустые строки — 400 | Q-4 |
| Q-5 | resolved | Повстанцы первыми каждый раунд | Data clarifications Q-5 |
| Q-6 | resolved | фазы назначения/обновления мгновенны; `wrongPhase` — только синтетика | Q-6 |
| Q-7 | resolved | `from === to` → `sameSystem` | Q-7 |
| Q-8 | resolved | один общий лимит мест; вместимости справочника | Data clarifications Q-8 |
| Q-9 | resolved | `[]` и дубли → 400 | Q-9 |
| Q-10 | resolved | только наземные юниты Империи, при `FINISH_ACTIVATION` | Data clarifications Q-10; R-8 |
| Q-11 | resolved | активация лидером не раскрывает | Q-11 |
| Q-12 | resolved | победа Империи — после каждого `MOVE_PIECES` любой стороны (и после раскрытия) | Q-12; R-9 |
| Q-13 | resolved | `gameOver` сразу после 400, до 409 | Q-13 |
| Q-14 | resolved | при `outcome` заслонки нет; база видна всем | Q-14 |
| Q-15 | resolved | перемещения «в/из скрытой зоны» видны Империи — допустимо | Q-15 |
| Q-16 | resolved | после раскрытия журнал без редактирования | Q-16 |
| Q-17 | resolved | логи Nest проверяются в API-тесте | Q-17 |
| Q-18 | resolved | состав модулей + нет `chooseRebelBase`/`rebelBaseCandidates` | Q-18 |
| Q-19 | resolved | каждая команда движка `+1`; `expectedVersion = view.version` | Q-19 |
| Q-20 | resolved | 8 регионов по 4, 69 рёбер, связность, Мустафар–Утапау не соседи | Data clarifications Q-20 |
| Q-21 | resolved | 18 типов, вместимости, требование места, неподвижные, ЗС подвижна | Data clarifications Q-21 |
| Q-22 | resolved | 4+4 стартовых лидера, `MM` не активирует | Data clarifications Q-22 |
| Q-23 | resolved | расстановка первой партии §4.2 | Data clarifications Q-23 |
| Q-24 | resolved | побайтно — при одинаковых `sessionId` и `now` | Q-24 |
| Q-25 | resolved | кандидаты базы по R-10 | Data clarifications Q-25 |
| Q-26 | resolved | репутация 14 → победа после 13-го обновления | Data clarifications Q-26 |
| Q-27 | resolved | нелегальный ход AI / лимит → 500, ничего не записано | Q-27 |
| Q-28 | resolved | та же сторона после обновления — без заслонки | Q-28 |
| Q-29 | resolved | core-команды в mock → `commandUnavailable` | Q-2, Q-29 |
| Q-30 | resolved | апкаст ленивый, SQL-миграции нет | Q-30 |
| Q-31 | resolved | «Продолжить» → последняя незавершённая; завершённые открываются | Q-31 |
| Q-32 | resolved | `rulesEngine` публичен: player-view, handoff-view, `details` | Q-32; AM-FE-1, AM-FE-8 |
| Q-33 | resolved | удалённость только отображается | Data clarifications Q-33 |
| Q-34 | resolved | 1440×900, 1024×768, 768×1024; en — один скриншот 1440 | Q-34, Q-FE-1 |

**Ревизия 2 (Q-35..Q-41) — закрыты** ответами Analyst (`specification.md` → «Clarifications (Analyst, 2026-11-08) — Q-35..Q-41»);
исходные формулировки вопросов — в истории git этого файла.

| Q | Статус | Ответ (кратко) | Где |
|---|---|---|---|
| Q-35 | resolved | e2e сидирует и `core-v1`-строки (seeds из `test/fixtures/core/seeds/**`); id базы — из засеянного/сохранённого state; сценарии 4 и 5b — от состояния «одна активация до раскрытия/победы» | Clarifications Q-35 |
| Q-36 | resolved | правила в `plan-backend.md` устарели — действуют spec и шапка `implementation-plan.md`; поле view `passed: {rebels, empire}` (публично) | Clarifications Q-36 |
| Q-37 | resolved | отметка базы `data-rebel-base="true"` на узле/строке системы, только для тех, кому база видна | Clarifications Q-37 |
| Q-38 | resolved | handoff-view — ровно 8 ключей `kind, id, version, activeSide, round, phase, sessionStatus, rulesEngine` | Clarifications Q-38 |
| Q-39 | resolved | других следствий нет: неподвижность по R-5 — только от лидера своей стороны в исходной системе | Clarifications Q-39 |
| Q-40 | resolved | `ACTIVATE_SYSTEM` отсутствует в `legalActions`, если в пуле нет лидера с `canActivate`; `leaderIds: []` не отдаётся | Clarifications Q-40 |
| Q-41 | resolved | `ACTIVATION_FINISHED` → `BASE_REVEALED` → `GAME_OVER` (если победа) | Clarifications Q-41 |

**Согласованные корректировки на QA_EXECUTION (2026-11-08):**
- TC-E-04: сначала (QA e2e) число юнитов зоны выводилось из сохранённого state — база могла быть в системе со стартовыми
  юнитами Повстанцев (Ботави). После решения Analyst по CODE_REVIEW #1 (кандидаты базы исключают системы со стартовыми
  юнитами Повстанцев, 9 кандидатов) зона всегда ровно 6 юнитов; e2e ужесточён: состав = сохранённому state **и** ровно 6
  (`e2e/core-hidden-base.spec.ts`, `artifacts/logs/qa-e2e-tce04.log`).
- TC-E-06/TC-E-08: видимость базы обеим сторонам на уровне API покрыта W6b (hot-seat); в e2e AI-партии — публичный `BASE_REVEALED`
  (решение Analyst «QA e2e (103/106)»). TC-E-08 — на hot-seat seed (победа Империи в AI-партии недостижима, W5 accepted).
