# Архитектура приложения (платформа AI-компаньонов для настольных игр)

Статус: **действующий** — состояние после SWR-005B (серверный AI-слой OpenAI + dev-диагностика), 2026-11-08;
разделы §7.1 (AI-слой) и §8.1 (окружение) добавлены backend-lead на INTEGRATION SWR-005B
([`docs/tasks/SWR-005B/`](../tasks/SWR-005B/): `specification.md` → Contract, Clarifications, Decisions during IMPLEMENTATION;
`plan-backend.md`). История: SWR-002 (фундамент, одна
игра) — [`docs/tasks/SWR-002/`](../tasks/SWR-002/); SWR-003 (мультиигровая платформа) — [`docs/tasks/SWR-003/`](../tasks/SWR-003/);
SWR-004 (статус сессии, публичные настройки, идемпотентное создание, hot-seat Rebellion) — [`docs/tasks/SWR-004/`](../tasks/SWR-004/)
(`specification.md` → Contract + Clarifications Q-1..Q-25, `plan-backend.md`, `plan-frontend.md`); SWR-005 (state v3, два
движка правил, `statusOf`, AI авто-пас, данные базовой игры) — [`docs/tasks/SWR-005/`](../tasks/SWR-005/) (`specification.md` →
Rules ревизия 2, Clarifications, Data clarifications, Decisions during IMPLEMENTATION; правила среза —
[`docs/game-rules/rebellion-core-v1.md`](../game-rules/rebellion-core-v1.md)).
Как добавить игру — [`adding-a-game.md`](adding-a-game.md).

## 1. Слои и пакеты

```text
apps/web  (React SPA)                — каталог, страница игры, хост сессии (platform/**) + UI игр (games/<id>/**); НЕ знает правил
   │  HTTP JSON /api (Vite proxy); DTO из @bga/platform; из игровых пакетов только ./definition ./schema ./board ./assets
   ▼
apps/api  (NestJS)                   — sessions/** (общий сервис сессий), game-registry/** (единственное место, где названы игры),
   │                                   валидация (Zod), транзакции, маппинг ошибок
   │  ServerGameModule (интерфейс из @bga/platform)
   ▼
packages/games/<id>  @bga/game-<id>  — всё, что специфично для игры, subpath-экспорты:
   │   ./definition ./schema ./rules ./scenario ./board ./assets ./ai ./server
   ▼
packages/platform    @bga/platform   — GameDefinition, GameId, SessionStatus, SessionSummary, DTO сессий, Idempotency-Key,
                                       единый формат ошибок, общие messageKey, ServerGameModule (типы), рамка CommandEnvelope
apps/api/persistence                 — SQLite через Prisma: Session (gameId, setup, снимок state + version, status,
                                       idempotencyKey/Hash), SessionEvent (журнал), AiUsage (учёт AI-запросов, SWR-005B)
apps/api/config                      — единственное чтение окружения: Zod-схема → замороженный AppConfig (§8.1)
apps/api/ai                          — серверный AI-слой: AIProvider (OpenAI | mock), бюджет, учёт, цены (§7.1); игр не знает
apps/api/dev/ai                      — dev-only эндпоинты диагностики AI (нет в production)
```

Игры: `star-wars-rebellion` (`@bga/game-rebellion`, `available`) и `forbidden-stars` (`@bga/game-forbidden-stars`,
`coming_soon`: только `./definition` и `./assets`).

Направление зависимостей строго сверху вниз. Запреты проверяются ESLint (`no-restricted-imports`, автотест
`scripts/eslint-boundaries.test.mjs` в `pnpm test`):

- `@bga/platform` зависит только от `zod`; игровые пакеты — только от `@bga/platform` и `zod`, друг друга не импортируют.
- `./rules` — чистый детерминированный TS: без React/NestJS/Prisma/OpenAI/`node:*`, без `Date`/`Math.random` (время и id — через ctx);
  `./board`, `./definition`, `./schema`, `./assets` не импортируют `rules`/`scenario`/`server`/`ai`.
- `apps/web` импортирует из игровых пакетов только `./definition`, `./schema`, `./board`, `./assets`; общий web-код
  (`app/`, `shared/`, `platform/`) не знает игр — только `@/games/registry`.
- Общий серверный код (`sessions/`, `common/`, `persistence/`, `health/`) не импортирует игровые пакеты — только реестр
  `apps/api/src/game-registry/` (он видит `@bga/game-*/definition` и `/server`).
