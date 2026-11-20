# Plan — frontend (SWR-006 / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-19 · **Статус:** только план: кода, установок и правок вне этого файла нет.
**Входы:** `specification.md` (Contract §1, §6, раздел «Поправки по официальному запросу PO» D-PO-1..6 — имеет приоритет),
`request.md` (включая «Официальный запрос PO» п. 5, 7), AC-07, AC-10, AC-11; формат — `docs/tasks/SWR-005/plan-frontend.md`,
`docs/tasks/SWR-005B/plan-frontend.md`. Прочитанный код: `apps/web/src/platform/{session-host,sessions}/**`, `platform/index.ts`,
`games/types.ts`, `games/rebellion/table/{TableScreen,hooks/useSendCommand,components/AiStatusChip}.tsx|ts`,
`games/rebellion/core-v1/{CoreTable,model/{coreContext,announcements},top-bar/**,panels/{TurnPanel,useTurnCommands},sidebar/{CoreEventLog,coreLogMessage}}`,
`games/rebellion/locales/{ru,en}/{match,session,turn}.json`, `games/rebellion/locales.i18n.test.ts`, `locales/{ru,en}/{sessionHost,errors}.json`,
`packages/platform/src/sessions.ts`, `packages/games/rebellion/src/schema/{results,state,view,settings}.ts`, `scripts/check-web-bundle.mjs`,
`e2e/support/testids.ts`, `e2e/core-{turn,hidden-base,visual-a11y}.spec.ts` (только чтение).
**`plan-backend.md` на момент написания отсутствует** → то, что UI берёт с провода, записано как предположения **W-1..W-8** (§2).
Если BE выберет другую форму — меняется только `apps/web/src/platform/sessions/api.ts` (+ фикстуры); компоненты читают данные
только через `useSessionAutomation()` и `commitCommandResult()` (§4).

---

## 0. Инварианты (для FE-воркеров)

1. **UI ничего не решает за сервер.** Чей ход, ходит ли AI, сколько шагов, был ли откат, кончилась ли партия — только из
   `view` (`activeSide`, `outcome`, `legalActions`, `log`) и `automation` ответа. UI не угадывает ходы AI и не «доигрывает» их сам —
   только вызывает `POST /api/sessions/:id/automation/run`, когда сервер сказал `automation.pending === true`.
2. **Скрытая информация.** UI показывает только то, что прислал сервер: события уже отредактированы `toPlayerEvents`, `view` —
   `PlayerView` человека. Никаких догадок о базе (например, «AI сходил в систему, которой нет в журнале»). От модели в UI не идёт
   ничего: ни `reason`, ни кандидатов, ни промптов, ни сумм бюджета — только агрегаты `steps/pending/strategy/fallbacks/fallbackReasons/stopReason`.
   `fallbackReasons` — коды `AI_*`, не секретны (D-PO-3).
3. **Платформа game-agnostic.** Всё, что касается `automation` в проводе, автозапуска `run`, ошибки/повтора — в
   `apps/web/src/platform/**`, без слов Rebellion/фракций/систем. Rebellion-представление (метка «AI Commander · бот · Обычная»,
   «ИИ думает…», сводка хода, «(AI)» в журнале) — в `apps/web/src/games/rebellion/**`.
4. **Бандл.** Web импортирует только `@bga/platform` и `@bga/game-rebellion/schema` (как сейчас). Никаких импортов
   `@bga/game-rebellion/ai|rules|server`: allowlist `WEB_GAME_SUBPATHS = ['definition','schema','board','assets']` в
   `scripts/check-web-bundle.mjs` уже запрещает всё остальное — **скрипт не меняется**, `check:bundle` должен остаться зелёным.
5. **Контракт реестра игр (`games/types.ts`, FROZEN) не меняется:** `TableScreenProps` без новых полей; автоматизация доходит до игры
   через React-контекст платформы (§4.3).
6. Литералов UI-текста в JSX нет (ESLint), testid не зависят от языка, все новые тексты — ru/en с паритетом ключей.
7. Без новых зависимостей. Состояние автоматизации — Zustand (уже в стеке) + кэш TanStack Query (`sessionKeys.detail`).

---

## 1. Затрагиваемая структура

