# Review — SWR-010 (round 1: W1–W4, FE-A, FE-B, FE-C; round 2: W5; round 3: FIX-QA1 + e2e)

Reviewer: independent reviewer (Claude Code subagent; не автор ни одной строки проверяемого кода)  ·  Author(s) of reviewed
code: backend-workers W1 (platform cards), W2 (Rebellion contracts), W3 (card engine), W4 (physical table sync);
frontend-workers FE-A (Card Hand / Card Detail), FE-B (Physical Execution), FE-C (setup, bundle, ESLint).

Scope: незакоммиченные изменения ветки `swr-009-vector-terminal` относительно `f3619a1` (tracked diff + untracked).
Вне scope: `docs/design/`, `docs/product/progress-2026-11-20.md`, `.claude/launch.json`, скриншоты `docs/tasks/SWR-006/**`.

**W5: pending delta review** (на момент раунда 1; проверен в разделе «Round 2 — W5» ниже) — `src/ai/describe.ts`, `src/server/automation.ts`, `knowledge/entries/implementation-notes.json`,
`test/ai/**`, `test/server/**` (кроме файлов W3/W4, перечисленных ниже), `test/benchmark/**`, `apps/api/test/**` в этот раунд
не входят и будут проверены отдельной дельтой. Каналы матрицы §10.1, закрываемые W5 (ответ команды/`automation/run`,
сводка сессии, `decisionPoint`, промпт, dev-диагностика, лог сервера, 422 на HTTP-уровне), в этом раунде **не проверены**.

## Проверки, запущенные reviewer (Node 22.23.5)

| Команда | Результат |
|---|---|
| `pnpm -r typecheck` | все пакеты `Done` (platform, game-rebellion, api, web) |
| `pnpm --filter @bga/platform test` | 23 файла, 472 теста passed |
| `pnpm exec vitest run test/rules test/schema test/server/golden.test.ts test/server/physical-seeds.test.ts test/server/base-invariance.test.ts` (в `packages/games/rebellion`) | 46 файлов, 510 passed |
| `pnpm exec vitest run` (весь `packages/games/rebellion`, на дереве с текущими правками W5) | 88 файлов, 1050 passed (известные 16 падений уже не воспроизводятся) |
| `pnpm --filter @bga/web test` | 112 файлов, 1042 passed |
| `node --test "scripts/*.test.mjs"` | 454 pass, 0 fail |
| `pnpm lint` (eslint `--max-warnings=0` + prettier) | exit 0, «All matched files use Prettier code style!» |
| `pnpm build && pnpm check:bundle` | build exit 0; 16 строковых правил OK (вкл. `card-deck-seed`, `rebellion-card-server-symbol`); «OK … 910 sources, 26 game modules, only definition/schema/board/assets; 0 apps/web/src/dev modules; 0 platform card engine modules» |
| Скрипт сравнения ключей RU/EN (`table`, `cards`, `data`, `errors`, `match`, `setup`, `board`) | расхождений нет (без учёта плюральных суффиксов; RU имеет `_one/_few/_many/_other`) |
| `git diff test/fixtures/core/views/` | меняются только `"cards": null`, `"table": null` (4 файла); `golden-*.json` и старые `seeds/*.json` не изменены |

E2E не запускались (по брифу) — `not_run`. `apps/api` тесты не запускались (зона W5) — `not_run`.

## Что проверено и признано корректным (кратко)

