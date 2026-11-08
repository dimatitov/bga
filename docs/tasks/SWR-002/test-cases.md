# Test cases — SWR-002

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-08).
Rev. 2 (2026-11-08): согласовано со `specification.md` → «Clarifications» (A-1..A-19) и «Contract amendments approved»,
а также с `plan-backend.md` §6.2–6.7, §7 и `plan-frontend.md` §4.5–4.6, §6 (testid, `__boardDebug`).
Это **дизайн**: тесты ещё не написаны и не запускались; ничто здесь не является доказательством `passed`.

## Conventions

**Уровни (Level):**
- `unit` — Vitest, `packages/game-core` (+ схемы `packages/contracts`).
- `integration` — Vitest + supertest против реального Nest (`createApp({ databaseUrl })`) на отдельной SQLite-БД
  (`apps/api/test/**/*.int.test.ts`, см. `plan-backend.md` §6.6).
- `component` — Vitest + Testing Library (jsdom), `apps/web`, подмена `globalThis.fetch` (без MSW, `plan-frontend.md` §6.4).
- `e2e` — Playwright (`pnpm e2e`): web `http://localhost:5174`, api `http://localhost:3100`, своя БД `apps/api/.tmp/e2e.db`
  (A-17, `plan-backend.md` §7). Работает параллельно с `pnpm dev` (3000/5173).
- `manual` — ручной прогон во встроенном браузере агента (skill `browser-qa`), скриншот как доказательство.
- `arch` — статическая проверка (ESLint-правило, grep/скрипт, тест на схему/маршруты).
- `gate` — корневая команда quality gate.

**Пакеты:** `@swr/contracts`, `@swr/game-core`, `@swr/game-data` (+ `@swr/game-data/layout`), `@swr/api`, `@swr/web`.

**Единый формат ошибки (все эндпоинты, включая 404):** `{ ok: false, error: { code, messageKey, details? } }`;
`code ∈ VALIDATION(400) | NOT_FOUND(404) | VERSION_CONFLICT(409, details.currentVersion) | ILLEGAL_COMMAND(422) | INTERNAL(500)`.
Ниже «err(CODE, key)» = такое тело с указанным `code` и `messageKey`.

**Порядок проверок команды (A-5):** 404 → 400 (Zod: форма, пустой/дублирующийся `pieceIds`) → 409 → 422
(`errors.notYourSide`, `unknownSystem`, `sameSystem`, `unknownPiece`, `notOwner`, `notInFromSystem`, `notAdjacent`).

**Нотация фикстур** (id берутся из mock-сценария `@swr/game-data` программно или из собранного в тесте `GameState`):
- `S_A`, `S_B` — соседние системы; `S_C` — не соседняя с `S_A` (≠ `S_A`).
- `P_E1`, `P_E2` — объекты Империи в `S_A`; `P_E3` — объект Империи в другой системе; `P_R1` — видимый объект Повстанцев;
  `P_RH` — `hidden: true` объект Повстанцев.
- `H` — `setup.humanFaction`; по умолчанию `H = empire`, соперник `{kind:'ai', difficulty:'normal'}`.
- `ctx` — `{ gameId, now }` для `createGame`, `{ now }` для `applyCommand` (AM-1).
- `env(cmd, v)` — `CommandEnvelope { actor: H, expectedVersion: v, command: cmd }`.
- События: `GAME_CREATED | PIECES_MOVED | PHASE_ADVANCED` (AM-3).

**Канвас:** состояние проверяется через (1) доступный список `board-list` (`role="listbox"`/`role="option"`, `aria-selected`)
на вкладке `sidebar-tab-objects` и (2) read-only хук `window.__boardDebug` (`VITE_E2E=1`), а также DOM-зеркала
`board-canvas[data-scale]`, `zoom-level`, `zoom-in/out[disabled]`. Пиксели не сравниваются (кроме скриншотов AC-11).

## Test cases

