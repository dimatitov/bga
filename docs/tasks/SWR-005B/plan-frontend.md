# Plan — frontend (SWR-005B / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-08 · **Статус:** design only — кода, установок и правок вне этого файла нет.
**Входы:** `specification.md` (Contract → «API», «Frontend (dev-only)», AC-08..AC-10, A-1..A-4), `request.md`,
`docs/product/ux-decisions.md` §5, §6, §8, §9, §14, текущий код `apps/web/src/app/router.tsx`, `shared/api/{http,errors}.ts`,
`shared/i18n/{i18n,translateError,locales.test}.ts`, `shared/ui/ChoiceGroup.tsx`, `app/pages/SettingsPage.tsx`,
`app/providers/queryClient.ts`, `apps/web/vite.config.ts`, `playwright.config.ts`, `scripts/check-web-bundle.mjs` (+ test),
`eslint.config.mjs` (B-8/B-9). Формат — `docs/tasks/SWR-005/plan-frontend.md`.
**`plan-backend.md` на момент написания отсутствует** → поля wire, нужные UI, записаны по контракту спецификации как
предположения **W-1..W-9** (§2). Если backend выберет другую форму, меняется только `apps/web/src/dev/ai/api.ts`
(схемы + функции запросов): компоненты читают данные только через хуки `queries.ts`.

---

## 0. Инварианты (для FE-воркера)

1. **Ничего из диагностики в production-бандле.** Весь код страницы живёт в `apps/web/src/dev/**` и подключается только
   динамическим `import()` под литеральной проверкой `import.meta.env.DEV` (§3). Никакой другой модуль не импортирует
   `@/dev/**` статически. Путь `/dev/ai`, эндпоинты и testid `dev-ai-*` не встречаются вне `src/dev/**`, кроме
   двух мест под тем же `DEV`-guard (маршрут в `router.tsx`, ссылка в `SettingsPage.tsx`).
2. **UI ничего не решает за сервер.** Провайдер, модель, доступность модели, бюджет, «хватит ли денег», допустимость
   выбранного действия — только из ответов `GET /status` и `POST /test-decision`. UI не считает стоимость, резерв и остаток.
3. **Платный запрос — только по явному клику.** Нет запроса при монтировании, нет автоповтора мутации (у клиента
   `mutations.retry: 0` уже по умолчанию — явно продублировать в `useMutation`), двойной клик не создаёт второй запрос.
4. **Секретов на клиенте нет:** web не знает ключа и не получает его; ответ статуса — только `keyConfigured: boolean`.
   Литералов `OPENAI_API_KEY`/`sk-…` в коде web нет (их ловит `check:bundle`, §3.3).
5. Тестовый сценарий — **данные, а не правила Rebellion** (A-1): живёт в `dev/ai/testScenario.ts`, помечен в UI,
   не импортирует ничего из игровых пакетов и не касается `games/**`.
6. Литералов UI-текста в JSX нет (ESLint), testid не зависят от языка, все тексты страницы — ru/en.

---

## 1. Затрагиваемая структура

