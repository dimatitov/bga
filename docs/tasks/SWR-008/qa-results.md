# QA results — SWR-008

QA_EXECUTION, qa-lead (Claude Code subagent; wrote none of the SWR-008 code), 2026-11-20, 14:03–14:15 UTC.
Tree: `main` at `3fe4a66` (merge of PR #1) plus the uncommitted SWR-008 code with the review fixes (round 2 `approved`), the same tree as
`artifacts/logs/final-verify.log`. All commands ran on Node v22.23.5 (`nvm use`). QA did **not** change product code or tests, did not
run `pnpm install` and did not re-run `pnpm verify` (no targeted run showed a regression). QA **made no OpenAI request**: the
only real run (TC-MEAS-01, AC-15) was made by the Analyst (`artifacts/logs/bench-real.log`), and QA reviewed its report.
`apps/api/.env` was not read. `apps/api/prisma/dev.db` was not touched (its mtime is the same before and after, see `artifacts/logs/qa-rs06-devdb.log`).
Browser QA used a throwaway Playwright spec **outside the repository** (scratchpad). Its text is appended to `artifacts/logs/qa-browser-diag08.log`. No traces were written.

## Runs made by QA

| Run | Command (cwd) | Result | Log |
|---|---|---|---|
| Rebellion targeted | `npx vitest run --reporter=verbose test/rules/core test/knowledge test/ai/rules-query.test.ts test/ai/decision.test.ts test/server test/benchmark` (`packages/games/rebellion`) | 32 files, **542 passed**, exit 0 | `artifacts/logs/qa-rebellion.log` |
| Platform targeted | `npx vitest run --reporter=verbose test/rules-context.test.ts test/rules-kb test/ai-diagnostics.test.ts test/automation.test.ts` (`packages/platform`) | 12 files, **290 passed**, exit 0 | `artifacts/logs/qa-platform.log` |
| API hidden info + prompt scan (QD-29) | `npx vitest run --reporter=verbose test/rules-hidden-info.int.test.ts` (`apps/api`) | 6 passed, exit 0; `scannedBeforeReveal=196` | `artifacts/logs/prompt-scan.log` |
| API targeted (38 files/dirs: rules-*, disc009-restore, automation-*, automation/, ai/, dev-ai-*, bench/, migration*, architecture, game-registry, env*, routes, sqlite-adapter, …) | `npx vitest run --reporter=verbose …` (`apps/api`; no other vitest was running in `apps/api`) | 58 files, **660 passed, 1 skipped** (opt-in TC-RS-06), exit 0 | `artifacts/logs/qa-api.log` |
| API opt-in on DB copies | `SWR008_DEV_DB=prisma/dev.pre-swr008.db … migration-swr008`, `SWR005_DEV_DB=prisma/dev.pre-swr005.db … dev-db-upgrade` | 5 passed, then 1 passed; the sha256 of both backups is the same before and after | `artifacts/logs/qa-rs06-devdb.log` |
| Web targeted | `npx vitest run --reporter=verbose src/dev/ai src/platform/automation src/platform/session-host …/AiTurnSummary.test.tsx src/shared/i18n/locales.test.ts` (`apps/web`) | 13 files, **136 passed**, exit 0 | `artifacts/logs/qa-web.log` |
| E2E diagnostics | `pnpm run build:packages && npx playwright test e2e/ai-diagnostics.spec.ts` (ports 3100/5174 free) | **3 passed**, exit 0 | `artifacts/logs/qa-e2e-diagnostics.log` |
| Browser QA TC-DIAG-08 | scratch spec outside the repo, same web servers (bot API, Vite dev), ru/en × 1440/375 | run 4: **4 passed**. Runs 1–2 failed on bugs in my scratch spec, not in the product (see the log header). Run 3: 4 passed | `artifacts/logs/qa-browser-diag08.log` |
| Static checks | grep / `git diff` / `stat` (TC-D-31, TC-CT-01/02/08, TC-ARB-07, TC-RS-04, TC-COST-04, TC-H-10, TC-DIAG-03, TC-WF-03) | see below | `artifacts/logs/qa-static.log` |
| Test diff (TC-R-03) | `git diff --numstat HEAD` of tests + removed declarations | see table «TC-R-03» | `artifacts/logs/qa-test-diff.log` |
| Real benchmark review (TC-MEAS-*) | node read of `real-20261120-140206.json`, secret grep | see «AC-15» | `artifacts/logs/qa-meas.log` |
| CI | `gh run list --repo dimatitov/bga --branch main --limit 3`, `gh run view 44742036738` | base `3fe4a66`: **success**. SWR-008: not pushed | `artifacts/logs/qa-ci.log` |
| check-task negative (TC-WF-02) | `node scripts/check-task.mjs <scratch copies>` | exit 1, [R3]/[R4] and [R5] | `artifacts/logs/qa-check-task-negative.log` |
| check-task | `node scripts/check-task.mjs docs/tasks/SWR-008` | exit 0 | `artifacts/logs/qa-check-task.log` |

Final gate (read by QA, not re-run): `artifacts/logs/final-verify.log`, start 13:53:36Z, `exit=0`. The chain is
`pnpm lint && typecheck && test && build && check:bundle && e2e`:
- eslint + prettier: «All matched files use Prettier code style!»;
- scripts: 449/449;
- platform: 17 files / 366;
- forbidden-stars: 5;
- rebellion: 71 / 875;
- web: 71 / 647;
- api: 81 files + 1 skipped, 863 passed + 2 skipped;
- check:bundle: «845 sources … 0 apps/web/src/dev modules»;
- e2e: **139 passed**.

The Vitest default reporter in that log prints only totals, so QA's targeted re-runs use `--reporter=verbose`. Those logs give the TC → test name mapping.
The 500 lines `ERROR [ApiExceptionFilter]` in the api part of the log come from the negative tests of earlier tasks (DB failure, corrupt rows). Their files are green.

### Regression (TC-R-01, AC-16): counts against the baseline

| Suite | Baseline before SWR-008 | `final-verify.log` |
|---|---|---|
| scripts | 449 (`deps-merge-verify-2.log`) | 449 |
| platform | 230 | 366 |
| forbidden-stars | 5 | 5 |
| rebellion | 606 | 875 |
| web | 598 | 647 |
| api | 611 + 1 skipped | 863 + 2 skipped (new opt-in TC-RS-06) |
| e2e | 136 (`deps-merge-verify-3.log`, exit 0) | 139 (+3 `ai-diagnostics.spec.ts`) |

No suite lost cases.

## Executed

Per TC: priority, covered AC, status, the test(s) that implement the case, and the log with the passing run. The test names
carry the TC ids. The mapping counts only SWR-008 test files: new ones, or changed ones whose added lines name that id. This keeps out the
same-named ids of earlier tasks. Totals: **160 TC: 154 passed, 2 failed, 4 not_run**.

| Priority | passed | failed | not_run | Total |
|---|---|---|---|---|
| P0 | 98 | 0 | 3 (TC-WF-01, TC-MEAS-03, TC-R-02) | 101 |
| P1 | 49 | 2 (TC-ST-05, TC-H-11) | 1 (TC-WF-03) | 52 |
| P2 | 7 | 0 | 0 | 7 |

| TC | P | AC | Status | Test(s) | Evidence |
|---|---|---|---|---|---|
| TC-WF-01 | P0 | AC-1 | not_run | `node scripts/check-task.mjs docs/tasks/SWR-008` | `artifacts/logs/qa-check-task.log` — Run at QA time: exit 0. The precondition (every stage up to DELIVERY closed) is not met yet; the Analyst re-runs it at DELIVERY |
| TC-WF-02 | P1 | AC-1 | passed | check-task on 2 scratch COPIES (DELIVERY passed after pending + missing artifact; AC passed with empty evidence) | `artifacts/logs/qa-check-task-negative.log` — exit 1 with [R3]/[R4] and [R5]; originals untouched |
| TC-WF-03 | P1 | AC-1 | not_run | `stat` birth/mtime | `artifacts/logs/qa-static.log` — Cannot be verified: the task files are untracked (no git history). Rewrites reset the birth time (test-cases.md birth = mtime = 15:08, after its reconciliation with the plans; the first SWR-008 code is at 14:53–14:56). The Coverage table does list AC-1..AC-16 (read by QA) |
| TC-CT-01 | P0 | AC-2 | passed | `packages/platform/test/rules-context.test.ts` | `artifacts/logs/qa-platform.log` |
| TC-CT-02 | P0 | AC-2 | passed | `apps/api/test/architecture.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-CT-03 | P0 | AC-2 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-CT-04 | P1 | AC-2 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-CT-05 | P0 | AC-2, AC-11 | passed | `apps/api/test/rules-context-registry.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-CT-06 | P1 | AC-2 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-CT-07 | P1 | AC-2 | passed | read `docs/architecture/rules-knowledge.md` §8 | `docs/architecture/rules-knowledge.md` — §8.1–8.6: input (QD-7), C1..C5, version (QD-5), F-7 engine scope, «Игра без базы знаний» |
| TC-CT-08 | P2 | AC-2 | passed | `packages/platform/test/rules-context.test.ts` | `artifacts/logs/qa-platform.log` |
| TC-INT-01 | P0 | AC-3 | passed | `apps/api/test/rules-integration.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-02 | P0 | AC-3, AC-4 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/rules-integration.int.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-03 | P1 | AC-3 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-04 | P0 | AC-3 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/rules-integration.int.test.ts`, `apps/api/test/rules-context-registry.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-05 | P0 | AC-3 | passed | `apps/api/test/rules-context-registry.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-06 | P0 | AC-3 | passed | `apps/api/test/ai/prompt.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-07 | P0 | AC-3 | passed | `apps/api/test/rules-off-golden.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-08 | P1 | AC-3 | passed | `apps/api/test/ai/prompt.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-09 | P1 | AC-3 | passed | `apps/api/test/env.unit.test.ts`, `apps/api/test/env-example.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-INT-10 | P2 | AC-3 | passed | `apps/api/test/rules-context-registry.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-SEL-01 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-02 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-03 | P1 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-04 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-SEL-05 | P1 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-context.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-SEL-06 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-07 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-SEL-08 | P0 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-09 | P1 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts`, `apps/api/test/env.unit.test.ts`, `apps/api/test/rules-context-registry.int.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log` |
| TC-SEL-10 | P1 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-SEL-11 | P0 | AC-4, AC-6 | passed | `packages/platform/test/rules-context.test.ts` | `artifacts/logs/qa-platform.log` |
| TC-SEL-12 | P1 | AC-4 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-ST-01 | P0 | AC-5 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-ST-02 | P1 | AC-5 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-ST-03 | P0 | AC-5 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-ST-04 | P1 | AC-5 | passed | `apps/api/test/ai/prompt.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-ST-05 | P1 | AC-5 | failed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` › «every combination (… TC-ST-05)» | `artifacts/logs/qa-rebellion.log` — The test is green, but it checks the «no combat/missions/production/probes» part only for phase `command`. By the test's own comment, build rules are selected in `refresh` (the TC asks for every TC-SEL-06 combination) → D-1 (minor). The `appliesTo.commands ⊆ CORE_COMMAND_TYPES` part holds for all phases |
| TC-ST-06 | P2 | AC-5 | passed | read `docs/architecture/rules-knowledge.md` §8.5 + KB (`rules-provider.test.ts`) | `docs/architecture/rules-knowledge.md` |
| TC-H-01 | P0 | AC-6a | passed | `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/prompt-scan.log` |
| TC-H-02 | P0 | AC-6a | passed | `packages/games/rebellion/test/ai/rules-query.test.ts` | `artifacts/logs/qa-rebellion.log` — W4 set: 30 SEEDS_P games (9 difficulty pairs), 4213 + 1719 relocations; E-HUNT is not in this set (O-3) |
| TC-H-03 | P0 | AC-6a | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/qa-api.log`, `artifacts/logs/prompt-scan.log` |
| TC-H-04 | P0 | AC-6b | passed | `apps/api/test/rules-hidden-info.int.test.ts` › «TC-H-04 / TC-H-05 / TC-H-08 …» | `artifacts/logs/prompt-scan.log` — QD-29 scan: 4 AI-Empire games played to the end, 196 requests before the reveal scanned, 0 hits |
| TC-H-05 | P0 | AC-6c | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/qa-api.log`, `artifacts/logs/prompt-scan.log` |
| TC-H-06 | P1 | AC-6 | passed | `packages/games/rebellion/test/ai/rules-query.test.ts`, `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/prompt-scan.log` |
| TC-H-07 | P0 | AC-6d | passed | `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/prompt-scan.log` |
| TC-H-08 | P1 | AC-6 | passed | `apps/api/test/rules-hidden-info.int.test.ts` | `artifacts/logs/prompt-scan.log` |
| TC-H-09 | P1 | AC-6 | passed | `packages/games/rebellion/test/benchmark/scenarios.test.ts`, `apps/api/test/bench/harness-mock.int.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| TC-H-10 | P0 | AC-6 | passed | existing `apps/api/test/automation-hidden-info.int.test.ts`, `apps/api/test/hidden-info-core.int.test.ts`, `packages/games/rebellion/test/server/automation-hidden-base.test.ts`, `packages/games/rebellion/test/rules/core/hidden-info.test.ts`; `e2e/core-hidden-base.spec.ts` | `artifacts/logs/qa-api.log`, `artifacts/logs/qa-rebellion.log`, `artifacts/logs/final-verify.log`, `artifacts/logs/qa-static.log` — diffs: additions only, plus in automation-hidden-base one assertion split into the same `toEqual` + a new input check (not weakened). The relocateBase guard (QD-20) excludes the now-unreachable «hidden base under Imperial ground» states |
| TC-H-11 | P1 | AC-6 | failed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` › «hidden information guard» + QA scan of the KB | `artifacts/logs/qa-static.log`, `artifacts/logs/qa-rebellion.log` — The guard checks the ids of all AI-eligible entries, but the texts only of the rules selectable in `command`. 4 verified AI-eligible entries name systems in their text → D-1 (minor) |
| TC-ARB-01 | P0 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-ARB-02 | P0 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-ARB-03 | P0 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` › «TC-ARB-02 / 03 / 04 / 05: hostile answers …» | `artifacts/logs/qa-api.log` |
| TC-ARB-04 | P0 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` › «TC-ARB-02 / 03 / 04 / 05 …» (COMBAT, DEPLOY, REVEAL_BASE, PROBE, extra `command`) | `artifacts/logs/qa-api.log` |
| TC-ARB-05 | P1 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-ARB-06 | P0 | AC-7 | passed | `packages/games/rebellion/test/ai/decision.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-ARB-07 | P1 | AC-7 | passed | `apps/api/test/architecture.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-ARB-08 | P1 | AC-7 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-D-01 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-02 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-03 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-04 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-05 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-06 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-07 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-08 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-09 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-10 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-11 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-12 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-13 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-14 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-15 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-16 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-17 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-18 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-19 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-20 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-21 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-22 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-23 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-24 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-25 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-26 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-27 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-28 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-29 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-30 | P1 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-31 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-32 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/reveal-invariant.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-33 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/reveal-invariant.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-34 | P0 | AC-8 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-35 | P0 | AC-8 | passed | `apps/api/test/disc009-restore.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-D-36 | P0 | AC-8 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-D-37 | P0 | AC-8 | passed | `packages/games/rebellion/test/knowledge/{coverage,discrepancies,generated-docs,validate,search}.test.ts` + grep `revealsBaseNow` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-static.log` — `revealsBaseNow`: 0 matches in src / knowledge / docs/game-rules |
| TC-RS-01 | P0 | AC-9 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts`, `apps/api/test/disc009-restore.int.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| TC-RS-02 | P0 | AC-9 | passed | `apps/api/test/disc009-restore.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-RS-03 | P0 | AC-9 | passed | `apps/api/test/disc009-restore.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-RS-04 | P1 | AC-9 | passed | `packages/games/rebellion/test/rules/core/state-checks.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-RS-05 | P1 | AC-9 | passed | `apps/api/test/disc009-restore.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-RS-06 | P2 | AC-9 | passed | `SWR008_DEV_DB=prisma/dev.pre-swr008.db` migration-swr008 opt-in + `SWR005_DEV_DB=prisma/dev.pre-swr005.db` dev-db-upgrade (copies only) | `artifacts/logs/qa-rs06-devdb.log` — sha256 of both backups unchanged; `dev.db` mtime unchanged |
| TC-BUD-01 | P0 | AC-10 | passed | `apps/api/test/ai/ai-decision-service.unit.test.ts`, `apps/api/test/ai/prompt.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-02 | P0 | AC-10 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-03 | P0 | AC-10 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-04 | P0 | AC-10 | passed | `apps/api/test/ai/prompt-fit.unit.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-05 | P0 | AC-10 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/ai/prompt-fit.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-06 | P0 | AC-10 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/ai/prompt-fit.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-07 | P0 | AC-10 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/ai/prompt-fit.unit.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-08 | P1 | AC-10 | passed | `apps/api/test/ai/prompt-fit.unit.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-09 | P1 | AC-10 | passed | `apps/api/test/env.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BUD-10 | P0 | AC-10 | passed | existing `apps/api/test/ai/budget.int.test.ts`, `ai/ai-decision-service.unit.test.ts`, `ai/reset-ai-budget.int.test.ts`, `automation-openai.int.test.ts` | `artifacts/logs/qa-api.log` — expectations not changed (diff: additions, plus `rulesContext: 'off'` in the SWR-006 helper, QD-27), `artifacts/logs/qa-test-diff.log` |
| TC-BUD-11 | P1 | AC-10 | passed | `apps/web/src/platform/automation/automation.test.tsx` P-8; `AiTurnSummary.test.tsx`; `e2e/ai-diagnostics.spec.ts` «E-1 / AC-10 … AI_PROMPT_TOO_LARGE (ru, en)» | `artifacts/logs/qa-web.log`, `artifacts/logs/qa-e2e-diagnostics.log` |
| TC-FB-01 | P0 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-02 | P0 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-03 | P1 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-04 | P0 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-05 | P0 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-06 | P1 | AC-11 | passed | `packages/games/rebellion/test/knowledge/rules-provider.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| TC-FB-07 | P0 | AC-11 | passed | existing SWR-006 fallback cases in `automation-openai.int.test.ts`, `automation-f3-coverage.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-FB-08 | P1 | AC-11 | passed | `e2e/ai-commander.spec.ts` (spec unchanged: `git diff` empty) | `artifacts/logs/final-verify.log` — e2e server `bot`, OPENAI_* blank |
| TC-FB-09 | P1 | AC-11 | passed | `apps/api/test/automation-rules.int.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts`, `apps/api/test/automation/commander-context.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-01 | P0 | AC-12 | passed | `apps/api/test/ai/ai-usage-repository.int.test.ts`, `apps/api/test/ai/ai-decision-service.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-02 | P0 | AC-12 | passed | `apps/api/test/ai/ai-usage-repository.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-03 | P1 | AC-12 | passed | `apps/api/test/dev-ai-diagnostics.int.test.ts`, `apps/api/test/ai/cost-by-rules.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-04 | P0 | AC-12 | passed | `apps/api/test/ai/ai-usage-repository.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-05 | P1 | AC-12 | passed | `apps/api/test/ai/ai-decision-service.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-COST-06 | P0 | AC-12 | passed | `apps/api/test/migration-swr008.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-DIAG-01 | P0 | AC-13 | passed | `apps/web/src/dev/ai/session/DevAiSessionDiagnostics.test.tsx` D-1 | `artifacts/logs/qa-web.log` |
| TC-DIAG-02 | P0 | AC-13 | passed | `apps/web/src/platform/session-host/SessionHost.test.tsx` D-2 (DEV=false) | `artifacts/logs/qa-web.log` |
| TC-DIAG-03 | P0 | AC-13 | passed | `pnpm check:bundle` (final verify) + grep of `apps/web/dist` | `artifacts/logs/final-verify.log`, `artifacts/logs/qa-static.log` — «0 apps/web/src/dev modules»; `dev-ai-session` / `aiTableDiagnostics` in dist: 0 files |
| TC-DIAG-04 | P0 | AC-13 | passed | `apps/api/test/dev-ai-diagnostics.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-DIAG-05 | P0 | AC-13, AC-6d | passed | `apps/api/test/dev-ai-diagnostics.int.test.ts` (API part); `apps/web/src/dev/ai/session/api.test.ts` D-6, `DevAiSessionDiagnostics.test.tsx` D-7 (FE part) | `artifacts/logs/qa-api.log`, `artifacts/logs/qa-web.log` — The panel labels contain the word «prompt» (the note «Prompt text … are not shown», the label «dropped by the prompt limit», QD-9). They have no prompt content, and the FE test D-7 deliberately allows the word (O-1) |
| TC-DIAG-06 | P2 | AC-13 | passed | `DevAiSessionDiagnostics.test.tsx` D-5 | `artifacts/logs/qa-web.log` |
| TC-DIAG-07 | P1 | AC-13 | passed | `e2e/ai-diagnostics.spec.ts` | `artifacts/logs/qa-e2e-diagnostics.log` |
| TC-DIAG-07b | P2 | AC-13 | passed | `e2e/ai-diagnostics.spec.ts` | `artifacts/logs/qa-e2e-diagnostics.log` |
| TC-DIAG-08 | P1 | AC-13 | passed | browser QA: scratch Playwright spec outside the repo (bot API, flag on, `page.route` diagnostics fixture with real KB ids, patched OpenAI run with AI_PROMPT_TOO_LARGE), ru/en × 1440/375 | `artifacts/logs/qa-browser-diag08.log`, `artifacts/screenshots/swr008-dev-diagnostics-ru-1440.png` — See «Browser QA» |
| TC-DIAG-09 | P0 | AC-13 | passed | `SessionHost.test.tsx` D-3, D-4; `DevAiPage.test.tsx` / `diagnosticsFlag.test.ts` D-11 | `artifacts/logs/qa-web.log` |
| TC-DIAG-10 | P1 | AC-13 | passed | `apps/api/test/dev-ai-diagnostics.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-01 | P0 | AC-14 | passed | `packages/games/rebellion/test/benchmark/scenarios.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-BEN-02 | P0 | AC-14 | passed | `packages/games/rebellion/test/benchmark/scenarios.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-BEN-03 | P1 | AC-14 | passed | `packages/games/rebellion/test/benchmark/scenarios.test.ts` | `artifacts/logs/qa-rebellion.log` |
| TC-BEN-04 | P0 | AC-14 | passed | `apps/api/test/bench/harness-mock.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-05 | P0 | AC-14 | passed | `apps/api/test/bench/metrics.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-06 | P1 | AC-14 | passed | `apps/api/test/bench/metrics.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-07 | P1 | AC-14 | passed | `apps/api/test/bench/harness-mock.int.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-08 | P0 | AC-14 | passed | `apps/api/test/bench/cli.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-09 | P0 | AC-14 | passed | `apps/api/test/bench/cli.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-10 | P0 | AC-14 | passed | `apps/api/test/bench/cli.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-11 | P1 | AC-14 | passed | `apps/api/test/bench/cli.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-BEN-12 | P2 | AC-14 | passed | read `packages/games/rebellion/benchmark/README.md` | `packages/games/rebellion/benchmark/README.md` — rubric 1/0.5/0/0.25, unjustified PASS, mock/real/dry-run commands, `--real`, `--max-usd`, `--repeats`, `--role`, `--out`, report path |
| TC-BEN-13 | P1 | AC-14, AC-15 | passed | `apps/api/test/bench/metrics.unit.test.ts` | `artifacts/logs/qa-api.log` |
| TC-MEAS-01 | P0 | AC-15 | passed | Analyst: `bench:ai -- --real --max-usd 1 --repeats 3` (QA made no OpenAI call); QA checked the report | `artifacts/benchmark/real-20261120-140206.json`, `artifacts/logs/bench-real.log`, `artifacts/logs/qa-meas.log` — mode real, 3 variants, 3 repeats in each of 42 cells, spent 8932 µUSD ≤ 1 000 000, rulesVersion, generatedAt; `model` = configured id `gpt-6-luna` (O-2) |
| TC-MEAS-02 | P0 | AC-15 | passed | QA review of the real report | `artifacts/logs/qa-meas.log`, `artifacts/benchmark/real-20261120-140206.md` — real: 84/84 attempts `provider=openai`, 84/84 nonzero input tokens, 79 distinct durations; verdicts: quality `no-measurable-effect`, cost/tokens `rules-worse`; `stopped: null` |
| TC-MEAS-03 | P0 | AC-15 | not_run | — | `artifacts/benchmark/mock-20261120-125656.md` — The precondition did not occur: the real run was possible and was made. The mock report says «NOT a measurement of a model» |
| TC-MEAS-04 | P1 | AC-15 | passed | Σ of the report decisions vs `usageByRules` (`summarizeCostByRules`) | `artifacts/logs/qa-meas.log` — with rules 4862 µUSD / 95214 in; without 4070 / 36576: equal |
| TC-R-01 | P0 | AC-16 | passed | `pnpm verify` (final, by the orchestrator; QA read the log) | `artifacts/logs/final-verify.log` — exit=0; ≥ baseline in every suite (see «Regression») |
| TC-R-02 | P0 | AC-16 | not_run | `gh run list --repo dimatitov/bga --branch main --limit 3` | `artifacts/logs/qa-ci.log` — SWR-008 is not committed or pushed. CI for the base `3fe4a66` (PR #1 merge) is success |
| TC-R-03 | P0 | AC-16 | passed | `git diff --numstat HEAD` of the tests + review of the removed lines | `artifacts/logs/qa-test-diff.log` — See the table «TC-R-03» |
| TC-R-04 | P1 | AC-16 | passed | `node --test scripts/` (within verify) | `artifacts/logs/final-verify.log` — 449/449 |
| TC-R-05 | P0 | AC-16 | passed | `pnpm e2e` within verify (incl. core-hidden-base, core-victory, ai-commander, dev-ai, ai-diagnostics) | `artifacts/logs/final-verify.log`, `artifacts/logs/qa-e2e-diagnostics.log` — 139 passed (baseline 136 + 3 new) |

## TC-H-04 prompt scan (QD-29) — `artifacts/logs/prompt-scan.log`

`apps/api/test/rules-hidden-info.int.test.ts` uses a real Nest app, the real Rebellion module and KB, and the real OpenAI SDK on a fake fetch (no network). Every request is recorded raw.
- TC-H-04/05/08: 4 AI-Empire games (`swr008-w10-h04-a/a2/b/b2`, R-ACTIVE and R-PASSIVE human Rebels), all played to the end (`outcome=rebels`).
  **196 requests made before the reveal were scanned: 0 hits.** The scan looks for the base id, its en/ru names, Rebel units in the base and `rebelBase`. It covers the rules block, the objective, the URL and the headers, and every situation line except the Empire's own public lines (candidates, own forces/leaders/activation, the list of possible base locations).
  The log lines and AiUsage rules columns do not name the base. No request carries the session id/budget key, the sentinel key outside `authorization`, the budget sums, the DB path or the KB root.
- TC-H-01: two copies that differ only in the base (ryloth/tatooine). R-PASSIVE: 50 byte-identical requests, then the reveal. R-ACTIVE: 49/49 identical; `diverged=false` in both.
- TC-H-03 (AI Rebels): 13 identical requests. TC-H-07: 13 decisions, 72 Empire-addressed bodies clean; the diagnostics are equal in both copies.

## Browser QA TC-DIAG-08 — screenshots in `artifacts/screenshots/`

Setup: human Empire vs AI Rebels on the bot e2e API and Vite dev web; the `/dev/ai` switch on (`enableTableDiagnostics`). `GET …/decisions` is answered with
`page.route` by a fixture that passes the wire schema. It has 3 decisions with real Rebellion KB ids and `rulesVersion` `rebellion@1:55b423d7bfef`: ok with 17 rules, an `AI_TIMEOUT` fallback with 19 rules, and ok with rules dropped by the
prompt limit. The next command response is patched to an OpenAI run with `AI_PROMPT_TOO_LARGE`.
Files: `swr008-dev-diagnostics-{ru,en}-{1440,375}.png` (page), `swr008-dev-diagnostics-panel-{ru,en}-{1440,375}.png` (panel, top),
`swr008-dev-diagnostics-panel-rules{17,19}-{ru,en}-{1440,375}.png` (panel scrolled to the rows with ids).

- Visible: the rule count («правил: 17 / 19 / 0», «rules: …»), the rule ids, the context tokens («контекст правил ≈ 1 268 ток.»), the cost per call and
  the totals with rules / without rules / total, the fallback («fallback: AI_TIMEOUT нет ответа вовремя»), «сняты лимитом промпта» / «dropped by the
  prompt limit», and «Последний ход AI: fallback: AI_PROMPT_TOO_LARGE запрос к модели слишком большой». Locale ru and en both work.
- Hidden data: the human is the Empire and the base is hidden (`rebelBase {systemId:null, revealed:false}`). No system id or name in the panel (checked against all
  32 ids). The session id is not in the panel (its only DOM occurrence is the pre-existing hidden `game-info` tab, outside the panel). No situation, reason or budget text and no prompt text.
- Layout: at 1440 the panel floats over the left part of the map; the top bar and the right Turn panel stay free. At 375 the expanded panel covers most of the screen,
  and its chip covers part of the AI fallback notice. In the id list a lone comma wraps onto its own line → D-3 (minor, dev-only).

## AC-15: real benchmark (by the Analyst; QA review in `artifacts/logs/qa-meas.log`)

The report is `artifacts/benchmark/real-20261120-140206.json` / `.md`; the run log `artifacts/logs/bench-real.log` ends with `exit=0`.
- Mode `real`; model `gpt-6-luna`, role `tactical`.
- 14 scenarios × 3 variants × 3 repeats: 126 decisions, 42 cells of exactly 3. 84 model calls, all logged as `provider=openai`; all have nonzero input tokens, and they show 79 distinct latencies.
- Spent **8932 µUSD ($0.008932)**, under the $1 cap; the worst-case plan was $0.209592; `stopped: null`.
- Secret grep (`sk-`, `Bearer`, `api_key`, `authorization`, `OPENAI_API_KEY`) of the log and both report files: 0.

The report's conclusion is honest:
- **quality: no measurable effect**: goalScore Δ −0.071, CI [−0.178, 0.035]; expectedHit Δ −0.024, CI includes 0;
- **cost: rules-worse**: +18.9 µUSD per decision, CI [7.9, 29.8]; +1396 input tokens per decision;
- latency: no measurable effect.

TC-MEAS-04: the Σ over the report decisions equals `usageByRules`. With rules: 4862 µUSD / 95214 in / 2057 out. Without rules: 4070 / 36576 / 1962.

## TC-R-03: changed or deleted existing tests (old → new, reason) — `artifacts/logs/qa-test-diff.log`

Tracked test files changed against `HEAD`: 34, mostly additions. New SWR-008 test files: 27. Removed test declarations: only the rows below.

| File | Old → new | Reason |
|---|---|---|
| `packages/games/rebellion/test/knowledge/context.test.ts` | Rewritten (W3). Removed: «Command Phase context for the %s» ×5 cases, «marks needs-review entries as unverified». Added: «Command Phase context: %s» over 16 public inputs: fits without truncation; engine scope first; no needs-review and no «(unverified)»; no missions/combat; one line per entry; deterministic + rulesVersion. «side filtering» is kept; «tags …» added. «buildRulesContext defaults are unchanged … still only marked (unverified)» keeps the old default. Truncation → TC-SEL-07 in `rules-provider.test.ts` | AM-BE-1/QD-7: the input is the public `rulesQuery`; A-1/QD-4: needs-review excluded |
| `packages/games/rebellion/test/knowledge/coverage.test.ts` | «cites only tests that SWR-006 does not edit» → «cites only stable engine tests …»; regex `+ state-checks\|reveal-invariant` | QD-21 |
| `apps/web/src/dev/ai/DevAiPage.test.tsx` | T-12: «4 h2» → «5 h2 (+ table diagnostics)» | FE-2: new card on `/dev/ai` |
| `apps/api/test/migration-swr005b.int.test.ts` | exact migration list + `20261120120000_ai_usage_rules`; `PRAGMA table_info` compares the first 16 columns; the SWR-005 shape = migrations before SWR-005B | QD-24 (new ADD COLUMN migration) |
| `apps/api/test/migration-swr004.int.test.ts`, `migration.int.test.ts` | + the new migration name in the expected lists | new migration |
| `apps/api/test/game-registry.int.test.ts` | TC-ARCH-04: the `readdirSync` ban allows exactly `src/rules-context/knowledge-base.loader.ts` (the allow-list itself is asserted) | QD-22 |
| `apps/api/test/automation-openai.int.test.ts`, `automation-f3-coverage.int.test.ts` | helper `openaiApp`: `rulesContext: 'off'`; a stale comment fixed. Expectations unchanged | QD-27: the SWR-006 baseline without rules; rules on → `automation-rules.int.test.ts` |
| `apps/api/test/automation-runner.int.test.ts` | TC-CC-04: `setTimeout(150)` → barrier `reachedGate(1)` of both runs; expectation `['conflict','humanTurn']` not weakened | review F-1 (flake) |
| `apps/api/test/automation/openai-commander-strategy.unit.test.ts` | `startRun({…})` → `startRun({…, rules: null})` (15 call sites), imports | C-10: new field of `CommanderRunContext` |
| `apps/api/test/automation/commander-context.unit.test.ts`, `ai/ai-decision-service.unit.test.ts`, `sqlite-adapter.int.test.ts`, `SessionHost.test.tsx`, `test/support/*` | renames (`build` → `buildService`), imports; new tests only | — |
| `apps/api/test/env.unit.test.ts` | the expected default config gets the C-7 fields | C-7 |
| `packages/games/rebellion/test/ai/decision.test.ts`, `test/server/automation-hidden-base.test.ts` | one `expect(x).toEqual(y)` split into a variable + the same `toEqual`, plus new checks | W4 (not weakened) |
| `packages/games/rebellion/test/rules/core/hidden-info.test.ts` | +13 lines: `relocateBase` returns `null` for a system with Imperial ground units | QD-20: such a hidden base is unreachable after R-3 |
| `apps/api/test/automation-double-submit.int.test.ts` (DEP-2, already in base commit `cb2c3ce`) | TC-CC-06: `422 errors.gameOver` also allowed for the duplicate PASS of the last turn | DEP-2, reviewed |

Hidden-info suites (TC-H-10) are not weakened: `automation-hidden-info.int` +24/−0, `hidden-info.test` +13/−0. `automation-hidden-base` changed as described above.
`hidden-info-core.int` and `e2e/core-hidden-base.spec.ts` are unchanged.

## Mandatory PO scenarios (`request.md` §10) → evidence

| §10 | TC | Status | Evidence |
|---|---|---|---|
| 1 rules for the phase / allowed actions | TC-SEL-01..03, 05, 12, TC-INT-02 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` |
| 2 bounded context | TC-SEL-06..09, TC-BUD-04..08 | passed | same |
| 3 reproducible order/composition | TC-SEL-04, 05, 08, TC-CT-03 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log` |
| 4 rules of the right game | TC-INT-01, TC-CT-05, 06, TC-FB-05 | passed | `artifacts/logs/qa-api.log` |
| 5 no leak through public rules | TC-H-02, 04, 06, 07, TC-SEL-11 (TC-H-11 failed, minor D-1) | passed | `artifacts/logs/prompt-scan.log` |
| 6 hidden state change → same context | TC-H-01, 02, 03, 09 | passed | `artifacts/logs/prompt-scan.log`, `artifacts/logs/qa-rebellion.log` |
| 7 only legal actions | TC-ARB-01..08 | passed | `artifacts/logs/qa-api.log` |
| 8 empty Rules Context | TC-FB-04..06, 09, TC-CT-05 | passed | `artifacts/logs/qa-api.log` |
| 9 OpenAI unavailable → bot | TC-FB-01..03, 07, 08 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/final-verify.log` |
| 10 session budget respected | TC-BUD-01..03, 07, 10, TC-BEN-09, 10 | passed | `artifacts/logs/qa-api.log` |
| 11–14 DISC-009: every transition, not premature, not repeated, victory | TC-D-01..37, TC-RS-05 | passed | `artifacts/logs/qa-rebellion.log` |
| 15 save / restore | TC-RS-01..06 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/qa-rs06-devdb.log` |
| 16 all existing tests pass | TC-R-01, 03..05, TC-H-10, TC-BUD-10, TC-FB-07 (TC-R-02 CI: not_run) | passed locally | `artifacts/logs/final-verify.log` |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | not_run | `artifacts/logs/qa-check-task.log`, `artifacts/logs/qa-check-task-negative.log` — at QA time check-task exits 0 and catches violations on copies (TC-WF-02). The AC needs all stages through DELIVERY, so the final run is at DELIVERY (Analyst). TC-WF-03 is not verifiable (untracked files) |
| AC-2 | passed | `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log`, `artifacts/logs/qa-static.log`, `docs/architecture/rules-knowledge.md` |
| AC-3 | passed | `artifacts/logs/qa-api.log` (rules-integration, rules-context-registry, rules-off-golden byte-for-byte, prompt.unit) |
| AC-4 | passed | `artifacts/logs/qa-rebellion.log` (rules-provider: 1600 combinations, golden in two processes), `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log` |
| AC-5 | passed | `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log` — TC-ST-01/03/04/06 pass. TC-ST-05 is failed for phases outside `command` (D-2, minor): not an AC-5 clause, and the engine-scope caveat is always present |
| AC-6 | passed | `artifacts/logs/prompt-scan.log`, `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-api.log`, `artifacts/logs/qa-browser-diag08.log` — (a)–(d) pass. TC-H-11 is failed (D-1, minor): static public rule texts of the setup/refresh rules name systems, but they are never selected for an AI decision |
| AC-7 | passed | `artifacts/logs/qa-api.log` (automation-rules TC-ARB-01..05, 08), `artifacts/logs/qa-rebellion.log` (TC-ARB-06) |
| AC-8 | passed | `artifacts/logs/qa-rebellion.log` (state-checks TC-D-01..31/34, reveal-invariant: 285 seeded games + E-HUNT, differential), `artifacts/logs/qa-api.log` (TC-D-35), `artifacts/logs/qa-static.log` (TC-D-31) |
| AC-9 | passed | `artifacts/logs/qa-api.log` (disc009-restore), `artifacts/logs/qa-rebellion.log` (TC-RS-04), `artifacts/logs/qa-rs06-devdb.log` |
| AC-10 | passed | `artifacts/logs/qa-api.log` (prompt-fit, automation-rules, ai-decision-service, budget), `artifacts/logs/qa-web.log`, `artifacts/logs/qa-e2e-diagnostics.log` |
| AC-11 | passed | `artifacts/logs/qa-api.log`, `artifacts/logs/final-verify.log` (ai-commander e2e) |
| AC-12 | passed | `artifacts/logs/qa-api.log` (ai-usage-repository, cost-by-rules, migration-swr008), `artifacts/logs/qa-static.log` (schema / migration: ids only, no text) |
| AC-13 | passed | `artifacts/logs/qa-web.log`, `artifacts/logs/qa-api.log`, `artifacts/logs/qa-e2e-diagnostics.log`, `artifacts/logs/final-verify.log`, `artifacts/logs/qa-browser-diag08.log`, `artifacts/screenshots/swr008-dev-diagnostics-panel-rules19-ru-1440.png`, `artifacts/screenshots/swr008-dev-diagnostics-en-375.png` |
| AC-14 | passed | `artifacts/logs/qa-rebellion.log` (14 scenarios: 8 Empire / 6 Rebels), `artifacts/logs/qa-api.log` (bench), `packages/games/rebellion/benchmark/README.md` |
| AC-15 | passed | `artifacts/benchmark/real-20261120-140206.md`, `artifacts/benchmark/real-20261120-140206.json`, `artifacts/logs/bench-real.log`, `artifacts/logs/qa-meas.log` — real run by the Analyst: $0.008932 of $1, 3 repeats; conclusion: no measurable quality effect, cost rules-worse |
| AC-16 | not_run | `artifacts/logs/final-verify.log`, `artifacts/logs/qa-ci.log` — `pnpm verify` exit 0 on Node 22 and every existing suite is green (passed). **CI on the SWR-008 code has not run** (not committed or pushed); CI for the base `3fe4a66` is success |

## Verification
- lint (eslint + prettier): passed — `artifacts/logs/final-verify.log`
- typecheck: passed — `artifacts/logs/final-verify.log`
- unit + integration (full suites in verify): passed — `artifacts/logs/final-verify.log`
- unit + integration (QA targeted re-runs, verbose): passed — `artifacts/logs/qa-rebellion.log`, `artifacts/logs/qa-platform.log`, `artifacts/logs/qa-api.log`, `artifacts/logs/qa-web.log`, `artifacts/logs/prompt-scan.log`
- opt-in migration on DB copies: passed — `artifacts/logs/qa-rs06-devdb.log`
- build: passed — `artifacts/logs/final-verify.log`
- check:bundle: passed — `artifacts/logs/final-verify.log`
- e2e (full): passed — `artifacts/logs/final-verify.log`
- e2e ai-diagnostics (QA re-run): passed — `artifacts/logs/qa-e2e-diagnostics.log`
- browser QA (TC-DIAG-08): passed — `artifacts/logs/qa-browser-diag08.log`, `artifacts/screenshots/swr008-dev-diagnostics-ru-1440.png`
- prompt scan (TC-H-04, QD-29): passed — `artifacts/logs/prompt-scan.log`
- real benchmark review (AC-15): passed — `artifacts/logs/qa-meas.log`
- CI on the base 3fe4a66: passed — `artifacts/logs/qa-ci.log`
- CI on the SWR-008 code: not_run — not committed / pushed yet
- check-task: passed — `artifacts/logs/qa-check-task.log`

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-1 | minor | TC-H-11: list KB entries with `ai !== 'none'` and status `verified`; search `id`/`title`/`text` for the 32 core-v1 system ids (QA scan in `artifacts/logs/qa-static.log` steps; guard `packages/games/rebellion/test/knowledge/rules-provider.test.ts` «hidden information guard») | no AI-eligible entry names a system; a new entry that does fails the guard | 4 AI-eligible verified entries name systems in their text: `rebellion:loyalty.basics` (coruscant), `rebellion:cards.probe` (coruscant), `rebellion:setup.first-game-rebels` (8 systems), `rebellion:setup.first-game-empire` (6). The guard checks the ids of all entries but the texts only of the rules selectable in `command`, so these 4 pass without notice. No runtime leak: static public texts, never selected for a core-v1 AI decision (phase `command`) | open — Analyst: accept the narrowed guard (document) or mark these entries `ai:'none'` / widen the guard |
| D-2 | minor | TC-ST-05: `selectRules` for every TC-SEL-06 combination including phase `refresh` (test `rules-provider.test.ts` «every combination», assertion guarded by `if (phase === 'command')`) | no combat/missions/production/probes entries in any block | in `refresh` the phase group selects build (production) rules (test comment; W3 log limitation 2). The engine-scope line, always first, says production is not implemented. The core-v1 AI decides only in `command`, where the check holds | open — Analyst: accept as documented or exclude not-implemented categories for all phases |
| D-3 | minor (dev-only, opt-in) | dev web, `/dev/ai` switch on, AI session at 375 px, expand the panel (`artifacts/screenshots/swr008-dev-diagnostics-en-375.png`, `artifacts/screenshots/swr008-dev-diagnostics-panel-rules17-en-375.png`) | the floating dev panel/chip does not hide the player's notices; ids wrap without orphan punctuation | expanded at 375 the panel covers most of the screen, and the chip covers part of the AI fallback notice. In the id list a lone «,» wraps onto its own line («…transport.capacity» / «,»). Not visible to players (dev build + opt-in) | open — backlog (frontend) |

## Observations (not defects)
- O-1 (TC-DIAG-05): panel labels contain the word «prompt» («Prompt text … are not shown», «dropped by the prompt limit», which QD-9 requires).
  There is no prompt content, and the FE test D-7 allows the word on purpose. The TC wording («без prompt») is stricter than intended.
- O-2 (TC-MEAS-01): the report records `model` = the configured id `gpt-6-luna` (A-6), not a dated snapshot, and the JSON has no `provider` field.
  `provider=openai` is evidenced by the 84 attempt lines of `artifacts/logs/bench-real.log`.
- O-3 (TC-H-02): the W4 relocation set of `rules-query.test.ts` is 30 SEEDS_P games without E-HUNT. E-HUNT is covered by TC-D-32 (`reveal-invariant`) and,
  for requests, by TC-H-01/06 in apps/api.
- O-4: the real benchmark confirms the bot weaknesses BOT-1..BOT-3 (QD-25: reb-01, reb-04, emp-03). They are out of scope and recommended as a next task.
- O-5: rules seem to hurt in `emp-05-leader-pin` (0/3 vs 1/3), `reb-05-end-of-time-pass` (1/3 vs 3/3) and `reb-06` (n = 3 per cell, not significant). These are candidates for rule text/selection tuning.
