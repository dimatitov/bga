# Plan — frontend (SWR-008 / TECH_PLANNING, `apps/web`, `e2e`)

**Автор:** frontend-lead · **Дата:** 2026-11-20 · **Статус:** только план: кода, установок и правок вне этого файла и
FE-строк `implementation-plan.md` нет.
**Входы:** `specification.md` (AC-6(d), AC-10, AC-13, QD-7, QD-12, решения Q-BE-1, Q-BE-4), `plan-backend.md` (§6 — wire
dev-диагностики, C-3 — `AI_PROMPT_TOO_LARGE`, §10 «FE»), `test-cases.md` (§13 TC-DIAG-01..08, TC-H-07, TC-FB-08, TR-7,
«Open for plan»), формат — `docs/tasks/SWR-006/plan-frontend.md`.
**Прочитанный код (только чтение):** `apps/web/src/app/router.tsx` (DEV-гейт `/dev/ai`), `app/pages/SettingsPage.tsx`
(`settings-dev`), `apps/web/src/dev/ai/**` (SWR-005B: `route.tsx`, `api.ts`, `queries.ts`, `i18n.ts`, `format.ts`,
`errorText.ts`, `DevAiPage.tsx`, `locales/*`, `locales.test.ts`, `devAiRoute.test.tsx`),
`platform/session-host/SessionHost.tsx`, `platform/automation/{automationStore,SessionAutomationContext,fallbackReason,index}.ts`,
`platform/automation/automation.test.tsx` (P-8, P-9), `games/rebellion/core-v1/{top-bar/AiCommanderStatus,panels/AiTurnSummary}.tsx`
(+ тест), `locales/{ru,en}/sessionHost.json`, `games/rebellion/locales/{ru,en}/match.json` (`ai.fallback`),
`shared/api/http.ts`, `src/test/setup.ts`, `scripts/check-web-bundle.mjs`, `eslint.config.mjs` (B-8, B-9),
`playwright.config.ts`, `e2e/{ai-commander,dev-ai}.spec.ts`, `e2e/support/testids.ts`, `packages/platform/src/automation.ts`.

---

## 0. Факты кода, на которые опирается план

| Факт | Где | Следствие |
|---|---|---|
| Dev-UI гейтится литералом `import.meta.env.DEV` с `lazy(() => import('@/dev/ai/…'))`; в `vite build` ветка сворачивается, чанка нет | `app/router.tsx:14-19`, `SettingsPage.tsx:119` | тот же приём для панели: литерал в месте импорта, код — только в `apps/web/src/dev/**` |
| `check:bundle` уже падает на `/dev/ai` (`dev-ai-path`), на testid `dev-ai-*`/`ai-dev-*` (`dev-ai-testid`) и на **любой** модуль `apps/web/src/dev/**` в составе prod-бандла (module composition) | `scripts/check-web-bundle.mjs:27-31,55-64` | TC-DIAG-03 покрывается **без изменения скрипта**, если соблюдены соглашения §2.4 |
| e2e поднимает web через **Vite dev** (`pnpm --filter @bga/web run dev`, `VITE_E2E=1`), т. е. в e2e `import.meta.env.DEV === true` | `playwright.config.ts` (`webServer[1]`) | один `DEV`-гейт не даёт «отсутствия в обычном UI» в e2e → нужен явный opt-in (§2.1, Q-FE-1) |
| TC-E-04 и TC-VA-01 (SWR-006) подменяют `automation.strategy` на `openai` через `page.route` | `e2e/ai-commander.spec.ts:412-447` | гейт «DEV + strategy=openai» показал бы панель в существующих e2e и скриншотах → отвергнут (Q-FE-1) |
| Тест P-8 перебирает `AutomationFallbackCodeSchema.options`, но **не** ловит отсутствующий ключ: без локали код получает `defaultValue` «другая причина», и тексты всё равно попарно различны | `platform/automation/automation.test.tsx:152-174` | FE-1 усиливает P-8 проверкой `i18n.exists` для каждого кода |
| Сводка хода AI уже показывает коды fallback из `AutomationRunSummary.fallbackReasons` через `automationFallbackReasonText` | `core-v1/panels/AiTurnSummary.tsx`, `platform/automation/fallbackReason.ts` | `AI_PROMPT_TOO_LARGE` в обычном UI = только новая строка локали, компоненты не меняются |
| В вебе две локали: `ru`, `en` (`src/locales/{ru,en}`, `dev/ai/locales/{ru,en}.json`, игровые `games/rebellion/locales/{ru,en}`) | дерево `apps/web/src` | «все локали приложения» = ru + en |
| Тест-окружение очищает `localStorage` перед каждым тестом, но не сбрасывает Zustand-сторы, кроме settings/feedback | `src/test/setup.ts` | стор флага панели сбрасывается в тестах панели явно (`resetDevAiTableDiagnostics()`) |
| Precedent проверки prod-ветки в Vitest: `vi.stubEnv('DEV', false)` + `vi.resetModules()` + повторный `import()` | `dev/ai/devAiRoute.test.tsx` (T-14) | механизм TR-7 для TC-DIAG-02 |

