# Specification — SWR-003

## Business goal
Превратить приложение из «компаньона одной игры» в платформу AI-компаньонов для настольных игр: каталог игр,
страница игры, общие сессии/сохранения, а правила, схема состояния, карта, ассеты и AI-конфигурация каждой игры —
в изолированном модуле. Добавление новой игры = новый игровой пакет + запись в реестрах, без правок общей
маршрутизации и управления сессиями. Сейчас реально работает только Star Wars: Rebellion.

## Scenarios
1. **Каталог.** `/` — сетка карточек из реестра: Star Wars: Rebellion (`available`) и Forbidden Stars (`coming_soon`, без правил).
   Карточка: обложка (собственная плейсхолдер-графика), название, описание, статус, игроки, поддержка AI. В шапке — «Настройки».
2. **Страница игры.** Клик по карточке → `/games/:gameId`: обложка, описание, игроки, AI; «Новая партия» и «Продолжить партию»
   (последняя сессия **этой** игры; неактивна без сохранений), список недавних сессий этой игры (≤ 5).
   Для `coming_soon` — пометка «Скоро», действия неактивны.
3. **Новая партия.** «Новая партия» → `/games/:gameId/new` → экран настройки этой игры (для Rebellion — существующий из SWR-002)
   → `POST /api/sessions` → `/sessions/:sessionId`.
4. **Игровой стол.** `/sessions/:sessionId` — общий хост сессии получает `{ sessionId, gameId, view }`, находит игру в реестре и
   рендерит её стол (для Rebellion — стол SWR-002 без потери функций). Ссылка «к игре» ведёт на `/games/:gameId`.
5. **Продолжение.** `/games/star-wars-rebellion` → «Продолжить партию» → последняя сессия Rebellion; перезагрузка `/sessions/:id` восстанавливает состояние.
6. **Настройки.** `/settings` — общие настройки (язык, уменьшение анимации), как в SWR-002.

## Architecture contract (frozen before parallel work)

### Пакеты (scope переименовывается `@swr/*` → `@bga/*`: платформа больше не про одну игру)
```text
packages/platform               @bga/platform — общие контракты платформы (Zod + TS):
                                GameDefinition, GameId, SessionSummary, Create/Get/List session DTO,
                                единый формат ошибок + каталог общих messageKey, ServerGameModule (интерфейс, только типы),
                                CommandEnvelope-«рамка» (actor, expectedVersion, command: unknown).
packages/games/rebellion        @bga/game-rebellion — ВСЁ, что специфично для Rebellion, разделено subpath-экспортами:
  ./definition                  GameDefinition (id 'star-wars-rebellion')
  ./schema                      Game State Schema: Zod-схемы state/view/commands/setup/events (бывший contracts, игровая часть)
  ./rules                       Game Rules Engine: createGame/applyCommand/toPlayerView/getLegalActions + mock-rules (бывший game-core)
  ./scenario                    mock-сценарий (бывший game-data scenario) — только сервер
  ./board                       Game Board Configuration: mapLayout и параметры карты (бывший game-data/layout)
  ./assets                      Game Assets: обложка и визуальные токены игры (только собственная графика)
  ./ai                          AI Strategy Configuration: конфигурация уровней сложности/стратегии (данные, без логики, без OpenAI)
  ./server                      реализация ServerGameModule для API (связывает definition+schema+rules+scenario)
packages/games/forbidden-stars  @bga/game-forbidden-stars — только ./definition (status 'coming_soon') и ./assets (обложка). Ни правил, ни схем.
```
- Удаляются `packages/contracts`, `packages/game-core`, `packages/game-data` (содержимое переезжает, тесты сохраняются).
- Граница импортов (ESLint, проверяется): `apps/web` может импортировать из игровых пакетов только `./definition`, `./schema`,
  `./board`, `./assets`; никогда `./rules`, `./scenario`, `./server`, `./ai`. Общий код платформы (`apps/api/src/sessions/**`,
  `apps/api/src/common/**`, `apps/web/src/app/**`, `apps/web/src/shared/**`, `apps/web/src/platform/**`) **не импортирует** игровые пакеты
  вообще — только реестры (`apps/api/src/game-registry/**`, `apps/web/src/games/registry.ts`) и папки конкретной игры.
