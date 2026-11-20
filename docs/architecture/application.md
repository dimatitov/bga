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
→ `201 { sessionId, gameId, status, settings, view, automation }` (повтор → `200` + `Idempotent-Replay: true`);
`GET /sessions?gameId=` → `SessionSummary[]` (`{ sessionId, gameId, version, status, createdAt, updatedAt, details }`,
`updatedAt desc`, ≤ 20); `GET /sessions/:sessionId` → `{ sessionId, gameId, status, settings, view, automation }`;
`POST /sessions/:sessionId/commands` → `{ ok: true, view, events, automation }`;
`POST /sessions/:sessionId/automation/run` (тело пустое или `{}`) → `{ ok: true, view, events, automation }` (SWR-006, §7.2).
`automation` в ответах сессии — `{ pending, strategy }` (`strategy: 'bot' | 'openai' | null`; `null` — в сессии нет
автоматического участника); в ответах команды и run — сводка прогона `AutomationRunSummary`
(`{ steps, pending, strategy, fallbacks, fallbackReasons, stopReason }`).

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
отфильтрованными событиями. Одна команда может дать **несколько** событий. **С SWR-006** ходы AI в `applyCommand` не
входят: после commit команды человека тот же запрос запускает раннер автоматизации (§7.2), который делает ходы AI
**отдельными** commit'ами (по одному на шаг); ответ — view после прогона, события человека + события AI (через
`toPlayerEvents` человека) и сводка прогона. 409 на commit человека раннер не запускает.

UI не меняет состояние «оптимистично». Все ошибки — `{ ok: false, error: { code, messageKey, details? } }`; тексты — в i18n
клиента (`translateError`: сначала `<игра>.errors`, затем общие `errors`).

## 3. Состояние, версии, журнал

- Источник истины — JSON-снимок состояния игры в `Session.state`; `Session.version` = `module.version(state)`;
  `Session.gameId` связывает сессию с игрой (индекс `(gameId, updatedAt)`).
- Новая сессия — версия ≥ 1 и начальные события. С SWR-006 `createInitialState` автоматических ходов не делает: если
  первым ходит AI (Rebellion: человек за Империю), раннер (§7.2) сразу после вставки делает ходы AI отдельными commit'ами,
  и ответ создания показывает состояние после прогона. Каждая команда **движка** — версия + 1 (команда игрока + каждый
  ход AI, Q-19); ответ несёт версию после последнего хода AI, следующий `expectedVersion` = `view.version`. Отклонённая
  команда ничего не меняет.
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

### 4.3 AI-противник Rebellion (SWR-006; бот + опционально OpenAI)

До SWR-006 AI `core-v1` только пасовал внутри `applyCommand` (`src/server/auto-play.ts`, удалён). Теперь AI-сторону
`core-v1`-AI-партии играет **серверный раннер** (§7.2) через `ServerGameModule.automation` Rebellion
(`src/server/automation.ts`, `createRebellionAutomation`); `createInitialState` и `applyCommand` модуля ходов AI не делают.

- `isAutomated` — `rulesEngine = 'core-v1'` и `opponentType = 'ai'` (hot-seat и `mock-v1` не автоматизированы,
  `strategy: null`); `pendingActor` — AI-сторона, когда она активна, нет `handoffPending` и партия не окончена.
- `decisionPoint` — `buildDecision(toSideView(state, aiSide))` (`src/ai/decision.ts`): бот получает **только** view своей
  стороны (типы бота state не принимают), строит кандидатов из `legalActions` (`src/ai/candidates.ts`), ранжирует их
  политикой стороны и сложности (`src/ai/{rank,empire-policy,rebel-policy,profiles}.ts`), оставляет top-10 с непрозрачными
  id `c1..cN` (завершающее действие `PASS`/`FINISH_ACTIVATION` всегда в списке), `fallbackCandidateId = 'c1'` (выбор
  бота), `policyId = 'rebellion-bot-v1:<difficulty>'`. `objective`/`situation`/`summary` — английский текст только из
  view AI-стороны (`src/ai/describe.ts`); сложность в `situation` названа нейтрально («game difficulty setting: …»), без
  «bot difficulty», чтобы модель не читала её как указание играть слабо (review F-8).
- `applyCandidate` — заново строит то же решение (детерминированно), id → команда → полный конвейер движка с
  `origin: 'auto'` и `expectedVersion = state.version` (`origin: 'auto'` разрешён только AI-стороне AI-партии, событие —
  `actor = <AI-сторона>`). Человек не может сходить за AI: `applyCommand` модуля всегда `origin: 'player'`.
