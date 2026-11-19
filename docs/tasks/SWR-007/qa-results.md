# QA results — SWR-007

Исполнитель: `qa-lead` (сабагент; код SWR-007 не писал). Дата: 2026-11-19. Node `v22.23.5`, corepack `0.36.0`, pnpm `12.21.0`.
Всё из корня worktree `swr-007-node22-ci-520813`. База сравнения — `HEAD` = `7195758` (ветка от него; `main` с тех пор ушёл на
`c1ace26` только с `docs/product/status-and-next-steps.md`, поэтому diff считался относительно `HEAD`/рабочего дерева —
`artifacts/logs/qa-diff.log`). `apps/api/prisma/dev.db`, основной checkout, `node_modules` и `apps/api/.env` не трогались
(`apps/api/.env` в worktree отсутствует — QA проверил только существование, не открывал).

Статус `not_applicable` в таблице Executed (конвенция `test-cases.md`) — ветка кейса для «deferred», а решение «upgraded»
(или наоборот). В таблице AC используются только `passed/failed/not_run/blocked`.

Собственные логи QA: `artifacts/logs/qa-verify.log` (независимый `pnpm verify`, exit 0), `artifacts/logs/qa-config.log`,
`artifacts/logs/qa-diff.log`, `artifacts/logs/qa-ci-workflow.log`, `artifacts/logs/qa-docs.log`,
`artifacts/logs/qa-fixture-prisma7.log`, `artifacts/logs/qa-check-task.log`. Чужие логи переиспользованы только там, где кейс
ровно то, что в них показано (указано явно).

