# Acceptance — SWR-000

## Pre-QA business validation
Analyst, 2026-11-08, after CODE_REVIEW round 3 = approved. Evidence: `artifacts/logs/business-validation.log`.
- **BV-1 (честный отчёт в процессе):** `node scripts/check-task.mjs docs/tasks/SWR-000` → `OK`, exit 0 — gate не мешает честной незавершённой задаче.
- **BV-2 (агент ложно заявляет accepted):** копия SWR-000, где `accepted` и FINAL_ACCEPTANCE `passed` выставлены при `not_run` QA → FAIL, exit 1: R3 (порядок этапов) и R10 (AC не пройдены / отсутствуют в таблицах).
- Бизнес-цель («нельзя заявить passed/accepted без оснований») достигнута. Замечание: шум — один пропущенный AC даёт до 6 строк R10 (R3-3, в follow-up).

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-unit.log`, `artifacts/logs/qa-cli.log` (a1, a1empty, a1b) |
| AC-2 | passed | `artifacts/logs/qa-unit.log`, `artifacts/logs/qa-cli.log` (a2*) |
| AC-3 | passed | `artifacts/logs/qa-unit.log`, `artifacts/logs/qa-cli.log` (a3*) |
| AC-4 | passed | `artifacts/logs/qa-unit.log`, `artifacts/logs/qa-cli.log` (a4*), `artifacts/logs/business-validation.log` (BV-2) |
| AC-5 | passed | `artifacts/logs/qa-unit.log`, `artifacts/logs/qa-cli.log` (ok, my dir, _template, no args, missing dir) |

Решение по каждому AC принято Analyst по фактическим логам QA (`qa-results.md`), проверены выборочно: 225/225 тестов, 27 CLI-прогонов с кодами выхода.

## Final decision
accepted — AC-1..AC-5 passed с доказательствами; review round 3 approved; QA без дефектов. Остаток — в follow-up (см. `delivery-report.md`).
