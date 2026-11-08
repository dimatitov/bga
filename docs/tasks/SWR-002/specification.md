# Specification — SWR-002

## Business goal
Получить работающий каркас приложения и проверяемый UX-прототип игрового стола, на котором видна целевая модель
взаимодействия: **пользователь выбирает объект → приложение предлагает допустимые действия → действие проходит
через Command API → сервер фиксирует новое состояние**. Это фундамент для Этапов D–F (правила, данные, AI).

## Scenarios
1. **Новая партия.** `/` → «Новая партия» → `/games/new`: фракция (Империя/Повстанцы), соперник (AI/человек), сложность AI
   → «Начать» → сервер создаёт сессию из mock-сценария → переход на `/games/:id`.
2. **Продолжение.** `/` → «Продолжить» → последняя сохранённая партия (или список, если их несколько; кнопка неактивна, если партий нет).
3. **Осмотр стола.** Карта с тестовыми системами, юнитами, жетонами; pan (перетаскивание фона) и zoom (колесо, кнопки +/−/«вписать»);
   в шапке — раунд и фаза; справа — контекстная панель; внизу/сбоку — журнал событий.
4. **Выбор.** Клик по системе → подсветка + панель системы (название, регион, присутствующие объекты, соседние системы).
   Клик по объекту → объект выделен, панель действий показывает доступные команды.
5. **Перемещение.** Два эквивалентных способа: (а) в панели действий «Переместить → <система>» (1 клик по варианту);
   (б) drag объекта на подсвеченную допустимую систему. Недопустимая цель — визуальный отказ и откат предпросмотра.
   Успех — объект в новой системе, событие в журнале, обратная связь (snackbar/aria-live).
6. **Сохранение и восстановление.** Каждая принятая команда сохраняется сервером автоматически; после перезагрузки страницы
   или повторного входа через «Продолжить» состояние то же.
7. **Mock-фаза.** Кнопка «Завершить фазу (mock)» переключает фазу/раунд — явно помечена как временная логика.
8. **Настройки.** `/settings`: язык интерфейса (ru/en), уменьшение анимации; хранятся на клиенте.

## Architecture contract (frozen before parallel work)

### Workspace
```text
apps/web        React + TS + Vite, MUI, Zustand, TanStack Query, React Router, React Konva, react-i18next
apps/api        NestJS + Prisma (SQLite)
packages/contracts   Zod-схемы и TS-типы: GameState, PlayerView, Command, CommandResult, API DTO
packages/game-core   чистый TS: createGame(setup, scenario), applyCommand(state, envelope), toPlayerView(state, viewer), getLegalActions(state, viewer)
packages/game-data   mock-сценарий: системы, соседство, стартовые объекты; ОТДЕЛЬНО — mapLayout (визуальные координаты)
```
- `game-core` импортирует только `contracts` (и `game-data` в тестах). Ни React, ни NestJS, ни Prisma.
- `apps/web` не импортирует `game-core` (правила — только на сервере); импортирует `contracts` и `game-data/layout`.
- Визуальные координаты систем — `packages/game-data` `mapLayout: Record<SystemId, {x, y}>`; **не** часть GameState.
  Позиция объекта на экране вычисляется UI из `piece.systemId` + layout (раскладка внутри системы — UI).

### Domain (contracts)
- `Faction = 'empire' | 'rebellion'`; `PlayerKind = 'human' | 'ai'`; `Difficulty = 'easy' | 'normal' | 'hard'`.
- `GameSetup { humanFaction: Faction; opponent: { kind: PlayerKind; difficulty?: Difficulty } }`.
- `Phase = 'assignment' | 'command' | 'refresh'` (названия фаз Rebellion; переходы — mock).
- `GameState { id; version: number; round: number; phase: Phase; setup; systems: System[]; pieces: Piece[]; rebelBase: { systemId: string | null; revealed: boolean }; log: GameEvent[] }`.
- `System { id; nameKey; regionId; adjacentSystemIds: string[] }` (имена — ключи локализации, тексты в i18n).
- `Piece { id; kind: 'unit' | 'leader' | 'token'; owner: Faction; typeKey: string; systemId: string; hidden?: boolean }`.
- `GameEvent { seq; type; actor: Faction | 'system'; payload; at: ISO string }`.
- `Command`: discriminated union по `type`:
  - `MOVE_PIECES { pieceIds: string[]; fromSystemId; toSystemId }`
  - `ADVANCE_PHASE {}` — **mock**.
