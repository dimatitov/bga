# Test cases — SWR-003

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-08).
Это **дизайн**: тесты ещё не написаны и не запускались; ничто здесь не является доказательством `passed`.
Источники: `specification.md` (AC-1..AC-9, Architecture contract), `request.md`; база регрессии — SWR-002
(`docs/tasks/SWR-002/test-cases.md`, `e2e/*.spec.ts`, `e2e/support/*`, `apps/api/test/*.int.test.ts`, web `*.test.tsx`).
Открытые вопросы — в разделе «Ambiguities» (Q-n); там, где ожидание зависит от ответа, в кейсе стоит ссылка на Q-n.

## Preconditions (общие)

- Выполнен механический шаг «`@swr/*` → `@bga/*` + перенос пакетов» (spec → Risks); гейты SWR-002 зелёные до параллельной работы.
- Базовая линия SWR-002 (из `docs/tasks/SWR-002/qa-results.md`): game-core 48 тестов, contracts 34, game-data 13,
  apps/api 58, apps/web 91, e2e 37 passed. Регрессия считается сохранённой, если перенесённые наборы не теряют кейсов
  (кроме явно заменённых в §8 с указанием замены).
- e2e: `pnpm e2e`, api :3100 (чистая `.tmp/e2e.db`), web :5174 (`VITE_E2E=1`), `workers: 1`, файлы по алфавиту,
  `00-empty-db.spec.ts` первым на пустой БД. Через UI/API e2e можно создавать сессии **только** Rebellion.
- integration: Vitest + supertest, реальный Nest (`createApp`), отдельная SQLite-копия шаблона на тест (`test/support/test-app.ts`).
- component: Vitest + Testing Library (jsdom), подмена `globalThis.fetch`, `MemoryRouter`/`createMemoryRouter` с маршрутами приложения.

## Conventions

**Уровни (Level):** `unit` (Vitest, пакеты), `integration` (API, Nest + SQLite), `component` (web, jsdom),
`e2e` (Playwright), `manual` (встроенный браузер / ручной прогон, skill `browser-qa`, скриншот/лог как доказательство),
`arch` (ESLint-пробы, grep/скрипт, тест структуры), `gate` (корневая команда).

**Идентификаторы:** `R` = `'star-wars-rebellion'`, `FS` = `'forbidden-stars'`, `FAKE` = `'fake-game'` (тестовая игра, только в тестах).
`err(CODE, key)` = `{ ok:false, error:{ code, messageKey, details? } }` (единый формат SWR-002).

**Фиктивная игра `FAKE`** (тестовый хелпер, см. Testability TR-3/TR-4): setup `{ start: number }` (иначе 400);
state `{ count, version, secret: 'FAKE-SECRET' }`; команда `{ type:'INC' }` (иначе 400); `count >= 3` → 422
`errors.fakeLimit`; view `{ count, version }` (без `secret`); `summarize` → `{ count }`. Вторая фиктивная запись `FAKE_SOON`
(`'fake-soon'`, `coming_soon`, без модуля).

## Test cases

### 1. Каталог `/` (AC-1)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-CAT-01 | AC-1 | component | positive | реальный web-реестр | render `/` | `game-catalog` содержит ровно по одной `game-card-<id>` на запись реестра, в порядке реестра (сейчас `R`, `FS`); число карточек = `registry.length` |
| TC-CAT-02 | AC-1 | component | positive | | карточка `R` | внутри: `game-card-name` = имя из `definition`; `img` (`game-card-cover`) с `src` из `@bga/game-rebellion/assets` и **непустым** `alt` (из i18n, не имя файла); `game-card-description`; `game-card-status[data-status=available]` с текстом «Доступна»; `game-card-players` = «2»; `game-card-ai` = «есть» (формат — Q-12) |
| TC-CAT-03 | AC-1, AC-6 | component | positive | | карточка `FS` | `data-status=coming_soon`, текст «Скоро»; игроки «2–4»; AI «есть»; обложка с alt |
| TC-CAT-04 | AC-1, AC-2 | component | positive | | у каждой карточки | карточка — ссылка (`role=link`, `href=/games/<id>`), доступное имя содержит название игры; клик → маршрут `/games/<id>` (рендер GamePage) |
| TC-CAT-05 | AC-1 | component | boundary | `fetch` отклоняется (API недоступен) | render `/` | обе карточки отрисованы (каталог строится из реестра, не из API); нет бесконечной загрузки (Q-1) |
| TC-CAT-06 | AC-1 | component | positive | | шапка | ссылка «Настройки» → `/settings`; testid главного меню SWR-002 (`menu-new-game`, `menu-continue`, `recent-games`) отсутствуют |
| TC-CAT-07 | AC-1 | unit | positive (i18n) | | для каждой записи реестра: ключи названия/описания/alt обложки/статуса | ключи есть в `ru` и `en`, непустые; набор ключей `ru` = `en` (расширение `locales.test.ts`) |
| TC-CAT-08 | AC-1 | component | positive (i18n) | язык `en` | render `/` | статус «Available»/«Coming soon», подписи игроков/AI, alt — на английском; нет кириллицы в `innerText` и `alt` |
| TC-CAT-09 | AC-1 | unit | positive | | каждый `definition` реестров (web и server) через `GameDefinitionSchema` (`@bga/platform`) | проходит; `id` уникальны; `R`: `available`, `supportedPlayers=[2]`, `supportsAI=true`; `FS`: `coming_soon`, `[2,3,4]`, `true` |
| TC-CAT-10 | AC-1, AC-2 | e2e | positive | серверы подняты | `goto('/')` | видны `game-card-R` (имя, обложка загружена: `naturalWidth > 0`, alt непустой, описание, статус available) и `game-card-FS` (coming_soon); нет ошибок консоли и 4xx на запросы ассетов; клик по `game-card-R` → URL `/games/star-wars-rebellion` |
| TC-CAT-11 | AC-1 | e2e | positive (a11y, keyboard) | мышь не используется | `Tab` от начала страницы до карточек; `Enter` на `game-card-R`; назад; `Tab` до `game-card-FS`; `Enter` | каждая карточка получает `:focus-visible`; порядок фокуса = порядок карточек; `Enter` открывает `/games/<id>` для обеих (coming_soon тоже открывается — AC-2) |
| TC-CAT-12 | AC-1 | e2e | positive (i18n) | | `/settings` → `en` → `/`; затем `ru` | en: нет кириллицы (`CYRILLIC`) на `/` (кроме названий игр, если Q-11 решит «названия не переводятся» — тогда они латиницей в обоих языках); ru: подписи по-русски; `<html lang>` меняется |