- Нигде (кроме тестов) нет `import()` с вычисляемым именем; реестры — обычные типизированные массивы (AC-9 SWR-003).
- SDK `openai` импортируется только в `apps/api/src/ai/**` (фактически — `ai/providers/openai-client.ts` и
  `openai-errors.ts`); `apps/api/src/ai/**` не импортирует игровые пакеты, `sessions/`, `game-registry/`, `dev/`;
  `apps/api/src/dev/**` не импортирует `openai` и игры; `@bga/platform` и `packages/games/*` не зависят от OpenAI;
  `process.env` в `apps/api/src` читается только в `config/env.ts` (ESLint `no-restricted-properties` + `architecture.int.test.ts`).

## 2. Реестры и поток данных

- **Сервер:** `game-registry/definitions.ts` (`GAME_DEFINITIONS` — все игры каталога, включая `coming_soon`) и
  `game-registry/registry.ts` (`SERVER_GAME_MODULES` — модули `available`-игр). При старте `validateRegistry` проверяет согласованность.
- **Web:** `apps/web/src/games/registry.ts` (`gameRegistry: WebGameEntry[]` — definition, обложка, `i18nPrefix`,
  `describeSession`, ленивые `SetupScreen`/`TableScreen`). Платформа читает его через `GameRegistryProvider`/`useGameRegistry()`.
  Тест `games/registry.consistency.test.ts` сверяет web- и серверный списки definitions.

**HTTP API** (`/api`): `GET /health`; `POST /sessions { gameId, setup }` (+ необязательный заголовок `Idempotency-Key: <UUID>`)
→ `201 { sessionId, gameId, status, settings, view }` (повтор → `200` + `Idempotent-Replay: true`);
`GET /sessions?gameId=` → `SessionSummary[]` (`{ sessionId, gameId, version, status, createdAt, updatedAt, details }`,
`updatedAt desc`, ≤ 20); `GET /sessions/:sessionId` → `{ sessionId, gameId, status, settings, view }`;
`POST /sessions/:sessionId/commands` → `{ ok: true, view, events }`.

Три слоя данных сессии (SWR-004): **метаданные** платформы (`status`, `gameId`, даты, ключ идемпотентности — колонки
`Session`), **полное состояние** (`Session.setup` + `Session.state`, только сервер) и **представление** для стороны
(`view` = `module.toPlayerView`). `settings` — публичные настройки, которые отдаёт игра (`module.publicSettings(setup)`);
платформа их не интерпретирует (у Rebellion: стороны, тип противника, сложность AI, `ruleset`, `gameMode`).

**Статус сессии** — `SessionStatus = 'setup' | 'prototype' | 'active' | 'completed'` (`@bga/platform`), колонка
`Session.status`. Начальное значение задаёт игра (`module.initialStatus(setup)`; Rebellion → `prototype`);
строки до SWR-004 получили `prototype` миграцией `20261108200000_session_status_idempotency`. **С SWR-005** после каждой
принятой команды сервис сессий спрашивает игру `module.statusOf(newState)` и пишет результат в `Session.status` **в том же
`updateMany`**, что и state/setup/version (проигранная гонка откатывает всё вместе). Значение проверяется
`SessionStatusSchema`; невалидное → 500 `INTERNAL` (лог `code=INVALID_STATUS`), ничего не записано. Смена статуса
логируется только как `code=STATUS_CHANGED <from>→<to>`. Ответ команды строит view уже с новым статусом. Платформа не знает
о победах и фракциях: Rebellion возвращает `completed`, если `rulesEngine = 'core-v1'` и задан `outcome`, иначе `prototype`
(`active` не используется — правила неполные, A-2). Неизвестное значение в БД → 500 (в списке строка пропускается).

**Создание.** 400 (форма тела; заголовок `Idempotency-Key` — один UUID, иначе 400 под `headers.idempotency-key`) →
404 `errors.gameNotFound` → 422 `GAME_UNAVAILABLE` (`coming_soon`/нет модуля) → **идемпотентность** (ключ уже есть: тот же
SHA-256 канонического `{gameId, setup}` → 200-повтор с текущим состоянием сессии; другое тело → 409 `IDEMPOTENCY_KEY_REUSED`) →
`module.parseSetup`: `invalid` → 400 `VALIDATION`, `unsupported` → 422 `SETUP_UNSUPPORTED` (игровой `messageKey`, напр.
`errors.rulesetUnavailable`, `details` только из запроса) → `createInitialState` → вставка `Session` (+ ключ и хеш) +
`SessionEvent` одной транзакцией → `view`. Ключ сохраняется только вместе с успешно созданной сессией (400/422 его не
«сжигают»); проигравший гонку по unique-индексу получает ответ как при повторе (никогда 500). Клиент генерирует новый ключ на
каждую попытку отправки формы (`useCreateSession`); клиентской стороне противника сервер не доверяет — вычисляет её сам.

