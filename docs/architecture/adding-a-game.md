# Как добавить игру на платформу

Статус: действующий (SWR-003, INTEGRATION, 2026-11-08; обновлён на INTEGRATION SWR-004 — статус сессии, публичные
настройки, `Idempotency-Key`, `parseSetup` invalid/unsupported, новые методы `ServerGameModule`). Автор — backend-lead; раздел 7 (Web) составлен по
`docs/tasks/SWR-003/plan-frontend.md` §4–§5 и фактическому коду, ревью — frontend-lead.
Архитектура в целом — [`application.md`](application.md).

## 1. Что такое «игра на платформе»

Игра = **игровой пакет** `packages/games/<id>` + **по одной записи в двух реестрах** (сервер и web) + папка UI игры
`apps/web/src/games/<id>/`. Без правок остаются: маршруты web (`/`, `/games/:gameId`, `/games/:gameId/new`,
`/sessions/:sessionId`, `/settings`), хост сессии, каталог и страница игры (`apps/web/src/platform/**`), HTTP API
`/api/sessions*`, сервис и репозиторий сессий (`apps/api/src/sessions/**`), Prisma-схема (`Session`, `SessionEvent`),
ESLint-конфиг (правила сформулированы глобами `@bga/game-*`, `packages/games/*`, `apps/web/src/games/*`).

Допустимая «обвязка» (Clarification Q-9): ссылка в `packages/tsconfig.json`, зависимости в `apps/api/package.json` и
`apps/web/package.json` (+ `pnpm install`, lockfile), web-локали игры. Никаких плагинов, загрузки игр по имени и
`import()` с вычисляемым именем (AC-9, Q-21 — проверяет ESLint).

## 2. Шаг 0: `gameId` и название

- `gameId` — kebab-case по `GameIdSchema` (`@bga/platform`), ≤ 64 символов, **неизменяем**: хранится в `Session.gameId`.
- `name` — имя собственное, не переводится, используется номинативно: без логотипов, артов коробки и фирменных шрифтов.
  Обложка — только собственная абстрактная графика.

## 3. Пакет `packages/games/<id>`

```text
packages/games/<id>/
├── package.json          # "@bga/game-<id>", exports по subpath (ниже), deps: @bga/platform, zod
├── tsconfig.json         # composite, NodeNext, rootDir src, outDir dist, references → ../../platform
├── tsconfig.test.json    # noEmit, Bundler, customConditions ["@bga/source"], include src+test
├── vitest.config.mts     # conditions ['@bga/source', ...defaultServerConditions], include test/**/*.test.ts
├── src/
│   ├── definition/index.ts   # GameDefinition                          → web + api
│   ├── assets/index.ts       # обложка (SVG-строка), accentColor        → web
│   ├── schema/index.ts       # Zod: setup, state, view, commands, events, details, игровые messageKey → web + api
│   ├── board/index.ts        # конфигурация поля (координаты и т.п.)    → web
│   ├── rules/index.ts        # чистые детерминированные правила        → только сервер
│   ├── scenario/index.ts     # стартовые данные (могут содержать секреты) → только сервер
│   ├── ai/index.ts           # AI Strategy Configuration (данные)      → только сервер
│   └── server/index.ts       # ServerGameModule                         → только api (game-registry)
└── test/<subpath>/**
```

Шаблон одного экспорта (порядок условий важен; корневого `"."` **нет**):

```jsonc
"./definition": {
  "@bga/source": "./src/definition/index.ts",
  "types": "./dist/definition/index.d.ts",
  "default": "./dist/definition/index.js"
}
```

`@bga/source` — Vite/Vitest/typecheck читают TypeScript-исходники; Nest исполняет собранный CJS `dist`
(`pnpm run build:packages` = `tsc -b packages`). Межпапочные импорты внутри пакета — относительные (`'../schema'`).
Подключение: добавить `{ "path": "./games/<id>" }` в `packages/tsconfig.json`; `"@bga/game-<id>": "workspace:*"` в
`apps/api/package.json` и `apps/web/package.json`; `pnpm install`. `pnpm-workspace.yaml` уже содержит `packages/games/*`.

