# Specification — SWR-004 Game Setup & Factions (Star Wars: Rebellion)

## Business goal
Полноценный, понятный и быстрый сценарий: каталог → Star Wars: Rebellion → «Новая партия» → сторона, тип противника,
сложность AI, набор правил, режим → «Начать игру» → игровой стол → продолжение после перезапуска. Настройки сохраняются
сервером, сервер сам определяет сторону противника и отклоняет неподдерживаемые комбинации; прототипное состояние
явно обозначено. Для двух людей на одном устройстве — безопасная передача хода без раскрытия скрытой информации.

## Фактическое состояние кода (проверено Analyst, 2026-11-08, после SWR-003)
- Есть: каталог, `/games/:gameId`, `/games/:gameId/new` (Rebellion SetupScreen: сторона, AI/человек, сложность), `/sessions/:sessionId`,
  `POST/GET /api/sessions`, `GET /api/sessions/:id`, команды; Prisma `Session { id, gameId, setup JSON, state JSON, version }`; сохранение/восстановление; e2e 50.
- Отличия от требований PO:
  - фракции называются `empire | rebellion` (44 файла, ~84 вхождения `'rebellion'`) — PO требует `rebels | empire`;
  - setup = `{ humanFaction, opponent: { kind, difficulty? } }` — PO: `playerFaction, opponentType, aiDifficulty|null, ruleset, gameMode`, сервер вычисляет `opponentFaction`;
  - сторона по умолчанию не выбрана — PO: Повстанцы; нет `ruleset`, `gameMode`, статуса сессии, защиты от дублей на сервере;
  - соперник-человек не может ходить (A-2 SWR-002) — PO: hot-seat с безопасной передачей хода;
  - D-1 из SWR-003: верхняя панель стола переполняется на ширине ≤ 1024 px.
- Зависимости SWR-002/SWR-003 выполнены; недостающих зависимостей нет.

## Scenarios
1. **Стандартная AI-партия.** Каталог → Rebellion → «Новая партия» → по умолчанию Повстанцы, AI (Империя), Нормальная, Base, Digital → «Начать игру» → `/sessions/:id` → стол с пометкой «Прототип».
2. **За Империю.** Выбор карточки Империи → подпись противника меняется на «AI играет за Повстанцев».
3. **Против человека.** «Второй игрок за этим устройством» → сложность скрыта → сессия с `aiDifficulty = null`; на столе — передача хода.
4. **Передача хода (hot-seat).** Игрок A нажимает «Передать ход» → экран-заслонка «Передайте устройство игроку за Империю» без карты и секретов → игрок B подтверждает «Я — Империя» → видит своё представление. Сервер принимает команды только от активной стороны.
5. **Продолжение.** Страница игры: «Продолжить» + список (сторона, тип противника, статус, дата) → открыть сессию; после перезапуска backend и браузера всё на месте.
6. **Ошибки.** Отказ сервера → форма остаётся, понятное сообщение, кнопка снова активна, повтор работает. Двойной/быстрый клик → одна сессия.

## Contract (frozen before parallel work)

### Rebellion: фракции и настройки (`@bga/game-rebellion/schema`)
```ts
type FactionId = 'rebels' | 'empire';                 // переименование 'rebellion' → 'rebels' везде (код, данные, i18n, e2e)
type OpponentType = 'ai' | 'human';
type AIDifficulty = 'easy' | 'normal' | 'hard';
type GameRuleset = 'base' | 'rise-of-the-empire';      // доступен только 'base'
type GameMode = 'digital' | 'physical_companion';      // доступен только 'digital'
function opponentOf(f: FactionId): FactionId;           // чистая функция, без React

// Вход клиента (setup в POST /api/sessions) — strict, лишние поля (aiFaction, opponentFaction) → 400
RebellionSetupInput = { playerFaction; opponentType; aiDifficulty?; ruleset; gameMode }
// Сохраняемая форма (вычисляет сервер)
RebellionSettings = { playerFaction; opponentFaction; opponentType; aiDifficulty: AIDifficulty | null; ruleset; gameMode }
```
- Правила валидации (сервер — источник истины, клиент повторяет для UX):
  - `opponentType: 'ai'` → `aiDifficulty` по умолчанию `'normal'`; `opponentType: 'human'` → `aiDifficulty` должен отсутствовать или быть `null` → хранится `null` (иначе 400).
  - `ruleset: 'rise-of-the-empire'` или `gameMode: 'physical_companion'` → **422 `SETUP_UNSUPPORTED`** (`rebellion.errors:rulesetUnavailable` / `rebellion.errors:modeUnavailable`).
  - Неизвестные значения / лишние поля → 400 `VALIDATION`. Одинаковые фракции невозможны: `opponentFaction` клиент не передаёт, сервер вычисляет `opponentOf(playerFaction)`.
