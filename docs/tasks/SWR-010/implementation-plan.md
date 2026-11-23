# Implementation plan — SWR-010

Сводный план. Детали backend — [`plan-backend.md`](plan-backend.md) (контракты §11, воркеры §13, решения Analyst §16);
frontend — [`plan-frontend.md`](plan-frontend.md) (после контрактов backend).

## Порядок

W1 platform cards → W2 Rebellion contracts → (W3 card engine ‖ W4 table sync) → W5 AI/automation/API →
FE workers (после W2 контрактов; интеграция с живым API после W3/W4) → интеграция лидов → review → QA.

## Implementation log

(заполняется по мере сдачи воркеров: файлы, тесты с командами и результатами, ограничения)

### W1 — platform cards (backend-worker, 2026-11-23)

- Файлы: `packages/platform/src/cards/{schema,shuffle,engine,invariants,visibility,index}.ts` (новые),
  `packages/platform/test/cards/{fixture,schema,ops,property,shuffle,visibility,boundaries}.test.ts|.ts` (новые),
  `packages/platform/package.json` (только exports `./cards`).
- Команды (Node 22.23.5) и фактические результаты:
  - `pnpm exec vitest run test/cards` (в `packages/platform`) — 6 файлов, 106 тестов passed;
  - `pnpm --filter @bga/platform test` — exit 0, 23 файла, 472 теста passed;
  - `pnpm --filter @bga/platform typecheck` / `lint` / `build` — exit 0; `dist/cards/*.js|.d.ts` собраны;
  - `pnpm -r typecheck` — exit 0; `pnpm lint` (eslint + prettier, весь репозиторий) — exit 0;
  - `pnpm exec vitest run test/architecture.int.test.ts` (в `apps/api`) — первый прогон: 1 failed / 11 passed
    (TC-A-01 нашёл `rulesetId`); после решения Analyst W1-Q1 (`rulesetId` → `editionId`, plan-backend §16) —
    **12 passed**, exit 0. Все команды выше перезапущены после переименования с теми же результатами.
- Покрыто: TC-REG-01, TC-REG-02, TC-REG-03 (включая `ruleset`), TC-DECK-01..13 (TC-DECK-09 — 1000×20
  seeded операций), тест-вектор shuffle (`seededShuffle(['a'..'j'],'x')` → `j,i,d,c,f,h,b,g,a,e`).
- Ограничения: платформа не знает эффектов и владельцев карт — «play карты без розыгрыша» (TC-DECK-06) и «только
  владелец Y» (TC-DECK-05) проверяются правилами игры (W3/W4); ошибки схемы в `restorePile` отображаются на
  замороженные коды (`zones` → `unknownZone`, `instances` → `unknownCard`, иное → `missingZone`) — принято (W1-Q2).

### W2 — Rebellion contracts (backend-worker, 2026-11-23)

- Новые файлы: `packages/games/rebellion/src/schema/{card-catalog,cards,table}.ts`;
  тесты `packages/games/rebellion/test/schema/{card-catalog,cards-state,legacy-core}.test.ts`.
- Изменены (контракты §11.2–11.4): `src/schema/{state,view,commands,errors,setup,index}.ts` (`src/rules/setup.ts` не
  потребовал правок — передаёт весь разобранный ввод в `unsupportedSetupFields`).
- Заглушки (`// SWR-010 W2 stub → W3/W4`): `src/rules/core/apply.ts` (CONFIRM_TABLE_TASK / REGISTER_CARD → 422
  `commandUnavailable`), `src/rules/core/redact.ts` (`cards: null`, `table: null`; `CARDS_DRAWN.definitionIds` и
  `CARD_REGISTERED.definitionId` → `null` для всех). `mock-player-view.ts` и `src/ai/**` правок не потребовали.
- Тесты/фикстуры, адаптированные к новому контракту: `test/schema/{setup.test.ts,core-sample.ts}`,
  `test/server/server-module.test.ts` (physical+AI → ok, physical+human → 422), `test/knowledge/rules-provider.test.ts`
  (подмножества только AI-команд, без CONFIRM/REGISTER), `test/fixtures/core/views/*.json` (4 файла: diff — только
  `"cards": null, "table": null`; `golden-*.json`, `seeds/*.json` байт-равны), `apps/web/src/games/rebellion/test/coreFixtures.ts`
  (`cards: null, table: null`), `apps/api/test/rebellion-contract.int.test.ts` (422-кейс режима → hot-seat),
  `apps/api/test/core-commands.int.test.ts` (7 новых ключей — в `elsewhere`, покрытие HTTP — W5).
- Отклонение от §3.2: ключ параметра зонда — `system-id` (`PROBE_SYSTEM_PARAM`), т.к. ключи `params` в платформе —
  `CardIdSchema` (kebab, без заглавных); `systemId` не проходит схему. Ключ описания типа — `cards.typeInfo.<typeId>` (FQ-4).
- Команды (Node 22.23.5) и результаты:
  - `pnpm -r typecheck` — exit 0;
  - `pnpm --filter @bga/game-rebellion test` — exit 0, 74 файла, 927 тестов passed;
  - `pnpm --filter @bga/platform test` — exit 0, 23 файла, 472 теста passed;
  - `pnpm test` в `apps/api` (временные БД `apps/api/.tmp`, dev.db не трогается) — exit 0, 81 файл passed / 1 skipped, 863 passed / 2 skipped;
  - `pnpm lint` — exit 0; `node scripts/check-task.mjs docs/tasks/SWR-010` — OK.
  - `pnpm test` в `apps/web` (не в DONE WHEN, для информации) — **4 failed** / 98 файлов passed: i18n новых ключей ошибок
    и событий (`locales.i18n.test.ts`), форма setup (`SetupScreen.test.tsx`, `setupForm.test.ts`) — работа FE.
