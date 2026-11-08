# Test cases — SWR-004

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-08).
Это **дизайн**: тесты ещё не написаны и не запускались; ничто здесь не является доказательством `passed`.
Источники: `specification.md` (AC-01..AC-15, Contract), `request.md` (PO TC-001..TC-006, Visual & Accessibility);
база регрессии — SWR-003 (`e2e/*.spec.ts`, `e2e/support/*`, `apps/api/test/*.int.test.ts`, web `*.test.tsx`,
`packages/games/rebellion/test/**`). Открытые вопросы — в разделе «Ambiguities» (Q-n); где ожидание зависит от ответа,
в кейсе стоит ссылка на Q-n. QA **не решает** эти вопросы — их закрывают Analyst / лиды.

## Preconditions (общие)

- Базовая линия SWR-003 (зелёная): api 94, web 173, rebellion 115, platform 32, e2e 50. Регрессия сохранена, если наборы
  не теряют кейсов, кроме явно заменённых в §8 с указанием замены.
- Первый шаг реализации — механическое переименование `'rebellion'` → `'rebels'` (spec → Risks) с зелёными гейтами,
  до параллельной работы. Кейсы §8 проверяются **после** этого шага и повторно в QA_EXECUTION.
- e2e: `pnpm e2e`, api :3100 (чистая `apps/api/.tmp/e2e.db`, `e2e-serve.mjs`), web :5174 (`VITE_E2E=1`), `workers: 1`,
  файлы по алфавиту, `00-empty-db.spec.ts` первым на пустой БД, `locale: 'en-US'` по умолчанию (см. Q-18).
- integration: Vitest + supertest, реальный Nest (`createApp`), отдельная копия шаблонной SQLite на тест
  (`apps/api/test/support/test-app.ts`: `createTestDb/startApp/stopApp`).
- component: Vitest + Testing Library (jsdom), подмена `globalThis.fetch`, `createMemoryRouter` с маршрутами приложения.
- unit: Vitest в `packages/games/rebellion/test/**`, `packages/platform/test/**`, без React/Nest.

## Conventions

**Уровни (Level):** `unit`, `component` (web, jsdom), `integration` (API, Nest + SQLite), `e2e` (Playwright),
`visual-a11y` (Playwright-скриншоты + проверки фокуса/контраста/ролей), `manual` (встроенный браузер, skill `browser-qa`,
скриншот как доказательство), `arch` (ESLint/grep/check:bundle), `gate` (корневая команда).

**Обозначения:** `R` = `'star-wars-rebellion'`; `REB` = `'rebels'`, `EMP` = `'empire'`;
`err(CODE, key)` = `{ ok:false, error:{ code, messageKey, details? } }` (единый формат);
`IN(p, t, d?, r, m)` = setup-вход `{ playerFaction:p, opponentType:t, aiDifficulty?:d, ruleset:r, gameMode:m }`;
`DEF` = `IN(REB,'ai',—,'base','digital')`; `POST(body, key?)` = `POST /api/sessions` с заголовком `Idempotency-Key: key`.
`K1`, `K2` — разные валидные UUID v4.
**Запрещённые поля публичных ответов (FORBIDDEN):** полный `state`, `rebelBase.systemId` для Империи,
реальные `typeKey` скрытых фигур противника, `idempotencyKey`, `schemaVersion` внутреннего снимка, SQL/Prisma/stack.
**Handoff-view:** ответ, в котором `view.kind === 'handoff'`; разрешённые ключи view — только
`kind, activeSide, round, phase, sessionStatus` (+ `version`, если Q-12 решён так).

## Test cases

