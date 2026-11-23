# Plan (backend + platform + game-core) — SWR-010 Card Foundation & Physical Table Sync v0

Backend Lead, TECH_PLANNING, 2026-11-23. Входы: `request.md`, `specification.md` (AC-1..AC-24, D-1..D-9, A-1..A-11),
`rules-audit.md` (§3.6, §3.7, §5, §7), код ветки `swr-009-vector-terminal` (`f3619a1`). Прецеденты: SWR-008
`plan-backend.md`, SWR-006 plans. Фронтенд (Card Hand, Card Detail, Physical Execution, setup) — план frontend-lead;
здесь — только wire-контракт для него (§9).

Решения ниже **заморожены**: воркер, которому нужно отступить от имени/сигнатуры/схемы, останавливается и пишет лиду.
Код в рамках TECH_PLANNING не менялся; команды проверок в этом этапе не запускались (план — документ).

## 0. Что проверено по коду (факты, на которые опирается план)

| Факт | Где | Следствие |
|---|---|---|
| `CoreGameStateObjectSchema` — `strictObject`, `schemaVersion: 3` общий с `mock-v1`; ленивый upcast только v1/v2 | `schema/state.ts`, `server/upcast.ts` | новые поля — **optional** (§3.1), без bump версии |
| Все события `core-v1` проходят через `finalize` (одна версия на команду) | `rules/core/helpers.ts` | задачи стола добавляются в state после `finalize` той же команды, версия не меняется второй раз (§5.4) |
| Порядок пайплайна: `gameOver → 409 → commandUnavailable → notYourSide → notYourTurn → handoff → wrongPhase` | `rules/core/apply.ts` | команды стола — отдельная ветка **до** `gameOver`/`notYourTurn` (§5.5) |
| Refresh = `endCommandPhase`: `PHASE_STARTED{refresh}`, `LEADERS_RETURNED`, `TIME_ADVANCED`, затем победа по времени или новый раунд | `rules/core/turn-flow.ts` | шаг 3 (добор зондов) вставляется между `LEADERS_RETURNED` и `TIME_ADVANCED` (§4.4) |
| Раскрытие базы — только `revealBase`, вызывается только `runStateChecks` | `rules/core/victory.ts`, `state-checks.ts` | перенос карты Location → «Rebel Base» делается в `revealBase` (§4.5) |
| Единая точка редактирования: `coreSideView`, `redactCoreEvent`, `hiddenBaseFor` | `rules/core/redact.ts` | проекции карт и стола — там же (§6) |
| Раннер останавливается, когда `pendingActor === null`; stopReason `humanTurn`, если был ≥1 шаг; `none` — если 0 | `automation-runner.service.ts` | блокировка = `pendingActor → null` при непустой очереди; новый stopReason не нужен (§5.7) |
| `SessionCommandsService.execute` после **любой** принятой команды человека вызывает `safeRun` (раннер) | `apps/api/src/sessions/session-commands.service.ts:79` | после `CONFIRM_TABLE_TASK` AI продолжает в том же запросе — изменений API нет (проверено) |
| `sessions.service.create` запускает раннер сразу после insert | `sessions.service.ts:105` | при начальной задаче стола раннер делает 0 шагов (`none`) |
| `parseRebellionSetup` → `unsupportedSetupFields`: `physical_companion` → 422 `modeUnavailable` | `rules/setup.ts`, `schema/setup.ts` | поддержка только при `opponentType: 'ai'` (§7) |
| `eligibleRebelBaseSystemIds(data)` = 9 систем (без Bothawui, DISC-007); A-7: регистрация принимает тот же набор | `schema/data.ts`, spec A-7 | ни одна допустимая система не содержит стартовых юнитов, кроме юнитов «на базе» (§5.6) |
| `apps/api/test/architecture.int.test.ts` ищет `/rebels|empire|ruleset|gameMode|faction/i` в `packages/platform/src/**` | там же, строка 14 | в `@bga/platform/cards` не использовать эти слова (в т.ч. «faction» → «side») |
| Subpath-прецедент `@bga/platform/rules-kb` (exports с условием `@bga/source` + `dist`); `apps/api` build берёт `dist` | `packages/platform/package.json`, `apps/api/tsconfig.build.json` | новый subpath `./cards` по той же схеме (§2) |
| Golden-игры (`test/server/golden.test.ts`) создают партии через `createCoreInitialState` и пишут `fixtures/core/{golden-*,views/*,seeds/*}.json` | `test/server/core-script.ts` | новые партии получат карты → golden-скрипты переводятся на «legacy-партию» (§10.3) |
| `rules-off-golden.int.test.ts` сравнивает байты запросов commander за 1 раунд (AI-Империя) | `apps/api/test` | ситуация AI получает строки о картах только при ненулевых счётчиках → раунд 1 без изменений (§8.1) |
| AI dev-диагностика (`AiDecisionDiagnosticSchema`) не содержит situation/prompt, только id правил | `packages/platform/src/ai-diagnostics.ts` | канал утечки закрыт контрактом; тест — в матрице (§10.1) |
| Pinned-запись `rebellion:impl.engine-scope` (ai:`core`) говорит «probe droids … not implemented» | `knowledge/entries/implementation-notes.json` | противоречие в промпте новых партий → Analyst question AQ-2 |

## 1. Зоны и границы

```text
@bga/platform/cards (новый subpath, чистый TS + Zod; не знает Rebellion)
  schema.ts      Card Definition / Card Type / Card Effect / Card Instance / Zone policy / Zone state / Pile / views
  shuffle.ts     seedFromString + mulberry32 + Fisher–Yates (детерминированно)
  engine.ts      createPile, shuffleZone, drawCards, moveCard, play/discard/reveal/returnCard, registerCard, restorePile
  invariants.ts  checkCardInvariants
  visibility.ts  projectZones (зритель → зоны со счётчиками; содержимое скрытых/упорядоченных зон не выдаётся)
packages/games/rebellion/src/schema   cards.ts (зоны Rebellion, состояние/вид карт), card-catalog.ts (31 зонд + типы),
                                      table.ts (задачи стола), state.ts/view.ts/commands.ts/errors.ts/setup.ts (+поля)
packages/games/rebellion/src/rules/core
  cards.ts       initCoreCards, drawProbeCards, revealLocationCard, validate/applyRegisterLocation, coreCardsView
  table.ts       initialTableState, tasksFromEvents, validate/applyConfirmTask, tableViewFor
  create.ts / turn-flow.ts / victory.ts / apply.ts / legal.ts / redact.ts — интеграция
packages/games/rebellion/src/ai/describe.ts   строки о картах в situation (только свои + публичные счётчики)
packages/games/rebellion/src/server/automation.ts   pendingActor → null при непустой очереди задач
apps/api/src/**   БЕЗ изменений (проверено §0); только новые/обновлённые тесты apps/api/test
```

Границы: `@bga/platform/cards` не импортирует ничего, кроме `zod`; правила Rebellion — единственное место, где
решается легальность карточных переходов (операции платформы проверяют только механику зон); проекции — только в
`rules/core/redact.ts` (вызывая `projectZones` и `tableViewFor`); задачи стола строятся только из событий,
отредактированных для человека (`corePlayerEvents(..., human)`).

## 2. Платформа: `@bga/platform/cards`

### 2.1 Сущности (AC-2)

- **Card Type Definition** — уровень типа (зонд, миссия, …): статус каталога `tracked | deferred`.
- **Card Definition** — одна карта каталога: стабильный id, игра, набор правил, тип, область (side id или `shared`),
  название (i18n-ключ), игровые параметры, условия использования (i18n-ключи), источники, статус проверки, ссылка на эффект.
- **Card Effect** — что карта делает: `none` (розыгрыша нет), `not-implemented` (эффект есть, движок его не исполняет),
  `implemented` (+ `mechanicId`). В v0 есть только `none`.
- **Card Instance** — физический экземпляр: `{ id, definitionId }`. Экземпляры фиксируются при создании колоды.
- **Card Zone** — политика (статический код игры: kind/owner/visibility/ordered/accepts/maxCards) + состояние
  (хранится: id, authority, упорядоченный список instance id).
- **Card Pile** — хранимое состояние: все экземпляры + все зоны (раскладка игры).

Политика зоны: `kind ∈ deck|hand|discard|inPlay|revealed|removed|special`; `owner` — opaque side id или `null`;
`visibility`: `public` (все видят содержимое), `owner` (владелец видит содержимое, остальные — счётчик), `hidden`
(никто не видит содержимое, только счётчик); `ordered` (порядок значим; `deck ⇒ ordered`); `acceptsTypeIds`;
`maxCards`. **Authority** (`digital | physical`) — в состоянии зоны, потому что зависит от партии (D-4).

### 2.2 Операции (AC-5): чистые, без исключений для недопустимых переходов

Все функции: вход не мутируется; результат `CardResult` = `{ ok: true, pile, moved }` | `{ ok: false, error }`;
при ошибке вход возвращать не нужно (вызывающий его и так держит). Исключение бросается только при битом вызове
программиста (неизвестная раскладка в `ctx` — нет, это тоже ошибка-результат; throw только при нарушении типов TS,
которые Zod не пропустит).