## 1. Инварианты (для FE-воркеров)

1. **Только провод.** Панель показывает исключительно поля `AiSessionDecisionsResponseSchema` (PB §6) и уже публичную
   `AutomationRunSummary` текущей сессии (`useSessionAutomation().lastRun`). Ничего не вычисляется из `view`, журнала,
   доски; ID правил не сопоставляются с системами/юнитами; нет текста промпта, `situation`, `reason` модели, `sessionId`,
   `budgetKey` (на проводе их нет; строгая схема отвергает лишние поля — §4.3). Ограничение Q-BE-1 (токены/стоимость
   хода AI видны человеку-сопернику в dev) принято Analyst и не маскируется.
2. **Ноль в prod.** Весь код панели — в `apps/web/src/dev/ai/session/**`; единственная ссылка извне `src/dev/**` —
   литерал-гейт в `SessionHost.tsx` (§2.2). Новые testid начинаются с `dev-ai-`. Путь эндпоинта — только в dev-чанке.
3. **Ноль в обычном UI dev-сборки.** Без явного включения переключателем на `/dev/ai` панель не рендерится и **не делает
   запросов** (§2.1).
4. **Game-agnostic.** Эндпоинт и схема — платформенные, панель живёт в хосте сессии, не знает Rebellion; `games/types.ts`
   (FROZEN), Rebellion-компоненты и макет стола не меняются (кроме теста `AiTurnSummary` в FE-1).
5. Литералов UI-текста в JSX нет (ESLint), ru/en с паритетом ключей, testid не зависят от языка. Без новых зависимостей.

## 2. Решения

### 2.1 Гейт: компиляция + явный opt-in (Q-FE-1)

Панель видна, только если **все** условия истинны:

| # | Условие | Где проверяется | Чем доказывается |
|---|---|---|---|
| G-1 | `import.meta.env.DEV` (сборка — dev) | литерал в `SessionHost.tsx` на уровне модуля | TC-DIAG-02 (component, `stubEnv DEV=false`), TC-DIAG-03 (`check:bundle`) |
| G-2 | переключатель «Показывать диагностику решений AI на игровом столе» на `/dev/ai` включён (localStorage `bga.dev.aiTableDiagnostics.v1`, по умолчанию **выключен**) | `DevAiSessionDiagnostics` (outer) до любого хука запроса | TC-DIAG-07 (e2e: dev-сборка без opt-in), component |
| G-3 | у сессии есть автоматизированный участник: `automation.strategy !== null` | там же | component |

Почему не «DEV + `strategy === 'openai'`»: e2e работает на Vite dev и подменяет `strategy` на `openai` (TC-E-04,
TC-VA-01) → панель попала бы в существующие e2e/скриншоты, а «отсутствие в обычном UI» (QD-12) было бы проверено
только тривиально (сервер `bot`). С opt-in e2e доказывает именно гейт. Включение — один раз на браузер, путь
«Настройки → AI diagnostics → переключатель» (вход `settings-dev-ai-link` уже есть). `bot`-сессии панель тоже показывает
(блок «последний ход AI» + пустой список решений) — это даёт e2e-проверку провода на реальном W7 (§6, TC-DIAG-07b).

### 2.2 Место: хост сессии, плавающая панель (Q-FE-2)

`platform/session-host/SessionHost.tsx`, модульный уровень:

```tsx
// SWR-008 AC-13: literal guard (see app/router.tsx) — folded in `vite build`, the chunk and its strings vanish.
const DevAiSessionDiagnostics = import.meta.env.DEV
  ? lazy(() => import('@/dev/ai/session/entry'))
  : null;
```