1. **Скрытая информация.**
   - `redact.ts` остаётся единственной точкой: `coreCardsView` = `projectZones` с `revealZoneIds=['rebels-location']`
     только когда `!hiddenBaseFor`; `probe-deck` (ordered + hidden) → `cards: null` для любого зрителя, включая
     владельца (платформа `visibility.ts:30`, плюс `superRefine` в `CardZoneViewSchema` запрещает обратное);
     `empire-probes` у Повстанцев — счётчик; неупорядоченные зоны сортируются по id (порядок добора не утекает).
   - `CARDS_DRAWN.definitionIds → null`, если зритель ≠ `side`; `CARD_REGISTERED.definitionId → null`, пока
     `hiddenBaseFor`; `TABLE_TASK_CONFIRMED` публичен.
   - Задачи стола строятся **только** из `corePlayerEvents(events, nextState, human)` (`table.ts:150`), хранятся
     неизменными; `tableViewFor` → `null` для стороны AI; регистрация (`eligibleDefinitionIds`) есть только у
     человека-Повстанца. Шаг Refresh для человека-Повстанца — `opponentDrewProbeCards{count}`.
   - Предварительная база человека-Повстанца не влияет на колоду: при `registrationPending` Location пуст, колода = 26
     карт независимо от базы; перемешивание после регистрации — фиксированный seed. AI не ходит до регистрации.
   - `details` ошибок — только эхо запроса (`{actor}`, `{actor,type}`, `{taskId}`, `{zoneId,definitionId}`),
     `VERSION_CONFLICT` — `currentVersion` (как раньше).
   - Тесты утечек действительно метаморфические: `cards-visibility.test.ts` (10 перестановок колоды → байт-равные виды;
     `relocateBase` с обменом карты Location для 4 режимов; `swapHand` + позитивный контроль), `table-tasks.test.ts`
     TC-TT-09 (две партии, отличающиеся только базой → байт-равные задачи), `cards-events-redaction.test.ts` (S2, S5).
   - Бандл: `@bga/platform/cards` запрещён ESLint во всех web-наборах; модульная проверка подтверждает отсутствие
     `engine/shuffle/visibility`; seed-литерал и серверные символы в бандле не найдены (прогон reviewer).
2. **Корректность / инварианты.** Платформенные операции чистые (клонирование, ошибки — результат, не исключение),
   `checkCardInvariants` ловит дубли/потери; property-тест 1000×20 (W1). Shuffle — FNV-1a + mulberry32, без
   `Math.random`/`Date` (grep по `platform/src/cards`, `rules/core/{cards,table,apply,create}.ts`, `schema/{cards,card-catalog,table}.ts` пуст).
   `CONFIRM_TABLE_TASK`: голова, `version+1` через `finalize`, без `runStateChecks`/новых задач, повтор → 409/422
   `tableTaskNotFound`, после `outcome` разрешён. `REGISTER_CARD`: только `physical_companion` + человек-Повстанец,
   пока есть `baseRegistration`; остальные команды до этого → `tableSyncPending`; юниты Повстанцев переносятся с
   базой; повтор → `registrationUnavailable`. Порядок проверок §5.5 соблюдён и покрыт тестами по веткам.
   `coreLegalActions` → `[]` при непустой очереди.
3. **Legacy.** `cards`/`table` — optional; R1-тест (`legacy-core.test.ts`) проверяет байт-равенство `parse→stringify`
   для golden/seed-состояний и `upcastState`; Refresh без `cards` не добирает; `mock-v1` отклоняет новые команды через
   `MOCK_COMMAND_TYPES` (без изменений).
4. **Архитектура.** `packages/platform/src/cards/**` — только `zod`, без Rebellion-терминов (grep и тест W1);
   game-core без React/Nest/OpenAI; web импортирует карты только из `@bga/game-rebellion/schema`.
5. **UI.** Кнопки «Play» нет (Card Detail — только «Закрыть», static-тест); двойная отправка: `useSendCommand`
   (sync-ref `inFlight` → `IGNORED`, которое не показывается ни inline, ни снэкбаром) + `disabled`/`aria-busy`;
   регистрация — через диалог подтверждения; режим консоли — чистая функция `view.table` (восстанавливается после
   перезагрузки); `visibleRebelBaseSystemId → null` до регистрации; хардкод-цветов в `core-v1/{cards,table}`,
   `CoreSidebar.tsx`, `setup/**` нет (grep).

## Отклонения от контракта plan-backend §11 (зафиксированы, согласованы Analyst — не являются замечаниями)

