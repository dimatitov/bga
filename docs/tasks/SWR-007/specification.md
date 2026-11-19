# Specification — SWR-007 Node 22 LTS, обновление зависимостей и CI

## Business goal
Снять техдолг «пин на Node 20.19.5»: он держал на старых мажорах SDK OpenAI, NestJS, Prisma и ряд web/dev-зависимостей.
Перейти на актуальный Node 22 LTS, обновить то, что безопасно, остальное явно отложить с причиной, и включить CI на GitHub
Actions, чтобы каждый push/PR прогонял `pnpm verify` и `check-task`. Поведение продукта не меняется.

## Фактическое состояние (проверено Analyst, 2026-11-19, ветка от `main` @ `7195758`)
- `.nvmrc` = `20.19.5`; root `engines.node` = `^20.19.0 || >=22.12.0`; `@types/node` = `20.19.43` во всех пакетах;
  `packageManager` = `pnpm@10.34.9`. CI нет (`.github/` отсутствует).
- Node: `nvm ls-remote` → **v22.23.5 — Latest LTS: Jod** (Node 22 — maintenance LTS, EOL 2027-04-30); также LTS 24.22.3
  (Krypton) и 26.13.1 (Lithium). Установлен локально через nvm.
- corepack, встроенный в Node 22.23.5, — **0.36.0**; он запускает `pnpm@12.21.0` (latest) и `pnpm@10.34.9`
  (проверено в scratch-проекте: `corepack pnpm -v` → `12.21.0` / `10.34.9`). Утверждение брифа «локальный corepack не запускает pnpm 12» не воспроизвелось: corepack 0.33.0 из Node 20.19.5 тоже
  вернул `12.21.0` (возможно, из кэша corepack после загрузки под Node 22) — `artifacts/logs/pnpm-corepack.log`; на решение не влияет.
- Baseline под Node 22.23.5 без изменений зависимостей (`pnpm install --frozen-lockfile` + `pnpm verify`):
  install OK; lint/typecheck OK; **`test:process` падает** — `node --test scripts/` в Node 22 больше не разворачивает каталог
  (`Cannot find module …/scripts`) → `artifacts/logs/baseline-node22-verify.log`. Это вынужденная правка скрипта.
- Кандидаты на обновление (`npm view <pkg> version engines peerDependencies`, 2026-11-19):

  | Пакет | Сейчас | Latest | Ограничение |
  |---|---|---|---|
  | `openai` | 6.49.0 | 7.60.0 | Node ≥ 22 |
  | `@nestjs/{common,core,platform-express,testing}` | 11.2.8 | 12.5.1 | Node ≥ 20, **ESM-only** (`"type":"module"`) |
  | `@nestjs/cli` | 11.0.24 | 12.0.13 | Node ≥ 20.11 |
  | `prisma` / `@prisma/client` | 6.19.3 | 7.10.1 (8.0.0 — только rc) | новый generator, обязательный driver adapter (`@prisma/adapter-better-sqlite3` + `better-sqlite3` 13 → Node ≥ 22) |
  | `@testing-library/jest-dom` | 6.9.1 | 8.0.0 (7.0.1) | Node ≥ 22 |
  | `vitest` | 4.1.12 | 5.1.1 | Node `^22.12 \|\| ^24 \|\| >=26`; peer `@types/node ^22 \|\| >=24`, vite 6–8 |
  | `concurrently` | 9.2.5 | 10.0.7 | Node ≥ 22 |
  | `react-router` | 7.18.5 | 8.5.2 | Node ≥ 22.22.0 |
  | `react-i18next` / `i18next` | 17.1.13 / 26.7.2 | 18.0.3 / 27.2.2 | Node ≥ 22 |
  | `jsdom` | 29.1.1 | 31.0.1 | Node `^22.22.2 \|\| ^24.15 \|\| >=26` |
  | `@types/node` | 20.19.43 | 22.20.5 (линия 22) | под runtime |
  | `pnpm` | 10.34.9 | 12.21.0 | Node ≥ 18 |

## Scenarios
1. **Разработчик клонирует репозиторий** → `nvm use` (Node 22.23.5) → `corepack enable` → `pnpm install` → `pnpm dev` /
   `pnpm verify` работают, как в README.
