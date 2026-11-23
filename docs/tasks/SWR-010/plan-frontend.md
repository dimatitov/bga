# Plan (frontend) — SWR-010 Card Foundation & Physical Table Sync v0

Frontend Lead, TECH_PLANNING, 2026-11-23. Входы (обязательные): `specification.md` (AC-19..AC-23, S-1..S-8, C-1..C-11,
D-4..D-6, A-9, A-10), `plan-backend.md` (§3.2–3.3, §4, §5, §9 Wire/API, §11 контракты, §16 решения Analyst — **wire
заморожен**, FE не придумывает серверных полей), `test-cases.md` (группы HAND, DET, PX, SET, RST, BND, LK-14/16/18/19,
OLD-06, «Testability requirements»), SWR-009 (`implementation-plan.md` K-1..K-9, UI Kit `apps/web/src/shared/ui/terminal`,
рейл консоли `apps/web/src/games/rebellion/core-v1/**`, design source `docs/tasks/SWR-009/artifacts/design-source`).

Статус: **всё ниже — запланировано**. На этом этапе выполнено только чтение кода ветки `swr-009-vector-terminal`
(`f3619a1`); код не менялся, команды проверок (`pnpm …`) не запускались.

## 0. Факты кода, на которые опирается план

| Факт | Где | Следствие для FE |
|---|---|---|
| Рейл консоли: `TurnPanel → [data-rail-keys] TurnControls → [data-rail-inspector] UnitInspector → [data-rail-tabs]` (Log · Objects · Game); неактивные вкладки остаются в DOM (`hidden`) | `core-v1/sidebar/CoreSidebar.tsx` | режим Physical Execution подменяет **слот задачи и ряд клавиш**; Card Hand — **новая вкладка** `cards` |
| Flex-правила рейла адресуют `& > [data-testid="turn-panel"]` | `CoreSidebar.tsx` | PX-модуль получает те же правила по своему testid, `TurnPanel` не меняется |
| `SidebarTab = 'log' \| 'objects' \| 'game'` в общем (mock+core) сторе | `board/model/selectionStore.ts` | += `'cards'`; mock-сайдбар перечисляет свои вкладки сам — не затронут |
| `useSendCommand`: `expectedVersion` из кэша в момент отправки; второй `send` во время запроса → `IGNORED` (синхронный `inFlight` ref); 409/404 → invalidate detail; 200 → `commitCommandResult` | `table/hooks/useSendCommand.ts` | `CONFIRM_TABLE_TASK`/`REGISTER_CARD` идут **тем же** путём; защита от двойного клика = ref + `disabled` |
| `isPending` контекста = команда в полёте **или** run автоматизации | `core-v1/model/aiCommander.ts` (`coreAutomationFlags`), `CoreTable.tsx` | все кнопки стола блокируются тем же флагом |
| Ошибки 422 показываются inline (`inlineError`), 409/сеть — snackbar | `core-v1/panels/useTurnCommands.ts` | переиспользуем `inlineError`, `responseAnnouncements`, `aiSummaryText` (экспортированы) |
| База для UI — **только** `visibleRebelBaseSystemId(view)` (карта, панель системы, манифест, Game info, debug) | `core-v1/model/viewModel.ts:288` | «база не зарегистрирована» = одна правка селектора (§5.3) |
| Исчерпывающие тексты журнала по типам событий проверяет `locales.i18n.test.ts` по `CoreViewEventSchema`; ошибки — по `REBELLION_ERROR_MESSAGE_KEYS` | `games/rebellion/locales.i18n.test.ts` | после W2 web-тесты красные, пока не добавлены 3 лог-текста и 7 ошибок → подзадача **FE-0** сразу после W2 |
| `GameModePicker` = `AvailabilityPicker` с одним `isAvailable(value)` и одним «скоро»-пояснением | `setup/components/*.tsx` | нужна причина недоступности по значению («только против AI») |
| `validateSetup` вызывает `unsupportedSetupFields(parsed.data)` — у W2 сигнатура `Pick<…, 'ruleset' \| 'gameMode' \| 'opponentType'>` | `setup/model/toSetupInput.ts` | код работает без правки сигнатуры; меняется только поведение для `physical_companion` |
| i18n: `games/<g>/locales/<lng>/<area>.json` → ns `rebellion.<area>` подхватывается glob-ом автоматически | `shared/i18n/i18n.ts` | новые ns `rebellion.cards`, `rebellion.table` — просто новые файлы |
| `check:bundle`: модульная проверка запрещает модули игры вне `definition/schema/board/assets`; модули `@bga/platform` не проверяются | `scripts/check-web-bundle.mjs` (`WEB_GAME_SUBPATHS`) | нужно новое правило для движка карт платформы (§12) |
| ESLint B-8: web импортирует из игры только `definition/schema/board/assets` | `eslint.config.mjs` (`GAME_NOT_WEB`) | + запрет `@bga/platform/cards` в `apps/web` (§12) |
| Скриншоты: `saveScreenshot(page, name, task)`; в `docs/tasks/<task>/…` пишет только если `task === SCREENSHOT_TASK ?? CURRENT_SCREENSHOT_TASK` (сейчас `'SWR-006'`) | `e2e/support/board.ts:386` | SWR-010-спеки передают `'SWR-010'` явно; прогон evidence — `SCREENSHOT_TASK=SWR-010` (§11.4) |
| Сид базы и порядка колоды = `sessionId` (публичный, в URL) | `server/rebellion-server-module.ts:36`, `rules/core/base.ts` | вопрос FQ-1 (вне FE, но влияет на AC-23 по существу) |

## 1. Зоны изменений и границы

```text
apps/web/src/games/rebellion/
  core-v1/cards/          NEW  Card Hand, Card Detail, модели руки/каталога, cardUiStore           (FE-A)
  core-v1/table/          NEW  Physical Execution: модель очереди, панель, клавиши, регистрация     (FE-B)
  core-v1/sidebar/CoreSidebar.tsx, core-v1/CoreTable.tsx   режим консоли + вкладка cards        (FE-B)
  core-v1/model/viewModel.ts   visibleRebelBaseSystemId / baseRegistrationPending                (FE-B)
  core-v1/sidebar/coreLogMessage.ts   3 новых события журнала                                   (FE-A, FE-0)
  setup/**                     physical_companion против AI                                      (FE-C)
  locales/{ru,en}/{data,match,errors}.json (FE-A) · cards.json (FE-A) · table.json, board.json (FE-B) · setup.json (FE-C)
  test/coreFixtures.ts (FE-A, FE-0) · test/cardFixtures.ts (FE-A) · test/tableFixtures.ts (FE-B)
scripts/check-web-bundle.mjs (+ .test.mjs), eslint.config.mjs (только WEB-ограничения)           (FE-C)
e2e/**                                                                                           (E2E-SYNC, qa-worker)
```

**Не меняются FE:** `packages/**` (контракты BE §11 — только чтение), `apps/api/**`, `@bga/platform` web-контракты
(`useSessionAutomation`, `commitCommandResult`, `AutomationNotice`), `useSendCommand`, тема/токены/UI Kit SWR-009
(K-1..K-4), `coreUiStore` (K-6), `TurnPanel`/`TurnControls`, Konva-слои, mock-v1 стол. **Новых цветов/hex, шрифтов,
изображений карт нет** — только компоненты UI Kit и `terminalTokens`.

