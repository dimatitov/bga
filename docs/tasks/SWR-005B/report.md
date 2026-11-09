<!-- report.md запрошен PO; содержимое совпадает с delivery-report.md (канонический отчёт процесса). -->
# Report — SWR-005B OpenAI API Integration & First Live AI Decision

## Scope
### Что реализовано
- **Валидатор окружения** (дополнение PO): одна Zod-схема `apps/api/src/config/env.ts` — единственное место чтения `process.env`;
  backend не стартует при отсутствующей/невалидной обязательной переменной (условно обязательные при `OPENAI_ENABLED=true`),
  сообщение называет переменные без значений; ключ хранится в обёртке `Secret`; `.env.example` сверяется со схемой тестом.
- **AI-слой** `apps/api/src/ai/**`: `AIProvider` с `OpenAIProvider` (официальный SDK `openai@6.49.0`, Responses API, Structured
  Outputs со строгой схемой — enum id действий) и `MockAIProvider` (детерминированный, бесплатный); выбор провайдера конфигурацией;
  проверка доступности моделей через API; серверная валидация «действие только из списка»; таймауты, ограниченные повторы с backoff
  (учёт `retry-after` ≤ 10 с), обработка 401/403/429/5xx/квоты/сети; безопасные логи (без ключа и текста промпта/ответа).
- **Стоимость и бюджет:** тарифы `gpt-6.1-sol`/`gpt-6-luna` из официального прайса (`pricingVersion openai-2026-11-08`), учёт
  input/cached/output/reasoning, целые микро-USD, округление вверх; таблица `AiUsage` (каждая попытка, без текста промпта);
  бюджет на ключ сессии с резервом худшего случая (включая повторы) и блокировкой по ключу — при исчерпании 429 без вызова OpenAI;
  ключ dev-диагностики фиксирован (`dev-diagnostics`); скрипт ручного сброса `apps/api/scripts/reset-ai-budget.mjs` (только с `--yes`).
- **Dev-only API:** `GET /api/dev/ai/status`, `POST /api/dev/ai/test-decision` — только при `NODE_ENV ≠ production` (иначе 404),
  только с loopback (+ проверки Host/Origin/X-Forwarded-For/Sec-Fetch-Site), лимит тела 8 KiB, лимиты частоты 10 платных / 120 всего
  в минуту; новые коды ошибок платформы `AI_*` и ru/en тексты.
- **Dev-страница** `/dev/ai` (только dev-сборка, в production-бандле её нет — `check:bundle`): статус, модели, роль, провайдер
  (mock по умолчанию, предупреждение о платном запросе), тестовый сценарий PO, «Тестировать AI», результат с объяснением, временем,
  токенами, оценочной стоимостью и остатком бюджета, ошибки по кодам.
- **Изоляция тестов от реального ключа:** тесты/e2e работают только с mock; сетевой guard; исправлена утечка `.env` в тестовые
  процессы через Prisma (D-1, F-1).

**Сознательно не делалось:** AI Commander, автоигра раунда, подключение AI к ходу партии (авто-пас SWR-005 остаётся), боевые решения,
публичный доступ к платному API, AWS.

## First live request (AC-12)
| Поле | Значение |
|---|---|
| Время | 2026-11-08 23:08 (локально), 20:08 UTC |
| Модель | `gpt-6-luna` (роль tactical, reasoning effort `none`, max_output_tokens 400) |
| Сценарий | тестовый сценарий PO (empire / command / «Strengthen imperial control», 3 действия) |
| Решение | `action-2` — RECRUIT coruscant; «Recruiting on Coruscant strengthens imperial forces and supports control of the core world.» |
| Время ответа | 4177 мс, 1 попытка |
| Токены | input 235, cached 0, output 38, reasoning 0, всего 273 |
| Оценочная стоимость | ≈ 0.000043 USD (43 micro-USD) — оценка по прайсу; итог по счёту OpenAI может отличаться |
| Бюджет после | потрачено 0.000043 из 0.25 USD |

## Files changed
~120 файлов (`git status`): основное —
- `apps/api/src/config/**`, `bootstrap.ts`, `main.ts`, `app.factory.ts`, `app.module.ts` (конфиг, fail-fast, порядок импорта Prisma);
- `apps/api/src/ai/**` (провайдеры, промпт, схема, валидация, тарифы, ретраи, доступность, учёт, бюджет, оркестрация, Nest-модуль);
- `apps/api/src/dev/ai/**` (контроллер, guard, лимиты, схемы);
- `apps/api/prisma/schema.prisma`, миграция `20261108230000_ai_usage`; `apps/api/scripts/{e2e-env,e2e-serve,reset-ai-budget}.mjs`;
  `apps/api/package.json` (`openai@6.49.0`, `start` с `NODE_ENV=production`), `.env.example`;
- `packages/platform/src/{errors,ai-dev}.ts` (коды `AI_*`, DTO dev-AI);
- `apps/web/src/dev/ai/**`, `app/router.tsx`, `SettingsPage`, локали; `scripts/check-web-bundle.mjs`; `eslint.config.mjs`;
- тесты: api 492 (+ новые ai/dev-ai/env/migration), web 518, platform 76, e2e 118 (dev-ai, env-isolation), `playwright.config.ts`;
- документы: `docs/architecture/application.md` (§7.1 AI-слой, §8.1 окружение), `adding-a-game.md`, `docs/tasks/SWR-005B/*`.

### API
| Method | Path | Описание |
|---|---|---|
| GET | `/api/dev/ai/status` | dev-only: OpenAI вкл/выкл, провайдер, ключ задан (флаг), модели и доступность, бюджет |
| POST | `/api/dev/ai/test-decision` | dev-only: тестовый сценарий → решение, модель, время, usage, стоимость, бюджет |