```text
apps/web/src/
  platform/
    sessions/api.ts                         M  SessionEnvelope.automation, SessionCommandResult.ok.automation, runSessionAutomation()  (FE-1)
    sessions/api.test.ts                    M  парсинг automation, run 200/404/422/5xx                                               (FE-1)
    sessions/queries.ts                     M  только комментарий о правилах кэша для run                                              (FE-1)
    automation/                             NEW game-agnostic хост автоматизации                                                     (FE-1)
      automationStore.ts                        Zustand: { sessionId, phase, error, lastRun, autoRunArmed } по текущей сессии
      commitCommandResult.ts                    запись ответа команды/run в кэш + в store (единая точка, §4.2)
      runAutomation.ts                          одиночный запуск run с защитой от дублей (in-flight guard в store)
      useAutomationDriver.ts                    автозапуск при pending (≤ 1 раз на загрузку/ответ команды, §3)
      SessionAutomationContext.tsx              Provider + useSessionAutomation() (null вне SessionHost)
      AutomationNotice.tsx                      Alert «Ход AI не завершён» + кнопка «Продолжить ход AI»
      fallbackReason.ts                         automationFallbackReasonText(t, code) → короткая причина (ru/en, unknown → fallback-текст)
      automation.test.tsx                       тесты store/driver/notice (§9 P-*)
    session-host/SessionHost.tsx            M  useAutomationDriver + Provider + AutomationNotice + data-automation-* на session-host  (FE-1)
    session-host/SessionHost.test.tsx       M  кейсы автозапуска/повтора (§9 P-*)                                                       (FE-1)
    index.ts                                M  экспорт runSessionAutomation, commitCommandResult, useSessionAutomation, типов,
                                               automationFallbackReasonText                                                             (FE-1)
    test/fakeGame.ts                        M  makeSessionEnvelope({ automation }) по умолчанию { pending:false, strategy:null }          (FE-1)
  locales/{ru,en}/sessionHost.json          M  automation.* (§7.1)                                                                     (FE-1)
  games/rebellion/
    table/hooks/useSendCommand.ts           M  разбор ответа: game-часть {ok,view,events} + automation → commitCommandResult              (FE-2)
    table/hooks/useSendCommand.test.tsx     M                                                                                          (FE-2)
    core-v1/CoreTable.tsx                   M  isPending = command || AI running; aiThinking; объявления по lastRun                      (FE-2)
    core-v1/model/coreContext.ts            M  + aiThinking: boolean                                                                   (FE-2)
    core-v1/model/aiCommander.ts            NEW чистые функции: aiSideOf(settings), isAiActor, handsTurnOver(command), aiLabelParts   (FE-2)
    core-v1/model/aiCommander.test.ts       NEW                                                                                        (FE-2)
    core-v1/top-bar/AiCommanderStatus.tsx   NEW метка «AI Commander · бот · Обычная» + «ИИ думает…» (role=status)                        (FE-2)
    core-v1/top-bar/AiCommanderStatus.test.tsx NEW                                                                                     (FE-2)
    core-v1/top-bar/CoreTopBar.tsx          M  слот AiCommanderStatus после TurnIndicator                                              (FE-2)
    core-v1/top-bar/CoreTopBar.test.tsx     M                                                                                          (FE-2)
    core-v1/top-bar/CoreGameInfoPanel.tsx   M  AiStatusChip («не активен в прототипе») → строки «Противник» / «AI Commander»            (FE-2)
    core-v1/top-bar/index.ts                M  экспорт AiCommanderStatus                                                               (FE-2)
    core-v1/panels/AiTurnSummary.tsx        NEW «Ход AI: N действий» + уведомление об откате с причинами                                 (FE-2)
    core-v1/panels/AiTurnSummary.test.tsx   NEW                                                                                        (FE-2)
    core-v1/panels/TurnPanel.tsx            M  AiTurnSummary под заголовком; статус «ИИ думает…» в состоянии waiting                   (FE-2)
    core-v1/panels/TurnPanel.test.tsx       M  (в т. ч. кейс `announce.autoPass`, строка 88)                                            (FE-2)
    core-v1/panels/test/harness.tsx, CoreHarness.tsx  M  опциональный SessionAutomationContext в обвязке                           (FE-2)
    test/coreFixtures.ts                    M  makeCoreSession(..., { automation }) + makeAutomationSummary()                         (FE-2)
    locales/{ru,en}/match.json              M  удалить log.autoHint/log.autoTag, переписать announce.autoPass*/autoFinish*, + ai.*, log.aiTag, log.aiActor  (FE-2)
    locales/{ru,en}/turn.json               M  + panel.aiThinking                                                                     (FE-2)
    locales.i18n.test.ts                    M  ключи ai.*, удаление autoHint/autoTag, тест «нет "не реализован"»                         (FE-2)
    core-v1/sidebar/CoreEventLog.tsx        M  чип «AI» для событий AI-стороны вместо «авто» + autoHint                                (FE-3)
    core-v1/sidebar/CoreEventLog.test.tsx   M                                                                                          (FE-3)
    core-v1/sidebar/coreLogMessage.ts       M  «(AI)» по актёру = AI-сторона (не только payload.auto); isAiEvent                        (FE-3)
    core-v1/sidebar/coreLogMessage.test.ts  M                                                                                          (FE-3)
    core-v1/model/announcements.ts          M  autoPass/autoFinish → по AI-актёру (сигнатура + settings)                                (FE-3)
    core-v1/model/announcements.test.ts     M                                                                                          (FE-3)
    core-v1/panels/useTurnCommands.ts       M  передать settings в announcementsFor (одна строка)                                        (FE-3)
```

**Не меняются:** `games/types.ts` (FROZEN), `shared/api/**`, `scripts/check-web-bundle.mjs` (+test), `games/rebellion/table/LegacyTable.tsx`,
`table/components/{AiStatusChip,GameInfoPanel}.tsx` и `rebellion.session:ai.inactive` (mock-v1 — без изменений, AC-11; текст
«не активен в прототипе» для mock-v1 верен), `HandoffScreen` (hot-seat), `setup/**` (PO-2: выбор провайдера в UI вне задачи),
`dev/**`, `e2e/**` (QA, §10), `packages/**` (схемы — BE).

---

## 2. Wire: предположения FE (сверить с `plan-backend.md`)

