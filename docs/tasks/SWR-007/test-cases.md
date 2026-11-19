# Test cases — SWR-007

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-19).
Это **дизайн**: ничто здесь не является доказательством `passed` — результаты прогонов только в `qa-results.md` (с логами
в `artifacts/logs/`). Задача tooling-уровня: большинство кейсов — команды и инспекция файлов, а не новые автотесты.

## Preconditions (общие)

- Все команды — из корня worktree `swr-007-node22-ci-520813`, под Node из `.nvmrc` (`nvm use`). Основной checkout, его
  `node_modules` и `apps/api/prisma/dev.db` не трогаются (ни чтением с записью, ни копированием «на месте»).
- **База сравнения** — `main` @ `7195758` (ветка SWR-007 от него). Регрессионная линия (SWR-005B delivery report):
  scripts 408, platform 76, rebellion 411, forbidden-stars 5, web 518, api 492 (+1 opt-in skipped), e2e 118. Рост допустим;
  падение числа кейсов в любом наборе — только с таблицей «старый → новый» в `qa-results.md`.
- **Две ветки исхода апгрейда.** Для каждого кандидата (openai, NestJS, Prisma, jest-dom, vitest, concurrently, react-router,
  react-i18next/i18next, jsdom, pnpm) итог — `upgraded` или `deferred`. Кейсы с пометкой «если upgraded» / «если deferred»
  исполняются по фактическому решению из `implementation-plan.md`; неприменимая ветка в `qa-results.md` — `not_applicable`
  со ссылкой на решение (не `passed`).
- Сетевые вызовы к OpenAI в автотестах запрещены; реальный ключ не читается и не печатается ни QA, ни агентами.
  `apps/api/.env` QA не открывает.