Регрессия после review-фиксов оркестратора (комментарии в `apps/api/src/main.ts`, `apps/api/scripts/{reset-ai-budget,e2e-env,e2e-serve}.mjs`,
перенос doc-комментария в `createAppTheme.test.tsx`, порядок `@bga` в `apps/web/package.json`, восстановление скриншотов SWR-005B):
мой `qa-verify.log` снят **до** этих правок; после них оркестратор прогнал `artifacts/logs/final-verify.log` (exit 0, e2e 118 passed) —
QA его не перезапускал, только прочитал хвост лога.

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-01 | passed | `cat .nvmrc; od -c .nvmrc; node -v` | `artifacts/logs/qa-config.log`: `.nvmrc` = `22.23.5\n`, `node -v` = `v22.23.5` |
| TC-02 | passed | `semver.satisfies(v, engines.node)` (semver 7.8.6 из store); `npm view <pkg>@<ver> engines` | `artifacts/logs/qa-config.log`: `engines.node` = `>=22.22.2`; 22.23.5/24.22.3/26.13.1 → true; максимум требований обновлённых: jsdom 31 `^22.22.2`, react-router 8 `>=22.22.0`, vitest 5 `^22.12.0`, openai 7/concurrently 10/jest-dom 7 `>=22` — нижняя граница не ниже ни одного |
| TC-03 | passed | то же `semver.satisfies` для 20.19.5, 20.99.0, 22.11.0 (+ 22.12.0, 22.22.1); поведение pnpm под Node 20 — переиспользован лог оркестратора | `artifacts/logs/qa-config.log` (все → false); `artifacts/logs/engines-node20.log`: Node 20.19.5 / 22.12.0 → `WARN Unsupported engine`, exit 0 (предупреждение, не отказ — допустимо по ответу Q-2) |
| TC-04 | passed | `grep -rn '"@types/node"' …`; `git show main:<f>` для сравнения | `artifacts/logs/qa-config.log`: 6 манифестов, все `22.20.5`; на базе те же 6 файлов с `20.19.43` — набор не сократился |
| TC-05 | passed | `(node -v; pnpm -v; pnpm verify; echo EXIT CODE) > qa-verify.log` | `artifacts/logs/qa-verify.log`: строки 1–2 `v22.23.5` / `12.21.0`, `EXIT CODE: 0` |
| TC-06 | passed | `node -p packageManager`; `corepack -v`; `corepack pnpm -v`; `pnpm -v` | `artifacts/logs/qa-config.log`: `pnpm@12.21.0`, corepack `0.36.0`, `corepack pnpm -v` = `12.21.0` |
| TC-07 | passed | инспекция `implementation-plan.md` | строка pnpm: 10.34.9 → 12.21.0, причина, `allowBuilds` вместо `onlyBuiltDependencies`, `lockfileVersion` 9.0 (R-4 учтён) |
| TC-08 | not_run | `rm -rf node_modules && pnpm install --frozen-lockfile` | запрещено брифом QA (не трогать `node_modules`, без `pnpm install`). Косвенно: `pnpm-lock.yaml` `lockfileVersion: '9.0'` (`artifacts/logs/qa-config.log`); чистая установка будет проверена только CI (AC-12) |
| TC-09 | not_run | изменить версию без lockfile → `pnpm install --frozen-lockfile` в scratch | запрещено брифом (`pnpm install`); негативная защита frozen lockfile не проверена QA |
| TC-10 | passed | загрузка нативных модулей: `better-sqlite3` (`:memory:`, `sqlite_version()`), `require('@swc/core')`, `require('@prisma/adapter-better-sqlite3')`; `ls` сгенерированного `.prisma/client`; `cat pnpm-workspace.yaml` | `artifacts/logs/qa-config.log`: все загружаются (sqlite 3.53.2), клиент Prisma 7.10.1 сгенерирован, `allowBuilds` содержит `@prisma/client`, `@prisma/engines`, `@swc/core`, `better-sqlite3`, `prisma`; esbuild в дереве нет (vite 8). «Ignored build scripts» в выводе install не проверено (install не запускался) |
| TC-11 | passed | `grep '"openai"' apps/api/package.json`; версия установленного пакета (чтение `package.json` через fs) | `artifacts/logs/qa-config.log`: манифест и установленный — `7.59.0` (upgraded) |
| TC-12 | passed | `pnpm verify` (часть `pnpm test`) | `artifacts/logs/qa-verify.log`: apps/api `Tests 499 passed \| 1 skipped (500)`, `Test Files 54 passed \| 1 skipped` (≥ 492 + 1) |
| TC-13 | passed | `git diff --stat HEAD -- apps/api/test`; `git diff` по `test/ai`, `dev-ai-*`, `support/openai-fake-fetch.ts`, `support/ai-fakes.ts`, `test/setup` | `artifacts/logs/qa-diff.log`: в AI-слое изменены 3 файла (`ai-usage-repository`, `budget`, `reset-ai-budget` int-тесты) — только `new PrismaClient({ datasourceUrl })` → `{ adapter: createSqliteAdapter(url) }` (вынуждено Prisma 7, не SDK openai); ассертов/кейсов не удалено; `dev-ai-*`, fake fetch, ai-fakes, `test/setup` — без изменений. Перечисление в delivery report — см. TC-39 |
| TC-14 | passed | `git diff HEAD -- apps/api/vitest.config.mts apps/api/test/setup/`; guard-тест в составе `pnpm verify` | `artifacts/logs/qa-diff.log`: diff пуст, `setupFiles: ['test/setup/blank-openai-env.ts', 'test/setup/no-network.ts']`; `artifacts/logs/qa-verify.log` — api-набор зелёный целиком (включая `no-network.unit.test.ts`) |
| TC-15 | passed | api-набор в `pnpm verify` | `artifacts/logs/qa-verify.log` (все файлы api зелёные); `artifacts/logs/qa-diff.log` — `openai-provider/client/errors`, `retry` unit-тесты не менялись |
| TC-16 | passed | `grep '"@nestjs/' apps/api/package.json`; инспекция плана | `artifacts/logs/qa-config.log`: common/core/platform-express/testing `12.5.1`, cli `12.0.13`; план обосновывает `require(esm)` из CommonJS (R-1, A-5: 0 правок исходников ради Nest) |
| TC-17 | passed | `pnpm verify` (`pnpm build` → `nest build`; `pnpm e2e` → `e2e:serve`) | `artifacts/logs/qa-verify.log`: build прошёл, e2e `118 passed (4.8m)`, `EXIT CODE: 0` |
| TC-18 | passed | `git diff --name-only HEAD -- apps/api/src` + untracked | `artifacts/logs/qa-diff.log`: `src/main.ts`, `src/persistence/prisma.service.ts` (изменены), `src/persistence/sqlite-adapter.ts`, `src/persistence/sqlite-url.ts` (новые) — все из-за Prisma 7, ни одного из-за Nest; массового перевода на ESM нет |
| TC-19 | passed | `grep prisma/@prisma/better-sqlite3 apps/api/package.json`; инспекция `schema.prisma`, `prisma.config.ts` | `artifacts/logs/qa-config.log`: `prisma`/`@prisma/client`/`@prisma/adapter-better-sqlite3` `7.10.1` (не rc); `better-sqlite3` 12.11.1 транзитивно; `url` убран из datasource, URL — из `prisma.config.ts` |
| TC-20 | passed | `git diff --stat HEAD -- apps/api/prisma/migrations`; `git status --porcelain apps/api/prisma/migrations` | `artifacts/logs/qa-diff.log`: оба пусты |
| TC-21 | passed | `DATABASE_URL=file:<abs>/apps/api/.tmp/qa-swr007-clean.db npx --no-install prisma migrate deploy`; migration/upcast-тесты в `pnpm verify` | `artifacts/logs/qa-fixture-prisma7.log`: 4 миграции применены, exit 0, все 4 в `_prisma_migrations` завершены; `artifacts/logs/qa-verify.log` — api-набор зелёный |
| TC-22 | passed | `cp .tmp/swr007-fixture-prisma6.orig.db .tmp/qa-swr007-fixture.db`; `prisma migrate deploy` на копии; байт-идентичная копия `fixture-check-prisma7.mjs` в `apps/api/.tmp/qa-fixture-check.mjs` → `node .tmp/qa-fixture-check.mjs file:<abs копии>`; `sqlite3 … typeof(createdAt)` | `artifacts/logs/qa-fixture-prisma7.log`: `No pending migrations`; чтение `DATES_AND_FIELDS_MATCH true`; запись (новое событие, `AiUsage`, `version` 4) и перечитывание OK, exit 0; все DateTime после записи Prisma 7 — `integer` (формат Prisma 6 сохранён). Объём данных — согласованный в Q-1 (1 сессия с событиями + `AiUsage`), не hotseat/vs-AI через HTTP (см. ограничения) |
| TC-23 | passed | `shasum -a 256` оригинала до/после; `git ls-files \| grep .db`; `ls apps/api/prisma/dev.db` | `artifacts/logs/qa-fixture-prisma7.log`: `.orig.db` sha256 `c1cb18b3…a62e` до и после (совпадает с `artifacts/logs/prisma6-fixture.log`); `artifacts/logs/qa-diff.log`: `.db` в git нет; `apps/api/prisma/dev.db` в worktree отсутствует, ни одна команда QA его не адресовала |
| TC-24 | passed | env-тесты в составе `pnpm verify`; переиспользован зонд оркестратора | `artifacts/logs/qa-verify.log` (api зелёный, включая `env-isolation`, `env.unit`, `env-example.unit`); `artifacts/logs/prisma7-dotenv-probe.log`: Prisma 7 не грузит `.env` (`SWR007_PROBE=undefined`) |
| TC-25 | passed | инспекция таблицы решений `implementation-plan.md` | строки есть для всех 7: jest-dom 7.0.1, vitest 5.1.1, concurrently 10.0.7, react-router 8.5.1, jsdom 31.0.1 — upgraded (версия + почему + чем проверено); react-i18next/i18next — deferred (причина: типы `TFunction` в зоне SWR-006; условие возврата: после слияния SWR-006) |
| TC-26 | passed | `grep -rnE '"(jest-dom\|vitest\|concurrently\|react-router\|react-i18next\|i18next\|jsdom\|vite)"' …` | `artifacts/logs/qa-config.log`: версии = таблице решений; `vitest` 5.1.1 во всех 5 пакетах, `vite` 8.3.6 (в peer 6–8), `@types/node` 22 |
| TC-27 | passed | `pnpm verify` (web test + `pnpm build`) | `artifacts/logs/qa-verify.log`: web `Tests 518 passed (518)`, 0 «unhandled error»; build зелёный. `pnpm dev` (concurrently) вручную не запускался — флаги `-k --names --prefix-colors` не изменились (только версия) |
| TC-28 | passed | `pnpm verify` | `artifacts/logs/qa-verify.log`: `EXIT CODE: 0`; scripts `# tests 408 / pass 408`, platform 76, rebellion 411, forbidden-stars 5, web 518, api 499 + 1 skipped, e2e 118 — все ≥ baseline; регресс `Cannot find module …/scripts` устранён |
| TC-29 | passed | `for d in docs/tasks/SWR-*; do node scripts/check-task.mjs "$d"; done` | `artifacts/logs/qa-check-task.log`: SWR-000/002/003/004/005/005B/007 — exit 0, `overall fail=0` |
| TC-30 | passed | инспекция `.github/workflows/ci.yml`; `grep` ключевых строк | `artifacts/logs/qa-ci-workflow.log`: `push` + `pull_request`; `setup-node` с `node-version-file: .nvmrc`; `corepack enable` (pnpm из `packageManager`); `actions/cache` store с ключом от `.nvmrc` + `pnpm-lock.yaml`; `install --frozen-lockfile`; `playwright install --with-deps chromium` (при cache-hit — `install-deps`); `pnpm verify`; цикл `check-task`; `permissions: contents: read`; `concurrency` + `cancel-in-progress: true` |
| TC-31 | passed | `grep -nE 'continue-on-error\|\|\| *true\|set \+e' ci.yml`; инспекция цикла | `artifacts/logs/qa-ci-workflow.log`: совпадений нет (grep exit 1); цикл накапливает `status=1` и `exit "$status"` |
| TC-32 | passed | парсинг js-yaml 4.3.2 из store; `git ls-remote` тегов actions | `artifacts/logs/qa-ci-workflow.log`: YAML валиден, один job `verify` на `ubuntu-latest`, без `strategy`/матрицы, 12 шагов; теги `checkout@v7`, `setup-node@v7`, `cache@v6`, `upload-artifact@v7` существуют. actionlint не установлен — семантику Actions проверит только реальный run (AC-12) |
| TC-33 | passed | `grep -rnE 'secrets\.\|OPENAI_\|sk-' .github/workflows/` | `artifacts/logs/qa-ci-workflow.log`: единственное совпадение — комментарий строки 2 (`OPENAI_*` в тексте пояснения); `secrets.` и ключей нет |
| TC-34 | passed | инспекция `ci.yml`, `apps/api/scripts/ensure-env.mjs`, scripts `verify`/`db:prepare` | `artifacts/logs/qa-ci-workflow.log`: CI `.env` не создаёт вовсе (`ensure-env` вызывается только из `pnpm dev`, не из `verify`); ни один шаг не пишет ключ. Отклонение от буквы AC-08 — см. дефект D-2 (minor). Локальный `qa-verify.log` снят тоже без `apps/api/.env` — т. е. в условиях, как в CI |
| TC-35 | passed | api-набор в `pnpm verify` | `artifacts/logs/qa-verify.log` (api зелёный, включая `env-isolation`, `no-network`, `dev-ai-security`); `artifacts/logs/qa-diff.log`: `dev-ai-*`/`test/setup` не изменены; `env-isolation.int.test.ts` изменён только в конструировании клиента |
| TC-36 | passed | `grep` по README, AGENTS.md, `docs/architecture/application.md`, `docs/process/runtime-adapters.md` | `artifacts/logs/qa-docs.log`: Node 22.23.5 / `nvm use`, `corepack enable`, pnpm 12.21.0 = `packageManager`, NestJS 12 / Prisma 7 / openai 7 / Vitest 5 / React Router 8, i18next deferred, CI описан (без секретов) |
| TC-37 | passed | `grep -rnE 'Node(\.js)? ?20\|20\.19\|node 20' README.md AGENTS.md docs/architecture docs/process` | `artifacts/logs/qa-docs.log`: 2 вхождения, оба не «текущее требование»: README:27 «Node 20 не поддерживается»; runtime-adapters.md:13 — историческая строка таблицы Stage A «`v20.19.5` (с SWR-007 — `v22.23.5`)» |
| TC-38 | passed | `git diff --stat HEAD -- packages/platform packages/games/*/src`; e2e и api-контракты в `pnpm verify` | `artifacts/logs/qa-diff.log`: только `packages/platform/package.json` (версии dev-deps), `src`/`schema` не тронуты; `artifacts/logs/qa-verify.log`: e2e 118 passed, api зелёный |
| TC-39 | not_run | `git diff --name-only HEAD -- apps packages e2e scripts` + untracked против delivery report | `artifacts/logs/qa-diff.log` содержит полный список; `delivery-report.md` на момент QA ещё не заполнен (раздел «Files changed» пуст) — сверка невозможна до DELIVERY |
| TC-40 | not_run | push + PR + `gh run view` | push не согласован PO (бриф: AC-12 требует явного согласия) |
| TC-41 | not_run | инспекция логов CI run | зависит от TC-40 |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-config.log` (`.nvmrc` 22.23.5, engines >=22.22.2 исключает 20.x и допускает 22.23.x, @types/node 22.20.5 во всех 6 пакетах); `artifacts/logs/qa-verify.log` (первая строка v22.23.5); `artifacts/logs/engines-node20.log` |
| AC-02 | passed | `artifacts/logs/qa-config.log` (packageManager pnpm@12.21.0 = corepack pnpm -v 12.21.0; allowBuilds; нативные модули грузятся); `artifacts/logs/pnpm-corepack.log`; обоснование — `implementation-plan.md`. Оговорка: pnpm install --frozen-lockfile QA сам не запускал (запрет брифа; TC-08/09 not_run) — опора на установку оркестратора и будущий CI |
| AC-03 | passed | `artifacts/logs/qa-config.log` (openai 7.59.0); `artifacts/logs/qa-verify.log` (api 499 + 1 skipped); `artifacts/logs/qa-diff.log` (3 AI-теста изменены только в конструировании PrismaClient — Prisma 7; vitest.config.mts/test/setup без изменений, guard активен) |
| AC-04 | passed | `artifacts/logs/qa-config.log` (Nest 12.5.1 / cli 12.0.13); `artifacts/logs/qa-verify.log` (nest build, e2e через e2e:serve 118 passed); `artifacts/logs/qa-diff.log` (0 правок src ради Nest) |
| AC-05 | passed | `artifacts/logs/qa-diff.log` (migrations без изменений); `artifacts/logs/qa-fixture-prisma7.log` (clean migrate deploy OK; копия фикстуры Prisma 6 читается и пишется Prisma 7, DateTime остаются integer; sha256 .orig.db не изменился; dev.db не адресовался); `artifacts/logs/prisma6-fixture.log` |
| AC-06 | passed | `implementation-plan.md` (таблица решений: 5 upgraded + i18next/react-i18next deferred с условием возврата); `artifacts/logs/qa-config.log` (фактические версии = решениям); `artifacts/logs/qa-verify.log` (web 518, e2e 118). Итог в delivery report — проверяется на DELIVERY |
| AC-07 | passed | `artifacts/logs/qa-ci-workflow.log` (все обязательные шаги, contents: read, concurrency cancel-in-progress, нет continue-on-error, YAML валиден, теги actions существуют). Реальное исполнение — AC-12 |
| AC-08 | passed | `artifacts/logs/qa-ci-workflow.log` (нет secrets.*, нет OPENAI_*-переменных — одно вхождение в комментарии; .env в CI не создаётся вовсе); `artifacts/logs/qa-verify.log` (guard-тесты зелёные, прогон без apps/api/.env). Буква «.env из .env.example» не выполнена буквально — см. D-2 (minor, решение Analyst) |
| AC-09 | passed | `artifacts/logs/qa-verify.log` (EXIT CODE: 0 под v22.23.5); `artifacts/logs/qa-check-task.log` (все 7 папок exit 0); после review-фиксов — `artifacts/logs/final-verify.log` (оркестратор, exit 0) |
| AC-10 | passed | `artifacts/logs/qa-docs.log` (README, AGENTS.md, application.md, runtime-adapters.md обновлены; 2 вхождения «Node 20» — исторические/отрицающие) |
| AC-11 | not_run | Часть «контракты и HTTP API не изменены» проверена: `artifacts/logs/qa-diff.log` (пустой diff packages/platform/src, packages/games/*/src), e2e 118 passed в `artifacts/logs/qa-verify.log`. Часть «delivery report перечисляет каждый тронутый файл» не проверяема: `delivery-report.md` ещё не заполнен (TC-39 not_run) |
| AC-12 | not_run | push ветки/PR не согласованы PO (требуется явное согласие человека) |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log` (eslint --max-warnings=0 + All matched files use Prettier code style!)
- typecheck: passed — `artifacts/logs/qa-verify.log` (pnpm typecheck в цепочке verify, exit 0)
- unit: passed — `artifacts/logs/qa-verify.log` (scripts 408, platform 76, rebellion 411, forbidden-stars 5, web 518 — 0 fail)
- integration: passed — `artifacts/logs/qa-verify.log` (api 499 passed + 1 opt-in skipped); `artifacts/logs/qa-fixture-prisma7.log` (Prisma 6 → 7 на копии фикстуры)
- e2e: passed — `artifacts/logs/qa-verify.log` (118 passed); после review-фиксов `artifacts/logs/final-verify.log` (118 passed, exit 0; прогон оркестратора)
- check-task: passed — `artifacts/logs/qa-check-task.log` (все docs/tasks/SWR-* exit 0)
- ci-run: not_run — push не согласован PO (AC-12)
- clean-install: passed — `artifacts/logs/clean-install.log` (оркестратор: чистая копия без node_modules, frozen lockfile, typecheck, api 499; TC-08 не QA)

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-1 | minor | Из `apps/api` запустить `node ../../docs/tasks/SWR-007/artifacts/prisma-compat/fixture-check-prisma7.mjs file:<abs копии>` (как описан артефакт) | Скрипт-доказательство AC-05 воспроизводим из своего места хранения | `ERR_MODULE_NOT_FOUND: Cannot find package '@prisma/client'` — ESM разрешает импорты от каталога скрипта (`docs/…`), а не от cwd; работает только копия в `apps/api/.tmp/` (`artifacts/logs/qa-fixture-prisma7.log`). Нужно: указать в `prisma7-fixture-compat.log`/delivery report, что запускается копия из `apps/api/.tmp/`, или задокументировать команду | fixed — orchestrator: в обоих скриптах `artifacts/prisma-compat/` добавлена инструкция запуска (копия в apps/api/.tmp) |
| D-2 | minor | Инспекция `.github/workflows/ci.yml` против AC-08 / сценария 3 спецификации | «`.env` в CI создаётся из `.env.example` (`OPENAI_ENABLED=false`)» | CI не создаёт `apps/api/.env` вообще (комментарий ci.yml:2–3; `ensure-env` только в `pnpm dev`). Безопасность не хуже (ключа нет нигде), локальный verify без `.env` зелёный — но формулировка AC и README/ci.yml расходятся. Нужно решение Analyst: поправить формулировку AC-08/спеки или добавить шаг `cp .env.example` | fixed — analyst: формулировка AC-08 и правила в `specification.md` поправлены (в CI `.env` не создаётся) |