### 1. Unit — Rebellion game-core (AC-03, AC-04, AC-05, AC-12, AC-14, AC-15)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-U-01 | AC-03, AC-12 | unit | positive | — | `opponentOf('rebels')`, `opponentOf('empire')` | `'empire'`, `'rebels'`; `opponentOf(opponentOf(f)) === f` для обеих; модуль без импорта React (см. TC-A-01) |
| TC-U-02 | AC-03 | unit | negative | — | `FactionSchema.safeParse` для `'rebellion'`, `'sith'`, `''`, `null`, `'Rebels'` | все `success:false`; `'rebels'`, `'empire'` — `success:true` |
| TC-U-03 | AC-02 | unit | positive | — | экспортированные defaults формы / `DEFAULT_SETUP` (если вынесены, TR-12) | ровно `{ playerFaction:'rebels', opponentType:'ai', aiDifficulty:'normal', ruleset:'base', gameMode:'digital' }`; объект заморожен или возвращается копией (мутация одного открытия не влияет на следующее) |
| TC-U-04 | AC-05 | unit | positive | — | `RebellionSetupInput.parse(IN(p,'ai',d,'base','digital'))` для p∈{REB,EMP}, d∈{easy,normal,hard} | 6 успешных разборов; `parseSetup` → `RebellionSettings` с `opponentFaction = opponentOf(p)`, `aiDifficulty = d` |
| TC-U-05 | AC-05 | unit | boundary | — | `IN(REB,'ai',—,'base','digital')` (без `aiDifficulty`) | `aiDifficulty = 'normal'` в settings |
| TC-U-06 | AC-04 | unit | positive | — | `IN(EMP,'human',—,…)` и `IN(EMP,'human',null,…)` | оба успешны; settings `aiDifficulty: null`, `opponentType:'human'`, `opponentFaction:'rebels'` |
| TC-U-07 | AC-04, AC-05 | unit | negative | — | `IN(EMP,'human','easy',…)`; `IN(EMP,'human','normal',…)` | ошибка валидации с путём `aiDifficulty` (→ 400 на сервере) |
| TC-U-08 | AC-05 | unit | negative | — | `IN(REB,'ai',null,…)` | по Q-6: либо ошибка с путём `aiDifficulty`, либо `'normal'`; кейс фиксирует решённое поведение |
| TC-U-09 | AC-05 | unit | negative | — | неизвестные значения: `playerFaction:'rebellion'`, `opponentType:'robot'`, `aiDifficulty:'insane'`, `ruleset:'expansion'`, `gameMode:'vr'` | ошибка валидации; путь указывает на поле (для `'rebellion'` — тоже ошибка: старое имя во входе не принимается, только в апкастере) |
| TC-U-10 | AC-05 | unit | negative | — | лишние поля: `+aiFaction:'empire'`, `+opponentFaction:'empire'`, `+opponentFaction:'rebels'` (совпадает с вычисляемым), `+humanFaction`, `+opponent` | strict-ошибка `unrecognized_keys` для каждого (даже когда значение «правильное») |
| TC-U-11 | AC-05 | unit | negative | — | отсутствуют поля: без `playerFaction`, без `opponentType`, без `ruleset`, без `gameMode` | ошибка с путём поля (Q-7: если `ruleset`/`gameMode` должны иметь default — кейс меняется) |
| TC-U-12 | AC-05 | unit | negative | — | семантическая проверка поддерживаемости: `ruleset:'rise-of-the-empire'`; `gameMode:'physical_companion'`; оба сразу | схема их **принимает** (значения легальны по типу); проверка поддерживаемости возвращает `SETUP_UNSUPPORTED` с ключом `rebellion.errors:rulesetUnavailable` / `modeUnavailable`; для обоих — порядок/набор ключей по Q-8 |
| TC-U-13 | AC-12 | unit | positive | — | `publicSettings(settings)` для AI и human | ровно ключи `playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode`; нет `aiFaction` |
| TC-U-14 | AC-09, AC-13 | unit | positive | — | `summarize(state)` | ключи `playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase`; значения плоские; `aiDifficulty` = null для human — совместимость с типом `details` (Q-20) |
| TC-U-15 | AC-13 | unit | positive | — | начальный статус модуля Rebellion (`initialStatus`/аналог) на mock-сценарии | `'prototype'` |
| TC-U-16 | AC-14 | unit | positive | AI-партия | `createInitialState(DEF)` → `END_TURN`, `ACCEPT_HANDOFF` | `activeSide = playerFaction`, `handoffPending = false`; обе команды отклонены (`ILLEGAL_COMMAND`, ключ по Q-10), state не изменён |
| TC-U-17 | AC-14 | unit | positive | human, `playerFaction=REB` | `createInitialState` | `activeSide = 'rebels'`, `handoffPending = false` |
| TC-U-18 | AC-14 | unit | positive | TC-U-17 | `END_TURN` actor=`rebels` | `activeSide='empire'`, `handoffPending=true`, version+1, событие в журнале (тип по контракту) |
| TC-U-19 | AC-14 | unit | negative | `handoffPending=true`, active=`empire` | `MOVE_PIECES` (actor empire), `ADVANCE_PHASE`, `END_TURN` | все отклонены; при handoff принимается **только** `ACCEPT_HANDOFF` |
| TC-U-20 | AC-14 | unit | negative | `handoffPending=true`, active=`empire` | `ACCEPT_HANDOFF` actor=`rebels` | отклонено `rebellion.errors:notYourTurn`; state не изменён |
| TC-U-21 | AC-14 | unit | positive | `handoffPending=true`, active=`empire` | `ACCEPT_HANDOFF` actor=`empire` | `handoffPending=false`, `activeSide='empire'`; legal actions — только для фигур Империи |
| TC-U-22 | AC-14 | unit | negative | human, active=`rebels`, нет handoff | `MOVE_PIECES` actor=`empire` | `rebellion.errors:notYourTurn` |
| TC-U-23 | AC-14 | unit | positive | цикл | REB END_TURN → EMP ACCEPT → EMP END_TURN → REB ACCEPT | возвращаемся к `activeSide='rebels'`, `handoffPending=false`; round/phase — по контракту (END_TURN не двигает фазу, если не оговорено, Q-10) |
| TC-U-24 | AC-14 | unit | positive | `handoffPending=true` | `toPlayerView(state, any)` | `{ kind:'handoff', activeSide, round, phase, sessionStatus }` и ничего больше (нет `systems, pieces, log, legalActions, rebelBase, setup`) — независимо от запрошенной стороны |
| TC-U-25 | AC-14 | unit | positive | нет handoff | `toPlayerView(state, activeSide)` | `kind:'player'`, `viewer = activeSide`; для `viewer='empire'` скрытые данные Повстанцев замаскированы (как TC-API-11/13) |
| TC-U-26 | AC-15 | unit | positive | золотой снимок SWR-003 v1 (TR-4) | апкастер setup v1 → v2: `{humanFaction:'rebellion', opponent:{kind:'ai',difficulty:'hard'}}` | `{ playerFaction:'rebels', opponentFaction:'empire', opponentType:'ai', aiDifficulty:'hard', ruleset:'base', gameMode:'digital' }` |
| TC-U-27 | AC-15 | unit | positive | снимок | setup v1 `{humanFaction:'empire', opponent:{kind:'human'}}`; `{humanFaction:'empire', opponent:{kind:'ai'}}` | human → `aiDifficulty:null`, `opponentFaction:'rebels'`; AI без сложности → `'normal'` |
| TC-U-28 | AC-15 | unit | positive | снимок state v1 | апкастер state: все `owner:'rebellion'`, `state.setup`, `rebelBase`, журнал (`actor:'rebellion'`, payload с фракцией) | ни одного `'rebellion'` как значения фракции в результате (глубокий обход; `'star-wars-rebellion'` и ключи вида `rebelBase` допустимы); число фигур/систем/событий, `version`, `round`, `phase`, позиции фигур совпадают; добавлены `activeSide = playerFaction`, `handoffPending=false`; `schemaVersion = 2` |
| TC-U-29 | AC-15 | unit | positive | снимок events v1 | апкастер событий (`GAME_CREATED`, `PIECES_MOVED`, `PHASE_ADVANCED`) | `actor`: `'rebellion'→'rebels'`, `'empire'`/`'system'` без изменений; `seq`, `at`, прочий payload неизменны |
| TC-U-30 | AC-15 | unit | boundary | — | апкастер на уже v2-данных; повторное применение | идемпотентен (v2 → v2 без изменений) |
| TC-U-31 | AC-15 | unit | negative | — | v1 с мусором (`humanFaction:'sith'`), неизвестная `schemaVersion:99` | явная ошибка разбора (→ 500 на уровне API, TC-I-33), не «тихая» подмена |
| TC-U-32 | AC-12 | unit | positive | — | реестр фракций `@bga/game-rebellion/assets`: `factions` | ровно ключи `rebels`, `empire`; у каждой `id` = ключ, `nameKey/shortNameKey/taglineKey` есть в ru и en локалях, `emblemSvg` — локальный ресурс, `color/onColor` заданы; нет функций (только данные) |
| TC-U-33 | AC-11, AC-12 | unit | positive | — | для каждой фракции контраст `onColor` на `color` (формула WCAG, TR-9) | ≥ 4.5:1 |

### 2. Unit / component — web (AC-01..AC-05, AC-07, AC-09..AC-11, AC-13, AC-14)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-C-01 | AC-02 | component | positive | fetch-заглушка | render `/games/R/new` | radiogroup фракций: `rebels` `aria-checked=true`, отмечен рамкой + галочкой + текстом «Выбрано»; противник `ai` выбран; сложность `normal`; ruleset `base`; mode `digital`; подпись `setup-opponent-caption` = «AI играет за Империю» |
| TC-C-02 | AC-02 | component | boundary | — | изменить всё (EMP, human) → уйти на страницу игры → снова открыть `/new` | снова defaults (TC-C-01) — состояние не «прилипает» (Q-19 для back/forward) |
| TC-C-03 | AC-03 | component | positive | — | клик по карточке `empire`; затем по `rebels` | подпись «AI играет за Повстанцев» ↔ «AI играет за Империю»; ровно одна карточка `aria-checked=true` |
| TC-C-04 | AC-03 | component | positive | human выбран | клик `empire` | подпись «Второй игрок играет за Повстанцев» |
| TC-C-05 | AC-04 | component | positive | — | toggle AI → human → AI | при human блок `setup-difficulty` отсутствует/скрыт (не в a11y-дереве); при возврате к AI — снова виден со значением `normal` (или предыдущим — Q-19) |
| TC-C-06 | AC-05 | component | negative | — | опции `rise-of-the-empire` и `physical_companion` | видимы с подписью «скоро», `disabled`/`aria-disabled`; клик/клавиши не меняют выбор; выбрать их нельзя |
| TC-C-07 | AC-03, AC-04 | unit | positive | — | маппер форма → запрос (`buildSetup` и аналог) для 4 комбинаций (REB/EMP × ai/human) и 3 сложностей | тело `{ gameId:R, setup: IN(...) }`; для human **нет** ключа `aiDifficulty` (или `null` — по контракту клиента, TR-12); **никогда** нет `aiFaction`/`opponentFaction`/`humanFaction`/`opponent` |
| TC-C-08 | AC-10 | component | positive | fetch висит (deferred) | клик «Начать игру» | кнопка `disabled` + `aria-busy=true` + spinner; поля формы не сбрасываются; второй клик/Enter → fetch вызван 1 раз |
| TC-C-09 | AC-10 | component | positive | — | одна попытка отправки | запрос несёт заголовок `Idempotency-Key` формата UUID; генератор ключа вызван один раз на попытку (TR-2) |
| TC-C-10 | AC-10 | component | boundary | 1-я попытка → 500 | повтор после ошибки | поведение ключа по Q-5 (новый ключ или тот же); кейс фиксирует решённое |
| TC-C-11 | AC-07 | component | positive | fetch → 201 | «Начать игру» | навигация на `/sessions/<sessionId>`; кэш TanStack Query заполнен ответом (без лишнего GET — если так в плане) |
| TC-C-12 | AC-07 | component | negative | fetch → 500 `err(INTERNAL)`; 422 `SETUP_UNSUPPORTED`; 400 `VALIDATION`; 409 `IDEMPOTENCY_KEY_REUSED`; сетевой сбой (reject) | «Начать игру» | остаёмся на `/new`; `setup-error` `role="alert"` с понятным текстом (не код, не messageKey, не «undefined»); значения формы сохранены; кнопка снова активна, `aria-busy` снят |
| TC-C-13 | AC-07 | component | positive | TC-C-12 | повтор → 201 | навигация; сообщение об ошибке исчезает |
| TC-C-14 | AC-09, AC-13 | component | positive | fetch списка с 2 сессиями (AI EMP hard; human REB) | render `/games/R` | у каждой записи: сторона (локализованное имя), тип противника (+ сложность только для AI), статус «Прототип», дата изменения; «Продолжить» ведёт к самой свежей |
| TC-C-15 | AC-10 | component | positive | список: pending / `[]` / 500 | render `/games/R` | индикатор загрузки (testid/role), пустое состояние («Продолжить» disabled), `game-sessions-error` с текстом; «Новая партия» доступна во всех трёх |
| TC-C-16 | AC-13 | component | positive | view `status:'prototype'` | render стола | `prototype-badge` с текстом «Прототип: тестовая расстановка, не правила оригинальной игры» |
| TC-C-17 | AC-14 | component | positive | human-сессия, view `kind:'player'` | клик «Передать ход» | отправлена команда `END_TURN`; ответ handoff → кэш view заменён; карта, панели, журнал размонтированы; виден `handoff-screen` «Передайте устройство игроку за Империю» и кнопка «Я — Империя» |
| TC-C-18 | AC-14 | component | positive | handoff-экран | «Я — Империя» | `ACCEPT_HANDOFF` с actor `empire`; после ответа — стол Империи; стор выбора/drag/viewport сброшен (выбор предыдущего игрока не виден) |
| TC-C-19 | AC-14 | component | negative | AI-сессия | render стола | кнопки «Передать ход» нет |
| TC-C-20 | AC-14 | component | positive | handoff-экран, `VITE_E2E` | `window.__boardDebug` | не отдаёт систем/фигур/выбора (null/пусто, TR-10) |
| TC-C-21 | AC-11 | component | positive | — | клавиатура в форме: Tab к radiogroup, стрелки ←/→ между фракциями, Space/Enter | выбор меняется стрелками (roving tabindex: в группе один tab-stop); disabled-опции пропускаются |
| TC-C-22 | AC-02, AC-11 | component | positive | `lng=ru` и `lng=en` | все новые строки формы, списка, бейджа, заслонки | есть в обеих локалях (расширение `locales.test.ts`); в en нет кириллицы |

