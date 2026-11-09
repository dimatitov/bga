# QA results — SWR-005B

QA_EXECUTION, qa-lead, 2026-11-08 (20:10–20:22 UTC). Code = working tree after INTEGRATION run 2, CODE_REVIEW round 2
(`approved`) and BUSINESS_VALIDATION (`acceptance.md`, pre-QA). QA did not write product code and changed none.
**QA made no real OpenAI request.** The only live request (TC-LIVE-01, AC-12) was made by the Analyst in BUSINESS_VALIDATION (BV-3).

Main run: `pnpm verify` from the repo root, ports 3000/5173/3100/5174 free beforehand, nothing else running.
It ran with `apps/api/.env` from the PO present on disk (QA did not read it), so it also covers TC-R-07: tests do not depend on the local `.env`.
Result: **exit 0** in 7 min 13 s, first attempt, no reruns, no timeouts (`artifacts/logs/qa-verify.log`).

| Suite (from `qa-verify.log`) | Result |
|---|---|
| lint (`eslint . --max-warnings=0 && prettier --check .`) | exit 0 |
| typecheck (`tsc -b` packages + apps) | exit 0 |
| `node --test scripts/` | 408 / 408 pass |
| packages/platform | 5 files, 76 passed |
| packages/games/rebellion | 43 files, 411 passed |
| packages/games/forbidden-stars | 2 files, 5 passed |
| apps/web | 62 files, 518 passed |
| apps/api (unit + integration) | 53 files passed + 1 skipped; 492 passed + 1 skipped (the skipped test is the opt-in `dev-db-upgrade.int.test.ts`, `skipIf(!SOURCE)`, from SWR-004) |
| build | exit 0 |
| check:bundle | 12 rules, 0 findings; module check 771 sources, 0 `apps/web/src/dev` modules |
| e2e (Playwright, mock mode) | 118 passed / 0 failed (4.7 min) |

