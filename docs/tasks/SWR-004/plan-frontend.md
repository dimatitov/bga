# Plan — frontend (SWR-004 / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-08 · **Статус:** design only — кода, установок и правок вне этого файла и
`docs/product/ux-decisions.md` §13 нет.
**Входы:** `specification.md` (Contract + UX — FROZEN), `request.md`, код SWR-003 (`apps/web/src/**`, `e2e/support/testids.ts`),
`docs/architecture/adding-a-game.md`, `docs/product/ux-decisions.md` §1–§12, `test-cases.md` (TC-C-*, TC-VA-*, TR-1..TR-12),
**Clarifications Q-1..Q-25** в `specification.md` (обязательны; где план им следует — указан номер). UX-решения этого плана — `ux-decisions.md` §13
(`D-SW4-*`). Расхождения с контрактом — только в §12 «Proposed amendments» (решают Analyst + backend-lead).

---

## 0. Инварианты (для всех FE-воркеров)

1. Все инварианты SWR-002/003 остаются: UI не вычисляет легальность (только `legalActions`/схемы игры), кеш меняется
   только данными сервера, литералов в JSX нет, testid не зависят от языка, графика только собственная.
2. Граница платформа ↔ игра (AC-12): `src/app|shared|platform/**` не импортируют `@bga/game-*` и `@/games/<id>/**`;
   платформа не знает слов «фракция», «ruleset», «hot-seat». Статус сессии (`SessionStatus`) — платформенный, обобщённый.
3. **Скрытая информация не прячется в UI.** Экран передачи хода рисуется по `view.kind === 'handoff'`, который отдаёт сервер;
   клиент лишь гарантирует, что старое представление не остаётся ни в кеше, ни в сторах доски, ни в `window.__boardDebug`.
4. Валидация формы — Zod-схема игры (`@bga/game-rebellion/schema`), без React Hook Form (spec Assumptions).
5. Сторона противника на клиенте **только отображается** (`opponentOf` из `./schema` — чистая функция) и **никогда не
   отправляется** (`aiFaction`/`opponentFaction` в теле → 400).
6. Ключ идемпотентности генерирует **платформа** (`useCreateSession`), не игра: игре не нужно знать про HTTP-заголовки.

---

## 1. Затрагиваемая структура `apps/web/src`

```text
shared/
  api/http.ts                    # + RequestOptions.headers                                    (C)
  api/idempotency.ts       NEW   # createIdempotencyKey(): crypto.randomUUID → fallback getRandomValues (C, TR-2)
  ui/ChoiceGroup.tsx             # + option.disabled, option.badge, columns (stack на xs)       (B)
platform/
  sessions/api.ts                # SessionEnvelope + status/settings; createSession(…, {idempotencyKey}) (C)
  sessions/useCreateSession.ts   # политика Idempotency-Key, inFlight, focus-safe reset          (C)
  sessions/useSessionLine.ts     # → { parts[], time, iso } вместо строки                        (A)
  sessions/formatRelativeTime.ts # + formatAbsoluteDate()                                        (A)
  ui/SessionStatusChip.tsx NEW   # иконка + слово, data-status                                   (A)
  game-page/{GameActions,RecentSessions}.tsx  # статус + дата                                    (A)
  session-host/SessionHost.tsx   # передаёт status в TableScreen                                 (C)
  test/fakeGame.ts               # makeSessionSummary/Envelope + status/settings                  (C, FE-1)
games/
  types.ts                       # TableScreenProps.status; describeSession → parts (§12 AM-FE-3, AM-FE-9) (C, FE-1)
  rebellion/
    describeSession.ts           # новые details                                                 (A)
    setup/                       # новая композиция формы                                        (B)
      SetupScreen.tsx
      components/{FactionCards,OpponentPicker,DifficultyPicker,RulesetPicker,GameModePicker}.tsx
      model/{setupForm.ts,toSetupInput.ts}   (заменяют lib/buildSetup.ts; DEFAULT_SETUP + чистый маппер, TR-12)
    ui/{FactionEmblem.tsx NEW, FactionChip.tsx, PieceGlyph.tsx}                                  (B)
    table/                                                                                        (C)
      TableScreen.tsx            # union view: player | handoff
      components/{SessionTopBar,HandoffScreen NEW,EndTurnButton NEW,ActiveSide NEW,PrototypeBadge NEW,GameInfoPanel}.tsx
      hooks/{useRebellionView,useSendCommand,useHandoffReset NEW}.ts
    board/model/{selectionStore,viewportStore,dragStore}.ts + resetBoardState.ts NEW             (C)
    locales/{ru,en}/{setup,common}.json (B) · {session,errors}.json (C) · list.json NEW (A)
```

---

## 2. Экран новой партии (`/games/star-wars-rebellion/new`) — FE Worker B

### 2.1 Композиция (порядок DOM = визуальный = Tab)

`NewSessionPage` (платформа, без изменений) рисует «← К игре» и `<SetupScreen start backHref …/>`. Внутри формы
(`<Paper component="form" noValidate aria-busy data-testid="setup-form">`, max-width 720):

| # | Блок | Компонент | Поведение |
|---|---|---|---|
| 0 | `h1` «Новая партия» (бейдж MOCK `setup-mock-badge` **удаляется** — пометка прототипа теперь в п. 6, Q-21) | `SetupScreen` | RouteFocus ставит фокус на h1 (D-A-8) |
| 1 | «1. Ваша сторона» — 2 карточки фракций | `FactionCards` → `ChoiceGroup variant="card"` | radiogroup `setup-faction-group`, по умолчанию `rebels` |
| 2 | «2. Противник» — `AI` / `Второй игрок за этим устройством` + подпись «AI играет за Империю» / «Второй игрок играет за Империю» | `OpponentPicker` | подпись `setup-opponent-caption`, `aria-live="polite"`, сторона = `opponentOf(playerFaction)` |
| 3 | «3. Сложность AI» — Лёгкая / Обычная / Сложная + подсказка «Сохраняется для AI; в прототипе AI не ходит» | `DifficultyPicker` | только при `opponentType === 'ai'` (`Collapse unmountOnExit` — вне a11y-дерева); при human → ai возвращается **последняя выбранная на этом экране** (Q-19), для human не отправляется |
| 4 | «4. Набор правил» — `Базовая игра` ● / `Rise of the Empire · скоро` (disabled) | `RulesetPicker` | disabled-опция: `aria-disabled`, пропускается стрелками, `aria-describedby` → подсказка «Дополнение пока не поддерживается» |
| 5 | «5. Режим» — `Цифровая партия` ● / `С физическими компонентами · скоро` (disabled) | `GameModePicker` | как ruleset |
| 6 | Примечание «Прототип: тестовая расстановка, не правила оригинальной игры» | `SetupScreen` | `setup-prototype-note` (AC-13) |
| 7 | Inline-ошибка | `Alert role="alert"` | `setup-error`, над кнопками |
| 8 | `[▶ Начать игру]` `[Отмена]` | `SetupScreen` | primary **первым** в DOM и слева (D-SW4-9); `setup-start` (`aria-busy` во время запроса, TR-1), `setup-cancel` |

Старое поведение D-N-2 («сторона не выбрана, Начать неактивна, подсказка `factionHint`») **удаляется**: AC-02 требует
дефолт «Повстанцы» → кнопка всегда активна вне запроса.