### 3. Integration — HTTP API (AC-03..AC-08, AC-10, AC-12..AC-14)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-I-01 | AC-06, AC-13 | integration | positive | чистая БД | `POST({gameId:R, setup:DEF}, K1)` | 201; ключи ответа ровно `sessionId, gameId, status, settings, view`; `status:'prototype'`; `settings` = `{REB, EMP, 'ai', 'normal', 'base', 'digital'}`; `view.kind:'player'`, `viewer:'rebels'`; строка `Session` с `status='prototype'`, `idempotencyKey=K1`, state с `schemaVersion=2`; событие `GAME_CREATED` |
| TC-I-02 | AC-03 | integration | positive | — | `POST` с `playerFaction` REB и EMP | `settings.opponentFaction = opponentOf(playerFaction)` в ответе, в `GET /:id` и в `details` списка |
| TC-I-03 | AC-04 | integration | positive | — | `IN(EMP,'human',—,…)`; `IN(EMP,'human',null,…)` | 201; `settings.aiDifficulty === null` (ключ присутствует), `opponentType:'human'`; в БД `null` |
| TC-I-04 | AC-06 | integration | positive | — | 3 последовательных POST с разными ключами / без ключа | 3 разных `sessionId`, 3 строки |
| TC-I-05 | AC-06 | integration | positive | TC-I-01 | `GET /api/sessions/:id` | тот же `settings`, `status`, `view` (версия 1) |
| TC-I-06 | AC-09, AC-13 | integration | positive | 2 сессии | `GET /api/sessions?gameId=R` | strict `SessionSummary` + `status:'prototype'`; `details` = `playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase`; сортировка `updatedAt desc`; нет `state`, `view`, `idempotencyKey` |
| TC-I-07 | AC-05 | integration | negative | — | setup: `playerFaction:'rebellion'`/`'sith'`; `opponentType:'robot'`; `aiDifficulty:'insane'`; `ruleset:'expansion'`; `gameMode:'vr'` | 400 `VALIDATION`, пути под `setup.*`; 0 строк `Session` |
| TC-I-08 | AC-05 | integration | negative | — | лишние поля в setup: `aiFaction`, `opponentFaction`, `humanFaction`, `opponent`; лишнее поле верхнего уровня `{gameId, setup, aiFaction}` | 400 `VALIDATION`; 0 строк |
| TC-I-09 | AC-04, AC-05 | integration | negative | — | `IN(REB,'human','hard',…)` | 400 `VALIDATION`, путь `setup.aiDifficulty`; 0 строк |
| TC-I-10 | AC-05 | integration | negative | — | отсутствуют `ruleset`/`gameMode`/`playerFaction` | 400 (Q-7) |
| TC-I-11 | AC-05 | integration | negative | — | `ruleset:'rise-of-the-empire'` | 422 `err(SETUP_UNSUPPORTED, 'rebellion.errors:rulesetUnavailable')`; 0 строк |
| TC-I-12 | AC-05 | integration | negative | — | `gameMode:'physical_companion'` | 422 `err(SETUP_UNSUPPORTED, 'rebellion.errors:modeUnavailable')`; 0 строк |
| TC-I-13 | AC-05 | integration | negative | — | RotE + physical; RotE + лишнее `aiFaction`; RotE + `aiDifficulty` при human | 422 (ключ по Q-8); 400 (схема раньше 422); 400 — порядок проверок spec |
| TC-I-14 | AC-05, AC-12 | integration | negative | — | порядок проверок: битое тело/нет `setup` → 400; неизвестная игра → 404; `forbidden-stars` → 422 `GAME_UNAVAILABLE` (даже с битым setup) | порядок `400 форма → 404 → 422 GAME_UNAVAILABLE → идемп. → 400 setup → 422 SETUP_UNSUPPORTED` |
| TC-I-15 | AC-10 | integration | positive | — | `POST(DEF, K1)` дважды последовательно | 1-й 201, 2-й 200 (Q-1) с тем же `sessionId`; 1 строка; тело повтора — `SessionResponse` (Q-1: текущее состояние или снимок) |
| TC-I-16 | AC-10 | integration | negative | TC-I-15 | `POST(IN(EMP,…), K1)`; `POST({gameId:FS-или-другой, …}, K1)` | 409 `err(IDEMPOTENCY_KEY_REUSED, …)`; 1 строка; исходная сессия не изменена |
| TC-I-17 | AC-10 | integration | boundary | — | «то же тело» в другой форме: перестановка ключей; `aiDifficulty` опущен vs `'normal'`; `null` vs опущен для human | по Q-2 (сравнение канонического/разобранного или сырого тела); кейс фиксирует решённое |
| TC-I-18 | AC-10 | integration | negative | — | заголовок `Idempotency-Key: not-a-uuid`, пустая строка, 2 заголовка, > 200 символов | 400 `VALIDATION` (Q-2) ; 0 строк |
| TC-I-19 | AC-10 | integration | positive | — | POST без заголовка | 201, создаётся (ключ необязателен — Q-2); `idempotencyKey` = null; две такие отправки → 2 строки |
| TC-I-20 | AC-10 | integration | concurrency | — | 10 параллельных `POST(DEF, K1)` (`Promise.all`, supertest) ×5 повторов | ровно 1 строка `Session` с K1; все ответы 201/200 с **одним** `sessionId`; ни одного 500 (уникальное нарушение перехвачено, Q-4) |
| TC-I-21 | AC-10 | integration | concurrency | — | параллельно `POST(DEF, K1)` и `POST(IN(EMP…), K1)` | одна строка; один ответ 201, другой 409 или 200 строго по тому, кто победил; ни одного 500 |
| TC-I-22 | AC-10 | integration | negative | — | `POST(invalid setup, K1)` → 400, затем `POST(DEF, K1)` | 2-й → 201 (ключ не «сгорает» на отклонённом запросе) |
| TC-I-23 | AC-10 | integration | negative | `POST(RotE, K1)` → 422 | затем `POST(DEF, K1)` | 201 (ключ не сохранён при 422) |
| TC-I-24 | AC-08 | integration | positive | app#1 на файле БД: 2 сессии (AI, human) + 1 ход + `END_TURN` у human | `stopApp(app1)` (без удаления файла) → `startApp(app2)` на том же URL → `GET /:id`, `GET /?gameId=R`, `POST(DEF, тот же K1)` | идентичные `settings`, `status`, `view` (включая `kind:'handoff'` для human); список тот же; идемпотентность пережила перезапуск (тот же `sessionId`) |
| TC-I-25 | AC-14 | integration | positive | human-сессия REB | `POST /:id/commands {actor:'rebels', expectedVersion:1, command:{type:'END_TURN'}}` | 200; `view.kind:'handoff'`, `activeSide:'empire'`; **глубокая** проверка ответа: нет ключей `systems, pieces, log, legalActions, rebelBase, setup`; JSON не содержит id систем/фигур (сравнить со списком из сценария) |
| TC-I-26 | AC-14 | integration | positive | TC-I-25 | `GET /api/sessions/:id`; `GET /api/sessions?gameId=R` | GET → тот же handoff-view (без данных стола); `details` списка — только публичные поля (`round, phase` и настройки) |
| TC-I-27 | AC-14 | integration | negative | TC-I-25 | `?viewer=rebels`/`?viewer=empire` на GET | игнорируется — handoff-view (как TC-SES-18) |
| TC-I-28 | AC-14 | integration | negative | TC-I-25 | команды при handoff: `MOVE_PIECES` actor empire; `ADVANCE_PHASE`; `ACCEPT_HANDOFF` actor `rebels` | 422 `ILLEGAL_COMMAND` (`rebellion.errors:notYourTurn` для чужой стороны; ключ для «не ACCEPT при handoff» — Q-10); version и строки событий не изменились |
| TC-I-29 | AC-14 | integration | positive | TC-I-25 | `ACCEPT_HANDOFF` actor `empire`, верная версия | 200; `view.kind:'player'`, `viewer:'empire'`; `rebelBase.systemId` = null/скрыт, скрытые фигуры Повстанцев с `typeKey:'unknown'`; legalActions только для фигур Империи |
| TC-I-30 | AC-14 | integration | negative | human, active `empire`, нет handoff | `MOVE_PIECES` actor `rebels` | 422 `rebellion.errors:notYourTurn`; state не изменён |
| TC-I-31 | AC-14 | integration | negative | AI-сессия | `END_TURN`, `ACCEPT_HANDOFF` | 422 (Q-10); строки не изменились |
| TC-I-32 | AC-14 | integration | concurrency | handoff | 2 параллельных `ACCEPT_HANDOFF` с одной `expectedVersion` | ровно один 200, один 409 (как TC-API-20) |
| TC-I-33 | AC-06 | integration | negative | сессия; прямой Prisma-апдейт `state` = `'{bad'`, = валидный JSON неверной формы, `schemaVersion:99`, `setup` с `aiFaction` | `GET /:id`; команда | 500 `err(INTERNAL, …)` без stack/SQL/Prisma/имени таблицы; в `GET /api/sessions` битая строка пропущена (TC-SES-16), остальные видны |
| TC-I-34 | AC-06, AC-07 | integration | negative | сбой БД (TR-3: недоступный файл / закрытый клиент / репозиторий-заглушка, бросающий ошибку) | `POST(DEF, K1)`, `GET /`, `GET /:id` | 500 единый формат без внутренностей; после восстановления `POST(DEF, K1)` → 201 (ключ не сохранён частично) |
| TC-I-35 | AC-14, AC-12 | integration | positive | AI-сессии REB и EMP; human-сессия на каждой фазе цикла | все ответы `POST`, `GET /:id`, `GET /`, `/commands` (успех и ошибки) | ни одного FORBIDDEN-поля (TC-API-11 расширить на новые ответы и handoff); `settings` не содержит секретов; 4xx `details` не эхоит state |
| TC-I-36 | AC-12 | integration | positive | фиктивная игра `fake-game` (TC-EXT) | create/get/list/commands | платформа работает без знаний о фракциях; `status` берётся из модуля (fake → свой статус); Idempotency работает и для fake-игры |
| TC-I-37 | AC-12 | integration | positive | — | `routes.int.test` | маршруты прежние (новых путей нет); мутируют только `POST /api/sessions(/:id/commands)` |
| TC-I-38 | AC-13 | integration | boundary | — | `status` в ответах | ∈ `setup|prototype|active|completed`; Rebellion → `prototype`, после команд не меняется (Q-9) |

