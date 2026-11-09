# Test cases — SWR-005B

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-08).
Это **дизайн**: ничто здесь не является доказательством `passed` — результаты прогонов только в `qa-results.md` (с логами).
Приоритет источников при расхождении: `specification.md` (Contract заморожен) → `implementation-plan.md` → планы лидов.

**Выравнивание со замороженной спецификацией (QA Lead, 2026-11-08, IMPLEMENTATION):** все вопросы Q-1..Q-26 закрыты —
см. «Ambiguities» (ответы — `specification.md` → «Clarifications» и «Decisions during IMPLEMENTATION», детали — `plan-backend.md`
§4–§6, §10–§11 и `plan-frontend.md` §5–§12). Ожидания кейсов ниже переписаны по этим решениям. Ключевое: testids страницы —
**`dev-ai-*`** (финальные, `plan-frontend.md` §9 + `apps/web/src/dev/ai/**`); стоимость в ответах — `estimatedCostUsd` **и**
целое `estimatedCostMicroUsd` (Q-15, «Decisions» W2), бюджет — `spent/limit/remaining` в USD и `*MicroUsd`; `budgetKey`
dev-эндпоинта — **только** `dev-diagnostics` (AM-BE-6, закрывает Q-21). Автоматизация e2e — `e2e/dev-ai.spec.ts`
(+ `e2e/support/dev-ai.ts`).

## Preconditions (общие)

- **Базовая линия SWR-005** (зелёная, `docs/tasks/SWR-005/delivery-report.md` → Verification; `pnpm verify` код 0):
  rebellion **411**, api **221 (+1 opt-in dev-DB)**, web **480**, platform **65**, **e2e 106**. Регрессия сохранена, если
  ни один набор не теряет кейсов (рост допустим); удалённые/заменённые кейсы — только с таблицей «старый → новый» в `qa-results.md`.
- **Ни один автоматический тест не обращается к OpenAI.** Единственное исключение — ручной кейс TC-LIVE-01 (Analyst, AC-12).
  Это обеспечивается тремя слоями: (1) тестовое окружение `OPENAI_ENABLED=false` и пустой `OPENAI_API_KEY`; (2) для кейсов
  `OpenAIProvider` — подменённый SDK-клиент / подменённый `fetch` (TR-2); (3) **сетевой guard** (TR-1): любая попытка соединения
  с `api.openai.com` (или любым внешним хостом) в Vitest и в e2e-процессе API валит тест.
- Важно: в рабочем дереве есть `apps/api/.env` PO с `OPENAI_ENABLED=true` и **реальным ключом**. Тесты и e2e не должны
  его загружать или наследовать (`process.loadEnvFile` не перезаписывает уже заданные переменные, но **добавляет** отсутствующие —
  например, `OPENAI_API_KEY`). См. TC-ENV-20, TC-E-01, TR-3. QA и агенты содержимое `.env` не читают.
- **Сентинел-ключ:** `SENTINEL_KEY = 'sk-test-SENTINEL-5b-DO-NOT-LEAK-0000000000'` — фиктивный ключ, который задаётся в
  тестах, где ключ «настроен»; затем его ищут в ответах, логах, ошибках, бандле, артефактах (TC-S-*). Реальный ключ в тестах не
  используется никогда.
- unit: Vitest в `apps/api/test/**/*.unit.test.ts` (или `apps/api/src/**` по плану), без Nest и без сети.
- integration: Vitest + supertest, реальный Nest (`createApp` с явным конфигом), отдельная копия SQLite на тест
  (`apps/api/test/support/test-app.ts`), провайдер — `MockAIProvider` или `OpenAIProvider` с подменённым SDK.
- component: Vitest + Testing Library (jsdom), `renderWithProviders`, `mockFetch` (как в SWR-002..005).
- e2e: `pnpm e2e`, api :3100 (`e2e-serve.mjs`: `NODE_ENV=test`, `OPENAI_ENABLED=false`, все `OPENAI_*` родителя отброшены,
  AM-BE-3), web :5174 (dev-сервер Vite — `import.meta.env.DEV`, гейт страницы, Q-FE-3), `workers: 1`. Скриншоты — routing
  `e2e/support/board.ts` (`CURRENT_SCREENSHOT_TASK = 'SWR-005B'`) → `docs/tasks/SWR-005B/artifacts/screenshots/`; SWR-005-спеки
  передают `'SWR-005'` явно, их доказательства прогоном не перезаписываются.

## Conventions

**Уровни (Level):** `unit`, `component` (web, jsdom), `integration` (API, Nest + SQLite), `e2e` (Playwright),
`visual-a11y` (Playwright-скриншоты + роли/фокус), `manual` (встроенный браузер / ручной запуск, skill `browser-qa`, скриншот
или лог как доказательство), `arch` (ESLint / grep / `check:bundle` / ревью), `gate` (корневая команда).

**Обозначения:**
- `ENV0` — минимальное валидное окружение: `DATABASE_URL=file:./t.db`, `OPENAI_ENABLED=false` (остальное — по умолчанию).
- `ENV1` — `ENV0` + `OPENAI_ENABLED=true`, `OPENAI_API_KEY=SENTINEL_KEY`, `OPENAI_STRATEGY_MODEL=gpt-6.1-sol`,
  `OPENAI_TACTICAL_MODEL=gpt-6-luna`, `OPENAI_MAX_COST_PER_SESSION_USD=0.25`.
- `parseEnv(obj)` — функция схемы из `apps/api/src/config/env.ts` (принимает объект, не читает `process.env` сама в тестах).
- `SCN` — тестовый сценарий PO (`specification.md` «PO test scenario», дефолт страницы — Q-FE-2): `{ faction:'empire',
  phase:'command', objective:'Strengthen imperial control', availableActions: [action-1 MOVE_FLEET corellia, action-2 RECRUIT
  coruscant, action-3 PASS] }`; в unit-кейсах ниже `a1..a4`/`a99` — сокращения для произвольного списка 2..10 уникальных id
  («тестовые данные, не правила Rebellion»).
- `CTX(role)` — `AIDecisionContext` на `SCN` с `budgetKey:'dev-diagnostics'`.
- `FAKE_SDK(responses[])` — подменённый клиент OpenAI: очередь ответов/ошибок для `responses.create`, `models.retrieve`;
  записывает аргументы вызовов и число вызовов.
- `SDK_ERR(kind)` — ошибка SDK соответствующего класса: `timeout` (`APIConnectionTimeoutError`), `network`
  (`APIConnectionError`, `ECONNRESET`), `429` (`RateLimitError`, опционально заголовок `retry-after`), `5xx` (`InternalServerError` 500/503),
  `4xx` (`BadRequestError` 400, `AuthenticationError` 401, `PermissionDeniedError` 403, `NotFoundError` 404).
- `err(code, status)` — тело `{ ok:false, error:{ code, messageKey, details? } }` с HTTP `status`.
- `$` — стоимость в USD; `M` = 1 000 000 токенов. Тарифы — таблица `specification.md` (`pricingVersion:'openai-2026-11-08'`).
- «Без игровых изменений» — число строк `GameSession`/событий и `version` всех сессий в БД не изменились.

## Test cases