| Функция | Проверки (ошибка → `code`) | Эффект |
|---|---|---|
| `createPile(ctx, {instances, placement, authority})` | неизвестная зона `unknownZone`; дубли экземпляров `duplicateInstance`; экземпляр не размещён `cardLost`; размещён неизвестный `unknownCard`; тип не принимается `typeNotAccepted`; переполнение `zoneFull`; нет authority для зоны `unknownZone` | новая колода; зоны в порядке раскладки |
| `shuffleZone(pile, ctx, zoneId, seed)` | `unknownZone`; зона не `ordered` → `zoneNotOrdered` | детерминированная перестановка (§2.3) |
| `drawCards(pile, ctx, {from, to, count, allowShort})` | `unknownZone`; `sameZone`; `from` не ordered → `zoneNotOrdered`; `count < 0` → `invalidCount`; не хватает и `!allowShort` → `insufficientCards`; тип/ёмкость приёмника | берёт сверху (`cards[0..]`), кладёт в конец приёмника; `moved` = взятые id по порядку |
| `moveCard(pile, ctx, {instanceId, from, to, position?})` | `unknownZone`; `sameZone`; `unknownCard`; `cardNotInZone`; `typeNotAccepted`; `zoneFull` | `position: 'top'|'bottom'` (по умолчанию `bottom`) значим только для ordered-приёмника |
| `playCard` / `discardCard` / `revealCard` / `returnCard` | как `moveCard` + приёмник обязан быть `inPlay` / `discard` / `revealed` / `deck` → иначе `wrongZoneKind` | обёртки над `moveCard` |
| `registerCard(pile, ctx, {definitionId, from, to})` | `unknownZone`; приёмник не `physical` → `notPhysicalZone`; в `from` нет экземпляра этого определения → `cardNotInZone`; тип/ёмкость | регистрация по идентичности (Physical Hand): берёт экземпляр с данным `definitionId` из любой позиции `from` |
| `restorePile(raw, ctx)` | Zod-схема + `checkCardInvariants` | «восстановление после перезапуска»: `{ok, pile}` или `{ok:false, issues}` |
| `checkCardInvariants(pile, ctx)` | — | `CardInvariantIssue[]`: зона раскладки отсутствует/лишняя, экземпляр в двух местах, потерян, неизвестен, тип не принят, переполнение, дубли id экземпляров |
| `projectZones(pile, ctx, viewer, {revealZoneIds?})` | — | `CardZoneView[]` (§2.4) |

`ctx: CardEngineContext = { layout: readonly CardZonePolicy[]; typeOfDefinition(definitionId: string): string | undefined }`.
Ошибки — `CardError = { code: CardErrorCode; zoneId?: string; instanceId?: string; definitionId?: string }` — внутренние:
наружу (wire) они никогда не уходят, Rebellion переводит их в свои `messageKey` с эхом полей запроса.

### 2.3 Детерминированное перемешивание (AC-4, AC-17)

`seedFromString(seed)` = FNV-1a 32 по UTF-16 code units (своя реализация в платформе, не импорт из Rebellion);
`mulberry32(seed)`; Fisher–Yates от конца: `j = floor(rng() * (i + 1))`. Алгоритм заморожен тест-вектором
(`seededShuffle(['a'..'j'], 'x')` → зафиксированный массив). Порядок хранится в состоянии, поэтому смена алгоритма в
будущем не ломает сохранённые партии, но ломает replay создания — менять только с новой версией каталога.

### 2.4 Проектор видимости

Зона выдаётся **всегда** (все зоны раскладки, в её порядке) со счётчиком `count`. Поле `cards`:

- `null`, если `ordered && visibility !== 'public'` — **порядок колоды не выдаётся никому, даже владельцу** (AC-8);
- иначе список, если `visibility === 'public'`, или `visibility === 'owner' && viewer === owner`, или `id ∈ revealZoneIds`;
- иначе `null`;
- порядок выдачи: ordered-public — порядок хранения; неупорядоченные — сортировка по `instanceId` (порядок хранения,
  т.е. порядок добора, не утекает).

`viewer = null` — публичная проекция (AC-9).

## 3. Rebellion: каталог, состояние, инициализация

### 3.1 Состояние: optional-поля, без bump `schemaVersion` (D-3, AC-16)

В `CoreGameStateObjectSchema` добавляются **два optional-поля**: `cards?: CoreCardsState`, `table?: CoreTableState`.

Почему не bump до `schemaVersion: 4`: версия 3 общая для `mock-v1`/`core-v1`; bump заставил бы upcast каждой строки
и переписывать смысл «legacy» через синтетические значения; optional-поле аддитивно — legacy-JSON парсится в тот же
объект, `JSON.stringify(parse(raw))` байт-равен (поле отсутствует, Zod его не добавляет), строки при чтении не
переписываются, `version` не меняется. Отсутствие поля и есть флаг «карты в этой партии не отслеживаются»
(rules-audit §7 п.4: выбран вариант «явный флаг legacy», без реконструкции колоды — реконструкция выдумала бы порядок
колоды и меняла бы ход старой партии). В хранилище допустимо только «нет поля» (не `null`) — одно представление.
Ограничение: код из `main` (без SWR-010) не прочитает новые строки (strict) — ветка не вливается, downgrade не
поддерживается (риск RK-6).

Инварианты (в `checkCoreInvariants`, W2):
- `table !== undefined ⇔ settings.gameMode === 'physical_companion'`; `physical_companion ⇒ opponentType === 'ai' && cards !== undefined`;
- `cards`: `checkCardInvariants` пуст; `catalogId` известен; экземпляров ровно 31;
- `rebels-location` ≤ 1 карты; если не пуста — её `params.systemId === rebelBase.systemId`;
- `rebelBase.revealed ⇒` `rebels-location` пуста и `rebels-base-revealed` = `[probe-<base>#1]`; `!revealed ⇒ rebels-base-revealed` пуста;
- `table.baseRegistration !== null ⇔` в очереди есть задача `registerBase` `⇔` (`cards` есть и `rebels-location` пуста и `!revealed`);
  `baseRegistration !== null ⇒ playerFaction === 'rebels'`;
- id задач уникальны.

`mock-v1` не меняется (новые команды → 422 `commandUnavailable` уже по `MOCK_COMMAND_TYPES`).

### 3.2 Каталог (AC-2, AC-3) — `src/schema/card-catalog.ts` (публичные данные, web-safe)

- `REBELLION_CARD_CATALOG_ID = 'rebellion-cards-v1'`, `gameId: 'rebellion'`, `editionId: 'base'`.
- Типы (`CardTypeDefinition`): `probe` (`tracked`, `verified`, sources KB `rebellion:cards.probe`, book RR p.10);
  `mission`, `project`, `action`, `objective`, `tactic` — `deferred`, verification по `rules-audit.md` §3.1–3.5
  (`verified` для существования типа), sources — KB-id из аудита, **пустой каталог карт** (AC-3, rules-audit §7 п.7).
- Эффект: `{ id: 'no-play', status: 'none', mechanicId: null, summaryKey: 'cards.effects.no-play' }`.
- 31 карта зондов: для каждого `CORE_SYSTEM_IDS` кроме `coruscant`, в порядке `CORE_SYSTEM_IDS`:
  `{ id: 'probe-<systemId>', gameId: 'rebellion', editionId: 'base', typeId: 'probe', scope: 'shared',
  nameKey: 'systems.<systemId>', params: { systemId }, usageKeys: ['cards.usage.probe-refresh-draw',
  'cards.usage.probe-base-location'], sources: [{kind:'kb', id:'rebellion:cards.probe'}, {kind:'book', sourceId:'RR', page:10, section:'Probe Cards'}],
  verification: 'verified', effectId: 'no-play' }`.
- `FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS = ['corellia','mandalore','saleucami','sullust','mustafar']`
  (KB `rebellion:setup.first-game-rebels`; тест: равно `coreStartSetup.baseIneligibleSystemIds − coruscant`).
- Каталог парсится `CardCatalogSchema` при загрузке модуля (fail fast); тест-снимок id (стабильность, AC-2).
- Название карты = название системы: i18n-ключ `systems.<id>` **переиспользуется** (новых переводов имён нет).

### 3.3 Зоны Rebellion (`src/schema/cards.ts`, `REBELLION_CARD_ZONES`)

| id | kind | owner | visibility | ordered | accepts | maxCards | authority |
|---|---|---|---|---|---|---|---|
| `probe-deck` | deck | null | hidden | true | probe | null | digital (всегда, D-4/A-10) |
| `probe-box` | removed | null | public | false | probe | null | digital |
| `rebels-location` | special | rebels | owner | false | probe | 1 | **physical** iff `physical_companion` и человек = Повстанцы; иначе digital |
| `rebels-base-revealed` | revealed | rebels | public | false | probe | 1 | digital |
| `empire-probes` | hand | empire | owner | false | probe | null | digital (A-6: добранные зонды остаются у Империи, сброса нет) |

Id экземпляра: `probe-<systemId>#1`. i18n зон: `cards.zones.<zoneId>`; типов: `cards.types.<typeId>`.
Id зон/карт — kebab (без точек), чтобы годились как сегмент i18n-ключа.

### 3.4 Инициализация в `createCoreGame` (AC-4)