### 4. Integration — миграция данных SWR-003 → SWR-004 (AC-15)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-M-01 | AC-15 | integration | positive | БД в форме SWR-003 (TR-4: миграции до `20261108120000_sessions`, 3 сессии: EMP/ai/hard, `rebellion`/human, EMP/ai без сложности, с ходами и `PHASE_ADVANCED`) | `prisma migrate deploy` | новые колонки: `Session.status` NOT NULL = `'prototype'` у всех строк; `idempotencyKey` = null, unique-индекс существует; строки/события не потеряны (count до = после); повторный deploy — no-op |
| TC-M-02 | AC-15 | integration | positive | TC-M-01 | через API: `GET /`, `GET /:id` для всех 3 | 200; `settings` = апкаст (TC-U-26/27): `rebels/empire`, `ruleset:'base'`, `gameMode:'digital'`, `aiDifficulty` null для human; `status:'prototype'`; ни одного `'rebellion'` как фракции во всех телах (глубокий обход) |
| TC-M-03 | AC-15 | integration | positive | TC-M-01 | для каждой: команда (`MOVE_PIECES` по legal action / `ADVANCE_PHASE`) actor = апкаст-сторона | 200, version+1; новое событие с `actor:'rebels'|'empire'`; старые события в журнале с `'rebels'` |
| TC-M-04 | AC-15, AC-14 | integration | positive | мигрированная human-сессия SWR-003 | `END_TURN` → `ACCEPT_HANDOFF` | hot-seat работает (`activeSide` инициализирован = playerFaction, Q-17) |
| TC-M-05 | AC-15 | integration | positive | TC-M-01 | после первой команды — содержимое строки | state сохранён в v2 (или остаётся v1 до записи — Q-16); в обоих случаях повторное чтение даёт идентичный view |
| TC-M-06 | AC-15 | integration | regression | — | TC-MIG-01..06 (SWR-002 → SWR-003) на полной цепочке миграций | остаются зелёными; SWR-002 игры доходят до v2 через оба шага |
| TC-M-07 | AC-15 | integration | negative | — | SQL-миграции SWR-002/003 не изменены (хеш файлов, как TC-MIG-06) | без изменений |

### 5. E2E Playwright (AC-01..AC-11, AC-13, AC-14)

