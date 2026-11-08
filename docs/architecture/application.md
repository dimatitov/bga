# Архитектура приложения (платформа AI-компаньонов для настольных игр)

Статус: **действующий** — состояние после SWR-004 (Game Setup & Factions), 2026-11-08. История: SWR-002 (фундамент, одна
игра) — [`docs/tasks/SWR-002/`](../tasks/SWR-002/); SWR-003 (мультиигровая платформа) — [`docs/tasks/SWR-003/`](../tasks/SWR-003/);
SWR-004 (статус сессии, публичные настройки, идемпотентное создание, hot-seat Rebellion) — [`docs/tasks/SWR-004/`](../tasks/SWR-004/)
(`specification.md` → Contract + Clarifications Q-1..Q-25, `plan-backend.md`, `plan-frontend.md`).
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
                                       idempotencyKey/Hash), SessionEvent (журнал)
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
`Session.status`. Начальное значение задаёт игра (`module.initialStatus(setup)`; Rebellion на mock-сценарии → `prototype`);
строки до SWR-004 получили `prototype` миграцией `20261108200000_session_status_idempotency`. В SWR-004 статус не меняется
по ходу партии. Неизвестное значение в БД → 500 (в списке строка пропускается).

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
422 (игра сессии недоступна) → 500 (битый снимок) → `module.applyCommand` (400 схема → 409 версия → 422 правила, игровой
`messageKey`) → в одной транзакции SQLite `UPDATE Session … WHERE id = ? AND version = expected` (0 строк → 409, откат) +
вставка `SessionEvent` → ответ с новым `view` и отфильтрованными событиями.

UI не меняет состояние «оптимистично». Все ошибки — `{ ok: false, error: { code, messageKey, details? } }`; тексты — в i18n
клиента (`translateError`: сначала `<игра>.errors`, затем общие `errors`).

## 3. Состояние, версии, журнал

- Источник истины — JSON-снимок состояния игры в `Session.state`; `Session.version` = `module.version(state)`;
  `Session.gameId` связывает сессию с игрой (индекс `(gameId, updatedAt)`).
- Новая сессия — версия 1 и начальные события; каждая принятая команда — версия + 1 и события; отклонённая — ничего не меняет.
- `SessionEvent` — append-only зеркало журнала, пишется в той же транзакции; `@@unique(sessionId, seq)`.
- Миграция `20261108120000_sessions` перенесла данные SWR-002 (`Game`/`GameEvent`) с `gameId = 'star-wars-rebellion'`.

## 4. Правила Rebellion: только mock (+ hot-seat)

Вся временная логика — в `packages/games/rebellion/src/rules/mock-rules.ts` и явно помечена как mock: перемещение своих
объектов в соседнюю систему (всё или ничего) и цикл фаз assignment → command → refresh → (раунд + 1). Это **не** правила
Star Wars: Rebellion; они появятся позже, заменив этот модуль без изменения слоёв выше.

Настройки (SWR-004): фракции `rebels | empire`; клиент шлёт `{ playerFaction, opponentType, aiDifficulty?, ruleset, gameMode }`,
сервер вычисляет `opponentFaction = opponentOf(playerFaction)`; `ruleset: 'rise-of-the-empire'` и `gameMode: 'physical_companion'`
→ 422. Команды принимаются только от активной стороны `state.activeSide`. В AI-партии это всегда сторона игрока (AI не ходит).
В партии двух людей за одним устройством (`opponentType: 'human'`, `rules/turn.ts`, не mock): `END_TURN` →
`activeSide = opponentOf(activeSide)`, `handoffPending = true`; `ACCEPT_HANDOFF` от новой активной стороны снимает ожидание.
Подтверждение стороны доверительное (аутентификации нет). Данные SWR-002/003 (`'rebellion'`, `humanFaction`) читаются ленивым
апкастером v1 → v2 в модуле игры.

## 5. Скрытая информация