| ID | Предположение | Источник |
|---|---|---|
| W-1 | `@bga/platform` экспортирует `AutomationStrategySchema = z.enum(['bot','openai'])`, `SessionAutomationSchema = z.strictObject({ pending: z.boolean(), strategy: AutomationStrategySchema.nullable() })`, `AutomationStopReasonSchema`, `AutomationRunSummarySchema = z.strictObject({ steps: z.int().min(0), pending, strategy, fallbacks: z.int().min(0), fallbackReasons: z.array(z.string()), stopReason })` и типы. | Contract §1, D-PO-3 |
| W-2 | `SessionResponseSchema` (strict) получает **обязательное** `automation: SessionAutomationSchema`; `SessionCommandOkSchema` (strict) — **обязательное** `automation: AutomationRunSummarySchema`. Для mock-v1/Forbidden Stars/hot-seat сервер шлёт `{pending:false, strategy:null}` и `{steps:0, pending:false, strategy:null, fallbacks:0, fallbackReasons:[], stopReason:'none'}`. (Q-FE-7) | Contract §1, AC-01 |
| W-3 | `POST /api/sessions` (201/200 replay) и `GET /api/sessions/:id` возвращают `SessionResponse` с `automation`; после создания партии с AI первым первые ходы AI уже сделаны (их события — в `view.log`), `automation.pending` может быть `true` (лимит/ошибка). | spec Scenario 2, AC-07 |
| W-4 | `POST /api/sessions/:id/automation/run`, тело `{}`, без `Idempotency-Key` и без `expectedVersion` → `200 SessionCommandOk` (view человека, отредактированные события AI-шагов этого запуска, `automation`); нет хода AI → `200 { steps:0, stopReason:'none' }`. 404 `NOT_FOUND`, 422 `GAME_UNAVAILABLE` — `ErrorResponse`; 5xx/сеть — исключение. | Contract §1 |
| W-5 | `view` и `events` в ответе run отфильтрованы для **человеческой** стороны AI-партии (как ответ на команду человека). | Contract §2 |
| W-6 | В `view.log` и `events` ходы AI имеют `actor = AI-сторона`; `PASSED`/`ACTIVATION_FINISHED` AI — `payload.auto: true` (origin `auto`); `SYSTEM_ACTIVATED`/`PIECES_MOVED` поля `auto` не имеют (схемы событий не меняются). Для человека-Империи ходы Повстанцев в/из базы — с `systemId: null` (уже есть, SWR-005). | spec §6, `schema/state.ts` |
| W-7 | `stopReason:'conflict'` = другой исполнитель продвинул сессию: `view` ответа может быть не последним → FE инвалидирует `detail` (§5). | Contract §2 |
| W-8 | Схема ответа Rebellion `CommandOkSchema` (`packages/games/rebellion/src/schema/results.ts`, strict, без `automation`) **не меняется**: web разбирает ею только игровую часть `{ok, view, events}`, а `automation` — схемой платформы (AM-FE-1). | `schema/results.ts` |

---

## 3. Поведение автоматизации на клиенте (платформа, AC-07 клиентская часть)

### 3.1 Состояния (на сессию, `automationStore`)

| `phase` | Когда | UI платформы | UI Rebellion |
|---|---|---|---|
| `idle` | нет запуска; `pending:false` | — | метка «AI Commander · …» (если AI-партия) |
| `running` | идёт `POST …/automation/run` | `session-host[data-automation-state=running]` | «ИИ думает…», действия заблокированы |
| `error` | run упал (сеть/5xx/невалидный ответ) | `AutomationNotice` (`data-reason=error`) с причиной + «Продолжить ход AI» | «ИИ думает…» нет; панель хода — «Ход AI не завершён» |
| `stalled` | run/команда вернули `pending:true` и автозапуск уже израсходован | `AutomationNotice` (`data-reason=stalled`) + «Продолжить ход AI» | то же |

Плюс производное «ИИ думает…» во время **команды человека**, передающей ход AI (Rebellion, §6.2).

### 3.2 Правило автозапуска (Q-FE-1)

- `autoRunArmed` взводится: (а) когда `SessionView` получает данные сессии из **загрузки** (`GET`, в т. ч. refetch после 409/404/game over)
  или из создания (`useCreateSession` → `setQueryData`), (б) в `commitCommandResult(..., source:'command')`.
- Драйвер (`useAutomationDriver`, effect в `SessionView`): если `data.automation.pending && autoRunArmed && phase !== 'running'` →
  `autoRunArmed = false` и один `runAutomation(sessionId)`.
- Ответ **run** с `pending:true` **не** взводит автозапуск → `phase = 'stalled'`, кнопка «Продолжить ход AI». Так клиент не уходит в
  бесконечный цикл при `stopReason: 'error'` (движок отверг и кандидата бота) и делает ≤ 1 автоматического run на каждую
  загрузку/ответ (spec §6). Повтор — только по клику (или после следующей загрузки страницы).
- Защита от дублей: `runAutomation` игнорирует вызов, если `phase === 'running'` для этой сессии (guard в module-level store, а не в
  `useRef`, — переживает StrictMode-двойной effect и двойной клик). Сервер в любом случае идемпотентен (mutex + optimistic concurrency).
- Смена сессии (`SessionView key=sessionId`) → `reset(sessionId)` store. Уход со страницы во время run: запрос не отменяется
  (отмена fetch не отменит ход на сервере), ответ всё равно пишется в кэш `detail` (W-4 — безопасно), store игнорирует ответ чужой сессии.
- `strategy === null` (не AI-игра/mock-v1/FS) и `pending:false` → драйвер ничего не делает, ни одного лишнего запроса (тест P-2).

### 3.3 Обработка ответа run

| Ответ | Действия |
|---|---|
| 200 | `commitCommandResult(qc, id, { view, events, automation }, 'run')`: `setQueryData(detail, prev ⇒ ({...prev, view, automation:{pending, strategy}}))`; `invalidate(lists())`; `stopReason==='gameOver'` или `'conflict'` → `invalidate(detail)` (статус `completed` / авторитетный view); `lastRun = { source:'run', summary, events, seq++ }`; `phase = pending ? 'stalled' : 'idle'` |
| 404 | `invalidate(detail)` → SessionHost покажет `session-not-found` (как у команд) |
| 422 `GAME_UNAVAILABLE` | `invalidate(detail)` → `session-unsupported` |
| сеть / 5xx / `INVALID_RESPONSE` | `phase = 'error'`, `error = e` (текст — `translateUnknownError`), кэш не трогается |