- Детерминизм: случайность бота — засеянный PRNG от `view.id#version` (`src/ai/random.ts`); часы и энтропия в
  `packages/games/*/src/ai/**` запрещены ESLint (B-6). Сложность (`easy | normal | hard`) — веса и знания профиля
  (`profiles.ts`); калибровка — симуляции `test/ai/sim/**`.
- **Знания бота-Империи о базе** (`src/ai/intel.ts`) — только из своего view и журнала: видимые юниты Повстанцев,
  отредактированный журнал, собственные обыски. Два источника приняты решениями Analyst:
  - **Q-BE-4** (только `hard`): публичное правило стартовой расстановки (база не в системах со стартовыми имперскими
    юнитами и не рядом с ними), восстановленное из своего журнала, — знание правил, не скрытая информация; `easy`/`normal`
    его не используют (часть разницы сложностей).
  - **Q-BE-5** (`normal`/`hard`): отредактированное событие SWR-005 «ход Повстанцев из S в скрытую зону» оставляет
    видимой систему-источник S ⇒ база смежна с S. Это публичная часть представления (то же видит человек за Империю);
    изменение redaction — вне SWR-006 (known limitation, §9); если его поменяют, бот просто перестанет получать подсказку.

Инвариант SWR-004 сохранён между прогонами: когда ход у человека, активна его сторона, `handoffPending = false`; view и
события в AI-партии всегда строятся для `playerFaction` (в т.ч. если партия закончилась на ходу AI). Старая политика
`auto-pass-v1` (`src/ai/auto-pass.ts`) осталась только для тестов (`createRebellionServerModule({ automation: { policy } })`,
golden-партии SWR-005 побайтно не изменились).

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
С SWR-006 ходы AI делает game-agnostic раннер сервера (§7.2) через `GameAutomation` игры: игра строит кандидатов из view
своей AI-стороны, стратегия сервера (бот или OpenAI) только выбирает один из них.
Параметры стратегии — данные `@bga/game-<id>/ai` (у Rebellion — уровни сложности и веса целей). OpenAI SDK и ключ — только в
`apps/api/src/ai` (§7.1); к ходу партии AI-слой подключает стратегия `openai` раннера (§7.2), если она включена.

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

### 7.2 Раннер автоматизации и стратегии AI Commander (`apps/api/src/sessions/automation`, SWR-006)

Контракт платформы — `packages/platform/src/automation.ts`: необязательное `ServerGameModule.automation: GameAutomation`
(`isAutomated`, `pendingActor`, `decisionPoint`, `applyCandidate`), схема точки решения `AutomationDecisionPoint`
(`actor`, `phase`, `objective`, `situation` ≤ 4000, 1..10 кандидатов `{ id, type, target?, summary }`,
`fallbackCandidateId`, `policyId`), коды `AutomationFallbackCode`, `AutomationStopReason`, сводка `AutomationRunSummary`.
Ни платформа, ни `apps/api/src/sessions/**` не знают слов и данных конкретной игры (`architecture.int.test.ts`).
Как реализовать `GameAutomation` в игре — [`adding-a-game.md`](adding-a-game.md) §5.2.

**Раннер** (`AutomationRunner`, `automation-runner.service.ts`):

- Кто запускает: `POST /api/sessions` (сразу после вставки), `POST …/commands` (после commit человека),
  `POST …/automation/run` (идемпотентно: нечего делать → `steps: 0`, `stopReason: 'none'`; клиент вызывает его, когда
  `automation.pending: true`, например после перезапуска сервера или прерванного прогона). Повтор создания по
  `Idempotency-Key` и `GET` раннер не запускают.
- Шаг: прочитать строку → `pendingActor` → `decisionPoint` (валидируется схемой платформы; невалидная точка — ошибка
  программы, модели не отправляется, `stopReason: 'error'`) → стратегия выбирает id → `applyCandidate` → commit с
  optimistic-guard версии (та же запись, что у команды человека: setup, status, события; `session-writer.ts`). Отказ
  движка на выбор стратегии → одна повторная попытка с выбором бота (`AI_INVALID_DECISION`); второй отказ → `error`.
- Остановка: ход человека (`humanTurn`), конец партии (`gameOver`), `AI_COMMANDER_MAX_STEPS` шагов (`stepLimit`, ход AI
  продолжит следующий прогон), проигранная гонка за версию (`conflict` + перечитанное состояние), ошибка (`error`,
  `pending` остаётся true). 0 шагов → `none`.
- Один прогон на сессию в процессе (`KeyedMutex`): второй вызывающий ждёт, перечитывает строку и находит `steps: 0` — без
  дублей ходов и платных вызовов. Каждый шаг — свой commit, поэтому прерванный прогон не теряет принятых ходов.
