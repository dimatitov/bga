# Implementation plan — SWR-007

## Roles involved
| Role | Executor | Why |
|---|---|---|
| Analyst / Orchestrator | главная сессия | intake, spec, приёмка, отчёт |
| Backend Lead + Worker (tooling) | главная сессия | задача — манифесты/lockfile/конфиги/CI и вынужденные правки; план и реализация сделаны одним исполнителем (допустимо: workflow §3 запрещает совмещать только автора и reviewer/QA) |
| QA Lead | сабагент `qa-lead` | `test-cases.md` до реализации; затем независимое исполнение тест-кейсов |
| Reviewer | сабагент `reviewer` | независимое ревью диффа (автор кода — главная сессия) |

Frontend Lead/Worker не привлекались: в `apps/web` изменились только манифест и одна тестовая проверка (jsdom 31).

## Contracts (frozen before parallel work)
- HTTP API, `packages/platform`, `packages/games/*/src/schema` — **без изменений**.
- `prisma/migrations/**` — без изменений, новых миграций нет; формат хранения DateTime в SQLite (INTEGER, unix ms) — сохраняется.
- Поведение `AIProvider`/`OpenAIProvider`/`MockAIProvider` и их тесты (`apps/api/test/ai/**` в части AI) — без изменений.

## Решения по версиям (2026-11-19, `npm view … engines peerDependencies time`)

pnpm 12 по умолчанию не ставит версии моложе `minimumReleaseAge` (сутки) и при явном `add` дописывает исключения в
`pnpm-workspace.yaml`. Исключений не держим — берём последние версии старше суток.

| Пакет | Было | Стало | Решение | Обоснование / проверка |
|---|---|---|---|---|
| Node (`.nvmrc`) | 20.19.5 | **22.23.5** | upgraded | latest LTS линии 22 (`nvm ls-remote 22`); `engines.node` = `>=22.22.2` (минимум jsdom 31 `^22.22.2`, react-router 8 `>=22.22.0`, `require(esm)` для Nest 12) |
| `@types/node` (все пакеты) | 20.19.43 | **22.20.5** | upgraded | под runtime; peer vitest 5 `^22 \|\| >=24` |
| pnpm (`packageManager`) | 10.34.9 | **12.21.0** | upgraded | corepack 0.36.0 из Node 22.23.5 запускает 12.21.0 (лог `artifacts/logs/pnpm-corepack.log`); pnpm 12 игнорирует `onlyBuiltDependencies` → заменено на `allowBuilds` (+ `better-sqlite3`); `lockfileVersion` остаётся `9.0`; esbuild больше не в дереве (vite 8 = rolldown) |
| `concurrently` | 9.2.5 | **10.0.7** | upgraded | только `pnpm dev`; Node ≥ 22 |
| `vitest` (все пакеты) | 4.1.12 | **5.1.1** | upgraded | без правок конфигов/тестов; все сьюты зелёные |
| `openai` | 6.49.0 | **7.59.0** | upgraded | 7.60.0 моложе суток; без правок кода и тестов AI (fake fetch SDK-совместим) |
| `@nestjs/common,core,platform-express,testing` | 11.2.8 | **12.5.1** | upgraded | пакеты ESM-only; `apps/api` остаётся CommonJS (NodeNext) и грузит их через `require(esm)` (Node ≥ 22.12, без флага); TS 5.9 `module: nodenext` это допускает; **0 правок исходников**; `nest build` + `node dist/main.js` (production) стартуют |
| `@nestjs/cli` | 11.0.24 | **12.0.13** | upgraded | `nest build`/`nest start --watch` |
| `prisma` / `@prisma/client` | 6.19.3 | **7.10.1** | upgraded | generator `prisma-client-js` сохранён (импорты `@prisma/client` не меняются); URL — из `prisma.config.ts`; клиент — через `@prisma/adapter-better-sqlite3` 7.10.1 (`better-sqlite3` 12.x транзитивно) с `timestampFormat: 'unixepoch-ms'`; совместимость данных — `artifacts/logs/prisma7-fixture-compat.log` |
| `@testing-library/jest-dom` | 6.9.1 | **7.0.1** | upgraded | 8.0.0 вышел сегодня (моложе суток) → 7.0.1 (как в брифе); без правок setup |
| `jsdom` | 29.1.1 | **31.0.1** | upgraded | одна вынужденная правка теста: computed `outline` теперь сериализует цвет как `rgb()` |
| `react-router` | 7.18.5 | **8.5.1** | upgraded | 8.5.2 моложе суток; без правок кода, все web-тесты и e2e зелёные |
| `react-i18next` / `i18next` | 17.1.13 / 26.7.2 | — | **deferred** | 27/18 ужесточили типы `TFunction` → ошибки TS в `apps/web/src/games/rebellion/**` (`AvailabilityPicker.tsx`, `TurnPanel.test.tsx`) — это зона SWR-006 (web table). Условие возврата: после слияния SWR-006 отдельной задачей (правки типов ключей перевода) |
| TypeScript | 5.9.3 | — | out of scope | typescript-eslint peer `< 6.1` (spec A-3) |
| Prisma 8 | — | — | out of scope | только rc (spec A-2) |