---

## 4. Платформенный API для игр (FE-1, `@/platform`)

### 4.1 `platform/sessions/api.ts`

```ts
export interface SessionEnvelope { sessionId; gameId; status; settings; view: unknown; automation: SessionAutomation } // + automation
export type SessionCommandResult =
  | { ok: true; view: unknown; events: unknown[]; automation: AutomationRunSummary }
  | { ok: false; error: { code: string; messageKey: string; details?: unknown } };
/** POST /api/sessions/:id/automation/run {} → SessionCommandOk; throws ApiError for 404/422/5xx/network/invalid body. */
export function runSessionAutomation(sessionId: string, options?: CallOptions): Promise<Extract<SessionCommandResult, { ok: true }>>;
```
`createSession`/`getSession`/`postSessionCommand` уже валидируют ответ схемами платформы — после W-2 `automation` приходит сам.

### 4.2 `commitCommandResult(qc, sessionId, ok, source: 'command' | 'run')`

Единственное место, где ответ с `automation` пишется в кэш и в store (используется `useSendCommand` Rebellion и `runAutomation`).
Не парсит `view`/`events` (они `unknown` для платформы). `source:'command'` дополнительно: `autoRunArmed = true`, сбрасывает
`phase` `error|stalled` → `idle`. `lastRun`: при `summary.steps > 0` — перезаписывается; при `steps === 0` и `source:'command'` —
очищается (Q-FE-5: сводка прошлого хода AI исчезает после следующего действия человека); при `steps === 0` и `source:'run'` — не меняется.

### 4.3 `useSessionAutomation(): SessionAutomationState | null`

```ts
interface SessionAutomationState {
  strategy: 'bot' | 'openai' | null;   // из кэша detail (envelope.automation)
  pending: boolean;                     // из кэша
  phase: 'idle' | 'running' | 'error' | 'stalled';
  error: unknown;                       // для phase 'error'
  lastRun: { source: 'command' | 'run'; summary: AutomationRunSummary; events: unknown[]; seq: number } | null;
  retry(): void;                        // = runAutomation(sessionId), no-op при running
}
```
Provider — в `SessionView` вокруг `<TableScreen>`; вне SessionHost (юнит-тесты игр, обвязки) → `null` = «автоматизации нет».
Контекст, а не новый `useQuery`: второй наблюдатель `sessionQuery` с устаревшими данными сделал бы лишний refetch.

### 4.4 `AutomationNotice` (в SessionHost, generic)

MUI `Alert severity="warning"`, позиция как у `session-refetch-warning` (фикс. снизу по центру; если оба — стек, notice выше),
`role="alert"`. Текст: `phase=error` → `sessionHost:automation.error` («Ход AI не завершён: {{reason}}»); `stalled` →
`sessionHost:automation.stalled` («AI ещё не закончил ход.»). Кнопка `sessionHost:automation.retry` «Продолжить ход AI» с
`loading` при `running`. Слово «AI» generic, игр не называет.

### 4.5 `automationFallbackReasonText(t, code)`

`t('sessionHost:automation.reason.<CODE>', { defaultValue: t('sessionHost:automation.reason.unknown') })` — коды D-PO-3.

---

## 5. TanStack Query: кэш и инвалидация (сводка)

| Событие | `detail(id)` | `lists()` |
|---|---|---|
| create (как было) | `setQueryData(envelope с automation)` → драйвер может запустить run | invalidate |
| команда 200 | `setQueryData({...prev, view, automation:{pending,strategy}})` (через `commitCommandResult`) | invalidate |
| команда 200 c `GAME_OVER` / `stopReason gameOver` | + invalidate (статус `completed`) | invalidate |
| команда/run 200 c `stopReason conflict` | + invalidate (W-7) | invalidate |
| команда 409/404 (как было) | invalidate | — |
| run 200 | как команда 200 | invalidate |
| run 404 / 422 | invalidate | — |
| run сеть/5xx | — (кэш не трогать) | — |

Оптимистичных записей нет. `SESSION_DETAIL_STALE_TIME` не меняется. Мутация run — не `useMutation` с ретраями: прямой вызов из
`runAutomation` (повтор только явный, `retry: 0` по сути).

---

## 6. Rebellion `core-v1` (FE-2, FE-3)

### 6.1 `useSendCommand`

- `result.ok` → `CommandOkSchema.safeParse({ ok: true, view: result.view, events: result.events })` (W-8, AM-FE-1); успех →
  `commitCommandResult(qc, sessionId, result, 'command')` (вместо прямого `setQueryData`); существующие правила (GAME_OVER → invalidate,
  INVALID_RESPONSE, 409/404) сохраняются. `CommandOutcome` ok получает `automation` (необязательно для board-кода mock-v1).
- mock-v1 (`LegacyTable`) использует тот же хук → регрессия покрывается существующими тестами + кейс «automation strategy null».

### 6.2 «ИИ думает…» и блокировка действий

`CoreTable`: `aiThinking = isAiGame && (automation?.phase === 'running' || (isPending && handsTurnOver(lastSentCommand)))`, где
`handsTurnOver(cmd) = cmd.type === 'PASS' || cmd.type === 'FINISH_ACTIVATION'` (Q-FE-3; `ACTIVATE_SYSTEM`/`MOVE_PIECES` хода не
передают — индикатор для них ложь). `isPending` контекста = `send.isPending || automation?.phase === 'running'` → все кнопки/drag
(`TurnControls`, `LeaderPool`, `ActivationPicker`, `MoveSourceFieldset`, `CoreBoardList`) блокируются существующим кодом.
Hot-seat (`opponentType: 'human'`) → `aiThinking` всегда `false`.