Рендер — внутри `session-host`, после `AutomationNotice`, до `TableScreen`:
`{DevAiSessionDiagnostics ? <Suspense fallback={null}><DevAiSessionDiagnostics sessionId={sessionId} automation={automation} /></Suspense> : null}`.
Пропсы — `sessionId: string`, `automation: SessionAutomationState` (публичный тип `@/platform`). Без новых полей
`TableScreenProps`, без правок Rebellion. Связь «у хода AI»: запрос перезапрашивается на каждый новый `lastRun.seq` (новый
ответ с шагами AI) и на переход `phase` `running → idle|stalled|error`; блок «Последний ход AI» показывает
`steps/fallbacks/fallbackReasons` этого ответа — включая fallback без строки `AiUsage` (`AI_PROMPT_TOO_LARGE`,
`AI_DEADLINE`, «бот на остаток запуска», PB §6).

Вид: `position: fixed`, `left: 16`, `bottom: 16`, `zIndex: theme.zIndex.speedDial` (ниже модалок и снекбаров), по
умолчанию **свёрнута** в кнопку-чип «DEV · решений AI: N»; развёрнутая — `Paper` шириной `min(440px, 100vw - 32px)`,
`maxHeight: min(60vh, 520px)`, вертикальный скролл внутри, без горизонтального скролла страницы на 375 px. Состояние
свёрнуто/развёрнуто — локальный `useState` (не персистится).

### 2.3 Данные

- `GET /api/dev/ai/sessions/:sessionId/decisions` (PB §6), `requestJson(path, AiSessionDecisionsResponseSchema)`;
  `sessionId` — `encodeURIComponent`. Ответ — строки по возрастанию времени (≤ 50) + `totals`.
- TanStack Query: ключ `['dev-ai', 'session', sessionId, 'decisions', seq]` (`seq` = `lastRun?.seq ?? 0`),
  `placeholderData: keepPreviousData`, `staleTime: Infinity`, `retry: 0`, `refetchOnWindowFocus: false`; запрос включён
  только при G-1..G-3 (outer-компонент не монтирует inner с `useQuery`, пока гейт закрыт). Кнопка «Обновить» —
  `refetch()`. Дополнительно `invalidate` при `phase` → не `running` (ответ run без шагов не меняет `seq`).
- Ошибки: `404` → состояние `unavailable` («эндпоинт диагностики не найден — API в production-режиме»), `403` →
  `forbidden` (не loopback), сеть/5xx/`INVALID_RESPONSE` → `error` (`translateUnknownError`). Ошибка панели не влияет на
  партию и `AutomationNotice`.

### 2.4 Что показывается (AC-13; TC-DIAG-01, -06)

Для каждого решения (новые сверху):

| Поле UI | Источник | Формат / пустое значение |
|---|---|---|
| время, провайдер · модель, попытки | `at`, `provider`, `model`, `attempts` | локальное время `HH:mm:ss` |
| правила вкл/выкл | `rules.enabled` | «Правила: вкл» / «выкл» |
| число правил | `rules.count` | «0 правил» допустимо |
| ID правил | `rules.ids` | моноширинный список с переносом; пусто → «—» |
| токены контекста правил (оценка) | `rules.tokensEstimate` (+ `rules.chars` в подсказке) | «≈ N ток.» |
| усечение | `rules.truncated` | метка «обрезаны» |
| правила сняты лимитом промпта | `rules.dropped` | метка «сняты лимитом промпта» (QD-9) |
| версия набора правил | `rules.rulesVersion` | моно, `null` → «—» |
| fallback | `fallback`, `errorCode`, `status` | «fallback: `<код>`» (код + текст `automationFallbackReasonText`), иначе «без fallback» |
| токены вызова | `inputTokens`, `cachedInputTokens`, `outputTokens` | целые, `0` показывается как `0` |
| стоимость, длительность | `costMicroUsd`, `durationMs` | USD из микро-долларов через `formatUsd(micro / 1e6)` (`dev/ai/format.ts`), `0` → `$0.00`; мс |

Итоги (`totals`): с правилами / без правил / всего — решений, стоимость, средняя стоимость (`meanCostMicroUsd: null` → «—»).
Блок «Последний ход AI» (из `lastRun.summary`): шагов, fallback (число), коды `fallbackReasons` с текстом. Пустой список →
«Вызовов модели в этой партии пока нет (ходы бота не записываются)». Никаких `NaN`/`undefined`/`null` в тексте (TC-DIAG-06).

### 2.5 testids (сверка `<diag testid>`, «Open for plan» test-cases)

