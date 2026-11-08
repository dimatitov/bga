# Review — SWR-005

Reviewer: reviewer (independent subagent; wrote none of the reviewed code)  ·  Author(s) of reviewed code: backend-workers W1–W6b,
frontend-workers FE-0/M/P1/P2, qa-lead (e2e), backend-lead / frontend-lead (INTEGRATION)

Scope: the whole uncommitted working tree vs `ddfa4db` (`git diff ddfa4db --stat`: 124 tracked files, +5015/−1585, plus
untracked new files from `git status`), checked against `specification.md` (Rules rev. 2, D-1..D-7, Contract,
AC-01..AC-16, Clarifications, Data clarifications, Decisions) and `implementation-plan.md`.

Method: I read the code and ran only light read-only commands (`git diff`, `git status`, `grep`, `cat`). Per the brief I
did **not** run tests, lint, typecheck, build or e2e; nothing below says a check "passed" on my authority. Two
things I did check mechanically:
- a scratch Node script compared `src/scenario/core/map.ts` with the JSON in `rebellion-reference.md` §1.6 →
  32 systems, 69 edges, 0 missing, 0 extra, 0 asymmetric, remote and region membership match exactly;
- a `grep` of the existing `apps/web/dist/assets/*.js` (built 18:35 by the running gate): no FNV constants, and the
  string `no system is eligible for the rebel base` is present (see #2).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | blocking | `packages/games/rebellion/src/scenario/core/start-setup.ts:33,86-93`; `packages/games/rebellion/src/schema/data.ts:107-125`; `packages/games/rebellion/src/rules/core/redact.ts:29-37`; pinned by `packages/games/rebellion/test/scenario/core-data.test.ts:406-418` | **Hidden information leak: in 1 of 10 new sessions the Empire knows the base on its first screen.** Bothawui is in the eligible list (`bothawui, dantooine, endor, geonosis, ilum, nal-hutta, rodia, ryloth, tatooine, utapau`, chosen by `fnv1a32(sessionId) % 10`). Bothawui also holds 8 public starting Rebel units (Corvette, Transport, X-wing, Y-wing, 3 troopers, airspeeder; reference §4.2). Under D-6, `locate()` moves **every** Rebel unit in the base system into the hidden zone. So when the base is Bothawui, the Empire view at creation shows Bothawui with 0 Rebel units and 14 units in the zone, including the Corvette and Transport, which never start "on the base". In every other session Bothawui shows 8 units and the zone shows 6. That is a certain, action-free inference of the base system. AC-10 is met only literally (no `systemId` string in responses); the hard rule "секреты одной стороны не попадают другой" is broken. This is not the accepted "Empire's own data in the base system" (W3) and not Q-15 (visible *movement* to or from the base): here nothing moves. Q-BE-1(f) allowed Bothawui, but nobody looked at it together with D-6. TC-E-04 noticed that the base can sit in a system with starting Rebel units, and only adjusted the expected zone count. The path-aware scanner (`hidden-info-core.int.test.ts`) cannot see this, because it looks for the id string and the API fixtures use base Rodia. | Escalate to Analyst: this needs a decision because it changes Q-BE-1(f). Smallest fix: exclude systems that hold starting Rebel units from the candidates. Either derive it in `eligibleRebelBaseSystemIds` (the D-6 consequence) or add `bothawui` to `baseIneligibleSystemIds` and update `rebellion-reference.md`/`rebellion-core-v1.md`. Then update the `core-data.test.ts` snapshot and the AC-02/TC-D-13 expectations. Add a property test: for every eligible base, `coreSideView(createCoreGame(...), 'empire')` at creation is byte-identical across all candidates (same units, locations and zone content). That test would have caught this and guards future data changes. |
| 2 | minor | `scripts/check-web-bundle.mjs:51-61` (`rebel-base-choice-symbol`) | The new regex also looks for `eligibleRebelBaseSystemIds`. That function lives in the web-reachable `./schema` (`data.ts`, W1 decision 2). It reaches the bundle through `CoreDataSchema.superRefine(checkIntegrity)`, a retained top-level call; `dist/assets/index-*.js` contains `no system is eligible for the rebel base`. The minifier mangles the name, so the check passes anyway. This is **not** a leak: the eligibility rule comes from public data, and `chooseRebelBase`/`fnv1a32` are not in the bundle (module check + `web-safe-no-base-choice.test.ts`). But the description gives false assurance that the eligibility code is absent. | Either drop `eligibleRebelBaseSystemIds` from the regex and its description (Q-18 requires only `chooseRebelBase`/`rebelBaseCandidates`), or move the integrity refinement out of the web-reachable schema if you really want it out of the bundle. |
| 3 | minor | `packages/games/rebellion/src/rules/core/base.ts:27`; `docs/game-rules/rebellion-core-v1.md` (D-4 row) | The base is a pure public function of the `sessionId`, and the `sessionId` sits in the URL and in every response: FNV-1a over a list derived from public data. Anyone who has the repository can compute the base offline. D-4 accepted deterministic choice by `sessionId`, so this is a decision and not a defect, but no known-issue entry says so. | Add one sentence to D-4 / known issues (delivery report): "the base can be derived from the session id with the source code; acceptable for a solo companion, replaced by a server secret or seed later". |
| 4 | minor | `apps/web/src/games/rebellion/core-v1/panels/useTurnCommands.ts:134` | D-2 (focus stays on `game-over-title`) was fixed for `FINISH_ACTIVATION`/`PASS` via `responseEndedGame`. `MOVE_PIECES` can also end the game (Empire victory after any move, R-9/Q-12), yet it calls `focusWhenReady(MOVE_TITLE_ID)` unconditionally. The 0-ms tick can find the old move-panel heading before the new view renders and pull focus away from the banner (a race). | Use the same `responseEndedGame(next, events)` guard in `move`, and add a unit test next to the D-2 one. |
| 5 | minor | `packages/games/rebellion/test/server/auto-play-fault.test.ts:20-45`; `apps/api/test/core-ai-autopass.int.test.ts` | TC-AI-12 / Q-27 says integration level: "500, **nothing written** (version unchanged, no event rows)". It is tested only at module level (the module throws, input not mutated). By code reading the API is safe: `module.applyCommand` throws before `repo.commit` in `session-commands.service.ts`, and `ApiExceptionFilter` logs only the error class. No API test pins this for the auto-play path, though. `status.int.test.ts:157` covers the same pre-commit position only for `INVALID_STATUS`. | Optional: one API test that mocks the policy to return `null` and asserts 500 + unchanged row/version/event count. Otherwise record the level change in `qa-results.md`. |
| 6 | nit | `packages/games/rebellion/src/rules/core/helpers.ts:71`; `packages/games/rebellion/src/rules/core/redact.ts:84` | `as CoreEvent` / `as CoreViewEvent` casts weaken type checking at the two places where events are built. They are fine today (drafts are typed with `DistributiveOmit`), but a future event with a system-bearing payload that is added to the pass-through `case` list in `redactCoreEvent` would compile without redaction. | Keep the pass-through list explicit (it is). Consider a `satisfies` or a per-type helper instead of the cast, plus a comment in `redact.ts` that any new event carrying a `systemId` must get its own case. |

### Verified without findings (read, not executed)
- **Three zones.** `rules/core/**`, `ai/**`, `scenario/core/**`, `server/auto-play.ts` have no `Date`, `Math.random`, `node:`, React, Nest or OpenAI (grep). Time comes only from `ctx.now`; `origin` is set only by the server (`rebellion-server-module.ts` hard-codes `'player'`, auto-play sets `'auto'`). Web takes targets only from `legalActions` (`viewModel.ts`, `useCoreMoveDrag.ts`, `useActivateSystem.ts`); `capacityPreview` is the allowed preview (Q-FE-2); `sceneModel.ts` uses adjacency only to draw lanes. Web imports no `rules|scenario|server|ai` subpath (the one `scenario` import is the old test-only one in `locales.i18n.test.ts`). The platform change is limited to `statusOf(state)`. `apps/api` stays game-agnostic: `nextStatus` validates with `SessionStatusSchema`, writes status in the same `updateMany`, and logs only the transition.
- **Hidden information (apart from #1).** `redact.ts` is the single redaction point for view, log and command events. `contestedSystemIds` is computed after redaction. Rebel `SYSTEM_ACTIVATED`/`PIECES_MOVED` touching the base become `null` (Q-15). Everything is visible after the reveal or `outcome` (Q-14/Q-16). `legalActions` for the Empire depend only on its own pieces and all 32 systems. `movement.ts` checks owner before location. Error `details` echo only request fields (`helpers.ts:illegal`). The AI policy gets only `toSideView(state, aiSide)`. Unit ids `u-01…` follow data order and do not depend on the base. The handoff view has 8 keys. `summarize` has no systems. The "Empire's own data in the base system" allowance (W3) is used as decided.
- **Rules vs spec.** The pass lasts until the end of the phase, and a passed side's turn is skipped (`handOver`). Check orders match AM-BE-3 / Q-13 / BE-корректировка / plan §3.3. Pins come only from an own leader. All-or-nothing move with one shared capacity, structures/DSUC immobile, X/Y-wing need no transport. The reveal happens only at an Empire `FINISH_ACTIVATION` of the base with an Empire ground unit (not on activation, not ships or leaders). Empire victory is checked after the reveal and after every move of either side. Rebel victory triggers at `to >= reputation` during refresh (time 14 after 13 refreshes). Refresh returns leaders and does +1 time; Rebels go first every round. A handoff happens only when the side actually changes (also after refresh). At `outcome`: no handoff, no activation, `legalActions` empty, 422 `gameOver` first. Event order is `ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER` (Q-41).
- **Compatibility.** The `legacy-v2.ts` frozen copy is used only by `upcast.ts`. Chains v1→v2→v3 and v2→v3 produce `mock-v1` with `version` unchanged. Unknown versions throw. Mock sessions get `commandUnavailable` for core commands. `statusOf(mock) = prototype`. No Prisma migration (`git diff ddfa4db -- apps/api/prisma` is empty). Several events per version fit the existing `@@unique([sessionId, seq])`. Session creation stores `module.version(state)` (version 2 for AI Rebels).
- **AI auto-pass.** `MAX_AUTO_STEPS = 16`. The loop runs inside one `module.applyCommand` / `createInitialState` call, so there is one commit. A missing move, an engine rejection or exceeding the step limit throws; the messages carry no state data. Each move adds `version + 1` and carries `payload.auto`. In AI games the view and events are always for the player's side (`asSeenByPlayer`).
- **Data.** Map: exact match with reference §1.6 (script above). Capacities: SD 6, AC 4, SSD 8, DS 8, CC 2, RT 4, MC 4, others 0. TIE and ground units need transport. Mon Mothma has `canActivate: false`. First-game setup matches §4.2 unit by unit. Ineligible: Coruscant plus the 5 removed probe cards.
- **Tests.** No `.skip`, `.only` or `.todo`. None of the modified test files lost test cases; counts only grew (for example `hot-seat.spec.ts` 5→8, `sessions.int.test.ts` 15→19). The hidden-info scanner is path-aware and has a self-test of the scanner. The Q-1 replacement table "старый TC → новый" is still due in `qa-results.md` (QA stage).
- **a11y D-1..D-3.** `PassConfirmDialog` refocuses «Отмена» on `onEnter`/`onEntered`. `LeaderPool` no longer handles Space/Enter itself (no double toggle). `responseEndedGame` covers PASS/FINISH (see #4 for MOVE).
- **Assets and secrets.** No `.env`, `.db` or traces among untracked files. The screenshots (~0.2–0.33 MB each) show the project's own graphics (circles and labels, checked `10-empire-hidden-zone.png`). No rights-holder art.

### Gate status at review time (information only, not a finding against the code)
`artifacts/logs/integration-verify.log` (18:34): `EXIT_CODE=1`. rebellion 404/404, web 476/476; api 220 passed,
1 skipped, 1 failed. The failure is `test/migration.int.test.ts` TC-MIG-01/05 "Test timed out in 20000ms" (an SWR-002 migration test,
most likely load-related). `integration-verify-run2.log` showed 2 ESLint errors in `e2e/support/core.ts:125,128`;
they do not appear in the later log's lint step. The final gate belongs to frontend-lead; AC-16 stays unproven until a green run.

### Verdict of review round 1 (history)
changes_requested

Blocking: #1 (base inferable when it is Bothawui). After the fix, re-review only #1 and its tests; #2–#6 may be closed
or recorded as known issues at the authors' / Analyst's discretion.

## Re-review (round 2, after the review-fix of #1)

Read-only again (git diff / grep / cat / find); no tests run by me. Inputs: Analyst decision `specification.md`
«CODE_REVIEW #1 — решение Analyst» (Q-BE-1(f)/R-10 changed: candidates exclude systems with starting Rebel units),
`artifacts/logs/review-fix-be.log` (backend-lead). Files changed since round 1 (by `find -newer integration-verify.log`,
excluding ignored `dist*`): `src/schema/data.ts`, NEW `test/server/base-invariance.test.ts`, `test/rules/core/hidden-info.test.ts`,
`test/schema/data.test.ts`, `test/scenario/core-data.test.ts`, `test/server/core-scenarios.ts`, regenerated `test/fixtures/core/**`
(2 golden, 2 seeds, 5 views), `apps/api/test/{support/core-fixtures.ts,hidden-info-core.int.test.ts,migration.int.test.ts}`,
`docs/game-rules/rebellion-core-v1.md`; plus frontend-lead's `core-v1/panels/useTurnCommands.ts` (#4).

| # | Round-1 severity | Status | Evidence / note |
|---|---|---|---|
| 1 | blocking | **resolved** | `packages/games/rebellion/src/schema/data.ts:103-133`: `eligibleRebelBaseSystemIds` now also drops every system holding a starting Rebel unit placed `kind: 'system'` (derived from data, not a hard-coded id), with the D-6 rationale in the doc comment → 9 candidates (`core-data.test.ts:406-418`, Bothawui gone). The property test I asked for exists and is strong: `test/server/base-invariance.test.ts` forces each of the 9 bases via a searched session id and asserts the Empire view (rules level, 3 opponent settings) and the server-module create path (view + initial events, Empire vs AI) are byte-identical except `id`, plus "no candidate holds a starting Rebel unit". `hidden-info.test.ts:465-500` adds relocation-invariance at creation on mini and real data and removes the skip that had hidden the case. The api fixtures still pin base Rodia (asserted against the DB row); e2e has no hard-coded base or session ids (grep). `rebellion-core-v1.md:16` documents the rule. Decision is Analyst-owned, consistent with R-10's intent (first-game recommendation kept, D-6 consequence added). Log: `review-fix-be.log` — rebellion 411 passed, api 221 passed / 1 skipped, lint, typecheck, build, check:bundle all `EXIT_CODE=0` (backend-lead's run, cited, not mine). Remaining residual (accepted, not a defect): after the start, Rebel *movement* to/from the base is visible as Q-15 decided. |
| 2 | minor | open at time of writing | `scripts/check-web-bundle.mjs:13-14,59-60` still contain `eligibleRebelBaseSystemIds`; Analyst assigned the removal to frontend-lead (in progress). Non-blocking. |
| 3 | minor | accepted as known issue | Analyst decision: known issue (base derivable from `sessionId` with the open code, D-4). Must appear in `delivery-report.md` known issues. |
| 4 | minor | **resolved** | `useTurnCommands.ts` `move`: `if (!responseEndedGame(next, events)) focusWhenReady(MOVE_TITLE_ID)` with an R-9/Q-12 comment. I did not see a dedicated unit test for the MOVE path; frontend-lead's final gate is the evidence. |
| 5 | minor | accepted as known issue / next task | Analyst decision (API-level auto-play-fault test deferred). |
| 6 | nit | open, optional | Unchanged; at the authors' discretion. |
| — | (gate) | info | `migration.int.test.ts:39-43`: per-test `{ timeout: 60_000 }` only for the Prisma-CLI-heavy tests (Analyst decision); global `testTimeout` unchanged — not a weakening of assertions. |

Regenerated fixtures: they are base-dependent snapshots (new session ids → base Rodia as before for the api ids; golden
`core-scenarios.ts` still scripts Rebels via Bothawui → Rodia), consistent with the decision "перегенерировать, проверив, что
меняется только ожидаемое"; I did not diff every JSON line, only confirmed the scripts/ids that drive them.

Final `pnpm verify`: at the time of this re-review no newer `integration-verify.log` than 18:34 exists (frontend-lead is
running it after #2/#4). AC-16 remains for INTEGRATION/QA to prove; my verdict covers the code only.

### Verdict of round 2 (history)
approved

No blocking or major findings remain: #1 resolved with a data-derived rule and a base-invariance property test; #4 resolved;
#3/#5 recorded as known issues by Analyst; #2 (minor) and #6 (nit) may still be closed by frontend-lead without re-review.

## Delta review (round 3, after the final gate)

Changes since round 2, read via `git diff ddfa4db -- <file>`. I also ran light checks myself:
- `pnpm exec vitest run src/app/layout/RouteFocus.test.tsx src/games/rebellion/core-v1/panels/useTurnCommands.focus.test.tsx`
  (in `apps/web`) → 2 files, 4 tests passed (19:22);
- `node --test scripts/check-web-bundle.test.mjs` → 11 pass, 0 fail.

| Item | Result | Note |
|---|---|---|
| `apps/web/src/app/layout/RouteFocus.tsx` (platform layout, used once in `AppLayout.tsx:28`) | OK | The "first run" flag is replaced by the last handled `pathname`. With StrictMode's double mount the second effect sees the same pathname and does not start polling `#main h1`, so focus is no longer stolen on the initial load (flaky TC-VA-10). A real route change still focuses the new `<h1>`, and returning to an earlier path works because `handled` is updated on every change. This is game-agnostic, so the platform boundary is respected. Nit: `RouteFocus.test.tsx` mounts `RouteFocus` inside each route's page, not in a persistent layout as in production. The route-change case passes because React keeps the same `<Page>` instance across the two routes. A test with a layout route would mirror `AppLayout` exactly. Optional. |
| `core-v1/panels/useTurnCommands.ts` + NEW `useTurnCommands.focus.test.tsx` (#4) | resolved, now tested | The `move` callback uses `responseEndedGame`. The test checks both sides: a game-ending move leaves focus on `game-over-title` and never calls `focusWhenReady(MOVE_TITLE_ID)`; a regular move still does. |
| `scripts/check-web-bundle.{mjs,test.mjs}` (#2) | resolved | The useless `eligibleRebelBaseSystemIds` pattern is removed, and the comment explains why (minified names; absence of the code is the module check's job). `chooseRebelBase`/`rebelBaseCandidates` are still searched as names, string literals and keys. New tests cover positive and negative cases (including an explicit no-false-positive case for the schema helper) and a CLI failure on a leak. |
| `apps/web/vitest.config.ts` `testTimeout: 15000` | OK | Web only, with a comment. This was an Analyst decision (INTEGRATION) for parallel `pnpm -r test` load. No assertion is weakened. |

Final gate (frontend-lead's run, cited and not repeated by me): `artifacts/logs/integration-verify.log` (19:21) — platform
65/65, forbidden-stars 5/5, rebellion 411/411, web 480/480, api 221 passed / 1 skipped, check:bundle OK (6 rules, module check:
only definition/schema/board/assets), e2e `106 passed`, `EXIT_CODE=0`.

Open, non-blocking: #6 (nit, optional); the RouteFocus test-composition nit above. #3 and #5 are known issues by Analyst decision
(#3 must appear in `delivery-report.md`).

## Verdict
approved

No blocking, major or open minor findings in the code. #1, #2 and #4 are resolved; #3 and #5 are Analyst-accepted known issues; #6 and the RouteFocus
test nit are optional.