### 1. game-core — unit (переходы, инварианты, ошибочные команды, PlayerView)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-GC-01 | AC-9, AC-4 | unit | positive | сценарий из `@swr/game-data` | `createGame({humanFaction:'empire', opponent:{kind:'ai',difficulty:'normal'}}, SCENARIO, ctx)` | `version = 1`, `round = 1`, `phase = 'assignment'` (A-8); `log` = ровно 1 событие `GAME_CREATED`, `seq = 1`, `actor = 'system'`, `at = ctx.now`; ≥ 8 систем, у каждой ≥ 1 сосед, соседство симметрично, ссылки на существующие системы; объекты обеих сторон видов `unit` и `token`; все `piece.systemId` существуют, `id` уникальны; `rebelBase.systemId` задан, `revealed = false`; проходит `GameStateSchema` |
| TC-GC-02 | AC-7, AC-9 | unit | positive | state0 (v=1); `P_E1` в `S_A` | `applyCommand(state0, env(MOVE_PIECES{[P_E1], S_A, S_B}, 1), ctx)` | `ok`; `P_E1.systemId = S_B`; прочие объекты неизменны; `version = 2`; +1 событие `PIECES_MOVED` (`actor = empire`, payload `{pieceIds, fromSystemId, toSystemId}`, `seq = 2`, `at = ctx.now`) |
| TC-GC-03 | AC-7, AC-9 | unit | positive | `P_E1`, `P_E2` в `S_A` | `MOVE_PIECES{[P_E1,P_E2], S_A, S_B}` | оба в `S_B`; `version` +1 (один раз); 1 событие |
| TC-GC-04 | AC-9 | unit | positive | state0 (`assignment`, round 1) | 3× `ADVANCE_PHASE` с корректным `expectedVersion` | assignment→command→refresh→assignment; `round` 1,1,1,2; `version` +3; 3 события `PHASE_ADVANCED` |
| TC-GC-05 | AC-9 | unit | boundary | | 6× `ADVANCE_PHASE` | `round = 3`, `phase = 'assignment'`; объекты неизменны |
| TC-GC-06 | AC-9 | unit | positive (invariant) | | фиксированная последовательность из N допустимых команд (MOVE по `legalActions` + ADVANCE_PHASE) | после каждой: `version` ровно +1; множество `piece.id` неизменно (ни потерь, ни дублей); `log.length` +1; `seq` строго возрастают без пропусков |
| TC-GC-07 | AC-7, AC-9 | unit | negative | `S_C` не сосед `S_A` | `MOVE_PIECES{[P_E1], S_A, S_C}` | `{ok:false}` `ILLEGAL_COMMAND` / `errors.notAdjacent` (результат, не исключение — AM-4); вход глубоко равен исходному (deepFreeze/`structuredClone` до/после) |
| TC-GC-08 | AC-7, AC-9 | unit | negative | | actor `empire`: `MOVE_PIECES{[P_R1], from(P_R1), adj}` | `ILLEGAL_COMMAND` / `errors.notOwner`; состояние неизменно |
| TC-GC-09 | AC-7, AC-9 | unit | negative | `P_E1` в `S_A` | `MOVE_PIECES{[P_E1], S_B, adj(S_B)}` | `ILLEGAL_COMMAND` / `errors.notInFromSystem`; неизменно |
| TC-GC-10 | AC-9 | unit | negative | | `MOVE_PIECES{['no-such-piece'], S_A, S_B}` | `ILLEGAL_COMMAND` / `errors.unknownPiece`; неизменно |
| TC-GC-11 | AC-9 | unit | negative / boundary | | `MOVE_PIECES{[], S_A, S_B}` | `CommandEnvelopeSchema` отклоняет; `applyCommand` → `VALIDATION` / `errors.validation`; неизменно |
| TC-GC-12 | AC-9 | unit | negative | `P_E1` в `S_A`, `P_E3` вне `S_A` | `MOVE_PIECES{[P_E1,P_E3], S_A, S_B}` | `ILLEGAL_COMMAND` (`errors.notInFromSystem`); **ни один** объект не перемещён (всё или ничего, A-6) |
| TC-GC-13 | AC-9 | unit | negative / boundary | | `MOVE_PIECES{[P_E1], S_A, S_A}` | `ILLEGAL_COMMAND` / `errors.sameSystem`; неизменно |
| TC-GC-14 | AC-9 | unit | negative | | `toSystemId = 'no-such-system'`; отдельно `fromSystemId = 'no-such-system'` | `ILLEGAL_COMMAND` / `errors.unknownSystem`; неизменно |
| TC-GC-15 | AC-9 | unit | negative / boundary | | `MOVE_PIECES{[P_E1,P_E1], S_A, S_B}` | `VALIDATION` (A-6); неизменно |
| TC-GC-16 | AC-9 | unit | negative | state.version = 5 | `env(ADVANCE_PHASE, 4)`, `env(..., 6)`; **и** `env(MOVE в S_C, 4)` (устаревшая версия + недопустимая команда) | все — `VERSION_CONFLICT`, `details.currentVersion = 5` (409 важнее 422, A-5); неизменно |
| TC-GC-17 | AC-9 | unit | negative | `H = empire` | `actor = 'rebellion'`: MOVE своего объекта Повстанцев и `ADVANCE_PHASE` | `ILLEGAL_COMMAND` / `errors.notYourSide` (A-2); неизменно |
| TC-GC-18 | AC-9 | unit | negative | | неизвестный `command.type`, лишние ключи (strict), отсутствующие поля, `expectedVersion: '1'` | схема отклоняет; `applyCommand` → `VALIDATION`; неизменно |
| TC-GC-19 | AC-9, AC-12 | unit | positive | `rebelBase = {systemId: S_X, revealed: false}` | `toPlayerView(state, 'empire')` | `rebelBase.systemId = null`, `revealed = false`; сериализованный view не раскрывает базу (нет `S_X` в `rebelBase`, в `log`-payload, в `legalActions`) |
| TC-GC-20 | AC-9 | unit | positive | то же | `toPlayerView(state, 'rebellion')` | `rebelBase.systemId = S_X` |
| TC-GC-21 | AC-9 | unit | boundary | `revealed: true` (собрано в тесте) | `toPlayerView(state, 'empire')` | `rebelBase.systemId = S_X` |
| TC-GC-22 | AC-9 | unit | positive | `P_RH` (`hidden`, typeKey `'rebel-xyz'`) | `toPlayerView(state, 'empire')` | у `P_RH` `typeKey = 'unknown'`; `id` и `systemId` видимы (A-11); строка `'rebel-xyz'` отсутствует во всём сериализованном view |
| TC-GC-23 | AC-9 | unit | positive | то же | `toPlayerView(state, 'rebellion')` | у своего `P_RH` реальный `typeKey` |
| TC-GC-24 | AC-9 | unit | positive | hidden-объект Империи (собран в тесте) | view для rebellion | симметрично: `typeKey = 'unknown'` (если правило проекции симметрично; иначе зафиксировать — A-11 говорит только об Империи) |
| TC-GC-25 | AC-6, AC-9 | unit | positive | `H = empire` | `getLegalActions(state, 'empire')` / `view.legalActions` | MOVE — только объекты `owner = empire`; `toSystemIds` = `adjacentSystemIds(piece.systemId)`; есть `{type:'ADVANCE_PHASE'}`; нет `pieceId` противника |
| TC-GC-26 | AC-9 | unit | positive (consistency) | | для каждого `LegalAction` MOVE и каждой цели — `applyCommand` | все приняты; для любой пары (свой объект, система ∉ `toSystemIds`) — отказ |
| TC-GC-27 | AC-9 | unit | negative | `H = empire` | `getLegalActions(state, 'rebellion')`; `toPlayerView(state, 'rebellion').legalActions` | `[]` (AM-4) |
| TC-GC-28 | AC-9, AC-12 | unit | positive (hidden info) | state, собранный в тесте: `log` содержит `PIECES_MOVED` с `P_RH` | `toPlayerView(state, 'empire')` | payload события не содержит реального `typeKey` `P_RH` и `rebelBase.systemId` (A-11); `pieceIds`/системы — видны |
| TC-GC-29 | AC-12 | unit | positive | | `createGame` + `applyCommand` на `deepFreeze(state)` | не бросает (нет мутаций входа); новый объект |
| TC-GC-30 | AC-12 | unit | positive | | результат `toPlayerView` через strict `PlayerViewSchema` | проходит; GameState-только полей нет |
| TC-GC-31 | AC-7, AC-9 | unit | positive | state в `command` и в `refresh` | `MOVE_PIECES{[P_E1], S_A, S_B}` в каждой фазе | принят в любой фазе (amendment: фазовые ограничения — Этап E); `legalActions` содержит MOVE во всех фазах |
| TC-GC-32 | AC-9 | unit | positive | | `createGame` дважды с одинаковыми `setup` и `ctx` | результаты глубоко равны (детерминизм, AM-1) |

### 2. API — integration (`apps/api`, отдельная SQLite-БД на тест-файл)