- Ограничения: до W3/W4 партия `physical_companion` + AI создаётся (201), но её state нарушает инварианты §3.1 (нет
  `table`/`cards`) → последующий GET/команда дадут 500 (schema). Инварианты стола проверяют наличие, а не содержание
  задач (`completion: 'register'` ⇔ `registerBase` не проверяется).

### FE-C — Setup `physical_companion`, bundle & boundaries (frontend-worker, 2026-11-23)

- Файлы: `apps/web/src/games/rebellion/setup/components/{AvailabilityPicker,GameModePicker}.tsx`,
  `setup/SetupScreen.tsx`, `setup/model/setupForm.ts` (+ `withOpponentType`), тесты `setup/SetupScreen.test.tsx`,
  `setup/model/setupForm.test.ts`; `locales/{ru,en}/setup.json` (`newGame.{aiOnly,modeAiOnlyHint,modePhysicalHint,modeResetAnnounce}`);
  `scripts/check-web-bundle.mjs` (+ `.test.mjs`); `eslint.config.mjs` (web-наборы: `^@bga/platform/cards$`).
- Поведение (§7): `AvailabilityPicker.unavailableReason(v)` / `availableHintKey(v)` (по умолчанию «скоро» + `soonHintKey`);
  `GameModePicker` берёт `isSupportedGameModeFor(m, opponentType)`; physical + человек → «· только против AI»,
  `aria-disabled`, `aria-describedby` = `modeAiOnlyHint`; под доступным physical — `modePhysicalHint`. Смена соперника на
  человека при выбранном physical → `digital` + polite-анонс (`setup-mode-announce`, `role=status`), без ошибки формы.
- Бандл (§12): правила `card-deck-seed`, `rebellion-card-server-symbol` (`CARD_SERVER_RULES`), модульная проверка
  `forbiddenPlatformCardModules` (`packages/platform/{src,dist}/cards/{engine,shuffle,visibility}`) с
  позитивными фикстурами и CLI-тестом. `cards/invariants` разрешён (решение Analyst Q1: чистая валидация, приходит
  через `CoreStateSchema` в `./schema`, без секретов/сида/порядка) — комментарий в скрипте + тест «allowed».
  Q2: оверрайды `*.i18n.test.ts` в ESLint не меняются.
- Команды (Node 22.23.5) и результаты:
  - `pnpm --filter @bga/web exec vitest run src/games/rebellion/setup` — 2 файла, 36 тестов passed;
  - `pnpm --filter @bga/web test` — 101 файл, 931 тест passed; `pnpm --filter @bga/web typecheck` — exit 0;
  - `node --test "scripts/*.test.mjs"` — 454 passed, 0 failed, exit 0 (повторно после сужения правила — то же);
  - `pnpm --filter @bga/web lint` — exit 0; ESLint-проба (временный файл, удалён): импорт `@bga/platform/cards` в
    `games/rebellion/**` и `shared/**` → error, `@bga/game-rebellion/schema` и `@bga/platform` — без ошибок;
  - `pnpm exec prettier --check` по своим файлам (кроме `scripts/`, он в `.prettierignore`) — clean;
  - `pnpm build` — exit 0; первый `pnpm check:bundle` — exit 1 (`invariants.ts` в бандле через `schema/state.ts` →
    `checkCardInvariants`); после решения Analyst Q1 (правило сужено до engine/shuffle/visibility) — `pnpm build &&
    pnpm check:bundle` — **exit 0**: 16 строковых правил OK; «OK check-web-bundle modules: 888 sources, 26 game modules,
    only definition/schema/board/assets; 0 apps/web/src/dev modules; 0 platform card engine modules».
- Для E2E-SYNC (не правилось, `e2e/**` не мой): `e2e/visual-a11y.spec.ts:329`, `e2e/support/setup.ts:110` ожидают
  `physical_companion` «скоро» при сопернике AI — теперь вариант доступен; при сопернике-человеке бейдж «только против AI».

### FE-A — Cards: contract sync (FE-0), Card Hand, Card Detail (frontend-worker, 2026-11-23)

- FE-0: `test/coreFixtures.ts` уже содержал `cards: null, table: null` (правка W2) — без изменений;
  `locales/{ru,en}/errors.json` (7 кодов), `match.json` (`log.CARDS_DRAWN`, `log.CARDS_DRAWN_count` plural,
  `log.CARD_REGISTERED`/`_hidden`, `log.TABLE_TASK_CONFIRMED` + `_<kind>` ×6), `data.json` (`cards.{types,typeInfo,zones,effects,usage}` —
  ключи каталога W2 дословно); `core-v1/sidebar/coreLogMessage.ts` (+`.test.ts`): 3 новых события (имена карт — только если
  сервер прислал `definitionIds`/`definitionId`, иначе счётчик / «скрыта»).
- Новые файлы `apps/web/src/games/rebellion/core-v1/cards/`: `index.ts`, `CardHandPanel.tsx`, `CardZoneSection.tsx`,
  `CardItem.tsx`, `OpponentCounts.tsx`, `CardsNotTracked.tsx`, `CardDetail.tsx` (+ `VerificationBadge`), `cardHelpers.ts`,
  `model/{catalog,handModel,cardUiStore}.ts`; тесты `CardHandPanel.test.tsx`, `CardDetail.test.tsx`, `cards.static.test.ts`,
  `model/{catalog,handModel}.test.ts`; `test/cardFixtures.ts`; `locales/{ru,en}/cards.json` (ns `rebellion.cards`);
  `locales.i18n.test.ts` (+ `rebellion.cards` в `TABLE_NAMESPACES`; `rebellion.table` добавит FE-B/лид).