### 6.3 Метка AI Commander — где живёт (spec §6, D-PO-4)

- **Шапка** (`CoreTopBar`, группа «стороны», сразу после `TurnIndicator`): `AiCommanderStatus` — только при `settings.opponentType === 'ai'`.
  `Chip` с иконкой `SmartToyOutlined`: «AI Commander · {{provider}} · {{difficulty}}» (`provider` = «бот» | «OpenAI»; при `strategy:null` —
  без провайдера, Q-FE-6). Рядом при `aiThinking` — `CircularProgress size=14` + «ИИ думает…» в `role="status"` (`aria-live=polite`).
  Не скрывается < 600 px (в отличие от текста «против AI · Обычная» — он остаётся как «какой противник выбран»).
- **Панель «Об игре»** (`CoreGameInfoPanel`): `AiStatusChip` («не активен в прототипе») заменён двумя строками `dl`:
  «Противник» — «AI · Обычная» / «Второй игрок»; «AI Commander» — «Бот (детерминированный)» / «OpenAI (откат на бота)» / «—».
- Сложность — `view.settings.aiDifficulty` (публичная), провайдер — `automation.strategy`.

### 6.4 Сводка хода AI и уведомление об откате

`AiTurnSummary` в `TurnPanel` сразу под заголовком (видна, когда `lastRun && lastRun.summary.steps > 0`):
- «Ход AI: {{count}} действий» (ru plural one/few/many/other) — `rebellion.match:ai.summary`; если `lastRun.summary.stopReason === 'gameOver'` —
  добавка «— партия окончена» (`ai.summaryGameOver`).
- При `strategy === 'openai' && fallbacks > 0`: `Alert severity="info"` «Часть ходов AI ({{count}}) сделал бот: OpenAI недоступен —
  {{reasons}}.» (`ai.fallback`), `reasons` = `automationFallbackReasonText` по каждому коду через «, ». Без чисел бюджета, без деталей.
- Объявление в live region (через существующий `announce`): при новом `lastRun.seq` с `steps > 0` — текст сводки + существующие
  `responseAnnouncements` по `lastRun.events` (для run — парс `PlayerEventSchema`, нераспознанные события пропускаются). Для команд
  объявление уже делает `useTurnCommands.run` → сводку добавляет туда же, чтобы не объявлять дважды (правило: `source:'command'` →
  объявляет `useTurnCommands`, `source:'run'` → effect в `CoreTable`).
- `TurnPanel` в состоянии `waiting` при `aiThinking` → `turn-status` = «ИИ думает…» (`turn:panel.aiThinking`); при `phase error|stalled`
  → «Ход AI не завершён — нажмите «Продолжить ход AI»» (`turn:panel.aiStalled`).

### 6.5 Журнал (FE-3) — как ходы AI попадают в историю (D-PO п. 7)

- Источник — `view.log` (уже содержит ходы AI, отредактированные сервером; W-6). Новых запросов нет.
- `isAiEvent(e, settings) = settings.opponentType === 'ai' && e.actor === settings.opponentFaction` (или `payload.auto === true` — на всякий
  случай). Решение Q-FE-4: помечается **каждое** событие AI-стороны (активация, перемещение, завершение, пас), а не только `auto`.
- Текст: имя актёра для AI-событий — `rebellion.match:log.aiActor` «{{actor}} (AI)» → «Империя (AI): Вейдер активирует систему Корусант»,
  «Повстанцы (AI): X-wing — скрытая зона → Татуин» (для человека-Империи `null` → «скрытая зона», как в SWR-005). Для `PASSED`/
  `ACTIVATION_FINISHED` — существующие ключи `*_auto` (уже «(AI)»), выбор по `isAiEvent`, а не по `payload.auto`.
- Элемент: `log-entry-<seq>[data-ai="true|false"]` (+ `data-auto` сохраняется как есть); чип «AI» (`log.aiTag`, иконка робота)
  `log-entry-<seq>-ai`. **Подсказка `log-entry-<seq>-auto-hint` и чип `log-entry-<seq>-auto` удаляются** (тексты «AI Commander ещё не
  реализован» уходят). Чип с `aria-hidden` текстом не дублирует — «(AI)» уже в строке.
- `announcementsFor(events, viewer, settings)`: `autoPass`/`autoFinish` — по AI-актёру; тексты `announce.autoPass*`/`autoFinish*`
  переписаны без «ещё не реализован» (§7.2). Объявлений по каждой активации/перемещению AI не добавляем — их заменяет сводка §6.4.

### 6.6 Конец партии

`stopReason: 'gameOver'` / `view.outcome` → существующий `OutcomeBanner` (фокус у него); `AiCommanderStatus` без «ИИ думает…»,
`data-state="over"`; драйвер не запускается (`pending:false`). Победа Империи над AI-Повстанцами отображается тем же баннером.

---

## 7. i18n

### 7.1 Платформа `locales/{ru,en}/sessionHost.json` (FE-1)

