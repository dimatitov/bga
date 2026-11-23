# Delivery Report — SWR-010 Card Foundation & Physical Table Sync v0

Analyst/Orchestrator, 2026-11-23. Ветка `swr-009-vector-terminal` (поверх SWR-009 `f3619a1`), изменения **не закоммичены и не
запушены** (по правилам — только по просьбе пользователя). Процесс: INTAKE → … → FINAL_ACCEPTANCE пройдены (`status.md`).

## Scope

**Сделано (v0):**
- **A. Rules Audit** — `rules-audit.md`: все типы карт (миссии, проекты, действия, цели, тактика, зонды, Location) по базе
  SWR-005C и RR/LTP/FAQ, свои пересказы, матрица покрытия (§6), разбиение (§8), вопросы PO (§9). Подтверждённые
  идентичности есть **только у колоды зондов** (31 карта = все системы, кроме Корусанта).
- **B. Card Registry** — `@bga/platform/cards` (Card Type / Definition / Instance / Zone / Effect, без терминов Rebellion);
  каталог Rebellion: 31 зонд `verified`, эффект «нет розыгрыша»; миссии/проекты/действия/цели/тактика — только уровень
  типа, `deferred`, пустые каталоги (**частично: каталоги отложены**).
- **C. Deck Engine** — чистые операции (create/shuffle/draw/move/play/discard/reveal/return/register/restore), типизированные
  ошибки вместо исключений, инварианты (без дублей и потерь), детерминированное перемешивание (FNV-1a + mulberry32, вектор
  заморожен). В `core-v1`: инициализация (5 карт первой партии — коробка, база — Location, 25 — колода), Refresh шаг 3
  (Империя добирает 2 зонда, при исчерпании — сколько осталось, A-8), раскрытие базы переносит карту Location.
- **D. Visibility** — единая точка редактирования `redact.ts`; четыре проекции (человек, AI, публичная, журнал/задачи стола);
  порядок колоды не уходит никому, включая владельца; тесты утечек по всем каналам (view, events, ответы команд, список
  сессий, ошибки, промпт/decisionPoint AI, AiUsage, DOM/storage/URL, бандл) с позитивными контролями.
- **E. Physical Sync v0** — `gameMode: physical_companion` против AI; очередь задач стола в состоянии; `CONFIRM_TABLE_TASK`
  (только голова, версия +1, без повторного эффекта, повтор → 409/422, конкурентные подтверждения проверены ×20);
  `REGISTER_CARD` (Physical Hand: человек-Повстанец регистрирует карту базы из справочника допустимых систем); AI и прочие
  команды блокируются до подтверждения; восстановление после перезапуска/перезагрузки. Digital Hand — AI всегда, человек —
  для зондов (справочная стопка, A-10).
- **F. UI** (тема Galactic Vector Terminal, компоненты UI Kit SWR-009, RU/EN): вкладка «Карты» (Card Hand + Card Detail без
  кнопки розыгрыша, счётчики соперника, «карты не отслеживаются» для старых партий), режим правой консоли «Физический стол»
  (что произошло / что затронуто / что сделать / «Выполнено на столе» / статус ожидания AI), форма регистрации базы, выбор
  `physical_companion` на экране новой партии.
- **AI Commander** — в ситуацию AI добавлены только его карты и публичные счётчики; карточных кандидатов нет (нет
  поддержанного розыгрыша); бюджет, fallback, лимиты не менялись; rules-off промпт побайтно прежний.

**Сознательно не сделано:** эффекты любых карт; каталоги миссий/действий/целей/тактики/проектов (нет подтверждённых
идентичностей); бой, производство, распознавание камерой, Forbidden Stars; настройка «режим руки» для человека;
`physical_companion` в hot-seat; использование зондов детерминированным ботом (A-11).

## Матрица покрытия (кратко; полная — `rules-audit.md` §6)

| Тип / механика | SWR-010 v0 | Статус |
|---|---|---|
| Зонды: определения, удаление 5 карт первой партии, формирование и перемешивание колоды | registry + deck engine | реализовано |
| Location: выбор базы (сервер / регистрация человеком), раскрытие | registry + deck engine + physical sync | реализовано |
| Зонды: добор 2 в Refresh, скрытость от Повстанцев, исчерпание | deck engine + PlayerView | реализовано (исчерпание — assumption A-8) |
| Миссии, проекты, действия, цели, тактика | только уровень типа | **частично: отложено** (F-CATALOG и др.) |
| Эффекты карт | статус `deferred`/«нет розыгрыша», кнопки розыгрыша нет | отложено |
| Физическое исполнение (ходы AI, Refresh, раскрытие базы, начальная синхронизация) | очередь задач стола | реализовано |