| testid | Элемент | data-* |
|---|---|---|
| `dev-ai-session-diagnostics` (**= `<diag testid>`**) | корень панели (есть только при G-1..G-3) | `data-state` = `loading\|ready\|error\|unavailable\|forbidden`, `data-decisions` (число строк), `data-expanded` = `true\|false` |
| `dev-ai-session-toggle` | кнопка свернуть/развернуть | `aria-expanded`, `aria-controls` |
| `dev-ai-session-refresh` | «Обновить» | — |
| `dev-ai-session-last-run` | блок «Последний ход AI» (нет `lastRun` → не рендерится) | `data-steps`, `data-fallbacks`, `data-reasons` (коды через `,`) |
| `dev-ai-session-decision-<n>` | строка решения, `n` — индекс в ответе (0 = самое старое из ≤ 50) | `data-status`, `data-fallback`, `data-error-code` (код или пусто), `data-rules-enabled`, `data-rules-count`, `data-rules-ids` (через `,`), `data-rules-tokens`, `data-rules-chars`, `data-rules-truncated`, `data-rules-dropped`, `data-input-tokens`, `data-output-tokens`, `data-cost-micro-usd` |
| `dev-ai-session-totals` | итоги | `data-with-rules-decisions`, `data-with-rules-cost`, `data-without-rules-decisions`, `data-without-rules-cost`, `data-total-cost` (микро-доллары) |
| `dev-ai-session-empty` | пустой список | — |
| `dev-ai-session-error` | `Alert` ошибки | `data-reason` = `error\|unavailable\|forbidden` |
| `dev-ai-table-diagnostics-switch` | переключатель на `/dev/ai` (testid на `input`, как `settings-reduce-motion`) | `checked` |

Все начинаются с `dev-ai-` → правило `dev-ai-testid` `check:bundle` ловит любую утечку в prod. В `e2e/support/testids.ts` —
`devAiSessionDiagnostics`, `devAiSessionToggle`, `devAiSessionDecision(n)`, `devAiSessionEmpty`, `devAiTableDiagnosticsSwitch`.

### 2.6 Доступность

Корень — `<section aria-labelledby>` с заголовком «Решения AI · DEV»; кнопка-чип — `Button` с `aria-expanded`/`aria-controls`,
фокус виден, работает с клавиатуры (Enter/Space), `Esc` в развёрнутой панели сворачивает её и возвращает фокус на кнопку.
Без `aria-live` (обновления dev-данных не озвучиваются). Контраст — тема MUI (как `/dev/ai`).

### 2.7 Локали

- **`AI_PROMPT_TOO_LARGE`** (FE-1, обычный UI): `src/locales/ru/sessionHost.json` `automation.reason.AI_PROMPT_TOO_LARGE` =
  «запрос к модели слишком большой»; `en` = «model request too large». В сводке хода: «Часть ходов AI (1) сделал бот:
  OpenAI недоступен — запрос к модели слишком большой.» (формулировка `ai.fallback` не меняется, Q-FE-3).
- **Панель** (FE-2, dev): новые ключи в существующем namespace `devAi` (`dev/ai/locales/{ru,en}.json`, грузится только
  с dev-чанком через `registerDevAiI18n()`): `session.*` (заголовок, чип со счётчиком, «последний ход AI», подписи полей
  §2.4, метки `truncated`/`dropped`, «правила вкл/выкл», «0 правил», «fallback: {{code}}», «без fallback», итоги, пусто,
  ошибки `unavailable`/`forbidden`, «Обновить», примечание «Только для разработки. Текст промпта и объяснения модели не
  показываются.») и `tableDiagnostics.*` (заголовок карточки, подпись переключателя, подсказка «только в этом браузере,
  только dev-сборка»). Без плюральных форм (формат «решений AI: {{count}}»), чтобы не плодить `_few/_many`.

## 3. Структура изменений