- **Принятый запрос никогда не превращается в 500 из-за автоматизации.** Все три вызывающих идут через общий guard
  `settleRun` (`automation/settle-run.ts`, review F-1; `bestEffortEnvelope` для `{ pending, strategy }` ответа создания):
  исключение раннера или `pendingActor` игры → 201/200 с последним известным состоянием, `stopReason: 'error'` и
  `pending: true` (best effort; клиент может повторить `automation/run`), лог `code=AUTOMATION_ERROR`. Регрессия —
  `apps/api/test/automation-create-guard.int.test.ts`.

**Стратегии** (`commander-strategy.ts`, `openai-commander.strategy.ts`; выбор — `AI_COMMANDER_PROVIDER`):

- `bot` (по умолчанию) — выбор бота игры (`fallbackCandidateId`), бесплатно, детерминированно, без сетевых вызовов.
- `openai` — поверх неизменного `AiDecisionService.decide(ctx, 'auto')` (§7.1) с промптом `purpose: 'commander'`
  (`ai/prompt.ts` копирует whitelist полей; `sessionId`, `policyId` и версия в промпт не попадают), ролью модели
  `AI_COMMANDER_MODEL_ROLE` и `budgetKey = sessionId`. Любой сбой → выбор бота с кодом D-PO-3 (`AI_TIMEOUT`,
  `AI_RATE_LIMITED`, `AI_PROVIDER_ERROR`, `AI_INVALID_DECISION`, `AI_NOT_CONFIGURED`, `AI_BUDGET_EXCEEDED`, `AI_DEADLINE`);
  партия из-за модели не останавливается. `< 2` кандидатов → бот без вызова. После `AI_NOT_CONFIGURED`,
  `AI_BUDGET_EXCEEDED`, `AI_DEADLINE` или исчерпанной квоты остаток прогона — бот без вызовов; после таймаута / 429 / 5xx /
  невалидного ответа следующий шаг снова пробует модель. Дедлайн прогона `AI_COMMANDER_RUN_DEADLINE_MS` —
  `Promise.race` без отмены (AM-BE-5). `reason` модели отбрасывается (не хранится, не логируется, не показывается).
- **Бюджет — на сессию:** `AiUsage.budgetKey = sessionId`, лимит `OPENAI_MAX_COST_PER_SESSION_USD`, резерв худшего случая
  и строка `AiUsage` на каждый вызов — как в §7.1. Ключ dev-диагностики (`dev-diagnostics`) отдельный и с сессиями не
  смешивается. `openai` допустим только при `OPENAI_ENABLED=true` (поэтому невозможен в `NODE_ENV=test`); тесты и e2e
  работают с `bot` (`scripts/e2e-env.mjs`).
- Тестовые overrides (`createApp({ automation: { strategy, logSink } })`) запрещены в production (`ProductionOverridesError`).

**Логи** (`automation-log.ts`, Nest `Logger('Automation')`, allow-list): `automation.step sessionId gameId step strategy
source fallbackCode durationMs code`, `automation.run sessionId gameId steps fallbacks stopReason durationMs`,
`automation.error sessionId gameId step code [error=<имя класса>]` (`ENGINE_REJECTED`, `CONFLICT`, `AUTOMATION_ERROR`,
`INVALID_DECISION_POINT`, `INVALID_STATUS`, `STRATEGY_ERROR`). Никогда: кандидаты, команды, данные партии, тексты
`situation`/`summary`, ответы модели, сообщения исключений. Неожиданная ошибка стратегии `openai` логируется с `sessionId`
прогона (= `AiUsage.budgetKey`; review F-5); `gameId` и `step` стратегия не знает — в этой строке они `?` и `0`, шаг видно
по соседней строке `automation.step` той же сессии. `sessionId` в серверных логах и `AiUsage` допустим (Q-BE-1), в запрос
к модели он не попадает.

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
через export-условие `@bga/source`. Runtime (SWR-007): Node 22 LTS (`.nvmrc` 22.23.5, `engines` `>=22.22.2`), pnpm 12 через
corepack; NestJS 12, Prisma 7, `openai` 7, Vitest 5, React Router 8. API собирается в CommonJS (`tsconfig.build.json`,
NodeNext), а ESM-only пакеты NestJS 12 грузятся через `require(esm)` Node 22 (без флагов). Prisma 7: URL для CLI — в
`apps/api/prisma.config.ts`, клиент работает через driver adapter `@prisma/adapter-better-sqlite3`
(`src/persistence/sqlite-adapter.ts`, `timestampFormat: 'unixepoch-ms'` — тот же INTEGER-формат DateTime, что писал
Prisma ≤ 6). CI: `.github/workflows/ci.yml` — `pnpm verify` + `check-task` на каждый push/PR, без секретов.

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
  означает `apps/api/prisma/dev.db`: относительный путь разрешается от `prisma/` (`resolveSqliteUrl`,
  `src/persistence/sqlite-url.ts`) — в `main.ts` и в `prisma.config.ts` (SWR-007; driver adapter сам разрешал бы от cwd).