- Точка входа для FE-B: `import { CardHandPanel } from '../cards'`; `<CardHandPanel onRequestRegister={() =>
  focusWhenReady(LOCATION_REGISTER_SELECT_ID)} />` — проп опционален; без него `card-hand-register` не рендерится (id формы
  регистрации принадлежит FE-B, `focus.ts`). Данные — `useCoreBoard()` (view, sessionId).
- Команды (Node 22.23.5) и результаты:
  - `pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/cards` — 5 файлов, 47 тестов passed;
  - `pnpm typecheck` — exit 0; `pnpm --filter @bga/web lint` — exit 0;
  - `pnpm --filter @bga/web test` — 106 файлов, 979 тестов passed (на дереве с изменениями FE-C, setup-тесты тоже зелёные);
  - `pnpm exec prettier --check apps/web` — clean; grep `rebelBase` и hex в `core-v1/cards` (кроме тестов) — пусто.
- Ограничения: `CardHandPanel` ещё не смонтирован во вкладку (FE-B); ручной проверки в браузере и e2e не было (`not_run`).
  TC-DET-04 покрыт на `VerificationBadge` с `needs-review` (в каталоге v0 все записи `verified`). Регион в ключевом
  параметре берётся из `view.map`; если системы нет на карте view — показывается только система.

### W3 — card engine in core-v1 (backend-worker, 2026-11-23)

- Новые файлы: `packages/games/rebellion/src/rules/core/cards.ts` (`initCoreCards`, `drawProbeCards`,
  `revealLocationCard`, `validateRegisterLocation`, `applyRegisterLocation`, `PROBES_PER_REFRESH`, `LOCATION_ZONE_ID`);
  тесты `test/rules/core/cards-{init,refresh,reveal,register,visibility,events-redaction}.test.ts` + хелпер
  `test/rules/core/cards-helpers.ts` (`permuteDeck`, `swapHand`, `relocateBase` с обменом карты Location, `passRound`);
  golden `test/fixtures/core/golden-cards-rebels-time.json` (13 Refresh, 12×2 + 1, колода исчерпана, A-8).
- Изменены: `src/rules/core/create.ts` (карты на карте базовой игры = `CORE_SYSTEM_IDS`; `physical_companion` →
  `table: initialTableState(...)` W4 — связка сделана здесь, т.к. `table.ts` уже существовал), `turn-flow.ts` (шаг 3
  между `LEADERS_RETURNED` и `TIME_ADVANCED`), `victory.ts` (`revealBase` → `revealLocationCard`), `redact.ts` (реальная
  редакция `CARDS_DRAWN`/`CARD_REGISTERED`, `coreCardsView`, `corePublicCardsView`, `table: tableViewFor`), `index.ts`
  (экспорт проекций и `initCoreCards`); `test/server/{core-script,core-scenarios,golden.test}.ts` (`asLegacy` в `start`,
  `startWithCards`, новый golden-тест).
- Отклонения/решения: (1) проекции `coreCardsView`/`corePublicCardsView` живут в `redact.ts`, а не в `cards.ts` (§1:
  проекции только в redact; без цикла `cards ↔ redact`), сигнатуры §11.5 те же; (2) карты создаются только когда карта
  данных = `CORE_SYSTEM_IDS` (mini-data тестов правил → без `cards`, поведение как до SWR-010; `physical_companion` на
  другой карте → throw); (3) `validateRegisterLocation` также отвечает `registrationUnavailable`, если `actor !== 'rebels'`.
- Golden: `golden-*.json`, `seeds/ai-empire-before-reveal.json`, `seeds/hotseat-empire-before-win.json`, `views/*.json` —
  без регенерации (golden-скрипт создаёт legacy-партию, §10.3 R3); `UPDATE_GOLDEN=1` запускался только для нового файла.
- Команды (Node 22.23.5) и результаты:
  - `pnpm vitest run test/rules/core/cards- test/server/golden.test.ts test/server/base-invariance.test.ts` (в пакете) —
    8 файлов, 64 теста passed;
  - `pnpm --filter @bga/game-rebellion test` — **exit 1**: 86 файлов (82 passed), 1036 тестов, **16 failed** — все вне W3:
    `test/schema/cards-state.test.ts` (2, W2: ожидают, что `createCoreGame` не создаёт `cards`, и W2-заглушку `cards: null`),
    `test/server/automation-hidden-base.test.ts` (6, W5) и `test/benchmark/scenarios.test.ts` (6 hidden-info, через
    `test/ai/fixtures/relocate-base.ts`): подделка базы без переноса карты Location → инвариант «Location card must name
    the rebel base»; `test/benchmark/scenarios.test.ts` TC-BEN-01 (1): `benchmark/scenarios.json` устарел (новые партии с
    `cards`); `test/ai/sim/determinism.test.ts` TC-DET-05 (1): хэш bot-vs-bot изменился (state с картами, `CARDS_DRAWN`).
    Проверено временной копией (удалена): `automation-hidden-base` с обменом карты Location ↔ карта `to` в колоде — 7/7 passed.
  - `pnpm -r typecheck` — exit 0; `npx eslint` по своим файлам — exit 0; `npx prettier --check` своих файлов — clean
    (prettier ругается только на `test/rules/core/table-*.test.ts` W4).
  - `pnpm --filter @bga/api test` (для информации) — exit 1, 7 failed / 856 passed: `automation-hidden-info`,
    `rules-hidden-info` (подделка базы без Location), `core-ai-autopass`, `core-hotseat` (точные списки событий Refresh
    без `CARDS_DRAWN`) — зона W5.
- Ограничения: `corePublicCardsView` нигде не используется в wire (эталон тестов, §4.2); `relocateBase` в тестах
  W3 корректен только пока карта целевой системы в колоде (до первого Refresh) — как в §10.3.

### W4 — physical table sync (backend-worker, 2026-11-23)