- `CommandEnvelope { actor: Faction; expectedVersion: number; command: Command }` — единый вход для человека и будущего AI.
- `PlayerView` = проекция GameState для `viewer: Faction`: те же поля, кроме:
  - `rebelBase.systemId` = `null` для Империи, пока `revealed === false`;
  - `hidden` объекты противника не раскрывают `typeKey` (`'unknown'`);
  - `log` не содержит секретных полезных нагрузок противника;
  - добавлено `legalActions: LegalAction[]`, где `LegalAction = { type: 'MOVE_PIECES'; pieceId; toSystemIds: string[] } | { type: 'ADVANCE_PHASE' }`.
- `CommandResult = { ok: true; view: PlayerView; events: GameEvent[] } | { ok: false; error: { code: 'ILLEGAL_COMMAND' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'VALIDATION'; messageKey: string; details? } }`.

### Mock rules (явно временные, `game-core/src/mock-rules.ts`)
- `MOVE_PIECES` допустим, если: все `pieceIds` принадлежат `actor`, находятся в `fromSystemId`, `toSystemId ∈ adjacentSystemIds(from)`.
- `ADVANCE_PHASE`: assignment → command → refresh → (round+1) assignment.
- Любой принятый Command: `version + 1`, событие в `log`.
- Сторона, за которую ходит человек: `setup.humanFaction`. Сторона AI в этой задаче не ходит.

### HTTP API (`/api`, JSON, Zod-валидация на входе)
| Method | Path | Ответ |
|---|---|---|
| GET | `/api/health` | `{ status: 'ok' }` |
| POST | `/api/games` (body `GameSetup`) | `201 { gameId, view }` |
| GET | `/api/games` | `[{ gameId, setup, round, phase, updatedAt }]` по убыванию `updatedAt` |
| GET | `/api/games/:id?viewer=<faction>` | `PlayerView` (404 если нет) |
| POST | `/api/games/:id/commands` (body `CommandEnvelope`) | `200 CommandResult ok` · `409 VERSION_CONFLICT` · `422 ILLEGAL_COMMAND` · `400 VALIDATION` · `404` |

- Персистентность: Prisma `Game { id, setup Json/String, state Json/String, version Int, createdAt, updatedAt }`,
  `GameEvent { id, gameId, seq, type, actor, payload, createdAt }`. Команда атомарна (транзакция, проверка `version`).
- Полный `GameState` наружу не отдаётся никогда — только `PlayerView`.