## Архитектурные решения

- Общее — `packages/platform/src/cards` (подпуть `@bga/platform/cards`, не из корня пакета); Rebellion — каталог/зоны в
  `src/schema`, правила в `src/rules/core/{cards,table}.ts`, проекции — только в `redact.ts`.
- Состояние: optional-поля `cards?`/`table?` без bump `schemaVersion`; старые строки читаются побайтно, при чтении не
  переписываются; Prisma-миграции нет, `dev.db` не тронута.
- Авторитет колоды хранится в политике зоны (`digital|physical`); для каждой колоды ровно один источник (spec D-4).
- Задачи стола строятся только из событий, уже отредактированных для человека; у AI-стороны `table: null`.
- Раннер AI не менялся: `pendingActor = null`, пока очередь не пуста (stopReason `humanTurn`); после последнего
  подтверждения AI продолжает в том же ответе.
- Согласованные отклонения от плана: `editionId` (вместо `rulesetId`, архитектурный тест TC-A-01), ключ параметра `system-id`,
  `cards/invariants.ts` разрешён в веб-бандле (чистая валидация), ключи `cards.typeInfo.*`; KB-записи `impl.engine-scope`,
  `impl.refresh-partial`, DISC-003 переписаны своими словами (меняет байты rules-on промпта; одобрено AQ-2).

## Files changed