- **Реестр фракций (визуальные метаданные, без логики)** — `@bga/game-rebellion/assets`: `factions: Record<FactionId, { id, nameKey, shortNameKey, taglineKey, emblemSvg, color, onColor }>` — только собственная графика.
- **Совместимость данных:** сохранённые сессии SWR-002/003 (setup `{humanFaction, opponent}`, фракция `'rebellion'` в state/events) читаются через апкастер модуля Rebellion (`schemaVersion` 1 → 2): `rebellion→rebels`, `humanFaction→playerFaction`, вычисление `opponentFaction`, `ruleset: 'base'`, `gameMode: 'digital'`. Данные не теряются; тест на снимке SWR-003.

### Платформа (`@bga/platform`) — обобщённо, без знаний о фракциях
- `SessionStatus = 'setup' | 'prototype' | 'active' | 'completed'`; колонка `Session.status`; модуль игры задаёт начальный статус (Rebellion на mock-сценарии → `'prototype'`); существующие строки → `'prototype'`.
- `SessionResponse = { sessionId, gameId, status, settings, view }`; `SessionSummary` + `status`; `settings` и `details` — публичные данные, которые отдаёт модуль игры (`publicSettings(setup)`, `summarize(state)`), платформа их не интерпретирует.
- **Идемпотентность создания:** заголовок `Idempotency-Key` (UUID) в `POST /api/sessions`; `Session.idempotencyKey` (unique, nullable). Повтор с тем же ключом и тем же телом → тот же `sessionId` (200); тот же ключ с другим телом → 409 `IDEMPOTENCY_KEY_REUSED`. Клиент генерирует один ключ на попытку отправки формы.
- Новые коды: `SETUP_UNSUPPORTED` (422), `IDEMPOTENCY_KEY_REUSED` (409), `TURN_NOT_YOURS`? — нет: команда не от активной стороны → существующий 422 `ILLEGAL_COMMAND` с ключом игры.
- Порядок проверок `POST /api/sessions`: 400 форма → 404 игра → 422 `GAME_UNAVAILABLE` → идемпотентность → 400 setup (схема игры) → 422 `SETUP_UNSUPPORTED`.

### Hot-seat (Rebellion, архитектурная основа)
- State: `activeSide: FactionId`, `handoffPending: boolean`. AI-партия: `activeSide = playerFaction` всегда, `handoffPending = false`.
- Human-партия: команда `END_TURN` (mock, «Передать ход») → `activeSide = opponentOf(activeSide)`, `handoffPending = true`; команда `ACCEPT_HANDOFF` (actor = новая активная сторона) → `handoffPending = false`.
- Представление: `PlayerView` становится union `{ kind: 'player', viewer: FactionId, ... } | { kind: 'handoff', activeSide, round, phase, sessionStatus }`.
  При `handoffPending = true` сервер отдаёт **только** `kind: 'handoff'` (без систем, объектов, журнала, legalActions). В обычном состоянии — view для `activeSide`.
- Команды принимаются только от `activeSide` (иначе 422 `rebellion.errors:notYourTurn`), при `handoffPending` — только `ACCEPT_HANDOFF`.
- Клиент: при получении `kind: 'handoff'` заменяет кэш view, сбрасывает выбор/drag/viewport-стор доски и показывает заслонку без карты; `window.__boardDebug` не отдаёт данных во время заслонки.
- Ограничение: без аутентификации подтверждение «Я — Империя» — доверительное (один физический стол); честно описать.