### Наблюдения (не дефекты)
- O-1: в `node_modules/.pnpm` остались осиротевшие каталоги `@prisma+client@6.19.3…`, `@prisma+client@7.10.1_prisma@6.19.3…`, `prisma@6.19.3…` от промежуточных установок; `apps/api` резолвит корректный `@prisma/client@7.10.1_prisma@7.10.1…` (`artifacts/logs/qa-config.log`). На CI (чистая установка) не влияет.
- O-2: `qa-verify.log` (до review-фиксов) e2e перезаписал `docs/tasks/SWR-005B/artifacts/screenshots/*.png` (существующее поведение `e2e/dev-ai.spec.ts`, `CURRENT_SCREENSHOT_TASK = 'SWR-005B'`); оркестратор сообщил, что скриншоты восстановлены — QA это не перепроверял. Каждый будущий `pnpm verify` (и в CI) снова их перезапишет — стоит вынести в отдельную задачу.
- O-3: `settings-source.int.test.ts` проверял, что Prisma 6 при импорте подкладывает `.env`; в Prisma 7 этого механизма нет, тест стал слабее по смыслу (проходит, т. к. загрязнения не бывает). Не регресс.
- O-4: строки `ApiExceptionFilter … status=500` в выводе api-тестов — ожидаемые негативные кейсы (такие же есть в `artifacts/logs/verify-run1.log`); тесты зелёные.
- Ограничение TC-22: данные фикстуры — одна синтетическая сессия + `AiUsage` (согласовано в Q-1); HTTP-путь (GET/команда/рестарт) на данных Prisma 6 не проверялся — opt-in `dev-db-upgrade.int.test.ts` требует реальной dev-БД, а единственная (`apps/api/prisma/dev.db` основного checkout) запрещена.