- `rulesetId` → `editionId` в платформенных схемах (W1-Q1, §16); Rebellion: `editionId: 'base'`.
- Ключ параметра зонда — `system-id` (`PROBE_SYSTEM_PARAM`), система читается через `probeSystemOf` (W2-Q1).
- Ключ описания типа — `cards.typeInfo.<typeId>` (FQ-4).
- `cards/invariants` разрешён в web-бандле (приходит через `schema/state.ts` → `checkCardInvariants`; Analyst Q1, FE-C).
- Проекции `coreCardsView` / `corePublicCardsView` живут в `redact.ts`, а не в `cards.ts` (W3, сигнатуры те же).
- Карты создаются только на карте `CORE_SYSTEM_IDS` (мини-данные тестов → без `cards`); `physical_companion` на
  другой карте → throw (W3).
- `validateRegisterLocation` дополнительно отвечает `registrationUnavailable` при `actor !== 'rebels'` (`cards.ts:188`;
  недостижимо после проверки `notYourSide`, безвредно).
- Маппинг ошибок схемы в `restorePile` (W1-Q2).

## Findings

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | minor | `packages/games/rebellion/src/schema/state.ts:562-625` (`checkCardsAndTable`) | Инварианты стола не проверяют связь `completion` ↔ `kind` (`'register'` ⇔ `registerBase`), не более одной задачи `registerBase`, `titleKey === table.tasks.<kind>`. Сценарий: повреждённая/вручную исправленная строка с `registerBase` и `completion: 'confirm'` проходит парсинг; `CONFIRM_TABLE_TASK` удаляет задачу, но `baseRegistration` остаётся → следующее состояние нарушает инвариант «baseRegistration iff registerBase» → ошибка схемы при сохранении/чтении (500), партия застревает. Наоборот, `confirm`-задача с `completion: 'register'` не подтверждаема ничем (вечная блокировка, RK-4). Достижимо только через порчу данных (W2 сам отметил ограничение). | Добавить в `checkCardsAndTable`: для каждой задачи `completion === 'register'` ⇔ `kind === 'registerBase'`; `titleKey === \`table.tasks.${kind}\``; ≤ 1 `registerBase`. Позитив/негатив-тест в `cards-state.test.ts`. |
| 2 | minor | `packages/games/rebellion/src/schema/state.ts:221-229` (`CardsDrawnViewEventSchema`) | View-форма теряет refine `definitionIds.length === count` (у state-формы он есть). Неконсистентное событие (`count: 2`, один id) пройдёт `PlayerEventSchema`; web (`coreLogMessage`) и шаг `takeProbeCards` покажут разные числа. Сервер такого не порождает, но контракт view слабее state. | Добавить `.refine(p => p.definitionIds === null \|\| p.definitionIds.length === p.count)` к payload view-формы. |
| 3 | nit | `packages/games/rebellion/src/schema/cards.ts:97` | Комментарий «Every zone of REBELLION_CARD_ZONES, in that order» не обеспечен схемой: `zones` — произвольный массив. FE (`handModel`) классифицирует зоны по полям, так что вреда нет, но контракт декларативен. | Либо `superRefine` (ids === `REBELLION_CARD_ZONE_IDS` по порядку), либо смягчить комментарий. |
| 4 | nit | `packages/platform/src/cards/index.ts:3-19`, `packages/platform/package.json` | Web-безопасная `schema/cards.ts`/`state.ts` импортирует корень `@bga/platform/cards`, который реэкспортирует engine/shuffle/visibility. Их отсутствие в бандле держится на tree-shaking (нет `"sideEffects": false`), а не на структуре импорта. Сейчас защищено модульной проверкой `check:bundle` (прогон reviewer: 0 модулей), так что регресс будет пойман CI. | Опционально: подпуть `@bga/platform/cards/schema` (только Zod + invariants) для игровых `schema/**`, или `"sideEffects": false` в `packages/platform/package.json`. |
| 5 | nit | `packages/games/rebellion/src/rules/core/table.ts:312` | `JSON.parse(JSON.stringify(table.tasks))` для копии задач во view. Корректно (все поля JSON-сериализуемы), но обходит типизацию (`as TableTask[]`). | `structuredClone(table.tasks)` или явная копия; не блокирует. |