### 2.2 Карточки фракций (`FactionCards`)

- Данные — реестр `factions` из `@bga/game-rebellion/assets` (`Record<FactionId, { id, nameKey, shortNameKey, taglineKey,
  emblemSvg, color, onColor }>`); порядок карточек — `['rebels', 'empire']` (дефолт первым). Компонент не содержит
  логики, только отображение (spec: «реестр без бизнес-логики»).
- Реализация — существующий `ChoiceGroup` (`variant="card"`, radiogroup + roving tabindex) с опциями:
  `icon = <FactionEmblem faction size={56}/>` (`<img src={svgDataUrl(emblemSvg)} alt="" aria-hidden>`; имя есть в тексте),
  `label = t(nameKey)`, `description = t(taglineKey)`, `badge = checked ? <CheckCircle/> + «Выбрано» : null`
  (`aria-hidden` — состояние уже несёт `aria-checked`), `accentColor = color` → полоса 4px сверху карточки.
- Выделение **не только цветом**: рамка 2px `primary.main` + фон `action.selected` + иконка ✓ + слово «Выбрано»
  (`data-selected="true"` для тестов). Невыбранная — рамка `divider`, без значка.
- Эмблемы (данные пакета): viewBox `0 0 48 48`, без текста/`<script>`/внешних ссылок/растров (те же правила, что cover,
  `GameAssetsSchema`); «Повстанцы» — **контурная** фигура, «Империя» — **заполненная** (сохраняем код D-N-3/§7 «заполнено/
  контур»). Запрещено сходство с эмблемами правообладателя (птица-«starbird», имперская «шестерня»): абстрактные
  геометрические знаки (например, контурный восходящий шеврон в круге / заполненный шестиугольник с горизонтальной
  прорезью). Цвета `color` = прежние токены (`#F5A524` / `#7C9CFF`), `onColor` — текст на заливке цвета фракции.

### 2.3 Состояние формы и defaults (AC-02)

```ts
// games/rebellion/setup/model/setupForm.ts — чистый TS, без React
export interface SetupFormValues {
  playerFaction: FactionId; opponentType: OpponentType; aiDifficulty: AIDifficulty;
  ruleset: GameRuleset; gameMode: GameMode;
}
export const SETUP_FORM_DEFAULTS: SetupFormValues =
  { playerFaction: 'rebels', opponentType: 'ai', aiDifficulty: 'normal', ruleset: 'base', gameMode: 'digital' };
```
- **TR-12:** экспортируется `DEFAULT_SETUP` (`Object.freeze`, = `SETUP_FORM_DEFAULTS`; если пакет экспортирует
  `REBELLION_SETUP_DEFAULTS` — реэкспорт его, §12 AM-FE-6) и чистые `toSetupInput(form)` /
  `toCreateSessionRequest(form) = { gameId: REBELLION_GAME_ID, setup: toSetupInput(form) }` (без React) — для TC-U-03/TC-C-07.
- `useState(() => ({ ...DEFAULT_SETUP }))` в `SetupScreen` (копия — мутация одного открытия не влияет на следующее).
  **Defaults при каждом монтировании** (Q-19, в т.ч. back/forward): форма — элемент маршрута, уход с `/new`
  размонтирует `SetupHost` (новый `useCreateSession`, новый state). Никакого сохранения выбора в localStorage/Zustand
  (D-SW4-2). «Последняя выбранная сложность» живёт только в state текущего экрана.
- Изменение любого поля при показанной ошибке → `start.reset()` (ошибка относится к прошлой попытке, D-SW4-12).

### 2.4 Клиентская валидация и маппинг (AC-05 client, AC-03, AC-04)

```ts
// games/rebellion/setup/model/toSetupInput.ts
export function toSetupInput(v: SetupFormValues): RebellionSetupInput {
  return {
    playerFaction: v.playerFaction,
    opponentType: v.opponentType,
    ...(v.opponentType === 'ai' ? { aiDifficulty: v.aiDifficulty } : {}),   // human → поля нет (сервер хранит null)
    ruleset: v.ruleset,
    gameMode: v.gameMode,
  };                                                                          // НИКОГДА aiFaction/opponentFaction
}
export function validateSetup(v: SetupFormValues):
  { ok: true; setup: RebellionSetupInput } | { ok: false; reason: 'invalid' | 'rulesetUnavailable' | 'modeUnavailable' };
```
- `validateSetup` = `RebellionSetupInputSchema.safeParse(toSetupInput(v))` + проверка «доступно» по экспортируемым из
  пакета спискам (`SUPPORTED_RULESETS`/`SUPPORTED_GAME_MODES` или `isSupportedSetup`, §12 AM-FE-6). UI и так не даёт
  выбрать недоступное (disabled-опции), валидация — второй рубеж (защита от рассинхрона/будущих опций).
- Невалидно → запрос **не отправляется**, inline `setup-error` с текстом `rebellion.errors:rulesetUnavailable` /
  `modeUnavailable` / `rebellion.setup:newGame.invalid` («Проверьте настройки партии»), фокус остаётся на кнопке.
- **Запрос:** игра вызывает `start.submit(setup)`; платформа отправляет `POST /api/sessions` с телом `{ gameId, setup }`
  (`gameId` — из `useCreateSession(gameId)`, игра его не дублирует) и заголовком `Idempotency-Key` (§4).

### 2.5 Pending / ошибка / повтор (AC-07, AC-10)

| Состояние | UI |
|---|---|
| idle | все группы активны; «Начать игру» активна |
| pending | форма `aria-busy="true"`; все radiogroup `disabled`; «Отмена» disabled; «Начать игру» — `loading` (spinner + текст «Создание партии…», `loadingPosition="start"`); повторный submit/Enter/двойной клик игнорируется (guard в `handleSubmit` + `inFlight` в `useCreateSession`) |
| error | `Alert severity="error" role="alert"` (`setup-error`) с `translateUnknownError(t, error, { gameNs: 'rebellion.errors' })` — человеческий текст + что делать, без кода/статуса (TC-VA-13); значения формы сохранены; кнопки активны, `aria-busy` снят; **фокус возвращается на «Начать игру»** (кнопка была disabled → фокус ушёл бы в `body`), alert `scrollIntoView({ block: 'nearest' })` — виден на 375 (TC-VA-05) |
| retry | повторное «Начать игру» = **новая попытка с новым ключом** (Q-5, §4.2); ошибка скрывается в момент submit. Таймаутов на клиенте нет (TR-7) |
| success | платформа: `setQueryData(detail)` → invalidate lists → `navigate(/sessions/:id, { replace: true })` (без изменений) |

### 2.6 `ChoiceGroup` (shared/ui) — аддитивные расширения (B)

- `ChoiceOption.disabled?: boolean` → `aria-disabled="true"`, `tabIndex=-1`, клик/стрелки пропускают; roving tab stop
  никогда не ставится на disabled.
- `ChoiceOption.badge?: ReactNode` (справа в карточке/сегменте: «Выбрано», «скоро»), `ChoiceOption.accentColor?: string`
  (полоса 4px сверху карточки), `ChoiceOption.describedBy?: string`.
- `columns?: 'auto' | 'stack-xs'` — для сегментов с длинными подписями (`Второй игрок за этим устройством`) на `xs`
  вариант складывается в столбец (`gridTemplateColumns: { xs: '1fr', sm: 'repeat(n, max-content)' }`).
