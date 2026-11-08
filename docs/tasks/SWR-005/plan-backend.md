# Plan — backend (SWR-005 / TECH_PLANNING)

Автор: backend-lead, 2026-11-08. Основа: `specification.md` (draft; Rules R-1..R-10, D-1..D-5, Contract, AC-01..AC-16),
`request.md`, `docs/architecture/{application,adding-a-game,blueprint}.md`, формат `docs/tasks/SWR-004/plan-backend.md`,
фактический код `main` @ `ddfa4db` (`packages/games/rebellion/**`, `packages/platform/**`, `apps/api/**`, `eslint.config.mjs`,
`scripts/check-web-bundle.mjs`).
**Справочник `docs/game-rules/rebellion-reference.md` на момент планирования отсутствует** (папка `docs/game-rules/` пуста):
структуры данных спроектированы обобщённо, ни одна характеристика юнита/соседство/расстановка здесь не выдумана — нужные
факты перечислены в §9 (Q-BE-1) и заполняются worker'ом W2 строго из справочника.
Расхождения с контрактом — только в §10 «Proposed amendments» (AM-BE-n). Документ — только дизайн: код не пишется.

## 0. Ключевые решения (кратко)

| # | Решение | Почему |
|---|---|---|
| BD-1 | `GameState` v3 = **дискриминированное объединение по `rulesEngine`**: `MockGameStateV3` (= v2 + `rulesEngine:'mock-v1'`) и `CoreGameStateV3`. Обе `schemaVersion: 3`. Хранимый setup остаётся v2 (не менялся; константы версий state/setup разделены). | Два движка без «полиморфных» полей; mock не развивается. |
| BD-2 | Статические данные партии `core-v1` (регионы, системы с соседством/удалённостью, каталог типов юнитов) **копируются в state при создании** (как карта в mock). Правила остаются `(state, envelope, ctx)` без инъекции данных; снимок самодостаточен для replay; правка данных PO влияет только на новые партии. | Чистые правила, ESLint B-5 не трогаем, детерминизм воспроизведения (blueprint §8.3). |
| BD-3 | Данные базовой игры — `src/scenario/core/**` (server-only, Zod-схемы в `src/schema/data.ts`). **Место базы в данных не хранится вообще**: оно вычисляется при создании `chooseRebelBase(sessionId, candidates)` (FNV-1a) и живёт только в state. Координаты 32 систем — `src/board/core-layout.ts`. | `check:bundle`: секрета в статических данных нет; scenario/rules в бандл не попадают (module check). |
| BD-4 | Повстанческие юниты/лидеры в системе базы хранятся с настоящим `systemId`; «зона базы» — **только проекция во view** Империи до раскрытия (`location: {kind:'rebelBase'}`, в событиях `systemId: null`). Одна функция редактирования. | Правила работают по реальной топологии; секрет режется в одной точке. |
| BD-5 | AI авто-пас: политика — чистая функция в `./ai` (видит только `CorePlayerView` своей стороны), цикл — `src/server/auto-play.ts`, каждый ход — `applyCommand` с `ctx.origin = 'auto'`; всё внутри **одного** `module.applyCommand` → один commit, одна версия ответа. Создание AI-партии за Империю: цикл в `createInitialState` (версия становится 2). | Без изменения платформы; тот же движок/журнал; атомарность даёт существующий commit. |
| BD-6 | Платформа: `ServerGameModule.statusOf(state): SessionStatus` (обязательный метод); сервис команд пишет статус в том же `commit`. **Миграции нет** (колонка `status` есть). | AC-13; платформа не знает фракций/победы. |
| BD-7 | Порядок проверок `core-v1`: 400 → **422 `gameOver`** → 409 → 422 `commandUnavailable` → `notYourSide` → `notYourTurn` → hot-seat → `wrongPhase` → проверки команды. «Всё или ничего»: отказ — результат, state не мутируется. | AC-04/05/07; партия окончена — версия не важна (AM-BE-3). |
| BD-8 | Работа в **одном рабочем дереве**: фазы строго по порядку, внутри фазы файлы не пересекаются; владение файлом может переходить только между фазами (§7). | Ограничение брифа (без worktree). |

---

## 1. State v3

### 1.1 Схемы (`packages/games/rebellion/src/schema/`)

```ts
// settings.ts — версии разделены (setup не менялся)
export const REBELLION_SETUP_SCHEMA_VERSION = 2;           // Session.setup (было REBELLION_SCHEMA_VERSION)
export const REBELLION_STATE_SCHEMA_VERSION = 3;           // снимок state
// REBELLION_SCHEMA_VERSION удаляется; все места переводятся на одну из двух констант (W1).

// enums.ts
export const RulesEngineSchema = z.enum(['mock-v1', 'core-v1']);
export const UnitArenaSchema = z.enum(['space', 'ground']);
export const UnitMobilitySchema = z.enum(['mobile', 'immobile']);   // immobile = сооружение
export const OutcomeReasonSchema = z.enum(['timeReachedReputation', 'rebelBaseCaptured']);
export const CommandOriginSchema = z.enum(['player', 'auto']);      // только ctx, никогда не из запроса

// data.ts (NEW) — типы статических данных (сами данные — ./scenario/core)
RegionDataSchema   = strict { id }                                   // i18n regions.<id>
SystemDataSchema   = strict { id, regionId, adjacentSystemIds: string[], remote: boolean }   // i18n systems.<id>
UnitTypeSchema     = strict { typeKey /* unit.<faction>.<slug> */, owner: Faction, arena: UnitArena,
                              mobility: UnitMobility, transportCapacity: int≥0, requiresTransport: boolean,
                              revealsRebelBase: boolean /* R-8, только для empire; по справочнику */ }
LeaderDataSchema   = strict { id /* i18n leaders.<id> */, owner: Faction }
StartPlacementSchema = discriminatedUnion('kind', [
                       { kind:'system', systemId }, { kind:'rebelBase' } ])   // rebelBase → система, выбранная при создании
StartSetupSchema   = strict { startingTime: int≥1 /* =1 по R-1 */, startingReputation: int≥1,
                              units: { typeKey, at: StartPlacement }[], leaders: string[] /* стартовый пул */,
                              rebelBaseCandidates: string[] }
CoreDataSchema     = strict { id /* 'rebellion-base-v1' */, regions, systems, unitTypes, leaders, startSetup }
                     .superRefine(integrity)  // ниже
```
`integrity` (генерическая, без «32»): уникальные id; `regionId` существует; соседство симметрично, без петель и дублей,
ссылки существуют; `typeKey` уникальны и префикс совпадает с `owner`; стартовые юниты ссылаются на существующие типы/системы,
`kind:'rebelBase'` — только для юнитов повстанцев; лидеры стартового пула существуют; `rebelBaseCandidates` непусты,
существуют и **не содержат систем со стартовыми юнитами Империи**; `startingTime < startingReputation`.
Числа «32 системы / 8 регионов» проверяет тест данных (AC-01), не схема (иначе будущие наборы данных ломаются).

