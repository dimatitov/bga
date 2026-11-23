# Acceptance — SWR-010

## Pre-QA business validation

Analyst, 2026-11-23. Проверка по реальным прогонам e2e (собственный API 3100 и e2e-БД Playwright, бот вместо OpenAI) и
скриншотам `artifacts/screenshots/swr010-*`. Ручной прогон на `dev-5180` не выполнялся сознательно: этот конфиг пишет в
пользовательскую `apps/api/prisma/dev.db`, которую по ограничениям задачи менять нельзя.

| # | Сценарий | Что проверено | Результат |
|---|---|---|---|
| 1 | S-1 цифровая партия, человек — Повстанцы | Вкладка «Карты»: своя карта Location (Утапау), бейдж «секретная, только у вас», у Империи — только счётчики (`artifacts/screenshots/swr010-hand-reb-ru-1440.png`) | проходит; найден D-1 (см. ниже) |
| 2 | S-2 Refresh, человек — Империя | После Refresh в руке Империи зонд «Ботавуи · В РУКЕ», колода — только количество; база Повстанцев на карте — «местоположение неизвестно» (`artifacts/screenshots/swr010-hand-emp-ru-1440.png`) | проходит |
| 3 | S-4 физический стол, человек — Империя | Ход AI-Повстанцев в скрытую базу → режим «Физический стол · задача 1 из 1», «AI ждёт подтверждения стола», шаг «… → клетка «Rebel Base»», база не названа, кнопка «Выполнено на столе» (`artifacts/screenshots/swr010-px-ai-task-ru-1440.png`) | проходит; O-1 (падеж в RU-шаге) |
| 4 | S-3 физический стол, человек — Повстанцы | Задача «Register your base card»: инструкция справочной стопки, список только допустимых систем, кнопка Register (`artifacts/screenshots/swr010-px-register-en-375.png`) | проходит (375 px) |
| 5 | S-5/S-6 перезагрузка и двойное нажатие | e2e RST-04/PX-06 (перезагрузка и новый контекст — та же головная задача), PX-04/PX-05/PX-09 (одно подтверждение, 409 у устаревшей вкладки) — `artifacts/logs/e2e.log` | проходит |
| 6 | S-7 старая партия | e2e HAND-07/OLD-06: «карты не отслеживаются», без ошибок, строка не переписана — `artifacts/logs/e2e.log` | проходит |
| 7 | S-8 Card Detail | e2e DET-01..03: нет кнопки розыгрыша, только «Закрыть», нет не-GET запросов — `artifacts/logs/e2e.log` | проходит |

Найдено и возвращено исполнителю до QA (FIX-QA1): **D-1** — у карты Location Повстанцев краткое описание взято из
строки добора зондов Империей (противоречит роли карты); **O-1** — RU-шаг «Поставьте Принцесса Лея → клетка «Rebel Base»».
O-2 (короткая панель «Карты» на 1440×900, видна одна карта без прокрутки) — принято как ограничение v0, в рекомендации.

Вывод pre-QA: бизнес-сценарии S-1..S-8 проходят; после FIX-QA1 — передача в QA_EXECUTION.

## Acceptance criteria

Вердикты Analyst по доказательствам QA (`qa-results.md`, повторный `pnpm verify` — `artifacts/logs/final-verify-2.log`, EXIT_CODE=0, проверено Analyst лично), review (`review.md`, 3 раунда, approved) и pre-QA проверке. Пробелы TC (8 `not_run`) перечислены в `qa-results.md` и `delivery-report.md`; ни один не опровергает AC.

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

## Final decision
accepted — AC-1..AC-24 passed (review approved, `pnpm verify` exit 0). Оговорка: CI не запускался (ветка не запушена, push только по просьбе пользователя); 8 TC `not_run` и 25 `passed (partial)` перечислены в `qa-results.md`.