### 1. Валидатор окружения (AC-01)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-ENV-01 | AC-01 | unit | positive | — | `parseEnv(ENV0)` | успех; `PORT=3000`, `NODE_ENV='development'`, `OPENAI_ENABLED=false`, `OPENAI_TIMEOUT_MS=30000`, `OPENAI_MAX_RETRIES=2`; OpenAI-поля не требуются |
| TC-ENV-02 | AC-01 | unit | positive | — | `parseEnv(ENV1)` | успех; `OPENAI_ENABLED=true` (boolean, не строка), `OPENAI_MAX_COST_PER_SESSION_USD=0.25` (number) |
| TC-ENV-03 | AC-01 | unit | negative | — | `ENV0` без `DATABASE_URL`; отдельно `DATABASE_URL=''` | ошибка; сообщение начинается с `Invalid environment:` и содержит `DATABASE_URL: <причина>` |
| TC-ENV-04 | AC-01 | unit | boundary | — | `PORT` = `1`, `65535` (valid); `0`, `65536`, `-1`, `3000.5`, `abc`, `''` (invalid) | валидные приняты как integer; каждое невалидное → ошибка с `PORT` |
| TC-ENV-05 | AC-01 | unit | negative | — | `NODE_ENV` = `staging`, `PRODUCTION`; отдельно отсутствует | `staging`/`PRODUCTION` → ошибка с `NODE_ENV`; отсутствует → `development` |
| TC-ENV-06 | AC-01 | unit | negative | — | `OPENAI_ENABLED` отсутствует; `''`; `yes`; `1`; `TRUE` | отсутствие, `''` (= не задано, Q-2), `yes`, `1`, `TRUE` → ошибка с `OPENAI_ENABLED` (Q-1: только `true`/`false`) |
| TC-ENV-07 | AC-01 | unit | negative | — | `ENV1` без `OPENAI_API_KEY`; отдельно `OPENAI_API_KEY=''`; отдельно `'   '` | ошибка, названа `OPENAI_API_KEY`; пробельный ключ = не задан → ошибка (Q-2/AM-BE-4); префикс `sk-` не проверяется |
| TC-ENV-08 | AC-01 | unit | negative | — | `ENV1` без `OPENAI_STRATEGY_MODEL`; отдельно `''` | ошибка с `OPENAI_STRATEGY_MODEL` |
| TC-ENV-09 | AC-01 | unit | negative | — | `ENV1` без `OPENAI_TACTICAL_MODEL`; отдельно `''` | ошибка с `OPENAI_TACTICAL_MODEL` |
| TC-ENV-10 | AC-01 | unit | boundary | — | `ENV1` с `OPENAI_MAX_COST_PER_SESSION_USD` = отсутствует, `0`, `-0.01`, `abc`, `NaN`, `Infinity`, `''` (invalid); `0.000001`, `0.25`, `5` (valid) | каждое невалидное → ошибка с этим именем; также `5.01` → ошибка (≤ 5, AM-BE-4); `> 0`, конечное и `≤ 5` — принято |
| TC-ENV-11 | AC-01 | unit | positive | — | `ENV0` (`OPENAI_ENABLED=false`) без ключа/моделей/лимита | успех: условные переменные не требуются |
| TC-ENV-12 | AC-01 | unit | boundary | — | `OPENAI_ENABLED=false` и присутствует **невалидный** `OPENAI_MAX_COST_PER_SESSION_USD=abc` | успех: при `OPENAI_ENABLED=false` OpenAI-переменные не проверяются (Q-3) |
| TC-ENV-13 | AC-01 | unit | boundary | — | `OPENAI_TIMEOUT_MS`: отсутствует → 30000; `0`, `-1`, `abc`, вне верхней границы схемы (invalid); `OPENAI_MAX_RETRIES`: отсутствует → 2; `0` (valid), `-1`, `1.5`, `abc`, выше верхней границы (invalid) | `OPENAI_TIMEOUT_MS` 1000..120000, `OPENAI_MAX_RETRIES` 0..5 (Q-4); `OPENAI_MAX_RETRIES=0` допустим; границы 1000/120000/0/5 приняты, 999/120001/6 — ошибка |
| TC-ENV-14 | AC-01 | unit | negative | — | одновременно: нет `DATABASE_URL`, `PORT=abc`, `OPENAI_ENABLED=true` без ключа и с `OPENAI_MAX_COST_PER_SESSION_USD=0` | **одна** ошибка, перечислены все 4 имени (не только первое) |
| TC-ENV-15 | AC-01, AC-10 | unit | negative | значения-сентинелы | невалидные значения: `PORT='sentinel-port-xyz'`, `OPENAI_MAX_COST_PER_SESSION_USD='sentinel-cost-xyz'`, `OPENAI_ENABLED='sentinel-flag-xyz'`, и `OPENAI_API_KEY=SENTINEL_KEY` при отсутствующей модели | сообщение содержит имена переменных и причины, но **ни одной** подстроки `sentinel-` и `sk-`; то же для `error.cause`/`issues`, если они сериализуются |
| TC-ENV-16 | AC-01 | integration | negative | built/исполняемый `main` (TR-4) | запустить процесс API с `env = ENV1` без `OPENAI_TACTICAL_MODEL` (без `.env`, временный cwd/флаг отключения `.env`) | процесс завершается с **кодом 1** до прослушивания порта; stderr содержит `Invalid environment:` и `OPENAI_TACTICAL_MODEL`; stderr/stdout не содержат `SENTINEL_KEY`; порт не открыт |
| TC-ENV-17 | AC-01 | integration | positive | — | процесс API с `ENV0` | стартует, `GET /api/health` → 200 |
| TC-ENV-18 | AC-01 | unit | positive | — | прочитать `apps/api/.env.example`, распарсить ключи; сравнить с ключами схемы | множества **равны** (нет лишних и недостающих); `OPENAI_API_KEY=` пустой; `OPENAI_ENABLED=false`; `parseEnv(example)` успешен (с `DATABASE_URL` из примера) |
| TC-ENV-19 | AC-01 | unit | negative | — | вызвать функцию сравнения из TC-ENV-18 с искусственной схемой + лишний ключ `NEW_REQUIRED_VAR`; и с примером без `OPENAI_TACTICAL_MODEL` | сравнение **падает** с понятным именем расхождения (проверка реально ловит рассинхронизацию) |
| TC-ENV-20 | AC-01, AC-13 | integration | negative | `process.env` теста содержит `OPENAI_ENABLED=true`, `OPENAI_API_KEY=SENTINEL_KEY` | `createApp({ config: parseEnv(ENV0) })` → `GET /api/dev/ai/status` | `openaiEnabled:false`, `provider:'mock'`, `keyConfigured:false` — `createApp` использует **только** переданный конфиг, не `process.env` и не `.env`; отдельно `parseEnv` с `NODE_ENV=test` + `OPENAI_ENABLED=true` → ошибка (AM-BE-3) |
| TC-ENV-21 | AC-01 | arch | positive | — | `grep -rn "process\.env" apps/api/src` (и `process.loadEnvFile`) | совпадения `process\.env\|process\[\|loadEnvFile` только в `apps/api/src/config/env.ts` (Q-5 → plan-backend §2.4: `loadEnvFile` тоже только там; ESLint `no-restricted-properties`) |
| TC-ENV-22 | AC-01 | integration | positive | — | `node apps/api/scripts/ensure-env.mjs` в чистой копии без `.env` (временный каталог) | созданный `.env` (= `.env.example`) проходит `parseEnv` → `pnpm dev` после клона стартует в mock-режиме |

### 2. Выбор провайдера и доступность моделей (AC-02)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-PS-01 | AC-02 | unit | positive | — | фабрика провайдера с `ENV0` | `MockAIProvider` (`id:'mock'`); `OpenAIProvider`/SDK-клиент **не** создаётся (шпион конструктора не вызван) |
| TC-PS-02 | AC-02 | unit | positive | `FAKE_SDK` | фабрика с `ENV1` | основной провайдер `OpenAIProvider` (`id:'openai'`) |
| TC-PS-03 | AC-02 | integration | positive | `ENV1`, `FAKE_SDK` | `POST test-decision` с `provider:'mock'` | `decision.provider:'mock'`, стоимость 0, `FAKE_SDK.responses.create` не вызван |
| TC-PS-04 | AC-02 | integration | negative | `ENV0` | `POST test-decision` с `provider:'auto'` (и без поля) | mock; при `OPENAI_ENABLED=false` OpenAI недостижим никаким значением тела |
| TC-PS-05 | AC-02 | unit | positive | `ENV1`, `FAKE_SDK` | `makeDecision(CTX('strategy'))`, затем `CTX('tactical')` | `model` в запросе SDK и в результате = `gpt-6.1-sol` и `gpt-6-luna` соответственно; роль по умолчанию в API — `tactical` (A-4) |
| TC-PS-06 | AC-02 | unit | positive | `ENV1` с другими значениями моделей (`OPENAI_TACTICAL_MODEL=gpt-6-luna`, стратегия = `gpt-6-luna`) | `CTX('strategy')` | используется значение из env, а не захардкоженное |
| TC-PS-07 | AC-02 | integration | positive | `FAKE_SDK.models.retrieve` → 200 для обеих | первый `POST test-decision` (tactical), затем второй | `models.retrieve('gpt-6-luna')` вызван **до** `responses.create`, ровно один раз за два запроса (кэш в памяти) |
| TC-PS-08 | AC-02 | integration | negative | `models.retrieve` → `NotFoundError` 404 | `POST test-decision` | `err('AI_NOT_CONFIGURED', 503)`, `messageKey:'errors.aiModelUnavailable'` (AM-BE-2); `responses.create` **не** вызван; бюджет не изменился; строка `AiUsage` пишется (Q-6: пишутся все попытки) |
| TC-PS-09 | AC-02 | integration | negative | `models.retrieve` → сетевая ошибка/таймаут | `POST test-decision` | 502 `AI_PROVIDER_ERROR` (Q-7), без платного запроса (`responses.create` не вызван); недоступность не кэшируется навсегда (следующий запрос проверяет снова) |
| TC-PS-10 | AC-02 | integration | negative | `ENV1` с `OPENAI_TACTICAL_MODEL=gpt-unknown-x`, `models.retrieve` → 200 | `POST test-decision` | модели нет в `pricing.ts` → `err('AI_NOT_CONFIGURED', 503)`; `responses.create` не вызван |
| TC-PS-11 | AC-02 | integration | positive | `ENV1`, `FAKE_SDK` | `GET /api/dev/ai/status` до и после проверки моделей | при `ENV1`: `models.strategy/tactical = {id, available:null}` до проверки, после — `true`/`false`; проверка один раз на процесс, кэш TTL 10 мин (Q-26); `keyConfigured:true`; при `ENV0` — `openaiEnabled:false`, `provider:'mock'`, `keyConfigured:false`, `models.*.id` — `string` или `null`, `budget.limit*/remaining*` — `null` (AM-BE-9), сетевых вызовов нет |
| TC-PS-12 | AC-02 | integration | negative | `FAKE_SDK.models.retrieve` → `AuthenticationError` 401 | `POST test-decision` | 503 `AI_NOT_CONFIGURED`, `messageKey:'errors.aiKeyRejected'` (Q-7); в теле и логах нет `SENTINEL_KEY` и сырого сообщения SDK |