| Ключ | ru | en |
|---|---|---|
| `automation.error` | Ход AI не завершён: {{reason}} | The AI turn did not finish: {{reason}} |
| `automation.stalled` | AI ещё не закончил ход. | The AI has not finished its turn yet. |
| `automation.retry` | Продолжить ход AI | Continue AI turn |
| `automation.reason.AI_TIMEOUT` | нет ответа вовремя | no answer in time |
| `automation.reason.AI_RATE_LIMITED` | слишком много запросов | too many requests |
| `automation.reason.AI_PROVIDER_ERROR` | ошибка сервиса | service error |
| `automation.reason.AI_INVALID_DECISION` | недопустимый ответ модели | invalid model answer |
| `automation.reason.AI_NOT_CONFIGURED` | не настроен | not configured |
| `automation.reason.AI_BUDGET_EXCEEDED` | исчерпан бюджет партии | game budget exhausted |
| `automation.reason.AI_DEADLINE` | превышено время хода | turn time exceeded |
| `automation.reason.unknown` | другая причина | other reason |

### 7.2 Rebellion `rebellion.match` (FE-2 вносит все ключи; FE-3 только использует)

| Ключ | ru | en |
|---|---|---|
| `ai.label` | AI Commander · {{provider}} · {{difficulty}} | AI Commander · {{provider}} · {{difficulty}} |
| `ai.labelNoProvider` | AI Commander · {{difficulty}} | AI Commander · {{difficulty}} |
| `ai.provider.bot` / `ai.provider.openai` | бот / OpenAI | bot / OpenAI |
| `ai.thinking` | ИИ думает… | AI is thinking… |
| `ai.summary_one/_few/_many/_other` (ru), `_one/_other` (en) | Ход AI: {{count}} действие / действия / действий / действия | AI turn: {{count}} action / actions |
| `ai.summaryGameOver` | — партия окончена | — the game is over |
| `ai.fallback` | Часть ходов AI ({{count}}) сделал бот: OpenAI недоступен — {{reasons}}. | {{count}} AI move(s) were made by the bot: OpenAI unavailable — {{reasons}}. |
| `ai.infoOpponent` / `ai.infoOpponentAi` / `ai.infoOpponentHuman` | Противник / AI · {{difficulty}} / Второй игрок | Opponent / AI · {{difficulty}} / Second player |
| `ai.infoCommander` / `ai.infoCommanderBot` / `ai.infoCommanderOpenai` | AI Commander / Бот (детерминированный) / OpenAI (при сбое — бот) | AI Commander / Bot (deterministic) / OpenAI (bot on failure) |
| `log.aiActor` | {{actor}} (AI) | {{actor}} (AI) |
| `log.aiTag` | AI | AI |
| `announce.autoPass` (+`_rebels`/`_empire`) | Пас AI ({{side}}) / {{side}} (AI) пасуют / {{side}} (AI) пасует | AI pass ({{side}}) / {{side}} (AI) pass / {{side}} (AI) passes |
| `announce.autoFinish` (+`_rebels`/`_empire`) | Активация AI ({{side}}) завершена / {{side}} (AI) завершают активацию / {{side}} (AI) завершает активацию | AI activation ({{side}}) finished / … finish / … finishes |

**Удаляются:** `log.autoHint`, `log.autoTag` (ru/en) и их проверка в `locales.i18n.test.ts` (строки ~222–223); старые тексты
`announce.autoPass*` с «AI Commander ещё не реализован» / «not implemented yet» переписываются. `turn.json`: `panel.aiThinking`
(«ИИ думает…» / «AI is thinking…»), `panel.aiStalled` («Ход AI не завершён — нажмите «Продолжить ход AI».» / «The AI turn did not
finish — press “Continue AI turn”.»). Новый тест: ни один файл `apps/web/src/**/locales/**` (ru/en) не содержит
`/ещё не реализован|not implemented yet/i` (AC-10).

---

## 8. testid / data-атрибуты для QA (e2e)

| testid / атрибут | Где | Значение |
|---|---|---|
| `session-host[data-automation-pending]` | платформа | `true|false` из кэша |
| `session-host[data-automation-strategy]` | платформа | `bot|openai|none` |
| `session-host[data-automation-state]` | платформа | `idle|running|error|stalled` |
| `session-automation-notice[data-reason]` | платформа | `error|stalled` |
| `session-automation-retry` | платформа | кнопка «Продолжить ход AI» |
| `ai-commander-status[data-strategy][data-difficulty][data-state]` | шапка core-v1 | `bot|openai|none`, `easy|normal|hard`, `idle|thinking|stalled|over` |
| `ai-thinking` | шапка core-v1 | «ИИ думает…» (`role=status`), есть только во время хода AI |
| `game-info-opponent`, `game-info-ai-commander[data-strategy]` | панель «Об игре» | противник / провайдер |
| `ai-turn-summary[data-steps][data-source]` | панель хода | сводка последнего хода AI |
| `ai-fallback-notice[data-fallbacks][data-reasons]` | панель хода | `data-reasons` = коды через запятую |
| `turn-status` (существующий) | панель хода | «ИИ думает…» / «Ход AI не завершён…» |
| `log-entry-<seq>[data-ai]` (+ `data-actor`, `data-type`, `data-auto` — как было) | журнал | `true` для событий AI-стороны |
| `log-entry-<seq>-ai` | журнал | чип «AI» |
| **удалены:** `log-entry-<seq>-auto`, `log-entry-<seq>-auto-hint`; `ai-status` в core-v1 (в mock-v1 остаётся) | | |