- Существующее поведение и testid не меняются (используется таблицей настроек и формой SWR-003).

---

## 3. Страница игры и список сессий (AC-09, AC-10, AC-13) — FE Worker A

- **Строка сессии** (`describeSession`, игра) теперь возвращает **части** (§12 AM-FE-9, нужно для testid TR-1):
  `[{ key: 'faction', text: 'Повстанцы' }, { key: 'opponent', text: 'против AI (Обычная)' }, { key: 'progress', text: 'Р2 · Командование' }]`;
  платформа рисует каждую часть как `<span data-testid="recent-session-<key>">` через « · » и не знает, что такое
  «faction». Для human — `против второго игрока`, `aiDifficulty: null` допустим в details (Q-20). `ruleset`/`gameMode`
  не выводим, пока доступен только Base/Digital (D-SW4-15). Строка (тип `string`) по-прежнему поддерживается для других
  игр. Ключи — новый namespace `rebellion.list` (`games/rebellion/locales/<lng>/list.json`); невалидные details → `[]`
  (платформа покажет общий текст, как сейчас).
- **Статус** — платформенный `SessionStatusChip` по `SessionSummary.status` (иконка + слово, не только цвет):
  `setup` «Настройка» (Tune), `prototype` «Прототип» (Science, цвет `mock.main`), `active` «Идёт» (PlayArrow, `primary`),
  `completed` «Завершена» (Flag, `text.secondary`). Ключи `common:sessionStatus.*`. Неизвестный статус → чип не рисуется.
- **Дата** — `useSessionLine` возвращает `{ parts, time, iso }`; `RecentSessions` рисует
  `ListItemText primary={parts} secondary={<SessionStatusChip data-testid="recent-session-status"/> · <time data-testid="recent-session-date" dateTime={iso} title={абсолютная дата}>{time}</time>}`.
  Абсолютная дата — `Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })` (`formatAbsoluteDate`);
  обе функции принимают `now`/язык параметром (TR-11).
- **«Продолжить партию»**: подсказка `game-continue-hint` = та же строка + статус-чип (`game-continue-status`) + время
  (Q-21). Human-партия в состоянии handoff открывается заслонкой — ожидаемо (Q-13).
- Загрузка/пусто/ошибка — без изменений (D-GP-6), уже покрыто тестами SWR-003; проверяется регрессия.
- Узкий экран 375 px: hero уже складывается (D-GP-1); строка недавней партии переносится (primary — до 2 строк,
  secondary — статус и время в одну строку, `flexWrap`), кнопки действий — на всю ширину (`maxWidth: 420` → `100%` на xs).

---

## 4. API-интеграция, ошибки, идемпотентность — FE Worker C

### 4.1 Клиент

```ts
// shared/api/http.ts
export interface RequestOptions { method?; body?; signal?; headers?: Record<string, string> }   // аддитивно
// platform/sessions/api.ts
export interface SessionEnvelope { sessionId; gameId; status: SessionStatus; settings: unknown; view: unknown }
export function createSession(input: CreateSessionInput, options?: CallOptions & { idempotencyKey?: string })
//   → headers: { 'Idempotency-Key': key }; ответ 201 и 200 (повтор с тем же ключом) обрабатываются одинаково.
```
- Схемы ответа — `SessionResponseSchema`/`SessionSummarySchema` из `@bga/platform` (с `status`, `settings` после BE-изменения).
- `SessionHost` передаёт `status` в `TableScreen` (`TableScreenProps.status: SessionStatus`, §12 AM-FE-3). `settings`
  ответа сессии для платформы — `unknown` и хранится в кеше `detail` (`setQueryData(prev => ({ ...prev, view }))` после
  команды его не теряет). Стол Rebellion читает настройки из **player-view** (`view.settings`, AM-BE-2 backend:
  player-view = `{ kind:'player', viewer, activeSide, settings, … }`, без `setup`, Q-11/Q-24); handoff-view настроек не
  несёт и не требует.

### 4.2 Idempotency-Key — где и когда (Q-5, TR-2)

Генерируется в **`platform/sessions/useCreateSession.ts`**, внутри `submit` (обработчик отправки, не рендер), функцией
`createIdempotencyKey()` из `shared/api/idempotency.ts` (отдельный модуль — подменяется `vi.mock` в тестах, TR-2).
Игра про ключ не знает; `createSession` остаётся чистой функцией с параметром `idempotencyKey`.

```text
submit(setup):
  if inFlight → ignore                         // двойной клик / Enter во время запроса: тот же запрос, второго нет
  key = createIdempotencyKey()                 // ровно один вызов на попытку отправки
  inFlight = true; mutate({ setup, key })      // mutation retry = 0: автоматических повторов нет
onSettled: inFlight = false
```
- Новая попытка после ошибки (пользователь снова нажал «Начать игру») — **новый ключ** (Q-5). Повтор «той же
  попытки» (двойной клик) отсекается `inFlight` и disabled-кнопкой, поэтому второй запрос не уходит вовсе.
- Ответ 200 (`Idempotent-Replay: true`, Q-1) и 201 обрабатываются одинаково (тот же `SessionResponseSchema`).
- `409 IDEMPOTENCY_KEY_REUSED` (при новом ключе на попытку не должен возникать) → текст `errors:idempotencyKeyReused`.
- `createIdempotencyKey()` — `crypto.randomUUID()`; fallback на `crypto.getRandomValues` (UUID v4) для небезопасного
  контекста (dev по IP в LAN); unit-тест формата (сервер отвергает не-UUID, Q-2).

### 4.3 Ошибки создания (ключи)

| Ответ | messageKey (сервер) | Текст (ru) | Где |
|---|---|---|---|
| 422 `SETUP_UNSUPPORTED` | `errors.rulesetUnavailable` | «Набор правил Rise of the Empire пока недоступен.» | `rebellion.errors` |
| 422 `SETUP_UNSUPPORTED` | `errors.modeUnavailable` | «Режим с физическими компонентами пока недоступен.» | `rebellion.errors` |
| 422 (оба недоступны, Q-8) | `errors.rulesetUnavailable` | как выше (первый по порядку; `details.unsupported` не показываем) | `rebellion.errors` |
| 422 `SETUP_UNSUPPORTED` (fallback) | `errors.setupUnsupported` | «Эти настройки пока не поддерживаются.» | `errors` |
| 400 `VALIDATION` | `errors.validation` | «Некорректные настройки партии.» (существующий) | `errors` |
| 409 `IDEMPOTENCY_KEY_REUSED` | `errors.idempotencyKeyReused` | «Не удалось создать партию. Нажмите «Начать игру» ещё раз.» | `errors` |
| 422 `GAME_UNAVAILABLE` / 404 | существующие | — | `errors` |
| сеть / 5xx | `errors.network` / `errors.internal` | существующие | `errors` |

`translateError` уже ищет `errors.<name>` сначала в `rebellion.errors:<name>`, затем в `errors:<name>`, затем
`errors:code.<CODE>` — добавить `code.SETUP_UNSUPPORTED`, `code.IDEMPOTENCY_KEY_REUSED` в платформенный `errors.json`.

### 4.4 Маршрутизация

Без изменений: `/games/:gameId/new` → успех → `/sessions/:id` (`replace`); ошибка — остаёмся на форме (AC-07).