PO TC-001..TC-006 — в отдельном файле `e2e/game-setup.spec.ts` (предложение; имя за FE/QA). Каждый кейс проверяет и UI,
и сеть (тело запроса/ответа через `page.waitForResponse`), и состояние сервера через API (`e2e/support/api.ts`).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-001 | AC-01, AC-02, AC-06, AC-07, AC-13 | e2e | positive | — | **Стандартная AI-партия:** `/` → карточка R → `game-new-session` → проверить defaults → `setup-start` | URL `/games/R/new`; defaults (REB выбрана, AI, Normal, Base, Digital, «AI plays the Empire»/«AI играет за Империю»); запрос: `{gameId:R, setup:{playerFaction:'rebels', opponentType:'ai', aiDifficulty:'normal'(или опущено), ruleset:'base', gameMode:'digital'}}`, заголовок `Idempotency-Key` UUID, нет `aiFaction`; ответ 201, `status:'prototype'`, `settings.opponentFaction:'empire'`; URL `/sessions/<id>`; стол виден, `prototype-badge` виден; `listSessions` содержит сессию с `details` по контракту |
| TC-002 | AC-03, AC-06 | e2e | positive | — | **За Империю:** `/new` → `setup-faction-empire` → проверить подпись → «hard» → старт | подпись «AI plays the Rebels»; `aria-checked` у empire; запрос `playerFaction:'empire'`, `aiDifficulty:'hard'`; ответ `settings.opponentFaction:'rebels'`; `view.viewer:'empire'`; на столе legal actions/кнопки только для фигур Империи, база Повстанцев скрыта (сеть, не DOM) |
| TC-003 | AC-04, AC-14 | e2e | positive | — | **Против человека:** `/new` → `setup-opponent-human` | блок сложности не виден; подпись «Second player plays the Empire»; запрос без `aiDifficulty` (или `null`), `opponentType:'human'`; ответ `settings.aiDifficulty:null`; на столе есть «Передать ход» (`end-turn`) |
| TC-004 | AC-08, AC-09 | e2e | positive | сессия из TC-001/TC-002 + один ход | **Восстановление:** (a) `page.reload()` на `/sessions/:id`; (b) новый `browser.newContext()` → `/games/R` → список → `recent-session-<id>` → стол; (c) перезапуск backend — см. Q-14 (в e2e не поддерживается текущим `webServer`; покрывается TC-I-24, или seam TR-6) | (a)/(b): тот же `settings`, `status`, ход сохранён (позиция фигуры, version); в списке видны сторона, тип противника (+сложность), «Prototype», дата изменения; «Continue» открывает самую свежую |
| TC-005 | AC-07, AC-10 | e2e | negative | — | **Ошибка сервера:** `page.route('**/api/sessions', r => r.request().method()==='POST' ? r.fulfill({status:500, json: err(INTERNAL)}) : r.continue())` → `setup-start`; повтор с `{status:422 SETUP_UNSUPPORTED}`; затем `abort('failed')` (сетевой сбой); затем `page.unroute` → повтор | на каждой ошибке: URL остаётся `/new`; `setup-error` (`role=alert`) с понятным текстом; выбранные значения (EMP, human) сохранены; кнопка снова enabled, `aria-busy` снят; сервер: ни одной новой сессии (`listSessions` до/после); после `unroute` повтор → 201, переход на стол, ровно 1 новая сессия; ключи (Q-5 refined): после 500 и 422 — **новый** ключ, после сетевого сбоя (abort) повтор — **тот же** ключ |
| TC-006 | AC-10 | e2e | positive | счётчик POST через `page.on('request')` | **Защита от дублей:** (a) `dblclick` по `setup-start`; (b) 5 быстрых `click({noWaitAfter})` + `Enter` при задержанном ответе (`route` с задержкой ~1 с, затем `continue`); (c) API-часть: два `request.post` с одним `Idempotency-Key` | (a)(b): ровно **1** `POST /api/sessions`; кнопка disabled + `aria-busy=true` во время запроса; 1 новая сессия по `listSessions` (count до +1); переход на её стол; (c): одинаковый `sessionId`, второй — 200; тот же ключ + другое тело → 409 |
| TC-E2E-HS-01 | AC-14 | e2e | positive | human-сессия REB (через UI, TC-003) | «Передать ход» | ответ команды и последующий GET: `view.kind:'handoff'` без `systems/pieces/log/legalActions` (проверка по сети); на экране `handoff-screen` «Pass the device to the Empire player», **нет** `board-canvas`, `context-panel`, `event-log`; `__boardDebug === undefined` (TR-10); фокус на `handoff-title`, не на `handoff-accept` (OQ-1) |
| TC-E2E-HS-02 | AC-14 | e2e | positive | TC-E2E-HS-01 | `page.reload()` во время заслонки | после перезагрузки снова заслонка (состояние на сервере), карта не мелькает (нет запроса/рендера `board-canvas` до подтверждения) |
| TC-E2E-HS-03 | AC-14 | e2e | positive | TC-E2E-HS-01 | «Я — Империя» (`handoff-accept`) | стол Империи: `viewer:'empire'`, база Повстанцев скрыта в ответе, legal actions только для Империи; выбор/zoom предыдущего игрока сброшены; ход Империи → «Передать ход» → заслонка «…Rebels player» → подтверждение → стол Повстанцев |
| TC-E2E-HS-04 | AC-14 | e2e | negative | handoff | API: команда от неактивной стороны и `MOVE_PIECES` во время handoff | 422; `GET` после — без изменений (version та же) |
| TC-E2E-HS-05 | AC-14 | e2e | negative | AI-сессия | стол | нет «Передать ход»; заслонка не появляется |
| TC-E2E-PR-01 | AC-13 | e2e | positive | ≥1 сессия | `/games/R`, `/sessions/:id`, `/games/R/new` | «Prototype» на столе (`prototype-badge` с полным текстом), в каждом элементе списка (`recent-session-*-status`), и на странице игры (если spec так требует — Q-21); бейдж виден при 1440 и 375 |
| TC-E2E-CT-01 | AC-09 | e2e | positive | 2 сессии: AI EMP hard (старше) и human REB (новее) | `/games/R` → проверить поля списка → «Continue» → назад → клик старой записи | поля: сторона, «AI · Hard» / «Second player», «Prototype», дата (относительная/абсолютная по формату) — по каждой записи совпадают с `listSessions().details`; «Continue» → новейшая (human, может открыть заслонку если handoff — Q-21); клик → нужная сессия |
| TC-E2E-RT-01 | AC-01 | e2e | positive | — | прямой заход `/games/R/new`, refresh | форма с defaults; `back` ведёт на страницу игры |

### 6. Visual & accessibility (AC-11, AC-02, AC-07, AC-13, AC-14)

Скриншоты: `docs/tasks/SWR-004/artifacts/screenshots/<name>.png`, `reducedMotion:'reduce'`, локаль — Q-18
(предложение: ru как PO-язык по умолчанию + одна en-копия формы). Viewports: **D** = 1440×900, **M** = 375×812,
**T** = 1024×768 (+768×1024 для D-1).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-VA-01 | AC-11 | visual-a11y | screenshot | ≥1 сессия | `/games/R` → `va-01-game-page-{d,m}` | обложка, название, описание, «Новая партия», «Продолжить», список; на M без горизонтального скролла (`scrollWidth <= innerWidth`) |
| TC-VA-02 | AC-02, AC-11 | visual-a11y | screenshot | — | `/games/R/new` defaults → `va-02-new-session-defaults-{d,m}` | карточки рядом (D) / столбиком (M); выделение REB видно (рамка+галочка+«Выбрано») |
| TC-VA-03 | AC-03 | visual-a11y | screenshot | — | выбрать Империю → `va-03-empire-selected-{d,m}` | подпись «AI играет за Повстанцев» |
| TC-VA-04 | AC-04 | visual-a11y | screenshot | — | human → `va-04-human-selected-{d,m}` | блока сложности нет; макет не «прыгает» с перекрытием |
| TC-VA-05 | AC-07 | visual-a11y | screenshot | route → 500 | `va-05-error-state-{d,m}` | alert рядом с кнопкой, виден без скролла на D; на M — в зоне видимости после отправки (фокус/scrollIntoView) |
| TC-VA-06 | AC-13 | visual-a11y | screenshot | AI-сессия | стол → `va-06-table-prototype-badge-{d,m}` | бейдж «Прототип…» читаем, не обрезан |
| TC-VA-07 | AC-14 | visual-a11y | screenshot | human-сессия после «Передать ход» | `va-07-handoff-{d,m}` | заслонка без карты/фигур/журнала |
| TC-VA-08 | AC-11 (D-1) | visual-a11y | screenshot + layout | AI и human-сессии | стол на T (1024×768) и 768×1024 → `va-08-table-1024`, `va-08-table-768` | верхняя панель не переполняется: у её детей нет пересечений bounding box, `scrollWidth <= clientWidth` панели, нет обрезанных кнопок (`advance-phase`, «Передать ход», zoom) |
| TC-VA-09 | AC-11 | visual-a11y | keyboard | `/games/R/new` | только клавиатура: Tab от начала страницы; порядок: назад → radiogroup фракций (1 tab-stop) → противник → сложность → ruleset → mode → «Начать игру»; стрелками выбрать Империю, human; Enter/Space на «Начать игру» | порядок фокуса совпадает с визуальным; выбор стрелками работает; disabled-опции не получают фокус либо объявлены `aria-disabled`; сессия создана, переход на стол; скриншот `va-09-keyboard-focus` |
| TC-VA-10 | AC-11 | visual-a11y | focus | — | для каждого интерактивного элемента формы, списка, заслонки при фокусе с клавиатуры | видимый индикатор фокуса (`:focus-visible`: outline/box-shadow ≠ none, контраст индикатора ≥ 3:1 к фону) — через `getComputedStyle` |
| TC-VA-11 | AC-11 | visual-a11y | contrast | — | для текста карточек (название, слоган, «Выбрано»), подписи противника, «скоро», alert, бейджа «Прототип», заслонки: `page.evaluate` → цвета текста/фона (computed, с учётом наследования фона) → WCAG-ratio (TR-9) | ≥ 4.5:1 обычный текст, ≥ 3:1 крупный и UI-компоненты (рамка выделения); disabled-опции — исключение по WCAG, но «скоро» должно читаться (≥ 3:1, Q-23). Дополнительно — ручная проверка `manual` DevTools/Lighthouse со скриншотом |
| TC-VA-12 | AC-11 | visual-a11y | semantics | — | a11y-дерево (`page.getByRole`) | `radiogroup` фракций с доступным именем, `radio` ×2 с именами «Повстанцы»/«Империя» и `aria-checked`; противник — radiogroup/toggle с именами; `alert` для ошибки; кнопка «Начать игру» `aria-busy` во время запроса; заслонка — `main`-регион с заголовком `handoff-title` (role heading), фокус при появлении — на `handoff-title`, **не** на «Я — Империя» (OQ-1, Decisions after TECH_PLANNING); первый Tab → `handoff-accept` |
| TC-VA-13 | AC-07, AC-11 | visual-a11y | error clarity | route → 500, 422, abort | текст `setup-error` | человеческий текст на языке UI, без кода/HTTP-статуса/`messageKey`/«undefined»/stack; говорит, что делать («Попробуйте ещё раз»); для 422 RotE — «набор правил недоступен»; объявляется скринридеру (`role=alert`/live region) |
| TC-VA-14 | AC-11 | visual-a11y | reduced motion | `reducedMotion:'reduce'` | выбор карточки, появление заслонки | без анимаций (или мгновенные) |
| TC-VA-15 | AC-11 | visual-a11y | assets | — | сеть при открытии `/new` | все ресурсы эмблем — локальные (тот же origin), без внешних доменов |

