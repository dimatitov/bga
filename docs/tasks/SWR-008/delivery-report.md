# Delivery Report — SWR-008 Rules Integration & Game Integrity

Analyst, 2026-11-20. Код SWR-008 закоммичен и запушен в `main` по OK пользователя: `f0a2a12`; CI зелёный (`artifacts/logs/ci-swr008.log`).

## Scope

**Сделано**
- Зависимости (PO-1): SWR-006 закоммичена (`7861bcd`), `main` запушен; SWR-007 слита (`cb2c3ce`) с совместимыми правками
  DEP-1/DEP-2 и e2e (`16b1cf1`, `c5b9a30`); PR dimatitov/bga#1 смержен (`3fe4a66`); CI `main` зелёный.
- Универсальный контракт Rules Context в `@bga/platform` (C-1..C-5), Rebellion-реализация, загрузка базы знаний при старте
  сервера (fail fast), интеграция в OpenAI Commander, лимит промпта и деградация, учёт затрат (миграция `AiUsage`),
  dev-эндпоинт и dev-панель диагностики, исправление DISC-009, benchmark (14 сценариев, харнесс, реальный прогон).

**Сознательно не сделано** (out of scope, `request.md`): бой, миссии, производство, зонды, лояльность; Rules Assistant;
RAG/векторная БД; правила Forbidden Stars; исправление дефектов бота BOT-1..3 (QD-25 — следующая задача).

## Итоговый отчёт для PO (запрос §14)

1. **Архитектура.** `packages/platform`: `rules-context.ts` (контракт `RulesContextProvider`, `RulesSelectionInput` только из
   публичного `rulesQuery` точки решения, `rulesVersion`), `rules-kb/provider.ts` (детерминированный отбор, исключение
   `needs-review`, закреплённые записи, теги), `ai-diagnostics.ts` (wire-схема dev-диагностики); `ServerGameModule.rules?` и
   `AutomationDecisionPoint.rulesQuery?` — аддитивно; новый fallback-код `AI_PROMPT_TOO_LARGE`. Rebellion: `src/server/rules-context.ts`
   (+ запись `rebellion:impl.engine-scope`), `src/ai/rules-query.ts`. API: `src/rules-context/` (реестр, загрузчик), промпт с блоком
   правил, `prompt-fit.ts`, `commander-context.ts`, учёт в `AiUsage`, `src/bench/` (game-agnostic). Web: dev-панель
   `apps/web/src/dev/ai/session/**`. Конвейер: State → PlayerView → Legal Actions → `rulesQuery` → Rules Selection → Prompt →
   Decision → Validation → Command API.
2. **Как выбираются правила.** Вход — только публичное для обеих сторон: сторона, фаза, набор типов действий по состоянию
   активации, теги `base-hidden|base-revealed|opponent-passed` (QD-7: кандидаты AI-Повстанцев зависят от скрытой базы, поэтому в
   отбор не входят). Порядок: engine-scope (что не реализовано в core-v1) → `ai:'core'` → по типам команд → по фазе → по тегам;
   фильтр по стороне; `id asc`; обрезка целыми строками по `maxChars` (6000); `needs-review` исключены всегда.
   Факт: 17–20 записей, 5048–5642 символов из 6000, без обрезки; версия `rebellion@1:55b423d7bfef`.