```ts
// state.ts — v3
MockGameStateV3Schema = <GameStateSchema v2>.extend({ schemaVersion: z.literal(3), rulesEngine: z.literal('mock-v1') })
                        // + прежний refine (AI: player active, no handoff); log: MockEvent[] (5 типов v2)

CoreUnitSchema   = strict { id /* 'u-NN', непрозрачный */, owner, typeKey, systemId }
CoreLeaderSchema = strict { id, owner, systemId: string | null }             // null = в пуле владельца
ActivationSchema = strict { side, leaderId, systemId }
OutcomeSchema    = strict { winner: Faction, reason: OutcomeReason }

CoreGameStateV3Schema = strict {
  schemaVersion: 3, rulesEngine: 'core-v1',
  id, version, settings, activeSide, handoffPending,          // как v2 (семантика hot-seat SWR-004)
  scenarioId: string,                                         // CoreData.id, из которого создана партия
  round: int≥1,                                               // = позиция маркера времени (R-1)
  reputation: int≥1,                                          // маркер репутации (в срезе неподвижен)
  phase: Phase,                                               // в сохранённом state: 'command'; 'refresh' только при outcome
  consecutivePasses: 0 | 1,                                   // 2 никогда не сохраняется — сразу конец фазы (R-6)
  activation: Activation | null,                              // текущая активация активной стороны
  map: { regions: RegionData[], systems: SystemData[] },      // копия данных (BD-2)
  unitTypes: UnitType[],                                      // копия каталога (BD-2)
  units: CoreUnit[], leaders: CoreLeader[],
  rebelBase: { systemId: string, revealed: boolean },         // systemId всегда задан в полном state
  outcome: Outcome | null,
  log: CoreEvent[],
}.superRefine(coreInvariants)

GameStateSchema = z.discriminatedUnion('rulesEngine', [MockGameStateV3Schema, CoreGameStateV3Schema])
```
`coreInvariants` (проверяется при `parseState`, т. е. для каждого **сохранённого** state):
- `activation ⇒ activation.side === activeSide`, лидер активации стоит в `activation.systemId`;
- все `systemId` юнитов/лидеров/активации/базы — системы из `map`; `typeKey` юнитов — из `unitTypes`;
- `outcome === null ⇒ phase === 'command'`; `outcome !== null ⇒ activation === null && handoffPending === false`;
- AI-партия: `handoffPending === false`; `outcome === null ⇒ activeSide === settings.playerFaction`
  (переходные состояния внутри цикла авто-хода (§4) не сохраняются и не парсятся);
- `rebelBase.systemId ∈ map.systems` и не совпадает с системой стартовых юнитов Империи — проверяет только `createCoreGame`.

### 1.2 События (`state.ts`)
Общие с mock: `GAME_CREATED {scenarioId}` (system), `PIECES_MOVED {pieceIds, fromSystemId, toSystemId}`, `HANDOFF_ACCEPTED {}`.
Новые (`core-v1`):

| Тип | actor | payload | Секрет до раскрытия? |
|---|---|---|---|
| `PHASE_STARTED` | system | `{ round, phase }` | нет |
| `SYSTEM_ACTIVATED` | сторона | `{ leaderId, systemId }` | да, если сторона = rebels и `systemId` = база |
| `PIECES_MOVED` | сторона | как в mock | да, если rebels и `from`/`to` = база |
| `ACTIVATION_FINISHED` | сторона | `{ auto: boolean }` | нет |
| `PASSED` | сторона | `{ auto: boolean }` | нет |
| `LEADERS_RETURNED` | system | `{ leaderIds: string[] }` (порядок — по `state.leaders`) | нет (id лидеров публичны) |
| `TIME_ADVANCED` | system | `{ from, to }` | нет |
| `BASE_REVEALED` | system | `{ systemId }` | создаётся только при раскрытии → публично |
| `GAME_OVER` | system | `{ winner, reason }` | нет (без системы) |

`MockEventSchema` = 5 типов v2; `CoreEventSchema` = общие 3 + новые 8; `GameEventSchema` = объединение (для модуля/журнала).
View-события `core-v1` — отдельная схема `CoreViewEventSchema`: то же, но `SYSTEM_ACTIVATED.systemId` и
`PIECES_MOVED.fromSystemId/toSystemId` — `string | null` (`null` = скрытая зона базы). Полная state-схема `null` не допускает.
Пометка авто-хода — `payload.auto` у `PASSED`/`ACTIVATION_FINISHED` (не top-level: `SessionEvent` хранит только
`type/actor/payload`, так зеркало не теряет пометку) — AM-BE-4.

### 1.3 Старые сессии (`mock-v1`) — цепочка апкаста
- `src/server/legacy-v2.ts` (NEW) — **замороженная копия** схем SWR-004 v2 (`GameStateV2Schema`, события v2, `StoredSetupV2`
  не нужен — setup не менялся). Текущие `legacy-v1.ts` не трогаются.
- `src/server/upcast.ts`:
  - `upcastV1toV2(raw): GameStateV2` — существующий код, но результат валидируется **замороженной** `GameStateV2Schema`;
  - `upcastV2toV3(v2): MockGameStateV3` — `{ ...v2, schemaVersion: 3, rulesEngine: 'mock-v1' }` → `MockGameStateV3Schema.parse`;
  - `upcastState(raw)`: `schemaVersion === 3` → `GameStateSchema.parse`; `2` → v2→v3; отсутствует → v1→v2→v3; иное → throw (500);
  - `upcastStoredSetup` — без изменений (v1 → v2; v2 — текущий); `upcastEvent` — `GameEventSchema` ∪ v1-маппинг;
  - идемпотентность `upcast(upcast(x)) ≡ upcast(x)`; `version` не меняется (оптимистичная конкуренция не затронута).
- Апкаст ленивый (как Q-16 SWR-004): строка становится v3 при первой записи (команде). Откат кода после этого невозможен без
  копии БД — отсюда резервная копия (§6.4).
- Mock-путь правил — прежнее поведение байт-в-байт, кроме: `view.rulesEngine = 'mock-v1'` (AM-BE-6) и `summarize` (+2 ключа).

### 1.4 Фикстуры
**Шаг 0 (W1, ДО любых правок кода)** — одноразовый скрипт в scratch на `ddfa4db` (не коммитится; в шапке JSON — происхождение):

| Файл | Содержимое |
|---|---|
| `packages/games/rebellion/test/fixtures/v2/state.v2.rebels-human-handoff.json` | v2, hot-seat, `MOVE_PIECES` + `END_TURN` (handoffPending) |
| `packages/games/rebellion/test/fixtures/v2/state.v2.empire-ai.json` | v2, Империя vs AI/hard, 1 ход + `ADVANCE_PHASE` |
| `apps/api/test/fixtures/v2/sessions.v2.json` | 3 строки уровня БД (`{id, gameId, setup, state, version, status, createdAt, updatedAt, events[]}`): AI-rebels, AI-empire, hot-seat в handoff |
| `apps/api/test/support/swr004-db.ts` (NEW) | `createSwr004Db({rows})`: пустой файл → `migrate deploy` (3 существующие миграции) → raw INSERT строк |

Существующие v1-фикстуры остаются (цепочка v1→v2→v3 проверяется на них).

---

## 2. Модули данных и subpath'ы