Параметра `viewer` нет (A-3/A-4): `POST /api/games` и `GET /api/games/:id` всегда отдают `PlayerView` для `setup.humanFaction`.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-API-01 | AC-1, AC-2 | integration | positive | app на тестовой БД | `GET /api/health` | 200 `{status:'ok'}` |
| TC-API-02 | AC-2, AC-9 | integration | positive | пустая БД | `POST /api/games` `{humanFaction:'empire', opponent:{kind:'ai',difficulty:'hard'}}` | 201 `{gameId, view}`; `view` — strict `PlayerViewSchema`, `version = 1`, `log[0].type = 'GAME_CREATED'`; `legalActions` непуст; в БД строка `Game` (`version = 1`) и 1 строка `GameEvent` (`seq = 1`) |
| TC-API-03 | AC-3, AC-9 | integration | positive | | `POST /api/games` `{humanFaction:'rebellion', opponent:{kind:'human'}}` | 201; `view` для rebellion: `rebelBase.systemId ≠ null`; `legalActions` только для rebellion |
| TC-API-04 | AC-9 | integration | negative | | `POST /api/games`: пустое тело; `humanFaction:'sith'`; `opponent.kind:'robot'`; `difficulty:'insane'`; лишний ключ; не-JSON | 400 err(`VALIDATION`, `errors.validation`), `details.issues` без текста парсера; число строк `Game` неизменно |
| TC-API-05 | AC-3 | integration | boundary | | `{opponent:{kind:'ai'}}` без difficulty; `{opponent:{kind:'human', difficulty:'easy'}}` | первый: 201, сохранённый `setup.opponent.difficulty = 'normal'`; второй: 400 `VALIDATION` (A-7) |
| TC-API-06 | AC-2 | integration | positive | пустая БД | `GET /api/games` | 200 `[]` |
| TC-API-07 | AC-2, AC-8 | integration | positive / boundary | G1, затем G2, затем команда в G1; отдельно — 21 партия | `GET /api/games` | элементы `GameSummary {gameId, setup, round, phase, updatedAt}`, по убыванию `updatedAt` → G1 первым; нет `state`/`pieces`/`rebelBase`; при 21 партии — ровно 20 (A-18) |
| TC-API-08 | AC-2 | integration | positive | G1 (H=empire) | `GET /api/games/G1` | 200 `PlayerView` для empire (strict-схема), `legalActions` только для empire |
| TC-API-09 | AC-9 | integration | negative | | `GET /api/games/unknown-id` | 404 err(`NOT_FOUND`, `errors.notFound`) — единый формат |
| TC-API-10 | AC-9, AC-12 | integration | negative (hidden info) | G1 (H=empire) | `GET /api/games/G1?viewer=rebellion` | параметр игнорируется: 200 view для empire, `rebelBase.systemId = null`, hidden `typeKey = 'unknown'` |
| TC-API-11 | AC-9, AC-12 | integration | positive (hidden info) | G1 (H=empire), в БД `rebelBase.systemId = S_X`, `revealed:false` | ответы `POST /api/games`, `GET /api/games/G1`, `POST .../commands` (MOVE и ADVANCE), `GET /api/games` | во всех: `rebelBase.systemId === null` (где есть view); сырое тело не содержит `S_X` в контексте базы и реальных `typeKey` hidden-объектов; нет ключа `state` |
| TC-API-12 | AC-9 | integration | positive | G2 создан с `humanFaction:'rebellion'` | `GET /api/games/G2` | `rebelBase.systemId` = реальная система |
| TC-API-13 | AC-9 | integration | positive (hidden info) | G1 (H=empire) с `P_RH` | `GET /api/games/G1` | `P_RH.typeKey = 'unknown'`, `id`/`systemId` присутствуют; реальный typeKey отсутствует в сыром теле |
| TC-API-14 | AC-7, AC-8 | integration | positive | G1, v=1 | `POST /api/games/G1/commands` `env(MOVE{[P_E1],S_A,S_B}, 1)` | 200 `{ok:true, view, events}`; `view.version = 2`; `P_E1` в `S_B`; `events = [PIECES_MOVED]`; в БД `Game.version = 2`, новая строка `GameEvent` `seq = 2` |
| TC-API-15 | AC-7, AC-9 | integration | negative | G1, v | MOVE в `S_C`, `expectedVersion = v` | 422 err(`ILLEGAL_COMMAND`, `errors.notAdjacent`); `GET`: версия v, `P_E1` в `S_A`; новых `GameEvent` нет |
| TC-API-16 | AC-9 | integration | negative | G1, v | валидная команда с `expectedVersion = v-1` и `v+1` | 409 err(`VERSION_CONFLICT`, `errors.versionConflict`), `details.currentVersion = v`; состояние и БД неизменны |
| TC-API-17 | AC-9 | integration | negative | G1 | тело: без `command`; `command.type:'FLY'`; `pieceIds:'x'`; `pieceIds: []`; `pieceIds:[P_E1,P_E1]`; `expectedVersion:'1'`; `actor:'jedi'`; лишний ключ; невалидный JSON | 400 err(`VALIDATION`); неизменно |
| TC-API-18 | AC-9 | integration | negative | | `POST /api/games/unknown/commands` с валидным и с невалидным телом | оба 404 err(`NOT_FOUND`) (404 первым, A-5) |
| TC-API-19 | AC-9 | integration | negative | G1 (H=empire) | MOVE `P_R1` (чужой); MOVE `'no-such-piece'`; MOVE from=to; `actor:'rebellion'` + `ADVANCE_PHASE` | 422 с `messageKey` соответственно `errors.notOwner`, `errors.unknownPiece`, `errors.sameSystem`, `errors.notYourSide`; неизменно |
| TC-API-20 | AC-9 | integration | boundary (concurrency) | G1, v | `Promise.all` двух допустимых `POST commands` с `expectedVersion = v` | ровно один 200, второй 409; итог v+1; ровно 1 новый `GameEvent` |
| TC-API-21 | AC-8, AC-9 | integration | positive (persistence) | `.tmp/test-<uuid>.db`; app#1 | app#1: create G1, MOVE, ADVANCE_PHASE → запомнить view; `stopApp(app#1)` без удаления файла; `startApp` app#2 на том же файле | app#2 `GET /api/games/G1` глубоко равен запомненному (version, pieces, phase, round, log); `GET /api/games` содержит G1 |
| TC-API-22 | AC-9 | integration | positive | G1 | `ADVANCE_PHASE` ×3; затем MOVE в фазе `command`/`refresh` | 200 каждый; цикл фаз и раунд как TC-GC-04; MOVE принят в любой фазе |
| TC-API-23 | AC-12 | integration | positive | | перечислить маршруты (`DiscoveryService` + `MetadataScanner`) | мутирующие маршруты ровно: `POST /api/games`, `POST /api/games/:id/commands`; нет PUT/PATCH/DELETE |
| TC-API-24 | AC-12 | integration | negative | G1 | `PUT`/`PATCH`/`DELETE /api/games/G1`; `GET /api/nope` | 404 err(`NOT_FOUND`) (единый формат); состояние неизменно |
| TC-API-25 | AC-9 | integration | boundary | G1 | ответы 400/404/409/422 (+ принудительный 500, если есть способ: напр. порча `state` в БД) | тело — только контрактный `error`; нет stack, сообщений Prisma, state; 500 → err(`INTERNAL`, `errors.internal`) (AM-2); Rev. 4 (review fix): `GET /api/games` при испорченной строке — **200**, строка пропускается в списке |
| TC-API-26 | AC-8, AC-9 | integration | positive (consistency) | G1 после MOVE + 2×ADVANCE | прочитать `Game.state.log` и строки `GameEvent` через Prisma | совпадают по `seq/type/actor/payload` (A-15); `@@unique([gameId, seq])` |