136 путей вне чужих файлов (`git status`): `packages/platform/src/cards/**` + тесты + `package.json`;
`packages/games/rebellion/src/{schema,rules/core,ai,server}/**`, `knowledge/{entries/implementation-notes.json,discrepancies.json}`,
`benchmark/scenarios.json`, тесты и фикстуры; `apps/api/test/**` (новые int-тесты, `apps/api/src` не менялся);
`apps/web/src/games/rebellion/**` (core-v1/cards, core-v1/table, sidebar, CoreTable, viewModel, setup, locales);
`e2e/**`; `scripts/check-web-bundle.mjs` + тест; `eslint.config.mjs`; `docs/game-rules/rebellion/*` (регенерация);
`docs/tasks/SWR-010/**`. Подробно по воркерам — Implementation log в `implementation-plan.md`.
Не трогались и не должны коммититься с задачей: `docs/design/`, `docs/product/progress-2026-11-20.md`, `.claude/launch.json`,
изменённые ранее скриншоты `docs/tasks/SWR-006/artifacts/screenshots/*.png` (md5 до/после прогонов совпадает —
`artifacts/logs/qa-swr006-md5.log`).

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `rules-audit.md`, `artifacts/logs/qa-static.log` (TC-AUD-01..04; наблюдение O-1) |
| AC-2 | passed | `packages/platform/test/cards/schema.test.ts`, `packages/platform/test/cards/boundaries.test.ts`, `packages/games/rebellion/test/schema/card-catalog.test.ts`, `artifacts/logs/final-verify.log` |
| AC-3 | passed | `packages/games/rebellion/test/schema/card-catalog.test.ts`, `artifacts/logs/final-verify.log` |
| AC-4 | passed | `packages/games/rebellion/test/rules/core/cards-init.test.ts`, `apps/api/test/physical-sync.int.test.ts`, `artifacts/logs/final-verify.log` |
| AC-5 | passed | `packages/platform/test/cards/ops.test.ts`, `packages/platform/test/cards/property.test.ts`, `packages/platform/test/cards/shuffle.test.ts`, `artifacts/logs/final-verify.log` |
| AC-6 | passed | `packages/games/rebellion/test/rules/core/cards-refresh.test.ts`, `packages/games/rebellion/test/rules/core/cards-events-redaction.test.ts`, `apps/api/test/legacy-core-cards.int.test.ts`, `artifacts/logs/final-verify.log` |
| AC-7 | passed | `apps/api/test/cards-hidden-info.int.test.ts`, `packages/games/rebellion/test/rules/core/cards-visibility.test.ts`, `packages/games/rebellion/test/server/automation-cards.test.ts`, `e2e/cards-hidden.spec.ts`, `artifacts/logs/final-verify.log` (каналы AC-7 покрыты прямым поиском + метаморфикой правил; hot-seat TC-VIS-08 not_run) |
| AC-8 | passed | `packages/games/rebellion/test/rules/core/cards-visibility.test.ts`, `packages/platform/test/cards/visibility.test.ts`, `apps/api/test/cards-hidden-info.int.test.ts`, `artifacts/logs/final-verify.log` |
| AC-9 | passed | `packages/games/rebellion/src/rules/core/redact.ts`, `packages/games/rebellion/src/rules/core/table.ts`, `packages/games/rebellion/test/rules/core/cards-visibility.test.ts`, `packages/games/rebellion/test/rules/core/table-tasks.test.ts` |
| AC-10 | passed | `apps/api/test/physical-sync.int.test.ts`, `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts`, `packages/games/rebellion/test/rules/core/cards-register.test.ts`, `artifacts/logs/final-verify.log` |
| AC-11 | passed | `packages/games/rebellion/test/rules/core/table-tasks.test.ts`, `packages/games/rebellion/test/rules/core/table-init.test.ts`, `apps/api/test/physical-sync.int.test.ts`, `artifacts/logs/final-verify.log` |
| AC-12 | passed | `packages/games/rebellion/test/rules/core/table-confirm.test.ts`, `apps/api/test/physical-sync.int.test.ts`, `artifacts/logs/final-verify.log` `apps/api/test/table-confirm-race.int.test.ts`, `artifacts/logs/final-verify-2.log` (последовательные повторы 409/422; конкурентные CONFIRM ×20 — TC-CF-07/08 passed) |
| AC-13 | passed | `apps/api/test/physical-sync.int.test.ts`, `packages/games/rebellion/test/rules/core/table-blocking.test.ts`, `packages/games/rebellion/test/server/automation-cards.test.ts`, `artifacts/logs/final-verify.log` |
| AC-14 | passed | `apps/api/test/physical-sync.int.test.ts`, `apps/api/test/table-restart.int.test.ts`, `e2e/physical-execution.spec.ts`, `artifacts/logs/final-verify.log` |
| AC-15 | passed | `packages/games/rebellion/test/rules/core/table-tasks.test.ts`, `e2e/physical-execution.spec.ts`, `e2e/cards-hidden.spec.ts`, `artifacts/screenshots/swr010-px-ai-task-ru-1440.png`, `artifacts/logs/final-verify.log` |
| AC-16 | passed | `apps/api/test/legacy-core-cards.int.test.ts`, `e2e/cards-legacy.spec.ts`, `packages/games/rebellion/test/schema/legacy-core.test.ts`, `artifacts/logs/final-verify.log` |
| AC-17 | passed | `apps/api/test/physical-sync.int.test.ts`, `packages/games/rebellion/test/rules/core/cards-refresh.test.ts`, `packages/platform/test/cards/ops.test.ts`, `artifacts/logs/final-verify.log` |
| AC-18 | passed | `packages/games/rebellion/test/ai/describe-cards.test.ts`, `packages/games/rebellion/test/server/automation-cards.test.ts`, `apps/api/test/cards-hidden-info.int.test.ts`, `artifacts/logs/qa-static.log`, `artifacts/logs/final-verify.log` (TC-AI-04 not_run) |
| AC-19 | passed | `e2e/card-hand.spec.ts`, `apps/web/src/games/rebellion/core-v1/cards/CardHandPanel.test.tsx`, `artifacts/screenshots/swr010-hand-reb-ru-1440.png`, `artifacts/screenshots/swr010-hand-emp-en-1440.png`, `artifacts/logs/final-verify.log` |
| AC-20 | passed | `e2e/card-detail.spec.ts`, `apps/web/src/games/rebellion/core-v1/cards/CardDetail.test.tsx`, `artifacts/screenshots/swr010-detail-ru-1440.png`, `artifacts/logs/final-verify.log` |
| AC-21 | passed | `e2e/physical-execution.spec.ts`, `apps/web/src/games/rebellion/core-v1/table/PhysicalExecutionPanel.test.tsx`, `apps/web/src/games/rebellion/core-v1/table/useTableCommands.test.tsx`, `artifacts/screenshots/swr010-px-register-ru-1440.png`, `artifacts/logs/final-verify.log` |
| AC-22 | passed | `e2e/game-setup.spec.ts`, `apps/api/test/rebellion-contract.int.test.ts`, `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`, `artifacts/screenshots/swr010-setup-physical-ru-1440.png`, `artifacts/logs/final-verify.log` |
| AC-23 | passed | `artifacts/logs/final-verify.log` (check:bundle OK), `scripts/check-web-bundle.test.mjs`, `artifacts/logs/scripts-test.log`, `apps/api/test/cards-hidden-info.int.test.ts`, `e2e/cards-hidden.spec.ts` |
| AC-24 | passed | `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`, `artifacts/logs/scripts-test.log` — локальная часть: `pnpm verify` exit 0. CI — not_run (ветка не запушена, TC-R-05). Формулировка AC-24 требует exit 0 у verify и честной фиксации статуса CI («ветка не запушена → not_run»), а не зелёного CI — обе части выполнены. Зелёный CI на итоговом SHA НЕ подтверждён; после разрешённого push нужен прогон CI |