| Что | Файл | Subpath | Кто читает |
|---|---|---|---|
| Zod-схемы данных + `integrity` | `src/schema/data.ts` | `./schema` (web-reachable, данных нет) | всё |
| Регионы (8) | `src/scenario/core/regions.ts` | `./scenario` | server, тесты, web i18n-тест (B-10) |
| Системы (32: регион, соседство, `remote`) | `src/scenario/core/systems.ts` | `./scenario` | то же |
| Каталог типов юнитов (обе стороны) | `src/scenario/core/unit-types.ts` | `./scenario` | то же |
| Лидеры | `src/scenario/core/leaders.ts` | `./scenario` | то же |
| Стартовая расстановка + кандидаты базы | `src/scenario/core/start-setup.ts` | `./scenario` | server |
| Сборка `coreDataBaseV1 = CoreDataSchema.parse({...})` (fail-fast при загрузке) | `src/scenario/core/index.ts` | `./scenario` | server |
| Выбор базы `chooseRebelBase(sessionId, candidates)` | `src/rules/core/base.ts` | `./rules` | server (через `createCoreGame`) |
| Координаты 32 систем, подписи/контуры регионов, границы | `src/board/core-layout.ts` | `./board` (без импорта scenario) | web |

- Каждый файл данных в шапке ссылается на `docs/game-rules/rebellion-reference.md` (раздел/уровень уверенности); значения с
  низкой уверенностью помечаются комментарием `// confidence: low (reference §…)`.
- Mock-сценарий (`src/scenario/scenario.ts`) и `mapLayout` (`src/board/layout.ts`) **остаются** — нужны старым сессиям;
  `./board` экспортирует `mapLayout` (mock) и `coreMapLayout`, `CORE_MAP_BOUNDS`, `coreRegionLayout` (FE выбирает по `view.rulesEngine`).
- `chooseRebelBase`: кандидаты сортируются по id; `index = fnv1a32(sessionId) % n` (`Math.imul`, без `Math.random`/`Date`);
  одинаковый `sessionId` → одинаковая база; golden-тест закрепляет 5 пар `sessionId → systemId`.
- Id стартовых юнитов — `u-01…u-NN` **в порядке данных `startSetup.units`**, не зависящем от базы (иначе порядок/id выдавали
  бы базу); id лидеров — id из данных. Порядок массивов `units`/`leaders` в state фиксирован этим же порядком.
- **ESLint:** вложенные папки `rules/core/**` и `scenario/core/**` обходят `sibling()`-паттерны (`../scenario` не ловит
  `../../scenario`). W1 расширяет `sibling()` в `eslint.config.mjs` вариантами `../../<sub>` и `../../<sub>/*` и добавляет кейс в
  `scripts/eslint-boundaries.test.mjs` («`src/rules/core/x.ts` импортирует `../../scenario` → ошибка»).
- **check:bundle:** изменений не требуется — статические данные `core-v1` секретов не содержат, а модули `scenario/rules/server/ai`
  уже запрещены module-check'ом; `loadScenario()` продолжает читать `mockScenario` (правила для mock-секретов остаются в силе).
  Тест W5: `rebelBaseCandidates`/`chooseRebelBase` отсутствуют в `./board`/`./schema` (grep по `src/{board,schema}`).

---

## 3. Движок `core-v1`: команды, порядок проверок, переходы

### 3.1 Файлы правил (`src/rules/`)
`apply-command.ts` — диспетчер по `state.rulesEngine` (mock → прежний код, вынесенный в `mock-apply-command.ts`; core →
`core/apply.ts`). То же для `legal-actions.ts`, `player-view.ts` (`toSideView`, `toPlayerView`, `toPlayerEvents`).
`core/`: `create.ts` (`createCoreGame`), `apply.ts`, `activation.ts`, `movement.ts` (+ вместимость), `turn-flow.ts`
(пас/передача хода/автоматические фазы), `victory.ts`, `legal.ts`, `redact.ts` (единственная точка скрытия), `base.ts`,
`errors.ts` (хелперы `illegal(key, echo)`), `index.ts`. `mock-rules.ts`, `turn.ts` — mock/hot-seat SWR-004 без изменения логики.

```ts
// context.ts
export interface ApplyContext { now: string; origin?: CommandOrigin }   // по умолчанию 'player'
export interface CreateContext { gameId: string; now: string }
// core/create.ts
export function createCoreGame(settings: RebellionSettings, data: CoreData, ctx: CreateContext): CoreGameState
```

### 3.2 Создание (R-1, R-2, R-10)
`createCoreGame`: `data = CoreDataSchema.parse(data)`; `base = chooseRebelBase(ctx.gameId, data.startSetup.rebelBaseCandidates)`;
юниты из `startSetup.units` (`rebelBase` → `base`), лидеры стартового пула `systemId: null`; `round = startingTime`,
`reputation = startingReputation`; версия 1; журнал: `GAME_CREATED`, `PHASE_STARTED{round,'assignment'}`,
`PHASE_STARTED{round,'command'}` (фаза назначения пустая, D-2); `phase = 'command'`, `activeSide = 'rebels'` (A-4),
`consecutivePasses = 0`, `activation = null`, `handoffPending = false`, `outcome = null`.
`activeSide = 'rebels'` при AI-Повстанцах — переходное состояние: `createInitialState` сразу запускает авто-ход (§4).

### 3.3 Конверт и порядок проверок
`CommandSchema` = объединение **всех** команд обоих движков (`MOVE_PIECES`, `ADVANCE_PHASE`, `END_TURN`, `ACCEPT_HANDOFF`,
`ACTIVATE_SYSTEM {leaderId, systemId}`, `FINISH_ACTIVATION {}`, `PASS {}`; все strict) — поэтому «чужая» для движка команда
даёт 422, а не 400. Первая неудача возвращается; `state` не мутируется; `details` — только эхо полей запроса.

| # | Проверка (`core-v1`) | Код / ключ | details |
|---|---|---|---|
| 1 | `CommandEnvelopeSchema` | 400 `VALIDATION` | issues |
| 2 | `outcome !== null` | 422 `gameOver` | `{actor}` |
| 3 | `expectedVersion !== version` | 409 `VERSION_CONFLICT` | `{currentVersion}` |
| 4 | тип ∈ {`ADVANCE_PHASE`, `END_TURN`} | 422 `commandUnavailable` (NEW) | `{actor, type}` |
| 5 | actor не управляется источником: `origin='player'` ⇒ actor ∈ стороны-люди; `origin='auto'` ⇒ actor = AI-сторона | 422 `notYourSide` | `{actor}` |
| 6 | actor ≠ `activeSide` | 422 `notYourTurn` | `{actor}` |
| 7 | `ACCEPT_HANDOFF` в AI-партии | 422 `handoffNotAvailable` | `{actor}` |
| 8 | `handoffPending` и команда ≠ `ACCEPT_HANDOFF` | 422 `handoffPending` | `{actor}` |
| 9 | `ACCEPT_HANDOFF` без ожидания | 422 `handoffNotAvailable` | `{actor}` |
| 10 | `phase !== 'command'` | 422 `wrongPhase` | `{actor}` (в сохранённом state недостижимо; unit-тест на синтетике) |

Mock-путь: прежний порядок SWR-004 + п. 4 зеркально: `ACTIVATE_SYSTEM`/`FINISH_ACTIVATION`/`PASS` → 422 `commandUnavailable`
(раньше были бы 400 — AM-BE-3).

**`ACTIVATE_SYSTEM {leaderId, systemId}`** (R-4):
1. `activation !== null` → `activationInProgress`;
2. лидера нет в state → `unknownLeader` (NEW) `{leaderId}`;
3. `owner ≠ actor` или `systemId ≠ null` → `leaderNotInPool` `{leaderId}`;
4. системы нет → `unknownSystem` `{systemId}`;
5. в системе есть лидер actor → `systemHasOwnLeader` `{systemId}`.
Эффект: лидер → система; `activation = {side, leaderId, systemId}`; `consecutivePasses = 0`; событие `SYSTEM_ACTIVATED`.
(Лидер базу не раскрывает — R-8 говорит о юнитах; уточняется справочником, Q-BE-4.)