### Commands & quality gates (root)
| Команда | Что делает |
|---|---|
| `pnpm install` | установка (предусловие) |
| `pnpm dev` | **одна команда запуска**: готовит БД (prisma generate + migrate) и запускает api (:3000) и web (:5173, proxy `/api`) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm e2e` | quality gates (ESLint, tsc, Vitest, сборка, Playwright) |
| `pnpm verify` | lint + typecheck + test + build + e2e |

## UX requirements (для FE Lead)
- Desktop-first, но без hover-only действий (планшеты позже): всё, что доступно через hover/drag, доступно и кликом.
- Выбор → действия: панель действий показывает только допустимые варианты (из `legalActions`); не заставлять таскать каждый объект.
- Минимум кликов: перемещение = выбор объекта + 1 клик по цели (в панели или на карте подсвеченной цели).
- Контекстная информация: правая панель меняется по выбору (ничего / система / объект); без модальных окон для основных сценариев.
- Обратная связь: подсветка допустимых целей, отказ с причиной (из `messageKey`), aria-live сообщения, состояние загрузки.
- Доступность: клавиатурная навигация по панелям/спискам, видимый фокус, контраст, `aria-label` для canvas-контролов и альтернативный
  список систем/объектов для скринридеров (canvas сам по себе недоступен).
- Локализация: все строки через i18n-ключи (ru — основной, en — второй), никаких литералов в JSX.
- Mock-элементы помечены в UI («mock», «временная графика»).
- Графика: только собственные плейсхолдеры (фигуры/иконки MUI), никаких ассетов правообладателя.

## Acceptance criteria (testable)
- **AC-1:** После `pnpm install` команда `pnpm dev` (документирована в `README.md`) поднимает api и web; `GET /api/health` → 200, `/` открывается.
- **AC-2:** Web получает данные от API: создание партии через UI создаёт запись в БД, а стол показывает `PlayerView`, пришедший с сервера.
- **AC-3:** `/` показывает «Новая партия», «Продолжить» (неактивна без сохранённых партий), «Настройки»; `/games/new` позволяет выбрать фракцию, тип соперника и сложность (сложность — только для AI) и создать партию с переходом на `/games/:id`; `/settings` переключает язык ru/en.
- **AC-4:** `/games/:id` рисует карту из mock-сценария: ≥ 8 систем, связи соседства, юниты и жетоны обеих сторон, раунд и фазу; mock-элементы помечены.
- **AC-5:** Карта масштабируется (колесо и кнопки +/−/вписать, с ограничениями min/max) и панорамируется перетаскиванием фона.
- **AC-6:** Клик по системе подсвечивает её и открывает панель системы; клик по объекту выделяет его и показывает доступные действия из `legalActions`.
- **AC-7:** Тестовый объект перемещается в соседнюю систему (через панель действий и через drag на подсвеченную цель); попытка недопустимого перемещения отклоняется сервером (422) или не предлагается UI, состояние не меняется, пользователь видит причину.
- **AC-8:** После перемещения и перезагрузки страницы (и через «Продолжить») состояние восстановлено с сервера: объект в новой системе, событие в журнале, `version` увеличилась.
- **AC-9:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` проходят; game-core покрыт unit-тестами переходов, инвариантов и ошибочных команд; API — интеграционными тестами (включая 409/422 и скрытие базы повстанцев от Империи).
- **AC-10:** QA подтверждает сценарии 1–8 в браузере (Playwright + ручной прогон во встроенном браузере), есть логи.
- **AC-11:** Скриншоты экранов (главное меню, создание партии, стол, панель системы, панель действий/выбранный объект, журнал, настройки) в `artifacts/screenshots/`; итоговый отчёт с ограничениями и предложениями на следующий этап.
- **AC-12:** Архитектурные ограничения соблюдены и проверяемы: `apps/web` не импортирует `game-core` и не содержит правил перемещения; координаты не в GameState; API не отдаёт полный GameState (тест на скрытую базу); все изменения состояния — только через `POST /commands`.

## Assumptions
- «Одна команда» = `pnpm dev` после однократного `pnpm install` (стандарт для JS-монорепо).
- Названия систем — нейтральные вымышленные (mock), реальная карта и названия — Этап E (с проверкой прав).
- react-i18next и React Router добавлены к стеку как необходимые для требований PO (локализация, маршруты).
- Node 20.19.5 (локально); pnpm 10.34.9 закреплён через `packageManager` (corepack не поддерживает раскладку pnpm 12).
- Версии библиотек — актуальные стабильные на момент установки, совместимые с Node 20.19.

## Risks
- Тяжёлые зависимости (Prisma engines, Playwright browsers) требуют сети при установке.
- React Konva + drag/pan конфликтуют без явной модели жестов → нужен чёткий контракт событий в плане FE.
- Canvas не тестируется DOM-селекторами → нужны test hooks (data-testid на альтернативном списке / `window.__boardDebug` только в dev/test).

## Out of scope
См. `request.md` → out_of_scope.

## Clarifications (Analyst, 2026-11-08) — ответы на A-1..A-19 из `test-cases.md`
Обязательны для лидов, воркеров и QA. Где меняется замороженный контракт — помечено **[contract]**.