## Verification
- lint: passed — `artifacts/logs/final-verify-2.log`
- typecheck: passed — `artifacts/logs/final-verify-2.log`
- unit: passed — `artifacts/logs/final-verify-2.log` (platform 472, rebellion 1056, web 1052, forbidden-stars 5, scripts 454)
- integration: passed — `artifacts/logs/final-verify-2.log` (api 877 passed, 2 skipped)
- build + check:bundle: passed — `artifacts/logs/final-verify-2.log`
- e2e: passed — `artifacts/logs/final-verify-2.log` (183 passed, 0 flaky)
- review: passed — `review.md` (3 раунда, approved, 0 blocking/major)
- CI: not_run — ветка не запушена; push только по явной просьбе пользователя

## QA artifacts

`qa-results.md` (171 TC: 137 passed, 25 passed-partial, 8 not_run, 1 not_applicable, 0 failed; таблица PO G-1…14; матрица
утечек), `test-cases.md`, логи `artifacts/logs/` (final-verify, final-verify-2, e2e, scripts-test, qa-static, qa-swr006-md5),
42 скриншота `artifacts/screenshots/swr010-*` (RU/EN, 1440/375, + 1024), `review.md`, `acceptance.md`.

## Known issues / risks

- **CI не запускался** (ветка локальная). После разрешённого push нужен зелёный CI.
- `not_run` TC: hot-seat с картами через API (TC-VIS-08), property-прогон физических партий до конца (TC-BL-09), копия
  `dev.db` (TC-OLD-07), повреждённая карточная секция через API (TC-RP-04), рестарт + доигрывание (TC-RP-05), ответ модели с
  карточным действием (TC-AI-04), отдельный baseline verify (TC-R-01), CI (TC-R-05).
- База и порядок колоды зондов детерминированно выводятся из `sessionId` (видим в URL) — слабость существует с SWR-005
  (FQ-1); нужен серверный секрет в seed.
- До регистрации базы человеком-Повстанцем его «юниты на базе» отображаются в предварительной системе (FQ-2).
- Колода зондов: ~13 Refresh до исчерпания; поведение — assumption A-8. Регистрация базы не принимает Ботави (официально
  допустима) и принимает Утапау (зависит от DISC-016) — A-7.
- Строки с новыми полями не читаются кодом `main` (нет downgrade).
- O-2: панель «Карты» на 1440×900 короткая (видна одна карта без прокрутки).
- Карточные подсказки зондов AI-Империи есть только в промпте OpenAI; бот их не использует (A-11).

## Рекомендации на следующий этап (разбиение для PO)

1. **F-VERIFY-BOX** — владелец сверяет по коробке названия/количества карт каждого типа, значки лояльности зондов, DISC-016,
   поведение пустой колоды зондов, допустимость Ботави (вопросы PO — `rules-audit.md` §9).
2. **F-CATALOG** — каталоги миссий/действий/целей/тактики/проектов только из подтверждённых данных.
3. **F-START-HAND** → **F-MISSIONS-ASSIGN** → **F-MISSIONS-REVEAL** — стартовые миссии, назначение, раскрытие (здесь же
   переключаемый режим руки человека Physical/Digital).
4. **F-OBJECTIVES**, **F-ACTIONS**, **F-TACTICS** (вместе с боем), **F-PROJECTS**, **F-STD-SETUP**.
5. Техдолг: серверный секрет в seed (база/колоды), использование зондов ботом, TC `not_run` выше, CI после push.

## Final decision
accepted — AC-1..AC-24 passed, review approved, `pnpm verify` exit 0; CI not_run до разрешённого push; каталоги кроме зондов
и все эффекты карт сознательно отложены.
