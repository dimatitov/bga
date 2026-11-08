# QA results — SWR-003

QA Lead, 2026-11-08, QA_EXECUTION on the final code (after INTEGRATION, CODE_REVIEW approved, BUSINESS_VALIDATION passed;
including the late changes: «только что» relative time, `adding-a-game.md` §10/§11, ESLint message text).
e2e specs were written by QA (`e2e/**`, owned file per Decisions R-3) — no product code was changed by QA.
No e2e spec asserted Intl relative-time text, so the «только что» change needed no e2e update.

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-GATE-01..07 (lint, typecheck incl. e2e, test, build, check:bundle, e2e, verify) | passed | `pnpm verify` | `artifacts/logs/qa-verify.log` (exit=0) |
| TC-GATE-03 test counts | passed | `pnpm test` (in verify) | `artifacts/logs/qa-verify.log`: process 357/0 fail; platform 32; game-rebellion 115; game-forbidden-stars 5; apps/api 94 (9 files); apps/web 173 |
| TC-GATE-06 e2e (50 = SWR-002 base 37 + 13 new) | passed | `pnpm e2e` (in verify) | `artifacts/logs/qa-verify.log` («50 passed (1.8m)») |
| TC-CAT-01..09, TC-GP-01..10, 12, TC-NEW-01..04, TC-HOST-01..06, TC-EXT (web) | passed | `pnpm test` (apps/web, in verify) | `apps/web/src/platform/catalog/CatalogPage.test.tsx`, `apps/web/src/platform/game-page/GamePage.test.tsx`, `apps/web/src/platform/session-host/SessionHost.test.tsx`, `apps/web/src/platform/extensibility.test.tsx`, `artifacts/logs/qa-verify.log` |
| TC-SES-*, TC-GP-11, TC-EXT (api), TC-MIG-01..06 | passed | `pnpm test` (apps/api, in verify) | `apps/api/test/sessions.int.test.ts`, `apps/api/test/game-registry.int.test.ts`, `apps/api/test/migration.int.test.ts`, `artifacts/logs/qa-verify.log` |
| TC-MIG-07 (real dev DB) | passed | W-API copy check + BV-0 | `artifacts/logs/wapi-migration-copy.log`, `artifacts/logs/business-validation.log` |
| TC-CAT-10..12, TC-GP-13..18, TC-NEW-05..07, TC-HOST-07..08, TC-FS-05, TC-E2E-01..34 (migrated) | passed | `pnpm e2e` (in verify) | `e2e/catalog.spec.ts`, `e2e/game-page.spec.ts`, `e2e/persistence.spec.ts`, `artifacts/logs/qa-verify.log` |
| TC-FS-01..03 | passed | `pnpm test` | `packages/games/forbidden-stars/test/package-shape.test.ts`, `artifacts/logs/qa-verify.log` |
| TC-EXT-09..12, TC-ARCH-02 (ESLint boundaries as tests, TR-7) | passed | `pnpm test` (test:process) | `scripts/eslint-boundaries.test.mjs`, `artifacts/logs/qa-verify.log` |
| TC-ARCH-06..08 (check:bundle, module composition) | passed | `pnpm check:bundle` (in verify) | `artifacts/logs/qa-verify.log` («only definition/schema/board/assets») |
| TC-ARCH-01, 03, 04, 05 (static greps) | passed | grep, see log | `artifacts/logs/qa-arch-check.log` |
| TC-EXT-13, TC-DOC-01 (paths in adding-a-game.md exist) | passed | path check script, see log | `artifacts/logs/qa-doc-check.log` |
| TC-MAN-01 (mouse walkthrough, ru/en, settings key migration Q-22) | passed | `pnpm dev` on a copy of dev DB, built-in browser | `artifacts/logs/qa-manual.log` (M-1..M-9) |
| TC-MAN-02 (keyboard) | passed | built-in browser | `artifacts/logs/qa-manual.log` (M-10) |
| TC-MAN-03 (1024×768, 768×1024) | passed | built-in browser | `artifacts/logs/qa-manual.log` (M-11; catalog/game page OK; table top bar overflow = D-1, pre-existing) |
| TC-MAN-04 (e2e in parallel with `pnpm dev`) | not_run | — | not executed: verify and dev were run sequentially to keep ports/builds independent; e2e uses own ports/DB by design (A-17) |
| TC-FS-04 (covers are own abstract SVGs) | passed | visual inspection | `artifacts/screenshots/01-catalog.png`, `artifacts/screenshots/04-game-page-coming-soon.png` |
| TC-GATE-08 check-task | passed | `node scripts/check-task.mjs docs/tasks/SWR-003` | `artifacts/logs/qa-check-task.log` |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `e2e/catalog.spec.ts` (TC-CAT-10..12), `apps/web/src/platform/catalog/CatalogPage.test.tsx`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log`, `artifacts/screenshots/01-catalog.png`, `artifacts/screenshots/01b-catalog-en.png` |
| AC-2 | passed | `e2e/catalog.spec.ts` (TC-GP-16, TC-GP-17), `e2e/00-empty-db.spec.ts` (TC-GP-13), `e2e/game-page.spec.ts` (TC-GP-18), `artifacts/logs/qa-verify.log`, `artifacts/screenshots/04-game-page-coming-soon.png`, `artifacts/screenshots/07-game-not-found.png` |
| AC-3 | passed | `e2e/new-game.spec.ts`, `e2e/move.spec.ts`, `e2e/phase.spec.ts`, `e2e/game-page.spec.ts` (TC-HOST-07/08), all SWR-002 e2e migrated and green — `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` (M-5..M-7), `artifacts/screenshots/06-session-table.png` |
| AC-4 | passed | `e2e/persistence.spec.ts` (TC-E2E-22, TC-GP-14, TC-GP-15), `apps/web/src/platform/game-page/GamePage.test.tsx`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` (M-7, M-8), `artifacts/screenshots/03-game-page-with-sessions.png` |
| AC-5 | passed | (а) `apps/api/test/game-registry.int.test.ts`; (б) `apps/web/src/platform/extensibility.test.tsx`; (в) `scripts/eslint-boundaries.test.mjs`; (г) `docs/architecture/adding-a-game.md` + `artifacts/logs/qa-doc-check.log`; all run in `artifacts/logs/qa-verify.log`; reviewer's scratch dummy game — `review.md` |
| AC-6 | passed | `packages/games/forbidden-stars/test/package-shape.test.ts`, `e2e/catalog.spec.ts` (TC-FS-05: 422 `GAME_UNAVAILABLE`), `apps/api/test/game-registry.int.test.ts`, `artifacts/logs/qa-verify.log` |
| AC-7 | passed | `apps/api/test/sessions.int.test.ts`, `apps/api/test/migration.int.test.ts`, `artifacts/logs/wapi-migration-copy.log`, `artifacts/logs/business-validation.log` (BV-0), `artifacts/logs/qa-verify.log` |
| AC-8 | passed | `artifacts/logs/qa-verify.log` (`pnpm verify` exit=0: lint, typecheck, test, build, check:bundle, e2e 50/50); `artifacts/logs/qa-check-task.log` |
| AC-9 | passed | `artifacts/logs/qa-arch-check.log` (no computed imports/require/readdir, registries are plain arrays, 6 routes, no admin/plugins), `scripts/eslint-boundaries.test.mjs`, `artifacts/logs/qa-verify.log` |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log` (eslint --max-warnings=0 + prettier --check)
- typecheck: passed — `artifacts/logs/qa-verify.log` (incl. `e2e/tsconfig.json`)
- unit: passed — `artifacts/logs/qa-verify.log` (process 357, platform 32, rebellion 115, forbidden-stars 5, web 173)
- integration: passed — `artifacts/logs/qa-verify.log` (apps/api 94 tests, 9 files)
- build: passed — `artifacts/logs/qa-verify.log`
- check-bundle: passed — `artifacts/logs/qa-verify.log`
- e2e: passed — `artifacts/logs/qa-verify.log` (50 passed)
- manual-browser: passed — `artifacts/logs/qa-manual.log`
- architecture-static: passed — `artifacts/logs/qa-arch-check.log`
- docs-paths: passed — `artifacts/logs/qa-doc-check.log`
- e2e-parallel-with-dev (TC-MAN-04): not_run — run sequentially on purpose (see Executed)
- check-task: passed — `artifacts/logs/qa-check-task.log` (`OK docs/tasks/SWR-003`, exit=0)

Screenshots (final code, written by the `pnpm verify` e2e run at 2026-11-08 06:30–06:32 local) in `artifacts/screenshots/`:
`01-catalog.png`, `01b-catalog-en.png`, `02-game-page-empty.png`, `03-game-page-with-sessions.png` (shows «только что»),
`04-game-page-coming-soon.png`, `04b-new-session-coming-soon.png`, `05-new-session.png`, `06-session-table.png`,
`07-game-not-found.png`, `08-session-not-found.png`, `09-catalog-keyboard-focus.png`, `table-04-board-initial.png` …
`table-15-keyboard-focus.png` (13 files). SWR-002 screenshots unchanged: `git status --short docs/tasks/SWR-002` is empty.
User's dev DB and backup unchanged by QA (sha256 equal before/after, see `artifacts/logs/qa-manual.log`).

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-1 | minor | `pnpm dev`; open `/sessions/:id` at 1024×768 or 768×1024 | top bar of the table fits or wraps gracefully | top bar overflows its own box (scrollWidth 1087 vs 1009 px at 1024): «К игре» wraps to 2 lines, «Автосохранено» and the settings button are only reachable by scrolling the bar horizontally; no page-level h-scroll | open — pre-existing SWR-002 layout (`overflowX: 'auto'`), only the label changed «Меню» → «К игре»; not blocking, candidate for a later UX task |
| D-2 | minor (nit) | `grep -n @swr apps/api/.env` | no stale `@swr/` references | line 1 comment mentions `@swr/api` — user's local git-ignored `.env` generated before the rename; repo template is fine | open — informational, nothing to change in the repo |