`initCoreCards({ gameId, settings, baseSystemId, registrationPending })` (W3, `rules/core/cards.ts`):
1. экземпляры — 31 в порядке каталога;
2. `probe-box` ← 5 карт первой партии;
3. `rebels-location` ← `[probe-<base>#1]`, если `!registrationPending`; иначе пусто;
4. `probe-deck` ← остальные (25 или 26) в порядке каталога, затем `shuffleZone(seed = '<gameId>|probe-deck|init')`;
5. `empire-probes`, `rebels-base-revealed` — пусты; authority по таблице §3.3.

`registrationPending = gameMode === 'physical_companion' && playerFaction === 'rebels'`. Тогда база в состоянии —
**предварительная** (`chooseRebelBase`, как сейчас), её карта лежит в колоде, Location пуст; база фиксируется командой
регистрации (§5.6). Новых событий создания нет (лог `GAME_CREATED`, `PHASE_STARTED×2` неизменен).

Таблица стола при `physical_companion` — `initialTableState(...)` из W4 (§5.3); `create.ts` (W3) вызывает её.

### 3.5 Refresh шаг 3 (D-7, AC-6, A-8)

В `endCommandPhase` после `LEADERS_RETURNED`, до `TIME_ADVANCED`, **только если `state.cards` есть**:
`drawCards(from 'probe-deck', to 'empire-probes', count 2, allowShort true)`; если взято ≥1 — событие
`CARDS_DRAWN { side:'empire', fromZoneId:'probe-deck', toZoneId:'empire-probes', count, definitionIds }`, `actor: 'system'`;
0 карт (колода пуста, A-8) — без события. Старые партии (без `cards`) ничего не добирают. Порядок событий Refresh:
`PHASE_STARTED{refresh} → LEADERS_RETURNED → [CARDS_DRAWN] → TIME_ADVANCED → (GAME_OVER | PHASE_STARTED{assignment} → PHASE_STARTED{command})`.

### 3.6 Раскрытие базы

`revealBase` (victory.ts): если `cards` есть — `revealCard(location → rebels-base-revealed)` (одна карта). Событие
`BASE_REVEALED` прежнее (отдельного события о карте нет). Победа по времени без раскрытия: карта остаётся в Location,
но после конца партии видна всем (§6, Q-14).

## 4. Rebellion: события и проекции

### 4.1 Новые события (полные — в state; view-формы — с редактированием)

| type | actor | payload (state) | view: что редактируется |
|---|---|---|---|
| `CARDS_DRAWN` | `system` | `{ side, fromZoneId, toZoneId, count, definitionIds }` | `definitionIds → null`, если зритель ≠ `side` (count открыт, A-9) |
| `CARD_REGISTERED` | `rebels` | `{ zoneId: 'rebels-location', definitionId }` | `definitionId → null`, пока `hiddenBaseFor(state, viewer)` (до раскрытия/конца партии) |
| `TABLE_TASK_CONFIRMED` | человек | `{ taskId, kind }` | не редактируется (публично) |

Добавляются в `CoreEventSchema`, `GameEventSchema`, `CoreViewEventSchema`, `PlayerEventSchema`.

### 4.2 Четыре представления (AC-9)

| Представление | Функция | Где используется |
|---|---|---|
| Человека | `coreSideView(state, playerFaction)` → `cards` = `coreCardsView(state, viewer)`, `table` = `tableViewFor(state, viewer)` | `toPlayerView`, ответы команд, GET |
| AI-стороны | `coreSideView(state, aiSide)` (тот же код, другой зритель; `table: null`, т.к. задачи — только человеку) | `automation.decisionPoint` → `buildDecision` |
| Публичное | `corePublicCardsView(state)` = `projectZones(pile, ctx, null)` (только public-зоны со списками, остальные — счётчики) | тесты утечек как эталон; везде, где нет конкретного зрителя (сейчас — нигде в wire; `summarize` карт не содержит) |
| Журнал / стол | `corePlayerEvents(events, state, human)` → `tasksFromEvents` | лог в view, события ответов, задачи стола |

`coreCardsView(state, viewer)`: `null` без `state.cards`; иначе `projectZones(pile, ctx, viewer, { revealZoneIds })`,
где `revealZoneIds = ['rebels-location']`, если `!hiddenBaseFor(state, viewer)` (Повстанцы всегда; Империя — после
раскрытия или конца партии). `empire-probes` у Повстанцев — всегда счётчик. `probe-deck` — всегда счётчик.

## 5. Physical Sync v0

### 5.1 Режим

`physical_companion` поддерживается **только** при `opponentType: 'ai'` (`rulesEngine` новых партий всегда `core-v1`);
hot-seat → 422 `SETUP_UNSUPPORTED` `errors.modeUnavailable`; `rise-of-the-empire` → как раньше (D-8).

### 5.2 Задача стола

Хранится в `state.table.tasks` (очередь, голова = `[0]`), **строится один раз** из представления человека и
дальше не меняется (содержит только то, что человек мог видеть в момент создания; после раскрытия старые задачи не
«дораскрываются»). Форма — §11 `TableTaskSchema`: `id` (`t-<version>-<n>`), `kind`, `actor`, `titleKey`
(`table.tasks.<kind>`), `createdAtVersion`, `affected` (карты/лидеры/юниты/системы; `null`-система = клетка
«Rebel Base»), `steps[]` (`key` = `table.steps.<step>`, `params`), `completion: 'confirm' | 'register'`.

### 5.3 Какие переходы порождают задачи (AC-11, D-6, A-5, A-10)

Начальные (`initialTableState(settings, eligibleSystemIds)`, версия 1):

| Человек | Очередь |
|---|---|
| Повстанцы | `t-1-1` `initialSetup` (`setupFirstGame`, `removeProbeCards{definitionIds:5}`, `setAsideReferenceStack`) → `t-1-2` `registerBase` (`registerBaseCard`, completion `register`) |
| Империя | `t-1-1` `initialSetup` (`setupFirstGame`, `removeProbeCards`, `placeLocationPlaceholder`, `setAsideReferenceStack`) |

После каждой принятой команды (любого origin) при `state.table`: `tasksFromEvents(events, nextState, human, version)`
по событиям, **отредактированным для человека** (`corePlayerEvents`), в порядке событий:

| Событие(я) | Условие | Задача / шаги |
|---|---|---|
| `SYSTEM_ACTIVATED` | `actor = AI` | `aiActivation`: `placeLeader{leaderId, systemId|null}` |
| `PIECES_MOVED` | `actor = AI` | `aiMove`: `moveUnits{unitIds, fromSystemId|null, toSystemId|null}` |
| `PHASE_STARTED{refresh}` … `TIME_ADVANCED` (подряд, `actor: system`) | всегда | **одна** `refresh`: `returnLeaders{leaderIds}` (если не пусто), шаг добора (если был `CARDS_DRAWN`): человек-Империя → `takeProbeCards{definitionIds}` (из справочной стопки, A-10); человек-Повстанцы → `opponentDrewProbeCards{count}` (информационный); `advanceTime{from,to}` |
| `BASE_REVEALED` | всегда | `baseRevealed`: человек-Империя → `revealBase{systemId}` + `moveBaseUnits{systemId}` (взять карту системы из справочной стопки на «Rebel Base», убрать заглушку); человек-Повстанцы → `revealOwnBase{systemId}` + `moveBaseUnits{systemId}` |
| `ACTIVATION_FINISHED`, `PASSED`, `PHASE_STARTED{assignment/command}`, `GAME_OVER`, `CARD_REGISTERED`, `TABLE_TASK_CONFIRMED`, любые события `actor = человек` | — | нет задачи (A-5; у паса/завершения в v0 нет физических последствий) |

Добор зондов — шаг задачи `refresh`, а не отдельная задача (AQ-1). Человек сам исполняет свои ходы; системные
последствия его команд (Refresh после его паса, раскрытие базы после его `FINISH_ACTIVATION`) — задачи.
`digital` → `state.table` нет → задач нет.

### 5.4 Подтверждение (AC-12)

`CONFIRM_TABLE_TASK { taskId }`: головная задача с `completion: 'confirm'` → удаляется из очереди; событие
`TABLE_TASK_CONFIRMED`; `version + 1`; **больше ничего не меняется** (тест: `next` = `prev` с иным `version`, `log`,
`table.tasks`). Повтор того же запроса: устаревший `expectedVersion` → 409; со свежей версией → 422
`tableTaskNotFound`. Не голова → 422 `tableTaskNotHead`; голова `registerBase` → 422 `tableTaskNeedsRegistration`.
Подтверждение допускается и после `outcome` (дочистить стол после последнего хода, AQ-3).

### 5.5 Пайплайн `applyCoreCommand` (W4)

```text
CONFIRM_TABLE_TASK | REGISTER_CARD  →  ветка стола (до gameOver):
  409 VERSION_CONFLICT
  → нет state.table: CONFIRM → 422 commandUnavailable; REGISTER → 422 registrationUnavailable
  → notYourSide (origin 'auto' или actor ≠ settings.playerFaction)
  → CONFIRM: tableTaskNotFound → tableTaskNotHead → tableTaskNeedsRegistration → apply
  → REGISTER: gameOver → registrationUnavailable (нет baseRegistration или zoneId ≠ 'rebels-location')
              → unknownCard (definitionId не карта зонда каталога) → cardNotEligible (система ∉ eligibleSystemIds) → apply
остальные команды (как сейчас):
  gameOver → 409 → commandUnavailable → notYourSide → [NEW] tableSyncPending (table?.tasks.length > 0)
  → notYourTurn → handoff … → wrongPhase → собственные проверки
после перехода: runStateChecks → (FINISH: handOver) → finalize → [NEW] если state.table: tasks += tasksFromEvents(...)
```