Блокирующих и major замечаний в объёме раунда 1 нет.

Вердикт раунда 1 (до W5): `approved` для W1–W4, FE-A, FE-B, FE-C.

**Статус замечаний 1–2 (re-check в раунде 2):** в рабочем дереве уже есть правки FIX-R1 — `state.ts:230` (refine
`definitionIds === null || length === count` у view-формы `CARDS_DRAWN`), `state.ts:617-641` (≤ 1 `registerBase`,
`completion === 'register'` ⇔ `kind === 'registerBase'`, `titleKey === table.tasks.<kind>`) и негатив-тесты в
`test/schema/cards-state.test.ts` (`FIX-R1: …`). Прогон reviewer: `pnpm exec vitest run test/schema test/rules/core` —
34 файла, 427 passed. Код правок соответствует рекомендациям → №1 и №2 считаю **исправленными**. Записи FIX-R1 в
`implementation-plan.md` на момент проверки ещё нет (воркер работает) — лиду убедиться, что лог появится; если правки
после этого изменятся, нужен повторный взгляд на эти две строки.


## Round 2 — W5 (delta review)

Объём: `src/server/automation.ts` (`pendingAiSide` + `tableBlocks`), `src/rules/core/index.ts` (экспорт `tableBlocks`),
`src/ai/describe.ts` (`cardLines`), `knowledge/entries/implementation-notes.json` (AQ-2) + перегенерированные
`test/knowledge/fixtures/rules-selection.golden.json`, `docs/game-rules/rebellion/rules-index.md`; правки тестов
(`test/schema/cards-state.test.ts`, `test/ai/fixtures/relocate-base.ts` `swapLocationCard`,
`test/server/automation-hidden-base.test.ts`, `benchmark/scenarios.json`, `test/ai/sim/determinism.test.ts`,
`test/knowledge/rules-provider.test.ts`); новые `test/ai/describe-cards.test.ts`, `test/server/automation-cards.test.ts`,
`apps/api/test/{physical-sync,legacy-core-cards,cards-hidden-info}.int.test.ts`, `apps/api/test/support/{physical-helpers,location-card}.ts`;
правки `apps/api/test/{core-ai-autopass,core-hotseat,automation-hidden-info,rules-hidden-info}.int.test.ts`.
`apps/api/src/**` не менялся (`git status`).

### Проверки, запущенные reviewer (Node 22.23.5)

| Команда | Результат |
|---|---|
| `pnpm test` в `apps/api` (временные БД) | 84 файла passed / 1 skipped; 873 passed / 2 skipped; exit 0 |
| `pnpm exec vitest run` (весь `packages/games/rebellion`) | 88 файлов, 1050 passed |
| `pnpm exec vitest run test/schema test/rules/core` (после FIX-R1 в дереве) | 34 файла, 427 passed |
| Скрипт: `benchmark/scenarios.json` HEAD vs рабочее дерево после удаления `state.cards` и событий `CARDS_DRAWN` (с перенумерацией `seq`) | байт-равны; 14 сценариев, ни в одном нет `table` |
| `git diff` `rules-selection.golden.json`, `rules-index.md`, `rules-provider.test.ts` | меняются только текст `impl.engine-scope` / заголовок `impl.refresh-partial` и `rulesVersion`; тест исключает `CONFIRM_TABLE_TASK`/`REGISTER_CARD` из наборов команд AI |
| Ad-hoc проба S5 (временный тест в scratchpad, не в репозитории): `physicalGame('rebels')` → `REGISTER_CARD` каждой из 9 допустимых карт → `CONFIRM` → `toSideView(state,'empire')` | 9 регистраций → 1 уникальный JSON вида Империи (вид AI-Империи не зависит от зарегистрированной базы); `activeSide` = Повстанцы, поэтому `decisionPoint` в пробе не строился |