```text
apps/web/src/
  locales/{ru,en}/sessionHost.json                         M  automation.reason.AI_PROMPT_TOO_LARGE              (FE-1)
  platform/automation/automation.test.tsx                  M  P-8: i18n.exists для каждого кода enum; текст нового кода (FE-1)
  games/rebellion/core-v1/panels/AiTurnSummary.test.tsx    M  кейс fallbackReasons: ['AI_PROMPT_TOO_LARGE'] ru/en     (FE-1)
  platform/session-host/SessionHost.tsx                    M  литерал-гейт + lazy слот панели (§2.2)                  (FE-2)
  platform/session-host/SessionHost.test.tsx               M  слот: DEV=false / флаг выкл / strategy null / вкл       (FE-2)
  dev/ai/session/                                          NEW dev-чанк панели                                         (FE-2)
    entry.tsx                                                  registerDevAiI18n() + default export DevAiSessionDiagnostics
    DevAiSessionDiagnostics.tsx                                outer-гейт (G-2, G-3) + inner (запрос, свёрнуто/развёрнуто)
    DecisionRow.tsx, Totals.tsx                                строка решения, итоги
    model.ts                                                   чистые функции: строки/метки/форматы §2.4 (без NaN)
    api.ts                                                     devAiSessionDecisionsPath(id), fetchSessionDecisions()
    queries.ts                                                 useSessionDecisions(sessionId, seq, enabled)
    diagnosticsFlag.ts                                         Zustand persist `bga.dev.aiTableDiagnostics.v1` {enabled}; reset для тестов
    testFixtures.ts                                            makeDecision(), makeDecisionsResponse() (проходят схему)
    DevAiSessionDiagnostics.test.tsx, model.test.ts, api.test.ts, diagnosticsFlag.test.ts   NEW
  dev/ai/components/TableDiagnosticsCard.tsx               NEW карточка с переключателем                               (FE-2)
  dev/ai/DevAiPage.tsx                                     M  карточка последним элементом колонки `side`              (FE-2)
  dev/ai/DevAiPage.test.tsx                                M  переключатель пишет/читает флаг                          (FE-2)
  dev/ai/locales/{ru,en}.json                              M  session.*, tableDiagnostics.*                            (FE-2)
e2e/
  ai-diagnostics.spec.ts                                   NEW TC-DIAG-07, TC-DIAG-07b, AI_PROMPT_TOO_LARGE в UI       (FE-2)
  support/testids.ts                                       M  ids §2.5 (только добавления)                             (FE-2)
  support/dev-ai.ts                                        M  enableTableDiagnostics(page) (addInitScript), только добавления (FE-2)
```

**Не меняются:** `games/types.ts` (FROZEN), Rebellion-компоненты (`AiTurnSummary.tsx`, `AiCommanderStatus.tsx`, макет
`CoreTable`), `platform/automation/*` кроме теста, `app/router.tsx`, `SettingsPage.tsx`, `src/test/setup.ts`,
`scripts/check-web-bundle.mjs` (+ его тест), `packages/**` (схема — W1), `e2e/ai-commander.spec.ts` (TC-FB-08 — регрессия
без правок), `playwright.config.ts`.

## 4. Тесты (FE)

### 4.1 FE-1

| Тест | Файл | Что проверяет | TC |
|---|---|---|---|
| P-8 усилен | `platform/automation/automation.test.tsx` | для ru/en и **каждого** `AutomationFallbackCodeSchema.options`: `i18n.exists('sessionHost:automation.reason.<code>')`; `AI_PROMPT_TOO_LARGE` → точный текст ru/en; тексты попарно различны | AC-10 (код), Q-BE-4 |
| сводка с новым кодом | `core-v1/panels/AiTurnSummary.test.tsx` | `fallbackReasons: ['AI_PROMPT_TOO_LARGE']` → `ai-fallback-notice[data-reasons=AI_PROMPT_TOO_LARGE]`, текст ru (en — одна проверка), сырой код в тексте не виден | AC-10, AC-11 |
| паритет локалей | существующий `shared/i18n/locales.test.ts` | без правок, остаётся зелёным | — |

### 4.2 FE-2 (component, jsdom)

