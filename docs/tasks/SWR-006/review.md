# Review — SWR-006

Reviewer: reviewer (Claude Code subagent, independent; wrote none of the reviewed code)  ·  Author(s) of reviewed code:
backend-workers W1–W9, frontend-worker FE-1 and FE-2+3 (see `implementation-plan.md` → Implementation log).

Scope: the uncommitted working tree vs `HEAD` (`c1ace26`). `git diff HEAD --stat`: 100 tracked files changed (+3589/−962),
including the deleted `packages/games/rebellion/src/server/auto-play.ts` and `test/server/auto-play{,-fault}.test.ts`. New
untracked files (`git status --short`): `apps/api/src/sessions/automation/**` (8 files), `apps/api/src/sessions/session-writer.ts`,
`apps/api/test/automation-*.int.test.ts` (7), `apps/api/test/automation/**`, `apps/api/test/support/{automation-helpers,fake-automation,hidden-scan,scripted-empire}.ts`,
`packages/platform/src/automation.ts` + test, `packages/games/rebellion/src/ai/{candidates,decision,describe,empire-policy,intel,profiles,random,rank,rebel-policy,types,view-model}.ts`,
`packages/games/rebellion/src/server/automation.ts`, rebellion tests `test/ai/**` (incl. `sim/**`, `fixtures/**`) and `test/server/{automation,automation-hidden-base}.test.ts`, `drain-automation.ts`,
web `apps/web/src/platform/automation/**`, `core-v1/model/aiCommander{,.test}.ts`, `core-v1/top-bar/AiCommanderStatus{,.test}.tsx`,
`core-v1/panels/AiTurnSummary{,.test}.tsx`, `e2e/ai-commander.spec.ts`. Checked against `specification.md` (Contract, D-PO-1..6,
AC-01..AC-13, Clarifications, Decisions during IMPLEMENTATION), `plan-backend.md`, `plan-frontend.md`, `test-cases.md`.

## Checks run by the reviewer (read-only; no network; `apps/api/.env` never read)
Full output: `artifacts/logs/review-checks.log`. QA was running Playwright at the same time, so the machine was loaded.

| Command | Result |
|---|---|
| `pnpm -r run typecheck` | all 5 projects `Done` (platform, forbidden-stars, rebellion, web, api) |
| `pnpm exec eslint --max-warnings=0 apps/api/src apps/api/test packages/platform packages/games/rebellion apps/web/src/platform apps/web/src/games/rebellion e2e` | exit 0 |
| `node --test scripts/` | 449 passed, 0 failed |
| `pnpm --filter @bga/platform test` | 6 files / 95 passed |
| `pnpm --filter @bga/web test` | 66 files / 593 passed |
| `pnpm --filter @bga/game-rebellion test` (run 1) | **4 failed** / 506 passed: `test/rules/core/hidden-info.test.ts` TC-H-02 "seeded random games" ×3, `test/rules/core/invariants.test.ts` hot-seat ×1 (see F-2) |
| `vitest run test/rules/core/hidden-info.test.ts test/rules/core/invariants.test.ts` (rebellion, alone) | 2 files / 17 passed |
| `vitest run` (rebellion, full, run 2) | **2 failed** / 508 passed, `Error: Test timed out in 5000ms.` (TC-H-02 Rebels vs AI, Empire vs AI) |
| `node scripts/check-task.mjs docs/tasks/SWR-006` | `OK` (before and after writing this file) |
| Greps: Rebellion vocabulary in `packages/platform/src`, `apps/api/src/sessions`; `Math.random`/`Date`/`crypto`/`performance`/`process.` in `packages/games/rebellion/src/ai`; imports of `src/ai/**`; `@bga/game-rebellion/{ai,rules,server}` in non-test web code | platform: only old SWR-003/004 doc comments (`errors.ts:54`, `game.ts:13-42`), nothing new; sessions: none; AI: none; AI imports only `../schema`, sibling modules and `zod` (old `index.ts`); web: none |