### 3. Web — component (`apps/web`, jsdom, подмена fetch)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-WEB-01 | AC-3 | component | negative / boundary | `GET /api/games` → `[]` | рендер `/` | `menu-continue` disabled; `menu-new-game`, `menu-settings` активны; `recent-games` не показан/пуст |
| TC-WEB-02 | AC-3 | component | positive | → 1 игра | клик `menu-continue` | навигация на `/games/<id>` |
| TC-WEB-03 | AC-3 | component | positive | → 7 игр (разные `updatedAt`) | рендер `/`; клик `menu-continue`; клик `recent-game-<id3>` | «Продолжить» → самая свежая (A-1); `recent-games` содержит ≤ 5 элементов по убыванию `updatedAt`; клик по элементу → `/games/<id3>`; без модалок |
| TC-WEB-04 | AC-3 | component | positive / boundary | | `/games/new`: `setup-opponent-human` | `setup-difficulty` скрыт/disabled; при `setup-opponent-ai` — доступен, по умолчанию `normal`; при human тело `POST` без `difficulty` |
| TC-WEB-05 | AC-3 | component | negative | `POST /api/games` → 400 / 500 / сетевая ошибка | `setup-start` | `setup-error` с локализованным текстом; остаёмся на `/games/new`; кнопка снова активна; было состояние загрузки |
| TC-WEB-06 | AC-6, AC-12 | component / unit | positive | view: `toSystemIds(P_E1) = [S_B]`, `adjacentSystemIds(S_A) = [S_B, S_D]` | выбрать `P_E1` (`moveTargetsForPiece`, `highlightedSystemIds`, `ActionsSection`) | только `action-move-P_E1-S_B`; подсветка только `S_B` (цели — из `legalActions`) |
| TC-WEB-07 | AC-6 | component | negative | `legalActions` без `P_R1` | выбрать `P_R1` | `piece-panel` с информацией; кнопок `action-move-P_R1-*` нет |
| TC-WEB-08 | AC-7 | component | negative | commands → 422 err(`ILLEGAL_COMMAND`, `errors.notAdjacent`) | `move(...)` | `feedback` и `live-region` с переводом `errors:notAdjacent`; объект в исходной системе |
| TC-WEB-09 | AC-7 | component | negative | commands → 409 | `move(...)` | сообщение «Состояние обновилось» (`errors.versionConflict`), refetch view; выбор сохранён, если объект существует (A-19) |
| TC-WEB-10 | AC-3 | component | positive | | `settings-language-en` | тексты меняются без перезагрузки; `<html lang="en">`; `localStorage['swr.settings.v1']` содержит `language:'en'` |
| TC-WEB-11 | AC-4 | component | positive | | рендер стола | `mock-badge` виден; кнопка `advance-phase` подписана как mock |
| TC-WEB-12 | AC-3 | component | positive (i18n) | | множества ключей ru и en по всем namespace; каждый `systems.<id>`, `regions.<id>`, `pieces.<typeKey>` сценария и каждый ключ `ERROR_MESSAGE_KEYS` имеет перевод | совпадают, пропусков нет (A-12, PA-2, PA-4) |
| TC-WEB-13 | AC-8 | component / unit | positive | | `logMessage` для `GAME_CREATED`, `PIECES_MOVED`, `PHASE_ADVANCED` и неизвестного типа | осмысленный текст; неизвестный → `board:log.unknown` |

### 4. E2E — Playwright (сценарии 1–8)