### API (адаптация существующего)
| Method | Path | Изменения |
|---|---|---|
| POST | `/api/sessions` | body `{ gameId, setup: RebellionSetupInput }` (адаптация `CreateGameSessionRequest` PO к платформенной рамке), заголовок `Idempotency-Key`; ответ `201 { sessionId, gameId, status, settings, view }` |
| GET | `/api/sessions[?gameId=]` | `SessionSummary` + `status`; Rebellion `details`: `playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase` |
| GET | `/api/sessions/:id` | `{ sessionId, gameId, status, settings, view }` |
| POST | `/api/sessions/:id/commands` | + `END_TURN`, `ACCEPT_HANDOFF` (только human-партии) |

### UX (экран `/games/star-wars-rebellion/new`)
- Порядок: заголовок «Новая партия» → две визуальные карточки фракций (эмблема, название, слоган; выбранная выделена рамкой + галочкой + текстом «Выбрано», не только цветом; radiogroup) → переключатель противника (AI / второй игрок за этим устройством) с подписью «AI играет за …» / «Второй игрок играет за …» → сложность (только AI) → набор правил (Base выбран; «Rise of the Empire — скоро», disabled) → режим (Цифровая партия выбран; «С физическими компонентами — скоро», disabled) → «Начать игру».
- Defaults (AC-02) при каждом открытии формы; кнопка блокируется на время запроса (spinner, `aria-busy`), ошибка — inline-сообщение (`role="alert"`) с понятным текстом, значения формы сохраняются.
- Desktop-first, корректно на 375–768 px (карточки фракций в столбик), клавиатура: Tab/стрелки по radiogroup, Enter/Space.
- Страница игры: в списке сессий — сторона, тип противника (+сложность), статус («Прототип»), дата изменения.
- Стол: бейдж «Прототип: тестовая расстановка, не правила оригинальной игры» (заменяет/дополняет MOCK), для human-партии — «Передать ход» и заслонка.
- D-1: верхняя панель стола не переполняется на 1024 и 768 px.

## Acceptance criteria (testable)
- **AC-01:** Из каталога → страница Rebellion → «Новая партия» открывает `/games/star-wars-rebellion/new`.
- **AC-02:** При открытии формы выбраны: Повстанцы, AI, Нормальная, Base, Digital; показано «AI играет за Империю».
- **AC-03:** Выбор Империи меняет подпись на «AI играет за Повстанцев» и обратно; созданная сессия: `settings.opponentFaction = opponentOf(playerFaction)`.
- **AC-04:** Human: блок сложности скрыт; в сессии `settings.aiDifficulty = null`, `opponentType = 'human'`.
- **AC-05:** Клиент не даёт выбрать недоступные ruleset/mode; сервер отклоняет: `rise-of-the-empire`/`physical_companion` → 422 `SETUP_UNSUPPORTED`, лишние поля (`aiFaction`, `opponentFaction`), неизвестные значения, `aiDifficulty` при human → 400.
- **AC-06:** Сервер возвращает уникальный `sessionId`, сессия (настройки, статус, state) в БД.
- **AC-07:** Успех → `/sessions/:sessionId`; ошибка → остаёмся на форме, видим сообщение, повтор работает.
- **AC-08:** После перезапуска backend и обновления браузера сессия и параметры доступны (`GET /api/sessions/:id` после нового экземпляра приложения на том же файле БД).
- **AC-09:** Ранее созданная партия открывается со страницы игры; в списке видны сторона, тип противника, статус, дата.
- **AC-10:** Загрузка, пустой список, ошибка сервера отображаются; быстрые повторные нажатия создают одну сессию (клиентская блокировка + серверная идемпотентность по `Idempotency-Key`).
- **AC-11:** Проверено в браузере на 1440×900 и 375×812 (и 1024 для стола); всё основное доступно с клавиатуры; скриншоты.
- **AC-12:** Игровая логика (`opponentOf`, валидация, правила, hot-seat) не зависит от React; Session API платформы не содержит знаний о фракциях/ruleset; ESLint/check:bundle остаются зелёными.
- **AC-13:** Сессия на mock-сценарии имеет `status = 'prototype'`; UI показывает «Прототип» на столе, странице игры и в списке.
- **AC-14:** (hot-seat) В human-партии после «Передать ход» ответ сервера не содержит систем/объектов/журнала/legalActions; команды чужой стороны → 422; после подтверждения новая сторона видит своё представление; скрытая информация противника не раскрывается.
- **AC-15:** (миграция данных) Существующие сессии SWR-002/003 открываются и продолжаются: фракции `rebels/empire`, настройки с `ruleset: 'base'`, `gameMode: 'digital'`, `status: 'prototype'`.