## 4. Минимум для `coming_soon` (пример — `packages/games/forbidden-stars`)

Только `./definition` (`status: 'coming_soon'`) и `./assets`. Регистрация: definition — в
`apps/api/src/game-registry/definitions.ts` (сервер отвечает на `POST /api/sessions` для неё `422 GAME_UNAVAILABLE`),
web-запись **без** экранов (§7). Правил, схем, карты нет; это проверяет `test/package-shape.test.ts` пакета.

## 5. Полноценная игра

| Subpath | Требования |
|---|---|
| `./definition` | `GameDefinition`: `id`, `name`, `descriptionKey` (`<ns>:<key>`, напр. `<id>.meta:description`), `coverAltKey?`, `description?` (fallback), `status: 'available'`, `supportedPlayers` (по возрастанию), `supportsAI`. `coverImage` не заполнять — обложка из `./assets` |
| `./assets` | `GameAssets` (`GameAssetsSchema`): `cover: { svg, width, height }` — SVG-строка, viewBox 16:9, без текста, `<script>`, внешних ссылок, растров; `accentColor: '#RRGGBB'`. Игра может добавить свои токены (у Rebellion — `rebellionVisualTokens`, единственный источник палитры стола) |
| `./schema` | Zod-схемы `setup` (с дефолтами), `state` (полное, JSON-сериализуемое), `view` (то, что видит человек), команд и конверта (можно на основе `CommandEnvelopeFrameSchema`), событий (`{ seq, type, actor, at, payload }`), `details` списка сессий; игровые `messageKey` в формате `errors.<name>` |
| `./rules` | Чистый TS: без React/Nest/Prisma/OpenAI/`node:*`, без `Date`/`Math.random` (время и id — через ctx). Отказ — результат, не исключение. Вход не мутируется |
| `./scenario` | Данные старта; видит только `../schema`. Не попадает в web-бандл |
| `./board` | Только данные отрисовки; **не импортирует** другие подпапки (в т.ч. `scenario`) |
| `./ai` | Только данные (уровни сложности, веса целей), без логики и без OpenAI. AI никогда не получает скрытую информацию |
| `./server` | `defineServerGameModule({...})` — реализация `ServerGameModule` (`@bga/platform`, §5.1) |

### 5.1 `ServerGameModule`

