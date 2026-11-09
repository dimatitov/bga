# Specification — SWR-005B OpenAI API Integration & First Live AI Decision

## Business goal
Первая живая проверка Этапа F (blueprint §8.5, §9): backend отправляет тестовую игровую ситуацию со списком разрешённых действий в
OpenAI (официальный SDK, Responses API, Structured Outputs), получает строго структурированный выбор ровно одного действия,
проверяет его по списку и возвращает в dev-only интерфейс вместе с моделью, временем, usage и оценочной стоимостью. Расходы под
контролем (бюджет на сессию), секреты не покидают сервер, тесты и QA работают без платных запросов. Плюс (дополнение PO)
валидатор переменных окружения: backend не стартует с неполной конфигурацией.

## Фактическое состояние (проверено Analyst, 2026-11-08, `main` @ `d974f1a`)
- SWR-005 (= «SWR-005A» PO) доставлена: движок `core-v1`, AI-сторона авто-пасует (`packages/games/rebellion/src/ai/auto-pass.ts`),
  OpenAI нигде не используется; npm-пакета `openai` в проекте нет. AI-сервисов/провайдеров в `apps/api` нет — дублировать нечего.
- Конфигурация: `process.env` читается в `apps/api/src/app.factory.ts` (`DATABASE_URL`) и `main.ts` (`PORT`) без схемы;
  `.env` грузится `process.loadEnvFile`; `apps/api/.env.example` содержит только `DATABASE_URL`, `PORT`. `.gitignore` игнорирует
  `.env`, `.env.*` (кроме `.env.example`).
- `apps/api/.env` (PO вписал сам): заданы `OPENAI_API_KEY` (непустой, формат `sk-…`; значение агентами не читалось и не выводилось),
  `OPENAI_ENABLED=true`, `OPENAI_STRATEGY_MODEL=gpt-6.1-sol`, `OPENAI_TACTICAL_MODEL=gpt-6-luna`, `OPENAI_MAX_COST_PER_SESSION_USD=0.25`.
- **Модели доступны** ключу: `GET /v1/models/gpt-6.1-sol` → 200, `GET /v1/models/gpt-6-luna` → 200 (бесплатный запрос метаданных,
  Analyst, 2026-11-08).