### Миграции
`20261108230000_ai_usage` — только `CREATE TABLE "AiUsage"` + индекс; таблицы сессий не тронуты (тест побайтной идентичности).
Перед применением: копия `apps/api/prisma/dev.pre-swr005b.db` (не в git, sha совпадает). Применена к dev-БД при бизнес-валидации.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log` (TC-ENV-01..22 in api vitest, lint rule for process.env) |
| AC-02 | passed | `artifacts/logs/qa-verify.log` (TC-PS-01..12) |
| AC-03 | passed | `artifacts/logs/qa-verify.log` (TC-OP-01..09) |
| AC-04 | passed | `artifacts/logs/qa-verify.log` (TC-DV-01..13) |
| AC-05 | passed | `artifacts/logs/qa-verify.log` (TC-RT-01..19) |
| AC-06 | passed | `artifacts/logs/qa-verify.log` (TC-UC-01..19) |
| AC-07 | passed | `artifacts/logs/qa-verify.log` (TC-B-01..16) |
| AC-08 | passed | `artifacts/logs/qa-verify.log` (TC-API-01..19) |
| AC-09 | passed | `artifacts/logs/qa-verify.log` (TC-W, TC-E, check:bundle 0 dev modules), `artifacts/logs/qa-manual.log`, `artifacts/screenshots/qa-manual-1440-result-mock.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log` (bundle scan, sentinel log/response tests, e2e TC-S-09, D-1/F-1 isolation), `artifacts/logs/qa-secret-scan.log` |
| AC-11 | passed | `artifacts/logs/qa-verify.log` (ESLint boundaries + `scripts/eslint-boundaries.test.mjs` + api architecture int) |
| AC-12 | passed | **Executed by Analyst, not QA** (TC-LIVE-01 = BV-3): `artifacts/logs/business-validation.log`, `artifacts/screenshots/bv-02-live-openai-decision-1440.jpg`, `artifacts/screenshots/bv-03-live-openai-scenario-selected-1440.jpg`. gpt-6-luna, action-2 from the list, 4177 ms, 235/0/38/0 tokens, ≈0.000043 USD. QA checked that the artifacts exist and match each other. QA made no request. |
| AC-13 | passed | `artifacts/logs/qa-verify.log` (exit 0, e2e 118/118, mock mode), `artifacts/logs/qa-manual.log` (browser results + qa-manual-*.png screenshots) |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log` (eslint --max-warnings=0 + prettier --check, exit 0)
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (scripts 408, platform 76, rebellion 411, forbidden-stars 5, web 518, api unit part of 492)
- integration: passed — `artifacts/logs/qa-verify.log` (api 53 files / 492 passed + 1 opt-in skipped)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (check:bundle 12 rules, 0 findings, 0 dev modules)
- e2e: passed — `artifacts/logs/qa-verify.log` (118 passed, mock mode)
- manual: passed — `artifacts/logs/qa-manual.log` (TC-M-01 at 1440 and 375, keyboard; D-1 screenshot review)
- secret scan: passed — `artifacts/logs/qa-secret-scan.log` (only test sentinels)
- artifacts sha: passed — `artifacts/logs/qa-artifacts-sha.log` (SWR-002..005 unchanged)
- live-openai: passed — `artifacts/logs/business-validation.log` (executed by Analyst, BV-3; not by QA)
- task check: passed — `artifacts/logs/qa-check-task.log`
- review: passed — `review.md` (round 1 changes_requested → round 2 approved)

## QA artifacts
Скриншоты `artifacts/screenshots/` (dev-ai-* от e2e: статус, mock-результат, ошибки, платное предупреждение, 1440/375; qa-manual-*;
bv-* — живой запрос), тест-кейсы `test-cases.md` (172), результаты `qa-results.md`, логи `artifacts/logs/`.

## Known issues / risks
- **Стоимость — оценка** по прайсу (reasoning учитывается как output); итог по счёту OpenAI может отличаться.
- **Бюджет гарантирован в пределах одного процесса API** (резервы в памяти); при сбое записи учёта резерв держится до рестарта.
- **SDK `openai@6.49.0`**, потому что все 7.x требуют Node ≥ 22 (проект на Node 20.19.5) — переход на Node 22 — решение PO.
- В dev-процессе Prisma по-прежнему загружает `apps/api/.env` в память процесса (ожидаемо для dev; тестовые процессы изолированы).
- Бюджет `dev-diagnostics` копится бессрочно, сброс — скриптом `reset-ai-budget.mjs --yes`.
- `pnpm start` задаёт `NODE_ENV=production` через POSIX-синтаксис (не Windows cmd).
- Мелочи UI (O-1, O-2): слабо заметное кольцо фокуса на «Тестировать AI» после результата; бейдж «MOCK» в шапке не отражает включённый OpenAI.
- AI пока не подключён к ходу партии: AI-сторона в Rebellion по-прежнему авто-пасует.

## Next stage proposals
1. **AI Commander (SWR-006):** выбор хода AI-стороны среди `legalActions` движка `core-v1` через `toSideView` и этот AI-слой (mock → OpenAI), бюджет по `sessionId`.
2. Переход на Node 22 LTS и `openai` 7.x.
3. Бейдж провайдера в шапке по реальному статусу; кольцо фокуса (O-1/O-2).
4. Следующий срез правил Rebellion (бой) — см. SWR-005 delivery report.

## Final decision
accepted — AC-01..AC-13 passed с доказательствами; первый реальный запрос к OpenAI выполнен (gpt-6-luna, 4177 мс, 273 токена, ≈0.000043 USD); review approved (round 2); `pnpm verify` exit 0 (e2e 118/118); QA без открытых дефектов.