TC-R-02 thresholds are met: rebellion 411 ≥ 411, api 492 ≥ 221, web 518 ≥ 480, platform 76 ≥ 65, e2e 118 ≥ 106.

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-ENV-01..22 (AC-01) | passed | `pnpm verify` (api vitest: env, env-example, bootstrap, architecture unit/int) | `artifacts/logs/qa-verify.log` |
| TC-PS-01..12, TC-UC-11 (AC-02) | passed | `pnpm verify` (api vitest: model availability, provider selection, dev-ai-status/openai int) | `artifacts/logs/qa-verify.log` |
| TC-OP-01..09 (AC-03) | passed | `pnpm verify` (api vitest: openai-provider with real SDK + fake fetch, mock provider) | `artifacts/logs/qa-verify.log` |
| TC-DV-01..13 (AC-04) | passed | `pnpm verify` (api vitest: decision validator, dev-ai-errors int) | `artifacts/logs/qa-verify.log` |
| TC-RT-01..19 (AC-05) | passed | `pnpm verify` (api vitest: retry unit, openai-provider, dev-ai-errors int) | `artifacts/logs/qa-verify.log` |
| TC-UC-01..19 (AC-06) | passed | `pnpm verify` (api vitest: usage/cost, migration-swr005b, ai-decision-service) | `artifacts/logs/qa-verify.log` |
| TC-B-01..16 (AC-07) | passed | `pnpm verify` (api vitest: budget unit + dev-ai-budget int incl. concurrency; web/e2e budget alert) | `artifacts/logs/qa-verify.log` |
| TC-API-01..19 (AC-08) | passed | `pnpm verify` (api vitest: dev-ai-status/decision/security int, routes int) | `artifacts/logs/qa-verify.log` |
| TC-W-01..09 (AC-09) | passed | `pnpm verify` (web vitest: DevAiPage, devAiRoute, format, locales; SettingsPage) | `artifacts/logs/qa-verify.log` |
| TC-E-01..05, TC-VA-01..02 (AC-09, AC-13) | passed | `pnpm verify` → `playwright test` (e2e/dev-ai.spec.ts #37–#46, core-visual-a11y) | `artifacts/logs/qa-verify.log` |
| TC-S-01..02 (AC-10, bundle) | passed | `pnpm verify` → `check:bundle` + `node --test scripts/` (check-web-bundle tests) | `artifacts/logs/qa-verify.log` |
| TC-S-03..06, TC-S-09..10 (AC-10, logs/responses/DOM) | passed | `pnpm verify` (api log-capture/sentinel tests; e2e TC-S-09 #41) | `artifacts/logs/qa-verify.log` |
| TC-S-07..08 (AC-10, task artifacts + repo diff) | passed | grep `sk-` over `docs/tasks/SWR-005B/**`, `git diff HEAD`, untracked files; `git check-ignore apps/api/.env` | `artifacts/logs/qa-secret-scan.log` |
| TC-A-01..08 (AC-11) | passed | `pnpm verify` (lint with boundaries; `eslint-boundaries.test.mjs`; api architecture int) | `artifacts/logs/qa-verify.log` |
| TC-R-01, TC-R-02, TC-R-07 (AC-13) | passed | `pnpm verify` (exit 0, counts above; PO `.env` present on disk) | `artifacts/logs/qa-verify.log` |
| TC-R-03 (AC-13) | passed | `node --test scripts/` inside `pnpm verify` (408/408) | `artifacts/logs/qa-verify.log` |
| TC-R-04, TC-R-05 (AC-13, network guard) | passed | `pnpm verify` (api guard tests; e2e API in mock mode, browser host check) | `artifacts/logs/qa-verify.log` |
| TC-R-06 (AC-13) | passed | `node scripts/check-task.mjs docs/tasks/SWR-005B` | `artifacts/logs/qa-check-task.log` |
| D-1 / F-1 regression (AC-10, AC-13) | passed | `pnpm verify` (api env-isolation int; e2e env-isolation #47–#48; e2e TC-E-01 `keyConfigured=false`) + review of the regenerated screenshots | `artifacts/logs/qa-manual.log` |
| TC-M-01 (AC-09, AC-13) manual, mock | passed | e2e servers (api :3100 NODE_ENV=test with all OPENAI_* blank, web :5174) + Playwright chromium scripts at 1440×900 and 375×812, keyboard only | `artifacts/logs/qa-manual.log` |
| Regression of earlier tasks' artifacts | passed | sha256 of `docs/tasks/SWR-00{2,3,4,5}/**` before and after QA (344 files, identical) | `artifacts/logs/qa-artifacts-sha.log` |
| TC-LIVE-01 (AC-12) real OpenAI | not_run | not run by QA (by design: Analyst only). **Executed by Analyst** in BUSINESS_VALIDATION, BV-3 | `artifacts/logs/business-validation.log` |

Notes on the evidence level:
- The Vitest default reporter prints file and test totals but not test names. The TC → test file mapping comes from the test
  design (`test-cases.md`) and the worker logs (`artifacts/logs/w1-config.log` … `w6-dev-ai.log`, `fe-ai-web.log`). Playwright prints every test by name.
- TC-M-01 deviation: I used the e2e server setup instead of `pnpm dev`. In development mode `loadAppConfig` (`apps/api/src/config/env.ts`)
  takes the value from `apps/api/.env` for any blank variable, so `pnpm dev` would have shown the PO's key flag and model ids.
  The e2e setup also never touches `apps/api/prisma/dev.db`. Screenshots are named `qa-manual-*.png`, not `manual-*.png` as `test-cases.md` says.

Manual check (TC-M-01), from `artifacts/logs/qa-manual.log`:
- Status card: OpenAI «выключен», provider mock, key «не задан», models «не задана / не проверялась», budget «лимита нет».
  The 3 test actions are listed and marked «Тестовые данные, не правила Rebellion».
- Mock result: action-1 MOVE_FLEET corellia, mock-deterministic-v1, 0 ms, 1 attempt, tokens 0, 0,00 $.
- Layout: no horizontal overflow at 1440 or 375. The DOM has no `sk-` / `OPENAI_API_KEY`. No browser requests to non-localhost hosts, no console errors.
- Keyboard: from a fresh load, Tab order is skip link → nav → Назад → Обновить статус → role radio → provider radio → «Тестировать AI». Enter shows the result.
  Role and provider are radio groups with roving tabindex; ArrowRight moves focus and selection. «Авто» with OpenAI disabled shows the auto→mock hint, not the paid warning.
- Screenshots: `artifacts/screenshots/qa-manual-1440-status.png`, `qa-manual-375-status.png`, `qa-manual-{1440,375}-result-mock.png`,
  `qa-manual-{1440,375}-submit-focus.png`, `qa-manual-{1440,375}-keyboard-result.png`, `qa-manual-1440-keyboard-arrows-auto.png`.

Observations (not defects, not in the ACs):
- O-1 (minor polish, FE): after Enter on «Тестировать AI», `qa-manual-375-keyboard-result.png` shows no clearly visible focus ring on the button.
  Before submit the ring is visible (outline solid 2px). The result is announced through a `role=status` live region.
- O-2 (Analyst): the header «MOCK» badge from the earlier app-level AI mode is still shown when OpenAI is enabled on `/dev/ai` (`bv-02-live-openai-decision-1440.jpg`).
  It is outside this task's scope, but it can confuse.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log` (TC-ENV-01..22 in api vitest, lint rule for process.env) |
| AC-02 | passed | `artifacts/logs/qa-verify.log` (TC-PS-01..12) |
| AC-03 | passed | `artifacts/logs/qa-verify.log` (TC-OP-01..09) |
| AC-04 | passed | `artifacts/logs/qa-verify.log` (TC-DV-01..13) |
| AC-05 | passed | `artifacts/logs/qa-verify.log` (TC-RT-01..19) |
| AC-06 | passed | `artifacts/logs/qa-verify.log` (TC-UC-01..19) |
| AC-07 | passed | `artifacts/logs/qa-verify.log` (TC-B-01..16) |
| AC-08 | passed | `artifacts/logs/qa-verify.log` (TC-API-01..19) |
| AC-09 | passed | `artifacts/logs/qa-verify.log` (TC-W, TC-E, check:bundle 0 dev modules), `artifacts/logs/qa-manual.log`, `artifacts/screenshots/qa-manual-1440-result-mock.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log` (bundle scan, sentinel log/response tests, e2e TC-S-09, D-1/F-1 isolation), `artifacts/logs/qa-secret-scan.log` |
| AC-11 | passed | `artifacts/logs/qa-verify.log` (ESLint boundaries + `scripts/eslint-boundaries.test.mjs` + api architecture int) |
| AC-12 | passed | **Executed by Analyst, not QA** (TC-LIVE-01 = BV-3): `artifacts/logs/business-validation.log`, `artifacts/screenshots/bv-02-live-openai-decision-1440.jpg`, `artifacts/screenshots/bv-03-live-openai-scenario-selected-1440.jpg`. gpt-6-luna, action-2 from the list, 4177 ms, 235/0/38/0 tokens, ≈0.000043 USD. QA checked that the artifacts exist and match each other. QA made no request. |
| AC-13 | passed | `artifacts/logs/qa-verify.log` (exit 0, e2e 118/118, mock mode), `artifacts/logs/qa-manual.log` (browser results + qa-manual-*.png screenshots) |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log` (eslint --max-warnings=0 + prettier --check, exit 0)
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (scripts 408, platform 76, rebellion 411, forbidden-stars 5, web 518, api unit part of 492)
- integration: passed — `artifacts/logs/qa-verify.log` (api 53 files / 492 passed + 1 opt-in skipped)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (check:bundle 12 rules, 0 findings, 0 dev modules)
- e2e: passed — `artifacts/logs/qa-verify.log` (118 passed, mock mode)
- manual: passed — `artifacts/logs/qa-manual.log` (TC-M-01 at 1440 and 375, keyboard; D-1 screenshot review)
- secret scan: passed — `artifacts/logs/qa-secret-scan.log` (only test sentinels)
- artifacts sha: passed — `artifacts/logs/qa-artifacts-sha.log` (SWR-002..005 unchanged)
- live-openai: passed — `artifacts/logs/business-validation.log` (executed by Analyst, BV-3; not by QA)
- task check: passed — `artifacts/logs/qa-check-task.log`

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| D-1 | major | With the PO's `apps/api/.env` (`OPENAI_ENABLED=true`, key, models) present, run `pnpm e2e` / `pnpm test`. Any process that loads `@prisma/client` gets `.env` values copied into `process.env` by Prisma's dotenv loader | Test and e2e processes have no OPENAI_* values; the e2e status reports `keyConfigured=false` | (before the fix) the OPENAI_* values leaked into the test processes, and the e2e screenshots showed the key as set and the PO's model ids | fixed (W6 + backend-lead): `apps/api/scripts/e2e-env.mjs`, `test/setup/blank-openai-env.ts`, global-setup. Retested: `artifacts/logs/qa-verify.log` (api env-isolation int, e2e TC-E-01 `keyConfigured=false`), `artifacts/logs/qa-manual.log` §4 |
| F-1 (D-1, Playwright side) | major | Same `.env`; the Playwright runner/worker loads `@prisma/client` through `e2e/support/seed.ts` | No OPENAI_* in the Playwright process or the children it spawns | (before the fix) review round 1: 5 OPENAI_* names present in a child that required `@prisma/client` like `seed.ts` (`review.md`) | fixed: `playwright.config.ts` imports `e2e/support/blank-openai-env.ts` first. Retested: `artifacts/logs/qa-f1-fix.log`, `artifacts/logs/qa-verify.log` (e2e/env-isolation.spec.ts #47, #48 passed) |
| D-2 | minor | `/dev/ai`, get `AI_BUDGET_EXCEEDED` (page.route) | The hint appears once | (before the fix) the same sentence appeared twice in the alert (shared error text + hint) | fixed (frontend-lead): `apps/web/src/dev/ai/errorText.ts` dedup + locale hint. Retested: `artifacts/logs/qa-verify.log` (web DevAiPage D-2 tests; e2e TC-E-03 #43), screenshot `artifacts/screenshots/dev-ai-1440-error-budget.png` |
| D-3 | minor | `/dev/ai`, monospace slots (model ids, action ids) holding Cyrillic placeholders | Monospace font stack; placeholders in the regular font | (before the fix) the Cyrillic text fell back to a serif font | fixed (frontend-lead): `components/mono.ts`, `MonoValue.tsx`. Retested: `artifacts/logs/qa-verify.log` (web D-3 tests), screenshots `artifacts/screenshots/dev-ai-1440-status-mock.png` (placeholders «не задана» italic sans) |

No new defects were found in QA_EXECUTION. Observations O-1 and O-2 above are not defects.

## Open questions
- AC-12 says the live-request figures go into `report.md`. There is no `report.md`; they are in `artifacts/logs/business-validation.log` and `acceptance.md` (BV-3).
  The Analyst may want to copy them into `delivery-report.md`.
