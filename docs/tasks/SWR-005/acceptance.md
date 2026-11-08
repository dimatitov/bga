# Acceptance — SWR-005

## Pre-QA business validation
Analyst, 2026-11-08, after INTEGRATION (`artifacts/logs/integration-verify.log`, exit 0) and review approved, live app on the
user's real dev DB (backup `apps/api/prisma/dev.pre-swr005.db`). Evidence: `artifacts/logs/business-validation.log`, screenshots `bv-*.jpg`.
- BV-0: 6 old sessions open as `mock-v1` «Старый прототип», an old-rules command still works.
- BV-1..BV-4: new AI game as Rebels — real map, time 1 / reputation 14, activation, transport refusal + accepted move, AI auto-pass, pass → round 2.
- BV-5: AI game as Empire — base hidden, hidden zone with 6 units, Bothawui shows its starting units (review #1 fix).
- BV-6: Rebels win by time at 14 — banner, focus, status «Завершена» in table/API/list, then 422 `gameOver`.
- BV-7: hot-seat handoff — 8 public fields only, inactive side 422, accept → own view.
- BV-8: 1024×768 and 768×1024 — all 32 systems with labels.
Result: no app defects found.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log` (§1 data tests, TC-E-01), `artifacts/screenshots/01-core-fit-1440x900.png` |
| AC-02 | passed | `artifacts/logs/qa-verify.log` (§1, golden TC-G, base-invariance test) |
| AC-03 | passed | `artifacts/logs/qa-verify.log` (§2, TC-E-01, TC-E-13), `artifacts/logs/qa-manual.log` |
| AC-04 | passed | `artifacts/logs/qa-verify.log` (§3, TC-E-02, TC-E-10) |
| AC-05 | passed | `artifacts/logs/qa-verify.log` (§4, TC-E-02, TC-E-11) |
| AC-06 | passed | `artifacts/logs/qa-verify.log` (§2, TC-E-02/03), `artifacts/logs/qa-manual.log` (finish → auto-pass → pass → round 2, time 2, leaders in pool) |
| AC-07 | passed | `artifacts/logs/qa-verify.log` (§5, §10, TC-E-07, TC-E-08), `artifacts/screenshots/13-game-over-rebels.png`, `artifacts/screenshots/13b-game-over-empire.png` |
| AC-08 | passed | `artifacts/logs/qa-verify.log` (§7, TC-E-02, TC-E-04), `artifacts/logs/qa-e2e-tce04.log`, `artifacts/logs/qa-manual.log` |
| AC-09 | passed | `artifacts/logs/qa-verify.log` (§8, TC-E-05, TC-E2E-HS-01..05 core), `artifacts/screenshots/16-hotseat-handoff-core.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log` (§6, TC-E-04, TC-E-06, `check:bundle`), `artifacts/logs/qa-e2e-tce04.log`, `artifacts/logs/qa-manual.log`, `artifacts/logs/hidden-info-scan.log` |
| AC-11 | passed | `artifacts/logs/qa-verify.log` (§11, TC-E-09), `artifacts/logs/qa-dev-db-upgrade.log` (run A on the pre-SWR-005 backup copy), `artifacts/logs/dev-db-backup.log`, `artifacts/screenshots/15-legacy-table.png` |
| AC-12 | passed | `artifacts/logs/qa-verify.log` (TC-E-10..12, TC-VA-01..14), `artifacts/logs/qa-manual.log` (keyboard-only full turn), `artifacts/screenshots/02-core-fit-1024x768.png`, `artifacts/screenshots/03-core-fit-768x1024.png` |
| AC-13 | passed | `artifacts/logs/qa-verify.log` (§10, TC-E-07, TC-E-14, architecture test «platform never reads a game result»), `artifacts/screenshots/14-game-page-completed.png` |
| AC-14 | passed | `artifacts/logs/qa-verify.log` (golden TC-G, eslint boundaries, `check:bundle` OK) |
| AC-15 | passed | `docs/game-rules/rebellion-core-v1.md`, `artifacts/logs/qa-static-checks.log` |
| AC-16 | passed | `artifacts/logs/qa-verify.log` (EXIT_CODE=0, e2e 106 passed incl. scenarios 1–6 = TC-E-01..TC-E-09) |

Decision based on QA (`qa-results.md`, `artifacts/logs/qa-verify.log` exit 0 — spot-checked by Analyst), review approved after round 3 (`review.md`), business validation (`artifacts/logs/business-validation.log`). D-QA-1 (opt-in dev-DB test, test-only) — known issue, does not affect AC-11 behaviour.

## Final decision
accepted — AC-01..AC-16 passed; review approved (blocking #1 fixed); QA: 0 product defects open (D-1..D-3 fixed), D-QA-1 test-only known issue.