- `@bga/platform` не импортирует игровые пакеты. Игровые пакеты импортируют только `@bga/platform` (и zod).

### Реестры (типизированные, статические; без плагинов и динамической загрузки пакетов)
- **Сервер:** `apps/api/src/game-registry/registry.ts` — массив `ServerGameModule[]`; сейчас `[rebellionServerModule]`.
  Плюс список всех `GameDefinition` (включая coming_soon) для валидации `gameId`.
- **Web:** `apps/web/src/games/registry.ts` — массив `WebGameEntry { definition; cover; SetupScreen?; TableScreen? }`
  (экраны — `React.lazy`, это обычный code-splitting, не загрузка игр). Сейчас: Rebellion (с экранами) и Forbidden Stars (только definition+cover).
- **Добавление игры** = новый пакет `packages/games/<id>` + по одной записи в двух реестрах. Маршруты, хост сессии, сервис сессий,
  каталог и страница игры не меняются. Чек-лист — `docs/architecture/adding-a-game.md`.

### `ServerGameModule` (интерфейс в `@bga/platform`)
```ts
interface ServerGameModule<State = unknown, View = unknown> {
  definition: GameDefinition;
  parseSetup(input: unknown): Result<Setup>;                       // 400 при ошибке
  createInitialState(setup, ctx: { sessionId; now }): State;
  parseState(raw: unknown): State;                                 // снимок из БД
  applyCommand(state, envelope: unknown, ctx: { now }):            // порядок 400→409→422 внутри модуля, как в SWR-002
    { ok: true; state; events } | { ok: false; error };
  toPlayerView(state): View;                                       // только видимое человеку
  toPlayerEvents(events, state): unknown[];
  summarize(state): Record<string, string | number | boolean>;     // для списков сессий
  version(state): number;
}
```
Точная форма — на backend-lead (можно уточнить, сохранив смысл: сервис сессий не знает про фракции, фазы, систем).

### HTTP API (`/api`)
| Method | Path | Ответ |
|---|---|---|
| GET | `/api/health` | `{ status: 'ok' }` |
| POST | `/api/sessions` body `{ gameId, setup }` | `201 { sessionId, gameId, view }` · 404 `errors.gameNotFound` (нет такой игры) · 422 `GAME_UNAVAILABLE` `errors.gameUnavailable` (coming_soon) · 400 (setup невалиден по схеме игры) |
| GET | `/api/sessions?gameId=<id>` | `[SessionSummary]` по `updatedAt desc`, максимум 20; без `gameId` — все игры |
| GET | `/api/sessions/:sessionId` | `{ sessionId, gameId, view }` |
| POST | `/api/sessions/:sessionId/commands` | как SWR-002 (`CommandResult` с view игры), порядок 404→400→409→422 |

- `SessionSummary { sessionId, gameId, version, createdAt, updatedAt, details: Record<string, string|number|boolean> }` — `details` из `summarize()`.
- Старые `/api/games*` удаляются (прототип, внешних клиентов нет).
- Ошибки — единый формат SWR-002; новые коды/ключи: `GAME_UNAVAILABLE`, `errors.gameNotFound`, `errors.gameUnavailable`, `errors.sessionNotFound`.

### Persistence
- Prisma: `Game` → `Session` (`id, gameId, setup, state, version, createdAt, updatedAt`, индекс `(gameId, updatedAt)`), `GameEvent` → `SessionEvent`.
- Новая миграция переносит существующие строки, проставляя `gameId = 'star-wars-rebellion'` (dev-БД пользователя не теряется).

### Web
- Маршруты: `/` CatalogPage, `/games/:gameId` GamePage, `/games/:gameId/new` → `registry[gameId].SetupScreen`, `/sessions/:sessionId`
  → SessionHost → `registry[gameId].TableScreen`, `/settings`, `*` not-found. Неизвестный `gameId` → not-found с ссылкой в каталог;
  `/games/:gameId/new` для coming_soon → страница игры с пометкой «Скоро» (без формы).
- Rebellion-специфичный UI переезжает в `apps/web/src/games/rebellion/**` (бывшие `features/game-setup` (форма), `game-board`, `game-session`, `ai-opponent`);
  общий — `apps/web/src/platform/**` (catalog, game page, session host, sessions hooks) + `shared/**`, `app/**`.