- **Тарифы** (официально, https://developers.openai.com/api/docs/pricing и страницы моделей, 2026-11-08; Standard, USD за 1M токенов):

  | Модель | input | cached input | output | long context (>272K input) |
  |---|---|---|---|---|
  | `gpt-6.1-sol` | 2.00 | 0.10 | 10.00 | ×2 input/cache, ×1.5 output |
  | `gpt-6-luna` | 0.10 | 0.01 | 0.50 | ×2 input/cache, ×1.5 output |

  Обе поддерживают Responses API, `structured_outputs`, `reasoning.effort` (`gpt-6-luna` также `none`). Оплачиваются ли
  reasoning-токены как output — на странице не сказано (A-2).
- Стек фиксирован: OpenAI Responses API только на сервере (AGENTS.md); новая зависимость `openai` — допустима стеком.

## Scenarios
1. **Тест в dev-интерфейсе.** Разработчик открывает `/dev/ai` (только dev-сборка) → видит статус (провайдер, включён ли OpenAI,
   модели и их доступность, бюджет: потрачено/лимит) и список тестовых действий → «Тестировать AI» → видит выбранное действие,
   объяснение, модель, время ответа, токены (input/cached/output/reasoning), оценочную стоимость и остаток бюджета.
2. **Mock-режим.** `OPENAI_ENABLED=false` (или явный выбор mock в запросе) → `MockAIProvider` отвечает детерминированно, стоимость 0,
   бюджет не тратится — так работают тесты, e2e и QA.
3. **Недопустимый ответ.** Модель/мок вернула id вне списка или не-JSON → 502 `AI_INVALID_DECISION`, ничего не выполняется,
   попытка учтена в usage.
4. **Сбои.** Таймаут/сеть/5xx/429 → ограниченные повторы с backoff → при исчерпании 504/502/429 с понятным сообщением.
5. **Бюджет.** Накопленная стоимость по ключу бюджета + резерв на худший случай ≥ лимита → 429 `AI_BUDGET_EXCEEDED` **без** вызова
   OpenAI; UI показывает «бюджет исчерпан».
6. **Неполная конфигурация.** Не задана/невалидна обязательная переменная → backend не стартует, сообщение перечисляет имена
   переменных (без значений).
7. **Production.** В production-сборке/режиме dev-эндпоинта нет (404), страницы `/dev/ai` и кода диагностики в бандле нет.

## Contract (заморожен до параллельной работы; поправки — через Analyst)

### Окружение (`apps/api/src/config/env.ts`, Zod) — единственное чтение `process.env` в `apps/api/src`
| Переменная | Правило |
|---|---|
| `DATABASE_URL` | обязательна, непустая |
| `PORT` | целое 1..65535, по умолчанию 3000 (описано в схеме) |
| `NODE_ENV` | `development` \| `test` \| `production`, по умолчанию `development` |
| `OPENAI_ENABLED` | обязательна, `true` \| `false` |
| `OPENAI_API_KEY` | обязательна и непустая при `OPENAI_ENABLED=true` |
| `OPENAI_STRATEGY_MODEL`, `OPENAI_TACTICAL_MODEL` | обязательны и непустые при `OPENAI_ENABLED=true` |
| `OPENAI_MAX_COST_PER_SESSION_USD` | обязательна при `OPENAI_ENABLED=true`, число > 0 |
| `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES` | необязательны: по умолчанию 30000 и 2 (диапазоны в схеме) |
- Ошибка: одно сообщение «Invalid environment: <VAR>: <причина>; …» — только имена и причины, никаких значений. `main.ts` выходит
  с кодом 1; `createApp` в тестах получает конфиг явно (без чтения `.env`).
- `apps/api/.env.example` — все переменные схемы (ключ пустой, `OPENAI_ENABLED=false` по умолчанию); тест сверяет ключи `.env.example`
  со схемой. e2e/тесты задают окружение явно (`OPENAI_ENABLED=false`).

### AI provider (`apps/api/src/ai/**`, только сервер; SDK `openai` импортируется **только** здесь — ESLint)
```ts
type AIModelRole = 'strategy' | 'tactical';
interface AIAction { id: string; type: string; target?: string }           // тестовые действия, не правила Rebellion
interface AIDecisionContext {
  budgetKey: string;              // ключ сессии для бюджета (dev: 'dev-diagnostics' по умолчанию)
  role: AIModelRole;              // → модель из env
  faction: 'rebels' | 'empire'; phase: string; objective: string;
  availableActions: AIAction[];   // 2..10, уникальные id
}
interface AIUsage { inputTokens; cachedInputTokens; outputTokens; reasoningTokens | null; totalTokens }
interface AIDecisionResult {
  selectedActionId: string; reason: string;
  provider: 'openai' | 'mock'; model: string; durationMs: number; attempts: number;
  usage: AIUsage; estimatedCostUsd: number; pricingVersion: string;
}
interface AIProvider { readonly id: 'openai' | 'mock'; makeDecision(ctx: AIDecisionContext): Promise<AIDecisionResult> }
```
- `OpenAIProvider`: официальный SDK, `responses.create` с `text.format = { type: 'json_schema', strict: true, schema }`, где
  `schema = { selectedActionId: enum(ids контекста), reason: string ≤ 300 }`, `additionalProperties: false`; `max_output_tokens`
  ограничен (значение — в плане BE); таймаут; повторы только на сеть/таймаут/429/5xx, не более `OPENAI_MAX_RETRIES`, с backoff
  (уважать `retry-after`); каждый вызов логируется: провайдер, модель, попытка, длительность, токены, стоимость, статус — **без**
  ключа и без текста промпта.
- `MockAIProvider`: детерминированный (первое действие или по правилу из плана), стоимость 0; режимы сбоев для тестов
  (`invalid-action`, `malformed`, `timeout`, `rate-limit`, `network`) — только в тестовой конфигурации, не из публичного запроса.
- Выбор провайдера — конфигурацией: `OPENAI_ENABLED=true` → OpenAI (запрос может явно попросить `mock`), иначе только mock.
- **Валидация решения** (сервис, не провайдер): Zod-схема ответа + `selectedActionId ∈ availableActions`; иначе 502
  `AI_INVALID_DECISION`. Модель никогда не «изобретает» действие; ничего не выполняется (игровое состояние не трогается вовсе).
- Проверка доступности моделей: `GET /v1/models/{id}` при первом использовании/в статусе, кэш в памяти; недоступна → 503
  `AI_NOT_CONFIGURED` (ключ ошибки `ai.modelUnavailable`).

### Стоимость и бюджет
- Тарифы — конфигурация в коде `apps/api/src/ai/pricing.ts` (таблица выше, `pricingVersion: 'openai-2026-11-08'`, ссылка на источник).
  Оценка: `(input − cached)·in + cached·cachedIn + output·out` (reasoning входит в output — A-2), long-context множители по порогу.
  Неизвестная модель → 503 (стоимость нельзя оценить → платный запрос не отправляется).
- Учёт — таблица SQLite `AiUsage` (Prisma, новая миграция): `id, budgetKey, provider, model, role, status, attempts, inputTokens,
  cachedInputTokens, outputTokens, reasoningTokens?, estimatedCostUsd, durationMs, errorCode?, createdAt`. Без текста промпта/ответа.
- Бюджет по `budgetKey`: до вызова `spent + reserve ≥ limit` → 429 `AI_BUDGET_EXCEEDED` без запроса к OpenAI, где `reserve` —
  оценка худшего случая (входные токены по длине промпта с запасом + `max_output_tokens`) × (повторы + 1). Mock не тратит бюджет.
  Параллельные запросы по одному ключу не должны вместе превысить лимит (сериализация по ключу или резервирование — план BE).
- Итоговая стоимость в ответе — **оценка** по usage; UI подписывает «оценка; итог по счёту OpenAI может отличаться».

### API (dev-only; модуль регистрируется только при `NODE_ENV !== 'production'`; в production → 404)
| Method | Path | Описание |
|---|---|---|
| GET | `/api/dev/ai/status` | `{ openaiEnabled, provider, keyConfigured: boolean, models: { strategy: {id, available|null}, tactical: {...} }, budget: { budgetKey, spentUsd, limitUsd, remainingUsd } }` — без ключа |
| POST | `/api/dev/ai/test-decision` | body `{ scenario: { faction, phase, objective, availableActions }, role?: 'tactical'\|'strategy', provider?: 'auto'\|'mock', budgetKey? }` (strict Zod, лимиты длины) → `200 { decision: AIDecisionResult, budget }` |
- Защита от публичных платных запросов: только non-production; принимаются только запросы с loopback-адреса (иначе 403
  `AI_DEV_FORBIDDEN`); строгие лимиты тела; бюджет; простой лимит частоты (например, ≤ 10 запросов/мин на процесс).
- Новые коды ошибок платформы (`@bga/platform` errors, единый формат `{ ok:false, error }`): `AI_NOT_CONFIGURED` (503),
  `AI_BUDGET_EXCEEDED` (429), `AI_RATE_LIMITED` (429), `AI_TIMEOUT` (504), `AI_PROVIDER_ERROR` (502), `AI_INVALID_DECISION` (502),
  `AI_DEV_FORBIDDEN` (403); сообщения i18n ru/en. В `details` — только безопасные поля (например, `remainingUsd`, `attempts`).

### Frontend (dev-only)
- Маршрут `/dev/ai` и страница диагностики подключаются только при `import.meta.env.DEV` (или `VITE_E2E`), в production-бандле их
  нет (`check:bundle`: строки эндпоинта и testid диагностики отсутствуют). Не основной игровой интерфейс; ссылки из каталога нет
  (только из Настроек в dev, по желанию FE).
- Показывает: статус подключения, провайдер, модели (strategy/tactical, доступность), выбор роли/провайдера (mock для бесплатной
  проверки), список тестовых действий (тестовый сценарий из PO, помечен «тестовые данные, не правила Rebellion»), кнопку
  «Тестировать AI» (блокируется на время запроса), результат (действие, объяснение, модель, время, токены, оценочная стоимость,
  остаток бюджета), ошибки (`role=alert`) по кодам выше. ru/en.

## Acceptance criteria (testable)
- **AC-01:** Backend проверяет окружение одной Zod-схемой при старте: отсутствующая/невалидная обязательная переменная (включая
  условно обязательные при `OPENAI_ENABLED=true`) → процесс не стартует, сообщение называет переменные без значений; `.env.example`
  совпадает со схемой (тест); `process.env` в `apps/api/src` читается только в `config/env.ts`.
- **AC-02:** Провайдер выбирается конфигурацией (`OPENAI_ENABLED`), модели — из `OPENAI_STRATEGY_MODEL`/`OPENAI_TACTICAL_MODEL`;
  доступность моделей проверяется через API до использования; недоступная модель/неизвестный тариф → 503 без платного запроса.
- **AC-03:** `OpenAIProvider` использует официальный SDK и Responses API со строгой JSON-схемой (enum id действий); `MockAIProvider`
  детерминирован и бесплатен; оба реализуют `AIProvider`.
- **AC-04:** Выбранное действие принимается, только если его id есть в `availableActions`; ответ вне списка или не по схеме → 502
  `AI_INVALID_DECISION`, ничего не выполняется (тесты на mock-режимах и на подменённом SDK).
- **AC-05:** Таймауты, сетевые ошибки, 5xx и 429 обрабатываются: не более `OPENAI_MAX_RETRIES` повторов с backoff, затем
  соответствующий код ошибки; бесконечных повторов нет (тест на счётчик попыток).
- **AC-06:** Каждый запрос фиксирует длительность, модель, попытки, токены (input/cached/output/reasoning, если есть) и оценочную
  стоимость по конфигурации тарифов; запись сохраняется в `AiUsage` и возвращается клиенту.
- **AC-07:** Бюджет по ключу сессии: при `spent + reserve ≥ limit` новый запрос → 429 `AI_BUDGET_EXCEEDED` без обращения к OpenAI
  (тест: шпион провайдера не вызван); параллельные запросы не превышают лимит; mock бюджет не тратит.
- **AC-08:** `POST /api/dev/ai/test-decision` и `GET /api/dev/ai/status` работают в development и отсутствуют в production (404);
  не-loopback → 403; тело строго валидируется; ответы не содержат ключ и секреты.
- **AC-09:** Dev-страница `/dev/ai` показывает статус, модель, список тестовых действий, кнопку «Тестировать AI», выбранное действие,
  объяснение, время, токены и оценочную стоимость; ошибки и загрузка обработаны; в production-бандле её нет (`check:bundle`).
- **AC-10:** Секреты не попадают в клиент, логи, ответы, отчёты и Git: проверки — скан бандла (`sk-`, `OPENAI_API_KEY`), перехват
  логов в тестах, `.gitignore`, grep артефактов задачи.
- **AC-11:** Архитектура: SDK `openai` импортируется только в `apps/api/src/ai/**` (ESLint); game-core и `@bga/platform` не зависят
  от OpenAI; AI-слой не меняет игровое состояние.
- **AC-12:** Выполнен минимум один реальный запрос к OpenAI через dev-интерфейс: ответ по схеме, действие из списка; в `report.md`
  записаны фактические модель, токены, стоимость и время первого успешного запроса.
- **AC-13:** `pnpm verify` завершается с кодом 0 (unit, integration, e2e в mock-режиме без сетевых вызовов к OpenAI); QA предоставляет
  результаты браузерного тестирования (скриншоты).

## Assumptions
- A-1: Тестовая ситуация — изолированный сценарий из запроса PO (не правила Rebellion); подключение AI к ходу партии — вне задачи.
- A-2: reasoning-токены входят в `output_tokens` usage Responses API и оплачиваются как output (общепринятая схема OpenAI; на странице
  тарифов явно не сказано) — оценка консервативна; расхождение со счётом допускается и подписывается в UI.
- A-3: Ключ бюджета dev-диагностики — `dev-diagnostics` (лимит `OPENAI_MAX_COST_PER_SESSION_USD`); для будущих игровых сессий ключ =
  `sessionId`.
- A-4: Реальный запрос в рамках задачи делает Analyst на BUSINESS_VALIDATION (≤ несколько центов, роль `tactical` по умолчанию,
  один запрос `strategy` по желанию); QA и тесты используют только mock.
- A-5: Версия `openai` SDK — опубликованная не позже чем за две недели до начала работ (стабильность), точная версия фиксируется в
  `package.json` (решает BE-lead).
- A-6: Новая таблица `AiUsage` — первая миграция после SWR-004; перед ней Analyst делает копию `apps/api/prisma/dev.pre-swr005b.db`.

## Risks
- Утечка ключа в логи/ошибки SDK → обёртка ошибок без исходных сообщений SDK с заголовками, перехват логов в тестах.
- Неконтролируемые расходы при гонке/повторах → резерв худшего случая, сериализация по ключу, лимит попыток и частоты.
- Изменение тарифов → `pricingVersion` + источник в коде, подпись «оценка» в UI.
- Тесты, случайно идущие в сеть → `OPENAI_ENABLED=false` в тестовой среде + шпион `fetch`/SDK, падающий при сетевом вызове.

## Out of scope
См. `request.md` → `out_of_scope` (AI Commander, автоигра раунда, боевые решения, миссии, новые правила, AWS, публичный доступ).

## PO test scenario (дословно из запроса PO, 2026-11-08; тестовые данные, не правила Rebellion)
```json
{
  "faction": "empire",
  "phase": "command",
  "objective": "Strengthen imperial control",
  "availableActions": [
    { "id": "action-1", "type": "MOVE_FLEET", "target": "corellia" },
    { "id": "action-2", "type": "RECRUIT", "target": "coruscant" },
    { "id": "action-3", "type": "PASS" }
  ]
}
```
Ожидаемый формат ответа модели: `{ "selectedActionId": "action-1", "reason": "Improves strategic positioning" }`. Это сценарий по
умолчанию на dev-странице (Q-FE-2).

## Clarifications (Analyst, 2026-11-08) — ответы на `plan-backend.md` (AM-BE, Q-BE), `plan-frontend.md` (Q-FE), `test-cases.md` (Q-n)
| # | Решение |
|---|---|
| AM-BE-1..AM-BE-11 | **Приняты** все. В частности: AM-BE-6 — `budgetKey` принимает только `dev-diagnostics` (закрывает Q-21: новый ключ не даёт свежий лимит); AM-BE-10 — SDK `openai@6.49.0` (все 7.x требуют Node ≥ 22, проект на Node 20.19.5; переход на Node 22 — отдельное решение PO, follow-up); AM-BE-3 — в `NODE_ENV=test` `.env` не грузится и `OPENAI_ENABLED=true` запрещён; AM-BE-11 — лимиты 10 платных / 120 всего запросов в минуту → 429 `AI_RATE_LIMITED`. |
| Q-BE-1 | Бюджет `dev-diagnostics` накапливается в `dev.db` бессрочно; сброс — только документированной ручной командой (скрипт в `apps/api/scripts`, описан в `docs/architecture/application.md`). |
| Q-BE-2 | `locale` не добавляем; `reason` от модели — на английском, UI подписывает. |
| Q-FE-1 | Да: Zod-схемы/типы dev-AI DTO (`AiDevStatus`, `AiTestDecisionRequest/Response`, `AIUsage`, коды ошибок) экспортируются из `@bga/platform` (`src/ai-dev.ts`, владелец W2); web не дублирует. |
| Q-FE-3 | Гейт страницы — только `import.meta.env.DEV` (без `VITE_E2E`); e2e идёт на dev-сервере. |
| Q-FE-4 | `scripts/check-web-bundle.mjs` (+ тест) — FE-воркер, включая правила секретов AC-10 и module-check `apps/web/src/dev/**`. |
| Q-FE-5 | Строки `settings:dev.*` в production-бандле допустимы (сама ссылка рендерится только в DEV). |
| Q-FE-6 | messageKeys плоские `errors.ai*` (AM-BE-2): `aiNotConfigured`, `aiModelUnavailable`, `aiBudgetExceeded`, `aiRateLimited`, `aiTimeout`, `aiProviderError`, `aiQuota`, `aiInvalidDecision`, `aiDevForbidden` (+ `code.AI_*`); W2 добавляет ru/en в web-локали в той же фазе, что и коды. |
| Q-1..Q-4 | `OPENAI_ENABLED` — только `true`/`false`; пустые/пробельные значения = не задано; при `false` OpenAI-переменные не проверяются; `OPENAI_TIMEOUT_MS` 1000..120000, `OPENAI_MAX_RETRIES` 0..5; `OPENAI_MAX_COST_PER_SESSION_USD` > 0 и ≤ 5 (AM-BE-4). |
| Q-6, Q-18, Q-19 | В `AiUsage` пишутся все попытки: успешные, неуспешные, mock (стоимость 0) и отказы бюджета (AM-BE-7); попытка, прерванная таймаутом после отправки, учитывается по худшей стоимости попытки (AM-BE-8). |
| Q-7, Q-9, Q-14 | 401/403 от OpenAI → 503 `AI_NOT_CONFIGURED`; сбой `GET /v1/models` (сеть/5xx) → 502 `AI_PROVIDER_ERROR`; ответ `incomplete`/`refusal`/не по схеме → 502 `AI_INVALID_DECISION`; `insufficient_quota` → 502 `AI_PROVIDER_ERROR` (`errors.aiQuota`), без повторов. |
| Q-8, Q-23 | `reason` обрезается (trim) и усекается до 300 символов (AM-BE-5); пустой после trim → `AI_INVALID_DECISION`. Нарушение схемы/лимитов тела → 400 `VALIDATION`; тело > лимита Nest → 413. |
| Q-11..Q-13 | Невалидное решение не повторяется (без лишних трат); `durationMs` — суммарно по попыткам, usage и стоимость суммируются; `retry-after` ограничен 10 с. |
| Q-15 | Стоимость хранится целыми микро-USD (`Int`), считается без float-ошибок; в API — USD (число, 6 знаков) и микро-USD. |
| Q-16 | Порог long context: суммарный input (включая cached) > 272000 токенов → множители (×2 input/cache, ×1.5 output) на весь запрос; 272000 — ещё short. |
| Q-24 | Лимит частоты считается и для mock и `status` (общий 120/мин), платные — отдельно 10/мин; e2e укладывается. |
| Q-25 | Ошибки в браузере (e2e и ручной QA) воспроизводятся через `page.route` / подмену ответа; ручной QA проверяет успех в mock-режиме; живой запрос — только Analyst (TC-LIVE-01). |
| Q-26 | Доступность моделей проверяется один раз на процесс и кэшируется (TTL 10 мин), не при каждом открытии страницы. |
| Прочие Q-n QA | Решаются планом BE (`plan-backend.md`) там, где он конкретен; при расхождении — этот раздел. |

## Decisions during IMPLEMENTATION (Analyst, 2026-11-08)
- **W2 accepted:** platform DTO generic (`scenario.side: string` + factory `createAiTestDecisionRequestSchema`); wire-поле `scenario.faction: 'rebels'|'empire'` (тестовые данные dev-диагностики) объявляют сами потребители — `apps/api/src/dev/ai/**` (W6) и `apps/web/src/dev/ai/**` (FE) — через фабрику; общий generic-схема как wire не используется. Поля micro-USD (`spentMicroUsd`, `limitMicroUsd`, `remainingMicroUsd`, `estimatedCostMicroUsd`) обязательны в ответах (W6 заполняет, FE может опираться). messageKeys — 12 ключей W2 (в т.ч. `aiQuota` для `insufficient_quota`, `aiNotConfigured` при выключенном OpenAI, `aiPricingUnknown`, `aiKeyRejected`, `aiDevRateLimited`); web `errors.json` уже содержит тексты — FE не дублирует.
- **FE-AI accepted:** testids `dev-ai-*` (план FE §9) — финальные, QA обновляет e2e/скриншоты; дополнительное `data-state="error"` карточки результата и единая таблица токенов — приняты; поле `details.retryAfterSeconds` (план BE §6.2) — W6 эмитит именно его.
- **W4/W5 accepted:** стоимость округляется вверх до целого micro-USD на попытку; любой клиентский таймаут считается по худшей стоимости попытки (AM-BE-8); `ModelAvailabilityService.check()` с 4 состояниями (`availabilityFlag()` для статуса, `requireAvailable()` для решения); отказ бюджета — исключение `BudgetExceededError`, W6 мапит в 429 и сам пишет строку `budget_exceeded`; бюджет гарантирован в пределах одного процесса API (known issue).
- **QA e2e (115/116) — решения:** D-1 (major, блокирует AC-10/AC-13): Prisma Client при импорте сам загружает `apps/api/.env` в `process.env` тестовых процессов (обход правила AM-BE-3) — исправляет W6: явное обнуление всех `OPENAI_*` в `e2e-serve.mjs` и в setup Vitest до импорта Prisma + тесты; D-2 (дубль фразы в алерте бюджета) и D-3 (моноширинные слоты с кириллицей → serif) — frontend-lead на INTEGRATION; глобальный сетевой guard для всех e2e не требуется (на стороне API защищает `OPENAI_ENABLED=false` + запрет `true` в test-режиме); скриншоты SWR-005B перегенерирует QA после фикса D-1.
- **W6 accepted:** правки W6 вне брифа приняты — исключение `apps/api/src/dev/**` из скана игровых слов (`architecture.int.test.ts`, по AM-BE-1) и новые dev-маршруты в таблице `routes.int.test.ts`; тело > 8192 байт → 413 `VALIDATION` (`payload_too_large`) по Q-23; порядок проверок POST: 404 → 403 → 413/400 → 429 dev → 503/502 → 429 бюджет → вызов модели. D-1 исправлен: `buildE2eEnv` (все `OPENAI_*` = ''), первый setupFile Vitest обнуляет `OPENAI_*`, `main.ts` импортирует Prisma только после валидации конфига; дочерний `prisma migrate deploy` в global-setup тоже обнулить — backend-lead на INTEGRATION.
- **CODE_REVIEW round 1 (changes_requested) — решения Analyst:** F-1 (major) — процесс Playwright (через `e2e/support/seed.ts` → `@prisma/client`) получает реальные `OPENAI_*` из `apps/api/.env`: обнулить все `OPENAI_*` (тот же список, `OPENAI_ENABLED=false`) в начале `playwright.config.ts` до любых импортов + регрессионная проверка только по именам (QA); F-2 — сетевая ошибка, при которой запрос мог дойти до OpenAI, тоже учитывается по худшей стоимости попытки (консервативно, как таймаут); F-3 — верхняя оценка входных токенов = байты UTF-8 + запас (каждый токен ≥ 1 байта) вместо bytes/2; F-4 — скрипт `start` (`node dist/main.js`) запускается с `NODE_ENV=production`, умолчание схемы остаётся `development` (для `pnpm dev`); F-6 — убрать недостижимую запись статуса; F-7 — исправить комментарий в `reset-ai-budget.mjs` (Prisma читает `.env`). F-5 (nit) — не меняем. Исполнители: backend-lead (F-2..F-4, F-6, F-7), qa-lead (F-1).
