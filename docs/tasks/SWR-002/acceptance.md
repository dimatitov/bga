# Acceptance — SWR-002

## Pre-QA business validation
Analyst, 2026-11-08, после CODE_REVIEW (approved), до QA. Evidence: `artifacts/logs/business-validation.log`.
- BV-1..BV-3: меню, создание партии за Повстанцев, стол с mock-данными, раунд/фаза, MOCK-метки, своя база видна стороне Повстанцев.
- BV-4..BV-6: выбор объекта → 4 допустимые цели в панели и на карте → перемещение в 1 клик → version 1→2, aria-live, журнал; после перезагрузки состояние восстановлено.
- BV-7: сервер — источник истины: недопустимый ход → 422 `errors.notAdjacent`, устаревшая версия → 409.
- Вывод: бизнес-сценарий «компаньон, а не симулятор» (выбор → допустимые действия → Command API → сохранённое состояние) работает сквозным образом.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-manual.log`, `artifacts/logs/integration-dev-smoke.log` |
| AC-2 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-3 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/03-new-game.png` |
| AC-4 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/04-board-initial.png` |
| AC-5 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/05-board-zoomed-panned.png` |
| AC-6 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/06-system-panel.png`, `artifacts/screenshots/07-piece-actions.png` |
| AC-7 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/09-illegal-move-feedback.png`, `artifacts/logs/business-validation.log` |
| AC-8 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/11-after-reload.png`, `artifacts/logs/business-validation.log` |
| AC-9 | passed | `artifacts/logs/qa-verify.log` |
| AC-10 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-11 | passed | `delivery-report.md`, `artifacts/screenshots/01-main-menu-empty.png` (+15 скриншотов) |
| AC-12 | passed | `artifacts/logs/qa-arch.log`, `artifacts/logs/qa-verify.log` |

Решение по каждому AC — по фактическим логам QA (`qa-results.md`), бизнес-валидации и выборочной перепроверке Analyst (`artifacts/logs/qa-verify.log`: verify exit 0, e2e 37/37, check:bundle OK).

## Final decision
accepted — AC-1..AC-12 passed с доказательствами; review approved (2 раунда); QA без дефектов. Ограничения и not_run-проверки перечислены в `delivery-report.md`.