Общие предусловия: `pnpm e2e`; `webServer` поднимает api :3100 (`scripts/e2e-serve.mjs`, чистая `.tmp/e2e.db`) и web :5174
(`VITE_E2E=1`, proxy → 3100); `baseURL = http://localhost:5174`, viewport 1440×900, язык по умолчанию ru. Тесты создают свои партии
через `request.post('/api/games')`; кейсы с пустой БД — первыми в отдельном serial-блоке (сервер не переиспользуется,
`reuseExistingServer: false`). Ассерты состояния — через `board-list`, `__boardDebug`, `game-table[data-version]` и сетевые ответы.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-E2E-01 | AC-1, AC-2 | e2e | positive | серверы подняты | `request.get('http://localhost:5174/api/health')`; `page.goto('/')` | 200 `{status:'ok'}` через proxy; главная без ошибок консоли |
| TC-E2E-02 | AC-3, AC-10 (сц. 2) | e2e | negative / boundary | пустая e2e-БД | `/` | `menu-new-game`, `menu-continue`, `menu-settings` видны; `menu-continue` disabled; клик не меняет URL |
| TC-E2E-03 | AC-2, AC-3, AC-10 (сц. 1) | e2e | positive | | `menu-new-game` → `setup-faction-empire`, `setup-opponent-ai`, `setup-difficulty-hard` → `setup-start` | `POST /api/games` → 201; URL `/games/<gameId>` (из ответа); `game-table[data-game-id]` = gameId, `data-version = 1`; `GET /api/games` содержит игру с `humanFaction:'empire'`, `difficulty:'hard'` |
| TC-E2E-04 | AC-3 (сц. 1) | e2e | boundary | | `setup-opponent-human` | `setup-difficulty` недоступен; созданная игра `opponent = {kind:'human'}` |
| TC-E2E-05 | AC-3, AC-10 (сц. 1) | e2e | positive | | создать партию за Повстанцев | стол открыт; в ответе view `legalActions` только для rebellion, `rebelBase.systemId ≠ null` |
| TC-E2E-06 | AC-4, AC-10 (сц. 3) | e2e | positive | создана партия | `/games/:id`; `sidebar-tab-objects` | `board-list` содержит ≥ 8 `system-item-*`; объекты обеих сторон (`unit` и `token`) как `piece-item-*`; `getSystemScreenPos` не `null` для всех систем; `round-indicator` = 1, `phase-indicator[data-phase=assignment]`; `context-panel`, `event-log` (1 элемент `GAME_CREATED`) видны; `mock-badge` виден |
| TC-E2E-07 | AC-5, AC-10 (сц. 3) | e2e | positive | | `getViewport().scale` → s0; `zoom-in` | `scale > s0`, `board-canvas[data-scale]` и `zoom-level` обновлены; `zoom-out` ×2 → `scale < s0` |
| TC-E2E-08 | AC-5 | e2e | positive | | `page.mouse.wheel(0,-300)` над `board-canvas`; затем `(0,+300)` | масштаб растёт/падает; точка под курсором сохраняется ± допуск (zoomAt) |
| TC-E2E-09 | AC-5 | e2e | boundary | `reducedMotion` для детерминизма | `zoom-in` до упора; затем `zoom-out` до упора | `scale` = `getZoomLimits().max` / `.min`, не выходит за границы; `zoom-in` / `zoom-out` `disabled` на соответствующей границе (A-9) |
| TC-E2E-10 | AC-5 | e2e | positive | масштаб и сдвиг изменены | `zoom-fit` | все `getSystemScreenPos` внутри bounding box `board-canvas` с отступом |
| TC-E2E-11 | AC-5, AC-10 (сц. 3) | e2e | positive | выбрана система `S_A` | drag пустого фона на (+200,+100) | `viewport.x/y` сдвинулись ≈(+200,+100); выбор `S_A` сохранён (сдвиг ≥ 4 px — pan, A-10); `POST /commands` не было |
| TC-E2E-12 | AC-5 | e2e | negative | | drag, начатый на `P_E1`, отпущенный на пустом месте вне систем | viewport не изменился; объект вернулся в исходный слот; `POST /commands` не было; `live-region` — «Перемещение отменено» |
| TC-E2E-13 | AC-6, AC-10 (сц. 4) | e2e | positive | | клик по `getSystemScreenPos(S_A)` | `getSelection() = {kind:'system', id:S_A}`; `system-item-S_A[aria-selected=true]`; `context-panel[data-state]` = system; `system-panel`: название (перевод `systems.S_A`), регион, объекты, соседи — как во view |
| TC-E2E-14 | AC-6, AC-10 (сц. 4) | e2e | positive | | клик по `getPieceScreenPos(P_E1)` | `getSelection() = {kind:'piece', id:P_E1}`; `piece-panel` + `action-panel` с `action-move-P_E1-<X>` ровно для `X ∈ toSystemIds`; `getHighlightedSystemIds()` = те же `X` |
| TC-E2E-15 | AC-6 | e2e | negative | | клик по `P_R1`, затем по `P_RH` | инфо показано, `action-move-*` нет; для `P_RH` тип «неизвестно» |
| TC-E2E-16 | AC-6 | e2e | positive | выбран объект | клик по пустому фону (< 4 px); отдельно `Esc` | выбор снят, `context-panel[data-state]` = empty (A-10) |
| TC-E2E-17 | AC-7, AC-8, AC-10 (сц. 5) | e2e | positive | выбран `P_E1` в `S_A` | клик `action-move-P_E1-S_B` (1 клик) | `POST /commands` 200; `piece-item-P_E1[data-system-id=S_B]`; новый `event-log-item` (`PIECES_MOVED`); `feedback` и `live-region` с успехом; `data-version` +1 |
| TC-E2E-18 | AC-7, AC-10 (сц. 5) | e2e | positive | `P_E1` в `S_A` | `mouse.down` в `getPieceScreenPos(P_E1)` → `move` (steps ≥ 5) к `getSystemScreenPos(S_B)` → во время drag `isDragging()=true`, `S_B ∈ getHighlightedSystemIds()` → `mouse.up` | 200; `P_E1` в `S_B`; событие в журнале; обратная связь |
| TC-E2E-18b | AC-7 | e2e | positive | выбран `P_E1` | клик по подсвеченной системе `S_B` на карте | перемещение (1 клик по цели на карте) |
| TC-E2E-19 | AC-7, AC-10 (сц. 5) | e2e | negative | `S_C` не сосед `S_A` | drag `P_E1` на `S_C` | **запрос не отправляется** (A-16: нет `POST /commands`); сообщение `board:move.illegalTarget` в `feedback`/`live-region`; `getPieceScreenPos(P_E1)` = исходной ± допуск; после reload — `S_A`, `data-version` прежняя |
| TC-E2E-20 | AC-7 | e2e | negative | | `request.post('/api/games/<id>/commands')` MOVE в `S_C` | 422 err(`ILLEGAL_COMMAND`, `errors.notAdjacent`); после reload UI без изменений |
| TC-E2E-21 | AC-7 | e2e | negative | | drag `P_R1` (чужой) | объект не перетаскивается — жест панорамирует карту (UX D-I-2); запросов нет; положение объекта **относительно его системы** неизменно, `data-system-id` прежний |
| TC-E2E-22 | AC-8, AC-10 (сц. 6) | e2e | positive | после TC-E2E-17 (версия v+1) | `page.reload()` | `P_E1` в `S_B`; событие в журнале; `data-version = v+1`; раунд/фаза те же |
| TC-E2E-23 | AC-8, AC-10 (сц. 2, 6) | e2e | positive | перемещение выполнено в партии G (самая свежая) | новый `browser.newContext()` → `/` → `menu-continue` | открыта G (A-1) с тем же состоянием |
| TC-E2E-23b | AC-3 (сц. 2) | e2e | positive | ≥ 2 партии | `/` → `recent-game-<старшая>` | открыта выбранная партия; список ≤ 5 по убыванию `updatedAt` |
| TC-E2E-24 | AC-4, AC-7, AC-10 (сц. 7) | e2e | positive | assignment, round 1 | проверить mock-метку; `advance-phase` ×3; затем `action-move` в фазе `command` (после 1 нажатия в отдельном прогоне) | метка видна; `phase-indicator[data-phase]`: command → refresh → assignment, round 1 → 2; 3 события `PHASE_ADVANCED`; MOVE доступен в любой фазе; reload — те же значения |
| TC-E2E-25 | AC-3, AC-10 (сц. 8) | e2e | positive | | `/settings` → `settings-language-en` | UI на английском (меню, панели стола, названия систем); `<html lang="en">`; reload → сохранено (`swr.settings.v1`); `settings-language-ru` → русский |
| TC-E2E-26 | AC-3 | e2e | positive (i18n) | язык en | пройти `/`, `/games/new`, `/games/:id`, `/settings`; `innerText` | нет кириллицы (`/[А-Яа-яЁё]/`) — названия систем тоже переведены (A-12) |
| TC-E2E-27 | AC-10 (сц. 8) | e2e | positive | | `settings-reduce-motion` вкл | `document.documentElement.dataset.reducedMotion === "true"` (A-13); сохранено после reload; `zoom-in` применяется мгновенно (scale = целевому сразу после клика) |
| TC-E2E-28 | AC-6, AC-7 | e2e | positive (a11y, keyboard) | стол открыт, мышь не используется | `Tab` → `sidebar-tab-objects` → `Enter`; `Tab` в `board-list` (listbox) → стрелками до `piece-item-P_E1` → `Enter`; `Tab` до `system-item-S_B-move` (основной клавиатурный путь под списком, README) → `Enter` | 200; `P_E1` в `S_B`; на каждом шаге есть элемент `:focus-visible`; `option[aria-selected=true]` у выбранного; результат в `live-region`; фокус после успеха — на заголовке контекстной панели |
| TC-E2E-29 | AC-5 | e2e | positive (a11y) | | проверить `zoom-in/out/fit`, `board-canvas` | у всех `aria-label`; кнопки достижимы `Tab`; на контейнере canvas клавиши `+`/`−`/`0`/стрелки меняют viewport |
| TC-E2E-30 | AC-12 | e2e | positive (hidden info) | партия за Империю | записать все ответы `/api/**` за сценарии 1–7 | ни в одном `rebelBase.systemId ≠ null`; нет ключа `state`; реальных `typeKey` hidden-объектов нет |
| TC-E2E-31 | AC-12 | e2e | positive | | записать все запросы web → api за сценарии 1–8 | мутирующие только `POST /api/games` и `POST /api/games/:id/commands`; ни в одном запросе нет `viewer=` |
| TC-E2E-32 | AC-2 | e2e | negative | | `page.goto('/games/does-not-exist')` | `game-not-found` + путь в меню; без бесконечной загрузки |
| TC-E2E-33 | AC-11 | e2e | positive | проект `@screenshots` | сохранить скриншоты по списку AC-11 | файлы существуют, ненулевые |
| TC-E2E-34 | AC-7 | e2e | negative (409) | партия открыта в двух вкладках | вкладка 1: перемещение; вкладка 2 (устаревшая): перемещение другого объекта | вкладка 2: «Состояние обновилось», view перезапрошен, `data-version` = актуальная, выбор сохранён (A-19) |