**Правила, которые FE соблюдает буквально:**
1. Источник истины — `view.cards` / `view.table` / `view.legalActions` из кэша сессии. Ничего скрытого FE не вычисляет и
   не «додумывает» (нет восстановления колоды, нет вывода базы, `view.rebelBase` в `core-v1/{cards,table}/**` не читается).
2. Публичный каталог (`REBELLION_CARD_CATALOG`, `REBELLION_CARD_ZONES`, `TABLE_STEP_KEYS`, `TABLE_TASK_KINDS` из
   `@bga/game-rebellion/schema`) — единственный источник названий/типов/источников/статусов карты.
3. Команды — только `CONFIRM_TABLE_TASK { taskId }` и `REGISTER_CARD { zoneId, definitionId }` (значения берутся из
   `view.table`), через существующий `send` с `expectedVersion` из кэша. Никаких новых эндпоинтов.

## 2. Архитектура консоли: режимы и место карточного UI

### 2.1 Режим консоли (selector, без локального состояния)

```ts
// core-v1/table/model/tableModel.ts
export type ConsoleMode = 'turn' | 'physical';
export function consoleMode(view: PlayerViewCore): ConsoleMode {
  return view.table !== null && view.table.tasks.length > 0 ? 'physical' : 'turn';
}
```

Режим — чистая функция view: после перезагрузки страницы/сервера он восстанавливается сам (GET отдаёт тот же
`view.table`, AC-14/AC-21, TC-PX-06/TC-RST-04). Конец партии не выключает режим (C-5: подтверждения разрешены после
`outcome`); `OutcomeBanner` остаётся оверлеем карты.

### 2.2 Рейл в каждом режиме (K-7 SWR-009 сохраняется, меняется только содержимое двух слотов)

| Слот рейла | `turn` (как сейчас) | `physical` |
|---|---|---|
| модуль задачи | `TurnPanel` (`turn-panel`) | `PhysicalExecutionPanel` (`physical-execution`) |
| `[data-rail-keys]` | `TurnControls` | `TableTaskKeys` («Выполнено на столе»; пусто для задачи `registerBase` → строка скрыта `:empty`) |
| `[data-rail-inspector]` | `UnitInspector` | `UnitInspector` (выбор на карте работает только как просмотр: `legalActions = []`) |
| вкладки | Log · **Cards** · Objects · Game | то же |

- Вкладка **Cards** (`sidebar-tab-cards`, панель `sidebar-panel-cards`) вставляется второй: `['log','cards','objects','game']`.
  На 375 px четыре вкладки `variant="fullWidth"` (≈87 px каждая) — если RU-подписи не помещаются, FE-B переключает на
  `variant="scrollable"` (`allowScrollButtonsMobile`); проверка — TC-HAND-05 (нет горизонтального скролла страницы).
- `CoreSidebar`: правила flex для модуля задачи применяются к `& > [data-testid="turn-panel"], & > [data-testid="physical-execution"]`;
  у PX-модуля `maxHeight: '55dvh'` (≥ 900 px; задача + форма регистрации), внутри — `overflowY: auto`. Ни один режим не
  даёт переполнения рейла на 1024×768 (существующий `e2e/core-fit.spec.ts`).
- `< 900 px`: ряд клавиш остаётся sticky внизу (как в SWR-009) — «Выполнено на столе» досягаема на 375 px.
- `CoreTable` добавляет на `game-table` атрибуты `data-console-mode="turn|physical"` и `data-cards-tracked="true|false"`.

### 2.3 Переходы режима: фокус и озвучивание

Хук `useConsoleModeFocus(mode)` (FE-B, `core-v1/table/useConsoleModeFocus.ts`), срабатывает только на **смене** режима
после монтирования (первый рендер фокус не трогает — им владеет `RouteFocus`/`focusHeading`):

- `turn → physical` (например, пас человека запустил Refresh): фокус на заголовок PX-модуля `PX_TITLE_ID`,
  `announce(«Задача стола: <title>»)`;
- `physical → turn` (подтверждена последняя задача, AI не создал новых): фокус на `TURN_TITLE_ID`, озвучивание итогов
  ответа (`aiSummaryText` + `responseAnnouncements`) делает `useTableCommands` (§4.3), хук — только фокус.

## 3. Компоненты и props

Все компоненты — `function`-компоненты без собственных запросов; данные — `useCoreBoard()` (view, send, isPending).
Стили — `sx` с `terminalTokens`; UI Kit: `TerminalModule`, `KeyButton`, `StatusBadge`, `Led`, `Readout`, `StatusCard`.

### 3.1 Card Hand / Card Detail (FE-A, `core-v1/cards/`)

| Компонент | Props | Что делает | testid / a11y |
|---|---|---|---|
| `CardHandPanel` | — | Содержимое вкладки Cards. `view.cards === null` → `CardsNotTracked`. Иначе секции: «Ваши карты» (зоны владельца-зрителя), «Соперник» (только счётчики/публичное), «Общее» (счётчик колоды зондов, публичный список «убраны из игры (первая партия)»), «Пока не отслеживаются» (типы `deferred` каталога). Под списком — `CardDetail` выбранной карты. Вызывает `cardUiStore.reconcile(view)` в эффекте. | `card-hand` `data-tracked` `data-viewer`; секции `<h3>` |
| `CardsNotTracked` | — | «В этой партии карты не отслеживаются» + пояснение (партия создана до SWR-010) | `card-hand[data-tracked="false"]`, `card-hand-legacy` |
| `CardZoneSection` | `zone: ZoneModel; headingLevel?: 'h3' \| 'h4'` | Заголовок зоны (`rebellion.data:cards.zones.<id>`) + список `CardItem` (если `cards !== null`) или строка-счётчик | `card-zone-<zoneId>` `data-count` `data-visible="true\|false"` |
| `CardItem` | `definitionId: string; zoneId: string; authority: 'digital'\|'physical'; selected: boolean; onSelect(): void` | Кнопка-строка (`<button aria-pressed aria-controls="card-detail">`): название, тип (`StatusBadge neutral`), ключевой параметр (система → регион из `view.map`, если есть), доступность (`StatusBadge`), краткое собственное описание (`usageKeys[0]`) | `card-hand-item-<definitionId>` `aria-pressed` `data-zone` |
| `OpponentCounts` | `zones: ZoneModel[]` | Только `count` по каждой зоне соперника; карты показываются, лишь если сервер прислал `cards !== null` (раскрытая база/конец партии) | `card-hand-opponent-count` `data-count` (сумма) |
| `CardRegisterHint` | — | Только при `view.table?.registration != null` и зрителе = Повстанцы: зона Location «не зарегистрирована» + кнопка «Зарегистрировать карту базы» → `focusWhenReady(LOCATION_REGISTER_SELECT_ID)` (форма живёт в PX-панели). Единственная кнопка действия в руке (TC-HAND-04) | `card-hand-register` |
| `CardDetail` | `definitionId: string; zoneId: string; authority; onClose(): void` | §6. `role="region"`, `aria-labelledby` заголовок; при открытии фокус на заголовок (tabIndex −1) и `scrollIntoView({block:'nearest'})`; Esc внутри региона и «Закрыть» → `onClose` + фокус обратно на `card-hand-item-<id>` | `card-detail` `data-definition-id`; `card-detail-close`; **кнопки «Разыграть» нет** |

Локальное UI-состояние — `core-v1/cards/model/cardUiStore.ts` (Zustand, не копия view):

