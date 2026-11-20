# Delivery Report — SWR-006 AI Commander v0

## Scope
### Что реализовано
- **AI реально играет за любую сторону.** AI-сторона партии `core-v1` больше не авто-пасует: после команды человека (и при создании
  партии, если AI ходит первым) сервер выполняет ходы AI до хода человека или конца партии. Каждый ход AI — обычная команда движка
  (`CommandEnvelope{actor: AI-сторона, expectedVersion}` → `applyCommand`, `origin:'auto'`) и **отдельный commit** с оптимистичной
  конкуррентностью; события пишутся в журнал партии так же, как ходы человека.
- **Game State → Player View → Legal Actions → AI Decision → Validation → Command API → Updated State.** Игра строит decision point
  только из `toSideView(state, aiSide)`: ≤ 10 конкретных кандидатов-команд из `legalActions` с непрозрачными id `c1..c10`, краткое
  описание ситуации своей стороны (`situation`) и выбор бота (`fallbackCandidateId`). Модель возвращает только id; параметры команды
  берёт сервер; движок проверяет всё заново.
- **Deterministic Commander (по умолчанию, бесплатно, без ключа и сети).** Детерминированный бот (seed = sessionId+version, без
  `Math.random`/`Date` — правило ESLint): Империя ищет базу (активации лидерами, доставка наземных войск, учёт уже проверенных систем,
  после раскрытия — захват/удержание базы и «кордон»); Повстанцы стягивают флот к базе, рейды/эвакуация по решению PO-1. Сложность —
  реальное поведение: hard-Повстанцы никогда не оставляют базу пустой; easy/normal иногда оставляют — победа Империи над AI достижима
  (easy 16/20, normal 6/20, hard 0/20 на фиксированных сидах).
- **OpenAI Commander (опционально, только env `AI_COMMANDER_PROVIDER=openai` + `OPENAI_ENABLED=true`).** Переиспользует AI-слой SWR-005B:
  Responses API со строгой схемой (enum id кандидатов), серверная валидация, ограниченные повторы, бюджет на партию (`budgetKey =
  sessionId`), учёт токенов/стоимости в `AiUsage`, дедлайн хода. Любой сбой (невалидный/враждебный ответ, таймаут, 429, 5xx, нет
  конфигурации, квота, бюджет, дедлайн) → этот шаг делает бот, партия продолжается; причина — код в ответе (`fallbackReasons`), логе и UI.
- **Надёжность цикла.** In-process mutex на сессию, лимит шагов `AI_COMMANDER_MAX_STEPS` (64), двойное нажатие/повтор → 409 без
  двойного хода, ошибка AI не теряет принятую команду человека (`settleRun`), прерванный ход AI доигрывается после рестарта через
  идемпотентный `POST /api/sessions/:id/automation/run` (клиент вызывает его сам, ≤ 1 раза на загрузку, иначе кнопка «Продолжить ход AI»).
- **Платформа game-agnostic.** `@bga/platform`: контракт `GameAutomation` (необязательный у `ServerGameModule`), Zod-схемы decision point
  и wire (`SessionResponse.automation`, `SessionCommandOk.automation`); раннер и стратегии в `apps/api/src/sessions/automation/**` не знают
  Rebellion (архитектурный тест).
- **UI партии.** «AI Commander · бот|OpenAI · сложность» в шапке, «ИИ думает…» (кнопки заблокированы), строки «Противник»/«AI Commander»
  в «Об игре», сводка «Ход AI: N действий», уведомление об откате на бота с причиной (ru/en), метка «AI» на всех событиях AI в журнале,
  уведомление/кнопка для прерванного хода (на 375 px — в потоке страницы). Тексты «AI Commander ещё не реализован» / «в прототипе AI
  не ходит» удалены (тест-скан локалей).

### Сознательно не сделано (вне задачи)
Бой, миссии, производство, зонды, выбор стратегии в UI партии (PO-2: только env), фоновые очереди, отмена in-flight запроса OpenAI
(`AbortSignal`), обновление Node/зависимостей (SWR-007).

## Архитектурные решения
- AI-ходы вынесены из `rebellionServerModule.applyCommand/createInitialState` (авто-пас SWR-005 удалён) в game-agnostic `AutomationRunner`;
  инвариант состояния «в AI-партии всегда активен игрок» снят (AM-BE-2), чтобы сохранять состояния «ход AI» и доигрывать их после рестарта.
- Модель выбирает только среди top-10 кандидатов бота (A-1) — без «изобретения» команд и в лимите 2..10 действий SWR-005B.
- Дедлайн — `Promise.race` без отмены (AM-BE-5); после бюджет/квота/не настроено/дедлайн — остаток запуска ботом без вызовов.
- Бот Империи для hard использует публичное правило стартовой расстановки (Q-BE-4); normal/hard — подсказку «источник хода Повстанцев
  в скрытую зону» (Q-BE-5), видимую и человеку.