## Assumptions
- `CreateGameSessionRequest` PO адаптирован к платформенной рамке `{ gameId, setup }` (SWR-003) — без дублирования API.
- Метаданные сессии — колонки платформы (`status`, `idempotencyKey`) + настройки игры в `setup` JSON; полное состояние — `state`; представление — `PlayerView` (три слоя, как просит PO).
- React Hook Form не используется в проекте → не добавляется; валидация формы — Zod-схема игры + состояние компонента.
- Hot-seat «подтверждение стороны» доверительное (нет аутентификации).
- Debug-view (`window.__boardDebug`) — только `DEV`/`VITE_E2E`, отсутствие в production проверяет `check:bundle`.

## Risks
- Переименование фракции затрагивает данные, i18n и e2e → отдельный первый шаг с зелёными гейтами.
- Union `PlayerView` затрагивает стол → тесты стола, e2e и проверка утечек.

## Out of scope
См. `request.md` (полные правила, AI Commander, RotE, physical mode, сетевой мультиплеер, AWS).

## Clarifications (Analyst, 2026-11-08) — ответы на Q-1..Q-25 из `test-cases.md`
| # | Решение |
|---|---|
| Q-1 | Повтор с тем же ключом и тем же телом → **200** с тем же телом ответа, что и при создании (текущее состояние сессии), заголовок `Idempotent-Replay: true`. |
| Q-2 | Ключ необязателен (без ключа — обычное создание); формат UUID (иначе 400); «то же тело» = совпадение нормализованного JSON `{gameId, setup}` (хэш SHA-256 хранится рядом с ключом). |
| Q-3 | Ключ проверяется после 400 формы/404/422 игры и **до** валидации setup; ключ сохраняется только при успешном создании — запросы с 400/422 ключ не «сжигают». |
| Q-4 | Проигравший в гонке (unique violation) получает тот же ответ, что и повтор (200 + существующая сессия), если тело совпадает; иначе 409 `IDEMPOTENCY_KEY_REUSED`. |
| Q-5 | Новая попытка отправки формы после ошибки — **новый** ключ; повтор одной и той же попытки (двойной клик/сетевой ретрай) — тот же ключ. |
| Q-6 | `opponentType: 'ai'` + `aiDifficulty: null` → 400 (null допустим только для human). |
| Q-7 | `ruleset` и `gameMode` обязательны во входе (клиент всегда шлёт; сервер не подставляет). |
| Q-8 | Оба недоступны → 422 `SETUP_UNSUPPORTED` с первым по порядку ключом (`rulesetUnavailable`), в `details.unsupported` — список полей. |
| Q-9 | Метки для всех 4 статусов есть в i18n (setup/prototype/active/completed); сейчас достижим только `prototype`. |
| Q-10 | `END_TURN`/`ACCEPT_HANDOFF` в AI-партии → 422 `rebellion.errors:handoffNotAvailable`; `END_TURN` фазу не меняет (mock). |
| Q-11 | `errors.notYourSide` остаётся для actor ≠ участник партии; `rebellion.errors:notYourTurn` — для участника, который не активная сторона. Клиент шлёт `actor = view.viewer` (player) или `activeSide` (handoff). `view.setup` заменяется на `settings` в ответе сессии (во view setup не нужен). |
| Q-12 | Handoff-view содержит `version` (публичные метаданные: version, round, phase, activeSide). |
| Q-13 | «Продолжить» human-партии в состоянии handoff открывает заслонку — ожидаемо. |
| Q-14 | AC-08 «перезапуск backend» проверяется интеграционным тестом (новый экземпляр приложения на том же файле БД) + ручной проверкой Analyst/QA через `pnpm dev`; e2e не перезапускает сервер. |
| Q-15 | В mock у Империи нет других секретов; hidden-механика симметрична (Q-2 SWR-002). |
| Q-16 | Апкаст ленивый при чтении (`parseState`/`parseSetup` в модуле игры), `schemaVersion` — поле в state и settings; при следующей записи сохраняется v2; `actor` в `SessionEvent` (зеркало) не переписывается в БД, при чтении журнала нормализуется апкастером. SQL-миграция только для колонок платформы. |
| Q-17 | Мигрированные human-партии: `activeSide = playerFaction`, `handoffPending = false`. |
| Q-18 | Тексты в e2e не проверяются (только testids); скриншоты делаются в ru (язык по умолчанию), одна en-копия формы для проверки локализации. |
| Q-19 | Defaults применяются при каждом монтировании экрана (в т.ч. back/forward); при переключении human → ai сложность возвращается к последней выбранной на этом экране (по умолчанию `normal`). |
| Q-20 | `SessionSummary.details` допускает `null`-значения (поправка платформы). |
| Q-21 | «Прототип» — чип статуса в строке сессии и в «Продолжить», плюс бейдж на столе. |
| Q-22 | D-1: обязательно 1024 и 768; 375 — стол не обязан быть удобен (desktop-first), но без горизонтального скролла страницы. |
| Q-23 | `@axe-core/playwright` не добавляем (стек фиксирован); контраст — свой helper по WCAG + ручная проверка. |
| Q-24 | `settings` публичны и во время handoff (не секретны). |
| Q-25 | Ключи идемпотентности хранятся вместе с сессией бессрочно (колонка сессии). |