```ts
interface CardUiState {
  sessionId: string | null;
  selected: { definitionId: string; zoneId: string } | null;
  select(definitionId: string, zoneId: string): void;
  clear(): void;
  /** Drops the selection when the card is no longer visible to the viewer (moved, hot-seat viewer switch, new session). */
  reconcile(view: PlayerViewCore, sessionId: string): void;
}
```

### 3.2 Physical Execution (FE-B, `core-v1/table/`)

| Компонент | Props | Что делает | testid / a11y |
|---|---|---|---|
| `PhysicalExecutionPanel` | — | `TerminalModule` с меткой «Физический стол · задача 1 из N»; `TableTaskCard` головной задачи (`isHead`); статус ожидания; список следующих задач (только заголовки); inline-ошибка | `physical-execution` `data-head-kind` `data-queue-length` `data-ai-waiting`; заголовок `PX_TITLE_ID` |
| `TableTaskCard` | `task: TableTask; isHead: boolean` | Три блока (AC-21): «Что произошло» (`rebellion.table:px.happened.<kind>` + сторона-исполнитель), «Затронуто» (карты/лидеры/юниты/системы; `null`-система = «поле Rebel Base»), «Что сделать на столе» — `<ol>` шагов с номерами; для `completion: 'register'` вместо подтверждения — `LocationRegisterForm` | `table-task-<taskId>` `data-head` `data-kind`; `role="region"` |
| `TableTaskWaiting` | `aiWaiting: boolean` | `Led` (amber, мигание при `aiWaiting`, без мигания при reduced motion) + **текст** «AI ждёт подтверждения стола» / «Синхронизируйте стол, чтобы продолжить» (статус не только светодиодом, TC-PX-10) | `table-task-waiting` `data-ai-waiting`; `aria-live="polite"` |
| `TableTaskKeys` | — | В ряду клавиш: `KeyButton tone="primary"` «Выполнено на столе» для головы с `completion: 'confirm'`; `disabled={isPending}` + `aria-busy`; ничего для `register` | `table-task-confirm` |
| `LocationRegisterForm` | `registration: { zoneId: 'rebels-location'; eligibleDefinitionIds: string[] }` | `<form>`: выбор системы (MUI `TextField select` с native `<select>`: варианты = только `eligibleDefinitionIds`, подписи = названия систем, сортировка по локализованному имени, пустого значения по умолчанию нет → «Выберите систему»), кнопка «Зарегистрировать» → `RegisterConfirmDialog` → `REGISTER_CARD` | `location-register-select` (id `LOCATION_REGISTER_SELECT_ID`), `location-register-submit` |
| `RegisterConfirmDialog` | `open; systemName; onCancel(); onConfirm()` | Необратимое действие: «Зарегистрировать <система> как карту базы? Изменить нельзя.» Паттерн и фокус — как `PassConfirmDialog` (фокус на «Отмена») | `location-register-dialog`, `location-register-confirm` |

Регистрация в UI предлагается, когда задача `registerBase` — **голова** очереди (линейный порядок: сначала
`initialSetup`, потом регистрация). Сервер принимает её при любой позиции (AQ-7) — UI это не использует (FD-3).

## 4. Данные, команды, ошибки

### 4.1 Поток данных

```text
GET /api/sessions/:id  ─┐                                   ┌─ CardHandPanel ── handModel(view) ── catalog.ts
POST …/commands (200) ──┼─► TanStack Query detail cache ──► CoreTable (view) ─► CoreBoardContext ─┤
POST …/automation/run ──┘   (commitCommandResult)                               └─ PhysicalExecutionPanel ── tableModel(view)
                                                                                    │
           useTableCommands.confirm(taskId) / register(definitionId) ─► ctx.send(command) = useSendCommand
                                (actor = view.viewer, expectedVersion = cached view.version)
```

Селекторы (чистые, unit-тестируемые):

- `core-v1/cards/model/catalog.ts`: `cardDefinition(id)`, `cardType(typeId)`, `cardEffect(effectId)`, `deferredCardTypes()`,
  `systemOfCard(definitionId)` (= `definition.params.systemId`), Map-индексы по `REBELLION_CARD_CATALOG`.
- `core-v1/cards/model/handModel.ts`:
  ```ts
  export interface ZoneModel { id: string; kind: CardZoneKind; owner: string | null; authority: 'digital' | 'physical';
    count: number; cards: { instanceId: string; definitionId: string }[] | null; }
  export interface HandModel { tracked: boolean; viewer: FactionId; own: ZoneModel[]; opponent: ZoneModel[];
    deck: ZoneModel | null; removed: ZoneModel | null; locationState: 'registered' | 'notRegistered' | 'revealed' | 'none';
    deferredTypeIds: string[]; }
  export function handModel(view: PlayerViewCore): HandModel;
  ```
  Классификация только по полям `CardZoneView` (`owner`, `kind`, `visibility`, `cards`): `owner === viewer` → own;
  `owner === opponent` → opponent; `owner === null && kind === 'deck'` → deck; `owner === null && kind === 'removed'` → removed.
  `locationState = 'notRegistered'` ⇔ `view.table?.registration != null`. Id зон не захардкожены в логике (кроме этих
  правил), поэтому добавление зон в будущих задачах не ломает руку.
- `core-v1/table/model/tableModel.ts`: `consoleMode`, `tableTasks(view)`, `headTask(view)`, `isAiWaiting(view)`
  (= `view.table?.aiWaiting ?? false`), `registrationOf(view)`, `stepValues(t, step, view)`, `affectedItems(t, task, view)`.
- `core-v1/model/viewModel.ts` (FE-B): `baseRegistrationPending(view) = view.table?.registration != null`.

### 4.2 Команды и защита от двойной отправки (AC-21, TC-PX-04/05/09)

`useTableCommands()` (FE-B, `core-v1/table/useTableCommands.ts`), по образцу `useTurnCommands`:

```ts
export function useTableCommands(): {
  confirm(taskId: string): Promise<void>;          // CONFIRM_TABLE_TASK { taskId: headTask.id }
  register(definitionId: string): Promise<void>;   // REGISTER_CARD { zoneId: registration.zoneId, definitionId }
  isPending: boolean;                              // = ctx.isPending (команда или run AI в полёте)
  error: string | null;                            // inline-текст последнего 422 (inlineError), сброс при новой голове
}
```

Три уровня защиты: (1) `useSendCommand.inFlight` (синхронный ref) — второй клик/Enter до перерендера возвращает
`IGNORED` и не шлёт запрос; (2) `disabled={isPending}` на клавише и кнопке регистрации; (3) сервер: устаревшая версия →
409, свежая → 422 `tableTaskNotFound` (AC-12). `taskId` берётся из головы **в момент клика** из текущего view.

### 4.3 Ответы

| Ответ | Поведение |
|---|---|
| 200 | `commitCommandResult` уже записал view (могут быть новые задачи от хода AI в том же запросе). Озвучивание: `aiSummaryText(automation)` + `responseAnnouncements(...)` + «Следующая задача: <title>» или «Стол синхронизирован». Фокус: если режим остался `physical` — на `PX_TITLE_ID` (новая голова); иначе — §2.3. После `REGISTER_CARD` — «Карта базы зарегистрирована: <система>». |
| 409 / 404 / сеть | Как сейчас: refetch detail (`useSendCommand`), snackbar (`reportCommandFailure`); после refetch показывается актуальная голова (TC-PX-09). |
| 422 | `error = inlineError(t, outcome)` → `table-task-error` (`role="alert"`) под головной задачей. Тексты новых кодов — `rebellion.errors` (§8.4). `tableSyncPending` для любой другой команды человека (если всё-таки ушла) показывается существующим inline-путём `useTurnCommands` (TC-PX-07). |