**Влияние на существующие e2e (владелец — QA):** `e2e/support/testids.ts` (`logEntryAuto`, `logEntryAutoHint`),
`e2e/core-turn.spec.ts:228-244` и `e2e/core-hidden-base.spec.ts:65-106` (ожидают ровно один авто-`PASSED` и подсказку — после SWR-006
AI делает настоящие ходы, ожидания меняются), `e2e/core-visual-a11y.spec.ts:181`. Предлагаемые e2e (D-PO-5): человек-Повстанцы vs
AI-Империя Normal и человек-Империя vs AI-Повстанцы — полный раунд, проверки `ai-commander-status`, `ai-turn-summary`, `log-entry-*[data-ai=true]`,
для Империи — нет имени базовой системы в журнале/DOM до `BASE_REVEALED`; `pending` → route-перехват `POST …/automation/run` (Playwright
`page.route`) для состояний `error` → retry; fallback-уведомление — через перехват ответа команды (`strategy:'openai'`, `fallbacks:1`,
`fallbackReasons:['AI_TIMEOUT']`), т. к. в e2e провайдер `bot`.

---

## 9. План тестов (Vitest + Testing Library; все `not_run` до IMPLEMENTATION)

**Платформа (FE-1)**
- P-1 `api.test`: `getSession`/`createSession` парсят `automation`; ответ без `automation` → `INVALID_RESPONSE` (W-2); `postSessionCommand`
  ok с `automation`; `runSessionAutomation`: `POST /api/sessions/s1/automation/run` с `{}`, 200 → summary; 404/422 → `ApiError`; 500 → `ApiError`.
- P-2 SessionHost: `strategy:null, pending:false` → ни одного POST run (fake game; mock-v1/FS сценарий).
- P-3 `pending:true` при загрузке → ровно один POST run (StrictMode-рендер), после ответа `pending:false` → кэш обновлён, `data-automation-state=idle`.
- P-4 run 500 → `session-automation-notice[data-reason=error]`, клик `session-automation-retry` → второй POST; двойной клик → один запрос.
- P-5 run 200 с `pending:true` → `stalled`, автоповтора нет (ровно 1 POST), retry → POST.
- P-6 run 404 → `session-not-found`; 422 `GAME_UNAVAILABLE` → `session-unsupported`.
- P-7 `commitCommandResult(..., 'command')` с `pending:true` → драйвер делает один run; `stopReason:'conflict'`/`'gameOver'` → refetch detail.
- P-8 `useSessionAutomation()` вне провайдера → `null`; `automationFallbackReasonText` для всех 7 кодов + unknown (ru/en).
- P-9 архитектурный: в `platform/automation/**` нет `rebellion|empire|rebels|@bga/game-` (расширить существующий `extensibility.test.tsx` или новый скан).

**Rebellion (FE-2)**
- R-1 `useSendCommand`: ответ c `automation` проходит (`CommandOkSchema` по игровой части), кэш получает `automation`, store — `lastRun`;
  mock-v1 ответ (`strategy:null`) — как раньше; существующие кейсы зелёные.
- R-2 `aiCommander.test`: `aiSideOf`, `isAiActor`, `handsTurnOver` (PASS/FINISH → true; ACTIVATE/MOVE → false).
- R-3 `AiCommanderStatus`: bot·normal / openai·hard / strategy null; `thinking` при phase running и при pending PASS; hot-seat → не рендерится; game over → `over`.
- R-4 `AiTurnSummary`: plural ru (1/3/5/21 действие/я/й), en; `fallbacks>0 && openai` → notice c причинами `AI_TIMEOUT, AI_DEADLINE`;
  `bot` c `fallbacks:0` → без notice; `steps:0` → ничего; reason модели не рендерится (в данных его нет — тест на отсутствие лишних полей не нужен).
- R-5 `CoreTable`/`TurnPanel`: во время run кнопки «Пас»/«Завершить активацию»/лидеры disabled; `turn-status` «ИИ думает…»; после run — объявление сводки
  один раз (не дважды для command-пути).
- R-6 `CoreGameInfoPanel`: строки противника/AI Commander; нет `ai-status`; mock-v1 `GameInfoPanel` по-прежнему с `ai-status` (AC-11).
- R-7 `locales.i18n.test`: паритет ru/en новых ключей, plural ru, нет `autoHint`/`autoTag`, нет «ещё не реализован»/«not implemented yet».
- R-8 Hot-seat регрессия: `TableScreen.test`/`HandoffScreen.test` зелёные, в hot-seat core-v1 нет `ai-commander-status`, `ai-turn-summary`, `ai-thinking`.

**Rebellion журнал (FE-3)**
- L-1 `coreLogMessage`: `SYSTEM_ACTIVATED`/`PIECES_MOVED` актёра AI → «Империя (AI): …»; актёр-человек — без «(AI)»; hot-seat — без «(AI)»;
  `PASSED` AI без `auto` всё равно «(AI)»; `systemId:null` → «скрытая зона».
- L-2 `CoreEventLog`: `data-ai`, чип `log-entry-<seq>-ai`; нет `-auto-hint`, нет текста «не реализован».
- L-3 `announcements`: `autoPass/autoFinish` по AI-актёру с новыми текстами; человек-соперник hot-seat → `opponentPassed`.
- L-4 Скрытая база (человек-Империя): фикстура лога с AI-Повстанцами и `null`-системами → в DOM журнала нет id/имени базовой системы
  (`makeCoreEmpireView`).

Команды на INTEGRATION (запускает лид/QA, сейчас `not_run`): `pnpm --filter @bga/web test`, `pnpm --filter @bga/web typecheck`,
`pnpm lint`, `pnpm --filter @bga/web build && pnpm check:bundle`, затем e2e (QA).

---

## 10. Подзадачи FE (для `implementation-plan.md`)