2. **Разработчик на старом Node 20** → `pnpm install` предупреждает/отказывает по `engines` (Node 20 больше не поддерживается).
3. **Push в ветку / открытие PR** → GitHub Actions: checkout → Node из `.nvmrc` → pnpm (из `packageManager`) → кэш store →
   `pnpm install --frozen-lockfile` → `playwright install --with-deps chromium` → `pnpm verify` → `check-task` по всем
   `docs/tasks/SWR-*`. Без секретов; OpenAI выключен; падение любого шага — красный CI.
4. **Слияние с SWR-006** → изменения SWR-007 ограничены манифестами/lockfile/конфигами/CI/доками и перечисленными вынужденными
   правками исходников; конфликт по `pnpm-lock.yaml` решается `pnpm install`.

## States / rules / exceptions
- Правило «обновить или отложить»: для каждого кандидата из таблицы — решение `upgraded` (версия + почему безопасно + чем
  проверено) или `deferred` (причина + условие возврата). Обновление считается безопасным только если `pnpm verify` зелёный и
  не потребовались изменения продуктового поведения/контрактов.
- Prisma 7: `prisma/migrations/**` не меняются; новые миграции не создаются; `migrate deploy` на чистой БД проходит; данные,
  записанные Prisma 6, читаются Prisma 7 без изменений — проверяется на **копии фикстуры** (БД, созданной и заполненной в
  scratch/`.tmp` текущей версией), `apps/api/prisma/dev.db` и основной checkout не трогаются.
- openai 7: тест-файлы `apps/api/test/**/ai*` не меняются (кроме вынужденных правок типов — тогда перечислить и обосновать);
  сетевой guard (`no-network.ts`) и blanking `OPENAI_*` остаются.
- Тесты/CI не видят реальный ключ: в workflow нет `secrets.*` и `OPENAI_API_KEY`; `apps/api/.env` в CI не создаётся
  (поправка по QA D-2).
- Публичные контракты (`packages/platform`, `packages/games/*/src/schema`, HTTP API) не меняются.

## Acceptance criteria (testable)
- **AC-01:** (Node 22) `.nvmrc` = `22.23.5`; root `engines.node` исключает Node 20 и допускает Node 22.23.x (нижняя граница не
  ниже требований обновлённых пакетов); `@types/node` во всех workspace-пакетах — линия `22.x`; `pnpm verify` запускается под
  `node -v` = `v22.23.5` (лог).
- **AC-02:** (pnpm) `packageManager` указывает версию pnpm, которую запускает corepack из Node 22.23.5 (проверка — лог
  `corepack pnpm -v`); выбор (остаться на 10.x или перейти) обоснован в `implementation-plan.md`; `pnpm install --frozen-lockfile`
  с этой версией проходит; настройки сборки зависимостей (`onlyBuiltDependencies`/аналог) работают (Prisma/esbuild/SWC).
- **AC-03:** (openai 7) `openai` = 7.x (или `deferred` с причиной); все тесты `apps/api` проходят; тест-файлы AI-слоя не изменены
  (`git diff --stat` по `apps/api/test`) или каждое изменение перечислено и вынуждено типами; ни один тест не делает реальный
  сетевой вызов (guard активен).
- **AC-04:** (NestJS 12) решение `upgraded`/`deferred` с обоснованием; при `upgraded` — `pnpm verify` (api int/unit + e2e) зелёный,
  сборка `nest build` и `pnpm start`-путь (e2e-serve) работают.
- **AC-05:** (Prisma 7) решение `upgraded`/`deferred` с обоснованием; при `upgraded` — `prisma/migrations/**` без изменений;
  `migrate deploy` на чистой БД OK; фикстура dev-БД, созданная Prisma 6, — **копия** читается и пишется Prisma 7 (лог);
  `apps/api/prisma/dev.db` не тронута.
- **AC-06:** (прочие зависимости) для jest-dom, vitest, concurrently, react-router, react-i18next/i18next, jsdom — решение
  `upgraded`/`deferred` с обоснованием в `implementation-plan.md`; итог — в delivery report.
- **AC-07:** (CI workflow) `.github/workflows/ci.yml` запускается на `push` и `pull_request`; шаги: Node из `.nvmrc`, pnpm из
  `packageManager`, кэш pnpm store, `pnpm install --frozen-lockfile`, установка браузеров Playwright, `pnpm verify`, `check-task`
  по всем папкам `docs/tasks/SWR-*`; нет `secrets.*`; `permissions: contents: read`; отмена устаревших прогонов (concurrency).