### 2. Страница игры `/games/:gameId` (AC-2, AC-4)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-GP-01 | AC-2 | component | positive | `GET /api/sessions?gameId=R` → `[]` | render `/games/star-wars-rebellion` | `game-page[data-game-id=R][data-status=available]`; обложка с alt, имя, описание, игроки, AI; `game-new-session` активна, ведёт на `/games/star-wars-rebellion/new` |
| TC-GP-02 | AC-2, AC-4 | component | negative / boundary | список пуст | то же; клик по `game-continue` | запрос ровно `GET /api/sessions?gameId=star-wars-rebellion`; `game-continue` disabled (`disabled`/`aria-disabled`), клик не меняет маршрут; `game-recent-sessions` в пустом состоянии, `recent-session-*` нет |
| TC-GP-03 | AC-4 | component | positive | ответ `[s3, s2, s1]` (updatedAt desc, все `gameId=R`) | клик `game-continue` | переход на `/sessions/s3` (первый элемент ответа = самый свежий) |
| TC-GP-04 | AC-4 | component | boundary | ответ из 7 сессий `R` | render | ровно 5 `recent-session-<id>` — первые 5 ответа в том же порядке; каждая — ссылка на `/sessions/<id>`; показывает дату/детали (`details`, Q-13) |
| TC-GP-05 | AC-4 | component | boundary | ответ из 1 сессии | render | `game-continue` активна → `/sessions/<id>`; в недавних 1 элемент (Q-14: дублирует ли список «Продолжить») |
| TC-GP-06 | AC-4 | component | negative | `GET /api/sessions` → 500 / сетевая ошибка | render | видимое сообщение об ошибке (i18n), без бесконечной загрузки; `game-continue` disabled; `game-new-session` активна (Q-15) |
| TC-GP-07 | AC-2, AC-6 | component | positive | | render `/games/forbidden-stars` | `game-page[data-status=coming_soon]`, `game-coming-soon` «Скоро»; `game-new-session` и `game-continue` disabled; клики не меняют маршрут; `POST` не отправляется (запрос списка сессий — Q-16) |
| TC-GP-08 | AC-2 | component | negative | | render `/games/unknown-game`; отдельно `/games/<uuid>` (старый URL SWR-002) | `game-not-found` со ссылкой в каталог `/`; запросов `/api/sessions*` нет |
| TC-GP-09 | AC-2, AC-6 | component | negative | | render `/games/forbidden-stars/new` | страница игры с «Скоро» (без формы: `setup-start`, `setup-faction-*` отсутствуют); `POST /api/sessions` не отправляется (redirect или рендер на месте — Q-17) |
| TC-GP-10 | AC-2 | component | negative | | render `/games/unknown-game/new` | `game-not-found` + ссылка в каталог; нет запросов |
| TC-GP-11 | AC-4, AC-7, AC-5 | integration | positive (cross-game) | API с реестром `[rebellion, FAKE]` (TR-3) | создать `R1` (R), затем `F1` (FAKE, позже по `now`); `GET /api/sessions?gameId=star-wars-rebellion`; `?gameId=fake-game`; без фильтра | `?gameId=R` → `[R1]` (несмотря на то, что `F1` новее — «последняя сессия **этой** игры» = `R1`); `?gameId=FAKE` → `[F1]`; без фильтра → `[F1, R1]` |
| TC-GP-12 | AC-4 | component | positive (cross-game) | в реестр внедрён `FAKE` (TR-5) | render `/games/fake-game` и `/games/star-wars-rebellion` | каждая страница запрашивает список со своим `gameId`; «Продолжить» ведёт на первый элемент ответа для своей игры; поведение при ответе со «смешанным» списком — Q-18 |
| TC-GP-13 | AC-2, AC-4 | e2e | negative / boundary | пустая e2e-БД (`00-empty-db.spec.ts`) | `/` → `game-card-R` → страница игры | `game-continue` disabled, клик не меняет URL; недавних нет; скриншот `02-game-page-empty` |
| TC-GP-14 | AC-4 | e2e | positive | 2 сессии R через API; в более новой — перемещение | новый `browser.newContext()` → `/` → `game-card-R` → `game-continue` | URL `/sessions/<новая>`; `game-table[data-session-id]` = она; объект в новой системе, `data-version` = после хода (перенос TC-E2E-23) |
| TC-GP-15 | AC-4 | e2e | boundary | ≥ 6 сессий R через API | `/games/star-wars-rebellion` → `recent-session-<старшая из видимых>` | ровно 5 `recent-session-*`, по убыванию `updatedAt` (сверка с `GET /api/sessions?gameId=R`); открыта выбранная сессия (перенос TC-E2E-23b) |
| TC-GP-16 | AC-2, AC-6 | e2e | negative | | `/` → `game-card-FS`; затем `goto('/games/forbidden-stars/new')` | страница FS: «Скоро», действия disabled; на `/new` нет формы; за сценарий нет `POST /api/sessions` |
| TC-GP-17 | AC-2 | e2e | negative | | `goto('/games/does-not-exist')`, `goto('/games/<uuid>')`; клик по ссылке в каталог | `game-not-found`; ссылка ведёт на `/` (перенос TC-E2E-32) |
| TC-GP-18 | AC-2 | e2e | positive (keyboard) | есть ≥ 1 сессия R | только клавиатура: `Tab` до `game-new-session` → `Enter`; назад; `Tab` до `game-continue` → `Enter` | открываются `/games/R/new` и `/sessions/<последняя>`; видимый фокус; disabled-кнопка (в пустом состоянии) не активируется |

### 3. Создание партии и хост сессии (AC-3, AC-4)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-NEW-01 | AC-3 | component | positive | `POST /api/sessions` → 201 `{sessionId:'s1', gameId:R, view}` | render `/games/star-wars-rebellion/new`; выбрать Империю, AI, hard; `setup-start` | экран настройки Rebellion (testid SWR-002 `setup-*`); тело запроса ровно `{ gameId:'star-wars-rebellion', setup:{humanFaction:'empire', opponent:{kind:'ai',difficulty:'hard'}} }`; переход на `/sessions/s1` |
| TC-NEW-02 | AC-3 | component | negative | `POST` → 400 / 422 / 500 / сеть | `setup-start` | `setup-error` с переводом `messageKey`; маршрут не меняется; форма доступна повторно |
| TC-NEW-03 | AC-3 | component | negative | `POST` висит | двойной клик `setup-start` | ровно 1 `POST`; кнопка disabled во время запроса |
| TC-NEW-04 | AC-3 | component | positive | | ссылка «назад» на экране настройки | ведёт на `/games/star-wars-rebellion` (Q-19, если ссылки нет — кейс снимается) |
| TC-HOST-01 | AC-3 | component | positive | `GET /api/sessions/s1` → `{sessionId:'s1', gameId:R, view}` | render `/sessions/s1` | `session-host[data-session-id=s1][data-game-id=R]`; лениво загружен `TableScreen` Rebellion: `game-table[data-session-id=s1]`, `data-version` = `view.version` |
| TC-HOST-02 | AC-3 | component | negative | `GET` → 404 err(`NOT_FOUND`, `errors.sessionNotFound`) | render `/sessions/missing` | `session-not-found` (текст по ключу) + ссылка в каталог; нет бесконечной загрузки |
| TC-HOST-03 | AC-3, AC-5 | component | negative | ответ с `gameId:'unknown-game'` (нет в web-реестре) | render | понятное состояние «игра не поддерживается/не найдена», без падения; ссылка в каталог (Q-20) |
| TC-HOST-04 | AC-3, AC-6 | component | negative | ответ с `gameId:FS` (запись без `TableScreen`) | render | то же состояние, что TC-HOST-03; без исключений в консоли (Q-20) |
| TC-HOST-05 | AC-3, AC-4 | component | positive | | ссылка `session-back-to-game` | `href=/games/star-wars-rebellion` (из `gameId` ответа, не захардкожен) |
| TC-HOST-06 | AC-3 | component | positive | стол открыт | команда (перемещение / `ADVANCE_PHASE`) | запрос `POST /api/sessions/s1/commands`, тело `{actor, expectedVersion, command}`; ответ обновляет `data-version` (перенос `useSendCommand.test`, `GameTablePage.test`) |
| TC-NEW-05 | AC-3 | e2e | positive | | `/` → `game-card-R` → `game-new-session` → URL `/games/star-wars-rebellion/new` → Империя, AI, hard → `setup-start` | `POST /api/sessions` 201, тело содержит `gameId:R`; ответ `{sessionId, gameId:R, view}`; URL `/sessions/<sessionId>`; `game-table[data-session-id]`, `data-version=1`; `GET /api/sessions?gameId=R` содержит сессию (перенос TC-E2E-03) |
| TC-NEW-06 | AC-3 | e2e | boundary | | `/games/star-wars-rebellion/new`, `setup-opponent-human` | `setup-difficulty` недоступен; созданная сессия без сложности (перенос TC-E2E-04) |
| TC-NEW-07 | AC-3 | e2e | positive | | создать за Повстанцев | `legalActions` только rebellion, база видна (перенос TC-E2E-05) |
| TC-HOST-07 | AC-3, AC-4 | e2e | positive | открыт стол сессии | `session-back-to-game` | URL `/games/star-wars-rebellion`; сессия в недавних и в «Продолжить» |
| TC-HOST-08 | AC-3 | e2e | negative | | `goto('/sessions/does-not-exist')` | `session-not-found` + путь в каталог |

