# QA results — SWR-004

QA Lead, 2026-11-08, QA_EXECUTION on the final code. Before this pass: INTEGRATION done, CODE_REVIEW approved with fixes, BUSINESS_VALIDATION
passed, focus ring for all buttons in place. QA wrote the e2e specs (`e2e/**`, owned files). QA changed no product code; no spec needed
changes during this pass.
SWR-002 / SWR-003 artifacts and the dev DBs are unchanged: sha256 before = after (`artifacts/logs/qa-artifacts-sha.log`).

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-A-03 gates (lint, typecheck incl. e2e, test, build, check:bundle, e2e) | passed | `pnpm verify` | `artifacts/logs/qa-verify.log` (exit=0) |
| TC-R-02 unit/integration counts | passed | `pnpm test` (in verify) | `artifacts/logs/qa-verify.log`: process 357/0 fail; platform 64; forbidden-stars 5; rebellion 201 (20 files); web 255 (33 files); api 181 + 1 skipped opt-in (19+1 files) |
| TC-U-01..33 (game-core, upcaster, factions registry, contrast of faction tokens) | passed | `pnpm test` | `packages/games/rebellion/test/schema/setup.test.ts`, `packages/games/rebellion/test/schema/settings.test.ts`, `packages/games/rebellion/test/rules/turn.test.ts`, `packages/games/rebellion/test/rules/player-view.test.ts`, `packages/games/rebellion/test/server/upcast.test.ts`, `packages/games/rebellion/test/assets/factions.test.ts`, `artifacts/logs/qa-verify.log` |
| TC-C-01..22 (web components) | passed | `pnpm test` | `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`, `apps/web/src/games/rebellion/setup/model/setupForm.test.ts`, `apps/web/src/platform/sessions/useCreateSession.test.tsx`, `apps/web/src/platform/game-page/GamePage.test.tsx`, `apps/web/src/games/rebellion/table/TableScreen.test.tsx`, `apps/web/src/games/rebellion/table/HandoffScreen.test.tsx`, `apps/web/src/shared/ui/ChoiceGroup.test.tsx`, `apps/web/src/games/rebellion/locales.i18n.test.ts`, `artifacts/logs/qa-verify.log` |
| TC-I-01..38 (HTTP API, idempotency, hot-seat, DB failure) | passed | `pnpm test` (apps/api) | `apps/api/test/sessions.int.test.ts`, `apps/api/test/idempotency.int.test.ts`, `apps/api/test/hotseat.int.test.ts`, `apps/api/test/db-failure.int.test.ts`, `apps/api/test/persistence.int.test.ts`, `apps/api/test/hidden-info.int.test.ts`, `artifacts/logs/qa-verify.log` |
| TC-M-01..07 (SWR-003 → SWR-004 data migration) | passed | `pnpm test` (apps/api) | `apps/api/test/migration-swr004.int.test.ts`, `apps/api/test/upcast-v1.int.test.ts`, `apps/api/test/migration.int.test.ts`, `artifacts/logs/qa-verify.log`; real dev DB: `artifacts/logs/business-validation.log` (BV-0) |
| TC-A-01, TC-A-02 (platform game-agnostic, no AI call on create) | passed | `pnpm test` | `apps/api/test/architecture.int.test.ts`, `scripts/eslint-boundaries.test.mjs`, `artifacts/logs/qa-verify.log` |
| TC-001..TC-006, TC-E2E-RT-01 | passed | `pnpm e2e` (in verify) | `e2e/game-setup.spec.ts`, `artifacts/logs/qa-verify.log` |
| TC-E2E-HS-01..05 | passed | `pnpm e2e` | `e2e/hot-seat.spec.ts`, `artifacts/logs/qa-verify.log` |
| TC-E2E-PR-01, TC-E2E-CT-01 | passed | `pnpm e2e` | `e2e/session-list.spec.ts`, `artifacts/logs/qa-verify.log` |
| TC-VA-01..13, TC-VA-15 | passed | `pnpm e2e` | `e2e/visual-a11y.spec.ts`, `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-09-keyboard-focus.png` |
| TC-R-01 (SWR-003 e2e regression, migrated to the new wire / `prototype-badge`) | passed | `pnpm e2e` | `e2e/new-game.spec.ts`, `e2e/board-view.spec.ts`, `e2e/phase.spec.ts`, `artifacts/logs/qa-verify.log` (75 passed = 50 old + 25 new) |
| TC-MAN: PO TC-001..TC-006 by hand, keyboard path, hot-seat, D-1 at 1024/768, 375×812, real API outage, backend restart | passed | `pnpm --filter @bga/api run dev` on a scratch copy of dev DB + `pnpm --filter @bga/web run dev`, built-in browser | `artifacts/logs/qa-manual.log` (M-1..M-10) |
| TC-VA-11 / manual contrast («Выбрано», «скоро», prototype badge) | passed | computed-style WCAG check in the browser | `artifacts/logs/qa-manual.log` (M-7) |
| TC-VA-14 (reduced motion) | not_run | — | not executed: no manual reduced-motion check was done in this pass. Reduced motion is only exercised indirectly, because the e2e visual specs run with `reducedMotion: 'reduce'`. The contrast part the brief called TC-VA-14 is done in M-7 |
| SWR-002/003 artifacts and DB files unchanged | passed | `shasum -a 256` before/after | `artifacts/logs/qa-artifacts-sha.log` |
| TC-GATE check-task | passed | `node scripts/check-task.mjs docs/tasks/SWR-004` | `artifacts/logs/qa-check-task.log` |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `e2e/game-setup.spec.ts` (TC-001, TC-E2E-RT-01), `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` (M-1) |
| AC-02 | passed | `e2e/game-setup.spec.ts` (TC-001, RT-01), `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`, `apps/web/src/games/rebellion/setup/model/setupForm.test.ts`, `artifacts/logs/qa-manual.log` (M-1, M-2), `artifacts/screenshots/va-02-new-session-defaults-d.png` |
| AC-03 | passed | `e2e/game-setup.spec.ts` (TC-002), `packages/games/rebellion/test/schema/settings.test.ts`, `apps/api/test/sessions.int.test.ts`, `artifacts/logs/qa-manual.log` (M-2), `artifacts/screenshots/va-03-empire-selected-d.png` |
| AC-04 | passed | `e2e/game-setup.spec.ts` (TC-003), `e2e/new-game.spec.ts` (TC-NEW-06), `packages/games/rebellion/test/schema/setup.test.ts`, `artifacts/logs/qa-manual.log` (M-3), `artifacts/screenshots/va-04-human-selected-d.png` |
| AC-05 | passed | `packages/games/rebellion/test/schema/setup.test.ts`, `apps/api/test/sessions.int.test.ts`, `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`, `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` (BV-6), `artifacts/logs/qa-manual.log` (M-1: disabled options) |
| AC-06 | passed | `apps/api/test/sessions.int.test.ts`, `apps/api/test/sessions-repository.int.test.ts`, `e2e/game-setup.spec.ts` (TC-001: exactly one new session), `artifacts/logs/qa-verify.log` |
| AC-07 | passed | `e2e/game-setup.spec.ts` (TC-001, TC-005), `apps/web/src/games/rebellion/setup/SetupScreen.test.tsx`, `artifacts/logs/qa-manual.log` (M-9: real outage → alert → retry 201), `artifacts/screenshots/va-05-error-state-d.png` |
| AC-08 | passed | `apps/api/test/persistence.int.test.ts` (TC-I-24, new app instance on the same DB file), `e2e/game-setup.spec.ts` (TC-004 reload + fresh context), `artifacts/logs/qa-manual.log` (M-8: API process restarted on the same DB) |
| AC-09 | passed | `e2e/session-list.spec.ts` (TC-E2E-CT-01), `e2e/game-setup.spec.ts` (TC-004), `apps/web/src/platform/game-page/GamePage.test.tsx`, `apps/web/src/games/rebellion/describeSession.test.ts`, `artifacts/screenshots/va-01-game-page-d.png` |
| AC-10 | passed | `e2e/game-setup.spec.ts` (TC-005, TC-006 UI + API), `apps/api/test/idempotency.int.test.ts`, `apps/web/src/platform/sessions/useCreateSession.test.tsx`, `apps/web/src/platform/game-page/GamePage.test.tsx`, `artifacts/logs/qa-manual.log` (M-10) |
| AC-11 | passed | `e2e/visual-a11y.spec.ts` (TC-VA-01..13, 15), `artifacts/logs/qa-manual.log` (M-3, M-5..M-7), `artifacts/screenshots/va-02-new-session-defaults-m.png`, `artifacts/screenshots/va-08-table-1024.png`, `artifacts/screenshots/va-08-table-768-human.png`, `artifacts/screenshots/va-09-keyboard-focus.png` (TC-VA-14 manual not_run — see Executed) |
| AC-12 | passed | `apps/api/test/architecture.int.test.ts`, `scripts/eslint-boundaries.test.mjs`, `artifacts/logs/qa-verify.log` (lint exit 0, check:bundle OK: `board-debug-hook` absent, only definition/schema/board/assets) |
| AC-13 | passed | `e2e/session-list.spec.ts` (TC-E2E-PR-01), `e2e/board-view.spec.ts`, `apps/web/src/games/rebellion/table/TableScreen.test.tsx`, `artifacts/screenshots/va-06-table-prototype-badge-d.png`, `artifacts/logs/qa-manual.log` (M-1) |
| AC-14 | passed | `e2e/hot-seat.spec.ts` (HS-01..05), `apps/api/test/hotseat.int.test.ts`, `apps/web/src/games/rebellion/table/HandoffScreen.test.tsx`, `packages/games/rebellion/test/rules/turn.test.ts`, `artifacts/logs/qa-manual.log` (M-4), `artifacts/screenshots/va-07-handoff-d.png` |
| AC-15 | passed | `apps/api/test/migration-swr004.int.test.ts`, `apps/api/test/upcast-v1.int.test.ts`, `packages/games/rebellion/test/server/upcast.test.ts`, `artifacts/logs/business-validation.log` (BV-0), `artifacts/logs/qa-manual.log` (M-8: 4 upgraded rows listed) |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log` (eslint --max-warnings=0 + prettier --check)
- typecheck: passed — `artifacts/logs/qa-verify.log` (all workspaces + `e2e/tsconfig.json`)
- unit: passed — `artifacts/logs/qa-verify.log` (process 357, platform 64, rebellion 201, forbidden-stars 5, web 255)
- integration: passed — `artifacts/logs/qa-verify.log` (apps/api 181 passed + 1 skipped opt-in `apps/api/test/dev-db-upgrade.int.test.ts`)
- build: passed — `artifacts/logs/qa-verify.log`
- check-bundle: passed — `artifacts/logs/qa-verify.log`
- e2e: passed — `artifacts/logs/qa-verify.log` (75 passed, 2.7m)
- manual: passed — `artifacts/logs/qa-manual.log`
- visual-a11y: passed — `e2e/visual-a11y.spec.ts`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` (M-7)
- reduced-motion-manual (TC-VA-14): not_run — not executed in this pass (only indirectly via e2e `reducedMotion: 'reduce'`)
- artifacts-unchanged: passed — `artifacts/logs/qa-artifacts-sha.log`
- check-task: passed — `artifacts/logs/qa-check-task.log`

