# Acceptance — SWR-004

## Pre-QA business validation
Analyst, 2026-11-08, after INTEGRATION, on the user's real migrated dev DB (backup `dev.pre-swr004.db`). Evidence: `artifacts/logs/business-validation.log`.
- BV-0: 4 old sessions upgraded (rebels/empire, base/digital, prototype).
- BV-1..BV-3: defaults, caption flip, human → no difficulty, server-derived opponent, `aiDifficulty: null`, prototype badge.
- BV-4..BV-5: handoff view has only 7 public fields, no canvas/debug, focus on title; accept → own view of the new side.
- BV-6..BV-8: 400/422 server validation, idempotent replay, 375 px layout.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-02 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-02-new-session-defaults-d.png`, `artifacts/logs/business-validation.log` |
| AC-03 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-03-empire-selected-d.png` |
| AC-04 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-04-human-selected-d.png`, `artifacts/logs/business-validation.log` |
| AC-05 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-06 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/wapi-smoke.log` |
| AC-07 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-05-error-state-d.png`, `artifacts/logs/qa-manual.log` |
| AC-08 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-09 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-01-game-page-d.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-11 | passed | `artifacts/logs/qa-manual.log`, `artifacts/screenshots/va-02-new-session-defaults-m.png`, `artifacts/screenshots/va-09-keyboard-focus.png` |
| AC-12 | passed | `artifacts/logs/qa-verify.log`, `review.md` |
| AC-13 | passed | `artifacts/screenshots/va-06-table-prototype-badge-d.png`, `artifacts/logs/qa-verify.log` |
| AC-14 | passed | `artifacts/screenshots/va-07-handoff-d.png`, `artifacts/logs/business-validation.log`, `artifacts/logs/qa-verify.log` |
| AC-15 | passed | `artifacts/logs/business-validation.log`, `artifacts/logs/qa-verify.log` |

Decision based on QA logs (`qa-results.md`), review and business validation; Analyst spot-checked `artifacts/logs/qa-verify.log` (exit 0, e2e 75/75).

## Final decision
accepted — AC-01..AC-15 passed; review approved and findings fixed; QA found no defects.