```text
apps/web/src/
  dev/ai/                                  NEW  dev-only фича «Диагностика AI» (весь код — только в lazy-чанке)
    route.tsx                                   lazy-модуль маршрута: регистрирует i18n `devAi`, экспортирует Component
    DevAiPage.tsx                               страница: сетка, заголовок h1, композиция секций
    api.ts                                      Zod-схемы wire (или реэкспорт из @bga/platform, Q-FE-1) + fetchStatus/postTestDecision
    queries.ts                                  devAiKeys, useDevAiStatus (query), useTestDecision (mutation)
    testScenario.ts                             DEV_AI_TEST_SCENARIO (тестовый сценарий PO, Q-FE-2)
    format.ts                                   formatUsd / formatDurationMs / formatTokens (Intl по языку)
    errorText.ts                                aiErrorText(t, error) → { title, text, code } (§6)
    i18n.ts                                     registerDevAiI18n(): i18n.addResourceBundle('ru'|'en', 'devAi', …)
    components/
      StatusCard.tsx                            статус: OpenAI вкл/выкл, провайдер, ключ задан, модели, бюджет
      ModelRow.tsx                              строка модели: роль · id · доступность (текст + иконка)
      RunControls.tsx                           ChoiceGroup «Роль», ChoiceGroup «Провайдер», предупреждение, кнопка
      ScenarioList.tsx                          фракция/фаза/цель + список действий, пометка «тестовые данные»
      ResultCard.tsx                            результат: действие, объяснение, провайдер/модель, время, токены, стоимость, бюджет
      TokenTable.tsx                            токены input/cached/output/reasoning/total
      AiErrorAlert.tsx                          MUI Alert role=alert по коду ошибки
    locales/{ru,en}.json                        namespace `devAi` (НЕ в eager-glob `src/locales/*`, §7)
    DevAiPage.test.tsx                     NEW  §11 T-1..T-12
    devAiRoute.test.tsx                    NEW  §11 T-13..T-14 (регистрация маршрута в DEV / отсутствие при DEV=false)
    format.test.ts                         NEW  §11 T-15
    locales.test.ts                        NEW  §11 T-16 (паритет ru/en devAi, без кириллицы в en)
  app/router.tsx                                + devRoutes под `import.meta.env.DEV` (lazy, §3.1)              (S)
  app/pages/SettingsPage.tsx                    + секция «Для разработчиков» со ссылкой, только DEV (§3.2)        (S)
  app/pages/SettingsPage.test.tsx               + кейс ссылки в DEV (T-17)                                        (S)
  locales/{ru,en}/settings.json                 + `dev.title`, `dev.aiLink`                                        (S)
  locales/{ru,en}/errors.json                   + `code.AI_*` (7 кодов) + messageKey-тексты от BE (§6)            (S)
scripts/check-web-bundle.mjs                    + правила dev-ai/секретов + запрет модулей `apps/web/src/dev/**`  (S, Q-FE-4)
scripts/check-web-bundle.test.mjs               + тесты новых правил (T-18)                                        (S, Q-FE-4)
```

Не меняются: `shared/api/**` (http-слой подходит как есть), `shared/i18n/translateError.ts`, `platform/paths.ts`
(путь `/dev/ai` нельзя класть в `paths` — он попал бы в production-бандл), `vite.config.ts`, `vite-env.d.ts`, `games/**`,
`packages/**` (изменения `@bga/platform` errors — зона BE, §2 W-8).

---

## 2. Wire: предположения FE (сверить с `plan-backend.md`)

| ID | Предположение | Источник |
|---|---|---|
| W-1 | `GET /api/dev/ai/status` → `200 { openaiEnabled: boolean, provider: 'openai'\|'mock', keyConfigured: boolean, models: { strategy: { id: string\|null, available: boolean\|null }, tactical: {…} }, budget: { budgetKey, spentUsd, limitUsd, remainingUsd } }`. `provider` — провайдер по умолчанию для `provider: 'auto'`. При `OPENAI_ENABLED=false` `id` может быть `null`, `limitUsd` — `null` (UI показывает «—»). | spec API |
| W-2 | `available: null` = «не проверялась»; `false` = недоступна; `true` = доступна. Статус может инициировать проверку `GET /v1/models` на сервере (бесплатно); UI не вызывает его повторно сам (staleTime 30 с, без refetch on focus). | spec AI provider |
| W-3 | `POST /api/dev/ai/test-decision` body `{ scenario: { faction, phase, objective, availableActions: { id, type, target? }[] }, role: 'tactical'\|'strategy', provider: 'auto'\|'mock' }`; FE **не** шлёт `budgetKey` (сервер берёт `dev-diagnostics`, A-3). | spec API, A-3 |
| W-4 | `200 { decision: AIDecisionResult, budget: <как W-1 budget> }`; `AIDecisionResult` — ровно интерфейс спецификации (`selectedActionId, reason, provider, model, durationMs, attempts, usage{inputTokens, cachedInputTokens, outputTokens, reasoningTokens\|null, totalTokens}, estimatedCostUsd, pricingVersion`). | spec Contract |
| W-5 | Ошибки — единый `{ ok:false, error:{ code, messageKey, details? } }` (`ErrorResponseSchema`); коды из §6. | spec API |
| W-6 | `details` безопасны и необязательны: `AI_BUDGET_EXCEEDED` → `{ remainingUsd, limitUsd }`; `AI_RATE_LIMITED` → `{ retryAfterSec? }`; `AI_TIMEOUT`/`AI_PROVIDER_ERROR`/`AI_INVALID_DECISION` → `{ attempts? }`. UI работает и без них (тексты без чисел как fallback). | spec «В details — только безопасные поля» |
| W-7 | В production эндпоинты отвечают 404 (`NOT_FOUND`) — UI до них не доберётся (маршрута нет), но при рассинхроне dev-web ↔ prod-api страница показывает состояние «недоступно» (§5.3). | spec AC-08 |
| W-8 | BE добавляет 7 кодов в `ErrorCodeSchema` + `ERROR_HTTP_STATUS` и новые `messageKey` в `ERROR_MESSAGE_KEYS` (`@bga/platform`). Без этого `toApiError` не распарсит тело (strict enum) и UI покажет общий `HTTP_ERROR`. Существующий тест `shared/i18n/locales.test.ts` потребует тексты `errors:code.<CODE>` и `errors:<messageKey>` ru/en — их добавляет FE-воркер. | `packages/platform/src/errors.ts`, `locales.test.ts` |
| W-9 | Zod-схемы ответов: предпочтительно экспорт из `@bga/platform` (`DevAiStatusResponseSchema`, `DevAiTestDecisionRequestSchema`, `DevAiTestDecisionResponseSchema`) — одна правда для api и web (Q-FE-1). Fallback — локальные схемы в `dev/ai/api.ts`, зеркало W-1..W-4. Схемы, импортированные только lazy-чанком, в основной бандл не попадают (tree-shaking; имена полей там безопасны в любом случае). | AGENTS.md (Zod в platform) |

---

## 3. Dev-only: как именно маршрута нет в production

### 3.1 Маршрут (`app/router.tsx`)

```ts
// Dev diagnostics (SWR-005B): the literal `import.meta.env.DEV` is replaced by `false` in `vite build`, the ternary folds
// and the dynamic import is dropped — no chunk, no path string in the production bundle (checked by `check:bundle`).
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/dev/ai', lazy: () => import('@/dev/ai/route') }]
  : [];
// … PlatformLayout.children: [...platformRoutes, ...devRoutes, notFound]  (devRoutes — до `*`)
```

- `route.tsx` экспортирует `Component` (react-router `lazy` route module) и при импорте вызывает `registerDevAiI18n()`.
  Внутри `PlatformLayout` → есть шапка, skip-link, `RouteFocus` (фокус на h1 после загрузки lazy-чанка), `RouteError` для
  упавшего чанка.
- **Только `import.meta.env.DEV`, без `VITE_E2E`** (D-FE-1). Обоснование: Playwright поднимает web через `vite` dev-сервер
  (`playwright.config.ts` → `pnpm --filter @bga/web run dev`), где `DEV === true`, так что e2e и QA страницу видят.
  `VITE_E2E` — переменная, которую можно случайно задать при `vite build`, и тогда диагностика окажется в production-сборке;
  `DEV` в `vite build` всегда `false`. Спецификация допускает «DEV (или VITE_E2E)» — выбираем строгий вариант (Q-FE-3).
- Проверка именно литерала: нельзя выносить условие в функцию/константу из другого модуля (`isDevBuild()`), иначе
  свёртка не гарантирована. Комментарий в коде + проверка `check:bundle` (§3.3).
- Прямой переход на `/dev/ai` в production-сборке → существующий `NotFoundPage` (маршрута нет).

### 3.2 Ссылка из Настроек (по желанию FE — делаем, D-FE-2)

`SettingsPage` — новая последняя секция, отрисовывается только `{import.meta.env.DEV ? (<section>…</section>) : null}`:
заголовок h2 «Для разработчиков» и `Link component={RouterLink} to="/dev/ai" data-testid="settings-dev-ai-link"`
«Диагностика AI (dev)». Литерал пути и testid — только внутри guard (сворачиваются). Тексты `settings:dev.*` останутся
в production-бандле как неиспользуемые строки i18n — безвредно (нет эндпоинтов/секретов); если Analyst хочет и их убрать —
перенести в `devAi` и грузить вместе с секцией lazy (Q-FE-5). Из каталога и шапки ссылок нет (spec).

### 3.3 Что проверяет `check:bundle` (`scripts/check-web-bundle.mjs`)

Новые правила текстового скана `apps/web/dist` (функция `forbiddenFromScenario` → вынести общий список в
`staticRules()` или дописать в начало массива; идентификаторы правил стабильны для логов QA):

| rule id | regex | Что ловит |
|---|---|---|
| `dev-ai-path` | `/\/dev\/ai\b/` | маршрут `/dev/ai`, эндпоинты `/api/dev/ai/status`, `/api/dev/ai/test-decision` |
| `dev-ai-testid` | `/\bdev-ai-[a-z]/` | любой testid диагностики (`dev-ai-submit`, `settings-dev-ai-link`, …) — значит, guard не свернулся |
| `openai-key-name` | `/OPENAI_API_KEY/` | имя переменной окружения ключа (AC-10) |
| `openai-key-value` | `/\bsk-[A-Za-z0-9_-]{20,}/` | значение, похожее на ключ OpenAI (AC-10) |

И проверка состава модулей (уже есть сборка со sourcemaps): **любой source вида `apps/web/src/dev/…` в production-бандле →
`FORBIDDEN module`, exit 1** (`forbiddenWebModules(sources)` по regex `/(?:^|\/)apps\/web\/src\/dev\//`). Это самое сильное
доказательство: даже если строки переименованы минификатором, модуль страницы в сборку не попал. Пустой результат для
`dev` не считается ошибкой настройки (в отличие от игровых модулей).

Не запрещаются: коды `AI_*` и их тексты в `errors.json` — они обязаны быть в основном бандле (`ErrorCodeSchema` в
`@bga/platform`, W-8), секретов не несут.

Негативная проверка того, что правила действительно работают: unit-тесты скрипта на синтетическом содержимом (T-18) —
в духе существующего `check-web-bundle.test.mjs`; ручная проба QA (по желанию): `pnpm --filter @bga/web exec vite build
--mode development --outDir <tmp>` → `node scripts/check-web-bundle.mjs --dist <tmp> --skip-modules` должен упасть на
`dev-ai-path`.

---

## 4. Данные: TanStack Query

```ts
export const devAiKeys = { all: ['dev-ai'] as const, status: () => [...devAiKeys.all, 'status'] as const };

useDevAiStatus()   // useQuery({ queryKey: devAiKeys.status(), queryFn: fetchStatus, staleTime: 30_000,
                   //            refetchOnWindowFocus: false, retry: default (4xx не повторяются) })
useTestDecision()  // useMutation({ mutationFn: postTestDecision, retry: 0,
                   //   onSettled: () => queryClient.invalidateQueries({ queryKey: devAiKeys.status() }) })
```

- Запросы через `requestJson(path, schema, { method, body })` из `@/shared/api` — тот же http-слой, единая обработка
  ошибок (`ApiError`, `INVALID_RESPONSE` при несовпадении схемы, `NETWORK`).
- После любой попытки (успех или ошибка) статус перезапрашивается — бюджет «потрачено/остаток» всегда серверный.
  Карточка результата показывает `budget` из ответа мутации (снимок на момент запроса).
- Состояние формы (роль, провайдер) — локальный `useState` страницы, не Zustand (одна страница, не переживает навигацию —
  намеренно: провайдер каждый раз по умолчанию `mock`, D-FE-3).
- Отмены запроса нет: прерывание fetch не остановит платный вызов на сервере, а ответ с usage потерялся бы. При уходе со
  страницы мутация завершается в фоне, результат не показывается (компонент размонтирован).

---

## 5. UI

### 5.1 Компоновка — 1440 (контейнер `maxWidth: 1200`, две колонки `md+`)

```text
│ Board Game AI                                                         MOCK  ⚙ │  ← AppHeader (как везде)
│ ← Назад   Диагностика AI  [DEV]                                               │  h1 + чип DEV (текст, не цвет)
│ Только для разработки. Не входит в игру. Сценарий ниже — тестовые данные.     │
┌──────── Подключение (h2) ─────────────┐ ┌──────── Результат (h2) ─────────────────────────┐
│ OpenAI: включён ✓   Провайдер: openai │ │ (пусто) «Нажмите „Тестировать AI“» / спиннер    │
│ Ключ API: задан ✓                     │ │ Выбрано: move-1 · move · Yavin   [✓ из списка]  │
│ Модели                                │ │ Объяснение: «…» (обычный текст)                 │
│  strategy  gpt-6.1-sol   ✓ доступна   │ │ Провайдер: openai · Модель: gpt-6-luna          │
│  tactical  gpt-6-luna    ? не провер. │ │ Время: 1 234 мс · Попыток: 1                    │
│ Бюджет: потрачено $0.0012 из $0.25,   │ │ Токены  вход 812 · из кеша 0 · выход 64 ·       │
│         осталось $0.2488              │ │         рассуждение 32 · всего 876              │
│ [Обновить статус]                     │ │ Стоимость ≈ $0.000113 (оценка; итог по счёту    │
├──────── Запуск (h2) ──────────────────┤ │   OpenAI может отличаться) · тарифы openai-2026-11-08 │
│ Роль модели  (tactical) (strategy)    │ │ Остаток бюджета: $0.2487                        │
│ Провайдер    (Mock — бесплатно) (Авто)│ └─────────────────────────────────────────────────┘
│ ⚠ Авто + OpenAI включён: платный      │ ┌ ⛔ Бюджет исчерпан: осталось $0.00 из $0.25 ┐ ← Alert role=alert
│   запрос (оценка по тарифам)          │ └──────────────────────────────────────────────┘    (над результатом)
│ [ Тестировать AI ]  (◌ при запросе)   │
├──────── Тестовый сценарий (h2) ───────┤
│ ⚗ Тестовые данные, не правила Rebellion│
│ Сторона: rebels · Фаза: … · Цель: …   │
│ 1. move-1   move    Yavin    ✓ выбрано│
│ 2. recruit-1 recruit —                │
└───────────────────────────────────────┘
```

375: одна колонка, порядок — заголовок → Подключение → Запуск → Ошибка → Результат → Тестовый сценарий; кнопка
«Тестировать AI» во всю ширину; таблица токенов — список «подпись: значение» (без горизонтальной прокрутки); id модели и
действий переносятся (`overflowWrap: anywhere`). Горизонтальной прокрутки нет ни на 1440, ни на 375.

### 5.2 Поведение

- **Роль** (`ChoiceGroup variant="segment"`): `tactical` (по умолчанию, A-4) | `strategy`; подпись показывает id модели из
  статуса («tactical — gpt-6-luna»), если он есть.
- **Провайдер**: `mock` (по умолчанию, D-FE-3) | `auto`. При `auto` и `openaiEnabled=true` — `Alert severity="warning"`
  «Платный запрос к OpenAI…» (текст, не только цвет, `data-testid="dev-ai-paid-warning"`). При `auto` и
  `openaiEnabled=false` — `info` «OpenAI выключен: ответит mock». Опция `auto` не блокируется — решает сервер.
- **Кнопка «Тестировать AI»**: `disabled` пока `isPending` (+ `CircularProgress size=20` внутри, `aria-busy` на карточке
  результата, текст кнопки «Запрос выполняется…»); группы роль/провайдер тоже `disabled` на время запроса. Обработчик
  дополнительно проверяет `isPending` (защита от двойного клика до ре-рендера). Кнопка активна, даже если статус не
  загрузился (статус — справочный; ошибку покажет POST).
- **Результат**: выбранное действие ищется в локальном `DEV_AI_TEST_SCENARIO` по id и показывается id + type + target;
  в списке сценария строка помечается «✓ выбрано» (`data-selected="true"`, `aria-current="true"`). Если id нет в
  локальном списке (рассинхрон) — показывается сырой id и предупреждение (сервер уже гарантирует принадлежность, AC-04).
  `reason` — обычный текст (React экранирует), без markdown/HTML. `reasoningTokens: null` → «—» + подсказка «нет данных».
- **Форматирование** (`format.ts`, `Intl` по текущему языку): USD с 2–6 знаками (`$0.000113`), мс с разделителями
  разрядов, токены целыми. Стоимость всегда с подписью «оценка…» (`dev-ai-cost-note`), рядом `pricingVersion`.
- **Ошибки** — §6; новая попытка очищает прошлую ошибку и прошлый результат (`mutation.reset()` перед `mutate`).
- Анонс в aria-live через `announce()` (`@/shared/feedback`): «AI выбрал действие move-1» / текст ошибки.

### 5.3 Состояния статуса (`data-state` у `dev-ai-status`)

| state | Когда | UI |
|---|---|---|
| `loading` | первый запрос | Skeleton строк, `aria-busy="true"` |
| `ready` | 200 | поля статуса |
| `unavailable` | 404 | `Alert info` «Dev-эндпоинт диагностики не найден (API запущен в production или без модуля)»; кнопка всё равно доступна (POST тоже вернёт 404 → общий текст) |
| `error` | сеть / 5xx / `INVALID_RESPONSE` / `AI_DEV_FORBIDDEN` | `Alert error role=alert` (текст §6) + «Повторить» (`dev-ai-status-retry` → `refetch`) |

Доступность модели — текст + иконка: «доступна» (CheckCircle), «недоступна» (Error), «не проверялась» (Help);
`data-available="true|false|unknown"`. «Ключ API: задан/не задан» — только boolean, никогда значение или маска.

---

## 6. Ошибки по кодам

Тексты — в `errors.json` (`errors:code.<CODE>` + `errors:<messageKey>` от BE: так требует существующий
`locales.test.ts`, W-8) и короткий заголовок/подсказка — в `devAi:error.<CODE>.{title,hint}`. `aiErrorText(t, err)`:
заголовок из `devAi:error.<code>.title` (fallback `devAi:error.generic.title`), текст — `translateError(t, err)` с
`details` для интерполяции, подсказка — `devAi:error.<code>.hint` (если есть). Рендер — `AiErrorAlert`: `Alert
severity="error" role="alert"`, `data-testid="dev-ai-error"`, `data-code="<CODE>"`; фокус не переносится (alert
объявляется сам), кнопка остаётся в фокусе.

| Код (HTTP) | Текст (ru, пример) | Подсказка / поведение UI |
|---|---|---|
| `AI_NOT_CONFIGURED` (503) | «OpenAI не настроен или модель недоступна.» (messageKey BE, напр. `errors.aiNotConfigured` / `errors.aiModelUnavailable`) | «Выберите провайдер Mock или проверьте apps/api/.env». Статус перезапрашивается (строка модели станет «недоступна»). |
| `AI_BUDGET_EXCEEDED` (429) | «Бюджет исчерпан: осталось ${{remainingUsd}} из ${{limitUsd}}.» | «Mock продолжает работать бесплатно». Кнопка не блокируется (mock доступен); строка бюджета в статусе — `warning`. |
| `AI_RATE_LIMITED` (429) | «Слишком много запросов. Подождите {{retryAfterSec}} с.» (без числа, если нет `details`) | Без автоповтора и без таймера-блокировки (решает сервер). |
| `AI_TIMEOUT` (504) | «OpenAI не ответил вовремя (попыток: {{attempts}}).» | «Игровое состояние не изменялось». |
| `AI_PROVIDER_ERROR` (502) | «Ошибка OpenAI API (попыток: {{attempts}}).» | то же |
| `AI_INVALID_DECISION` (502) | «Модель вернула недопустимый ответ — действие отклонено, ничего не выполнено.» | — |
| `AI_DEV_FORBIDDEN` (403) | «Диагностика доступна только с localhost.» | — |
| `VALIDATION` (400) / `NETWORK` / `INVALID_RESPONSE` / прочее | существующие тексты `errors:*` | общий заголовок «Запрос не выполнен» |

Никогда не показывать `error.message`/сырой ответ (там может оказаться текст SDK) — только переводимые ключи.

---

## 7. i18n

- Namespace **`devAi`** — `apps/web/src/dev/ai/locales/{ru,en}.json`, **вне** eager-glob `src/locales/*/*.json`
  (иначе все строки страницы попали бы в production-бандл). `registerDevAiI18n()` вызывает
  `i18n.addResourceBundle(lng, 'devAi', json, true, true)` для `ru` и `en` при загрузке lazy-модуля (идемпотентно);
  `useTranslation('devAi')`. Переключение языка в Настройках работает (оба языка уже добавлены).
- Ключи (ориентир): `title, devBadge, intro, back, status.{title, openai.{on,off}, provider, key.{yes,no}, models.{title,
  strategy, tactical, available, unavailable, unknown}, budget.{title, line, unlimited}, retry, unavailable},
  run.{title, role.{label, tactical, strategy}, provider.{label, mock, auto}, paidWarning, autoMockHint, submit, pending},
  scenario.{title, note, faction, phase, objective, columns.{id,type,target}, selected, noTarget},
  result.{title, empty, action, outOfList, reason, provider, model, duration, attempts, tokens.{input, cached, output,
  reasoning, total, noData}, cost, costNote, pricing, budgetRemaining}, error.{generic, AI_*}.{title, hint},
  announce.{success, error}`.
- Данные сценария (`faction`, `phase`, `objective`, `id`, `type`, `target`) — показываются как есть (моноширинно):
  это тестовый вход модели, не UI-текст; перевод не нужен (D-FE-4).
- `settings:dev.{title, aiLink}` и `errors:code.AI_*` (+ messageKey BE) — в существующих платформенных файлах ru/en.

---

## 8. Доступность

- Один `h1` «Диагностика AI», секции `section` + `h2` (`aria-labelledby`); `RouteFocus` ставит фокус на h1.
- Роль/провайдер — `ChoiceGroup` (radiogroup, стрелки, видимая подпись через `labelledBy`); `disabled` на время запроса.
- Кнопка: видимый текст меняется на «Запрос выполняется…» (не только спиннер); спиннер `aria-hidden`.
  Карточка результата `aria-busy` во время запроса, `aria-live="polite"` не ставим на всю карточку — анонс через
  `announce()` одной фразой.
- Ошибки — `role="alert"`; статусы (доступна/не задан/исчерпан) — текст + иконка, не только цвет; контраст по теме.
- Таблица токенов на `md+` — `<table>` с `<th scope="row">`; на `xs` — `<dl>`.
- Список действий — `<ol>`; выбранное — `aria-current="true"` + видимый текст «выбрано».
- Клавиатура: весь сценарий проходится Tab'ом (назад → роль → провайдер → кнопка → ссылки), ловушек фокуса нет.

---

## 9. testid (контракт для QA, не зависят от языка)

| testid | Элемент / атрибуты |
|---|---|
| `dev-ai-page` | корень страницы |
| `dev-ai-status` | карточка статуса, `data-state="loading\|ready\|unavailable\|error"` |
| `dev-ai-status-openai` | «OpenAI вкл/выкл», `data-enabled="true\|false"` |
| `dev-ai-status-provider` | провайдер по умолчанию, `data-provider="openai\|mock"` |
| `dev-ai-status-key` | «Ключ задан/не задан», `data-configured="true\|false"` |
| `dev-ai-model-strategy`, `dev-ai-model-tactical` | строка модели, `data-available="true\|false\|unknown"` |
| `dev-ai-budget` | строка бюджета, `data-remaining-usd` |
| `dev-ai-status-retry` | «Повторить» статус / `dev-ai-status-refresh` — «Обновить статус» |
| `dev-ai-role`, `dev-ai-role-tactical`, `dev-ai-role-strategy` | ChoiceGroup роли и опции |
| `dev-ai-provider`, `dev-ai-provider-mock`, `dev-ai-provider-auto` | ChoiceGroup провайдера и опции |
| `dev-ai-paid-warning`, `dev-ai-auto-mock-hint` | предупреждение о платном запросе / подсказка «ответит mock» |
| `dev-ai-submit` | кнопка, `data-pending="true\|false"` |
| `dev-ai-scenario`, `dev-ai-scenario-note` | сценарий и пометка «тестовые данные, не правила Rebellion» |
| `dev-ai-action-<id>` | строка действия, `data-selected="true\|false"` |
| `dev-ai-result` | карточка результата, `data-state="empty\|pending\|success"` |
| `dev-ai-result-action`, `dev-ai-result-reason`, `dev-ai-result-provider`, `dev-ai-result-model` | поля результата |
| `dev-ai-result-duration`, `dev-ai-result-attempts` | время (`data-ms`), попытки |
| `dev-ai-tokens-input`, `-cached`, `-output`, `-reasoning`, `-total` | токены (`data-value`, у reasoning `null` → `data-value=""`) |
| `dev-ai-cost`, `dev-ai-cost-note`, `dev-ai-pricing` | стоимость (`data-usd`), подпись «оценка», версия тарифов |
| `dev-ai-budget-remaining` | остаток из ответа мутации (`data-usd`) |
| `dev-ai-error` | Alert ошибки, `data-code="<CODE>"` |
| `settings-dev-ai-link` | ссылка из Настроек (только DEV) |

Все testid с префиксом `dev-ai-` → правило `dev-ai-testid` в `check:bundle` гарантирует их отсутствие в production.

---

## 10. Подзадачи и владение файлами

Один воркер — объём маленький, файлы не пересекаются с BE.

| Subtask | Role | OWNED FILES | Depends on |
|---|---|---|---|
| **FE-AI-1** Dev-страница диагностики AI | frontend worker (UI) | `apps/web/src/dev/**` (всё новое, §1); `apps/web/src/app/router.tsx`; `apps/web/src/app/pages/SettingsPage.tsx`, `SettingsPage.test.tsx`; `apps/web/src/locales/{ru,en}/settings.json`; `apps/web/src/locales/{ru,en}/errors.json` | BE-контракт W-8/W-9 (коды ошибок и схемы в `@bga/platform`) — до этого локальные схемы и моки; финальная проверка `locales.test.ts` — после BE |
| **FE-AI-2** `check:bundle` для диагностики и секретов | тот же frontend worker (или BE, Q-FE-4) | `scripts/check-web-bundle.mjs`, `scripts/check-web-bundle.test.mjs` | FE-AI-1 (чтобы проверить на реальной сборке) |

Не владеет: `packages/platform/**` (BE), `apps/api/**` (BE), `e2e/**` (QA: `e2e/dev-ai.spec.ts`, скриншоты),
`eslint.config.mjs` (опционально — правило «`@/dev/**` нельзя импортировать статически вне `src/dev`», если Analyst
захочет второй рубеж к §3.3; по умолчанию не делаем — модульная проверка `check:bundle` надёжнее).

DONE WHEN (FE-AI-1/2): `pnpm --filter @bga/web lint`, `typecheck`, `test` зелёные; `pnpm build && pnpm check:bundle`
— exit 0 с новыми правилами в выводе; `node --test scripts/` зелёный; ручная проба в `pnpm dev` (mock) — результат
отображается; список файлов и команд с фактическими результатами в handoff.

---

## 11. Vitest (все — `mockFetch` + `renderWithProviders`, без сети; в Vitest `import.meta.env.DEV === true`)

`DevAiPage.test.tsx`:
- **T-1** `/dev/ai` → h1 «Диагностика AI», чип DEV, `GET /api/dev/ai/status` ровно один раз, **POST не вызывается** при монтировании.
- **T-2** статус `ready`: OpenAI вкл, провайдер, ключ «задан» (и в DOM нет ничего похожего на `sk-`), модели с
  `data-available` true/false/unknown, бюджет форматирован.
- **T-3** статус 404 → `data-state="unavailable"`; сеть/500 → `error`, `role=alert`, «Повторить» → второй GET.
- **T-4** провайдер по умолчанию `mock`, роль `tactical`; `auto` при `openaiEnabled=true` → `dev-ai-paid-warning`;
  при `openaiEnabled=false` → `dev-ai-auto-mock-hint`.
- **T-5** клик «Тестировать AI» → один POST, body = `{ scenario: DEV_AI_TEST_SCENARIO, role, provider }` (без `budgetKey`);
  на время запроса (отложенный ответ) кнопка `disabled`, `data-pending="true"`, текст «Запрос выполняется…», группы
  disabled; второй клик не порождает второй POST.
- **T-6** успех → все поля результата (действие с type/target, объяснение, провайдер/модель, время, попытки, 5 токенов,
  стоимость с 6 знаками + `dev-ai-cost-note`, `pricingVersion`, остаток), `dev-ai-action-<id>` `data-selected="true"`;
  `reasoningTokens: null` → «—».
- **T-7** `it.each` по 7 кодам `AI_*` → `dev-ai-error` с `role=alert`, `data-code`, ожидаемый ru-текст; интерполяция
  `remainingUsd`/`attempts`/`retryAfterSec` и fallback без `details`.
- **T-8** после успеха и после ошибки статус перезапрошен (2 GET); новая попытка очищает прежнюю ошибку/результат.
- **T-9** ответ 200 не по схеме → `INVALID_RESPONSE` текст, без падения страницы.
- **T-10** `reason` с `<b>` рендерится текстом (нет элемента `b`).
- **T-11** язык `en` → тексты страницы английские (h1, кнопка, пометка сценария), кириллицы нет в `dev-ai-page`
  (кроме данных сценария, если они ru — сценарий хранится на английском, Q-FE-2).
- **T-12** a11y-проверки ролями: `getByRole('radiogroup', { name })` ×2, `getByRole('button', { name: 'Тестировать AI' })`,
  `getByRole('heading', { level: 2 })` ×4, список `ol` с элементами.

`devAiRoute.test.tsx`:
- **T-13** в DEV `routes` содержит путь `/dev/ai`; переход из Настроек по `settings-dev-ai-link` открывает страницу.
- **T-14** `vi.stubEnv('DEV', false)` + `vi.resetModules()` + динамический `import('@/app/router')` → пути `/dev/ai`
  в дереве маршрутов нет. (Если `stubEnv` для `DEV` в текущем Vitest не влияет на уже трансформированный литерал —
  тест помечается `it.skip` с комментарием, доказательство отсутствия — только `check:bundle`; фиксируется в handoff.)

Прочее:
- **T-15** `format.test.ts`: `formatUsd(0.000113,'ru'|'en')`, `formatUsd(0)`, `formatDurationMs(1234)`, `null`-токены.
- **T-16** `dev/ai/locales.test.ts`: ru/en `devAi` — одинаковые ключи, без пустых строк, en без кириллицы; для каждого
  кода `AI_*` есть `error.<CODE>.title`.
- **T-17** `SettingsPage.test.tsx`: в DEV секция «Для разработчиков» и ссылка `href="/dev/ai"`.
- **T-18** `scripts/check-web-bundle.test.mjs`: новые правила ловят `"/api/dev/ai/status"`, `` `/dev/ai` ``,
  `data-testid:"dev-ai-submit"`, `OPENAI_API_KEY`, `sk-` + 24 символа; **не** ловят `AI_BUDGET_EXCEEDED`, `/api/sessions`,
  `devices`, `task-ai`, `risk-assessment`; модульная проверка: source `../../apps/web/src/dev/ai/DevAiPage.tsx` → forbidden,
  `apps/web/src/app/router.tsx` → ok.
- Существующий `shared/i18n/locales.test.ts` (без изменений) станет проверкой текстов `errors:code.AI_*` после W-8.

E2E (зона QA, для `test-cases.md`): `e2e/dev-ai.spec.ts` — открыть `/dev/ai` (dev-сервер e2e), статус в mock-режиме
(`OPENAI_ENABLED=false` → `data-enabled="false"`, `data-provider="mock"`), «Тестировать AI» с mock → результат,
`estimatedCostUsd = 0`, бюджет не изменился; ошибки — через `page.route('**/api/dev/ai/test-decision', …)` с телами
`{ok:false,error:{code:'AI_BUDGET_EXCEEDED',…}}` и т.д. (режимы сбоев mock публично недоступны по спецификации);
переход из Настроек; 375 без горизонтальной прокрутки.