---

## 5. Игровой стол (C): «Прототип», hot-seat, D-1

### 5.1 Union `PlayerView`

`useRebellionView(view)` → `{ view: PlayerView }` где `PlayerView = PlayerSideView | HandoffView` (схема пакета).
`TableScreen`:

```tsx
if ('error' in parsed) return <InvalidView/>;
if (parsed.view.kind === 'handoff') return <HandoffScreen key="handoff" …/>;
return <Table key={`player-${parsed.view.viewer}`} …/>;     // смена стороны = полный remount стола
```
- **Actor команд** = `view.viewer` (вместо `view.setup.humanFaction`); для `ACCEPT_HANDOFF` — `view.activeSide` (Q-11).
  `expectedVersion` — `view.version` (handoff-view содержит `version`, Q-12).
- Топ-бар и вкладка «Партия» читают тип противника/сложность из `view.settings`, активную сторону — из `view.viewer`;
  `view.setup` больше не используется (Q-11). Статус («Прототип») — из `TableScreenProps.status` (player) или
  `view.sessionStatus` (handoff).

### 5.2 «Передать ход» (`END_TURN`) — только human-партии

- `EndTurnButton` (`end-turn`, outlined, иконка SwapHoriz, текст «Передать ход») в группе состояния топ-бара рядом с
  «Завершить фазу (mock)». Рендерится **только** при `view.settings.opponentType === 'human'` (в AI-партии кнопки нет,
  TC-C-19; сервер всё равно ответит 422 `handoffNotAvailable`, Q-10); активна, если в `legalActions` есть `END_TURN`
  (§12 AM-FE-7 — UI не решает, чей ход). `END_TURN` фазу не меняет (Q-10). Без подтверждения (D-P-3; заслонка сама даёт паузу).
- `ActiveSide` (`active-side`, `data-side`): «Ход: <FactionChip>» вместо «<сторона> против …» в human-партии; в AI-партии
  тот же testid на FactionChip стороны игрока.

### 5.3 Экран передачи хода (`view.kind === 'handoff'`)

Порядок действий при получении handoff-view (ответ `END_TURN`, refetch, открытие сессии по ссылке):
1. **Кеш:** `useSendCommand` записывает `setQueryData(detail, { ...prev, view })` — прежний player-view **заменён**,
   не слит; списки инвалидируются. Других мест хранения view нет (lists — только `details` без секретов).
2. **Сторы доски сбрасываются** `resetBoardState(sessionId)` в `useLayoutEffect` `HandoffScreen` (до paint):
   `selectionStore` → `{ gameId: null, selection: none }`, `dragStore.clear()`, `viewportStore.forget(sessionId)`
   (удаляет `byGame[sessionId]`, `gameId: null`, `bounds: null`). Вкладка сайдбара — сохраняется (не секрет).
3. **Canvas не смонтирован:** `HandoffScreen` не рендерит `BoardContext`, `BoardView`, `BoardSidebar`; `useBoardDebug`
   размонтирован → `window.__boardDebug` удалён (cleanup существующего хука). **Формат для TR-10:** во время заслонки
   `window.__boardDebug === undefined` (свойство отсутствует, а не объект с пустыми данными) — e2e-хелпер трактует
   `undefined` как «пусто». Тест это проверяет (§9).
4. Разметка (§13 wireframe, `<main>`-регион `handoff-screen`, не модальный `dialog` — за ним нечего блокировать):
   `«← К игре»` + h1 `handoff-title` «Передайте устройство игроку за Империю» (фокус на h1, `tabIndex=-1`)
   + эмблема активной стороны 96px + «Карта скрыта, чтобы не раскрыть информацию другой стороны.» + «Раунд 2 · Командование»
   + бейдж «Прототип» + primary **«Я — Империя»** (`handoff-accept`) + примечание о доверительном подтверждении.
   **Фокус не на кнопке** — чтобы игрок A случайным Enter не «принял» ход за игрока B (D-SW4-21). Это расходится с
   ожиданием TC-VA-12 («фокус на «Я — Империя» при появлении») — предложено QA поправить кейс (§14 OQ-1).
5. «Я — Империя» → `send({ type: 'ACCEPT_HANDOFF' })` (actor = `activeSide`) → pending (`loading`) → ответ player-view
   новой стороны → `Table` монтируется заново (key по `viewer`), `viewportStore.activateGame` делает fit, фокус на h1
   стола. Ошибка (409 → refetch; 422 `notYourTurn`; сеть) → `Alert role="alert"` (`handoff-error`), кнопка снова активна.

### 5.4 «Прототип» (AC-13)

- Топ-бар: `PrototypeBadge` (игровой компонент на основе `Chip`, цвет `mock.main`, иконка Science) **заменяет**
  `MockBadge`: testid **`prototype-badge`** (TR-1, TC-C-16; `mock-badge` на столе исчезает — QA мигрирует
  `phase.spec`, `board-view.spec`, `support/board.ts`), текст **всегда полный** «Прототип: тестовая расстановка, не правила
  оригинальной игры» (`rebellion.common:prototype.full`), `data-status={status}`; рендерится, когда
  `status === 'prototype'`. Чип переносит текст (`height:auto`, `whiteSpace:normal`, max-width 320px) — на узкой шапке
  он уходит на свой ряд, а не обрезается (TC-VA-06).
- Вкладка «Партия»: строка «Статус: Прототип» + полный текст (не только в tooltip — tooltip не доступен на тач).
- Экран передачи хода — тот же бейдж. Страница игры и «Продолжить» — чип статуса (§3, Q-21). Форма — примечание
  `setup-prototype-note`.

### 5.5 D-1: верхняя панель стола (1440 / 1024 / 768 / 375)

Причина: один ряд `display:flex; overflowX:auto` с фиксированной высотой 56px. Решение — 4 группы с переносом:

| Группа | Содержимое |
|---|---|
| `nav` | «← К игре» |
| `sides` | ActiveSide (`active-side`): FactionChip + «против AI · Обычная» / «Ход: …» (human) |
| `state` | Раунд · Фаза · «Завершить фазу (mock)» · «Передать ход» |
| `status` | бейдж «Прототип» · сохранение · ⚙ |

| Ширина | Раскладка |
|---|---|
| ≥ 1200 (`lg`) | один ряд: nav · sides · state (по центру, `mx:auto`) · status |
| 600–1199 (`sm`–`md`; 1024, 768) | два ряда: (nav · sides · ⟶ · status) / (state, слева) |
| < 600 (`xs`; 375) | ряд 1: «←» (иконка, `aria-label` «К игре») · FactionChip · ⟶ · ⚙; ряд 2: Раунд · Фаза; ряд 3: кнопки state; ряд 4: бейдж + статус сохранения. Удобство не требуется (Q-22), только отсутствие горизонтального скролла страницы |

- `GRID.gridTemplateRows: 'auto minmax(0, 1fr)'` (вместо `56px`), шапка `flexWrap: 'wrap'`, **без** `overflowX: auto`
  (страховка: wrap при любой ширине). `BoardStage` уже следит за размером (`useStageSize`).
- < 600 px: сетка стола складывается в столбец (`"top" "board" "side"`, карта `60dvh`, сайдбар ниже, прокрутка страницы
  по вертикали). Это минимальная корректность (нет горизонтального скролла), полноценный мобильный стол — позже (D-R-1).