- Новые файлы: `packages/games/rebellion/src/rules/core/table.ts` (`initialTableState`, `tasksFromEvents`,
  `validateConfirmTask`, `applyConfirmTask`, `completeRegistration`, `tableViewFor`, `tableBlocks` — сигнатуры §11.5);
  тесты `test/rules/core/table-{init,tasks,confirm,register-pipeline,blocking}.test.ts` + хелпер `test/rules/core/table-fixtures.ts`;
  `test/server/physical-seeds.test.ts` → сиды `test/fixtures/core/seeds/{physical-rebels-registration,physical-empire-ai-task-pending,physical-empire-refresh-pending,digital-empire-after-refresh}.json`
  (`UPDATE_GOLDEN=1` запускался только для этого файла; формат = сиды SWR-005: `row`, `nextCommands`, `expectAfter`, `state`).
- Изменены: `src/rules/core/apply.ts` (заглушка W2 заменена веткой стола §5.5: 409 → нет `table` (`commandUnavailable` /
  `registrationUnavailable`) → `notYourSide` (только человек, не `auto`) → CONFIRM: `tableTaskNotFound` → `tableTaskNotHead`
  → `tableTaskNeedsRegistration`; REGISTER: `validateRegisterLocation` W3 (`gameOver` → `registrationUnavailable` →
  `unknownCard` → `cardNotEligible`) → `applyRegisterLocation` W3 → `completeRegistration`; прочие команды: … `notYourSide` →
  `tableSyncPending` → `notYourTurn` …; после `finalize` при `state.table` — `tasksFromEvents` по событиям команды, версия
  не меняется второй раз; CONFIRM не запускает state checks и задач не создаёт; `runStateChecks` — по-прежнему один вызов
  в `apply.ts`, TC-D-31), `src/rules/core/legal.ts` (непустая очередь → `[]` для любого зрителя).
- Решения: задачи — только из `corePlayerEvents(events, nextState, human)`; `aiActivation`/`aiMove` — по задаче на команду
  AI (AQ-8); Refresh = одна задача `refresh` (`returnLeaders` если не пусто, `takeProbeCards{definitionIds}` для
  человека-Империи / `opponentDrewProbeCards{count}` для человека-Повстанца, `advanceTime`) (AQ-1); `baseRevealed` →
  `revealBase`|`revealOwnBase` + `moveBaseUnits`, `affected.cardDefinitionIds = [probe-<base>]`; `affected.unitIds` у
  `baseRevealed` пуст (юниты не перечисляются: только данные из событий); `actor` задач: `initialSetup`/`refresh`/
  `baseRevealed` — `system`, `registerBase` — `rebels`, задачи AI — сторона AI; `tableViewFor` → `null` для стороны AI.
- Связки: `create.ts → initialTableState` и `redact.ts → tableViewFor` уже сделаны W3 (проверено). Для W5:
  `server/automation.ts` `pendingAiSide` должен вернуть `null` при `tableBlocks(state)` (экспорт из `rules/core/table`;
  при желании — реэкспорт через `rules/core/index.ts`, файл W3/лида).
- Команды (Node 22.23.5) и результаты:
  - `pnpm exec vitest run test/rules/core/table- test/server/physical-seeds.test.ts` (в пакете) — 6 файлов, **58 passed**;
  - `pnpm exec vitest run test/rules` (в пакете) — 33 файла, 324 passed;
  - `pnpm --filter @bga/game-rebellion test` — **exit 1**: 86 файлов (82 passed), 1036 тестов, **16 failed** — те же 16,
    что в отчёте W3, все вне W4: `test/schema/cards-state.test.ts` (2), `test/server/automation-hidden-base.test.ts` (6),
    `test/benchmark/scenarios.test.ts` (7), `test/ai/sim/determinism.test.ts` (1); партии с `table` в них не участвуют;
  - `pnpm -r typecheck` — exit 0; `pnpm lint` (eslint + prettier, весь репозиторий) — exit 0.
- Ограничения: `TC-BL-01` (`pendingActor`) на уровне правил покрыт только `legalActions = []` и `tableSyncPending` для
  `origin: 'auto'`; сам `pendingActor` — W5. Сиды построены правилами (`applyCommand`, AI — `origin: 'auto'`), а не ботом
  раннера: ходы AI в сидах — заскриптованные легальные ходы. `physical-rebels-registration` — после подтверждения
  `initialSetup` (голова `registerBase`, FQ-6); `rebelBaseSystemId` там — предварительная база.

### FE-B — Physical Execution mode, console integration (frontend-worker, 2026-11-23)

- Новые файлы `apps/web/src/games/rebellion/core-v1/table/`: `model/tableModel.ts` (`consoleMode`, `tableTasks`,
  `headTask`, `isAiWaiting`, `registrationOf`, `taskTitle`, `stepValues`/`stepText`, `affectedItems`, `groupedUnits`),
  `model/tableErrorStore.ts` (inline-ошибка с привязкой к `taskId` головы), `PhysicalExecutionPanel.tsx`, `TableTaskCard.tsx`,
  `TableTaskWaiting.tsx`, `TableTaskKeys.tsx`, `LocationRegisterForm.tsx`, `RegisterConfirmDialog.tsx`, `useTableCommands.ts`,
  `useConsoleModeFocus.ts`, `index.ts`; тесты `model/tableModel.test.ts`, `tableFixtures.test.ts`,
  `PhysicalExecutionPanel.test.tsx`, `useTableCommands.test.tsx`, `LocationRegisterForm.test.tsx`, `table.static.test.ts`;
  `apps/web/src/games/rebellion/test/tableFixtures.ts`; `locales/{ru,en}/table.json`.