### 3. Провайдеры и строгая схема (AC-03)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-OP-01 | AC-03 | unit | positive | `FAKE_SDK` (валидный ответ) | `OpenAIProvider.makeDecision(CTX('tactical'))`; снять аргументы `responses.create` | вызван именно `responses.create` (не `chat.completions`); `text.format.type='json_schema'`, `strict:true`; `schema.properties.selectedActionId.enum` = id контекста в том же порядке, без лишних; `reason: {type:'string'}` без `maxLength` (ограничение «≤ 300» — в описании, сервер усекает, AM-BE-5/Q-8); `required` = оба поля; `additionalProperties:false`; `max_output_tokens` = 400 (tactical) / 1600 (strategy), `store:false` (plan-backend §4.2) |
| TC-OP-02 | AC-03 | unit | positive | — | два разных контекста (4 и 2 действия) | enum схемы строится из **текущего** контекста (не кэш с прошлого запроса) |
| TC-OP-03 | AC-03, AC-10 | unit | positive | `FAKE_SDK` | аргументы `responses.create` | prompt содержит сценарий и действия; **не** содержит ключ, секреты окружения, данные другой стороны (нет полей кроме контекста) |
| TC-OP-04 | AC-03 | unit | positive | — | SDK-клиент создаётся с `apiKey` из конфига, `timeout = OPENAI_TIMEOUT_MS`, `maxRetries: 0` (повторы делает наш слой) | проверка параметров конструктора (шпион) — см. TC-RT-12 |
| TC-OP-05 | AC-03 | unit | positive | — | `MockAIProvider.makeDecision(CTX)` 3 раза подряд и на новом экземпляре | одинаковый `selectedActionId` = первое действие, `reason` непустой, `provider:'mock'`, `model:'mock-deterministic-v1'`, `estimatedCostUsd:0`, `estimatedCostMicroUsd:0`, `usage` = нули (`reasoningTokens` `null`/0), `attempts:1`, `durationMs ≥ 0` |
| TC-OP-06 | AC-03 | unit | positive | — | `MockAIProvider` с разными `availableActions` | выбор всегда ∈ списка контекста |
| TC-OP-07 | AC-03 | unit | negative | — | `MockAIProvider` в режимах сбоев `invalid-action`, `malformed`, `timeout`, `rate-limit`, `network` (тестовая конфигурация) | каждый режим воспроизводит соответствующий сбой (вход для TC-DV/TC-RT) |
| TC-OP-08 | AC-03, AC-08 | integration | negative | `ENV0` | `POST test-decision` с `provider:'timeout'` / `mockMode:'malformed'` / любым полем выбора режима сбоя | 400 (strict-схема): режимы сбоев недоступны из публичного запроса |
| TC-OP-09 | AC-03 | arch | positive | — | typecheck | `OpenAIProvider` и `MockAIProvider` реализуют `AIProvider` (`implements`/проверка типов); `AIDecisionResult` совпадает с контрактом спецификации |