- Подробно: `docs/architecture/application.md` §7.2, `docs/architecture/adding-a-game.md` §5.2; решения — `specification.md` (Clarifications,
  Decisions during IMPLEMENTATION).

## Live OpenAI check (AC-12)
Разрешение PO в чате 2026-11-19 («Да, лимит 0.05 USD»). Analyst, BUSINESS_VALIDATION BV-B (`artifacts/logs/business-validation.log`):
партия «Повстанцы (человек) vs AI-Империя, Normal», `AI_COMMANDER_PROVIDER=openai`, `tactical` = `gpt-6-luna`, лимит партии 0.05 USD.
Результат: ход AI — 14 действий, 0 откатов, `stopReason=humanTurn`, 22.9 с; `AiUsage`: 10 вызовов (2 шага с одним кандидатом — бот без
вызова), все `ok`, 9474 input / 0 cached / 466 output / 0 reasoning токенов, **≈ 0.001184 USD**. Ключ агентами не читался и не выводился;
временная конфигурация запуска удалена.

## Files changed
Относительно `236fe54`: 107 изменённых tracked-файлов (+3884/−1041), удалены `packages/games/rebellion/src/server/auto-play.ts`,
`test/server/auto-play{,-fault}.test.ts`; новые файлы — по зонам. Полный перечень по подзадачам — `implementation-plan.md` → Implementation log.
- `packages/platform` — `src/automation.ts` (new), `sessions.ts`, `server-game-module.ts`, `index.ts`; тесты.
- `packages/games/rebellion` — бот `src/ai/**` (types, random, view-model, intel, candidates, describe, decision, rank, profiles,
  empire-policy, rebel-policy), `src/server/automation.ts` (new), `rebellion-server-module.ts`, `schema/state.ts` (AM-BE-2); тесты `test/ai/**`
  (вкл. симуляции `test/ai/sim/**` и сиды побед Империи), `test/server/**`.
- `apps/api` — `src/sessions/automation/**` (runner, стратегии bot/openai, mutex, лог, `settle-run`), `session-writer.ts`, сервисы/контроллер
  сессий, `config/env.ts` (`AI_COMMANDER_*`), `.env.example`, `ai/{ai.types,prompt,ai-decision.service}.ts`; интеграционные тесты
  `automation-*.int.test.ts` и миграция старых.
- `apps/web` — `src/platform/automation/**`, SessionHost, Rebellion core-v1 UI (шапка, панели, журнал, объявления), локали ru/en; тесты.
- `e2e/**` — `ai-commander.spec.ts` (new), обновлены SWR-005 спеки; `eslint.config.mjs` (B-6), `scripts/eslint-boundaries.test.mjs`;
  `docs/architecture/{application,adding-a-game}.md`.
- Миграций БД нет (используется таблица `AiUsage` SWR-005B); бэкап `dev.db` не требовался.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `qa-results.md`, `artifacts/logs/w1-platform.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-02 | passed | `artifacts/logs/w7-runner.log`, `artifacts/logs/w9-scenarios.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-03 | passed | `artifacts/logs/w2-bot-core.log`, `artifacts/logs/w8-calibration.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-04 | passed | `artifacts/logs/w5-server.log`, `artifacts/logs/w9-scenarios.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-05 | passed | `artifacts/logs/w8-calibration.log`, `artifacts/logs/w9-scenarios.log` |
| AC-06 | passed | `artifacts/logs/w8-calibration.log` (frozen thresholds met) |
| AC-07 | passed | `artifacts/logs/w9-scenarios.log`, `artifacts/logs/qa-f3-tests.log`, `artifacts/logs/be-integration.log` |
| AC-08 | passed | `artifacts/logs/w8-calibration.log`, `artifacts/logs/w9-scenarios.log` |
| AC-09 | passed | `artifacts/logs/w9-scenarios.log`, `artifacts/logs/qa-f3-tests.log`, `artifacts/logs/w3-env.log` |
| AC-10 | passed | `artifacts/logs/qa-e2e.log`, `artifacts/logs/fe-2-3-rebellion.log`, `artifacts/logs/bv-1-fix.log`, `artifacts/screenshots/swr006-rebels-vs-ai-after-turn-en-1440.png` |
| AC-11 | passed | `artifacts/logs/gate-verify-on-head.log` (old e2e/hot-seat/dev-ai/check:bundle), `artifacts/logs/qa-f3-tests.log` |
| AC-12 | passed | `artifacts/logs/business-validation.log` (live OpenAI, Analyst, ≈0.001184 USD) |
| AC-13 | passed | `artifacts/logs/gate-verify-on-head.log` (`pnpm verify` EXIT=0), `artifacts/logs/gate-verify-final.log` (EXIT=0, clean SWR-006 worktree) |

