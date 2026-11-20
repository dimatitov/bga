# Review — SWR-008

Reviewer: reviewer (Claude Code subagent, independent; wrote none of the reviewed code)  ·  Author(s) of reviewed code:
workers W0–W10, FE-1, FE-2 (see `implementation-plan.md` → Implementation log). The dependency-integration fixes were made by
the orchestrator: `cb2c3ce` (DEP-1, DEP-2, e2e session-list), `16b1cf1` and `c5b9a30` (e2e TC-006).

Scope:
- The uncommitted working tree against `HEAD` (`c5b9a30`). `git status --short` lists 122 entries: the SWR-008 code in
  `packages/platform`, `packages/games/rebellion` (rules/core, ai, server, knowledge, benchmark), `apps/api`
  (ai, rules-context, sessions/automation, dev/ai, bench, config, prisma, tests) and `apps/web` (dev/ai/session, SessionHost,
  locales), plus `e2e/ai-diagnostics.spec.ts`.
- From `cb2c3ce`: only `apps/api/src/sessions/sessions.repository.ts`, `apps/api/test/automation-double-submit.int.test.ts`
  and `e2e/session-list.spec.ts` (diff `7861bcd..cb2c3ce`).
- `16b1cf1` and `c5b9a30` (`e2e/game-setup.spec.ts`).

I checked everything against `specification.md` (R-1..R-3, AC-1..AC-16, QD-1..QD-29, Q-BE/AM-BE), `implementation-plan.md`,
`plan-backend.md` C-1..C-10, `test-cases.md`, `docs/architecture/rules-knowledge.md` §8 and `AGENTS.md`.

## Checks run by the reviewer (read-only; no network; `apps/api/.env` never read)
All commands ran on Node v22.23.5 (`nvm use`), after the integrator's `pnpm install --force` had finished
(`artifacts/logs/integration-install.log`, `exit=0`). At that point no pnpm process of this repository was running.

| Command | Result |
|---|---|
| `cd packages/games/rebellion && npx vitest run test/rules/core/state-checks.test.ts test/rules/core/reveal-invariant.test.ts test/ai/rules-query.test.ts test/knowledge` | 12 files / 251 passed |
| `cd packages/platform && npx vitest run test/rules-context.test.ts test/rules-kb test/ai-diagnostics.test.ts test/automation.test.ts` | 12 files / 290 passed |
| `cd apps/api && npx vitest run test/rules-off-golden.int.test.ts test/ai/prompt-fit.unit.test.ts test/rules-hidden-info.int.test.ts test/automation-rules.int.test.ts test/migration-swr008.int.test.ts test/disc009-restore.int.test.ts test/dev-ai-diagnostics.int.test.ts test/bench test/automation-double-submit.int.test.ts` | 11 files / 157 passed, 1 skipped (the opt-in TC-RS-06 below) |
| `SWR008_DEV_DB=prisma/dev.pre-swr008.db npx vitest run test/migration-swr008.int.test.ts` (apps/api; the test copies the DB, `shasum` of the original is the same before and after) | 1 file / 5 passed (incl. TC-RS-06 on a copy of the real pre-SWR-008 dev DB) |
| `stat` mtimes: `test/fixtures/swr006-commander-requests.json` 14:55:19, `src/ai/prompt.ts` 15:08:51, `openai-commander.strategy.ts` 15:40:55 | the rules-off golden was not rewritten after the prompt/strategy changes, and it still matches (see the row above) |
| Grep `rebellion\|rebel\|empire` in `apps/api/src/{ai,sessions,bench,rules-context,dev/ai}` and the new/changed platform files | only the pre-existing `dev-ai.schemas.ts:24` (SWR-005B dev form), nothing new |
| Read `artifacts/logs/integration-verify.log` (integrator, 16:06) | `apps/api` 2 failed / 856 passed: TC-CC-04 (F-1) and the TC-H-04/05/08 timeout (F-2) |
| `node scripts/check-task.mjs docs/tasks/SWR-008` (after writing this file) | see the report to the orchestrator |