Not run by the reviewer: `pnpm verify`, `pnpm e2e`, `pnpm --filter @bga/api test` (forbidden by the brief: QA e2e in
progress), `pnpm build`, `check:bundle`, any real OpenAI call. API behaviour below was checked by reading the code and the
tests, not by running the API suite. For it I rely on the logs `artifacts/logs/w7-runner.log` and `w9-scenarios.log`
(read, not re-run).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| F-1 | minor | `apps/api/src/sessions/sessions.service.ts:102,110` | The create path calls `this.runner.run(sessionId)` and `automationEnvelope(...)` without the guard that `SessionCommandsService.safeRun` (`session-commands.service.ts:113-136`) gives the command path. "The runner never throws" is close to true but not guaranteed: `AutomationRunner.finish()` (`automation-runner.service.ts:294-320`) runs `AutomationRunSummarySchema.parse` and the log sink; if either throws inside the `try`, the `catch` calls `finish()` again and the promise rejects. `automationEnvelope` calls the game's `pendingActor`. If any of these throws, `POST /api/sessions` answers 500 even though the session row and its idempotency record are already committed (a retry with the same key then replays 200). The command path does not have this inconsistency. | Wrap the create-time run the same way as `safeRun` (fall back to the inserted state and `{ pending: <best effort>, strategy }`), or move `safeRun` into the runner as its public contract so both callers share it. |
| F-2 | minor | `packages/games/rebellion/test/rules/core/hidden-info.test.ts:517`, `test/rules/core/invariants.test.ts:71` | Under load, the package suite fails on the 5000 ms default timeout: 4 failures, then 2 in two full runs; both files pass when run alone. Decisions during IMPLEMENTATION assigned this flake to backend-lead at INTEGRATION ("on repetition — raise the test timeout"), but nothing has changed yet: no `be-integration.log`, and the timeouts are still the default. `invariants.test.ts` (hot-seat, 10×250 commands) is also affected, which the Decision does not mention. These are SWR-005 tests and SWR-006 did not change the rules, so this is not a product regression. It is a real risk for AC-13 (`pnpm verify` exit 0) whenever the gate runs on a busy machine. | Backend-lead: give those `it(...)` blocks an explicit timeout (e.g. 30 s), keeping the same coverage. Record it in the Decisions / Implementation log and in the INTEGRATION log. |
| F-3 | minor | `apps/api/test/automation-openai.int.test.ts` (whole file); `test-cases.md` TC-OA-14, TC-OA-19, TC-OA-20, TC-RS-05 | W9 lists these as not covered, and I confirm that no SWR-006 test exists for them: the Retry-After variants (2 s wait, 3600 s → no wait), the budget boundary `spent + reserve = limit` → no call, isolation of session budgets (A exhausted, B still calls; `dev-diagnostics` unchanged), and a SWR-005B-era DB (`pending` computed correctly without a migration). The behaviour is covered indirectly: the `≥` reservation rule and the Retry-After cap come from SWR-005B (`budget.service`, `retry.ts` tests), the budget key is a plain parameter (`openai-commander.strategy.ts:118`), and the dev endpoint is still `z.literal('dev-diagnostics')` (`packages/platform/src/ai-dev.ts:102,150`, unchanged). But PO п.8 items 7/8/11 map to these TCs, and the traceability matrix claims them. | Either add the four tests (fake fetch / DB fixture), or have QA/Analyst mark them in `qa-results.md` as covered by SWR-005B tests, with references, before FINAL_ACCEPTANCE. |
| F-4 | nit | `apps/api/src/sessions/automation/openai-commander.strategy.ts:133-155` | Accepted AM-BE-5 (race without cancellation): after the deadline the losing call keeps its worst-case reservation until it settles. With the defaults (timeout 30 s × up to 3 attempts + backoff) that can be well over the 45 s deadline. Each later run (every human command) can start one more such call. If the provider hangs, the holds pile up and later steps fall back with `AI_BUDGET_EXCEEDED` although nothing was spent, so the player sees "budget exhausted" instead of "timeout". The cost stays bounded, and correctly so. | Note this in `delivery-report.md` known limitations together with the `AbortSignal` follow-up (Q-BE-2). Optionally, skip the model call while a previous background call of the same session is still in flight. |
| F-5 | nit | `apps/api/src/sessions/automation/automation.providers.ts:32-36` | `onUnexpectedError` logs `sessionId=- step=0`, so the operator cannot link an unexpected strategy error to its session/run (documented by W7 as a limitation). The runner's own `STRATEGY_ERROR` line (`automation-runner.service.ts:260-268`) does carry the ids, but only for errors thrown out of `choose`, and the OpenAI strategy never throws. | Pass `sessionId` through `CommanderRunContext` to the callback (the value is already in `ctx`), or drop the strategy-level line and return a marker so the runner can log it. |
| F-6 | nit | `apps/api/src/sessions/automation/openai-commander.strategy.ts:136,159-161` | `decide(ctx, 'auto')` resolves to the mock provider when OpenAI is off or has no provider, yet a successful answer is always labelled `source: 'openai'`. Env validation makes this unreachable in production (`openai` requires `OPENAI_ENABLED=true`), but test overrides can reach it and the step log would then say `source=openai` for a mock decision. | Take `source` from the decision's provider (`result.decision.provider === 'openai'`), or request `'openai'` explicitly. |
| F-7 | nit | `apps/web/src/platform/automation/runAutomation.ts:27`; `commitCommandResult.ts:6-10,24-26` | The doc comment says `view`/`events` were already validated by the game "before calling". That holds for the command path (`useSendCommand` → `CommandOkSchema`) but not for the `run` path: the platform writes the unvalidated `view` of the run response straight into the `detail` cache. Rebellion parses the view again on render (`parseRebellionView`) and the run events in `CoreTable.parseRunEvents`, so no defect follows, only an inaccurate contract. | Fix the comment ("command path: validated by the game; run path: the game validates on read"), or let the game register a view validator for the run path. |
| F-8 | nit | `packages/games/rebellion/src/ai/describe.ts:139` | `situation` tells the model "You play the Empire (bot difficulty normal)" in OpenAI mode as well. This is harmless, but the phrase can read as an instruction to play weakly. | Drop the difficulty from `situation`, or word it neutrally ("game difficulty setting: normal"). Regenerating the snapshot/invariance tests is then expected. |