## Verification
- lint: passed — `artifacts/logs/gate-verify-on-head.log` (eslint --max-warnings=0 + prettier --check)
- typecheck: passed — `artifacts/logs/gate-verify-on-head.log`
- unit: passed — `artifacts/logs/gate-verify-on-head.log` (scripts 449, platform 230 incl. SWR-005C, rebellion 606 incl. SWR-005C, forbidden-stars 5, web 598)
- integration: passed — `artifacts/logs/gate-verify-on-head.log` (api 604 passed + 1 opt-in skipped)
- build: passed — `artifacts/logs/gate-verify-on-head.log`
- bundle: passed — `artifacts/logs/gate-verify-on-head.log` (12 rules, 0 findings; only definition/schema/board/assets)
- e2e: passed — `artifacts/logs/gate-verify-on-head.log` (136 passed, bot mode, no network)
- clean-worktree gate: passed — `artifacts/logs/gate-verify-final.log` (HEAD c1ace26 + SWR-006 only, EXIT=0; earlier runs `artifacts/logs/gate-verify-run1.log`, `artifacts/logs/gate-verify-run2.log`, `artifacts/logs/gate-verify-run3.log` failed on 60 s timeouts of untouched SWR-003/004 api tests (migration-swr004, settings-source, hotseat) and one web lazy-load wait under external load ≈50–90; the web wait was fixed; the api files pass alone: `artifacts/logs/qa-load-flakes-alone.log`)
- live-openai: passed — `artifacts/logs/business-validation.log` (Analyst; not part of `pnpm verify`)
- review: passed — `review.md` (round 1 approved with 3 minor / 5 nit → round 2 approved)
- task check: passed — `artifacts/logs/delivery-check.log`

## Tests added (сводно)
Bot core/policies/sims (rebellion `test/ai/**`, `test/ai/sim/**`: legality 108 863 кандидатов, инвариантность к базе, пороги сложности,
завершимость 630 партий, детерминизм), server automation (`test/server/automation*.test.ts`), platform schemas, api runner/strategies
(`automation-runner`, `automation/*.unit`), HTTP-сценарии (`automation-{full-game,restart,double-submit,determinism,openai,hidden-info,
create-guard,f3-coverage}.int.test.ts`), web (platform automation host, Rebellion UI, локали), e2e `ai-commander.spec.ts` (обе стороны,
«ИИ думает…», fallback, pending/retry, двойной клик, конец партии). Покрытие обязательных тестов PO п. 8 (1–14) — `qa-results.md`.

## QA artifacts
`qa-results.md`; `artifacts/logs/qa-e2e.log`, `artifacts/logs/qa-f3-tests.log`, `artifacts/logs/qa-verify-stages.log`;
скриншоты ru/en 1440/375 `artifacts/screenshots/swr006-*.png`.

## Known issues / risks
- **F-4 (review):** запрос OpenAI, проигравший дедлайн, дорабатывает в фоне и держит резерв бюджета; при зависании провайдера резервы
  копятся и следующие шаги откатываются с `AI_BUDGET_EXCEEDED` (расход всё равно ограничен лимитом партии). Отмена — follow-up вместе с SWR-007.
- **F-6 (review):** в тестовых конфигурациях ответ mock-провайдера может быть помечен `source:'openai'`; в production недостижимо.
- Бюджет только на партию — суммарные расходы по многим партиям не ограничены (Q-17); бюджет гарантирован в пределах одного процесса API.
- Гонка двух процессов API может дать ≤ 1 лишний платный вызов на конфликт (Q-19); ход дважды не применяется.
- Подсказка Q-BE-5: источник хода Повстанцев в скрытую зону виден Империи (часть redaction SWR-005) — бот normal/hard ею пользуется.
- OpenAI-ход синхронный: ~1.3–3.8 с на вызов (живой ход — 23 с на 14 действий); UI показывает «ИИ думает…».
- Некоторые старые тесты (миграции SWR-003/004) близки к таймауту 60 с при сильной внешней нагрузке машины — флейк окружения, не SWR-006.
- Бот слабый по замыслу v0 (эвристики, без поиска); hard-Повстанцы непобедимы до среза «бой» (PO-1).

## Next stage proposals
1. **SWR-007 (идёт параллельно):** Node 22 + `openai` 7.x + CI — затем `AbortSignal` для дедлайна (снимает F-4).
2. **Срез правил «бой»** — с работающим ботом каждый новый срез сразу проверяется игрой против AI; hard-Повстанцы перестанут быть непобедимыми.
3. Небольшое: кнопка/индикатор прогресса шагов AI в OpenAI-режиме; суммарный лимит расходов на процесс/день.

## Final decision
accepted — SWR-006 delivered: all AC-01..AC-13 passed with evidence, review approved, `pnpm verify` EXIT=0; nothing committed (awaiting the user's go-ahead).