- Изменены: `core-v1/sidebar/CoreSidebar.tsx` (+ `.test.tsx`: режим консоли, вкладка `cards` второй с `<CardHandPanel
  onRequestRegister>`, flex-правила для `physical-execution` ≤ 55dvh, `Tab` `minWidth: 0` для 4 вкладок на 375 px,
  `useConsoleModeFocus`), `core-v1/CoreTable.tsx` (+ `.test.tsx`: `data-console-mode`, `data-cards-tracked`, ссылка «К
  панели хода» ведёт на `PX_TITLE_ID` в режиме `physical`), `core-v1/model/viewModel.ts` (+ `.test.ts`:
  `baseRegistrationPending`, `visibleRebelBaseSystemId → null` при `table.registration`), `core-v1/panels/focus.ts`
  (только `PX_TITLE_ID`, `LOCATION_REGISTER_SELECT_ID`), `core-v1/top-bar/CoreGameInfoPanel.tsx` («Не зарегистрирована»,
  testid `game-info-base`), `board/model/selectionStore.ts` (`SidebarTab += 'cards'`), `locales/{ru,en}/board.json`
  (`sidebar.tab.cards`), `locales.i18n.test.ts` (одна строка: `'rebellion.table'` в `TABLE_NAMESPACES`).
- Решения: команды — `CONFIRM_TABLE_TASK { taskId: голова }` / `REGISTER_CARD { zoneId: registration.zoneId, definitionId }`
  через `ctx.send` (`useSendCommand`, `expectedVersion` из кэша); id головы читается в момент клика; кнопки `disabled` +
  `aria-busy` при `isPending`. «Зарегистрировать карту базы» в руке фокусирует select формы, а если голова ещё
  `initialSetup` (FD-3) — заголовок PX. Фокус при смене режима не трогается на первом рендере и при одновременном конце
  партии (баннер). Ключ i18n «клетка Rebel Base» назван `px.baseSpace` (без подстроки `rebelBase`, grep §5.4 пуст).
- Команды (Node 22.23.5) и фактические результаты:
  - `pnpm typecheck` (build:packages + `pnpm -r typecheck` + e2e tsconfig) — exit 0;
  - `pnpm --filter @bga/web lint` — exit 0;
  - `pnpm test` в `apps/web` — exit 0, **112 файлов, 1042 теста passed**;
  - `pnpm exec vitest run src/games/rebellion/core-v1/table src/games/rebellion/core-v1/sidebar/CoreSidebar.test.tsx`
    — 6 файлов, 48 passed; `… core-v1/CoreTable.test.tsx core-v1/model/viewModel.test.ts` — 2 файла, 43 passed;
  - `pnpm exec prettier --check` по всем файлам FE-B — «All matched files use Prettier code style!»;
  - `grep -rn rebelBase apps/web/src/games/rebellion/core-v1/table` (без тестов) — пусто.
- Не выполнялось (`not_run`): ручная проверка на dev-5180 (`G_PHY_REB` 1440/375, скриншоты) — запуск dev-стека пишет в
  `dev.db` (запрещено брифом), W5 (живой API/раннер) не сдан; e2e не запускались (бриф). Вёрстка 4 вкладок на 375 px и
  высота PX-модуля на 1024×768 проверены только тестами jsdom (без раскладки) — нужна проверка лида/QA (FR-2, FR-3).

### W5 — AI, automation, API integration (backend-worker, 2026-11-23)

- Код: `src/server/automation.ts` — `pendingAiSide` → `null`, пока `tableBlocks(state)` (до проверки стороны): нет
  `decisionPoint`, нет платных вызовов, `applyCandidate` → 422 `notYourTurn`; раннер останавливается `humanTurn`
  (после шага AI) / `none` (0 шагов), `pending: false` (AQ-6). `src/ai/describe.ts` — `cardLines(view)` после строк
  базы: только из `view.cards` своей стороны, только при `empire-probes.count > 0` (AQ-5): Империя —
  `Your probe cards (the Rebel base is NOT in these systems): <systems>. Probe deck: <n> cards left.`, Повстанцы —
  `The Empire holds <n> probe cards (each names a system that is not your base); probe deck: <m> cards left.`
  Кандидаты / rulesQuery / бюджет / fallback не менялись. `src/rules/core/index.ts` — экспорт `tableBlocks`.
- KB (AQ-2): `rebellion:impl.engine-scope` и `rebellion:impl.refresh-partial` переформулированы своими словами (в
  партиях с картами Империя берёт 2 зонда в Refresh; прочих карточных механик нет; слово «probe droids» в engine-scope
  сохранено — его требует TC-ST-03). Перегенерированы: `test/knowledge/fixtures/rules-selection.golden.json`
  (`UPDATE_RULES_SELECTION_GOLDEN=1` + prettier) и `docs/game-rules/rebellion/rules-index.md` (`UPDATE_KB_DOCS=1`) —
  файлы вне списка W5, вынужденные одобренной правкой KB. `coverage.json` / `manifest.json` / `discrepancies.json`
  валидатор не потребовал — не менялись. **Байты rules-on промптов меняются** (строка engine-scope длиннее, `rulesVersion`
  новый); rules-off golden (`rules-off-golden.int.test.ts`) — без изменений, зелёный без регенерации.
- Починка тестов: `test/schema/cards-state.test.ts` (legacy-тест удаляет `cards`/`table` из созданной партии; заглушка
  W2 заменена проверкой реальной проекции); `test/ai/fixtures/relocate-base.ts` (+ `swapLocationCard`: карта Location
  меняется с картой целевой системы на той же позиции колоды; `null`, если карты цели нет в колоде) — используется и
  в `test/server/automation-hidden-base.test.ts`; `benchmark/scenarios.json` перегенерирован
  (`UPDATE_BENCH_SCENARIOS=1` + prettier; diff — только `state.cards` во всех 14 сценариях и `CARDS_DRAWN` в `state.log`
  10 из них, `expected`/rubric без изменений); `test/ai/sim/determinism.test.ts` — golden `2669f596` → `c0dcc415`
  с комментарием; добавлена проверка, что та же партия без `cards` и `CARDS_DRAWN` (seq перенумерован) по-прежнему
  даёт `2669f596` (поведение бота не изменилось). API: `core-ai-autopass` / `core-hotseat` (Refresh += `CARDS_DRAWN`),
  `automation-hidden-info` / `rules-hidden-info` (перенос базы двигает карту Location: новый
  `apps/api/test/support/location-card.ts`).