### 7. Архитектура и гейты (AC-12)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-A-01 | AC-12 | arch | positive | — | ESLint-границы | `packages/games/rebellion/src/{schema,rules,assets}` не импортируют React/MUI/Nest/OpenAI; `packages/platform` не содержит `rebels|empire|ruleset|gameMode|faction` (grep-тест) |
| TC-A-02 | AC-12 | arch | positive | — | `grep -rn` по `apps/api/src` | нет вызовов OpenAI/AI-клиента в пути создания сессии; второй AI-клиент не создан |
| TC-A-03 | AC-12 | gate | positive | — | `pnpm verify` (lint, typecheck, test, build, check:bundle, e2e) | все зелёные; `check:bundle`: `__boardDebug`/debug-view нет в production-бандле |
| TC-A-04 | AC-03 | arch | regression | после rename | `grep -rnE "['\"]rebellion['\"]"` по `packages apps e2e` (кроме апкастера, его тестов/фикстур v1 и `star-wars-rebellion`/`game-rebellion`) | 0 вхождений |

### 8. Регрессия (AC-12, AC-15)

Все 50 e2e и наборы api/web/rebellion/platform остаются зелёными после переименования и смены формы setup.
Изменения тестов — **только** механическая замена фракции/формы setup; удаление/ослабление проверок запрещено
(кроме перечисленных ниже замен).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-R-01 | AC-12 | e2e | regression | rename + новый setup | весь `pnpm e2e` | 50 старых + новые зелёные; число старых кейсов не уменьшилось |
| TC-R-02 | AC-12 | integration/unit/component | regression | — | `pnpm test` | api ≥ 94, web ≥ 173, rebellion ≥ 115, platform ≥ 32 + новые |

**e2e, прямо ссылающиеся на фракцию `'rebellion'`** (требуют замены на `'rebels'`):
- `e2e/support/api.ts` — `Faction`, `GameSetup {humanFaction, opponent}` → `RebellionSetupInput`, `EMPIRE_VS_AI`,
  `REBELLION_VS_AI` (→ `REBELS_VS_AI`), `postCommand` (`actor: view.setup.humanFaction` → `view.viewer`/active side),
  `opponentPieces` (`view.setup.humanFaction`), `SessionResponse` (+`status`, `settings`), `PlayerView` (union, Q-11).
- `e2e/support/testids.ts` — `setupFaction('empire'|'rebellion')` → `'rebels'`; новые testids (TR-1).
- `e2e/architecture.spec.ts` (TC-E2E-30/31: `REBELLION_VS_AI`, `owner === 'rebellion'`).
- `e2e/board-view.spec.ts` (TC-E2E-06: цикл по `['empire','rebellion']`; `mockBadge` → проверить замену на `prototype-badge`).
- `e2e/new-game.spec.ts` (TC-NEW-05/06/07: тела запросов `humanFaction/opponent`, `details` `{humanFaction, opponent, difficulty}`,
  ключи ответа `['gameId','sessionId','view']` → +`settings`,`status`; `setupFaction('rebellion')`). **Замена:** TC-NEW-05/06/07
  переписываются на новый контракт и частично перекрываются TC-001..TC-003 — сохранить как отдельные кейсы.

**Косвенно зависят от формы setup/view** (через `createSession`/`support/board.ts`, без литерала `'rebellion'`):
`keyboard`, `move`, `selection`, `zoom-pan`, `phase`, `persistence`, `game-page`, `catalog`, `settings`, `screenshots`,
`00-empty-db` (TC-GP-13 — пустое состояние списка). `phase.spec.ts` и `board-view.spec.ts` проверяют `T.mockBadge` — при
замене MOCK на бейдж «Прототип» обновить селектор, проверку текста не ослаблять.

**api integration с `'rebellion'`/`humanFaction`:** `sessions.int.test.ts` (TC-SES-01/02/05/08/18, TC-API-05),
`commands.int.test.ts` (TC-API-14, TC-API-19 `errors.notYourSide` — Q-11), `hidden-info.int.test.ts` (TC-API-11..13),
`persistence.int.test.ts`, `support/fixtures.ts`, `support/pre-migration-db.ts` (v1-данные остаются `'rebellion'` — это входные
фикстуры миграции, **не** переименовывать), `migration.int.test.ts` (TC-MIG-02: `state.setup.humanFaction`).
**web:** `SetupScreen.test.tsx`, `TableScreen.test.tsx`, `router.test.tsx`, `CatalogPage.test.tsx`, `api.test.ts`,
`describeSession.test.ts`, `model.test.ts`, `useSendCommand.test.tsx`, `board/test/fixtures.ts`, `registry.test.ts`, `extensibility.test.tsx`.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-R-03 | AC-15 | integration | regression | — | TC-MIG-01..06 + TC-M-* | v1-фикстуры сохраняют `'rebellion'`; результат через API — `'rebels'` |
| TC-R-04 | AC-14 | integration | regression | AI-сессия | TC-API-11..13, TC-SES-18 после union `PlayerView` | AI-партия: `kind:'player'`, секреты по-прежнему скрыты |

### 5a. E2E implementation (QA, 2026-11-08) — написано, **не запускалось**

Статус: спеки написаны под контракт spec + plan-frontend §7 + plan-backend §3–§4, пока приложение меняется; `pnpm e2e` **не
запускался** (`not_run`). Проверены только `tsc` / `eslint` / `prettier` (логи `artifacts/logs/qa-e2e-typecheck.log`,
`artifacts/logs/qa-e2e-lint.log`) и `playwright test --list` (75 тестов в 19 файлах: 50 SWR-003 + 25 новых).

| TC | Файл › тест |
|---|---|
| TC-001..TC-006 | `e2e/game-setup.spec.ts` › `TC-001` … `TC-006`, `TC-006 (API)` |
| TC-E2E-RT-01 | `e2e/game-setup.spec.ts` › `TC-E2E-RT-01` (+ Q-19: human → AI возвращает последнюю сложность) |
| TC-E2E-HS-01..05 | `e2e/hot-seat.spec.ts` |
| TC-E2E-PR-01, TC-E2E-CT-01 | `e2e/session-list.spec.ts` |
| TC-VA-01..13, TC-VA-15 | `e2e/visual-a11y.spec.ts` (TC-VA-05+13, 06+07, 09+10 объединены; TC-VA-14 — `manual`) |
| TC-NEW-05/06/07 (замена §8) | `e2e/new-game.spec.ts` — переписаны на новый wire |
| регрессия `mock-badge` | `board-view.spec.ts`, `phase.spec.ts` → `prototype-badge` + `data-status="prototype"` |