**Команда.** UI показывает цели только из `view.legalActions` → `POST /api/sessions/:id/commands` с конвертом игры
`{ actor, expectedVersion: view.version, command }` → API: 404 `errors.sessionNotFound` → 400 (рамка конверта) →
422 (игра сессии недоступна) → 500 (битый снимок / статус / расхождение настроек) → `module.applyCommand` (порядок
внутри — у игры: 400 схема → 409 версия → 422 правила, игровой `messageKey`; у Rebellion `core-v1` — 400 → 422 `gameOver` →
409 → 422) → `module.statusOf(newState)` → в одной транзакции SQLite `UPDATE Session SET state, setup, version, status …
WHERE id = ? AND version = expected` (0 строк → 409, откат) + вставка `SessionEvent` → ответ с новым `view` и
отфильтрованными событиями. Одна команда может дать **несколько** событий и включать автоматические ходы AI (§4.3) —
всё это один `applyCommand` и один commit.

UI не меняет состояние «оптимистично». Все ошибки — `{ ok: false, error: { code, messageKey, details? } }`; тексты — в i18n
клиента (`translateError`: сначала `<игра>.errors`, затем общие `errors`).

## 3. Состояние, версии, журнал

- Источник истины — JSON-снимок состояния игры в `Session.state`; `Session.version` = `module.version(state)`;
  `Session.gameId` связывает сессию с игрой (индекс `(gameId, updatedAt)`).
- Новая сессия — версия ≥ 1 и начальные события (игра может применить автоматические ходы при создании: AI-партия
  Rebellion за Империю создаётся с версией 2 — пас AI-Повстанцев уже применён). Каждая команда **движка** — версия + 1
  (команда игрока + каждый авто-ход AI, Q-19); ответ несёт версию после последнего авто-хода, следующий
  `expectedVersion` = `view.version`. Отклонённая команда ничего не меняет.
- Правило «одно событие на версию» (A-15 SWR-002) действует только для `mock-v1`. В `core-v1` одна команда даёт несколько
  событий (напр. `PASSED` → `PHASE_STARTED{refresh}` → `LEADERS_RETURNED` → `TIME_ADVANCED` → `PHASE_STARTED{assignment}` →
  `PHASE_STARTED{command}`, затем авто-пас AI); инварианты — `seq` подряд без пропусков (= журнал state), версия + 1 на
  каждую команду движка.
- `SessionEvent` — append-only зеркало журнала, пишется в той же транзакции; `@@unique(sessionId, seq)`.
- Миграция `20261108120000_sessions` перенесла данные SWR-002 (`Game`/`GameEvent`) с `gameId = 'star-wars-rebellion'`.
- **Версии снимка Rebellion.** Текущая — state `schemaVersion: 3` (`GameStateSchema` = discriminated union по `rulesEngine`:
  `MockGameStateV3` | `CoreGameStateV3`), сохранённый setup — `schemaVersion: 2`. **Ленивый апкаст** при чтении
  (`parseState` / `parseStoredSetup` → `src/server/upcast.ts`): state v1 (SWR-002/003) → v2 (SWR-004; замороженная схема
  `src/server/legacy-v2.ts`) → v3 `rulesEngine: 'mock-v1'`, остальное без потерь; `version` не меняется (optimistic
  concurrency не затронута); неизвестная версия/битые данные → throw (500). SQL-миграции нет: строка становится v3 при первой
  записи (Q-30). Все апкастнутые строки — `mock-v1`; `core-v1` бывает только у сессий, созданных после SWR-005.

## 4. Правила Rebellion: два движка (`mock-v1`, `core-v1`) (+ hot-seat)

Движок записан в state (`rulesEngine`) и **никогда не меняется** у сессии. Единые точки входа `./rules` —
`applyCommand`, `getLegalActions`, `toSideView`, `toPlayerView`, `toPlayerEvents` — диспетчеризуют по `state.rulesEngine`
(`switch` с проверкой `never`); схема конверта команды общая (`CommandSchema` содержит команды обоих движков), поэтому
команда чужого движка — 422 `errors.commandUnavailable`, а не 400. Слои выше (`./server`, API, платформа) движков не различают,
кроме `statusOf`/`summarize`/авто-хода в модуле игры.

- **`mock-v1`** — старые сессии (SWR-002…004, после апкаста). Временная логика `src/rules/mock-rules.ts`, конвейер
  `mock-apply-command.ts`, view `mock-player-view.ts`, hot-seat `turn.ts`: `MOVE_PIECES` в соседнюю систему (всё или ничего),
  `ADVANCE_PHASE` (assignment → command → refresh → раунд + 1), `END_TURN`/`ACCEPT_HANDOFF`. Это **не** правила
  Star Wars: Rebellion; движок заморожен, только регрессионные тесты (на засеянных строках, `apps/api/test/support/swr004-db.ts`).
  Порядок для core-команд в mock-сессии: 400 → 409 → `commandUnavailable` → `notYourSide`.