Команды человека во время `physical`: `legalActions = []` (BE §5.7) → карта, пул лидеров и клавиши хода неактивны
существующим кодом; `TurnControls` в этом режиме не смонтирован.

## 5. Скрытая информация в UI

### 5.1 Принцип

UI показывает ровно то, что пришло во view: `cards === null` у зоны → только `count`. Никаких CSS-скрытий секретов (их нет
в данных). AI-отладка (dev-панель) не меняется — её содержимое определяет сервер (AC-23, TC-LK-14/16).

### 5.2 Что видит каждая сторона (рендер)

| Ситуация | Card Hand | Physical Execution |
|---|---|---|
| Человек-Повстанцы, `digital` | своя Location (название системы, «секретная, только у вас»); Империя — «зондов в руке: N»; колода — «N карт»; убраны из игры — 5 названий (публично, C-1) | — |
| Человек-Повстанцы, `physical`, до регистрации | Location: «Карта базы не зарегистрирована» + `card-hand-register`; **без** предварительной системы | `initialSetup` → `registerBase` (форма); на карте нет маркера базы (§5.3) |
| Человек-Империя | свои зонды (система, «базы здесь нет»); Повстанцы — «Location: 1 карта (скрыта)»; после раскрытия — карта из публичной зоны `rebels-base-revealed` | задачи с системами AI только из view; ход в базу = «поле Rebel Base» (`systemId: null`), заглушка Location (`placeLocationPlaceholder`) без системы |
| Человек-Повстанцы, Refresh AI-Империи | счётчик зондов Империи +2 | шаг `opponentDrewProbeCards{count}` — только число |
| Партия до SWR-010 (`cards: null`) | «В этой партии карты не отслеживаются» | режим `physical` невозможен (`table: null`) |
| mock-v1 | вкладки Cards нет (другой стол) | — |

### 5.3 «База не зарегистрирована» (AQ-4)

`visibleRebelBaseSystemId(view)` возвращает `null`, пока `baseRegistrationPending(view)`; иначе — как сейчас
`view.rebelBase.systemId`. Это одна точка: маркер базы на карте, «ваша база» в панели системы/манифесте, Game info и
`__coreBoardDebug.getRebelBaseSystemId()` перестают называть предварительную систему. `hiddenZone()` не меняется (он
смотрит на сырое `rebelBase.systemId`, у Повстанцев оно не `null` → скрытой зоны нет). `CoreGameInfoPanel` для этого
случая выводит «не зарегистрирована» вместо текста «неизвестно» (FE-B). Ограничение — FQ-2 (юниты «на базе» до
регистрации стоят в предварительной системе — так их ставит сервер).

### 5.4 Статическая гарантия

`grep -rn "rebelBase" apps/web/src/games/rebellion/core-v1/{cards,table} --include=*.ts --include=*.tsx | grep -v "\.test\."` → пусто
(DONE WHEN FE-A/FE-B). Тексты задач стола формируются только из `task.steps[].params` и `task.affected`.

## 6. Card Detail: содержимое (AC-20, S-8)

Все поля — из публичного каталога + зоны, в которой карта лежит во view:

| Поле | Источник | Рендер |
|---|---|---|
| Название | `definition.nameKey` (= `systems.<id>`) | `t('rebellion.data:' + nameKey)`, заголовок `h3` |
| Тип | `cardType(definition.typeId).nameKey` | `StatusBadge neutral` |
| Описание типа (собственное) | `cardType(...).descriptionKey` | абзац |
| Условия использования | `definition.usageKeys[]` | маркированный список |
| Поддерживаемая механика / эффект | `cardEffect(definition.effectId)`: `none` → `summaryKey` («Нет розыгрыша — справочная карта»); `not-implemented` → «Эффект не реализован в приложении»; `implemented` → `rebellion.cards:detail.mechanic.<mechanicId>` | `Readout` «Эффект» + `StatusBadge` (`neutral`/`amber`/`green`) |
| Где карта сейчас / доступность | `zoneId` → `rebellion.data:cards.zones.<zoneId>`; `authority: 'physical'` → «Физическая карта на вашем столе»; `digital` → «Ведётся приложением» | `Readout` |
| Источник правила | `definition.sources[]`: `kb` → id записи моноширинно (`rebellion:cards.probe`); `book` → «RR, с. 10 · Probe Cards» | список |
| Статус проверки | `definition.verification` → `rebellion.cards:verification.<v>`; `!== 'verified'` → `StatusBadge amber` «требует проверки» (TC-DET-04) | `StatusBadge` |

Кнопки «Разыграть» **нет** (ни активной, ни disabled): в v0 у всех карт эффект `none` (TC-DET-02 допускает отсутствие).
Текстов карт правообладателя нет — только собственные i18n-строки.

## 7. Setup: `physical_companion` (AC-22)

- `AvailabilityPicker` получает опциональный `unavailableReason?: (v) => { badgeKey: string; hintKey: string } | null`
  (вместо фиксированных «скоро»/`soonHintKey`, которые остаются значениями по умолчанию для RotE).
- `GameModePicker` получает `opponentType`; `isAvailable = (m) => isSupportedGameModeFor(m, opponentType)` (из
  `@bga/game-rebellion/schema`, W2). Для `physical_companion` + человек — бейдж «· только против AI», пояснение
  `rebellion.setup:newGame.modeAiOnlyHint`, `aria-disabled` (TC-SET-02).
- `SetupScreen.update('opponentType', 'human')` при `gameMode === 'physical_companion'` сбрасывает режим на `digital` и
  озвучивает «Режим с физическими компонентами доступен только против AI» (без ошибки формы). `validateSetup` остаётся
  второй линией (`modeUnavailable`).
- Под вариантом `physical_companion` (когда доступен) — одна строка пояснения: «Приложение ведёт колоды и подсказывает, что
  повторить на столе» (`rebellion.setup:newGame.modePhysicalHint`).
- `digital` остаётся по умолчанию (`REBELLION_SETUP_DEFAULTS`), RotE — «скоро» как раньше (TC-SET-05).

## 8. i18n (RU и EN, одинаковые наборы ключей)

### 8.1 Пространства имён и владельцы

| ns / файл | Что | Владелец |
|---|---|---|
| `rebellion.data` (`data.json`) | ключи **из каталога** (verbatim): `cards.types.*`, описания типов, `cards.zones.*`, `cards.effects.*`, `cards.usage.*`; имена карт — существующие `systems.*` | FE-A (FE-0) |
| `rebellion.table` (`table.json`, новый) | ключи **из задач** verbatim под объектом `table` (`t('rebellion.table:' + task.titleKey)`, `t('rebellion.table:' + step.key, values)`) + хром панели `px.*`, `register.*` | FE-B |
| `rebellion.cards` (`cards.json`, новый) | хром руки и детали | FE-A |
| `rebellion.match` (`match.json`) | `log.CARDS_DRAWN*`, `log.CARD_REGISTERED*`, `log.TABLE_TASK_CONFIRMED_<kind>` | FE-A (FE-0) |
| `rebellion.errors` (`errors.json`) | 7 новых кодов | FE-A (FE-0) |
| `rebellion.board` (`board.json`) | `sidebar.tab.cards` | FE-B |
| `rebellion.setup` (`setup.json`) | бейдж/пояснения режима | FE-C |

