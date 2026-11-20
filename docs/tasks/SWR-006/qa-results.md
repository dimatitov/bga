# QA results — SWR-006

QA_EXECUTION, qa-lead, 2026-11-20 (09:40–10:00 UTC; final gate update 10:50 UTC). Code = working tree after INTEGRATION, CODE_REVIEW round 2 (`approved`),
BUSINESS_VALIDATION (pre-QA in `acceptance.md`) and the BV-1 fix. QA did not change product code. **QA made no real OpenAI request.**
The only live request (TC-LIVE-01, AC-12) was made by the Analyst in BUSINESS_VALIDATION (BV-B).

QA changed test code only:
- NEW `apps/api/test/automation-f3-coverage.int.test.ts`: 5 tests for review F-3 (TC-OA-14 ×2, TC-OA-19, TC-OA-20, TC-RS-05).
- `e2e/ai-commander.spec.ts:171`: the doc comment of `activateViaApi` is reworded (BV-1 note). The old text was "the AI does not move in this response". The new text says the server runs no AI Commander steps in this response (`automation` equals BOT_NO_STEPS). Comment only, no code change.

## Final gate (green): `pnpm verify` EXIT=0

I checked every fact below in the logs myself: the `EXIT=` lines and the Vitest/Playwright counts.

| Run | Tree | Result (from the log) |
|---|---|---|
| `artifacts/logs/qa-verify.log` (history, 09:47Z) | shared main checkout with SWR-005C work in progress | EXIT=1: prettier on 9 untracked SWR-005C `knowledge` files (D-2) |
| `artifacts/logs/qa-verify-stages.log` (history) | same | all stages green except prettier (same 9 files); e2e 136/136 |
| `artifacts/logs/gate-verify-run1.log` | clean worktree: HEAD c1ace26 + SWR-006 files only | EXIT=1: api 1 failed / 603 passed + 1 skipped. Only `migration-swr004.int.test.ts` TC-M-01 failed, «Test timed out in 60000ms» |
| `artifacts/logs/gate-verify-run2.log` | same | EXIT=1: web `src/app/router.test.tsx` (wait for the lazy Rebellion table) 1 failed / 597 passed. In the same parallel step, api `settings-source.int` and `hotseat.int` each had 1 test over 60 s (74 s, 67 s) |
| `artifacts/logs/gate-verify-run3.log` | same (load average ~54 at the start) | EXIT=1: api `migration-swr004.int` TC-M-01 and `settings-source.int` timed out at 60 s; web 598/598 |
| `artifacts/logs/gate-stages.log` | same (load average ~96) | api alone 66 files, 604 passed + 1 skipped; build and check:bundle OK; e2e did not start: port 3100 was already in use (another session), STAGE_EXIT=1 |
| `artifacts/logs/gate-verify-final.log` | clean worktree, ports free for 60 s | **EXIT=0**: scripts 449/449, platform 95, forbidden-stars 5, rebellion 510, web 598, api 604 + 1 skipped, check:bundle 0 findings / 821 sources, e2e **136 passed** |
| `artifacts/logs/gate-verify-on-head.log` | main checkout at HEAD 236fe54 (SWR-005C committed) + uncommitted SWR-006 | **EXIT=0**: prettier «All matched files use Prettier code style!», scripts 449/449, platform 230, forbidden-stars 5, rebellion 606, web 598, api 604 + 1 skipped, check:bundle OK, e2e **136 passed** |

Runs 1–3 failed only on timeouts under heavy external load (load average 50–96, from another project).
Every failing test is old (SWR-003/004: `migration-swr004`, `settings-source`, `hotseat`, `router.test`), and SWR-006 did not change any of them. None was an assertion failure.
- QA re-ran the three api files alone at load average ~7: 3 files, 17 passed, EXIT=0 (`artifacts/logs/qa-load-flakes-alone.log`).
- `router.test.tsx` was hardened by frontend-lead: per-wait timeout 30 s and test timeout 60 s, with no assertion changes. Web stayed at 598/598 (`artifacts/logs/fe-integration.log`, «Round 5»).
- Both final runs passed with that fix.
- D-2 is resolved: commit 236fe54 «SWR-005C: rules knowledge foundation» contains the SWR-005C `knowledge` files in their formatted form. `git status` shows no untracked files under `packages/games/rebellion/knowledge`, and prettier passes in `gate-verify-on-head.log`.

## History: first QA gate attempt (superseded by the green gate above)