- Логи: `artifacts/logs/<tc-id>-*.log` (имя — на усмотрение исполнителя, ссылка — в `qa-results.md`).

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-01 | AC-01 | config | positive | `cat .nvmrc`; `nvm use && node -v` | `.nvmrc` = `22.23.5` (одна строка, без `v`); `node -v` → `v22.23.5` |
| TC-02 | AC-01 | config | positive | `node -p "require('./package.json').engines.node"`; `node -e` со `semver.satisfies` (из `node_modules/.pnpm/semver@*`) для `22.23.5`, `24.22.3`, `26.13.1` | Диапазон допускает 22.23.x (и не запрещает 24/26 — A-1); нижняя граница ≥ максимального `engines.node` среди обновлённых пакетов (например, `react-router` 8 → ≥ 22.22.0, `jsdom` 31 → ≥ 22.22.2, `vitest` 5 → ≥ 22.12), проверить `npm view <pkg>@<ver> engines` для каждого `upgraded` |
| TC-03 | AC-01 | config | negative | Та же проверка `semver.satisfies` для `20.19.5`, `20.99.0`, `22.11.0`; затем (опционально) `nvm exec 20.19.5 corepack pnpm install --frozen-lockfile --offline` в **копии** worktree в scratch | Все три версии **не** удовлетворяют `engines.node`; при запуске под Node 20 — предупреждение/ошибка `Unsupported engine` (или отказ corepack/pnpm); поведение зафиксировано в логе как фактическое (warn vs error) |
| TC-04 | AC-01 | config | positive | `grep -rn '"@types/node"' package.json apps/*/package.json packages/platform/package.json packages/games/*/package.json e2e/package.json 2>/dev/null` | Каждое вхождение — линия `22.x` (точная версия, как принято в репо); ни одного `20.`; набор пакетов с `@types/node` не сократился относительно `main` (`git diff main -- '**/package.json'`) |
| TC-05 | AC-01, AC-09 | process | positive | `pnpm verify 2>&1 \| tee artifacts/logs/qa-verify.log`, первой строкой лога — `node -v; corepack pnpm -v` | Лог начинается с `v22.23.5`; exit 0 (см. TC-28) |
| TC-06 | AC-02 | config | positive | `node -p "require('./package.json').packageManager"`; `corepack pnpm -v` (Node 22.23.5, corepack 0.36.0 — `corepack -v`) | `packageManager` = `pnpm@<X.Y.Z>`; `corepack pnpm -v` печатает ровно `X.Y.Z`; лог сохранён |
| TC-07 | AC-02 | doc | positive | Инспекция `implementation-plan.md` | Есть раздел решения по pnpm: остаться на 10.x или перейти (11/12) — с причиной, учтён R-4 (формат lockfile, настройки сборки) |
| TC-08 | AC-02 | process | positive | `rm -rf` **только** `node_modules` worktree (в worktree, не в основном checkout) → `corepack pnpm install --frozen-lockfile 2>&1 \| tee …` | exit 0; нет `ERR_PNPM_OUTDATED_LOCKFILE`/`LOCKFILE_CONFIG_MISMATCH`; `git status --porcelain pnpm-lock.yaml` пусто после установки |
| TC-09 | AC-02 | process | negative | В scratch-копии: изменить версию любой зависимости в `apps/api/package.json` без обновления lockfile → `corepack pnpm install --frozen-lockfile` | Ненулевой код выхода (frozen lockfile реально защищает CI); копия удалена после проверки |
| TC-10 | AC-02 | process | positive | После TC-08: `ls node_modules/.prisma/client` (или путь generated client Prisma 7), `node -e "require('@swc/core')"` из `apps/api`, `node -e "require('esbuild')"` из `apps/web`; при Prisma 7 — `node -e "require('better-sqlite3')"` из `apps/api`; инспекция `pnpm-workspace.yaml` (`onlyBuiltDependencies`/аналог новой версии pnpm) | Prisma client сгенерирован `postinstall`; нативные бинарники SWC/esbuild (и `better-sqlite3`, если добавлен) загружаются; в выводе install нет «Ignored build scripts» для этих пакетов; новые нативные пакеты добавлены в список разрешённых |
| TC-11 | AC-03 | config | positive | `node -p "require('./apps/api/node_modules/openai/package.json').version"`; `grep '"openai"' apps/api/package.json` | Если upgraded: `7.x` в манифесте и в установленном пакете. Если deferred: `6.49.0` и в `implementation-plan.md` — причина + условие возврата |
| TC-12 | AC-03 | integration | positive | `pnpm --filter @bga/api test 2>&1 \| tee …` | exit 0; число тестов api ≥ 492 (+1 opt-in skipped); все `test/ai/**` и `test/dev-ai-*.int.test.ts` проходят |
| TC-13 | AC-03 | process | negative | `git diff --stat main -- apps/api/test` и `git diff main -- apps/api/test/ai apps/api/test/dev-ai-*.ts apps/api/test/support/openai-fake-fetch.ts apps/api/test/support/ai-fakes.ts apps/api/test/setup` | Пусто. Если не пусто — каждое изменение перечислено в delivery report и вынуждено **типами** SDK (нет изменений ожиданий/assert'ов, нет удалённых кейсов); иначе — дефект |
| TC-14 | AC-03, AC-08 | integration | negative | `git diff main -- apps/api/vitest.config.mts apps/api/test/setup/`; `pnpm --filter @bga/api exec vitest run test/no-network.unit.test.ts` | `setupFiles` по-прежнему содержит `blank-openai-env.ts` **первым** и `no-network.ts`; guard-тест проходит (fetch на внешний хост валит тест — fail closed) |
| TC-15 | AC-03 | unit | positive | `pnpm --filter @bga/api exec vitest run test/ai/openai-provider.unit.test.ts test/ai/openai-client.unit.test.ts test/ai/openai-errors.unit.test.ts test/ai/retry.unit.test.ts` | Если upgraded: проходят без правок файлов (подмена `fetch`/клиента совместима с SDK 7: маппинг ошибок, retry, `retry-after`, structured output) |
| TC-16 | AC-04 | config | positive | `grep '"@nestjs/' apps/api/package.json`; инспекция `implementation-plan.md` | Все `@nestjs/{common,core,platform-express,testing}` — одна мажорная версия (все 12.x или все 11.x), `@nestjs/cli` согласован; решение с обоснованием (R-1: ESM-only vs CJS-сборка, A-5). Если deferred — причина + условие возврата |
| TC-17 | AC-04 | process | positive | Если upgraded: `pnpm --filter @bga/api build && ls apps/api/dist/main.js`; `pnpm e2e` (использует `e2e:serve` → `start`) | `nest build` exit 0, `dist/main.js` есть; e2e стартует API из сборки и проходит (≥ 118) |
| TC-18 | AC-04 | process | negative | Если upgraded: `git diff --stat main -- apps/api/src` | Тронуты только файлы, вынужденные апгрейдом (каждый — в delivery report, TC-39); нет массового перевода импортов на ESM, конфликтующего с SWR-006 (иначе по A-5 ожидался `deferred`) |
| TC-19 | AC-05 | config | positive | `grep -E '"(prisma\|@prisma/[a-z-]+\|better-sqlite3)"' apps/api/package.json`; инспекция `implementation-plan.md`, `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts` (если появился) | Если upgraded: `prisma`/`@prisma/client` 7.x (не rc, A-2), добавлены только вынужденные пакеты (`@prisma/adapter-better-sqlite3`, `better-sqlite3`); обоснование по R-2. Если deferred — 6.19.3 + причина + условие возврата |
| TC-20 | AC-05 | process | negative | `git diff --stat main -- apps/api/prisma/migrations`; `git status --porcelain apps/api/prisma/migrations` | Пусто: ни изменённых, ни новых миграций |
| TC-21 | AC-05 | integration | positive | Чистая БД: `DATABASE_URL=file:<scratch>/clean.db pnpm --filter @bga/api exec prisma migrate deploy`; затем `pnpm --filter @bga/api exec vitest run test/migration*.int.test.ts` | `migrate deploy` применяет все миграции, exit 0; migration-тесты (SWR-004/005B и upcast) зелёные |
| TC-22 | AC-05 | integration | positive | **Фикстура Prisma 6:** до апгрейда (или из чистой копии `main`@`7195758` в scratch, своими `node_modules`) создать `<scratch>/fixture-p6.db`: `migrate deploy` + сессии через API/репозиторий Prisma 6 (≥ 1 hotseat Rebellion, ≥ 1 vs-AI, ≥ 1 с командами, запись `AiUsage`); сохранить sha256. После апгрейда: `cp fixture-p6.db fixture-copy.db` → `SWR005_DEV_DB=<scratch>/fixture-copy.db pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts` (или эквивалентный скрипт) | На копии: `migrate deploy` — no-op; каждая сессия GET 200 и в списке; одна команда на сессию — 200 и сохраняется; после рестарта GET идентичны; лог `[dev-db-upgrade]` сохранён |
| TC-23 | AC-05 | process | negative | `shasum -a 256 <scratch>/fixture-p6.db` до/после TC-22; `git status --porcelain apps/api/prisma/dev.db`; `ls -l apps/api/prisma/dev.db` в worktree (если есть) — mtime до/после | Оригинал фикстуры не изменён (sha256 совпадает); `apps/api/prisma/dev.db` основного checkout не использовался ни в одной команде (проверка по логам команд); в git нет `.db` |
| TC-24 | AC-05, AC-08 | integration | negative | Если upgraded (Prisma 7 не грузит `.env` сам): `pnpm --filter @bga/api exec vitest run test/env-isolation.int.test.ts test/env.unit.test.ts test/env-example.unit.test.ts` | Проходят; D-1-обход SWR-005B не сломан: тестовый процесс не получает `OPENAI_*` из `apps/api/.env` |
| TC-25 | AC-06 | doc | positive | Инспекция `implementation-plan.md` → таблица решений | Для каждого из `@testing-library/jest-dom`, `vitest`, `concurrently`, `react-router`, `react-i18next`, `i18next`, `jsdom` — строка: `upgraded` (версия + почему безопасно + чем проверено) или `deferred` (причина + условие возврата). Пропуск любого пакета — дефект |
| TC-26 | AC-06 | config | positive | `grep -rnE '"(@testing-library/jest-dom\|vitest\|concurrently\|react-router\|react-i18next\|i18next\|jsdom)"' package.json apps/*/package.json packages/platform/package.json packages/games/*/package.json` | Фактические версии совпадают с решениями в таблице (TC-25); `vitest` — одна мажорная версия во всех пакетах; при `vitest` 5 — `vite` в поддерживаемом peer-диапазоне (6–8), `@types/node` 22 (peer) |
| TC-27 | AC-06 | integration | positive | `pnpm --filter @bga/web test`; `pnpm dev` 20 с (или `pnpm --filter @bga/web build`) | web ≥ 518 тестов зелёные (jest-dom матчеры, jsdom, router, i18n); `concurrently` запускает три процесса без ошибки аргументов (`-k --names --prefix-colors`) |
| TC-28 | AC-09 | process | positive | `pnpm verify 2>&1 \| tee artifacts/logs/qa-verify.log; echo "exit=$?"` (Node 22.23.5) | exit 0; включает `test:process` (scripts ≥ 408 — регресс baseline `Cannot find module …/scripts` устранён), lint, typecheck, все наборы (числа ≥ baseline), build, check:bundle, e2e ≥ 118 |
| TC-29 | AC-09 | process | positive | `for d in docs/tasks/SWR-*; do node scripts/check-task.mjs "$d" \|\| echo "FAIL $d"; done 2>&1 \| tee artifacts/logs/qa-check-task.log` | Каждая папка — exit 0, ни одной строки `FAIL` |
| TC-30 | AC-07 | config | positive | Инспекция `.github/workflows/ci.yml` | `on:` содержит `push` и `pull_request`; `actions/setup-node` с `node-version-file: .nvmrc`; pnpm из `packageManager` (`pnpm/action-setup` без жёсткой `version:` или `corepack enable`); кэш pnpm store (`cache: pnpm` или `actions/cache` по `pnpm store path` с ключом от `pnpm-lock.yaml`); `pnpm install --frozen-lockfile`; `pnpm exec playwright install --with-deps chromium`; `pnpm verify`; цикл `check-task` по `docs/tasks/SWR-*`; `permissions: contents: read`; `concurrency` с `cancel-in-progress: true` |
| TC-31 | AC-07 | config | negative | `grep -nE 'continue-on-error\|\|\| *true\|set \+e' .github/workflows/ci.yml`; инспекция цикла `check-task` | Ничего не найдено; цикл `check-task` падает при первой ошибке (`set -e` / накопление `fail=1; exit $fail`) — падение любого шага делает CI красным |
| TC-32 | AC-07 | config | positive | `node -e` с YAML-парсером из `node_modules` (например, `yaml`, если есть) или `actionlint` при наличии; иначе — ручная инспекция | Файл синтаксически валиден; один job на `ubuntu-latest` (A-4), без матрицы |
| TC-33 | AC-08 | config | negative | `grep -nE 'secrets\.\|OPENAI_\|sk-' .github/workflows/*.yml` | Ни одного `secrets.`; нет `OPENAI_API_KEY`/ключей; допустимо только явное `OPENAI_ENABLED: 'false'` (если добавлено) |
| TC-34 | AC-08 | config | positive | Инспекция шага подготовки `.env` в `ci.yml` и `apps/api/scripts/ensure-env.mjs` | `apps/api/.env` в CI создаётся только из `.env.example` (`OPENAI_ENABLED=false`, пустой `OPENAI_API_KEY`) — явным `cp` или через `ensure-env.mjs`; ни один шаг не пишет ключ |
| TC-35 | AC-08 | integration | positive | `pnpm --filter @bga/api exec vitest run test/env-isolation.int.test.ts test/no-network.unit.test.ts test/dev-ai-security.int.test.ts` | Guard-тесты изоляции SWR-005B (AC-10/AC-13) проходят без изменений файлов (TC-13) |
| TC-36 | AC-10 | doc | positive | Инспекция `README.md` (setup), `docs/architecture/application.md` (версии/runtime), `AGENTS.md`, `docs/process/runtime-adapters.md` | Указаны Node 22.23.5 (`nvm use`), `corepack enable`, версия pnpm = `packageManager`; версии openai/Nest/Prisma и т. д. = фактическим (или помечены deferred); описан CI (что запускает, без секретов) |
| TC-37 | AC-10 | doc | negative | `grep -rnE 'Node(\.js)? ?20\|20\.19\|node 20' README.md AGENTS.md docs/architecture docs/process` | Нет утверждений о Node 20 / 20.19 как **текущем** требовании; оставшиеся вхождения — только исторические (явно «было/до SWR-007»), каждое перечислено в `qa-results.md` |
| TC-38 | AC-11 | process | negative | `git diff --stat main -- packages/platform packages/games/*/src/schema`; `pnpm e2e` (часть TC-28); `pnpm --filter @bga/api exec vitest run test/rebellion-contract.int.test.ts test/routes.int.test.ts` | Публичные контракты не изменены (пустой diff); HTTP-маршруты и контрактные тесты зелёные |
| TC-39 | AC-11 | process | positive | `git diff --name-only main -- 'apps/**/src/**' 'packages/**/src/**' 'apps/**/test/**' 'packages/**/test/**' 'e2e/**' 'scripts/**'` против списка в delivery report | Каждый файл из diff перечислен в delivery report с причиной (минимум — вынужденная правка `test:process`/`scripts`); нет файлов вне списка; в diff нет продуктовых изменений поведения |
| TC-40 | AC-12 | CI | positive | **Только после явного согласия PO** (сообщение человека): push ветки, PR → дождаться run `ci.yml` (`gh run list --branch …`, `gh run view <id>`) | Run запущен на `push` и `pull_request`; все шаги зелёные; ссылка на run в `qa-results.md`. Без согласия PO — `not_run` с причиной «push не согласован» (не блокирует приёмку AC-01..AC-11) |
| TC-41 | AC-12, AC-07 | CI | negative | Только при согласии PO: инспекция логов run из TC-40 (намеренно падающие шаги не пушим) — проверить, что `check-task`/`verify` реально выполнились (есть их вывод) и нет предупреждений о «secrets not available» | Логи показывают выполнение всех шагов; кэш pnpm store сохранён/восстановлен (`Cache saved`/`Cache restored`); без согласия — `not_run` |

## Coverage
| AC | Test cases |
|---|---|
| AC-01 | TC-01, TC-02, TC-03, TC-04, TC-05 |
| AC-02 | TC-06, TC-07, TC-08, TC-09, TC-10 |
| AC-03 | TC-11, TC-12, TC-13, TC-14, TC-15 |
| AC-04 | TC-16, TC-17, TC-18 |
| AC-05 | TC-19, TC-20, TC-21, TC-22, TC-23, TC-24 |
| AC-06 | TC-25, TC-26, TC-27 |
| AC-07 | TC-30, TC-31, TC-32, TC-41 |
| AC-08 | TC-14, TC-24, TC-33, TC-34, TC-35 |
| AC-09 | TC-05, TC-28, TC-29 |
| AC-10 | TC-36, TC-37 |
| AC-11 | TC-38, TC-39 |
| AC-12 | TC-40, TC-41 |

## Open questions (для Analyst / Tech Lead)

- **Q-1 (AC-05, фикстура Prisma 6):** как именно создаётся фикстура «созданная Prisma 6», если апгрейд уже установлен в worktree?
  Предложение QA: создать её **до** апгрейда (сохранить в `.tmp`/scratch вне git) или из отдельной временной копии `main`@`7195758`
  со своими `node_modules` в scratch. Какие данные обязательны (предложено в TC-22: hotseat, vs-AI, сессия с командами, `AiUsage`)?
- **Q-2 (AC-01, Node 20):** сценарий 2 говорит «предупреждает/отказывает». Нужен ли `engine-strict=true` в `.npmrc` (жёсткий отказ)
  или достаточно предупреждения pnpm? TC-03 сейчас принимает оба, но фиксирует фактическое поведение.
- **Q-3 (AC-07, pnpm в CI):** допустим ли `pnpm/action-setup` (читает `packageManager`) или требуется именно `corepack enable` —
  чтобы версия в CI гарантированно совпадала с проверенной в AC-02?
- **Q-4 (AC-11):** входят ли `scripts/**` и `apps/api/scripts/**` в «исходные файлы», которые нужно перечислять в delivery report?
  TC-39 предполагает «да».
- **Q-5 (AC-10):** где «runtime notes» — `docs/process/runtime-adapters.md` или отдельный раздел `docs/architecture/application.md`?
  TC-36 проверяет оба.