### Verified without findings (focus areas of the brief)
1. **Hidden information (AC-04).** `createRebellionAutomation.decide` (`packages/games/rebellion/src/server/automation.ts:54-56`)
   passes only `toSideView(state, aiSide)` to `buildDecision`. Both `decisionPoint` and `applyCandidate` rebuild from that
   view, and the bot types never accept a state (`rank.ts:96-100`, TC-BOT-05). Every value in `intel.ts` comes from the
   Empire's own view (visible Rebel pieces, the redacted log, reconstructed own moves, the public start rule only on hard),
   and `describe.ts` uses neither `view.id` nor the version. Candidate ids are opaque `c1..c10` (`decision.ts:114`). `target`
   is a system id from the actor's own view, which the Contract allows. Invariance is tested: in the package, 9 eligible bases
   give equal views, points, intel, situation and drained moves (`test/server/automation-hidden-base.test.ts:113-133`); over
   HTTP, two DBs that differ only in the base give byte-identical OpenAI request bodies before the reveal
   (`automation-hidden-info.int.test.ts:99-169`). The same test checks that no `sessionId`, key, `metadata`, `user`,
   `safety_identifier` or `prompt_cache_key` reaches the URL, headers or body. The request body is built only from
   `model/instructions/input/text/reasoning/max_output_tokens/store:false` (`apps/api/src/ai/providers/openai.provider.ts:145-153`),
   and `buildCommanderPrompt` copies a field whitelist (`prompt.ts:59-71`). Automation logs are allow-listed (ids, counters,
   codes, error class names; `automation-log.ts`), and the model `reason` is dropped (`openai-commander.strategy.ts:157-161`).
   Under Q-BE-1, `sessionId` may appear in server logs and `AiUsage.budgetKey`. Responses to a human Empire still go through
   `toPlayerView` / `toPlayerEvents` of the human side (`rebellion-server-module.ts:141-155`); the run summary holds aggregates only.
2. **Same command path and concurrency (AC-02, AC-07).** Every step is `applyCommand(state, {actor: aiSide, expectedVersion: state.version, command}, {origin:'auto'})`
   (`automation.ts:93-97`), committed through the shared `commitState`, which writes setup, status and events with the
   version guard (`session-writer.ts:30-41`). The module's own `applyCommand` always uses `origin:'player'`, so the human
   cannot act for the AI (`notYourSide`), and `origin:'auto'` applies only to the AI side (`rules/core/apply.ts:40`). Other
   properties:
   - `KeyedMutex` is a promise chain per key whose tail is cleaned up, and a waiter re-reads the row.
   - A lost commit → `conflict` + reload (AM-FE-3).
   - An engine rejection of the strategy's pick is retried once with the bot's pick; a second rejection → `error` with `pending` left true.
   - `maxSteps` → `stepLimit` before the next step.
   - Exceptions → `error`; `safeRun` protects the human's 200; a 409 on the human's commit never starts the runner.
   - The `run` body is strict (`z.strictObject({})`).
   - Q-4 semantics: 0 steps → `none`; `gameOver` / `humanTurn` only after a step.