Not run by the reviewer (`not_run`):
- `pnpm install`, `pnpm verify` / lint / typecheck / build / `check:bundle` / `pnpm e2e` (the brief forbids them; the integrator runs them);
- the full suites of `apps/api`, `apps/web`, `@bga/game-rebellion` and `@bga/platform` (only the files above);
- the web tests (`DevAiSessionDiagnostics`, `SessionHost`, `automation.test.tsx`, `AiTurnSummary.test.tsx`) and `e2e/ai-diagnostics.spec.ts`;
- the CI run;
- the bench CLI (mock or real) and any real OpenAI call.

Web code and the bench CLI were reviewed by reading only.

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| F-1 | minor | `apps/api/test/automation-runner.int.test.ts:482-508` (DEP-1 area) | TC-CC-04 is still flaky on the Prisma 7 + `better-sqlite3` stack. `integration-verify.log` fails with `expected ['humanTurn','none'] to deeply equal ['conflict','humanTurn']`. This is a different failure mode from the P1008 one that DEP-1 fixed: one run started after the other had already committed all its steps, so it found nothing to do (`none`). The test relies on `setTimeout(150)` to put both runs at the gate. With the synchronous driver and a loaded machine, that window is not guaranteed. `none` is a correct outcome (nothing is applied twice), but the assertion rejects it. | Wait until both `FakeStrategy` instances have actually reached `gate` (a counter or deferred, not a sleep) before releasing it. Alternatively, accept `['humanTurn','none']` with the same invariants (one winner with 3 steps, 4 `BOT_MOVED`, consecutive events), as DEP-2 did for TC-CC-06. Owner: integrator. |
| F-2 | minor | `apps/api/test/rules-hidden-info.int.test.ts:350-445` | TC-H-04/05/08 plays 4 full AI-Empire games. Under the full-suite load it hit the 20 s default `testTimeout` (`integration-verify.log`); run alone it passes (my run). The integrator (INT-1) has since added `}, 60_000);` at :445, but the result of `integration-verify-2` is not available yet. | Keep the explicit timeout with a reason comment (precedent: SWR-006 F-2). Confirm in the INTEGRATION log that `pnpm verify` is green. |
| F-3 | minor | `apps/api/src/sessions/sessions.repository.ts:198-203` (DEP-1) | Mapping `P1008` to `VERSION_CONFLICT` is correct: `$transaction` is rolled back, so nothing was written, and the caller reloads. Only `P1008` is mapped; any other code is still thrown. But the mapping is silent. Prisma uses `P1008` for any operation timeout, not only "lost the lock to the other writer". A real lock held by an outside process (Prisma Studio, `reset-ai-budget.mjs`, a stuck write) would then reach players as endless 409s, with nothing in the server log to tell it apart from a normal race. | Add one `warn` line (code `P1008`, session id, no data) before returning the conflict, so a sustained lock is visible. Behaviour unchanged. |
| F-4 | minor | `apps/api/src/dev/ai/dev-ai-diagnostics.ts:133-150`, `apps/api/src/ai/cost-by-rules.ts:6-10,44-49` | The dev panel totals (`withRules` / `withoutRules` / means) are built from ALL `AiUsage` rows of the session, including rows with no paid call: `budget_exceeded` refusals, and the 0-cost `AI_NOT_CONFIGURED` / mock rows (W6a limitation 6). `rowFor` records the rules columns on every row, so a budget refusal with a rules block lands in `withRules` at cost 0 and lowers the mean "cost with rules". The benchmark already filters `budget_exceeded` (`harness.ts`: `rows.filter((r) => r.status !== 'budget_exceeded')`), but the dev endpoint does not. AC-12 ("enough to compute the cost of a decision with and without rules") is affected only in the dev display, not in the stored data. | Use the same filter as the benchmark for the dev totals: count only rows with `attempts > 0`, or at least not `budget_exceeded`. Otherwise label the means in the panel as "per recorded request". |
| F-5 | nit | `docs/architecture/rules-knowledge.md:247-249` (§8.7) | The documented limitation of the dev tool (Q-BE-1) mentions only tokens/cost. For AI Rebels, the number of rows and their `at`/`durationMs` also depend on the hidden base: a model call happens only with ≥ 2 candidates, and Rebel moves out of or into the base change the candidate count (W10 limitation 4). Rule ids/counts are public, as designed (QD-7). The endpoint is dev-only, loopback-only and opt-in, so this is not a product leak. | Extend the §8.7 sentence (and the delivery report's known limitations) to say "number/timing of decisions, tokens and cost". |
| F-6 | nit | `packages/games/rebellion/src/rules/core/create.ts:106-117` | The creation-time drafts branch numbers events `created.log.length + i + 1`, while `finalize` uses `last.seq + i + 1`. The two agree only while the creation log is `1..n`. The branch is unreachable with valid data and has no test (W2 limitation 2). | Use the last `seq` as `finalize` does, or reuse `finalize`-style numbering. A one-line unit test on an artificial state would pin it down. |
| F-7 | nit | `e2e/game-setup.spec.ts:379` (`16b1cf1`, `c5b9a30`) | `page.waitForLoadState('networkidle')` is discouraged by Playwright and is redundant now that the step does `scrollIntoViewIfNeeded` + `toBeInViewport({ ratio: 1 })` + the stable-box poll. Those three are the real fix (reproduced at 1440×500 according to the commit message). The poll compares only `x`/`y`, which is enough for the click point. | Drop `networkidle` the next time this file is touched. No action needed for SWR-008. |
| F-8 | nit | `apps/api/src/bench/cli.ts:65`, `apps/api/package.json` (`bench:ai`) | Task- and game-specific paths are baked into the API package. The default report directory is `docs/tasks/SWR-008/artifacts/benchmark`, and the npm script hard-codes `../../packages/games/rebellion/benchmark/scenarios.json`. The harness code itself is game-agnostic: it picks the game from the file. | Use a neutral default (e.g. `artifacts/benchmark/` or a required `--out`), and pass `--scenarios` from the README command rather than the script. |

### Verified without findings (focus areas of the brief)
1. **Hidden information (R-1 C1..C5, QD-7, AC-6).**
   - **Selection input.** It is built in one place only: `rulesSelectionInputOf` (`packages/platform/src/rules-context.ts:56-68`) reads `actor`, `phase` and `rulesQuery`, never candidates, situation, objective or fallback. `RulesSelectionInputSchema` is strict (`rules-kb/context.ts`). `commander-context.ts:78-97` passes only that input to the provider, and there is no game state in the API layer.
   - **Rebellion `rulesQueryFor`** (`src/ai/rules-query.ts:34-39`) reads only `activation === null`, `rebelBase.revealed` and the opponent's `passed`. All three are public to both sides. The command types are the fixed public set of the activation state, so they never depend on the hidden base (AM-BE-1).
   - **What reaches the model.** The rules block is KB text only. `rulesVersion` and the accounting are never sent: `prompt.ts` whitelist, `buildCommanderPrompt`.
   - **AiUsage rows** store public rule ids only, never text (`ai-usage.repository.ts`, migration).
   - **Logs.** The selection-error log line carries the error class name, session id and game id (QD-27, C5 server log), and nothing else.
   - **Dev endpoint.** Strict wire schema; `toDecisionDiagnostic` is a whitelist; 404 in production and loopback-only (TC-DIAG-04/10).
   - **Web panel.** `import.meta.env.DEV` literal guard plus an opt-in switch. `check-web-bundle.mjs` rules `dev-ai-path` and `dev-ai-testid` cover the new chunk.
   - **Benchmark.** Uses only validated decision points, and its own budget key (`bench-<stem>`).
   - **Tests that prove it.** The byte-identity tests TC-H-01/03/06/07 and the prefix scans TC-H-04/05/08 (`rules-hidden-info.int.test.ts`) passed in my run.
2. **Game core is the sole arbiter; DISC-009 (AC-7, AC-8, AC-9).**
   - **One state-check point.** `runStateChecks` (`state-checks.ts:54-62`) runs after every accepted command (`apply.ts:112-115`) and at creation (`create.ts:106`). `revealBase` is called nowhere else.
   - **Condition.** Imperial ground unit in the base system, matching RR p.11 restricted to core-v1, with loyalty as a documented extension point (A-2).
   - **Timing.** The reveal is deferred while `activation.side === 'empire'`, which matches RR p.2 step 3 / A-3 since core-v1 has no combat.
   - **Order and idempotency.** The hand-over happens only after the checks, so the order `ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER` is kept. The checks are idempotent (`revealed`, `outcome !== null`).
   - **Reachability.** `MOVE_PIECES` can only target the activated system (`movement.ts:54`), so revealing "on any FINISH" never reveals early. The only reachable path is the Empire's FINISH of the base.
   - **Behaviour unchanged.** The TC-D-33 differential against a copy of the old logic over the seeded games proves the observable behaviour is the same (A-3/QD-13).
   - **Save/restore.** TC-RS-01..05 pass. The state schema is unchanged.
   - **Model answers.** The model can only pick a candidate id (`choiceOf`); hostile answers fall back to the bot (TC-ARB-02..08). Rules text cannot add actions.
3. **Budget and cost (AC-10, QD-11, PO-2).**
   - **Reservation.** Computed from `promptUpperBound(ctx)` of the full prompt, rules included (`ai-decision.service.ts`, `reserveFor`). The budget mechanism is untouched (`budget.service.ts` is not in the diff).
   - **Degrade order.** `fitCommanderPrompt` goes full → reduced (whole lines, pinned kept, terminates because the text strictly shrinks) → dropped → `{ok:false}`. The strategy returns `AI_PROMPT_TOO_LARGE` before `race`, so there is no call, no reservation and no row (TC-BUD-07). Rules are never dropped to save money (TC-BUD-02/03).
   - **Bench real mode.** Needs `--real --max-usd` with 0 < x ≤ 1 and ≥ 3 repeats. It is refused under `NODE_ENV=test`, without `OPENAI_ENABLED`, or for an unpriced model, and the refusal happens before any network access. The run's own in-memory budget equals `--max-usd`, so the reservations cap the spend at the pricing table's estimate. Mock is the default. `bench:ai` is not part of `verify`/CI.
4. **Migration.** 9 × `ADD COLUMN` only, with "rules off" defaults and no rebuild. Old rows are byte-equal and readable. Verified by me on a copy of the real pre-SWR-008 dev DB (TC-RS-06), and the original is unchanged.
5. **Multi-game contract.** The platform changes are additive and optional: `ServerGameModule.rules?`, `rulesQuery?`, the enum appended at the end, new subpath exports. `apps/api/src/{ai,sessions,bench,rules-context}` contain no Rebellion vocabulary. A game without `rules` gets no block (TC-FB-05, tiny-KB fake game).
6. **Rules-off byte identity.** Without `rules` the prompt is SWR-006 byte for byte (`prompt.ts`). The W0 golden was recorded on the HEAD copy and was not rewritten after the prompt changes (mtimes above). It still matches.
7. **Tests.** The tests are not tautological where it matters: raw-request byte comparisons, an independent-oracle property test, the differential old-logic oracle, and a golden recorded before the change. The one known weakness is documented: TC-H-07 uses constant fake usage, so it cannot catch the token side channel accepted by Q-BE-1 (see F-5).
8. **DEP-2.** The relaxation is limited to `422` with `messageKey === 'errors.gameOver'`. "Exactly one 200" and the event invariants are kept. **DEP-1:** see F-3. **e2e session-list:** a `toBeVisible` wait before `evaluateAll` is a correct fix.

## Round 2

Scope:
- (a) `3fe4a66`, the PR #1 merge from the SWR-007 session, diff `c5b9a30..3fe4a66`. It changes `apps/api/src/persistence/sqlite-adapter.ts`
  (250 ms busy timeout, `isSqliteBusy`), `apps/api/src/sessions/sessions.repository.ts` and the new `apps/api/test/sqlite-adapter.int.test.ts`.
- (b) The "Review fixes (round 1)" of `implementation-plan.md`: the working tree against `HEAD`, in the files listed there.

This round was read-only: a full `pnpm verify` was running in this checkout, so I ran no tests and no pnpm commands.
The test results below are the backend worker's, from the implementation log. I did not re-run them.

| # | Round-1 severity | Status | Evidence / notes |
|---|---|---|---|
| F-1 | minor | **resolved** | `FakeStrategy.atGate` / `reachedGate(n)` (`test/support/fake-automation.ts`). TC-CC-04 now releases the gate only after `Promise.all([sa.reachedGate(1), sb.reachedGate(1)])` (`automation-runner.int.test.ts:499-502`). `choose` is called only after the runner has loaded the state and built the point, so both runs hold the same version when the gate opens and the `none` outcome can no longer happen. The assertion `['conflict','humanTurn']` was not weakened. Worker's log: 20/20, and 10/10 under CPU load. |
| F-2 | minor | **resolved (INT-1)** | `}, 60_000);` at `rules-hidden-info.int.test.ts:445`. The final confirmation is the integrator's `pnpm verify` running now. |
| F-3 | minor | **resolved** | `3fe4a66` replaced the bare `P1008` check with `isSqliteBusy`, which reads the driver cause `originalCode === 'SQLITE_BUSY'` or "database is locked". Other `P1008` timeouts are now re-thrown instead of being turned into 409s, which is stricter than before. On top of that, `commit` logs one `warn` line: `sessionId=<id> code=SQLITE_BUSY error=<class> → VERSION_CONFLICT`. It carries no message, SQL, values or path, which fits the C5 server-log policy (same id as F-5 of SWR-006). The test `review F-3` (`sqlite-adapter.int.test.ts`) checks the 409, exactly one warn with context `SessionsRepository`, no state/event/path/SQL in the line, and an untouched row. |
| F-4 | minor | **resolved** | `countsAsModelCall` = `attempts > 0 && status !== 'budget_exceeded'` (`dev-ai-diagnostics.ts:51-53`) filters the totals; `decisions` still lists every row. The wire schema is unchanged. The narrow select adds only `attempts` and `status`, so no new field reaches the wire. There are 2 new tests, and per the worker the mutation of removing the filter fails them. Mock rows (attempts > 0, cost 0) still count, which is correct for a mock run. |
| F-5 | nit | **resolved** | `rules-knowledge.md` §8.7 now names the number and timing of decisions (`at`, `durationMs`) as hidden-dependent for AI Rebels, and states why this is acceptable: dev-only, loopback-only, opt-in. |
| F-6 | nit | **resolved** | `checkCreatedState(created, now)` (`create.ts:113-127`) numbers events from the last `seq`, as `finalize` does. `createCoreGame` still has a single `runStateChecks` call site, through this helper. The test `review F-6 [art]` (`state-checks.test.ts:527-560`) covers seq 5, 7 → 8, then 8 → 9 `GAME_OVER`, and the no-op case. |
| F-7 | nit | **accepted as is** | Analyst decision. |
| F-8 | nit | **accepted as is** | Analyst decision. |

How `3fe4a66` interacts with SWR-008:
- **Same process.** Production and normal tests use one `PrismaClient`, and so one better-sqlite3 connection, per process. The driver is synchronous, so SWR-008 writes (`AiUsage` inserts, session commits) cannot contend with each other. The 250 ms timeout matters only when another connection or process holds the lock. Two apps on one DB file only happens in TC-CC-04-style tests.
- **SWR-008's own tests.** TC-H-01/03/07 and TC-RS-* use separate DB copies, one app per file, at any given time. The bench uses an in-memory usage store. None of them depends on the timeout.
- **Only `SessionsRepository.commit` maps `SQLITE_BUSY`.** An `AiUsage` insert or a read that meets an outside lock for more than 250 ms now fails faster than with the old 5 s default. For an insert, that means the existing "one retry → `AiUsageWriteError`" path, so the step falls back to the bot. For the dev endpoint, it means a 500. This needs an outside process (Prisma Studio, `reset-ai-budget.mjs`, the e2e seeder) writing while the server is running, and the outcome is fail-closed (no double spend, no leak). It is not a defect of SWR-008, so I record it here as a note, not as a finding. If it shows up in practice, the `AiUsage` writer could treat `isSqliteBusy` like the commit does: retry after a short wait.
- **DEP-2** (TC-CC-06 accepts `422 errors.gameOver`) is still consistent with the new adapter: the earlier read still sees the finished game.

New findings in round 2: none.

Round-2 verdict: **approved**. It does not depend on this review re-running anything. It relies on the integrator's running `pnpm verify` and CI being green before BUSINESS_VALIDATION; I did not observe that result.

## Verdict
approved
