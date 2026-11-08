# Архитектура приложения (SWR-002: Application Foundation & UX Prototype)

Статус: **проект** (TECH_PLANNING, 2026-11-08). Описывает целевую архитектуру поставки SWR-002; код ещё не написан.
Детали реализации и версии — [`docs/tasks/SWR-002/plan-backend.md`](../tasks/SWR-002/plan-backend.md) (backend/workspace)
и план FE lead (web). Контракт — `specification.md` → «Architecture contract» + «Clarifications».

## 1. Слои и пакеты

```text
apps/web  (React SPA)          — отрисовка, жесты, выбор; НЕ знает правил
   │  HTTP JSON /api (Vite proxy), типы и схемы из @swr/contracts, координаты из @swr/game-data/layout
   ▼
apps/api  (NestJS)             — валидация (Zod), загрузка/сохранение, транзакция, маппинг ошибок
   │  вызовы чистых функций
   ▼
packages/game-core (pure TS)   — createGame, applyCommand, getLegalActions, toPlayerView; mock-rules
   │  типы
   ▼
packages/contracts (Zod)       — GameState, PlayerView, Command(Envelope), CommandResult, API DTO
packages/game-data             — mock-сценарий (системы, соседство, объекты, база) | layout (координаты) — два entry point
apps/api/persistence           — SQLite через Prisma: Game (снимок state + version), GameEvent (журнал)
```

Направление зависимостей строго сверху вниз. Запреты проверяются ESLint (`no-restricted-imports`):

- `game-core` не импортирует React, NestJS, Prisma, OpenAI, `node:*`, `game-data` (кроме тестов); не использует `Date`/`Math.random`
  — время и id передаются параметром (детерминизм).
- `apps/web` не импортирует `game-core` и сценарий `game-data`; только `@swr/contracts` и `@swr/game-data/layout`.
- `contracts` зависит только от `zod`.

## 2. Поток данных

**Чтение.** `GET /api/games/:id` → API читает строку `Game`, валидирует снимок `GameStateSchema` → `toPlayerView(state, setup.humanFaction)`
→ клиент получает `PlayerView` (включая `legalActions`) и кладёт его в кеш TanStack Query. Полный `GameState` наружу не уходит никогда.

**Команда.** Пользователь выбирает объект → UI показывает цели только из `view.legalActions` (подсветка, панель действий, drop-цели) →
`POST /api/games/:id/commands` с `CommandEnvelope { actor, expectedVersion: view.version, command }` → API:

1. игра не найдена → 404;
2. `CommandEnvelopeSchema` (Zod) не прошла → 400 `VALIDATION`;
3. `expectedVersion ≠ version` → 409 `VERSION_CONFLICT`;
4. `applyCommand` (game-core) отклонил → 422 `ILLEGAL_COMMAND` с `messageKey`;
5. успех → в одной транзакции SQLite: `UPDATE Game … WHERE id = ? AND version = expected` (0 строк → 409, откат) + вставка `GameEvent`;
6. ответ `{ ok: true, view, events }` — новый `PlayerView`; UI заменяет кеш, показывает обратную связь (aria-live/snackbar).

UI не меняет состояние «оптимистично»: drag — только визуальный предпросмотр, который откатывается при отказе.
Все ошибки имеют единый формат `{ ok: false, error: { code, messageKey, details? } }`; тексты — в i18n клиента по `messageKey`.

## 3. Состояние, версии, журнал

- Источник истины — снимок `GameState` (включая `log`) в `Game.state`; `Game.version` = `state.version`.
- Новая партия: `version = 1`, `round = 1`, `phase = 'assignment'`, первое событие `GAME_CREATED` (`seq = 1`).
- Каждая принятая команда: `version + 1`, одно событие в `log` (`PIECES_MOVED` / `PHASE_ADVANCED`); отклонённая — ничего не меняет.
- Таблица `GameEvent` — append-only зеркало журнала, пишется в той же транзакции (основа будущего replay); `@@unique(gameId, seq)`.
- Optimistic concurrency по `version` защищает от параллельных команд (двух вкладок, человека и будущего AI).

## 4. Правила: только mock

Вся временная логика сосредоточена в `packages/game-core/src/mock-rules.ts` и явно помечена как mock:
перемещение своих объектов в соседнюю систему (всё или ничего) и цикл фаз assignment → command → refresh → (раунд + 1).
Это **не** правила Star Wars: Rebellion; они появятся на Этапе E, заменив этот модуль без изменения слоёв выше.
Команды в этой задаче принимаются только от `setup.humanFaction`; сторона AI не ходит.