- **`core-v1`** — все новые сессии. Данные базовой игры — `src/scenario/core/**` (`coreDataBaseV1`, id
  `rebellion-base-v1`: 32 системы, 8 регионов, 69 рёбер соседства, 18 типов юнитов, лидеры, стартовая расстановка), схемы и
  проверки целостности — `src/schema/data.ts`, web-safe списки id — `src/schema/core-ids.ts`. Статические данные (карта,
  типы юнитов) копируются в state при создании (BD-2). Движок — `src/rules/core/**`: раунд = маркер времени (старт 1),
  репутация 14 (неподвижна в срезе); назначение и обновление проходят автоматически внутри команды (в сохранённом state
  `phase = 'command'`, `refresh` — только при `outcome`); команды `ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION`,
  `PASS`, `ACCEPT_HANDOFF` (`ADVANCE_PHASE`/`END_TURN` → 422 `commandUnavailable`). Порядок проверок: 400 → 422 `gameOver` → 409 →
  `commandUnavailable` → `notYourSide` → `notYourTurn` → hot-seat → `wrongPhase` → проверки команды. Пас постоянен до конца
  фазы (`passed: { rebels, empire }`); фаза приказов кончается, когда спасовали обе; обновление возвращает лидеров и сдвигает
  время. База выбирается детерминированно `chooseRebelBase(sessionId, eligibleRebelBaseSystemIds(data))` (FNV-1a) и живёт
  только в state (`rebelBase: { systemId, revealed }`); раскрытие — наземный юнит Империи в системе базы при её
  `FINISH_ACTIVATION`; победы проверяются немедленно, конец партии — `outcome = { winner, reason }`, `legalActions = []`,
  любая команда → 422 `gameOver`, статус `completed` (§2). Подробно — `docs/game-rules/rebellion-core-v1.md`.

### 4.1 Детали сессии (`summarize` → `SessionSummary.details`)

Плоские несекретные поля: 6 публичных настроек + `round` (= время в `core-v1`), `phase`, `rulesEngine`, `winner`
(`null`, пока партия не окончена; всегда `null` у `mock-v1`), `reputation` (`null` у `mock-v1`). Ни систем, ни базы.

### 4.2 Hot-seat

В `core-v1` очередь меняет движок (после `FINISH_ACTIVATION`/`PASS`, после обновления): `handoffPending = true` только при
фактической смене активной стороны и никогда при `outcome`. handoff-view — ровно 8 ключей: `kind, id, version, activeSide,
round, phase, sessionStatus, rulesEngine` (Q-38).

### 4.3 AI авто-пас (сервер, без OpenAI)

`src/server/auto-play.ts` (`runAutoPlay`) вызывается модулем игры: в `createInitialState` (`createCoreInitialState` =
`createCoreGame(coreDataBaseV1)` + авто-ход) и в `applyCommand` после принятой `core-v1`-команды игрока (`origin: 'player'`).
Цикл: пока партия не окончена и активна AI-сторона, политика `chooseAutoCommand` (`src/ai/auto-pass.ts`, `auto-pass-v1`)
получает **только** `toSideView(state, aiSide)` и выбирает `PASS` (или `FINISH_ACTIVATION`) из его `legalActions`; команда
проходит полный конвейер движка с `origin: 'auto'` (разрешён только AI-стороне AI-партии), событие —
`actor = <AI-сторона>`, `payload.auto = true`. События ответа = события игрока + авто-ходов. Нет хода у политики, отказ
движка или > `MAX_AUTO_STEPS` (16) шагов → throw → 500, ничего не записано (Q-27; сообщение без данных state). Инвариант
SWR-004 сохранён: в AI-партии между командами активна сторона игрока, `handoffPending = false`; view и события в AI-партии
всегда строятся для `playerFaction` (в т.ч. если партия закончилась на ходу AI).

Настройки (SWR-004): фракции `rebels | empire`; клиент шлёт `{ playerFaction, opponentType, aiDifficulty?, ruleset, gameMode }`,
сервер вычисляет `opponentFaction = opponentOf(playerFaction)`; `ruleset: 'rise-of-the-empire'` и `gameMode: 'physical_companion'`
→ 422. Команды принимаются только от активной стороны `state.activeSide`. В AI-партии это всегда сторона игрока (AI не ходит).
В партии двух людей за одним устройством (`opponentType: 'human'`, `rules/turn.ts`, не mock): `END_TURN` →
`activeSide = opponentOf(activeSide)`, `handoffPending = true`; `ACCEPT_HANDOFF` от новой активной стороны снимает ожидание.
Подтверждение стороны доверительное (аутентификации нет). Данные SWR-002/003 (`'rebellion'`, `humanFaction`) читаются ленивым
апкастером v1 → v2 → v3 в модуле игры (§3).