3. **Costs and fallback (AC-09).**
   - Config: `AI_COMMANDER_PROVIDER=openai` requires an accepted `OPENAI_ENABLED=true`, so it is impossible in `NODE_ENV=test` (`env.ts:305-309`).
   - `budgetKey = sessionId`, with the unchanged SWR-005B reservation, `AiUsage` row and `validateDecision`.
   - Fewer than 2 candidates → the bot without a call.
   - `AI_NOT_CONFIGURED` (also key rejected, model unavailable, unknown pricing), `AI_BUDGET_EXCEEDED`, `AI_DEADLINE` and quota stop calls for the rest of the run (`openai-commander.strategy.ts:47-71,96-108`).
   - An invalid decision is not retried.
   - The deadline race resolves a rejection into an outcome, so no unhandled rejection.
   - Test overrides are refused in production (`app.factory.ts:57-62`); e2e/test children force `bot` (`scripts/e2e-env.mjs`).
4. **Game-agnostic platform (AC-01).** The new `packages/platform/src/automation.ts` and `apps/api/src/sessions/**` contain
   no Rebellion words or imports. `architecture.int.test.ts` enforces this with a words + imports scan that includes comments.
   `automation` is optional on `ServerGameModule`; non-automated modules give `{pending:false, strategy:null}`.
5. **Determinism and purity (AC-05).**
   - Seeded FNV-1a + mulberry32 from `view.id#version` (`random.ts`).
   - ESLint B-6 bans clock and entropy in `packages/games/*/src/ai/**` (`eslint.config.mjs:284-287`); the grep is clean.
   - Ranking is a stable sort, score then key.
   - Termination: the terminating action is always kept (`decision.ts:37-48`, `rank.ts:34-40`), activations are limited by leaders, there is a per-run step cap, and the W8 simulations ended 630 games within ≤ 13 rounds (log read).
6. **Frontend.**
   - The UI shows only aggregates and fallback codes, with ru/en texts and a generic text for unknown codes. The model reason, budget and candidates never reach the client (`aiCommander.ts`, `AiTurnSummary.tsx`).
   - Auto-run is armed atomically, at most once per load or command response. A run that answers `pending` never re-arms, so the button becomes the only path. In-flight runs are guarded at module level (StrictMode-safe, `automationStore.ts:72-78`, `runAutomation.ts:21-38`).
   - `SessionView` is keyed by `sessionId`, so the mount-once reset is per session.
   - `ai-thinking` has `role="status"` + `aria-live="polite"`. The AI turn summary is announced through `announce()` on both paths, and the retry notice is `role="alert"`.
   - Hot-seat: `aiSideOf` null → no AI UI, and automation is ignored in `coreAutomationFlags`.
   - Bundle: no non-test web import of `@bga/game-rebellion/{ai,rules,server}`; the FE-1/FE-2+3 logs report `check:bundle` exit 0 (not re-run by me).
7. **Types and tests.** The difficulty thresholds in `test/ai/sim/difficulty.test.ts` match `test-cases.md` TC-DIF-01..07
   exactly (≥ 8/20, ≥ 4/20, 0/20, ≥ 1 and < easy, ≥ 90 %, 0 searched, easy < hard). TC-DIF-07 uses the metric clarified in
   Decisions. The tests assert what their names claim: byte equality of request bodies, AiUsage row counts equal to calls,
   no `metadata` etc. The only gaps are the ones in F-3.


## Round 2

Scope: the fixes for round 1 as decided by the Analyst (`specification.md` → «CODE_REVIEW round 1 — решения Analyst»), plus
the INTEGRATION changes made since round 1: QA defect D-1 (automation notice layout, skip links), the web test preload,
and the e2e TC-E-04 count fix. I read the code and the logs `be-integration.log`, `fe-integration.log` and
`integration-verify-final.log`. I did not edit any code.