### 5. Manual browser (встроенный браузер агента, skill `browser-qa`)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-MAN-01 | AC-1 | manual | positive | чистый клон, `pnpm install` | по `README.md` дословно: `pnpm dev` | одной командой поднимаются api (:3000) и web (:5173); БД создана миграцией; `/` открывается; лог в `artifacts/logs/` |
| TC-MAN-02 | AC-1 | manual | negative | dev-БД удалена | `pnpm dev` | БД пересоздаётся автоматически |
| TC-MAN-03 | AC-10 | manual | positive | | сценарии 1–8 мышью со скриншотами | как TC-E2E-03..27; перемещение = выбор + 1 клик, нет модалок, понятная обратная связь |
| TC-MAN-04 | AC-10 | manual | negative | | недопустимый drag, двойной клик по `action-move`, drag во время запроса | не более 1 принятой команды на действие; при 409 — внятное сообщение |
| TC-MAN-05 | AC-10 | manual | positive (a11y) | | только клавиатура по всем экранам | видимый фокус, нет ловушек фокуса |
| TC-MAN-06 | AC-4 | manual | positive | | осмотр графики | только собственные плейсхолдеры; названия вымышленные |
| TC-MAN-07 | AC-10 | manual | boundary | | окно 1024×768 и 1920×1080 | стол и панели помещаются, «вписать» корректен |
| TC-MAN-08 | AC-1, AC-9 | manual | positive | `pnpm dev` запущен | параллельно `pnpm e2e` | e2e проходит (порты 3100/5174), dev-БД не изменена (A-17) |

### 6. Architecture checks (AC-12) и quality gates (AC-9)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-ARCH-01 | AC-12 | arch | negative | | ESLint `no-restricted-imports` в `apps/web` на `@swr/game-core`; фикстурный файл с запрещённым импортом | `pnpm lint` падает на фикстуре; на коде 0 нарушений; `grep -rn "game-core" apps/web/src apps/web/package.json` пусто |
| TC-ARCH-02 | AC-12 | arch | negative | | `packages/game-core`: запрет `react`, `@nestjs/*`, `@prisma/*`, `openai`, `@swr/api`, `@swr/web`; deps — только `@swr/contracts` (+ dev `@swr/game-data`) | 0 нарушений; grep пуст |
| TC-ARCH-03 | AC-12 | arch / unit | positive | | рекурсивный обход `GameStateSchema` + `JSON.stringify(createGame(...))` | нет ключей `x`, `y`, `position`, `coords`; `mapLayout` экспортируется из `@swr/game-data/layout`, не импортируется `game-core` |
| TC-ARCH-04 | AC-12 | arch / unit | positive | | id систем сценария vs ключи `mapLayout` | множества совпадают |
| TC-ARCH-05 | AC-12 | arch | positive | | TC-WEB-06 + grep `apps/web/src` на `adjacentSystemIds` | используется только для отрисовки линий соседства; цели — только `legal.ts` из `legalActions`; нет «isLegal/canMove» по соседству |
| TC-ARCH-06 | AC-12 | arch / integration | positive | | TC-API-23 + TC-E2E-31 + grep `@Put\|@Patch\|@Delete` в `apps/api/src` | мутации только через `POST /commands` (и создание); запись `state` только в `GamesRepository.insertGame` / `.commitCommand` |
| TC-ARCH-07 | AC-12 | arch | positive | | контроллеры возвращают только `toPlayerView(...)`, ответы проходят `PlayerViewSchema.parse`/`CommandResultSchema.parse` | `Game.state` наружу не уходит (подтверждает TC-API-11) |
| TC-ARCH-08 | AC-12 | arch | positive | | `pnpm build`; `grep -r "__boardDebug" apps/web/dist` | пусто |
| TC-ARCH-09 | AC-12 | arch | positive | | `grep -rniE "openai" apps packages --include=*.ts --include=*.tsx --include=package.json` | пусто |
| TC-ARCH-10 | AC-12 | arch | positive | | `packages/game-core/src/mock-rules.ts` содержит логику MOVE/ADVANCE | правила не размазаны (ревью + grep) |
| TC-ARCH-11 | AC-12 | arch | positive | | grep логирования в `apps/api/src` | в логи пишутся только `gameId`, `code`, `status` — не state/view/payload |
| TC-GATE-01 | AC-9 | gate | positive | `pnpm install` | `pnpm lint` | exit 0, `artifacts/logs/lint.log` |
| TC-GATE-02 | AC-9 | gate | positive | | `pnpm typecheck` | exit 0, `typecheck.log` |
| TC-GATE-03 | AC-9 | gate | positive | | `pnpm test` | exit 0; наборы game-core, api (`*.int.test.ts`), web; `unit.log` |
| TC-GATE-04 | AC-9 | gate | positive | | `pnpm build` | exit 0, `build.log` |
| TC-GATE-05 | AC-9, AC-10 | gate | positive | chromium установлен | `pnpm e2e` | exit 0; отчёт/trace; `e2e.log`; dev-БД не изменена |
| TC-GATE-06 | AC-9 | gate | positive | | `pnpm verify` | exit 0 |
| TC-GATE-07 | AC-11 | gate | positive | | `node scripts/check-task.mjs docs/tasks/SWR-002` | exit 0 |
| TC-DOC-01 | AC-11, AC-1 | manual | positive | | `README.md` (`pnpm dev`, `pnpm e2e`, `playwright install chromium`, ключ `swr.settings.v1`), `delivery-report.md` (ограничения — вкл. hot-seat A-2; предложения — вкл. Node 22), документы архитектуры и UX | разделы существуют и непусты |

### AC-11 — обязательный список скриншотов

Путь: `docs/tasks/SWR-002/artifacts/screenshots/`; проект Playwright `@screenshots` (1440×900, `reducedMotion: 'reduce'`) + ручной прогон.

| Файл | Экран / состояние | Источник |
|---|---|---|
| `01-main-menu-empty.png` | `/`, нет партий, «Продолжить» disabled | TC-E2E-02 |
| `02-main-menu-with-games.png` | `/`, есть партии, «Недавние партии» | TC-E2E-23b |
| `03-new-game.png` | `/games/new`, AI + сложность | TC-E2E-03 |
| `04-board-initial.png` | стол: карта, раунд/фаза, mock-метки | TC-E2E-06 |
| `05-board-zoomed-panned.png` | после zoom/pan | TC-E2E-07..11 |
| `06-system-panel.png` | выбранная система + панель системы | TC-E2E-13 |
| `07-piece-actions.png` | выбранный объект, панель действий, подсвеченные цели | TC-E2E-14 |
| `08-move-drag-preview.png` | drag в процессе, подсветка цели | TC-E2E-18 |
| `09-illegal-move-feedback.png` | отказ с причиной | TC-E2E-19 |
| `10-event-log-after-move.png` | журнал с `PIECES_MOVED` | TC-E2E-17 |
| `11-after-reload.png` | состояние после reload | TC-E2E-22 |
| `12-phase-advanced.png` | после «Завершить фазу (mock)» ×3 (раунд 2) | TC-E2E-24 |
| `13-settings-ru.png`, `14-settings-en.png` | настройки; стол/меню на en | TC-E2E-25 |
| `15-keyboard-focus.png` | видимый фокус в `board-list`/панели | TC-E2E-28 |