Точные строки ключей каталога берутся из полей каталога W2 (`nameKey`, `descriptionKey`, `usageKeys`, `summaryKey`), а не
из этого плана: тест FE-A обходит `REBELLION_CARD_CATALOG` и требует непустой ru/en текст для каждого. **Координация с W2:**
`descriptionKey` типа не может быть потомком `nameKey` (`cards.types.probe` — строка-лист), предложение —
`cards.typeInfo.<typeId>` (FQ-4).

### 8.2 `rebellion.data` — ожидаемые ключи (по plan-backend §3.2–3.3, §9)

`cards.types.{probe,mission,project,action,objective,tactic}` · `cards.typeInfo.{…6}` (если W2 примет FQ-4) ·
`cards.zones.{probe-deck,probe-box,rebels-location,rebels-base-revealed,empire-probes}` · `cards.effects.no-play` ·
`cards.usage.{probe-refresh-draw,probe-base-location}`.

### 8.3 `rebellion.table` — ключи задач и параметры интерполяции

`table.tasks.{initialSetup,registerBase,aiActivation,aiMove,refresh,baseRevealed}` и 14 шагов. FE переводит параметры
шага в значения (`stepValues`); `null`-система → `px.rebelBaseSpace` («поле «Rebel Base»»); списки — `Intl.ListFormat`
текущего языка; юниты — группировкой по типу («2× X-wing, 1× Пехота повстанцев») через существующие `unitLabel`/`view.unitTypes`:

| Шаг (`table.steps.*`) | params (BE §11.3) | значения в строке |
|---|---|---|
| `setupFirstGame`, `setAsideReferenceStack`, `placeLocationPlaceholder`, `registerBaseCard` | `{}` | — |
| `removeProbeCards`, `takeProbeCards` | `definitionIds[]` | `{{cards}}`, `{{count}}` |
| `placeLeader` | `leaderId`, `systemId\|null` | `{{leader}}`, `{{system}}` |
| `moveUnits` | `unitIds[]`, `fromSystemId\|null`, `toSystemId\|null` | `{{units}}`, `{{count}}`, `{{from}}`, `{{to}}` |
| `returnLeaders` | `leaderIds[]` | `{{leaders}}`, `{{count}}` |
| `opponentDrewProbeCards` | `count` | `{{count}}` (plural) |
| `advanceTime` | `from`, `to` | `{{from}}`, `{{to}}` |
| `revealBase`, `revealOwnBase`, `moveBaseUnits` | `systemId` | `{{system}}` |

Отсутствующий/неожиданный параметр → «—» (без падения; unit-тест). Хром: `px.label` («Физический стол · задача
{{n}} из {{total}}»), `px.happened.<kind>` (с `{{side}}`), `px.affected.{title,cards,leaders,units,systems}`, `px.doTitle`,
`px.next`, `px.confirm` («Выполнено на столе»), `px.waiting.ai` («AI ждёт подтверждения стола»), `px.waiting.you`,
`px.rebelBaseSpace`, `px.announce.{task,next,synced}`, `register.{title,label,placeholder,submit,dialogTitle,dialogText,cancel,confirm,done}`.

### 8.4 Прочие ключи

- `rebellion.cards`: `hand.{own,opponent,shared,deferred,deckCount,removed,opponentCount_<side>,locationHidden,notRegistered,register}`,
  `legacy.{title,text}`, `availability.{inHand,secret,physical,reference,revealed}`, `detail.{type,usage,effect,where,authority.{digital,physical},sources,sourceBook,verification,close}`,
  `detail.effectStatus.{none,not-implemented,implemented}`, `verification.{verified,needs-review,unverified}`, `paramSystem`.
- `rebellion.match`: `log.CARDS_DRAWN` (с именами; i18next context `own`) и `log.CARDS_DRAWN_count` (plural, `definitionIds: null`),
  `log.CARD_REGISTERED` (с системой) / `log.CARD_REGISTERED_hidden`, `log.TABLE_TASK_CONFIRMED_<kind>` ×6.
- `rebellion.errors`: `tableSyncPending`, `tableTaskNotFound`, `tableTaskNotHead`, `tableTaskNeedsRegistration`,
  `registrationUnavailable`, `unknownCard`, `cardNotEligible`.
- `rebellion.board`: `sidebar.tab.cards`. `rebellion.setup`: `newGame.aiOnly`, `newGame.modeAiOnlyHint`, `newGame.modePhysicalHint`,
  `newGame.modeResetAnnounce`.
- EN без кириллицы; RU plural — `one/few/many/other` (существующие тесты).

## 9. testids и data-атрибуты (для E2E-SYNC; согласованы с «Testability requirements» QA)

`game-table[data-console-mode][data-cards-tracked]` · `sidebar-tab-cards` / `sidebar-panel-cards` · `card-hand[data-tracked][data-viewer]` ·
`card-hand-legacy` · `card-zone-<zoneId>[data-count][data-visible]` · `card-hand-item-<definitionId>[aria-pressed][data-zone]` ·
`card-hand-opponent-count[data-count]` · `card-deck-count[data-count]` · `card-hand-register` · `card-detail[data-definition-id]` ·
`card-detail-close` · `physical-execution[data-head-kind][data-queue-length][data-ai-waiting]` · `table-task-<taskId>[data-head][data-kind]` ·
`table-task-confirm` · `table-task-waiting[data-ai-waiting]` · `table-task-error` · `location-register-select` ·
`location-register-submit` · `location-register-dialog` · `location-register-confirm` · `setup-mode-physical_companion[aria-disabled]`.

Отличие от предложения QA: `card-hand-item-<cardId>` использует `definitionId` (`probe-yavin`), а не instance id с `#`
(экземпляр у карты ровно один, FD-2); `card-detail-play` не существует (кнопки нет).

## 10. Фикстуры

- **FE-0 (FE-A)** `test/coreFixtures.ts`: `makeCoreView` и производные получают `cards: null, table: null` (legacy-форма
  по умолчанию → все существующие тесты неизменны по смыслу); `PlayerViewSchema.parse` каждой фабрики уже проверяется в
  `viewModel.test.ts`.
- **FE-A** `test/cardFixtures.ts` (новый): `probeId(systemId)`, `cardsView(viewer, { location?: string | null; empireProbes?: string[] | number;
  deckCount?: number; revealed?: string | null; gameOver?: boolean })` — строит **все 5 зон в порядке `REBELLION_CARD_ZONES`**
  по правилам проектора BE §2.4 (ordered+hidden → `cards: null`; owner-зоны соперника → `null`); `makeRebelsDigitalCardsView()`,
  `makeEmpireWithProbesView(['hoth','endor'])`, `makeEmpireRevealedView()`. Карты — реальные id каталога. Тест: каждая фабрика
  проходит `PlayerViewSchema` и `checkFixtureHidesOpponent` (нет id карт соперника в JSON).
- **FE-B** `test/tableFixtures.ts` (новый): `CORE_PHYSICAL_REBELS`/`CORE_PHYSICAL_EMPIRE` (settings), `makeTableTask(kind, overrides)`,
  `initialRebelsTable({ registered })`, `aiActivationTask`, `aiMoveIntoBaseTask` (`toSystemId: null`), `refreshTaskEmpire(['hoth','endor'])`,
  `refreshTaskRebels(2)`, `makePhysicalRebelsView`, `makePhysicalEmpireView` (поверх `cardFixtures`). Тест — схема + id задач
  формата `t-<v>-<n>`.