`details` ошибок — только эхо запроса (`{taskId}`, `{zoneId, definitionId}`, `{actor}`), никогда данных состояния.

### 5.6 Регистрация Location (Physical Hand, AC-10, A-7)

`REGISTER_CARD { zoneId: 'rebels-location', definitionId }` — только человек-Повстанцы в `physical_companion`, пока
`table.baseRegistration !== null` (а значит до любого другого действия Повстанцев: остальные команды отклоняются
`tableSyncPending`, AI заблокирован очередью). Допускается при любой позиции задачи `registerBase` в очереди (AQ-7).
`applyRegisterLocation` (W3, `cards.ts`):
1. `registerCard(pile, {definitionId, from:'probe-deck', to:'rebels-location'})` (приёмник physical — иначе ошибка
   платформы = ошибка программиста → защищено проверкой `registrationUnavailable` выше);
2. `shuffleZone('probe-deck', seed '<gameId>|probe-deck|registered')` (правило setup 9: колода мешается после выбора);
3. `rebelBase.systemId = params.systemId`; все юниты Повстанцев в предварительной системе базы → новая система
   (до регистрации ходов нет, а допустимые системы не содержат других стартовых юнитов, §0 — точное множество; при
   нарушении — throw как порча состояния);
4. событие `CARD_REGISTERED`; W4 удаляет задачу `registerBase`, `baseRegistration = null`; `runStateChecks` (ничего не
   меняет: допустимые системы без имперских юнитов).
Повторная регистрация → 422 `registrationUnavailable`. `digital`, человек-Империя → 422 `registrationUnavailable`.

### 5.7 Блокировка AI и раннер (AC-13, AC-14)

- `server/automation.ts` `pendingAiSide`: `state.table && state.table.tasks.length > 0 → null` (до проверки стороны).
  Следовательно `decisionPoint`/платные вызовы не делаются, `applyCandidate` → `notYourTurn`.
- `coreLegalActions`: при непустой очереди → `[]` для любого зрителя (согласовано с 422 `tableSyncPending`).
- **stopReason: переиспользуем `humanTurn`** (новое значение не добавляем). Обоснование: платформенная семантика
  «дальше должен действовать человек» точно описывает ожидание подтверждения; новое значение потребовало бы метода
  в `GameAutomation`, чтобы раннер отличал причину, + правок web (`commitCommandResult`), при этом клиент и так знает
  причину из `view.table` (`tasks.length > 0`, `aiWaiting`). После шага AI, создавшего задачу, раннер видит
  `pendingActor = null` → `humanTurn`; если команда человека сама создала задачу (Refresh), раннер делает 0 шагов → `none`.
  `SessionResponse.automation.pending = false`, пока очередь не пуста → клиент не зовёт `automation/run`.
- `CONFIRM` последней задачи → `execute` → `safeRun` → AI продолжает в том же запросе (§0, проверено по коду).
- Восстановление: очередь — часть `Session.state`; после рестарта/перезагрузки GET отдаёт тот же `view.table`,
  `pending: false`.

## 6. Секреты: что где скрыто (сводка для тестов)

| Секрет | Кому скрыт | Механизм |
|---|---|---|
| Location AI-Повстанцев (база) | человеку-Империи до раскрытия/конца | `hiddenBaseFor` → Location-зона `cards: null` (count 1, A-9); `CARD_REGISTERED` не бывает у AI; задачи — из отредактированных событий (`null`-системы); `initialSetup` — заглушка, без системы |
| Location человека-Повстанца | AI-Империи до раскрытия/конца | то же; `CARD_REGISTERED.definitionId → null` для Империи |
| Зонды AI-Империи | человеку-Повстанцу (навсегда в v0) | `empire-probes` owner-only; `CARDS_DRAWN.definitionIds → null`; задача — `opponentDrewProbeCards{count}` |
| Зонды человека-Империи | AI-Повстанцам | то же, зритель — AI |
| Порядок и состав колоды | всем, включая Империю | `probe-deck` ordered+hidden → `cards: null` всегда |
| Предварительная база | AI-Империи | AI не ходит до регистрации; ни одно событие её не называет |

## 7. Setup

`SUPPORTED_GAME_MODES = ['digital', 'physical_companion']`; `unsupportedSetupFields(input: Pick<RebellionSetupInput,
'ruleset' | 'gameMode' | 'opponentType'>)`: `gameMode` неподдержан, если режим не в списке **или**
`physical_companion && opponentType === 'human'`. Новая функция `isSupportedGameModeFor(mode, opponentType)` (web-safe,
`./schema`) — для формы FE. Порядок ошибок прежний (ruleset раньше gameMode; `details.unsupported`).

## 8. AI Commander (D-9, AC-18, A-11)

### 8.1 Situation (`ai/describe.ts`)

Новая секция только при `view.cards !== null`, **строки печатаются только при ненулевых счётчиках** (раунд 1 и
legacy-партии дают байт-идентичный SWR-008 текст → `rules-off-golden` и детерминизм AI без изменений):
- Империя, если в `empire-probes` ≥1 карта: `Your probe cards (the Rebel base is NOT in these systems): <systemIds>.`
  и `Probe deck: <n> cards left.`;
- Повстанцы, если у Империи ≥1 зонд: `The Empire holds <n> probe cards (each names a system that is not your base); probe deck: <m> cards left.`
Источник — только `view.cards` своей стороны (собственные `cards` + счётчики). Секция ≤ 600 символов (`SECTION_MAX`),
общий лимит 4000 не меняется. Карт соперника там нет по построению (их нет в view).

### 8.2 Кандидаты, rulesQuery, бюджет

- Кандидаты и `fallbackCandidateId` — без изменений (карточных действий нет; бот зонды не использует, A-11).
  «Список допустимых карточных действий пуст» — фиксируется тестом: `decision.point.candidates` не содержит типов
  `REGISTER_CARD`/`CONFIRM_TABLE_TASK`; `isBotCommand` их не принимает.
- `rulesQuery` — без изменений (новый тег добавил бы ~400 символов правил при запасе ~330, SWR-008 §0.1).
- Бюджет, fallback, лимиты промпта, `AutomationFallbackCodeSchema` — без изменений. Реальных вызовов OpenAI в тестах нет
  (fake fetch, как в SWR-008).
- Подсказка «Possible base locations» (intel) не учитывает зонды — осознанно (A-11), риск RK-5.

## 9. Wire / API (для frontend-lead)

Изменений в `apps/api/src` и `@bga/platform` sessions/automation-контрактах **нет**. Меняются только схемы игры:

- `CorePlayerView` + `cards: CoreCardsView | null` (null = партия без карт), `table: TableView | null`
  (null = не `physical_companion` или зритель не человек). Оба поля **обязательные** (nullable) — FE-фикстуры
  (`apps/web/src/games/rebellion/test/coreFixtures.ts`) и эталонные `views/*.json` получают `cards: null, table: null`.
- События: `CARDS_DRAWN`, `CARD_REGISTERED`, `TABLE_TASK_CONFIRMED` (view-формы §11) — нужны i18n и исчерпывающие switch в web.
- Команды: `CONFIRM_TABLE_TASK { taskId }`, `REGISTER_CARD { zoneId: 'rebels-location', definitionId }` через тот же
  `POST /api/sessions/:id/commands` (`actor` = сторона человека, `expectedVersion`).
- Ошибки (422 ILLEGAL_COMMAND, `errors.<name>`): `tableSyncPending`, `tableTaskNotFound`, `tableTaskNotHead`,
  `tableTaskNeedsRegistration`, `registrationUnavailable`, `unknownCard`, `cardNotEligible`.
- Setup: `physical_companion` + `opponentType: 'ai'` → 201; + human → 422 `errors.modeUnavailable`.
- Automation summary: без изменений; при ожидании подтверждения `stopReason: 'humanTurn'` (после шагов AI) или `'none'`,
  `pending: false`. Статус «AI ждёт подтверждения» = `view.table.aiWaiting`.
- Предварительная база: пока `view.table.registration !== null`, `view.rebelBase.systemId` у человека-Повстанца —
  подсказка сервера, **не** выбранная база; UI показывает «база не зарегистрирована» и список
  `registration.eligibleDefinitionIds` (AQ-4).
- Каталог для Card Hand / Card Detail: `REBELLION_CARD_CATALOG`, `REBELLION_CARD_ZONES` из `@bga/game-rebellion/schema`
  (web-safe, публичные данные); view ссылается на `definitionId`.
- i18n-ключи (namespace данных игры, как `systems.*`): `cards.types.<typeId>`, `cards.zones.<zoneId>`,
  `cards.effects.no-play`, `cards.usage.probe-refresh-draw`, `cards.usage.probe-base-location`,
  `table.tasks.<kind>` (6), `table.steps.<step>` (14, список — `TABLE_STEP_KEYS` §11), имена карт — `systems.<systemId>`.