### 4. Валидация решения (AC-04)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-DV-01 | AC-04 | unit | positive | — | валидатор: `{selectedActionId:'a2', reason:'…'}` при `SCN` | принято |
| TC-DV-02 | AC-04 | unit | negative | — | `selectedActionId:'a99'` (нет в списке) | `AI_INVALID_DECISION` |
| TC-DV-03 | AC-04 | unit | negative | — | `selectedActionId:'A2'` (регистр), `' a2'` (пробел), `''` | отклонено — сравнение точное, без нормализации |
| TC-DV-04 | AC-04 | unit | negative | — | лишнее поле: `{selectedActionId:'a2', reason:'x', execute:'rm'}` | отклонено (strict) |
| TC-DV-05 | AC-04 | unit | negative | — | нет `reason`; нет `selectedActionId`; `selectedActionId: 2` (число); `reason: null` | отклонено |
| TC-DV-06 | AC-04 | unit | boundary | — | `reason` длиной 0 (`''`), 1, 300, 301; только пробелы | `reason` обрезается (trim) и усекается до 300 (Q-8/AM-BE-5): 1 и 300 — приняты как есть; 301 — принято, усечено до 300; `''` и пробельный → `AI_INVALID_DECISION` |
| TC-DV-07 | AC-04 | unit | negative | — | сырой текст модели: `not json`, `{"selectedActionId":"a2"` (обрезан), `[]`, `null`, пустая строка, JSON в markdown-обёртке ```` ```json ```` | `AI_INVALID_DECISION`, без исключения наружу |
| TC-DV-08 | AC-04 | unit | negative | — | ответ SDK со `status:'incomplete'` (`max_output_tokens`) или `refusal` | `AI_INVALID_DECISION` 502 (`details.reason` `incomplete`/`refusal`, Q-9); не трактуется как выбор; стоимость попытки учитывается |
| TC-DV-09 | AC-04 | integration | negative | `FAKE_SDK` → валидный по форме JSON с `selectedActionId:'a99'` | `POST test-decision` | `err('AI_INVALID_DECISION', 502)`; `details` = `{attempts, reason, estimatedCostUsd}` — без id/текста ответа модели (Q-10 → plan-backend §6.2); `AiUsage` содержит запись ошибки с токенами и стоимостью попытки (сценарий 3); без игровых изменений |
| TC-DV-10 | AC-04 | integration | negative | `MockAIProvider` в режиме `invalid-action` (тестовая конфигурация `createApp`) | `POST test-decision` | 502 `AI_INVALID_DECISION`; без игровых изменений |
| TC-DV-11 | AC-04 | integration | negative | `MockAIProvider` `malformed` | `POST test-decision` | 502 `AI_INVALID_DECISION` |
| TC-DV-12 | AC-04 | unit | positive | — | валидация в **сервисе**: провайдер-подделка возвращает `selectedActionId` вне списка в `AIDecisionResult` | сервис отклоняет, даже если провайдер «доверяет» SDK (валидация не только в провайдере) |
| TC-DV-13 | AC-04 | unit | negative | — | повторяется ли запрос при `AI_INVALID_DECISION` | не повторяется, `attempts:1` (Q-11) |

### 5. Таймауты, повторы, rate limit (AC-05)

`OPENAI_MAX_RETRIES=2` ⇒ максимум 3 попытки. Таймеры — фейковые (`vi.useFakeTimers`) или инжектируемый `sleep` (TR-5);
тест проверяет **число вызовов** `responses.create` и задержки, а не реальное время.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-RT-01 | AC-05 | unit | negative | `FAKE_SDK` = [timeout ×3] | `makeDecision` | ровно **3** вызова; затем `AI_TIMEOUT` (HTTP 504), `details.attempts=3` |
| TC-RT-02 | AC-05 | unit | positive | [timeout, ok] | `makeDecision` | 2 вызова; успех; `attempts:2`; `durationMs` — сумма по попыткам, usage/стоимость суммируются (Q-12) |
| TC-RT-03 | AC-05 | unit | negative | [network ×3] | `makeDecision` | 3 вызова → `AI_PROVIDER_ERROR` (502) |
| TC-RT-04 | AC-05 | unit | negative | [429 с `retry-after: 2` ×3] | `makeDecision` | 3 вызова; пауза перед 2-й и 3-й попыткой **≥ 2000 мс**; затем `AI_RATE_LIMITED` (429) |
| TC-RT-05 | AC-05 | unit | positive | [429 без `retry-after`, ok] | `makeDecision` | 2 вызова, пауза = backoff плана (>0); успех |
| TC-RT-06 | AC-05 | unit | boundary | [429 с `retry-after: 3600`] | `makeDecision` | не ждёт: `retry-after` > 10 с → сразу `AI_RATE_LIMITED` 429 с `details.retryAfterSeconds`, без повтора (Q-13, plan-backend §5); ≤ 10 с — ждёт |
| TC-RT-07 | AC-05 | unit | negative | [500 ×3]; отдельно [503 ×3] | `makeDecision` | 3 вызова → `AI_PROVIDER_ERROR` (502) |
| TC-RT-08 | AC-05 | unit | negative | [400]; [401]; [403]; [404]; [422] | `makeDecision` | **1** вызов, без повторов; 400/422 → 502 `AI_PROVIDER_ERROR` (`reason:'bad_request'`); 401/403 → 503 `AI_NOT_CONFIGURED` `errors.aiKeyRejected`; 404 → 503 `AI_NOT_CONFIGURED` `errors.aiModelUnavailable` (Q-7, plan-backend §6.1); сообщение без сырого текста SDK |
| TC-RT-09 | AC-05 | unit | negative | [429 `code:'insufficient_quota'`] | `makeDecision` | 1 вызов, без повторов; 502 `AI_PROVIDER_ERROR`, `messageKey:'errors.aiQuota'` (Q-14, «Decisions» W2) |
| TC-RT-10 | AC-05 | unit | boundary | `OPENAI_MAX_RETRIES=0`, [timeout] | `makeDecision` | 1 вызов, `AI_TIMEOUT` |
| TC-RT-11 | AC-05 | unit | positive | [network, 500, ok] | `makeDecision` | 3 вызова, успех; backoff растёт между попытками (2-я пауза ≥ 1-й) |
| TC-RT-12 | AC-05 | unit | negative | SDK-клиент с подменённым `fetch`, отвечающим 500 | `makeDecision` | число HTTP-запросов `fetch` = `OPENAI_MAX_RETRIES + 1` (встроенные повторы SDK отключены, нет умножения 3×3) |
| TC-RT-13 | AC-05 | unit | negative | `FAKE_SDK` бесконечно отвечает 500 | `makeDecision` с инварантом «вызовов ≤ 10» | тест завершается; вызовов ровно 3 — бесконечных повторов нет |
| TC-RT-14 | AC-05 | unit | positive | реальный таймер, SDK-подделка, которая не отвечает | `OPENAI_TIMEOUT_MS=50`, `MAX_RETRIES=0` | промис отклоняется `AI_TIMEOUT` за ≈ 50 мс (+допуск), не висит |
| TC-RT-15 | AC-05 | integration | negative | `FAKE_SDK` [timeout ×3] | `POST test-decision` | 504 `AI_TIMEOUT`, `details.attempts:3`; `AiUsage` — запись с `errorCode`, `attempts:3`; без игровых изменений |
| TC-RT-16 | AC-05 | integration | negative | [429 ×3] | `POST test-decision` | 429 `AI_RATE_LIMITED` (отличается от `AI_BUDGET_EXCEEDED` кодом); без игровых изменений |
| TC-RT-17 | AC-05 | integration | negative | [network ×3]; [500 ×3]; [400] | `POST test-decision` | 502 `AI_PROVIDER_ERROR`; тело ошибки в едином формате, `messageKey` есть в ru/en |
| TC-RT-18 | AC-05 | integration | negative | `MockAIProvider` режимы `timeout`, `rate-limit`, `network` | `POST test-decision` | 504 / 429 / 502 соответственно — mock-режимы проходят тот же путь обработки |
| TC-RT-19 | AC-05 | unit | positive | каждый сценарий TC-RT-01..11 | перехват логгера | одна строка лога на попытку: провайдер, модель, номер попытки, длительность, статус/класс ошибки; без ключа и промпта (см. TC-S-03) |

### 6. Usage и стоимость (AC-06)

Формула (spec): `cost = ((input − cached)·in + cached·cachedIn + output·out) / M`; reasoning входит в `output` (A-2) и **не**
прибавляется повторно. Long context — суммарный input (вкл. cached) > 272 000: ×2 к `in` и `cachedIn`, ×1.5 к `out` на весь
запрос; 272 000 — ещё short (Q-16). Стоимость считается в целых микро-USD с округлением **вверх** на попытку (Q-15, «Decisions»
W4/W5); USD в ответе = микро-USD / 10⁶ (6 знаков). Ожидания ниже — точные значения после этого округления.

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-UC-01 | AC-06 | unit | positive | — | `gpt-6-luna`: input 1000, cached 200, output 300 | `(800·0.10 + 200·0.01 + 300·0.50)/M = 0.000232` $ |
| TC-UC-02 | AC-06 | unit | positive | — | `gpt-6.1-sol`: input 1000, cached 200, output 300 | `(800·2 + 200·0.10 + 300·10)/M = 0.00462` $ |
| TC-UC-03 | AC-06 | unit | positive | — | `gpt-6.1-sol`: input 1000, cached 0, output 300, reasoning 200 | `0.005` $ (reasoning не добавлен сверху); `usage.reasoningTokens=200` |
| TC-UC-04 | AC-06 | unit | positive | — | usage SDK без `output_tokens_details` | `reasoningTokens: null`; стоимость считается |
| TC-UC-05 | AC-06 | unit | boundary | — | все токены 0 (оба тарифа) | `0` |
| TC-UC-06 | AC-06 | unit | boundary | — | `gpt-6.1-sol`: input **272000**, cached 0, output 0 | стандартный тариф: `0.544` $ |
| TC-UC-07 | AC-06 | unit | boundary | — | `gpt-6.1-sol`: input **272001**, cached 0, output 0 | long context: `272001·4/M = 1.088004` $ (1 088 004 µ$; множитель на весь запрос — Q-16) |
| TC-UC-08 | AC-06 | unit | boundary | — | `gpt-6-luna`: input 272001, cached 0, output 1000 | `(272001·0.20 + 1000·0.75)/M = 0.0551502` $ → округление вверх до µ$: **55 151 µ$ = 0.055151** $ (Q-15) |
| TC-UC-09 | AC-06 | unit | boundary | — | `gpt-6.1-sol`: input 300000, cached 100000, output 1000 | `(200000·4 + 100000·0.20 + 1000·15)/M = 0.835` $ |
| TC-UC-10 | AC-06 | unit | boundary | — | порог для `input` с кэшем: input 272001, из них cached 1000 | порог по **полному** input (Q-16) → long context: `(271001·4 + 1000·0.20)/M = 1.084204` $ (1 084 204 µ$) |
| TC-UC-11 | AC-06 | unit | negative | — | неизвестная модель `gpt-unknown-x` | ошибка «тариф неизвестен» (→ 503 `AI_NOT_CONFIGURED` на уровне API, TC-PS-10), не `0` и не `NaN` |
| TC-UC-12 | AC-06 | unit | negative | — | некорректный usage: `cached > input`; отрицательные; `undefined`/нечисло | `cached > input` → cached ограничивается input (clamp); отрицательные/нецелые/`undefined` → `RangeError` (никогда не отрицательная/`NaN` стоимость; Q-17 → `pricing.ts`); нет usage в ответе SDK → токены 0, стоимость = резерв одной попытки (plan-backend §4.4) |
| TC-UC-13 | AC-06 | unit | positive | — | `pricing.ts` | содержит обе модели с тарифами таблицы spec, long-context порог 272000 и множители, `pricingVersion:'openai-2026-11-08'`, ссылку на источник; результат `AIDecisionResult.pricingVersion` = это значение |
| TC-UC-14 | AC-06 | unit | positive | `FAKE_SDK` с usage `{input_tokens:1000, input_tokens_details:{cached_tokens:200}, output_tokens:300, output_tokens_details:{reasoning_tokens:120}, total_tokens:1300}` | `OpenAIProvider.makeDecision` (`gpt-6-luna`) | `usage = {inputTokens:1000, cachedInputTokens:200, outputTokens:300, reasoningTokens:120, totalTokens:1300}`; `estimatedCostUsd=0.000232`, `estimatedCostMicroUsd=232`; `model:'gpt-6-luna'`; `durationMs ≥ 0`; `attempts:1` |
| TC-UC-15 | AC-06 | unit | positive | [timeout, ok] с usage на 2-й попытке | `makeDecision` | стоимость/usage = сумма по попыткам (Q-12); попытка, оборванная таймаутом после отправки, — по худшей стоимости попытки (AM-BE-8) |
| TC-UC-16 | AC-06 | integration | positive | `FAKE_SDK` как TC-UC-14 | `POST test-decision` | ответ `decision` содержит все поля `AIDecisionResult` (вкл. `estimatedCostMicroUsd`, `pricingVersion`); в БД ровно 1 новая строка `AiUsage` с теми же `provider, model, role, status, attempts, токенами`, стоимостью в целых µ$, `pricingVersion` (AM-BE-7), `durationMs`, `budgetKey:'dev-diagnostics'`, `createdAt` |
| TC-UC-17 | AC-06, AC-10 | integration | positive | после TC-UC-16, TC-DV-09 | прочитать все колонки `AiUsage` | колонок для текста промпта/ответа нет; ни одно значение не содержит `SENTINEL_KEY`, текст `objective` или `reason` |
| TC-UC-18 | AC-06 | integration | positive | `ENV0` | `POST test-decision` (mock) | `AiUsage` — запись с `provider:'mock'`, стоимость 0 (Q-18: пишется) |
| TC-UC-19 | AC-06 | integration | positive | БД до SWR-005B (`createSwr004Db` + миграции SWR-005) | применить миграции | таблица `AiUsage` создана новой миграцией; существующие сессии и события не изменены (число строк, `version`) |

### 7. Бюджет (AC-07)

Лимит в тестах — через конфиг (`OPENAI_MAX_COST_PER_SESSION_USD`); `reserve` — инжектируемая/детерминированная оценка (TR-6).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-B-01 | AC-07 | unit | positive | — | функция резерва: длина промпта P, `max_output_tokens` O, retries R, модель | `reserve = cost(inputEstimate(P) с запасом, O) × (R+1)`; монотонна по P, O, R; R=0 → один множитель |
| TC-B-02 | AC-07 | integration | boundary | лимит 0.25, засеяно `spent=0.20` (`AiUsage`), reserve = 0.05 | `POST test-decision` | **равенство** `spent + reserve = limit` → 429 `AI_BUDGET_EXCEEDED`; `responses.create` и `models.retrieve` (платный путь) **не вызваны** (шпион); `details.remainingUsd = 0.05` (без ключа) |
| TC-B-03 | AC-07 | integration | boundary | `spent=0.20`, reserve = 0.0499 | `POST test-decision` | разрешено; 200 |
| TC-B-04 | AC-07 | integration | boundary | точность чисел: `spent` = сумма 0.1 + 0.15 (две записи), reserve 0 → ровно лимит 0.25 | `POST` | блокируется ровно на лимите: суммирование в целых микро-USD (Q-15), без float-ошибок |
| TC-B-05 | AC-07 | integration | positive | `spent=0` | 1 запрос с фактической стоимостью c < reserve | после ответа `spent = c` (резерв освобождён до фактической стоимости), `budget.spentUsd`, `remainingUsd = limit − c` в ответе и в `GET status` |
| TC-B-06 | AC-07 | integration | negative | запрос завершился ошибкой (timeout ×3, 500) | `GET status` после | резерв снят; `spent` увеличился на учтённую стоимость попыток: попытка, оборванная таймаутом после отправки, — по худшей стоимости попытки (Q-19/AM-BE-8); 5xx с usage — по usage |
| TC-B-07 | AC-07 | integration | boundary | лимит допускает ровно **один** резерв; `FAKE_SDK` отвечает с задержкой 200 мс | 5 параллельных `POST test-decision` с одним `budgetKey` | ровно 1 вызов `responses.create`; остальные 4 → 429 `AI_BUDGET_EXCEEDED`; итоговый `spent ≤ limit` |
| TC-B-08 | AC-07 | integration | boundary | лимит допускает **два** резерва | 10 параллельных запросов | `responses.create` вызван ≤ 2 раз; сумма фактических стоимостей ≤ limit; повторить 20 раз (флейки-детектор) |
| TC-B-09 | AC-07 | unit | boundary | сервис бюджета без HTTP | `Promise.all` из N `reserve()` по одному ключу | число успешных резервов = ⌊(limit − spent)/reserve⌋ с учётом правила `≥` (строгое) |
| TC-B-10 | AC-07 | integration | positive | `spent` исчерпан для `dev-diagnostics` | запрос с `provider:'mock'` | 200, стоимость 0, бюджет не меняется; mock работает и при исчерпанном бюджете (Q-20: да — «Mock не тратит бюджет», plan-backend §10) |
| TC-B-11 | AC-07 | integration | positive | `ENV0` | 20 mock-запросов (с учётом rate limit — по TR-8) | `spent` = 0 всё время; `responses.create` не вызывался |
| TC-B-12 | AC-07 | integration | positive | файл SQLite T, `spent=0.20` после реальных (подменённых) запросов | закрыть приложение, `createApp` заново на том же файле T → `GET status` | `spentUsd = 0.20` (бюджет переживает рестарт — учёт в `AiUsage`, не в памяти) |
| TC-B-13 | AC-07 | integration | negative | после TC-B-12 добавить запрос, при котором `spent + reserve ≥ limit` | `POST` | 429 без вызова SDK — блокировка действует и после рестарта |
| TC-B-14 | AC-07, AC-08 | integration | negative | — | `POST test-decision` с `budgetKey:'k2'` (любым, кроме `dev-diagnostics`) | 400 `VALIDATION`: dev-эндпоинт принимает только `dev-diagnostics` (AM-BE-6, Q-21 закрыт — новый ключ не даёт свежий лимит); изоляция ключей проверяется на уровне сервиса бюджета (unit, TC-B-09) |
| TC-B-15 | AC-07 | unit | negative | `OPENAI_MAX_COST_PER_SESSION_USD` меньше одного резерва (напр. 0.000001) | `POST` | первый же платный запрос → 429 без вызова SDK |
| TC-B-16 | AC-07, AC-09 | component | positive | `mockFetch` → 429 `AI_BUDGET_EXCEEDED` | «Тестировать AI» | `role=alert` с текстом «бюджет исчерпан» (ru/en), остаток бюджета 0/показан |

### 8. Dev API: доступность, защита, лимиты (AC-08)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-API-01 | AC-08 | integration | positive | `NODE_ENV=development`, `ENV0` | `GET /api/dev/ai/status`; `POST /api/dev/ai/test-decision` с `SCN` | 200; формы ответа по контракту; `decision.selectedActionId ∈ SCN` |
| TC-API-02 | AC-08 | integration | positive | `NODE_ENV=test` | те же запросы | доступны (`!== 'production'`) |
| TC-API-03 | AC-08 | integration | negative | `NODE_ENV=production`, `ENV1` + `FAKE_SDK` | `GET status`, `POST test-decision`, `OPTIONS`, `GET /api/dev/ai/unknown` | **404** (как для несуществующего маршрута, не 403); SDK не вызван; модуль не зарегистрирован (`app.get(AiDevController)` бросает / в списке маршрутов нет `/api/dev`) |
| TC-API-04 | AC-08 | integration | positive | `NODE_ENV=production` | `GET /api/health`, `GET /api/sessions` | работают как прежде (регрессия) |
| TC-API-05 | AC-08 | integration | negative | remote address `10.0.0.5` (TR-7) | `GET status`, `POST test-decision` | 403 `AI_DEV_FORBIDDEN`; SDK не вызван; бюджет не изменён |
| TC-API-06 | AC-08 | integration | negative | remote `192.168.1.10`, `172.16.0.2`, `8.8.8.8`, `::ffff:10.0.0.5`, `fe80::1` | `POST` | 403 для каждого |
| TC-API-07 | AC-08 | integration | positive | remote `127.0.0.1`, `::1`, `::ffff:127.0.0.1` | `POST` | разрешено |
| TC-API-08 | AC-08 | integration | negative | remote `10.0.0.5` + заголовок `X-Forwarded-For: 127.0.0.1`; также `Host: localhost` | `POST` | 403 — заголовки клиента не делают запрос «локальным» (trust proxy выключен) |
| TC-API-09 | AC-08 | integration | negative | — | порядок проверок: production → 404; non-loopback с невалидным телом → 403 (не 400); loopback + rate limit превышен + невалидное тело → по Q-22 | порядок AM-BE-11: 404 (production) → 403 guard → 400 размер/тело → 429 лимит частоты → 503 тариф/модель → 429 бюджет → вызов; non-loopback с невалидным телом → 403; loopback + невалидное тело при исчерпанном лимите частоты → 400 (Q-22) |
| TC-API-10 | AC-08 | integration | boundary | — | `availableActions` длиной 1 и 11 (invalid); 2 и 10 (valid) | 400 / 200 |
| TC-API-11 | AC-08 | integration | negative | — | дубли id в `availableActions`; пустой id `''`; id с > N символов (лимит плана); `type` пустой | 400 (id — `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$`, `type`/`target` 1..64 после trim — `@bga/platform` `AI_DEV_LIMITS`, Q-23) |
| TC-API-12 | AC-08 | integration | negative | — | лишнее поле в корне (`apiKey`, `model`, `prompt`), в `scenario`, в действии | 400 (strict на всех уровнях): клиент не может задать модель/промпт/ключ |
| TC-API-13 | AC-08 | integration | negative | — | `role:'admin'`, `provider:'openai'`, `faction:'jedi'`, `budgetKey` длиной > лимита / с недопустимыми символами | 400 (`budgetKey` — только `dev-diagnostics`, AM-BE-6) |
| TC-API-14 | AC-08 | integration | boundary | — | `objective` / `phase` на границе лимита длины и +1 символ | граница — 200, +1 — 400 (`phase` ≤ 64, `objective` ≤ 500, без управляющих символов кроме `\n` — Q-23) |
| TC-API-15 | AC-08 | integration | negative | — | тело > лимита размера (например, 100 КБ при лимите плана); не-JSON; `Content-Type: text/plain`; пустое тело | тело > 8 KiB → 400 `VALIDATION`; тело > лимита body-parser Nest → 413; не-JSON / `text/plain` / пустое → 400; единый формат ошибки; SDK не вызван (Q-23, plan-backend §6.1) |
| TC-API-16 | AC-08 | integration | boundary | лимит частоты 10/мин (значение плана), mock, фейковые часы | 10 запросов → 11-й | платные ≤ 10/мин, всего ≤ 120/мин на процесс (AM-BE-11); превышение → 429 `AI_RATE_LIMITED`, `messageKey:'errors.aiDevRateLimited'`, `details.retryAfterSeconds` + заголовок `Retry-After` (Q-24); после сдвига часов на 60 с — снова 200 |
| TC-API-17 | AC-08 | integration | positive | — | `GET status` не учитывается в лимите частоты / учитывается | `GET status` и mock учитываются в общем лимите 120/мин (Q-24); e2e укладывается |
| TC-API-18 | AC-08, AC-10 | integration | positive | `ENV1`, `FAKE_SDK` | `GET status`, успешный `POST`, каждый ответ-ошибка TC-API-05..16, TC-RT-15..18, TC-B-02 | сериализованные тело и заголовки не содержат `SENTINEL_KEY`, `sk-`, `OPENAI_API_KEY`, `Authorization`, `Bearer`; `keyConfigured` — только boolean |
| TC-API-19 | AC-08 | integration | negative | — | ошибки AI не меняют другие API: после серии 502/504/429 `GET /api/sessions`, команда в существующей партии | работают; без игровых изменений от AI-вызовов |

### 9. Dev-страница `/dev/ai` (AC-09)

testids — финальные **`dev-ai-*`** (`plan-frontend.md` §9, «Decisions» FE-AI; см. TR-9). Ошибки в браузере (e2e и ручной QA)
воспроизводятся только через `page.route` (Q-25); живой запрос — только Analyst (TC-LIVE-01). e2e: `e2e/dev-ai.spec.ts`,
под браузерным сетевым guard (любой запрос не на localhost, в т.ч. `*.openai.com`, abort + падение теста).

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-W-01 | AC-09 | component | positive | `mockFetch` status (mock-режим) | рендер страницы | статус подключения, провайдер `mock`, OpenAI выключен, модели (strategy/tactical, доступность «не проверено»), бюджет потрачено/лимит, список тестовых действий с пометкой «тестовые данные, не правила Rebellion», кнопка «Тестировать AI» |
| TC-W-02 | AC-09 | component | positive | status (openai, модели available true) | рендер | `gpt-6.1-sol`/`gpt-6-luna` и признак доступности; выбор роли и провайдера (`mock` для бесплатной проверки) |
| TC-W-03 | AC-09 | component | positive | `POST` отложен (pending promise) | клик «Тестировать AI» | индикатор загрузки; кнопка `disabled`/`aria-busy`; повторный клик не шлёт второй запрос |
| TC-W-04 | AC-09 | component | positive | `POST` → 200 | клик | выбранное действие (id + подпись), объяснение, модель, время ответа (мс), токены input/cached/output/reasoning (reasoning `null` → «—»), оценочная стоимость с подписью «оценка; итог по счёту OpenAI может отличаться», остаток бюджета; кнопка снова активна |
| TC-W-05 | AC-09 | component | negative | `POST` → по очереди каждый код: `AI_NOT_CONFIGURED`, `AI_BUDGET_EXCEEDED`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_PROVIDER_ERROR`, `AI_INVALID_DECISION`, `AI_DEV_FORBIDDEN`, `VALIDATION`(400), сетевой сбой fetch | клик | `role=alert` (`dev-ai-error`, `data-code`) с заголовком `devAi:error.<CODE>.title`, текстом по `messageKey` (`errors:*`) и подсказкой (ru и en, нет сырых ключей `errors.*`); прошлый успешный результат не выдаётся за новый (`dev-ai-result` `data-state=error`); кнопка снова активна |
| TC-W-06 | AC-09 | component | negative | `GET status` → ошибка/недоступен | рендер | состояние ошибки статуса (`role=alert`), страница не падает |
| TC-W-07 | AC-09 | component | positive | — | переключение языка ru/en | все тексты страницы переведены; ключи есть в обеих локалях (тест полноты i18n) |
| TC-W-08 | AC-09 | component | positive | `import.meta.env.DEV=false`, `VITE_E2E` не задан | роутер | маршрут `/dev/ai` не зарегистрирован (404/NotFound); ссылки на него из каталога нет; ссылка из Настроек (если есть) — только в dev |
| TC-W-09 | AC-09, AC-10 | component | positive | — | все запросы страницы (шпион `fetch`) | идут только на `/api/dev/ai/*` собственного бэкенда; ни одного запроса на `api.openai.com`; ключ нигде не запрашивается у пользователя (нет поля ввода ключа) |
| TC-E-01 | AC-09, AC-13 | e2e | positive | `pnpm e2e`, api `OPENAI_ENABLED=false` | открыть `/dev/ai` | статус (`dev-ai-status` `data-state=ready`): `dev-ai-status-openai` `data-enabled=false`, `dev-ai-status-provider` `data-provider=mock`, ключ не задан, бюджет «лимита нет» (AM-BE-9); ответ `GET status` — `openaiEnabled:false` (серверная часть guard); сценарий PO (empire, command, «Strengthen imperial control», action-1 MOVE_FLEET corellia, action-2 RECRUIT coruscant, action-3 PASS) с пометкой «тестовые данные, не правила Rebellion». Авто: `dev-ai.spec.ts` › «TC-E-01» (real API) |
| TC-E-02 | AC-09 | e2e | positive | — | выбрать `mock`, «Тестировать AI» | результат: действие из списка (`data-action-id` ∈ SCN, строка списка `data-selected`/`aria-current`), объяснение, провайдер `mock`, модель, время (`data-ms`), токены 0, стоимость `0` (`data-usd`, в ответе `estimatedCostMicroUsd:0`) с подписью «оценка», остаток бюджета; кнопка `disabled`/`data-pending` и группы роль/провайдер `disabled` во время запроса (запрос задержан `page.route` → `continue`); двойной клик → 1 запрос; тело запроса = SCN + `role`/`provider`, без `budgetKey`. Авто: «TC-E-02» (real API) + «TC-PS-04 (e2e)» (`auto` → подсказка «ответит mock», ответ mock) + «keyboard» |
| TC-E-03 | AC-09 | e2e | negative | `pnpm e2e`; `GET status` подменён `page.route` (mock-статус) | `page.route('**/api/dev/ai/test-decision')` → по очереди все 7 кодов `AI_*` (с `details` плана BE §6.2), затем 400 `VALIDATION` и сетевой обрыв; статус: 404 и 500 + «Повторить» | `role=alert` с `data-code`, локализованным заголовком/текстом/подсказкой, без сырых ключей и HTTP-кодов; старый результат скрыт; кнопка активна; новый успех убирает alert; статус 404 → `data-state=unavailable`, 500 → `dev-ai-status-error` (`role=alert`) и «Повторить» восстанавливает. Авто: «TC-E-03 / TC-W-05», «status card», «pending with an intercepted answer», «S-6» |
| TC-E-04 | AC-13 | e2e | positive | guard TR-1 в e2e | весь прогон `pnpm e2e` | в браузере: guard `e2e/support/dev-ai.ts` (`*.openai.com` → abort, любой не-localhost запрос → падение) — **только в `dev-ai.spec.ts`** (остальные spec страницу не открывают); в API: `NODE_ENV=test` запрещает `OPENAI_ENABLED=true` (AM-BE-3) + сетевой guard процесса тестов API (TR-1, W1); `GET status` в e2e → `openaiEnabled:false` |
| TC-E-05 | AC-09 | e2e | positive | — | `/dev/ai` → вернуться в каталог / открыть партию | основной игровой интерфейс работает; список сессий (`GET /api/sessions`) до/после идентичен; переход Настройки → `settings-dev-ai-link` → `/dev/ai` → «Назад» → каталог. Авто: «TC-E-05 + S-10/S-11» |
| TC-VA-01 | AC-09, AC-13 | visual-a11y | positive | — | скриншоты `plan-frontend.md` §12 S-1..S-11 (ru, если не указано) | файлы в `artifacts/screenshots/`: `dev-ai-1440-status-mock`, `dev-ai-375-status-mock`, `dev-ai-1440-pending`, `dev-ai-1440-result-mock`, `dev-ai-375-result-mock`, `dev-ai-1440-paid-warning`, `dev-ai-1440-error-budget`, `dev-ai-375-error-invalid`, `dev-ai-1440-status-unavailable`, `settings-375-dev-link`, `dev-ai-1440-en-result` (`.png`; 375 — fullPage); S-12 (реальный OpenAI) — только Analyst; кнопки/радио имеют доступные имена; ошибка — `role=alert`; фокус виден (`expectVisibleFocus`) |
| TC-VA-02 | AC-09 | visual-a11y | boundary | — | viewport 1440×900 и 375×812 (plan-frontend §5.1, §12) | без горизонтального скролла (`expectNoHorizontalScroll`) и обрезанных значений (`expectNotClipped` для действия, модели, стоимости, токенов) в состоянии статуса, успеха и ошибки |
| TC-M-01 | AC-09, AC-13 | manual | positive | `pnpm dev` с `OPENAI_ENABLED=false`(или provider mock), встроенный браузер (`browser-qa`) | пройти сценарии 1–2 в mock-режиме; ошибки — не воспроизводятся вручную, покрыты `page.route` в e2e (Q-25) | скриншоты в `artifacts/screenshots/manual-*.png`; отчёт в `qa-results.md` — результаты браузерного тестирования (требование AC-13) |