## Coverage
| AC | Test cases |
|---|---|
| AC-1 | TC-API-01, TC-E2E-01, TC-MAN-01, TC-MAN-02, TC-MAN-08, TC-DOC-01 |
| AC-2 | TC-API-01, TC-API-02, TC-API-06..08, TC-E2E-01, TC-E2E-03, TC-E2E-32 |
| AC-3 | TC-API-03, TC-API-05, TC-WEB-01..05, TC-WEB-10, TC-WEB-12, TC-E2E-02..05, TC-E2E-23b, TC-E2E-25, TC-E2E-26 |
| AC-4 | TC-GC-01, TC-WEB-11, TC-E2E-06, TC-E2E-24, TC-MAN-06 |
| AC-5 | TC-E2E-07..12, TC-E2E-29 |
| AC-6 | TC-GC-25, TC-WEB-06, TC-WEB-07, TC-E2E-13..16, TC-E2E-28 |
| AC-7 | TC-GC-02, TC-GC-03, TC-GC-07..09, TC-GC-31, TC-API-14, TC-API-15, TC-WEB-08, TC-WEB-09, TC-E2E-17..21, TC-E2E-18b, TC-E2E-24, TC-E2E-28, TC-E2E-34 |
| AC-8 | TC-API-07, TC-API-14, TC-API-21, TC-API-26, TC-WEB-13, TC-E2E-17, TC-E2E-22, TC-E2E-23 |
| AC-9 | TC-GC-01..32, TC-API-02..26, TC-GATE-01..06, TC-MAN-08 |
| AC-10 | TC-E2E-02..34 (сценарии 1–8), TC-MAN-03..05, TC-MAN-07, TC-GATE-05 |
| AC-11 | TC-E2E-33, список скриншотов, TC-GATE-07, TC-DOC-01 |
| AC-12 | TC-GC-19, TC-GC-28..30, TC-API-10, TC-API-11, TC-API-23, TC-API-24, TC-WEB-06, TC-E2E-30, TC-E2E-31, TC-ARCH-01..11 |

Сценарии → E2E: сц.1 — TC-E2E-03..05; сц.2 — TC-E2E-02, 23, 23b; сц.3 — TC-E2E-06..12; сц.4 — TC-E2E-13..16;
сц.5 — TC-E2E-17..21, 18b, 28, 34; сц.6 — TC-E2E-22, 23; сц.7 — TC-E2E-24; сц.8 — TC-E2E-25..27.

Негативные/граничные есть для каждого AC, кроме AC-11 (артефактный критерий).

## Testability requirements for implementers

Обязательны для FE/BE Lead и workers; без них соответствующие кейсы будут `blocked`. Статус согласования с планами — в скобках.

**game-core / game-data / contracts**
- R-1. Детерминизм через `ctx` `{gameId, now}` / `{now}` (AM-1, принято).
- R-2. Чистые функции, вход не мутируется; отказ — результат `{ok:false,error}`, не исключение (AM-4, принято).
- R-3. `@swr/game-data` и `@swr/game-data/layout` — разные entry points. Сценарий содержит: ≥ 8 систем; пару несоседних систем;
  ≥ 2 объекта Империи в одной системе **и** ≥ 2 объекта Повстанцев в одной системе (TC-GC-03 для обеих сторон); ≥ 1 `hidden` объект
  Повстанцев; базу с `revealed:false`; `unit` и `token` обеих сторон.
- R-4. Zod-схемы (`GameStateSchema`, `PlayerViewSchema`, `CommandEnvelopeSchema`, `CommandResultSchema`, `GameSetupSchema`,
  `ScenarioSchema`, `GameSummarySchema`, `ERROR_MESSAGE_KEYS`) экспортируются из `@swr/contracts` (принято: AM-5, PA-2, PA-3).

**API** (`plan-backend.md` §6.6 — согласовано)
- R-5. `createApp({ databaseUrl, clock?, idGenerator? })`; `startApp`/`stopApp`; для TC-API-21 нужен вариант `stopApp` **без** удаления файла.
- R-6. `DATABASE_URL` из env; `.tmp/template.db` + копия на тест-файл; dev-БД не трогается.
- R-7. Никаких test-only мутирующих эндпоинтов; e2e-сброс — удалением `e2e.db` в `e2e-serve.mjs`.
- R-8. Единый формат ошибок для всех эндпоинтов, включая 404 неизвестного маршрута и невалидный JSON (принято).

**Web** (`plan-frontend.md` §6 — согласовано, кроме отмеченного)
- R-9. `board-list` — `role="listbox"`, элементы `role="option"` с `aria-selected` (amendment). `system-item-<id>`,
  `piece-item-<id>` (`data-system-id`), `data-highlighted="true"` у допустимых целей, `system-item-<id>-move`.
  ⚠ `plan-frontend.md` §6.2 всё ещё описывает `<ul>/<button>` + `aria-current` — FE lead должен обновить под amendment
  (QA проверяет `role=option` + `aria-selected`, `aria-current` не используется).
- R-10. testid — по `plan-frontend.md` §6.1 (menu-*, recent-games/recent-game-<id>, setup-* с `setup-difficulty-<d>`, `setup-error`,
  `game-table[data-game-id][data-version]`, round/phase-indicator, `advance-phase`, `advance-phase-panel`, `mock-badge`, `save-status`,
  `board-canvas[data-scale]`, zoom-in/out/fit/level, `context-panel[data-state]`, system/piece/action-panel,
  `action-move-<pieceId>-<to>`, `action-move-all-<from>-<to>`, `event-log`/`event-log-item[data-seq]`, `sidebar-tab-log|objects|game`,
  `board-list`, `game-not-found`, `feedback`, `live-region`, `settings-language-ru|en`, `settings-reduce-motion`).
  Значения `context-panel[data-state]` нужно зафиксировать (ожидаю `empty|system|piece`).
- R-11. `window.__boardDebug` при `DEV || VITE_E2E==='1'`, вырезается из production-сборки: `getViewport`, `getZoomLimits`,
  `getSystemScreenPos`, `getPieceScreenPos` (page-координаты), `getSelection`, `getHighlightedSystemIds`, `isDragging` (согласовано).
- R-12. Одна `role="status" aria-live="polite"` (`live-region`); ошибки — `translateError` по `messageKey`.
- R-13. Настройки — `localStorage['swr.settings.v1']`; `<html lang>` и `documentElement.dataset.reducedMotion` синхронизированы.
- R-14. Названия систем/регионов/типов — ключи `systems.<id>`/`regions.<id>`/`pieces.<typeKey>` с ru и en (PA-4).
- R-15. ESLint `no-restricted-imports`: web→game-core, game-core→react/nest/prisma/openai.

**Playwright** (`plan-backend.md` §7 — согласовано)
- R-16. `webServer`: api `:3100` (`e2e:serve`, чистая `e2e.db`), web `:5174` (`VITE_E2E=1`, `API_PROXY_TARGET=http://localhost:3100`),
  `reuseExistingServer: false`; `baseURL` 5174.