- Новые тесты: `test/ai/describe-cards.test.ts` (8: R6 байт-равенство раунда 1 и legacy, строки после Refresh,
  S2/S3 инвариантность к руке Империи, S4 к порядку колоды, максимальная рука ≤ 600 / 4000);
  `test/server/automation-cards.test.ts` (6: блокировка/возобновление, drain останавливается после шага с задачей,
  кандидаты без `REGISTER_CARD`/`CONFIRM_TABLE_TASK`, инвариантность decision point к S3/S4);
  `apps/api/test/physical-sync.int.test.ts` (5: блокировка раннера 0 шагов / 0 вызовов commander, 422
  `tableSyncPending`, AI продолжает в ответе на последний CONFIRM, повтор CONFIRM 409/422 `tableTaskNotFound`,
  REGISTER_CARD ошибки + успех + повтор 409/422 `registrationUnavailable`, рестарт на том же файле БД, replay на двух
  БД байт-равен); `apps/api/test/legacy-core-cards.int.test.ts` (2: GET не переписывает строку, команды/раскрытие/Refresh
  без `cards`/`table`/`CARDS_DRAWN`); `apps/api/test/cards-hidden-info.int.test.ts` (3: матрица §10.1 для каналов W5 —
  ответы create/command/run, GET, список сессий, 409/422, промпты commander (fake fetch), AiUsage, dev-диагностика,
  логи; с позитивными контролями сканера); хелпер `apps/api/test/support/physical-helpers.ts`.
- Команды (Node 22.23.5) и фактические результаты:
  - `pnpm --filter @bga/game-rebellion test` — exit 0, **88 файлов, 1050 тестов passed**;
  - `apps/api`: `pnpm test` — exit 0, **84 файла passed (1 skipped), 873 passed / 2 skipped**;
  - `pnpm --filter @bga/platform test` — exit 0, 23 файла, 472 passed;
  - `pnpm -r typecheck` — exit 0; `pnpm lint` (eslint + prettier --check) — exit 0.
- Не выполнялось (`not_run`): e2e (бриф), `pnpm verify`, `pnpm --filter @bga/api build`/`bench:ai`.
- Ограничения / вопросы: `discrepancies.json` DISC-003 `engineBehaviour` всё ещё говорит «No … probe cards» (валидатор
  не требует правки; текст DISC в промпт не попадает) — предлагаю лиду/Analyst частично закрыть DISC-003 отдельно.
  Intel «Possible base locations» зонды не учитывает (A-11, RK-5). `apps/api/src` не менялся.

### FIX-R1 — review round 1, minor findings 1 и 2 (backend-worker, 2026-11-23)

- `packages/games/rebellion/src/schema/state.ts`:
  - `checkCardsAndTable` — новые инварианты таблицы задач (битые строки отклоняются при parse): `completion === 'register'`
    ⇔ `kind === 'registerBase'` (для каждой задачи); не более одной задачи `registerBase`; `titleKey === 'table.tasks.<kind>'`
    (фиксированное отображение из `rules/core/table.ts` `task()`). Инвариант «`registerBase` в очереди ⇔
    `baseRegistration !== null`» уже существовал (`baseRegistration iff a registerBase task is queued`) — не менялся.
  - `CardsDrawnViewEventSchema` — восстановлена проверка `definitionIds.length === count` для не-`null` формы
    (`definitionIds: null` для чужого зрителя по-прежнему допустим).
- Тесты (`test/schema/cards-state.test.ts`, +5): completion/kind (3 негативных варианта), два `registerBase`, неверный
  `titleKey`, позитивный контроль (фикстуры + `createCoreGame` для обеих сторон physical), view `CARDS_DRAWN` с
  `definitionIds` короче `count` и пустым массивом → отклонён (`CardsDrawnViewEventSchema`, `CoreViewEventSchema`,
  `PlayerEventSchema`), `null` и полная форма — приняты.
- Команды (Node 22.23.5) и фактические результаты:
  - `pnpm --filter @bga/game-rebellion test` — exit 0, **88 файлов, 1055 passed**;
  - `apps/api`: `pnpm test` — exit 0, **84 файла passed (1 skipped), 873 passed / 2 skipped**;
  - `pnpm -r typecheck` — exit 0;
  - `pnpm lint` — eslint exit 0; `prettier --check .` — **exit 1 только из-за `e2e/support/cards.ts`** (неотслеживаемый файл
    параллельного e2e-воркера, вне зоны FIX-R1); `prettier --check` и `eslint --max-warnings=0` по изменённым файлам FIX-R1 — exit 0.