**`MOVE_PIECES {pieceIds, fromSystemId, toSystemId}`** (R-5; схема: ≥1, без дублей):
1. `activation === null` → `noActivation`;
2. `from` неизвестна → `unknownSystem`; `to` неизвестна → `unknownSystem`;
3. `to ≠ activation.systemId` → `notActivatedSystem` `{toSystemId}`;
4. `from === to` → `sameSystem`;
5. `from` не соседняя с `to` → `notAdjacent` `{fromSystemId, toSystemId}`;
6. в `from` есть лидер actor → `pinnedByLeader` `{fromSystemId}`;
7. по каждому `pieceId` по порядку: нет юнита → `unknownPiece`; `owner ≠ actor` → `notOwner`; `systemId ≠ from` →
   `notInFromSystem`; тип `immobile` → `immobileUnit` `{pieceId}`. (**owner раньше местоположения** — иначе Империя по ключу
   ошибки узнала бы, где стоит юнит повстанцев);
8. вместимость (ниже) → `insufficientCapacity` `{fromSystemId, required, available}` (числа — только из юнитов запроса).
Эффект: все юниты → `to`; `PIECES_MOVED`; затем раскрытие базы (R-8) и проверка победы Империи (R-9).

**Алгоритм вместимости** (одна команда = одна исходная система; «всё или ничего»):
`available = Σ transportCapacity(u)` по юнитам набора с `requiresTransport === false` (корабли, перемещающиеся этой же командой);
`required = |{u ∈ набор : requiresTransport}|` (наземные и истребители — по 1 месту, если справочник не говорит иначе, Q-BE-1);
легально ⇔ `required ≤ available`. Корабли, оставшиеся в `from`, или прибывшие ранее в активированную систему, вместимость не
дают. Следствие (фиксируется для FE): наземные юниты, не взятые вместе с кораблями, позже из той же системы не уйдут — UI
перемещает группу одним `MOVE_PIECES`.

**`FINISH_ACTIVATION {}`**: `activation === null` → `noActivation`. Эффект: `activation = null`, `ACTIVATION_FINISHED{auto}`, передача хода.
**`PASS {}`**: `activation !== null` → `activationInProgress`; иначе (если справочник введёт ограничение паса — одна функция
`canPass(state, side)`, Q-BE-2) → `PASSED{auto}`; `consecutivePasses + 1`; `2` → конец фазы приказов, иначе передача хода.
**`ACCEPT_HANDOFF`** — как SWR-004 (`HANDOFF_ACCEPTED`, `handoffPending = false`).

### 3.4 Передача хода и автоматические фазы
- `passTurn(state)`: `activeSide = opponent`; human-партия → `handoffPending = true`. AI-партия → флаг не ставится (§4).
- `endCommandPhase(state)` (после второго паса подряд, всё в той же команде, `version + 1` один раз на команду):
  `PHASE_STARTED{round,'refresh'}` → все лидеры с карты в пулы (`LEADERS_RETURNED`) → `round + 1` (`TIME_ADVANCED`) →
  если `round ≥ reputation` → `outcome = {winner:'rebels', reason:'timeReachedReputation'}`, `GAME_OVER`, фаза остаётся `refresh`,
  `activeSide` не меняется, `handoffPending = false` → стоп. Иначе `PHASE_STARTED{round,'assignment'}`,
  `PHASE_STARTED{round,'command'}`, `activeSide = 'rebels'`, `consecutivePasses = 0`; human-партия: `handoffPending = (activeSide сменилась)`.
- **Раскрытие базы (R-8)**: после `MOVE_PIECES` actor'а `empire`, если `!revealed`, `to === rebelBase.systemId` и в наборе есть
  тип с `revealsRebelBase` → `revealed = true`, `BASE_REVEALED{systemId}`.
- **Победа Империи (R-9)**: после **каждого** `MOVE_PIECES` (любой стороны): `revealed` ∧ в системе базы ≥1 юнит Империи
  `arena:'ground'` ∧ 0 наземных юнитов повстанцев → `outcome = {winner:'empire', reason:'rebelBaseCaptured'}`,
  `activation = null`, `GAME_OVER`. Сооружения повстанцев (`arena:'ground'`, immobile) считаются наземными юнитами — уточнить
  справочником (Q-BE-5).
- После `outcome`: `legalActions = []`, любая команда → п. 2 (`gameOver`), `statusOf → 'completed'`.

### 3.5 `legalActions` (`core-v1`, только для активной стороны, без handoff, без outcome)
```ts
ActivateSystemLA    = { type:'ACTIVATE_SYSTEM', leaderIds: string[] /* свой пул */, systemIds: string[] /* без своего лидера */ }
MovePiecesCoreLA    = { type:'MOVE_PIECES', fromSystemId, toSystemId /* = активированная */,
                        pieces: { pieceId, transportCapacity: int, requiresTransport: boolean }[] }
FinishActivationLA  = { type:'FINISH_ACTIVATION' }
PassLA              = { type:'PASS' }
```
Без активации: `ACTIVATE_SYSTEM` (если пул непуст) + `PASS`. Во время активации: по одному `MOVE_PIECES` на каждую соседнюю
с активированной систему без своего лидера, где есть хотя бы один подвижный свой юнит (юниты с `requiresTransport` включаются,
только если в той же системе есть свой подвижный корабль с вместимостью > 0) + `FINISH_ACTIVATION`. Порядок — по порядку систем в
`map` и юнитов в `units` (детерминизм). Для Империи списки не зависят от скрытых фактов по построению (только свои юниты/лидеры
и «все системы без своего лидера»).

### 3.6 Ключи ошибок (`src/schema/errors.ts`, wire `errors.<name>`)
Новые: `gameOver`, `commandUnavailable`, `wrongPhase`, `unknownLeader`, `leaderNotInPool`, `systemHasOwnLeader`,
`activationInProgress`, `noActivation`, `notActivatedSystem`, `pinnedByLeader`, `immobileUnit`, `insufficientCapacity`.
Существующие сохраняются: `notYourSide`, `notYourTurn`, `handoffPending`, `handoffNotAvailable`, `rulesetUnavailable`,
`modeUnavailable`, `unknownPiece`, `unknownSystem`, `notOwner`, `notInFromSystem`, `sameSystem`, `notAdjacent`.

---

## 4. AI авто-пас

| Часть | Где | Что |
|---|---|---|
| Политика | `src/ai/auto-pass.ts` (импортирует только `../schema`, B-6) | `chooseAutoCommand(view: CorePlayerView): AutoCommand \| null` — `PASS`, если есть в `view.legalActions`; иначе `FINISH_ACTIVATION`; иначе `null`. `AUTO_POLICY_ID = 'auto-pass-v1'`. Чистая, детерминированная, без OpenAI. |
| Цикл | `src/server/auto-play.ts` | `runAutoPlay(state, {now}): {state, events}`: пока `outcome === null` и `activeSide` = AI-сторона: `view = toSideView(state, aiSide)` → `cmd = chooseAutoCommand(view)` → `applyCommand(state, {actor: aiSide, expectedVersion: state.version, command: cmd}, {now, origin:'auto'})`. `null`/отказ движка → `throw` (сообщение без данных state) → 500, ничего не записано. Лимит `MAX_AUTO_STEPS = 16` → throw. |
| Встраивание | `rebellion-server-module.ts` | `applyCommand`: движок с `origin:'player'`; при успехе и `core-v1` → `runAutoPlay`; результат `{state, events: [...игрок, ...AI]}`. `createInitialState`: `createCoreGame` → `runAutoPlay` (AI-Повстанцы пасуют сразу; версия 2). |

