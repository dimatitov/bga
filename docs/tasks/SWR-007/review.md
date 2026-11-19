# Review — SWR-007

Reviewer: `reviewer` (Claude Code subagent, independent)  ·  Author(s) of reviewed code: main session (backend-lead/worker, analyst)

Reviewed: uncommitted diff vs HEAD `7195758` in worktree `swr-007-node22-ci-520813` (manifests, `pnpm-workspace.yaml`,
`apps/api` Prisma 7 changes, tests, `apps/web` test infra, e2e support, `.github/workflows/ci.yml`, docs). `pnpm-lock.yaml`
was not reviewed line by line (only via the green install/verify logs).

## Checks run by the reviewer (Node v22.23.5, pnpm 12.21.0, corepack 0.36.0)
- `node --test "scripts/*.test.mjs"` → 408 pass, 0 fail.
- `node scripts/check-task.mjs docs/tasks/SWR-*/` for every task folder (SWR-000, 002, 003, 004, 005, 005B, 007) → exit 0 each.
- `pnpm lint` → eslint + `prettier --check` clean.
- `apps/api`: `pnpm exec tsc -p tsconfig.json --noEmit` → exit 0 (includes `prisma.config.ts`).
- `apps/api`: `vitest run test/sqlite-url.unit.test.ts test/env-isolation.int.test.ts test/ai/reset-ai-budget.int.test.ts test/migration-swr005b.int.test.ts` → 4 files, 25 tests passed.
- `apps/web`: `vitest run createAppTheme.test.tsx useTurnCommands.focus.test.tsx TurnControls.test.tsx` → 3 files, 15 tests passed.
- `apps/api`: `node -e "require('@nestjs/core'); require('@prisma/client')"` → loads from CJS (require(esm)) without errors.
- `gh api repos/<action>/releases/latest` → checkout v7.0.1, setup-node v7.1.0, cache v6.1.0, upload-artifact v7.0.2: every major used in `ci.yml` exists.
- `pnpm store path --silent` (pnpm 12) → prints a path (the CI "Locate pnpm store" step works with this pnpm).
- Read: `integration-verify.log` (Node v22.23.5 / pnpm 12.21.0, 118 e2e passed, `exit=0`), `prisma7-fixture-compat.log`
  (Prisma-6 fixture copy: read/write OK, `createdAt` stays `integer`, pristine sha256 unchanged; control run shows the
  default adapter format would write ISO text), `prisma7-dotenv-probe.log`, `engines-node20.log`, `pnpm-corepack.log`.
- Not run by the reviewer: full `pnpm verify`, `nest build` + `NODE_ENV=production node dist/main.js` (rely on author logs),
  real GitHub Actions run (AC-12, needs push).

## What was checked and found correct
- Relative DB path semantics: `main.ts` resolves via `join(__dirname, '..', 'prisma')`; `__dirname` is `apps/api/dist`
  (`nest build`, `nest start --watch`) or `apps/api/dist-e2e` (e2e) → both resolve to `apps/api/prisma`, same as Prisma ≤ 6.
  `prisma.config.ts` resolves the CLI URL the same way; e2e/tests pass absolute URLs; `reset-ai-budget.mjs` already resolved
  relative paths itself. `apps/api/package.json` has no `"type"`, so `__dirname` in `prisma.config.ts` is valid (CJS).
- Data compatibility: `timestampFormat: 'unixepoch-ms'` used consistently in app, tests, e2e seeder and reset script;
  `prisma/migrations/**` untouched; no Boolean/BigInt/Decimal/Json columns whose adapter mapping could differ; `P2002`
  handling in `sessions.repository.ts` is covered by the green int/e2e suites.
- Secrets: workflow has no `secrets.*`, no `OPENAI_*`, `permissions: contents: read`, `pull_request` (not `_target`),
  no `continue-on-error`; check-task loop fails the step if any folder fails. `prisma.config.ts` reads only `DATABASE_URL`
  from `.env` (`node:util parseEnv` into a local object, not `process.env`) — no OPENAI_* can reach a Prisma CLI process.
  Existing blanking/guard mechanisms are kept.
- Source changes are limited to what Prisma 7 forces (`prisma.service.ts`, `main.ts`, two new persistence helpers) — no
  edits in `apps/api/src/ai/**`, rules, sessions or web table code; HTTP API / platform / schema contracts untouched.