- Главное меню SWR-002 заменяется каталогом; «Продолжить» и «недавние» — на странице игры.

## Acceptance criteria (testable)
- **AC-1:** `/` показывает карточку Star Wars: Rebellion с названием, изображением, описанием и статусом «доступна»; карточки строятся из реестра (есть также карточка Forbidden Stars со статусом «скоро»).
- **AC-2:** Клик по карточке Rebellion открывает `/games/star-wars-rebellion` с «Новая партия» и «Продолжить партию»; карточка coming_soon открывает страницу игры с неактивными действиями.
- **AC-3:** «Новая партия» → `/games/star-wars-rebellion/new` → создание → `/sessions/:sessionId`, стол работает со всеми функциями SWR-002 (выбор, перемещение, фаза, журнал, сохранение) — e2e SWR-002 перенесены на новые маршруты и зелёные.
- **AC-4:** Сохранённая партия открывается со страницы игры: «Продолжить партию» → последняя сессия этой игры; недавние сессии (≤5) этой игры; перезагрузка `/sessions/:id` восстанавливает состояние.
- **AC-5:** Новая игра регистрируется без изменения общей маршрутизации и управления сессиями: (а) тест сервиса сессий с фиктивным `ServerGameModule` (create/get/list/command) без правок кода сервиса; (б) тест каталога/страницы игры с фиктивной записью web-реестра; (в) ESLint-граница: общий код не импортирует игровые пакеты; (г) `docs/architecture/adding-a-game.md`.
- **AC-6:** Forbidden Stars содержит только definition и обложку; создать для неё сессию нельзя (`POST /api/sessions` → 422 `GAME_UNAVAILABLE`); правил, схем, карты нет.
- **AC-7:** Сессии связаны с `gameId`: колонка в БД, `gameId` во всех ответах сессий, фильтр списка по `gameId`; существующие сессии мигрированы с `gameId = 'star-wars-rebellion'`.
- **AC-8:** Все проверки проходят: `pnpm verify` (lint, typecheck, test, build, check:bundle — обновлён под новые пути, e2e), `check-task`.
- **AC-9:** Нет системы плагинов, динамической загрузки игровых пакетов по имени, админки; реестры — обычные типизированные массивы.

## Assumptions
- `gameId`: `star-wars-rebellion`, `forbidden-stars`. Названия игр — текстом (номинативное использование), без логотипов и артов; обложки — собственные абстрактные SVG.
- Переименование scope `@swr` → `@bga` (по имени репозитория) — механическое, в одном шаге перед параллельной работой.
- Старые URL `/games/<uuid>` из SWR-002 не поддерживаются (прототип) — показывают not-found с ссылкой в каталог.
- `supportedPlayers` Rebellion: `[2]`, `supportsAI: true`; Forbidden Stars: `[2, 3, 4]`, `supportsAI: true` (данные карточки, не реализация).

## Risks
- Большой механический рефакторинг пакетов затрагивает почти все импорты → делается одним исполнителем первым шагом, с зелёными гейтами до параллельной работы.
- Миграция Prisma с переименованием таблиц в SQLite — проверить на копии существующей dev-БД.

## Out of scope
См. `request.md`.