## Decisions after TECH_PLANNING (Analyst, 2026-11-08)
- **Accepted:** AM-BE-1 (handoff view has `id` and `version`), AM-BE-2 (`settings` instead of `setup` in view), AM-BE-3 (new `ServerGameModule` signatures), AM-BE-4 (`idempotencyHash`), AM-BE-5 (typeKeys renamed to `rebels`), AM-BE-6 (error keys incl. `handoffPending`), AM-BE-7 (body comparison ignores key order only), AM-BE-8; AM-FE-3 (`TableScreenProps.status`, `SessionEnvelope.status/settings`), AM-FE-9 (`describeSession` may return parts).
- **Q-5 refined (closes FE accepted-risk):** a retry after a *network* failure with no server response reuses the same `Idempotency-Key`; a new key is generated only after the server returned a definitive response (4xx/5xx) or the user changed the form.
- **OQ-1:** on the handoff screen focus goes to `handoff-title` (not to the accept button) — prevents player A from accepting for player B with a stray Enter; QA updates TC-VA-12.
- **OQ-2:** keep existing `game-recent-loading` / `game-recent-empty` testids.
- **OQ-4:** ruleset and mode are not shown in the session row while only one value is selectable.
- **TC-A-04 grep:** exclude the i18n namespace prefix `rebellion` (`REBELLION_I18N_PREFIX`) — it is a namespace, not a faction.
- **No git worktrees** (SWR-003 is uncommitted — a worktree would start without it): all workers run in this working tree, in the order of `implementation-plan.md`, with non-overlapping OWNED FILES.
- **Dev DB backup** before SWR-004 migration: `apps/api/prisma/dev.pre-swr004.db` (made by Analyst; sha256 matches `dev.db`).
- **Accepted deviation (W-API):** a malformed `Idempotency-Key` header is rejected with 400 before the 404/422 game checks — it is a request-format error, same class as the body-form 400 that already precedes 404. A *valid* key is still evaluated after 404/422 per Q-3.
- **Focus ring (Analyst, after INTEGRATION):** contained buttons get the same visible focus outline with offset as other controls (WCAG 2.4.7); contrast of a ring drawn with `outline-offset` is measured against the surrounding background, not the element's fill — QA fixes `expectVisibleFocus` accordingly.
- **Review fixes (Analyst, after CODE_REVIEW approved):** (#1) single source of truth for settings — `Session.setup` is rewritten in v2 form whenever the state is written, and the service asserts `publicSettings(setup)` equals `state.settings` (500 INTERNAL on mismatch, logged by sessionId); (#2) a 2xx response with an unparseable body keeps the `Idempotency-Key` for the retry (the server may have created the session); (#3) one pure `canonicalJson` in `@bga/platform`, used by web and api; (#4) document in `adding-a-game.md` that any reader of `SessionEvent` rows must use the game's event upcaster.