E2E и `pnpm verify` — `not_run` (по брифу).

### Что проверено

1. **Промпт / decisionPoint без карт соперника.** `cardLines` читает только `view.cards` своей стороны (а вид уже
   отредактирован `redact.ts`): Империя — свои `empire-probes` (системы), Повстанцы — только `count` зондов Империи и
   колоды; Location не печатается; при `count === 0` и `cards: null` строк нет → раунд 1 и legacy байт-равны SWR-008
   (`describe-cards.test.ts`, R6). Секция обрезается `clip(…, SECTION_MAX=600)`; тест на максимальной руке (25+ систем,
   `(+N more)`, ≤ 600 / ≤ 4000, ASCII). Инвариантность ситуации Повстанцев к руке Империи (`swapHand`) и обеих сторон к
   порядку колоды (`permuteDeck`) — тестами. `decisionPoint` строится из `toSideView(state, aiSide)`, где `table: null`.
   Кандидаты не содержат `REGISTER_CARD`/`CONFIRM_TABLE_TASK` (`automation-cards.test.ts`).
2. **Нет платных вызовов при задачах.** `pendingAiSide` возвращает `null` при `tableBlocks(state)` до проверки стороны →
   `pendingActor = null`, `decisionPoint` бросает, `applyCandidate` → 422 `notYourTurn`. API: `physical-sync.int.test.ts`
   — раннер 0 шагов / 0 вызовов commander при очереди; AI продолжает в ответе на последний `CONFIRM`;
   `cards-hidden-info.int.test.ts` — в физической партии за людей-Повстанцев 0 запросов к fake OpenAI до регистрации.
3. **Матрица утечек §10.1 (каналы W5).** `cards-hidden-info.int.test.ts` сканирует целыми токенами (`probe-x`/`probe-x#1`)
   ответы create/command/run, GET, `GET /api/sessions`, 409/422, тела запросов commander, `AiUsage`, dev-диагностику и
   логи; есть позитивные контроли (свои карты находятся там, где законны). Перенос базы в тестах теперь двигает карту
   Location (`swapLocationCard`; отказ, если карта цели не в колоде — такие цели законно различимы); в
   `benchmark/scenarios.test.ts` остаётся гард `relocations ≥ 3` на сценарий, поэтому покрытие не схлопывается молча.
4. **KB (AQ-2).** Тексты `rebellion:impl.engine-scope` и `rebellion:impl.refresh-partial` — собственные формулировки,
   без цитат правил; явно условные («Where a game tracks cards…»), т.е. корректны и для legacy-партий; источники/
   `discrepancyIds` не тронуты. Байты rules-on промптов меняются (новый `rulesVersion`) — одобрено Analyst (§16), отражено
   в логе W5; rules-off golden не регенерировался.
5. **Golden-изменения обоснованы.** `determinism.test.ts`: новый хэш `c0dcc415` + проверка, что та же партия без `cards` и
   `CARDS_DRAWN` (с перенумерацией `seq`) даёт прежний `2669f596` — поведение бота доказуемо не изменилось.
   `scenarios.json` — только добавленные `state.cards`/`CARDS_DRAWN` (проверено скриптом выше), `expected`/rubric те же.
   `core-ai-autopass`/`core-hotseat` — ожидаемый список событий Refresh дополнен `CARDS_DRAWN system`.
6. **Legacy-строки не переписываются.** `legacy-core-cards.int.test.ts`: GET не меняет снимок строки (state, version,
   status, timestamps, события), `cards`/`table` в view = `null`; команды/раскрытие/Refresh на legacy-строке пишут state
   без `cards`/`table` и без `CARDS_DRAWN`.