- `summarize` (`details`) — без изменений (карт нет).

## 10. Тестовая стратегия

### 10.1 Матрица утечек (AC-7, AC-8, AC-15, AC-18, AC-23) — поиск по сериализованному JSON

Секреты: **S1** база/Location AI-Повстанцев (до раскрытия); **S2** зонды AI-Империи; **S3** рука человека для AI
(Location человека-Повстанца для AI-Империи; зонды человека-Империи для AI-Повстанцев); **S4** состав/порядок колоды
(всем); **S5** предварительная/зарегистрированная база человека для AI-Империи. Токены поиска: `probe-<id>`,
`probe-<id>#1` (а для S1/S5 — инвариантность к базе, как в SWR-005: две партии, различающиеся только базой, дают
одинаковый JSON канала).

| Канал \ секрет | S1 | S2 | S3 | S4 | S5 | Тест (владелец) |
|---|---|---|---|---|---|---|
| view (GET, `toPlayerView`) | ✓ | ✓ | — | ✓ | — | `test/rules/core/cards-visibility.test.ts` (W3), `apps/api/test/cards-hidden-info.int.test.ts` (W5) |
| ответ команды (view + events) | ✓ | ✓ | — | ✓ | — | W5 int |
| `automation/run` ответ | ✓ | ✓ | — | ✓ | — | W5 int |
| лог в view (redact событий) | ✓ | ✓ | ✓ | ✓ | ✓ | `cards-events-redaction.test.ts` (W3) |
| задачи стола (`view.table`) | ✓ | ✓ | — | ✓ | — | `table-tasks.test.ts` (W4) + W5 int |
| сводка сессии (`GET /api/sessions`) | ✓ | ✓ | — | ✓ | — | W5 int |
| `decisionPoint` (situation/candidates/rulesQuery) | — | — | ✓ | ✓ | ✓ | `test/ai/describe-cards.test.ts`, `test/server/automation-cards.test.ts` (W5) |
| промпт OpenAI (fake fetch, тело запроса) | — | — | ✓ | ✓ | ✓ | `apps/api/test/cards-commander.int.test.ts` (W5) |
| dev-диагностика `/api/dev/ai/sessions/:id/decisions` | ✓ | ✓ | ✓ | ✓ | ✓ | W5 int |
| 422-ответы (`details`) | ✓ | ✓ | ✓ | ✓ | ✓ | W4 unit + W5 int |
| лог сервера (automation sink) | ✓ | ✓ | ✓ | ✓ | ✓ | W5 int (sink-перехватчик) |

S4 сильная форма: id ни одной карты, лежащей в `probe-deck`, не встречается ни в одном клиентском payload (для любой
стороны); все `CardZoneView` с `id === 'probe-deck'` имеют `cards: null`.

### 10.2 Deck Engine (AC-5) и детерминизм (AC-4, AC-17)

- W1: table-тесты каждой операции (успех + каждая ошибка, вход не мутирован, `deepFreeze`); property-тест: 500
  случайных последовательностей операций (seeded) → после каждой `checkCardInvariants` пуст, мультимножество
  экземпляров неизменно; тест-вектор shuffle; `projectZones` (ordered-hidden → `null` даже владельцу; сортировка
  unordered); граница платформы (нет `GAME_TERMS`, импорт только `zod`).
- W3: две инициализации с одинаковым `gameId` → байт-равные `cards`; разные `gameId` → разный порядок; 5+1+25=31.
- W5: replay — одна последовательность команд от одного начального состояния дважды → байт-равные состояния;
  round-trip через репозиторий (`cards`, `table`) без потерь.

### 10.3 Регрессия старых партий (AC-16)

- **R1** все существующие `core-v1` фикстуры (golden `finalState`, seeds, upcast-v3) парсятся; `JSON.stringify(parse(x)) === JSON.stringify(x)` (W2).
- **R2** legacy-партия: Refresh без `CARDS_DRAWN`; view `cards: null, table: null`; все команды как раньше (W3).
- **R3** golden-скрипты (`core-script.ts start`) создают партию и **удаляют `cards`/`table`** (= legacy-партия) →
  `golden-*.json`, `seeds/*.json` байт-равны; `views/*.json` меняются только добавлением `"cards": null, "table": null`
  (объяснить в review). Новый golden `golden-cards-rebels-time.json` (с картами, 13 Refresh, исчерпание колоды A-8) (W3).
- **R4** API: GET legacy-строки не меняет `state`/`version`/`updatedAt`; команда на legacy-строке пишет state без `cards` (W5).
- **R5** mock-v1, v1/v2 upcast без изменений; новые команды на mock-v1 → 422 `commandUnavailable` (W2).
- **R6** AI на legacy и в раунде 1 новых партий: `decisionPoint` байт-равен прежнему; `rules-off-golden` зелёный (W5).
- `base-invariance.test.ts` / `automation-hidden-base.test.ts`: подделка базы на состояниях с картами должна менять и
  Location (обмен карты Location с картой колоды на той же позиции); сравнение — до первого Refresh (после Refresh
  виды законно различаются: зонды зависят от базы). Владельцы: W3 / W5.

## 11. Contracts (Zod, заморожено)

### 11.1 `@bga/platform/cards` (W1)

```ts
import { z } from 'zod';

export const CARD_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const CardIdSchema = z.string().regex(CARD_ID_PATTERN); // card, type, effect, zone, mechanic ids
export const CardInstanceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}#[1-9][0-9]{0,2}$/);
export const CardI18nKeySchema = z.string().regex(/^[a-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){1,4}$/);
/** Opaque side id of the game (never interpreted by the platform). */
export const CardSideSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
export const CardScopeSchema = z.union([CardSideSchema, z.literal('shared')]);

export const CardSourceRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('kb'), id: z.string().min(1).max(128) }),
  z.strictObject({
    kind: z.literal('book'),
    sourceId: z.string().min(1).max(32),
    page: z.int().positive(),
    section: z.string().min(1).max(80).optional(),
  }),
]);
export const CardVerificationSchema = z.enum(['verified', 'needs-review', 'unverified']);
export const CardCatalogStatusSchema = z.enum(['tracked', 'deferred']);
export const CardEffectStatusSchema = z.enum(['none', 'not-implemented', 'implemented']);
export const CardParamValueSchema = z.union([z.string().max(64), z.number(), z.boolean(), z.null()]);

export const CardEffectSchema = z
  .strictObject({
    id: CardIdSchema,
    status: CardEffectStatusSchema,
    /** Non-null exactly when `implemented`. */
    mechanicId: CardIdSchema.nullable(),
    /** Own short description (never rights-holder text). */
    summaryKey: CardI18nKeySchema,
  })
  .superRefine((e, ctx) => {
    if ((e.mechanicId !== null) !== (e.status === 'implemented'))
      ctx.addIssue({ code: 'custom', path: ['mechanicId'], message: 'mechanicId iff implemented' });
  });

export const CardTypeDefinitionSchema = z.strictObject({
  id: CardIdSchema,
  gameId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  nameKey: CardI18nKeySchema,
  descriptionKey: CardI18nKeySchema,
  scope: CardScopeSchema,
  catalogStatus: CardCatalogStatusSchema,
  verification: CardVerificationSchema,
  sources: z.array(CardSourceRefSchema).min(1),
});

export const CardDefinitionSchema = z.strictObject({
  id: CardIdSchema,
  gameId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  typeId: CardIdSchema,
  scope: CardScopeSchema,
  nameKey: CardI18nKeySchema,
  params: z.record(CardIdSchema, CardParamValueSchema),
  usageKeys: z.array(CardI18nKeySchema),
  sources: z.array(CardSourceRefSchema).min(1),
  verification: CardVerificationSchema,
  effectId: CardIdSchema,
});

/** superRefine: unique ids per list; card.typeId/effectId resolve; card.gameId/editionId = catalog's;
 *  a `deferred` type has no cards. */
export const CardCatalogSchema = z.strictObject({
  id: CardIdSchema,
  gameId: z.string().min(1).max(64),
  editionId: z.string().min(1).max(64),
  types: z.array(CardTypeDefinitionSchema).min(1),
  effects: z.array(CardEffectSchema),
  cards: z.array(CardDefinitionSchema),
}); // .superRefine(checkCatalog)

export const CardInstanceSchema = z.strictObject({ id: CardInstanceIdSchema, definitionId: CardIdSchema });

export const CardZoneKindSchema = z.enum(['deck', 'hand', 'discard', 'inPlay', 'revealed', 'removed', 'special']);
export const CardZoneVisibilitySchema = z.enum(['public', 'owner', 'hidden']);
export const CardAuthoritySchema = z.enum(['digital', 'physical']);

/** Static policy (game code). superRefine: visibility 'owner' ⇒ owner !== null; kind 'deck' ⇒ ordered. */
export const CardZonePolicySchema = z.strictObject({
  id: CardIdSchema,
  kind: CardZoneKindSchema,
  owner: CardSideSchema.nullable(),
  visibility: CardZoneVisibilitySchema,
  ordered: z.boolean(),
  acceptsTypeIds: z.array(CardIdSchema).min(1),
  maxCards: z.int().positive().nullable(),
});

/** Stored. `cards[0]` = top of an ordered zone. */
export const CardZoneStateSchema = z.strictObject({
  id: CardIdSchema,
  authority: CardAuthoritySchema,
  cards: z.array(CardInstanceIdSchema),
});
export const CardPileSchema = z.strictObject({
  instances: z.array(CardInstanceSchema),
  zones: z.array(CardZoneStateSchema),
});

// ---- views ----
export const CardRefViewSchema = z.strictObject({ instanceId: CardInstanceIdSchema, definitionId: CardIdSchema });
/** `cards: null` = contents not visible to this viewer (always null for ordered non-public zones). */
export const CardZoneViewSchema = z
  .strictObject({
    id: CardIdSchema,
    kind: CardZoneKindSchema,
    owner: CardSideSchema.nullable(),
    visibility: CardZoneVisibilitySchema,
    ordered: z.boolean(),
    authority: CardAuthoritySchema,
    count: z.int().nonnegative(),
    cards: z.array(CardRefViewSchema).nullable(),
  })
  .superRefine((z0, ctx) => {
    if (z0.cards !== null && z0.cards.length !== z0.count)
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'cards.length must equal count' });
    if (z0.cards !== null && z0.ordered && z0.visibility !== 'public')
      ctx.addIssue({ code: 'custom', path: ['cards'], message: 'hidden order is never projected' });
  });

// ---- engine (types) ----
export type CardErrorCode =
  | 'unknownZone' | 'unknownCard' | 'cardNotInZone' | 'cardLost' | 'duplicateInstance' | 'sameZone'
  | 'zoneNotOrdered' | 'wrongZoneKind' | 'typeNotAccepted' | 'zoneFull' | 'insufficientCards'
  | 'invalidCount' | 'notPhysicalZone';
export interface CardError { code: CardErrorCode; zoneId?: string; instanceId?: string; definitionId?: string }
export type CardResult = { ok: true; pile: CardPile; moved: string[] } | { ok: false; error: CardError };
export interface CardEngineContext {
  layout: readonly CardZonePolicy[];
  typeOfDefinition(definitionId: string): string | undefined;
}
export interface CardInvariantIssue { code: CardErrorCode | 'missingZone' | 'extraZone'; zoneId?: string; instanceId?: string }

export function createPile(ctx: CardEngineContext, input: {
  instances: readonly CardInstance[];
  placement: Readonly<Record<string, readonly string[]>>;
  authority: Readonly<Record<string, CardAuthority>>;
}): CardResult;
export function shuffleZone(pile: CardPile, ctx: CardEngineContext, zoneId: string, seed: string): CardResult;
export function drawCards(pile: CardPile, ctx: CardEngineContext,
  a: { from: string; to: string; count: number; allowShort: boolean }): CardResult;
export function moveCard(pile: CardPile, ctx: CardEngineContext,
  a: { instanceId: string; from: string; to: string; position?: 'top' | 'bottom' }): CardResult;
export function playCard(...same as moveCard): CardResult;    // to.kind === 'inPlay'
export function discardCard(...same): CardResult;              // to.kind === 'discard'
export function revealCard(...same): CardResult;               // to.kind === 'revealed'
export function returnCard(...same): CardResult;               // to.kind === 'deck'
export function registerCard(pile: CardPile, ctx: CardEngineContext,
  a: { definitionId: string; from: string; to: string }): CardResult;
export function restorePile(raw: unknown, ctx: CardEngineContext):
  { ok: true; pile: CardPile } | { ok: false; issues: CardInvariantIssue[] };
export function checkCardInvariants(pile: CardPile, ctx: CardEngineContext): CardInvariantIssue[];
export function projectZones(pile: CardPile, ctx: CardEngineContext, viewer: string | null,
  options?: { revealZoneIds?: readonly string[] }): CardZoneView[];
export function seedFromString(seed: string): number;
export function seededShuffle<T>(items: readonly T[], seed: string): T[];
```