- Полный state доступен только API и БД. Каждый ответ строится через `module.toPlayerView(state, { status })` (у Rebellion
  зритель = `state.activeSide`; параметра выбора стороны в API нет). `SessionSummary.details` — только несекретные поля
  (`summarize`, значения `string | number | boolean | null`).
- Hot-seat: пока `handoffPending`, сервер отдаёт **только** `{ kind: 'handoff', id, version, activeSide, round, phase,
  sessionStatus }` (без систем, объектов, журнала, `legalActions`), события команды — `[]`. Клиент заменяет кеш view, сбрасывает
  сторы доски и не монтирует карту; `window.__boardDebug` в это время отсутствует.
- Rebellion: для Империи, пока база не раскрыта, `rebelBase.systemId = null`; у скрытых объектов противника `typeKey = 'unknown'`;
  журнал фильтруется `toPlayerEvents`; `legalActions` — только объекты зрителя; id объектов непрозрачны (`pc-NN`).
- Сценарий не попадает в web-бандл: `pnpm check:bundle` проверяет отсутствие секретных значений сценария и `__boardDebug`, а также
  что в бандле нет модулей `rules|scenario|server|ai` ни одной игры (по sourcemap отдельной сборки).
- Логи сервера не содержат state, view и payload — только `sessionId`, `gameId`, код и статус.

## 6. Визуальные данные

Координаты систем Rebellion — `mapLayout` в `@bga/game-rebellion/board` (мировые единицы, `MAP_BOUNDS`); они не входят в state
и не проходят через API. Обложки игр и визуальные токены — `@bga/game-<id>/assets` (собственные абстрактные SVG-строки;
палитра стола Rebellion — `rebellionVisualTokens`, единственный источник; web-обёртка `games/rebellion/theme/palette.ts`).
Pan/zoom/drag — локальное состояние клиента (Zustand), не игровое.

## 7. Будущий AI на том же Command API

AI-сторона получит свой `PlayerView` (без секретов человека), выберет действие **из `legalActions`**, построит такой же конверт
команды и пройдёт ту же цепочку валидация → `applyCommand` → транзакция → журнал. Отдельного «AI-пути» мутации состояния нет.
Параметры стратегии — данные `@bga/game-<id>/ai` (у Rebellion — уровни сложности и веса целей). OpenAI SDK и ключ — только в
`apps/api` (пока отсутствуют).

## 8. Запуск и среды

| Среда | Как | Порты / БД |
|---|---|---|
| dev | `pnpm install` → `pnpm dev` (сборка пакетов `tsc -b packages`, `prisma generate` + `migrate deploy`, api + web параллельно) | api 3000, web 5173 (proxy `/api`), `apps/api/prisma/dev.db` |
| integration-тесты | `pnpm test` (Vitest + supertest, реальный Nest) | файл `apps/api/.tmp/test-<uuid>.db` на каждый тест |
| e2e | `pnpm e2e` (Playwright поднимает свои серверы; API собирается в очищаемый `apps/api/dist-e2e`) | api 3100, web 5174, `apps/api/.tmp/e2e.db` (пересоздаётся) |

Внутренние пакеты исполняются API из собранного `dist` (CommonJS), а Vite, Vitest и typecheck читают их TypeScript-исходники
через export-условие `@bga/source`. Runtime: Node 20.19.x (NestJS 11, Prisma 6).

## 9. Известные ограничения

Нет авторизации и изоляции сессий; hot-seat — доверительный (кто держит устройство, не проверяется); AI-соперник сохраняет
сложность, но не ходит; Rise of the Empire и режим с физическими компонентами — только 422; правила Rebellion — mock, карта и
названия вымышленные; Forbidden Stars —
только карточка каталога; SQLite и один процесс API; NestJS 11 / CommonJS (переход на ESM и Nest 12 — отдельной задачей,
вероятно вместе с Node 22).