- **`NODE_ENV=test`:** `.env` не читается, а `OPENAI_ENABLED=true` отклоняется схемой. Тесты строят конфиг явно
  (`test/support/test-config.ts`, OpenAI выключен); тесты OpenAI используют настоящий SDK с fake fetch
  (`test/support/openai-fake-fetch.ts`); `setupFiles` Vitest ставят сетевой guard (`test/setup/no-network.ts`).
- **Поведение Prisma с `.env` (дефект D-1 SWR-005B):** до SWR-007 (Prisma 6) сгенерированный `@prisma/client` при импорте
  (и при `new PrismaClient`), а также CLI `prisma` сами загружали `apps/api/.env` и копировали в `process.env` все
  переменные, которых там ещё не было. Prisma 7 этого не делает (проверено: `docs/tasks/SWR-007/artifacts/logs/prisma7-dotenv-probe.log`);
  CLI берёт из `.env` только `DATABASE_URL` и только при его отсутствии в окружении (`apps/api/prisma.config.ts`).
  Защитные меры ниже оставлены как страховка (defence in depth):
  - `main.ts` импортирует `app.factory` (а с ним Prisma) только **после** валидации конфига — `AppConfig` никогда не видит
    значений, подложенных Prisma (в dev-процессе они после этого могут оказаться в `process.env`, но их никто не читает, а
    SDK OpenAI получает все опции явно);
  - тестовые и e2e-процессы получают все `OPENAI_*` явно пустыми и `OPENAI_ENABLED=false`: первый `setupFiles` Vitest
    (`test/setup/blank-openai-env.ts`), окружение e2e-API и его дочерних `prisma migrate deploy`/`tsc`
    (`scripts/e2e-env.mjs` → `buildE2eEnv`, `NODE_ENV=test`), дочерний `prisma migrate deploy` в `test/global-setup.ts`
    (тот же `buildE2eEnv`). Проверки — `test/env-isolation.int.test.ts` (только наличие/пустота, значения не читаются).
- **AI Commander (SWR-006)** — проверяются всегда (независимо от `OPENAI_ENABLED`), пустое = по умолчанию:
  `AI_COMMANDER_PROVIDER` (`bot | openai`, `bot`; `openai` требует принятого `OPENAI_ENABLED=true`),
  `AI_COMMANDER_MODEL_ROLE` (`tactical | strategy`, `tactical` — какую из `OPENAI_*_MODEL` использовать),
  `AI_COMMANDER_MAX_STEPS` (1..256, 64 — шагов AI за один прогон), `AI_COMMANDER_RUN_DEADLINE_MS` (1000..120000, 45000 —
  время на вызовы OpenAI в одном прогоне; после него прогон доигрывает бот). Результат — `AppConfig.aiCommander`.

## 9. Известные ограничения

Нет авторизации и изоляции сессий; hot-seat — доверительный (кто держит устройство, не проверяется); AI-соперник в
`core-v1` играет ботом (или OpenAI-стратегией) в пределах среза правил, в `mock-v1` не ходит; бот-Империя использует
публичное правило стартовой расстановки (только `hard`, Q-BE-4) и подсказку «ход Повстанцев из S в скрытую зону» ⇒ база
рядом с S (`normal`/`hard`, Q-BE-5 — следствие redaction SWR-005, вне SWR-006); OpenAI-стратегия: дедлайн прогона без
отмены вызова (проигравший гонку вызов держит резерв бюджета до своего завершения, AM-BE-5), раннер и `KeyedMutex` — в
пределах одного процесса API; Rise of the Empire и режим с физическими компонентами — только 422; правила `core-v1` —
срез «раунд + активация» (без боя, миссий, производства; отклонения D-1…D-7 в `docs/game-rules/rebellion-core-v1.md`),
старые партии — mock-правила на вымышленной карте; Forbidden Stars —
только карточка каталога; SQLite и один процесс API (в т.ч. AI-бюджет гарантирован только в пределах одного процесса —
резервы в памяти, §7.1); бюджет OpenAI (сессий и dev) копится до ручного сброса скриптом; сборка API — CommonJS (NestJS 12
грузится через `require(esm)`; перевод `apps/api` на ESM — отдельной задачей при необходимости); `i18next` 26 /
`react-i18next` 17 придержаны (SWR-007: новые мажоры ужесточили типы ключей перевода — правки в Rebellion-UI после SWR-006).