| ID | Файл | Сценарий | Ожидание | TC |
|---|---|---|---|---|
| D-1 | `DevAiSessionDiagnostics.test.tsx` | DEV, флаг вкл, `strategy:'openai'`, `mockFetch` 2 решения (с правилами: `count 3`, ids, `tokensEstimate 412`, `truncated`; fallback `AI_TIMEOUT` с `dropped`) + `lastRun` c `AI_PROMPT_TOO_LARGE` | развернуть → видны число правил, ID, токены, стоимость, fallback-код, метка «сняты лимитом промпта»; data-* §2.5; `last-run[data-reasons]` | TC-DIAG-01 |
| D-2 | `SessionHost.test.tsx` | `vi.stubEnv('DEV', false)` + `vi.resetModules()` + повторный импорт `SessionHost`, флаг в localStorage вкл, AI-сессия | нет ни одного `[data-testid^="dev-ai-"]`; 0 запросов к `/api/dev/ai/` | TC-DIAG-02 |
| D-3 | `SessionHost.test.tsx` | DEV, флаг **выкл** (по умолчанию), AI-сессия | нет `dev-ai-*`, 0 запросов к `/api/dev/ai/`; таблица игры рендерится как раньше | TC-DIAG-02, TC-DIAG-07 (уровень компонента) |
| D-4 | `SessionHost.test.tsx` | DEV, флаг вкл, `strategy: null` | панели нет, запросов нет | G-3 |
| D-5 | `DevAiSessionDiagnostics.test.tsx` | 0 правил (`enabled:false`), fallback с кодом, `cost 0`, `meanCostMicroUsd: null`, пустой `ids` | «0 правил», «fallback: AI_…», `$0.00`, «—»; `textContent` не содержит `NaN`, `undefined`, `null` | TC-DIAG-06 |
| D-6 | `api.test.ts` | ответ с лишним полем (`reason`, `budgetKey`, `prompt`) или нарушением схемы | `ApiError INVALID_RESPONSE`; панель — `data-state=error`, лишние значения в DOM отсутствуют | TC-DIAG-05 (FE-часть), AC-6(d) |
| D-7 | `DevAiSessionDiagnostics.test.tsx` | рендер фикстуры с известным `sessionId` | `sessionId` нигде в DOM; набор подписей = §2.4 (нет «prompt»/«reason»/«situation») | AC-6(d), TC-DIAG-05 |
| D-8 | `DevAiSessionDiagnostics.test.tsx` | новый `lastRun.seq`; переход `running → idle` | ровно один повторный GET на каждое событие; без цикла | §2.3 |
| D-9 | `DevAiSessionDiagnostics.test.tsx` | 404 / 403 / 500 | `data-state` `unavailable` / `forbidden` / `error`, `dev-ai-session-error[data-reason]`; игра не затронута | §2.3 |
| D-10 | `DevAiSessionDiagnostics.test.tsx` | клавиатура | Tab до кнопки, Enter разворачивает (`aria-expanded=true`), Esc сворачивает, фокус на кнопке | §2.6 |
| D-11 | `DevAiPage.test.tsx`, `diagnosticsFlag.test.ts` | переключатель | по умолчанию выкл; клик → `localStorage['bga.dev.aiTableDiagnostics.v1']` = `{"state":{"enabled":true},"version":1}`; повторный монтаж читает значение | G-2 |
| D-12 | `model.test.ts` | форматтеры | микро-доллары → USD, пустые значения, порядок «новые сверху», индексы `n` = индексы ответа | §2.4 |
| — | `dev/ai/locales.test.ts` (существующий) | паритет ru/en, нет кириллицы в en | зелёный с новыми ключами | — |

### 4.3 FE-2 (e2e, `e2e/ai-diagnostics.spec.ts`; сервер `bot`, сетевой guard как в `ai-commander.spec.ts`)

| ID | Сценарий | Ожидание | TC |
|---|---|---|---|
| E-1 | Повстанцы против AI (через API `createSession`), открыть стол, сделать ход до ответа AI; затем то же с подменой `strategy: 'openai'` + `fallbackReasons: ['AI_PROMPT_TOO_LARGE']` (`page.route`, как TC-E-04) | `[data-testid^="dev-ai-"]` — 0 в DOM; 0 запросов к `/api/dev/ai/sessions/`; `ai-fallback-notice` содержит текст `AI_PROMPT_TOO_LARGE` из локали (ru и en), не сам код | TC-DIAG-07, AC-10 (UI-текст кода) |
| E-2 (P2) | то же, `enableTableDiagnostics(page)` (`addInitScript` пишет флаг) | `dev-ai-session-diagnostics[data-state=ready][data-decisions=0]`, `dev-ai-session-empty` после разворота; ответ реального W7 проходит строгую схему | TC-DIAG-07b (доп., Q-FE-5) — **после W7** |

Скриншоты не снимаются (TC-DIAG-08 — browser QA: dev-сборка, флаг вкл, ответ эндпоинта подменён `page.route` или mock-провайдер;
`docs/tasks/SWR-008/artifacts/screenshots/`).

### 4.4 Статика

`pnpm --filter @bga/web build && pnpm check:bundle` → exit 0 (TC-DIAG-03: правила `dev-ai-path`, `dev-ai-testid`, module
composition `apps/web/src/dev/**`); дополнительно QA: `grep -r "dev-ai-session\|aiTableDiagnostics" apps/web/dist` → 0.

## 5. Подзадачи (брифы для воркеров; формат workflow §3)

### FE-1 — локали `AI_PROMPT_TOO_LARGE` (frontend worker) — после W1