---

## 12. Скриншоты для QA (ru, если не указано; `artifacts/screenshots/`)

| # | Файл (предложение) | Вьюпорт | Состояние |
|---|---|---|---|
| S-1 | `dev-ai-1440-status-mock.png` | 1440×900 | статус загружен, OpenAI выключен (e2e mock), результат пуст |
| S-2 | `dev-ai-375-status-mock.png` | 375×812 | то же, полная страница (fullPage) |
| S-3 | `dev-ai-1440-pending.png` | 1440 | запрос выполняется: кнопка disabled + спиннер (ответ задержан через `page.route`) |
| S-4 | `dev-ai-1440-result-mock.png` | 1440 | успешный результат mock: действие, токены, стоимость $0, «оценка» |
| S-5 | `dev-ai-375-result-mock.png` | 375 | то же, fullPage, без горизонтальной прокрутки |
| S-6 | `dev-ai-1440-paid-warning.png` | 1440 | `auto` + `openaiEnabled=true` (статус подменён `page.route`) — предупреждение о платном запросе |
| S-7 | `dev-ai-1440-error-budget.png` | 1440 | `AI_BUDGET_EXCEEDED` (подмена) — alert с остатком |
| S-8 | `dev-ai-375-error-invalid.png` | 375 | `AI_INVALID_DECISION` (подмена) |
| S-9 | `dev-ai-1440-status-unavailable.png` | 1440 | статус 404 → «недоступно» |
| S-10 | `settings-375-dev-link.png` | 375 | Настройки с секцией «Для разработчиков» |
| S-11 | `dev-ai-1440-en-result.png` | 1440, en | результат на английском |
| S-12 | `dev-ai-1440-real-openai.png` | 1440 | **реальный** запрос (A-4, делает Analyst на BUSINESS_VALIDATION, не QA): openai, модель, токены, стоимость |