## 5. Скрытая информация

- Полный state доступен только API и БД. Каждый ответ строится через `toPlayerView(state, viewer)`; `viewer` = `setup.humanFaction`
  (параметра выбора стороны нет — без авторизации нельзя запросить чужое представление).
- Для Империи, пока база не раскрыта: `rebelBase.systemId = null`; у скрытых объектов Повстанцев `typeKey = 'unknown'`
  (их `id` и `systemId` видны — как жетон, лежащий на столе рубашкой вверх). Правило симметрично для скрытых объектов любой стороны.
- Журнал фильтруется той же функцией (`toPlayerEvents`); `legalActions` содержат только объекты зрителя.
- Id объектов непрозрачны (`pc-NN`) и не выдают тип. Сценарий (с местоположением базы) не попадает в web-бандл: клиент импортирует
  только `@swr/game-data/layout`.
- Логи сервера не содержат state, view и payload — только `gameId`, код и статус.

## 6. Визуальные координаты

Координаты систем — `mapLayout: Record<SystemId, { x, y }>` в `@swr/game-data/layout` (мировые единицы, `MAP_BOUNDS`).
Они **не** входят в `GameState` и не проходят через API. Экранная позиция объекта вычисляется UI: `piece.systemId` → `mapLayout`
→ раскладка внутри системы (решение UI). Pan/zoom/drag — локальное состояние клиента (Zustand), не игровое.

## 7. Будущий AI на том же Command API

AI-сторона (Этап F) получит свой `PlayerView` (тот же `toPlayerView` для своей фракции — без секретов человека), выберет действие
**из `legalActions`**, построит такой же `CommandEnvelope { actor: <AI faction>, expectedVersion, command }` и пройдёт ту же цепочку
валидация → `applyCommand` → транзакция → журнал. Отдельного «AI-пути» мутации состояния нет; ответ модели, не совпадающий с
legal action, отклоняется так же, как ошибочная команда человека. OpenAI SDK и ключ — только в `apps/api` (в SWR-002 отсутствуют).

## 8. Запуск и среды

| Среда | Как | Порты / БД |
|---|---|---|
| dev | `pnpm install` → `pnpm dev` (сборка пакетов, `prisma generate` + `migrate deploy`, api + web параллельно) | api 3000, web 5173 (proxy `/api`), `apps/api/prisma/dev.db` |
| integration-тесты | `pnpm test` (Vitest + supertest, реальный Nest) | файл `apps/api/.tmp/test-<uuid>.db` на каждый тестовый файл |
| e2e | `pnpm e2e` (Playwright поднимает свои серверы) | api 3100, web 5174, `apps/api/.tmp/e2e.db` (пересоздаётся) |

Внутренние пакеты исполняются API из собранного `dist` (CommonJS), а Vite и Vitest читают их TypeScript-исходники через
export-условие `@swr/source`. Runtime: Node 20.19.x; версии зависимостей подобраны под него (см. план, §10).

## 9. Известные ограничения прототипа

Нет авторизации и изоляции партий; одна сторона-человек (hot-seat — позже); правила mock; карта и названия вымышленные;
SQLite и один процесс API; NestJS 11 / CommonJS (переход на ESM и Nest 12 — отдельной задачей, вероятно вместе с Node 22).

## 10. Фактическая реализация (после SWR-002, сверено Analyst)
- Документ написан на этапе планирования; реализация ему соответствует. Отклонения и уточнения, принятые при интеграции:
  - web: стол получает `{gameId, view, send}` через `BoardContext` от `GameTablePage` (без кросс-импортов между feature-папками); единый Konva-слой фигур вместо трёх.
  - api: `GET /api/games` пропускает строки с повреждённым снимком (логирует только `gameId` и код), прямой `GET /api/games/:id` такой партии → 500 `INTERNAL`.
  - Границы проверяются автоматически: ESLint (`no-restricted-imports`, запрет динамических импортов game-core/game-data в web, запрет `Date`/`Math.random` в game-core, запрет литеральных UI-строк) и `pnpm check:bundle` (в production-bundle нет базы повстанцев, id объектов сценария и `__boardDebug`).
  - Версии: Node 20.19.5 → NestJS 11, Prisma 6, jest-dom 6 (более новые мажоры требуют Node 22).
- Решения по стыкам и поправки к контракту: `docs/tasks/SWR-002/specification.md` (Clarifications, Approved amendments), `docs/tasks/SWR-002/implementation-plan.md`.