- Test changes are mechanical (`datasourceUrl` → adapter; `db execute --url` removed and URL passed via `DATABASE_URL`
  through `prisma.config.ts`), plus one jsdom-31 colour assertion and the timer tracking (see #4).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | minor | `docs/tasks/SWR-005B/artifacts/screenshots/dev-ai-1440-result-mock.png` | The integration `pnpm verify` run overwrote historical SWR-005B evidence (`CURRENT_SCREENSHOT_TASK = 'SWR-005B'` in `e2e/support/board.ts:367`). Unrelated to SWR-007 and would be committed with it. | Restore the file from HEAD before committing (`git checkout -- <png>`); for future SWR-007 runs use `SCREENSHOT_TASK=SWR-007`. |
| 2 | minor | `.github/workflows/ci.yml:2-3` vs `specification.md` AC-07/AC-08 | Spec says "`.env` in CI is created from `.env.example` (`OPENAI_ENABLED=false`)"; the workflow intentionally creates no `apps/api/.env`. Behaviour is safe (tests/e2e run with `NODE_ENV=test`, which never reads `.env`; `prisma generate` needs no URL), arguably safer, but the AC text and implementation differ. | In BUSINESS_VALIDATION record it as an accepted deviation (or amend AC-07/08 wording); QA should check against the actual design. |
| 3 | minor | `apps/api/src/main.ts:8-10`, `apps/api/scripts/reset-ai-budget.mjs:9-11,64`, `apps/api/scripts/e2e-env.mjs:2-5`, `apps/api/scripts/e2e-serve.mjs:16-18` | Code comments still state that importing `@prisma/client` loads `apps/api/.env` into `process.env`. Under Prisma 7 this is false (`prisma7-dotenv-probe.log`); `application.md` §8.1 was updated, the comments were not. Misleading for the next maintainer. | Reword to "Prisma ≤ 6 did …; kept as defence in depth (SWR-007)". At least in `main.ts` and `reset-ai-budget.mjs`, which this diff already touches. |
| 4 | minor | `apps/web/src/test/setup.ts:46-63` (root cause `apps/web/src/games/rebellion/core-v1/panels/focus.ts:24-26`) | A global `setTimeout`/`clearTimeout` override in every web test file. It hides a real product-side leak: `focusWhenReady` schedules retries that cannot be cancelled on unmount. Side effects of the wrapper: string handlers become silent no-ops; `setTimeout[util.promisify.custom]` is lost; a `refresh()`-ed timer leaves the tracking set; `setInterval`/`requestAnimationFrame` are not tracked. No current test relies on these (suites green). Not touching `focus.ts` (SWR-006 zone) is a reasonable choice for now. | Keep for SWR-007, but log a follow-up after the SWR-006 merge: make `focusWhenReady` return a cancel function used in effect cleanup, then remove or narrow the wrapper. Optionally copy `realSetTimeout[promisify.custom]` onto the wrapper. |
| 5 | minor | merge with SWR-006 (`apps/api/test/ai/{ai-usage-repository,budget,reset-ai-budget}.int.test.ts`, lockfile) | Prisma 7 removed `datasourceUrl`, so any new test or code in SWR-006 that constructs `new PrismaClient({ datasourceUrl })` fails typecheck after the merge. The three AI int-test files changed here (one import plus one line each) may also conflict textually with SWR-006. | Whichever branch merges second must run `pnpm install` and a full `pnpm verify`. Mention this in the delivery report (AC-11). |
| 6 | nit | `apps/web/src/app/theme/createAppTheme.test.tsx:10-11` | `hexToRgb` was inserted between the luminance JSDoc and `luminance()`. The "WCAG 2.x relative luminance" comment now sits on top of `hexToRgb` (two JSDoc blocks in a row). | Move `hexToRgb` with its comment above the WCAG JSDoc. |
| 7 | nit | `apps/web/package.json:15-17` | The three `@bga/*` workspace deps were moved (sorted). The upgrade did not need this, and it adds conflict surface with SWR-006 if that task touches web deps. | Fine to keep if pnpm 12 re-sorts on install; otherwise revert the move. |
| 8 | nit | `.github/workflows/ci.yml:6-8,23-78` | `on: push` + `pull_request` without branch filters runs twice for same-repo PR branches: the concurrency group differs (`refs/heads/x` vs `refs/pull/N/merge`). Actions are pinned to major tags, not SHAs. | Optional: `push: branches: [main]`. SHA pinning can wait. |
| 9 | nit | `apps/api/src/persistence/sqlite-url.ts:10-12`; adapter options duplicated in `apps/api/scripts/reset-ai-budget.mjs:67-71`, `e2e/support/seed.ts:74-84` | (a) `?query` is silently dropped, and a relative URL resolves against `apps/api/prisma` even when the CLI is called with `--schema` from another folder; Prisma ≤ 6 used that schema's folder. Only absolute URLs hit this path today. (b) `timestampFormat: 'unixepoch-ms'` is repeated in three places, so they can drift apart. | Document (a) in the helper's JSDoc. For (b), add a "keep in sync with sqlite-adapter.ts" note in both copies; the seed.ts copy already has one. |

No blocking or major findings. Security (no secrets or OPENAI_* in CI, read-only permissions), data compatibility
(INTEGER DateTime preserved, migrations untouched) and the dev/CLI/e2e/prod path semantics hold on inspection and in the
targeted runs above.

## Verdict
approved

Conditions before commit (not blocking the verdict): fix #1 (restore the SWR-005B screenshot). Record #2 and #5 in
acceptance/delivery. #3, #4 and #6–#9 can go to a follow-up.
