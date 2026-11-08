# QA results — SWR-005

QA Lead, QA_EXECUTION, 2026-11-08 (16:31–16:55 UTC). Code: working tree after INTEGRATION + review round 3 (`review.md`
verdict `approved`). QA did not write product code. The only code QA changed in this stage is the e2e assertion TC-E-04
(see «Changes made by QA»). Everything marked `passed` below has a log I produced in this stage, unless the row says
otherwise (cited evidence from other roles is labelled with who ran it).

## Runs in this stage (by qa-lead)

| Run | Command | Result | Log |
|---|---|---|---|
| R1 — full gate | `pnpm verify` (ports 3000/5173/3100/5174 free, nothing else running) | **EXIT_CODE=0**, 7m20s, no reruns needed | `artifacts/logs/qa-verify.log` |
| R2 — TC-E-04 tightened | eslint + prettier + `tsc -p e2e/tsconfig.json` on the spec, then the full e2e suite (the args after `pnpm e2e --` were not forwarded, so the whole suite ran), then `playwright test e2e/core-hidden-base.spec.ts --repeat-each=3` | lint/tsc OK; full e2e **106 passed**; targeted **6/6 passed**; EXIT_CODE=0 | `artifacts/logs/qa-e2e-tce04.log` |
| R3 — manual-style check | `PORT=3000 DATABASE_URL=file:<scratch copy> pnpm dev` + a scripted Chromium walkthrough, keyboard only | 0 failed checks; real `dev.db` sha256 unchanged | `artifacts/logs/qa-manual.log` |
| R4 — opt-in dev-DB test (TR-8) | `SWR005_DEV_DB=<copy> pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts` on 2 copies | A (copy of `dev.pre-swr005.db`): **1 passed**; B (copy of current `dev.db`): **1 failed** → D-QA-1 | `artifacts/logs/qa-dev-db-upgrade.log` |
| R5 — static checks | grep/ls/git on docs, assets, screenshot routing | see log | `artifacts/logs/qa-static-checks.log` |
| R6 — SWR-002..004 artifacts | sha256 of every file in `docs/tasks/SWR-00{2,3,4}/**`, before R1 and after R1–R4 | 242 files, **identical**; `git status` clean | `artifacts/logs/qa-artifacts-sha.log` |
| R7 — task check | `node scripts/check-task.mjs docs/tasks/SWR-005` | exit 0 | `artifacts/logs/qa-check-task.log` |

R1 counts (`qa-verify.log`): lint passed (`eslint --max-warnings=0`, «All matched files use Prettier code style!»); typecheck
passed (5 packages/apps + e2e); `node --test scripts/` 369/369; platform 65/65; forbidden-stars 5/5; rebellion 43 files /
411 tests; web 58 files / 480 tests; api 26 files + 1 skipped / 221 passed + 1 skipped (the skipped one is the opt-in dev-DB
test); build passed; `check:bundle` OK (6 rules; modules: only definition/schema/board/assets, 23 game modules); e2e
**106 passed** (4.7 min), with no retries or flakes. The Nest `ERROR … status=500` lines in the api section come from negative tests
that expect a 500 (corrupt state, injected failures). They are not failures.

## Executed