- Не выполнялось (`not_run`): e2e (бриф), `pnpm verify`.
- Ни одно состояние, созданное движком, новые инварианты не нарушает (полные наборы тестов rebellion и api зелёные).
- **W5 follow-up (review round 2, №6–8, 2026-11-23):**
  - №6: `test/server/automation-cards.test.ts` + тест «S5»: физический режим, человек-Повстанцы vs AI-Империя, каждая
    из 9 допустимых регистраций Location → пас Повстанцев → `toSideView(…, 'empire')` и `decisionPoint` байт-равны
    для всех 9 (по одному уникальному JSON), токен карты базы `probe-<id>` в них отсутствует (id систем — публичная
    карта, поэтому проверяется инвариантность, а не поиск имени).
  - №7: `knowledge/discrepancies.json` DISC-003 `engineBehaviour` переформулирован (партии с картами хранят колоду
    зондов, в шаге 3 Империя тянет 2, пока колода не пуста; legacy — без добора; прочих карточных механик нет).
    Перегенерирован `docs/game-rules/rebellion/discrepancies.md` (`UPDATE_KB_DOCS=1`, тест требовал).
  - №8: `impl.engine-scope` — «…the Empire draws 2 probe cards in each Refresh while the deck lasts; no other rules for
    probe droids exist.» Перегенерированы `rules-selection.golden.json` (`UPDATE_RULES_SELECTION_GOLDEN=1` + prettier) и
    `rules-index.md`; rules-on байты снова меняются, rules-off golden — без изменений.
  - Результаты: `pnpm --filter @bga/game-rebellion test` — exit 0, 88 файлов, 1056 passed; `apps/api` `pnpm test` —
    exit 0, 873 passed / 2 skipped; `pnpm --filter @bga/game-rebellion typecheck` — exit 0; `eslint .` — exit 0;
    `pnpm lint` — **exit 1** только из-за prettier в `e2e/card-detail.spec.ts`, `e2e/card-hand.spec.ts`,
    `e2e/support/cards.ts` (параллельная e2e-работа, вне W5, не трогались). e2e не запускались.

### FIX-QA1 — UI-дефекты из e2e: D-1 (usage по зоне) и O-1 (RU `placeLeader`) (frontend-worker, 2026-11-23)

- **D-1.** Новый чистый хелпер `apps/web/src/games/rebellion/core-v1/cards/model/cardUsage.ts` → `usageForZone(def,
  zoneKind)`: для `probe` в `hand` текущая роль — `cards.usage.probe-refresh-draw`, в `special` (Location) и
  `revealed` — `cards.usage.probe-base-location`; в `deck`/`removed`/без зоны роли нет (`current: null`); у типов без
  ролей — первая usage, как раньше. Возвращает `current` и `ordered` (текущая первой, остальные в порядке каталога).
  Каталог в `packages/**` не менялся.
  - `CardItem`: короткое описание = `usageForZone(...).current`, иначе описание типа (`cards.typeInfo.*`); строка
    получила `data-testid="card-hand-item-usage"`.
  - `CardDetail`: новый необязательный prop `zoneKind` (передаётся из `CardHandPanel`), usage выводятся в порядке
    `ordered`; при >1 usage текущая помечена бейджем «Сейчас»/«Now» (`rebellion.cards:detail.usageCurrent`) и
    `data-current="true"`, прочие — приглушённым цветом.
  - Тесты: `model/cardUsage.test.ts` (новый, 9 кейсов), `CardHandPanel.test.tsx` (Location/revealed → base-location,
    Empire hand → refresh-draw), `CardDetail.test.tsx` (порядок и метка в руке Империи и в Location, без `zoneKind` —
    без метки). `e2e/card-hand.spec.ts`: строковая проверка ужесточена — у Location карты base-location, не refresh-draw.
- **O-1.** `locales/ru/table.json`: `placeLeader` → «Поставьте лидера: {{leader}} → {{system}}.» (имена в именительном
  падеже читаются естественно); «Rebel Base» в RU-шагах и `px.baseSpace` заменено на термин доски «База Повстанцев»
  (как в `board.json`/`map.json`/`turn.json`). EN не менялся («Place {{leader}} in {{system}}.» корректно). Обновлены
  строки в `table/model/tableModel.test.ts` и `table/PhysicalExecutionPanel.test.tsx`; e2e берёт `px.baseSpace` из локали.
- Команды (Node 22.23.5), фактические результаты:
  - `pnpm --filter @bga/web test` — exit 0, **113 файлов, 1052 passed**;
  - `pnpm --filter @bga/web typecheck` — exit 0; `pnpm --filter @bga/web lint` — exit 0; `pnpm lint` — exit 0
    (eslint + prettier --check);
  - `pnpm exec playwright test e2e/card-hand.spec.ts e2e/card-detail.spec.ts e2e/physical-execution.spec.ts` —
    **19 passed**.
- Не выполнялось (`not_run`): полный e2e, `pnpm verify`.

### E2E-SYNC (qa-worker, записано Analyst по отчёту исполнителя)

- Файлы: `e2e/support/{board,seed,setup,testids,api,cards}.ts`; новые спеки `e2e/{card-hand,card-detail,cards-legacy,cards-hidden,physical-execution,swr010-screenshots}.spec.ts`; правки `e2e/{game-setup,visual-a11y,ai-commander}.spec.ts`.
- `CURRENT_SCREENSHOT_TASK` → `SWR-010`; `ai-commander.spec.ts` явно пишет в `SWR-006` только при `SCREENSHOT_TASK=SWR-006` (по умолчанию — `test-results/`).
- Базовый прогон до правок спеков: 145 passed / 3 failed (ожидаемо: physical_companion против AI) — `docs/tasks/SWR-010/artifacts/logs/e2e-baseline-before-sync.log`.
- Итог: `pnpm e2e` — 183 passed, EXIT 0 — `docs/tasks/SWR-010/artifacts/logs/e2e.log`; 42 скриншота `artifacts/screenshots/swr010-*`.
- Дефекты: D-1, O-1 → FIX-QA1 (исправлены). Ревью #9 (нет позитивного контроля в `cards-hidden.spec.ts`) → FIX-E2E после финального verify.

### FIX-QA2-e2e — ревью #9 (позитивные контроли сканера утечек) и nit #10 (qa-worker, 2026-11-23)