**Support (TR-5, TR-9):** `e2e/support/api.ts` — `SetupInput`, `Settings`, `SessionResponse{status,settings}`, union
`PlayerView | HandoffView`, `asPlayer/asHandoff/isHandoff`, `postSession` (сырой POST с `Idempotency-Key`), `createSession(request,
setup, {idempotencyKey})`, `endTurn`, `acceptHandoff`, `postCommand(…, actor?)` (actor = `viewer`/`activeSide`), `expectHandoffOnly`;
`e2e/support/setup.ts` — defaults формы, `routeCreate` (только `POST /api/sessions`, остальное `fallback`), `recordCreates`,
`newSessionIdsSince` (подсчёт новых сессий без зависимости от лимита списка 20); `e2e/support/a11y.ts` — WCAG luminance/contrast
на computed styles с композицией фонов предков, контраст рамки (1.4.11), видимый фокус (outline ≥ 3:1 к фону **под кольцом**: при `outline-offset ≥ 0` — фон предков, при `offset ≤ −width` — заливка элемента, иначе оба; решение «Focus ring» в spec), отсутствие горизонтального
скролла / обрезки / пересечений детей. `RECENT_SESSION_ITEM` исключает части строки (`recent-session-faction` и т. п.), иначе
префиксный селектор `recent-session-` считал бы их сессиями (TC-GP-15 ожидает ровно 5).

**Скриншоты (решение QA):** `saveScreenshot(page, name, task = 'SWR-004')` (`e2e/support/board.ts`). Файл пишется в
`docs/tasks/<task>/artifacts/screenshots/` **только** если `task` = задача-доказательство прогона: env `SCREENSHOT_TASK`, иначе
`CURRENT_SCREENSHOT_TASK = 'SWR-004'`; скриншоты других задач идут в неотслеживаемый `test-results/screenshots/<task>/`.
Итог: обычный `pnpm e2e` пишет только `va-*` SWR-004; `screenshots.spec.ts` и `00-empty-db.spec.ts` (SWR-003) остаются как регрессионный
обход, но SWR-003-доказательства больше не перезаписываются. Осознанная перегенерация: `SCREENSHOT_TASK=SWR-003 pnpm e2e`.
Имена SWR-004: `va-01-game-page-{d,m}`, `va-02-new-session-defaults-{d,m}`, `va-02-new-session-defaults-en-d`,
`va-03-empire-selected-{d,m}`, `va-04-human-selected-{d,m}`, `va-05-error-state-{d,m}`, `va-06-table-prototype-badge-{d,m}`,
`va-07-handoff-{d,m}`, `va-08-table-{1024,768}[-human]`, `va-09-keyboard-focus`.

**Ожидания к FE (атрибуты, на которые опираются спеки):** `setup-faction-<f>` — `role=radio`, `aria-checked`, `data-selected="true"`
у выбранной; `setup-faction-group|setup-opponent|setup-difficulty|setup-ruleset|setup-mode` — `role=radiogroup` с доступным
именем; `setup-opponent-caption` — `data-opponent-faction`, `aria-live=polite`; недоступные опции — `aria-disabled="true"`,
`aria-checked="false"`, стрелки их пропускают; `setup-form`/`setup-start` — `aria-busy="true"` в запросе; после ошибки фокус на
`setup-start`; `setup-error` — `role=alert`; `prototype-badge` / `recent-session-status` / `game-continue-status` /
`game-info-status` — `data-status`; `recent-session-date` — `<time datetime=updatedAt>`; `active-side[data-side]`;
`end-turn` только в human-партии; `handoff-screen[data-active-side][data-version]`, `handoff-title` (heading, фокус),
`handoff-accept`; во время заслонки `window.__boardDebug === undefined`; при переходе к новой стороне выбор сброшен и масштаб = fit.
Опционально `table-top-bar` (иначе спека берёт общий предок `round-indicator`/`advance-phase`/`prototype-badge`).
**Ожидания к BE:** messageKey wire-формата `errors.<name>` (AM-FE-5): `errors.handoffPending`, `errors.notYourTurn`,
`errors.handoffNotAvailable`; повтор с тем же ключом → 200 + `Idempotent-Replay: true`; командный ответ `{ok, view, events}`, при
handoff `events = []` и view ровно `{kind,id,version,activeSide,round,phase,sessionStatus}`.

## Coverage

| AC | Test cases |
|---|---|
| AC-01 | TC-001, TC-E2E-RT-01, TC-C-01 |
| AC-02 | TC-U-03, TC-C-01, TC-C-02, TC-C-22, TC-001, TC-VA-02 |
| AC-03 | TC-U-01, TC-U-02, TC-U-04, TC-C-03, TC-C-04, TC-C-07, TC-I-02, TC-002, TC-VA-03, TC-A-04 |
| AC-04 | TC-U-06, TC-U-07, TC-C-05, TC-C-07, TC-I-03, TC-I-09, TC-003, TC-VA-04 |
| AC-05 | TC-U-04..TC-U-12, TC-C-06, TC-I-07..TC-I-14 |
| AC-06 | TC-I-01, TC-I-04, TC-I-05, TC-I-33, TC-I-34, TC-001, TC-002 |
| AC-07 | TC-C-11, TC-C-12, TC-C-13, TC-001, TC-005, TC-VA-05, TC-VA-13 |
| AC-08 | TC-I-24, TC-004 (a, b; c — Q-14) |
| AC-09 | TC-U-14, TC-C-14, TC-I-06, TC-004, TC-E2E-CT-01 |
| AC-10 | TC-C-08, TC-C-09, TC-C-10, TC-C-15, TC-I-15..TC-I-23, TC-005, TC-006 |
| AC-11 | TC-U-33, TC-C-21, TC-C-22, TC-VA-01..TC-VA-15 |
| AC-12 | TC-U-01, TC-U-13, TC-U-32, TC-I-36, TC-I-37, TC-A-01..TC-A-03, TC-R-01, TC-R-02 |
| AC-13 | TC-U-15, TC-C-14, TC-C-16, TC-I-01, TC-I-06, TC-I-38, TC-001, TC-E2E-PR-01, TC-VA-06 |
| AC-14 | TC-U-16..TC-U-25, TC-C-17..TC-C-20, TC-I-25..TC-I-32, TC-I-35, TC-M-04, TC-003, TC-E2E-HS-01..05, TC-VA-07, TC-R-04 |
| AC-15 | TC-U-26..TC-U-31, TC-M-01..TC-M-07, TC-R-03 |

PO-тесты: Unit → §1–2; Integration → §3–4; E2E TC-001..TC-006 → §5 (идентификаторы PO сохранены);
Visual & Accessibility → §6.

## Testability requirements for implementers

- **TR-1 testids** (добавить в `e2e/support/testids.ts`, владелец — QA; FE ставит в разметку):
  - форма: `setup-faction-rebels`, `setup-faction-empire` (элемент с `role="radio"`, `aria-checked`, `data-selected`),
    `setup-faction-group` (`role="radiogroup"`), `setup-opponent-ai`, `setup-opponent-human`, `setup-opponent-caption`,
    `setup-difficulty` (+ `setup-difficulty-{easy,normal,hard}`), `setup-ruleset-base`, `setup-ruleset-rise-of-the-empire`,
    `setup-mode-digital`, `setup-mode-physical_companion`, `setup-start` (`aria-busy`), `setup-error` (`role="alert"`);
  - страница игры: `game-recent-loading`, `game-recent-empty` (OQ-2: существующие имена; `game-sessions-*` не вводятся), внутри `recent-session-<id>`: `recent-session-faction`,
    `recent-session-opponent`, `recent-session-status`, `recent-session-date` (+ `data-status="prototype"`);
  - стол: `prototype-badge`, `active-side`, `end-turn`; заслонка: `handoff-screen`, `handoff-title`, `handoff-accept`.
  - Удалённые/переименованные testids (`mock-badge`, `setup-mock-badge`) — сообщить QA до слияния. **Принято (plan-frontend §7.2):**
    `mock-badge` (стол) → `prototype-badge`, `setup-mock-badge` → `setup-prototype-note`, группа `setup-faction` → `setup-faction-group`;
    e2e мигрированы (см. «E2E implementation»).