- **До W2** FE-A/FE-B могут писать компоненты против локального модуля типов `core-v1/{cards,table}/model/types.ts`,
  повторяющего §11.2/§11.3 дословно; после W2 файл становится `export type { … } from '@bga/game-rebellion/schema'`
  (одна точка замены, без `any`). Фикстуры пишутся только после W2 (они обязаны проходить реальную схему).

## 11. Тесты

### 11.1 Unit / component (Vitest, jsdom, Testing Library)

| Файл (новый, если не сказано) | Владелец | Покрывает |
|---|---|---|
| `core-v1/sidebar/coreLogMessage.test.ts` (сущ.) | FE-A | 3 события: свои/чужие `definitionIds`, `null`-`definitionId`, 6 kind подтверждения |
| `games/rebellion/locales.i18n.test.ts` (сущ.) | FE-A | новые ошибки и лог-типы (автоматически по схеме), ns `rebellion.cards`/`rebellion.table` в `TABLE_NAMESPACES` (лид на INTEGRATION, если `table.json` ещё пуст на FE-0) |
| `core-v1/cards/model/catalog.test.ts` | FE-A | индексы; все i18n-ключи каталога есть в ru/en `rebellion.data`; deferred-типы без карт |
| `core-v1/cards/model/handModel.test.ts` | FE-A | классификация зон для Повстанцев/Империи/hot-seat; legacy → `tracked:false`; `notRegistered`; колода — только счётчик; раскрытая база у Империи |
| `core-v1/cards/CardHandPanel.test.tsx` | FE-A | RU/EN (TC-HAND-01/02), соперник только счётчики (в DOM нет названий систем его карт), выбор мышью/клавиатурой (`aria-pressed`, TC-HAND-03), кнопки — только `card-hand-register` в physical до регистрации (TC-HAND-04), legacy (TC-HAND-07), обновление после нового view (TC-HAND-08) |
| `core-v1/cards/CardDetail.test.tsx` | FE-A | поля §6 (TC-DET-01), нет кнопки «Разыграть» (TC-DET-02), Esc/«Закрыть» → фокус на карту (TC-DET-03), `needs-review` бейдж (TC-DET-04 на фикстуре-каталоге) |
| `core-v1/cards/cards.static.test.ts` | FE-A | TC-HAND-06: нет hex-литералов и `<img>` в `core-v1/cards/**`, используется UI Kit |
| `core-v1/table/model/tableModel.test.ts` | FE-B | `consoleMode`, голова, `stepValues` для всех 14 ключей (оба языка), `null`-система → «поле Rebel Base», недостающий параметр → «—» |
| `core-v1/table/PhysicalExecutionPanel.test.tsx` | FE-B | три блока, `<ol>` шагов, `role=region`, статус текстом (TC-PX-10); `aiWaiting` true/false; следующая задача |
| `core-v1/table/useTableCommands.test.tsx` | FE-B | двойной клик/Enter → один `POST` (`mockFetch`, TC-PX-04/05); 422 → `table-task-error`; 409 → refetch, нет второй отправки; команды несут `taskId` головы и `zoneId` из `registration` |
| `core-v1/table/LocationRegisterForm.test.tsx` | FE-B | варианты = только `eligibleDefinitionIds` (TC-PX-02), диалог, отмена, `REGISTER_CARD` после подтверждения |
| `core-v1/sidebar/CoreSidebar.test.tsx`, `core-v1/CoreTable.test.tsx` (сущ.) | FE-B | вкладка Cards; подмена слота/клавиш в `physical`; `data-console-mode`; фокус при смене режима |
| `core-v1/model/viewModel.test.ts` (сущ.) | FE-B | `visibleRebelBaseSystemId === null` при `registration != null` |
| `core-v1/table/table.static.test.ts` | FE-B | нет hex/`rebelBase` в `core-v1/table/**` |
| `setup/SetupScreen.test.tsx`, `setup/model/setupForm.test.ts` (сущ.) | FE-C | AI → physical доступен и уходит в `setup`; человек → `aria-disabled` + пояснение (TC-SET-02); сброс на digital при смене соперника; RotE «скоро» как раньше |
| `scripts/check-web-bundle.test.mjs` (сущ.) | FE-C | новые правила срабатывают на фикстуре (TC-LK-17) |

### 11.2 E2E-сценарии (Playwright; реализует E2E-SYNC, стек api 3100 / web 5174 / `apps/api/.tmp/e2e.db`, `AI_COMMANDER_PROVIDER=bot`)

| Спека | Сценарий | TC |
|---|---|---|
| `e2e/card-hand.spec.ts` | новая `G_DIG_REB` через API → вкладка Cards: Location + счётчики Империи; `G_DIG_EMP` после Refresh (сид) → 2 зонда; выбор мышью и клавиатурой; перечень кнопок; 375 без горизонтального скролла; Refresh в UI → +2 без перезагрузки | HAND-01..05, 08 |
| `e2e/card-detail.spec.ts` | деталь зонда и Location RU/EN; нет кнопки розыгрыша, `recordApi` без новых команд; Esc/«Закрыть» → фокус | DET-01..03 |
| `e2e/physical-execution.spec.ts` | `G_PHY_REB` через форму: режим, `initialSetup` → подтверждение → регистрация (список = допустимые) → ход человека → ход AI → задача → подтверждение → режим `turn`; двойной клик (1 `CONFIRM`); задержанный ответ + Enter; `reload` и новая вкладка; действия на карте недоступны; `G_PHY_EMP` Refresh «возьмите X и Y», ход AI в базу = «поле Rebel Base»; 409 из второй вкладки | PX-01..09, RST-04 |
| `e2e/cards-legacy.spec.ts` | сид старой `core-v1` (существующие `seeds/*.json`) → `card-hand[data-tracked=false]` RU/EN; mock-v1 без вкладки | HAND-07, OLD-06 |
| `e2e/cards-hidden.spec.ts` | `recordApi` + DOM/порталы/storage/URL без секретов; dev-панель без карт соперника | LK-14, 16, 18, 19 |
| `e2e/game-setup.spec.ts` (сущ.) | physical за каждую сторону против AI → стол в режиме `physical`; человек → вариант недоступен; регрессия digital | SET-01, 02, 05 |

Существующие спеки, которые **обязаны** измениться (E2E-SYNC): `e2e/visual-a11y.spec.ts:329` и `e2e/support/setup.ts:110`
(ожидают `physical_companion` «скоро» при сопернике-AI), `e2e/support/testids.ts` (новые ids §9), `e2e/support/seed.ts`
(сиды с картами — FQ-3). Спеки, читающие `getRebelBaseSystemId()` debug-API, на `G_PHY_REB` до регистрации получат `null` (§5.3).

### 11.3 Сиды для e2e

Есть по плану W4: `physical-rebels-registration`, `physical-empire-ai-task-pending`. Нужны дополнительно (FQ-3):
`digital-empire-after-refresh` (у человека-Империи 2 зонда; TC-HAND-02, DET-01) и `physical-empire-refresh-pending`
(голова — `refresh` с `takeProbeCards`; TC-PX-08). Без них E2E доводит партии командами через API (медленнее, но возможно).

### 11.4 Скриншоты (skill `browser-qa`; RU и EN × 1440×900 и 375×812, reduced motion)