### Findings (round 2)

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 6 | minor | `apps/api/test/cards-hidden-info.int.test.ts:192-233`; `packages/games/rebellion/test/server/automation-cards.test.ts:134-160` | Для S5 в **физическом** режиме (зарегистрированная человеком-Повстанцем база → AI-Империя) нет закоммиченного метаморфического теста всего вида / decision point: API-тест ищет только id карт (`probe-<x>`), а не имя системы базы; правила проверяют инвариантность только журнала (`cards-events-redaction.test.ts`, «metamorphic (S5)»). Сценарий регресса: будущая правка переноса юнитов при регистрации (например, юниты не попадают в скрытую зону) раскрыла бы систему базы AI-Империи через `units`, и ни один тест этого не поймал бы. Сейчас свойство выполняется (ad-hoc проба reviewer: 9 регистраций → 1 вид Империи). | Добавить тест в `automation-cards.test.ts` (или `table-register-pipeline.test.ts`): все допустимые регистрации → байт-равные `toSideView(…,'empire')` и, при ходе Империи, `decisionPoint` (до первого Refresh). |
| 7 | minor | `packages/games/rebellion/knowledge/entries/discrepancies.json` (DISC-003 `engineBehaviour`) | После AQ-2 DISC-003 всё ещё утверждает, что зондов в движке нет, а `impl.refresh-partial` теперь говорит обратное — KB внутренне противоречива (W5 сам отметил; в промпт текст DISC не попадает, валидатор не ругается). | Analyst/лид: частично закрыть/переформулировать DISC-003 отдельной правкой KB (follow-up в delivery-report, если не в этой задаче). |
| 8 | nit | `packages/games/rebellion/knowledge/entries/implementation-notes.json:9` | «…the Empire gets 2 probe cards from the deck in each Refresh and nothing else of probe droids exists» — неуклюжая фраза; про исчерпание колоды сказано только в `impl.refresh-partial`. | По желанию: «…draws 2 probe cards per Refresh while the deck lasts; no other probe-droid rules exist». |

Блокирующих и major замечаний по W5 нет.

## Round 3 — FIX-QA1 + e2e (delta review)

Объём: FIX-QA1 — `apps/web/src/games/rebellion/core-v1/cards/{model/cardUsage.ts (+test), CardItem.tsx, CardDetail.tsx,
CardHandPanel.tsx (+tests)}`, тесты `core-v1/table/**`, `locales/ru/table.json`, `locales/{ru,en}/cards.json`; e2e —
`e2e/support/{board,seed,setup,testids,api,cards}.ts`, `e2e/{card-hand,card-detail,cards-legacy,cards-hidden,physical-execution,swr010-screenshots,game-setup,visual-a11y,ai-commander}.spec.ts`.
Входы: записи FIX-QA1 в `implementation-plan.md`, `acceptance.md` (D-1, O-1), `artifacts/logs/e2e.log`. Отдельной записи
«E2E» в `implementation-plan.md` нет — e2e-код ревьюился по самим файлам и логу.

### Проверки, запущенные reviewer (Node 22.23.5)

| Команда | Результат |
|---|---|
| `pnpm --filter @bga/web test` | 113 файлов, 1052 passed |
| `pnpm lint` (eslint `--max-warnings=0` + prettier, весь репозиторий, вкл. `e2e/**`) | exit 0, «All matched files use Prettier code style!» |
| `pnpm exec tsc -p e2e/tsconfig.json --noEmit` | exit 0 |
| Скрипт сравнения ключей RU/EN `table`, `cards` (без плюральных суффиксов) | расхождений нет |
| `ls -l` SWR-006 PNG vs `artifacts/logs/e2e.log` | PNG SWR-006 датированы 2026-11-21 02:06, e2e-лог — 2026-11-23 03:43: полный прогон SWR-010 их не перезаписал |
| `artifacts/logs/e2e.log` (прочитан, не перезапускался) | `183 passed (8.8m)` — прогон QA/E2E-воркера, не reviewer |

E2E reviewer не запускал (по брифу) — `not_run`.

### Что проверено