- Файлы: `e2e/cards-hidden.spec.ts`, `e2e/support/setup.ts`. Продуктовый код и `apps/api/test/**` не трогались.
- **#9.** `expectNoSecrets(page, calls, secrets, label, controls)` теперь сначала требует, чтобы тот же `tokenRe` по тем
  же каналам (тела `/api/**` из `recordApi`, DOM `outerHTML` вкл. порталы, localStorage, sessionStorage, URL) НАШЁЛ
  каждый позитивный контроль; набор контролей структурно обязан покрывать DOM, обе storage, URL и хотя бы одно тело API,
  и ни один контроль не может быть секретом. Контроли (`controlsFor`): канарейка `e2e-scan-canary`, подложенная в обе
  storage через `addInitScript` (приложение sessionStorage не использует), ключ dev-AI опт-ина в localStorage, свой
  `sessionId` в URL; карты в DOM и в теле `GET /api/sessions/:id` — Rebels: своя Location (`rebels-location` из БД-оракула)
  + публичная карта `probe-box`; Empire: публичная `probe-box` + свои зонды `empire-probes` (в сидах, где они есть).
  Дополнительно: текст Card Hand содержит имя системы своей Location (Rebels) / публичной `probe-box` (Empire) — контроль
  для проверок по именам систем. `scanForBase` отдельным контролем не покрыт (тела API доказаны токен-контролями).
- **#10.** `AI_ONLY_BADGE` собирается из `setup:newGame.aiOnly` RU/EN локалей (`msg` из `support/cards.ts`, с экранированием).
- Демонстрация сломанного контроля (сделана и откатана): в `expectNoSecrets` тела API подменены на `null`, DOM — на
  `<html></html>` → `cards-hidden.spec.ts` **4 failed** («positive controls of the scanner»: own Location / probe-box /
  own probes not found in DOM и GET session). После отката — 4 passed.
- Команды (Node 22.23.5): `pnpm exec playwright test e2e/cards-hidden.spec.ts e2e/game-setup.spec.ts e2e/visual-a11y.spec.ts`
  — **26 passed**; `pnpm lint` — exit 0; `pnpm exec tsc -p e2e/tsconfig.json --noEmit` — exit 0; md5 20 PNG
  `docs/tasks/SWR-006/artifacts/screenshots/` до/после — без изменений.
- Не выполнялось (`not_run`): полный `pnpm e2e`, `pnpm verify`.

### FIX-QA2-backend — интеграционные тесты TC-CF-07/08 (PO G-10) и TC-RST-03 (backend-worker, 2026-11-23)

- Только тесты, продуктовый код не менялся (дефектов тесты не выявили). Новые файлы:
  - `apps/api/test/table-confirm-race.int.test.ts` — реальный модуль Rebellion, реальный раннер, commander в режиме
    OpenAI на fake fetch (без сети), временная SQLite, `Promise.all` двух идентичных конвертов (схема
    `automation-double-submit.int.test.ts`):
    - TC-CF-07 (×20 партий, люди-Повстанцы, очередь `[t-1-1 initialSetup, t-1-2 registerBase]`): два параллельных
      `CONFIRM(t-1-1, v)` → ровно один 200, второй 409/422 `tableTaskNotFound`, никогда 500; версия v+1; ровно одно
      `TABLE_TASK_CONFIRMED` (taskId `t-1-1`); события непрерывны; строка = последовательному прогону на другой БД
      с теми же id; 0 платных вызовов.
    - Вариант «голова + следующая задача» (×20): `CONFIRM(t-1-2) ‖ CONFIRM(t-1-1)` → применяется только голова,
      проигравший 409/422 `tableTaskNotHead`/`tableTaskNotFound`; `CONFIRM(t-1-1) ‖ REGISTER_CARD` с одной версией →
      применяется ровно один из двух, второй 409; версия +1, ровно одно новое событие.
    - TC-CF-08 (×20 партий, люди-Империя, очередь из одной задачи): победивший ответ — `steps: 1, humanTurn`;
      прирост вызовов fake = `steps` (итого 20 на 20 партий), AI-команды повстанцев в журнале = `steps` (без
      задвоения), одно `TABLE_TASK_CONFIRMED`, версия v+1+steps, состояние = последовательному прогону.
  - `apps/api/test/table-restart.int.test.ts` — TC-RST-03: партия люди-Повстанцы, перезапуск (закрыт инстанс 1,
    новый инстанс на том же файле БД) ДО регистрации Location: тот же `view`/`automation`, тот же список
    допустимых систем, строка не переписана чтением; `RUN` — 0 шагов, 0 вызовов fake, строка не изменена; `PASS` →
    422 `tableSyncPending`; затем `REGISTER_CARD` (система ≠ предварительной) работает, Location содержит карту,
    `CONFIRM(t-1-1)`, `PASS` человека → AI-Империя ходит (вызовы fake = `steps`), события непрерывны.
- Наблюдения (не дефекты, по дизайну): до регистрации `rebelBase.systemId` в хранимом состоянии — предварительная
  система (переносится `applyRegisterLocation`), Location-зона пуста; `table.aiWaiting` = false, т.к. раунд 1
  открывают люди-Повстанцы (блокировка проверена через `RUN`/`PASS`).
- Команды (Node 22.23.5), фактические результаты:
  - `npx vitest run test/table-confirm-race.int.test.ts test/table-restart.int.test.ts` (в `apps/api`) — 5 прогонов
    подряд, каждый exit 0, 2 файла / 4 теста passed;
  - `apps/api` `pnpm test` — exit 0, 86 файлов passed / 1 skipped, 877 passed / 2 skipped;
  - `apps/api` `pnpm lint` — exit 0; `apps/api` `pnpm typecheck` — exit 0; `prettier --check` новых файлов — ok.
- Не выполнялось (`not_run`): `pnpm verify`, e2e (вне зоны).