3. **Найденные и исправленные ошибки.** e2e HS-02 (тело ответа теряется при reload — флейк CI попытки 1, тест пропускает нечитаемые тела); DEP-1 (Prisma 7 + синхронный SQLite: проигравший писатель → `error` вместо `conflict`;
   итог — `isSqliteBusy` + 250 ms из PR #1 + warn-строка, F-3); DEP-2 (дубль PASS на последнем ходу → 422 gameOver); e2e TC-006
   (кнопка ниже сгиба на Linux CI), e2e session-list (ожидание строк); повреждённый `node_modules` после pnpm под Node 20
   (переустановка); review F-1 (гонка TC-CC-04), F-4 (итоги dev-панели считали отказы бюджета), F-6 (нумерация событий при
   создании). Найдено, не исправлено: BOT-1..3 (QD-25), D-1..D-3 (QD-30..32).
4. **DISC-009.** Условие (RR p.11): у Империи наземный юнит в системе нераскрытой базы (лояльности в core-v1 нет — точка
   расширения). Единственная точка — `runStateChecks` после каждой принятой команды и при создании; во время активации Империи
   раскрытие ждёт `FINISH_ACTIVATION` (после всего движения, RR p.2), вне её — сразу; порядок `ACTIVATION_FINISHED → BASE_REVEALED →
   GAME_OVER`; идемпотентно; победа Империи — после раскрытия. Differential-тест на 285 seeded-партиях: события побайтно как у
   старой логики; DISC-009 в базе знаний — `fixed`, покрытие ссылается на новые тесты.
5. **Сравнительные тесты** (`artifacts/benchmark/real-20261120-140206.md`, 14 сценариев × 3 повтора): goal score bot 0.643,
   OpenAI без правил 0.845, с правилами 0.774 (Δ −0.071, 95 % ДИ [−0.178; 0.035] — **эффекта нет**); попадание 64.3 / 76.2 / 73.8 %;
   валидных решений 100 %, необоснованных PASS 0 %, fallback 0 во всех вариантах.
6. **Токены и стоимость.** С правилами +1396 входных токенов на решение (≈ 67 % кэшируется), **$0.000116 против $0.000097 за
   решение (+19 %, значимо)**; задержка p50 1414 против 1516 мс (без эффекта). Весь реальный прогон — $0.008932 из $1.
7. **`pnpm verify` и QA.** `pnpm verify` exit 0 (platform 366, forbidden-stars 5, rebellion 875, web 647, api 863, e2e 139);
   ревью approved (2 раунда); QA: 154/160 TC passed, 2 failed (minor, приняты QD-30/31), 4 not_run; AC-2..AC-15 passed.
8. **Известные ограничения** — раздел ниже.
9. **Рекомендации.** (a) Задача на качество бота: BOT-1..3 (особенно reb-01 — мгновенный проигрыш). (b) Задача на содержание
   Rules Context: правила не дали эффекта и ухудшили emp-05/reb-05/reb-06 — сократить/переписать записи под решения (фокус на
   стратегию, а не процедуры), попробовать компактный режим (~2000 символов) и повторить benchmark (≤ $0.05). (c) Расширение
   среза правил (бой/миссии) — тогда правила понадобятся сильнее. (d) Перед второй игрой — использовать контракт §8
   `rules-knowledge.md`.

## Files changed

- `packages/platform/src/{rules-context.ts, ai-diagnostics.ts, automation.ts, server-game-module.ts, index.ts}`,
  `packages/platform/src/rules-kb/{context.ts, provider.ts, canonical-json.ts, index.ts}` + тесты.
- `packages/games/rebellion/src/rules/core/{state-checks.ts, apply.ts, turn-flow.ts, movement.ts, victory.ts, create.ts, index.ts}`,
  `src/ai/{rules-query.ts, decision.ts, types.ts, index.ts}`, `src/server/{rules-context.ts, rebellion-server-module.ts, index.ts}`,
  `knowledge/{entries/implementation-notes.json, discrepancies.json, coverage.json, audit-summary.md}`, `benchmark/**` + тесты.
- `apps/api/src/{rules-context/**, ai/{prompt.ts, prompt-fit.ts, cost-by-rules.ts, ai.types.ts, ai-decision.service.ts,
  ai-usage.repository.ts}, sessions/automation/**, sessions/sessions.repository.ts, dev/ai/**, bench/**, config/env.ts, main.ts,
  app.module.ts, app.factory.ts}`, `prisma/{schema.prisma, migrations/20261120120000_ai_usage_rules}`, `.env.example`,
  `scripts/e2e-env.mjs`, `package.json` (`bench:ai`) + тесты.
- `apps/web/src/{dev/ai/**, platform/session-host/SessionHost.tsx, locales/*/sessionHost.json}` + тесты; `e2e/ai-diagnostics.spec.ts`,
  `e2e/support/{dev-ai.ts, testids.ts}`.
- Документы: `docs/architecture/rules-knowledge.md`, `docs/game-rules/rebellion/*`, `docs/tasks/SWR-008/**`.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/delivery-check.log` |
| AC-2 | passed | `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log` |
| AC-3 | passed | `artifacts/logs/qa-api.log` |
| AC-4 | passed | `artifacts/logs/qa-rebellion.log` |
| AC-5 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| AC-6 | passed | `artifacts/logs/prompt-scan.log`, `artifacts/logs/qa-api.log` |
| AC-7 | passed | `artifacts/logs/qa-api.log` |
| AC-8 | passed | `artifacts/logs/qa-rebellion.log` |
| AC-9 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/qa-rs06-devdb.log` |
| AC-10 | passed | `artifacts/logs/qa-api.log` |
| AC-11 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/final-verify.log` |
| AC-12 | passed | `artifacts/logs/qa-api.log` |
| AC-13 | passed | `artifacts/logs/qa-web.log`, `artifacts/logs/qa-e2e-diagnostics.log`, `artifacts/logs/qa-browser-diag08.log` |
| AC-14 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| AC-15 | passed | `artifacts/benchmark/real-20261120-140206.md`, `artifacts/logs/bench-real.log`, `artifacts/logs/qa-meas.log` |
| AC-16 | passed | `artifacts/logs/final-verify.log`, `artifacts/logs/ci-swr008.log` — локально exit 0; CI GitHub Actions на `f0a2a12` success (попытка 2; попытка 1 — флейк e2e HS-02, исправлен `artifacts/logs/hs02-flake-fix.log`) |

## Verification
- lint: passed — `artifacts/logs/final-verify.log`
- typecheck: passed — `artifacts/logs/final-verify.log`
- unit: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log`
- integration: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/qa-api.log`
- e2e: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/qa-e2e-diagnostics.log`
- build + check:bundle: passed — `artifacts/logs/final-verify.log`
- real benchmark (OpenAI, $0.008932): passed — `artifacts/logs/bench-real.log`
- review: passed — `review.md`
- CI on the base 3fe4a66: passed — `artifacts/logs/qa-ci.log`
- CI on the SWR-008 code (f0a2a12): passed — `artifacts/logs/ci-swr008.log`
- e2e HS-02 flake fix (5/5 locally): passed — `artifacts/logs/hs02-flake-fix.log`
- check-task: passed — `artifacts/logs/delivery-check.log`

## QA artifacts
`qa-results.md`, `artifacts/logs/qa-*.log`, `artifacts/logs/prompt-scan.log`, `artifacts/screenshots/swr008-dev-diagnostics-*.png`,
`artifacts/benchmark/real-20261120-140206.{md,json}`, `artifacts/benchmark/mock-20261120-125656.{md,json}` (mock — не измерение).

## Known issues / risks
- Rules Context не улучшает решения на срезе core-v1 и стоит +19 % за решение (RK-1 подтвердился); включён по умолчанию
  (`AI_COMMANDER_RULES_CONTEXT=on`, A-4) — PO может выключить `off` без изменения кода.
- Дефекты бота BOT-1..3 (QD-25), D-1..D-3 (QD-30..32); dev-диагностика для AI-Повстанцев выдаёт косвенный сигнал (число/время
  решений, токены) — только dev, loopback, opt-in (Q-BE-1, F-5).
- Benchmark мал (14 сценариев, 3 повтора): «эффекта нет» значит «не обнаружен при этой мощности».
- SQLite busy (внешний процесс держит блокировку > 250 ms): коммит → 409 с warn-строкой, запись `AiUsage` → fallback бота.
- Сторонние незакоммиченные файлы в checkout не относятся к SWR-008: `docs/design/`, `.claude/launch.json`, `docs/product/progress-2026-11-20.md`.

## Final decision
accepted — все AC-1..AC-16 passed с доказательствами; review approved (2 раунда); QA пройдено; CI зелёный на `f0a2a12`. Rules Context подключён и безопасен, но измеримого улучшения качества на срезе core-v1 не дал (+19 % стоимости) — см. рекомендации.