- Критерий (e2e, QA, TC-VA-08): **обязательно 1024×768 и 768×1024** (Q-22) для AI- и human-партий — у детей шапки нет
  пересечений bounding box, `header.scrollWidth <= header.clientWidth`, кнопки не обрезаны; 1440×900 — регрессия;
  375×812 — только `documentElement.scrollWidth <= innerWidth`.

---

## 6. Узкий viewport, клавиатура, контраст, reduced motion (AC-11)

- **375×812, форма:** Paper `p: 2`, карточки фракций в столбец (horizontal anatomy: эмблема 40px слева, текст справа),
  сегменты противника — в столбец (`columns="stack-xs"`), ruleset/mode — в столбец, кнопки во всю ширину
  (`Начать игру` сверху, `Отмена` под ней). Без sticky-панели (не перекрывать alert/фокус, WCAG 2.4.11). Нет
  горизонтального скролла; все цели ≥ 44px по высоте.
- **Порядок Tab (форма):** «← К игре» → radiogroup фракций (1 остановка, ←/→/↑/↓ меняют выбор, Space выбирает) →
  противник → сложность (если AI) → ruleset (стрелки пропускают disabled) → режим → «Начать игру» → «Отмена».
  Enter на радио-кнопке не отправляет форму (это `button type=button`); Enter на «Начать игру» — submit.
- **Стол:** порядок D-A-2 сохраняется; «Передать ход» — после «Завершить фазу (mock)». **Заслонка:** порядок DOM
  «← К игре» → h1 (программный фокус, не Tab-остановка) → «Я — <сторона>» → ⚙; после появления первый Tab ведёт на «Я — …».
- **Контраст** (тёмная тема §7): `#F5A524` на `#131A26` ≈ 9:1, `#7C9CFF` ≈ 6.9:1 (эмблемы, полосы ≥ 3:1 — WCAG 1.4.11);
  «скоро» и подписи disabled-опций — `text.secondary` `#9AA4B5` (≈ 6.9:1, не MUI-disabled 0.5 alpha), чтобы недоступные
  опции читались; «Выбрано» — `primary.main` на `action.selected` ≥ 4.5:1 (проверка воркером B в DevTools + скриншот).
- **Reduced motion:** `Collapse` сложности и переходы карточек — 0 мс при `data-reduced-motion` (через тему, как сейчас);
  заслонка появляется без анимации всегда; spinner в кнопке остаётся (существенная индикация).

---


## 7. Testid (вход для QA — TR-1; `e2e/support/testids.ts` правит QA)

### 7.1 Новые

| testid | Где | Атрибуты |
|---|---|---|
| `setup-form` | `<form>` | `aria-busy` |
| `setup-faction-group` | radiogroup фракций (вместо `setup-faction`) | `role="radiogroup"`, `aria-labelledby` |
| `setup-faction-rebels` | карточка (**переименование** `setup-faction-rebellion`) | `role="radio"`, `aria-checked`, `data-selected`, `data-value` |
| `setup-opponent-caption` | «AI играет за …» | `data-opponent-faction`, `aria-live="polite"` |
| `setup-ruleset`, `setup-ruleset-base`, `setup-ruleset-rise-of-the-empire` | группа / опции | `aria-checked`, `aria-disabled` |
| `setup-mode`, `setup-mode-digital`, `setup-mode-physical_companion` | группа / опции | `aria-checked`, `aria-disabled` |
| `setup-prototype-note` | примечание о прототипе | — |
| `setup-cancel` | «Отмена» | — |
| `recent-session-faction`, `recent-session-opponent`, `recent-session-progress` | части строки внутри `recent-session-<id>` (из `describeSession` parts) | — |
| `recent-session-status` | чип внутри `recent-session-<id>` | `data-status` |
| `recent-session-date` | `<time>` внутри `recent-session-<id>` | `dateTime` |
| `game-continue-status` | чип в подсказке «Продолжить» | `data-status` |
| `prototype-badge` | бейдж стола и заслонки (заменяет `mock-badge` на столе) | `data-status` |
| `active-side` | «Ход: …» / сторона игрока в шапке | `data-side` |
| `end-turn` | «Передать ход» (только human) | `disabled` |
| `handoff-screen` | заслонка | `data-active-side`, `data-round`, `data-version` |
| `handoff-title` | h1 заслонки | — |
| `handoff-accept` | «Я — <сторона>» | `aria-busy` |
| `handoff-error` | ошибка подтверждения | `role="alert"` |
| `game-info-status` | строка «Статус» во вкладке «Партия» | `data-status` |

### 7.2 Изменённые / удалённые / стабильные

- **Переименованы:** `setup-faction-rebellion` → `setup-faction-rebels` (R0); группа `setup-faction` → `setup-faction-group` (TR-1).
- **Удалены:** `mock-badge` **на столе** (→ `prototype-badge`); `setup-mock-badge` (→ `setup-prototype-note`). Сообщено
  QA этим планом (TR-1); `MockBadge` в шапке платформы (если используется) не трогаем.
- **Стабильные:** `setup-start`, `setup-error`, `setup-opponent-ai|human`, `setup-difficulty(-<d>)`, `session-back-to-game`
  (также на заслонке), `game-table`, все testid доски/сайдбара, `recent-session-<id>`, `game-continue(-hint)`,
  `game-sessions-error`. **Имена состояний списка остаются** `game-recent-loading` / `game-recent-empty` (TR-1 просит
  `game-sessions-loading` / `game-sessions-empty` — предлагаем QA использовать существующие, §14 OQ-2).
- `data-faction` у `FactionChip`, `owner` в списке объектов/`__boardDebug` получают `rebels`.

---

## 8. i18n (ru / en)

Платформа (`src/locales/<lng>/…`):

| Файл | Ключи | Владелец |
|---|---|---|
| `common.json` | `sessionStatus.{setup,prototype,active,completed}` «Настройка/Прототип/Идёт/Завершена» · «Setup/Prototype/In progress/Completed» (все 4, Q-9) | A |
| `gamePage.json` | `session.parts` (разделитель), `session.absolute` (title даты) | A |
| `errors.json` | `idempotencyKeyReused` «Не удалось создать партию. Нажмите «Начать игру» ещё раз.», `setupUnsupported` «Эти настройки пока не поддерживаются.», `code.SETUP_UNSUPPORTED` «Эти настройки пока не поддерживаются.», `code.IDEMPOTENCY_KEY_REUSED` | C |

Игра (`src/games/rebellion/locales/<lng>/…`):