- **AC-08:** (без реального ключа) CI и тесты не читают реальный ключ: в workflow нет переменных `OPENAI_*` со значениями ключа;
  в CI `apps/api/.env` не создаётся вовсе (поправка Analyst по QA D-2: строже, чем копия `.env.example`; тесты и e2e работают с `NODE_ENV=test`, `.env` им не нужен); существующие guard-тесты изоляции (SWR-005B AC-10/AC-13) проходят.
- **AC-09:** (локальная проверка) `pnpm verify` exit 0 под Node 22.23.5 в worktree (лог); `check-task` exit 0 для всех
  `docs/tasks/SWR-*` (лог).
- **AC-10:** (документация) README (setup), `docs/architecture/application.md` (версии/runtime), `AGENTS.md`/runtime notes
  обновлены; `grep` по `README.md AGENTS.md docs/architecture docs/process` не находит устаревших утверждений «Node 20»/«20.19»
  как текущего требования.
- **AC-11:** (совместимость слияния) HTTP API и публичные контракты не изменены (e2e зелёные); delivery report перечисляет
  **каждый** тронутый исходный файл (`apps/**/src`, `packages/**/src`, тесты) с причиной.
- **AC-12:** (CI на GitHub) после явного согласия PO ветка запушена, PR открыт, CI зелёный (ссылка на run). Без согласия —
  `not_run` с причиной (не блокирует приёмку остального).

## Assumptions
- **A-1:** «актуальный Node 22 LTS» = 22.23.5 (latest Jod). Node 22 в maintenance LTS до 2027-04-30; Active LTS — 24, LTS — 26.
  Задача явно про 22 — делаем 22, но `engines` не запрещает 24+; рекомендация PO — следующей задачей перейти на 24/26 (A-1 в отчёте).
- **A-2:** Prisma 8 (rc) не рассматривается — только стабильные релизы.
- **A-3:** TypeScript остаётся 5.9.3 (typescript-eslint peer `< 6.1`; не связан с Node).
- **A-4:** CI — один job на `ubuntu-latest`, одна версия Node (из `.nvmrc`); матрица Node не нужна.
- **A-5:** Если мажор требует перевода `apps/api` на ESM или массовых правок исходников, конфликтующих с SWR-006, — `deferred`
  (условие возврата: после слияния SWR-006, отдельной задачей).

## Risks
- **R-1:** NestJS 12 — ESM-only, а `apps/api` собирается в CommonJS: потребуется либо `require(esm)` (Node 22.12+), либо перевод на
  ESM (правки импортов в десятках файлов, конфликт с SWR-006) → возможный `deferred`.
- **R-2:** Prisma 7 — смена generator, обязательный adapter, `prisma.config.ts`, отказ от автозагрузки `.env` (затрагивает
  D-1-обходы SWR-005B) → правки `persistence/*`, скриптов e2e/global-setup.
- **R-3:** Лockfile-конфликт с SWR-006 (если там меняются зависимости) — решается `pnpm install` после слияния.
- **R-4:** pnpm 11/12 меняет настройки (`onlyBuiltDependencies`, формат lockfile) — проверка `--frozen-lockfile` локально и в CI.
- **R-5:** CI на Linux: нативные модули (`better-sqlite3`, SWC, esbuild) и браузеры Playwright — проверяется только реальным прогоном.

## Out of scope
Продуктовые изменения; TypeScript 6/7; Node 24/26; деплой; секреты и платные вызовы OpenAI в CI; матрица ОС/Node.

## Answers to QA questions (test-cases.md Q-1..Q-5)
- **Q-1:** фикстура создана Prisma 6.19.3 **до** апгрейда: `apps/api/.tmp/swr007-fixture-prisma6.db` (+ нетронутая копия
  `.orig.db`, sha256 в `artifacts/logs/prisma6-fixture.log`), данные: сессия с событиями (явные даты) + строка `AiUsage`.
  Дополнительно — существующий opt-in тест `test/dev-db-upgrade.int.test.ts` на копии.
- **Q-2:** достаточно предупреждения pnpm по `engines` (фиксируем фактическое поведение); жёсткий отказ не обязателен.
- **Q-3:** `pnpm/action-setup` (читает `packageManager`) допустим — версия pnpm та же, что в AC-02.
- **Q-4:** да, `scripts/**` и `apps/api/scripts/**` перечисляются в отчёте.
- **Q-5:** обе: `docs/process/runtime-adapters.md` и `docs/architecture/application.md`.