---

## 13. Риски

| ID | Риск | Митигация |
|---|---|---|
| R-FE-1 | Guard не свернулся (условие вынесено в функцию, импорт стал статическим) → страница и эндпоинты в production-бандле. | Литеральный `import.meta.env.DEV` в `router.tsx`/`SettingsPage.tsx`; `check:bundle`: `dev-ai-path`, `dev-ai-testid`, модульная проверка `apps/web/src/dev/**`; тесты T-18. |
| R-FE-2 | Строки `devAi` попадут в основной бандл через eager-glob. | Локали в `src/dev/ai/locales/`, регистрация в lazy-модуле; модульная проверка поймает импорт JSON из `src/dev/`. |
| R-FE-3 | Случайные платные запросы (автоповтор, двойной клик, запрос при монтировании, refetch). | §0.3: только клик, `retry: 0`, `disabled` + guard в обработчике, провайдер по умолчанию `mock`; T-1, T-5. |
| R-FE-4 | Wire BE отличается от W-1..W-9. | Единственный адаптер — `dev/ai/api.ts`; при появлении `plan-backend.md` — сверка и поправка таблицы §2. |
| R-FE-5 | Коды `AI_*` не добавлены в `ErrorCodeSchema` → strict-парсинг тела ошибки проваливается, UI показывает общий `HTTP_ERROR`. | Зависимость FE-AI-1 от BE (W-8); T-7 падает, пока коды не в платформе — индикатор. |
| R-FE-6 | e2e: API за Vite-proxy — сервер видит loopback-адрес; если BE будет доверять `X-Forwarded-For`, проверка loopback станет обходимой/ломкой. | Сообщить BE: судить по `req.socket.remoteAddress`, не по заголовкам (вопрос к BE, не блокирует FE). |
| R-FE-7 | `vi.stubEnv('DEV', false)` может не повлиять на трансформированный литерал → T-14 недостоверен. | Доказательство отсутствия в production — `check:bundle` (основное), T-14 — дополнительное; честно `skip`, если не работает. |
| R-FE-8 | Текст `reason` от модели длинный/с разметкой. | Сервер ограничивает 300 символов; UI — обычный текст, `overflowWrap: anywhere`; T-10. |

