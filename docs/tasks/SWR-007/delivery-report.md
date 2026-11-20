# Delivery Report — SWR-007 Node 22 LTS, обновление зависимостей и CI

## Scope
### Сделано
- **Node 22 LTS:** `.nvmrc` `22.23.5` (latest LTS «Jod»), `engines.node` `>=22.22.2` (Node 20 → предупреждение pnpm
  «Unsupported engine»), `@types/node` `22.20.5` во всех пакетах. Вынужденная правка: `test:process` →
  `node --test "scripts/*.test.mjs"` (Node 22 не разворачивает каталог — baseline падал).
- **pnpm 12.21.0** через corepack 0.36.0 из Node 22 (`packageManager`); `onlyBuiltDependencies` → `allowBuilds` (+ `better-sqlite3`);
  без исключений `minimumReleaseAge` (выбраны версии старше суток); `lockfileVersion` 9.0.
- **Обновлены:** `openai` 6.49.0 → 7.59.0; NestJS 11.2.8 → 12.5.1 (+ cli 12.0.13); Prisma 6.19.3 → 7.10.1 (+ driver adapter
  `@prisma/adapter-better-sqlite3` 7.10.1); `vitest` 4.1.12 → 5.1.1; `@testing-library/jest-dom` 6.9.1 → 7.0.1; `jsdom` 29.1.1 → 31.0.1;
  `react-router` 7.18.5 → 8.5.1; `concurrently` 9.2.5 → 10.0.7. Обоснования — таблица решений в `implementation-plan.md`.
- **Отложено:** `i18next` 27 / `react-i18next` 18 — ужесточённые типы `TFunction` требуют правок в `apps/web/src/games/rebellion/**`
  (зона SWR-006); вернуться после её слияния.
- **Prisma 7 без изменения данных:** URL для CLI — `apps/api/prisma.config.ts` (из `.env` берётся только `DATABASE_URL`);
  клиент — через адаптер с `timestampFormat: 'unixepoch-ms'` (формат DateTime как у Prisma 6 — иначе адаптер пишет ISO-текст,
  контрольный прогон в логе); относительный `file:` путь по-прежнему от `prisma/`. Миграции не менялись.
- **CI:** `.github/workflows/ci.yml` — push/PR, `permissions: contents: read`, concurrency, Node из `.nvmrc`, pnpm через corepack,
  кэш pnpm store и браузеров Playwright, `pnpm install --frozen-lockfile`, `pnpm verify`, `check-task` по всем `docs/tasks/SWR-*`,
  отчёт Playwright при падении. Секретов и `OPENAI_*` нет, `apps/api/.env` в CI не создаётся.
- **Стабилизация тестов:** `apps/web/src/test/setup.ts` очищает реальные таймеры, оставленные тестовым файлом (повторы
  `focusWhenReady` срабатывали после teardown jsdom → `document is not defined` под нагрузкой verify).
- **Документация:** README (setup Node 22/corepack, CI), `AGENTS.md` (команды, runtime), `docs/architecture/application.md`
  (§8 runtime, §8.1 Prisma 7 и `.env`, §9), `docs/process/runtime-adapters.md` (текущее окружение).

### Сознательно не делалось
Node 24/26; TypeScript 6/7; Prisma 8 (rc); перевод `apps/api` на ESM; i18next 27; продуктовые изменения.