`packages/platform/package.json` exports: `"./cards": { "@bga/source": "./src/cards/index.ts", "types":
"./dist/cards/index.d.ts", "default": "./dist/cards/index.js" }`. Из `@bga/platform` (корня) не реэкспортируется.

### 11.2 Rebellion: `schema/cards.ts`, `schema/card-catalog.ts` (W2)

```ts
export const REBELLION_CARD_CATALOG_ID = 'rebellion-cards-v1';
export const REBELLION_CARD_ZONE_IDS = ['probe-deck', 'probe-box', 'rebels-location', 'rebels-base-revealed', 'empire-probes'] as const;
export type RebellionCardZoneId = (typeof REBELLION_CARD_ZONE_IDS)[number];
export const REBELLION_CARD_ZONES: readonly CardZonePolicy[]; // table §3.3, in this order
export const REBELLION_CARD_TYPE_IDS = ['probe', 'mission', 'project', 'action', 'objective', 'tactic'] as const;
export const REBELLION_CARD_CATALOG: CardCatalog;          // parsed at load (§3.2)
export const FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS: readonly CoreSystemId[];
export function probeDefinitionId(systemId: string): string;          // 'probe-<systemId>'
export function probeInstanceId(systemId: string): string;            // 'probe-<systemId>#1'
export function probeSystemOf(definitionId: string): string | null;   // catalog lookup, null if not a probe card
export const rebellionCardEngineContext: CardEngineContext;

export const CoreCardsStateSchema = z.strictObject({
  catalogId: z.literal(REBELLION_CARD_CATALOG_ID),
  pile: CardPileSchema,
});
export const CoreCardsViewSchema = z.strictObject({
  catalogId: z.literal(REBELLION_CARD_CATALOG_ID),
  /** Every zone of REBELLION_CARD_ZONES, in that order. */
  zones: z.array(CardZoneViewSchema),
});
```

### 11.3 Rebellion: `schema/table.ts` (W2)

```ts
export const TABLE_TASK_KINDS = ['initialSetup', 'registerBase', 'aiActivation', 'aiMove', 'refresh', 'baseRevealed'] as const;
export const TableTaskKindSchema = z.enum(TABLE_TASK_KINDS);
export const TABLE_STEP_KEYS = [
  'table.steps.setupFirstGame',          // {}
  'table.steps.removeProbeCards',        // { definitionIds: string[] }
  'table.steps.setAsideReferenceStack',  // {}
  'table.steps.placeLocationPlaceholder',// {}
  'table.steps.registerBaseCard',        // {}
  'table.steps.placeLeader',             // { leaderId, systemId: string|null }
  'table.steps.moveUnits',               // { unitIds: string[], fromSystemId: string|null, toSystemId: string|null }
  'table.steps.returnLeaders',           // { leaderIds: string[] }
  'table.steps.takeProbeCards',          // { definitionIds: string[] }   (human Empire only)
  'table.steps.opponentDrewProbeCards',  // { count: number }             (human Rebels only)
  'table.steps.advanceTime',             // { from: number, to: number }
  'table.steps.revealBase',              // { systemId }  (AI Rebels' base, human Empire)
  'table.steps.revealOwnBase',           // { systemId }  (human Rebels)
  'table.steps.moveBaseUnits',           // { systemId }
] as const;
export const TableParamValueSchema = z.union([z.string(), z.int(), z.null(), z.array(z.string())]);
export const TableStepSchema = z.strictObject({
  key: z.enum(TABLE_STEP_KEYS),
  params: z.record(z.string().regex(/^[a-zA-Z]{1,32}$/), TableParamValueSchema),
});
export const TableTaskSchema = z.strictObject({
  id: z.string().regex(/^t-[1-9][0-9]*-[1-9][0-9]*$/),
  kind: TableTaskKindSchema,
  actor: ActorSchema,                       // 'rebels' | 'empire' | 'system'
  titleKey: z.string().regex(/^table\.tasks\.[a-zA-Z]+$/), // `table.tasks.<kind>`
  createdAtVersion: z.int().positive(),
  affected: z.strictObject({
    cardDefinitionIds: z.array(CardIdSchema),
    leaderIds: z.array(z.string()),
    unitIds: z.array(z.string()),
    /** `null` = the "Rebel Base" space (hidden zone of the viewer). */
    systemIds: z.array(z.string().nullable()),
  }),
  steps: z.array(TableStepSchema).min(1),
  completion: z.enum(['confirm', 'register']), // 'register' only for kind 'registerBase'
});
export const CoreTableStateSchema = z.strictObject({
  tasks: z.array(TableTaskSchema),
  baseRegistration: z.strictObject({ eligibleSystemIds: z.array(z.string().min(1)).min(1) }).nullable(),
});
export const TableViewSchema = z.strictObject({
  tasks: z.array(TableTaskSchema),
  /** Queue non-empty, game running and the AI side is the active side. */
  aiWaiting: z.boolean(),
  registration: z
    .strictObject({ zoneId: z.literal('rebels-location'), eligibleDefinitionIds: z.array(CardIdSchema).min(1) })
    .nullable(),
});
```

### 11.4 Rebellion: state, view, events, commands, errors, setup (W2)