## 5. Скрытая информация

- Полный state доступен только API и БД. Каждый ответ строится через `module.toPlayerView(state, { status })` (у Rebellion
  зритель = `state.activeSide`; параметра выбора стороны в API нет). `SessionSummary.details` — только несекретные поля
  (`summarize`, значения `string | number | boolean | null`).
- Hot-seat: пока `handoffPending`, сервер отдаёт **только** `{ kind: 'handoff', id, version, activeSide, round, phase,
  sessionStatus, rulesEngine }` (без систем, объектов, журнала, `legalActions`), события команды — `[]`. Клиент заменяет кеш view, сбрасывает
  сторы доски и не монтирует карту; `window.__boardDebug` в это время отсутствует.
- Rebellion `mock-v1`: для Империи, пока база не раскрыта, `rebelBase.systemId = null`; у скрытых объектов противника
  `typeKey = 'unknown'`; журнал фильтруется `toPlayerEvents`; `legalActions` — только объекты зрителя; id объектов непрозрачны (`pc-NN`).
- Rebellion `core-v1`: **единственная точка редактирования** — `src/rules/core/redact.ts`;
  `hiddenBaseFor = viewer === 'empire' && !revealed && outcome === null`. Пока скрыто: юниты/лидеры/активация Повстанцев в
  системе базы — `location: { kind: 'rebelBase' }` (зона «местоположение неизвестно»), `rebelBase.systemId = null`; в
  `SYSTEM_ACTIVATED`/`PIECES_MOVED` Повстанцев система базы → `null` («из/в скрытую зону», Q-15); `contestedSystemIds`
  считается после редактирования. View, события ответа команды и журнал редактируются против **текущего** state; после
  раскрытия или конца партии скрыто ничего (в т.ч. прошлые события, Q-14/Q-16). `legalActions` Империи строятся только из её
  юнитов и публичных данных (`ACTIVATE_SYSTEM.systemIds` = все системы) и не зависят от базы. Собственные данные Империи,
  случайно оказавшейся в системе базы, разрешены (W3 accepted). AI получает ту же `toSideView` своей стороны. Проверено
  сканированием ответов API скриптованной партии и логов Nest (`apps/api/test/hidden-info-core.int.test.ts`).
- Сценарий не попадает в web-бандл: `pnpm check:bundle` проверяет отсутствие секретных значений mock-сценария и `__boardDebug`, а
  также что в бандле нет модулей `rules|scenario|server|ai` ни одной игры (по sourcemap отдельной сборки). У `core-v1` секретов в
  статических данных нет (база вычисляется при создании и живёт только в state); id систем легально в бандле (Q-18).
- Логи сервера не содержат state, view и payload — только `sessionId`, `gameId`, код и статус.

## 6. Визуальные данные

Координаты систем Rebellion — в `@bga/game-rebellion/board` (мировые единицы): `mapLayout`/`MAP_BOUNDS` вымышленной карты
`mock-v1` и `coreMapLayout`/`coreRegionShapes`/`HIDDEN_BASE_ZONE_RECT`/`CORE_MAP_BOUNDS` карты `core-v1` (`core-layout.ts`, без
импорта `scenario`/`schema`); они не входят в state и не проходят через API. Подписи систем/регионов/юнитов/лидеров — i18n
web (`rebellion.data`), ключи — id из `src/schema/core-ids.ts`. Обложки игр и визуальные токены — `@bga/game-<id>/assets` (собственные абстрактные SVG-строки;
палитра стола Rebellion — `rebellionVisualTokens`, единственный источник; web-обёртка `games/rebellion/theme/palette.ts`).
Pan/zoom/drag — локальное состояние клиента (Zustand), не игровое.

## 7. AI на том же Command API

AI-сторона получает свой `PlayerView` (без секретов человека), выбирает действие **из `legalActions`**, строит такой же конверт
команды и проходит ту же цепочку валидация → `applyCommand` → транзакция → журнал. Отдельного «AI-пути» мутации состояния нет.
С SWR-005 это реализовано для детерминированного авто-паса `core-v1` (§4.3) внутри модуля игры; будущий AI Commander
подставляется как другая `AutoPolicy` (`(view) => Command | null`).
Параметры стратегии — данные `@bga/game-<id>/ai` (у Rebellion — уровни сложности и веса целей). OpenAI SDK и ключ — только в
`apps/api/src/ai` (§7.1); к ходу партии AI-слой пока не подключён (SWR-005B — только dev-диагностика).

### 7.1 Серверный AI-слой (`apps/api/src/ai`, SWR-005B)