## Files changed
Инструменты/манифесты/конфиги: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json`,
`apps/web/package.json`, `packages/platform/package.json`, `packages/games/rebellion/package.json`,
`packages/games/forbidden-stars/package.json`, `apps/api/tsconfig.json`, `apps/api/prisma/schema.prisma`,
новые `apps/api/prisma.config.ts`, `.github/workflows/ci.yml`.

**Исходники и тесты (каждый — с причиной), для предсказуемого слияния с SWR-006:**

| Файл | Причина |
|---|---|
| `apps/api/src/main.ts` | Prisma 7: относительный SQLite-URL разрешается от `prisma/` (`resolveSqliteUrl`); комментарий D-1 |
| `apps/api/src/persistence/prisma.service.ts` | Prisma 7: `adapter` вместо `datasourceUrl` |
| `apps/api/src/persistence/sqlite-adapter.ts` (новый) | фабрика адаптера (`unixepoch-ms`) |
| `apps/api/src/persistence/sqlite-url.ts` (новый) | разрешение относительного пути |
| `apps/api/scripts/reset-ai-budget.mjs` | Prisma 7: адаптер; комментарии |
| `apps/api/scripts/e2e-env.mjs`, `apps/api/scripts/e2e-serve.mjs` | только комментарии (Prisma 7 не грузит `.env`) — review #3 |
| `apps/api/test/{upcast-v1,upcast-v2,migration,migration-swr004,migration-swr005b,settings-source,dev-db-upgrade}.int.test.ts` | Prisma 7: `new PrismaClient({ adapter: createSqliteAdapter(url) })` + импорт (1–3 строки) |
| `apps/api/test/ai/{ai-usage-repository,budget,reset-ai-budget}.int.test.ts` | то же (одна строка + импорт); логика AI-тестов не менялась |
| `apps/api/test/env-isolation.int.test.ts` | то же + дочерний скрипт конструирует клиент с адаптером |
| `apps/api/test/support/{pre-migration-db,swr003-db,swr004-db}.ts` | адаптер; `prisma db execute` без `--url` (удалён в Prisma 7) |
| `apps/api/test/sqlite-url.unit.test.ts` (новый) | unit-тест `resolveSqliteUrl` |
| `e2e/support/seed.ts`, `e2e/env-isolation.spec.ts` | Prisma 7: адаптер в e2e-сидере и проверке F-1 |
| `apps/web/src/app/theme/createAppTheme.test.tsx` | jsdom 31 сериализует цвет как `rgb()` |
| `apps/web/src/test/setup.ts` | очистка таймеров после файла (flake под нагрузкой) |
| `apps/api/src/sessions/sessions.repository.ts` | слияние с main (SWR-006): `SQLITE_BUSY` при commit → `VERSION_CONFLICT` (как исход Prisma 6) |
| `apps/api/test/sqlite-adapter.int.test.ts` (новый) | регрессия: второй клиент на том же файле быстро получает распознаваемый busy |
| `apps/api/test/automation-double-submit.int.test.ts` (SWR-006) | TC-CC-06: дубль PASS после конца партии → 422 `errors.gameOver` допустим (версия из main) |
| `e2e/game-setup.spec.ts` (SWR-004) | TC-006 «rapid»: первый клик через локатор (CI flake) |

**Не тронуты:** `apps/api/src/ai/**`, правила Rebellion, `sessions/**`, компоненты web-стола, публичные контракты
(`packages/platform/src`, `packages/games/*/src`) — пустой diff в `artifacts/logs/qa-diff.log`.

Документы: `README.md`, `AGENTS.md`, `docs/architecture/application.md`, `docs/process/runtime-adapters.md`, `docs/tasks/SWR-007/**`.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-config.log`, `artifacts/logs/engines-node20.log`, `artifacts/logs/final-verify.log` |
| AC-02 | passed | `artifacts/logs/pnpm-corepack.log`, `artifacts/logs/clean-install.log`, `implementation-plan.md` |
| AC-03 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-diff.log` |
| AC-04 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-05 | passed | `artifacts/logs/prisma7-fixture-compat.log`, `artifacts/logs/qa-fixture-prisma7.log`, `artifacts/logs/qa-diff.log` |
| AC-06 | passed | `implementation-plan.md`, `artifacts/logs/qa-config.log` |
| AC-07 | passed | `artifacts/logs/qa-ci-workflow.log` (инспекция файла; реальный прогон — AC-12) |
| AC-08 | passed | `artifacts/logs/qa-ci-workflow.log`, `artifacts/logs/prisma7-dotenv-probe.log`, `artifacts/logs/qa-verify.log` |
| AC-09 | passed | `artifacts/logs/final-verify.log`, `artifacts/logs/qa-check-task.log` |
| AC-10 | passed | `artifacts/logs/qa-docs.log` |
| AC-11 | passed | этот отчёт (раздел Files changed) + `artifacts/logs/qa-diff.log`; e2e 118 в `artifacts/logs/final-verify.log` |
| AC-12 | not_run | push/PR ждут явного согласия PO |

## Verification
- lint: passed — `artifacts/logs/final-verify.log`
- typecheck: passed — `artifacts/logs/final-verify.log`
- unit: passed — `artifacts/logs/final-verify.log` (scripts 408, platform 76, rebellion 411, forbidden-stars 5, web 518)
- integration: passed — `artifacts/logs/final-verify.log` (api 499 + 1 opt-in skipped)
- e2e: passed — `artifacts/logs/final-verify.log` (118/118)
- review: passed — `review.md` (approved; minor #1, #3, #6, #7 исправлены)
- clean install: passed — `artifacts/logs/clean-install.log`
- ci run on GitHub: not_run — ветка не запушена (нужно согласие PO)

## QA artifacts
`qa-results.md`, `artifacts/logs/qa-*.log`, `artifacts/logs/final-verify.log`, `artifacts/prisma-compat/*.mjs`.

## Merge with main (SWR-005C + SWR-006), 2026-11-20
PR #1 конфликтовал с `main`; `origin/main` (7861bcd) влит merge-коммитом. Текстовый конфликт — только
`docs/architecture/application.md` §9 (сохранены обе правки). Зависимости main не менял. Полный verify после слияния
(`artifacts/logs/merge-main-verify.log`) выявил 2 падения новых тестов SWR-006 под Prisma 7:
- TC-CC-04 (два app на одном файле БД): better-sqlite3 ждёт блокировку синхронно (5 с по умолчанию, блокируя event loop) и
  падает `P1008 / SQLITE_BUSY`, а Prisma 6 ждал в своих потоках и проигравший видел конфликт версии. Исправлено:
  `timeout` адаптера 250 мс (`SQLITE_BUSY_TIMEOUT_MS`), `isSqliteBusy` → `VERSION_CONFLICT` в `SessionsRepository.commit`;
  регрессионный тест `test/sqlite-adapter.int.test.ts`.
- TC-CC-06 (один app): на последнем ходе дубль PASS читается уже после конца партии → 422 `ILLEGAL_COMMAND` (порядок
  проверок правил не менялся); тест допускал только 409 — допуск расширен для завершённой партии.
Итоговый прогон — `artifacts/logs/merge-main-verify-2.log` (lint/typecheck/test/build/check:bundle зелёные, api 613 + 1 skipped; e2e
не стартовал — порт 3100 был занят e2e-сервером другой сессии) и отдельный e2e — `artifacts/logs/merge-main-e2e.log` (136 passed).

### Второе слияние с main (cb2c3ce — SWR-007 уже влит в main другой сессией с собственными правками)
- `SessionsRepository.commit`: в main любой `P1008` → `VERSION_CONFLICT` при busy-ожидании 5 с; оставлена более узкая проверка
  `isSqliteBusy` (P1008 именно из-за `SQLITE_BUSY`) + `timeout` 250 мс и регрессионный тест `test/sqlite-adapter.int.test.ts`.
- `automation-double-submit.int.test.ts` и `e2e/session-list.spec.ts` — взяты версии main (строже: 422 только с `errors.gameOver`).
- CI на fb0fcf3: 1 из 136 e2e упал — TC-006 «rapid» (`e2e/game-setup.spec.ts`): 5 «сырых» `page.mouse.click` по заранее
  измеренному box не попали в кнопку (ни одного POST в trace) — flake раскладки под нагрузкой CI. Первый клик теперь через
  локатор (ожидание стабильности), остальные — как раньше. Прогон после слияния: `artifacts/logs/merge-main-verify-3.log`
  (exit 0, e2e 136, check-task по всем 9 задачам OK).

## Known issues / risks
- **Слияние с SWR-006:** если SWR-006 добавит код/тест с `new PrismaClient({ datasourceUrl })` — после слияния переключить на
  `createSqliteAdapter`; конфликт `pnpm-lock.yaml` решается `pnpm install` (pnpm 12). Кто сливает вторым — `pnpm install` + полный
  `pnpm verify`. Заметки: side-session notes `swr007-merge-notes.md`.
- **Node 22 — maintenance LTS до 2027-04-30** (Active LTS — 24, LTS — 26): рекомендация PO — следующей задачей перейти на 24/26
  (engines уже допускают).
- e2e при каждом прогоне перезаписывает скриншоты `docs/tasks/SWR-005B/artifacts/screenshots/*` (`CURRENT_SCREENSHOT_TASK`) —
  перед коммитом восстанавливать (`git checkout -- docs/tasks/SWR-005B`), в CI безвредно. Follow-up.
- `apps/web/src/test/setup.ts` маскирует неотменяемые повторы `focusWhenReady` (`focus.ts`) — follow-up после SWR-006: сделать
  повторы отменяемыми и убрать обёртку (review #4).
- CI на push и pull_request — PR из той же репы прогоняется дважды; actions закреплены мажорными тегами (review #8).
- `settings-source.int.test.ts` под Prisma 7 проверяет меньше смысла (Prisma больше не грузит `.env`) — QA O-3.

## Final decision
blocked — AC-01..AC-11 passed; AC-12 (CI на GitHub) ждёт согласия PO на commit + push + PR