```ts
// state.ts — CoreGameStateObjectSchema += (optional, never null in storage)
cards: CoreCardsStateSchema.optional(),
table: CoreTableStateSchema.optional(),

// events (state)
export const CardsDrawnEventSchema = z.strictObject({ ...eventBase, type: z.literal('CARDS_DRAWN'), actor: z.literal('system'),
  payload: z.strictObject({ side: FactionSchema, fromZoneId: CardIdSchema, toZoneId: CardIdSchema,
    count: z.int().positive(), definitionIds: z.array(CardIdSchema).min(1) }) }); // refine: definitionIds.length === count
export const CardRegisteredEventSchema = z.strictObject({ ...eventBase, type: z.literal('CARD_REGISTERED'), actor: FactionSchema,
  payload: z.strictObject({ zoneId: CardIdSchema, definitionId: CardIdSchema }) });
export const TableTaskConfirmedEventSchema = z.strictObject({ ...eventBase, type: z.literal('TABLE_TASK_CONFIRMED'),
  actor: FactionSchema, payload: z.strictObject({ taskId: z.string(), kind: TableTaskKindSchema }) });
// view forms
export const CardsDrawnViewEventSchema = CardsDrawnEventSchema.extend({ payload: z.strictObject({ side: FactionSchema,
  fromZoneId: CardIdSchema, toZoneId: CardIdSchema, count: z.int().positive(), definitionIds: z.array(CardIdSchema).nullable() }) });
export const CardRegisteredViewEventSchema = CardRegisteredEventSchema.extend({
  payload: z.strictObject({ zoneId: CardIdSchema, definitionId: CardIdSchema.nullable() }) });
// CoreEventSchema / GameEventSchema += 3 state forms; CoreViewEventSchema / PlayerEventSchema += view forms (+ TableTaskConfirmed as is)

// view.ts — CorePlayerViewSchema +=
cards: CoreCardsViewSchema.nullable(),
table: TableViewSchema.nullable(),

// commands.ts
export const ConfirmTableTaskCommandSchema = z.strictObject({ type: z.literal('CONFIRM_TABLE_TASK'), taskId: z.string().min(1).max(32) });
export const RegisterCardCommandSchema = z.strictObject({ type: z.literal('REGISTER_CARD'), zoneId: CardIdSchema, definitionId: CardIdSchema });
// CommandSchema += both; CORE_COMMAND_TYPES += 'CONFIRM_TABLE_TASK', 'REGISTER_CARD'; MOCK_COMMAND_TYPES unchanged

// errors.ts — REBELLION_ERROR_MESSAGE_KEYS += (appended last)
tableSyncPending: 'errors.tableSyncPending',
tableTaskNotFound: 'errors.tableTaskNotFound',
tableTaskNotHead: 'errors.tableTaskNotHead',
tableTaskNeedsRegistration: 'errors.tableTaskNeedsRegistration',
registrationUnavailable: 'errors.registrationUnavailable',
unknownCard: 'errors.unknownCard',
cardNotEligible: 'errors.cardNotEligible',

// setup.ts
export const SUPPORTED_GAME_MODES = Object.freeze(['digital', 'physical_companion'] as const);
export function isSupportedGameModeFor(mode: GameMode, opponentType: OpponentType): boolean; // physical ⇒ 'ai'
export function unsupportedSetupFields(input: Pick<RebellionSetupInput, 'ruleset' | 'gameMode' | 'opponentType'>): UnsupportedSetupField[];
```

### 11.5 Rebellion rules (внутренние сигнатуры, W3/W4)

```ts
// rules/core/cards.ts (W3)
export function initCoreCards(a: { gameId: string; settings: RebellionSettings; baseSystemId: string;
  registrationPending: boolean }): CoreCardsState;                       // throws only on programmer error
export function drawProbeCards(t: Transition): Transition;               // no-op without state.cards / empty deck
export function revealLocationCard(t: Transition): Transition;           // no-op without state.cards
export function validateRegisterLocation(state: CoreGameState, actor: Faction, c: RegisterCardCommand): CoreError | null;
export function applyRegisterLocation(state: CoreGameState, actor: Faction, c: RegisterCardCommand): Transition; // cards+base+units+event
export function coreCardsView(state: CoreGameState, viewer: Faction): CoreCardsView | null;
export function corePublicCardsView(state: CoreGameState): CoreCardsView | null;
// rules/core/table.ts (W4)
export function initialTableState(settings: RebellionSettings, eligibleSystemIds: readonly string[]): CoreTableState;
export function tasksFromEvents(events: readonly CoreEvent[], state: CoreGameState, human: Faction, version: number): TableTask[];
export function validateConfirmTask(state: CoreGameState, c: ConfirmTableTaskCommand): CoreError | null;
export function applyConfirmTask(state: CoreGameState, actor: Faction, c: ConfirmTableTaskCommand): Transition;
export function completeRegistration(t: Transition): Transition;        // removes 'registerBase', baseRegistration = null
export function tableViewFor(state: CoreGameState, viewer: Faction): TableView | null;
export function tableBlocks(state: CoreGameState): boolean;              // table?.tasks.length > 0
```

## 12. Persistence

Prisma-миграция **не нужна**: `Session.state` — JSON-текст, `SessionEvent` хранит `type` строкой (SQLite без enum);
новые поля/события — внутри JSON. `apps/api/prisma/dev.db` и бэкапы не трогаются. Если воркер всё же обнаружит
необходимость миграции — стоп, эскалация лиду; до любой миграции — свежая копия `dev.db` (`dev.pre-swr010-<ts>.db`).
Рост строки: ~31 экземпляр + 5 зон ≈ 2–3 КБ; очередь задач — единицы задач.

## 13. Воркеры, владение файлами, зависимости

```text
W1 platform-cards ──► W2 rebellion-contracts ──┬──► W3 card-engine ──┐
                                                └──► W4 table-sync ───┼──► W5 ai-server-api ──► Lead INTEGRATION
                     (W4.REGISTER использует W3.applyRegisterLocation; W3.create.ts вызывает W4.initialTableState)
```