- R-17. Тесты независимы (своя партия через `request.post`), кроме serial-блока «пустая БД», который идёт первым.
- R-18. `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`; проект `@screenshots` пишет в `artifacts/screenshots/`.
- R-19. viewport 1440×900; язык по умолчанию ru не зависит от локали браузера.
- R-20. README: `pnpm dev`, `pnpm e2e`, `pnpm verify`, `pnpm exec playwright install chromium`.

## Ambiguities in the specification

Все A-1..A-19 из Rev. 1 **закрыты** решениями Analyst (`specification.md` → «Clarifications», «Contract amendments approved»).

| # | Статус | Решение (кратко) | Затронутые TC |
|---|---|---|---|
| A-1 | closed | «Продолжить» → последняя партия; под меню «Недавние партии» (≤ 5) | TC-WEB-03, TC-E2E-23, 23b |
| A-2 | closed | команды только от `actor === humanFaction`, иначе 422 `errors.notYourSide`; hot-seat — следующий этап | TC-GC-17, TC-API-19 |
| A-3 | closed | **[contract]** `viewer` убран; view всегда для `humanFaction` | TC-API-03, 08, 10, 11, 12, 21, TC-E2E-31 |
| A-4 | closed | см. A-3; `?viewer=` игнорируется | TC-API-10 |
| A-5 | closed | порядок 404 → 400 → 409 → 422; пустые/дубли `pieceIds` — 400; неизвестный объект/система — 422 | TC-GC-10, 11, 14, 16, TC-API-17..19 |
| A-6 | closed | дубликаты → 400; много объектов — всё или ничего | TC-GC-12, 15 |
| A-7 | closed | AI без `difficulty` → `normal`; human с `difficulty` → 400 | TC-API-05, TC-WEB-04 |
| A-8 | closed | `version = 1`, `round = 1`, `assignment`, `log` = `GAME_CREATED` `seq = 1` | TC-GC-01, TC-API-02 |
| A-9 | closed | `MIN_SCALE`/`MAX_SCALE` в FE, кнопки disabled на границах, «вписать» — все системы с отступом, границы в хуке | TC-E2E-09, 10 |
| A-10 | closed | < 4 px по пустому — снять выбор; ≥ 4 px — pan с сохранением выбора | TC-E2E-11, 16 |
| A-11 | closed | для Империи скрыты `rebelBase.systemId` и `typeKey` скрытых объектов везде; `id`/`systemId` видны | TC-GC-19, 22, 28, TC-API-13 |
| A-12 | closed | названия — i18n-ключи с ru и en | TC-WEB-12, TC-E2E-26 |
| A-13 | closed | `documentElement.dataset.reducedMotion = "true"`, отключает tween/пульсацию | TC-E2E-27 |
| A-14 | closed | см. A-6 | TC-GC-12 |
| A-15 | closed | источник истины — снимок `GameState`; `GameEvent` — зеркало в той же транзакции, тест на совпадение | TC-API-26 |
| A-16 | closed | UI не шлёт команду при drop на недопустимую цель; 422 проверяется на API | TC-E2E-19, 20 |
| A-17 | closed | e2e: api 3100, web 5174, своя БД | раздел 4, TC-MAN-08 |
| A-18 | closed | `GET /api/games` без пагинации, максимум 20 | TC-API-07 |
| A-19 | closed | 409: «Состояние обновилось» + refetch, выбор сохраняется | TC-WEB-09, TC-E2E-34 |

**Новые открытые вопросы (не блокируют, для лидов):**
- Q-1. `plan-frontend.md` §6.2 (`<ul>/<button>`, `aria-current`) расходится с amendment (listbox/option + `aria-selected`) — FE lead обновить план.
- Q-2. **closed** — `@swr/contracts` `PlayerViewSchema` (doc): скрытие `typeKey` симметрично для обеих сторон (TC-GC-24 — ожидается `'unknown'`).
- Q-3. Значения `context-panel[data-state]` и `save-status[data-status]` — зафиксировать перечисление в `plan-frontend.md`.
- Q-4. Есть ли способ вызвать 500 в интеграционном тесте без test-only кода (TC-API-25) — например, порча `Game.state` в БД через Prisma; иначе часть кейса `not_run`.

## E2E specs (Rev. 3, 2026-11-08) — написаны, **не запускались**

Спеки написаны после W0 против testid/`__boardDebug` из `plan-frontend.md` §6; приложение ещё в реализации, поэтому
статус всех TC-E2E — `not_run` до QA_EXECUTION. Проверено только: `tsc -p e2e/tsconfig.json --noEmit` → exit 0
(`artifacts/logs/qa-e2e-typecheck.log`), `eslint e2e` + `prettier --check e2e` → exit 0 (`artifacts/logs/qa-e2e-lint.log`).

| Spec | TC |
|---|---|
| `e2e/smoke.spec.ts` (W0) | TC-E2E-01 |
| `e2e/00-empty-db.spec.ts` | TC-E2E-02, скриншот `01-main-menu-empty` |
| `e2e/new-game.spec.ts` | TC-E2E-03, 04, 05 |
| `e2e/board-view.spec.ts` | TC-E2E-06, 32 |
| `e2e/zoom-pan.spec.ts` | TC-E2E-07, 08, 09, 10, 11, 12, 29 |
| `e2e/selection.spec.ts` | TC-E2E-13, 14, 15, 16 |
| `e2e/move.spec.ts` | TC-E2E-17, 18, 18b, 19, 20, 21, 34 |
| `e2e/persistence.spec.ts` | TC-E2E-22, 23, 23b |
| `e2e/phase.spec.ts` | TC-E2E-24 (цикл фаз; перемещение в фазе `command`) |
| `e2e/settings.spec.ts` | TC-E2E-25, 26, 27 |
| `e2e/keyboard.spec.ts` | TC-E2E-28 |
| `e2e/architecture.spec.ts` | TC-E2E-30, 31 |
| `e2e/screenshots.spec.ts` | TC-E2E-33 (скриншоты 02–15 + `14b-board-en`) |
| `e2e/support/{api,board,testids}.ts` | хелперы: фикстуры из view (`pickMove`), `__boardDebug`, жесты, клавиатурный обход, запись сети, скриншоты |

Требования к запуску (R-21, к `playwright.config.ts`, владелец — backend-lead): `workers: 1` — файлы идут по алфавиту,
`00-empty-db` первым на пустой БД; «Продолжить → последняя партия» (TC-E2E-23) зависит от глобального порядка `updatedAt`.

Принятые в спеках допущения (проверить при интеграции FE): `context-panel[data-state]` ∈ `empty|system|piece` (Q-3,
константа `CONTEXT_STATE`); вкладки `sidebar-tab-*` имеют `aria-selected`; `board-list`/`piece-item-*` есть в DOM при неактивной
вкладке (рендерится всегда, §6.2); `Esc` и клик по фону снимают выбор → `getSelection() = {kind:null,id:null}`;
клавиши на `board-canvas`: `+`, `-`, стрелки; после успешного хода фокус внутри `context-panel` (D-C-6).