| Файл | Ключи | Владелец |
|---|---|---|
| `common.json` | `faction.{rebels,empire}` (переименование, FE-0); `factionShort.*`; `factionTagline.rebels` «Прячут базу, тянут время» / `empire` «Ищет скрытую базу»; `opponent.human` «Второй игрок»; `ruleset.{base «Базовая игра», rise-of-the-empire «Rise of the Empire»}`; `mode.{digital «Цифровая партия», physical_companion «С физическими компонентами»}`; `prototype.badge` «Прототип», `prototype.full` «Прототип: тестовая расстановка, не правила оригинальной игры»; удалить `mock.scenario` | B |
| `setup.json` | `newGame.{title, factionStep «1. Ваша сторона», selected «Выбрано», opponentStep «2. Противник», opponentAi «AI», opponentHuman «Второй игрок за этим устройством», opponentCaption.ai.{rebels «AI играет за Повстанцев», empire «AI играет за Империю»}, opponentCaption.human.{rebels «Второй игрок играет за Повстанцев», empire «Второй игрок играет за Империю»}, humanHint «Ходите по очереди: перед ходом соперника приложение скроет карту.», difficultyStep «3. Сложность AI», difficultyHint, rulesetStep «4. Набор правил», modeStep «5. Режим», soon «скоро», rulesetSoonHint «Дополнение пока не поддерживается.», modeSoonHint «Режим пока не поддерживается.», start «Начать игру», starting «Создание партии…», cancel «Отмена», invalid «Проверьте настройки партии.»}`; удалить `factionHint`, `factionDescription`, `session.*` (после A) | B |
| `list.json` NEW (`rebellion.list`) | `opponentAi` «против AI ({{difficulty}})», `opponentHuman` «против второго игрока», `progress` «Р{{round}} · {{phase}}» | A |
| `session.json` | `topBar.{vsAi, vsHuman «против второго игрока», turnOf «Ход: {{faction}}», endTurn «Передать ход», backToGameIcon «К игре»}`, `handoff.{title.rebels «Передайте устройство игроку за Повстанцев», title.empire «Передайте устройство игроку за Империю», text «Карта скрыта, чтобы не раскрыть информацию другой стороны.», round «Раунд {{round}} · {{phase}}», accept.rebels «Я — Повстанцы», accept.empire «Я — Империя», trustNote «Подтверждение не проверяет, кто держит устройство: передавайте его честно.»}`, `info.status «Статус»` | C |
| `errors.json` | `rulesetUnavailable` «Набор правил Rise of the Empire пока недоступен. Выберите «Базовая игра».», `modeUnavailable` «Режим с физическими компонентами пока недоступен. Выберите «Цифровая партия».», `notYourTurn` «Сейчас ход другой стороны.», `handoffNotAvailable` «Передача хода доступна только в партии двух игроков.» (Q-10), `handoffPending` «Сначала подтвердите, кто ходит.» (AM-BE-6) | C |
| `board.json`, `gameData.json` | только переименование `rebellion`→`rebels` (FE-0), если меняются `typeKey`/ключи легенды | C (FE-0) |

Полные фразы на каждую сторону (а не склонение в коде): русский падеж («за Империю», «за Повстанцев») не собрать
интерполяцией. `locales.i18n.test.ts` (B) добавляет `rebellion.list` и проверяет ключи для каждого `FactionId`,
`GameRuleset`, `GameMode`, каждого нового `messageKey` пакета; в en нет кириллицы (TC-C-22).

---

## 9. Компонентные тесты по AC (Vitest + RTL, `mockFetch`, `renderWithProviders`)

| AC | TC | Файл (владелец) | Проверка |
|---|---|---|---|
| AC-02 | TC-C-01, TC-C-02 | `setup/SetupScreen.test.tsx` (B) | дефолты: `setup-faction-rebels` `aria-checked=true` + `data-selected` + «Выбрано», `ai`, `normal`, `base`, `digital`; подпись «AI играет за Империю»; изменить → уйти → вернуться → снова дефолты |
| AC-02 | TC-U-03, TC-C-07 | `setup/model/setupForm.test.ts` (B) | `DEFAULT_SETUP` = значения PO и заморожен/копируется; `toCreateSessionRequest` для REB/EMP × ai/human × 3 сложности; human — без `aiDifficulty`; **никогда** `aiFaction`/`opponentFaction`/`humanFaction`/`opponent`; результат проходит `RebellionSetupInputSchema` |
| AC-03 | TC-C-03, TC-C-04 | `SetupScreen.test.tsx` (B) | Империя ↔ Повстанцы меняет подпись (AI и human); ровно одна карточка `aria-checked=true` |
| AC-04 | TC-C-05 | `SetupScreen.test.tsx` (B) | human → `setup-difficulty` нет в a11y-дереве; назад к AI → последняя выбранная сложность (Q-19) |
| AC-05 (клиент) | TC-C-06, TC-C-21 | `SetupScreen.test.tsx`, `shared/ui/ChoiceGroup.test.tsx` (B) | RotE / physical: «скоро», `aria-disabled`, клик и стрелки не выбирают; `validateSetup` с недоступным значением → текст `rulesetUnavailable`, POST не уходит |
| AC-07 | TC-C-11..13 | `SetupScreen.test.tsx` (B) | 201 → `/sessions/:id` (replace), detail в кеше без второго GET; 500 / 422 `SETUP_UNSUPPORTED` / 400 / 409 / сеть → `setup-error` `role=alert` с человеческим текстом, значения сохранены, `aria-busy` снят, фокус на `setup-start`; повтор → 201 → переход, ошибки нет |
| AC-10 | TC-C-08 | `SetupScreen.test.tsx` (B) | deferred fetch: `setup-start` disabled + `aria-busy` + spinner, `setup-form[aria-busy]`, второй клик/Enter → 1 fetch |
| AC-10 | TC-C-09, TC-C-10 | `platform/sessions/useCreateSession.test.tsx` NEW (C) | `vi.mock('@/shared/api/idempotency')`: заголовок `Idempotency-Key` = значение генератора, генератор вызван 1 раз на попытку; двойной `submit` → 1 вызов/1 POST; после ошибки повтор → **новый** ключ (Q-5); ответы 200 и 201 → один и тот же переход; `idempotency.test.ts` — формат UUID v4 и fallback |
| AC-09, AC-13 | TC-C-14 | `platform/game-page/GamePage.test.tsx` (A) + `describeSession.test.ts` (A) | 2 сессии (AI EMP hard; human REB): `recent-session-faction/opponent/status/date`; сложность только у AI; `data-status=prototype` «Прототип»; `<time dateTime>`; «Продолжить» → самая свежая + `game-continue-status` |
| AC-10 | TC-C-15 | `GamePage.test.tsx` (A) | pending / `[]` / 500 — регрессия SWR-003; «Новая партия» доступна везде |
| AC-13 | TC-C-16 | `table/TableScreen.test.tsx` (C) | `prototype-badge` с полным текстом; `game-info-status` |
| AC-14 | TC-C-17 | `TableScreen.test.tsx` (C) | human: `end-turn` → `END_TURN` (actor = `viewer`); ответ handoff → `detail.view` в кеше без `systems/pieces/log/legalActions`; нет `board-canvas`, `context-panel`, `event-log`, `board-list`; `handoff-screen`, `handoff-title` «…за Империю», `handoff-accept` «Я — Империя»; фокус на `handoff-title` |
| AC-14 | TC-C-18 | `table/HandoffScreen.test.tsx` NEW (C) | `ACCEPT_HANDOFF`, actor `empire`, `expectedVersion = view.version`; затем стол Империи (`active-side[data-side=empire]`); `selectionStore` none, `dragStore.drag` null, `viewportStore.byGame[sessionId]` нет; 422 `notYourTurn` → `handoff-error` |
| AC-14 | TC-C-19 | `TableScreen.test.tsx` (C) | AI-сессия: `end-turn` отсутствует |
| AC-14 | TC-C-20 | `HandoffScreen.test.tsx` (C) | с установленным ранее `__boardDebug` (стол → END_TURN) → во время заслонки `window.__boardDebug === undefined` (TR-10) |
| AC-11 | TC-C-21 | `ChoiceGroup.test.tsx` (B) | один tab-stop в группе, стрелки, Space; disabled пропускается; порядок Tab формы |
| AC-11 | TC-C-22 | `locales.i18n.test.ts` (B), `shared/i18n/locales.test.ts` (A — платформенные ключи) | ru/en ключи совпадают, en без кириллицы |
| AC-12 | — | `platform/extensibility.test.tsx` (C) | фиктивная игра создаёт сессию с `Idempotency-Key` и рисует строку-`string` без изменений платформы |