| # | Решение |
|---|---|
| A-1 | «Продолжить» сразу открывает последнюю партию (`updatedAt` desc). Под меню — компактный список «Недавние партии» (до 5) для выбора другой; без модалок. |
| A-2 | В этой задаче команды принимаются только от `actor === setup.humanFaction`; иначе `422 ILLEGAL_COMMAND` (`errors.notYourSide`). Hot-seat для соперника-человека — ограничение, следующий этап. |
| A-3/A-4 | **[contract]** Параметр `viewer` убран: `GET /api/games/:id` и ответ `POST /api/games` всегда возвращают `PlayerView` для `setup.humanFaction`. Так прототип без auth не даёт запросить чужое представление. |
| A-5 | Порядок проверок: 404 → 400 (Zod: форма, пустой `pieceIds`, дубликаты) → 409 (`expectedVersion ≠ version`) → 422 (семантика: неизвестный объект/система, не сосед, чужой объект, не в `fromSystem`, `from = to`, чужая сторона). 409 важнее 422. |
| A-6 | Дубликаты в `pieceIds` → 400. Перемещение нескольких объектов — всё или ничего. |
| A-7 | AI без `difficulty` → `'normal'` по умолчанию. Соперник-человек с `difficulty` → 400. |
| A-8 | Новая партия: `version = 1`, `round = 1`, `phase = 'assignment'`, `log` начинается с события `GAME_CREATED` (`seq = 1`). |
| A-9 | Zoom: константы `MIN_SCALE`/`MAX_SCALE` в коде FE (предложение FE lead), кнопки +/− неактивны на границах, «вписать» = все системы видны с отступом. Границы доступны через debug-хук. |
| A-10 | Нажатие на пустое место без сдвига (< 4 px) снимает выбор; сдвиг ≥ 4 px — pan, выбор сохраняется. Drag объекта начинается только с выбранного/нажатого объекта. |
| A-11 | Секретно для Империи: `rebelBase.systemId` (пока `revealed = false`) и `typeKey` скрытых объектов Повстанцев — нигде (view, legalActions, log payload). Положение (`systemId`) и `id` скрытого объекта видны: на физическом столе жетон лежит открыто, скрыт его тип. |
| A-12 | Названия систем — i18n-ключи с переводами ru и en (вымышленные имена). |
| A-13 | Reduced motion: отключает анимации (tween zoom/pan, пульсацию подсветки); наблюдаемо через `document.documentElement.dataset.reducedMotion = "true"`. |
| A-14 | См. A-6. |
| A-15 | Источник истины — снимок `GameState` (включая `log`). Таблица `GameEvent` — append-only журнал для будущего replay, пишется в той же транзакции; интеграционный тест проверяет совпадение. |
| A-16 | UI не отправляет команду при drop на недопустимую цель (цели берутся только из `legalActions`): откат превью + сообщение. Серверный отказ 422 проверяется на уровне API. |
| A-17 | e2e использует собственные порты (api `3100`, web `5174`) и отдельную БД, чтобы работать параллельно с `pnpm dev`. |
| A-18 | `GET /api/games`: поля из спецификации, без пагинации, максимум 20 последних. |
| A-19 | 409 в UI: сообщение «Состояние обновилось» + refetch view; выбор сохраняется, если объект ещё существует. |

## Contract amendments approved after TECH_PLANNING (Analyst, 2026-11-08)
- **Accepted:** AM-1 (ctx `{gameId, now}` / `{now}` для детерминизма), AM-2 (`INTERNAL` → 500), AM-3 = PA-1 (`GameEvent` — union `GAME_CREATED | PIECES_MOVED | PHASE_ADVANCED`; `opponent` — union по `kind`), AM-4 (`applyCommand` возвращает результат; `getLegalActions` для не-`humanFaction` → `[]`), AM-5 (`ScenarioSchema` в contracts), PA-2 (каталог `messageKey` в contracts), PA-3 (`GameSummarySchema`), PA-4 (ключи `systems.<id>`, `regions.<id>`, `pieces.<typeKey>`).
- **Единый формат ошибок для всех эндпоинтов:** `{ ok: false, error: { code, messageKey, details? } }` (включая 404 у `GET /api/games/:id`).
- **Пакеты:** `@swr/contracts`, `@swr/game-core`, `@swr/game-data` (+ `@swr/game-data/layout`), `@swr/api`, `@swr/web`.
- **Mock-перемещение разрешено в любой фазе** (ограничения по фазам — Этап E).
- **ARIA:** доступный список — `role="listbox"` / `role="option"` с `aria-selected` (валидно по ARIA); `aria-current` не используется.
- **Node 22 LTS** — предложение на следующий этап (снимет пины версий).
- **Q-2 (QA):** скрытие симметрично: `hidden` объекты противника любой стороны показываются зрителю с `typeKey: 'unknown'`.
- **Q-3 (QA):** допустимые значения `context-panel[data-state]` (`empty | system | piece`) и `save-status[data-status]` (`idle | saving | saved | error`).
- **Q-4 (QA):** 500 в тесте допустимо вызвать порчей `Game.state` напрямую через Prisma из тестового кода (не через API-эндпоинт).
- **Сценарий:** минимум 2 объекта Повстанцев в одной системе (и 2 объекта Империи в одной системе).