| TC | Status | Command | Evidence |
|---|---|---|---|
| §1 TC-D-01..TC-D-18 data and start position (AC-01, AC-02) | passed | `pnpm verify` (rebellion vitest: `test/scenario/core-data.test.ts`, `test/rules/core/{create,base}.test.ts`, `test/schema/data.test.ts`) | `artifacts/logs/qa-verify.log` |
| TC-A-10 manual reconciliation of the data with `rebellion-reference.md` | not_run | — (QA did not re-reconcile by hand; the counts are covered automatically by §1, and the PO cross-check against the box is open per A-1) | — |
| §2 TC-U-01..TC-U-20 round, phases, turn order (AC-03, AC-06) | passed | `pnpm verify` (rebellion `test/rules/core/turn-flow.test.ts`, `dispatch.test.ts`, `invariants.test.ts`) | `artifacts/logs/qa-verify.log` |
| §3 TC-U-21..TC-U-31 (incl. 26a, 26b, 30a) ACTIVATE_SYSTEM (AC-04) | passed | `pnpm verify` (rebellion `test/rules/core/activate.test.ts`; api `core-commands.int.test.ts`) | `artifacts/logs/qa-verify.log` |
| §4 TC-U-32..TC-U-56 (incl. 46a–d, 47a) MOVE_PIECES (AC-05) | passed | `pnpm verify` (rebellion `test/rules/core/move.test.ts`; api `core-commands.int.test.ts`) | `artifacts/logs/qa-verify.log` |
| §5 TC-U-57..TC-U-69 reveal and victories (AC-07, AC-10) | passed | `pnpm verify` (rebellion `test/rules/core/{reveal,victory}.test.ts`; api `core-victory.int.test.ts`) | `artifacts/logs/qa-verify.log` |
| §6 TC-H-01..TC-H-18 hidden information, adversarial (AC-10) | passed | `pnpm verify` (rebellion `test/rules/core/hidden-info.test.ts`, `test/server/base-invariance.test.ts`, `test/schema/web-safe-no-base-choice.test.ts`; api `hidden-info-core.int.test.ts`, `core-hotseat.int.test.ts`; `check:bundle`) | `artifacts/logs/qa-verify.log`; the scan statistics come from W6b's run, `artifacts/logs/hidden-info-scan.log` (backend-worker, not rerun separately by QA; the same test file is green in R1) |
| §7 TC-AI-01..TC-AI-17 (incl. 07a) AI auto-pass (AC-08) | passed | `pnpm verify` (rebellion `test/ai/auto-pass.test.ts`, `test/server/{auto-play,auto-play-fault,server-module}.test.ts`; api `core-ai-autopass.int.test.ts`) | `artifacts/logs/qa-verify.log` |
| §8 TC-HS-01..TC-HS-11 (incl. 05a) hot-seat (AC-09) | passed | `pnpm verify` (api `core-hotseat.int.test.ts`; rebellion `turn-flow.test.ts`) | `artifacts/logs/qa-verify.log` |
| §9 TC-G-01..TC-G-07 golden / scripted game (AC-14) | passed | `pnpm verify` (rebellion `test/server/golden.test.ts`, fixtures `test/fixtures/core/**`) | `artifacts/logs/qa-verify.log` |
| §10 TC-P-01..TC-P-09 platform status (AC-07, AC-13) | passed | `pnpm verify` (platform 65 incl. `test/sessions.test.ts`; api `core-victory.int.test.ts`, `sessions-repository.int.test.ts`, `architecture.int.test.ts`) | `artifacts/logs/qa-verify.log` |
| §11 TC-M-01..TC-M-09, TC-M-12..TC-M-14 legacy / upcast (AC-11) | passed | `pnpm verify` (rebellion `test/server/upcast.test.ts`; api `upcast-v1`, `upcast-v2`, `migration*`, `rebellion-contract`, `hotseat` int tests) | `artifacts/logs/qa-verify.log` |
| TC-M-10 opt-in dev-DB upgrade (TR-8) | passed (pre-SWR-005 copy) / failed (current dev.db copy) | R4 | `artifacts/logs/qa-dev-db-upgrade.log` (D-QA-1). W6b's earlier run on the real DB is in `artifacts/logs/dev-db-copy.log` (backend-worker) |
| TC-M-11 backup `dev.pre-swr005.db` before migration | passed (cited) | done by Analyst/W6b; sha256 `de7e1f86…efbefd1` re-checked by QA in R4 | `artifacts/logs/dev-db-backup.log`, `artifacts/logs/qa-dev-db-upgrade.log` |
| §12 TC-C-01..TC-C-19 web component / unit (AC-07, AC-08, AC-10..AC-13) | passed | `pnpm verify` (web 58 files / 480 tests) | `artifacts/logs/qa-verify.log` |
| §13 TC-E-01..TC-E-14 e2e scenarios 1–6 (AC-01, AC-03..AC-13) | passed | `pnpm verify` (e2e `core-turn`, `core-hidden-base`, `core-victory`, `core-fit`, `hot-seat`, `legacy` specs) | `artifacts/logs/qa-verify.log`; TC-E-04 after tightening: `artifacts/logs/qa-e2e-tce04.log` |
| TC-E-15 / TC-R-01 / TC-R-07 e2e regression (rewritten old specs) | passed | `pnpm verify` | `artifacts/logs/qa-verify.log` (106 = 75 old titles, all kept or replaced as in the table below, + new) |
| §14 TC-VA-01..TC-VA-14 visual and a11y (screenshots, layout, focus, contrast, roles, assets) | passed | `pnpm verify` (`e2e/core-visual-a11y.spec.ts`; TC-VA-05 runs inside the «TC-VA-04/05 + TC-VA-12» test, TC-VA-08/09 inside «TC-VA-07/08/09») | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/01-core-fit-1440x900.png` … `18-core-fit-1440-en.png` (regenerated by R1/R2; QA looked at 03 and 13 by eye) |
| TC-A-01..TC-A-03 architecture boundaries, bundle | passed | `pnpm verify` (eslint boundaries, `scripts/eslint-boundaries.test.mjs`, `scripts/check-web-bundle.test.mjs`, `check:bundle`) | `artifacts/logs/qa-verify.log` |
| TC-A-04, TC-A-05 docs (AC-15) | passed | QA read `docs/game-rules/rebellion-core-v1.md` (rules in own words, D-1..D-7, link to sources in `rebellion-reference.md`); grep/diff of `docs/architecture/{application,adding-a-game}.md` | `artifacts/logs/qa-static-checks.log`, `docs/game-rules/rebellion-core-v1.md` |
| TC-A-06 no scans/art (PO-1) | passed | `git status` for new `*.png/jpg/webp/pdf/gif` in `packages/ apps/ docs/game-rules/` → none | `artifacts/logs/qa-static-checks.log` |
| TC-A-07 screenshot routing | passed | `CURRENT_SCREENSHOT_TASK = 'SWR-005'`; SWR-002..004 unchanged after 2 full e2e runs | `artifacts/logs/qa-static-checks.log`, `artifacts/logs/qa-artifacts-sha.log` |
| TC-A-08 gate `pnpm verify` | passed | R1 | `artifacts/logs/qa-verify.log` |
| TC-A-09 gate check-task | passed | R7 | `artifacts/logs/qa-check-task.log` |
| TC-A-11 `node --test scripts/` | passed | part of R1 (`test:process`): 369/369 | `artifacts/logs/qa-verify.log` |
| TC-A-12 manual browser-qa scenarios 1, 2, 6 | passed (partly cited) | scenario 1 keyboard-only full turn + scenario 2 Empire hidden zone: QA scripted walkthrough R3. Scenario 6 legacy: not repeated by QA, cited from Analyst BV-0 | `artifacts/logs/qa-manual.log`; `artifacts/logs/business-validation.log` (Analyst, live app) |
| §16 TC-R-02 test counts vs SWR-004 baseline | passed | R1 | api 221 ≥ 181, web 480 ≥ 255, rebellion 411 ≥ 201, platform 65 ≥ 64, process 369 ≥ 357, forbidden-stars 5 ≥ 5 — `artifacts/logs/qa-verify.log` |
| TC-R-03..TC-R-06, TC-R-08 SWR-004 regression on seeded mock-v1 rows | passed | `pnpm verify` (api `hotseat`, `concurrency`, `hidden-info`, `idempotency`, `migration*`, `upcast-v1`, `sessions` int tests) | `artifacts/logs/qa-verify.log` |

Per-TC traceability is by test file. Not every TC id from `test-cases.md` appears literally in a test title, because workers
named some tests by behaviour. QA did not audit each of the 246 ids against a test one by one.

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

AC-11 note: the AC behaviour is green. D-QA-1 is a limitation of the opt-in test itself and does not affect the product.

## Verification
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (process 369, platform 65, forbidden-stars 5, rebellion 411, web 480)
- integration: passed — `artifacts/logs/qa-verify.log` (api 221 passed, 1 skipped = opt-in dev-DB test)
- integration (opt-in dev-DB, TR-8): failed — `artifacts/logs/qa-dev-db-upgrade.log` (passes on the pre-SWR-005 copy, fails on a copy of the current dev.db: D-QA-1, test-only)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (check-web-bundle OK, module check OK)
- e2e: passed — `artifacts/logs/qa-verify.log` (106 passed), `artifacts/logs/qa-e2e-tce04.log`
- manual: passed — `artifacts/logs/qa-manual.log` (qa-lead, scripted keyboard-only Chromium on `pnpm dev` with a scratch DB copy); `artifacts/logs/business-validation.log` (Analyst, live app, BV-0..BV-9)
- task check: passed — `artifacts/logs/qa-check-task.log`
- SWR-002..004 artifacts unchanged: passed — `artifacts/logs/qa-artifacts-sha.log`

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-QA-1 | minor (test-only, not in `pnpm verify`) | `cp apps/api/prisma/dev.db <copy>`; `SWR005_DEV_DB=<copy> pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts` (the file header suggests `SWR005_DEV_DB=prisma/dev.db`) | the opt-in upgrade check passes on any dev DB: legacy rows stay `mock-v1`, and rows created by SWR-005 (`core-v1`) are skipped or checked separately | `AssertionError: bf6ad3fd-…: expected 'core-v1' to be 'mock-v1'`: the test asserts **every** row is `mock-v1`, so it fails on any DB that has SWR-005 sessions (the user's dev.db has 3 since BV). It passes on the pre-SWR-005 backup copy. Product behaviour is correct. | open — owner backend-lead (test `apps/api/test/dev-db-upgrade.int.test.ts`, outside QA files); can be a known issue / next task |
| D-1 | minor (a11y; severity assigned retroactively by QA — not recorded when found in the QA e2e stage) | core table → «Пас» | dialog opens with focus on «Отмена» (plan-frontend §5.3) | MUI FocusTrap moved focus to the dialog surface | fixed on INTEGRATION (frontend-lead, `PassConfirmDialog.tsx`); retested green in R1 (TC-E-10, TC-VA-11) and R3 («initial focus on «Отмена»») |
| D-2 | minor (a11y; retroactive) | PASS / FINISH_ACTIVATION that ends the game | focus stays on `game-over-title` | focus jumped to `core-turn-title` | fixed on INTEGRATION (`useTurnCommands.ts`, + MOVE_PIECES per review #4); retested green in R1 (TC-E-07, TC-VA-06) |
| D-3 | minor (a11y; retroactive) | Space/Enter on a leader in the pool | leader armed once | double toggle (keydown handler + ButtonBase click) | fixed on INTEGRATION (`LeaderPool.tsx`); retested green in R1 (TC-E-10) and R3 |

Observations (not defects; no action required by the gate):
- O-1: the `e2e/screenshots.spec.ts` header says the SWR-005 screenshots are taken by `core-screenshots.spec.ts`, but they are
  actually taken by `e2e/core-visual-a11y.spec.ts`. The comment is stale; QA left it because it is outside this stage's e2e scope.
- O-2: the `docs/game-rules/rebellion-core-v1.md` header still says «реализуется в SWR-005». Wording nit for the doc owner.
- O-3: the game-over banner covers the top-left part of the map (design decision P1 «OutcomeBanner над картой»;
  `artifacts/screenshots/13-game-over-rebels.png`). Map and log stay viewable, and the banner can be dismissed with «К игре».

## Changes made by QA in this stage
- `e2e/core-hidden-base.spec.ts` (TC-E-04): the comment is updated (the base can no longer be Bothawui) and a new assertion is added:
  `expect(zoneUnits, 'hidden zone = exactly the 6 «on base» units').toHaveLength(6)`. The test title is updated to match. The
  earlier assertion «composition = stored state» is kept. Rerun: `artifacts/logs/qa-e2e-tce04.log`.
- `test-cases.md`: Q-35..Q-41 are marked resolved, with links to the spec Clarifications. The agreed QA_EXECUTION adjustments are recorded
  (TC-E-04 is exactly 6 after review #1; TC-E-06/08 scope).

## Replacement table: old SWR-002..004 tests → SWR-005
Rule (Clarifications Q-1): generic tests are rewritten on `core-v1`, and mock-rules behaviour becomes regression tests on seeded
legacy rows. No old test was deleted without a replacement. Sources: the old/new e2e test titles (`git show HEAD:e2e/*` vs the
working tree), the W6a/W6b/W5 rows of the `implementation-plan.md` log, and `git diff HEAD` of the test files.

### e2e (Playwright) — 75 old titles in HEAD
| Old test (spec) | New test | Change |
|---|---|---|
| TC-E2E-06 table renders the mock scenario (`board-view`) | TC-E2E-06 (core-v1): base-game galaxy from PlayerView | rewritten on core-v1 |
| TC-E2E-13 click system → panel (`selection`) | TC-E2E-13 (core-v1) | rewritten on core-v1 |
| TC-E2E-14 own piece → exactly its legal moves (`selection`) | TC-E2E-14 (core-v1): own unit → panel; armed leader → exactly server targets; activation → exactly server move sources | rewritten, assertion widened |
| TC-E2E-15 enemy pieces offer no commands (`selection`) | TC-E2E-15 (core-v1): enemy units and the hidden zone offer no commands | rewritten |
| TC-E2E-16 background click / Esc clear selection (`selection`) | TC-E2E-16 (core-v1) + Esc first drops an armed leader | rewritten, widened |
| TC-E2E-12 drag on a piece does not pan (`zoom-pan`) | TC-E2E-12: drag started on a movable unit does not pan | rewritten on core-v1; other zoom-pan tests kept (fit of 32 systems = TC-E-12) |
| TC-E2E-28 keyboard-only select + move (`keyboard`) | TC-E2E-28 (core-v1): arm leader, select system in object list, activate; full keyboard turn = TC-E-10 | rewritten |
| TC-E2E-22 reload restores state (`persistence`) | TC-E2E-22 (core-v1): activation + move, reload | rewritten |
| TC-GP-14 (was TC-E2E-23) Continue opens latest (`persistence`) | TC-GP-14 (core-v1, was TC-E2E-23) | rewritten; TC-GP-15 unchanged title |
| TC-E2E-30 + TC-E2E-31 Empire leaks no secrets (`architecture`) | TC-E2E-30 + TC-E2E-31 (core-v1), + TR-3 base-id check | rewritten, stronger |
| TC-E2E-HS-01 «Pass the turn» → handoff (`hot-seat`) | TC-E2E-HS-01 (core-v1): finish activation → handoff; mock variant TC-E2E-HS-M1 on a seeded legacy row | rewritten + mock regression |
| TC-E2E-HS-02 reload during handoff | TC-E2E-HS-02 (core-v1) | rewritten |
| TC-E2E-HS-03 «I am the Empire» → Empire table | TC-E2E-HS-03 (core-v1) incl. armed leader reset | rewritten |
| TC-E2E-HS-04 inactive side / handoff commands → 422 | TC-E2E-HS-04 (core-v1); mock variant TC-E2E-HS-M2 (seeded) | rewritten + mock regression |
| TC-E2E-HS-05 AI game: no «pass the turn»; END_TURN/ACCEPT_HANDOFF → 422 handoffNotAvailable | TC-E2E-HS-05 (core-v1): END_TURN → 422 commandUnavailable, ACCEPT_HANDOFF → 422 handoffNotAvailable | rewritten (expected key per spec Q-2) |
| `move.spec` (TC-E2E mock moves), `phase.spec` (ADVANCE_PHASE), `screenshots.spec` table walk | same titles | now run on a SEEDED legacy v2 row (`support/seed.ts`); expectations unchanged |
| `new-game`, `game-setup` (TC-001..006), `session-list`, `settings`, `visual-a11y` (SWR-004 TC-VA) | same titles | adapted to core-v1 tables (core header, auto-pass at creation, «Prototype» unless completed); SWR-004 PNGs routed to `test-results/`, not rewritten |
| all other old titles (`00-empty-db`, `catalog`, `game-page`, `smoke`, remaining zoom-pan/persistence) | unchanged | — |
| — | NEW: TC-E-01..TC-E-14 (`core-turn`, `core-hidden-base`, `core-victory`, `core-fit`, `legacy`, `hot-seat` TC-E-05), TC-VA-01..14 (`core-visual-a11y`) | new |

### api / package tests (W6a, W6b, W5, W4)
| Old test | New test | Change |
|---|---|---|
| `commands.int` TC-API-14/16 (+ the whole TC-SES-12 block) on a POST-created session | same ids, «seeded mock-v1 row», «version + 1» / «V0 + 1» | moved to seeded rows (W6a) |
| `hotseat.int` hot-seat block, TC-I-31 | same, «seeded mock-v1 row»; core hot-seat = new `core-hotseat.int` | moved (W6a) + new (W6b) |
| `hidden-info.int` TC-API-11/12/13 | TC-API-11 (creation, engine-independent) + TC-API-11/12/13 on seeded mock-v1 rows; core = new `hidden-info-core.int` (TC-H-13 scan) | split + moved (W6a), new (W6b) |
| `persistence.int` «app#2 returns the same view» | seeded row after move + ADVANCE_PHASE; + new-session variant (engine-independent) | moved + added (W6a) |
| `sessions.int` TC-SES-01, TC-SES-11 | TC-SES-01 (settings, base visible) + TC-SES-01/07/08/11/18 (seeded) | split + moved (W6a); TC-SES-01 seq/version fixed by W6b |
| `concurrency.int` TC-API-20 | same, seeded mock-v1 rows | moved (W6a) |
| `rebellion-contract.int` TC-I-38, TC-I-35 | TC-I-38 (creation) + TC-I-38/TC-M-14 (commands, seeded); TC-I-35 (creation) + TC-I-35 (commands, seeded); TC-I-01 initial events of core-v1 (W6b) | split + moved |
| `settings-source.int` «a command keeps setup equal» (ADVANCE_PHASE on POST session) | «new session: setup = toStoredSetup» + review #1 block on `SEEDED.empireAi` | moved (W5) |
| `upcast-v1.int` «snapshot written as v2» | «written as v3 mock-v1» | expectation updated to schema v3 |
| `migration.int` TC-MIG-01..05 | same, per-test timeout 60 s | timeout only (review-fix BE) |
| `sessions-repository.int` «commit keeps status untouched» | «commit writes status with state and setup» + rollback-of-status test | contract change W4 (statusOf) |
| `game-registry.int` «version 1» | «version ≥ 1 (AM-BE-2) … statusOf is a SessionStatus» | contract change W4 |
| `dev-db-upgrade.int` (SWR004_DEV_DB, v2 factions) | TC-M-10 (SWR005_DEV_DB, alias kept): every row on mock-v1 | rewritten (W6b) — see D-QA-1 |
| rebellion `server-module.test` determinism / 400→409→422 / AI view / hot-seat END_TURN / summarize | core-v1 determinism (Q-24), applyCommand core-v1 + auto-pass, toPlayerView zone, hot-seat PASS → 8-key handoff, summarize + rulesEngine/winner/reputation; mock-v1 block for stored v2 rows | rewritten on core-v1 + mock regression (W5) |
| rebellion `schemas.test` handoff strict 7 keys; LegalActionSchema union | 8 keys incl. `rulesEngine` (Q-38); MockLegalActionSchema union | contract change (AM-FE-8) |
| rebellion `turn.test` TC-U-24 handoff 7 keys | TC-U-24 with `rulesEngine` (8 keys) | contract change |
| rebellion `upcast.test` «next command writes v2» | «writes v3 mock-v1» | schema v3 |