| Метод | Контракт |
|---|---|
| `definition` | та же definition, `status: 'available'` |
| `parseSetup(input)` | сначала схема, потом поддержка: `{ ok: true, value }` (дефолты применены) · `{ ok: false, kind: 'invalid', issues }` → `400 VALIDATION` (path с префиксом `['setup']`) · `{ ok: false, kind: 'unsupported', messageKey, details? }` → `422 SETUP_UNSUPPORTED` (игровой `errors.<name>` или `ERROR_MESSAGE_KEYS.setupUnsupported`; `details` — только эхо полей запроса). Никогда не бросает на клиентском вводе |
| `parseStoredSetup(raw)` | `Session.setup` любой сохранённой версии (уже `JSON.parse`) → текущий setup (место для апкастера старых данных); битые данные → `throw` (500) |
| `initialStatus(setup)` | `SessionStatus` новой сессии (`'setup' \| 'prototype' \| 'active' \| 'completed'`), пишется в `Session.status`; игра на временных данных/правилах обязана вернуть `'prototype'` |
| `publicSettings(setup)` | **несекретный** JSON-объект → `SessionResponse.settings` (платформа не интерпретирует; клиентские поля, которым нельзя доверять, вычисляет игра — у Rebellion `opponentFaction`) |
| `setupOf(state)` | setup, с которым создан state, в **текущей** сохранённой форме. Единый источник настроек (SWR-004 review #1): при каждой записи state платформа перезаписывает `Session.setup` значением `setupOf(newState)` (старая строка становится текущей версией при первой команде), а при чтении сверяет `publicSettings(parseStoredSetup(Session.setup))` с `publicSettings(setupOf(state))` — расхождение → `500 INTERNAL` (лог: только `sessionId`, `gameId`, `code=SETTINGS_MISMATCH`), в списке строка пропускается. Значит, настройки должны храниться и в state (у Rebellion — `state.settings` → `toStoredSetup`) |
| `createInitialState(setup, { sessionId, now })` | `{ state, events }`, версия 1, события seq ≥ 1; детерминированно |
| `parseState(raw, { sessionId, version })` | снимок из БД; несоответствие → `throw` (сервис отвечает `500 INTERNAL`, не раскрывая деталей) |
| `version(state)` | текущая версия (optimistic concurrency) |
| `applyCommand(state, envelope, { now })` | порядок внутри: 400 (схема конверта) → 409 (`expectedVersion`) → 422 (правила, игровой `messageKey`) |
| `toPlayerView(state, { status })` / `toPlayerEvents(events, state)` | только видимое текущему зрителю, провалидировано схемой view; `status` — `Session.status` (можно показать в view). Зритель выбирается игрой из state (у Rebellion — активная сторона; при передаче хода — отдельная «заслонка» без игровых данных) |
| `summarize(state)` | плоские **несекретные** поля (`string \| number \| boolean \| null`) → `SessionSummary.details` |

Методы объявлены method-синтаксисом (бивариантность параметров) — не менять на property-синтаксис.

**Чтение строк `SessionEvent` (SWR-004 review #4).** `SessionEvent` — append-only зеркало журнала: строки пишутся в той
версии данных, что была на момент записи, и **не переписываются** при апгрейде схемы игры (апкаст state/setup ленивый,
Q-16). Сейчас эти строки никто не читает. Любой будущий читатель (история, аналитика, повтор партии, экспорт) обязан
пропускать каждую строку через апкастер событий своей игры — у Rebellion `upcastEvent` из `@bga/game-rebellion/server`
(v1 `actor: 'rebellion'` → `'rebels'`), — а затем через фильтр видимости (`toPlayerEvents`), прежде чем что-то показать.
Новая игра со своей версионностью событий экспортирует аналогичный апкастер рядом с `parseState`.

**Что делает платформа сама (игре не нужно):** колонки `Session.status`, `idempotencyKey`, `idempotencyHash`; заголовок
`Idempotency-Key` (UUID, необязательный) у `POST /api/sessions`: повтор с тем же телом → `200` + `Idempotent-Replay: true`
(тело — текущее состояние сессии), другое тело → `409 IDEMPOTENCY_KEY_REUSED`; ключ сохраняется только с успешно созданной
сессией. Порядок проверок создания: 400 тело/заголовок → 404 игра → 422 `GAME_UNAVAILABLE` → идемпотентность →
`parseSetup` (400 → 422) → создание. Ответы `POST`/`GET /api/sessions/:id` — `{ sessionId, gameId, status, settings, view }`,
`SessionSummary` — с `status`. Подробности — [`application.md`](application.md) §2.

## 6. Регистрация на сервере

- `apps/api/src/game-registry/definitions.ts` — definition в `GAME_DEFINITIONS` (порядок = порядок каталога).
- `apps/api/src/game-registry/registry.ts` — модуль в `SERVER_GAME_MODULES` (только для `available`).
- При старте `validateRegistry` проверяет: уникальные id, валидные definitions, у каждой `available` есть модуль, у
  `coming_soon` — нет. Ошибка = приложение не стартует.
- Сервис сессий находит модуль по `Session.gameId`; ни один файл `sessions/**`, `common/**` не правится.

## 7. Регистрация в web (frontend)

Маршруты (`apps/web/src/app/router.tsx`), каталог, страница игры, `/games/:gameId/new`, хост сессии и API-клиент сессий
(`apps/web/src/platform/`) **не меняются** — они читают только реестр.

- **Папка игры** `apps/web/src/games/<prefix>/`, где `<prefix>` = `i18nPrefix` (короткое kebab-case имя; может не совпадать
  с `gameId`: Rebellion — папка `rebellion`, `gameId` `star-wars-rebellion`). Запись `entry.ts`:

```ts
import { myGameAssets } from '@bga/game-<id>/assets';
import { myGameDefinition } from '@bga/game-<id>/definition';
import { lazy } from 'react';
import type { WebGameEntry } from '@/games/types';
import { svgDataUrl } from '@/platform';

export const myGameEntry: WebGameEntry = {
  definition: myGameDefinition,
  cover: { src: svgDataUrl(myGameAssets.cover.svg), accentColor: myGameAssets.accentColor }, // необязательно
  i18nPrefix: '<prefix>',
  describeSession: describeMyGameSession,              // необязательно: строка или части `{ key, text }[]` из details
  SetupScreen: lazy(() => import('./setup/SetupScreen')),  // default export; есть ⇔ status 'available'
  TableScreen: lazy(() => import('./table/TableScreen')),  // default export; есть ⇔ status 'available'
};
```

  - `cover` не задан → платформа рисует плейсхолдер-обложку с alt `common:cover.placeholderAlt`. Alt реальной обложки —
    `definition.coverAltKey` (в `WebGameEntry.cover` alt нет).
  - `describeSession(summary, t)` возвращает `SessionDescription = string | SessionLinePart[]`. Части (`{ key, text }`)
    платформа рисует через « · » как `<span data-testid="recent-session-<key>">` (Rebellion: `faction`, `opponent`,
    `progress`); статус (`SessionStatusChip` по `summary.status`) и дату добавляет платформа. Не задан, пустая строка/`[]`
    или исключение → общий текст платформы.
  - `import()` — только строковым литералом (ESLint `WEB_DYNAMIC_IMPORTS`/B-15; загрузка игр по имени запрещена, AC-9).
  - `coming_soon`: `SetupScreen`/`TableScreen` не задаются (пример — `apps/web/src/games/forbidden-stars/entry.ts`); `/games/<id>/new`
    показывает «Скоро», хост сессии — «Игра недоступна».
- **Реестр:** одна строка в `apps/web/src/games/registry.ts` (`gameRegistry` — `Object.freeze([...])`, порядок = порядок
  карточек каталога; `available` выводятся первыми). Платформа читает реестр только через `GameRegistryProvider` /
  `useGameRegistry()`; тесты подставляют свои записи (`renderWithProviders({ registry })`, `apps/web/src/platform/test/fakeGame.ts`).
- **Props экранов** (`apps/web/src/games/types.ts`):
  - `SetupScreenProps { gameId, definition, start: StartSession, backHref }` — экран собирает `setup` своей формы и вызывает
    `start.submit(setup)`; `start.isPending` / `start.error` отображает сам. Создание сессии (`POST /api/sessions` с новым
    `Idempotency-Key` на каждую попытку отправки; повторный `submit` во время запроса игнорируется) и переход на
    `/sessions/:id` (replace) делает платформа; ссылку «← К игре» над формой рисует платформа. Рекомендуется проверять форму
    той же Zod-схемой входа, что и сервер (`./schema`), и не отправлять поля, которые вычисляет сервер.
  - `TableScreenProps { sessionId, gameId, status, view: unknown, definition, backHref }` — `status` = `SessionStatus`
    сессии (например, для пометки «Прототип»); `view` загружает хост сессии
    (`sessionKeys.detail`); игра парсит его своей схемой (`./schema`) и отправляет команды через `postSessionCommand`
    из `@/platform`, обновляя кеш `sessionKeys.detail(sessionId)` ответом сервера (загрузка, 404 и «игра недоступна» — у хоста).
- **Локали:** `apps/web/src/games/<prefix>/locales/{ru,en}/<area>.json` → namespace `<prefix>.<area>` (общий glob в
  `apps/web/src/shared/i18n/i18n.ts`, без правок). Обязательно `meta.json` с ключами `description` и `coverAlt`; в definition значения
  ns-квалифицированы: `descriptionKey: '<prefix>.meta:description'`, `coverAltKey: '<prefix>.meta:coverAlt'` (`name` — строка,
  не переводится). Игровые ошибки — `errors.json`; игра передаёт `translateError(t, err, { gameNs: '<prefix>.errors' })` —
  тогда ищется `<prefix>.errors:<name>`, затем общие `errors:`. Наборы ключей ru == en.
- **Импорты** (ESLint B-8, B-9, B-17; см. §8): из игрового пакета только `./definition`, `./schema`, `./board`, `./assets`;
  из `@/games/*` — только `@/games/types`; реестр и чужие игры — нельзя; `@/platform` и `@/shared/*` — можно. Обратное
  запрещено: `app/`, `shared/`, `platform/` не импортируют ни `@bga/game-*`, ни папку игры — только `@/games/registry`.
- **Тесты web, которые нужно обновить/добавить:**
  - Guard-списки id (полный перечень, включая серверные, — §10): `apps/web/src/games/registry.test.ts`,
    `apps/web/src/platform/catalog/CatalogPage.test.tsx`, `apps/web/src/platform/extensibility.test.tsx`.
  - `apps/web/src/games/registry.test.ts` — ожидаемый список `gameId` (порядок); остальные инварианты применяются к новой
    записи автоматически: `GameDefinitionSchema`, уникальность id, `available ⇔ оба экрана`, `cover.src` = `data:image/svg+xml`,
    `descriptionKey`/`coverAltKey` начинаются с `<prefix>.meta:` и непусты в ru/en (en без кириллицы), массив заморожен.
  - `apps/web/src/games/registry.consistency.test.ts` (Q-25) — без правок: падает, если web- и серверный реестр расходятся
    по набору/порядку id или по definitions.
  - Свои тесты игры в её папке (экраны, `describeSession`, i18n-паритет `<prefix>.*`, как `apps/web/src/games/rebellion/locales.i18n.test.ts`).

## 8. Границы импорта (ESLint, `pnpm lint`; тест — `scripts/eslint-boundaries.test.mjs`)

| Кто | Может | Не может |
|---|---|---|
| `packages/platform` | `zod` | любые `@bga/*`, игры, React, Nest, Prisma, OpenAI, `node:*` |
| `packages/games/*/src/**` | `@bga/platform`, `zod`, относительные импорты по слоям | другие игровые пакеты (и self-import), apps, UI/серверные библиотеки |
| `definition`/`schema`/`board`/`assets` | только свою папку (+ `@bga/platform`) | `../rules`, `../scenario`, `../server`, `../ai` |
| `rules` / `scenario` / `ai` | `../schema` | `server`, прочие (у `rules` — и `scenario`, кроме тестов) |
| `apps/web/src/**` | `@bga/game-*/{definition,schema,board,assets}` | `rules`, `scenario`, `server`, `ai`, корень пакета, глубокие пути, `packages/**` |
| `apps/web/src/{app,shared,platform}/**` | `@/games/registry` | игровые пакеты, папки игр |
| `apps/api/src/{sessions,common,persistence,health}/**` | `../game-registry/**` | любые `@bga/game-*` |
| `apps/api/src/game-registry/**` | `@bga/game-*/{definition,server}` | остальные subpath |

## 9. Скрытая информация и `check:bundle`

Секреты (как база повстанцев) живут только в `state` на сервере и в `./scenario`; наружу — только `toPlayerView`.
`pnpm check:bundle` проверяет, что в web-бандле нет модулей `rules|scenario|server|ai` **любой** игры (по sourcemap
отдельной сборки) — это работает для новой игры автоматически. Правила по значениям (id объектов, база) сейчас
выводятся из сценария Rebellion; если у новой игры есть секретные значения — добавить для неё аналогичные правила в
`scripts/check-web-bundle.mjs` (+ тест в `check-web-bundle.test.mjs`).

## 10. Тесты: что запускается само, а что нужно обновить вручную

Часть тестов намеренно **фиксирует текущий состав реестров** («update me»-guard): при добавлении игры они падают, пока их
ожидания не обновлены. Это осознанная проверка «реестр изменился намеренно», а не признак того, что общий код надо править.

**Обновить вручную (guard-тесты, только списки/данные — логику не трогать):**

| Файл | Что поменять |
|---|---|
| `apps/api/test/game-registry.int.test.ts` → `setupFor` (conformance) | для `available`-игры добавить валидный пример setup: `{ [MY_GAME_ID]: <setup> }`. Без записи `parseSetup(undefined)` вернёт ошибку и conformance-тест модуля упадёт |
| `apps/api/test/game-registry.int.test.ts` → TC-FS-03 / TC-ARCH-04 | ожидаемые списки `SERVER_GAME_MODULES` (только `available`) и `GAME_DEFINITIONS` (порядок каталога) |
| `apps/web/src/games/registry.test.ts` | ожидаемый список `gameId` в порядке реестра |
| `apps/web/src/platform/catalog/CatalogPage.test.tsx` (TC-CAT-01/05) | ожидаемый порядок `game-card-<gameId>` реального реестра |
| `apps/web/src/platform/extensibility.test.tsx` (AC-5(б)) | ожидаемый порядок карточек «реальный реестр + фиктивные записи» (правило: `available` первыми, внутри группы — порядок реестра) |

Эти файлы — тесты; производственный код платформы (`apps/web/src/{app,platform}/**`, `apps/api/src/sessions/**`) при этом не меняется.

**Запускаются для новой игры автоматически (без правок):**

- `apps/api/test/game-registry.int.test.ts` — `validateRegistry` на реальном реестре и conformance **каждого** модуля
  `SERVER_GAME_MODULES` (definition валидна и `available`; `createInitialState` → версия 1, события seq ≥ 1; `summarize` плоский;
  `parseState` после JSON-roundtrip ≡ state, чужой `sessionId` → throw; `applyCommand(state, {})` → `VALIDATION`) — после
  добавления записи в `setupFor` (см. выше).
- `apps/web/src/games/registry.test.ts` — инварианты каждой записи (кроме списка id): `GameDefinitionSchema`, уникальность id,
  `available ⇔ оба экрана`, `cover.src` = `data:image/svg+xml`, тексты `descriptionKey`/`coverAltKey` непусты в ru/en, массив заморожен.
- `apps/web/src/games/registry.consistency.test.ts` (Q-25) — web- и серверный реестр совпадают по набору/порядку id и definitions.
- `scripts/eslint-boundaries.test.mjs` и `pnpm lint` — границы импорта (правила сформулированы глобами, новых записей не нужно).
- `pnpm check:bundle` — отсутствие модулей `rules|scenario|server|ai` любой игры в web-бандле (правила по секретным значениям — §9).

**Написать для новой игры:**

- Пакет: `schema`, `rules` (переходы, инварианты, ошибочные команды, детерминизм), `server` (parseSetup, createInitialState,
  parseState mismatch, `summarize` без секретов), `assets` (SVG без внешних ссылок/скриптов), `definition`; для `coming_soon` —
  проверка состава пакета (как `packages/games/forbidden-stars/test/package-shape.test.ts`).
- Web: тесты экранов, `describeSession`, i18n-паритет `<prefix>.*` (как `apps/web/src/games/rebellion/locales.i18n.test.ts`).
- API (при необходимости): игровые сценарии через `/api/sessions` в `apps/api/test/sessions.int.test.ts`.
- e2e: «каталог → страница игры → новая партия → стол».

## 11. Чек-лист Definition of Done

- [ ] `gameId` выбран; название — номинативно; обложка — собственная.
- [ ] Пакет `packages/games/<id>` с нужными subpath, ссылкой в `packages/tsconfig.json`, зависимостями в apps.
- [ ] Definition в `GAME_DEFINITIONS`; для `available` — модуль в `SERVER_GAME_MODULES` со всеми методами §5.1
      (`parseSetup` различает `invalid`/`unsupported`; `initialStatus` — `'prototype'`, пока правила временные).
- [ ] Web: папка `games/<id>/`, `entry.ts`, строка в `gameRegistry`, локали `<id>.meta` (+ остальные), ru == en.
- [ ] Не изменён производственный код платформы: `apps/web/src/{app,platform}/**` (тесты — только guard-списки §10), `apps/api/src/sessions/**`, Prisma-схема, маршруты.
- [ ] Guard-тесты §10 обновлены: `setupFor` и TC-FS-03 в `apps/api/test/game-registry.int.test.ts`; списки id в
      `apps/web/src/games/registry.test.ts`, `apps/web/src/platform/catalog/CatalogPage.test.tsx`, `apps/web/src/platform/extensibility.test.tsx`.
- [ ] Новые тесты пакета/web/e2e из §10 написаны; `pnpm verify` зелёный; `node scripts/check-task.mjs docs/tasks/<ID>` — 0.