### 4. HTTP API сессий (AC-3, AC-6, AC-7) — integration

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-SES-01 | AC-3, AC-7 | integration | positive | реальный реестр | `POST /api/sessions {gameId:R, setup:EMPIRE_AI}` | 201 `{sessionId, gameId:R, view}` (strict-схема `@bga/platform`); `view` проходит `PlayerViewSchema` Rebellion; в БД `Session.gameId = R`, `version=1`; `SessionEvent` seq 1 `GAME_CREATED` (перенос TC-API-02) |
| TC-SES-02 | AC-3 | integration | negative | | `gameId:R`, невалидный `setup` (набор TC-API-04/05) | 400 err(`VALIDATION`, `errors.validation`); ничего не сохранено |
| TC-SES-03 | AC-7 | integration | negative | | тело без `gameId`; `gameId: 1`; `gameId:''`; лишние ключи; malformed JSON | 400 `VALIDATION`; ничего не сохранено |
| TC-SES-04 | AC-6 | integration | negative | | `{gameId:'unknown-game', setup:EMPIRE_AI}` | 404 err(`NOT_FOUND`, `errors.gameNotFound`); 0 строк `Session` |
| TC-SES-05 | AC-6 | integration | negative | | `{gameId:FS, setup:EMPIRE_AI}`; `{gameId:FS, setup:{}}` | 422 err(`GAME_UNAVAILABLE`, `errors.gameUnavailable`); 0 строк (код в поле `code` — Q-4) |
| TC-SES-06 | AC-6 | integration | negative (order) | | unknown gameId + невалидный setup; FS + невалидный setup | предлагаемое ожидание: 404 и 422 соответственно (игра определяется до валидации её `setup`) — Q-3 |
| TC-SES-07 | AC-7 | integration | positive / negative | | `GET /api/sessions/:id`; неизвестный id; id длиной 1000 | 200 `{sessionId, gameId:R, view}`; иначе 404 err(`NOT_FOUND`, `errors.sessionNotFound`) |
| TC-SES-08 | AC-7 | integration | positive | 3 сессии R | `GET /api/sessions` | массив `SessionSummary` (strict: `sessionId, gameId, version, createdAt, updatedAt, details`), `updatedAt desc`; `details` — только примитивы; нет `state`, `view`, `setup` (если не в `details`) |
| TC-SES-09 | AC-7 | integration | boundary | 22 сессии R (детерминированный clock) | `GET /api/sessions?gameId=R`; без фильтра | 20 самых свежих, по убыванию (перенос A-18) |
| TC-SES-10 | AC-7 | integration | boundary | сессии R есть | `?gameId=forbidden-stars`; `?gameId=unknown`; `?gameId=`; `?gameId=a&gameId=b` | `FS` → `[]`; остальное — по Q-5 (зафиксировать фактическое и сверить с решением) |
| TC-SES-11 | AC-7 | integration | positive | | после команды над старшей сессией | она первая в списке (`updatedAt` обновлён); `version` +1 |
| TC-SES-12 | AC-3 | integration | positive / negative | | `POST /api/sessions/:id/commands`: допустимый ход; не соседняя система; устаревшая версия; malformed; неизвестная сессия | 200 `CommandResult` / 422 `errors.notAdjacent` / 409 `currentVersion` / 400 / 404; порядок 404→400→409→422 (перенос TC-API-14..19, A-5); `gameId` в ответе — Q-6 |
| TC-SES-13 | AC-7 | integration | positive (hidden info) | сессия за Империю | `GET /api/sessions`, `?gameId=R` | сериализованные `details` не содержат `rebelBase.systemId`, реальных `typeKey` hidden-объектов, ключа `state` |
| TC-SES-14 | AC-7 | integration | negative | | `GET/POST /api/games`, `GET /api/games/:id`, `POST /api/games/:id/commands` | 404 единым телом (старые маршруты удалены) |
| TC-SES-15 | AC-5, AC-9 | integration / arch | positive | | перечень маршрутов Nest (как TC-API-23) + grep записей Prisma | мутирующие только `POST /api/sessions`, `POST /api/sessions/:id/commands`; запись `Session`/`SessionEvent` только в репозитории сессий |
| TC-SES-16 | AC-7 | integration | negative | сохранено 2 сессии, у одной испорчен `state` | `GET /api/sessions`; `GET /api/sessions/<испорченная>` | список работает и пропускает испорченную; GET → 500 `INTERNAL` без внутренностей (перенос review #1, TC-API-25) |
| TC-SES-17 | AC-5, AC-7 | integration | negative | строка `Session` с `gameId='removed-game'` вставлена напрямую | `GET /api/sessions`, `GET /api/sessions/<id>`, команда | список не падает (сессия скрыта или показана — Q-7); GET/команда — единый формат ошибки, не 2xx и не утечка `state` |
| TC-SES-18 | AC-7 | integration | positive | | перенос TC-API-10..13, 20, 21, 26 на `/api/sessions` | `?viewer=` игнорируется; база/hidden не утекают; гонка → один 200 и один 409; рестарт приложения сохраняет состояние; `state.log` = строки `SessionEvent` |

### 5. Миграция данных (AC-7)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-MIG-01 | AC-7 | integration | positive | фикстура pre-migration БД (TR-6): только миграция `20261107235651_init`, 3 строки `Game` формата SWR-002 (состояния из `createGame` Rebellion; у одной — ход и 3× `ADVANCE_PHASE`), строки `GameEvent`, разные `updatedAt` | `prisma migrate deploy` | exit 0; `Session` = 3 строки; `id, setup, state, version, createdAt, updatedAt` побайтно равны исходным; у всех `gameId='star-wars-rebellion'`; `SessionEvent` = все строки `GameEvent` (`sessionId, seq, type, actor, payload, createdAt`); таблиц `Game`/`GameEvent` нет; в `_prisma_migrations` обе миграции |
| TC-MIG-02 | AC-7, AC-4 | integration | positive | БД после TC-MIG-01 | `startApp(db)`; `GET /api/sessions`; `GET /api/sessions/<id>` каждой; команда в сессии с ходом (`expectedVersion` = старая версия) | список из 3 с `gameId=R` в исходном порядке `updatedAt`; view = `toPlayerView(parseState(исходный state))`; команда 200, `version`+1, новый `SessionEvent.seq` = max+1 (нет конфликта unique) |
| TC-MIG-03 | AC-7 | integration | negative | БД после миграции | `INSERT` в `Session` без `gameId`; `PRAGMA index_list('Session')` / `index_info`; удаление сессии | вставка без `gameId` падает (NOT NULL); есть индекс `(gameId, updatedAt)`; `SessionEvent` удаляются каскадно; `(sessionId, seq)` unique |
| TC-MIG-04 | AC-7 | integration | boundary | pre-migration БД без строк | `migrate deploy` | exit 0; пустые `Session`/`SessionEvent` |
| TC-MIG-05 | AC-7 | integration | boundary | после TC-MIG-01 | повторный `migrate deploy` | «No pending migrations»; данные не изменились |
| TC-MIG-06 | AC-7 | arch | positive | | хеш `prisma/migrations/20261107235651_init/migration.sql` vs SWR-002 | не изменён; изменения — только новой миграцией |
| TC-MIG-07 | AC-7, AC-4 | manual | positive | **копия** `apps/api/prisma/dev.db` (оригинал не трогать) | счётчики строк до; `DATABASE_URL=file:<копия> prisma migrate deploy`; счётчики после; `pnpm dev` на копии → `/games/star-wars-rebellion` → «Продолжить» | число сессий/событий совпадает; старая партия открывается со страницы игры с прежним состоянием; лог в `artifacts/logs/qa-migration.log` |

### 6. Расширяемость (AC-5)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-EXT-01 | AC-5 | integration | positive | `startApp(db, { gameModules:[rebellion, FAKE], gameDefinitions:[R, FS, FAKE, FAKE_SOON] })` (TR-3) | `POST /api/sessions {gameId:FAKE, setup:{start:0}}` | 201 `{sessionId, gameId:FAKE, view:{count:0, version:1}}`; в ответе нет `FAKE-SECRET`; строка `Session.gameId=FAKE` |
| TC-EXT-02 | AC-5 | integration | positive | после TC-EXT-01 | `GET /api/sessions/:id`; `GET /api/sessions?gameId=fake-game` | view фиктивной игры; summary `details = {count:0}` (из `summarize`), `gameId=FAKE` |
| TC-EXT-03 | AC-5 | integration | positive / negative | | команды: `INC` (v=1); `INC` с устаревшей версией; `INC` до `count=3`, затем ещё `INC`; `{type:'BAD'}`; команда в несуществующую сессию | 200 `count=1, version=2`; 409 `currentVersion`; 422 `errors.fakeLimit` (ключ модуля проброшен без изменений); 400; 404 — порядок 404→400→409→422 сохраняется для чужого модуля |
| TC-EXT-04 | AC-5 | integration | negative | | `POST {gameId:FAKE, setup:{start:'x'}}` | 400 (ошибка `parseSetup` модуля); ничего не сохранено |
| TC-EXT-05 | AC-5, AC-6 | integration | negative | | `POST {gameId:'fake-soon', setup:{}}` | 422 `GAME_UNAVAILABLE` — недоступность берётся из реестра/статуса, не захардкожена под `FS` |
| TC-EXT-06 | AC-5 | arch | positive | | grep `apps/api/src/sessions/**`, `apps/api/src/common/**` на `@bga/game-`, `star-wars-rebellion`, `forbidden-stars`, `fake-game`, `faction|empire|rebellion|phase|round|piece|system|rebelBase`; то же для `apps/web/src/{app,shared,platform}/**` (кроме i18n-каталогов общих строк) | 0 совпадений; фиктивная игра определена только в `apps/api/test/**` / `apps/web/src/**/*.test.*` / тест-хелперах |
| TC-EXT-07 | AC-5 | component | positive | web-реестр `[R, FS, FAKE]` через seam (TR-5); `FAKE` без `coverImage`, со stub-экранами | render `/`, `/games/fake-game`, `/games/fake-game/new`, `/sessions/f1` (fetch → `{sessionId:'f1', gameId:FAKE, view}`) | 3 карточки; у `FAKE` плейсхолдер-обложка с alt; страница игры работает; на `/new` — stub `SetupScreen`; на `/sessions/f1` — stub `TableScreen` получил `{ sessionId:'f1', view }` (точная форма props — TR-5); маршрутизатор/хост не менялись (файлы роутера не упоминают `fake`) |
| TC-EXT-08 | AC-5 | component | positive | запись `FAKE_SOON` (coming_soon, без экранов) | render `/`, `/games/fake-soon`, `/games/fake-soon/new` | карточка «Скоро»; действия disabled; на `/new` — нет формы |
| TC-EXT-09 | AC-5 | arch | negative | ESLint-пробы (TR-7): `import … from '<spec>'` в файле `<path>` | `<path>` ∈ `apps/api/src/sessions/probe.ts`, `apps/api/src/common/probe.ts`, `apps/web/src/app/probe.tsx`, `apps/web/src/shared/probe.ts`, `apps/web/src/platform/probe.tsx`, `packages/platform/src/probe.ts`; `<spec>` ∈ `@bga/game-rebellion`, `@bga/game-rebellion/definition`, `@bga/game-forbidden-stars/definition`, относительный путь в `packages/games/…` | каждая пара → ошибка `no-restricted-imports` (exit ≠ 0) |
| TC-EXT-10 | AC-5 | arch | positive (control) | | `@bga/game-rebellion/server` в `apps/api/src/game-registry/probe.ts`; `@bga/game-rebellion/definition` в `apps/web/src/games/probe.ts` (рядом с `registry.ts`) и в `apps/web/src/games/rebellion/probe.tsx` | 0 ошибок (проба не ложноположительная); `pnpm lint` на реальном коде — 0 нарушений |
| TC-EXT-11 | AC-5 | arch | negative | | в `apps/web/src/games/rebellion/probe.tsx`: `@bga/game-rebellion/rules`, `/scenario`, `/server`, `/ai`; `export * from '@bga/game-rebellion/rules'`; `import('@bga/game-rebellion/scenario')`; глубокий путь `@bga/game-rebellion/src/rules`; относительный `…/packages/games/rebellion/src/rules` | каждый вариант → ошибка; разрешены `/definition`, `/schema`, `/board`, `/assets` (контроль, 0 ошибок); корень `@bga/game-rebellion` — Q-8 |
| TC-EXT-12 | AC-5, AC-9 | arch | negative | | игровые пакеты (`packages/games/*/src/**`): импорт `react`, `@nestjs/core`, `@prisma/client`, `openai`, `@bga/game-forbidden-stars` из rebellion, `apps/*`; в `./rules` — `Date.now()`, `Math.random()` (правила чистоты SWR-002 game-core) | каждый → ошибка; `@bga/platform` и `zod` — разрешены |
| TC-EXT-13 | AC-5 | arch | positive | | `docs/architecture/adding-a-game.md` | файл существует и описывает: структуру пакета `packages/games/<id>` и subpath-экспорты; запись в `apps/api/src/game-registry/registry.ts` и `apps/web/src/games/registry.ts`; контракт `ServerGameModule`; что **не** меняется (маршруты, хост, сервис сессий, каталог, страница игры); i18n-ключи; ESLint-границы; какие тесты добавить; вариант `coming_soon`; все пути в обратных кавычках существуют (скрипт/grep) |
| TC-EXT-14 | AC-5 | manual | positive | отдельный worktree, откатывается | по `adding-a-game.md` добавить `packages/games/dummy` (`coming_soon`) | изменены только новый пакет + 2 реестра (+ i18n, workspace-манифесты — Q-9); карточка появилась; `pnpm lint && pnpm typecheck` зелёные; `git diff --stat` в лог |
| TC-EXT-15 | AC-5 | arch | positive | | `packages/games/rebellion/package.json` `exports` | ровно `./definition, ./schema, ./rules, ./scenario, ./board, ./assets, ./ai, ./server` (+ `./package.json` допустимо) |

### 7. Forbidden Stars и неиспользуемые игры (AC-6)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-FS-01 | AC-6 | arch | positive | | `packages/games/forbidden-stars/package.json` + дерево `src/` | `exports` только `./definition`, `./assets`; в `src/` нет файлов/папок `rules`, `schema`, `scenario`, `board`, `ai`, `server`, `state`; нет Zod-схем состояния/команд (grep `z.object` только в definition, если вообще есть); deps — только `@bga/platform` (+ `zod`, если нужен) |
| TC-FS-02 | AC-6 | unit | positive | | `forbiddenStarsDefinition` | валиден по `GameDefinitionSchema`; `status:'coming_soon'`, `supportedPlayers:[2,3,4]`, `supportsAI:true` |
| TC-FS-03 | AC-6 | arch / unit | positive | | серверный реестр | `ServerGameModule[]` содержит только `R`; список definitions содержит `R` и `FS` |
| TC-FS-04 | AC-6 | manual | positive | | осмотр обложек `R`, `FS` | собственные абстрактные SVG; нет логотипов, артов, растровых сканов; названия — только текстом |
| TC-FS-05 | AC-6 | e2e / integration | negative | | см. TC-SES-05, TC-GP-07, TC-GP-09, TC-GP-16, TC-HOST-04 | создать/открыть партию FS невозможно ни через API, ни через UI |

### 8. Регрессия SWR-002 и план миграции наборов (AC-3, AC-4, AC-8)

**Принцип:** каждый TC SWR-002 сохраняет id в названии теста (`TC-E2E-NN (SWR-003: …)`), чтобы покрытие было трассируемым.
Удаление теста допустимо только с указанием заменяющего TC SWR-003 в этой таблице.

#### 8.1 E2E (`e2e/`)

| Файл | Изменение | Покрывает |
|---|---|---|
| `support/api.ts` | `createGame` → `createSession(request, setup, gameId = R)`: `POST /api/sessions {gameId, setup}` → `{sessionId, gameId, view}`; `getView` → `getSession` (`GET /api/sessions/:id`, `view` теперь **вложен**); `listGames` → `listSessions(request, gameId?)` → `SessionSummary[]`; `postCommand` → `/api/sessions/:id/commands`; локальные типы `SessionSummary`, `CreateSessionResponse`; `GameSummary` удалить | все спеки |
| `support/board.ts` | `openGame(page, id)` → `openSession` (`/sessions/:id`); `waitForTable` сверяет `game-table[data-session-id]` (TR-1, Q-10) | все спеки стола |
| `support/testids.ts` | удалить `menu*`, `recentGames`, `recentGame`; добавить каталог/страницу игры/хост (TR-1) | все |
| `smoke.spec.ts` | `/` грузится без ошибок консоли + виден `game-catalog` | TC-E2E-01, TC-CAT-10 |
| `00-empty-db.spec.ts` | вместо главного меню: каталог → страница R → «Продолжить» disabled, недавних нет; скриншоты `01-catalog`, `02-game-page-empty` | TC-E2E-02 → TC-GP-13 |
| `catalog.spec.ts` (новый) | TC-CAT-10..12, TC-GP-16, TC-GP-17 | AC-1, AC-2, AC-6 |
| `game-page.spec.ts` (новый; имя после `00-…`, не зависит от пустой БД) | TC-GP-18, TC-HOST-07, TC-HOST-08 | AC-2..AC-4 |
| `new-game.spec.ts` | старт с `/` → карточка → `/games/R/new`; `goto('/games/new')` → `/games/star-wars-rebellion/new`; ожидание URL `/sessions/:id`; фильтр ответа `pathname === '/api/sessions'` и проверка `gameId` в теле | TC-E2E-03..05 → TC-NEW-05..07 |
| `board-view.spec.ts` | `openSession`; TC-E2E-32 → `/games/does-not-exist` (unknown gameId) **и** `/sessions/does-not-exist` | TC-E2E-06, 32 → TC-GP-17, TC-HOST-08 |
| `zoom-pan.spec.ts`, `selection.spec.ts`, `move.spec.ts`, `phase.spec.ts`, `keyboard.spec.ts` | только через хелперы (`createSession`, `openSession`, `postCommand`); в `move.spec` TC-E2E-20 — путь `/api/sessions/:id/commands`; TC-E2E-34 — две вкладки на `/sessions/:id` | TC-E2E-07..21, 18b, 24, 28, 29, 34 — без изменения ожиданий |
| `persistence.spec.ts` | TC-E2E-22: reload `/sessions/:id`; TC-E2E-23: «Продолжить» со страницы игры; TC-E2E-23b: `recent-session-*` на странице игры, ≥ 6 сессий → 5 | TC-E2E-22, 23, 23b → AC-4, TC-GP-14, TC-GP-15 |
| `settings.spec.ts` | TC-E2E-26: обход `/`, `/games/star-wars-rebellion`, `/games/star-wars-rebellion/new`, `/sessions/:id`, `/settings`; TC-E2E-25: проверка языка на каталоге вместо меню | TC-E2E-25..27, TC-CAT-12 |
| `architecture.spec.ts` | `goto('/games/star-wars-rebellion/new')`; фильтр `POST /api/sessions`; allow-list мутаций `^/api/sessions$`, `^/api/sessions/[^/]+/commands$`; проверка утечек распространить на `GET /api/sessions*` (`details`) | TC-E2E-30, 31, TC-SES-13 |
| `screenshots.spec.ts` | новый список скриншотов (§10) | AC-8 evidence |

Ожидаемый итог: ≥ 37 e2e-тестов (база SWR-002) + новые; `pnpm e2e` exit 0.

**Статус миграции e2e (QA, 2026-11-08): тесты написаны, НЕ запускались** (`pnpm e2e` — `not_run`: приложение
меняется W-API/FE параллельно). Проверено только статически: `tsc -p e2e/tsconfig.json` exit 0
(`artifacts/logs/qa-e2e-typecheck.log`), `eslint e2e` + `prettier --check e2e` exit 0 (`artifacts/logs/qa-e2e-lint.log`).
Итого 50 e2e-тестов (база SWR-002 — 37; +13 новых). Фактическая раскладка:

| Спек | Тесты (название начинается с id) |
|---|---|
| `00-empty-db.spec.ts` | TC-GP-13 (was TC-E2E-02; + disabled-часть TC-GP-18: force-click/Enter не уводят) — скриншоты `01-catalog`, `02-game-page-empty` |
| `smoke.spec.ts` | api health; TC-E2E-01 (+ `game-catalog` виден) |
| `architecture.spec.ts` | TC-E2E-30 + TC-E2E-31 (allow-list `^/api/sessions$`, `^/api/sessions/[^/]+/commands$`; утечки проверяются и в `GET /api/sessions?gameId=` со страницы игры — TC-SES-13) |
| `board-view.spec.ts` | TC-E2E-06; TC-E2E-32 (старый URL SWR-002 `/games/<id реальной сессии>` → `game-not-found`) |
| `catalog.spec.ts` (новый) | TC-CAT-10, TC-CAT-11, TC-CAT-12, TC-GP-16 (+ Q-16: ни одного запроса `/api/sessions*`), TC-FS-05 (e2e: `POST` FS → 422 `GAME_UNAVAILABLE`, unknown → 404 `errors.gameNotFound`, `?gameId=forbidden-stars` → `[]`), TC-GP-17 (+ TC-GP-10 e2e: `/games/does-not-exist/new`) |
| `game-page.spec.ts` (новый) | TC-GP-01 (e2e), TC-GP-18, TC-NEW-04 (e2e), TC-HOST-07 (+ TC-HOST-01 e2e: `session-host[data-session-id][data-game-id]`), TC-HOST-08 |
| `new-game.spec.ts` | TC-NEW-05 (was TC-E2E-03), TC-NEW-06 (was 04), TC-NEW-07 (was 05), TC-NEW-05 (old URL `/games/new` → `game-not-found`) |
| `persistence.spec.ts` | TC-E2E-22; TC-GP-14 (was TC-E2E-23); TC-GP-15 (was TC-E2E-23b; создаёт 6 сессий, ровно 5 `recent-session-*` = `listSessions(R).slice(0,5)`) |
| `settings.spec.ts` | TC-E2E-25 (язык по `game-card-status` каталога), TC-E2E-26 (обход `/`, `/games/R`, `/games/R/new`, `/sessions/:id`, `/settings`), TC-E2E-27 |
| `move`, `phase`, `keyboard`, `selection`, `zoom-pan` | TC-E2E-07..21, 18b, 24, 28, 29, 34 — только хелперы (`createSession`, `openSession`, `postCommand(request, sessionId, view, cmd)`) |
| `screenshots.spec.ts` | «SWR-003 platform screenshots» (01b, 03–09) и TC-E2E-33 (регрессия стола `table-04..15`) |

#### 8.2 API (`apps/api/test/`)

| Было | Станет | Примечание |
|---|---|---|
| `games.int.test.ts` | `sessions.int.test.ts` | TC-API-02..10 → TC-SES-01..10; `CreateGameResponseSchema` → схема `@bga/platform` |
| `commands.int.test.ts` | без переименования, пути `/api/sessions/:id/commands` | TC-API-14..19, 22, 26, A-5 → TC-SES-12, TC-SES-18 |
| `hidden-info.int.test.ts`, `concurrency.int.test.ts`, `persistence.int.test.ts`, `health.int.test.ts` | пути/ответы сессий | TC-API-01, 11..13, 20, 21 → TC-SES-18 |
| `routes.int.test.ts` | allow-list мутаций и regex Prisma (`session`/`sessionEvent`) | TC-API-23..25 → TC-SES-14..16 |
| — (новые) | `game-registry.int.test.ts` (TC-EXT-01..05, TC-GP-11, TC-SES-04..06, 17), `migration.int.test.ts` (TC-MIG-01..05) | |
| `support/fixtures.ts` | импорты `@bga/game-rebellion/scenario` и `/schema`; + `fakeGame` (TR-3) | |

Ожидаемый итог: ≥ 58 тестов (база) + новые.

#### 8.3 Web (`apps/web/src/`) и пакеты

| Было | Станет |
|---|---|
| `app/pages/MainMenuPage.test.tsx` | `platform/catalog/CatalogPage.test.tsx` (TC-CAT-01..08) + `platform/game-page/GamePage.test.tsx` (TC-GP-01..10, 12) — кейсы «Продолжить/недавние» TC-WEB SWR-002 переходят сюда |
| `app/router.test.tsx` | набор маршрутов ровно `/`, `/games/:gameId`, `/games/:gameId/new`, `/sessions/:sessionId`, `/settings`, `*` (TC-ARCH-03) |
| `features/game-setup/NewGamePage.test.tsx` | `games/rebellion/setup/*.test.tsx` (TC-NEW-01..04) |
| `features/game-session/GameTablePage.test.tsx`, `hooks/useSendCommand.test.tsx` | `platform/session-host/SessionHost.test.tsx` (TC-HOST-01..05) + `games/rebellion/…` (TC-HOST-06) |
| `features/game-board/**/*.test.*`, `shared/**/*.test.*`, `SettingsPage.test.tsx` | переезжают в `games/rebellion/**` / остаются; ожидания не меняются |
| `shared/api/games.test.ts` | `platform/sessions/api.test.ts`: URL `/api/sessions`, `?gameId=`, разбор `{sessionId, gameId, view}` |
| `packages/game-core/test/*`, `contracts/test/*`, `game-data/test/*` | `packages/games/rebellion/test/{rules,schema,scenario,board}/*` + `packages/platform/test/*`; число тестов ≥ 48 + 34 + 13 (за вычетом общих схем, переехавших в `@bga/platform`, — сумма не меньше) |

### 9. Архитектура и гейты (AC-8, AC-9)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-ARCH-01 | AC-9 | arch | negative | | grep `apps/api/src`, `apps/web/src`, `packages/`: `import(` с нелитеральным аргументом, `require(`, `createRequire`, `readdirSync`/`glob` по `packages/games`, `` `@bga/game-${…}` ``; | 0 совпадений; единственные `import()` — литеральные `React.lazy` в `apps/web/src/games/**` |
| TC-ARCH-02 | AC-9 | arch | negative | | ESLint-пробы: `` import(`@bga/game-${id}/definition`) `` в `apps/web/src/platform/probe.ts` и `apps/web/src/games/registry.ts`-соседе; то же в `apps/api/src/game-registry/probe.ts` | web → ошибка (правило `WEB_DYNAMIC_IMPORTS` обновлено на `@bga`); api → ошибка, если правило распространено на api (Q-21), иначе покрывается TC-ARCH-01 |
| TC-ARCH-03 | AC-5, AC-9 | component / integration | positive | | дерево маршрутов web; перечень маршрутов Nest | web — ровно 6 маршрутов (§8.3); api — ровно таблица spec (`/api/health`, `/api/sessions` GET/POST, `/api/sessions/:id` GET, `/commands` POST); нет `/admin*`, загрузчиков плагинов |
| TC-ARCH-04 | AC-9 | arch | positive | | реестры `apps/api/src/game-registry/registry.ts`, `apps/web/src/games/registry.ts` | обычные типизированные массивы со статическими импортами (`ServerGameModule[]`, `WebGameEntry[]`); без регистрации в рантайме (`register(`, мутаций массива) |
| TC-ARCH-05 | AC-8 | arch | positive | | `packages/contracts`, `packages/game-core`, `packages/game-data` | удалены; `grep -rn "@swr/"` по коду, конфигам, `package.json`, `tsconfig*` → пусто (исключение — ключ localStorage, Q-22) |
| TC-ARCH-06 | AC-8, AC-9 | arch | positive | `pnpm build` | `pnpm check:bundle` | exit 0; сценарий читается из dist `@bga/game-rebellion/scenario` (не из удалённого `packages/game-data`); при отсутствии dist — exit 2, а не «чисто» |
| TC-ARCH-07 | AC-8 | arch | negative | | `node --test scripts/check-web-bundle.test.mjs` с фикстурами: присваивание базы повстанцев, id объекта сценария, `__boardDebug` | все обнаруживаются (exit 1 на «грязной» фикстуре, 0 на чистой); тесты обновлены под новые пути |
| TC-ARCH-08 | AC-8, AC-9 | arch | positive | `pnpm build` с sourcemap/manifest (TR-8) | список модулей web-бандла | нет модулей из `packages/games/rebellion/src/{rules,scenario,server,ai}`; есть только `definition/schema/board/assets` (Q-23) |
| TC-ARCH-09 | AC-8 | arch | positive | | grep логирования `apps/api/src` | в логах только `sessionId`, `gameId`, `code`, `status` — не state/view/payload (перенос TC-ARCH-11) |
| TC-ARCH-10 | AC-8 | arch | positive | | перенос TC-ARCH-03/04 SWR-002 на `@bga/game-rebellion/{schema,board,scenario}` | в схеме состояния нет координат; id систем сценария = ключи `mapLayout` |
| TC-GATE-01 | AC-8 | gate | positive | `pnpm install` | `pnpm lint` | exit 0 → `artifacts/logs/lint.log` |
| TC-GATE-02 | AC-8 | gate | positive | | `pnpm typecheck` (включая `e2e/tsconfig.json`) | exit 0 |
| TC-GATE-03 | AC-8 | gate | positive | | `pnpm test` (`test:process` + все пакеты) | exit 0; счётчики ≥ базы §Preconditions; лог |
| TC-GATE-04 | AC-8 | gate | positive | | `pnpm build` | exit 0 |
| TC-GATE-05 | AC-8 | gate | positive | | `pnpm check:bundle` | exit 0 (TC-ARCH-06) |
| TC-GATE-06 | AC-3, AC-8 | gate | positive | chromium установлен | `pnpm e2e` | exit 0; ≥ 37 + новые; dev-БД не изменена |
| TC-GATE-07 | AC-8 | gate | positive | | `pnpm verify` | exit 0 → `artifacts/logs/qa-verify.log` |
| TC-GATE-08 | AC-8 | gate | positive | | `node scripts/check-task.mjs docs/tasks/SWR-003` | exit 0 |
| TC-DOC-01 | AC-5, AC-8 | manual | positive | | `README.md` (маршруты, команды, пакеты `@bga/*`), `docs/architecture/adding-a-game.md`, обновлённые `application.md`/`blueprint.md` | разделы существуют, пути актуальны, нет ссылок на удалённые пакеты |

### 10. Manual browser и скриншоты

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-MAN-01 | AC-1..AC-4 | manual | positive | `pnpm dev` | каталог → Rebellion → новая партия → ход → назад к игре → «Продолжить»; FS → «Скоро» | всё работает мышью, без ошибок консоли; скриншоты по списку ниже |
| TC-MAN-02 | AC-1, AC-2 | manual | positive (a11y) | | только клавиатура: каталог, страница игры, настройка, стол | видимый фокус, нет ловушек |
| TC-MAN-03 | AC-1 | manual | boundary | | 1024×768, 1440×900, 1920×1080 | сетка карточек перестраивается без горизонтального скролла; текст карточек не обрезается без многоточия/подсказки |
| TC-MAN-04 | AC-8 | manual | positive | `pnpm dev` запущен | параллельно `pnpm e2e` | e2e зелёный, dev-БД не изменена |

Скриншоты → `docs/tasks/SWR-003/artifacts/screenshots/` (Playwright `screenshots.spec.ts` + `00-empty-db.spec.ts` + ручной прогон;
`saveScreenshot` в `e2e/support/board.ts` пишет **только** в SWR-003 — скриншоты `docs/tasks/SWR-002/artifacts/screenshots/`
больше не перезаписываются и остаются историческим артефактом):
`01-catalog.png` (TC-CAT-10), `01b-catalog-en.png` (TC-CAT-12), `02-game-page-empty.png` (TC-GP-13),
`03-game-page-with-sessions.png` (TC-GP-15), `04-game-page-coming-soon.png`, `04b-new-session-coming-soon.png` (TC-GP-16),
`05-new-session.png` (TC-NEW-05), `06-session-table.png` (TC-NEW-05, TC-HOST-01), `07-game-not-found.png` (TC-GP-17),
`08-session-not-found.png` (TC-HOST-08), `09-catalog-keyboard-focus.png` (TC-CAT-11); регрессия стола SWR-002 04–15 по
новым маршрутам — `table-04-board-initial.png` … `table-15-keyboard-focus.png` (те же номера, префикс `table-`).

## Coverage

| AC | Test cases |
|---|---|
| AC-1 | TC-CAT-01..12, TC-GATE-06, TC-MAN-01..03 |
| AC-2 | TC-CAT-04, TC-CAT-10, TC-CAT-11, TC-GP-01, TC-GP-02, TC-GP-07..10, TC-GP-13, TC-GP-16..18, TC-MAN-01 |
| AC-3 | TC-NEW-01..07, TC-HOST-01..08, TC-SES-01, TC-SES-02, TC-SES-12, TC-SES-18, §8 (перенос TC-E2E-03..34, TC-API-*, TC-WEB-*), TC-GATE-06 |
| AC-4 | TC-GP-02..06, TC-GP-11..15, TC-GP-18, TC-HOST-05, TC-HOST-07, TC-MIG-02, TC-MIG-07, перенос TC-E2E-22/23/23b |
| AC-5 | TC-EXT-01..15, TC-GP-11, TC-GP-12, TC-HOST-03, TC-SES-15, TC-SES-17, TC-ARCH-03 |
| AC-6 | TC-FS-01..05, TC-CAT-03, TC-SES-04..06, TC-EXT-05, TC-GP-07, TC-GP-09, TC-GP-16, TC-HOST-04 |
| AC-7 | TC-SES-01, TC-SES-03, TC-SES-07..18, TC-MIG-01..07, TC-GP-11 |
| AC-8 | TC-GATE-01..08, TC-ARCH-05..10, TC-DOC-01, TC-MAN-04, §8 |
| AC-9 | TC-ARCH-01..04, TC-ARCH-08, TC-EXT-12, TC-SES-15 |

Негативные/граничные есть для каждого AC (AC-8 — через пробы TC-ARCH-07 и проверку «exit 2 без dist» в TC-ARCH-06).

## Testability requirements for implementers

Без них соответствующие кейсы будут `blocked`. Владельцы — FE/BE Lead; согласовать в `implementation-plan.md`.

- **TR-1 (testid, web):** каталог — `game-catalog`, `game-card-<gameId>` (`data-status`), внутри `game-card-name`,
  `game-card-cover` (`<img>`), `game-card-description`, `game-card-status` (`data-status`), `game-card-players`, `game-card-ai`;
  шапка — `nav-catalog`, `nav-settings`. Страница игры — `game-page` (`data-game-id`, `data-status`), `game-page-cover`,
  `game-page-name`, `game-page-description`, `game-page-players`, `game-page-ai`, `game-new-session`, `game-continue`
  (нативный `disabled` или `aria-disabled="true"`), `game-coming-soon`, `game-recent-sessions`, `recent-session-<sessionId>`,
  `game-sessions-error`, `game-not-found`. Хост — `session-host` (`data-session-id`, `data-game-id`), `session-not-found`,
  `session-back-to-game`; `game-table` получает `data-session-id` (вместо `data-game-id`=id партии в SWR-002, Q-10).
  testid SWR-002 стола/настройки/настроек сохраняются без изменений.
- **TR-2 (debug-хук):** `window.__boardDebug` (`VITE_E2E=1`) сохраняется с тем же API для стола Rebellion.
- **TR-3 (seam сервера):** `createApp({ databaseUrl, clock, idGenerator, gameModules?, gameDefinitions? })` (или Nest-токен
  реестра, переопределяемый в тесте), чтобы подставить `FAKE`/`FAKE_SOON` **без** правок `apps/api/src/sessions/**`.
  По умолчанию — реальный реестр.
- **TR-4 (хелпер фиктивного модуля):** `apps/api/test/support/fake-game.ts` — `ServerGameModule` по описанию в Conventions,
  типизированный интерфейсом из `@bga/platform` (компиляция = проверка контракта).
- **TR-5 (seam web-реестра):** реестр передаётся через провайдер/контекст (`GameRegistryProvider` + `useGameRegistry`) или
  параметр `createAppRouter({ registry })`, а не только через модульный импорт — чтобы component-тесты внедряли `FAKE` без
  `vi.mock`. Форма props `SetupScreen`/`TableScreen` (`{ gameId }` / `{ sessionId, view }`) — зафиксировать в плане.
- **TR-6 (фикстура миграции):** хелпер `createPreMigrationDb()` в `apps/api/test/support/`: пустой SQLite → только SQL миграции
  `20261107235651_init` (`prisma db execute` + `migrate resolve --applied`, либо временная папка migrations с одной миграцией) →
  вставка строк SWR-002-формы с состояниями из `@bga/game-rebellion/rules` (+ ход и смена фаз) и заданными `createdAt/updatedAt`.
  Генерация при запуске, без коммита бинарной `.db`.
- **TR-7 (ESLint-пробы как тест):** автоматизировать TC-EXT-09..12 и TC-ARCH-02 (например, `scripts/eslint-boundaries.test.mjs`
  на `ESLint#lintText` с `filePath`) и включить в `pnpm test` — в SWR-002 пробы гонялись вручную через `--stdin`.
- **TR-8 (состав бандла):** для TC-ARCH-08 — sourcemap/`build.manifest` или режим `check:bundle --modules`, перечисляющий исходные
  модули бандла.
- **TR-9 (детерминизм):** `clock`/`idGenerator` из SWR-002 сохраняются; для TC-GP-11, TC-SES-09 нужен управляемый `now`.
- **TR-10 (e2e порядок):** `workers: 1`, `00-empty-db` первым; новые спеки не должны требовать пустой БД.

## Ambiguities in the specification

(Перечислены, не решены. Владелец решения — Analyst / leads.)

- **Q-1** Каталог обращается к API (например, за числом сессий) или строго статичен? Влияет на TC-CAT-05.
- **Q-2** Порядок карточек: порядок реестра, алфавит или `available` первыми?
- **Q-3** Порядок проверок `POST /api/sessions`: 400 (форма тела/`gameId`) → 404 → 422 → 400 (`setup` по схеме игры)? Spec перечисляет коды без порядка.
- **Q-4** `GAME_UNAVAILABLE` — новое значение `error.code` (расширение enum SWR-002) или `code: ILLEGAL_COMMAND` + `messageKey: errors.gameUnavailable`?
- **Q-5** `GET /api/sessions?gameId=<unknown>` → `[]` или 404 `errors.gameNotFound`? Пустой `gameId=`, повторный параметр → 400 или игнор? Лимит 20 — на фильтр.
- **Q-6** «`gameId` во всех ответах сессий» — включает ли `CommandResult` команд (сейчас «как SWR-002»)?
- **Q-7** Сессия с `gameId`, которого нет в серверном реестре: скрывать в списке или показывать; GET → 404 или 500?
- **Q-8** Разрешён ли web-импорт корня `@bga/game-rebellion` (есть ли корневой экспорт вообще)?
- **Q-9** «Без изменения общей системы» — допустимы ли правки `pnpm-workspace`, `tsconfig` references, `eslint.config.mjs`, `build:packages`, i18n при добавлении игры? Нужен ли «общий» i18n-ключ на игру или ключи живут в пакете/папке игры?
- **Q-10** Атрибуты стола: `game-table[data-game-id]` в SWR-002 хранил id партии; теперь это `sessionId` — переименовать в `data-session-id` (предложено в TR-1)?
- **Q-11** Названия игр: одинаковы в ru/en (номинативное использование) или переводятся? Описание и alt — через i18n или из `GameDefinition` (строки на одном языке)? Влияет на TC-CAT-07/08/12.
- **Q-12** Формат «игроки»/«AI» на карточке: «2» / «2–4» / «2, 3, 4»; AI — иконка/текст?
- **Q-13** Что показывает элемент недавних сессий (дата, `details` — фракция/раунд/фаза?) и как `details` Rebellion выглядят (`summarize`)?
- **Q-14** Входит ли сессия «Продолжить» в список недавних (SWR-002: входила)?
- **Q-15** Поведение страницы игры при ошибке загрузки списка сессий — не описано.
- **Q-16** Страница `coming_soon` запрашивает список сессий или нет; показывает ли блок «недавние»?
- **Q-17** `/games/:id/new` для coming_soon: redirect на `/games/:id` или рендер страницы игры на URL `/new`?
- **Q-18** Должен ли web дополнительно фильтровать список по `gameId`, если сервер вернул чужие сессии (защита от ошибки API)?
- **Q-19** Есть ли на экране настройки ссылка «назад к игре»?
- **Q-20** `/sessions/:id` для игры без `TableScreen` или неизвестной web-реестру: какое состояние (not-found, «не поддерживается»)?
- **Q-21** Распространяется ли запрет нелитерального `import()` (сейчас только web) на `apps/api` и пакеты?
- **Q-22** Ключ настроек `swr.settings.v1` переименовывается в `bga.*`? Если да — нужна ли миграция настроек пользователя (тогда добавить кейс).
- **Q-23** Должен ли `check:bundle` проверять отсутствие кода `rules/server/ai` в бандле (а не только секретов сценария)? Spec требует лишь «обновлён под новые пути».
- **Q-24** Совместимость снимков: если схема состояния Rebellion меняет поля (`id` партии → `sessionId`), обязана ли миграция переписывать JSON `state`, или `parseState` принимает старую форму? Влияет на TC-MIG-02.
- **Q-25** Источник истины для списка определений: web и server реестры дублируют `definition` — нужен ли тест согласованности (одинаковые id/статусы) и где он живёт?