### Prisma 7 — что именно изменилось
- `schema.prisma`: убран `url` из `datasource` (в Prisma 7 запрещён).
- `apps/api/prisma.config.ts` (новый): CLI берёт `DATABASE_URL` из окружения, а если его нет — **только эту переменную** из
  `apps/api/.env` (`node:util parseEnv`); `OPENAI_*` в процесс Prisma CLI больше не попадают никогда (Prisma 7 не грузит `.env`
  сам — первопричина D-1 SWR-005B исчезла; защитные blanking-механизмы оставлены как есть). Относительный `file:` путь
  разрешается от `prisma/` (как в Prisma ≤ 6). `migrations.path` не задан — по умолчанию папка рядом со схемой (работает и с
  `--schema` в миграционных тестах).
- `src/persistence/sqlite-adapter.ts` (новый): `createSqliteAdapter(url)` — `PrismaBetterSqlite3` с `unixepoch-ms`. Без этого
  адаптер пишет DateTime текстом ISO-8601 рядом с INTEGER-значениями Prisma 6 (контрольный прогон в логе совместимости).
- `src/persistence/sqlite-url.ts` (новый): `resolveSqliteUrl(url, schemaDir)` — относительный путь → от `prisma/`
  (адаптер иначе разрешал бы от cwd, и `file:./dev.db` указывал бы на `apps/api/dev.db`). Используется в `main.ts` и
  `prisma.config.ts`; unit-тест `test/sqlite-url.unit.test.ts`.
- e2e: `e2e/support/seed.ts` (сидер БД e2e) и `e2e/env-isolation.spec.ts` создают клиент через тот же адаптер.
- `prisma db execute` в Prisma 7 не принимает `--url` → тестовые хелперы передают URL через `DATABASE_URL` (как и раньше для
  `migrate`).

## Subtasks and file ownership
| Subtask | Role | OWNED FILES | Depends on |
|---|---|---|---|
| T1 Node 22 + pnpm 12 | backend-worker (главная сессия) | `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `*/package.json` | — |
| T2 web deps | backend-worker (главная сессия) | `apps/web/package.json`, `apps/web/src/app/theme/createAppTheme.test.tsx`, `apps/web/src/test/setup.ts` | T1 |
| T3 openai 7 + Nest 12 | backend-worker (главная сессия) | `apps/api/package.json` | T1 |
| T4 Prisma 7 | backend-worker (главная сессия) | `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/src/persistence/{prisma.service,sqlite-adapter,sqlite-url}.ts`, `apps/api/src/main.ts`, `apps/api/tsconfig.json`, `apps/api/scripts/reset-ai-budget.mjs`, `apps/api/test/**` (только конструирование клиента / `db execute`), `e2e/support/seed.ts`, `e2e/env-isolation.spec.ts` | T3 |
| T5 CI | backend-worker (главная сессия) | `.github/workflows/ci.yml` | T1 |
| T6 Docs | analyst | `README.md`, `AGENTS.md`, `docs/architecture/application.md`, `docs/process/runtime-adapters.md` | T1–T5 |

## Dependency graph
T1 → (T2 ‖ T3 → T4) → T5 → T6 → review ‖ QA.

## Implementation log (filled by workers)
| Subtask | Changed files | Tests run (command → result) | Limitations |
|---|---|---|---|
| T1 | `.nvmrc`, root/6× `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | baseline `pnpm verify` под Node 22 до изменений → `test:process` падал (`node --test scripts/`) → `artifacts/logs/baseline-node22-verify.log`; исправлено на `node --test "scripts/*.test.mjs"` | — |
| T2 | `apps/web/package.json`, `createAppTheme.test.tsx`, `src/test/setup.ts` | `pnpm --filter @bga/web typecheck` OK; `pnpm --filter @bga/web test` 518/518. Второй полный verify (`artifacts/logs/verify-run2.log`): 518/518, но Vitest зафиксировал 2 unhandled errors — таймер повтора `focusWhenReady` (`core-v1/panels/focus.ts`, ≤ 12×16 мс) сработал после teardown jsdom (`document is not defined`); воспроизводится только под нагрузкой (3 изолированных прогона чистые). Исправлено в тестовой инфраструктуре (`src/test/setup.ts`: незавершённые реальные таймеры файла очищаются в `afterAll`), продуктовый `focus.ts` (зона SWR-006) не тронут | i18next deferred |
| T3 | `apps/api/package.json` | `pnpm --filter @bga/api test` 492 + 1 skipped; `nest build`; `NODE_ENV=production node dist/main.js` стартует | — |
| T4 | см. «Prisma 7» | `pnpm --filter @bga/api test` 499 + 1 skipped; `artifacts/logs/prisma7-fixture-compat.log`, `artifacts/logs/prisma7-dotenv-probe.log`; первый полный verify (`artifacts/logs/verify-run1.log`) → 25 e2e упали: e2e-сидер (`e2e/support/seed.ts`) и `e2e/env-isolation.spec.ts` тоже конструировали клиент через `datasourceUrl` → исправлено | — |
| T5 | `.github/workflows/ci.yml` | реальный прогон — только после push (AC-12) | actionlint локально не установлен |
| T1 (engines) | — | Node 20.19.5 / 22.12.0 → pnpm `WARN Unsupported engine`, Node 22.23.5 — без предупреждения → `artifacts/logs/engines-node20.log` (жёсткий отказ не включали — spec Q-2) | — |
| итог | — | `pnpm verify` → `artifacts/logs/integration-verify.log` | — |