Задача слоя — **выбрать** одно действие из списка legal actions, который вычислил вызывающий код; модель ничего не
выполняет и не «изобретает» действий, игровое состояние слой не видит и не меняет. Слой game-agnostic: контекст —
непрозрачная `side`, `phase`, `objective`, 2..10 действий с уникальными id (`AIDecisionContext`, `ai/ai.types.ts`).

- **Провайдер** — интерфейс `AIProvider { id: 'openai' | 'mock'; makeDecision(ctx) }`.
  - `OpenAIProvider` (`ai/providers/openai.provider.ts`): официальный SDK `openai` (точная версия в `apps/api/package.json`),
    Responses API, `text.format = json_schema strict` (`selectedActionId` — enum id контекста, `reason` ≤ 300),
    `max_output_tokens` по роли (`ai/model-roles.ts`: tactical 400, strategy 1600). Клиент создаётся лениво и только при
    `OPENAI_ENABLED=true` в `ai/providers/openai-client.ts` — единственном месте, где ключ раскрывается (`Secret.reveal()`);
    все опции SDK (baseURL, organization, project, logLevel `off`, `maxRetries: 0`, timeout) передаются явно, поэтому
    переменные `OPENAI_BASE_URL`/`OPENAI_LOG` и т. п. из окружения не действуют. Ошибки SDK оборачиваются в `AiFailure`
    (`ai/ai.errors.ts`, `providers/openai-errors.ts`) без исходных сообщений и заголовков.
  - Повторы — свои (`ai/retry.ts`): только сеть / таймаут / 429 / 5xx, не более `OPENAI_MAX_RETRIES`, backoff с учётом
    `retry-after`.
  - `MockAIProvider` (`providers/mock.provider.ts`): детерминированный, бесплатный (стоимость 0, бюджет не трогает);
    режимы сбоев (`invalid-action`, `malformed`, `timeout`, `rate-limit`, `network`, `server-error`) задаются только
    тестовыми overrides `createApp({ ai: { mockScript } })` — не из запроса и не из окружения.
  - Выбор: `OPENAI_ENABLED=false` → только mock; `true` → OpenAI, запрос может явно попросить `mock`.
- **Оркестрация** — `AiDecisionService` (`ai/ai-decision.service.ts`): провайдер → модель по роли → нет тарифа → 503
  `AI_NOT_CONFIGURED` (`errors.aiPricingUnknown`, без сети) → доступность модели (`GET /v1/models/{id}`, бесплатно, кэш в
  памяти, `ai/model-availability.service.ts`) → резерв бюджета → вызов → `validateDecision` (единая точка приёма решения:
  Zod + id ∈ `availableActions`, иначе 502 `AI_INVALID_DECISION`) → строка `AiUsage` на **каждый** исход → снятие резерва.
  Если строку `AiUsage` не удалось записать (после одного повтора) — 500, а резерв **не снимается** до перезапуска процесса
  (оплаченный вызов не должен выпасть из учёта; INTEGRATION SWR-005B).
- **Деньги — целые micro-USD** (1 USD = 1 000 000). Тарифы — `ai/pricing.ts` (`MODEL_PRICING`, `PRICING_VERSION`, ссылка на
  источник), поиск по настроенному id модели (точное совпадение); оценка
  `(input − cached)·in + cached·cachedIn + output·out` (reasoning входит в output), long-context множители, округление
  **вверх** на попытку. Стоимость в ответе — оценка; итог — по счёту OpenAI.
- **Учёт** — таблица `AiUsage` (миграция `20261108230000_ai_usage`): budgetKey, provider, model, role, status, attempts,
  токены (input/cached/output/reasoning), `estimatedCostMicroUsd`, `pricingVersion`, durationMs, errorCode, createdAt.
  Без текста промпта и ответа. Репозиторий — `ai/ai-usage.repository.ts`.
- **Бюджет** по `budgetKey` (`ai/budget.service.ts`): до платного вызова `spent (Σ AiUsage) + held + reserve ≥ limit` → 429
  `AI_BUDGET_EXCEEDED` (и строка `budget_exceeded`) без запроса к OpenAI. `reserve` — худший случай
  (верхняя граница входных токенов + `max_output_tokens`) × (`OPENAI_MAX_RETRIES` + 1). Проверка и резерв —
  под мьютексом ключа (promise-chain), сам вызов модели — вне блокировки; резервы хранятся в памяти процесса.
  **Ограничение:** лимит гарантирован только в пределах одного процесса API (как и SQLite у нас); несколько процессов на
  одной БД лимит не гарантируют. Лимит — `OPENAI_MAX_COST_PER_SESSION_USD`; ключ dev-диагностики — `dev-diagnostics`
  (для будущих игровых сессий — `sessionId`). Бюджет копится бессрочно; HTTP-сброса нет (см. ниже).