```text
TASK: SWR-008/FE-1 fallback-code locales
ROLE: frontend worker (UI)
GOAL: новый код AutomationFallbackCode `AI_PROMPT_TOO_LARGE` (W1, C-3) имеет текст причины в ru и en; тест P-8 падает
      на любом коде enum без собственного ключа; сводка хода AI показывает текст нового кода.
INPUTS: docs/tasks/SWR-008/plan-frontend.md §0, §2.7, §4.1; plan-backend.md C-3; specification.md Q-BE-4.
OWNED FILES: apps/web/src/locales/ru/sessionHost.json, apps/web/src/locales/en/sessionHost.json,
             apps/web/src/platform/automation/automation.test.tsx,
             apps/web/src/games/rebellion/core-v1/panels/AiTurnSummary.test.tsx
CONTRACTS: AutomationFallbackCodeSchema (packages/platform, W1) — только чтение; automationFallbackReasonText и
           AiTurnSummary.tsx не меняются; ключ rebellion.match:ai.fallback не меняется.
DONE WHEN: pnpm --filter @bga/web test → exit 0 (P-8 с i18n.exists для каждого кода, кейс AiTurnSummary с
           AI_PROMPT_TOO_LARGE); pnpm --filter @bga/web typecheck → exit 0; pnpm exec eslint apps/web/src → 0 ошибок;
           проверка: без новой строки локали P-8 краснеет (временно, отметить в отчёте).
REPORT: changed files, tests run (команда + результат), known limitations, open questions
```

### FE-2 — dev-панель диагностики решений AI (frontend worker) — после W1; E-2 — после W7

```text
TASK: SWR-008/FE-2 dev AI decision diagnostics panel
ROLE: frontend worker (UI + state)
GOAL: в dev-сборке при включённом переключателе на /dev/ai у сессии с AI видна плавающая панель решений AI (правила
      вкл/выкл, число, ID, токены контекста, стоимость, fallback, «сняты лимитом промпта», итоги с/без правил); без
      переключателя и в prod-сборке — ни DOM, ни запросов, ни кода в бандле.
INPUTS: docs/tasks/SWR-008/plan-frontend.md (весь), plan-backend.md §6 (wire), specification.md AC-13, AC-6(d),
        QD-7, QD-12, Q-BE-1; test-cases.md §13; образцы — apps/web/src/dev/ai/** (SWR-005B), app/router.tsx.
OWNED FILES: apps/web/src/platform/session-host/SessionHost.tsx, apps/web/src/platform/session-host/SessionHost.test.tsx,
             apps/web/src/dev/ai/session/** (new), apps/web/src/dev/ai/components/TableDiagnosticsCard.tsx (new),
             apps/web/src/dev/ai/DevAiPage.tsx, apps/web/src/dev/ai/DevAiPage.test.tsx,
             apps/web/src/dev/ai/locales/ru.json, apps/web/src/dev/ai/locales/en.json,
             e2e/ai-diagnostics.spec.ts (new), e2e/support/testids.ts (только добавления),
             e2e/support/dev-ai.ts (только добавления)
CONTRACTS: AiSessionDecisionsResponseSchema / AiDecisionDiagnosticSchema (@bga/platform, W1) и эндпоинт
           GET /api/dev/ai/sessions/:sessionId/decisions (W7) — только чтение; games/types.ts (FROZEN);
           SessionAutomationState / useSessionAutomation (@/platform) — без изменений; scripts/check-web-bundle.mjs не
           меняется; testids §2.5 и ключ localStorage §2.1 — заморожены этим планом.
DONE WHEN: D-1..D-12 и E-1 зелёные (E-2 — после интеграции W7); pnpm --filter @bga/web test → exit 0;
           pnpm --filter @bga/web typecheck → exit 0; tsc -p e2e/tsconfig.json → exit 0; pnpm exec eslint apps/web e2e →
           0 ошибок/предупреждений; pnpm --filter @bga/web build && pnpm check:bundle → exit 0;
           pnpm e2e e2e/ai-diagnostics.spec.ts e2e/ai-commander.spec.ts e2e/dev-ai.spec.ts → passed;
           в отчёте — проверка `grep -r "dev-ai-session" apps/web/dist` → 0 совпадений.
REPORT: changed files, tests run (команда + результат), known limitations, open questions
```

Порядок: FE-1 и FE-2 не пересекаются по файлам и могут идти параллельно (один воркер — последовательно, FE-1 первым,
он маленький). Оба ждут W1 в рабочем дереве (иначе нет `AI_PROMPT_TOO_LARGE` и схемы диагностики). Для D-1..D-12
W7 не нужен (`mockFetch`); E-1 не обращается к эндпоинту и W7 не требует; E-2 — после W7.