`saveScreenshot(page, name, 'SWR-010')`; evidence-прогон — `SCREENSHOT_TASK=SWR-010 pnpm e2e` (или E2E-SYNC меняет
`CURRENT_SCREENSHOT_TASK` на `'SWR-010'` — это заодно прекращает перезапись скриншотов SWR-006, которые сейчас изменены в
рабочем дереве). Папка `docs/tasks/SWR-010/artifacts/screenshots/`, имена `swr010-<scene>-<ru|en>-<1440|375>.png`:

| scene | Состояние | Приоритет |
|---|---|---|
| `hand-reb` | `G_DIG_REB`, вкладка Cards | P0 |
| `hand-emp` | `G_DIG_EMP` после Refresh, 2 зонда | P0 |
| `detail` | Card Detail зонда | P0 |
| `px-setup` | `G_PHY_REB`, голова `initialSetup` | P0 |
| `px-register` | голова `registerBase`, форма | P0 |
| `px-ai-task` | задача хода AI, «AI ждёт подтверждения» | P0 |
| `px-emp-refresh` | `G_PHY_EMP`, Refresh «возьмите X и Y» | P1 |
| `setup-physical` | форма: physical выбран (AI) / недоступен (человек) | P1 |
| `hand-legacy` | старая партия | P1 |

На 375 px — `fullPage: true` или `scrollIntoViewIfNeeded()` рейла (рейл ниже карты).

## 12. Бандл и границы (AC-23, TC-BND-01/02, TC-LK-17)

- Разрешено в бандле: публичный каталог (`./schema`: `REBELLION_CARD_CATALOG`, зоны, ключи задач) и Zod-схемы
  `@bga/platform/cards` (`schema.ts`), через которые парсится `CorePlayerView`.
- **Новые правила `scripts/check-web-bundle.mjs`** (FE-C):
  1. `card-deck-seed` — строковый литерал сида колоды (`/\|probe-deck\|/`): переживает минификацию и выдал бы схему
     перемешивания (BE §3.4, §5.6);
  2. `rebellion-card-server-symbol` — `initCoreCards|drawProbeCards|applyRegisterLocation|tasksFromEvents|initialTableState|chooseRebelBase`
     как строка/ключ (по образцу существующего `rebel-base-choice-symbol`);
  3. модульная композиция: в сорсмапах web нет `packages/platform/src/cards/(engine|shuffle|invariants|visibility)\.ts`
     (web нужен только `schema.ts`); существующее правило «game-модули только из `definition/schema/board/assets`» закрывает
     `rules/core/{cards,table}.ts`.
  Каждое правило — позитивная фикстура в `check-web-bundle.test.mjs` (проверка не тривиальна).
- `eslint.config.mjs` (FE-C, только набор `WEB`): `^@bga/platform/cards$` в запрещённых импортах `apps/web/src/**`
  (типы зон FE берёт из `@bga/game-rebellion/schema`). TC-BND-02 = ESLint B-8 + это правило + модульная проверка.
- Если правило 3 сработает из-за реэкспорта в `./schema` W2 — стоп, к Backend Lead (не ослаблять правило).

## 13. Подзадачи (worker split)

Перед любой `pnpm`-командой: `source ~/.nvm/nvm.sh && nvm use 22.23.5`. Общие команды зоны web:

```bash
pnpm typecheck                      # build:packages + все typecheck (web берёт пакеты после сборки)
pnpm --filter @bga/web lint
pnpm --filter @bga/web test
pnpm exec prettier --check apps/web
```

### FE-A — Cards: contract sync (FE-0), Card Hand, Card Detail

- **Старт:** FE-0 — сразу после сдачи W2 (до W3/W4: без FE-0 web typecheck/test красные). Компоненты — параллельно с FE-B.
- **OWNED FILES:** `apps/web/src/games/rebellion/core-v1/cards/**` (new); `apps/web/src/games/rebellion/test/coreFixtures.ts`;
  `apps/web/src/games/rebellion/test/cardFixtures.ts` (new); `apps/web/src/games/rebellion/core-v1/sidebar/coreLogMessage.ts` (+`.test.ts`);
  `apps/web/src/games/rebellion/locales/{ru,en}/{data,match,errors,cards}.json` (`cards.json` new);
  `apps/web/src/games/rebellion/locales.i18n.test.ts`.
- **FE-0 DONE WHEN:** `cards: null, table: null` в фикстурах; 3 лог-текста; 7 ошибок; ключи каталога в `data.json`;
  `pnpm typecheck`, `pnpm --filter @bga/web test` — exit 0 на дереве с W2.
- **DONE WHEN (полностью):** §3.1, §5.2 (колонка Card Hand), §6, §8 (свои ns), тесты §11.1 (строки FE-A) зелёные; `CardHandPanel`
  экспортирован из `core-v1/cards/index.ts`; grep §5.4 по `core-v1/cards` пуст; `rg -n "#[0-9a-fA-F]{3,8}\b" apps/web/src/games/rebellion/core-v1/cards`
  → пусто; общие команды — exit 0.
- **Читает (не меняет):** `panels/focus.ts` (`LOCATION_REGISTER_SELECT_ID` от FE-B), `panels/labels.ts`, `model/viewModel.ts`.

### FE-B — Physical Execution mode, console integration

- **Старт:** после FE-0 (фикстуры). Интеграция с живым API — после W3/W4.
- **OWNED FILES:** `apps/web/src/games/rebellion/core-v1/table/**` (new); `apps/web/src/games/rebellion/test/tableFixtures.ts` (new);
  `apps/web/src/games/rebellion/core-v1/sidebar/CoreSidebar.tsx` (+`.test.tsx`); `apps/web/src/games/rebellion/core-v1/CoreTable.tsx` (+`.test.tsx`);
  `apps/web/src/games/rebellion/core-v1/model/viewModel.ts` (+`.test.ts`); `apps/web/src/games/rebellion/core-v1/panels/focus.ts`
  (только новые id: `PX_TITLE_ID`, `LOCATION_REGISTER_SELECT_ID`); `apps/web/src/games/rebellion/core-v1/top-bar/CoreGameInfoPanel.tsx`
  (строка «база не зарегистрирована»); `apps/web/src/games/rebellion/board/model/selectionStore.ts` (только `SidebarTab += 'cards'`);
  `apps/web/src/games/rebellion/locales/{ru,en}/{table,board}.json` (`table.json` new).
- **Порядок внутри:** первым — `focus.ts` (id для FE-A) и вкладка `cards` в `CoreSidebar` с монтированием `CardHandPanel`
  (до сдачи FE-A — временный пустой экспорт не создаётся: FE-B ждёт `core-v1/cards/index.ts` или лид связывает на INTEGRATION).
- **DONE WHEN:** §2, §3.2, §4, §5.3, §8.3 и тесты §11.1 (строки FE-B) зелёные; двойной клик → один запрос (unit); grep §5.4 по
  `core-v1/table` пуст; без hex в `core-v1/table`; ручная проверка на dev-5180 (`.claude/launch.json`) `G_PHY_REB` 1440 и 375 —
  скриншот в отчёт воркера (не evidence QA); общие команды — exit 0.

### FE-C — Setup `physical_companion`, bundle & boundaries

- **Старт:** после W2 (нужен `isSupportedGameModeFor`); независим от FE-A/FE-B.
- **OWNED FILES:** `apps/web/src/games/rebellion/setup/**` (включая тесты); `apps/web/src/games/rebellion/locales/{ru,en}/setup.json`;
  `scripts/check-web-bundle.mjs`, `scripts/check-web-bundle.test.mjs`; `eslint.config.mjs` (только набор `WEB`).