- **Логи** (`ai/ai-log.ts`): строка на попытку и итоговая строка из allow-list полей (провайдер, модель, роль, попытка,
  длительность, токены, стоимость, статус/код, budgetKey, request id) — без ключа, заголовков, промпта, `objective`, текста
  ответа и сообщений SDK. Пишутся в Nest `Logger('AI')`.
- **Nest** — `AiModule.forRoot` (`ai/ai.module.ts`, global): фабрики над обычными классами. Под `nodeEnv: 'test'` включённый
  OpenAI без тестового fake fetch отклоняется ещё при сборке модуля (и `createOpenAIClient` тоже) — тест не может уйти в сеть.
  Тестовые overrides (`createApp({ ai })`: fake fetch для настоящего SDK, mock-скрипт, часы, sink логов, лимиты частоты)
  запрещены при `nodeEnv: 'production'` (`ProductionOverridesError`).

**Dev-only эндпоинты** (`apps/api/src/dev/ai`, модуль подключается только при `NODE_ENV !== 'production'`; в production — 404):
`GET /api/dev/ai/status` (провайдер, `keyConfigured` — только флаг, модели и их доступность, бюджет) и
`POST /api/dev/ai/test-decision` (строгая Zod-схема: тестовый сценарий, `role`, `provider: auto|mock`, `budgetKey` только
`dev-diagnostics`). Порядок проверок POST: 404 → 403 → 413/400 → 429 (лимит частоты) → 503/502 → 429 (бюджет) → вызов модели.
Защита (`loopback.guard.ts` + `dev-ai-body.middleware.ts`, middleware стоит **до** глобальных body-парсеров):
TCP-адрес клиента — loopback (заголовки не учитываются, trust proxy выключен), `Host` — loopback (против DNS rebinding),
`Origin` (если есть) — loopback, все хопы `X-Forwarded-For` — loopback, `Sec-Fetch-Site ≠ cross-site`; иначе 403
`AI_DEV_FORBIDDEN` ещё до чтения тела. Тело ≤ 8192 байт (иначе 413 `VALIDATION`/`payload_too_large`). Лимит частоты на
процесс (`dev-rate-limiter.ts`): ≤ 10 платных и ≤ 120 любых запросов в минуту, 429 `AI_RATE_LIMITED` с `Retry-After`.
Ответы проходят строгие схемы `@bga/platform` (`ai-dev.ts`) — в них есть и USD, и micro-USD поля, ключа нет.
Web-страница `/dev/ai` существует только в dev-сборке (`check:bundle` проверяет её отсутствие в production-бандле).

**Сброс dev-бюджета** — только CLI (HTTP-сброса нет намеренно): удаляет строки `AiUsage` одного ключа в одной SQLite-БД.

```bash
cd apps/api
node scripts/reset-ai-budget.mjs --database-url file:./dev.db --key dev-diagnostics --yes
```

- без `--yes` ничего не открывается и не удаляется (exit 2); `--database-url` важнее переменной `DATABASE_URL`;
  `apps/api/.env` скрипт **не** читает;
- только `file:` URL; **относительный путь разрешается от `apps/api/prisma`** (как у Prisma для `schema.prisma`), т. е.
  `file:./dev.db` — это `apps/api/prisma/dev.db`, а не `apps/api/dev.db`; для уверенности можно передать абсолютный путь;
- удаляется история учёта ключа (другие таблицы не трогаются) — при необходимости сначала сделать копию БД. Работающий API
  подхватывает сброс сразу (бюджет каждый раз читает Σ из БД; резервы в памяти относятся только к идущим запросам).

## 8. Запуск и среды

| Среда | Как | Порты / БД |
|---|---|---|
| dev | `pnpm install` → `pnpm dev` (сборка пакетов `tsc -b packages`, `prisma generate` + `migrate deploy`, api + web параллельно) | api 3000, web 5173 (proxy `/api`), `apps/api/prisma/dev.db` |
| integration-тесты | `pnpm test` (Vitest + supertest, реальный Nest) | файл `apps/api/.tmp/test-<uuid>.db` на каждый тест |
| e2e | `pnpm e2e` (Playwright поднимает свои серверы; API собирается в очищаемый `apps/api/dist-e2e`) | api 3100, web 5174, `apps/api/.tmp/e2e.db` (пересоздаётся) |

Внутренние пакеты исполняются API из собранного `dist` (CommonJS), а Vite, Vitest и typecheck читают их TypeScript-исходники
через export-условие `@bga/source`. Runtime: Node 20.19.x (NestJS 11, Prisma 6).

### 8.1 Окружение API (`apps/api/src/config/env.ts`, SWR-005B)