The `pnpm verify` e2e run (08:47–08:48 local) wrote these screenshots from the final code into `artifacts/screenshots/`:
`va-01-game-page-{d,m}.png`, `va-02-new-session-defaults-{d,m}.png`, `va-02-new-session-defaults-en-d.png`,
`va-03-empire-selected-{d,m}.png`, `va-04-human-selected-{d,m}.png`, `va-05-error-state-{d,m}.png`,
`va-06-table-prototype-badge-{d,m}.png`, `va-07-handoff-{d,m}.png`, `va-08-table-1024.png`, `va-08-table-1024-human.png`,
`va-08-table-768.png`, `va-08-table-768-human.png`, `va-09-keyboard-focus.png` (20 files). SWR-003 screenshots went to the untracked
`test-results/screenshots/SWR-003/`. No test failed, so there are no Playwright traces (`artifacts/playwright-traces/` holds only `.gitkeep`).

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| — | — | No SWR-004 defects found | — | — | — |

Observations (not defects, no AC impact; for frontend-lead): O-1: at 1440×900 the human-game top bar wraps into 2 rows. Plan-frontend §5.5
shows one row at ≥1200; there is no overflow or overlap. O-2: at 768/1024 "fit" does not show the whole map. This board zoom behaviour predates SWR-004 (`artifacts/logs/qa-manual.log`).