**Result then: `pnpm verify` EXIT=1 on the shared tree** (`artifacts/logs/qa-verify.log`, 09:47:05–09:47:27Z, before any other check).
`eslint . --max-warnings=0` passed. Then `prettier --check .` failed on 9 files under `packages/games/rebellion/knowledge/**`.
`&&` stopped the chain there. These files are **not SWR-006 files**. They are untracked work in progress of the parallel task
**SWR-005C**, whose `docs/tasks/SWR-005C/status.md` shows IMPLEMENTATION `in_progress` with "W2 Rebellion data". It works in the same working tree. Their mtimes are
12:39–12:47 local, and `discrepancies.json` was written at 12:47:08, during the run. So another session was editing the tree while
the gate ran, which contradicts the brief's premise that nothing else was running. QA did not touch those files (not owned). → **D-2**.

To get SWR-006 evidence anyway, I then ran every stage of `pnpm verify` separately, with the same commands, each one even if an earlier one failed
(`artifacts/logs/qa-verify-stages.log`, 09:47:54–09:56:58Z):

| Stage (from `qa-verify-stages.log`) | Result |
|---|---|
| `eslint . --max-warnings=0` | EXIT=0 |
| `prettier --check .` | **EXIT=1**: the same 9 SWR-005C `knowledge/*.json` files, and nothing else |
| `pnpm typecheck` | EXIT=0 |
| `node --test scripts/` (`test:process`) | 449 / 449 pass |
| packages/platform | 13 files, 230 passed (includes SWR-005C's untracked `rules-kb` tests; SWR-006 integration had 95) |
| packages/games/rebellion | 58 files, 510 passed |
| packages/games/forbidden-stars | 2 files, 5 passed |
| apps/web | 67 files, 598 passed |
| apps/api (unit + integration) | 66 files passed + 1 skipped; 604 passed + 1 skipped. The new F-3 file has 5 tests (599 + 5). The skip is the opt-in `dev-db-upgrade.int.test.ts` (SWR-004) |
| `pnpm build` | EXIT=0 |
| `pnpm check:bundle` | EXIT=0: 12 rules, 0 findings; 821 sources, only definition/schema/board/assets, 0 `apps/web/src/dev` modules |
| `pnpm e2e` (Playwright, bot/mock, no network) | **136 passed / 0 failed** (5.9 min), EXIT=0 |

Verdict at that time: every SWR-006 check was green, and the single command failed only because of foreign SWR-005C files. This was later resolved; see «Final gate (green)».

Other tasks' tracked artifacts did not change: `git status --short docs/tasks/SWR-00{2,3,4,5}* docs/tasks/SWR-005B` after the e2e run is empty.

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| Full gate TC-R-01 (AC-13), final | passed | `pnpm verify` on HEAD 236fe54 + SWR-006, and in a clean worktree c1ace26 + SWR-006 | `artifacts/logs/gate-verify-on-head.log`, `artifacts/logs/gate-verify-final.log` |
| Full gate runs 1–3 (history) | failed | `pnpm verify`, clean worktree, under load: timeouts in old SWR-003/004 tests only | `artifacts/logs/gate-verify-run1.log`, `artifacts/logs/gate-verify-run2.log`, `artifacts/logs/gate-verify-run3.log` |
| Load-flaky old api tests alone | passed | `vitest run` migration-swr004, settings-source, hotseat (17/17) | `artifacts/logs/qa-load-flakes-alone.log` |
| Full gate TC-R-01, first QA attempt (history) | failed | `pnpm verify` (stopped at prettier: SWR-005C files, D-2) | `artifacts/logs/qa-verify.log` |
| All verify stages separately (AC-13 minus prettier) | passed | eslint, typecheck, test, build, check:bundle, e2e one by one | `artifacts/logs/qa-verify-stages.log` |
| TC-PL-01..07 (AC-01) | passed | `pnpm test` (platform `test/automation.test.ts`, api `architecture.int.test.ts`) | `artifacts/logs/qa-verify-stages.log` |
| TC-CP-*, TC-CC-01..06 (AC-02) | passed | `pnpm test` (api `automation-runner`, `automation-double-submit`, `automation-create-guard` int; rebellion `test/server/automation.test.ts`) | `artifacts/logs/qa-verify-stages.log` |
| TC-BOT-01..10 (AC-03) | passed | `pnpm test` (rebellion `test/ai/**`, `test/ai/sim/legal.test.ts`, `termination.test.ts`) | `artifacts/logs/qa-verify-stages.log` |
| TC-H-01..11 (AC-04) | passed | `pnpm test` (rebellion `test/server/automation-hidden-base.test.ts`, `hidden-info.test.ts`; api `automation-hidden-info`, `hidden-info-core` int) + e2e TC-H-11 | `artifacts/logs/qa-verify-stages.log` |
| TC-DET-01..05 (AC-05) | passed | `pnpm test` (api `automation-determinism` int; rebellion `test/ai/sim/determinism.test.ts`); eslint | `artifacts/logs/qa-verify-stages.log` |
| TC-DIF-01..10 (AC-06) | passed | `pnpm test` (rebellion `test/ai/sim/difficulty.test.ts`, api `automation-full-game` int) | `artifacts/logs/qa-verify-stages.log` |
| TC-LOOP-01..16, TC-RS-01..04 (AC-07) | passed | `pnpm test` (api `automation-runner`, `automation-restart` int) | `artifacts/logs/qa-verify-stages.log` |
| TC-RS-05 (AC-07, AC-11), F-3, **new QA test** | passed | `vitest run test/automation-f3-coverage.int.test.ts` + inside `pnpm test` | `artifacts/logs/qa-f3-tests.log` |
| TC-OUT-01..08 (AC-08) | passed | `pnpm test` (api `automation-full-game` int, rebellion sim) + e2e TC-E-07 | `artifacts/logs/qa-verify-stages.log` |
| TC-OA-01, 03, 06..11, 13, 15..18, 21, 24, 25, TC-CC-02, TC-ENV-09 (AC-09) | passed | `pnpm test` (api `automation-openai.int.test.ts`, fake fetch, real SDK) | `artifacts/logs/qa-verify-stages.log` |
| TC-OA-14 (Retry-After 2 s / 3600 s), TC-OA-19 (boundary), TC-OA-20 (isolation + dev endpoint), F-3, **new QA tests** | passed | `vitest run test/automation-f3-coverage.int.test.ts` (5/5) + mutation check (3 wrong expectations → 3 failures) | `artifacts/logs/qa-f3-tests.log` |
| TC-OA-04, 22, 23, 26 (AC-09, unit/property) | passed | `pnpm test` (api `test/automation/openai-commander-strategy.unit.test.ts`, `test/ai/prompt.unit.test.ts`); not tagged by TC id in the test names. The mapping comes from the W4/W7 logs | `artifacts/logs/w7-runner.log` |
| TC-ENV-01..11 (AC-09, AC-13) | passed | `pnpm test` (api `env.unit`, `env-example.unit`, `env-isolation.int`) | `artifacts/logs/qa-verify-stages.log` |
| TC-W-01..12 (AC-10) | passed | `pnpm test` (web 598: `AiCommanderStatus`, `AiTurnSummary`, `aiCommander`, `AutomationNotice`, `CoreEventLog`, `TurnPanel`, announcements) | `artifacts/logs/qa-verify-stages.log` |
| TC-E-01..08, TC-BC-*, TC-VA-01, TC-VA-02 (AC-10, AC-11) | passed | `pnpm e2e` (`e2e/ai-commander.spec.ts` and the old SWR-002..005B specs, 136/136) | `artifacts/logs/qa-verify-stages.log` |
| D-1 retest: TC-VA-01 + TC-E-05b notice layout at 375 / 1440 | passed | e2e (ai-commander #7, #13–#16) + review of the regenerated `swr006-ai-continue-*.png` (written 12:51–12:52 local by this run) | `artifacts/screenshots/swr006-ai-continue-ru-375.png` |
| TC-E-04 (core-hidden-base) flaky count, retest | passed | e2e #30 in the full run (earlier `--repeat-each=10` 10/10 in `qa-e2e.log`) | `artifacts/logs/qa-verify-stages.log` |
| TC-BC-07 / check:bundle (AC-11) | passed | `pnpm check:bundle` | `artifacts/logs/qa-verify-stages.log` |
| TC-LIVE-01 (AC-12) real OpenAI | not_run | not run by QA (by design: Analyst only). **Executed by Analyst** in BUSINESS_VALIDATION, BV-B | `artifacts/logs/business-validation.log` |
| TC-R-06 task check | passed | `node scripts/check-task.mjs docs/tasks/SWR-006` | `artifacts/logs/qa-check-task.log` |

Notes on the evidence level:
- Vitest's default reporter prints totals, not test names. The TC → test-file mapping comes from the test names (which include the TC ids)
  and from the worker logs `artifacts/logs/w1-platform.log` … `w9-scenarios.log`, `fe-1-platform.log`, `fe-2-3-rebellion.log`. Playwright prints every test by name.
- TC-M-01 (manual mock walk-through) was not repeated by QA. The Analyst's BV-A covers the bot scenario in the browser
  (`artifacts/logs/business-validation.log`). QA reviewed the e2e screenshots instead.

### D-1 retest (screenshots, viewed by QA)
- `artifacts/screenshots/swr006-ai-continue-ru-375.png`: the «Ход AI не завершён … / Продолжить ход AI» notice is in normal flow at the top
  of the page, full width. It covers neither the turn badge, the «AI Commander · бот · Обычная» status, the turn controls nor the zoom controls. No horizontal overflow.
- `artifacts/screenshots/swr006-ai-continue-en-1440.png`: the notice is fixed bottom-left under the map, less than half the width. It is clear of the
  zoom controls (+/−/fit/56 %) and of the right-hand Turn panel. Top bar: «AI Commander · bot · Normal».
- Verdict: **D-1 fixed.** `swr006-ai-continue-ru-1440.png` and `swr006-ai-continue-en-375.png` were regenerated by the same run (TC-VA-01 ru/en × 1440/375 passed).

## Review F-3: TC-OA-14, TC-OA-19, TC-OA-20, TC-RS-05
F-3 is resolved by **new tests** in `apps/api/test/automation-f3-coverage.int.test.ts` (test code only, real Rebellion module through HTTP,
real SDK on the fake fetch). All 5 pass, alone (`artifacts/logs/qa-f3-tests.log`) and inside `pnpm test` (`artifacts/logs/qa-verify-stages.log`).
A mutation copy with 3 wrong expectations failed 3/3, so the assertions really check what they claim.
- **TC-OA-14:** 429 `retry-after: 2` and then ok → the injected sleep gets exactly `[2000]`. There are 2 calls, `source=openai`, and one `ok` row with `attempts=2`.
  429 `retry-after: 3600` → no sleep, exactly 1 call, the bot moves with `AI_RATE_LIMITED`, and the row is `rate_limited` with `attempts=1`. `429 ×3` was already
  covered in `automation-openai.int.test.ts`. SWR-005B unit coverage of the same rule: `apps/api/test/ai/retry.unit.test.ts` («Retry-After ≤ 10 s is honoured», «Retry-After > 10 s → no retry»), `apps/api/test/ai/openai-provider.unit.test.ts` («429 with Retry-After > 10 s»).
- **TC-OA-19:** the reserve of the first AI step is computed like the server does: the decision point from the engine and the context built as in
  `OpenAiCommanderStrategy.contextOf`. With `spent = limit − reserve` there are 0 calls, `AI_BUDGET_EXCEEDED`, the bot moves, and there is one `budget_exceeded` row (0 USD).
  With `spent = limit − reserve − 1` µUSD there is 1 call and `source=openai`. SWR-005B coverage: `apps/api/test/ai/budget.int.test.ts` («refuses at exact equality»), `apps/api/test/dev-ai-budget.int.test.ts` («spent + reserve exactly equal to the limit is refused»).
- **TC-OA-20:** two sessions in one app. Session A is exhausted, so it has no call and gets `AI_BUDGET_EXCEEDED`. Session B makes its call and has an `ok` row with `budgetKey=B`. The `dev-diagnostics` budget in
  `GET /api/dev/ai/status` is identical before and after, and no AiUsage row has `budgetKey=dev-diagnostics`. `POST /api/dev/ai/test-decision` with `budgetKey=<session A>` returns
  400 VALIDATION. SWR-005B coverage: `budget.int.test.ts` («keys are isolated»), `apps/api/test/dev-ai-security.int.test.ts` («other budgetKey → 400»).
- **TC-RS-05:** SWR-006 adds no Prisma migration (`git status apps/api/prisma` is empty). The only state-schema change relaxes an invariant. I built a SWR-005B-shaped row on the same SQLite file with the SWR-005 auto-pass policy
  (`createRebellionServerModule({ automation: { policy: chooseAutoCommand } })`). In that row the AI Empire only passed, and the human Rebels are to move in the middle of the command phase.
  The SWR-006 server, with the real bot and no migration step, gives: GET → `automation {pending:false, strategy:'bot'}` and the version unchanged. The stored pass holds until the round ends, and in a later round
  the AI makes non-pass moves (`SYSTEM_ACTIVATED`). Events stay consecutive. Limitation: the row is made by the current engine with the old policy, not by a SWR-005B binary.
  The state format is the same because SWR-006 did not change the schema shape. The DB file is not a copy of a real SWR-005B `dev.db`; the `dev.pre-swr006.db` backup was not used.

## Mandatory PO tests (request.md п. 8) → TC → evidence
| PO п. 8 | Requirement | TC | Evidence | Status |
|---|---|---|---|---|
| 1 | Deterministic AI picks legal actions | TC-BOT-01..03, TC-BOT-10 | `packages/games/rebellion/test/ai/sim/legal.test.ts`, `packages/games/rebellion/test/ai/candidates.test.ts`; run in `artifacts/logs/qa-verify-stages.log` | passed |
| 2 | OpenAI AI picks legal actions | TC-OA-03, TC-OA-23 | `apps/api/test/automation-openai.int.test.ts` (fake fetch); run in `artifacts/logs/qa-verify-stages.log` | passed |
| 3 | An invalid model answer is rejected | TC-OA-06..11 | `apps/api/test/automation-openai.int.test.ts` («hostile answers …»); `artifacts/logs/qa-verify-stages.log` | passed |
| 4 | AI gets no hidden information of the opponent | TC-H-01..11 | `packages/games/rebellion/test/server/automation-hidden-base.test.ts`, `apps/api/test/automation-hidden-info.int.test.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 5 | AI does not act for the other side | TC-CP-03..05, TC-BC-01 | `packages/games/rebellion/test/server/automation.test.ts`, `apps/api/test/automation-runner.int.test.ts`, `e2e/ai-commander.spec.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 6 | A repeated request does not double an action | TC-CP-07, TC-CP-08, TC-CC-01..06, TC-RS-04, TC-E-06 | `apps/api/test/automation-double-submit.int.test.ts`, `apps/api/test/automation-restart.int.test.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 7 | An OpenAI error triggers the fallback | TC-OA-13..17, TC-OA-21, TC-OA-24, TC-E-04 | `apps/api/test/automation-openai.int.test.ts`, `apps/api/test/automation-f3-coverage.int.test.ts` (TC-OA-14), `e2e/ai-commander.spec.ts`; `artifacts/logs/qa-f3-tests.log` | passed |
| 8 | An exceeded budget triggers the fallback | TC-OA-18, TC-OA-19, TC-OA-20 | `apps/api/test/automation-openai.int.test.ts` (TC-OA-18), `apps/api/test/automation-f3-coverage.int.test.ts` (TC-OA-19/20); `artifacts/logs/qa-f3-tests.log` | passed |
| 9 | AI plays the Empire | TC-OUT-01, TC-OUT-02, TC-DIF-05..07, TC-E-01 | `apps/api/test/automation-full-game.int.test.ts`, `packages/games/rebellion/test/ai/sim/difficulty.test.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 10 | AI plays the Rebels | TC-OUT-03..07, TC-DIF-01..04, TC-E-02 | `apps/api/test/automation-full-game.int.test.ts`, `e2e/ai-commander.spec.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 11 | The game is saved and restored | TC-RS-01..05 | `apps/api/test/automation-restart.int.test.ts`, `apps/api/test/automation-f3-coverage.int.test.ts` (TC-RS-05); `artifacts/logs/qa-f3-tests.log` | passed |
| 12 | Automatic test of a sequence of several turns | TC-OUT-02, TC-OUT-03, TC-OUT-08, TC-LOOP-05 | `apps/api/test/automation-full-game.int.test.ts`, `apps/api/test/automation-runner.int.test.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 13 | No endless loops or uncontrolled spending | TC-LOOP-04, 06, 07, TC-BOT-10, TC-OA-18, 21, 22 | `apps/api/test/automation-runner.int.test.ts`, `packages/games/rebellion/test/ai/sim/termination.test.ts`, `apps/api/test/automation-openai.int.test.ts`; `artifacts/logs/qa-verify-stages.log` | passed |
| 14 | Works without an OpenAI API key | TC-ENV-01, TC-ENV-09, TC-ENV-10, TC-E-08, TC-OA-01 | `apps/api/test/env.unit.test.ts`, `apps/api/test/automation-openai.int.test.ts` (TC-ENV-09), the whole e2e suite with OPENAI_* blank; `artifacts/logs/qa-verify-stages.log` | passed |

Real OpenAI calls are never made by `pnpm test`/`pnpm e2e`: the api `no-network` guard, the fake fetch and the e2e mock mode all passed in `qa-verify-stages.log`.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify-stages.log` (platform/api architecture tests, eslint boundaries), `artifacts/logs/w1-platform.log` |
| AC-02 | passed | `artifacts/logs/qa-verify-stages.log` (automation-runner, double-submit, create-guard int), `artifacts/logs/w7-runner.log`, `artifacts/logs/w9-scenarios.log` |
| AC-03 | passed | `artifacts/logs/qa-verify-stages.log` (rebellion test/ai suite, sim legal), `artifacts/logs/w2-bot-core.log`, `artifacts/logs/w6-policies.log` |
| AC-04 | passed | `artifacts/logs/qa-verify-stages.log` (hidden-base invariance, prompt scans, e2e TC-H-11), `artifacts/logs/w5-server.log`, `artifacts/logs/w9-scenarios.log` |
| AC-05 | passed | `artifacts/logs/qa-verify-stages.log` (determinism int + sim, eslint), `artifacts/logs/w8-calibration.log` |
| AC-06 | passed | `artifacts/logs/qa-verify-stages.log` (sim difficulty), `artifacts/logs/w8-calibration.log` |
| AC-07 | passed | `artifacts/logs/qa-verify-stages.log` (runner, restart int; e2e TC-E-05/05b), `artifacts/logs/qa-f3-tests.log` (TC-RS-05), `artifacts/logs/be-integration.log` |
| AC-08 | passed | `artifacts/logs/qa-verify-stages.log` (automation-full-game int, sim, e2e TC-E-07), `artifacts/logs/w9-scenarios.log` |
| AC-09 | passed | `artifacts/logs/qa-verify-stages.log` (automation-openai int, env unit), `artifacts/logs/qa-f3-tests.log` (TC-OA-14/19/20), `artifacts/logs/w3-env.log`, `artifacts/logs/w4-prompt.log` |
| AC-10 | passed | `artifacts/logs/qa-verify-stages.log` (web 598, e2e 136), `artifacts/logs/fe-2-3-rebellion.log`, `artifacts/logs/fe-integration.log`, `artifacts/logs/bv-1-fix.log`, `artifacts/screenshots/swr006-ai-continue-ru-375.png`, `artifacts/screenshots/swr006-rebels-vs-ai-after-turn-en-1440.png` |
| AC-11 | passed | `artifacts/logs/qa-verify-stages.log` (old specs SWR-002..005B in e2e 136/136, hot-seat, /dev/ai page, check:bundle 0 findings), `artifacts/logs/qa-f3-tests.log` (TC-RS-05), `artifacts/logs/fe-1-platform.log` |
| AC-12 | passed | **Executed by Analyst, not QA** (TC-LIVE-01 = BV-B): `artifacts/logs/business-validation.log`. gpt-6-luna, 10 calls all ok, 14 AI actions, 0 fallbacks, 9474/466 tokens, ≈0.001184 USD (cap 0.05). QA checked that the log exists and agrees with `acceptance.md`. QA made no request. |
| AC-13 | passed | `artifacts/logs/gate-verify-on-head.log` (`pnpm verify` EXIT=0 on HEAD 236fe54 + SWR-006, e2e 136), `artifacts/logs/gate-verify-final.log` (EXIT=0 in a clean worktree c1ace26 + SWR-006 only), `artifacts/logs/qa-check-task.log`. History: `artifacts/logs/qa-verify.log` (EXIT=1, D-2) and gate runs 1–3 (EXIT=1, load timeouts in old tests) |

## Verification
- lint: passed — `artifacts/logs/gate-verify-on-head.log` (eslint + prettier, incl. SWR-005C files); history: `artifacts/logs/qa-verify.log` failed (D-2)
- typecheck: passed — `artifacts/logs/gate-verify-on-head.log`
- unit: passed — `artifacts/logs/gate-verify-on-head.log` (scripts 449, platform 230, rebellion 606, forbidden-stars 5, web 598)
- integration: passed — `artifacts/logs/gate-verify-on-head.log` (api 66 files / 604 passed + 1 opt-in skipped), `artifacts/logs/qa-f3-tests.log`
- build: passed — `artifacts/logs/gate-verify-on-head.log`
- bundle: passed — `artifacts/logs/gate-verify-on-head.log` (check:bundle 0 findings, 0 dev modules)
- e2e: passed — `artifacts/logs/gate-verify-on-head.log` (136 passed, bot/mock mode), `artifacts/logs/gate-verify-final.log` (136 passed)
- verify (single command): passed — `artifacts/logs/gate-verify-on-head.log` (EXIT=0), `artifacts/logs/gate-verify-final.log` (EXIT=0)
- screenshots (D-1 retest): passed — `artifacts/screenshots/swr006-ai-continue-ru-375.png`, `artifacts/screenshots/swr006-ai-continue-en-1440.png`
- live-openai: passed — `artifacts/logs/business-validation.log` (executed by Analyst, BV-B; not by QA)
- manual (TC-M-01): not_run — not repeated by QA; BV-A by Analyst in `artifacts/logs/business-validation.log`
- task check: passed — `artifacts/logs/qa-check-task.log`

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-1 | minor | e2e TC-VA-01 / TC-E-05b at 375 px: the automation run fails → the «Продолжить ход AI» notice | The notice covers neither the turn panel nor the zoom controls | (before the fix) the fixed centred notice covered the controls at 375 px (`artifacts/logs/qa-e2e.log`) | fixed (frontend-lead, `apps/web/src/platform/automation/noticeLayout.ts`; `artifacts/logs/fe-integration.log`). Retested by QA: e2e passed and screenshots reviewed (see D-1 retest) |
| TC-E-04 flake | minor (test) | `e2e/core-hidden-base.spec.ts` TC-E-04 under the bot: AI Rebels leave a leader in the base system | The spec's oracle counts what the UI counts | (before the fix) the spec counted only units; the UI counts units + leaders → `data-count` 12 vs 13, random | fixed by qa-lead (spec only; `artifacts/logs/qa-e2e.log` «Fix 19:51», repeat-each=10 10/10). Passed again in `artifacts/logs/qa-verify-stages.log` (#30) |
| BV-1 | minor | New-game form, AI opponent | No stale hint | (before the fix) «в прототипе AI не ходит» was shown | fixed (frontend-worker, `artifacts/logs/bv-1-fix.log`). e2e comment wording aligned by QA (`e2e/ai-commander.spec.ts:171`) |
| D-2 | blocker (for the AC-13 gate; not an SWR-006 product defect) | On the shared working tree run `pnpm verify` (`artifacts/logs/qa-verify.log`) | `prettier --check .` passes → the chain continues → EXIT=0 | `prettier --check .` fails on 9 untracked files `packages/games/rebellion/knowledge/{manifest,discrepancies}.json`, `entries/{components,implementation-notes,movement,rebel-base,refresh,round-command,victory}.json`. They belong to the parallel task SWR-005C (IMPLEMENTATION in progress, files written during the run). EXIT=1 | resolved: SWR-005C committed its formatted files in 236fe54. `pnpm verify` EXIT=0 on HEAD 236fe54 + SWR-006 (`artifacts/logs/gate-verify-on-head.log`) |
| Gate load flakes | minor (test infra) | `pnpm verify` at load average 50–96 (`gate-verify-run1..3.log`) | Old SWR-003/004 tests finish within 60 s | `migration-swr004` TC-M-01, `settings-source`, `hotseat` (api) and `router.test.tsx` (web) timed out; no assertion failures | router.test hardened (frontend-lead, `fe-integration.log` Round 5); the api tests pass alone (`artifacts/logs/qa-load-flakes-alone.log`) and in both green gates. The api timeouts were left as they are: a note for the Analyst, not blocking |

No new SWR-006 product defects were found in QA_EXECUTION.

## Open questions
- (Resolved) D-2: both variants ran. Clean worktree: `gate-verify-final.log`, platform 95. HEAD with SWR-005C committed: `gate-verify-on-head.log`, platform 230, rebellion 606 (the counts include SWR-005C tests).
- The 60 s timeouts of the old api tests under heavy load may come back on a busy machine. Raising those test timeouts is a candidate follow-up, outside SWR-006.
- (Resolved) The tracked files deleted in `git status` (`packages/games/rebellion/src/server/auto-play.ts`, `test/server/auto-play*.test.ts`) are the planned W5 removal (`implementation-plan.md`, W5), not a regression.