- **Одна Zod-схема** (`EnvSchema`, `ENV_KEYS`): `DATABASE_URL` (обязательна), `PORT` (1..65535, 3000), `NODE_ENV`
  (`development|test|production`, по умолчанию `development`), `OPENAI_ENABLED` (обязательна, строго `true|false`), при
  `OPENAI_ENABLED=true` обязательны `OPENAI_API_KEY`, `OPENAI_STRATEGY_MODEL`, `OPENAI_TACTICAL_MODEL`,
  `OPENAI_MAX_COST_PER_SESSION_USD` (> 0 и ≤ 5); `OPENAI_TIMEOUT_MS` (1000..120000, 30000) и `OPENAI_MAX_RETRIES` (0..5, 2).
  Пустое значение = не задано; при `OPENAI_ENABLED=false` прочие `OPENAI_*` не проверяются. Результат — глубоко
  замороженный `AppConfig`, ключ — объект `Secret` (`toString`/`toJSON`/`inspect` → `[redacted]`). Конфиг передаётся в
  `createApp({ config })` и доступен провайдерам как `APP_CONFIG`; больше никто окружение не читает.
- **Fail-fast:** `main.ts` → `runBootstrap` (`bootstrap.ts`): при ошибке — одна строка
  `Invalid environment: <VAR>: <причина>; …` (только имена и фиксированные причины, без значений) и exit 1 — до создания app.
- **`.env`:** `loadAppConfig` читает `apps/api/.env` (создаётся из `.env.example` скриптом `db:prepare`), только если
  `NODE_ENV ≠ test`; переменные окружения процесса важнее файла; файл разбирается в локальный объект, `process.env` не
  меняется. `.env` не коммитится; `apps/api/.env.example` содержит все переменные схемы (ключ пустой,
  `OPENAI_ENABLED=false`), совпадение со схемой проверяет `env-example.unit.test.ts`. `DATABASE_URL="file:./dev.db"`
  разрешается Prisma относительно `prisma/schema.prisma`.
- **`NODE_ENV=test`:** `.env` не читается, а `OPENAI_ENABLED=true` отклоняется схемой. Тесты строят конфиг явно
  (`test/support/test-config.ts`, OpenAI выключен); тесты OpenAI используют настоящий SDK с fake fetch
  (`test/support/openai-fake-fetch.ts`); `setupFiles` Vitest ставят сетевой guard (`test/setup/no-network.ts`).
- **Поведение Prisma с `.env` (дефект D-1 SWR-005B):** сгенерированный `@prisma/client` при импорте (и при
  `new PrismaClient`), а также CLI `prisma` сами загружают `apps/api/.env` и копируют в `process.env` все переменные, которых
  там ещё нет (существующие, даже пустые, не перезаписывают). Поэтому:
  - `main.ts` импортирует `app.factory` (а с ним Prisma) только **после** валидации конфига — `AppConfig` никогда не видит
    значений, подложенных Prisma (в dev-процессе они после этого могут оказаться в `process.env`, но их никто не читает, а
    SDK OpenAI получает все опции явно);
  - тестовые и e2e-процессы получают все `OPENAI_*` явно пустыми и `OPENAI_ENABLED=false`: первый `setupFiles` Vitest
    (`test/setup/blank-openai-env.ts`), окружение e2e-API и его дочерних `prisma migrate deploy`/`tsc`
    (`scripts/e2e-env.mjs` → `buildE2eEnv`, `NODE_ENV=test`), дочерний `prisma migrate deploy` в `test/global-setup.ts`
    (тот же `buildE2eEnv`). Проверки — `test/env-isolation.int.test.ts` (только наличие/пустота, значения не читаются).

## 9. Известные ограничения

Нет авторизации и изоляции сессий; hot-seat — доверительный (кто держит устройство, не проверяется); AI-соперник сохраняет
сложность, но в `core-v1` только авто-пасует (AI Commander — Этап F; победа Империи против AI-Повстанцев в срезе
недостижима), в `mock-v1` не ходит; Rise of the Empire и режим с физическими компонентами — только 422; правила `core-v1` —
срез «раунд + активация» (без боя, миссий, производства; отклонения D-1…D-7 в `docs/game-rules/rebellion-core-v1.md`),
старые партии — mock-правила на вымышленной карте; Forbidden Stars —
только карточка каталога; SQLite и один процесс API (в т.ч. AI-бюджет гарантирован только в пределах одного процесса —
резервы в памяти, §7.1); AI-слой OpenAI подключён только к dev-диагностике (не к ходу партии), бюджет копится до ручного
сброса скриптом; NestJS 11 / CommonJS (переход на ESM и Nest 12 — отдельной задачей,
вероятно вместе с Node 22).