| Command (reviewer, round 2; output in `artifacts/logs/review-checks.log` → «Round 2») | Result |
|---|---|
| `vitest run test/automation-create-guard.int.test.ts test/automation/openai-commander-strategy.unit.test.ts test/architecture.int.test.ts` (in `apps/api`) | 3 files / 31 passed |
| `pnpm --filter @bga/game-rebellion test` | 58 files / 510 passed (no timeouts; the machine was less loaded than in round 1, with only the BV dev servers running) |
| `pnpm --filter @bga/web test` | 67 files / 597 passed |
| `pnpm -r run typecheck`; `eslint --max-warnings=0` on the changed areas | exit 0; exit 0 |
| `artifacts/logs/integration-verify-final.log` (read, not re-run) | e2e `136 passed`, `EXIT=0` |

| # | Round-1 severity | Status | Evidence / notes |
|---|---|---|---|
| F-1 | minor | **resolved** | New `apps/api/src/sessions/automation/settle-run.ts`. `settleRun` never rejects: on failure it uses the caller's committed state and returns summary `error`. `bestEffortEnvelope` catches a throwing `isAutomated`/`pendingActor` and answers `pending:true` with the configured strategy (or `strategy:null` without automation). Create (`sessions.service.ts:105,113`) and both command paths (`session-commands.service.ts:81,101,106-112`) use the same guard. `apps/api/test/automation-create-guard.int.test.ts` covers a throwing `pendingActor` at create (201, pending, later run finishes), a rejecting runner at create (201, then idempotent replay 200, one row) and the command path (200, `error`, version kept). GET still uses the plain `automationEnvelope` (`sessions.service.ts:194`). That is acceptable there because GET writes nothing, so a 500 loses no accepted data. |
| F-2 | minor | **resolved** | Explicit 30 s per-test timeouts with a reason comment: `hidden-info.test.ts` (`SEEDED_GAMES_TIMEOUT_MS`, TC-H-02 seeded games) and `invariants.test.ts` (`PROPERTY_TIMEOUT_MS`). Bodies and assertions are unchanged, so coverage is the same. |
| F-3 | minor | **open (deferred by decision)** | The Analyst decided that QA-lead records TC-OA-14/19/20 and TC-RS-05 in `qa-results.md` as covered by SWR-005B tests (with references) or adds tests. Not there yet (`grep` of `qa-results.md`: no mention). This needs to be done before FINAL_ACCEPTANCE. It does not block the code review. |
| F-4 | nit | **open (deferred by decision)** | Known limitation for `delivery-report.md` (not written yet). |
| F-5 | nit | **resolved** | `onUnexpectedError(errorName, sessionId)` (`openai-commander.strategy.ts:46,106,176`). The provider factory now logs `sessionId=<run session>` (`automation.providers.ts:32-37`). Only the class name is logged, never the message. |
| F-6 | nit | **open (deferred by decision)** | Known limitation for `delivery-report.md`. |
| F-7 | nit | **resolved** | The comments now say who validates `view`/`events`: on the command path the game, on the `run` path the game at read time (`commitCommandResult.ts:9-14`, `runAutomation.ts:16-17`). |
| F-8 | nit | **resolved** | `describe.ts:139-140` now says «(game difficulty setting: X)». The hidden-base invariance tests are green in the package run above. |

INTEGRATION changes since round 1:
- **D-1 (`apps/web/src/platform/automation/noticeLayout.ts`, `AutomationNotice.tsx`):** the notice is in normal flow on
  `xs`–`sm` and fixed bottom-left on `md`+, at most `min(560px, 50% − 32px)` wide. It no longer covers the zoom controls or
  the turn panel. It is still `role="alert"`, and the retry button and texts are unchanged. Rendering is game-agnostic.
  No finding.
- **Skip links (`CoreTable.tsx:65-80`):** offset hiding is replaced by clipping to 1 px until `:focus-visible` (a standard
  sr-only pattern). The links stay focusable and in the tab order, and an in-flow notice can no longer pull them into
  view. No finding.
- **`apps/web/src/games/rebellion/test/preloadTable.ts`:** test-only. It warms the lazy `TableScreen` chunk in `beforeAll`
  (60 s hook timeout), so the global `asyncUtilTimeout` stays unchanged. This is not a tuned assertion threshold. No
  finding.
- **e2e TC-E-04:** count fix in `e2e/ai-commander.spec.ts` (it asserts the server-reported fallback text, ru/en). The final
  gate e2e run is green (136 passed).

New findings in round 2: none.

Round-2 verdict: **approved**. F-3 (qa-results), F-4 and F-6 (delivery-report) remain tracked for the next stages, as the
Analyst decided.

## Verdict
approved