Вёрстка (375/768/1024, D-1), контраст, фокус-индикаторы, reduced motion — e2e/visual QA (TC-VA-*): в jsdom нет layout.
Контраст токенов фракций (`onColor` на `color`, TC-U-33) — unit в пакете (backend/владелец assets).

---

## 10. Подзадачи, владение файлами, порядок

### Зависимости от backend (по `plan-backend.md`)

| BE-шаг | Что даёт FE |
|---|---|
| **R0** — rename `rebellion → rebels` + данные v2 + апкастер; **wire не меняется** (R0-адаптеры: прежний вход setup и `view.setup`) | веб уже переименован (FE-0 поглощён R0) |
| **C (схема пакета)** — `RebellionSetupInputSchema`, `REBELLION_SETUP_DEFAULTS`, `SUPPORTED_RULESETS/GAME_MODES`, `opponentOf`, `PlayerView` union, `END_TURN`/`ACCEPT_HANDOFF`, details с `null`, ключи ошибок; **B (платформа)** — `SessionStatus`, `status`/`settings` в DTO, коды | FE-1 разрабатывается поверх веток BE-B + BE-C и сливается **вместе** с ними (backend D-1: смена wire — C + FE-1 одним шагом) |
| **API** — идемпотентность, 422, hot-seat в правилах | только INTEGRATION/e2e; FE-тесты идут на `mockFetch` и не ждут |

### FE-0 — переименование фракции (поглощено BE-R0)
Выполняет исполнитель R0 по списку `plan-backend.md` §1.5 (web-код, фикстуры, локали `faction.rebels`, `setup.json`,
`board.json`, `gameData.json` `pieceTypes.*.rebels`, testid `setup-faction-rebels`; e2e — с согласия QA). Frontend-lead
ревьюит web-дифф R0 по правилу: меняется только токен фракции; **не трогать** `rebellion` как i18n-префикс, имя папки,
`REBELLION_*`, `star-wars-rebellion`. DONE WHEN (R0): `pnpm verify` зелёный; `grep -rn "'rebellion'" apps/web/src`
находит только `REBELLION_I18N_PREFIX`.

### FE-1 — переход web на новый wire (Worker C, последовательно, вместе с BE-B/BE-C)
`games/types.ts` (`TableScreenProps.status`; `describeSession` → `string | SessionLinePart[]`),
`platform/sessions/api.ts` (`SessionEnvelope` + `status`, `settings`), `platform/session-host/SessionHost.tsx` (передать
status), `platform/sessions/useSessionLine.ts` (принять оба вида результата — затем развивает A), `platform/test/fakeGame.ts`,
`games/rebellion/test/fixtures.ts` + `board/test/fixtures.ts` (`makeView` → player-view с `settings/viewer/activeSide`,
`makeHandoffView`, `makeRebellionSummary` с новыми details и `status`), `useSendCommand` (actor = `viewer`), `TableScreen`
(handoff → временная заглушка без доски), `setup/lib/buildSetup.ts` → новый вход, `describeSession` — компиляция. Только
чтобы `pnpm verify` был зелёным после удаления R0-адаптеров; UX не меняется. После FE-1 A ‖ B ‖ C2 не делят ни одного файла.

### FE Worker A — страница игры и список сессий (после FE-1)
- **OWNED FILES:** `apps/web/src/platform/game-page/{GameActions.tsx,RecentSessions.tsx,GamePage.test.tsx}`,
  `platform/sessions/{useSessionLine.ts,useSessionLine.test.ts NEW,formatRelativeTime.ts,formatRelativeTime.test.ts}`,
  `platform/ui/{SessionStatusChip.tsx NEW,SessionStatusChip.test.tsx NEW}`, `src/locales/{ru,en}/{common,gamePage}.json`,
  `src/shared/i18n/locales.test.ts`, `games/rebellion/{describeSession.ts,describeSession.test.ts}`,
  `games/rebellion/locales/{ru,en}/list.json` NEW.
- DONE WHEN: §3 реализован; тесты §9 (A) зелёные; `typecheck|lint|test` web — 0; ручная проверка 1440 и 375.

### FE Worker B — форма, карточки фракций, настройки AI (после FE-1)
- **OWNED FILES:** `apps/web/src/games/rebellion/setup/**` (удалить `lib/buildSetup.ts`, `components/FactionPicker.tsx`),
  `games/rebellion/ui/{FactionEmblem.tsx NEW,FactionChip.tsx,PieceGlyph.tsx}`,
  `src/shared/ui/{ChoiceGroup.tsx,ChoiceGroup.test.tsx NEW,index.ts}`, `games/rebellion/locales/{ru,en}/{setup,common}.json`,
  `games/rebellion/locales.i18n.test.ts`, **`packages/games/rebellion/src/assets/{factions.ts,emblems.ts}` NEW** +
  `packages/games/rebellion/test/assets/**` (санитария SVG по правилам `GameAssetsSchema`, контраст `onColor`/`color`
  ≥ 4.5:1 — TC-U-33) и строка реэкспорта `factions` в `assets/index.ts` (после R0; backend-C `./assets` не трогает —
  `plan-backend.md` §10). Реестр зависит только от `FactionId` из `../schema` (после R0) — B может начинать сразу после R0.
- Удаление `session.*` из `setup.json` — после слияния A.
- DONE WHEN: §2, §6 (форма) реализованы; тесты §9 (B) зелёные; скриншоты 1440/375 (ru + одна en-копия формы, Q-18) в
  `artifacts/screenshots/`; гейты web — 0.

### FE Worker C — API/ошибки/идемпотентность/маршрутизация + hot-seat UI (FE-0, FE-1, затем C2)
- **OWNED FILES (C2):** `apps/web/src/shared/api/{http.ts,idempotency.ts NEW,idempotency.test.ts NEW,index.ts}`,
  `platform/sessions/{api.ts,api.test.ts,queries.ts,useCreateSession.ts,useCreateSession.test.tsx NEW}`,
  `platform/session-host/**`, `platform/new-session/**`, `platform/index.ts`, `platform/test/**`,
  `platform/extensibility.test.tsx`, `games/types.ts`, `src/locales/{ru,en}/{errors,sessionHost}.json`,
  `games/rebellion/table/**`, `games/rebellion/board/model/{selectionStore,viewportStore,dragStore,resetBoardState NEW}.ts`,
  `games/rebellion/board/index.ts`, `games/rebellion/board/sidebar/{logMessage.ts,logMessage.test.ts}` (события
  `TURN_ENDED`/`HANDOFF_ACCEPTED`), `games/rebellion/test/**`, `games/rebellion/board/test/**`,
  `games/rebellion/locales/{ru,en}/{session,errors,board,gameData}.json`.