## 6. AC → FE

| AC | FE | TC |
|---|---|---|
| AC-6(d) | FE-2 (§1 п. 1, D-6, D-7; данные — только провод PB §6, отбор правил по QD-7 публичен) | TC-DIAG-05 (FE-часть), TC-H-07 — W10 |
| AC-10 | FE-1 (текст кода в обычном UI), FE-2 (метка `dropped`, код в «последнем ходе AI») | TC-BUD-07 (UI-текст), E-1 |
| AC-11 | регрессия: `ai-commander.spec.ts` без правок | TC-FB-08 |
| AC-13 | FE-2 | TC-DIAG-01, -02, -03, -06, -07 (+07b); TC-DIAG-08 — browser QA |
| AC-16 | FE-1, FE-2 (web-тесты, typecheck, lint, build, check:bundle, e2e) | TC-R-* |

## 7. Риски

| # | Риск | Мера |
|---|---|---|
| RF-1 | `lazy` в `SessionHost` меняет тайминг существующих тестов (дополнительный Suspense) | `fallback={null}`, вне дерева `TableScreen`; флаг выкл → outer рендерит `null` без запросов; прогон всего `SessionHost.test.tsx` и `automation.test.tsx` |
| RF-2 | Литерал-гейт не свернётся (вынесен в функцию/переменную) → чанк в prod | только литерал `import.meta.env.DEV ? lazy(...) : null` на уровне модуля (как `router.tsx`); `check:bundle` module composition ловит |
| RF-3 | Persist-стор флага «протекает» между тестами (localStorage чистится, память — нет) | `resetDevAiTableDiagnostics()` в `beforeEach` тестов панели/страницы |
| RF-4 | Плавающая панель перекрывает `AutomationNotice`/кнопки на 375 px | левый нижний угол (notice — по центру), свёрнута по умолчанию; dev-only, принимается |
| RF-5 | Индексы `dev-ai-session-decision-<n>` смещаются, когда строк > 50 | задокументировано; тесты — на ≤ 50 строк |
| RF-6 | W1/W7 отступят от PB §6 | контракт заморожен; при расхождении воркер останавливается и пишет лиду |

## 8. Открытые вопросы (Q-FE-n)

- **Q-FE-1 (гейт).** «Обычный UI» в e2e — это dev-сборка (Vite dev), а существующие e2e подменяют `strategy=openai`.
  **Рекомендация:** гейт = DEV (компиляция) + явный opt-in-переключатель на `/dev/ai` (localStorage, по умолчанию выкл)
  + `strategy !== null`. AC-13 «в dev-сборке видно» выполняется после одного включения. Принято как assumption; если
  Analyst хочет «всегда видно в dev» — меняется только outer-гейт и E-1 (e2e тогда проверяет лишь сервер `bot`).
- **Q-FE-2 (место).** Панель — в хосте сессии (game-agnostic, плавающая), а не внутри Rebellion `AiTurnSummary`.
  Связь с ходом AI — через `lastRun.seq` и блок «Последний ход AI». **Рекомендация:** принять (не трогает FROZEN
  `games/types.ts` и макет стола, нет импорта dev-кода из игровой папки, «без редизайна»).
- **Q-FE-3 (текст).** Общая фраза `rebellion.match:ai.fallback` «…OpenAI недоступен — {{reasons}}» для
  `AI_PROMPT_TOO_LARGE` неточна (OpenAI доступен, запрос не отправлялся). **Рекомендация:** в SWR-008 не менять (вне
  scope, редизайн текстов), причина сформулирована так, чтобы фраза читалась («…— запрос к модели слишком большой»);
  уточнение общей фразы — кандидат в бэклог.
- **Q-FE-4 (TC-DIAG-07, для QA).** Предусловие «prod-сборка web» в e2e невыполнимо без новой инфраструктуры (e2e
  поднимает Vite dev). **Рекомендация:** переформулировать: «e2e, dev-сборка web без opt-in»; отсутствие в prod
  доказывают TC-DIAG-02 (component, `DEV=false`) и TC-DIAG-03 (`check:bundle`). Отдельный prod-preview e2e не вводить.
- **Q-FE-5 (TC-DIAG-07b).** Предлагаю дополнительный P2 e2e: с opt-in панель на `bot`-сессии показывает пустой список
  от реального W7 (проверка провода FE↔API строгой схемой). **Рекомендация:** QA включает в `test-cases.md` как
  TC-DIAG-07b или считает частью E-2 FE-2.