## Clarifications (Analyst, 2026-11-08) — ответы на Q-1..Q-25 из `test-cases.md`
| # | Решение |
|---|---|
| Q-1 | Каталог статический — из web-реестра, без запроса к API (работает при недоступном API). |
| Q-2 | Порядок карточек = порядок в реестре; доступные игры первыми. |
| Q-3 | `POST /api/sessions`: 400 (форма тела: нет `gameId`/`setup`) → 404 `errors.gameNotFound` → 422 `GAME_UNAVAILABLE` → 400 (setup по схеме игры). |
| Q-4 | `GAME_UNAVAILABLE` — новый `error.code` (HTTP 422), messageKey `errors.gameUnavailable`. |
| Q-5 | `?gameId=` неизвестный → `[]` (200); пустой → как без фильтра; повторный → 400 VALIDATION. |
| Q-6 | `CommandResult` без изменений формы (без `gameId`); клиент знает `gameId` из сессии. |
| Q-7 | Сессия с `gameId`, которого нет в реестре сервера: в списке пропускается (лог `gameId`+код), `GET /api/sessions/:id` → 422 `GAME_UNAVAILABLE`. |
| Q-8 | Нет: web импортирует только subpath'ы `./definition`, `./schema`, `./board`, `./assets`; корневой экспорт игрового пакета для web запрещён. |
| Q-9 | Добавление игры = новый пакет + записи в двух реестрах + (если нужно) web-локали игры и ссылка tsconfig/workspace — это допустимо; маршруты, хост сессии, сервис сессий, каталог и страница игры не меняются. |
| Q-10 | `game-table`: добавить `data-session-id`; `data-game-id` остаётся и теперь означает идентификатор игры (`star-wars-rebellion`). e2e обновляются. |
| Q-11 | Название игры — из definition (не переводится, имя собственное); описание и alt — i18n-ключи игры (ru/en); definition содержит ключи `descriptionKey`, допустимо дополнительно `description` (ru) как fallback. |
| Q-12 | Карточка: «2 игрока», «AI-противник ✓» (локализовано), статус — чип «Доступна»/«Скоро». |
| Q-13 | Элемент недавних сессий: сторона, соперник, раунд/фаза (из `details`), «N мин. назад». |
| Q-14 | Да: последняя сессия есть и в «Продолжить», и первой в недавних. |
| Q-15 | Ошибка загрузки списка: страница игры работает, «Новая партия» доступна, на месте списка — inline-ошибка с «Повторить», «Продолжить» неактивна. |
| Q-16 | Нет, для coming_soon сессии не запрашиваются. |
| Q-17 | `/games/<coming_soon>/new` рендерит на месте экран «Скоро» с ссылкой на страницу игры (без редиректа). |
| Q-18 | Нет, клиент доверяет фильтру сервера (тест сервера это гарантирует). |
| Q-19 | Экран настройки: ссылка «← к игре» на `/games/:gameId`. |
| Q-20 | Хост сессии: неизвестная игра или нет TableScreen → понятный экран ошибки «Игра недоступна» с ссылкой в каталог. |
| Q-21 | Запрет `import()` с вычисляемым именем — во всём репозитории (web, api, packages), кроме тестов. |
| Q-22 | Ключ `swr.settings.v1` → `bga.settings.v1` с одноразовым переносом старого значения. |
| Q-23 | Да: `check:bundle` дополнительно проверяет, что в bundle нет модулей `rules`/`scenario`/`server`/`ai` игровых пакетов (по manifest/sourcemap или маркерам). |
| Q-24 | В SWR-003 схема состояния Rebellion не меняется → миграция JSON не нужна (переименование фракций — SWR-004). |
| Q-25 | Да: тест согласованности — множества `gameId` и definition в web- и серверном реестре совпадают. |

## Decisions after TECH_PLANNING (Analyst, 2026-11-08)
- **Accepted amendments:** backend AM-1 (с форматом ключа ниже), AM-2 (уточнённый `ServerGameModule`), AM-4 (порядки проверок), AM-6, AM-7 (временный web-allowlist ESLint; к INTEGRATION пуст и удалён), AM-8 (legacy DTO до INTEGRATION), AM-9 (`details` Rebellion: `humanFaction, opponent, difficulty?, round, phase`), AM-10; frontend PA-1..PA-7 в редакции `plan-backend.md` §9.3.
- **R-1 / AM-1:** `descriptionKey` и `coverAltKey` — namespace-qualified ключи i18n web (`rebellion.meta:description`, `rebellion.meta:coverAlt`); `name` — имя собственное; `coverImage?` остаётся в схеме, обложки — из `./assets`. Вариант `LocalizedText` отклонён.
- **R-2 / Q-5:** `GET /api/sessions?gameId=<неизвестный, но корректного формата>` → `200 []`; значение неверного формата (не `^[a-z0-9-]{1,64}$`) → 400 VALIDATION.
- **R-3:** `e2e/**` принадлежит QA (qa-lead), не FE.
- Корневой workspace можно переименовать в `board-game-ai`.
- `check:bundle` с дополнительной сборкой (+10–20 с) — принято.
- **Git:** исполнители не коммитят (коммиты — только по просьбе PO); «R1/R2» — последовательные шаги с зелёными гейтами после каждого.