### 10. Секреты (AC-10)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-S-01 | AC-10 | arch | positive | `pnpm build` | `check:bundle` расширен: в `apps/web/dist` нет `sk-`(как литерала ключа), `OPENAI_API_KEY`, `OPENAI_`, `api.openai.com`, `/api/dev/ai`, testid `dev-ai-` | 0 совпадений; скрипт возвращает 0 |
| TC-S-02 | AC-10 | arch | negative | искусственный `dist` с файлом, содержащим `OPENAI_API_KEY` / `/api/dev/ai` / `dev-ai-status` | `node scripts/check-web-bundle.mjs --dist <tmp>` (тест в `scripts/*.test.mjs`) | код 1 с указанием файла и шаблона (проверка реально ловит) |
| TC-S-03 | AC-10 | integration | positive | `ENV1` (`SENTINEL_KEY`), перехват логгера Nest + `console.*` + `process.stdout/stderr.write` | прогнать: успех, каждый тип ошибки (TC-RT-15..18), 401 от SDK с сообщением, содержащим ключ (`Incorrect API key provided: sk-test-SENT…`), невалидное тело, бюджет | в перехваченных логах нет `SENTINEL_KEY` (ни целиком, ни префикса `sk-test-SENTINEL`), нет текста промпта (`objective`), нет `Authorization` |
| TC-S-04 | AC-10 | integration | positive | как TC-S-03 | тела ответов тех же запросов | нет `SENTINEL_KEY`, сырого сообщения SDK, стека, заголовков запроса |
| TC-S-05 | AC-10 | unit | positive | — | `new OpenAIProvider` с `SENTINEL_KEY`: `JSON.stringify(provider)`, `util.inspect(provider)`, `String(error)` для всех ошибок слоя AI | ключ не сериализуется (поле приватное/исключено), обёртки ошибок без исходного SDK-сообщения |
| TC-S-06 | AC-10 | arch | positive | — | `git check-ignore apps/api/.env`; `git ls-files apps/api \| grep '\.env'` | `.env` игнорируется; в индексе только `.env.example` |
| TC-S-07 | AC-10 | arch | positive | после QA и delivery | `grep -rnE 'sk-[A-Za-z0-9_-]{8,}' docs/tasks/SWR-005B` (+ `report.md`, `artifacts/`, playwright-report, traces если сохранены) | 0 совпадений с реальным форматом ключа (сентинел допустим только в исходниках тестов, не в артефактах задачи) |
| TC-S-08 | AC-10 | arch | positive | перед коммитом | `git diff --cached` / `git grep -nE 'sk-(proj-)?[A-Za-z0-9]{20,}'` | 0 совпадений; `.env.example` содержит `OPENAI_API_KEY=` пустым |
| TC-S-09 | AC-10 | e2e | positive | — | на `/dev/ai` собрать `document.documentElement.outerHTML`, `localStorage`, `sessionStorage`, ответы сети | нет `sk-…`, `OPENAI_API_KEY`, `Authorization`/`Bearer`; на странице нет поля ввода ключа. Авто: «TC-S-09» |
| TC-S-10 | AC-10 | integration | positive | — | `AiUsage` и любые новые колонки/логи БД | ключ/промпт/ответ не хранятся (см. TC-UC-17) |