- Во время FE-1 C временно владеет и файлами A/B из списков выше (только механические правки, до старта A/B форма).
- DONE WHEN: §4, §5 реализованы; тесты §9 (C) зелёные; D-1 проверен вручную на 1024×768 и 768×1024 (+1440, 375 без
  h-scroll), скриншоты; гейты — 0.

### Чужие файлы
`e2e/**` — QA (testid §7, критерий D-1 §5.5, TR-5); `packages/**` (кроме assets B), `apps/api/**`, `scripts/check-web-bundle.mjs` — backend;
`eslint.config.*`, `apps/web/package.json`, `vite.config.ts` — frontend-lead на INTEGRATION (новых зависимостей нет).

```text
BE-R0 (вкл. FE-0) ─┬─▶ B: assets/factions+emblems (сразу)
                   └─▶ BE-A ‖ BE-B ‖ BE-C ──▶ FE-1 (C, вместе с BE-B/C) ─┬─▶ A ────────────────────────────┐
                                                                         ├─▶ B: форма ─▶ (setup.json cleanup после A)
                                                                         └─▶ C2 (API/idempotency ‖ hot-seat UI) ─▶ INTEGRATION ─▶ REVIEW
```
Один FE-воркер: (R0) → B-assets → FE-1 → C2(API) → B-форма → A → C2(hot-seat).

---

## 11. Сверка с `plan-backend.md` (прочитан 2026-11-08, после Clarifications)

| Тема | Backend | Итог для FE |
|---|---|---|
| FE-0 | поглощён R0 (один исполнитель, иначе web не компилируется между шагами) | ✓ принято; frontend-lead ревьюит web-дифф R0 |
| Переход wire | R0 сохраняет wire; BE-C + FE-1 сливаются одним шагом | ✓ FE-1 на ветке BE-B/C |
| Реестр `factions`/эмблемы | владелец FE Worker B (`assets/{factions,emblems}.ts` + `test/assets/**`) | ✓ §10 B |
| Setup | `RebellionSetupInputSchema` (`aiDifficulty` nullable/optional, refine Q-6), `REBELLION_SETUP_DEFAULTS` (frozen), `SUPPORTED_RULESETS/GAME_MODES` | ✓ `DEFAULT_SETUP` = реэкспорт; human → поле опускаем |
| DTO | `SessionResponse { sessionId, gameId, status, settings, view }`, `SessionSummary.status`, `IDEMPOTENT_REPLAY_HEADER`; replay 200 | ✓ |
| Details | `aiDifficulty: nullable` (Q-20) | ✓ `describeSession` принимает `null` |
| PlayerView | player `{ kind, viewer, activeSide, settings, id, version, … }`; handoff `{ kind, id, version, activeSide, round, phase, sessionStatus }` | ✓ §5 |
| Команды | `END_TURN` (не mock, фазу не меняет), `ACCEPT_HANDOFF`; `END_TURN` в `legalActions` только human/активная сторона; `legalActions = []` при handoff или `viewer ≠ activeSide` | ✓ |
| Ошибки | wire `errors.<name>`: `notYourTurn`, `handoffPending`, `handoffNotAvailable`, `rulesetUnavailable`, `modeUnavailable`; платформа `setupUnsupported` (fallback), `idempotencyKeyReused`; коды `SETUP_UNSUPPORTED`, `IDEMPOTENCY_KEY_REUSED` | ✓ ключи в §8 |
| AM-FE-4 в их таблице («повтор тем же ключом») | серверное поведение верно; клиент по Q-5 создаёт новый ключ на попытку | ✓ без конфликта (§4.2) |
| События `TURN_ENDED`, `HANDOFF_ACCEPTED` | новые типы событий журнала | **добавить** в `logMessage` (C2): «Империя передала ход», «Повстанцы приняли ход»; ключи `rebellion.board:log.*` (C) |

## 12. Proposed amendments (решают Analyst + backend-lead)

| ID | Предложение | Статус |
|---|---|---|
| AM-FE-1 | Handoff-view содержит `version` | **закрыто Q-12** |
| AM-FE-2 | `aiDifficulty` для human в details | **закрыто Q-20** (`null` допустим) |
| AM-FE-3 | `TableScreenProps.status: SessionStatus` (web-реестр, аддитивно); `SessionEnvelope` + `status`, `settings` | FE-контракт, согласован с backend (DTO) |
| AM-FE-4 | (отозвано) переиспользование ключа после ошибки | **заменено Q-5**: новый ключ на каждую попытку |
| AM-FE-5 | `messageKey` в формате `errors.<name>`; запись spec `rebellion.errors:rulesetUnavailable` — i18n-ключ, куда `translateError` разрешает `errors.rulesetUnavailable` | **принято backend** |
| AM-FE-6 | Пакет экспортирует `REBELLION_SETUP_DEFAULTS` и `SUPPORTED_RULESETS`/`SUPPORTED_GAME_MODES` | **принято backend** (§4.1) |
| AM-FE-7 | `END_TURN` присутствует в `legalActions` активной стороны human-партии | **принято backend** (§4.2) |
| AM-FE-8 | (поглощено Q-11) сторона — `view.viewer`, настройки — `settings` ответа сессии | **закрыто Q-11** |
| AM-FE-9 | `WebGameEntry.describeSession` может вернуть `SessionLinePart[]` (`{ key, text }`), платформа рисует части с `data-testid="recent-session-<key>"` | открыто (FE-контракт; нужно для TR-1 без знания платформой о фракциях) |

## 13. Риски

| Риск | Митигация |
|---|---|
| Переименование ломает e2e/данные | FE-0 отдельным шагом с зелёным `pnpm verify`; QA синхронно; меняется один testid карточки |
| Утечка старого view при handoff (кеш/сторы/debug) | §5.3 шаги 1–3 + TC-C-17/18/20; key-remount `Table` по `viewer` |
| Случайное «принятие» хода игроком A | фокус на h1, не на кнопке; подтверждение — явная кнопка с названием стороны |
| Перегрузка шапки в human-партии | группы + `flexWrap` как страховка при любой ширине + TC-VA-08 |
| Эмблемы похожи на чужие знаки | правила §2.2 + визуальное ревью frontend-lead на INTEGRATION |
| Потерянный ответ POST при сетевом сбое → дубль при повторе с новым ключом (Q-5) | принятый риск продукта (Q-5); видимый итог — 2 партии в списке, без потери данных |

## 14. Open questions

| ID | Вопрос | Предложение FE |
|---|---|---|
| OQ-1 | TC-VA-12 ожидает фокус на «Я — Империя» при появлении заслонки | Фокус на `handoff-title` (D-SW4-21): иначе Enter игрока A, только что нажавшего «Передать ход» с клавиатуры, принимает ход за B. Просим QA поправить кейс; если Analyst решит иначе — одна строка в `HandoffScreen` |
| OQ-2 | TR-1 `game-sessions-loading`/`game-sessions-empty` vs существующие `game-recent-loading`/`game-recent-empty` | Оставить существующие (стабильность e2e SWR-003); QA ссылается на них |
| OQ-3 | Кто рисует эмблемы и создаёт `factions` в `./assets` | **закрыто**: FE Worker B (`plan-backend.md` §10) |
| OQ-4 | Ruleset/mode в строке недавней партии | Не выводить, пока выбор единственный (D-SW4-15); вернуть, когда появится RotE |