---

## 14. Вопросы

- **Q-FE-1 (BE-lead, блокирует только финальную сверку):** экспортирует ли BE Zod-схемы dev-AI wire из `@bga/platform`
  (W-9)? Рекомендация FE — да (одна правда; tree-shaking не потащит их в основной бандл). Иначе — локальные схемы в
  `dev/ai/api.ts` + контрактный тест на стороне api.
- **Q-FE-2 (Analyst / PO):** точный текст «тестового сценария PO» в запросе отсутствует. Предложение по умолчанию
  (на английском — это вход модели): `faction: 'rebels'`, `phase: 'command'`, `objective: 'Protect the hidden base while
  gaining reputation'`, действия `move-yavin {type:'move', target:'Yavin'}`, `recruit-leader {type:'recruit'}`,
  `mission-sabotage {type:'mission', target:'Kuat'}`, `attack-hoth {type:'attack', target:'Hoth'}`, `pass {type:'pass'}`.
  Прошу прислать сценарий PO дословно, если он был.
- **Q-FE-3 (Analyst):** подтвердить D-FE-1 — гейт только `import.meta.env.DEV`, без `VITE_E2E` (e2e работает на dev-сервере).
- **Q-FE-4 (Analyst):** кто владеет `scripts/check-web-bundle.mjs` в этой задаче — FE-воркер целиком (предложение: и
  dev-ai-правила, и правила секретов AC-10 в одном файле у одного владельца) или BE добавляет `openai-key-*` сам?