### 11. Архитектура (AC-11)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-A-01 | AC-11 | arch | positive | — | ESLint-правило (`no-restricted-imports` для `openai`, `openai/*`) | включено для всего репозитория, разрешено только в `apps/api/src/ai/**`; `pnpm lint` зелёный |
| TC-A-02 | AC-11 | arch | negative | временный файл `apps/api/src/sessions/__tmp.ts` с `import OpenAI from 'openai'`; также в `apps/web/src`, `packages/platform/src`, `packages/games/rebellion/src` | `pnpm exec eslint <file>` | ошибка правила в каждом случае (файлы удаляются после проверки; фиксируется в qa-results) |
| TC-A-03 | AC-11 | arch | positive | — | `package.json` пакетов | `openai` — зависимость только `apps/api` (точная версия, A-5); нет в `apps/web`, `packages/*` |
| TC-A-04 | AC-11 | arch | positive | — | `grep -rn "openai\|OpenAI" packages/ apps/web/src --include=*.ts --include=*.tsx` | нет импортов SDK; game-core и `@bga/platform` не зависят от AI-слоя (коды ошибок `AI_*` в `@bga/platform` — это строки контракта, не зависимость) |
| TC-A-05 | AC-11 | integration | positive | существующая партия `core-v1` | серия `POST test-decision` (успех + все ошибки) | число событий, `version`, `state` всех сессий неизменны; AI-сервис не импортирует репозиторий сессий/движок (проверка импортов `apps/api/src/ai/**`) |
| TC-A-06 | AC-11 | arch | positive | — | существующий `apps/api/test/architecture.int.test.ts` + `e2e/architecture.spec.ts` | расширены правилом «openai только в ai/**» или эквивалентом; регрессия зелёная |
| TC-A-07 | AC-11 | arch | positive | — | `check:bundle` module-composition | в web-бандле нет модулей `apps/api`, `openai` |
| TC-A-08 | AC-11 | integration | positive | SWR-005 auto-pass | партия AI_REB: AI-ход | по-прежнему auto-pass (`auto-pass.ts`), модель к ходу партии не подключена (A-1) |

### 12. Живой запрос (AC-12) — единственный кейс с реальным OpenAI

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-LIVE-01 | AC-12 | manual | positive | **Исполнитель — Analyst** (A-4), BUSINESS_VALIDATION; `pnpm dev` с `apps/api/.env` PO (`OPENAI_ENABLED=true`); бюджет `dev-diagnostics` не исчерпан; копия БД (A-6) | на `/dev/ai`: провайдер `auto`, роль `tactical` → «Тестировать AI» один раз (опционально один `strategy`) | 200; `provider:'openai'`; `selectedActionId ∈ SCN`; `reason` непустой ≤ 300; в `report.md` записаны фактические `model`, `usage` (input/cached/output/reasoning), `estimatedCostUsd`, `durationMs`, `attempts`, время запроса (UTC); скриншот результата; строка `AiUsage` совпадает с UI; потрачено ≤ нескольких центов; ключ нигде не выведен |

QA этот кейс **не выполняет** и в `qa-results.md` отмечает его как вне QA (`not_run` с ссылкой на `acceptance.md`/`report.md` Analyst).

### 13. Регрессия и общий gate (AC-13)

| TC | Covers | Level | Type | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|
| TC-R-01 | AC-13 | gate | positive | рабочее дерево после интеграции | `pnpm verify` | код 0; лог в `artifacts/logs/verify.log` |
| TC-R-02 | AC-13 | gate | positive | — | счётчики наборов из лога | rebellion ≥ 411, api ≥ 221 (+1 opt-in) + новые, web ≥ 480 + новые, platform ≥ 65, e2e ≥ 106 + новые; при уменьшении — таблица замен |
| TC-R-03 | AC-13 | gate | positive | — | `node --test scripts/` | зелёный (включая новые тесты `check-web-bundle` TC-S-02) |
| TC-R-04 | AC-13 | gate | positive | guard TR-1 включён в `global-setup`/`setupFiles` API и в e2e-сервере | `pnpm test`, `pnpm e2e` | ни одного обращения к `api.openai.com`; guard сам проверен тестом (TC-R-05) |
| TC-R-05 | AC-13 | unit | negative | guard активен | тест пытается `fetch('https://api.openai.com/v1/models')` и `new OpenAI({apiKey: SENTINEL_KEY}).models.list()` без подмены | тест-guard падает с явной ошибкой «network call to OpenAI in tests» (guard реально работает) |
| TC-R-06 | AC-13 | gate | positive | — | `node scripts/check-task.mjs docs/tasks/SWR-005B` | код 0 |
| TC-R-07 | AC-13 | gate | positive | без `apps/api/.env` в окружении процесса тестов (TR-3) | `pnpm test` при наличии `.env` PO с `OPENAI_ENABLED=true` | результаты идентичны прогону без `.env` (тесты не зависят от локального `.env`) |

## Coverage

| AC | Test cases |
|---|---|
| AC-01 | TC-ENV-01..TC-ENV-22 |
| AC-02 | TC-PS-01..TC-PS-12, TC-UC-11 |
| AC-03 | TC-OP-01..TC-OP-09 |
| AC-04 | TC-DV-01..TC-DV-13, TC-OP-07 |
| AC-05 | TC-RT-01..TC-RT-19, TC-OP-04 |
| AC-06 | TC-UC-01..TC-UC-19 |
| AC-07 | TC-B-01..TC-B-16 |
| AC-08 | TC-API-01..TC-API-19, TC-OP-08 |
| AC-09 | TC-W-01..TC-W-09, TC-E-01..TC-E-03, TC-E-05, TC-VA-01, TC-VA-02, TC-M-01, TC-B-16 |
| AC-10 | TC-S-01..TC-S-10, TC-ENV-15, TC-OP-03, TC-UC-17, TC-API-18, TC-W-09 |
| AC-11 | TC-A-01..TC-A-08 |
| AC-12 | TC-LIVE-01 (manual, Analyst) |
| AC-13 | TC-R-01..TC-R-07, TC-E-01, TC-E-04, TC-ENV-20, TC-VA-01, TC-M-01 |

Сценарии spec → TC: 1 — TC-E-01/02, TC-W-01..04, TC-LIVE-01; 2 — TC-PS-01/03/04, TC-OP-05, TC-B-10/11; 3 — TC-DV-09..11;
4 — TC-RT-*; 5 — TC-B-02, TC-B-16; 6 — TC-ENV-*; 7 — TC-API-03, TC-W-08, TC-S-01.
Коды ошибок → TC: `AI_NOT_CONFIGURED` PS-08/10/12; `AI_BUDGET_EXCEEDED` B-02/07/13/15; `AI_RATE_LIMITED` RT-04/16;
`AI_TIMEOUT` RT-01/15; `AI_PROVIDER_ERROR` RT-03/07/08/17; `AI_INVALID_DECISION` DV-09..11; `AI_DEV_FORBIDDEN` API-05..08;
все коды в UI — W-05.

## Testability requirements for implementers

- **TR-1 Сетевой guard.** В `setupFiles` Vitest для `apps/api` (и web) и в процессе e2e-API: перехват `globalThis.fetch`/`undici`
  dispatcher (и `http(s).request`) — соединение с любым внешним хостом (минимум `api.openai.com`) бросает ошибку. Тесты
  `OpenAIProvider` подменяют SDK/`fetch` явно. Проверяется TC-R-05.
- **TR-2 Инъекция SDK-клиента.** `OpenAIProvider` получает клиент (или фабрику/`fetch`) через конструктор/DI, чтобы unit/integration
  подставляли `FAKE_SDK` с очередью ответов, ошибками нужных классов SDK и заголовком `retry-after`.
- **TR-3 Изоляция от `apps/api/.env`.** `createApp` принимает конфиг явно; `e2e-serve.mjs` задаёт `OPENAI_ENABLED=false` **и**
  `OPENAI_API_KEY=''` явно (иначе `loadEnvFile` подтянет ключ PO); global-setup тестов не грузит `.env`. Лучше — флаг/путь,
  отключающий загрузку `.env` в тестовых процессах.
- **TR-4 Запуск `main` в тесте** (TC-ENV-16/17): способ стартовать процесс API с заданным env без `.env` (временный cwd или
  `API_ENV_FILE=none`) и проверить код выхода/stderr.
- **TR-5 Время.** Инжектируемые `sleep`/часы для backoff, `retry-after`, лимита частоты и `durationMs` (фейковые таймеры).
- **TR-6 Бюджет.** Детерминированная/инжектируемая оценка `reserve`; возможность засеять `AiUsage` (`spent`) в тестовой БД;
  тестовая задержка ответа `FAKE_SDK` для гонок.
- **TR-7 Remote address.** Инжектируемый резолвер адреса клиента (или `supertest` через `X-Test-Remote-Address` **только** в тестовой
  конфигурации) для кейсов не-loopback — supertest всегда ходит с loopback.
- **TR-8 Лимит частоты в тестах/e2e.** Лимит настраивается конфигом приложения (тестовая сборка) или сбрасывается между тестами,
  чтобы integration с > 10 запросами не флейкали. Решение Q-24: платные 10/мин, всего 120/мин (mock и `status` — в общем);
  `dev-ai.spec.ts` делает < 40 запросов к dev-эндпоинтам за прогон — укладывается.
- **TR-9 testids** страницы `/dev/ai` — **финальные** (`plan-frontend.md` §9, реализованы в `apps/web/src/dev/ai/**`, каталог для
  e2e — `DA` в `e2e/support/dev-ai.ts`): `dev-ai-page`, `dev-ai-back`, `dev-ai-badge`, `dev-ai-status` (`data-state`),
  `dev-ai-status-openai` (`data-enabled`), `dev-ai-status-provider` (`data-provider`), `dev-ai-status-key` (`data-configured`),
  `dev-ai-status-error`, `dev-ai-status-retry`, `dev-ai-status-refresh`, `dev-ai-model-strategy|tactical` (`data-available`),
  `dev-ai-budget` (`data-remaining-usd`), `dev-ai-run`, `dev-ai-role` + `dev-ai-role-tactical|strategy`, `dev-ai-provider` +
  `dev-ai-provider-mock|auto` (radio, `aria-checked`), `dev-ai-paid-warning`, `dev-ai-auto-mock-hint`, `dev-ai-submit`
  (`data-pending`), `dev-ai-scenario`, `dev-ai-scenario-note`, `dev-ai-action-<id>` (`data-selected`, `aria-current`),
  `dev-ai-result` (`data-state="empty|pending|success|error"`, `aria-busy`), `dev-ai-result-action` (`data-action-id`),
  `dev-ai-result-reason|provider|model|attempts`, `dev-ai-result-duration` (`data-ms`), `dev-ai-tokens-input|cached|output|reasoning|total`
  (`data-value`), `dev-ai-cost` (`data-usd`), `dev-ai-cost-note`, `dev-ai-pricing`, `dev-ai-budget-remaining` (`data-usd`),
  `dev-ai-error` (`data-code`), `settings-dev-ai-link`. Префикс `dev-ai-` — правило отсутствия в бандле (TC-S-01).
- **TR-10 Mock-режимы сбоев** включаются только через тестовую конфигурацию `createApp` (не env production, не тело запроса).
- **TR-11 Перехват логов.** Единый логгер AI-слоя, подменяемый в тестах (или перехват `Logger` Nest), для TC-S-03 и TC-RT-19.

## Ambiguities

Все вопросы закрыты Analyst 2026-11-08. Источник: `specification.md` → «Clarifications» (Cl.) и «Decisions during IMPLEMENTATION»
(Dec.); где Cl. отсылает к плану («Прочие Q-n QA»), — `plan-backend.md` (BE §n). Ожидания затронутых TC переписаны выше.

| Q | Статус | Вопрос | Решение | Источник | Затронутые TC |
|---|---|---|---|---|---|
| Q-1 | resolved | `OPENAI_ENABLED`: допустимые значения | только `true`/`false` | Cl. Q-1..Q-4 | TC-ENV-06 |
| Q-2 | resolved | пробельный ключ; префикс `sk-` | пустое/пробельное = не задано → ошибка при `true`; префикс не проверяется | Cl. Q-1..Q-4, AM-BE-4 | TC-ENV-07 |
| Q-3 | resolved | невалидные OpenAI-переменные при `false` | не проверяются | Cl. Q-1..Q-4 | TC-ENV-12 |
| Q-4 | resolved | диапазоны timeout/retries | `OPENAI_TIMEOUT_MS` 1000..120000, `OPENAI_MAX_RETRIES` 0..5; лимит стоимости > 0 и ≤ 5 | Cl. Q-1..Q-4, AM-BE-4 | TC-ENV-10, TC-ENV-13 |
| Q-5 | resolved | `loadEnvFile` вне `config/env.ts` | нет: и `process.env`, и `loadEnvFile` — только `config/env.ts`; в `NODE_ENV=test` `.env` не грузится | Cl. «Прочие» → BE §2.4, AM-BE-3 | TC-ENV-21 |
| Q-6 | resolved | `AiUsage` для неуспешных/неплатных попыток | пишутся все попытки, включая отказ бюджета (`budget_exceeded`) | Cl. Q-6/Q-18/Q-19, AM-BE-7 | TC-PS-08, TC-B-02, TC-UC-18 |
| Q-7 | resolved | коды для сбоя `/v1/models`, 401/403 | 401/403 → 503 `AI_NOT_CONFIGURED` (`aiKeyRejected`); сбой `/v1/models` сеть/5xx → 502 `AI_PROVIDER_ERROR` | Cl. Q-7/Q-9/Q-14 | TC-PS-09, TC-PS-12, TC-RT-08 |
| Q-8 | resolved | пустой `reason`; `maxLength` в strict | trim + усечение до 300; пустой после trim → `AI_INVALID_DECISION`; в JSON-схеме без `maxLength` | Cl. Q-8/Q-23, AM-BE-5 | TC-DV-06, TC-OP-01 |
| Q-9 | resolved | `incomplete`/`refusal` | 502 `AI_INVALID_DECISION` | Cl. Q-7/Q-9/Q-14 | TC-DV-08 |
| Q-10 | resolved | невалидный id модели в `details` | нет: `details` = `{attempts, reason, estimatedCostUsd}` | Cl. «Прочие» → BE §6.2 | TC-DV-09 |
| Q-11 | resolved | повтор при невалидном решении | не повторяется | Cl. Q-11..Q-13 | TC-DV-13 |
| Q-12 | resolved | `durationMs`/usage при повторах | суммарно по попыткам | Cl. Q-11..Q-13 | TC-RT-02, TC-UC-15 |
| Q-13 | resolved | потолок `retry-after` | 10 с; больше — сразу `AI_RATE_LIMITED` с `retryAfterSeconds`, без ожидания | Cl. Q-11..Q-13, BE §5 | TC-RT-06 |
| Q-14 | resolved | `insufficient_quota` | без повторов, 502 `AI_PROVIDER_ERROR` (`errors.aiQuota`) | Cl. Q-7/Q-9/Q-14, Dec. W2 | TC-RT-09 |
| Q-15 | resolved | представление/округление стоимости | целые микро-USD (`Int`), вверх до µ$ на попытку; в API USD (6 знаков) + `*MicroUsd` (`estimatedCostMicroUsd` и др. — обязательны) | Cl. Q-15, Dec. W2, W4/W5 | TC-UC-*, TC-B-04 |
| Q-16 | resolved | порог long context | суммарный input (вкл. cached) > 272 000; множители на весь запрос; 272 000 — short | Cl. Q-16 | TC-UC-06..10 |
| Q-17 | resolved | некорректный usage | `cached` ограничивается `input`; отрицательные/нецелые → `RangeError`; нет usage → токены 0, стоимость = резерв попытки | Cl. «Прочие» → BE §4.4, `pricing.ts` | TC-UC-12 |
| Q-18 | resolved | `AiUsage` для mock | пишется, стоимость 0 | Cl. Q-6/Q-18/Q-19 | TC-UC-18 |
| Q-19 | resolved | таймаут после отправки | худшая стоимость попытки | Cl. Q-6/Q-18/Q-19, AM-BE-8, Dec. W4/W5 | TC-B-06 |
| Q-20 | resolved | mock при исчерпанном бюджете | разрешён (mock не тратит бюджет) | spec «Стоимость и бюджет», BE §10 | TC-B-10 |
| Q-21 | resolved | обход бюджета сменой `budgetKey` | dev-эндпоинт принимает только `dev-diagnostics` | Cl. AM-BE-6 | TC-B-14, TC-API-13 |
| Q-22 | resolved | порядок проверок | 404 → 403 → 400 → 429 частота → 503 → 429 бюджет → вызов | Cl. AM-BE-11 | TC-API-09 |
| Q-23 | resolved | лимит тела и длин полей | > 8 KiB / нарушение схемы → 400 `VALIDATION`; > лимита Nest → 413; `phase` ≤ 64, `objective` ≤ 500, id/type/target ≤ 64 | Cl. Q-8/Q-23, `AI_DEV_LIMITS` | TC-API-11, TC-API-14, TC-API-15 |
| Q-24 | resolved | лимит частоты | 10 платных / 120 всего в минуту на процесс → 429 `AI_RATE_LIMITED` (`aiDevRateLimited`); mock и `status` — в общем | Cl. Q-24, AM-BE-11 | TC-API-16, TC-API-17, TC-B-11, TR-8 |
| Q-25 | resolved | ошибки в браузере без платных запросов | только `page.route`/подмена; ручной QA — успех в mock; живой запрос — Analyst | Cl. Q-25 | TC-M-01, TC-E-03 |
| Q-26 | resolved | проверка моделей в `status` | один раз на процесс, кэш TTL 10 мин; при `OPENAI_ENABLED=false` сетевых вызовов нет | Cl. Q-26 | TC-PS-11, TC-E-04 |
