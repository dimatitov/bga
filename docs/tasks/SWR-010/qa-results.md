# QA results — SWR-010 Card Foundation & Physical Table Sync v0

QA Lead, QA_EXECUTION, 2026-11-23. QA не писал продуктовый код и тесты SWR-010 и в этом проходе ничего, кроме
`qa-results.md` и `artifacts/logs/**`, не менял.

Дерево: ветка `swr-009-vector-terminal`, HEAD `f3619a1` + незакоммиченные изменения SWR-010 (рабочее дерево на момент
запуска). Node 22.23.5, pnpm через corepack. e2e — штатный стек Playwright (собственный API/БД `apps/api/.tmp/e2e.db`,
бот вместо OpenAI); `dev.db` и `.env` не читались; реальных вызовов OpenAI не было (сетевой guard в наборах `apps/api`).

## Как выполнено

| Код | Команда (выполнена QA) | Результат | Лог |
|---|---|---|---|
| V | `pnpm verify` (lint → typecheck → test → build → check:bundle → e2e) | exit 0 (2026-11-23 00:50–01:01 UTC); все 6 шагов пройдены | `artifacts/logs/final-verify.log` |
| V2 | `pnpm verify` повторно после FIX-QA2 (новые `apps/api/test/table-confirm-race.int.test.ts`, `apps/api/test/table-restart.int.test.ts`, позитивные контроли `e2e/cards-hidden.spec.ts`) | **exit 0** (01:08–01:19 UTC); scripts 454, platform 472, forbidden-stars 5, rebellion 1056, web 1052, api 86 файлов + 1 skipped / 877 + 2 skipped, check:bundle OK (16 правил, 0 card-engine модулей), e2e 183 passed, 0 failed, 0 flaky | `artifacts/logs/final-verify-2.log` |
| V-scripts | (в составе `pnpm test`) `node --test scripts/*.test.mjs` | 454 / 454 passed | `artifacts/logs/final-verify.log` |
| V-platform | (в составе) vitest `packages/platform` | 23 файла, 472 passed | `artifacts/logs/final-verify.log` |
| V-fs | (в составе) vitest `packages/games/forbidden-stars` | 2 файла, 5 passed | `artifacts/logs/final-verify.log` |
| V-rebellion | (в составе) vitest `packages/games/rebellion` | 88 файлов, 1056 passed | `artifacts/logs/final-verify.log` |
| V-web | (в составе) vitest `apps/web` | 113 файлов, 1052 passed | `artifacts/logs/final-verify.log` |
| V-api | (в составе) vitest `apps/api` | 84 файла passed + 1 skipped; 873 passed / 2 skipped | `artifacts/logs/final-verify.log` |
| V-bundle | (в составе) `pnpm build && pnpm check:bundle` | build OK; `OK check-web-bundle: 12 files, 16 rules`; modules: 911 sources, 0 dev modules, 0 platform card engine modules | `artifacts/logs/final-verify.log` |
| V-e2e | (в составе) `pnpm e2e` (Playwright, chromium) | 183 passed (8.8m), 0 failed, 0 flaky | `artifacts/logs/final-verify.log` |
| S | `node --test "scripts/*.test.mjs"` (отдельно) | 454 / 454 passed, exit 0 | `artifacts/logs/scripts-test.log` |
| N | vitest `--reporter=verbose` только по тест-файлам SWR-010 (имена тестов для привязки TC) | platform 6 файлов / 106; rebellion 21 / 235; web 20 / 226; api 8 / 52 — все passed, exit 0 | `artifacts/logs/qa-swr010-tests-verbose.log` |
| Q | статические проверки QA (KB-ссылки аудита, grep платформы/бандла/hex, diff AI-конфига, защищённые файлы) | см. лог | `artifacts/logs/qa-static.log` |
| C | `node scripts/check-task.mjs docs/tasks/SWR-010` | OK, exit 0 (запущен после заполнения документа) | `artifacts/logs/qa-check-task.log` |

Пропущенный файл `apps/api` (1 skipped / 2 tests) — opt-in `apps/api/test/dev-db-upgrade.int.test.ts`
(`describe.skipIf(!SWR005_DEV_DB)`, по дизайну не входит в verify); так же было в baseline SWR-009.

**Регрессия относительно baseline.** Отдельного `baseline-verify.log` на `f3619a1` в задаче нет (TC-R-01 `not_run`).
Как прокси-baseline взят итоговый прогон SWR-009 на этом же коде — `docs/tasks/SWR-009/artifacts/logs/final-verify.log`:

| Набор | SWR-009 final (baseline-прокси) | SWR-010 final | Δ |
|---|---|---|---|
| scripts | 449 | 454 | +5 |
| platform | 17 файлов / 366 | 23 / 472 | +6 / +106 |
| forbidden-stars | 2 / 5 | 2 / 5 | 0 |
| rebellion | 71 / 875 | 88 / 1056 | +17 / +181 |
| web | 101 / 923 | 113 / 1052 | +12 / +129 |
| api | 81 + 1 skipped / 863 + 2 skipped | 84 + 1 skipped / 873 + 2 skipped | +3 / +10 |
| e2e | 148 | 183 | +35 |

Ни один набор не потерял тестов по числу. Во втором прогоне V2 api: 84 → 86 файлов, 873 → 877 тестов (+4: TC-CF-07 ×2, TC-CF-08, TC-RST-03); остальные наборы — те же числа. Изменённые существующие тесты перечислены в журнале
`implementation-plan.md` (W2: фикстуры views → `cards: null, table: null`; W5: `determinism.test.ts` хэш
`2669f596 → c0dcc415` + проверка, что legacy-партия по-прежнему даёт `2669f596`; `benchmark/scenarios.json`
перегенерирован, diff только `state.cards`/`CARDS_DRAWN`; `core-ai-autopass`/`core-hotseat` += `CARDS_DRAWN`;
`rebellion-contract` 422-кейс режима → hot-seat). Покейсовая таблица «старый → новый» не составлялась (TC-R-02 —
частично).

## Executed

Статус — по состоянию на итоговый прогон V. `passed (partial)` — проверено то, что указано в Evidence; непокрытая часть
ожидания TC названа явно. Пути тестов — относительно корня репозитория.

| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-AUD-01 | passed (partial) | Q, ревью | `rules-audit.md` §3.1–3.7 — у каждой строки аспектов есть статус (verified / needs-review / unverified / deferred) и источник; §4.1–4.5 (стартовые, идентичности, различия колод, многоэффектные, исключения), §6 матрица покрытия. Аспекты названы по-разному у разных типов; у §3.7 Location нет отдельных строк «формирование / время розыгрыша» (их покрывает §3.6 «Выбор базы»); строка «Отложено» §3.5/3.6 без ссылки в колонке «Источник» (DISC-010 — в тексте). Наблюдение O-1, не дефект |
| TC-AUD-02 | passed | Q | `artifacts/logs/qa-static.log`: 184 ссылки `KB:` (70 уникальных), точных висячих id 0; 3 шаблона `KB:setup.*`/`missions.*`/`recruit.*` раскрываются в 15/11/4 записей |
| TC-AUD-03 | passed | Q, ревью | `artifacts/logs/qa-static.log`: цитат ≥ 25 слов — 0; названия карт §4.2 (Research and Development, Rapid Mobilization и т.д.) все со ссылками на записи KB; каталог их не использует |
| TC-AUD-04 | passed | ревью | `rules-audit.md` §8: F-VERIFY-BOX…F-STD-SETUP, у каждой строка критерия; отложенные типы = `deferred` в каталоге (TC-REG-07) |
| TC-REG-01 | passed | V-platform, N | `packages/platform/test/cards/schema.test.ts` «TC-REG-01: valid card contracts parse» |
| TC-REG-02 | passed | V-platform, N | `packages/platform/test/cards/schema.test.ts` «TC-REG-02: broken inputs are rejected» (поля, статусы, strict, дубли id) |
| TC-REG-03 | passed | V-platform, Q, V (lint) | `packages/platform/test/cards/boundaries.test.ts`; `artifacts/logs/qa-static.log` (grep 0 совпадений, импортов `packages/games` 0) |
| TC-REG-04 | passed | V-rebellion, N | `packages/games/rebellion/test/schema/card-catalog.test.ts` «TC-REG-04» |
| TC-REG-05 | passed | V-rebellion, N | там же «TC-REG-05: id snapshot» |
| TC-REG-06 | passed | V-rebellion, N | там же «TC-REG-06: exactly 31 … verified, no-play» |
| TC-REG-07 | passed | V-rebellion, N | там же «TC-REG-07: … deferred types without cards» |
| TC-REG-08 | passed | V-rebellion, N | там же «TC-REG-08: no Coruscant card …» + «platform catalog validator rejects …» |
| TC-REG-09 | passed (partial) | V-web, N | `apps/web/src/games/rebellion/core-v1/cards/model/catalog.test.ts` «every catalog / zone i18n key has a non-empty ru and en text»; `apps/web/src/games/rebellion/locales.i18n.test.ts` (паритет RU/EN, ns `rebellion.cards`). Ревью «собственные пересказы» — выборочно QA не делал |
| TC-REG-10 | passed | V-rebellion, ревью | `packages/games/rebellion/test/schema/card-catalog.test.ts` (эффект `no-play`), `packages/platform/test/cards/schema.test.ts` «effect: mechanicId iff implemented»; исполняемой логики эффектов нет |
| TC-INIT-01 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-init.test.ts` «TC-INIT-01 %s: box 5, Location = base card, deck 25, Empire hand 0» (digital ×2, hot-seat, physical Empire) |
| TC-INIT-02 | passed | V-rebellion, N | там же «TC-INIT-02 … 20 fixed ids» |
| TC-INIT-03 | passed | V-rebellion, N | там же «TC-INIT-03: same input → byte-identical state» |
| TC-INIT-04 | passed | V-rebellion, N | там же «TC-INIT-04: no global RNG / clock is used» |
| TC-INIT-05 | passed | V-rebellion, N | там же «TC-INIT-05 … 50 ids → ≥ 45 orders» |
| TC-INIT-06 | passed | V-rebellion, N | там же «TC-INIT-06 …»; `packages/games/rebellion/test/schema/legacy-core.test.ts` «mock-v1 states reject the card fields»; RotE → 422 (`packages/games/rebellion/test/schema/setup.test.ts`) |
| TC-INIT-07 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-init.test.ts` «TC-INIT-07: physical_companion + human Rebels → Location empty …, deck 26». Оценено по C-2: до регистрации `rebelBase.systemId` хранит предварительную систему (по дизайну, секрет самого человека), зона Location пуста, колода 26, ожидается регистрация — тест это и утверждает; подтверждено и после рестарта (`apps/api/test/table-restart.int.test.ts`) |
| TC-INIT-08 | passed (partial) | V-api, N | `apps/api/test/physical-sync.int.test.ts`, `apps/api/test/cards-hidden-info.int.test.ts` (ответ создания просканирован на карты колоды/руки). Инварианты 5/1/25 на сохранённой строке проверены только на уровне правил (TC-INIT-01), не по `ROW(id)` |
| TC-INIT-09 | passed | V-api, N | `apps/api/test/physical-sync.int.test.ts` «the same session id and the same commands on two DBs give byte-equal stored states» (включает создание) |
| TC-DECK-01 | passed | V-platform, N | `packages/platform/test/cards/ops.test.ts` «TC-DECK-01» |
| TC-DECK-02 | passed | V-platform, N | там же «TC-DECK-02» (move/play/reveal/return/register) |
| TC-DECK-03 | passed | V-platform, N | там же «TC-DECK-03: drawing from a short or empty deck» |
| TC-DECK-04 | passed | V-platform, N | там же «TC-DECK-04 / 05 / 06: illegal single-card transitions» |
| TC-DECK-05 | passed (partial) | V-platform, V-rebellion | там же; ограничение «только владелец Y» платформа не знает (W1, журнал) — проверяется правилами (`notYourSide`, `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts` TC-PH-07) |
| TC-DECK-06 | passed (partial) | V-platform | там же; «play карты без розыгрыша» на уровне платформы не моделируется (W1); в v0 нет команды розыгрыша — кандидатов нет (TC-AI-03) |
| TC-DECK-07 | passed | V-platform, N | там же «TC-DECK-07: createPile rejects broken setups» |
| TC-DECK-08 | passed | V-platform, N | там же «TC-DECK-08: invariants detect each hand-made corruption separately» |
| TC-DECK-09 | passed | V-platform, N | `packages/platform/test/cards/property.test.ts` «TC-DECK-09 … sequences × operations» (1000 × 20) |
| TC-DECK-10 | passed | V-platform, N | `packages/platform/test/cards/shuffle.test.ts` «TC-DECK-10: seededShuffle» |
| TC-DECK-11 | passed | V-platform, N | `packages/platform/test/cards/ops.test.ts` «TC-DECK-11: transition table» |
| TC-DECK-12 | passed | V-platform, N | `packages/platform/test/cards/visibility.test.ts` «TC-DECK-12: projectZones matrix» |
| TC-DECK-13 | passed | V-platform, N | `packages/platform/test/cards/ops.test.ts` «TC-DECK-13 (AC-17): restore from JSON and continue» |
| TC-RF-01 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-refresh.test.ts` «TC-RF-01» |
| TC-RF-02 | passed | V-rebellion, N | там же «TC-RF-02» |
| TC-RF-03 | passed | V-rebellion, N | там же «TC-RF-03 (A-8): 1 card left → draws 1; empty deck → draws 0» |
| TC-RF-04 | passed | V-rebellion, V-api, N | там же «TC-RF-04 / R2»; `apps/api/test/legacy-core-cards.int.test.ts` (no `CARDS_DRAWN`) |
| TC-RF-05 | passed | V-rebellion, N | там же «TC-RF-05» |
| TC-RF-06 | passed | V-api, N | `apps/api/test/cards-hidden-info.int.test.ts` (digital Rebels, 3 раунда: у клиента только счётчик, в state рука Империи ≥ 4); `apps/api/test/core-ai-autopass.int.test.ts`, `apps/api/test/core-hotseat.int.test.ts` (событие `CARDS_DRAWN` в Refresh) |
| TC-VIS-01 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-visibility.test.ts` «TC-VIS-01» |
| TC-VIS-02 | passed | V-rebellion, N | там же «TC-VIS-02» |
| TC-VIS-03 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-events-redaction.test.ts` «after the reveal / the end of the game the Empire sees the registered card»; `packages/games/rebellion/test/rules/core/cards-reveal.test.ts` |
| TC-VIS-04 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-visibility.test.ts` «TC-VIS-04 (AC-8): 10 deck permutations» |
| TC-VIS-05 | passed | V-rebellion, N | там же «TC-VIS-05 (AC-9)» |
| TC-VIS-06 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-events-redaction.test.ts` (2 метаморфных теста журнала), `packages/games/rebellion/test/rules/core/table-tasks.test.ts` «TC-TT-09» |
| TC-VIS-07 | passed | ревью | `packages/games/rebellion/src/rules/core/redact.ts` (`coreSideView`, `coreCardsView`, `corePublicCardsView`, `corePlayerEvents`), `packages/games/rebellion/src/rules/core/table.ts` (`tableViewFor(state, viewer)`; задачи — из `corePlayerEvents`); `review.md`. Замечание: `corePublicCardsView` в wire не используется — сводка списка сессий карт не несёт вовсе |
| TC-VIS-08 | not_run | — | Нет теста hot-seat с картами на уровне API/handoff (в `apps/api/test/core-hotseat.int.test.ts` — только список событий Refresh); hot-seat покрыт лишь созданием (TC-INIT-01) и общей проекцией |
| TC-VIS-09 | passed (partial) | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-visibility.test.ts` «TC-VIS-09 (rules level): over whole games …» — уровень правил, не 30 партий раннера |
| TC-LK-01..21 | см. матрицу | | раздел «Leak matrix» ниже |
| TC-PH-01 | passed | V-api, V-rebellion, N | `apps/api/test/physical-sync.int.test.ts` «REGISTER_CARD over HTTP …» (база = выбор, `registration: null`); `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts` «TC-PH-01»; `packages/games/rebellion/test/rules/core/cards-register.test.ts` (карта → Location, колода без неё) |
| TC-PH-02 | passed (partial) | V-api, V-rebellion, N | HTTP: `unknownCard` (`probe-nowhere`), `cardNotEligible`; правила: «TC-PH-02» ×2, «wrong zone». Неравенство «`ROW` байт-идентичен» после ошибок регистрации по HTTP не проверяется (только `state unchanged` в правилах); пустая строка/число/лишнее поле — только схемой команды |
| TC-PH-03 | passed | V-api, V-rebellion, N | `apps/api/test/physical-sync.int.test.ts` (повтор → 409 / 422 `registrationUnavailable`); «TC-PH-03: a second registration» |
| TC-PH-04 | passed | V-api, V-rebellion, N | `apps/api/test/cards-hidden-info.int.test.ts` (digital → 422 `registrationUnavailable`); `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts` «TC-PH-04» ×2 (digital обе стороны; человек-Империя — одинаковый ответ для любой базы AI); mock-v1 → `commandUnavailable` (`packages/games/rebellion/test/schema/cards-state.test.ts` «R5») |
| TC-PH-05 | passed | V-api, V-rebellion, N | HTTP: `PASS` → 422 `tableSyncPending`; `cards-hidden-info` physical: 0 вызовов AI до регистрации; «TC-PH-05» |
| TC-PH-06 | passed | V-rebellion, V-api, N | `packages/games/rebellion/test/rules/core/table-blocking.test.ts` «TC-PH-06/C-3»; HTTP-регистрация при голове `initialSetup` |
| TC-PH-07 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts` «TC-PH-07: the AI side or the auto origin → notYourSide» (уровень правил) |
| TC-PH-08 | passed | V-rebellion, V-api, N | `packages/games/rebellion/test/server/automation-cards.test.ts` «S5 … every eligible registration gives a byte-identical Empire view and decision point»; `apps/api/test/cards-hidden-info.int.test.ts` (physical: S5 не в каналах AI) |
| TC-PH-09 | passed | V-rebellion, V-web, N | «every eligible system can be registered (TC-PH-09)», `packages/games/rebellion/test/rules/core/table-init.test.ts` «… (TC-PH-09)»; `apps/web/src/games/rebellion/core-v1/table/LocationRegisterForm.test.tsx` |
| TC-TT-01 | passed | V-rebellion, V-api, V-e2e | `packages/games/rebellion/test/rules/core/table-init.test.ts`; `apps/api/test/physical-sync.int.test.ts` (Империя: `['initialSetup']`; Повстанцы: `['initialSetup','registerBase']`); `e2e/physical-execution.spec.ts` TC-PX-01 |
| TC-TT-02 | passed | V-rebellion, V-api, N | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` «… AI activation and AI move create one task each (AQ-8)»; HTTP `aiActivation` после CONFIRM; шаги — ключи + параметры (`apps/web/src/games/rebellion/core-v1/table/model/tableModel.test.ts`) |
| TC-TT-03 | passed | V-rebellion, V-e2e, N | там же (Империя: активация/перемещение AI-Повстанцев, Refresh «takeProbeCards»); сиды `physical-empire-*` (`packages/games/rebellion/test/server/physical-seeds.test.ts`); `e2e/physical-execution.spec.ts` TC-PX-08 |
| TC-TT-04 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` «… FINISH/PASS none» (C-4) |
| TC-TT-05 | passed | V-rebellion, N | там же «own commands create no task», «events of the human side and pure markers create nothing» |
| TC-TT-06 | passed (partial) | V-rebellion, V-api | `packages/games/rebellion/test/rules/core/table-init.test.ts` «digital games have no table»; `packages/games/rebellion/test/rules/core/table-blocking.test.ts` «digital games are never blocked»; `apps/api/test/legacy-core-cards.int.test.ts` (`table: null`). Наблюдение очереди во всех ответах полной digital-партии — не делалось |
| TC-TT-07 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` «… none before (TC-TT-07)» |
| TC-TT-08 | passed | V-rebellion, N | там же (по задаче на команду AI; ids `t-<version>-<n>` в порядке событий) |
| TC-TT-09 | passed | V-rebellion, N | там же «TC-TT-09: two games that differ only in the base give byte-equal tasks» |
| TC-TT-10 | passed | V-web, N | `apps/web/src/games/rebellion/core-v1/table/model/tableModel.test.ts` «the sample covers every TABLE_STEP_KEYS entry» (RU и EN); `apps/web/src/games/rebellion/locales.i18n.test.ts` (ns `rebellion.table`) |
| TC-CF-01 | passed | V-rebellion, V-api, N | `packages/games/rebellion/test/rules/core/table-confirm.test.ts` «TC-CF-01/12 … nothing else changes»; HTTP `TABLE_TASK_CONFIRMED`, непрерывные события |
| TC-CF-02 | passed | V-api, V-rebellion, N | `apps/api/test/physical-sync.int.test.ts` «CONFIRM repeat: stale expectedVersion → 409 …» (`dbSnapshot` не изменился); «TC-CF-02/C-6» |
| TC-CF-03 | passed | V-api, V-rebellion, N | там же (свежая версия → 422 `tableTaskNotFound`, `details` = только `taskId`) |
| TC-CF-04 | passed | V-api, V-rebellion, N | HTTP `t-1-2` → 422 `tableTaskNotHead`; «TC-CF-04» |
| TC-CF-05 | passed (partial) | V-rebellion | «TC-CF-05: unknown ids → tableTaskNotFound»; пустой id / лишние поля — только схемой команды (`packages/games/rebellion/test/schema/cards-state.test.ts`), по HTTP не проверялось |
| TC-CF-06 | passed | V-rebellion, N | «TC-CF-06: an older version → 409» |
| TC-CF-07 | passed | V2, V-api | `apps/api/test/table-confirm-race.int.test.ts` «TC-CF-07 … ×20: one 200, the other 409/422; one TABLE_TASK_CONFIRMED; version +1; no AI call; = sequential run» и «×20 head + next task in parallel …: CONFIRM(T1) ‖ CONFIRM(T2) and CONFIRM(T1) ‖ REGISTER_CARD → exactly one applied» (FIX-QA2-backend); `artifacts/logs/final-verify-2.log` |
| TC-CF-08 | passed | V2, V-api | `apps/api/test/table-confirm-race.int.test.ts` «TC-CF-08 … ×20: the AI turn after the confirmation runs exactly once (no duplicate AI moves / paid calls); = sequential run»; `artifacts/logs/final-verify-2.log` |
| TC-CF-09 | not_applicable | — | Idempotency-ключ есть только у `POST /api/sessions` (`apps/api/src/sessions/idempotency.ts`; C-7) |
| TC-CF-10 | passed | V-rebellion, V-api, N | «TC-CF-10: digital games (no table) → commandUnavailable, both sides»; HTTP в `cards-hidden-info` (digital); mock-v1 «R5» |
| TC-CF-11 | passed | V-rebellion, N | «TC-CF-11: the AI side or the server's auto origin → notYourSide» (правила) |
| TC-CF-12 | passed | V-rebellion, N | «TC-CF-01/12», «applyConfirmTask is pure (deep-frozen input)» |
| TC-BL-01 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/table-blocking.test.ts` «TC-BL-01 (rules part)»; `packages/games/rebellion/test/server/automation-cards.test.ts` «a pending table task blocks the AI» |
| TC-BL-02 | passed | V-api, N | `apps/api/test/physical-sync.int.test.ts`: `automation/run` при блокировке — 0 шагов, 0 запросов fake-commander, `dbSnapshot` (версия, строка) неизменен; `cards-hidden-info` physical — 0 вызовов до регистрации. Строки `AiUsage`/бюджет отдельно не утверждаются (0 запросов ⇒ 0 оплаченных) |
| TC-BL-03 | passed | V-api, N | там же `summary: {steps: 0, pending: false, stopReason: 'none'}`; признак ожидания — `view.table.aiWaiting = true` |
| TC-BL-04 | passed (partial) | V-api, V-rebellion, N | HTTP: `PASS` → 422 `tableSyncPending` (обе стороны); все 4 команды — на уровне правил «TC-BL-04» |
| TC-BL-05 | passed | V-api, V-rebellion, N | «initial setup blocks the runner; CONFIRM lets the AI act in the same response; its task blocks again» (1 шаг, `humanTurn`); «a drain stops after the AI step that created a task» |
| TC-BL-06 | passed | V-api, N | там же: `fake.responses = 1 + resumed.summary.steps` |
| TC-BL-07 | passed | V-api | существующие `apps/api/test/automation-runner.int.test.ts`, `apps/api/test/automation-full-game.int.test.ts` зелёные в V |
| TC-BL-08 | passed (partial) | V-rebellion, V-web | «after the end of the game … the remaining tasks stay confirmable» (правила); `tableModel.test.ts` «stays physical after the game is over (C-5)». Интеграционно не проверялось |
| TC-BL-09 | not_run | — | Property-прогона 5 физических партий до конца нет |
| TC-RST-01 | passed | V-api, N | `apps/api/test/physical-sync.int.test.ts` «restart: a new app instance on the same DB restores the table; the AI still waits» (view равен, строка не переписана, `run` 0 шагов, 0 вызовов) |
| TC-RST-02 | passed (partial) | V-api | там же: после рестарта CONFIRM → AI продолжает. Байт-сравнение с прогоном без рестарта не делалось |
| TC-RST-03 | passed | V2, V-api | `apps/api/test/table-restart.int.test.ts` «TC-RST-03 … same view/table after restart; registration still pending, AI blocked; registration then works; AI resumes» (FIX-QA2-backend); `artifacts/logs/final-verify-2.log` |
| TC-RST-04 | passed | V-e2e, V-web | `e2e/physical-execution.spec.ts` «TC-PX-06 / TC-RST-04 (seed): reload and a new browser context …» и сквозной тест TC-PX-01…TC-RST-04; `apps/web/src/games/rebellion/core-v1/CoreTable.test.tsx` «TC-RST-04 / TC-PX-06» |
| TC-OLD-01 | passed | V-e2e, V-api, V-rebellion | `e2e/cards-legacy.spec.ts` «TC-OLD-06: a mock-v1 row … opens»; существующие наборы mock-v1/v1/v2 в V; `packages/games/rebellion/test/schema/legacy-core.test.ts` «R5: mock-v1 and v1/v2 upcasts unchanged» |
| TC-OLD-02 | passed | V-api, N | `apps/api/test/legacy-core-cards.int.test.ts` «commands (reveal, Refresh) work as before; … no CARDS_DRAWN» |
| TC-OLD-03 | passed (partial) | V-api, V-e2e, N | там же «GET answers cards / table null and does not rewrite the row»; `e2e/cards-legacy.spec.ts` «row not rewritten». Для mock-v1, `GET /api/sessions` и `RUN` — не проверялось этим кейсом |
| TC-OLD-04 | passed | V-api | `apps/api/test/legacy-core-cards.int.test.ts` (после команд строка без `cards`) |
| TC-OLD-05 | passed | V-rebellion | `packages/games/rebellion/test/server/golden.test.ts`, фикстуры `views/*` (diff только `cards: null, table: null`, W2), `packages/games/rebellion/test/ai/sim/determinism.test.ts` (legacy-хэш `2669f596` сохранён) |
| TC-OLD-06 | passed | V-e2e | `e2e/cards-legacy.spec.ts` (core-v1 RU/EN + mock-v1) |
| TC-OLD-07 | not_run | — | `apps/api/test/dev-db-upgrade.int.test.ts` — opt-in (skipped в V); QA его не запускал (тест SWR-005 ждёт только mock-v1-строк) |
| TC-RP-01 | passed (partial) | V-api | рестарт-тест: строка → новый app → `view` равен, строка не переписана; повторное сохранение с байт-сравнением строки не делалось |
| TC-RP-02 | passed | V-rebellion, N | `packages/games/rebellion/test/rules/core/cards-refresh.test.ts` «determinism (AC-17): the same 13 rounds twice → byte-identical states and logs»; «deterministic: same state + command» (регистрация) |
| TC-RP-03 | passed | V-api, N | `apps/api/test/physical-sync.int.test.ts` «replay determinism over HTTP (AC-17)» (physical, две БД, байт-равные `state`, `version`) |
| TC-RP-04 | not_run | — | GET строки с испорченной карточной частью не тестировался (отклонение схемой — только unit: `packages/games/rebellion/test/schema/cards-state.test.ts`) |
| TC-RP-05 | not_run | — | Продолжение до конца после рестарта не тестировалось |
| TC-AI-01 | passed | V-rebellion, V-api, N | `packages/games/rebellion/test/ai/describe-cards.test.ts` «the Empire sees its own probe systems and the deck count»; промпт содержит «Your probe cards …» (`cards-hidden-info`) |
| TC-AI-02 | passed | V-rebellion, V-api, N | там же «the Rebels see only the public counts»; `cards-hidden-info` «The Empire holds» |
| TC-AI-03 | passed | V-rebellion, N | `packages/games/rebellion/test/server/automation-cards.test.ts` «decision points never carry card / table commands»; `packages/games/rebellion/test/knowledge/rules-provider.test.ts` |
| TC-AI-04 | not_run | — | Ответ модели с «карточным» действием (`PLAY_CARD`) не тестировался (в тестах нет `PLAY_CARD`); общий fallback на невалидное решение — существующие наборы SWR-008 |
| TC-AI-05 | passed | V-rebellion, N | `packages/games/rebellion/test/ai/describe-cards.test.ts` «every text stays ASCII and within the section / total limits on the largest hand» |
| TC-AI-06 | passed | Q, V | `artifacts/logs/qa-static.log`: `apps/api/src` без изменений от `f3619a1`; в `packages/games/rebellion/src/ai` изменён только `describe.ts`, строк budget/fallback/limit нет; AI-наборы зелёные в V |
| TC-AI-07 | passed | Q, V-api | `apps/api/test/no-network.unit.test.ts` + `setupFiles` guard; новые openai-тесты SWR-010 используют fake fetch (`artifacts/logs/qa-static.log`) |
| TC-AI-08 | passed | V-api, V-rebellion | `apps/api/test/automation-full-game.int.test.ts` (бот, полная партия) + метаморфные TC-LK-04/06 |
| TC-HAND-01 | passed | V-e2e, V-web | `e2e/card-hand.spec.ts` «TC-HAND-01 (ru/en)»; `apps/web/src/games/rebellion/core-v1/cards/CardHandPanel.test.tsx`; скриншоты `artifacts/screenshots/swr010-hand-reb-ru-1440.png`, `artifacts/screenshots/swr010-hand-reb-en-1440.png` |
| TC-HAND-02 | passed | V-e2e | `e2e/card-hand.spec.ts` «TC-HAND-02»; `artifacts/screenshots/swr010-hand-emp-ru-1440.png` |
| TC-HAND-03 | passed | V-e2e | `e2e/card-hand.spec.ts` «TC-HAND-03 + TC-DET-03» |
| TC-HAND-04 | passed | V-e2e, V-web | `e2e/card-hand.spec.ts` «TC-HAND-04 (physical)»; digital — `CardHandPanel.test.tsx` «TC-HAND-04: digital — the only buttons are the cards themselves» |
| TC-HAND-05 | passed | V-e2e | `e2e/card-hand.spec.ts` «TC-HAND-05: 375×812 …»; `artifacts/screenshots/swr010-hand-reb-ru-375.png` |
| TC-HAND-06 | passed | V-web, Q | `apps/web/src/games/rebellion/core-v1/cards/cards.static.test.ts`; `artifacts/logs/qa-static.log` (hex 0, растров 0, UI Kit в 7 файлах) |
| TC-HAND-07 | passed | V-e2e | `e2e/cards-legacy.spec.ts` «TC-HAND-07 / TC-OLD-06 (ru/en)»; `artifacts/screenshots/swr010-hand-legacy-ru-1440.png` |
| TC-HAND-08 | passed | V-e2e | `e2e/card-hand.spec.ts` «TC-HAND-08 … +2 probes and the deck −2 without a reload» |
| TC-DET-01 | passed | V-e2e | `e2e/card-detail.spec.ts` «TC-DET-01 + TC-DET-02 (ru/en)», «TC-DET-01 (ru/en)», «TC-DET-01: a public first-game card»; `artifacts/screenshots/swr010-detail-ru-1440.png`, `artifacts/screenshots/swr010-detail-en-1440.png` |
| TC-DET-02 | passed | V-e2e | там же «no Play key; reading the detail sends no command» |
| TC-DET-03 | passed | V-e2e, V-web | `e2e/card-hand.spec.ts` «TC-HAND-03 + TC-DET-03»; `apps/web/src/games/rebellion/core-v1/cards/CardDetail.test.tsx` «TC-DET-03» |
| TC-DET-04 | passed | V-web | `CardDetail.test.tsx` «TC-DET-04 (FQ-5)» (бейдж `needs-review`; в каталоге v0 все `verified`) |
| TC-PX-01 | passed | V-e2e | `e2e/physical-execution.spec.ts` сквозной «TC-PX-01, TC-PX-07, TC-PX-04, TC-PX-02, TC-PX-03, TC-RST-04 …»; `artifacts/screenshots/swr010-px-setup-ru-1440.png`, `artifacts/screenshots/swr010-px-setup-en-375.png` |
| TC-PX-02 | passed | V-e2e, V-web | там же + «TC-PX-02 (seed): registration — options = eligible systems only …»; `artifacts/screenshots/swr010-px-register-ru-1440.png` |
| TC-PX-03 | passed | V-e2e | сквозной тест (ход человека → задача AI → подтверждение до возврата хода) |
| TC-PX-04 | passed | V-e2e, V-web | сквозной тест (двойной клик → один CONFIRM); `apps/web/src/games/rebellion/core-v1/table/useTableCommands.test.tsx` «TC-PX-04» |
| TC-PX-05 | passed | V-e2e, V-web | `e2e/physical-execution.spec.ts` «TC-PX-05: the confirm answer is delayed …»; `useTableCommands.test.tsx` «TC-PX-05» |
| TC-PX-06 | passed | V-e2e | «TC-PX-06 / TC-RST-04 (seed)» |
| TC-PX-07 | passed | V-e2e | сквозной тест (действия на карте недоступны при открытой задаче) |
| TC-PX-08 | passed | V-e2e, V-web | «TC-PX-08: Refresh task (seed) names exactly the 2 drawn probes …», «TC-PX-08 / TC-LK-13 (seed)»; `PhysicalExecutionPanel.test.tsx` «hidden information»; `artifacts/screenshots/swr010-px-ai-task-ru-1440.png`, `artifacts/screenshots/swr010-px-emp-refresh-ru-1440.png` |
| TC-PX-09 | passed | V-e2e | «TC-PX-09: a second tab confirmed first — the stale tab gets 409 …» |
| TC-PX-10 | passed | V-web | `apps/web/src/games/rebellion/core-v1/table/PhysicalExecutionPanel.test.tsx` «TC-PX-10» |
| TC-SET-01 | passed | V-e2e, V-web | `e2e/game-setup.spec.ts` «TC-SET-01: rebels/empire vs AI — physical_companion is available …»; `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`; `artifacts/screenshots/swr010-setup-physical-ru-1440.png` |
| TC-SET-02 | passed | V-e2e, V-web | `e2e/game-setup.spec.ts` «TC-SET-02 (ru/en) …»; `artifacts/screenshots/swr010-setup-physical-unavailable-ru-1440.png` |
| TC-SET-03 | passed (partial) | V-api, V-rebellion | `apps/api/test/rebellion-contract.int.test.ts` (hot-seat + physical, RotE + physical → 422); `packages/games/rebellion/test/schema/setup.test.ts`. Комбинация `mock-v1` + `physical_companion` отдельно не проверялась |
| TC-SET-04 | passed (partial) | V-api, V-rebellion | 201 для physical vs AI за обе стороны (`apps/api/test/support/physical-helpers.ts` в `physical-sync`/`cards-hidden-info`); `setup.test.ts` «physical_companion vs AI (%s) → supported». Идемпотентный повтор → 200 replay для physical не проверялся |
| TC-SET-05 | passed | V-e2e, V-web | существующие `e2e/game-setup.spec.ts`, `e2e/new-game.spec.ts`, `e2e/hot-seat.spec.ts` зелёные; `SetupScreen.test.tsx` (digital по умолчанию) |
| TC-BND-01 | passed | V-bundle | `artifacts/logs/final-verify.log`: `OK check-web-bundle: … 16 rules` (вкл. `card-deck-seed`, `rebellion-card-server-symbol`), `0 platform card engine modules` |
| TC-BND-02 | passed | Q, V (lint) | `artifacts/logs/qa-static.log` (0 импортов вне тестов); ESLint-правило `^@bga/platform/cards$` для web (FE-C), lint зелёный |
| TC-R-01 | not_run | — | Прогон baseline на `f3619a1` в рамках SWR-010 не делался; использован прокси `docs/tasks/SWR-009/artifacts/logs/final-verify.log` (см. «Регрессия») |
| TC-R-02 | passed | V | `artifacts/logs/final-verify.log` (exit 0), повтор после FIX-QA2 `artifacts/logs/final-verify-2.log` (exit 0); числа не уменьшились относительно прокси-baseline; покейсовая таблица «старый → новый» не составлялась |
| TC-R-03 | passed | S | `artifacts/logs/scripts-test.log`: 454 / 454, exit 0 |
| TC-R-04 | passed | C | `artifacts/logs/qa-check-task.log` |
| TC-R-05 | not_run | — | Ветка не запушена (push — только с разрешения пользователя); CI на итоговом SHA не запускался |
| TC-R-06 | passed | Q | `artifacts/logs/qa-static.log`: `dev.db` и `dev.pre-*.db` — ignored, mtime `dev.db` 2026-11-21 (до SWR-010), md5 записаны; `.env` ignored, не читался; новых крупных файлов, кроме чужого `docs/design/design.zip`, нет. Скриншоты SWR-006 — см. ниже |

### Итоги по статусам (171 TC)

| Статус | Кол-во |
|---|---|
| passed | 137 |
| passed (partial) | 25 |
| not_run | 8 |
| not_applicable | 1 |
| failed | 0 |
| **Итого** | **171** |

not_run: TC-VIS-08, TC-BL-09, TC-OLD-07, TC-RP-04, TC-RP-05, TC-AI-04, TC-R-01, TC-R-05. not_applicable: TC-CF-09. passed (partial) — 25 кейсов, непокрытая часть указана в строке каждого.

## Bind: предложенное место теста (`test-cases.md`) → реальный файл

`test-cases.md` (документ EARLY_QA_DESIGN, не входит в OWNED FILES этого прохода) не правился; фактическая привязка:

| Bind в `test-cases.md` | Реальные файлы |
|---|---|
| `packages/platform/test/cards/*.test.ts` | `packages/platform/test/cards/schema.test.ts`, `packages/platform/test/cards/ops.test.ts`, `packages/platform/test/cards/property.test.ts`, `packages/platform/test/cards/shuffle.test.ts`, `packages/platform/test/cards/visibility.test.ts`, `packages/platform/test/cards/boundaries.test.ts` |
| `packages/games/rebellion/test/cards/catalog.test.ts` | `packages/games/rebellion/test/schema/card-catalog.test.ts` |
| `packages/games/rebellion/test/cards/init.test.ts` | `packages/games/rebellion/test/rules/core/cards-init.test.ts` |
| `test/rules/core/refresh-probes.test.ts`, `cards-replay.test.ts` | `packages/games/rebellion/test/rules/core/cards-refresh.test.ts` |
| `test/rules/core/cards-view.test.ts`, `cards-hidden.test.ts` | `packages/games/rebellion/test/rules/core/cards-visibility.test.ts`, `packages/games/rebellion/test/rules/core/cards-events-redaction.test.ts`, `packages/games/rebellion/test/rules/core/cards-reveal.test.ts` |
| `test/rules/core/register.test.ts` | `packages/games/rebellion/test/rules/core/cards-register.test.ts`, `packages/games/rebellion/test/rules/core/table-register-pipeline.test.ts` |
| `test/rules/core/table-tasks.test.ts` (unit) | `packages/games/rebellion/test/rules/core/table-tasks.test.ts`, `packages/games/rebellion/test/rules/core/table-init.test.ts`, `packages/games/rebellion/test/rules/core/table-confirm.test.ts`, `packages/games/rebellion/test/rules/core/table-blocking.test.ts` |
| `test/ai/cards-decision.test.ts` | `packages/games/rebellion/test/ai/describe-cards.test.ts`, `packages/games/rebellion/test/server/automation-cards.test.ts` |
| `apps/api/test/cards-create.int.test.ts`, `cards-persistence.int.test.ts`, `cards-determinism.int.test.ts`, `physical-register.int.test.ts`, `table-tasks.int.test.ts`, `table-blocking.int.test.ts` | `apps/api/test/physical-sync.int.test.ts` |
| `apps/api/test/table-confirm.int.test.ts` (TC-CF-07/08) | `apps/api/test/table-confirm-race.int.test.ts` (+ последовательные — `apps/api/test/physical-sync.int.test.ts`) |
| `apps/api/test/table-restart.int.test.ts` | `apps/api/test/table-restart.int.test.ts` (TC-RST-03), TC-RST-01/02 — `apps/api/test/physical-sync.int.test.ts` |
| `apps/api/test/cards-hidden-info.int.test.ts`, `cards-ai-hidden.int.test.ts`, `cards-summary.int.test.ts`, `cards-diag.int.test.ts`, `cards-refresh.int.test.ts` | `apps/api/test/cards-hidden-info.int.test.ts` |
| `apps/api/test/cards-legacy.int.test.ts` | `apps/api/test/legacy-core-cards.int.test.ts` |
| `apps/api/test/cards-hotseat.int.test.ts`, `cards-ai.int.test.ts` | нет (TC-VIS-08, TC-AI-04 — not_run) |
| `e2e/card-hand.spec.ts`, `e2e/card-detail.spec.ts`, `e2e/physical-execution.spec.ts`, `e2e/cards-hidden.spec.ts`, `e2e/cards-legacy.spec.ts`, `e2e/game-setup.spec.ts` | те же имена (+ `e2e/swr010-screenshots.spec.ts` — скриншоты) |
| `apps/web/...` (component) | `apps/web/src/games/rebellion/core-v1/cards/**`, `apps/web/src/games/rebellion/core-v1/table/**`, `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx` |

## Leak matrix (результаты)

Секреты: **S1** рука зондов Империи (от Повстанцев), **S2** порядок/состав колоды (от всех), **S3** база/Location
AI-Повстанцев до раскрытия (от человека-Империи), **S4** Location человека-Повстанцев (от AI-Империи). Обозначения в
API-тестах иные: в `apps/api/test/cards-hidden-info.int.test.ts` S1↔«S2 AI Empire's probes», S3↔«S1 AI Rebels'
Location», S4↔«S5 registered Location», колода↔«S4»; ниже — нумерация `test-cases.md`.

Метод в реализованных тестах: прямой поиск токенов `probe-<system>` / `probe-<system>#1` (целые id) в сериализованных
телах с позитивным контролем сканера (у владельца токены находятся) + метаморфные сравнения на уровне правил/AI
(`swapHand`, `permuteDeck`, обмен Location). Двух-БД метаморфных сравнений ответов API (как предлагали TC-LK-01/02/03/04)
**нет** — это основная причина `partial`.

| Выход \ секрет | S1 рука Империи | S2 колода | S3 база AI-Повстанцев | S4 Location человека-Повстанцев |
|---|---|---|---|---|
| O1 представление человека | passed (partial) — TC-LK-01 | passed (partial) — TC-LK-02 | passed (partial) — TC-LK-03 | not_applicable |
| O2 представление AI / DP / промпт | passed (partial) — TC-LK-04 | passed — TC-LK-05 | not_applicable | passed — TC-LK-06 |
| O3 события ответа команды / run | passed — TC-LK-07 | passed — TC-LK-07 | passed — TC-LK-08 | not_applicable |
| O4 журнал сессии | passed (partial) — TC-LK-09 | passed (partial) — TC-LK-09 | passed (partial) — TC-LK-09 | not_applicable |
| O5 сводка списка сессий | passed (partial) — TC-LK-10 | passed (partial) — TC-LK-10 | passed (partial) — TC-LK-10 | passed (partial) — TC-LK-10 |
| O6 задачи стола | passed — TC-LK-11 | passed (partial) — TC-LK-12 | passed — TC-LK-13 | not_applicable |
| O7 диагностика / AI dev-панель | passed — TC-LK-14 | passed (partial) — TC-LK-15 | passed — TC-LK-16 | not_applicable |
| O8 production-бандл | not_applicable | passed — TC-LK-17 | passed — TC-LK-17 | not_applicable |
| O9 DOM / storage / URL (e2e) | passed — TC-LK-18 (сканер с позитивными контролями) | passed — TC-LK-18 (с контролями) | passed — TC-LK-19 (с контролями) | not_applicable |
| O10 тела ошибок 422/409 | passed (partial) — TC-LK-20 | passed (partial) — TC-LK-20 | passed (partial) — TC-LK-20 | not_applicable |
| O11 серверные логи, `AiUsage` | passed — TC-LK-21 | passed — TC-LK-21 | passed — TC-LK-21 | passed — TC-LK-21 |

| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-LK-01 | passed (partial) | V-api, V-rebellion, N | `apps/api/test/cards-hidden-info.int.test.ts` «human Rebels vs AI Empire (digital)» (все ответы create/command/run/GET/список, ≥ 10 тел, руки ≥ 4 карт — 0 токенов; у клиента только `count`) и «… (physical)»; метаморфно (правила): `cards-visibility.test.ts` «swapHand: the Rebels view does not depend …», `cards-events-redaction.test.ts` «metamorphic: the Rebels log is identical …». Не сделано: двух-БД `swapHand` по API, hot-seat |
| TC-LK-02 | passed (partial) | V-api, V-rebellion, V-e2e, N | токены колоды — 0 во всех ответах трёх тестов `cards-hidden-info`; `cards-visibility.test.ts` «TC-VIS-04: 10 deck permutations → identical views for both sides»; `e2e/cards-hidden.spec.ts` TC-LK-18. Не сделано: двух-БД `permuteDeck` по API для всех 5 видов партий |
| TC-LK-03 | passed (partial) | V-api, V-rebellion, V-e2e, N | `cards-hidden-info` «human Empire vs AI Rebels (digital)» (Location-токены 0 во всех ответах); `cards-visibility.test.ts` «S1/AC-15: … Empire view is invariant to the base»; `e2e/cards-hidden.spec.ts` «TC-LK-19 + TC-LK-16» (оба сида); существующие `apps/api/test/automation-hidden-info.int.test.ts`, `apps/api/test/rules-hidden-info.int.test.ts` (перенос базы теперь переносит карту Location, `apps/api/test/support/location-card.ts`). Не сделано: `G_PHY_EMP` и hot-seat по API |
| TC-LK-04 | passed (partial) | V-api, V-rebellion, N | `cards-hidden-info` (digital Empire): промпты/usage/диагностика/логи AI-Повстанцев — 0 токенов руки человека; `packages/games/rebellion/test/server/automation-cards.test.ts` «AI Rebels: the human Empire’s probe hand and the deck order do not change the point»; `describe-cards.test.ts` «S2/S3 … invariant to the Empire’s hand». Не сделано: побайтное равенство `REQ` по API; `G_PHY_EMP` с fake OpenAI |
| TC-LK-05 | passed | V-api, V-rebellion, N | токены колоды 0 в каналах AI (`cards-hidden-info`, тесты 1–2); `automation-cards.test.ts` «AI Empire: the deck order does not change the point» + тест AI Rebels; `describe-cards.test.ts` «S4» |
| TC-LK-06 | passed | V-api, V-rebellion, N | `cards-hidden-info` «… (physical): no AI call before the registration; S5 never reaches the AI»; digital — Location не в каналах AI; `automation-cards.test.ts` «S5 (review #6)» (9 регистраций → байт-равные view и DP AI-Империи) |
| TC-LK-07 | passed | V-rebellion, V-api, N | `cards-events-redaction.test.ts` «the Empire sees its definition ids; the Rebels see side + count only», «command events (the response channel) are redacted the same way», метаморфный тест; ответы команд в `cards-hidden-info` — 0 токенов |
| TC-LK-08 | passed | V-api, V-rebellion, V-e2e | `cards-hidden-info` (digital Empire, ответы `CMD`/`RUN`); `table-tasks.test.ts` «TC-TT-09»; `e2e/physical-execution.spec.ts` «TC-PX-08 / TC-LK-13»; `automation-hidden-info`/`rules-hidden-info` |
| TC-LK-09 | passed (partial) | V-api, V-rebellion | `view.log` входит в просканированные GET-ответы (3 раунда, 3 теста); правила: «TC-VIS-09 … over whole games no step leaks …», журнал после раскрытия — `cards-events-redaction.test.ts`. Не сделано: 3 полные bot-vs-bot партии по API |
| TC-LK-10 | passed (partial) | V-api | `GET /api/sessions` после каждого раунда добавляется в просканированные ответы (`passRounds`, `cards-hidden-info`). Не сделано: сводка со строками `G_OLD_*` в этом скане; фильтр списка |
| TC-LK-11 | passed | V-rebellion, V-api, V-web, N | `table-tasks.test.ts` «Refresh after the human pass: ONE refresh task — … opponent drew N (no card ids, S2)», «… the human Rebels are told only the count»; `cards-hidden-info` physical «tasks carry no Imperial probe»; `tableModel.test.ts` «refresh … of the human Rebels — nothing but the count» |
| TC-LK-12 | passed (partial) | V-rebellion, V-e2e | `table-tasks.test.ts` «the human Empire's own Refresh draw names exactly its cards»; `e2e/physical-execution.spec.ts` «TC-PX-08: Refresh task (seed) names exactly the 2 drawn probes». Метаморфное сравнение задач при переставленном остатке колоды не делалось (задачи строятся из представления, а оно инвариантно к перестановке — TC-VIS-04) |
| TC-LK-13 | passed | V-rebellion, V-e2e, N | `table-tasks.test.ts` «AI activation of its base and AI move into it: the system is null ("Rebel Base" space)», «TC-TT-09»; `e2e/physical-execution.spec.ts` «TC-PX-08 / TC-LK-13 (seed)»; `artifacts/screenshots/swr010-px-ai-task-ru-1440.png` |
| TC-LK-14 | passed | V-api, V-e2e | `cards-hidden-info` канал `diagnostics` (`GET /api/dev/ai/sessions/:id/decisions`) — 0 токенов руки/колоды/Location; `e2e/cards-hidden.spec.ts` «TC-LK-18 + TC-LK-14 … dev AI panel» |
| TC-LK-15 | passed (partial) | V-api | токены колоды в диагностике — 0 (тесты 1–2). Метаморфное равенство `DIAG` для `permuteDeck` не проверялось |
| TC-LK-16 | passed | V-api, V-e2e | `cards-hidden-info` (digital Empire) `diagnostics` — 0 Location-токенов; `e2e/cards-hidden.spec.ts` «TC-LK-19 + TC-LK-16» |
| TC-LK-17 | passed | V-bundle, S | `scripts/check-web-bundle.test.mjs` (правила `card-deck-seed`, `rebellion-card-server-symbol`, модульная проверка с позитивными фикстурами) в `artifacts/logs/scripts-test.log`; `pnpm check:bundle` OK в `artifacts/logs/final-verify.log` (правила `rebel-base-*` целы) |
| TC-LK-18 | passed | V-e2e | `e2e/cards-hidden.spec.ts` «TC-LK-18 + TC-LK-14: human Rebels after a Refresh — no Empire probe and no deck card in API bodies, DOM, storages, URL, dev AI panel». С FIX-QA2-e2e (review #9) у сканера есть обязательные позитивные контроли по всем каналам (тела API, DOM, localStorage, sessionStorage, URL): своя Location, публичная `probe-box`, канарейка в storage; демонстрация поломки контроля → 4 failed |
| TC-LK-19 | passed | V-e2e | `e2e/cards-hidden.spec.ts` «TC-LK-19 + TC-LK-16: human Empire before the reveal (<seed>) …». Позитивные контроли FIX-QA2-e2e: публичная `probe-box` + свои зонды (в сидах, где есть), канарейка storage, `sessionId` в URL; `scanForBase` отдельным контролем не покрыт (тела API доказаны токен-контролями) |
| TC-LK-20 | passed (partial) | V-api, V-rebellion | тела 409/422 входят в скан `cards-hidden-info` (digital: CONFIRM/REGISTER 422, 409); `physical-sync` «details only echo the request»; правила «details echo the request only». Не все виды партий |
| TC-LK-21 | passed | V-api | `cards-hidden-info` каналы `usage` (строки `AiUsage`) и `logs` (automation + AI sinks) — 0 токенов карт обеих сторон |

## PO mandatory checks (request.md G, п. 1–14)

| # | Проверка PO | TC | Статус | Комментарий |
|---|---|---|---|---|
| 1 | Инициализация колод | TC-INIT-01..09, TC-DECK-01, 07 | passed | INIT-08 partial (строка БД без счётчиков зон) |
| 2 | Детерминированное воспроизведение | TC-INIT-03, 04, 09, TC-RP-02, 03, TC-DECK-10, 13, TC-RST-02 | passed | RST-02 без байт-сравнения с непрерывным прогоном |
| 3 | Добор и сброс | TC-DECK-01..03, TC-RF-01..06 | passed | |
| 4 | Нет дублирования карт | TC-DECK-07..09, TC-INIT-01, TC-PH-01, TC-RP-04, TC-CF-07 | passed (partial) | TC-CF-07 — passed (FIX-QA2); TC-RP-04 — not_run (испорченная строка по API) |
| 5 | Запрет недопустимых переходов | TC-DECK-03..06, 11, TC-PH-02..04 | passed | DECK-05/06 и PH-02 partial (владельцы/«нет розыгрыша» — правилами; ROW по HTTP) |
| 6 | Изоляция рук сторон | TC-VIS-01..03, 08, TC-LK-01, 04, 06, 18 | passed (partial) | TC-VIS-08 (hot-seat) not_run; LK-01/04 без двух-БД метаморфики |
| 7 | Нет утечки порядка колоды | TC-VIS-04, TC-LK-02, 05, 12, 15, 17 | passed | LK-02/12/15 partial (метаморфика на уровне правил, по API — прямой поиск) |
| 8 | Работа с сохранённой партией | TC-RP-01, 04, 05, TC-RST-01 | passed (partial) | RP-04, RP-05 not_run |
| 9 | Восстановление Physical Execution после перезапуска | TC-RST-01..04, TC-PX-06 | passed (partial) | RST-03 — passed (FIX-QA2, `apps/api/test/table-restart.int.test.ts`); RST-02 — без байт-сравнения с прогоном без рестарта |
| 10 | Защита от двойного подтверждения | TC-CF-02, 03, 07..09, TC-PX-04, 05, 09 | passed | последовательный повтор (409/422), конкурентный CONFIRM на сервере ×20 (CF-07, вариант голова+следующая, CONFIRM ‖ REGISTER_CARD) и задвоение хода AI (CF-08) — `apps/api/test/table-confirm-race.int.test.ts`; клиент (двойной клик, Enter/Space, вторая вкладка 409) — e2e; CF-09 not_applicable |
| 11 | Нет преждевременного раскрытия карт AI | TC-LK-03, 08, 11, 13, 14, 16, 19, TC-TT-07, TC-PX-08 | passed | LK-03 partial (без `G_PHY_EMP` по API; e2e-сиды physical Empire покрывают UI) |
| 12 | Старые партии без повреждения данных | TC-OLD-01..07, TC-RF-04 | passed (partial) | OLD-07 (копия dev.db) not_run; OLD-03 только core-v1 GET |
| 13 | Интеграция с AI Commander | TC-AI-01..08, TC-LK-04..06, TC-BL-02, 06 | passed (partial) | TC-AI-04 (ответ модели `PLAY_CARD`) not_run |
| 14 | `pnpm verify` и CI | TC-R-01..06 | passed (partial) | verify exit 0 дважды (V, V2); CI not_run (ветка не запушена); baseline — прокси SWR-009 |

## SWR-006 screenshots (контроль чужих изменений)

md5 всех 20 файлов `docs/tasks/SWR-006/artifacts/screenshots/*.png` снят до запуска V и после него
(`artifacts/logs/qa-swr006-md5.log`): **не изменились** ни в прогоне V (00:50–01:01), ни в прогоне V2 (01:08–01:19), и равны исходным — все 20 md5 до и после идентичны; md5 `apps/api/prisma/*.db` также идентичны. Файлы были изменены в рабочем дереве до QA (чужая сессия); QA их
не трогал, `git checkout` не делал.

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

- lint: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log` (eslint --max-warnings=0 + prettier --check)
- typecheck: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`
- unit: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log` (platform 472, rebellion 1056, web 1052, forbidden-stars 5), `artifacts/logs/scripts-test.log` (454)
- integration: passed — `artifacts/logs/final-verify-2.log` (apps/api 877 passed / 2 skipped opt-in; первый прогон 873 — `artifacts/logs/final-verify.log`)
- build: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`
- check:bundle: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`
- e2e: passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`
- verify (aggregate): passed — `artifacts/logs/final-verify.log`, `artifacts/logs/final-verify-2.log`
- check-task: passed — `artifacts/logs/qa-check-task.log`
- ci: not_run — ветка `swr-009-vector-terminal` не запушена (push только с разрешения пользователя)
- concurrent CONFIRM (TC-CF-07/08): passed — `apps/api/test/table-confirm-race.int.test.ts`, `artifacts/logs/final-verify-2.log`
- restart before registration (TC-RST-03): passed — `apps/api/test/table-restart.int.test.ts`, `artifacts/logs/final-verify-2.log`

## Defects

| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| — | — | Дефектов продукта в QA_EXECUTION не найдено (D-1 и O-1 pre-QA закрыты FIX-QA1; их e2e-проверки зелёные: `e2e/card-hand.spec.ts`, `e2e/physical-execution.spec.ts`) | — | — | — |

## Coverage gaps (не дефекты продукта; рекомендованы до/после FINAL_ACCEPTANCE)

Закрыты FIX-QA2 (было `not_run` в первом проходе): TC-CF-07/08 (конкурентный CONFIRM, PO G-10), TC-RST-03 — теперь passed.
Тестов нет — статус `not_run`: TC-VIS-08 (hot-seat с картами по API),
TC-BL-09 (property физических партий до конца), TC-OLD-07 (копия dev.db, opt-in),
TC-RP-04 (испорченная карточная часть по API), TC-RP-05 (рестарт + доигрывание), TC-AI-04 (ответ модели с
«карточным» действием), TC-R-01 (baseline на `f3619a1`), TC-R-05 (CI). Наиболее значимое оставшееся — двух-БД метаморфика по API для
TC-LK-01..04 (секреты проверены прямым поиском токенов и метаморфикой на уровне правил/AI).

## Observations

- **O-1 (AC-1, minor doc).** `rules-audit.md`: у Location (§3.7) нет отдельных строк «формирование/время розыгрыша»;
  строки «Отложено» в §3.5/§3.6 без ссылки в колонке «Источник». Факты при этом присутствуют с источниками в §3.6.
- **O-2.** `corePublicCardsView` нигде не используется в wire (W3 ограничение): сводка списка сессий карт не несёт
  вовсе, так что публичной проекции некуда применяться. AC-9 считаю выполненным по наличию отдельной проекции и тестам.
- **O-3.** Обозначения секретов в `apps/api/test/cards-hidden-info.int.test.ts` (S1..S5) не совпадают с нумерацией
  `test-cases.md` (S1..S4) — сопоставление дано в «Leak matrix».