- **Q-FE-5 (Analyst, некритично):** допустимы ли строки `settings:dev.*` («Для разработчиков», «Диагностика AI (dev)») в
  production-бандле как неиспользуемые тексты? По умолчанию — да (assumption); иначе переносим в lazy-загрузку.
- **Q-FE-6 (BE-lead):** точные `messageKey` новых ошибок (спецификация упоминает `ai.modelUnavailable`) — FE добавит их
  тексты в `errors.json`; формат должен быть `errors.<name>` (так работает `translateError`).

---

## 15. Предложение для `ux-decisions.md` §15 (переносит Analyst)

| ID | Решение | Почему |
|---|---|---|
| D-FE-1 / D-SW5B-1 | `/dev/ai` существует только в dev-сборке (`import.meta.env.DEV`), без ссылок из каталога/шапки; страница с чипом «DEV» и вступлением «только для разработки». | Не игровой интерфейс; ноль следов в production. |
| D-FE-2 / D-SW5B-2 | Вход — ссылка в Настройках, секция «Для разработчиков», только в dev. | Находимость без засорения основного UI. |
| D-FE-3 / D-SW5B-3 | Провайдер по умолчанию — Mock; переключение на «Авто» при включённом OpenAI показывает текстовое предупреждение о платном запросе. | Безопасный выбор по умолчанию; расходы осознанные. |
| D-FE-4 / D-SW5B-4 | Тестовый сценарий показывается как данные (моноширинно, без перевода) с пометкой «тестовые данные, не правила Rebellion». | Не путать с правилами игры (A-1). |
| D-SW5B-5 | Стоимость всегда с подписью «оценка; итог по счёту OpenAI может отличаться» и версией тарифов. | Риск расхождения со счётом (A-2). |