Правило передачи файлов: W2 вправе вносить в `rules/core/redact.ts`, `rules/core/apply.ts`,
`rules/mock-player-view.ts`, `src/ai/**` **только** заглушки для исчерпывающих `switch`/обязательных полей
(`cards: null`, `table: null`; новые события редактируются консервативно — `definitionIds/definitionId → null` для
всех; новые команды → 422 `commandUnavailable`), чтобы `typecheck` был зелёным. После сдачи W2 эти файлы переходят
к W3 (redact.ts), W4 (apply.ts), W5 (src/ai/**). Связка `create.ts → initialTableState`: если W3 сдаёт раньше W4,
вызов добавляет лид на INTEGRATION (одна строка); если позже — W3 сам.

Команды (перед pnpm всегда `source ~/.nvm/nvm.sh && nvm use 22.23.5`):

### W1 — platform cards
- OWNED: `packages/platform/src/cards/**` (new), `packages/platform/test/cards/**` (new), `packages/platform/package.json` (только exports `./cards`).
- DONE WHEN: контракты §11.1 реализованы; тесты §10.2 (W1) зелёные; нет слов `rebels|empire|ruleset|gameMode|faction`
  и Rebellion-понятий (`probe`, `location`, `base`) в `src/cards/**` (тест); импорт только `zod`; `dist/cards/*` собирается.
- Tests: `pnpm --filter @bga/platform test`, `pnpm --filter @bga/platform typecheck`, `pnpm --filter @bga/platform lint`, `pnpm --filter @bga/platform build`.

### W2 — Rebellion contracts (после W1)
- OWNED: `packages/games/rebellion/src/schema/{cards.ts,card-catalog.ts,table.ts}` (new), `src/schema/{state.ts,view.ts,commands.ts,errors.ts,setup.ts,index.ts}`,
  `src/rules/setup.ts`; заглушки по правилу передачи; tests: `test/schema/card-catalog.test.ts`, `test/schema/cards-state.test.ts`,
  `test/schema/legacy-core.test.ts` (new), существующие тесты, проверявшие 422 для `physical_companion` (поиск `physical_companion` в `test/**`).
- DONE WHEN: §11.2–11.4 точно как в плане; каталог 31 зонд + 5 deferred-типов проходит `CardCatalogSchema`, снимок id;
  `FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS` = `baseIneligibleSystemIds − coruscant`; инварианты §3.1 (позитив/негатив);
  R1, R5; setup: physical+ai → ok, physical+human → unsupported; `pnpm --filter @bga/game-rebellion typecheck` и весь пакет зелёные.
- Tests: `pnpm --filter @bga/game-rebellion test`, `pnpm --filter @bga/game-rebellion typecheck`, `pnpm --filter @bga/game-rebellion lint`.

### W3 — card engine in core-v1 (после W2; параллельно W4)
- OWNED: `src/rules/core/{cards.ts (new), create.ts, turn-flow.ts, victory.ts, redact.ts, index.ts}`;
  tests: `test/rules/core/{cards-init,cards-refresh,cards-reveal,cards-register,cards-visibility,cards-events-redaction}.test.ts` (new),
  `test/server/{core-script.ts,core-scenarios.ts,golden.test.ts,base-invariance.test.ts}`, `test/fixtures/core/**`.
- DONE WHEN: AC-4 (5+1+25, детерминизм), AC-6 (добор 2, A-8 исчерпание, legacy — нет добора), раскрытие переносит
  карту, регистрация §5.6 (base/units/deck/reshuffle/event), проекции §4.2 + строки W3 матрицы §10.1, R2, R3;
  `cards: null`/`table` проекция для legacy; event-редакция `CARDS_DRAWN`/`CARD_REGISTERED`.
- Tests: `pnpm --filter @bga/game-rebellion test` (golden без `UPDATE_GOLDEN`; при регенерации `views/*.json` — diff только `cards`/`table: null`, приложить в отчёт).

### W4 — physical table sync (после W2; параллельно W3)
- OWNED: `src/rules/core/{table.ts (new), apply.ts, legal.ts}`; tests: `test/rules/core/{table-init,table-tasks,table-confirm,table-register-pipeline,table-blocking}.test.ts` (new),
  `test/server/physical-seeds.test.ts` (new, пишет `test/fixtures/core/seeds/physical-*.json` по `UPDATE_GOLDEN=1`, как golden).
- DONE WHEN: §5.3 (каждая строка таблицы — тест для обеих сторон человека, задачи только из отредактированных событий:
  S1/S2 в задачах отсутствуют), §5.4 (ровно `version/log/table` меняются; повтор → 409/422), §5.5 порядок ошибок
  (table-тест на каждую ветку), AC-10 (регистрация, повтор, digital/Империя → 422), AC-13 (legal `[]`, `tableSyncPending`),
  `digital` → задач нет; seeds для e2e (`physical-rebels-registration`, `physical-empire-ai-task-pending`).
- Tests: `pnpm --filter @bga/game-rebellion test`.

### W5 — AI, automation, API integration (после W3 и W4; `describe.ts` можно начать после W2)
- OWNED: `src/ai/describe.ts` (+ `src/ai/**` для исчерпывающих switch), `src/server/automation.ts`,
  `test/ai/describe-cards.test.ts` (new), `test/ai/**` фикстуры видов, `test/server/{automation.test.ts,automation-hidden-base.test.ts,automation-cards.test.ts (new),server-module.test.ts}`;
  `apps/api/test/{cards-hidden-info,physical-sync,legacy-core-cards,cards-persistence,cards-commander}.int.test.ts` (new) и правки
  существующих `apps/api/test/*.int.test.ts`, если они перечисляют команды/ошибки/поля view; при одобрении AQ-2 —
  `packages/games/rebellion/knowledge/entries/implementation-notes.json` (+ `discrepancies.json`/`coverage.json`, если валидатор требует).
  `apps/api/src/**` — **не менять** (если понадобится — стоп, к лиду).
- DONE WHEN: §5.7 (pendingActor null при очереди; раннер `humanTurn`/`none`; после CONFIRM AI продолжает в том же
  запросе — int-тест; рестарт приложения с задачей → GET тот же `table`, `pending:false` — AC-14); §8 (строки
  ситуации, R6, кандидаты без карточных типов); вся матрица §10.1 (int-каналы); R4; AC-17 round-trip/replay; AC-22
  (201/422 setup); fake fetch, без сети.
- Tests: `pnpm --filter @bga/game-rebellion test`, `pnpm --filter @bga/api test`, `pnpm --filter @bga/api typecheck`.

### Lead INTEGRATION
`pnpm verify` (lint, typecheck, test, build, check:bundle, e2e) — e2e и web-части зависят от FE; `check:bundle`: новых
правил не требуется (каталог — публичные данные в `./schema`; инициализация/перемешивание/выбор базы — в `./rules`,
закрыто проверкой композиции модулей), это подтверждается прогоном, а не планом.

## 14. Analyst questions

- **AQ-1 (D-6/AC-11).** Добор зондов — шаг задачи `refresh`, не отдельная задача (одно подтверждение на Refresh; для
  человека-Повстанца — информационный шаг `opponentDrewProbeCards`). Альтернатива: отдельная задача `probeDraw`
  (+1 подтверждение за раунд). По умолчанию — шаг.
- **AQ-2 (D-9, KB).** Pinned-запись `rebellion:impl.engine-scope` (в каждом rules-on промпте) и `impl.refresh-partial`
  утверждают, что зондов нет — в новых партиях это противоречит ситуации. Предложение: W5 правит тексты (короткая фраза
  «в партиях с картами Империя в Refresh тянет 2 зонда; других эффектов карт нет»), DISC-003 → частично закрыт;
  меняются байты rules-on промптов (rules-off golden не затронут). Нужно согласие Analyst (KB — источник истины правил).
  Без согласия — KB не трогаем, противоречие фиксируется как known limitation.
- **AQ-3.** `CONFIRM_TABLE_TASK` разрешён после конца партии (дочистить стол). Альтернатива — очищать очередь при
  `outcome`. По умолчанию — разрешён.
- **AQ-4 (D-4/A-7).** До регистрации у человека-Повстанца в состоянии есть предварительная база (подсказка
  `chooseRebelBase`), т.к. `rebelBase.systemId` обязателен; UI обязан показывать «не зарегистрирована». Альтернатива
  (nullable база в состоянии) ломает инварианты и SWR-005/008 код. По умолчанию — предварительная база.
- **AQ-5 (D-9).** Строки о картах в ситуации AI печатаются только при ненулевых счётчиках (раунд 1 без изменений,
  rules-off golden зелёный). Константа «у Повстанцев 1 карта Location» не печатается. По умолчанию — так.
- **AQ-6 (AC-13).** stopReason переиспользует `humanTurn` (обоснование §5.7). По умолчанию — так.
- **AQ-7 (AC-10).** `REGISTER_CARD` принимается при любой позиции задачи `registerBase` в очереди (не только голова).
  По умолчанию — так.
- **AQ-8 (D-6).** Одна задача на каждую команду AI с физическими последствиями (активация, каждое перемещение) →
  несколько подтверждений за ход AI. Склейка «активация + перемещения» потребовала бы, чтобы AI ходил дальше до
  подтверждения, что противоречит D-6. По умолчанию — по задаче на команду.

## 15. Risks

- **RK-1 (R-2).** Утечка через новые поля → единая точка (`redact.ts` + `tasksFromEvents` от отредактированных событий),
  матрица §10.1, сильная форма S4.
- **RK-2 (R-4).** Golden/фикстуры: `views/*.json` и web-фикстуры получают `cards/table: null`; golden-игры остаются
  legacy через удаление полей в скрипте → регенерация только `views/*.json`, объясняется в review.
- **RK-3.** Base-invariance тесты с картами: подделка базы должна менять Location; после Refresh виды законно
  различаются — тесты ограничены до первого Refresh (§10.3).
- **RK-4 (R-3).** Вечная блокировка: каждая задача подтверждаема одной командой, `registerBase` — командой регистрации;
  инвариант «registerBase ⇔ baseRegistration»; CONFIRM разрешён после конца партии.
- **RK-5 (A-11).** AI-Империя видит зонды в промпте, а intel/«Possible base locations» их не учитывает → возможна
  несогласованность для модели; бот не меняется. Улучшение intel — следующая задача.
- **RK-6.** Код `main` не прочитает строки с `cards`/`table` (strict) — ветка не вливается; dev.db с новыми партиями
  не совместима назад.
- **RK-7.** Размер ситуации: секция карт ≤ 600 символов, общий лимит 4000 — проверить тестом на максимальной руке (25+ зондов → список с `(+N more)`).
- **RK-8.** Объём W3/W4 вокруг `create.ts`/`apply.ts`: перекрёстные вызовы зафиксированы сигнатурами §11.5; одна строка
  связки — на лиде.

## 16. Решения Analyst по AQ-1..AQ-8 (2026-11-23)

- AQ-1 — принято: добор зондов — шаг задачи Refresh.
- AQ-2 — **одобрено**: переформулировать `rebellion:impl.engine-scope` и `rebellion:impl.refresh-partial` своими словами
  (зонды в Refresh добираются; остальные карточные механики отсутствуют). Изменение байтов rules-on промпта допустимо,
  отражается в review и delivery-report; бюджет/fallback не меняются.
- AQ-3 — принято (= spec C-5). AQ-4 — принято (UI: «база не зарегистрирована»). AQ-5 — принято. AQ-6 — принято
  (`humanTurn`; в UI статус ожидания берётся из `view.table`, а не из stopReason). AQ-7 — принято. AQ-8 — принято.
- **W1-Q1 (Analyst, 2026-11-23):** поле `rulesetId` переименовано в `editionId` во всём плане (TC-A-01 запрещает слово
  «ruleset» в `packages/platform/src`; архитектурный тест не ослабляем). Rebellion заполняет `editionId: 'base'`.
- **W1-Q2:** маппинг ошибок схемы в `restorePile` (`zones`→`unknownZone`, `instances`→`unknownCard`, иначе
  `missingZone`) принят; новый код в контракт не добавляем.
- **W2-Q1 (Analyst):** ключ параметра зонда — `system-id` (`PROBE_SYSTEM_PARAM`); система читается только через
  `probeSystemOf(definitionId)`. Регекс платформы не ослабляем.
- **W2-Q2:** вынужденные правки W2 вне списка (rules-provider test, 2 api int-теста, view fixtures W3,
  `coreFixtures.ts`) приняты; их ревьюит reviewer как часть W2.
- **W2-Q3:** авторитет зон (§3.3) обрабатывает W3 в `initCoreCards`.