- **DONE WHEN:** §7, §12; тесты setup зелёные; `node --test "scripts/*.test.mjs"` — exit 0; `pnpm build && pnpm check:bundle` —
  exit 0 (в выводе модульной проверки — 0 модулей движка карт); общие команды — exit 0.

### E2E-SYNC (qa-worker под qa-lead; не FE)

- **OWNED FILES:** `e2e/**`. Спеки §11.2, правки существующих (§11.2 последний абзац), сиды/`recordApi`, скриншоты §11.4.
- **Старт:** после FE-A/FE-B/FE-C и W5 (живой API). FE-воркеры `e2e/**` не трогают.

### INTEGRATION (frontend-lead)

Связка `CardHandPanel` ↔ вкладка (если FE-B сдал раньше), `TABLE_NAMESPACES` += `rebellion.cards`, `rebellion.table`;
`pnpm verify` → `docs/tasks/SWR-010/artifacts/logs/verify.log`; ручная проверка адаптива 1440/1024×768/375. Изменения лида —
в Implementation log `implementation-plan.md`.

## 14. Граф зависимостей

```text
W1 ─► W2 ─┬─► FE-0 (FE-A) ─┬─► FE-A (hand/detail) ─┐
          │                └─► FE-B (PX/console) ──┼─► FE INTEGRATION ─► E2E-SYNC ─► pnpm verify ─► REVIEW ‖ …
          ├─► FE-C (setup/bundle) ─────────────────┘           ▲
          └─► W3 ‖ W4 ─► W5 ───────────────────────────────────┘ (живой API, сиды)
```

До W2 FE-A/FE-B могут готовить компоненты против `model/types.ts` (§10), но **ничего не сдают** до появления схем.

## 15. Риски

- **FR-1.** FE-0 опоздал за W2 → красный `pnpm verify` у всех. Митигация: FE-0 запускается тем же шагом, что приёмка W2.
- **FR-2.** Четыре вкладки на 375 px (RU) → `scrollable` (§2.2), TC-HAND-05.
- **FR-3.** PX-модуль с формой регистрации и длинной задачей не помещается в рейл на 1024×768 → внутренний скролл,
  `core-fit.spec.ts` + ручная проверка.
- **FR-4.** Утечка через тексты задач: FE форматирует только `params`/`affected`; статический grep §5.4; e2e TC-LK-18/19.
- **FR-5.** Регресс «скоро»-тестов setup и e2e, ожидающих недоступный `physical_companion` → обновляются владельцами (FE-C, E2E-SYNC).
- **FR-6.** Изменение `visibleRebelBaseSystemId` влияет на e2e, читающие debug-API базы, — только в `G_PHY_REB` до регистрации.

## 16. Решения FE (assumptions, некритичные)

- **FD-1.** Card Hand — вкладка рейла `cards`, Card Detail — внутри той же вкладки под списком (работает одинаково на 1440 и 375,
  без новой раскладки инспектора).
- **FD-2.** testid карты — по `definitionId` (один экземпляр на карту в v0).
- **FD-3.** Регистрация в UI — только когда `registerBase` голова; кнопка в руке ведёт к форме.
- **FD-4.** Кнопки «Разыграть» нет совсем (не disabled).
- **FD-5.** Регистрация — с диалогом подтверждения (необратимо, повтор → 422).
- **FD-6.** Новых анонсов `match:announce.*` нет; добор зондов соперника виден в журнале и счётчике (S-2).

## 17. Покрытие AC (FE-часть)

| AC | Где в плане | Тесты |
|---|---|---|
| AC-19 Card Hand | §2.2, §3.1, §5.2, §8 | HAND-01..08, LK-18 |
| AC-20 Card Detail | §3.1, §6 | DET-01..04 |
| AC-21 Physical Execution | §2, §3.2, §4 | PX-01..10, RST-04 |
| AC-22 Setup | §7 | SET-01, 02, 05 |
| AC-23 Бандл/диагностика | §12, §5.1 | BND-01, 02, LK-14, 16, 17 |
| AC-16 (UI-часть) | §5.2 legacy | HAND-07, OLD-06 |
| AC-15 (UI-часть) | §5.3, §5.4 | PX-08, LK-19 |

## 18. Вопросы (Analyst / Backend Lead)

- **FQ-1 (Analyst, AC-23 по существу; не блокирует FE).** База (`chooseRebelBase`) и порядок колоды зондов
  (`'<gameId>|probe-deck|init'`) детерминированы от `gameId = sessionId`, который клиент видит в URL; алгоритмы — в
  открытом репозитории. Бандл их не содержит (§12), но игрок, знающий код, может вычислить базу/колоду. Принять как
  известное ограничение v0 (соло против AI) или добавить серверный секрет в сид (BE-изменение)?
- **FQ-2 (Analyst, UX).** До регистрации Location у человека-Повстанца юниты «на базе» стоят в **предварительной** системе
  (их так ставит сервер, AQ-4); FE убирает маркер базы и пишет «не зарегистрирована», но юниты на карте видны там. Приемлемо
  для v0? Альтернатива — серверное размещение в зоне до регистрации (меняет замороженный wire).
- **FQ-3 (Backend Lead / QA).** Добавить e2e-сиды `digital-empire-after-refresh` и `physical-empire-refresh-pending` в W4
  (`physical-seeds.test.ts`)?
- **FQ-4 (Backend Lead, W2).** `descriptionKey` типа карты не должен быть потомком `nameKey` (`cards.types.probe` — лист
  i18n). Предложение: `cards.typeInfo.<typeId>`. Подтвердить точные строки ключей каталога до FE-0.
- **FQ-5 (QA).** TC-DET-04 («упрощение A-6»): аудит снял A-6 как упрощение, в схеме каталога нет флага упрощения. FE
  показывает бейдж для `verification !== 'verified'` — привязать TC-DET-04 к нему?
- **FQ-6 (Analyst).** Подтвердить FD-3: UI предлагает регистрацию только после подтверждения `initialSetup` (сервер допускает
  раньше, AQ-7).

## Решения Analyst по FQ-1..FQ-6 (2026-11-23)

- **FQ-1:** принято как известное ограничение v0 (существует с SWR-005: `chooseRebelBase` от `sessionId`; колода зондов
  наследует ту же слабость). Follow-up: серверный секрет в seed (меняет golden-партии) — в delivery-report.
- **FQ-2:** допустимо для v0: юниты — собственные юниты человека-Повстанца; после регистрации сервер переносит их в
  выбранную систему (plan-backend §5.6 п.3). UI показывает «база не зарегистрирована».
- **FQ-3:** да, W4 добавляет e2e-seeds `digital-empire-after-refresh` и `physical-empire-refresh-pending`.
- **FQ-4:** ключ описания типа — `cards.typeInfo.<typeId>` (передано W2).
- **FQ-5:** TC-DET-04 привязать к бейджу `verification !== 'verified'` / статусу эффекта, не к флагу A-6.
- **FQ-6:** подтверждено: UI предлагает регистрацию, когда задача `registerBase` в голове очереди; сервер принимает и
  раньше (AQ-7).
- Дефолт скриншот-задачи e2e переключается на `SWR-010` (E2E-worker), чтобы не перезаписывать скриншоты SWR-006.