1. **D-1 исправлен корректно.** `usageForZone(def, zoneKind)` — чистая функция публичного каталога и `kind` зоны:
   `probe` в `hand` → `probe-refresh-draw`, в `special`/`revealed` → `probe-base-location`, в `deck`/`removed`/без зоны —
   `current: null` (в `CardItem` тогда показывается описание типа); типы без ролей — первая usage, как раньше.
   Классификация по `kind`, а не по id зоны — в духе `handModel`. `CardDetail` упорядочивает usage (текущая первой) и
   помечает её бейджем «Сейчас»/«Now» только при выборе (>1 usage); цвета — `terminalTokens` (`C.paper`/`C.muted`),
   хардкода нет. Скрытой информации здесь нет (только каталог + зона, которую зритель и так видит). e2e
   `card-hand.spec.ts:74-76` проверяет и наличие строки Location, и отсутствие строки добора — регресс D-1 будет пойман.
2. **O-1.** RU `placeLeader` («Поставьте лидера: {{leader}} → {{system}}.»), «База Повстанцев» в шагах и `px.baseSpace` —
   согласовано с терминами доски; e2e берёт `px.baseSpace` из локали.
3. **SWR-006 скриншоты.** `CURRENT_SCREENSHOT_TASK = 'SWR-010'`; `ai-commander.spec.ts` передаёт `'SWR-006'` явно → по
   правилу маршрутизации (`screenshotPath`) при обычном прогоне они уходят в `test-results/screenshots/SWR-006/`, в
   `docs/tasks/SWR-006/**` — только при `SCREENSHOT_TASK=SWR-006`. Подтверждено датами файлов (см. таблицу). Изменённые
   PNG SWR-006 в рабочем дереве — артефакт более раннего прогона (2026-11-21, вне SWR-010); их не следует коммитить
   (`git checkout -- docs/tasks/SWR-006/artifacts/screenshots`) — решение за лидом/человеком.
4. **Проверки утечек в e2e** (`cards-hidden.spec.ts`): каналы — все `/api/**` ответы страницы (`recordApi` + `settle()`
   на промисах тел, без таймаута), ответ команды, DOM целиком (`outerHTML`, вкл. порталы и раскрытую dev-AI панель),
   localStorage/sessionStorage, URL; секреты берутся из сохранённой строки БД (оракул), а не из ответа скрытой стороны;
   токены — целые id (`probe-x` не матчится внутри `probe-x-y`, но матчится в `probe-x#1`). Для Империи дополнительно
   `scanForBase` по телам API и поиск RU/EN-имён системы базы в Card Hand и Physical Execution (с вычищенными именами
   регионов). Есть и прямые проверки видимых счётчиков (`data-visible="false"`, `data-count`). Замечание о позитивных
   контролях — №9.
5. **Ожидания.** Синхронизация — через `expect(...).toHaveAttribute('data-version', …)`, `waitForResponse`, `settle()`.
   Фиксированные паузы (`waitForTimeout(800)`, `commandsDuring(…, 800)`, `delayNextCommand(1500)`) используются только для
   **отрицательных** проверок «второго запроса не было» (TC-PX-04/05) и задержки ответа — они не делают тест
   нестабильным (могут лишь пропустить очень поздний второй запрос) и подкреплены оракулом БД
   (`storedConfirmations`). Флейк-ожиданий для положительных условий не найдено.
6. Setup/a11y: `expectUnavailableOptions(page, opponentType)` — physical доступен против AI и `aria-disabled` с бейджем
   «только против AI» против человека; `visual-a11y` проверяет контраст обоих состояний.