- **Видимость:** политика получает ровно `toSideView(state, aiSide)` — ту же функцию, что строит view игрока; у AI-Империи
  база скрыта той же редакцией. Тест: шпион на политике получает объект, глубоко равный `toSideView(state,'empire')`, и в его JSON
  нет id базы (вне статического `map`) до раскрытия.
- **Валидация:** ход AI проходит полный порядок §3.3 (включая `notYourSide` для `origin:'auto'` и не-AI actor'а).
- **Транзакция/версия:** сервис сессий вызывает `module.applyCommand` один раз и делает один `commit`
  (`expectedVersion` = версия до команды игрока, новая версия = после последнего авто-хода; каждая команда движка `+1`). Проигранная
  гонка → 409 целиком; частичной записи нет. Ответ: `view` после авто-ходов, `events` — игрок + AI, отредактированные для игрока.
- **Журнал:** `actor = <AI-сторона>`, `payload.auto = true`; UI подписывает «авто, AI Commander ещё не реализован».
- **Инвариант SWR-004:** в сохранённом state AI-партии `activeSide = playerFaction` (кроме `outcome`), `handoffPending = false` —
  в `coreInvariants` (§1.1); `toPlayerView` AI-партии всегда строится для `playerFaction` (даже если партия кончилась на ходу AI).
- Mock-сессии авто-хода не получают (их инвариант — игрок всегда активен).

---

## 5. Скрытая информация

### 5.1 Единственная точка редактирования — `src/rules/core/redact.ts`
`hiddenBaseFor(state, viewer) = viewer === 'empire' && !state.rebelBase.revealed`. Если `true`, `loc(systemId, owner)` =
`{kind:'rebelBase'}` для объектов повстанцев в `rebelBase.systemId`, иначе `{kind:'system', systemId}`. Через неё проходит **всё**:

| Что | Правило |
|---|---|
| `units`, `leaders` | `location` через `loc`; лидер в пуле — `{kind:'pool'}` |
| `activation` | `location` через `loc(activation.systemId, activation.side)` |
| `rebelBase` | `{ systemId: hidden ? null : id, revealed }` |
| `contestedSystemIds` | вычисляется **после** редактирования (юниты в зоне базы не засчитываются ни одной системе) |
| события журнала и ответа | `SYSTEM_ACTIVATED`/`PIECES_MOVED` повстанцев: системы базы → `null`; прочие — копия |
| `legalActions` | свои действия viewer'а; для Империи не зависят от базы; всё равно проходят ассерт `assertNoHiddenRef` в тестах |
| `summarize` (details) | без систем вообще: настройки + `round`, `phase`, `rulesEngine`, `winner` |
| ошибки | `details` — только эхо запроса; owner проверяется раньше местоположения (§3.3); сообщения `throw` без данных state |

Раскрытие (R-8) меняет `revealed` → с этого момента редакция не применяется ни к view, ни к прошлым событиям журнала
(«после раскрытия — всё видно»). Повстанцам база видна всегда. Конец партии базу не раскрывает (Q-BE-6).
Hot-seat: handoff-view (7 полей SWR-004) и `toPlayerEvents → []` при `handoffPending` — без изменений.

### 5.2 Автоматическая проверка (AC-10) — три уровня
1. **Инвариантность к переносу базы (unit, `test/rules/core/hidden-info.test.ts`):** для скриптованных и псевдослучайных
   (сидированный PRNG в тесте) последовательностей команд на каждом шаге до раскрытия: `relocateBase(S, b')` для каждого кандидата
   `b'` (с переносом юнитов/лидеров повстанцев из старой системы базы) → `toSideView(S,'empire')`, `toPlayerEvents(...)` для Империи,
   `getLegalActions(S,'empire')` и результаты набора пробных команд Империи (включая заведомо нелегальные) **глубоко равны** для `S` и
   `S'`. Это доказывает «легальные действия/ошибки Империи не зависят от скрытых фактов».
2. **Сканирование API (`apps/api/test/hidden-info-core.int.test.ts`):** две скриптованные партии (Империя vs AI; hot-seat с
   ходами повстанцев в базу и из неё, активацией системы базы, ≥2 раундами, затем раскрытием) с фиксированными `sessionId`;
   база берётся из строки БД. Собираются **все** тела, адресованные Империи: `POST /commands` (успехи и 4xx), `GET /sessions/:id`,
   `GET /sessions`, `POST /sessions` (Империя vs AI). Обход JSON с путями: id базы и `systems.<baseId>` допустимы **только** в
   `view.map.systems[*]` (статический каталог) и в `ACTIVATE_SYSTEM.systemIds` (равен множеству «все системы без своего лидера» —
   проверяется); в любом другом месте → провал с путём. Плюс перехват логов Nest — id базы нет. После раскрытия: `BASE_REVEALED` и
   `view.rebelBase.systemId` у обеих сторон. Вывод (перечень проверенных ответов) → `artifacts/logs/hidden-info-scan.log`.
3. **Структура:** strict-схемы view/событий (лишнее поле = ошибка парсинга в `toPlayerView` модуля → 500, а не утечка).

---

## 6. Платформа и API

### 6.1 `@bga/platform` (`packages/platform/src/server-game-module.ts`)
```ts
/** Status after an accepted command (written in the same commit). Pure; the platform never interprets game data. */
statusOf(state: State): SessionStatus;
```
Обязательный метод. Док `createInitialState`: «version ≥ 1 (игра может применить автоматические ходы при создании)» — AM-BE-2.
Rebellion: `outcome !== null → 'completed'`, иначе `'prototype'` (оба движка; mock → всегда `'prototype'`).
Начальный статус — по-прежнему `initialStatus(setup)` (`'prototype'`).

### 6.2 `apps/api`
- `sessions/session-commands.service.ts`: после успешного `module.applyCommand` → `status = SessionStatusSchema.parse(module.statusOf(result.state))`
  (невалидный → 500); `repo.commit({..., status})`; `view = toPlayerView(result.state, {status})`; лог `code=STATUS_CHANGED from→to`
  только при смене (без данных state).
- `sessions/sessions.repository.ts`: `SessionUpdate.status: SessionStatus`; `commit` пишет `status` в том же `updateMany`.
- `sessions.service.ts` — без изменений (`list` и `GET` читают колонку; `create` — `initialStatus`).
- `test/support/fake-game.ts`: `statusOf` (fake: команда `{finish:true}` → `'completed'`), чтобы статус проверялся генерически.
- **Миграции нет.** Доказательство: `pnpm --filter @bga/api exec prisma migrate diff --from-migrations prisma/migrations
  --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:./.tmp/shadow.db --exit-code` → exit 0
  (`artifacts/logs/w4-migrate-diff.log`). `schema.prisma` не трогается.

### 6.3 Проверка старых данных
- `apps/api/test/upcast-v2.int.test.ts` (NEW): `createSwr004Db(sessions.v2.json)` → API: GET 200, `view.rulesEngine = 'mock-v1'`,
  hot-seat в handoff остаётся handoff; одна mock-команда → 200, в БД `schemaVersion: 3`, `rulesEngine: 'mock-v1'`, setup v2.
- `upcast-v1.int.test.ts`: + проверка, что после команды state v3.
- `dev-db-upgrade.int.test.ts`: переменная `SWR005_DEV_DB` (оставить `SWR004_DEV_DB` как алиас): копия → `migrate deploy`
  (no-op) → все строки GET 200 c `rulesEngine:'mock-v1'` → одна mock-команда на строку → 200 → повторный GET после рестарта идентичен
  → sha256 оригинала не изменился. Команда: `SWR005_DEV_DB=prisma/dev.db pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts`.

### 6.4 Резервная копия dev-БД
До первого запуска приложения на коде SWR-005 (`pnpm dev` / e2e на реальной БД) Analyst копирует
`apps/api/prisma/dev.db` → `apps/api/prisma/dev.pre-swr005.db` (миграции нет, но первая команда в старой сессии пишет v3,
который код SWR-004 не читает; откат = восстановление копии). Workers оригинал не открывают; тесты работают только с копиями.

---

## 7. Подзадачи backend (одно рабочее дерево, файлы не пересекаются внутри фазы)

```
Фаза 1:  W1 (шаг 0 фикстуры → schema v3 + апкастер + mock на v3 + ESLint)      gate: pnpm verify зелёный, поведение прежнее
Фаза 2:  W2 (данные) ‖ W3 (правила core) ‖ W4 (платформа/API статус) ‖ W6a (api-тесты → засеянные mock-строки)
Фаза 3:  W5 (AI-пас + серверный модуль + переключение новых сессий на core-v1) → W6b (api-тесты core + скан)
INTEGRATION: backend-lead (docs/architecture, pnpm verify, dev-копия) + FE/QA
```
Новые сессии остаются `mock-v1` до последнего шага W5 — до этого дерево зелёное.

### W1 — Schema v3 и совместимость (фаза 1, один исполнитель)
**OWNED:** `packages/games/rebellion/src/schema/**`; `src/server/{legacy-v2.ts, upcast.ts, index.ts}`;
`src/rules/**` (адаптация mock к `MockGameStateV3`, диспетчеры `apply-command.ts`/`legal-actions.ts`/`player-view.ts`,
вынос `mock-apply-command.ts`, заглушка `rules/core/index.ts`, возвращающая `commandUnavailable`); `src/server/rebellion-server-module.ts`
(только типы/константы, `createInitialState` — всё ещё mock); `test/{schema,rules,server}/**` (существующие + новые ниже);
`test/fixtures/v2/**`; `apps/api/test/fixtures/v2/**`; `apps/api/test/support/swr004-db.ts`; `eslint.config.mjs`;
`scripts/eslint-boundaries.test.mjs`. **С согласия FE-lead/QA (механически, только `rulesEngine: 'mock-v1'` в фикстурах view):**
`apps/web/src/games/rebellion/board/test/fixtures.ts`, `e2e/support/api.ts` (+ места, найденные `tsc`).
**Тесты:** `test/schema/data.test.ts` (integrity на синтетике: асимметрия, битые ссылки, кандидат со стартовым юнитом Империи,
дубликат typeKey → ошибка); `test/schema/state-v3.test.ts` (union по `rulesEngine`, `coreInvariants`, strict view-события с `null`
только во view-схеме); `test/server/upcast.test.ts` (+ v2→v3 на v2-фикстурах, v1→v2→v3, идемпотентность, `schemaVersion: 99` → throw,
`version` не меняется); `test/rules/dispatch.test.ts` (mock-сессия: `ACTIVATE_SYSTEM`/`PASS`/`FINISH_ACTIVATION` → 422
`commandUnavailable`; все прежние mock-тесты зелёные без правок логики).
**DONE:** `pnpm verify` → `artifacts/logs/w1-verify.log`; число тестов не уменьшилось.

### W2 — Данные базовой игры (фаза 2)
**Блокер:** `docs/game-rules/rebellion-reference.md` (Q-BE-1). **OWNED:** `src/scenario/core/**`, `src/scenario/index.ts`,
`test/scenario/core-data.test.ts`.
**Тесты (AC-01/02):** `CoreDataSchema.parse` проходит; ровно 32 системы, 8 регионов, у каждого региона ≥1 система; соседство
симметрично; набор удалённых систем = список из справочника (тест сверяет с явным массивом id в тесте, взятым из справочника);
каталог обеих сторон: у каждого типа арена/подвижность/вместимость заданы, сооружения `immobile`; стартовая расстановка ссылается
на существующие типы/системы; кандидаты базы без стартовых юнитов Империи; i18n-ключи `systems.<id>`/`regions.<id>`/`pieceTypes.<typeKey>`/
`leaders.<id>` выводятся из id (для FE-теста локалей).
**DONE:** `pnpm --filter @bga/game-rebellion test` + lint/typecheck → `artifacts/logs/w2-data.log`; таблица «поле → раздел справочника» в отчёте.

### W3 — Правила `core-v1` (фаза 2)
**OWNED:** `src/rules/**` (принимает от W1: `core/**`, диспетчеры, `index.ts`, `context.ts`), `test/rules/**`
(включая `test/rules/core/fixtures/mini-data.ts` — маленький синтетический `CoreData`, чтобы не зависеть от W2).
**Тесты** (`test/rules/core/`): `create.test.ts` (R-1/2/10: версия 1, `phase 'command'`, Повстанцы первые, события назначения;
одинаковый `gameId` → `toStrictEqual` и одинаковый JSON; разные `gameId` покрывают ≥2 кандидата; id юнитов не зависят от базы);
`base.test.ts` (golden 5 пар, детерминизм, только кандидаты); `activate.test.ts` (каждый запрет §3.3 → ключ + state/version
неизменны (`deepFreeze` входа)); `move.test.ts` (каждый запрет, порядок проверок, вместимость: ровно/не хватает/истребители/
сооружение/корабль не из набора, «всё или ничего»); `turn-flow.test.ts` (пас → передача; 2 паса → refresh: лидеры в пулах, время +1,
новый раунд, Повстанцы; активация сбрасывает счётчик; hot-seat `handoffPending` только при смене стороны); `victory.test.ts`
(R-9 Повстанцы при `round ≥ reputation`, Империя после хода любой стороны; после `outcome` любая команда → `gameOver`, `legalActions []`);
`reveal.test.ts` (R-8 только `revealsRebelBase`-типы Империи); `legal.test.ts` (соответствие `legalActions` принимаемым командам:
каждое перечисленное — принимается, сгенерированные вне списка — отклоняются); `hidden-info.test.ts` (§5.2 п. 1); `invariants.test.ts`
(property: случайные легальные последовательности → `CoreGameStateV3Schema.parse` проходит на каждом сохраняемом шаге, version +1 на команду, seq подряд).
**DONE:** пакетные тесты/lint/typecheck → `artifacts/logs/w3-rules.log`.

### W4 — Платформа и статус (фаза 2)
**OWNED:** `packages/platform/src/server-game-module.ts`, `packages/platform/test/**`; `apps/api/src/sessions/{session-commands.service.ts,
sessions.repository.ts}`; `apps/api/test/{support/fake-game.ts, game-registry.int.test.ts, sessions-repository.int.test.ts,
status.int.test.ts (NEW), architecture.int.test.ts}`; **конформность** в `src/server/rebellion-server-module.ts`: только метод
`statusOf` (≤ 5 строк; W1 уже закончил, W5 ещё не начал).
**Тесты:** fake-игра: команда завершения → ответ/GET/list `status: 'completed'`, проигранная гонка не меняет статус; репозиторий:
`commit` пишет `status` атомарно с state (откат при конфликте версии); architecture: `packages/platform/src` и `apps/api/src` без
`rebels|empire|outcome|winner|rulesEngine`; Rebellion mock → `statusOf = 'prototype'`.
**DONE:** `pnpm --filter @bga/platform test`, `pnpm --filter @bga/api test`, typecheck, lint → `w4-platform.log`, `w4-api.log`; drift → `w4-migrate-diff.log`.

### W6a — API-тесты на засеянные mock-строки (фаза 2)
**OWNED:** `apps/api/test/{hotseat,commands,hidden-info,persistence,sessions,concurrency,routes,rebellion-contract,upcast-v1,
upcast-v2 (NEW)}.int.test.ts`, `apps/api/test/support/{fixtures.ts, test-app.ts}`.
**Цель:** ни один api-тест не играет mock-командами в сессии, созданной через `POST` (такие тесты переходят на `createSwr004Db`
и v2-фикстуры); тесты создания проверяют только движко-независимые поля (201, `status`, `settings`, `view.kind`, порядок проверок,
идемпотентность). Тогда переключение движка у W5 не ломает их. **Тесты:** §6.3 `upcast-v2.int`. **DONE:** `pnpm --filter @bga/api test` →
`w6a-api.log`; `grep -n "ADVANCE_PHASE\|END_TURN" apps/api/test/*.ts` — только в тестах на засеянных строках (вывод в лог).

### W5 — AI авто-пас, серверный модуль, переключение (фаза 3)
**OWNED:** `src/ai/**`, `src/server/{rebellion-server-module.ts, auto-play.ts}`, `test/ai/**`, `test/server/**` (кроме upcast),
`test/fixtures/core/**`.
Модуль: `createInitialState` → `createCoreGame(settings, coreDataBaseV1, …)` + `runAutoPlay`; `applyCommand` + авто-ход (§4);
`toPlayerView`/`toPlayerEvents` по движку; `statusOf`; `summarize` += `rulesEngine`, `winner`.
**Тесты:** `test/ai/auto-pass.test.ts` (PASS/FINISH/null; чистота); `test/server/auto-play.test.ts` (AI-Империя: игрок-Повстанцы пасует →
AI пасует → новый раунд → ход игрока, всё одним вызовом; AI-Повстанцы при создании: версия 2, `PASSED{auto:true}` actor `rebels`;
шпион политики = `toSideView` AI-стороны, без базы; лимит шагов → throw; отказ движка → throw без данных state);
`test/server/golden.test.ts` (скриптованная партия на **реальных** данных: создание → активации/перемещения/пасы → ≥2 раунда → раскрытие →
победа Империи; вторая — победа Повстанцев по времени; итоговые state/view сверяются с `test/fixtures/core/golden-*.json`, AC-14);
`test/server/server-module.test.ts` (конформность, `statusOf`, details без систем, байтовая идентичность создания при одном `sessionId`);
экспорт эталонных view (`test/fixtures/core/views/{rebels-command,empire-prereveal,empire-revealed,game-over,handoff}.json`) — для FE-фикстур.
**DONE:** пакет + `pnpm lint`, `pnpm typecheck` → `w5.log`. После переключения api-тесты, завязанные на mock-вид новых сессий, должны
отсутствовать (обеспечено W6a).

### W6b — API-тесты `core-v1` (фаза 3, после W5)
**OWNED:** NEW `apps/api/test/{core-commands,core-hotseat,core-ai-autopass,core-victory,hidden-info-core}.int.test.ts`,
`apps/api/test/dev-db-upgrade.int.test.ts`, `apps/api/test/support/core-fixtures.ts` (NEW).
**Тесты:** каждый ключ §3.3 через HTTP (422 + version/строки событий не изменились); `ADVANCE_PHASE`/`END_TURN` → 422 (AC-03);
полный раунд hot-seat с заслонкой только при смене стороны и 422 для неактивной стороны (AC-09); AI-партии обеих сторон: события
`auto`, `actor` = AI, одна версия ответа, OpenAI не вызывается (нет зависимости — architecture-тест), `handoffPending=false` (AC-08);
победы: `status 'completed'` в ответе/GET/списке, далее любая команда 422 `gameOver` (AC-07/13); скан §5.2 п. 2 (AC-10); dev-копия §6.3.
**DONE:** `pnpm --filter @bga/api test` → `w6b-api.log`, `hidden-info-scan.log`, `dev-db-copy.log` (sha256 до/после).

### INTEGRATION (backend-lead)
`docs/architecture/application.md` (state v3, два движка, `statusOf`, авто-пас), `docs/architecture/adding-a-game.md` (`statusOf`,
автоходы при создании/команде), сверка с `plan-frontend.md`; `pnpm verify` → `artifacts/logs/integration-verify.log`.
`docs/game-rules/rebellion-core-v1.md` — Analyst (W3/W5 дают список реализованных правил и D-n в отчётах).

### 7.1 Сводка владения по фазам
| Путь | Ф1 | Ф2 | Ф3 |
|---|---|---|---|
| `rebellion/src/schema/**` | W1 | — (заморожено) | — |
| `rebellion/src/rules/**`, `test/rules/**` | W1 | W3 | — |
| `rebellion/src/scenario/**`, `test/scenario/**` | — | W2 | — |
| `rebellion/src/server/rebellion-server-module.ts` | W1 | W4 (только `statusOf`) | W5 |
| `rebellion/src/server/{legacy-v2,upcast}.ts`, `test/server/upcast.test.ts` | W1 | — | — |
| `rebellion/src/{ai,server/auto-play.ts}`, `test/{ai,server}/**` | — | — | W5 |
| `rebellion/src/board/**`, `src/assets/**`, `test/board/**` | — | FE | FE |
| `packages/platform/**`, `apps/api/src/sessions/{commands,repository}` | — | W4 | — |
| `apps/api/test/*` | W1 (fixtures v2, swr004-db) | W4 / W6a (списки выше) | W6b |
| `eslint.config.mjs`, `scripts/eslint-boundaries.test.mjs` | W1 | — | — |

Изменения схем после фазы 1 — только через backend-lead (повторный gate W1).

---

## 8. Wire-контракт FE ↔ BE

### 8.1 Конверт
`SessionResponse` (без изменения формы): `status` теперь может быть `'completed'`. `SessionSummary.details` (Rebellion):
`{ playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase, rulesEngine, winner: Faction|null }`.
Ответ команды: `{ ok:true, view, events }` — `events` включают авто-ходы AI (в AI-партии), `[]` при handoff.
Ошибки: `{ code, messageKey: 'errors.<key>', details? }` — ключи §3.6.

### 8.2 `view`
```ts
PlayerViewSchema = discriminatedUnion('kind', [
  discriminatedUnion('rulesEngine', [MockPlayerView /* SWR-004 + rulesEngine:'mock-v1' */, CorePlayerView]),
  HandoffView /* SWR-004, 7 полей, без изменений */,
])

CorePlayerView = strict {
  kind: 'player', rulesEngine: 'core-v1',
  viewer, activeSide, settings, id, version,
  round, phase,                                   // phase: 'command' | 'refresh' (только при outcome)
  markers: { time: number /* = round */, reputation: number },
  map: { regions: { id, nameKey }[], systems: { id, nameKey, regionId, adjacentSystemIds, remote }[] },
  unitTypes: { typeKey, owner, arena, mobility, transportCapacity, requiresTransport }[],
  units:   { id, owner, typeKey, location: Loc }[],
  leaders: { id, owner, location: { kind:'pool' } | Loc }[],          // i18n leaders.<id>; пулы обеих сторон публичны
  activation: null | { side, leaderId, location: Loc },
  consecutivePasses: 0 | 1,
  rebelBase: { systemId: string | null, revealed: boolean },          // null = Империя до раскрытия
  contestedSystemIds: string[],                                       // после редактирования (D-1)
  outcome: null | { winner, reason: 'timeReachedReputation' | 'rebelBaseCaptured' },
  log: CoreViewEvent[],
  legalActions: (ActivateSystemLA | MovePiecesCoreLA | FinishActivationLA | PassLA)[],   // §3.5; [] если не ход viewer'а / outcome
}
Loc = { kind:'system', systemId } | { kind:'rebelBase' }   // 'rebelBase' только у Империи до раскрытия
```
UI-правила, следующие из контракта: зона базы = юниты/лидеры с `location.kind === 'rebelBase'`; выбор лидера/системы — из
`ACTIVATE_SYSTEM.leaderIds/systemIds`; перетаскивание — только юниты из `MOVE_PIECES.pieces` в `toSystemId`; предпросмотр
вместимости `Σrequires ≤ Σcapacity` по выбранным юнитам одной системы (сервер — источник истины); бейдж/раскладка карты по
`rulesEngine`; координаты — `coreMapLayout` из `./board` (ключи = `map.systems[].id`, тест FE). Эталонные view — `test/fixtures/core/views/*.json` (W5).

---

## 9. Вопросы к Analyst

- **Q-BE-1 (блокирует W2, не блокирует W1/W3/W4):** справочник `docs/game-rules/rebellion-reference.md` отсутствует. Нужны с
  источником и уверенностью: (a) 32 системы, их 8 регионов, соседство, какие системы удалённые; (b) типы юнитов обеих сторон: арена,
  подвижность (какие — сооружения), транспортная вместимость кораблей, какие юниты требуют места (наземные, истребители; по 1 месту?),
  Звезда Смерти/строящаяся Звезда Смерти — как классифицируются; (c) стартовые лидеры каждой стороны (пул); (d) стандартная
  стартовая расстановка юнитов (системы и «на базе») и её фиксированные упрощения D-5; (e) стартовое деление репутации;
  (f) какие системы допустимы для базы.
- **Q-BE-2:** пас (R-6) — есть ли в оригинале ограничение на право паса (например, связанное с числом лидеров в пулах) и точное
  условие конца фазы приказов? Код изолирует это в `canPass`/`endCommandPhase`.
- **Q-BE-3:** R-4 — ограничение активации точно «в системе нет собственного лидера»? (иное — правка одного предиката).
- **Q-BE-4:** R-8 — какие юниты Империи раскрывают базу (все / только наземные / любые, включая корабли)? Лидер Империи при
  активации системы базы её не раскрывает — подтвердить. Реализация: флаг `revealsRebelBase` на типе юнита.
- **Q-BE-5:** R-9 — считаются ли сооружения повстанцев (`ground`, immobile) «наземными юнитами повстанцев», мешающими победе Империи?
- **Q-BE-6:** раскрывать ли базу Империи в конце партии (победа Повстанцев по времени)? По умолчанию — нет (правил на это в срезе нет).
- **Q-BE-7:** подтвердить AM-BE-1..9 (§10), особенно AM-BE-3 (порядок `gameOver` до 409, `commandUnavailable`) и AM-BE-2 (версия 2
  у новой AI-партии за Империю).

## 10. Proposed amendments (требуют согласия Analyst)

| # | Поправка |
|---|---|
| AM-BE-1 | `statusOf(state): SessionStatus` — обязательный метод `ServerGameModule`; статус пишется в `commit` команды; при создании — `initialStatus`. |
| AM-BE-2 | Док `createInitialState`: версия новой сессии ≥ 1 (AI-Повстанцы пасуют при создании → версия 2, события `GAME_CREATED…PASSED`). |
| AM-BE-3 | Порядок `core-v1`: 400 → 422 `gameOver` → 409 → 422 `commandUnavailable` → … (§3.3); общий `CommandSchema` обоих движков, поэтому «чужая» команда — 422 `commandUnavailable` (и в mock-сессиях для новых команд), а не 400. Новые ключи `commandUnavailable`, `unknownLeader`. |
| AM-BE-4 | Пометка авто-хода — `payload.auto: boolean` у `PASSED`/`ACTIVATION_FINISHED`. |
| AM-BE-5 | Состав state `core-v1` — §1.1 (статические данные копируются в state, BD-2); `round` = маркер времени, `reputation` отдельно. |
| AM-BE-6 | Mock player-view += `rulesEngine: 'mock-v1'`; `PlayerViewSchema` — вложенное объединение (`kind` → `rulesEngine`). |
| AM-BE-7 | Представление скрытой зоны: `location: {kind:'rebelBase'}` у юнитов/лидеров/активации, `systemId: null` в view-событиях; `contestedSystemIds` вычисляется сервером после редактирования. |
| AM-BE-8 | `details` += `rulesEngine`, `winner` (null до конца партии). |
| AM-BE-9 | Хранимый setup остаётся `schemaVersion: 2` (константы версий setup/state разделены). |

## 11. Риски

| Риск | Мера |
|---|---|
| Нет справочника → неточные данные / блок W2 | W1/W3/W4/W6a не зависят от данных (синтетический `mini-data`); W2 стартует по готовности справочника; отметки уверенности; PO правит данные без кода |
| Утечка базы через новые поля/события/порядок проверок/порядок id | одна `redact.ts`; owner раньше location; id и порядок юнитов не зависят от базы; инвариантность к переносу базы + path-aware скан API + логи |
| Вычислимость базы из открытого `sessionId` (алгоритм в открытом коде) | осознанно принимается (D-4, личный проект; код не в бандле); при необходимости — серверная соль позже |
| Переходное состояние AI-партии (`activeSide` = AI) случайно сохранится | `coreInvariants` при каждом `parseState`; модуль проверяет `CoreGameStateV3Schema` перед возвратом в тестах; лимит шагов |
| Два движка в одном пакете, рост типов | union по `rulesEngine`, отдельные папки/тесты; mock-логика не меняется (прежние тесты зелёные в W1) |
| Апкаст v2→v3 портит старые сессии / откат невозможен | замороженная `legacy-v2.ts`, фикстуры с HEAD, тест на копии реальной БД, `dev.pre-swr005.db` |
| Одно рабочее дерево: конфликт правок | фазы + таблица §7.1; передача файла только между фазами; переключение движка — последний шаг W5 после W6a |
| Объём api-тестов при переключении движка | W6a заранее уводит mock-сценарии на засеянные строки; W6b добавляет core |
| Вложенные папки ослабляют ESLint-границы | расширение `sibling()` + тест границ (W1) |

## 12. Не делаем
Бой, миссии, производство, зонды, выбор базы игроком, AI Commander/OpenAI, новые маршруты, новые зависимости, миграции БД,
переписывание JSON старых строк SQL-ом.