- **TR-2 Idempotency seam:** генерация ключа — отдельная функция/модуль клиента (например, `createIdempotencyKey()`),
  подменяемая в component-тестах (`vi.mock`) и наблюдаемая в e2e по заголовку запроса. Ключ генерируется в обработчике
  отправки, а не при рендере.
- **TR-3 Fake failure injection:** e2e — только `page.route` (без тестовых backend-маршрутов, R-7 SWR-002);
  integration — опция `createApp` для подмены репозитория/Prisma-клиента (бросает ошибку) **или** документированный способ
  сделать БД недоступной (удалить/заблокировать файл, `$disconnect`) — для TC-I-34; битые строки — прямой Prisma-апдейт
  (как TC-SES-16).
- **TR-4 Фикстуры:** (a) генератор БД в форме SWR-003 (аналог `pre-migration-db.ts`: миграции до `20261108120000_sessions`,
  сессии с v1-setup и `'rebellion'` в state/events, построенные **старыми** правилами — замороженный снимок, т.к. правила
  после rename v1 не производят); (b) малый JSON-снимок v1 setup/state/events (коммитится, < 50 KB) для unit-тестов апкастера.
- **TR-5 e2e support:** `e2e/support/api.ts` — новые типы (`RebellionSetupInput`, `SessionResponse{status,settings}`,
  `PlayerView` union), `createSession(request, setup, {idempotencyKey?})`, хелперы `endTurn`, `acceptHandoff`, `isHandoff(view)`;
  `postCommand` с явным `actor`. Владелец — QA.
- **TR-6 Перезапуск backend в e2e (опционально, Q-14):** `e2e-serve.mjs` пересоздаёт БД при старте → рестарт в e2e
  невозможен; либо флаг `E2E_KEEP_DB`, либо оставить рестарт на integration (TC-I-24).
- **TR-7 Задержка ответа:** UI не должен иметь таймаутов < 2 с на `POST /api/sessions` (TC-006 держит ответ ~1 с).
- **TR-8 Конкурентность:** уникальный индекс `idempotencyKey` + перехват unique-violation в сервисе (иначе TC-I-20 даст 500).
- **TR-9 Контраст:** без новых зависимостей — функция WCAG relative luminance в тестовом хелпере (unit для токенов
  фракций и темы, e2e через `getComputedStyle`). Добавление `@axe-core/playwright` — только с согласия PO (стек зафиксирован).
- **TR-10 Debug-view:** `window.__boardDebug` при `kind:'handoff'` возвращает `null`/пустое, документировать формат.
- **TR-11 Детерминизм дат:** формат даты в списке — функция с инъекцией `now` (уже есть `formatRelativeTime`) для component-тестов.
- **TR-12 Defaults и маппер:** экспортировать `DEFAULT_SETUP` и чистую функцию `form → CreateSessionRequest` (без React),
  чтобы TC-U-03/TC-C-07 были unit.

## Ambiguities

Не решаются QA — переданы Analyst / лидам.

- **Q-1** Повтор с тем же ключом и телом: статус 200 (spec) — а тело? Снимок на момент создания или текущий view
  (после ходов/handoff)? Для human в handoff — handoff-view?
- **Q-2** `Idempotency-Key`: обязателен ли? Формат строго UUID (какой версии)? Невалидный → 400 или игнор?
  «То же тело» — сравнение сырого JSON, канонического или разобранного setup (опущенный `aiDifficulty` vs `'normal'`)?
  Ключ глобален или в пределах `gameId`? TTL?
- **Q-3** Порядок: ключ проверяется **до** валидации setup. Тот же ключ + невалидный setup после успешного создания → 409 или 400?
  Ключ, использованный в запросе, отклонённом 400/422, — сохраняется? (TC-I-22/23 предполагают «нет».)
- **Q-4** Гонка с одним ключом: проигравший получает 200 с тем же `sessionId` (ожидание QA) или 409?
- **Q-5** Ключ при повторе после ошибки: «один ключ на попытку отправки формы» — повтор после 500/сетевого сбоя — новая попытка
  (новый ключ, риск дубля при таймауте после коммита) или та же (тот же ключ)?
- **Q-6** `opponentType:'ai'` с `aiDifficulty:null` — 400 или default `'normal'`?
- **Q-7** `ruleset`/`gameMode` во входе обязательны (контракт) или имеют серверный default (PO defaults)?
- **Q-8** RotE + physical одновременно: какой `messageKey`, или оба в `details`?
- **Q-9** Статусы `setup|active|completed` сейчас недостижимы — нужны ли их UI-метки и тесты локалей? Меняется ли `prototype` когда-либо?
- **Q-10** Коды отказов: `END_TURN`/`ACCEPT_HANDOFF` в AI-партии; не-`ACCEPT_HANDOFF` при handoff от активной стороны —
  какой `messageKey`? Двигает ли `END_TURN` фазу/раунд и пишет ли событие в журнал?
- **Q-11** Существующий ключ `errors.notYourSide` (AI-партия, TC-API-19) vs новый `rebellion.errors:notYourTurn` — сохраняется
  ли старый для AI-партии? Что такое `actor` для human-партии и как клиент его определяет (`view.viewer`)? Останется ли
  `view.setup` в `kind:'player'` или заменён `settings` уровня ответа?
- **Q-12** Handoff-view `{kind, activeSide, round, phase, sessionStatus}` не содержит `version`, а `ACCEPT_HANDOFF` требует
  `expectedVersion` — откуда клиент берёт версию? Добавить `version` в handoff-view?
- **Q-13** Права на «Продолжить» и список для human-сессии в handoff: открывается заслонка — ожидаемо?
- **Q-14** AC-08 «перезапуск backend» в e2e: текущий `webServer`/`e2e-serve.mjs` пересоздаёт БД — достаточно ли integration
  (TC-I-24) + e2e reload/новый контекст, или нужен seam TR-6?
- **Q-15** «Секреты другой стороны» в hot-seat: кроме базы Повстанцев и скрытых фигур, есть ли у Империи скрываемые данные в mock?
- **Q-16** Апкастер: применяется при чтении (lazy) или SQL/скрипт-миграцией? Перезаписывается ли строка в v2 при чтении/записи?
  Где хранится `schemaVersion` (state JSON / колонка)? `SessionEvent.actor = 'rebellion'` — мигрируется в БД или апкастится при чтении?
- **Q-17** Для мигрированных human-сессий: `activeSide = playerFaction`, `handoffPending = false` — подтвердить.
- **Q-18** Язык e2e и скриншотов: config `locale: 'en-US'`, PO — ru по умолчанию. Скриншоты в ru, en или оба?
  Текстовые ожидания («AI играет за Империю») проверять в ru?
- **Q-19** Defaults «при каждом открытии формы»: включая browser back/forward? При AI → human → AI сложность возвращается к `normal`
  или к ранее выбранной?
- **Q-20** `SessionSummary.details: Record<string, string|number|boolean>` не допускает `null`, а `aiDifficulty` для human = `null` —
  менять тип платформы или опускать ключ?
- **Q-21** «Прототип на странице игры» (AC-13): только в элементах списка или ещё и отдельным бейджем на странице?
- **Q-22** D-1: AC-11 требует 1024, UX — 1024 и 768. Какой минимум обязателен?
- **Q-23** Контраст: допускается ли `@axe-core/playwright` (новая dev-зависимость, стек зафиксирован)? Требование контраста к
  disabled-опциям «скоро» (WCAG их исключает)?
- **Q-24** Публичные `settings` в `GET /api/sessions/:id` во время handoff — допустимы (не секрет)? Ожидание QA: да.
- **Q-25** Размер/срок хранения `Idempotency-Key` и поведение при удалении сессии (удаления сейчас нет) — вне scope?