### Findings (round 3)

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 9 | minor | `e2e/cards-hidden.spec.ts:63-83` (`expectNoSecrets`), `:85-139` (TC-LK-18) | Нет позитивного контроля сканера: тест не проверяет, что тот же `tokenRe`/`clientDump`/`recordApi` **находит** законный токен в тех же каналах (например, `probe-<своя база>` Повстанцев в DOM — он там есть как `data-testid="card-hand-item-probe-…"` — и в теле GET сессии; или 5 публичных карт `probe-box`). Сценарий ложного «зелёного»: тела ответов перестали парситься (`res.json()` → `null`), `outerHTML` снимается до рендера руки или поменялся формат id — проверка утечек проходит вакуумно. Есть только `api.calls.some(dev/ai)` (факт вызова, не содержимое). В API-тестах W5 позитивные контроли есть, здесь — нет. | В обоих тестах добавить: `expect(tokenRe(ownLocation).test(dump.dom)).toBe(true)` и тот же токен в хотя бы одном `GET /api/sessions/:id` теле (для Империи — свой зонд из `empire-probes` у `physical-empire-refresh-pending`/`digital-empire-after-refresh`, или карта `probe-box`). |
| 10 | nit | `e2e/support/setup.ts` (`AI_ONLY_BADGE = /только против AI|AI only/`) | Текст бейджа захардкожен регуляркой, тогда как остальные SWR-010 спеки берут строки из локалей (`msg(lang, 'setup', 'newGame.aiOnly')`). При правке формулировки e2e упадёт не по делу. | Брать из `locale('ru'|'en','setup')`. |
| 11 | nit | `docs/tasks/SWR-010/implementation-plan.md` | Нет записи «E2E» (файлы, команды, результат 183 passed, решения о скриншотах); результат известен только из `artifacts/logs/e2e.log`. | Добавить запись в Implementation log (лид/E2E-воркер). |

Блокирующих и major замечаний в раунде 3 нет.

**Re-check №1–2 и №6–8 (раунд 3).** В `implementation-plan.md` появились записи «FIX-R1» и «W5 follow-up»; содержимое
совпадает с тем, что reviewer видел в дереве. Проверено:
- №1–2 — см. раунд 1; запись FIX-R1 подтверждает правки (+5 тестов в `cards-state.test.ts`).
- №6 — `test/server/automation-cards.test.ts:160-190`: все 9 допустимых регистраций → пас Повстанцев → `pendingActor` =
  Империя, байт-равные `toSideView(…,'empire')` и `decisionPoint` (по 1 уникальному JSON), токен `probe-<base>`
  отсутствует. Это ровно предложенный тест — **исправлено**.
- №7 — `knowledge/discrepancies.json:53` DISC-003 `engineBehaviour` теперь описывает добор зондов в партиях с картами —
  **исправлено**.
- №8 — `impl.engine-scope`: «…draws 2 probe cards in each Refresh while the deck lasts; no other rules for probe droids
  exist.» — **исправлено** (rules-on байты снова изменились, rules-off golden — нет, по логу W5 follow-up).
- Прогон reviewer: `pnpm exec vitest run test/server/automation-cards.test.ts test/knowledge test/schema` (в
  `packages/games/rebellion`) — 20 файлов, 354 passed.

## Итог по раундам

| Раунд | Объём | Blocking | Major | Minor | Nit |
|---|---|---|---|---|---|
| 1 | W1–W4, FE-A, FE-B, FE-C | 0 | 0 | 2 (№1–2, исправлены FIX-R1) | 3 (№3–5) |
| 2 | W5 | 0 | 0 | 2 (№6–7, исправлены — W5 follow-up) | 1 (№8, исправлен) |
| 3 | FIX-QA1 + e2e | 0 | 0 | 1 (№9, открыт) | 2 (№10–11) |

## Verdict
approved

Финальный вердикт CODE_REVIEW по SWR-010 (раунды 1–3): блокирующих и major замечаний нет; minor №1–2 и №6–7 и nit №8
исправлены и перепроверены reviewer. Открыты: minor №9 (позитивные контроли сканера в `e2e/cards-hidden.spec.ts`) —
закрыть до FINAL_ACCEPTANCE или явно перенести в follow-up `delivery-report.md`; nit №3–5, №10–11 — на усмотрение лида.
Не коммитить изменённые PNG `docs/tasks/SWR-006/**` (артефакт прогона 2026-11-21, вне SWR-010).