| Subtask | Role | OWNED FILES | Depends on | Phase |
|---|---|---|---|---|
| FE-1 Platform automation host | frontend-worker (platform/state) | `apps/web/src/platform/sessions/{api.ts,api.test.ts,queries.ts}`, `apps/web/src/platform/automation/**` (new), `apps/web/src/platform/session-host/{SessionHost.tsx,SessionHost.test.tsx}`, `apps/web/src/platform/index.ts`, `apps/web/src/platform/test/fakeGame.ts`, `apps/web/src/platform/extensibility.test.tsx`, `apps/web/src/locales/{ru,en}/sessionHost.json` | BE: схемы `@bga/platform` (W-1/W-2) | P2 (после BE-платформенных схем) |
| FE-2 Rebellion AI Commander UI | frontend-worker (UI) | `apps/web/src/games/rebellion/table/hooks/{useSendCommand.ts,useSendCommand.test.tsx}`, `.../core-v1/CoreTable.tsx`, `.../core-v1/CoreTable.test.tsx`, `.../core-v1/model/{coreContext.ts,aiCommander.ts,aiCommander.test.ts}`, `.../core-v1/top-bar/{AiCommanderStatus.tsx,AiCommanderStatus.test.tsx,CoreTopBar.tsx,CoreTopBar.test.tsx,CoreGameInfoPanel.tsx,index.ts}`, `.../core-v1/panels/{AiTurnSummary.tsx,AiTurnSummary.test.tsx,TurnPanel.tsx,TurnPanel.test.tsx}`, `.../core-v1/panels/test/{harness.tsx,CoreHarness.tsx}`, `.../test/coreFixtures.ts`, `.../locales/{ru,en}/{match,turn}.json`, `.../locales.i18n.test.ts` | FE-1 (API `@/platform`) | P3 |
| FE-3 Rebellion event log & announcements | frontend-worker (UI) | `.../core-v1/sidebar/{CoreEventLog.tsx,CoreEventLog.test.tsx,coreLogMessage.ts,coreLogMessage.test.ts}`, `.../core-v1/model/{announcements.ts,announcements.test.ts}`, `.../core-v1/panels/useTurnCommands.ts`, `.../core-v1/panels/useTurnCommands.focus.test.tsx` | ключи §7.2 (FE-2); не зависит от FE-1 | P2–P3 (параллельно FE-1; ключи `match.json` добавляет FE-2 — до мержа FE-3 тесты локалей FE-3 не трогает) |
| FE-INT Integration | frontend-lead | только правки стыков по согласованию; прогон web test/typecheck/lint/build/check:bundle | FE-1..3 | INTEGRATION |

(`...` = `apps/web/src/games/rebellion`.) При минимальном составе FE-2 и FE-3 может выполнить один воркер (тогда `match.json` не делится).

---

## 11. Поправки (AM-FE) и вопросы (Q-FE)

- **AM-FE-1 (W-8):** Rebellion `CommandOkSchema` остаётся без `automation`; web валидирует игровую часть ответа ею, а `automation` — схемой
  платформы. BE: если сервер валидирует ответ команды схемой Rebellion — делать это на `{ok,view,events}` до добавления `automation`.
  Контракт спецификации не меняется, только фиксируется граница схем.
- **AM-FE-2:** в `SessionCommandOk`/`SessionResponse` поле `automation` — **обязательное** (не `.optional()`), чтобы рассинхрон api↔web
  ловился как `INVALID_RESPONSE`, а не тихим «нет AI». Требует, чтобы `useCreateSession`-replay и все пути сервера его заполняли.
- **AM-FE-3:** ответ `run` с `stopReason:'conflict'` → клиент инвалидирует `detail` (W-7). Просьба к BE подтвердить, что `view` в этом
  случае может быть не последним (иначе инвалидация лишняя, но безвредная).

- **Q-FE-1 Политика автозапуска.** Рекомендация: автоматически ≤ 1 run на каждую загрузку/ответ команды; ответ run с `pending:true`
  → только ручное «Продолжить ход AI» (защита от цикла при `stopReason:'error'`).
- **Q-FE-2 Где кнопка «Продолжить ход AI».** Рекомендация: generic `AutomationNotice` в SessionHost (платформа) — работает для любой игры;
  Rebellion дублирует лишь статусом в панели хода.
- **Q-FE-3 «ИИ думает…» во время команды человека.** Рекомендация: только для `PASS`/`FINISH_ACTIVATION` в AI-партии и во время run;
  для `ACTIVATE_SYSTEM`/`MOVE_PIECES` — обычный «Сохранение…».
- **Q-FE-4 Что помечать «(AI)» в журнале.** Рекомендация: все события с `actor` = AI-сторона (не только `payload.auto`) — иначе активации и
  перемещения AI выглядят как ходы человека.
- **Q-FE-5 Как долго видна сводка «Ход AI: N».** Рекомендация: до следующего ответа с `steps > 0` или до следующей команды человека
  (`steps:0` очищает); история остаётся в журнале.
- **Q-FE-6 `strategy:null` в AI-партии core-v1** (не должно быть по контракту). Рекомендация: метка без провайдера «AI Commander · Обычная».
- **Q-FE-7 Сводка при создании партии** (`SessionResponse` без `steps`): рекомендация — сводку не показывать, первые ходы AI видны в журнале;
  контракт не расширять.

## 12. Известные ограничения
- План написан до `plan-backend.md`: имена экспортов `@bga/platform` (W-1) и обязательность `automation` (W-2) нужно сверить.
- Существующие e2e SWR-005 (авто-пас, auto-hint) станут красными после FE-3/BE — это ожидаемо, обновляет QA (§8).
- Fallback-уведомление в e2e проверяется только перехватом ответа (провайдер e2e — `bot`); реальный OpenAI-путь — AC-12, вручную.
- Сводка хода AI считает «действия» = `steps` сервера (включая завершения активации и пасы), а не число событий.
